import type { 聊天消息 } from '@/models/chat';
import type { 变量事实, 变量命令 } from '@/models/variableCommand';
import type { NPC账本选择结果 } from '@/models/npc';

export function buildNpcLedgerDebug(selection?: NPC账本选择结果): NonNullable<聊天消息['debugContext']>['npcLedgerInjection'] | undefined {
  if (!selection) return undefined;
  return {
    selectedNames: selection.selected.map((item) => item.npc.姓名),
    skippedNames: selection.skipped.slice(0, 12),
    injected: selection.selected.map((item) => ({
      name: item.npc.姓名,
      reason: item.reasons,
      fields: item.fields,
      hasRecentInteraction: Boolean(item.ledger.最近互动),
      hasMustRemember: item.ledger.必须记得.length > 0 || item.ledger.禁止遗忘.length > 0,
      hasUnresolvedItems: item.ledger.未完成事项.length > 0 || item.ledger.未解决冲突.length > 0,
    })),
  };
}

export type NpcLedgerUpdateDebug = NonNullable<聊天消息['debugContext']>['npcLedgerUpdate'];

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

function normalizeNpcDebugName(name: string): string {
  return name.trim() || '未知 NPC';
}

function extractNpcNameFromCommandKey(key: string): string {
  const matched = key.match(/^NPC\[id=([^\]]+)\]/);
  return matched?.[1]?.trim() || '';
}

function extractNpcFieldFromCommandKey(key: string): string {
  const matched = key.match(/^NPC\[[^\]]+\]\.([^.[\]]+)/);
  return matched?.[1]?.trim() || '';
}

export function pushUniqueText(list: string[], text: string) {
  const normalized = text.trim();
  if (!normalized || list.includes(normalized)) return;
  list.push(normalized);
}

export function buildNpcLedgerUpdateDebug(input: {
  facts: 变量事实[];
  commands: 变量命令[];
  results: Array<{ command: 变量命令; ok: boolean; reason?: string; kind?: string }>;
  warnings: string[];
  summaryTriggeredNames?: string[];
}): NpcLedgerUpdateDebug | undefined {
  const updatedNames: string[] = [];
  const memoryAppended: string[] = [];
  const ledgerFieldsUpdated: string[] = [];
  const warnings: string[] = [];
  const npcNameById = new Map<string, string>();

  for (const fact of input.facts) {
    if (fact.type !== 'npc') continue;
    const name = normalizeNpcDebugName(fact.name || fact.id || '');
    if (fact.id?.trim()) npcNameById.set(fact.id.trim(), name);
    const factFields = [
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
    if (factFields.length) pushUniqueText(ledgerFieldsUpdated, `${name}：${factFields.join('、')}`);
    if (fact.memory && !factFields.length) {
      pushUniqueText(warnings, `${name} 只写了 memory，没有同步 recentInteraction / mustRemember / openItems 等账本字段。`);
    }
    if (factFields.length || fact.memory || fact.affinityDelta !== undefined || fact.affinitySet !== undefined || fact.intimateRelationship !== undefined || fact.following !== undefined) {
      pushUniqueText(updatedNames, name);
    }
  }

  const successfulCommands = input.results.filter((item) => item.ok);
  for (const item of successfulCommands) {
    const key = item.command.key;
    if (!key.startsWith('NPC[')) continue;
    const commandName = extractNpcNameFromCommandKey(key);
    const name = npcNameById.get(commandName) ?? commandName;
    const field = extractNpcFieldFromCommandKey(key);
    if (name) pushUniqueText(updatedNames, name);
    if (field === '同行记忆') pushUniqueText(memoryAppended, `${name || 'NPC'}：已追加同行记忆`);
    const label = NPC_LEDGER_FIELD_LABELS[field];
    if (label && field !== '同行记忆') pushUniqueText(ledgerFieldsUpdated, `${name || 'NPC'}：${label}`);
  }

  for (const reason of input.warnings) {
    pushUniqueText(warnings, reason);
  }

  const summaryTriggered = input.summaryTriggeredNames ?? [];
  if (!updatedNames.length && !memoryAppended.length && !ledgerFieldsUpdated.length && !summaryTriggered.length && !warnings.length) {
    return undefined;
  }
  return {
    updatedNames,
    memoryAppended,
    ledgerFieldsUpdated,
    summaryTriggered,
    warnings,
  };
}

export function attachNpcLedgerUpdateDebug(
  history: 聊天消息[],
  messageId: string,
  update?: NpcLedgerUpdateDebug,
): 聊天消息[] {
  if (!update) return history;
  return history.map((msg) => {
    if (msg.id !== messageId) return msg;
    return {
      ...msg,
      debugContext: msg.debugContext
        ? { ...msg.debugContext, npcLedgerUpdate: update }
        : msg.debugContext,
    };
  });
}

export function formatNpcLedgerPreview(selection?: NPC账本选择结果): string {
  if (!selection) return '';
  const selected = selection.selected.map((item) => `${item.npc.姓名}（${item.reasons.slice(0, 3).join('、') || '相关'}）`);
  const skipped = selection.skipped.slice(0, 4).map((item) => `${item.name}：${item.reason}`);
  return [
    'NPC账本注入诊断：',
    selected.length ? `已注入：${selected.join('；')}` : '已注入：无',
    skipped.length ? `未注入示例：${skipped.join('；')}` : '',
  ].filter(Boolean).join('\n');
}


