import type { Clock } from '@/src/kernel/ports/Clock';

export class SystemClock implements Clock {
  now(): number { return Date.now(); }
}
