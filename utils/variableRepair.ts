import type { Dispatch, SetStateAction } from 'react';
import type { 变量批次诊断, 变量事实记录, 变量命令, 变量命令批次, 变量命令结果, 变量处理模式 } from '@/models/variableCommand';
import type { VariableTurnAnalysis } from '@/services/variableRuntime';
import { createStableEntityId, stableFingerprint } from '@/utils/stableFingerprint';
import { extractRoot, type VariableState } from '@/utils/variableRegistry';
import { 读取路径值, 应用路径命令 } from '@/utils/variablePath';
import { commitVariableState, reduceVariableCommands, type VariableSetters } from '@/utils/variableExecutor';
import { migrateVariableBatches } from '@/utils/variableBatchMigration';
import { applyNsfwVariablePolicy, type VariableNsfwPolicy } from '@/utils/variableNsfwPolicy';
import type { NPC记录 } from '@/models/npc';

export type VariableRepairItemCategory = 'safe' | 'existing' | 'confirm' | 'conflict' | 'unsupported';
export type VariableRepairMode = Extract<变量处理模式, 'repair' | 'history_repair'>;

export interface VariableRepairItem {
  id: string;
  category: VariableRepairItemCategory;
  fact?: 变量事实记录;
  command?: 变量命令;
  commands: 变量命令[];
  evidence: string[];
  reason: string;
  currentValue?: unknown;
  proposedValue?: unknown;
}

export interface VariableRepairPlan {
  id: string;
  schemaVersion: 1;
  mode: VariableRepairMode;
  sourceEvidenceId?: string;
  sourceEvidenceIds?: string[];
  turn: number;
  turnId?: string;
  targetMessageId?: string;
  targetUserMessageId?: string;
  baseStateFingerprint: string;
  sourceBatchId?: string;
  sourceMessageFingerprint?: string;
  createdAt: number;
  analysis: VariableTurnAnalysis;
  items: VariableRepairItem[];
  safeCommands: 变量命令[];
  confirmationCommands: 变量命令[];
  conflictItems: VariableRepairItem[];
  skippedItems: VariableRepairItem[];
  diagnostics?: 变量批次诊断[];
}

export interface VariableRepairCommitReceipt {
  status: 'committed' | 'stale' | 'already_committed' | 'no_changes' | 'rejected';
  code: 'OK' | 'STALE_PLAN' | 'ALREADY_COMMITTED' | 'NO_CHANGES' | 'NO_SELECTED_ITEMS' | 'INVALID_SELECTION' | 'NSFW_POLICY_REJECTED';
  planId: string;
  stateFingerprintBefore: string;
  stateFingerprintAfter: string;
  appliedItemIds: string[];
  skippedItemIds: string[];
  conflictItemIds: string[];
  message: string;
}

export interface VariableRepairCommitResult {
  ok: boolean;
  receipt: VariableRepairCommitReceipt;
  nextState?: VariableState;
  results: 变量命令结果[];
  batch?: 变量命令批次;
}

export type VariableRepairSetters = VariableSetters;

/** 去重只看会改变状态的语义；保留原命令对象上的 provenance。 */
function commandSemanticFingerprint(command: 变量命令): string {
  return stableFingerprint({
    action: command.action,
    key: command.key,
    ...(command.action === 'delete' ? {} : { value: command.value }),
  });
}

