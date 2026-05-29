import type { API配置项, API设置, 游戏设置 } from '@/models/settings';
import type {
  剧情编织分段,
  剧情编织系列,
  剧情编织系统,
  剧情编织角色档案,
  剧情编织势力档案,
  剧情编织地点档案,
  剧情编织时间线事件,
} from '@/models/storyWeaving';
import { 归一化剧情编织分段 } from '@/models/storyWeaving';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { STORY_WEAVING_COT_PROMPT } from '@/prompts/cot/storyWeavingCot';
import type { FilterContext } from '@/utils/worldbook';

const 读文本 = (value: unknown): string => (typeof value === 'string' ? value : '');
const 文本数组 = (value: unknown): string[] => (
  Array.isArray(value) ? value.map((item) => 读文本(item).trim()).filter(Boolean) : []
);
const ACTIVE_RUNTIME_STATUSES = new Set<剧情编织分段['运行状态']>(['当前', '未开始']);
const ARCHIVED_RUNTIME_STATUSES = new Set<剧情编织分段['运行状态']>(['已经历', '已跳过', '已偏离', '暂停']);

export function buildStoryWeavingApiConfig(settings: 游戏设置, apiSettings: API设置): API配置项 | null {
  const mainConfig = apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? apiSettings.configs[0] ?? null;
  if (!mainConfig) return null;
  const api = settings.剧情编织系统.api;
  const baseUrl = api.baseUrl.trim() || mainConfig.baseUrl;
  const apiKey = api.apiKey.trim() || mainConfig.apiKey;
  const model = api.model.trim() || mainConfig.model;
  if (!baseUrl || !apiKey || !model) return null;
  return {
    ...mainConfig,
    provider: api.provider || mainConfig.provider,
    baseUrl,
    apiKey,
    model,
    maxTokens: api.maxTokens ?? mainConfig.maxTokens ?? 4096,
    temperature: api.temperature ?? mainConfig.temperature ?? 0.25,
    retryCount: api.retryCount ?? mainConfig.retryCount ?? 2,
  };
}

export async function decomposeStorySegment(params: {
  config: API配置项;
  series: 剧情编织系列;
  segment: 剧情编织分段;
  previousSegment?: 剧情编织分段;
  signal?: AbortSignal;
}): Promise<剧情编织分段> {
  const raw = await chatCompletionNonStream(params.config, {
    systemPrompt: buildStoryWeavingSystemPrompt(),
    messages: [{ role: 'user', content: buildStoryWeavingUserPrompt(params) }],
    maxTokens: params.config.maxTokens ?? 4096,
    temperature: params.config.temperature ?? 0.25,
    signal: params.signal,
  });
  return parseStoryWeavingResult(raw, params.segment);
}

