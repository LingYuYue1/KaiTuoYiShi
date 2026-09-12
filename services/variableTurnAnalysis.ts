import type { NPC记录 } from '@/models/npc';
import type { 变量事实, 变量命令, 变量命令结果, 变量事实来源, 变量批次诊断, 变量处理模式 } from '@/models/variableCommand';
import { buildVariableFactRecords } from '@/utils/variableFactRecords';
import { parseVariableCommands, reduceVariableCommands } from '@/utils/variableExecutor';
import { assignVariableFactSources, factsToVariableCommands, parseVariableFacts } from '@/utils/variableFacts';
import { extractRoot, isTravelerPlayerAuthoredVariablePath, type VariableRootKey, type VariableState } from '@/utils/variableRegistry';
import { applyNsfwVariablePolicy } from '@/utils/variableNsfwPolicy';

export interface NpcLedgerUpdateDebug {
  updatedNames: string[];
  memoryAppended: string[];
  ledgerFieldsUpdated: string[];
  summaryTriggered: string[];
  warnings: string[];
}

export interface VariableTurnAnalysis {
  rawText: string;
  parsedFacts: ReturnType<typeof parseVariableFacts>;
  factCommands: ReturnType<typeof factsToVariableCommands>;
  commands: 变量命令[];
  results: 变量命令结果[];
  diagnostics: 变量批次诊断[];
  mode?: 变量处理模式;
  sourceEvidenceId?: string;
  sourceTurnId?: string;
  sourceMessageId?: string;
  nextState: VariableState;
  npcLedgerUpdate?: NpcLedgerUpdateDebug;
  facts: import('@/models/variableCommand').变量事实记录[];
  legacyCommandCount: number;
  skippedTravelerProfileLegacyCount: number;
  skippedServiceOwnedLegacyCount?: number;
}

const NPC_LEDGER_FIELD_LABELS: Record<string, string> = {
  最近互动: '最近互动',
  对玩家长期印象: '对玩家长期印象',
  当前关系阶段: '当前关系阶段',
  共同经历: '共同经历',
  未完成事项: '未完成事项',
  未解决冲突: '未解决冲突',
  必须记得: '必须记得',
  禁止遗忘: '禁止遗忘',
  同行记忆: '同行记忆',
};

function pushUniqueText(list: string[], text: string) {
  const normalized = text.trim();
  if (normalized && !list.includes(normalized)) list.push(normalized);
}

function buildNpcLedgerUpdateDebug(input: {
  facts: 变量事实[];
  commands: 变量命令[];
  results: Array<{ command?: 变量命令; ok: boolean; reason?: string; kind?: string }>;
  warnings: string[];
}): NpcLedgerUpdateDebug | undefined {
  const updatedNames: string[] = [];
  const memoryAppended: string[] = [];
  const ledgerFieldsUpdated: string[] = [];
  const warnings: string[] = [];
  const npcNameById = new Map<string, string>();

  for (const fact of input.facts) {
    if (fact.type !== 'npc') continue;
    const name = (fact.name || fact.id || '').trim() || '未知 NPC';
    if (fact.id?.trim()) npcNameById.set(fact.id.trim(), name);
    const fields = [
      fact.recentInteraction ? '最近互动' : '',
      fact.longTermImpression ? '对玩家长期印象' : '',
      fact.intimateRelationship !== undefined ? '亲密关系' : '',
      fact.sharedExperiences?.length ? '共同经历' : '',
      fact.openItems?.length ? '未完成事项' : '',
      fact.unresolvedConflicts?.length ? '未解决冲突' : '',
      fact.mustRemember?.length ? '必须记得' : '',
      fact.doNotForget?.length ? '禁止遗忘' : '',
    ].filter(Boolean);
    if (fact.memory) pushUniqueText(memoryAppended, `${name}：${fact.memory}`);
    if (fields.length) pushUniqueText(ledgerFieldsUpdated, `${name}：${fields.join('、')}`);
    if (fact.memory && !fields.length) {
      pushUniqueText(warnings, `${name} 只写了 memory，没有同步 recentInteraction / mustRemember / openItems 等账本字段。`);
    }
    if (fields.length || fact.memory || fact.affinityDelta !== undefined || fact.affinitySet !== undefined || fact.intimateRelationship !== undefined || fact.following !== undefined) {
      pushUniqueText(updatedNames, name);
    }
  }

  for (const item of input.results.filter((result) => result.ok && result.command)) {
    if (!item.command) continue;
    const key = item.command.key;
    const id = key.match(/^NPC\[id=([^\]]+)\]/)?.[1]?.trim() || '';
    const name = npcNameById.get(id) ?? id;
    const field = key.match(/^NPC\[[^\]]+\]\.([^.[\]]+)/)?.[1]?.trim() || '';
    if (name) pushUniqueText(updatedNames, name);
    if (field === '同行记忆') pushUniqueText(memoryAppended, `${name || 'NPC'}：已追加同行记忆`);
    const label = NPC_LEDGER_FIELD_LABELS[field];
    if (label && field !== '同行记忆') pushUniqueText(ledgerFieldsUpdated, `${name || 'NPC'}：${label}`);
  }
  input.warnings.forEach((reason) => pushUniqueText(warnings, reason));

  if (!updatedNames.length && !memoryAppended.length && !ledgerFieldsUpdated.length && !warnings.length) return undefined;
  return { updatedNames, memoryAppended, ledgerFieldsUpdated, summaryTriggered: [], warnings };
}

