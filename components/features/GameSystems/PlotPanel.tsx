import { useMemo, useRef, useState } from 'react';
import type { API设置, 游戏设置 } from '@/models/settings';
import type { 剧情编织分段, 剧情编织系列, 剧情编织系统, 剧情编织运行状态 } from '@/models/storyWeaving';
import {
  创建剧情编织系列FromText,
  归一化剧情编织系统,
  重建剧情编织系列FromText,
} from '@/models/storyWeaving';
import { buildStoryWeavingApiConfig, decomposeStorySegment, getStoryWeavingInjectionDiagnostics } from '@/services/storyWeaving';
import { buildStoryPlanningAnalysis } from '@/services/storyPlanningAnalysis';
import { loadAllBundledStoryWeavingPresets, mergeBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import { devLog, devLogError } from '@/utils/devLog';
import { cardClip, smallClip, type TrackTab } from './plot/constants';
import { HeaderCard } from './plot/HeaderCard';
import { SeriesControl } from './plot/SeriesControl';
import { SeriesTree } from './plot/SeriesTree';
import { SegmentDetail } from './plot/SegmentDetail';
import { EmptyState, ProgressMiniBlock, TrackEmptyState } from './plot/primitives';
import {
  applyDraft,
  buildManualProgressAnchor,
  buildSeriesProgressAnchor,
  draftFromSegment,
  getPreviousCompleted,
  type SegmentDraft,
} from './plot/logic';
import {
  batchModeLabel,
  runBatchDecompose,
  selectBatchTargets,
  toBatchSystem,
  type BatchDecomposeMode,
} from './plot/batchDecompose';

interface PlotPanelProps {
  storyWeaving: 剧情编织系统;
  onStoryWeavingChange: React.Dispatch<React.SetStateAction<剧情编织系统>>;
  gameSettings: 游戏设置;
  apiSettings: API设置;
  /** 剧情编织持久化（片 panel-p6）：由 useGame 门面接管 saveSetting 直连。 */
  onSaveStoryWeaving: (system: 剧情编织系统) => Promise<void>;
}

export function PlotPanel({ storyWeaving, onStoryWeavingChange, gameSettings, apiSettings, onSaveStoryWeaving }: PlotPanelProps) {
  const txtInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyBatch, setBusyBatch] = useState('');
  const [message, setMessage] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [drafts, setDrafts] = useState<Record<string, SegmentDraft>>({});
  const [trackTab, setTrackTab] = useState<TrackTab>('canon');

  const normalized = useMemo(() => 归一化剧情编织系统(storyWeaving), [storyWeaving]);
  const canonSeries = useMemo(() => normalized.系列列表.filter((series) => series.来源类型 === 'canon'), [normalized.系列列表]);
  const customSeries = useMemo(() => normalized.系列列表.filter((series) => series.来源类型 !== 'canon'), [normalized.系列列表]);
  const visibleSeries = trackTab === 'canon' ? canonSeries : customSeries;
  const activeSeries = normalized.系列列表.find((s) => s.id === normalized.当前系列ID) ?? normalized.系列列表.at(0);
  const activeProgress = normalized.当前进度?.当前系列ID === activeSeries?.id ? normalized.当前进度 : undefined;
  const planningAnalysis = useMemo(() => buildStoryPlanningAnalysis(normalized), [normalized]);
  const injectionDiagnostics = useMemo(() => getStoryWeavingInjectionDiagnostics(normalized), [normalized]);
  const viewSeries = visibleSeries.find((s) => s.id === expandedSeriesId)
    ?? visibleSeries.find((s) => s.id === activeSeries?.id)
    ?? visibleSeries.at(0);
  const selectedSegment = viewSeries?.分段列表.find((s) => s.id === selectedSegmentId)
    ?? viewSeries?.分段列表.find((s) => s.组号 === viewSeries.当前分段组号)
    ?? viewSeries?.分段列表[0];
  const selectedProgress = normalized.当前进度?.当前分段ID === selectedSegment?.id ? normalized.当前进度 : undefined;
  const visibleSystem = useMemo<剧情编织系统>(() => ({
    ...normalized,
    系列列表: visibleSeries,
  }), [normalized, visibleSeries]);
  const activeCurrentSegments = useMemo(
    () => normalized.系列列表
      .flatMap((series) => series.分段列表
        .filter((segment) => segment.运行状态 === '当前')
        .map((segment) => ({ series, segment }))),
    [normalized.系列列表],
  );
  const hasCrossTrackCurrent = activeCurrentSegments.some(({ series }) => series.来源类型 === 'canon')
    && activeCurrentSegments.some(({ series }) => series.来源类型 !== 'canon');

  const handlePreviewSeries = (series: 剧情编织系列) => {
    setExpandedSeriesId((current) => current === series.id ? null : series.id);
    setSelectedSegmentId(series.分段列表[0]?.id ?? null);
  };

  const effectiveExpandedSeriesId = visibleSeries.some((s) => s.id === expandedSeriesId) ? expandedSeriesId : (viewSeries?.id ?? null);

  const draftKey = selectedSegment?.id ?? '';
  const draft = selectedSegment ? (drafts[draftKey] ?? draftFromSegment(selectedSegment)) : null;
  const updateDraft = (next: SegmentDraft) => setDrafts((prev) => ({ ...prev, [draftKey]: next }));

  const persist = async (next: 剧情编织系统): Promise<boolean> => {
    const prev = storyWeaving;
    const clean = 归一化剧情编织系统(next);
    try {
      onStoryWeavingChange(clean);
      await onSaveStoryWeaving(clean);
      return true;
    } catch (err) {
      onStoryWeavingChange(prev);
      const text = err instanceof Error ? err.message : String(err);
      devLogError('save', 'story-weaving-persist-failed', err, { seriesCount: clean.系列列表.length });
      setMessage(`剧情编织保存失败，已回滚本地更改：${text}`);
      return false;
    }
  };

  const replaceSeries = async (nextSeries: 剧情编织系列, baseSystem = normalized): Promise<boolean> => {
    return persist({
      ...baseSystem,
      系列列表: baseSystem.系列列表.map((series) => series.id === nextSeries.id ? nextSeries : series),
      当前系列ID: nextSeries.id,
    });
  };

  const updateSeries = async (seriesId: string, updater: (series: 剧情编织系列) => 剧情编织系列): Promise<boolean> => {
    const source = normalized.系列列表.find((series) => series.id === seriesId);
    if (!source) return false;
    return replaceSeries(updater(source));
  };

  const handleImportText = async (text: string, title: string, fileName?: string) => {
    const source = text.trim();
    if (!source) {
      setMessage('没有可导入的文本。');
      return;
    }
    const series = 创建剧情编织系列FromText({
      title: title.trim() || fileName?.replace(/\.[^.]+$/, '') || `自定义剧情 ${normalized.系列列表.length + 1}`,
      fileName,
      text: source,
      chaptersPerSegment: gameSettings.剧情编织系统.chaptersPerSegment,
    });
    const next = {
      系列列表: [...normalized.系列列表, series],
      当前系列ID: series.id,
      当前进度: buildSeriesProgressAnchor(normalized.当前进度, series, `导入剧情系列：${series.标题}`),
    };
    setSelectedSegmentId(series.分段列表[0]?.id ?? null);
    setExpandedSeriesId(series.id);
    if (!await persist(next)) return;
    devLog('save', 'story-weaving-text-imported', { chapters: series.章节列表.length, segments: series.分段列表.length });
    setMessage(`已导入 ${series.章节列表.length} 章，生成 ${series.分段列表.length} 个分段。`);
  };

  const handleImportTxtFile = async (file?: File) => {
    if (!file) return;
    try {
      await handleImportText(await file.text(), file.name.replace(/\.[^.]+$/, ''), file.name);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      devLogError('ui', 'story-weaving-text-import-failed', err, { fileName: file.name });
      setMessage(`TXT 导入失败：${text}`);
    } finally {
      if (txtInputRef.current) txtInputRef.current.value = '';
    }
  };

  const handleImportJsonFile = async (file?: File) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as 剧情编织系统 | 剧情编织系列;
      const system = '系列列表' in parsed
        ? 归一化剧情编织系统(parsed)
        : 归一化剧情编织系统({ 系列列表: [parsed], 当前系列ID: parsed.id });
      const customOnly = system.系列列表.length > 0 && system.系列列表.every((series) => series.来源类型 !== 'canon');
      if (!customOnly && system.系列列表.length > 0) {
        const ok = window.confirm('导入的 JSON 包含内置原著轨道，将整体替换当前剧情编织系统（含自制轨道）。确认替换？');
        if (!ok) {
          setMessage('已取消导入。');
          return;
        }
      }
      const next = customOnly
        ? 归一化剧情编织系统({
          ...normalized,
          系列列表: [
            ...normalized.系列列表.filter((series) => !system.系列列表.some((incoming) => incoming.id === series.id)),
            ...system.系列列表,
          ],
           当前系列ID: system.当前系列ID ?? system.系列列表.at(0)?.id ?? normalized.当前系列ID,
          当前进度: system.当前进度 ?? normalized.当前进度,
        })
        : system;
      if (!await persist(next)) return;
      devLog('save', 'story-weaving-json-imported', { seriesCount: system.系列列表.length, customOnly });
      setSelectedSegmentId(system.系列列表[0]?.分段列表[0]?.id ?? null);
      setExpandedSeriesId(system.当前系列ID ?? system.系列列表.at(0)?.id ?? null);
      setMessage(`已导入剧情编织 JSON：${system.系列列表.length} 个系列${customOnly ? '（已并入自制轨道）' : ''}。`);
    } catch (err) {
      const text = (err as Error).message;
      devLogError('ui', 'story-weaving-json-import-failed', err, { fileName: file.name });
      setMessage(`JSON 导入失败：${text}`);
      window.alert(`剧情编织 JSON 导入失败：${text}`);
    } finally {
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  };

  const downloadStoryWeavingJson = (payload: 剧情编织系统 | 剧情编织系列, filePrefix: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filePrefix}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCustomJson = () => {
    const custom = normalized.系列列表.filter((series) => series.来源类型 !== 'canon');
    if (!custom.length) {
      setMessage('没有可导出的自制剧情轨道。');
      return;
    }
    const currentCustom = custom.find((series) => series.id === normalized.当前系列ID) ?? custom[0];
    downloadStoryWeavingJson(归一化剧情编织系统({
      系列列表: custom,
      当前系列ID: currentCustom.id,
      当前进度: normalized.当前进度?.当前系列ID === currentCustom.id ? normalized.当前进度 : buildSeriesProgressAnchor(undefined, currentCustom, '导出自制剧情轨道'),
    }), 'kaituo-story-weaving-custom');
    setMessage(`已导出自制剧情轨道：${custom.length} 个。`);
  };

  const handleExportAllJson = () => {
    downloadStoryWeavingJson(normalized, 'kaituo-story-weaving-full-backup');
    setMessage('剧情编织完整备份已导出。');
  };

  const handleImportPasted = async () => {
    await handleImportText(pasteText, pasteTitle);
    setPasteText('');
    setPasteTitle('');
    setPasteOpen(false);
  };

  const handleRestoreCanonPresets = async () => {
    try {
      const bundled = await loadAllBundledStoryWeavingPresets();
      const merged = mergeBundledStoryWeavingPresets(normalized, bundled);
      const current = merged.系列列表.find((series) => series.id === merged.当前系列ID) ?? merged.系列列表[0];
      setSelectedSegmentId(merged.系列列表[0]?.分段列表[0]?.id ?? null);
      setExpandedSeriesId(merged.系列列表[0]?.id ?? null);
      if (!await persist({
        ...merged,
        当前系列ID: current.id,
        当前进度: buildSeriesProgressAnchor(merged.当前进度, current, '恢复内置原著剧情后同步当前锚点'),
      })) return;
      devLog('save', 'story-weaving-canon-restored', { seriesCount: bundled.系列列表.length });
      setMessage(`已恢复内置原著剧情：${bundled.系列列表.length} 个轨道。`);
    } catch (err) {
      const text = (err as Error).message;
      devLogError('save', 'story-weaving-canon-restore-failed', err);
      setMessage(`恢复内置原著剧情失败：${text}`);
      window.alert(`恢复内置原著剧情失败：${text}`);
    }
  };

  const handleRenameSeries = async (series: 剧情编织系列) => {
    const title = window.prompt('新的剧情系列名称', series.标题);
    if (!title || !title.trim()) return;
    await replaceSeries({ ...series, 标题: title.trim(), 作品名: title.trim(), updatedAt: Date.now() });
  };

  const handleRebuildSeries = async (series: 剧情编织系列) => {
    if (series.来源类型 === 'canon') {
      window.alert('内置原著剧情轨道不能重建分段。若需要调整，请切换运行状态或暂停注入。');
      return;
    }
    const nextSize = window.prompt('每个分段包含几章？', String(series.每段章数 || gameSettings.剧情编织系统.chaptersPerSegment || 1));
    if (!nextSize) return;
    const size = Math.max(1, Math.trunc(Number(nextSize) || 1));
    if (!window.confirm('重新分段会保留原始 TXT，但会清空该系列已有的 AI 分解结果。确认继续？')) return;
    const rebuilt = 重建剧情编织系列FromText(series, size);
    setSelectedSegmentId(rebuilt.分段列表[0]?.id ?? null);
    if (!await replaceSeries(rebuilt)) return;
    setMessage(`已重新分段：${rebuilt.章节列表.length} 章 / ${rebuilt.分段列表.length} 段。`);
  };

  const handleToggleSeriesInjection = async (series: 剧情编织系列) => {
    await replaceSeries({ ...series, 激活注入: !series.激活注入, updatedAt: Date.now() });
  };

  const handleSetCurrent = async (series: 剧情编织系列, group: number) => {
    const target = series.分段列表.find((item) => item.组号 === group);
    if (!target) return;
    const now = Date.now();
    const nextSeries: 剧情编织系列 = {
      ...series,
      当前分段组号: group,
      分段列表: series.分段列表.map((item) => ({
        ...item,
        运行状态: item.组号 === group ? '当前' : item.运行状态 === '当前' ? '未开始' : item.运行状态,
        updatedAt: item.组号 === group || item.运行状态 === '当前' ? now : item.updatedAt,
      })),
      updatedAt: now,
    };
    await persist({
      ...normalized,
      当前系列ID: series.id,
      系列列表: normalized.系列列表.map((item) => item.id === series.id ? nextSeries : item),
      当前进度: buildManualProgressAnchor(normalized.当前进度, nextSeries, { ...target, 运行状态: '当前', updatedAt: now }, `手动设为当前：${target.标题}`),
    });
  };

  const handleSetRuntimeStatus = async (series: 剧情编织系列, segment: 剧情编织分段, status: 剧情编织运行状态) => {
    if (status === '当前') {
      await handleSetCurrent(series, segment.组号);
      return;
    }
    const now = Date.now();
    const nextSeries: 剧情编织系列 = {
      ...series,
      分段列表: series.分段列表.map((item) => item.id === segment.id ? { ...item, 运行状态: status, updatedAt: now } : item),
      updatedAt: now,
    };
    const nextSegment = { ...segment, 运行状态: status, updatedAt: now };
    const nextProgress = normalized.当前进度?.当前分段ID === segment.id
      ? buildManualProgressAnchor(normalized.当前进度, nextSeries, nextSegment, `手动标记为${status}：${segment.标题}`)
      : normalized.当前进度;
    await persist({
      ...normalized,
      系列列表: normalized.系列列表.map((item) => item.id === series.id ? nextSeries : item),
      当前进度: nextProgress,
    });
  };

  const handleSaveDraft = async (series: 剧情编织系列, segment: 剧情编织分段) => {
    if (!draft) return;
    const updated = applyDraft(segment, draft);
    if (!await updateSeries(series.id, (s) => ({
      ...s,
      分段列表: s.分段列表.map((item) => item.id === segment.id ? updated : item),
      updatedAt: Date.now(),
    }))) return;
    setMessage(`已保存分段：${updated.标题}`);
  };

  const handleDecompose = async (series: 剧情编织系列, segment: 剧情编织分段) => {
    const config = buildStoryWeavingApiConfig(gameSettings, apiSettings);
    if (!config) {
      window.alert('剧情编织 API 未配置。请先到设置 → 剧情编织 配置模型，或配置主 API 作为回退。');
      return;
    }
    setBusyId(segment.id);
    devLog('net', 'story-weaving-decompose-start', { seriesId: series.id, segmentId: segment.id });
    setMessage(`正在分解：${segment.标题}`);
    if (!await updateSeries(series.id, (s) => ({
      ...s,
      分段列表: s.分段列表.map((item) => item.id === segment.id ? { ...item, 处理状态: '处理中', 最近错误: '', updatedAt: Date.now() } : item),
      updatedAt: Date.now(),
    }))) {
      setBusyId(null);
      return;
    }
    try {
      const parsed = await decomposeStorySegment({
        config,
        series,
        segment,
        previousSegment: getPreviousCompleted(series, segment),
        promptModules: gameSettings.promptModules,
      });
      if (!await updateSeries(series.id, (s) => ({
        ...s,
        分段列表: s.分段列表.map((item) => item.id === segment.id ? parsed : item),
        updatedAt: Date.now(),
      }))) return;
      devLog('net', 'story-weaving-decompose-done', { seriesId: series.id, segmentId: segment.id });
      setMessage(`分解完成：${segment.标题}`);
    } catch (err) {
      const text = (err as Error).message;
      devLogError('net', 'story-weaving-decompose-failed', err, { seriesId: series.id, segmentId: segment.id });
      await updateSeries(series.id, (s) => ({
        ...s,
        分段列表: s.分段列表.map((item) => item.id === segment.id ? { ...item, 处理状态: '失败', 最近错误: text, updatedAt: Date.now() } : item),
        updatedAt: Date.now(),
      }));
      setMessage(`分解失败：${text}`);
      window.alert(`剧情编织分解失败：${text}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleBatchDecompose = async (series: 剧情编织系列, mode: BatchDecomposeMode) => {
    const config = buildStoryWeavingApiConfig(gameSettings, apiSettings);
    if (!config) {
      window.alert('剧情编织 API 未配置。请先到设置 → 剧情编织 配置模型，或配置主 API 作为回退。');
      return;
    }
    const targets = selectBatchTargets(series, mode);
    if (!targets.length) {
      setMessage('没有需要分解的分段。');
      return;
    }
    const label = batchModeLabel(mode);
    if (mode === 'all' && !window.confirm('确认重新分解全部分段？已有分解结果会被覆盖。')) return;
    setBusyBatch(label);
    devLog('net', 'story-weaving-batch-decompose-start', { seriesId: series.id, mode, targetCount: targets.length });
    try {
      const { persistFailed } = await runBatchDecompose({
        series,
        targets,
        decompose: async (segment, previousSegment) => decomposeStorySegment({
          config,
          series,
          segment,
          previousSegment,
          promptModules: gameSettings.promptModules,
        }),
        persist: async (nextSeries) => persist(toBatchSystem(normalized, nextSeries)),
        onProgress: (index, total, segment) => {
          setBusyId(segment.id);
          setMessage(`批量分解 ${index + 1}/${total}：${segment.标题}`);
        },
      });
      if (persistFailed) {
        devLogError('save', 'story-weaving-batch-decompose-persist-failed', new Error('Batch decomposition persistence failed.'), { seriesId: series.id, mode });
      } else {
        devLog('net', 'story-weaving-batch-decompose-done', { seriesId: series.id, mode, targetCount: targets.length });
        setMessage(`批量分解结束：${label}`);
      }
    } finally {
      setBusyId(null);
      setBusyBatch('');
    }
  };

  const handleDeleteSeries = async (seriesId: string) => {
    const target = normalized.系列列表.find((s) => s.id === seriesId);
    if (target?.来源类型 === 'canon') {
      window.alert('内置原著剧情轨道不能删除。可以暂停注入，或将分段标记为暂停 / 已偏离。');
      return;
    }
    if (!window.confirm('确认删除这个剧情系列？')) return;
    const rest = normalized.系列列表.filter((s) => s.id !== seriesId);
    if (!await persist({
      系列列表: rest,
      当前系列ID: rest[0]?.id,
      当前进度: buildSeriesProgressAnchor(normalized.当前进度, rest[0], '删除剧情系列后同步当前锚点'),
    })) return;
    setSelectedSegmentId(rest[0]?.分段列表[0]?.id ?? null);
    setExpandedSeriesId(rest[0]?.id ?? null);
  };

  const busyLocked = Boolean(busyBatch);

  return (
    <div className="kaituo-options-scroll relative flex h-full min-h-0 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'linear-gradient(rgba(var(--tj-accent-primary),0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--tj-tech-cyan), 0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px, 24px 24px',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.2))',
        }}
      />
      <div className="relative z-10 flex min-h-max flex-col gap-3 pb-6">
        <HeaderCard
          activeSeries={activeSeries}
          progress={activeProgress}
          seriesCount={normalized.系列列表.length}
          totalChapters={normalized.系列列表.reduce((sum, series) => sum + series.章节列表.length, 0)}
          totalSegments={normalized.系列列表.reduce((sum, series) => sum + series.分段列表.length, 0)}
          busyBatch={busyBatch}
        />

        <div className="flex flex-col items-stretch gap-2 md:flex-row md:justify-between">
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-1 sm:flex-wrap">
            <input ref={txtInputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={(e) => void handleImportTxtFile(e.target.files?.[0])} />
            <input ref={jsonInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void handleImportJsonFile(e.target.files?.[0])} />
            <button className="panel-btn strong" onClick={() => txtInputRef.current?.click()}>导入 TXT</button>
            <button className="panel-btn" onClick={() => setPasteOpen((v) => !v)}>粘贴导入</button>
            <button className="panel-btn" onClick={() => jsonInputRef.current?.click()}>导入 JSON</button>
            <button className="panel-btn" onClick={() => void handleRestoreCanonPresets()}>恢复内置原著</button>
            <button className="panel-btn" disabled={!customSeries.length} onClick={handleExportCustomJson}>导出自制</button>
            <button className="panel-btn" disabled={!normalized.系列列表.length} onClick={handleExportAllJson}>导出全部备份</button>
          </div>
          <div
            className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 text-[11px] md:min-w-[220px] md:justify-end"
            style={{
              background: 'rgba(var(--tj-bg-primary),0.52)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.16)',
              clipPath: smallClip,
              color: 'rgba(var(--tj-text-secondary),0.76)',
            }}
          >
            <span style={{ color: 'rgb(var(--tj-tech-cyan))' }}>INJECT</span>
            <span>{activeSeries ? `${activeSeries.章节列表.length}章 / ${activeSeries.分段列表.length}段` : '暂无系列'}</span>
            {busyBatch && <span style={{ color: 'rgb(var(--tj-accent-primary))' }}>{busyBatch}</span>}
          </div>
        </div>

        {normalized.系列列表.length > 0 && (
          <div
            className="flex flex-col gap-2 px-3 py-3"
            style={{
              background: 'rgba(var(--tj-bg-primary),0.45)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.14)',
              clipPath: cardClip,
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-px w-8" style={{ background: 'linear-gradient(90deg, rgb(var(--tj-tech-cyan)), transparent)' }} />
                  <span className="font-serif text-[12px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.82)' }}>
                    当前主注入轨道
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>
                  <span className="font-serif text-sm font-bold" style={{ color: activeSeries ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-secondary),0.72)' }}>
                    {activeSeries?.标题 ?? '暂无主轨道'}
                  </span>
                  {activeSeries && (
                    <>
                      <span style={{ color: activeSeries.来源类型 === 'canon' ? 'rgb(var(--tj-accent-primary))' : 'rgba(145,210,175,0.9)' }}>
                        {activeSeries.来源类型 === 'canon' ? '原著剧情' : '自制剧情'}
                      </span>
                      <span>当前段 {activeProgress?.当前分段组号 ?? activeSeries.当前分段组号}</span>
                      {activeProgress && <span>推进状态 {activeProgress.推进状态}</span>}
                    </>
                  )}
                </div>
                {activeProgress && (
                  <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-3">
                    <ProgressMiniBlock label="已完成摘要" values={activeProgress.已完成摘要} />
                    <ProgressMiniBlock label="当前待解问题" values={activeProgress.当前待解问题} />
                    <ProgressMiniBlock label="最近判定理由" values={activeProgress.最近判定理由} />
                  </div>
                )}
                {injectionDiagnostics && (
                  <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-3">
                    <ProgressMiniBlock
                      label={`注入健康：${injectionDiagnostics.健康状态}`}
                      values={injectionDiagnostics.检查项}
                    />
                    <ProgressMiniBlock
                      label="实际注入段"
                      values={[`第 ${injectionDiagnostics.当前分段组号} 段「${injectionDiagnostics.当前分段标题}」｜${injectionDiagnostics.当前分段运行状态}`]}
                    />
                    <ProgressMiniBlock
                      label="窗口预热"
                      values={[
                        injectionDiagnostics.归档锚点标题 ? `跳过归档：第 ${injectionDiagnostics.归档锚点组号} 段「${injectionDiagnostics.归档锚点标题}」` : '',
                        injectionDiagnostics.前一分段标题 ? `历史：${injectionDiagnostics.前一分段标题}` : '',
                        injectionDiagnostics.下一分段标题 ? `下一段：${injectionDiagnostics.下一分段标题}` : '',
                      ].filter(Boolean)}
                    />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1 rounded-none p-1" style={{ background: 'rgba(var(--tj-bg-primary),0.58)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.16)', clipPath: smallClip }}>
                {([
                  ['canon', '原著剧情', canonSeries.length],
                  ['custom', '自制剧情', customSeries.length],
                ] as const).map(([tab, label, count]) => {
                  const active = trackTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setTrackTab(tab)}
                      className="px-3 py-1.5 text-[12px] transition-all"
                      style={{
                        color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-secondary),0.78)',
                        background: active ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.16), rgba(var(--tj-tech-cyan), 0.08))' : 'transparent',
                        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.32)' : 'none',
                        clipPath: smallClip,
                      }}
                    >
                      {label} <span style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-tech-cyan), 0.66)' }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {hasCrossTrackCurrent && (
              <div
                className="px-3 py-2 text-xs leading-relaxed"
                style={{
                  color: 'rgba(var(--tj-accent-primary),0.88)',
                  background: 'rgba(var(--tj-accent-secondary),0.08)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-secondary),0.22)',
                  clipPath: smallClip,
                }}
              >
                检测到原著与自制轨道都存在“当前”分段。系统仍只会注入上方的主轨道，另一个建议标记为暂停、支线或偏离，避免正文抢线。
              </div>
            )}

            <div className="kaituo-options-scroll flex gap-2 overflow-x-auto pb-1">
              {visibleSeries.map((series) => {
                const active = series.id === normalized.当前系列ID;
                const viewing = series.id === viewSeries?.id;
                const selected = active || viewing;
                return (
                  <button
                    key={series.id}
                    onClick={() => handlePreviewSeries(series)}
                    className="shrink-0 px-3 py-2 text-left transition-all"
                    style={{
                      minWidth: 'min(180px, 78vw)',
                      clipPath: smallClip,
                      background: selected
                        ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.14), rgba(var(--tj-tech-cyan), 0.08))'
                        : 'rgba(var(--tj-bg-primary),0.62)',
                      boxShadow: selected
                        ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.48), 0 0 18px rgba(var(--tj-accent-primary),0.08)'
                        : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.14)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="min-w-0 truncate font-serif text-[12px] font-bold"
                        style={{ color: selected ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-secondary),0.84)' }}
                      >
                        {series.标题}
                      </span>
                      <span className="text-[11px]" style={{ color: selected ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-tech-cyan), 0.66)' }}>
                        {active ? 'INJECTING' : viewing ? 'VIEWING' : 'VIEW'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
                      <span>{series.章节列表.length} 章 · {series.分段列表.length} 段</span>
                      <span style={{ color: series.来源类型 === 'canon' ? 'rgb(var(--tj-accent-primary))' : 'rgba(145,210,175,0.9)' }}>
                        {series.来源类型 === 'canon' ? '原著轨道' : '自制轨道'}
                      </span>
                    </div>
                  </button>
                );
              })}
              {visibleSeries.length === 0 && (
                <div
                  className="min-w-[260px] px-3 py-3 text-xs leading-relaxed"
                  style={{ color: 'rgba(var(--tj-text-secondary),0.78)', background: 'rgba(var(--tj-bg-primary),0.5)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.14)', clipPath: smallClip }}
                >
                  {trackTab === 'canon'
                    ? '暂无原著剧情轨道。可以点击“恢复内置原著”重新载入。'
                    : '暂无自制剧情轨道。导入 TXT 或粘贴文本后会显示在这里。'}
                </div>
              )}
            </div>
          </div>
        )}

        {pasteOpen && (
          <div
            className="grid gap-2 px-3 py-3"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.06), rgba(var(--tj-tech-cyan), 0.04), rgba(var(--tj-bg-primary),0.7))',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
              clipPath: cardClip,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.86)' }}>
                PASTE IMPORT BUFFER
              </div>
              <div className="text-[11px]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.72)' }}>
                TXT / 小说化剧情
              </div>
            </div>
            <input
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="剧情系列名称，例如：今天是昨天的明天"
              className="kaituo-input px-3 py-2 text-sm"
              style={{ clipPath: smallClip }}
            />
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={5}
              placeholder="把 TXT 正文粘贴在这里。系统会先按章节标题切分，识别不到章节时会按长度自动切片。"
              className="kaituo-input px-3 py-2 text-sm leading-relaxed"
              style={{ clipPath: smallClip }}
            />
            <div className="flex justify-end gap-2">
              <button className="panel-btn" onClick={() => setPasteOpen(false)}>取消</button>
              <button className="panel-btn strong" onClick={() => void handleImportPasted()}>创建剧情系列</button>
            </div>
          </div>
        )}

        {!viewSeries ? (
          <TrackEmptyState trackTab={trackTab} />
        ) : (
          <div className="flex flex-col gap-3 overflow-visible lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden">
            <SeriesTree
              system={visibleSystem}
              viewSeries={viewSeries}
              selectedSegmentId={selectedSegment?.id ?? null}
              expandedSeriesId={effectiveExpandedSeriesId}
              busyId={busyId}
              onSelectSeries={handlePreviewSeries}
              onSelectSegment={(segment) => setSelectedSegmentId(segment.id)}
              onSelectChapter={(series, chapterSeq) => {
                const segment = series.分段列表.find((item) => item.起始章序号 <= chapterSeq && item.结束章序号 >= chapterSeq);
                if (segment) setSelectedSegmentId(segment.id);
              }}
            />

            <section className="kaituo-options-scroll overflow-visible pb-3 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
              <SeriesControl
                series={viewSeries}
                onRename={() => void handleRenameSeries(viewSeries)}
                onToggleInjection={() => void handleToggleSeriesInjection(viewSeries)}
                onRebuild={() => void handleRebuildSeries(viewSeries)}
                onBatchPending={() => void handleBatchDecompose(viewSeries, 'pending')}
                onBatchFromCurrent={() => void handleBatchDecompose(viewSeries, 'fromCurrent')}
                onBatchAll={() => void handleBatchDecompose(viewSeries, 'all')}
                onDelete={() => void handleDeleteSeries(viewSeries.id)}
                busy={busyLocked}
              />
              {selectedSegment && draft ? (
                <>
                  <SegmentDetail
                    series={viewSeries}
                    segment={selectedSegment}
                    draft={draft}
                    onDraftChange={updateDraft}
                    busy={busyLocked || busyId === selectedSegment.id}
                    onDecompose={() => void handleDecompose(viewSeries, selectedSegment)}
                    onSetCurrent={() => void handleSetCurrent(viewSeries, selectedSegment.组号)}
                    onSetRuntimeStatus={(status) => void handleSetRuntimeStatus(viewSeries, selectedSegment, status)}
                    onSaveDraft={() => void handleSaveDraft(viewSeries, selectedSegment)}
                    onResetDraft={() => updateDraft(draftFromSegment(selectedSegment))}
                    progress={selectedProgress}
                  />
                  {planningAnalysis && (
                    <div
                      className="px-3 py-3 text-xs leading-relaxed md:px-4"
                      style={{ background: 'rgba(var(--tj-tech-cyan), 0.045)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.18)', clipPath: cardClip }}
                    >
                      <div className="font-serif text-[11px] tracking-[0.2em]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.86)' }}>
                        规划分析
                      </div>
                      <div className="mt-1" style={{ color: 'rgba(var(--tj-text-primary),0.9)' }}>
                        {planningAnalysis.系列标题} · 第{planningAnalysis.当前分段组号}段「{planningAnalysis.当前分段标题}」
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
                        <span>建议：{planningAnalysis.建议动作}</span>
                        <span>推进：{planningAnalysis.推进状态}</span>
                        <span>门禁：{planningAnalysis.门禁结果}</span>
                        <span>偏离风险：{planningAnalysis.偏离风险}</span>
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        <ProgressMiniBlock label="分析理由" values={planningAnalysis.分析理由} />
                        <ProgressMiniBlock label="关注事项" values={planningAnalysis.关注事项} />
                        <ProgressMiniBlock label="切段条件" values={planningAnalysis.切段条件} />
                        <ProgressMiniBlock label="待迁移事项" values={planningAnalysis.待迁移事项} />
                        <ProgressMiniBlock label="下一步调度" values={planningAnalysis.下一步调度} />
                        <ProgressMiniBlock label="归档检查" values={planningAnalysis.归档检查} />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState />
              )}
            </section>
          </div>
        )}

        {message && <div className="text-xs" style={{ color: message.includes('失败') ? 'rgba(var(--tj-danger),0.9)' : 'rgba(var(--tj-ui-success),0.86)' }}>{message}</div>}
      </div>
    </div>
  );
}