export function buildStoryWeavingInjection(system?: 剧情编织系统, ctx?: Pick<FilterContext, 'recentUserInput' | 'recentAIResponse' | 'currentLocation'>): string {
  const resolved = resolveInjectionWindow(system);
  if (!resolved) return '';
  const { series, completed, current, archivedAnchor } = resolved;
  const progress = system?.当前进度;

  const currentIndex = completed.findIndex((segment) => segment.id === current.id);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const previous = archivedAnchor && archivedAnchor.组号 < current.组号
    ? archivedAnchor
    : [...completed]
      .reverse()
      .find((segment) => segment.组号 < current.组号 && segment.运行状态 === '已经历');
  const next = completed.find((segment) => segment.组号 > current.组号 && segment.运行状态 === '未开始');
  const indexSegments = filterMainlineIndexSegments(completed);
  const stageSummary = series.当前阶段概括 || deriveStageSummary(indexSegments);
  const coreRoles = series.核心角色.length > 0 ? series.核心角色 : deriveCoreRoles(indexSegments);
  const locationIndex = series.涉及地点索引.length > 0 ? series.涉及地点索引 : deriveLocations(indexSegments);
  const factionIndex = series.涉及派系索引.length > 0 ? series.涉及派系索引 : deriveFactions(indexSegments);
  const seriesOverview = [
    '# 系列总览',
    `系列：${series.标题}`,
    `作品：${series.作品名}`,
    `当前分段：${current.组号}/${completed[completed.length - 1]?.组号 || current.组号}`,
    progress ? `进度锚点：${progress.推进状态}，最近判定回合 ${progress.最近一次推进判定回合 ?? '未记录'}` : '',
    `启用注入：${series.激活注入 ? '是' : '否'}`,
  ].filter(Boolean).join('\n');
  const recentIndexBlock = buildRecentSegmentIndex(indexSegments, indexSegments.findIndex((segment) => segment.id === current.id));
  const gate = evaluateSegmentGate(current, ctx);
  const progressBlock = formatProgressAnchor(progress);

  const blocks = [
    '# 剧情编织滑窗',
    '',
    '以下内容来自剧情编织系统。它是“软参考素材”，不是强制复演脚本。正文必须优先承接玩家本回合输入、即时剧情回顾、剧情回忆、当前地点和已成立事实；若这些事实显示某事件已经发生或已被解决，禁止因为滑窗仍停在该段而重演同一危机、同一敌人或同一章节事件。',
    gate.mode === 'strong'
      ? `本回合门禁：已满足强承接条件（${gate.reasons.join('；')}）。可以读取当前段的目标、人物关系和未结事项，但仍不得覆盖已发生事实。`
      : `本回合门禁：未满足强承接条件（${gate.reasons.join('；') || '当前地点、玩家输入和近期上下文未明显命中当前段'}）。当前段只能作为氛围、人物关系、伏笔、未结事项和防抢跑参考，不得直接推进或复演原文段落。`,
    '“已经历”的分段只可作为既成事实简略承接，不得重新演一遍；“未开始”的下一段只能轻微铺垫，不得提前揭露角色未知信息。若玩家已经走出不同 IF 线，以已发生剧情为准；若条目标有信息可见性，必须遵守谁知道/谁不知道/读者视角边界。',
    '',
    seriesOverview,
    '',
    stageSummary ? `# 阶段索引\n${stageSummary}` : '',
    coreRoles.length ? `# 核心角色\n${coreRoles.slice(0, 8).join('、')}` : '',
    locationIndex.length ? `# 地点索引\n${locationIndex.slice(0, 8).join('、')}` : '',
    factionIndex.length ? `# 派系索引\n${factionIndex.slice(0, 8).join('、')}` : '',
    progressBlock,
    recentIndexBlock,
    archivedAnchor && archivedAnchor.id !== current.id
      ? `锚点提示：原锚点分段「${archivedAnchor.标题}」已归档，本回合不再把它作为当前段素材注入。`
      : '',
    formatWindowSegment('已经历承接', previous, 'brief'),
    formatWindowSegment(gate.mode === 'strong' ? '当前段强承接素材' : '当前段软参考素材', current, gate.mode),
    formatWindowSegment('下一段预热', next, 'brief'),
  ].filter(Boolean);
  return blocks.join('\n').trim();
}

type StoryWeavingInjectionMode = 'brief' | 'soft' | 'strong';

export interface 剧情编织门禁快照 {
  系列ID?: string;
  分段ID?: string;
  分段组号?: number;
  mode: 'soft' | 'strong';
  reasons: string[];
}

export interface 剧情编织注入诊断 {
  系列ID: string;
  系列标题: string;
  健康状态: '正常' | '已跳过归档锚点' | '需要检查';
  检查项: string[];
  当前分段ID: string;
  当前分段组号: number;
  当前分段标题: string;
  当前分段运行状态: 剧情编织分段['运行状态'];
  归档锚点分段ID?: string;
  归档锚点组号?: number;
  归档锚点标题?: string;
  前一分段标题?: string;
  下一分段标题?: string;
  可注入分段数: number;
}

export function evaluateStoryWeavingGate(
  system?: 剧情编织系统,
  ctx?: Pick<FilterContext, 'recentUserInput' | 'recentAIResponse' | 'currentLocation'>,
): 剧情编织门禁快照 | null {
  const resolved = resolveInjectionWindow(system);
  if (!resolved) return null;
  const gate = evaluateSegmentGate(resolved.current, ctx);
  return {
    系列ID: resolved.series.id,
    分段ID: resolved.current.id,
    分段组号: resolved.current.组号,
    mode: gate.mode,
    reasons: gate.reasons,
  };
}