function dedupeCommandsBySemantic(commands: readonly 变量命令[]): 变量命令[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const fingerprint = commandSemanticFingerprint(command);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

/**
 * 合并多个历史回合的修复预览。
 * 每个子计划都必须基于同一份冻结状态；提交时由 reduceVariableCommands
 * 按原始回合顺序一次性演算，避免中途发布 React state 或重复写入存档。
 */
export function mergeVariableRepairPlans(plans: readonly VariableRepairPlan[]): VariableRepairPlan {
  if (!plans.length) throw new Error('没有可合并的变量修复计划。');
  const baseStateFingerprint = plans[0].baseStateFingerprint;
  if (plans.some((plan) => plan.baseStateFingerprint !== baseStateFingerprint)) {
    throw new Error('历史修复计划不是基于同一份变量状态生成的，请重新扫描。');
  }
  const normalizedModes = new Set(plans.map((plan) => plan.mode ?? 'repair'));
  if (normalizedModes.size > 1) {
    throw new Error('不能合并不同变量处理模式的修复计划。');
  }
  const ordered = [...plans].sort((left, right) => left.turn - right.turn || left.createdAt - right.createdAt);
  const mergedMode = ordered[0].mode ?? 'repair';
  const sourceEvidenceIds = [...new Set(ordered.flatMap((plan) => [
    ...(plan.sourceEvidenceId ? [plan.sourceEvidenceId] : []),
    ...(plan.sourceEvidenceIds ?? []),
  ]).filter(Boolean))];
  const seenCommands = new Set<string>();
  const seenFacts = new Set<string>();
  const items = ordered.flatMap((plan) => plan.items).flatMap((item) => {
    const commands = item.commands.filter((command) => {
      const fingerprint = commandSemanticFingerprint(command);
      if (seenCommands.has(fingerprint)) return false;
      seenCommands.add(fingerprint);
      return true;
    });
    const factFingerprint = item.fact?.semanticFingerprint || item.fact?.fingerprint;
    if (!commands.length && factFingerprint && seenFacts.has(factFingerprint)) return [];
    if (factFingerprint) seenFacts.add(factFingerprint);
    if (commands.length === item.commands.length) return [item];
    if (!commands.length && (item.category === 'existing' || item.category === 'unsupported' || item.category === 'conflict')) return [item];
    return commands.length ? [{ ...item, commands, command: commands[0] }] : [];
  });
  const safeCommands = items.filter((item) => item.category === 'safe').flatMap((item) => item.commands);
  const confirmationCommands = items.filter((item) => item.category === 'confirm').flatMap((item) => item.commands);
  const facts = ordered.flatMap((plan) => plan.analysis.facts).filter((fact, index, list) => {
    const fingerprint = fact.semanticFingerprint || fact.fingerprint;
    return list.findIndex((candidate) => (candidate.semanticFingerprint || candidate.fingerprint) === fingerprint) === index;
  });
  const analyses = ordered.map((plan) => plan.analysis);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const analysis: VariableTurnAnalysis = {
    ...first.analysis,
    rawText: analyses.map((item) => item.rawText).join('\n\n'),
    parsedFacts: {
      facts: analyses.flatMap((item) => item.parsedFacts.facts),
      parseErrors: analyses.flatMap((item) => item.parsedFacts.parseErrors),
    },
    factCommands: {
      commands: analyses.flatMap((item) => item.factCommands.commands),
      notes: analyses.flatMap((item) => item.factCommands.notes),
      warnings: analyses.flatMap((item) => item.factCommands.warnings),
      diagnostics: analyses.flatMap((item) => item.factCommands.diagnostics),
    },
    commands: analyses.flatMap((item) => item.commands),
    results: analyses.flatMap((item) => item.results),
    diagnostics: analyses.flatMap((item) => item.diagnostics),
    mode: mergedMode === 'history_repair' ? 'history_repair' : 'repair',
    sourceEvidenceId: sourceEvidenceIds.length === 1 ? sourceEvidenceIds[0] : undefined,
    nextState: last.analysis.nextState,
    facts,
    legacyCommandCount: analyses.reduce((total, item) => total + item.legacyCommandCount, 0),
    skippedTravelerProfileLegacyCount: analyses.reduce((total, item) => total + item.skippedTravelerProfileLegacyCount, 0),
  };
  return {
    id: createStableEntityId('repair_plan_batch', [
      baseStateFingerprint,
      ...ordered.map((plan) => plan.id),
    ]),
    schemaVersion: 1,
    mode: mergedMode,
    ...(sourceEvidenceIds.length === 1 ? { sourceEvidenceId: sourceEvidenceIds[0] } : {}),
    ...(sourceEvidenceIds.length > 1 ? { sourceEvidenceIds } : {}),
    turn: first.turn,
    turnId: undefined,
    targetMessageId: undefined,
    targetUserMessageId: undefined,
    baseStateFingerprint,
    sourceBatchId: undefined,
    sourceMessageFingerprint: stableFingerprint(ordered.map((plan) => plan.sourceMessageFingerprint ?? plan.id)),
    createdAt: Date.now(),
    analysis,
    items,
    safeCommands,
    confirmationCommands,
    conflictItems: items.filter((item) => item.category === 'conflict'),
    skippedItems: items.filter((item) => item.category === 'existing' || item.category === 'unsupported'),
    diagnostics: analysis.diagnostics,
  };
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function commandPath(command: 变量命令): { root: string; rest: string } | null {
  const parsed = extractRoot(command.key);
  return parsed ? { root: parsed.root, rest: parsed.rest } : null;
}

function pathIs(command: 变量命令, pattern: RegExp): boolean {
  const parsed = commandPath(command);
  return Boolean(parsed && pattern.test(`${parsed.root}.${parsed.rest}`));
}

/** 历史补写不得把旧回合的“现在”覆盖回当前世界。 */
function isHistoricalConflict(command: 变量命令): string | null {
  const path = `${commandPath(command)?.root ?? ''}.${commandPath(command)?.rest ?? ''}`;
  if (/^世界\.(当前日期|当前时间|开拓天数|当前地点|当前天气)$/.test(path)) return '历史回合不得直接改写当前世界的时间、地点或天气。';
  if (/^手机\.(?:messageSeeds|contacts)/.test(path)) return '历史回合不得自动生成手机种子或联系人。';
  if (/^NPC\[[^\]]+\]\.(最近回合|初见回合|累计互动次数|归档|归档回合)$/.test(path)) return '历史回合不得回拨 NPC 的当前回合、互动计数或归档状态。';
  return null;
}

function isConfirmationRequired(command: 变量命令, fact?: 变量事实记录): string | null {
  const path = `${commandPath(command)?.root ?? ''}.${commandPath(command)?.rest ?? ''}`;
  if (fact?.fact.type === 'npc' && (
    fact.fact.affinityDelta !== undefined ||
    fact.fact.affinitySet !== undefined ||
    fact.fact.intimateRelationship !== undefined ||
    fact.fact.relation !== undefined ||
    fact.fact.tier !== undefined ||
    fact.fact.following !== undefined
  )) return 'NPC 好感、亲密、关系、阶位或同行状态属于高风险状态，补写前需要确认。';
  if (fact?.fact.type === 'nsfw_archive') return 'NSFW 档案属于高风险私密状态，补写前需要确认。';
  if (/^NPC\[[^\]]+\]\.(好感度|亲密关系|关系|阶位|同行|约定)/.test(path)) return '关系、好感/亲密、同行和约定属于高风险状态，补写前需要确认。';
  if (/^旅人\.背包(?:\.|$)/.test(path)) return '物品背包变更可能影响后续剧情，补写前需要确认。';
  if (/^世界\.全局事件(?:\.|$)/.test(path)) return '世界事件可能影响后续剧情，补写前需要确认。';
  if (command.action === 'delete') return '删除历史变量属于高风险操作，补写前需要确认。';
  return null;
}

