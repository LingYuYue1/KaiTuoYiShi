import type {
  KernelLogEntry,
  KernelLogInput,
  KernelLogProjection,
  KernelLogValue,
} from '@/src/kernel/contract/logging';
import type { KernelLogger } from '@/src/kernel/ports/KernelLogger';

export interface KernelLogTarget {
  write(entry: KernelLogEntry): void;
}

export class BoundedKernelLogTarget implements KernelLogTarget, KernelLogProjection {
  private readonly entries: KernelLogEntry[] = [];
  private readonly listeners = new Set<(entry: KernelLogEntry) => void>();

  constructor(private readonly capacity = 500) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error('Kernel log capacity must be a positive integer');
    }
  }

  write(entry: KernelLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
    for (const listener of [...this.listeners]) {
      try {
        listener(entry);
      } catch (error) {
        console.error('Kernel log subscriber failed', error);
      }
    }
  }

  list(): readonly KernelLogEntry[] {
    return this.entries.slice();
  }

  subscribe(listener: (entry: KernelLogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

export function createKernelLogger(
  now: () => number,
  targets: readonly KernelLogTarget[],
): KernelLogger {
  let sequence = 0;
  return {
    write(input) {
      const entry = createEntry(sequence, now(), input);
      sequence += 1;
      for (const target of targets) {
        try {
          target.write(entry);
        } catch (error) {
          console.error('Kernel log target failed', error);
        }
      }
    },
  };
}

function createEntry(sequence: number, timestamp: number, input: KernelLogInput): KernelLogEntry {
  const message = input.message?.trim();
  const data = input.data ? normalizeRecord(input.data) : undefined;
  const error = input.error === undefined ? undefined : normalizeError(input.error);
  return {
    sequence,
    timestamp,
    level: input.level,
    scope: input.scope,
    event: input.event,
    ...(message ? { message } : {}),
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
    ...(error ? { error } : {}),
  };
}

function normalizeRecord(value: Readonly<Record<string, unknown>>): Readonly<Record<string, KernelLogValue>> {
  const seen = new WeakSet<object>();
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeValue(item, seen, 0)]),
  );
}

function normalizeValue(value: unknown, seen: WeakSet<object>, depth: number): KernelLogValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function' || value === undefined) {
    return String(value);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }
  if (depth >= 6) return '[MaxDepth]';
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, seen, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeValue(item, seen, depth + 1)]),
  );
}

function normalizeError(value: unknown): NonNullable<KernelLogEntry['error']> {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }
  return { name: 'UnknownError', message: String(value) };
}