export function getStoryWeavingInjectionDiagnostics(system?: 剧情编织系统): 剧情编织注入诊断 | null {
  const resolved = resolveInjectionWindow(system);
  if (!resolved) return null;
  const { series, completed, current, archivedAnchor } = resolved;
  const previous = archivedAnchor && archivedAnchor.组号 < current.组号
    ? archivedAnchor
    : [...completed]
      .reverse()
      .find((segment) => segment.组号 < current.组号 && segment.运行状态 === '已经历');
  const next = completed.find((segment) => segment.组号 > current.组号 && segment.运行状态 === '未开始');
  const health = evaluateInjectionHealth(current, archivedAnchor);
  return {
    系列ID: series.id,
    系列标题: series.标题,
    健康状态: health.status,
    检查项: health.items,
    当前分段ID: current.id,
    当前分段组号: current.组号,
    当前分段标题: current.标题,
    当前分段运行状态: current.运行状态,
    归档锚点分段ID: archivedAnchor?.id,
    归档锚点组号: archivedAnchor?.组号,
    归档锚点标题: archivedAnchor?.标题,
    前一分段标题: previous?.标题,
    下一分段标题: next?.标题,
    可注入分段数: completed.length,
  };
}

function evaluateInjectionHealth(
  current: 剧情编织分段,
  archivedAnchor?: 剧情编织分段,
): { status: 剧情编织注入诊断['健康状态']; items: string[] } {
  const items: string[] = [];
  if (ARCHIVED_RUNTIME_STATUSES.has(current.运行状态)) {
    items.push(`风险：实际注入段仍是归档状态「${current.运行状态}」，需要人工检查。`);
    return { status: '需要检查', items };
  }
  if (archivedAnchor && archivedAnchor.id === current.id) {
    items.push('风险：归档锚点没有被跳过，可能导致旧段复演。');
    return { status: '需要检查', items };
  }
  if (archivedAnchor) {
    items.push(`已跳过归档锚点「${archivedAnchor.标题}」，旧段不会作为当前素材注入。`);
    items.push(`实际注入段为「${current.标题}」。`);
    return { status: '已跳过归档锚点', items };
  }
  items.push(`实际注入段为「${current.标题}」，运行状态「${current.运行状态}」。`);
  return { status: '正常', items };
}

function resolveInjectionWindow(system?: 剧情编织系统): {
  series: 剧情编织系列;
  completed: 剧情编织分段[];
  current: 剧情编织分段;
  archivedAnchor?: 剧情编织分段;
} | null {
  const sourceSystem = system;
  if (!sourceSystem?.系列列表?.length) return null;
  const series = sourceSystem.系列列表.find((item) => item.id === sourceSystem.当前系列ID) ?? sourceSystem.系列列表[0];
  if (!series || series.激活注入 === false) return null;
  const completed = series.分段列表
    .filter((segment) => segment.启用注入 !== false && segment.处理状态 === '已完成')
    .sort((a, b) => a.组号 - b.组号);
  if (!completed.length) return null;

  const anchored = completed.find((segment) => segment.id === sourceSystem.当前进度?.当前分段ID)
    ?? completed.find((segment) => segment.组号 === sourceSystem.当前进度?.当前分段组号);
  const archivedAnchor = anchored && ARCHIVED_RUNTIME_STATUSES.has(anchored.运行状态) ? anchored : undefined;
  const current = (anchored && ACTIVE_RUNTIME_STATUSES.has(anchored.运行状态) ? anchored : undefined)
    ?? completed.find((segment) => segment.运行状态 === '当前')
    ?? completed.find((segment) => segment.组号 > (archivedAnchor?.组号 ?? 0) && segment.运行状态 === '未开始')
    ?? completed.find((segment) => segment.组号 === series.当前分段组号 && !ARCHIVED_RUNTIME_STATUSES.has(segment.运行状态));
  return current ? { series, completed, current, archivedAnchor } : null;
}