function valueMatches(current: unknown, command: 变量命令): boolean {
  const fingerprint = (value: unknown) => stableFingerprint(value);
  if (command.action === 'set') return fingerprint(current) === fingerprint(command.value);
  if (command.action === 'push') {
    if (!Array.isArray(current)) return false;
    return current.some((item) => {
      if (fingerprint(item) === fingerprint(command.value)) return true;
      if (!item || typeof item !== 'object' || !command.value || typeof command.value !== 'object') return false;
      const left = item as Record<string, unknown>;
      const right = command.value as Record<string, unknown>;
      if (typeof right.id === 'string' && right.id && left.id === right.id) return true;
      const comparableKeys = ['摘要', '标题', '内容', '名称', 'title', 'context', 'name', 'text'];
      const sharedKey = comparableKeys.find((key) => typeof right[key] === 'string' && right[key] && left[key] === right[key]);
      return Boolean(sharedKey);
    });
  }
  return false;
}

function commandCurrentValue(state: VariableState, command: 变量命令): unknown {
  const parsed = commandPath(command);
  if (!parsed) return undefined;
  const rootValue = state[parsed.root as keyof VariableState];
  return 读取路径值(rootValue, parsed.rest).value;
}

/**
 * 历史修复只消费 linker 已经生成的命令。
 *
 * 新批次通常可以用 factGroupId 精确关联；旧分析结果曾让事实记录和
 * 命令各自生成过不同的来源 ID，因此保留 factIndex/entityKey 的兼容回退。
 * 回退仍要求候选属于唯一命令组，无法唯一关联时宁可显示为 unsupported，
 * 也不重新调用 factsToVariableCommands 猜一次。
 */
