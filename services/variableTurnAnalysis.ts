import type { NPC记录 } from '@/models/npc';
import type { 变量事实, 变量命令, 变量命令结果 } from '@/models/variableCommand';
import type { VariableCoverageReport } from '@/services/ai/variableModel';
import { getNsfwArchiveBlockReason } from '@/utils/nsfwArchivePolicy';
import { buildVariableFactRecords } from '@/utils/variableFactRecords';
import { parseVariableCommands, reduceVariableCommands } from '@/utils/variableExecutor';
import { factsToVariableCommands, parseVariableFacts } from '@/utils/variableFacts';
import { isTravelerPlayerAuthoredVariablePath, type VariableState } from '@/utils/variableRegistry';

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
  nextState: VariableState;
  npcLedgerUpdate?: NpcLedgerUpdateDebug;
  coverage?: VariableCoverageReport;
  facts: import('@/models/variableCommand').变量事实记录[];
  legacyCommandCount: number;
  skippedTravelerProfileLegacyCount: number;
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
  results: Array<{ command: 变量命令; ok: boolean; reason?: string; kind?: string }>;
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

  for (const item of input.results.filter((result) => result.ok)) {
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

function getNsfwBlockedCommandReason(command: 变量命令, npcs: NPC记录[]): string | null {
  const text = `${command.key}\n${JSON.stringify(command.value ?? '')}`;
  const selector = command.key.match(/^NPC\[([^\]]+)\]/)?.[1] ?? '';
  const selectorValue = selector.includes('=')
    ? selector.split('=').slice(1).join('=').replace(/^["']|["']$/g, '').trim()
    : selector.trim();
  const npc = npcs.find((item) =>
    item.id === selectorValue ||
    item.姓名 === selectorValue ||
    item.别名 === selectorValue ||
    text.includes(item.姓名) ||
    Boolean(item.别名 && text.includes(item.别名)),
  );
  const reason = getNsfwArchiveBlockReason(npc, selectorValue, text);
  return reason ? `NSFW 档案已阻止：${reason}。` : null;
}

function applyNsfwVariablePolicy(
  commands: 变量命令[],
  policy: { nsfwEnabled: boolean; maleNsfwArchiveEnabled: boolean },
  npcs: NPC记录[] = [],
) {
  const allowedCommands: 变量命令[] = [];
  const rejectedCommands: Array<{ command: 变量命令; ok: false; reason: string }> = [];
  for (const command of commands) {
    const valueText = JSON.stringify(command.value ?? '');
    const touchesNsfw = command.key.includes('NSFW档案') || valueText.includes('NSFW档案');
    const touchesMaleArchive = command.key.includes('男性身体档案') || command.key.includes('男性器') || valueText.includes('男性身体档案') || valueText.includes('男性器');
    const blockedReason = touchesNsfw ? getNsfwBlockedCommandReason(command, npcs) : null;
    const reason = touchesNsfw && !policy.nsfwEnabled
      ? 'NSFW 总开关未开启，已阻止写入 NSFW 档案。'
      : blockedReason
        ? blockedReason
        : touchesMaleArchive && !policy.maleNsfwArchiveEnabled
          ? '男性 NSFW 档案开关未开启，已阻止写入男性身体档案。'
          : '';
    if (reason) rejectedCommands.push({ command, ok: false, reason });
    else allowedCommands.push(command);
  }
  return { allowedCommands, rejectedCommands };
}

/** 纯变量分析：只解析、转换和预演，不触碰 React setter、队列或存档。 */
export function analyzeVariableTurn(input: {
  rawText: string;
  stateSnapshot: VariableState;
  turn: number;
  operationSourceId?: string;
  sourceTurnId?: string;
  sourceMessageId?: string;
  phoneSeedsEnabled?: boolean;
  maxPhoneSeedsPerTurn?: number;
  nsfwEnabled?: boolean;
  maleNsfwArchiveEnabled?: boolean;
  mode?: 'normal' | 'retry' | 'repair' | 'reroll';
  coverage?: VariableCoverageReport;
}): VariableTurnAnalysis {
  const parsedFacts = parseVariableFacts(input.rawText);
  const factCommands = factsToVariableCommands(parsedFacts.facts, input.stateSnapshot, input.turn, {
    phoneSeedsEnabled: input.phoneSeedsEnabled,
    maxPhoneSeedsPerTurn: input.maxPhoneSeedsPerTurn,
    operationSourceId: input.operationSourceId,
  });
  const parsedLegacyCommands = parseVariableCommands(input.rawText);
  const filteredLegacyCommands = parsedLegacyCommands.commands.filter((command) => !isTravelerPlayerAuthoredVariablePath(command.key));
  const skippedTravelerProfileLegacyCount = parsedLegacyCommands.commands.length - filteredLegacyCommands.length;
  const commands = [...factCommands.commands, ...filteredLegacyCommands];
  const parseErrors = [
    ...parsedFacts.parseErrors.map((reason) => `变量事实：${reason}`),
    ...parsedLegacyCommands.parseErrors.map((reason) => `变量命令：${reason}`),
  ];
  const { allowedCommands, rejectedCommands } = applyNsfwVariablePolicy(commands, {
    nsfwEnabled: input.nsfwEnabled === true,
    maleNsfwArchiveEnabled: input.maleNsfwArchiveEnabled === true,
  }, input.stateSnapshot.NPC as NPC记录[]);
  const { results, nextState } = reduceVariableCommands(allowedCommands, input.stateSnapshot);
  const allResults: 变量命令结果[] = [
    ...parseErrors.map((reason) => ({ command: { action: 'set' as const, key: '(解析失败)', value: null }, ok: false, kind: 'error' as const, reason })),
    ...factCommands.warnings.map((reason) => ({ command: { action: 'set' as const, key: '(事实忽略)', value: null }, ok: false, kind: 'warning' as const, reason })),
    ...rejectedCommands.map((item) => ({ ...item, kind: 'rejected' as const })),
    ...results.map((item) => ({ ...item, kind: 'command' as const })),
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
    nextState,
    npcLedgerUpdate,
    coverage: input.coverage,
    facts: buildVariableFactRecords({
      facts: parsedFacts.facts,
      sourceTurn: input.turn,
      sourceTurnId: input.sourceTurnId,
      sourceMessageId: input.sourceMessageId,
      producedBy: input.mode === 'repair' ? 'history_repair' : input.mode === 'reroll' ? 'reroll' : 'normal',
    }),
    legacyCommandCount: filteredLegacyCommands.length,
    skippedTravelerProfileLegacyCount,
  };
}