function formatProgressAnchor(anchor: 剧情编织系统['当前进度']): string {
  if (!anchor) return '';
  const lines = [
    '# 当前章节进度锚点',
    `推进状态：${anchor.推进状态}`,
    `当前分段组号：${anchor.当前分段组号}`,
  ];
  appendList(lines, '已完成摘要', anchor.已完成摘要, 6);
  appendList(lines, '当前待解问题', anchor.当前待解问题, 6);
  appendList(lines, '最近判定理由', anchor.最近判定理由, 5);
  return lines.join('\n');
}

function formatWindowSegment(title: string, segment?: 剧情编织分段, mode: StoryWeavingInjectionMode = 'brief'): string {
  if (!segment) return '';
  const lines: string[] = [`【${title}】`, `组号：${segment.组号}`, `运行状态：${segment.运行状态}`, `章节范围：${segment.章节范围 || segment.标题}`];
  if (segment.章节标题.length) lines.push(`章节标题：${segment.章节标题.join(' / ')}`);
  if (mode === 'strong' && segment.原文摘要) lines.push(`原文摘要：${segment.原文摘要}`);
  if (segment.本段概括) lines.push(`${mode === 'strong' ? '概括' : '素材概括'}：${segment.本段概括}`);
  if (segment.时间线起点 || segment.时间线终点) lines.push(`时间线：${segment.时间线起点 || '未知'} -> ${segment.时间线终点 || '未知'}`);
  if (mode === 'strong') {
    appendList(lines, '开局已成立事实', segment.开局已成立事实, 6);
    appendList(lines, '前段延续事实', segment.前段延续事实, 8);
    appendList(lines, '本段结束状态', segment.本段结束状态, 8);
    appendList(lines, '给后续参考', segment.给后续参考, 8);
    appendVisibleList(lines, '原著硬约束', segment.原著硬约束, 5);
    appendVisibleList(lines, '可提前铺垫', segment.可提前铺垫, 5);
    appendList(lines, '登场角色', segment.登场角色, 10);
    appendList(lines, '涉及地点', segment.涉及地点, 8);
    if (segment.角色档案.length) {
      lines.push(`角色档案：${segment.角色档案.slice(0, 5).map(formatRoleArchive).join('；')}`);
    }
    if (segment.势力档案.length) {
      lines.push(`势力档案：${segment.势力档案.slice(0, 4).map(formatFactionArchive).join('；')}`);
    }
    if (segment.地图地点档案.length) {
      lines.push(`地点档案：${segment.地图地点档案.slice(0, 5).map(formatLocationArchive).join('；')}`);
    }
    if (segment.关键事件.length) {
      lines.push('关键事件：');
      segment.关键事件.slice(0, 5).forEach((event, index) => {
        lines.push(`[${index + 1}] ${event.事件名 || '未命名事件'}：${event.事件说明 || '无说明'}`);
        appendList(lines, '触发条件', event.触发条件, 3);
        appendList(lines, '阻断条件', event.阻断条件, 3);
        appendList(lines, '事件结果', event.事件结果, 3);
        lines.push(formatVisibility(event.信息可见性));
      });
    }
    if (segment.时间线.length) {
      lines.push('事件时间线：');
      segment.时间线.slice(0, 6).forEach((event, index) => {
        lines.push(`[${index + 1}] ${event.标题 || '未命名事件'}｜${event.时间锚点 || '未知时间'}`);
        if (event.描述) lines.push(`描述：${event.描述}`);
        appendList(lines, '涉及角色', event.涉及角色, 6);
      });
    }
    if (segment.角色推进.length) {
      lines.push('角色推进：');
      segment.角色推进.slice(0, 6).forEach((item, index) => {
        lines.push(`[${index + 1}] ${item.角色名}：${[...item.本段变化, ...item.本段后状态].slice(0, 4).join('；') || '无'}`);
      });
    }
  } else if (mode === 'soft') {
    appendList(lines, '可作为既有关系/气氛参考', [...segment.开局已成立事实, ...segment.前段延续事实], 5);
    appendList(lines, '未结事项/后续参考', segment.给后续参考, 5);
    appendVisibleList(lines, '防抢跑硬约束', segment.原著硬约束, 3);
    appendVisibleList(lines, '可轻微铺垫', segment.可提前铺垫, 3);
    appendList(lines, '可能相关角色', segment.登场角色, 8);
    appendList(lines, '可能相关地点', segment.涉及地点, 6);
    if (segment.关键事件.length) {
      lines.push('关键事件门禁：');
      segment.关键事件.slice(0, 4).forEach((event, index) => {
        lines.push(`[${index + 1}] ${event.事件名 || '未命名事件'}`);
        appendList(lines, '触发条件', event.触发条件, 3);
        appendList(lines, '阻断条件', event.阻断条件, 3);
        appendList(lines, '事件结果只可作为防重复参考', event.事件结果, 3);
      });
    }
  } else {
    appendList(lines, '结束状态', segment.本段结束状态, 4);
    appendList(lines, '前段延续事实', segment.前段延续事实, 4);
    appendVisibleList(lines, '硬约束', segment.原著硬约束, 3);
  }
  return lines.join('\n');
}

