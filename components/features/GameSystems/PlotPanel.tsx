import { useEffect, useMemo, useRef, useState } from 'react';
import type { API设置, 游戏设置 } from '@/models/settings';
import type { 剧情编织分段, 剧情编织系列, 剧情编织系统, 剧情编织运行状态 } from '@/models/storyWeaving';
import {
  创建剧情编织系列FromText,
  归一化剧情编织系统,
  重建剧情编织系列FromText,
} from '@/models/storyWeaving';
import { buildStoryWeavingApiConfig, decomposeStorySegment } from '@/services/storyWeaving';
import { saveSetting } from '@/services/dbService';
import { loadAllBundledStoryWeavingPresets, mergeBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';

interface PlotPanelProps {
  storyWeaving: 剧情编织系统;
  onStoryWeavingChange: React.Dispatch<React.SetStateAction<剧情编织系统>>;
  gameSettings: 游戏设置;
  apiSettings: API设置;
}

interface SegmentDraft {
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

const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

type TrackTab = 'canon' | 'custom';

const statusColor: Record<剧情编织分段['处理状态'], string> = {
  待处理: 'rgba(160, 148, 120, 0.8)',
  处理中: 'rgba(245, 217, 122, 0.95)',
  已完成: 'rgba(145, 210, 175, 0.95)',
  失败: 'rgba(230, 130, 130, 0.95)',
};

const statusBg: Record<剧情编织分段['处理状态'], string> = {
  待处理: 'rgba(160, 148, 120, 0.12)',
  处理中: 'rgba(245, 217, 122, 0.16)',
  已完成: 'rgba(145, 210, 175, 0.14)',
  失败: 'rgba(230, 130, 130, 0.14)',
};

const runtimeStatusColor: Record<剧情编织运行状态, string> = {
  未开始: 'rgba(160, 148, 120, 0.82)',
  当前: 'rgba(245, 217, 122, 0.96)',
  已经历: 'rgba(145, 210, 175, 0.95)',
  已跳过: 'rgba(160, 168, 245, 0.88)',
  已偏离: 'rgba(230, 170, 120, 0.92)',
  暂停: 'rgba(180, 180, 190, 0.82)',
};

const runtimeStatusBg: Record<剧情编织运行状态, string> = {
  未开始: 'rgba(160, 148, 120, 0.08)',
  当前: 'rgba(245, 217, 122, 0.15)',
  已经历: 'rgba(145, 210, 175, 0.12)',
  已跳过: 'rgba(160, 168, 245, 0.10)',
  已偏离: 'rgba(230, 170, 120, 0.12)',
  暂停: 'rgba(180, 180, 190, 0.08)',
};

const runtimeStatusOptions: 剧情编织运行状态[] = ['未开始', '当前', '已经历', '已跳过', '已偏离', '暂停'];

const joinList = (values: string[]) => values.join('\n');
const splitList = (value: string) =>
  value
    .split(/\n|；|;|\|/g)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

function draftFromSegment(segment: 剧情编织分段): SegmentDraft {
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

function applyDraft(segment: 剧情编织分段, draft: SegmentDraft): 剧情编织分段 {
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

export function PlotPanel({ storyWeaving, onStoryWeavingChange, gameSettings, apiSettings }: PlotPanelProps) {
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
  const [draft, setDraft] = useState<SegmentDraft | null>(null);
  const [trackTab, setTrackTab] = useState<TrackTab>('canon');

  const normalized = useMemo(() => 归一化剧情编织系统(storyWeaving), [storyWeaving]);
  const canonSeries = useMemo(() => normalized.系列列表.filter((series) => series.来源类型 === 'canon'), [normalized.系列列表]);
  const customSeries = useMemo(() => normalized.系列列表.filter((series) => series.来源类型 !== 'canon'), [normalized.系列列表]);
  const visibleSeries = trackTab === 'canon' ? canonSeries : customSeries;
  const activeSeries = normalized.系列列表.find((s) => s.id === normalized.当前系列ID) ?? normalized.系列列表[0];
  const viewSeries = visibleSeries.find((s) => s.id === activeSeries?.id)
    ?? visibleSeries.find((s) => s.id === expandedSeriesId)
    ?? visibleSeries[0];
  const selectedSegment = viewSeries?.分段列表.find((s) => s.id === selectedSegmentId)
    ?? viewSeries?.分段列表.find((s) => s.组号 === viewSeries.当前分段组号)
    ?? viewSeries?.分段列表[0];
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

  const handleSelectSeries = async (series: 剧情编织系列) => {
    await persist({ ...normalized, 当前系列ID: series.id });
    setExpandedSeriesId((current) => current === series.id ? null : series.id);
    setSelectedSegmentId(series.分段列表[0]?.id ?? null);
  };

  useEffect(() => {
    if (viewSeries && !expandedSeriesId) setExpandedSeriesId(viewSeries.id);
  }, [viewSeries, expandedSeriesId]);

  useEffect(() => {
    if (!viewSeries) return;
    if (!visibleSeries.some((series) => series.id === expandedSeriesId)) {
      setExpandedSeriesId(viewSeries.id);
      setSelectedSegmentId(viewSeries.分段列表[0]?.id ?? null);
    }
  }, [trackTab, viewSeries, visibleSeries, expandedSeriesId]);

  useEffect(() => {
    setDraft(selectedSegment ? draftFromSegment(selectedSegment) : null);
  }, [selectedSegment?.id, selectedSegment?.updatedAt]);

  const persist = async (next: 剧情编织系统) => {
    const clean = 归一化剧情编织系统(next);
    onStoryWeavingChange(clean);
    await saveSetting('storyWeavingSystem', clean);
  };

  const replaceSeries = async (nextSeries: 剧情编织系列, baseSystem = normalized) => {
    await persist({
      ...baseSystem,
      系列列表: baseSystem.系列列表.map((series) => series.id === nextSeries.id ? nextSeries : series),
      当前系列ID: nextSeries.id,
    });
  };

  const updateSeries = async (seriesId: string, updater: (series: 剧情编织系列) => 剧情编织系列) => {
    const source = normalized.系列列表.find((series) => series.id === seriesId);
    if (!source) return;
    await replaceSeries(updater(source));
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
    };
    setSelectedSegmentId(series.分段列表[0]?.id ?? null);
    setExpandedSeriesId(series.id);
    await persist(next);
    setMessage(`已导入 ${series.章节列表.length} 章，生成 ${series.分段列表.length} 个分段。`);
  };

  const handleImportTxtFile = async (file?: File) => {
    if (!file) return;
    await handleImportText(await file.text(), file.name.replace(/\.[^.]+$/, ''), file.name);
    if (txtInputRef.current) txtInputRef.current.value = '';
  };

  const handleImportJsonFile = async (file?: File) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as 剧情编织系统 | 剧情编织系列;
      const system = '系列列表' in parsed
        ? 归一化剧情编织系统(parsed)
        : 归一化剧情编织系统({ 系列列表: [parsed], 当前系列ID: parsed.id });
      await persist(system);
      setSelectedSegmentId(system.系列列表[0]?.分段列表[0]?.id ?? null);
      setExpandedSeriesId(system.当前系列ID ?? system.系列列表[0]?.id ?? null);
      setMessage(`已导入剧情编织 JSON：${system.系列列表.length} 个系列。`);
    } catch (err) {
      const text = (err as Error).message;
      setMessage(`JSON 导入失败：${text}`);
      window.alert(`剧情编织 JSON 导入失败：${text}`);
    } finally {
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kaituo-story-weaving-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('剧情编织数据已导出。');
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
      setSelectedSegmentId(merged.系列列表[0]?.分段列表[0]?.id ?? null);
      setExpandedSeriesId(merged.系列列表[0]?.id ?? null);
      await persist(merged);
      setMessage(`已恢复内置原著剧情：${bundled.系列列表.length} 个轨道。`);
    } catch (err) {
      const text = (err as Error).message;
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
    await replaceSeries(rebuilt);
    setMessage(`已重新分段：${rebuilt.章节列表.length} 章 / ${rebuilt.分段列表.length} 段。`);
  };

  const handleToggleSeriesInjection = async (series: 剧情编织系列) => {
    await replaceSeries({ ...series, 激活注入: !series.激活注入, updatedAt: Date.now() });
  };

  const handleSetCurrent = async (series: 剧情编织系列, group: number) => {
    await updateSeries(series.id, (s) => ({
      ...s,
      当前分段组号: group,
      分段列表: s.分段列表.map((item) => ({
        ...item,
        运行状态: item.组号 === group ? '当前' : item.运行状态 === '当前' ? '未开始' : item.运行状态,
        updatedAt: item.组号 === group || item.运行状态 === '当前' ? Date.now() : item.updatedAt,
      })),
      updatedAt: Date.now(),
    }));
  };

  const handleSetRuntimeStatus = async (series: 剧情编织系列, segment: 剧情编织分段, status: 剧情编织运行状态) => {
    await updateSeries(series.id, (s) => ({
      ...s,
      当前分段组号: status === '当前' ? segment.组号 : s.当前分段组号,
      分段列表: s.分段列表.map((item) => {
        if (status === '当前') {
          return {
            ...item,
            运行状态: item.id === segment.id ? '当前' : item.运行状态 === '当前' ? '未开始' : item.运行状态,
            updatedAt: item.id === segment.id || item.运行状态 === '当前' ? Date.now() : item.updatedAt,
          };
        }
        return item.id === segment.id
          ? { ...item, 运行状态: status, updatedAt: Date.now() }
          : item;
      }),
      updatedAt: Date.now(),
    }));
  };

  const handleSaveDraft = async (series: 剧情编织系列, segment: 剧情编织分段) => {
    if (!draft) return;
    const updated = applyDraft(segment, draft);
    await updateSeries(series.id, (s) => ({
      ...s,
      分段列表: s.分段列表.map((item) => item.id === segment.id ? updated : item),
      updatedAt: Date.now(),
    }));
    setMessage(`已保存分段：${updated.标题}`);
  };

  const getPreviousCompleted = (series: 剧情编织系列, segment: 剧情编织分段) =>
    series.分段列表
      .filter((item) => item.组号 < segment.组号 && item.处理状态 === '已完成')
      .sort((a, b) => b.组号 - a.组号)[0];

  const handleDecompose = async (series: 剧情编织系列, segment: 剧情编织分段) => {
    const config = buildStoryWeavingApiConfig(gameSettings, apiSettings);
    if (!config) {
      window.alert('剧情编织 API 未配置。请先到设置 → 剧情编织 配置模型，或配置主 API 作为回退。');
      return;
    }
    setBusyId(segment.id);
    setMessage(`正在分解：${segment.标题}`);
    await updateSeries(series.id, (s) => ({
      ...s,
      分段列表: s.分段列表.map((item) => item.id === segment.id ? { ...item, 处理状态: '处理中', 最近错误: '', updatedAt: Date.now() } : item),
      updatedAt: Date.now(),
    }));
    try {
      const parsed = await decomposeStorySegment({
        config,
        series,
        segment,
        previousSegment: getPreviousCompleted(series, segment),
      });
      await updateSeries(series.id, (s) => ({
        ...s,
        分段列表: s.分段列表.map((item) => item.id === segment.id ? parsed : item),
        updatedAt: Date.now(),
      }));
      setMessage(`分解完成：${segment.标题}`);
    } catch (err) {
      const text = (err as Error).message;
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

  const handleBatchDecompose = async (series: 剧情编织系列, mode: 'pending' | 'fromCurrent' | 'all') => {
    const config = buildStoryWeavingApiConfig(gameSettings, apiSettings);
    if (!config) {
      window.alert('剧情编织 API 未配置。请先到设置 → 剧情编织 配置模型，或配置主 API 作为回退。');
      return;
    }
    const targets = series.分段列表.filter((segment) => {
      if (mode === 'pending') return segment.处理状态 !== '已完成';
      if (mode === 'fromCurrent') return segment.组号 >= series.当前分段组号;
      return true;
    });
    if (!targets.length) {
      setMessage('没有需要分解的分段。');
      return;
    }
    const label = mode === 'pending' ? '待处理分段' : mode === 'fromCurrent' ? '当前以后分段' : '全部分段';
    if (mode === 'all' && !window.confirm('确认重新分解全部分段？已有分解结果会被覆盖。')) return;

    let workingSystem = normalized;
    let workingSeries = series;
    setBusyBatch(label);
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const target = workingSeries.分段列表.find((item) => item.id === targets[index].id);
        if (!target) continue;
        setBusyId(target.id);
        setMessage(`批量分解 ${index + 1}/${targets.length}：${target.标题}`);

        workingSeries = {
          ...workingSeries,
          分段列表: workingSeries.分段列表.map((item) => item.id === target.id ? { ...item, 处理状态: '处理中', 最近错误: '', updatedAt: Date.now() } : item),
          updatedAt: Date.now(),
        };
        workingSystem = { ...workingSystem, 系列列表: workingSystem.系列列表.map((item) => item.id === workingSeries.id ? workingSeries : item), 当前系列ID: workingSeries.id };
        await persist(workingSystem);

        try {
          const processingSegment = workingSeries.分段列表.find((item) => item.id === target.id) ?? target;
          const parsed = await decomposeStorySegment({
            config,
            series: workingSeries,
            segment: processingSegment,
            previousSegment: getPreviousCompleted(workingSeries, processingSegment),
          });
          workingSeries = {
            ...workingSeries,
            分段列表: workingSeries.分段列表.map((item) => item.id === target.id ? parsed : item),
            updatedAt: Date.now(),
          };
        } catch (err) {
          const text = (err as Error).message;
          workingSeries = {
            ...workingSeries,
            分段列表: workingSeries.分段列表.map((item) => item.id === target.id ? { ...item, 处理状态: '失败', 最近错误: text, updatedAt: Date.now() } : item),
            updatedAt: Date.now(),
          };
        }
        workingSystem = { ...workingSystem, 系列列表: workingSystem.系列列表.map((item) => item.id === workingSeries.id ? workingSeries : item), 当前系列ID: workingSeries.id };
        await persist(workingSystem);
      }
      setMessage(`批量分解结束：${label}`);
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
    await persist({ 系列列表: rest, 当前系列ID: rest[0]?.id });
    setSelectedSegmentId(rest[0]?.分段列表[0]?.id ?? null);
    setExpandedSeriesId(rest[0]?.id ?? null);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'linear-gradient(rgba(245,217,122,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(117,214,216,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px, 24px 24px',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.2))',
        }}
      />
      <div className="relative z-10 flex h-full min-h-0 flex-col gap-3">
        <HeaderCard
          activeSeries={activeSeries}
          seriesCount={normalized.系列列表.length}
          totalChapters={normalized.系列列表.reduce((sum, series) => sum + series.章节列表.length, 0)}
          totalSegments={normalized.系列列表.reduce((sum, series) => sum + series.分段列表.length, 0)}
          busyBatch={busyBatch}
        />

        <div className="flex flex-wrap items-stretch justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <input ref={txtInputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={(e) => void handleImportTxtFile(e.target.files?.[0])} />
            <input ref={jsonInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void handleImportJsonFile(e.target.files?.[0])} />
            <button className="panel-btn strong" onClick={() => txtInputRef.current?.click()}>导入 TXT</button>
            <button className="panel-btn" onClick={() => setPasteOpen((v) => !v)}>粘贴导入</button>
            <button className="panel-btn" onClick={() => jsonInputRef.current?.click()}>导入 JSON</button>
            <button className="panel-btn" onClick={() => void handleRestoreCanonPresets()}>恢复内置原著</button>
            <button className="panel-btn" disabled={!normalized.系列列表.length} onClick={handleExportJson}>导出 JSON</button>
          </div>
          <div
            className="flex min-w-[220px] items-center justify-end gap-2 px-3 py-2 text-[11px]"
            style={{
              background: 'rgba(10,9,10,0.52)',
              boxShadow: 'inset 0 0 0 1px rgba(117,214,216,0.16)',
              clipPath: smallClip,
              color: 'rgba(220,208,178,0.76)',
            }}
          >
            <span style={{ color: '#75d6d8' }}>INJECT</span>
            <span>{activeSeries ? `${activeSeries.章节列表.length}章 / ${activeSeries.分段列表.length}段` : '暂无系列'}</span>
            {busyBatch && <span style={{ color: '#f5d97a' }}>{busyBatch}</span>}
          </div>
        </div>

        {normalized.系列列表.length > 0 && (
          <div
            className="flex flex-col gap-2 px-3 py-3"
            style={{
              background: 'rgba(10,9,10,0.45)',
              boxShadow: 'inset 0 0 0 1px rgba(117,214,216,0.14)',
              clipPath: cardClip,
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-px w-8" style={{ background: 'linear-gradient(90deg, #75d6d8, transparent)' }} />
                  <span className="font-serif text-[12px] tracking-[0.22em]" style={{ color: 'rgba(117,214,216,0.82)' }}>
                    当前主注入轨道
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'rgba(160,148,120,0.78)' }}>
                  <span className="font-serif text-sm font-bold" style={{ color: activeSeries ? '#fff4d4' : 'rgba(160,148,120,0.72)' }}>
                    {activeSeries?.标题 ?? '暂无主轨道'}
                  </span>
                  {activeSeries && (
                    <>
                      <span style={{ color: activeSeries.来源类型 === 'canon' ? '#f5d97a' : 'rgba(145,210,175,0.9)' }}>
                        {activeSeries.来源类型 === 'canon' ? '原著剧情' : '自制剧情'}
                      </span>
                      <span>当前段 {activeSeries.当前分段组号}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1 rounded-none p-1" style={{ background: 'rgba(8,7,9,0.58)', boxShadow: 'inset 0 0 0 1px rgba(117,214,216,0.16)', clipPath: smallClip }}>
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
                        color: active ? '#fff4d4' : 'rgba(200,188,158,0.78)',
                        background: active ? 'linear-gradient(135deg, rgba(245,217,122,0.16), rgba(117,214,216,0.08))' : 'transparent',
                        boxShadow: active ? 'inset 0 0 0 1px rgba(245,217,122,0.32)' : 'none',
                        clipPath: smallClip,
                      }}
                    >
                      {label} <span style={{ color: active ? '#f5d97a' : 'rgba(117,214,216,0.66)' }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {hasCrossTrackCurrent && (
              <div
                className="px-3 py-2 text-xs leading-relaxed"
                style={{
                  color: 'rgba(245,217,122,0.88)',
                  background: 'rgba(245,160,92,0.08)',
                  boxShadow: 'inset 0 0 0 1px rgba(245,160,92,0.22)',
                  clipPath: smallClip,
                }}
              >
                检测到原著与自制轨道都存在“当前”分段。系统仍只会注入上方的主轨道，另一个建议标记为暂停、支线或偏离，避免正文抢线。
              </div>
            )}

            <div className="kaituo-options-scroll flex gap-2 overflow-x-auto pb-1">
              {visibleSeries.map((series) => {
                const active = series.id === normalized.当前系列ID;
                return (
                  <button
                    key={series.id}
                    onClick={() => void handleSelectSeries(series)}
                    className="shrink-0 px-3 py-2 text-left transition-all"
                    style={{
                      minWidth: '180px',
                      clipPath: smallClip,
                      background: active
                        ? 'linear-gradient(135deg, rgba(245,217,122,0.14), rgba(117,214,216,0.08))'
                        : 'rgba(8,7,9,0.62)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(245,217,122,0.48), 0 0 18px rgba(245,217,122,0.08)'
                        : 'inset 0 0 0 1px rgba(117,214,216,0.14)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="min-w-0 truncate font-serif text-[12px] font-bold"
                        style={{ color: active ? '#fff4d4' : 'rgba(220,208,178,0.84)' }}
                      >
                        {series.标题}
                      </span>
                      <span className="text-[11px]" style={{ color: active ? '#f5d97a' : 'rgba(117,214,216,0.66)' }}>
                        {active ? 'INJECTING' : 'SELECT'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: 'rgba(160,148,120,0.72)' }}>
                      <span>{series.章节列表.length} 章 · {series.分段列表.length} 段</span>
                      <span style={{ color: series.来源类型 === 'canon' ? '#f5d97a' : 'rgba(145,210,175,0.9)' }}>
                        {series.来源类型 === 'canon' ? '原著轨道' : '自制轨道'}
                      </span>
                    </div>
                  </button>
                );
              })}
              {visibleSeries.length === 0 && (
                <div
                  className="min-w-[260px] px-3 py-3 text-xs leading-relaxed"
                  style={{ color: 'rgba(160,148,120,0.78)', background: 'rgba(8,7,9,0.5)', boxShadow: 'inset 0 0 0 1px rgba(117,214,216,0.14)', clipPath: smallClip }}
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
              background: 'linear-gradient(135deg, rgba(245,217,122,0.06), rgba(117,214,216,0.04), rgba(10,9,10,0.7))',
              boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.18)',
              clipPath: cardClip,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.86)' }}>
                PASTE IMPORT BUFFER
              </div>
              <div className="text-[11px]" style={{ color: 'rgba(117,214,216,0.72)' }}>
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
          <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] gap-3 overflow-hidden">
            <SeriesTree
              system={visibleSystem}
              activeSeries={activeSeries ?? viewSeries}
              selectedSegmentId={selectedSegment?.id ?? null}
              expandedSeriesId={expandedSeriesId}
              busyId={busyId}
              onSelectSeries={(series) => void handleSelectSeries(series)}
              onSelectSegment={(segment) => setSelectedSegmentId(segment.id)}
              onSelectChapter={(series, chapterSeq) => {
                const segment = series.分段列表.find((item) => item.起始章序号 <= chapterSeq && item.结束章序号 >= chapterSeq);
                if (segment) setSelectedSegmentId(segment.id);
              }}
            />

            <section className="kaituo-options-scroll min-h-0 overflow-y-auto pr-2 pb-3">
              <SeriesControl
                series={viewSeries}
                onRename={() => void handleRenameSeries(viewSeries)}
                onToggleInjection={() => void handleToggleSeriesInjection(viewSeries)}
                onRebuild={() => void handleRebuildSeries(viewSeries)}
                onBatchPending={() => void handleBatchDecompose(viewSeries, 'pending')}
                onBatchFromCurrent={() => void handleBatchDecompose(viewSeries, 'fromCurrent')}
                onBatchAll={() => void handleBatchDecompose(viewSeries, 'all')}
                onDelete={() => void handleDeleteSeries(viewSeries.id)}
                busy={Boolean(busyBatch)}
              />
              {selectedSegment && draft ? (
                <SegmentDetail
                  series={viewSeries}
                  segment={selectedSegment}
                  draft={draft}
                  onDraftChange={setDraft}
                  busy={busyId === selectedSegment.id}
                  onDecompose={() => void handleDecompose(viewSeries, selectedSegment)}
                  onSetCurrent={() => void handleSetCurrent(viewSeries, selectedSegment.组号)}
                  onSetRuntimeStatus={(status) => void handleSetRuntimeStatus(viewSeries, selectedSegment, status)}
                  onSaveDraft={() => void handleSaveDraft(viewSeries, selectedSegment)}
                  onResetDraft={() => setDraft(draftFromSegment(selectedSegment))}
                />
              ) : (
                <EmptyState />
              )}
            </section>
          </div>
        )}

        {message && <div className="text-xs" style={{ color: message.includes('失败') ? 'rgba(230,130,130,0.9)' : 'rgba(160,210,175,0.86)' }}>{message}</div>}
      </div>
    </div>
  );
}