function commandsForFact(input: {
  fact: 变量事实记录;
  factCommands: readonly 变量命令[];
  factCount: number;
}): 变量命令[] {
  const { fact, factCommands } = input;
  const uniqueGroupCount = (commands: readonly 变量命令[]): number => new Set(
    commands.map((command, index) => command.factGroupId?.trim() || `command_${index}`),
  ).size;
  const exactGroup = fact.factGroupId
    ? factCommands.filter((command) => command.factGroupId === fact.factGroupId)
    : [];
  if (exactGroup.length) return exactGroup;

  if (fact.factIndex !== undefined) {
    const indexed = factCommands.filter((command) => command.factIndex === fact.factIndex);
    const entityMatched = fact.entityKey
      ? indexed.filter((command) => !command.entityKey || command.entityKey === fact.entityKey)
      : indexed;
    if (entityMatched.length && uniqueGroupCount(entityMatched) === 1) return entityMatched;
  }

  if (fact.entityKey) {
    const entityMatched = factCommands.filter((command) => command.entityKey === fact.entityKey);
    if (entityMatched.length && uniqueGroupCount(entityMatched) === 1) return entityMatched;
  }

  // 只有单事实且命令完全没有追踪元数据时，才允许位置不敏感的兼容映射。
  if (
    input.factCount === 1
    && factCommands.length
    && factCommands.every((command) => !command.factGroupId && command.factIndex === undefined && !command.entityKey)
  ) return [...factCommands];
  return [];
}

function classifyCommand(input: {
  command: 变量命令;
  state: VariableState;
  existingSemanticFingerprints: Set<string>;
  fact?: 变量事实记录;
}): { category: VariableRepairItemCategory; reason: string; currentValue?: unknown; proposedValue?: unknown } {
  const conflict = isHistoricalConflict(input.command);
  if (conflict) return { category: 'conflict', reason: conflict, currentValue: commandCurrentValue(input.state, input.command), proposedValue: input.command.value };

  const confirm = isConfirmationRequired(input.command, input.fact);
  const currentValue = commandCurrentValue(input.state, input.command);
  if (valueMatches(currentValue, input.command)) {
    return { category: 'existing', reason: '当前状态已经包含相同结果，跳过重复写入。', currentValue, proposedValue: input.command.value };
  }
  if (input.fact && input.existingSemanticFingerprints.has(input.fact.semanticFingerprint)) {
    return { category: 'existing', reason: '历史批次中已有同一语义事实，跳过重复结算。', currentValue, proposedValue: input.command.value };
  }
  if (confirm) return { category: 'confirm', reason: confirm, currentValue, proposedValue: input.command.value };
  return { category: 'safe', reason: '低风险历史事实，可增量补写。', currentValue, proposedValue: input.command.value };
}

function itemEvidence(fact?: 变量事实记录): string[] {
  return fact?.evidence?.map((item) => item.text).filter(Boolean) ?? [];
}

/**
 * 从一回合的纯分析结果构造临时修复计划。该函数不写入任何正式 state。
 * safe 项默认可提交；confirm 项只能在 UI 明确勾选后提交；conflict 项永远不会被本接口静默写入。
 */