function evaluateSegmentGate(
  segment: 剧情编织分段,
  ctx?: Pick<FilterContext, 'recentUserInput' | 'recentAIResponse' | 'currentLocation'>,
): { mode: 'soft' | 'strong'; reasons: string[] } {
  const source = normalizeForGate([
    ctx?.recentUserInput ?? '',
    ctx?.recentAIResponse ?? '',
    ctx?.currentLocation ?? '',
  ].join('\n'));
  const reasons: string[] = [];
  if (!source) return { mode: 'soft', reasons: ['缺少当前输入、地点或近期正文作为门禁证据'] };

  const locationHits = segment.涉及地点
    .filter((item) => item.trim().length >= 2 && source.includes(normalizeForGate(item)));
  if (locationHits.length) reasons.push(`地点命中：${locationHits.slice(0, 3).join('、')}`);

  const roleHits = segment.登场角色
    .filter((item) => item.trim().length >= 2 && source.includes(normalizeForGate(item)));
  if (roleHits.length) reasons.push(`人物命中：${roleHits.slice(0, 4).join('、')}`);

  const triggerTerms = [
    ...segment.关键事件.flatMap((event) => [event.事件名, ...event.触发条件]),
    ...segment.给后续参考,
  ];
  const triggerHits = triggerTerms
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && splitGateTerms(item).filter((term) => source.includes(term)).length >= 2);
  if (triggerHits.length) reasons.push(`任务/事件条件命中 ${triggerHits.length} 项`);

  const input = normalizeForGate(ctx?.recentUserInput ?? '');
  const actionWords = ['前往', '进入', '寻找', '追问', '调查', '启动', '汇报', '战斗', '迎击', '救援', '继续', '抵达', '登上', '打开', '检查'];
  if (input && actionWords.some((word) => input.includes(word))) {
    const localHits = [...locationHits, ...roleHits].length + triggerHits.length;
    if (localHits > 0) reasons.push('玩家行动正在触碰当前段入口');
  }

  const strong = locationHits.length > 0 && (roleHits.length > 0 || triggerHits.length > 0 || reasons.includes('玩家行动正在触碰当前段入口'));
  return { mode: strong ? 'strong' : 'soft', reasons };
}

function normalizeForGate(text: string): string {
  return text.replace(/\s+/g, '').trim();
}

function filterMainlineIndexSegments(segments: 剧情编织分段[]): 剧情编织分段[] {
  const mainline = segments.filter((segment) => !['已跳过', '已偏离', '暂停'].includes(segment.运行状态));
  return mainline.length ? mainline : segments;
}

function splitGateTerms(text: string): string[] {
  return Array.from(new Set(
    normalizeForGate(text)
      .split(/[，。；、：:,.!?！？「」『』（）()[\]【】\-—]/g)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2),
  )).slice(0, 8);
}

function deriveStageSummary(segments: 剧情编织分段[]): string {
  const mainlineSegments = segments.filter((segment) => !['已跳过', '已偏离', '暂停'].includes(segment.运行状态));
  const source = mainlineSegments.length ? mainlineSegments : segments;
  return source.slice(-3).map((segment) => {
    const title = segment.标题 || `分段 ${segment.组号}`;
    const summary = segment.本段概括 || segment.原文摘要 || title;
    return `【${title}】${summary}`;
  }).filter(Boolean).join('\n');
}

