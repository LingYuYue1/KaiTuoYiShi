import type { NPC记录 } from '@/models/npc';
import { NPC_RELATION_LABELS, 提取NPC同行记忆文本列表 } from '@/models/npc';

export interface NPC关系规划条目 {
  npcId: string;
  姓名: string;
  关系: string;
  好感度: number;
  同行: boolean;
  优先级: '高' | '中' | '低';
  建议动作: '继续同行互动' | '兑现承诺或冲突' | '补充关系记忆' | '适合手机联系' | '暂作背景';
  理由: string[];
  关注点: string[];
}

export interface NPC关系规划快照 {
  总览: string;
  条目: NPC关系规划条目[];
}

export function buildNpcRelationshipPlanning(npcs: NPC记录[], turnCount: number): NPC关系规划快照 {
  const entries = npcs
    .filter((npc) => npc.阶位 === 'companion' || npc.同行 || 提取NPC同行记忆文本列表(npc).length > 0 || npc.关系 !== 'stranger')
    .map((npc) => buildNpcRelationshipEntry(npc, turnCount))
    .sort((a, b) => priorityRank(b.优先级) - priorityRank(a.优先级) || Math.abs(b.好感度) - Math.abs(a.好感度))
    .slice(0, 12);
  return {
    总览: entries.length
      ? `当前有 ${entries.length} 名 NPC 需要关系规划关注，其中高优先级 ${entries.filter((item) => item.优先级 === '高').length} 名。`
      : '当前没有需要关系规划关注的 NPC。',
    条目: entries,
  };
}

function buildNpcRelationshipEntry(npc: NPC记录, turnCount: number): NPC关系规划条目 {
  const memories = 提取NPC同行记忆文本列表(npc);
  const recent = Number(npc.最近回合 || 0) >= Math.max(1, turnCount - 10);
  const hasPromise = memories.some((item) => /约|承诺|答应|欠|等待|再见|联系|冲突|警惕|怀疑|信任/.test(item));
  const needsMemory = recent && memories.length === 0 && (npc.同行 || npc.关系 !== 'stranger' || Math.abs(npc.好感度) >= 10);
  const action: NPC关系规划条目['建议动作'] = needsMemory
    ? '补充关系记忆'
    : hasPromise
      ? '兑现承诺或冲突'
      : npc.同行
        ? '继续同行互动'
        : recent && ['friend', 'close', 'acquaintance'].includes(npc.关系)
          ? '适合手机联系'
          : '暂作背景';
  const priority: NPC关系规划条目['优先级'] =
    needsMemory || hasPromise || npc.同行 || npc.关系 === 'enemy' || npc.关系 === 'rival'
      ? '高'
      : recent || Math.abs(npc.好感度) >= 20
        ? '中'
        : '低';
  return {
    npcId: npc.id,
    姓名: npc.姓名,
    关系: NPC_RELATION_LABELS[npc.关系] ?? npc.关系,
    好感度: npc.好感度,
    同行: npc.同行,
    优先级: priority,
    建议动作: action,
    理由: buildReasons(npc, memories, recent, needsMemory, hasPromise),
    关注点: buildFocusPoints(npc, memories),
  };
}

function buildReasons(npc: NPC记录, memories: string[], recent: boolean, needsMemory: boolean, hasPromise: boolean): string[] {
  return uniqueText([
    npc.同行 ? '当前同行，需要持续承接现场互动' : '',
    recent ? `最近回合 ${npc.最近回合} 出现过` : '',
    npc.关系 !== 'stranger' ? `关系已不是陌生：${NPC_RELATION_LABELS[npc.关系] ?? npc.关系}` : '',
    Math.abs(npc.好感度) >= 10 ? `好感度已有明显变化：${npc.好感度}` : '',
    needsMemory ? '近期有关系信号但缺少同行记忆，后续可能失忆' : '',
    hasPromise ? '同行记忆中存在承诺、亏欠、冲突或信任变化' : '',
    memories.length ? `已有同行记忆 ${memories.length} 条` : '',
  ], 6);
}

function buildFocusPoints(npc: NPC记录, memories: string[]): string[] {
  const latestMemorySignals = memories
    .slice(-4)
    .flatMap(extractRelationshipSignals)
    .map((item) => `关系线索：${item}`);

  return uniqueText([
    npc.对玩家称呼 ? `称呼：${npc.对玩家称呼}` : '',
    npc.介绍 ? `背景：${summarizeText(npc.介绍, 52)}` : '',
    ...latestMemorySignals,
  ], 5);
}

function extractRelationshipSignals(memory: string): string[] {
  const normalized = memory.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const signals: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/承诺|答应|约定|约好|再见|等待|联系/, '存在未兑现的承诺或后续约定'],
    [/冲突|争执|怀疑|警惕|隐瞒|误会|敌意/, '存在冲突、警惕或信任风险'],
    [/信任|托付|依赖|保护|救|帮助|配合/, '信任或并肩关系正在增强'],
    [/同行|一起|跟随|带路|陪同/, '当前关系适合继续现场同行'],
    [/称呼|名字|自我介绍|介绍/, '称呼或相识状态已建立'],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(normalized)) signals.push(label);
  }

  if (!signals.length) {
    signals.push(summarizeText(normalized, 44));
  }

  return signals;
}

function summarizeText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function priorityRank(value: NPC关系规划条目['优先级']): number {
  return value === '高' ? 3 : value === '中' ? 2 : 1;
}

function uniqueText(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}