export function buildVariableRepairPlan(input: {
  analysis: VariableTurnAnalysis;
  baseState: VariableState;
  turn: number;
  nsfwPolicy: VariableNsfwPolicy;
  mode?: VariableRepairMode;
  sourceEvidenceId?: string;
  turnId?: string;
  targetMessageId?: string;
  targetUserMessageId?: string;
  sourceBatchId?: string;
  existingBatches?: readonly 变量命令批次[];
}): VariableRepairPlan {
  const operationSourceId = input.turnId || input.targetMessageId || `repair_turn_${input.turn}`;
  const mode: VariableRepairMode = input.mode
    ?? (input.analysis.mode === 'history_repair' ? 'history_repair' : 'repair');
  const sourceEvidenceId = input.sourceEvidenceId ?? input.analysis.sourceEvidenceId;
  // 只有整批没有命令失败的历史批次才可作为“已存在事实”去重依据。
  // 部分成功批次的 facts 不能和 effect 一一对应；保守地重新解析失败事实，
  // 再由当前 state 的稳定实体 ID / 语义字段判断是否已写入，避免把失败项误吞。
  const existingSemanticFingerprints = new Set(
    migrateVariableBatches(input.existingBatches)
      .filter((batch) => batch.results.length === 0 || batch.results.every((result) => result.ok || result.kind === 'warning'))
      .flatMap((batch) => (batch.facts ?? []).map((fact) => fact.semanticFingerprint).filter(Boolean)),
  );
  const items: VariableRepairItem[] = [];
  // 事实命令已经由 linker 生成；先把它们从 legacy 兼容扫描中标记掉，
  // 再用 claimedFactCommands 防止多个事实记录重复消费同一命令组。
  const emittedCommands = new Set(
    input.analysis.factCommands.commands.map((command) => commandSemanticFingerprint(command)),
  );
  const claimedFactCommands = new Set<string>();
  const repairDiagnostics: 变量批次诊断[] = [...(input.analysis.diagnostics ?? [])];
  const addPolicyBlockedItem = (inputItem: {
    command: 变量命令;
    reason: string;
    fact?: 变量事实记录;
    idSeed: unknown;
  }) => {
    items.push({
      id: createStableEntityId('repair_item_policy', inputItem.idSeed),
      category: 'unsupported',
      fact: inputItem.fact,
      command: inputItem.command,
      commands: [],
      evidence: itemEvidence(inputItem.fact),
      reason: inputItem.reason,
      proposedValue: inputItem.command.value,
    });
    repairDiagnostics.push({
      code: 'VARIABLE_REPAIR_POLICY_REJECTED',
      severity: 'warning',
      stage: 'preflight',
      message: inputItem.reason,
      ...(inputItem.command.factGroupId ? { factGroupId: inputItem.command.factGroupId } : {}),
      ...(inputItem.command.factIndex !== undefined ? { factIndex: inputItem.command.factIndex } : {}),
      ...(inputItem.command.entityKey ? { entityKey: inputItem.command.entityKey } : {}),
      ...(inputItem.command.sourceEvidenceId ? { sourceEvidenceId: inputItem.command.sourceEvidenceId } : {}),
    });
  };

  for (const fact of input.analysis.facts) {
    const linkedCommands = commandsForFact({
      fact,
      factCommands: input.analysis.factCommands.commands,
      factCount: input.analysis.facts.length,
    });
    const commands = linkedCommands.filter((command) => {
      const fingerprint = commandSemanticFingerprint(command);
      if (claimedFactCommands.has(fingerprint)) return false;
      claimedFactCommands.add(fingerprint);
      return true;
    });
    if (!commands.length) {
      if (linkedCommands.length) continue;
      items.push({
        id: createStableEntityId('repair_item', [operationSourceId, fact.semanticFingerprint]),
        category: 'unsupported',
        fact,
        commands: [],
        evidence: itemEvidence(fact),
        reason: '事实已解析，但没有生成可安全应用的变量命令。',
      });
      continue;
    }
    const policyResult = applyNsfwVariablePolicy(commands, input.nsfwPolicy, (input.baseState.NPC ?? []) as NPC记录[]);
    policyResult.rejectedCommands.forEach((rejected, index) => addPolicyBlockedItem({
      command: rejected.command,
      reason: rejected.reason,
      fact,
      idSeed: [operationSourceId, fact.semanticFingerprint, 'policy', index, commandSemanticFingerprint(rejected.command)],
    }));
    const classified = policyResult.allowedCommands.map((command) => {
      const result = classifyCommand({ command, state: input.baseState, existingSemanticFingerprints, fact });
      return { command, ...result };
    });
    // 一个事实可能同时产出低风险记忆、需要确认的好感，以及禁止回拨的最近回合。
    // 按命令类别拆成多个预览项，避免单个冲突字段把整条安全事实吞掉。
    const grouped = new Map<VariableRepairItemCategory, typeof classified>();
    for (const entry of classified) {
      const list = grouped.get(entry.category) ?? [];
      list.push(entry);
      grouped.set(entry.category, list);
    }
    for (const [category, entries] of grouped) {
      const representative = entries[0];
      items.push({
        id: createStableEntityId('repair_item', [operationSourceId, fact.semanticFingerprint, category]),
        category,
        fact,
        command: representative.command,
        commands: category === 'existing' || category === 'conflict' ? [] : entries.map((item) => item.command),
        evidence: itemEvidence(fact),
        reason: entries.length > 1 ? `${representative.reason}（${entries.length} 条命令）` : representative.reason,
        currentValue: representative.currentValue,
        proposedValue: representative.proposedValue,
      });
    }
  }

  // 兼容没有 facts 的旧变量更新命令：仍可预览，但默认要求确认，避免静默重放。
  for (const command of input.analysis.commands) {
    const commandFingerprint = commandSemanticFingerprint(command);
    if (emittedCommands.has(commandFingerprint)) continue;
    emittedCommands.add(commandFingerprint);
    const policyResult = applyNsfwVariablePolicy([command], input.nsfwPolicy, (input.baseState.NPC ?? []) as NPC记录[]);
    for (const [index, rejected] of policyResult.rejectedCommands.entries()) {
      addPolicyBlockedItem({
        command: rejected.command,
        reason: rejected.reason,
        idSeed: [operationSourceId, 'legacy-policy', commandFingerprint, index],
      });
    }
    const classified = policyResult.allowedCommands.map((allowedCommand) => {
      emittedCommands.add(commandSemanticFingerprint(allowedCommand));
      const result = classifyCommand({ command: allowedCommand, state: input.baseState, existingSemanticFingerprints });
      return { command: allowedCommand, ...result };
    });
    const grouped = new Map<VariableRepairItemCategory, typeof classified>();
    for (const entry of classified) {
      const list = grouped.get(entry.category) ?? [];
      list.push(entry);
      grouped.set(entry.category, list);
    }
    for (const [category, entries] of grouped) {
      const representative = entries[0];
      items.push({
        id: createStableEntityId('repair_command', [operationSourceId, commandFingerprint, category]),
        category: category === 'safe' ? 'confirm' : category,
        command: representative.command,
        commands: category === 'existing' || category === 'conflict' ? [] : entries.map((item) => item.command),
        evidence: [],
        reason: category === 'safe' ? '旧命令没有事实来源，补写前需要确认。' : representative.reason,
        currentValue: representative.currentValue,
        proposedValue: representative.proposedValue,
      });
    }
  }

  const safeCommands = items.filter((item) => item.category === 'safe').flatMap((item) => item.commands);
  const confirmationCommands = items.filter((item) => item.category === 'confirm').flatMap((item) => item.commands);
  return {
    id: createStableEntityId('repair_plan', [operationSourceId, stableFingerprint(input.analysis.rawText), stableFingerprint(input.baseState)]),
    schemaVersion: 1,
    mode,
    ...(sourceEvidenceId ? { sourceEvidenceId } : {}),
    turn: input.turn,
    turnId: input.turnId,
    targetMessageId: input.targetMessageId,
    targetUserMessageId: input.targetUserMessageId,
    baseStateFingerprint: stableFingerprint(input.baseState),
    sourceBatchId: input.sourceBatchId,
    sourceMessageFingerprint: stableFingerprint(input.analysis.rawText),
    createdAt: Date.now(),
    analysis: input.analysis,
    items,
    safeCommands,
    confirmationCommands,
    conflictItems: items.filter((item) => item.category === 'conflict'),
    skippedItems: items.filter((item) => item.category === 'existing' || item.category === 'unsupported'),
    diagnostics: repairDiagnostics,
  };
}

