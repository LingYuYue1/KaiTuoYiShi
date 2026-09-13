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
