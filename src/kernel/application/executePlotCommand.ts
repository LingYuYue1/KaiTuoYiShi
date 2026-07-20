import type { ExecutionFrame, PlotCommandEnvelope, StorySegmentDraftInput } from '@/src/kernel/contract';
import type { ContentResolver, ExecutionContextProvider, SessionRepository, StoryWeavingProcessor } from '@/src/kernel/ports';
import { resolveCommandSettings } from './turn/turnExecutionState';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import type { 剧情编织分段, 剧情编织进度锚点, 剧情编织系列, 剧情编织系统 } from '@/models/storyWeaving';
import {
  创建剧情编织系列FromText,
  归一化剧情编织系统,
  重建剧情编织系列FromText,
} from '@/models/storyWeaving';
import { mergeBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import { executeSessionCommand, type StateReduction } from './executeSessionCommand';

type Dependencies = Readonly<{
  sessions: SessionRepository;
  content: ContentResolver;
  context: ExecutionContextProvider;
  processor: StoryWeavingProcessor;
  signal: AbortSignal;
}>;

export async function* executePlotCommand(
  envelope: PlotCommandEnvelope,
  dependencies: Dependencies,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, dependencies.sessions, (base) => reducePlotCommand(envelope, base, dependencies));
}

async function reducePlotCommand(
  envelope: PlotCommandEnvelope,
  base: SessionSnapshot,
  dependencies: Dependencies,
): Promise<StateReduction> {
  const system = 归一化剧情编织系统(base.state.story.plot.weaving);
  const command = envelope.command;
  switch (command.type) {
    case 'plot.import-text': return replaceSystem(base, importText(system, command));
    case 'plot.import-json': return replaceSystem(base, importJson(system, command.json));
    case 'plot.restore-bundled': return replaceSystem(base, await restoreBundled(system, dependencies.content));
    case 'plot.rename-series': return replaceSystem(base, renameSeries(system, command.seriesId, command.title, command.updatedAt));
    case 'plot.rebuild-series': return replaceSystem(base, rebuildSeries(system, command.seriesId, command.chaptersPerSegment));
    case 'plot.toggle-series-injection': return replaceSystem(base, toggleSeries(system, command.seriesId, command.updatedAt));
    case 'plot.set-current': return replaceSystem(base, setCurrent(system, command.seriesId, command.group, command.updatedAt));
    case 'plot.set-segment-status': return replaceSystem(base, setStatus(system, command.seriesId, command.segmentId, command.status, command.updatedAt));
    case 'plot.save-segment': return replaceSystem(base, saveSegment(system, command.seriesId, command.segmentId, command.draft, command.updatedAt));
    case 'plot.delete-series': return replaceSystem(base, deleteSeries(system, command.seriesId));
    case 'plot.decompose': return replaceSystem(base, await decomposeOne(system, command.seriesId, command.segmentId, base.state.story, dependencies));
    case 'plot.decompose-batch': return replaceSystem(base, await decomposeBatch(system, command.seriesId, command.mode, base.state.story, dependencies));
  }
}

function importText(system: 剧情编织系统, command: Extract<PlotCommandEnvelope['command'], { type: 'plot.import-text' }>): 剧情编织系统 {
  if (!command.text.trim()) throw new Error('没有可导入的剧情文本');
  const series = 创建剧情编织系列FromText({
    title: command.title,
    fileName: command.fileName,
    text: command.text,
    chaptersPerSegment: command.chaptersPerSegment,
  });
  return {
    系列列表: [...system.系列列表, series],
    当前系列ID: series.id,
    当前进度: buildSeriesProgressAnchor(system.当前进度, series, `导入剧情系列：${series.标题}`),
  };
}

function importJson(current: 剧情编织系统, json: string): 剧情编织系统 {
  const parsed = JSON.parse(json) as 剧情编织系统 | 剧情编织系列;
  const imported = '系列列表' in parsed
    ? 归一化剧情编织系统(parsed)
    : 归一化剧情编织系统({ 系列列表: [parsed], 当前系列ID: parsed.id });
  const customOnly = imported.系列列表.length > 0 && imported.系列列表.every((series) => series.来源类型 !== 'canon');
  if (!customOnly) return imported;
  return 归一化剧情编织系统({
    ...current,
    系列列表: [
      ...current.系列列表.filter((series) => !imported.系列列表.some((incoming) => incoming.id === series.id)),
      ...imported.系列列表,
    ],
    当前系列ID: imported.当前系列ID ?? imported.系列列表[0]?.id ?? current.当前系列ID,
    当前进度: imported.当前进度 ?? current.当前进度,
  });
}

async function restoreBundled(system: 剧情编织系统, content: ContentResolver): Promise<剧情编织系统> {
  const bundled = await content.loadBundledStoryWeaving();
  const merged = mergeBundledStoryWeavingPresets(system, bundled);
  const current = merged.系列列表.find((series) => series.id === merged.当前系列ID) ?? merged.系列列表[0];
  return {
    ...merged,
    当前系列ID: current?.id,
    当前进度: buildSeriesProgressAnchor(merged.当前进度, current, '恢复内置原著剧情后同步当前锚点'),
  };
}

