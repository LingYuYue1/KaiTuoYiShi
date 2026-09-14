// 统一事实视图（lean）：新闻等消费者只读这一份，不再各自判断剧情是否发生。
import type { 世界事实 } from '@/models/storyWeaving';

export interface 世界事实视图 {
  本回合新事实: 世界事实[];
  玩家已知事实: 世界事实[];
}

export function 构造世界事实视图(factLedger: 世界事实[], 本回合事实: 世界事实[] = []): 世界事实视图 {
  return {
    本回合新事实: 本回合事实,
    玩家已知事实: factLedger.filter((fact) => fact.playerKnown),
  };
}

/** payload 摘要：首个非空字符串字段。事实摘要规则只此一处，展示文本与提示词文本共用。 */
export function 事实摘要(payload: Record<string, unknown>): string {
  const text = Object.values(payload).find((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  return text?.trim() ?? '';
}

/** 消费者（新闻等）只读的文本行：payload 摘要优先，退化为 factType。 */
export function 世界事实文本行(view: 世界事实视图, limit = 12): string[] {
  const facts = view.玩家已知事实.length ? view.玩家已知事实 : view.本回合新事实;
  return facts.slice(-limit).map((fact) => `${fact.factType}：${事实摘要(fact.payload) || '(无摘要)'}`);
}
