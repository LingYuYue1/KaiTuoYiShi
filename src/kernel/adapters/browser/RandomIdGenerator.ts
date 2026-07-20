import type { IdGenerator } from '@/src/kernel/ports/IdGenerator';

export class RandomIdGenerator implements IdGenerator {
  next(scope: string): string { return `${scope}_${crypto.randomUUID()}`; }
}
