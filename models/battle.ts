// 旧独立战斗系统兼容壳。
// 当前项目的战斗已经完全降级为主剧情正文描写；这里仅保留旧存档字段的最小归一化，
// 避免历史存档或变量管理读取到 `战斗` root 时出现运行错误。

export type 战斗结果 = 'win' | 'lose' | 'draw' | 'flee';

export interface 战斗记录 {
  id: string;
  回合: number;
  敌人: string;
  结果: 战斗结果;
  描述: string;
  important?: boolean;
  timestamp: number;
}

const VALID_OUTCOMES: ReadonlySet<战斗结果> = new Set(['win', 'lose', 'draw', 'flee']);

function sanitizeBattleRecord(record: Partial<战斗记录>): 战斗记录 | null {
  if (!record || typeof record !== 'object') return null;
  const result = VALID_OUTCOMES.has(record.结果 as 战斗结果) ? (record.结果 as 战斗结果) : 'draw';
  const enemy = typeof record.敌人 === 'string' ? record.敌人.trim() : '';
  const desc = typeof record.描述 === 'string' ? record.描述.trim() : '';
  if (!enemy && !desc) return null;
  return {
    id: typeof record.id === 'string' && record.id.trim()
      ? record.id
      : `legacy_battle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    回合: Math.max(0, Number(record.回合) || 0),
    敌人: enemy || '旧战斗记录',
    结果: result,
    描述: desc || '旧存档中的战斗记录，仅作兼容保留。',
    important: Boolean(record.important),
    timestamp: Number(record.timestamp) || Date.now(),
  };
}

export function 归一化战斗履历(arr: unknown): 战斗记录[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item) => sanitizeBattleRecord(item as Partial<战斗记录>))
    .filter((item): item is 战斗记录 => Boolean(item));
}