function renameSeries(system: 剧情编织系统, seriesId: string, title: string, now: number): 剧情编织系统 {
  if (!title.trim()) throw new Error('剧情系列名称不能为空');
  return mapSeries(system, seriesId, (series) => ({ ...series, 标题: title.trim(), 作品名: title.trim(), updatedAt: now }));
}

function rebuildSeries(system: 剧情编织系统, seriesId: string, size: number): 剧情编织系统 {
  return mapSeries(system, seriesId, (series) => {
    if (series.来源类型 === 'canon') throw new Error('内置原著剧情轨道不能重建分段');
    return 重建剧情编织系列FromText(series, Math.max(1, Math.trunc(size || 1)));
  });
}

function toggleSeries(system: 剧情编织系统, seriesId: string, now: number): 剧情编织系统 {
  return mapSeries(system, seriesId, (series) => ({ ...series, 激活注入: !series.激活注入, updatedAt: now }));
}

function setCurrent(system: 剧情编织系统, seriesId: string, group: number, now: number): 剧情编织系统 {
  const series = requireSeries(system, seriesId);
  const target = series.分段列表.find((segment) => segment.组号 === group);
  if (!target) throw new Error('剧情分段不存在');
  const nextSeries = {
    ...series,
    当前分段组号: group,
    分段列表: series.分段列表.map((segment) => ({
      ...segment,
      运行状态: segment.组号 === group ? '当前' as const : segment.运行状态 === '当前' ? '未开始' as const : segment.运行状态,
      updatedAt: segment.组号 === group || segment.运行状态 === '当前' ? now : segment.updatedAt,
    })),
    updatedAt: now,
  };
  return {
    ...system,
    当前系列ID: seriesId,
    系列列表: system.系列列表.map((candidate) => candidate.id === seriesId ? nextSeries : candidate),
    当前进度: buildManualProgressAnchor(system.当前进度, nextSeries, { ...target, 运行状态: '当前', updatedAt: now }, `手动设为当前：${target.标题}`),
  };
}

function setStatus(
  system: 剧情编织系统,
  seriesId: string,
  segmentId: string,
  status: 剧情编织分段['运行状态'],
  now: number,
): 剧情编织系统 {
  const series = requireSeries(system, seriesId);
  const segment = requireSegment(series, segmentId);
  if (status === '当前') return setCurrent(system, seriesId, segment.组号, now);
  const nextSeries = {
    ...series,
    分段列表: series.分段列表.map((candidate) => candidate.id === segmentId ? { ...candidate, 运行状态: status, updatedAt: now } : candidate),
    updatedAt: now,
  };
  return {
    ...system,
    系列列表: system.系列列表.map((candidate) => candidate.id === seriesId ? nextSeries : candidate),
    当前进度: system.当前进度?.当前分段ID === segmentId
      ? buildManualProgressAnchor(system.当前进度, nextSeries, { ...segment, 运行状态: status, updatedAt: now }, `手动标记为${status}：${segment.标题}`)
      : system.当前进度,
  };
}

function saveSegment(system: 剧情编织系统, seriesId: string, segmentId: string, draft: StorySegmentDraftInput, now: number): 剧情编织系统 {
  return mapSeries(system, seriesId, (series) => ({
    ...series,
    分段列表: series.分段列表.map((segment) => segment.id === segmentId ? {
      ...segment,
      标题: draft.title.trim() || segment.标题,
      章节范围: draft.chapterRange.trim() || segment.章节范围,
      启用注入: draft.injectionEnabled,
      本段概括: draft.summary.trim(),
      前段延续事实: [...draft.priorFacts],
      本段结束状态: [...draft.endingState],
      给后续参考: [...draft.futureReferences],
      登场角色: [...draft.characters],
      涉及地点: [...draft.locations],
      涉及派系: [...draft.factions],
      updatedAt: now,
    } : segment),
    updatedAt: now,
  }));
}

function deleteSeries(system: 剧情编织系统, seriesId: string): 剧情编织系统 {
  const target = requireSeries(system, seriesId);
  if (target.来源类型 === 'canon') throw new Error('内置原著剧情轨道不能删除');
  const rest = system.系列列表.filter((series) => series.id !== seriesId);
  return {
    系列列表: rest,
    当前系列ID: rest[0]?.id,
    当前进度: buildSeriesProgressAnchor(system.当前进度, rest[0], '删除剧情系列后同步当前锚点'),
  };
}