function deriveCoreRoles(segments: 剧情编织分段[]): string[] {
  const counter = new Map<string, number>();
  segments.forEach((segment) => {
    [...segment.登场角色, ...segment.角色档案.map((item) => item.名称)].filter(Boolean).forEach((name) => {
      counter.set(name, (counter.get(name) || 0) + 1);
    });
  });
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, 8)
    .map(([name]) => name);
}

function deriveLocations(segments: 剧情编织分段[]): string[] {
  const counter = new Map<string, number>();
  segments.forEach((segment) => {
    [...segment.涉及地点, ...segment.地图地点档案.map((item) => item.名称)].filter(Boolean).forEach((name) => {
      counter.set(name, (counter.get(name) || 0) + 1);
    });
  });
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, 8)
    .map(([name]) => name);
}

function deriveFactions(segments: 剧情编织分段[]): string[] {
  const counter = new Map<string, number>();
  segments.forEach((segment) => {
    [...segment.涉及派系, ...segment.势力档案.map((item) => item.名称)].filter(Boolean).forEach((name) => {
      counter.set(name, (counter.get(name) || 0) + 1);
    });
  });
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, 8)
    .map(([name]) => name);
}

function buildRecentSegmentIndex(segments: 剧情编织分段[], currentIndex: number): string {
  const start = Math.max(0, currentIndex - 3);
  const window = segments.slice(start, currentIndex + 1);
  if (!window.length) return '';
  return [
    '# 最近已完成分段索引',
    ...window.map((segment, index) => {
      const label = segment.标题 || `分段 ${start + index + 1}`;
      const summary = segment.本段概括 || segment.原文摘要 || segment.章节标题.join(' / ') || '无概括';
      const timeline = segment.时间线起点 || segment.时间线终点 ? `｜${segment.时间线起点 || '未知'} -> ${segment.时间线终点 || '未知'}` : '';
      return `- ${label}${timeline}\n  ${summary}`;
    }),
  ].join('\n');
}

function formatRoleArchive(item: 剧情编织角色档案): string {
  return [item.名称, item.身份, item.所属势力, item.初始立场].filter(Boolean).join('｜');
}

function formatFactionArchive(item: 剧情编织势力档案): string {
  return [item.名称, item.类型, item.地盘, item.立场目标].filter(Boolean).join('｜');
}

function formatLocationArchive(item: 剧情编织地点档案): string {
  return [item.名称, item.层级, item.上级地点, item.所属势力].filter(Boolean).join('｜');
}

function appendList(lines: string[], title: string, values: string[], limit: number): void {
  const list = values.slice(0, limit).filter(Boolean);
  if (!list.length) return;
  lines.push(`${title}：${list.join('；')}`);
}

function appendVisibleList(lines: string[], title: string, values: 剧情编织分段['原著硬约束'], limit: number): void {
  const list = values.slice(0, limit).filter((item) => item.内容);
  if (!list.length) return;
  lines.push(`${title}：`);
  list.forEach((item, index) => {
    lines.push(`[${index + 1}] ${item.内容}`);
    lines.push(formatVisibility(item.信息可见性));
  });
}

function formatVisibility(value: { 谁知道: string[]; 谁不知道: string[]; 是否仅读者视角可见: boolean }): string {
  const parts = [];
  if (value.谁知道?.length) parts.push(`谁知道:${value.谁知道.join('、')}`);
  if (value.谁不知道?.length) parts.push(`谁不知道:${value.谁不知道.join('、')}`);
  if (value.是否仅读者视角可见) parts.push('仅读者视角');
  return parts.length ? `可见性：${parts.join('｜')}` : '可见性：公开或未限定';
}

