import { Minus, Plus, Type } from 'lucide-react';
import {
  ZHIKU_READER_FONT_SIZE_MAX,
  ZHIKU_READER_FONT_SIZE_MIN,
} from './readerFontSize';
import './reader-font-size-control.css';

interface ReaderFontSizeControlProps {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}

export function ReaderFontSizeControl({
  value,
  onDecrease,
  onIncrease,
}: ReaderFontSizeControlProps) {
  return (
    <div
      className="zhiku-v2-reader-font-control"
      role="group"
      aria-label={`档案阅读字号，当前 ${value} 像素`}
    >
      <Type className="zhiku-v2-reader-font-control__type" size={14} strokeWidth={1.6} aria-hidden="true" />
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
    </div>
  );
}
