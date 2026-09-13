import { beforeEach, afterEach, vi } from 'vitest';
import type { SaveCatalogRepairState, SaveCatalogSnapshot, SaveListItemSummary } from '@/contracts/storage';
import type { SaveManagerCallerActions } from '@/hooks/useSaveManager';

export function baseSnapshot(): SaveCatalogSnapshot {
  return {
    items: [],
    legacyBackups: [],
    pendingIds: [],
    unreadableIds: [],
    staleCatalogIds: [],
    hiddenBaseCount: 0,
    totalStoredCount: 0,
    catalogComplete: true,
  };
}

export function makeSave(overrides: Partial<SaveListItemSummary> = {}, leaf = true): SaveListItemSummary {
  const save: SaveListItemSummary = {
    id: 1,
    type: 'auto',
    timestamp: 1_700_000_000_000,
    saveTree: { rootId: 'root-1', nodeId: 'node-1', createdAt: 1 },
    travelerName: '开拓者',
    turnCount: 3,
    worldPeriodName: '白昼',
    currentDate: '星历 1 日',
    currentTime: '08:00',
    currentLocation: '空间站',
    lastSummary: '自动摘要',
    sizeBytes: 4096,
    ...overrides,
  };
  if (leaf) save.unsealedHead = true;
  return save;
}

export function createSaveManagerActions(
  snapshot: SaveCatalogSnapshot,
  overrides: { deleteLegacyResult?: number; importResult?: number } = {},
): SaveManagerCallerActions {
  return {
    showAutoArchives: true,
    onLoad: vi.fn(() => Promise.resolve(true)),
    onBranch: vi.fn(() => Promise.resolve(true)),
    onDeleteSave: vi.fn(() => Promise.resolve(true)),
    onDeleteSaveTree: vi.fn(() => Promise.resolve()),
    onClearActiveSaveTreeMeta: vi.fn(),
    onGetSaveCatalogSnapshot: vi.fn(() => Promise.resolve(snapshot)),
    onStartSaveCatalogRepair: vi.fn(() => Promise.resolve({ total: 0, processed: 0, failed: 0, skippedForLease: false })),
    onSubscribeSaveCatalogRepair: vi.fn<(listener: (state: SaveCatalogRepairState) => void) => () => void>(() => () => {}),
    onRepairSaveDatabase: vi.fn(() => Promise.resolve()),
    onDeleteLegacyBackupSaves: vi.fn(() => Promise.resolve(overrides.deleteLegacyResult ?? 1)),
    onExportSavePackage: vi.fn(() => Promise.resolve()),
    onExportSaveTreePackage: vi.fn(() => Promise.resolve()),
    onImportSaveFileAsMany: vi.fn(() => Promise.resolve(overrides.importResult ?? 1)),
  };
}

/** confirm=true / alert=noop，与两文件原 beforeEach 一致。 */
export function registerSaveManagerDialogSpies(): void {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
}