function buildStoryWeavingSystemPrompt(): string {
  return [
    '你是「剧情编织官」，负责把玩家导入的小说化剧情拆解成可供叙事游戏运行时注入的结构化剧情资产。',
    '你不是续写模型，不写点评，不自由补设定。你只在输入原文边界内提炼：当前段发生了什么、后续必须承接什么、哪些原著/玩家文本边界不能越过、哪些内容可以提前铺垫。',
    '',
    '剧情编织思维链（内部执行，不要输出）：',
    STORY_WEAVING_COT_PROMPT,
    '',
    '特别要求：',
    '- 保持星穹铁道同人项目可用的表达，不要套武侠术语。',
    '- 重点服务主剧情承接、星际和平周报预热、智库/角色资料联动。',
    '- 必须严格处理信息可见性，读者知道不等于角色知道。',
    '- 输出必须包含：本段概括、原文摘要、开局已成立事实、前段延续事实、本段结束状态、给后续参考、原著硬约束、可提前铺垫、登场角色、角色档案、势力档案、地图地点档案、时间线起点、时间线终点、关键事件、角色推进。',
    '- 本段结束状态必须写成可判定的完成条件或阶段落点，不能写氛围句、悬念句、预告句、单纯危机描写，也不能直接复制原文摘要/本段概括。',
    '- 关键事件.事件结果必须写事件完成后的结果，例如“警报来源已确认”“敌人已被击退”“玩家已登上列车”“某人已加入/离队/撤离”；不能把本段摘要原样塞进去。',
    '- 错误示例：走廊深处传来轰鸣、警报声撕裂耳膜、某种阴影正在逼近。正确示例：玩家已抵达轰鸣源头、警报来源已确认、空间站危机进入下一阶段。',
    '- 章节标题要分段概括，不要把多章压成一坨摘要。',
    '- 所有结构字段尽量短、准、可复用，尤其是角色 / 地点 / 势力档案要能直接供后续系统拿去引用。',
    '- 不要把目录、章节索引、标题列表误判成正文；若原文出现目录式堆叠，优先过滤。',
    '- 先抽章节转折，再抽时间线，再抽档案。不要只做一段总摘要。',
    '- 不输出思维链、不输出解释，只输出 JSON。',
    '',
    '输出 JSON 对象，字段固定：',
    '{',
    '  "本段概括": "按章节顺序写 3-8 句概括",',
    '  "开局已成立事实": ["..."],',
    '  "前段延续事实": ["..."],',
    '  "本段结束状态": ["可被后台推进判断验证的完成条件，不要写氛围句或摘要复读"],',
    '  "给后续参考": ["..."],',
    '  "原文摘要": "可选，1-2 句压缩版，强调本组真实发生内容，不要复述标题",',
    '  "原著硬约束": [{"内容":"...","信息可见性":{"谁知道":[],"谁不知道":[],"是否仅读者视角可见":false}}],',
    '  "可提前铺垫": [{"内容":"...","信息可见性":{"谁知道":[],"谁不知道":[],"是否仅读者视角可见":false}}],',
    '  "登场角色": ["..."],',
    '  "角色档案": [{"名称":"...","身份":"...","所属势力":"...","初始立场":"...","关系摘要":[],"状态摘要":[],"首次出现":"...","重要性":"一般"}],',
    '  "势力档案": [{"名称":"...","类型":"...","地盘":"...","代表人物":[],"立场目标":"...","当前状态":"...","关系摘要":[],"首次出现":"..."}],',
    '  "地图地点档案": [{"名称":"...","层级":"区地点","上级地点":"...","所属势力":"...","地貌功能":"...","关键设施":[],"首次出现":"..."}],',
    '  "时间线起点": "YYYY:MM:DD:HH:MM",',
    '  "时间线终点": "YYYY:MM:DD:HH:MM",',
    '  "涉及地点": ["..."],',
    '  "涉及派系": ["..."],',
    '  "时间线": [{"标题":"...","时间锚点":"YYYY:MM:DD:HH:MM","描述":"...","涉及角色":[]}],',
    '  "关键事件": [{"事件名":"...","事件说明":"...","前置条件":[],"触发条件":[],"阻断条件":[],"事件结果":["事件完成后的结果，不要复制本段摘要"],"对后续影响":[],"信息可见性":{"谁知道":[],"谁不知道":[],"是否仅读者视角可见":false}}],',
    '  "角色推进": [{"角色名":"...","本段前状态":[],"本段变化":[],"本段后状态":[],"对后续影响":[]}]',
    '}',
  ].join('\n');
}

