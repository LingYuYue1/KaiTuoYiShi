import { useMemo, useState } from 'react';
import type { 图片生成任务, 相册条目, 相册系统 } from '@/models/imageGeneration';
import { 解析相册资源地址 } from '@/utils/albumActions';
import { activeAccentSurface, activeTextColor, bodyColor, cardClip, cardSurface, faintColor, heroGridBackgroundStyle, heroSurface, imageWellSurface, mutedColor, nsfwColor, smallClip, titleColor } from './foundation';
import { ImagePreviewModal, PromptBlock, SafeAlbumImage, formatGenerationDate, generationSourceLabel, historyKind, historyKindLabel, historyKindTone, imageBackendLabel, slotLabel, statusLabel, taskPromptTitle, taskStatusTone } from './workspaces';

type TaskFeedFilter = 'all' | 'active' | 'failed' | 'character' | 'scene' | 'snapshot' | 'phone';
type FeedItem =
  | { kind: 'image'; createdAt: number; entry: 相册条目; src: string; task?: 图片生成任务 }
  | { kind: 'task'; createdAt: number; task: 图片生成任务; orphaned: boolean };

export function buildImageTaskFeed(album: 相册系统, includeNsfw: boolean): FeedItem[] {
  const assets = new Map(album.assets.map((asset) => [asset.id, asset]));
  const successfulTasks = new Map<string, 图片生成任务>();
  for (const task of album.tasks) {
    if (task.status !== 'success' || !task.resultAssetId) continue;
    const current = successfulTasks.get(task.resultAssetId);
    if (!current || task.createdAt > current.createdAt) successfulTasks.set(task.resultAssetId, task);
  }
  const entryAssetIds = new Set(album.entries.map((entry) => entry.assetId));
  const images: FeedItem[] = album.entries
    .filter((entry) => includeNsfw || !entry.nsfw)
    .map((entry) => {
      const asset = assets.get(entry.assetId);
      return {
        kind: 'image' as const,
        createdAt: entry.createdAt,
        entry,
        src: 解析相册资源地址(asset) || '',
        task: successfulTasks.get(entry.assetId),
      };
    });
  const taskItems: FeedItem[] = album.tasks
    .filter((task) => includeNsfw || !task.nsfw)
    .flatMap((task) => {
      const orphaned = task.status === 'success' && (!task.resultAssetId || !entryAssetIds.has(task.resultAssetId));
      if (task.status === 'success' && !orphaned) return [];
      return [{ kind: 'task' as const, createdAt: task.createdAt, task, orphaned }];
    });
  return [...images, ...taskItems].sort((a, b) => b.createdAt - a.createdAt);
}

export function ImageTaskWorkspace({ album, includeNsfw, onSelectEntry, onRetry }: {
  album: 相册系统;
  includeNsfw: boolean;
  onSelectEntry: (id: string) => void;
  onRetry: (task?: 图片生成任务) => void;
}) {
  const [filter, setFilter] = useState<TaskFeedFilter>('all');
  const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);
  const items = useMemo(() => buildImageTaskFeed(album, includeNsfw), [album, includeNsfw]);
  const stats = useMemo(() => ({
    active: album.tasks.filter((task) => (task.status === 'queued' || task.status === 'running') && (includeNsfw || !task.nsfw)).length,
    failed: album.tasks.filter((task) => task.status === 'failed' && (includeNsfw || !task.nsfw)).length,
    images: album.entries.filter((entry) => includeNsfw || !entry.nsfw).length,
  }), [album.entries, album.tasks, includeNsfw]);
  const visibleItems = items.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'active') return item.kind === 'task' && (item.task.status === 'queued' || item.task.status === 'running');
    if (filter === 'failed') return item.kind === 'task' && (item.task.status === 'failed' || item.orphaned);
    return item.kind === 'image' && historyKind(item.entry) === filter;
  });
  const filters: Array<{ id: TaskFeedFilter; label: string }> = [
    { id: 'all', label: '全部' }, { id: 'active', label: '进行中' }, { id: 'failed', label: '失败 / 异常' },
    { id: 'character', label: '角色' }, { id: 'scene', label: '场景' }, { id: 'snapshot', label: '快照' }, { id: 'phone', label: '手机' },
  ];
  return (
    <div className="space-y-4">
      <section className="px-4 py-4" style={{ background: heroSurface, ...heroGridBackgroundStyle, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.36), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.34)', clipPath: cardClip }}>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="font-serif text-xs tracking-[0.32em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.72)' }}>◆ 图片任务</div><div className="mt-1 font-serif text-xl font-bold tracking-[0.18em]" style={{ color: titleColor }}>统一图片时间流</div><p className="mt-2 max-w-2xl text-xs leading-relaxed" style={{ color: mutedColor }}>导入和生成是同一条图片生命周期；成功任务直接沉淀为图片，只有进行中、失败和结果缺失的任务才单独占位。</p></div><div className="grid grid-cols-3 gap-2 text-center">{[['进行中', stats.active], ['失败', stats.failed], ['图片', stats.images]].map(([label, value]) => <div key={String(label)} className="min-w-[62px] px-3 py-2" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}><div className="font-serif text-base font-bold" style={{ color: label === '失败' ? 'rgba(var(--tj-danger),0.94)' : titleColor }}>{value}</div><div className="mt-0.5 text-[10px] tracking-[0.12em]" style={{ color: faintColor }}>{label}</div></div>)}</div></div>
        <div className="mt-4 flex flex-wrap gap-2">{filters.map((option) => <button key={option.id} type="button" onClick={() => setFilter(option.id)} className="px-3 py-2 text-xs tracking-[0.12em]" style={{ color: filter === option.id ? activeTextColor : bodyColor, background: filter === option.id ? activeAccentSurface : 'rgba(var(--tj-ui-panel-strong),0.42)', boxShadow: filter === option.id ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.42)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)', clipPath: smallClip }}>{option.label}</button>)}</div>
      </section>
      {!visibleItems.length ? <TaskFeedEmpty filter={filter} /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleItems.map((item) => item.kind === 'image' ? <ImageTaskCard key={`entry:${item.entry.id}`} item={item} onSelect={onSelectEntry} onPreview={setPreview} /> : <PendingTaskCard key={`task:${item.task.id}`} item={item} onRetry={onRetry} />)}</div>}
      <ImagePreviewModal open={Boolean(preview?.src)} src={preview?.src || ''} title={`图片预览 · ${preview?.title || ''}`} onClose={() => setPreview(null)} />
    </div>
  );
}