/** 纯变量分析：只解析、转换和预演，不触碰 React setter、队列或存档。 */
export function analyzeVariableTurn(input: {
  rawText: string;
  stateSnapshot: VariableState;
  turn: number;
  operationSourceId?: string;
  sourceTurnId?: string;
  sourceMessageId?: string;
  sourceEvidenceId?: string;
  phoneSeedsEnabled?: boolean;
  maxPhoneSeedsPerTurn?: number;
  nsfwEnabled?: boolean;
  maleNsfwArchiveEnabled?: boolean;
  /** 事实证据来源；历史重解析必须显式传入“历史正文”。 */
  factSource?: 变量事实来源;
  /** 用于把混合正文/通讯输入中的约定归属到正确来源。 */
  bodyText?: string;
  recallContext?: string;
  mode?: 变量处理模式;
  /** 正常 linker 只允许 legacy 命令触及正式可写 root。未传时保留旧分析兼容行为。 */
  allowedLegacyRoots?: readonly VariableRootKey[];
}): VariableTurnAnalysis {
  const parsedFactsRaw = parseVariableFacts(input.rawText);
  const sourcedFacts = assignVariableFactSources(parsedFactsRaw.facts, {
    factSource: input.factSource,
    bodyText: input.bodyText,
    recallContext: input.recallContext,
    sourceEvidenceId: input.sourceEvidenceId,
  });
  const parsedFacts = { ...parsedFactsRaw, facts: sourcedFacts };
  const factCommands = factsToVariableCommands(sourcedFacts, input.stateSnapshot, input.turn, {
    phoneSeedsEnabled: input.phoneSeedsEnabled,
    maxPhoneSeedsPerTurn: input.maxPhoneSeedsPerTurn,
    operationSourceId: input.operationSourceId,
    factSource: input.factSource,
    bodyText: input.bodyText,
    recallContext: input.recallContext,
    sourceEvidenceId: input.sourceEvidenceId,
  });
  const parsedLegacyCommands = parseVariableCommands(input.rawText);
  const travelerFilteredLegacyCommands = parsedLegacyCommands.commands.filter((command) => !isTravelerPlayerAuthoredVariablePath(command.key));
  const skippedTravelerProfileLegacyCount = parsedLegacyCommands.commands.length - travelerFilteredLegacyCommands.length;
  const allowedLegacyRoots = input.allowedLegacyRoots ? new Set(input.allowedLegacyRoots) : undefined;
  const filteredLegacyCommands = allowedLegacyRoots
    ? travelerFilteredLegacyCommands.filter((command) => {
        const root = extractRoot(command.key)?.root;
        return Boolean(root && allowedLegacyRoots.has(root));
      })
    : travelerFilteredLegacyCommands;
  const skippedServiceOwnedLegacyCount = travelerFilteredLegacyCommands.length - filteredLegacyCommands.length;
  const legacyFactSource = input.factSource ?? '正文';
  const sourcedLegacyCommands = filteredLegacyCommands.map((command) => ({
    ...command,
    factSource: command.factSource ?? legacyFactSource,
    ...(command.sourceEvidenceId || input.sourceEvidenceId
      ? { sourceEvidenceId: command.sourceEvidenceId ?? input.sourceEvidenceId }
      : {}),
  }));
  const commands = [...factCommands.commands, ...sourcedLegacyCommands];
  const parseErrors = [
    ...parsedFacts.parseErrors.map((reason) => `变量事实：${reason}`),
    ...parsedLegacyCommands.parseErrors.map((reason) => `变量命令：${reason}`),
  ];
  const { allowedCommands, rejectedCommands } = applyNsfwVariablePolicy(commands, {
    nsfwEnabled: input.nsfwEnabled === true,
    maleNsfwArchiveEnabled: input.maleNsfwArchiveEnabled === true,
  }, input.stateSnapshot.NPC as NPC记录[]);
  const { results, nextState, diagnostics: reducerDiagnostics } = reduceVariableCommands(allowedCommands, input.stateSnapshot);
  const factDiagnostics: 变量批次诊断[] = factCommands.diagnostics;
  const diagnostics: 变量批次诊断[] = [
    ...parseErrors.map((message) => ({
      code: 'VARIABLE_PARSE_ERROR',
      severity: 'error' as const,
      stage: 'parse' as const,
      message,
      ...(input.sourceEvidenceId ? { sourceEvidenceId: input.sourceEvidenceId } : {}),
    })),
    ...factDiagnostics,
    ...(skippedServiceOwnedLegacyCount ? [{
      code: 'VARIABLE_LEGACY_ROOT_OWNED_BY_SERVICE',
      severity: 'warning' as const,
      stage: 'preflight' as const,
      message: `已忽略 ${skippedServiceOwnedLegacyCount} 条写入 service-owned root 的旧变量命令。`,
      ...(input.sourceEvidenceId ? { sourceEvidenceId: input.sourceEvidenceId } : {}),
    }] : []),
    ...reducerDiagnostics,
  ];
  const allResults: 变量命令结果[] = [
    ...rejectedCommands.map((item) => ({ ...item, kind: 'rejected' as const, stage: 'preflight' as const })),
    ...results.map((item) => ({ ...item, kind: item.kind ?? 'command' as const })),
  ];
  const npcLedgerUpdate = buildNpcLedgerUpdateDebug({
    facts: parsedFacts.facts,
    commands,
    results: allResults,
    warnings: [...parseErrors, ...factCommands.warnings, ...rejectedCommands.map((item) => item.reason)],
  });
  return {
    rawText: input.rawText,
    parsedFacts,
    factCommands,
    commands,
    results: allResults,
    diagnostics,
    mode: input.mode,
    sourceEvidenceId: input.sourceEvidenceId,
    sourceTurnId: input.sourceTurnId,
    sourceMessageId: input.sourceMessageId,
    nextState,
    npcLedgerUpdate,
    facts: buildVariableFactRecords({
      facts: parsedFacts.facts,
      sourceTurn: input.turn,
      sourceTurnId: input.sourceTurnId,
      sourceMessageId: input.sourceMessageId,
      sourceEvidenceId: input.sourceEvidenceId,
      producedBy: input.mode === 'repair' || input.mode === 'history_repair'
        ? 'history_repair'
        : input.mode === 'reroll' ? 'reroll' : 'normal',
    }),
    legacyCommandCount: filteredLegacyCommands.length,
    skippedTravelerProfileLegacyCount,
    skippedServiceOwnedLegacyCount,
  };
}
