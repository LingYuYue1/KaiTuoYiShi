import type { 剧情编织分段, 剧情编织进度锚点, 剧情编织系列, 剧情编织系统 } from '@/models/storyWeaving';

export interface 剧情规划分析快照 {
  系列标题: string;
  当前分段标题: string;
  当前分段组号: number;
  推进状态: string;
  门禁结果: 'soft' | 'strong' | '未记录';
  建议动作: '继续软参考' | '允许强承接' | '等待正文证据' | '可归档或切段' | '需要人工检查';
  偏离风险: '低' | '中' | '高';
  分析理由: string[];
  关注事项: string[];
  切段条件: string[];
  待迁移事项: string[];
  下一步调度: string[];
  归档检查: string[];
  历史摘要: string[];
}

export function buildStoryPlanningAnalysis(system?: 剧情编织系统): 剧情规划分析快照 | null {
  if (!system?.系列列表?.length) return null;
  const anchor = system.当前进度;
  const series = system.系列列表.find((item) => item.id === (anchor?.当前系列ID || system.当前系列ID))
    ?? system.系列列表.find((item) => item.激活注入 !== false)
    ?? system.系列列表[0];
  if (!series) return null;
  const current = resolveCurrentSegment(series, anchor);
  if (!current) return null;

  const gate = anchor?.最近门禁结果 ?? '未记录';
  const reasons = buildReasons(anchor, current);
  const concerns = buildConcerns(anchor, current);
  const next = resolveNextSegment(series, current);
  return {
    系列标题: series.标题,
    当前分段标题: current.标题,
    当前分段组号: current.组号,
    推进状态: anchor?.推进状态 ?? current.运行状态,
    门禁结果: gate,
    建议动作: decideAction(anchor, current),
    偏离风险: decideDeviationRisk(anchor, current),
    分析理由: reasons,
    关注事项: concerns,
    切段条件: buildSwitchConditions(current),
    待迁移事项: buildMigrationItems(anchor, current),
    下一步调度: buildNextDispatch(anchor, current, next),
    归档检查: buildArchiveChecks(anchor, current, next),
    历史摘要: [
      ...(anchor?.历史归档 ?? []).slice(-5).map((item) => `第${item.分段组号}段「${item.分段标题}」：${item.摘要 || item.归档状态}`),
      ...(anchor?.已完成摘要 ?? []).slice(-3),
    ].filter(Boolean),
  };
}

function resolveNextSegment(series: 剧情编织系列, current: 剧情编织分段): 剧情编织分段 | undefined {
  return [...series.分段列表]
    .sort((a, b) => a.组号 - b.组号)
    .find((segment) => segment.组号 > current.组号 && segment.启用注入 !== false && !['已经历', '已跳过', '已偏离', '暂停'].includes(segment.运行状态));
}

function resolveCurrentSegment(series: 剧情编织系列, anchor?: 剧情编织进度锚点): 剧情编织分段 | undefined {
  return series.分段列表.find((segment) => segment.id === anchor?.当前分段ID)
    ?? series.分段列表.find((segment) => segment.组号 === anchor?.当前分段组号)
    ?? series.分段列表.find((segment) => segment.组号 === series.当前分段组号)
    ?? series.分段列表.find((segment) => segment.运行状态 === '当前')
    ?? series.分段列表[0];
}

function decideAction(anchor: 剧情编织进度锚点 | undefined, current: 剧情编织分段): 剧情规划分析快照['建议动作'] {
  if (['已偏离', '已跳过', '暂停'].includes(current.运行状态)) return '需要人工检查';
  if (current.运行状态 === '已经历' || anchor?.推进状态 === '已完成') return '可归档或切段';
  if (anchor?.最近门禁结果 === 'strong') return '允许强承接';
  if (anchor?.最近判定理由?.some((item) => item.includes('未推进'))) return '等待正文证据';
  return '继续软参考';
}

