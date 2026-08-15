import type { 剧情编织分段, 剧情编织进度锚点, 剧情编织系列 } from '@/models/storyWeaving';

export interface SegmentDraft {
  标题: string;
  章节范围: string;
  启用注入: boolean;
  本段概括: string;
  前段延续事实: string;
  本段结束状态: string;
  给后续参考: string;
  登场角色: string;
  涉及地点: string;
  涉及派系: string;
}

export const joinList = (values: string[]) => values.join('\n');

export const splitList = (value: string) =>
  value
    .split(/\n|；|;|\|/g)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

export const uniqueText = (values: string[], limit: number) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    const key = value.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
};

export function buildManualProgressAnchor(
  previous: 剧情编织进度锚点 | undefined,
  series: 剧情编织系列,
  segment: 剧情编织分段,
  note: string,
): 剧情编织进度锚点 {
  return {
    当前系列ID: series.id,
    当前分段ID: segment.id,
    当前分段组号: segment.组号,
    推进状态: segment.运行状态 === '已经历' ? '已完成'
      : segment.运行状态 === '已偏离' ? '已偏离'
        : segment.运行状态 === '暂停' ? '暂停'
          : segment.运行状态 === '未开始' ? '未开始'
            : '推进中',
    已完成摘要: previous?.已完成摘要 ?? [],
    当前待解问题: uniqueText([
      ...segment.给后续参考,
      ...segment.关键事件.flatMap((event) => event.触发条件),
    ], 10),
    切换说明: uniqueText([...(previous?.切换说明 ?? []), note], 10),
    历史归档: previous?.历史归档 ?? [],
    最近门禁结果: previous?.最近门禁结果,
    最近判定理由: ['手动修正剧情编织进度'],
    最近一次推进判定回合: previous?.最近一次推进判定回合,
    updatedAt: Date.now(),
  };
}

export function getSeriesAnchorSegment(series: 剧情编织系列): 剧情编织分段 | undefined {
  return series.分段列表.find((segment) => segment.组号 === series.当前分段组号 && segment.运行状态 === '当前')
    ?? series.分段列表.find((segment) => segment.组号 === series.当前分段组号)
    ?? series.分段列表.find((segment) => segment.运行状态 === '当前')
    ?? series.分段列表[0];
}

export function buildSeriesProgressAnchor(
  previous: 剧情编织进度锚点 | undefined,
  series: 剧情编织系列 | undefined,
  note: string,
): 剧情编织进度锚点 | undefined {
  const segment = series ? getSeriesAnchorSegment(series) : undefined;
  return series && segment ? buildManualProgressAnchor(previous, series, segment, note) : undefined;
}

export function draftFromSegment(segment: 剧情编织分段): SegmentDraft {
  return {
    标题: segment.标题,
    章节范围: segment.章节范围,
    启用注入: segment.启用注入,
    本段概括: segment.本段概括,
    前段延续事实: joinList(segment.前段延续事实),
    本段结束状态: joinList(segment.本段结束状态),
    给后续参考: joinList(segment.给后续参考),
    登场角色: joinList(segment.登场角色),
    涉及地点: joinList(segment.涉及地点),
    涉及派系: joinList(segment.涉及派系),
  };
}

export function applyDraft(segment: 剧情编织分段, draft: SegmentDraft): 剧情编织分段 {
  return {
    ...segment,
    标题: draft.标题.trim() || segment.标题,
    章节范围: draft.章节范围.trim() || segment.章节范围,
    启用注入: draft.启用注入,
    本段概括: draft.本段概括.trim(),
    前段延续事实: splitList(draft.前段延续事实),
    本段结束状态: splitList(draft.本段结束状态),
    给后续参考: splitList(draft.给后续参考),
    登场角色: splitList(draft.登场角色),
    涉及地点: splitList(draft.涉及地点),
    涉及派系: splitList(draft.涉及派系),
    updatedAt: Date.now(),
  };
}

export function getPreviousCompleted(series: 剧情编织系列, segment: 剧情编织分段) {
  return series.分段列表
    .filter((item) => item.组号 < segment.组号 && item.处理状态 === '已完成')
    .sort((a, b) => b.组号 - a.组号)[0];
}