function ImageTaskCard({ item, onSelect, onPreview }: { item: Extract<FeedItem, { kind: 'image' }>; onSelect: (id: string) => void; onPreview: (value: { src: string; title: string }) => void }) {
  const imageKind = historyKind(item.entry);
  const tone = historyKindTone(imageKind);
  const source = item.task ? generationSourceLabel(item.task.source) : '导入 / 收录';
  return <article className="overflow-hidden" style={{ background: cardSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.14)', clipPath: cardClip }}><button type="button" onClick={() => { onSelect(item.entry.id); if (item.src) onPreview({ src: item.src, title: item.entry.title }); }} className="group block w-full text-left"><div className="aspect-[4/3]" style={{ background: imageWellSurface }}><SafeAlbumImage src={item.src} alt={item.entry.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" emptyLabel="无图片" failedLabel="图片失效" /></div></button><div className="space-y-2 px-3 py-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-serif text-sm font-bold tracking-[0.08em]" style={{ color: titleColor }}>{item.entry.title}</div><div className="mt-1 text-[11px]" style={{ color: faintColor }}>{slotLabel(item.entry.slot)} · {formatGenerationDate(item.entry.createdAt)}</div></div><span className="shrink-0 px-2 py-1 text-[10px]" style={{ color: tone.color, background: tone.background, boxShadow: `inset 0 0 0 1px ${tone.border}`, clipPath: smallClip }}>{historyKindLabel(imageKind)}</span></div><div className="text-[11px]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.8)' }}>{source}</div>{item.task && <details><summary className="cursor-pointer text-[11px] tracking-[0.1em]" style={{ color: mutedColor }}>生成详情</summary><div className="mt-2 space-y-2 text-xs" style={{ color: mutedColor }}><div>{imageBackendLabel(item.task.backend)} · 重试 {item.task.retryCount} 次</div>{item.task.finalPrompt || item.task.prompt ? <PromptBlock title="正向提示词" text={item.task.finalPrompt || item.task.prompt} /> : null}</div></details>}</div></article>;
}

function PendingTaskCard({ item, onRetry }: { item: Extract<FeedItem, { kind: 'task' }>; onRetry: (task?: 图片生成任务) => void }) {
  const tone = taskStatusTone(item.task.status);
  const label = item.orphaned ? '结果缺失' : statusLabel(item.task.status);
  return <article className="flex min-h-[210px] flex-col justify-between px-4 py-4" style={{ background: cardSurface, boxShadow: `inset 0 0 0 1px ${item.orphaned ? 'rgba(var(--tj-tech-cyan),0.32)' : tone.border}`, clipPath: cardClip }}><div><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-serif text-sm font-bold tracking-[0.08em]" style={{ color: titleColor }}>{taskPromptTitle(item.task)}</div><div className="mt-1 text-[11px]" style={{ color: mutedColor }}>{slotLabel(item.task.slot)} · {imageBackendLabel(item.task.backend)}</div></div><span className="shrink-0 px-2 py-1 text-[10px]" style={{ color: item.orphaned ? 'rgba(var(--tj-tech-cyan),0.94)' : tone.color, background: item.orphaned ? 'rgba(var(--tj-tech-cyan),0.08)' : tone.background, boxShadow: `inset 0 0 0 1px ${item.orphaned ? 'rgba(var(--tj-tech-cyan),0.24)' : tone.border}`, clipPath: smallClip }}>{label}</span></div><div className="mt-4 text-xs leading-relaxed" style={{ color: item.orphaned ? 'rgba(var(--tj-tech-cyan),0.9)' : mutedColor }}>{item.orphaned ? '任务已成功结束，但图片未进入相册，记录保留供排查。' : item.task.error || `创建于 ${formatGenerationDate(item.task.createdAt)}`}</div></div><div className="mt-4 space-y-2">{item.task.status === 'failed' && <button type="button" onClick={() => onRetry(item.task)} className="w-full px-3 py-2 font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.94)', background: 'rgba(var(--tj-btn-primary-start),0.075)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.24)', clipPath: smallClip }}>重试</button>}<details><summary className="cursor-pointer text-[11px] tracking-[0.1em]" style={{ color: mutedColor }}>任务详情</summary><div className="mt-2 text-xs" style={{ color: mutedColor }}>来源：{generationSourceLabel(item.task.source)} · 重试：{item.task.retryCount} 次</div></details></div></article>;
}

function TaskFeedEmpty({ filter }: { filter: TaskFeedFilter }) {
  return <div className="px-4 py-16 text-center" style={{ color: faintColor, background: 'rgba(var(--tj-ui-panel),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.15)', clipPath: cardClip }}><div className="font-serif text-sm tracking-[0.24em]">{filter === 'all' ? '暂无图片任务' : '当前筛选下暂无记录'}</div><div className="mt-2 text-xs">生成或导入图片后，会在这里按时间汇总。</div></div>;
}