function buildStoryWeavingUserPrompt(params: {
  series: 剧情编织系列;
  segment: 剧情编织分段;
  previousSegment?: 剧情编织分段;
}): string {
  const { series, segment, previousSegment } = params;
  return [
    `作品/系列：${series.标题}`,
    `当前组号：${segment.组号}`,
    `章节范围：${segment.章节范围}`,
    `章节标题：${segment.章节标题.join(' / ') || '无'}`,
    `是否开局组：${segment.是否开局组 ? '是' : '否'}`,
    segment.原文摘要 ? `原文摘要：${segment.原文摘要}` : '',
    '',
    '【前一段参考】',
    previousSegment
      ? [
          `前一段：${previousSegment.标题}`,
          previousSegment.原文摘要 ? `原文摘要：${previousSegment.原文摘要}` : '',
          previousSegment.本段概括 ? `概括：${previousSegment.本段概括}` : '',
          previousSegment.时间线终点 ? `结束时间：${previousSegment.时间线终点}` : '',
          previousSegment.本段结束状态.length ? `结束状态：${previousSegment.本段结束状态.join('；')}` : '',
          previousSegment.给后续参考.length ? `给后续参考：${previousSegment.给后续参考.join('；')}` : '',
        ].filter(Boolean).join('\n')
      : '无；当前段可按开局段处理。',
    '',
    '【当前段原文】',
    segment.原文内容,
    '',
    '【本段需额外注意】',
    '- 先识别章节标题，再按章节顺序概括，不要漏掉本组内部多个章节的转折。',
    '- 如果能确认角色、势力、地点，就把它们抽成独立档案，不要只写进概括里。',
    '- 关键事件要写清时间锚点与可见性边界。读者视角可见不等于角色已知。',
    '- 原文摘要要压到 1-2 句，不是把正文摘一段直接塞回去。',
  ].join('\n');
}

function parseStoryWeavingResult(raw: string, base: 剧情编织分段): 剧情编织分段 {
  const candidate = extractJson(raw);
  const parsed = JSON.parse(candidate) as Record<string, unknown>;
  return 归一化剧情编织分段({
    ...base,
    本段概括: 读文本(parsed.本段概括).trim(),
    原文摘要: 读文本(parsed.原文摘要).trim(),
    开局已成立事实: 文本数组(parsed.开局已成立事实),
    前段延续事实: 文本数组(parsed.前段延续事实),
    本段结束状态: 文本数组(parsed.本段结束状态),
    给后续参考: 文本数组(parsed.给后续参考),
    原著硬约束: Array.isArray(parsed.原著硬约束) ? parsed.原著硬约束 as never : [],
    可提前铺垫: Array.isArray(parsed.可提前铺垫) ? parsed.可提前铺垫 as never : [],
    登场角色: 文本数组(parsed.登场角色),
    角色档案: Array.isArray(parsed.角色档案) ? parsed.角色档案 as never : [],
    势力档案: Array.isArray(parsed.势力档案) ? parsed.势力档案 as never : [],
    地图地点档案: Array.isArray(parsed.地图地点档案) ? parsed.地图地点档案 as never : [],
    时间线起点: 读文本(parsed.时间线起点).trim(),
    时间线终点: 读文本(parsed.时间线终点).trim(),
    涉及地点: 文本数组(parsed.涉及地点),
    涉及派系: 文本数组(parsed.涉及派系),
    时间线: Array.isArray(parsed.时间线) ? parsed.时间线 as never : [],
    关键事件: Array.isArray(parsed.关键事件) ? parsed.关键事件 as never : [],
    角色推进: Array.isArray(parsed.角色推进) ? parsed.角色推进 as never : [],
    处理状态: '已完成',
    最近错误: '',
    updatedAt: Date.now(),
  }, base.组号);
}

function extractJson(raw: string): string {
  const source = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('剧情编织模型未返回 JSON 对象。');
  return source.slice(start, end + 1);
}
