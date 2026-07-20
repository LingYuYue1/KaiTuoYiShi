import type { 存档数据 } from '@/models/settings';
import type { PortableSaveMigrationStorage } from '@/src/kernel/ports/PortableSaveMigrationStorage';

export class DbPortableSaveMigrationStorage implements PortableSaveMigrationStorage {
  async readAllRaw(): Promise<readonly unknown[]> {
    const db = await import('@/services/dbService');
    return db.loadAllSavesForExplicitMigration();
  }

  async replaceAllCurrent(saves: readonly 存档数据[]): Promise<void> {
    const db = await import('@/services/dbService');
    await db.replaceAllSaves([...saves], 'before-replace');
  }
}
