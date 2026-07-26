export type DevLogCategory = 'turn' | 'stage' | 'net' | 'save' | 'retry' | 'recover' | 'ui';

// 与 ZhikuPanel.tsx 相同的本地窄化写法：不得用 /// <reference types="vite/client" />——
// 三斜线引用会把 vite/client 的 ImportMeta 增强注入整个程序，改变全仓库的类型推断。
const IS_DEV_BUILD = typeof import.meta !== 'undefined'
  && Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

export interface DevLogEntry {
  ts: number;
  category: DevLogCategory;
  event: string;
  data?: Record<string, unknown>;
  err?: unknown;
}

const MAX_DEV_LOG_ENTRIES = 1000;
const devLogEntries: DevLogEntry[] = [];

function appendDevLogEntry(entry: DevLogEntry): void {
  devLogEntries.push(entry);
  if (devLogEntries.length > MAX_DEV_LOG_ENTRIES) {
    devLogEntries.shift();
  }
}

export function devLog(
  category: DevLogCategory,
  event: string,
  data?: Record<string, unknown>,
): void {
  try {
    const entry: DevLogEntry = { ts: Date.now(), category, event };
    if (data !== undefined) entry.data = data;
    appendDevLogEntry(entry);
    if (IS_DEV_BUILD) {
      console.warn(`[${category}] ${event}`, data ?? '');
    }
  } catch {
    // Diagnostic logging must never alter the caller's control flow.
  }
}

export function devLogError(
  category: DevLogCategory,
  event: string,
  err: unknown,
  data?: Record<string, unknown>,
): void {
  try {
    const entry: DevLogEntry = { ts: Date.now(), category, event, err };
    if (data !== undefined) entry.data = data;
    appendDevLogEntry(entry);
    if (IS_DEV_BUILD) {
      console.error(`[${category}] ${event}`, err, data ?? '');
    }
  } catch {
    // Diagnostic logging must never alter the caller's control flow.
  }
}

export function dumpDevLog(): DevLogEntry[] {
  try {
    return [...devLogEntries];
  } catch {
    return [];
  }
}
