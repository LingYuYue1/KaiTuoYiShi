import { useCallback, useEffect, useState, type CSSProperties } from 'react';

export const ZHIKU_READER_FONT_SIZE_MIN = 14;
export const ZHIKU_READER_FONT_SIZE_MAX = 24;
export const ZHIKU_READER_FONT_SIZE_DEFAULT = 17;

const ZHIKU_READER_FONT_SIZE_STORAGE_KEY = 'kaituo-zhiku-reader-font-size';

export function clampZhikuReaderFontSize(value: number): number {
  if (!Number.isFinite(value)) return ZHIKU_READER_FONT_SIZE_DEFAULT;
  return Math.min(ZHIKU_READER_FONT_SIZE_MAX, Math.max(ZHIKU_READER_FONT_SIZE_MIN, Math.round(value)));
}

function readStoredReaderFontSize(): number {
  if (typeof window === 'undefined') return ZHIKU_READER_FONT_SIZE_DEFAULT;
  try {
    const stored = window.localStorage.getItem(ZHIKU_READER_FONT_SIZE_STORAGE_KEY);
    return stored === null ? ZHIKU_READER_FONT_SIZE_DEFAULT : clampZhikuReaderFontSize(Number(stored));
  } catch {
    return ZHIKU_READER_FONT_SIZE_DEFAULT;
  }
}

export function buildZhikuReaderStyle(fontSize: number): CSSProperties {
  return { fontSize: `${clampZhikuReaderFontSize(fontSize)}px`, lineHeight: 2 };
}

export function useZhikuReaderFontSize() {
  const [fontSize, setFontSize] = useState(readStoredReaderFontSize);

  useEffect(() => {
    try {
      window.localStorage.setItem(ZHIKU_READER_FONT_SIZE_STORAGE_KEY, String(fontSize));
    } catch {
      // 浏览器存储不可用时阅读仍然可用。
    }
  }, [fontSize]);

  const decreaseFontSize = useCallback(() => {
    setFontSize((current) => clampZhikuReaderFontSize(current - 1));
  }, []);
  const increaseFontSize = useCallback(() => {
    setFontSize((current) => clampZhikuReaderFontSize(current + 1));
  }, []);

  return { fontSize, decreaseFontSize, increaseFontSize };
}