async function decomposeOne(system: 剧情编织系统, seriesId: string, segmentId: string, story: SessionSnapshot['state']['story'], dependencies: Dependencies): Promise<剧情编织系统> {
  const series = requireSeries(system, seriesId);
  const segment = requireSegment(series, segmentId);
  const overlay = await dependencies.context.captureDeviceOverlay();
  const settings = resolveCommandSettings(story, overlay);
  throwIfAborted(dependencies.signal);
  const parsed = await dependencies.processor.decompose({
    settings,
    series,
    segment,
    previousSegment: previousCompleted(series, segment),
    signal: dependencies.signal,
  });
  throwIfAborted(dependencies.signal);
  return mapSeries(system, seriesId, (current) => ({
    ...current,
    分段列表: current.分段列表.map((candidate) => candidate.id === segmentId ? parsed : candidate),
    updatedAt: parsed.updatedAt,
  }));
}

async function decomposeBatch(system: 剧情编织系统, seriesId: string, mode: 'pending' | 'from-current' | 'all', story: SessionSnapshot['state']['story'], dependencies: Dependencies): Promise<剧情编织系统> {
  let series = requireSeries(system, seriesId);
  const targets = series.分段列表.filter((segment) => mode === 'pending'
    ? segment.处理状态 !== '已完成'
    : mode === 'from-current' ? segment.组号 >= series.当前分段组号 : true);
  if (targets.length === 0) throw new Error('没有需要分解的分段');
  const overlay = await dependencies.context.captureDeviceOverlay();
  const settings = resolveCommandSettings(story, overlay);
  for (const target of targets) {
    throwIfAborted(dependencies.signal);
    const current = requireSegment(series, target.id);
    const parsed = await dependencies.processor.decompose({
      settings,
      series,
      segment: current,
      previousSegment: previousCompleted(series, current),
      signal: dependencies.signal,
    });
    series = { ...series, 分段列表: series.分段列表.map((candidate) => candidate.id === current.id ? parsed : candidate), updatedAt: parsed.updatedAt };
  }
  return { ...system, 当前系列ID: seriesId, 系列列表: system.系列列表.map((candidate) => candidate.id === seriesId ? series : candidate) };
}

function mapSeries(system: 剧情编织系统, seriesId: string, update: (series: 剧情编织系列) => 剧情编织系列): 剧情编织系统 {
  const next = update(requireSeries(system, seriesId));
  return { ...system, 当前系列ID: next.id, 系列列表: system.系列列表.map((series) => series.id === seriesId ? next : series) };
}

function requireSeries(system: 剧情编织系统, seriesId: string): 剧情编织系列 {
  const series = system.系列列表.find((candidate) => candidate.id === seriesId);
  if (!series) throw new Error('剧情系列不存在');
  return series;
}

function requireSegment(series: 剧情编织系列, segmentId: string): 剧情编织分段 {
  const segment = series.分段列表.find((candidate) => candidate.id === segmentId);
  if (!segment) throw new Error('剧情分段不存在');
  return segment;
}

function previousCompleted(series: 剧情编织系列, segment: 剧情编织分段) {
  return series.分段列表.filter((item) => item.组号 < segment.组号 && item.处理状态 === '已完成').sort((a, b) => b.组号 - a.组号)[0];
}

function replaceSystem(base: SessionSnapshot, system: 剧情编织系统): StateReduction {
  return {
    type: 'next',
    state: { story: { ...base.state.story, plot: { ...base.state.story.plot, weaving: 归一化剧情编织系统(system) } } },
  };
}

function buildSeriesProgressAnchor(previous: 剧情编织进度锚点 | undefined, series: 剧情编织系列 | undefined, note: string) {
  const segment = series?.分段列表.find((item) => item.组号 === series.当前分段组号 && item.运行状态 === '当前')
    ?? series?.分段列表.find((item) => item.组号 === series.当前分段组号)
    ?? series?.分段列表.find((item) => item.运行状态 === '当前')
    ?? series?.分段列表[0];
  return series && segment ? buildManualProgressAnchor(previous, series, segment, note) : undefined;
}

function buildManualProgressAnchor(previous: 剧情编织进度锚点 | undefined, series: 剧情编织系列, segment: 剧情编织分段, note: string): 剧情编织进度锚点 {
  return {
    当前系列ID: series.id,
    当前分段ID: segment.id,
    当前分段组号: segment.组号,
    推进状态: segment.运行状态 === '已经历' ? '已完成' : segment.运行状态 === '已偏离' ? '已偏离' : segment.运行状态 === '暂停' ? '暂停' : segment.运行状态 === '未开始' ? '未开始' : '推进中',
    已完成摘要: previous?.已完成摘要 ?? [],
    当前待解问题: unique([...segment.给后续参考, ...segment.关键事件.flatMap((event) => event.触发条件)], 10),
    切换说明: unique([...(previous?.切换说明 ?? []), note], 10),
    历史归档: previous?.历史归档 ?? [],
    最近门禁结果: previous?.最近门禁结果,
    最近判定理由: ['手动修正剧情编织进度'],
    最近一次推进判定回合: previous?.最近一次推进判定回合,
    updatedAt: Date.now(),
  };
}

function unique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => value && !seen.has(value.replace(/\s+/g, '')) && seen.add(value.replace(/\s+/g, ''))).slice(0, limit);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Plot command aborted', 'AbortError');
}
