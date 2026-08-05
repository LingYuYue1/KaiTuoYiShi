import { Minus, Plus, RefreshCw, Type } from 'lucide-react';
import {
  ZHIKU_READER_FONT_SIZE_MAX,
  ZHIKU_READER_FONT_SIZE_MIN,
} from './readerFontSize';
import './reader-font-size-control.css';

interface ReaderFontSizeControlProps {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onRefresh?: () => void;
  refreshStatus?: ReaderRefreshStatus;
}

export type ReaderRefreshStatus = 'idle' | 'loading' | 'done' | 'error';

const REFRESH_STATUS_LABELS: Record<ReaderRefreshStatus, string> = {
  idle: '刷新内置智库',
  loading: '正在刷新内置智库',
  done: '内置智库已刷新',
  error: '内置智库刷新失败，请重试',
};

export function ReaderFontSizeControl({
  value,
  onDecrease,
  onIncrease,
  onRefresh,
  refreshStatus = 'idle',
}: ReaderFontSizeControlProps) {
  const refreshLabel = REFRESH_STATUS_LABELS[refreshStatus];

  return (
    <div
      className="zhiku-v3-reader-font-control"
      data-has-refresh={onRefresh ? 'true' : 'false'}
      role="group"
      aria-label={`档案阅读字号，当前 ${value} 像素`}
    >
      <Type className="zhiku-v3-reader-font-control__type" size={14} strokeWidth={1.6} aria-hidden="true" />
      <button
        type="button"
        onClick={onDecrease}
        disabled={value <= ZHIKU_READER_FONT_SIZE_MIN}
        aria-label="减小档案字号"
        title="减小档案字号"
      >
        <Minus size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <output aria-live="polite" aria-atomic="true">{value}</output>
      <button
        type="button"
        onClick={onIncrease}
        disabled={value >= ZHIKU_READER_FONT_SIZE_MAX}
        aria-label="增大档案字号"
        title="增大档案字号"
      >
        <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {onRefresh && (
        <button
          type="button"
          className="zhiku-v3-reader-font-control__refresh"
          data-refresh-status={refreshStatus}
          onClick={onRefresh}
          disabled={refreshStatus === 'loading'}
          aria-label={refreshLabel}
          aria-busy={refreshStatus === 'loading'}
          title={refreshLabel}
        >
          <RefreshCw size={14} strokeWidth={1.7} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
