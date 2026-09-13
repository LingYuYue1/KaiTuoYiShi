// 世界事实身份：内容寻址、只追加。身份只由事件实例 + 来源 revision + 类型 + 结构化 payload 决定，
// 不含标题、数组下标、新闻正文或当前时间；同一内容重试必然得到同一 factId（幂等重跑）。
import type { 世界事实 } from '@/models/storyWeaving';
import { 世界事实上限 } from '@/models/storyWeaving';
import { stableStringify } from '@/utils/stableHash';

/** 排期事件实例 ID：按（系列，分段）稳定生成，重投影不重建。 */
export function 世界事件实例ID(seriesId: string, segmentId: string): string {
  return `we:${seriesId}:${segmentId}`;
}

export function 世界事实身份(input: {
  sourceEventInstanceId: string;
  sourceRevision: number;
  factType: string;
  payload: Record<string, unknown>;
}): string {
  return stableStringify({
    eventInstanceId: input.sourceEventInstanceId,
    sourceRevision: Math.max(0, Math.trunc(input.sourceRevision)),
    factType: input.factType,
    payload: input.payload,
  });
}

/** 只追加合并：同 factId 去重、超限保留最近记录。 */
export function 合并世界事实(现有: 世界事实[], 新增: 世界事实[], 上限 = 世界事实上限): 世界事实[] {
  const seen = new Set(现有.map((fact) => fact.factId));
  const merged = [...现有];
  for (const fact of 新增) {
    if (seen.has(fact.factId)) continue;
    seen.add(fact.factId);
    merged.push(fact);
  }
  return merged.slice(-上限);
}
