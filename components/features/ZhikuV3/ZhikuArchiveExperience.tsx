import { ArrowLeft, Settings2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ZhikuCatalogStatus } from '@/models/zhiku';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统 } from '@/models/zhiku';
import { buildZhikuArchiveView, type ZhikuArchiveCategoryId } from '@/services/zhikuArchive';
import { devLogError } from '@/utils/devLog';
import { ArchiveCategoryView } from './ArchiveCategoryView';
import { ArchiveLobby } from './ArchiveLobby';
import { ArchiveReaderControls, type ReaderRefreshStatus } from './ArchiveReaderControls';
import { ArchiveStoryView } from './ArchiveStoryView';
import { useZhikuReaderFontSize } from './readerFontSize';
import './zhiku-archive.css';

type ArchiveView =
  | { kind: 'lobby' }
  | { kind: 'category'; id: ZhikuArchiveCategoryId }
  | { kind: 'story' };

interface ZhikuArchiveExperienceProps {
  zhikuSystem: 智库系统;
  storyWeavingSystem: 剧情编织系统;
  onZhikuSystemChange: Dispatch<SetStateAction<智库系统>>;
  onRefreshBundled?: (current: 智库系统) => Promise<智库系统>;
  onManage?: () => void;
  onClose?: () => void;
  /** 目录就绪信号（首页入口由 boot 状态驱动，会话内默认 ready）：驱动 data-catalog-status 断言与空态区分。 */
  catalogStatus?: ZhikuCatalogStatus;
}

export function ZhikuArchiveExperience({
  zhikuSystem,
  storyWeavingSystem,
  onZhikuSystemChange,
  onRefreshBundled,
  onManage,
  onClose,
  catalogStatus = 'ready',
}: ZhikuArchiveExperienceProps) {
  const [view, setView] = useState<ArchiveView>({ kind: 'lobby' });
  const [refreshStatus, setRefreshStatus] = useState<ReaderRefreshStatus>('idle');
  const refreshTimerRef = useRef<number | null>(null);
  const { fontSize, decreaseFontSize, increaseFontSize } = useZhikuReaderFontSize();
  const archive = useMemo(
    () => buildZhikuArchiveView(zhikuSystem, storyWeavingSystem),
    [storyWeavingSystem, zhikuSystem],
  );

  useEffect(() => () => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (view.kind !== 'lobby') {
        setView({ kind: 'lobby' });
        return;
      }
      onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, view.kind]);

  const scheduleRefreshIdle = (delay: number) => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshStatus('idle');
    }, delay);
  };

  const handleRefreshBundled = async () => {
    if (!onRefreshBundled || refreshStatus === 'loading') return;
    setRefreshStatus('loading');
    try {
      const next = await onRefreshBundled(zhikuSystem);
      onZhikuSystemChange(next);
      setRefreshStatus('done');
      scheduleRefreshIdle(2000);
    } catch (error) {
      devLogError('ui', 'zhiku-archive-refresh-failed', error);
      setRefreshStatus('error');
      scheduleRefreshIdle(3200);
    }
  };

  const selectedCategory = view.kind === 'category'
    ? archive.categories.find((category) => category.id === view.id)
    : undefined;
  const lobbyCategories = archive.categories.map((category) => ({
    id: category.id,
    label: category.label,
    count: category.count,
    countLabel: category.id === 'story'
      ? `${category.count} 卷 / ${archive.chapterCount} 章`
      : `${category.count} 条`,
  }));
  const subtitle = view.kind === 'lobby'
    ? `${archive.itemCount} 条资料 · ${archive.volumes.length} 部卷宗 · ${archive.chapterCount} 个章节`
    : view.kind === 'story'
      ? `${archive.volumes.length} 部卷宗 · ${archive.chapterCount} 个章节`
      : '按条目翻阅档案与注入内容';
  const title = view.kind === 'lobby' ? '智库档案' : view.kind === 'story' ? '剧情档案' : selectedCategory?.label ?? '智库档案';

  return (
    <div
      className="zj-root"
      data-view={view.kind}
      data-catalog-status={catalogStatus}
    >
      <header className="zj-topbar">
        <div className="min-w-0">
          <div className="zj-kicker">ZHIKU // ARCHIVE</div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {view.kind !== 'lobby' && (
              <button
                type="button"
                className="zj-chip"
                onClick={() => setView({ kind: 'lobby' })}
                aria-label="返回分类大厅"
                title="返回分类大厅"
              >
                <ArrowLeft size={12} strokeWidth={1.8} aria-hidden="true" />
                返回
              </button>
            )}
            <h1 className="zj-title">{title}</h1>
          </div>
          <p className="zj-subtitle">{subtitle}</p>
        </div>
        <div className="zj-actions">
          <ArchiveReaderControls
            fontSize={fontSize}
            onDecreaseFontSize={decreaseFontSize}
            onIncreaseFontSize={increaseFontSize}
            onRefresh={onRefreshBundled ? () => void handleRefreshBundled() : undefined}
            refreshStatus={refreshStatus}
          />
          {onManage && (
            <button type="button" className="zj-chip" onClick={onManage} aria-label="打开智库维护">
              <Settings2 size={12} strokeWidth={1.7} aria-hidden="true" />
              维护
            </button>
          )}
          {onClose && (
            <button type="button" className="zj-chip" onClick={onClose} aria-label="关闭智库" title="关闭智库">
              <X size={13} strokeWidth={1.7} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div className="zj-stage">
        {view.kind === 'lobby' ? (
          <ArchiveLobby
            categories={lobbyCategories}
            itemCount={archive.itemCount}
            chapterCount={archive.chapterCount}
            onSelect={(id) => setView(id === 'story' ? { kind: 'story' } : { kind: 'category', id })}
          />
        ) : view.kind === 'story' ? (
          <ArchiveStoryView key="story" volumes={archive.volumes} fontSize={fontSize} />
        ) : (
          <ArchiveCategoryView
            key={view.id}
            category={{ id: view.id, label: selectedCategory?.label ?? '档案' }}
            items={archive.itemsByCategory[view.id === 'story' ? 'character' : view.id]}
            fontSize={fontSize}
          />
        )}
      </div>
    </div>
  );
}
