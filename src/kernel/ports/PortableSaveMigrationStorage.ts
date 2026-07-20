import type { 存档数据 } from '@/models/settings';

/** Explicit one-shot access to pre-versioned portable saves. Never used by normal load paths. */
export interface PortableSaveMigrationStorage {
  readAllRaw(): Promise<readonly unknown[]>;
  replaceAllCurrent(saves: readonly 存档数据[]): Promise<void>;
}
