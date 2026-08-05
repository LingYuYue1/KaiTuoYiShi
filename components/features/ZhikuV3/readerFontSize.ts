import { useCallback, useEffect, useState, type CSSProperties } from 'react';

export const ZHIKU_READER_FONT_SIZE_MIN = 14;
export const ZHIKU_READER_FONT_SIZE_MAX = 24;
export const ZHIKU_READER_FONT_SIZE_DEFAULT = 17;

const ZHIKU_READER_FONT_SIZE_STORAGE_KEY = 'kaituo-zhiku-reader-font-size';

function clampReaderFontSize(value: number): number {
  if (!Number.isFinite(value)) return ZHIKU_READER_FONT_SIZE_DEFAULT;
  return Math.min(ZHIKU_READER_FONT_SIZE_MAX, Math.max(ZHIKU_READER_FONT_SIZE_MIN, Math.round(value)));
}

function readStoredReaderFontSize(): number {
  if (typeof window === 'undefined') return ZHIKU_READER_FONT_SIZE_DEFAULT;

  try {
    const storedValue = window.localStorage.getItem(ZHIKU_READER_FONT_SIZE_STORAGE_KEY);
    return storedValue === null
      ? ZHIKU_READER_FONT_SIZE_DEFAULT
      : clampReaderFontSize(Number(storedValue));
  } catch {
    return ZHIKU_READER_FONT_SIZE_DEFAULT;
  }
}

export function buildZhikuReaderStyle(fontSize: number): CSSProperties {
  const normalizedSize = clampReaderFontSize(fontSize);
  return {
    '--zhiku-reader-font-size': `${normalizedSize}px`,
    '--zhiku-reader-lead-font-size': `${normalizedSize + 1}px`,
    '--zhiku-reader-heading-font-size': `${normalizedSize + 6}px`,
    '--zhiku-reader-subheading-font-size': `${normalizedSize + 2}px`,
    '--zhiku-reader-injection-font-size': `${Math.max(ZHIKU_READER_FONT_SIZE_MIN, normalizedSize - 1)}px`,
    '--zhiku-reader-dropcap-font-size': `${Math.round(normalizedSize * 2.3)}px`,
  } as CSSProperties;
}

export function useZhikuReaderFontSize() {
  const [fontSize, setFontSize] = useState(readStoredReaderFontSize);

  useEffect(() => {
    try {
      window.localStorage.setItem(ZHIKU_READER_FONT_SIZE_STORAGE_KEY, String(fontSize));
    } catch {
      // Reading remains usable when browser storage is unavailable.
    }
  }, [fontSize]);

  const decreaseFontSize = useCallback(() => {
    setFontSize((current) => clampReaderFontSize(current - 1));
  }, []);

  const increaseFontSize = useCallback(() => {
    setFontSize((current) => clampReaderFontSize(current + 1));
  }, []);

  return {
    fontSize,
    decreaseFontSize,
    increaseFontSize,
  };
}
