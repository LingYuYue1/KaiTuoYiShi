import type { KernelLogInput } from '@/src/kernel/contract/logging';

export interface KernelLogger {
  write(input: KernelLogInput): void;
}