function HeaderCard({
  activeSeries,
  seriesCount,
  totalChapters,
  totalSegments,
  busyBatch,
}: {
  activeSeries?: 剧情编织系列;
  seriesCount: number;
  totalChapters: number;
  totalSegments: number;
  busyBatch: string;
}) {
  return (
    <div
      className="relative overflow-hidden px-4 py-4"
      style={{
        background: 'linear-gradient(135deg, rgba(245,217,122,0.12), rgba(117,214,216,0.05) 38%, rgba(10,9,10,0.95))',
        boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.24), 0 0 18px rgba(245,217,122,0.06)',
        clipPath: cardClip,
      }}
    >
      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[42px] font-bold opacity-[0.06]" style={{ color: '#fff4d4' }}>
        WIRING
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2" style={{ background: '#75d6d8', boxShadow: '0 0 12px rgba(117,214,216,0.8)' }} />
            <span className="font-serif text-[12px] tracking-[0.32em]" style={{ color: 'rgba(117,214,216,0.86)' }}>
              NARRATIVE WORKBENCH
            </span>
          </div>
          <div className="mt-1 font-serif text-[20px] font-bold tracking-[0.24em]" style={{ color: '#fff4d4' }}>
            剧情编织
          </div>
          <div className="mt-1 max-w-2xl text-[12px] leading-relaxed" style={{ color: 'rgba(220,208,178,0.82)' }}>
            导入玩家自定义 TXT，将它拆成章节与分段，再分解为主剧情可读取的滑窗。这里负责章节结构、可见性边界、角色档案、地点档案与承接事实。
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <Pill text="TXT 导入" tone="gold" />
            <Pill text="章节滑窗" tone="cyan" />
            <Pill text="角色 / 地点 / 派系档案" tone="muted" />
            <Pill text={busyBatch ? `批量处理中：${busyBatch}` : '待机中'} tone={busyBatch ? 'gold' : 'muted'} />
          </div>
        </div>
        <div className="grid min-w-[340px] grid-cols-2 gap-2">
          <StatCard label="系列" value={String(seriesCount).padStart(2, '0')} tone="#f5d97a" />
          <StatCard label="章节" value={String(totalChapters).padStart(2, '0')} tone="#75d6d8" />
          <StatCard label="分段" value={String(totalSegments).padStart(2, '0')} tone="#b6d7ff" />
          <StatCard label="当前" value={activeSeries ? `${activeSeries.当前分段组号}` : '--'} tone="#d8b35f" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(8,7,9,0.55)',
        boxShadow: `inset 0 0 0 1px ${tone}33`,
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px]" style={{ color: 'rgba(220,208,178,0.72)' }}>{label}</div>
      <div className="mt-0.5 font-serif text-[16px] font-bold tracking-[0.18em]" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

