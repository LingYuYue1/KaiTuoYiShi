import { Minus, Plus, RefreshCw, Type } from 'lucide-react';
import { ZHIKU_READER_FONT_SIZE_MAX, ZHIKU_READER_FONT_SIZE_MIN } from './readerFontSize';

export type ReaderRefreshStatus = 'idle' | 'loading' | 'done' | 'recovered' | 'error';

interface ArchiveReaderControlsProps {
  fontSize: number;
  onDecreaseFontSize: () => void;
  onIncreaseFontSize: () => void;
  onRefresh?: () => void;
  refreshStatus?: ReaderRefreshStatus;
}

const REFRESH_LABELS: Record<ReaderRefreshStatus, string> = {
  idle: '重载内置档案',
  loading: '正在重载内置档案',
  done: '内置档案已更新',
  recovered: '新目录不可用，已恢复最近一次完整档案',
  error: '重载失败，已保留当前档案',
};

export function ArchiveReaderControls({
  fontSize,
  onDecreaseFontSize,
  onIncreaseFontSize,
  onRefresh,
  refreshStatus = 'idle',
}: ArchiveReaderControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="zj-chip" role="group" aria-label={`档案阅读字号，当前 ${fontSize} 像素`}>
        <Type size={12} strokeWidth={1.6} aria-hidden="true" />
        <button
          type="button"
          onClick={onDecreaseFontSize}
          disabled={fontSize <= ZHIKU_READER_FONT_SIZE_MIN}
          aria-label="减小档案字号"
          title="减小档案字号"
          className="px-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus size={12} strokeWidth={1.9} aria-hidden="true" />
        </button>
        <output aria-live="polite" aria-atomic="true" className="w-6 text-center" style={{ color: 'rgb(var(--tj-tech-cyan))' }}>
          {fontSize}
        </output>
        <button
          type="button"
          onClick={onIncreaseFontSize}
          disabled={fontSize >= ZHIKU_READER_FONT_SIZE_MAX}
          aria-label="增大档案字号"
          title="增大档案字号"
          className="px-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={12} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>
      {onRefresh && (
        <button
          type="button"
          className="zj-chip"
          data-refresh-status={refreshStatus}
          onClick={onRefresh}
          disabled={refreshStatus === 'loading'}
          aria-label={REFRESH_LABELS[refreshStatus]}
          aria-busy={refreshStatus === 'loading'}
          title={REFRESH_LABELS[refreshStatus]}
        >
          <RefreshCw size={12} strokeWidth={1.8} aria-hidden="true" className={refreshStatus === 'loading' ? 'zj-spin' : undefined} />
          {REFRESH_LABELS[refreshStatus]}
        </button>
      )}
    </div>
  );
}