function makeRepairBatch(input: {
  plan: VariableRepairPlan;
  selectedItems: VariableRepairItem[];
  results: 变量命令结果[];
  facts: 变量事实记录[];
  diagnostics?: 变量批次诊断[];
  stateFingerprint: string;
}): 变量命令批次 {
  return {
    id: createStableEntityId('vbatch_repair', [input.plan.id, input.plan.baseStateFingerprint]),
    schemaVersion: 3,
    turn: input.plan.turn,
    turnId: input.plan.turnId,
    targetMessageId: input.plan.targetMessageId,
    targetUserMessageId: input.plan.targetUserMessageId,
    associationStatus: input.plan.targetMessageId ? 'linked' : undefined,
    mode: input.plan.mode,
    ...(input.plan.sourceEvidenceId ? { sourceEvidenceId: input.plan.sourceEvidenceId } : {}),
    ...(input.plan.sourceEvidenceIds?.length ? { sourceEvidenceIds: [...input.plan.sourceEvidenceIds] } : {}),
    supersedesBatchId: input.plan.sourceBatchId,
    repairPlanId: input.plan.id,
    baseStateFingerprint: input.plan.baseStateFingerprint,
    stateFingerprint: input.stateFingerprint,
    timestamp: Date.now(),
    source: 'calibration',
    facts: input.facts,
    results: input.results,
    ...(input.diagnostics?.length ? { diagnostics: input.diagnostics } : {}),
    report: `历史变量修复：${input.selectedItems.length} 个项目，${input.results.filter((result) => result.ok).length} 条命令成功。`,
    rawText: input.plan.analysis.rawText,
  };
}

