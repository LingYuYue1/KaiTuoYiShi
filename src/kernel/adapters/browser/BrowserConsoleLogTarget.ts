import type { KernelLogEntry } from '@/src/kernel/contract/logging';
import type { KernelLogTarget } from '@/src/kernel/observability/kernelLogger';

export class BrowserConsoleLogTarget implements KernelLogTarget {
  write(entry: KernelLogEntry): void {
    const label = `[Kernel:${entry.scope}] ${entry.event}`;
    const details = {
      sequence: entry.sequence,
      timestamp: new Date(entry.timestamp).toISOString(),
      ...(entry.message ? { message: entry.message } : {}),
      ...(entry.data ? { data: entry.data } : {}),
      ...(entry.error ? { error: entry.error } : {}),
    };
    switch (entry.level) {
      case 'debug': console.debug(label, details); return;
      case 'info': console.info(label, details); return;
      case 'warn': console.warn(label, details); return;
      case 'error': console.error(label, details); return;
    }
  }
}