function Pill({ text, tone }: { text: string; tone: 'gold' | 'cyan' | 'muted' }) {
  const color = tone === 'gold' ? '#f5d97a' : tone === 'cyan' ? '#75d6d8' : 'rgba(220,208,178,0.82)';
  const background = tone === 'gold' ? 'rgba(245,217,122,0.10)' : tone === 'cyan' ? 'rgba(117,214,216,0.08)' : 'rgba(255,255,255,0.03)';
  return (
    <span
      className="px-2.5 py-1"
      style={{
        color,
        background,
        boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.16)',
        clipPath: smallClip,
      }}
    >
      {text}
    </span>
  );
}

function SeriesControl({
  series,
  onRename,
  onToggleInjection,
  onRebuild,
  onBatchPending,
  onBatchFromCurrent,
  onBatchAll,
  onDelete,
  busy,
}: {
  series: 剧情编织系列;
  onRename: () => void;
  onToggleInjection: () => void;
  onRebuild: () => void;
  onBatchPending: () => void;
  onBatchFromCurrent: () => void;
  onBatchAll: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const done = series.分段列表.filter((item) => item.处理状态 === '已完成').length;
  return (
    <div className="mb-3 px-4 py-3" style={{ background: 'rgba(245,217,122,0.045)', boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.18)', clipPath: cardClip }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-serif text-base font-bold" style={{ color: '#f5d97a' }}>{series.标题}</div>
          <div className="mt-1 text-xs" style={{ color: 'rgba(190,178,148,0.78)' }}>
            {series.来源类型 === 'canon' ? '原著剧情轨道' : '玩家自制剧情'} · {series.章节列表.length} 章 · {series.分段列表.length} 段 · 已完成 {done} 段 · 每段 {series.每段章数} 章
          </div>
          {series.当前阶段概括 && (
            <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(220,208,178,0.82)' }}>
              {series.当前阶段概括}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {series.核心角色.slice(0, 4).map((item) => (
              <span key={item} className="px-2 py-1" style={{ background: 'rgba(245,217,122,0.08)', color: 'rgba(245,217,122,0.85)', clipPath: smallClip }}>
                {item}
              </span>
            ))}
            {series.涉及地点索引.slice(0, 3).map((item) => (
              <span key={item} className="px-2 py-1" style={{ background: 'rgba(145,210,175,0.08)', color: 'rgba(145,210,175,0.85)', clipPath: smallClip }}>
                {item}
              </span>
            ))}
            {series.涉及派系索引.slice(0, 3).map((item) => (
              <span key={item} className="px-2 py-1" style={{ background: 'rgba(160,168,245,0.08)', color: 'rgba(160,168,245,0.85)', clipPath: smallClip }}>
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="panel-btn" onClick={onRename}>重命名</button>
          <button className="panel-btn" onClick={onToggleInjection}>{series.激活注入 ? '暂停注入' : '启用注入'}</button>
          <button className="panel-btn" disabled={series.来源类型 === 'canon'} onClick={onRebuild}>重建分段</button>
          <button className="panel-btn" disabled={busy} onClick={onBatchPending}>分解待处理</button>
          <button className="panel-btn" disabled={busy} onClick={onBatchFromCurrent}>分解当前后续</button>
          <button className="panel-btn strong" disabled={busy} onClick={onBatchAll}>重分解全部</button>
          <button className="panel-btn danger" disabled={series.来源类型 === 'canon'} onClick={onDelete}>删除</button>
        </div>
      </div>
    </div>
  );
}

function SeriesTree({
  system,
  activeSeries,
  selectedSegmentId,
  expandedSeriesId,
  busyId,
  onSelectSeries,
  onSelectSegment,
  onSelectChapter,
}: {
  system: 剧情编织系统;
  activeSeries: 剧情编织系列;
  selectedSegmentId: string | null;
  expandedSeriesId: string | null;
  busyId: string | null;
  onSelectSeries: (series: 剧情编织系列) => void;
  onSelectSegment: (segment: 剧情编织分段) => void;
  onSelectChapter: (series: 剧情编织系列, chapterSeq: number) => void;
}) {
  return (
    <aside className="kaituo-options-scroll min-h-0 overflow-y-auto pr-1 pb-3">
      <div className="space-y-2">
        {system.系列列表.map((series) => {
          const active = series.id === activeSeries.id;
          const expanded = expandedSeriesId === series.id;
          const completeCount = series.分段列表.filter((item) => item.处理状态 === '已完成').length;
          return (
            <div key={series.id} style={{ boxShadow: `inset 0 0 0 1px ${active ? 'rgba(245,217,122,0.35)' : 'rgba(245,217,122,0.14)'}`, background: active ? 'rgba(245,217,122,0.055)' : 'rgba(10,9,10,0.42)', clipPath: cardClip }}>
              <button className="w-full px-3 py-2 text-left" onClick={() => onSelectSeries(series)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-serif text-xs font-bold" style={{ color: active ? '#f5d97a' : 'rgba(220,208,178,0.86)' }}>{series.标题}</span>
                  <span className="text-[11px]" style={{ color: series.激活注入 ? 'rgba(145,210,175,0.9)' : 'rgba(160,148,120,0.7)' }}>{series.激活注入 ? 'ON' : 'OFF'}</span>
                </div>
                <div className="mt-1 text-[11px]" style={{ color: 'rgba(160,148,120,0.75)' }}>
                  {series.来源类型 === 'canon' ? '原著' : '自制'} · {series.章节列表.length} 章 · {completeCount}/{series.分段列表.length} 段
                </div>
              </button>

              {expanded && (
                <div className="space-y-2 px-2 pb-2">
                  <div>
                    <div className="mb-1 px-1 text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.6)' }}>章节</div>
                    <div className="kaituo-options-scroll max-h-28 space-y-1 overflow-y-auto pr-1">
                      {series.章节列表.map((chapter) => (
                        <button
                          key={chapter.id}
                          className="w-full truncate px-2 py-1 text-left text-[11px]"
                          style={{ color: 'rgba(200,188,158,0.78)', background: 'rgba(245,217,122,0.035)', clipPath: smallClip }}
                          onClick={() => onSelectChapter(series, chapter.序号)}
                        >
                          {chapter.序号}. {chapter.标题}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 px-1 text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.6)' }}>分段</div>
                    <div className="space-y-1">
                      {series.分段列表.map((segment) => {
                        const selected = selectedSegmentId === segment.id;
                        const current = segment.运行状态 === '当前' || series.当前分段组号 === segment.组号;
                        const busy = busyId === segment.id;
                        return (
                          <button
                            key={segment.id}
                            onClick={() => onSelectSegment(segment)}
                            className="w-full px-2 py-2 text-left"
                            style={{
                              background: selected ? 'rgba(245,217,122,0.1)' : runtimeStatusBg[segment.运行状态] || statusBg[segment.处理状态],
                              boxShadow: `inset 0 0 0 1px ${current ? 'rgba(245,217,122,0.5)' : 'rgba(245,217,122,0.12)'}`,
                              clipPath: smallClip,
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate font-serif text-xs" style={{ color: selected ? '#f5d97a' : 'rgba(220,208,178,0.84)' }}>
                                {segment.组号}. {segment.标题}
                              </span>
                              <span className="text-[10px]" style={{ color: runtimeStatusColor[segment.运行状态] }}>
                                {segment.运行状态}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px]" style={{ color: statusColor[segment.处理状态] }}>
                              {busy ? '处理中...' : segment.处理状态} · {segment.章节范围}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function SegmentDetail({
  series,
  segment,
  draft,
  onDraftChange,
  busy,
  onDecompose,
  onSetCurrent,
  onSetRuntimeStatus,
  onSaveDraft,
  onResetDraft,
}: {
  series: 剧情编织系列;
  segment: 剧情编织分段;
  draft: SegmentDraft;
  onDraftChange: (draft: SegmentDraft) => void;
  busy: boolean;
  onDecompose: () => void;
  onSetCurrent: () => void;
  onSetRuntimeStatus: (status: 剧情编织运行状态) => void;
  onSaveDraft: () => void;
  onResetDraft: () => void;
}) {
  return (
    <div className="space-y-3">
      <div
        className="px-4 py-3"
        style={{ background: 'rgba(245,217,122,0.045)', boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.18)', clipPath: cardClip }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-serif text-base font-bold" style={{ color: '#f5d97a' }}>{segment.标题}</div>
            <div className="mt-1 text-xs" style={{ color: 'rgba(190,178,148,0.78)' }}>
              {series.标题} · {series.来源类型 === 'canon' ? '原著轨道' : '自制轨道'} · {segment.章节范围} · {segment.字数} 字 · {segment.启用注入 ? '参与注入' : '不注入'}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px]" style={{ color: 'rgba(160,148,120,0.78)' }}>运行状态</span>
              {runtimeStatusOptions.map((status) => {
                const active = segment.运行状态 === status;
                return (
                  <button
                    key={status}
                    type="button"
                    className="px-2 py-1 text-[11px] transition-all"
                    onClick={() => onSetRuntimeStatus(status)}
                    style={{
                      color: active ? '#fff4d4' : runtimeStatusColor[status],
                      background: active ? runtimeStatusBg[status] : 'rgba(8,7,9,0.36)',
                      boxShadow: `inset 0 0 0 1px ${active ? runtimeStatusColor[status] : 'rgba(245,217,122,0.12)'}`,
                      clipPath: smallClip,
                    }}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button className="panel-btn" onClick={onSetCurrent}>设为当前</button>
            <button className="panel-btn" onClick={onResetDraft}>还原草稿</button>
            <button className="panel-btn" onClick={onSaveDraft}>保存修改</button>
            <button className="panel-btn strong" disabled={busy} onClick={onDecompose}>
              {busy ? '分解中...' : segment.处理状态 === '已完成' ? '重新分解' : 'AI 分解'}
            </button>
          </div>
        </div>
        {segment.最近错误 && <div className="mt-2 text-xs" style={{ color: 'rgba(230,130,130,0.9)' }}>{segment.最近错误}</div>}
      </div>

      <ManualEditor draft={draft} onDraftChange={onDraftChange} />

      <InfoBlock title="本段概括" empty="尚未分解。" hasContent={Boolean(segment.本段概括.trim())}>
        {segment.本段概括}
      </InfoBlock>

      <InfoGrid
        items={[
          ['前段延续事实', segment.前段延续事实],
          ['本段结束状态', segment.本段结束状态],
          ['给后续参考', segment.给后续参考],
          ['登场角色', segment.登场角色],
          ['涉及地点', segment.涉及地点],
          ['涉及派系', segment.涉及派系],
        ]}
      />

      <InfoGrid
        items={[
          ['开局已成立事实', segment.开局已成立事实],
          ['时间线起点', segment.时间线起点 ? [segment.时间线起点] : []],
          ['时间线终点', segment.时间线终点 ? [segment.时间线终点] : []],
          ['时间线概览', segment.时间线.map((item) => `${item.时间锚点 || '未知'} · ${item.标题}`)],
        ]}
      />

      <InfoBlock title="原著硬约束" empty="暂无硬约束。" hasContent={segment.原著硬约束.length > 0}>
        <VisibleList items={segment.原著硬约束} />
      </InfoBlock>

      <InfoBlock title="可提前铺垫" empty="暂无可提前铺垫。" hasContent={segment.可提前铺垫.length > 0}>
        <VisibleList items={segment.可提前铺垫} />
      </InfoBlock>

      <InfoBlock title="关键事件" empty="暂无关键事件。" hasContent={segment.关键事件.length > 0}>
        <div className="space-y-2">
          {segment.关键事件.map((event, index) => (
            <div key={`${event.事件名}_${index}`} className="text-xs leading-relaxed" style={{ color: 'rgba(220,208,178,0.84)' }}>
              <span style={{ color: '#f5d97a' }}>[{index + 1}] {event.事件名 || '未命名事件'}</span>
              {event.事件说明 ? `：${event.事件说明}` : ''}
              {event.触发条件.length > 0 && <div className="mt-1" style={{ color: 'rgba(160,148,120,0.78)' }}>触发：{event.触发条件.join('；')}</div>}
              {event.事件结果.length > 0 && <div style={{ color: 'rgba(160,148,120,0.78)' }}>结果：{event.事件结果.join('；')}</div>}
            </div>
          ))}
        </div>
      </InfoBlock>

      <InfoBlock title="角色推进" empty="暂无角色推进。" hasContent={segment.角色推进.length > 0}>
        <div className="space-y-2">
          {segment.角色推进.map((item, index) => (
            <div key={`${item.角色名}_${index}`}>
              <div style={{ color: '#f5d97a' }}>{item.角色名}</div>
              <div className="mt-0.5" style={{ color: 'rgba(220,208,178,0.82)' }}>
                {[...item.本段变化, ...item.本段后状态, ...item.对后续影响].slice(0, 5).join('；') || '无'}
              </div>
            </div>
          ))}
        </div>
      </InfoBlock>

      <InfoBlock title="角色档案" empty="暂无角色档案。" hasContent={segment.角色档案.length > 0}>
        <div className="space-y-2">
          {segment.角色档案.map((item, index) => (
            <div key={`${item.名称}_${index}`}>
              <div style={{ color: '#f5d97a' }}>{item.名称} · {item.身份 || '无'}</div>
              <div className="mt-0.5" style={{ color: 'rgba(220,208,178,0.82)' }}>
                {item.所属势力 || '无'} · {item.初始立场 || '无'} · {item.重要性}
              </div>
            </div>
          ))}
        </div>
      </InfoBlock>

      <InfoBlock title="势力档案" empty="暂无势力档案。" hasContent={segment.势力档案.length > 0}>
        <div className="space-y-2">
          {segment.势力档案.map((item, index) => (
            <div key={`${item.名称}_${index}`}>
              <div style={{ color: '#f5d97a' }}>{item.名称} · {item.类型 || '无'}</div>
              <div className="mt-0.5" style={{ color: 'rgba(220,208,178,0.82)' }}>
                {item.地盘 || '无'} · {item.立场目标 || '无'}
              </div>
            </div>
          ))}
        </div>
      </InfoBlock>

      <InfoBlock title="地点档案" empty="暂无地点档案。" hasContent={segment.地图地点档案.length > 0}>
        <div className="space-y-2">
          {segment.地图地点档案.map((item, index) => (
            <div key={`${item.名称}_${index}`}>
              <div style={{ color: '#f5d97a' }}>{item.名称} · {item.层级}</div>
              <div className="mt-0.5" style={{ color: 'rgba(220,208,178,0.82)' }}>
                {item.上级地点 || '无'} · {item.所属势力 || '无'}
              </div>
            </div>
          ))}
        </div>
      </InfoBlock>

      <InfoBlock title="原文预览" empty="无原文。" hasContent={Boolean(segment.原文内容.trim())}>
        <pre
          className="kaituo-options-scroll max-h-80 overflow-y-auto whitespace-pre-wrap pr-2 text-xs leading-relaxed"
          style={{ color: 'rgba(200,188,158,0.78)' }}
        >
          {segment.原文内容}
        </pre>
      </InfoBlock>
    </div>
  );
}

function ManualEditor({ draft, onDraftChange }: { draft: SegmentDraft; onDraftChange: (draft: SegmentDraft) => void }) {
  const patch = (next: Partial<SegmentDraft>) => onDraftChange({ ...draft, ...next });
  return (
    <div className="space-y-3 px-3 py-3" style={{ background: 'rgba(10,9,10,0.42)', boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.16)', clipPath: cardClip }}>
      <div className="font-serif text-[12px] tracking-[0.2em]" style={{ color: 'rgba(245,217,122,0.78)' }}>手工校订</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <div className="mb-1 text-[11px]" style={{ color: 'rgba(160,148,120,0.82)' }}>分段标题</div>
          <input value={draft.标题} onChange={(e) => patch({ 标题: e.target.value })} className="kaituo-input w-full px-2.5 py-2 text-sm" style={{ clipPath: smallClip }} />
        </label>
        <label className="block">
          <div className="mb-1 text-[11px]" style={{ color: 'rgba(160,148,120,0.82)' }}>章节范围</div>
          <input value={draft.章节范围} onChange={(e) => patch({ 章节范围: e.target.value })} className="kaituo-input w-full px-2.5 py-2 text-sm" style={{ clipPath: smallClip }} />
        </label>
      </div>
      <label className="flex items-center justify-between gap-3 px-2 py-2" style={{ background: 'rgba(245,217,122,0.04)', clipPath: smallClip }}>
        <span className="text-xs" style={{ color: 'rgba(220,208,178,0.82)' }}>参与主剧情滑窗注入</span>
        <input type="checkbox" checked={draft.启用注入} onChange={(e) => patch({ 启用注入: e.target.checked })} />
      </label>
      <TextAreaField label="本段概括" value={draft.本段概括} rows={4} onChange={(value) => patch({ 本段概括: value })} />
      <div className="grid grid-cols-2 gap-2">
        <TextAreaField label="前段延续事实" value={draft.前段延续事实} rows={4} onChange={(value) => patch({ 前段延续事实: value })} />
        <TextAreaField label="本段结束状态" value={draft.本段结束状态} rows={4} onChange={(value) => patch({ 本段结束状态: value })} />
        <TextAreaField label="给后续参考" value={draft.给后续参考} rows={4} onChange={(value) => patch({ 给后续参考: value })} />
        <TextAreaField label="登场角色" value={draft.登场角色} rows={4} onChange={(value) => patch({ 登场角色: value })} />
        <TextAreaField label="涉及地点" value={draft.涉及地点} rows={3} onChange={(value) => patch({ 涉及地点: value })} />
        <TextAreaField label="涉及派系" value={draft.涉及派系} rows={3} onChange={(value) => patch({ 涉及派系: value })} />
      </div>
    </div>
  );
}

function TextAreaField({ label, value, rows, onChange }: { label: string; value: string; rows: number; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px]" style={{ color: 'rgba(160,148,120,0.82)' }}>{label}</div>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="kaituo-input w-full px-2.5 py-2 text-xs leading-relaxed"
        style={{ clipPath: smallClip }}
      />
    </label>
  );
}

function InfoGrid({ items }: { items: Array<[string, string[]]> }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([title, values]) => (
        <InfoBlock key={title} title={title} empty="无" hasContent={values.length > 0}>
          <div className="space-y-1">
            {values.map((value, index) => <div key={`${value}_${index}`}>- {value}</div>)}
          </div>
        </InfoBlock>
      ))}
    </div>
  );
}

function InfoBlock({ title, empty, children, hasContent = true }: { title: string; empty: string; children: React.ReactNode; hasContent?: boolean }) {
  return (
    <div className="px-3 py-3 text-xs leading-relaxed" style={{ background: 'rgba(10,9,10,0.42)', boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.14)', clipPath: smallClip, color: 'rgba(220,208,178,0.84)' }}>
      <div className="mb-2 font-serif text-[12px] tracking-[0.2em]" style={{ color: 'rgba(245,217,122,0.78)' }}>{title}</div>
      {hasContent ? children : <span style={{ color: 'rgba(160,148,120,0.62)' }}>{empty}</span>}
    </div>
  );
}

function VisibleList({ items }: { items: 剧情编织分段['原著硬约束'] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item.内容}_${index}`}>
          <div>- {item.内容}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'rgba(160,148,120,0.78)' }}>
            谁知道：{item.信息可见性.谁知道.join('、') || '未限定'} · 谁不知道：{item.信息可见性.谁不知道.join('、') || '未限定'} · {item.信息可见性.是否仅读者视角可见 ? '仅读者视角' : '可公开承接'}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex min-h-56 items-center justify-center px-4 py-8 text-center font-serif text-xs italic tracking-[0.18em]"
      style={{ color: 'rgba(160,148,120,0.65)', boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.15)', clipPath: cardClip }}
    >
      导入 TXT 后，剧情会被拆成可分解、可校订、可注入主剧情的章节段落。
    </div>
  );
}

function TrackEmptyState({ trackTab }: { trackTab: TrackTab }) {
  return (
    <div
      className="flex min-h-56 flex-1 items-center justify-center px-4 py-8 text-center font-serif text-xs italic tracking-[0.18em]"
      style={{ color: 'rgba(160,148,120,0.65)', boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.15)', clipPath: cardClip }}
    >
      {trackTab === 'canon'
        ? '暂无原著剧情轨道。点击“恢复内置原著”后会显示内置主线。'
        : '暂无自制剧情轨道。导入 TXT 或粘贴文本后会显示玩家自制剧情。'}
    </div>
  );
}
