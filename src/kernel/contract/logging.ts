import type { Unsubscribe } from './session';

export type KernelLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type KernelLogValue =
  | null
  | boolean
  | number
  | string
  | readonly KernelLogValue[]
  | Readonly<{ [key: string]: KernelLogValue }>;

export type KernelLogInput = Readonly<{
  level: KernelLogLevel;
  scope: string;
  event: string;
  message?: string;
  data?: Readonly<Record<string, unknown>>;
  error?: unknown;
}>;

export type KernelLogEntry = Readonly<{
  sequence: number;
  timestamp: number;
  level: KernelLogLevel;
  scope: string;
  event: string;
  message?: string;
  data?: Readonly<Record<string, KernelLogValue>>;
  error?: Readonly<{
    name: string;
    message: string;
    stack?: string;
  }>;
}>;

export interface KernelLogProjection {
  list(): readonly KernelLogEntry[];
  subscribe(listener: (entry: KernelLogEntry) => void): Unsubscribe;
  clear(): void;
}