/**
 * 提交修复计划。提交前严格比较完整 state fingerprint；不一致时零副作用返回 STALE_PLAN。
 * confirmedItemIds 只需包含 UI 明确确认的项目，safe 项会自动包含。
 */
export function commitVariableRepairPlan(input: {
  plan: VariableRepairPlan;
  currentState: VariableState;
  nsfwPolicy: VariableNsfwPolicy;
  setters?: VariableRepairSetters;
  confirmedItemIds?: readonly string[];
  existingBatches?: readonly 变量命令批次[];
  setVariableBatches?: Dispatch<SetStateAction<变量命令批次[]>>;
}): VariableRepairCommitResult {
  const before = stableFingerprint(input.currentState);
  const confirmed = new Set(input.confirmedItemIds ?? []);
  const existingBatches = migrateVariableBatches(input.existingBatches);
  const duplicate = existingBatches.some((batch) => batch.repairPlanId === input.plan.id);
  const allItemIds = new Set(input.plan.items.map((item) => item.id));
  const invalidSelection = [...confirmed].some((id) => !allItemIds.has(id));
  if (duplicate) {
    const receipt: VariableRepairCommitReceipt = {
      status: 'already_committed', code: 'ALREADY_COMMITTED', planId: input.plan.id,
      stateFingerprintBefore: before, stateFingerprintAfter: before, appliedItemIds: [], skippedItemIds: [], conflictItemIds: input.plan.conflictItems.map((item) => item.id),
      message: '该修复计划已经提交过，已阻止重复结算。',
    };
    return { ok: false, receipt, results: [] };
  }
  if (before !== input.plan.baseStateFingerprint) {
    const receipt: VariableRepairCommitReceipt = {
      status: 'stale', code: 'STALE_PLAN', planId: input.plan.id,
      stateFingerprintBefore: before, stateFingerprintAfter: before, appliedItemIds: [], skippedItemIds: [], conflictItemIds: input.plan.conflictItems.map((item) => item.id),
      message: '预览期间变量状态已变化，请重新解析后再提交。',
    };
    return { ok: false, receipt, results: [] };
  }
  if (invalidSelection) {
    const receipt: VariableRepairCommitReceipt = {
      status: 'rejected', code: 'INVALID_SELECTION', planId: input.plan.id,
      stateFingerprintBefore: before, stateFingerprintAfter: before, appliedItemIds: [], skippedItemIds: [], conflictItemIds: input.plan.conflictItems.map((item) => item.id),
      message: '确认项来自不同修复计划，已拒绝提交。',
    };
    return { ok: false, receipt, results: [] };
  }

  const selectedItems = input.plan.items.filter((item) => item.category === 'safe' || (item.category === 'confirm' && confirmed.has(item.id)));
  const skippedItemIds = input.plan.items.filter((item) => !selectedItems.includes(item)).map((item) => item.id);
  if (!selectedItems.length) {
    const receipt: VariableRepairCommitReceipt = {
      status: 'no_changes', code: 'NO_SELECTED_ITEMS', planId: input.plan.id,
      stateFingerprintBefore: before, stateFingerprintAfter: before, appliedItemIds: [], skippedItemIds, conflictItemIds: input.plan.conflictItems.map((item) => item.id),
      message: '没有可提交的修复项目。',
    };
    return { ok: false, receipt, results: [] };
  }
  const policy = applyNsfwVariablePolicy(
    selectedItems.flatMap((item) => item.commands),
    input.nsfwPolicy,
    (input.currentState.NPC ?? []) as NPC记录[],
  );
  const policyResults: 变量命令结果[] = policy.rejectedCommands.map((item) => ({
    ...item,
    kind: 'rejected' as const,
    stage: 'preflight' as const,
  }));
  const policyDiagnostics = policy.rejectedCommands.map((item) => ({
    code: 'VARIABLE_REPAIR_POLICY_REJECTED',
    severity: 'warning' as const,
    stage: 'preflight' as const,
    message: item.reason,
    ...(item.command.factGroupId ? { factGroupId: item.command.factGroupId } : {}),
    ...(item.command.factIndex !== undefined ? { factIndex: item.command.factIndex } : {}),
    ...(item.command.entityKey ? { entityKey: item.command.entityKey } : {}),
    ...(item.command.sourceEvidenceId ? { sourceEvidenceId: item.command.sourceEvidenceId } : {}),
  }));
  const commands = dedupeCommandsBySemantic(policy.allowedCommands);
  const itemHasAllowedCommand = (item: VariableRepairItem) => item.commands.some((command) =>
    commands.some((allowed) => commandSemanticFingerprint(allowed) === commandSemanticFingerprint(command)),
  );
  const appliedItems = selectedItems.filter(itemHasAllowedCommand);
  const effectiveSkippedItemIds = [...new Set([
    ...skippedItemIds,
    ...selectedItems.filter((item) => !itemHasAllowedCommand(item)).map((item) => item.id),
  ])];
  if (!commands.length) {
    const receipt: VariableRepairCommitReceipt = {
      status: 'rejected', code: 'NSFW_POLICY_REJECTED', planId: input.plan.id,
      stateFingerprintBefore: before, stateFingerprintAfter: before,
      appliedItemIds: [], skippedItemIds: effectiveSkippedItemIds,
      conflictItemIds: input.plan.conflictItems.map((item) => item.id),
      message: policy.rejectedCommands.length
        ? '当前 NSFW 设置阻止了所有选中的修复命令，未写入变量。'
        : '没有可提交的修复命令。',
    };
    return { ok: false, receipt, results: policyResults };
  }
  const reduced = reduceVariableCommands(commands, input.currentState);
  const appliedResults = [...policyResults, ...reduced.results];
  const after = stableFingerprint(reduced.nextState);
  const changed = after !== before;
  if (!changed || !reduced.results.some((result) => result.ok)) {
    if (policy.rejectedCommands.length) {
      const receipt: VariableRepairCommitReceipt = {
        status: 'rejected', code: 'NSFW_POLICY_REJECTED', planId: input.plan.id,
        stateFingerprintBefore: before, stateFingerprintAfter: before,
        appliedItemIds: [], skippedItemIds: effectiveSkippedItemIds,
        conflictItemIds: input.plan.conflictItems.map((item) => item.id),
        message: '当前 NSFW 设置阻止了修复命令，未写入变量。',
      };
      return { ok: false, receipt, results: appliedResults };
    }
    const receipt: VariableRepairCommitReceipt = {
      status: 'no_changes', code: 'NO_CHANGES', planId: input.plan.id,
      stateFingerprintBefore: before, stateFingerprintAfter: before, appliedItemIds: [], skippedItemIds: effectiveSkippedItemIds, conflictItemIds: input.plan.conflictItems.map((item) => item.id),
      message: '修复命令没有产生新的状态变化。',
    };
    return { ok: false, receipt, results: appliedResults };
  }

  if (input.setters) commitVariableState(reduced.nextState, input.currentState, input.setters);
  const selectedFacts = [...new Map(
    appliedItems.flatMap((item) => item.fact ? [[item.fact.id, item.fact] as const] : []),
  ).values()];
  const batch = makeRepairBatch({
    plan: input.plan,
    selectedItems: appliedItems,
    results: appliedResults,
    facts: selectedFacts,
    diagnostics: [
      ...(input.plan.diagnostics ?? input.plan.analysis.diagnostics ?? []),
      ...policyDiagnostics,
      ...reduced.diagnostics,
    ],
    stateFingerprint: after,
  });
  input.setVariableBatches?.((previous) => [...previous, batch]);
  const receipt: VariableRepairCommitReceipt = {
    status: 'committed', code: 'OK', planId: input.plan.id,
    stateFingerprintBefore: before, stateFingerprintAfter: after,
    appliedItemIds: appliedItems.map((item) => item.id), skippedItemIds: effectiveSkippedItemIds,
    conflictItemIds: input.plan.conflictItems.map((item) => item.id),
    message: `已提交 ${appliedItems.length} 个修复项目。`,
  };
  return { ok: true, receipt, nextState: reduced.nextState, results: appliedResults, batch };
}
