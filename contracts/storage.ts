import type { 存档类型 } from '@/models/settings';
import type { 存档树元信息 } from '@/utils/saveTree';

// ── 存档目录（原 services/storage/saveCatalog.ts）──
export interface SaveListItemSummary {
  id: number;
  type: 存档类型;
  timestamp: number;
  saveTree?: 存档树元信息;
  /** true 表示未封版草稿行：不得作为 delta 基准，也不得参与自动滚动删除。 */
  unsealedHead?: boolean;
  travelerName: string;
  turnCount: number;
  worldPeriodName: string;
  currentDate: string;
  currentTime: string;
  currentLocation: string;
  lastSummary: string;
  sizeBytes: number;
}

export interface SaveCatalogSnapshot {
  items: SaveListItemSummary[];
  legacyBackups: SaveListItemSummary[];
  pendingIds: number[];
  unreadableIds: number[];
  staleCatalogIds: number[];
  hiddenBaseCount: number;
  totalStoredCount: number;
  catalogComplete: boolean;
}

// ── 存档目录修复（原 services/storage/saveCatalogRepair.ts）──
export type SaveCatalogRepairScope = 'missing-only' | 'full-validation';

export type SaveCatalogRepairPhase =
  | 'idle'
  | 'checking'
  | 'waiting-for-lease'
  | 'repairing'
  | 'paused-for-write'
  | 'completed'
  | 'partial-failure';

export interface SaveCatalogRepairState {
  phase: SaveCatalogRepairPhase;
  scope: SaveCatalogRepairScope;
  total: number;
  processed: number;
  failed: number;
  currentId?: number;
}

export interface SaveCatalogRepairResult {
  total: number;
  processed: number;
  failed: number;
  skippedForLease: boolean;
}