function decideDeviationRisk(anchor: 剧情编织进度锚点 | undefined, current: 剧情编织分段): 剧情规划分析快照['偏离风险'] {
  if (current.运行状态 === '已偏离') return '高';
  if (anchor?.最近判定理由?.some((item) => item.includes('偏离') || item.includes('人工检查') || item.includes('风险'))) return '高';
  if (current.运行状态 === '已跳过' || current.运行状态 === '暂停') return '中';
  if (anchor?.最近判定理由?.some((item) => item.includes('未推进') || item.includes('缺少明确收束证据'))) return '中';
  return '低';
}

function buildReasons(anchor: 剧情编织进度锚点 | undefined, current: 剧情编织分段): string[] {
  const reasons = [
    `当前分段运行状态：${current.运行状态}`,
    anchor?.推进状态 ? `锚点推进状态：${anchor.推进状态}` : '',
    anchor?.最近门禁结果 ? `最近门禁：${anchor.最近门禁结果}` : '最近门禁未记录',
    ...(anchor?.最近判定理由 ?? []).slice(0, 5),
  ].filter(Boolean);
  return uniqueText(reasons, 8);
}

function buildConcerns(anchor: 剧情编织进度锚点 | undefined, current: 剧情编织分段): string[] {
  return uniqueText([
    ...current.给后续参考,
    ...current.关键事件.flatMap((event) => event.触发条件),
    ...(anchor?.当前待解问题 ?? []),
  ], 8);
}

function buildSwitchConditions(current: 剧情编织分段): string[] {
  return uniqueText([
    ...current.本段结束状态,
    ...current.关键事件.flatMap((event) => event.事件结果),
    current.本段结束状态.length || current.关键事件.some((event) => event.事件结果.length)
      ? ''
      : '当前分段缺少明确结束状态，自动切段应保持保守',
  ], 8);
}

function buildMigrationItems(anchor: 剧情编织进度锚点 | undefined, current: 剧情编织分段): string[] {
  return uniqueText([
    ...current.给后续参考.map((item) => `后续参考：${item}`),
    ...current.角色推进.flatMap((item) => [
      ...item.本段后状态.map((text) => `${item.角色名}状态：${text}`),
      ...item.对后续影响.map((text) => `${item.角色名}后续影响：${text}`),
    ]),
    ...(anchor?.当前待解问题 ?? []).map((item) => `锚点待解：${item}`),
  ], 10);
}

function buildNextDispatch(anchor: 剧情编织进度锚点 | undefined, current: 剧情编织分段, next?: 剧情编织分段): string[] {
  return uniqueText([
    current.运行状态 === '当前' && anchor?.最近门禁结果 === 'strong'
      ? '允许当前段强承接，但正文仍必须服从玩家事实和剧情回忆'
      : '',
    current.运行状态 === '当前' && anchor?.最近门禁结果 !== 'strong'
      ? '当前段保持软参考，等待正文证据再推进'
      : '',
    ['已经历', '已跳过', '已偏离', '暂停'].includes(current.运行状态)
      ? '当前分段已非前台状态，应检查是否需要迁移到后续段'
      : '',
    next ? `下一候选分段：第${next.组号}段「${next.标题}」` : '暂无下一候选分段',
  ], 6);
}

function buildArchiveChecks(anchor: 剧情编织进度锚点 | undefined, current: 剧情编织分段, next?: 剧情编织分段): string[] {
  const archived = anchor?.历史归档?.some((item) => item.分段ID === current.id || item.分段组号 === current.组号);
  return uniqueText([
    archived ? '当前分段已有历史归档记录' : '当前分段尚未在历史归档中出现',
    current.运行状态 === '已经历' && !archived ? '运行状态已经历但缺历史归档，建议检查归档沉淀' : '',
    ['已跳过', '已偏离', '暂停'].includes(current.运行状态) ? `当前状态为${current.运行状态}，不应自动复活为当前段` : '',
    next ? `若切段，应初始化到「${next.标题}」并保留旧段摘要` : '若已到末段，只归档不强行寻找下一段',
  ], 6);
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
