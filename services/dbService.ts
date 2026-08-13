import type { 存档数据, 存档类型, DeviceSettings } from '@/models/settings';
import { 创建空API设置, 创建默认游戏设置, hydrateSaveEnvelope, createSaveEnvelope } from '@/models/settings';
import { 归一化NewestStory记录, NEWEST_STORY_STORE_KEY, 创建空NewestStory记录, 指向NewestStory记录, type NewestStory记录 } from '@/models/newestStory';
import { devLog, devLogError } from '@/utils/devLog';
import { createUnifiedId, UNIFIED_ID_DB_VERSION } from '@/utils/id';
import type { 存档树元信息 } from '@/utils/saveTree';
import { buildSavePackage, buildSaveTreePackage, parseSaveTreePackage } from './savePackage';
import {
  extractSaveAssetRecords,
  materializeSaveAssetRecords,
  restoreSaveAssetPayloadFromRecords,
  saveHasEmbeddedAssetPayload,
  stripSaveAssetPayloadForStorage,
  type SaveAssetRecord,
} from '@/utils/saveAssetStorage';
import {
  buildDeltaOnlyStoredSave,
  buildSaveNodeDeltaRecord,
  isDeltaOnlyStoredSave,
  restoreSaveFromDelta,
  type SaveNodeDeltaRecord,
} from '@/utils/saveDeltaStorage';
import {
  buildSaveCatalogSnapshot,
  createCatalogRecordFromSummary,
  createHiddenDeltaBaseCatalogRecord,
  createUnreadableSaveCatalogRecord,
  normalizeSaveCatalogRecord,
  type SaveCatalogRecord,
  type SaveCatalogSnapshot,
  type SaveListItemSummary,
} from '@/services/storage/saveCatalog';
import {
  getSaveCatalogRepairState,
  runWithSaveMutationPriority,
  startSaveCatalogRepairTask,
  subscribeSaveCatalogRepair,
  type SaveCatalogRepairResult,
  type SaveCatalogRepairScope,
} from '@/services/storage/saveCatalogRepair';
export type { SaveCatalogSnapshot, SaveListItemSummary } from '@/services/storage/saveCatalog';
export type { SaveCatalogRepairResult, SaveCatalogRepairScope, SaveCatalogRepairState } from '@/services/storage/saveCatalogRepair';
export { getSaveCatalogRepairState, subscribeSaveCatalogRepair };

const DB_NAME = 'TimeJourneyDB';
const DB_VERSION = UNIFIED_ID_DB_VERSION;
const SAVES_STORE = 'saves';
const SAVE_SUMMARIES_STORE = 'saveSummaries';
const SAVE_ASSETS_STORE = 'saveAssets';
const SAVE_NODE_DELTAS_STORE = 'saveNodeDeltas';
const SETTINGS_STORE = 'settings';
const NEWEST_STORY_STORE = 'newestStory';
const MAX_DELTA_NODES_PER_CHECKPOINT = 6;
const SAVE_CATALOG_REPAIR_LEASE_KEY = 'internal.saveCatalogRepairLease.v2';
const SAVE_CATALOG_REPAIR_LEASE_MS = 60_000;
const SAVE_CATALOG_REPAIR_OWNER = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `catalog_${Date.now()}_${Math.random().toString(36).slice(2)}`;

type StoredSaveMeta = 存档数据 & {
  saveRuntime?: {
    hiddenDeltaBase?: boolean;
    unsealedHead?: boolean;
    cloudBackupOriginFingerprint?: string;
    [key: string]: unknown;
  };
};

type SaveWithTree = 存档数据 & {
  saveTree?: import('@/utils/saveTree').存档树元信息;
};

interface Migration {
  version: number;
  label: string;
  migrate: (transaction: IDBTransaction) => void;
}

export type CloudMergeStagedRecord =
  | { kind: 'node'; createdAt: number; save: 存档数据 }
  | { kind: 'raw-node'; createdAt: number; save: 存档数据 }
  | { kind: 'asset'; createdAt: number; record: SaveAssetRecord };

export interface CloudMergeCommitResult {
  saveIds: number[];
  assetIds: string[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function toError(error: unknown, fallback = '存档数据库操作失败。'): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (db: IDBDatabase) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      const connection = db;
      connection.onversionchange = () => {
        connection.close();
        dbPromise = null;
      };
      resolve(db);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      dbPromise = null;
      reject(toError(error));
    };
    const timeoutId = globalThis.setTimeout(() => {
      fail(new Error('存档数据库打开超时。请关闭其他开拓轶事页面或刷新后重试。'));
    }, 8000);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SAVES_STORE)) {
        db.createObjectStore(SAVES_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(SAVE_SUMMARIES_STORE)) {
        db.createObjectStore(SAVE_SUMMARIES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SAVE_ASSETS_STORE)) {
        db.createObjectStore(SAVE_ASSETS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) {
        db.createObjectStore(SAVE_NODE_DELTAS_STORE, { keyPath: 'nodeId' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(NEWEST_STORY_STORE)) {
        db.createObjectStore(NEWEST_STORY_STORE, { keyPath: 'key' });
      }
      const migrationsToApply = MIGRATIONS.filter((migration) => migration.version > event.oldVersion);
      devLog('save', 'migrate-registry-start', {
        applied: migrationsToApply.map((migration) => migration.label),
        skipped: MIGRATIONS
          .filter((migration) => migration.version <= event.oldVersion)
          .map((migration) => migration.label),
      });
      if (request.transaction) {
        for (const migration of migrationsToApply) {
          migration.migrate(request.transaction);
        }
      }
    };
    request.onsuccess = () => finish(request.result);
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error('存档数据库升级被其他页面占用。请关闭其他开拓轶事页面或刷新后重试。'));
  });
  return dbPromise;
}

function migrateNewestStoryHeadNodeId(transaction: IDBTransaction): void {
  const newestStore = transaction.objectStore(NEWEST_STORY_STORE);
  const savesStore = transaction.objectStore(SAVES_STORE);
  const newestRequest = newestStore.get(NEWEST_STORY_STORE_KEY);
  newestRequest.onsuccess = () => {
    const newest: unknown = newestRequest.result;
    if (!isPlainRecord(newest)) {
      devLog('save', 'newest-head-migration', { outcome: 'no-record' });
      return;
    }
    if ('headNodeId' in newest) {
      devLog('save', 'newest-head-migration', {
        outcome: 'already-present',
        headNodeId: (newest as { headNodeId?: unknown }).headNodeId,
      });
      return;
    }

    const baseCheckpointId = normalizeSaveId(newest.baseCheckpointId);
    if (!baseCheckpointId) {
      newestStore.put({ ...newest, headNodeId: null });
      devLog('save', 'newest-head-migration', { outcome: 'no-base-checkpoint' });
      return;
    }

    const saveRequest = savesStore.get(baseCheckpointId);
    saveRequest.onsuccess = () => {
      const save = saveRequest.result as SaveWithTree | undefined;
      const headNodeId = normalizeNodeId(save?.saveTree?.nodeId);
      newestStore.put({ ...newest, headNodeId });
      if (headNodeId) {
        devLog('save', 'newest-head-migration', { outcome: 'backfilled', baseCheckpointId, headNodeId });
      } else {
        devLog('save', 'newest-head-migration', { outcome: 'base-node-missing', baseCheckpointId });
      }
    };
    saveRequest.onerror = () => {
      newestStore.put({ ...newest, headNodeId: null });
      devLogError('save', 'newest-head-migration-read-failed', saveRequest.error, { baseCheckpointId });
    };
  };
  newestRequest.onerror = () => {
    devLogError('save', 'newest-head-migration-read-failed', newestRequest.error);
  };
}

const UNIFIED_ID_PATTERN = /^[0-9a-f]{4}-[0-9a-f]{6}-[0-9a-f]{4}$/;

// 为旧版 newest 记录补齐 branchName 的持久化形状，同时保持迁移幂等。
function migrateNewestStoryBranchName(transaction: IDBTransaction): void {
  const newestStore = transaction.objectStore(NEWEST_STORY_STORE);
  const newestRequest = newestStore.get(NEWEST_STORY_STORE_KEY);
  newestRequest.onsuccess = () => {
    const newest: unknown = newestRequest.result;
    if (!isPlainRecord(newest)) {
      devLog('save', 'newest-branchname-migration', { outcome: 'no-record' });
      return;
    }
    const rawBranchName = newest.branchName;
    const nextBranchName = typeof rawBranchName === 'string' && rawBranchName.trim()
      ? rawBranchName.trim()
      : undefined;
    if (nextBranchName === rawBranchName) {
      devLog('save', 'newest-branchname-migration', {
        outcome: 'noop',
        branchName: nextBranchName,
      });
      return;
    }
    const next = {
      ...newest,
      ...(nextBranchName ? { branchName: nextBranchName } : {}),
    };
    newestStore.put(next);
    devLog('save', 'newest-branchname-migration', {
      outcome: 'normalized',
      branchName: nextBranchName,
    });
  };
  newestRequest.onerror = () => {
    devLogError('save', 'newest-branchname-migration-read-failed', newestRequest.error);
  };
}

function migrateNodeIdsToUnifiedFormat(transaction: IDBTransaction): void {
  devLog('save', 'migrate-nodeid-start');

  const savesStore = transaction.objectStore(SAVES_STORE);
  const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
  const deltaStore = transaction.objectStore(SAVE_NODE_DELTAS_STORE);
  const newestStore = transaction.objectStore(NEWEST_STORY_STORE);
  const metrics = {
    savesScanned: 0,
    savesRewritten: 0,
    summariesScanned: 0,
    summariesRewritten: 0,
    deltasScanned: 0,
    deltasRewritten: 0,
    mappedNodeIds: 0,
    mappedRootIds: 0,
    newestRewritten: false,
  };
  let failureLogged = false;
  const logFailure = (error: unknown, phase: string) => {
    if (failureLogged) return;
    failureLogged = true;
    devLogError('save', 'migrate-nodeid-failed', error, { phase });
  };
  transaction.addEventListener('abort', () => {
    logFailure(transaction.error ?? new Error('统一 nodeId 迁移事务已中止。'), 'transaction');
  }, { once: true });
  const watchRequest = (request: IDBRequest, phase: string) => {
    request.addEventListener('error', () => {
      logFailure(request.error ?? new Error('统一 nodeId 迁移请求失败。'), phase);
    }, { once: true });
  };

  const savesRequest = savesStore.getAll();
  watchRequest(savesRequest, 'saves-read');
  savesRequest.onsuccess = () => {
    const saves = savesRequest.result as unknown[];
    const summariesRequest = summaryStore.getAll();
    watchRequest(summariesRequest, 'summaries-read');
    summariesRequest.onsuccess = () => {
      const summaries = summariesRequest.result as unknown[];
      const deltasRequest = deltaStore.getAll();
      watchRequest(deltasRequest, 'deltas-read');
      deltasRequest.onsuccess = () => {
        const deltas = deltasRequest.result as unknown[];
        const newestRequest = newestStore.get(NEWEST_STORY_STORE_KEY);
        watchRequest(newestRequest, 'newest-read');
        newestRequest.onsuccess = () => {
          const newest = newestRequest.result as unknown;
          const nodeIdMap = new Map<string, string>();
          const rootIdMap = new Map<string, string>();

          for (const save of saves) ensureSaveTreeMappings(save, nodeIdMap, rootIdMap);
          for (const summary of summaries) ensureSaveTreeMappings(summary, nodeIdMap, rootIdMap);
          for (const delta of deltas) ensureDeltaMappings(delta, nodeIdMap, rootIdMap);
          ensureNewestMapping(newest, nodeIdMap);

          metrics.savesScanned = saves.length;
          metrics.summariesScanned = summaries.length;
          metrics.deltasScanned = deltas.length;
          metrics.mappedNodeIds = nodeIdMap.size;
          metrics.mappedRootIds = rootIdMap.size;
          devLog('save', 'migrate-nodeid-row', {
            saves: metrics.savesScanned,
            summaries: metrics.summariesScanned,
            deltas: metrics.deltasScanned,
            mappedNodeIds: metrics.mappedNodeIds,
            mappedRootIds: metrics.mappedRootIds,
          });

          for (const save of saves) {
            const rewritten = rewriteSaveTreeRecord(save, nodeIdMap, rootIdMap);
            if (!rewritten) continue;
            savesStore.put(rewritten);
            metrics.savesRewritten += 1;
          }
          for (const summary of summaries) {
            const rewritten = rewriteSaveTreeRecord(summary, nodeIdMap, rootIdMap);
            if (!rewritten) continue;
            summaryStore.put(rewritten);
            metrics.summariesRewritten += 1;
          }
          for (const delta of deltas) {
            const rewritten = rewriteDeltaRecord(delta, nodeIdMap, rootIdMap);
            if (!rewritten) continue;
            const oldNodeId = isPlainRecord(delta) && typeof delta.nodeId === 'string'
              ? delta.nodeId
              : null;
            if (!oldNodeId) continue;
            deltaStore.delete(oldNodeId);
            deltaStore.put(rewritten);
            metrics.deltasRewritten += 1;
          }
          devLog('save', 'migrate-nodeid-delta-rewrite', {
            scanned: metrics.deltasScanned,
            rewritten: metrics.deltasRewritten,
          });

          if (isPlainRecord(newest) && 'headNodeId' in newest) {
            const nextHeadNodeId = mapNodeId(newest.headNodeId, nodeIdMap);
            if (nextHeadNodeId !== newest.headNodeId) {
              newestStore.put({ ...newest, headNodeId: nextHeadNodeId });
              metrics.newestRewritten = true;
            }
            devLog('save', 'migrate-nodeid-newest', {
              rewritten: metrics.newestRewritten,
              oldHeadNodeId: newest.headNodeId,
              newHeadNodeId: nextHeadNodeId,
            });
          } else {
            devLog('save', 'migrate-nodeid-newest', { rewritten: false });
          }
        };
      };
    };
  };

  transaction.addEventListener('complete', () => {
    const totalRewritten = metrics.savesRewritten + metrics.summariesRewritten + metrics.deltasRewritten;
    const totalScanned = metrics.savesScanned + metrics.summariesScanned + metrics.deltasScanned;
    const outcome = totalScanned === 0
      ? 'empty'
      : totalRewritten === 0
        ? 'noop'
        : 'converted';
    devLog('save', 'migrate-nodeid-complete', { ...metrics, outcome });
  }, { once: true });
}

// 将旧版 newest 覆盖结构物化为可写叶子和全局指针，保证升级后仍能恢复工作区并支持幂等重放。
function migrateNewestToHeadPointer(transaction: IDBTransaction): void {
  const newestStore = transaction.objectStore(NEWEST_STORY_STORE);
  const savesStore = transaction.objectStore(SAVES_STORE);
  const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
  const deltaStore = transaction.objectStore(SAVE_NODE_DELTAS_STORE);
  const assetStore = transaction.objectStore(SAVE_ASSETS_STORE);

  // reviewer P0：任何迁移读写错误都必须显式中止升级事务，禁止部分写入后正常提交、
  // 用 head-only 空记录覆盖仍含旧 story 的 newest 槽（旧工作区数据将不可恢复）。
  let abortTriggered = false;
  const abortMigration = (): void => {
    if (abortTriggered) return;
    abortTriggered = true;
    try {
      transaction.abort();
    } catch (abortError) {
      devLogError('save', 'newest-headonly-migration-abort-failed', abortError);
    }
  };
  // 兜底：未显式挂 error 处理器的写入请求（put/delete）失败时也显式中止事务。
  transaction.addEventListener('error', () => {
    abortMigration();
  });
  transaction.addEventListener('abort', () => {
    devLog('save', 'newest-headonly-migration-abort', {
      aborted: abortTriggered,
      error: transaction.error?.message ?? null,
    });
  }, { once: true });

  const newestRequest = newestStore.get(NEWEST_STORY_STORE_KEY);
  newestRequest.onsuccess = () => {
    const newest: unknown = newestRequest.result;
    if (!isPlainRecord(newest)) {
      devLog('save', 'newest-headonly-migration', { outcome: 'no-record' });
      return;
    }
    if (!('story' in newest) && !('baseCheckpointId' in newest)) {
      devLog('save', 'newest-headonly-migration', {
        outcome: 'already-head-only',
        headNodeId: (newest as { headNodeId?: unknown }).headNodeId ?? null,
      });
      return;
    }

    const story = isPlainRecord(newest.story) ? newest.story : {};
    const baseCheckpointId = normalizeSaveId(newest.baseCheckpointId);
    const oldHeadNodeId = normalizeNodeId(newest.headNodeId);
    const branchName = typeof newest.branchName === 'string' && newest.branchName.trim()
      ? newest.branchName.trim()
      : undefined;

    if (!baseCheckpointId) {
      newestStore.put(创建空NewestStory记录());
      devLog('save', 'newest-headonly-migration', { outcome: 'no-base-checkpoint' });
      return;
    }

    const savesRequest = savesStore.getAll();
    const deltasRequest = deltaStore.getAll();
    savesRequest.onsuccess = () => {
      const saves = savesRequest.result as unknown[];
      deltasRequest.onsuccess = () => {
        const deltas = deltasRequest.result as unknown[];
        const savesById = new Map<number, StoredSaveMeta>();
        for (const row of saves) {
          if (isPlainRecord(row) && typeof row.id === 'number') {
            savesById.set(row.id, row as unknown as StoredSaveMeta);
          }
        }
        const deltasByNodeId = new Map<string, SaveNodeDeltaRecord>();
        for (const delta of deltas) {
          if (isPlainRecord(delta) && typeof delta.nodeId === 'string') {
            deltasByNodeId.set(delta.nodeId, delta as unknown as SaveNodeDeltaRecord);
          }
        }
        const restoreFullSave = (id: number, visited = new Set<number>()): StoredSaveMeta | null => {
          const row = savesById.get(id);
          if (!row) return null;
          if (!isDeltaOnlyStoredSave(row)) return row;
          const tree = (row as SaveWithTree).saveTree;
          const nodeId = tree?.nodeId;
          if (!nodeId || visited.has(id)) return null;
          visited.add(id);
          const delta = deltasByNodeId.get(nodeId);
          const baseId = delta?.deltaPayload?.baseSaveId
            ?? (row as SaveWithTree & { saveStorage?: { baseSaveId?: number } }).saveStorage?.baseSaveId;
          if (!delta || !baseId) return null;
          const base = restoreFullSave(baseId, visited);
          if (!base) return null;
          return restoreSaveFromDelta(base, row, delta);
        };

        const baseRaw = savesById.get(baseCheckpointId) ?? null;
        if (!baseRaw) {
          newestStore.put(创建空NewestStory记录());
          devLog('save', 'newest-headonly-migration', { outcome: 'base-missing', baseCheckpointId });
          return;
        }
        const base = restoreFullSave(baseCheckpointId);
        if (!base) {
          newestStore.put(创建空NewestStory记录());
          devLog('save', 'newest-headonly-migration', { outcome: 'base-unrestorable', baseCheckpointId });
          return;
        }

        const baseTree = (base as SaveWithTree).saveTree;
        // reviewer P1：复用旧 headNodeId 前必须确认该 ID 未被其他节点占用
        // （saves 行或 delta 记录），冲突时分配新 ID 并把旧 ID 记录到迁移日志。
        const headNodeIdAlreadyUsed = oldHeadNodeId !== null && (
          saves.some((row) =>
            isPlainRecord(row)
            && isPlainRecord(row.saveTree)
            && row.saveTree.nodeId === oldHeadNodeId,
          )
          || deltasByNodeId.has(oldHeadNodeId)
        );
        const leafNodeId = oldHeadNodeId && oldHeadNodeId !== baseTree?.nodeId && !headNodeIdAlreadyUsed
          ? oldHeadNodeId
          : createUnifiedId();
        if (oldHeadNodeId && headNodeIdAlreadyUsed) {
          devLog('save', 'newest-headonly-migration', {
            outcome: 'head-nodeid-conflict-remapped',
            oldHeadNodeId,
            leafNodeId,
          });
        }
        const timestamp = Date.now();
        const merged: Record<string, unknown> = { ...base };
        for (const [key, value] of Object.entries(story)) {
          if (value !== undefined) merged[key] = value;
        }
        const { id: _baseId, saveStorage: _storage, saveRuntime: _runtime, ...mergedFields } = merged;
        void _baseId;
        void _storage;
        void _runtime;
        const leafSaveTree: 存档树元信息 = {
          rootId: baseTree?.rootId ?? createUnifiedId(),
          nodeId: leafNodeId,
          ...(baseTree?.nodeId ? { parentNodeId: baseTree.nodeId } : {}),
          ...(branchName ? { branchName } : {}),
          createdAt: timestamp,
        };
        const leafPayload = stripSaveAssetPayloadForStorage({
          ...mergedFields,
          id: 0,
          type: 'auto',
          timestamp,
          turnCount: merged.turnCount,
          saveTree: leafSaveTree,
          saveRuntime: { unsealedHead: true },
        } as unknown as 存档数据 & StoredSaveMeta);
        const assetRecords = materializeSaveAssetRecords(extractSaveAssetRecords(leafPayload));
        for (const record of assetRecords) assetStore.put(record);
        const { id: _storedId, ...leafWithoutId } = leafPayload;
        void _storedId;
        const addRequest = savesStore.add(leafWithoutId);
        addRequest.onsuccess = () => {
          const leafId = Number(addRequest.result);
          const leafRow = { ...leafPayload, id: leafId } as StoredSaveMeta;
          summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(leafRow)));
          const delta = buildSaveNodeDeltaRecord(leafRow, leafId);
          if (delta) deltaStore.put(delta);
          newestStore.put({
            key: NEWEST_STORY_STORE_KEY,
            headNodeId: leafNodeId,
            updatedAt: Date.now(),
          });
          devLog('save', 'newest-headonly-migration', {
            outcome: 'materialized',
            baseCheckpointId,
            headNodeId: leafNodeId,
            leafId,
            overlaidFieldCount: Object.keys(story).length,
          });
        };
        addRequest.onerror = () => {
          devLogError('save', 'newest-headonly-migration-write-failed', addRequest.error);
          abortMigration();
        };
      };
      deltasRequest.onerror = () => {
        devLogError('save', 'newest-headonly-migration-deltas-read-failed', deltasRequest.error);
        abortMigration();
      };
    };
    savesRequest.onerror = () => {
      devLogError('save', 'newest-headonly-migration-saves-read-failed', savesRequest.error);
      abortMigration();
    };
  };
  newestRequest.onerror = () => {
    devLogError('save', 'newest-headonly-migration-read-failed', newestRequest.error);
    abortMigration();
  };
}

const MIGRATIONS: Migration[] = [
  {
    version: 7,
    label: 'newest-headNodeId',
    migrate: migrateNewestStoryHeadNodeId,
  },
  {
    version: 8,
    label: 'unified-nodeId',
    migrate: migrateNodeIdsToUnifiedFormat,
  },
  {
    version: 9,
    label: 'newest-branchName',
    migrate: migrateNewestStoryBranchName,
  },
  {
    version: 10,
    label: 'newest-head-only',
    migrate: migrateNewestToHeadPointer,
  },
];

function ensureSaveTreeMappings(
  value: unknown,
  nodeIdMap: Map<string, string>,
  rootIdMap: Map<string, string>,
): void {
  if (!isPlainRecord(value) || !isPlainRecord(value.saveTree)) return;
  ensureMappedId(value.saveTree.nodeId, nodeIdMap);
  ensureMappedId(value.saveTree.parentNodeId, nodeIdMap);
  ensureMappedId(value.saveTree.rootId, rootIdMap);
}

function ensureDeltaMappings(
  value: unknown,
  nodeIdMap: Map<string, string>,
  rootIdMap: Map<string, string>,
): void {
  if (!isPlainRecord(value)) return;
  ensureMappedId(value.nodeId, nodeIdMap);
  ensureMappedId(value.parentNodeId, nodeIdMap);
  ensureMappedId(value.rootId, rootIdMap);
}

function ensureNewestMapping(value: unknown, nodeIdMap: Map<string, string>): void {
  if (isPlainRecord(value)) ensureMappedId(value.headNodeId, nodeIdMap);
}

function ensureMappedId(value: unknown, map: Map<string, string>): void {
  if (typeof value !== 'string') return;
  const normalized = value.trim();
  if (!normalized || isUnifiedNodeId(normalized) || map.has(normalized)) return;
  map.set(normalized, createUnifiedId());
}

function isUnifiedNodeId(value: string): boolean {
  return UNIFIED_ID_PATTERN.test(value);
}

function mapNodeId(value: unknown, map: Map<string, string>): unknown {
  if (typeof value !== 'string') return value;
  return map.get(value.trim()) ?? value;
}

function mapRootId(value: unknown, map: Map<string, string>): unknown {
  if (typeof value !== 'string') return value;
  return map.get(value.trim()) ?? value;
}

function rewriteSaveTreeRecord(
  value: unknown,
  nodeIdMap: Map<string, string>,
  rootIdMap: Map<string, string>,
): Record<string, unknown> | null {
  if (!isPlainRecord(value) || !isPlainRecord(value.saveTree)) return null;
  const tree = value.saveTree;
  const nextNodeId = mapNodeId(tree.nodeId, nodeIdMap);
  const nextRootId = mapRootId(tree.rootId, rootIdMap);
  const nextParentNodeId = mapNodeId(tree.parentNodeId, nodeIdMap);
  if (
    nextNodeId === tree.nodeId
    && nextRootId === tree.rootId
    && nextParentNodeId === tree.parentNodeId
  ) return null;
  return {
    ...value,
    saveTree: {
      ...tree,
      nodeId: nextNodeId,
      rootId: nextRootId,
      parentNodeId: nextParentNodeId,
    },
  };
}

function rewriteDeltaRecord(
  value: unknown,
  nodeIdMap: Map<string, string>,
  rootIdMap: Map<string, string>,
): Record<string, unknown> | null {
  if (!isPlainRecord(value)) return null;
  const nextNodeId = mapNodeId(value.nodeId, nodeIdMap);
  const nextRootId = mapRootId(value.rootId, rootIdMap);
  const nextParentNodeId = mapNodeId(value.parentNodeId, nodeIdMap);
  if (
    nextNodeId === value.nodeId
    && nextRootId === value.rootId
    && nextParentNodeId === value.parentNodeId
  ) return null;
  return {
    ...value,
    nodeId: nextNodeId,
    rootId: nextRootId,
    parentNodeId: nextParentNodeId,
  };
}

// ── Save operations ──

export interface SaveGameOptions {
  /**
   * 强制全量存储（不做 delta 编码）。仅限叶子（工作区）节点使用：
   * 叶子行是 putHeadRow 原地写入的目标，必须是全量行，否则 delta-only 行会被覆盖丢数据。
   */
  forceFullStore?: boolean;
}

export async function saveGame(data: 存档数据, options?: SaveGameOptions): Promise<number> {
  try {
    return await runWithSaveMutationPriority(() => saveGameInternal(data, options));
  } catch (error) {
    if (data.type === 'imported') {
      const tree = (data as SaveWithTree).saveTree;
      devLogError('save', 'import-save-persist-failed', error, {
        rootId: tree?.rootId,
        nodeId: tree?.nodeId,
      });
    }
    throw error;
  }
}

async function saveGameInternal(data: 存档数据, options?: SaveGameOptions): Promise<number> {
  const sourceData = stripCloudBackupRestoreRuntime(data);
  const db = await openDB();
  const assetRecords = materializeSaveAssetRecords(extractSaveAssetRecords(sourceData));
  const storedData = stripSaveAssetPayloadForStorage({
    ...createSaveEnvelope(sourceData).gameData,
    id: sourceData.id,
    type: sourceData.type,
    timestamp: sourceData.timestamp,
    turnCount: sourceData.turnCount,
    ...(sourceData as 存档数据 & { saveTree?: unknown }).saveTree
      ? { saveTree: (sourceData as 存档数据 & { saveTree?: unknown }).saveTree }
      : {},
  });
  const deltaBase = options?.forceFullStore ? null : await findAutoDeltaBase(db, storedData);
  const saved = await new Promise<{ id: number; save: 存档数据; delta: SaveNodeDeltaRecord | null }>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_ASSETS_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const store = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const assetStore = tx.objectStore(SAVE_ASSETS_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    for (const record of assetRecords) assetStore.put(record);
    const initialStoredData = deltaBase
      ? buildDeltaOnlyStoredSave(storedData, deltaBase.baseSaveId)
      : storedData;
    const { id: _ignoredId, ...rest } = initialStoredData;
    void _ignoredId;
    let savedId = 0;
    let savedDelta: SaveNodeDeltaRecord | null = null;
    const request = store.add(rest);
    request.onsuccess = () => {
      const id = request.result as number;
      savedId = id;
      const savedForDelta = { ...storedData, id };
      if (deltaBase) {
        store.put(buildDeltaOnlyStoredSave(savedForDelta, deltaBase.baseSaveId));
      }
      const delta = buildSaveNodeDeltaRecord(
        savedForDelta,
        id,
        deltaBase
          ? { baseSave: deltaBase.baseSave, baseSaveId: deltaBase.baseSaveId, storageMode: 'delta' }
          : undefined,
      );
      if (delta) {
        savedDelta = delta;
        deltaStore.put(delta);
      }
      summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(savedForDelta)));
    };
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve({ id: savedId, save: { ...sourceData, id: savedId }, delta: savedDelta });
    tx.onerror = () => reject(toError(tx.error));
  });
  return saved.id;
}

async function deleteManagedSaveItems(db: IDBDatabase, candidates: SaveListItemSummary[]): Promise<void> {
  if (!candidates.length) return;
  const referencedBaseIds = await getReferencedDeltaBaseIds(db);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    for (const item of candidates) {
      if (!referencedBaseIds.has(item.id)) {
        saveStore.delete(item.id);
        summaryStore.delete(item.id);
      } else {
        markSaveAsHiddenDeltaBase(saveStore, summaryStore, item.id);
      }
      deleteDeltaBySaveId(tx.objectStore(SAVE_NODE_DELTAS_STORE), item.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
  await cleanupUnreferencedHiddenSaves(db);
}

async function collectSaveTreeSummaries(rootId: string): Promise<SaveListItemSummary[]> {
  const snapshot = await getSaveCatalogSnapshot();
  return snapshot.items.filter((item) => item.saveTree?.rootId === rootId);
}

export async function getSaveList(): Promise<SaveListItemSummary[]> {
  return (await getSaveCatalogSnapshot()).items;
}

export async function getSaveCatalogSnapshot(): Promise<SaveCatalogSnapshot> {
  const db = await openDB();
  return readIndexedSaveCatalogSnapshot(db);
}

/**
 * 通过轻量目录反查 saveTree 节点对应的 IndexedDB 数字主键。
 * 目录摘要（saveSummaries）只收录可见节点；hidden-delta-base / unreadable / legacy-backup 等
 * 节点不在 items 里。目录未命中时回退到 saves 表直接按 saveTree.nodeId 扫描，
 * 避免父检查点真实存在却被误判为缺失（reroll-parent-missing）。
 */
export async function loadSaveIdByNodeId(nodeId: string): Promise<number | null> {
  const normalizedNodeId = normalizeNodeId(nodeId);
  if (!normalizedNodeId) return null;
  const db = await openDB();
  const summaries = await readSaveSummaries(db);
  const fromSummaries = summaries.find((item) => item.saveTree?.nodeId === normalizedNodeId);
  if (fromSummaries) return fromSummaries.id;
  return findSaveIdByNodeIdInSavesTable(db, normalizedNodeId);
}

/** reroll 父检查点存在性探针：父节点必须真实存在且与当前叶子同属一棵存档树。
 * 与 handleReroll 的祖先探测同语义（loadSaveIdByNodeId 自带 saves 表回退，
 * 目录恢复未完成不会误判缺失）。供 useGameState 的主动验证 effect 调用。 */
export async function validateRerollParent(rootId: string, parentNodeId: string): Promise<boolean> {
  const saveId = await loadSaveIdByNodeId(parentNodeId);
  if (!saveId) return false;
  const save = await loadSave(saveId);
  const tree = (save as { saveTree?: { rootId?: string | null } | null } | null)?.saveTree;
  return Boolean(tree?.rootId && tree.rootId === rootId);
}

/** 目录摘要未命中时回退：直接扫描 saves 表匹配 saveTree.nodeId（覆盖隐藏/不可读/legacy 节点）。 */
async function findSaveIdByNodeIdInSavesTable(db: IDBDatabase, nodeId: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const store = tx.objectStore(SAVES_STORE);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(null);
        return;
      }
      const value = cursor.value as { id?: unknown; saveTree?: { nodeId?: unknown } } | undefined;
      if (value && isPlainRecord(value.saveTree) && value.saveTree.nodeId === nodeId) {
        resolve(normalizeSaveId(value.id));
        return;
      }
      cursor.continue();
    };
    request.onerror = () => reject(toError(request.error));
  });
}

/**
 * 对当前未封版 head 行做轻量原地写入；不会经过资产抽取、delta、rotation 或 saveGameInternal。
 * 已封版的历史行一律拒绝改写。
 * 防御：目标行若为 delta-only 存储，先经 delta 链恢复全量再合并（叶子在正常路径恒为全量行，
 * 此分支只兜底历史数据 / 删除重定向后的边界态），并同步刷新 delta 记录。
 *
 * 并发安全（reviewer P1，TOCTOU）：delta 兜底恢复是只读预读（不参与封版竞争）；
 * 「复核未封版 + 写入」放在同一个串行化的 readwrite 事务内完成——IndexedDB 对同一 store
 * 的写事务串行化，sealLeafRow 不可能在本事务提交前改写该行，因此不会覆写已封版检查点。
 */
export async function putHeadRow(saveId: number, patch: Partial<存档数据>): Promise<void> {
  const startedAt = Date.now();
  const { id: _ignoredId, ...patchWithoutId } = patch;
  void _ignoredId;
  const patchKeys = Object.keys(patchWithoutId);
  const db = await openDB();
  const rawPreview = await loadRawSave(db, saveId);
  if (!rawPreview) {
    const error = new Error('未找到要写入的草稿存档。');
    devLogError('save', 'puthead-rejected-missing', error, { saveId });
    throw error;
  }
  const restoredPreview = isDeltaOnlyStoredSave(rawPreview)
    ? await restoreDeltaSaveIfNeeded(db, rawPreview)
    : null;
  let restoredFromDelta = false;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    const readRequest = saveStore.get(saveId);
    readRequest.onsuccess = () => {
      const raw = readRequest.result as StoredSaveMeta | undefined;
      if (!raw) {
        const error = new Error('未找到要写入的草稿存档。');
        devLogError('save', 'puthead-rejected-missing', error, { saveId });
        reject(error);
        return;
      }
      if (!isUnsealedHeadSave(raw)) {
        const error = new Error('已封版历史节点不可通过 putHeadRow 改写。');
        devLogError('save', 'puthead-rejected-sealed', error, { saveId });
        reject(error);
        return;
      }
      restoredFromDelta = isDeltaOnlyStoredSave(raw);
      const current = restoredFromDelta ? (restoredPreview ?? raw) : raw;
      const next = { ...current, ...patchWithoutId, id: saveId } as StoredSaveMeta;
      const nextStored = stripSaveAssetPayloadForStorage(next);
      saveStore.put(nextStored);
      summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(nextStored)));
      const delta = buildSaveNodeDeltaRecord(nextStored, saveId);
      if (delta) deltaStore.put(delta);
    };
    readRequest.onerror = () => reject(toError(readRequest.error));
    tx.oncomplete = () => {
      devLog('save', 'puthead', {
        saveId,
        fieldCount: patchKeys.length,
        restoredFromDelta,
        durationMs: Date.now() - startedAt,
      });
      resolve();
    };
    tx.onerror = () => reject(toError(tx.error));
    tx.onabort = () => reject(tx.error ?? new Error('草稿存档写入事务已中止。'));
  });
}

// ── 叶子（工作区）基础设施（子任务 A：工作区物理落入存档树）──

export interface LeafNodeResult {
  saveId: number;
  saveTree: 存档树元信息;
}

/**
 * 创建新叶子（工作区）节点：payload 必须是携带完整领域状态与 saveTree 的存档，
 * 本函数负责打上 unsealedHead 标记并强制全量存储（叶子行是 putHeadRow 原地写入目标）。
 */
export async function createLeafNode(payload: 存档数据): Promise<LeafNodeResult> {
  const withMarker = {
    ...payload,
    saveRuntime: { unsealedHead: true },
  } as StoredSaveMeta;
  const saveId = await saveGame(withMarker, { forceFullStore: true });
  const tree = (withMarker as SaveWithTree).saveTree;
  if (!tree?.nodeId) {
    throw new Error('创建叶子节点失败：缺少 saveTree 元信息。');
  }
  return { saveId, saveTree: tree };
}

/**
 * 封版当前叶子：把叶子行就地转为不可变检查点（同 nodeId 身份转变），
 * 剥离 queueTasks、移除 unsealedHead 标记，刷新时间戳、目录摘要与 delta 记录。
 * 叶子已封版（幂等重放 / 崩溃窗口）时直接跳过并埋点。
 * sealedPayload 必须是 loadSave 恢复出的完整状态（含叶子原 saveTree / id）。
 */
export async function sealLeafRow(sealedPayload: 存档数据): Promise<void> {
  const saveId = sealedPayload.id;
  const db = await openDB();
  const raw = await loadRawSave(db, saveId);
  if (!raw) {
    throw new Error(`封版叶子失败：叶子行不存在（saveId=${saveId}）。`);
  }
  if (!isUnsealedHeadSave(raw)) {
    devLog('save', 'seal-leaf-skipped-already-sealed', { saveId });
    return;
  }
  const { queueTasks: _queueTasks, saveStorage: _storage, ...sealedFields } = sealedPayload as 存档数据 & {
    saveStorage?: unknown;
  };
  void _queueTasks;
  void _storage;
  const sealedStored = stripSaveAssetPayloadForStorage({
    ...sealedFields,
    id: saveId,
    saveRuntime: undefined,
  });
  // reviewer P0-1：封版复核移入同一 readwrite 事务内完成——IndexedDB 对同一 store
  // 的写事务串行化，事务内再次确认行仍未封版后才写入，杜绝「事务外预检通过、
  // 事务内写入」的 TOCTOU 窗口覆盖已不可变检查点。
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    let skipped = false;
    const readRequest = saveStore.get(saveId);
    readRequest.onsuccess = () => {
      const current = readRequest.result as StoredSaveMeta | undefined;
      if (!current) {
        reject(new Error(`封版叶子失败：叶子行不存在（saveId=${saveId}）。`));
        return;
      }
      if (!isUnsealedHeadSave(current)) {
        skipped = true;
        devLog('save', 'seal-leaf-skipped-already-sealed', { saveId });
        resolve();
        return;
      }
      saveStore.put(sealedStored);
      summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(sealedStored)));
      const delta = buildSaveNodeDeltaRecord(sealedStored, saveId);
      if (delta) deltaStore.put(delta);
    };
    readRequest.onerror = () => reject(toError(readRequest.error));
    tx.oncomplete = () => {
      if (!skipped) {
        devLog('save', 'seal-leaf', { saveId, nodeId: (sealedStored as SaveWithTree).saveTree?.nodeId ?? null });
      }
      resolve();
    };
    tx.onerror = () => reject(toError(tx.error));
    tx.onabort = () => reject(tx.error ?? new Error('封版叶子事务已中止。'));
  });
}

/**
 * 崩溃窗口恢复（reviewer P0）：提交协议「建叶 → 封版 → 写指针」若在「封版」后、
 * 「写指针」前崩溃，newest 仍指向已封版节点，但其未封版子叶子已创建（携带 queueTasks）。
 * 找出该子叶子（parentNodeId 匹配且 unsealedHead）。
 * 不假设单一线性链：读检查点分叉可让同一父节点下存在多个未封版子叶子，
 * 存在多个时按恢复日志持久化的目标 childNodeId 明确身份恢复；
 * 无法确定时报告冲突并返回 null，不再按保存 ID 猜测「最新子叶」。
 */
async function findUnsealedChildLeaf(
  parentNodeId: string,
  expectedChildNodeId?: string | null,
): Promise<SaveListItemSummary | null> {
  const snapshot = await getSaveCatalogSnapshot();
  const children = snapshot.items.filter((item) =>
    item.saveTree?.parentNodeId === parentNodeId
    && item.unsealedHead === true,
  );
  if (!children.length) return null;
  if (children.length === 1) return children[0];
  if (expectedChildNodeId) {
    const match = children.find((item) => item.saveTree?.nodeId === expectedChildNodeId);
    if (match) return match;
  }
  devLogError('save', 'recover-ambiguous-children', '同一父节点下存在多个未封版子叶子，无法按明确身份恢复，报告冲突而非猜测', {
    parentNodeId,
    expectedChildNodeId: expectedChildNodeId ?? null,
    children: children.map((item) => ({ nodeId: item.saveTree?.nodeId ?? null, saveId: item.id })),
  });
  return null;
}

/**
 * 采纳已创建的未封版子叶子并把 newest 指针重定向到它（保留 queueTasks）。
 * 用于 commitTurn 提交协议崩溃窗口恢复：head 指向已封版节点但子叶子已存在时，
 * 直接采纳而非分叉（分叉会把 queueTasks 重置为空）。无子叶子时返回 null。
 * expectedChildNodeId：恢复日志中持久化的本次提交目标子叶 nodeId，多子叶歧义时按此明确身份恢复。
 */
export async function adoptUnsealedChildLeaf(
  parentNodeId: string,
  expectedChildNodeId?: string | null,
): Promise<NewestStory记录 | null> {
  const child = await findUnsealedChildLeaf(parentNodeId, expectedChildNodeId);
  const childNodeId = child?.saveTree?.nodeId;
  if (!child || !childNodeId) return null;
  const newest = await loadNewestStory();
  const next = 指向NewestStory记录(newest, childNodeId);
  await saveNewestStory(next);
  devLog('save', 'adopt-orphan-child-leaf', {
    fromNodeId: parentNodeId,
    childNodeId,
    childSaveId: child.id,
  });
  return next;
}

/** 活跃叶子加载结果（reviewer P0-2 判别联合）。
 *  - ok：head 指向未封版叶子，或崩溃窗口明确采纳到未封版子叶（leaf 可写）；
 *  - no-leaf：head 缺失 / 节点或行缺失，根本不存在工作区；
 *  - sealed-conflict：head 指向已封版内部节点且无明确未封版子叶可采纳（无子叶 / 多子叶歧义），
 *    该状态不可写，调用方不得把检查点当作工作区水合。 */
export type ActiveLeafLoadResult =
  | { status: 'ok'; newest: NewestStory记录; leaf: 存档数据 }
  | { status: 'no-leaf'; newest: NewestStory记录 }
  | { status: 'sealed-conflict'; newest: NewestStory记录 };

/** 读当前活跃叶子（工作区）全量状态；返回显式判别联合，调用方必须处理「不可写」情况。
 *  expectedChildNodeId：恢复日志中持久化的本次提交目标子叶 nodeId（崩溃窗口采纳歧义时使用）。 */
export async function loadActiveLeaf(
  expectedChildNodeId?: string | null,
): Promise<ActiveLeafLoadResult> {
  let newest = await loadNewestStory();
  if (!newest.headNodeId) return { status: 'no-leaf', newest };
  const saveId = await loadSaveIdByNodeId(newest.headNodeId);
  if (!saveId) return { status: 'no-leaf', newest };
  const rawLeaf = await loadSave(saveId);
  if (!rawLeaf) return { status: 'no-leaf', newest };
  const leaf = rawLeaf;
  // 崩溃窗口恢复：head 指向已封版节点且存在未封版子叶子（提交协议在封版后崩溃）时，
  // 采纳子叶子并重定向指针，保证 queueTasks 不被丢失（分叉只会得到空队列）。
  if (!isUnsealedHeadSave(leaf)) {
    const fromNodeId = newest.headNodeId;
    const child = await findUnsealedChildLeaf(fromNodeId, expectedChildNodeId);
    const childNodeId = child?.saveTree?.nodeId;
    if (child && childNodeId) {
      const next = 指向NewestStory记录(newest, childNodeId);
      await saveNewestStory(next);
      newest = next;
      const adoptedLeaf = await loadSave(child.id);
      if (!adoptedLeaf) return { status: 'no-leaf', newest };
      devLog('save', 'active-leaf-adopted-child', {
        fromNodeId,
        childNodeId,
        childSaveId: child.id,
      });
      return { status: 'ok', newest, leaf: adoptedLeaf };
    }
    // head 指向已封版内部节点且无明确未封版子叶可采纳（无子叶 / 多子叶歧义）：
    // 返回冲突而非该检查点，绝不把不可变节点当作工作区返回（reviewer P0-2）。
    devLog('save', 'active-leaf-sealed-conflict', {
      fromNodeId,
      headNodeId: newest.headNodeId,
    });
    return { status: 'sealed-conflict', newest };
  }
  return { status: 'ok', newest, leaf };
}

/** 判定 headNodeId 指向的节点是否是可写（未封版）叶子。 */
export async function isActiveLeafWritable(headNodeId: string): Promise<boolean> {
  const saveId = await loadSaveIdByNodeId(headNodeId);
  if (!saveId) return false;
  const db = await openDB();
  const raw = await loadRawSave(db, saveId);
  return raw !== null && isUnsealedHeadSave(raw);
}

/** 回合阶段边界写：把补丁字段原地写入当前活跃叶子行（putHeadRow 的 nodeId 版入口）。 */
export async function writeLeafNode(nodeId: string, patch: Partial<存档数据>): Promise<void> {
  const saveId = await loadSaveIdByNodeId(nodeId);
  if (!saveId) {
    throw new Error(`写入叶子失败：活跃叶子节点不存在（nodeId=${nodeId}）。`);
  }
  await putHeadRow(saveId, patch);
}

async function hydrateStoredSave(save: 存档数据): Promise<存档数据> {
  const legacy = save as unknown as {
    apiSettings?: import('@/models/settings').API设置;
    gameSettings?: import('@/models/settings').游戏设置;
    theme?: import('@/models/settings').主题预设;
  };
  const [apiSettings, gameSettings, theme] = await Promise.all([
    loadSetting<import('@/models/settings').API设置>('apiSettings'),
    loadSetting<import('@/models/settings').游戏设置>('gameSettings'),
    loadSetting<import('@/models/settings').主题预设>('theme'),
  ]);
  const migratedApi = apiSettings ?? legacy.apiSettings ?? 创建空API设置();
  const migratedGame = gameSettings ?? legacy.gameSettings ?? 创建默认游戏设置();
  const migratedTheme = theme ?? legacy.theme ?? 'deepspace';
  if (apiSettings === null && legacy.apiSettings) await saveSetting('apiSettings', legacy.apiSettings);
  if (gameSettings === null && legacy.gameSettings) await saveSetting('gameSettings', legacy.gameSettings);
  if (theme === null && legacy.theme) await saveSetting('theme', legacy.theme);
  const device: DeviceSettings = {
    apiSettings: migratedApi,
    gameSettings: migratedGame,
    theme: migratedTheme,
    worldbooks: [],
  };
  return hydrateSaveEnvelope({
    id: save.id,
    type: save.type,
    timestamp: save.timestamp,
    turnCount: save.turnCount,
    gameData: save,
    ...(('saveTree' in save && save.saveTree) ? { saveTree: save.saveTree } : {}),
  }, device);
}

export async function loadSave(id: number): Promise<存档数据 | null> {
  const db = await openDB();
  const save = await loadRawSave(db, id);
  const restoredSave = save ? await restoreDeltaSaveIfNeeded(db, save) : null;
  if (!restoredSave) return null;
  const saveForAssets = await hydrateStoredSave(restoredSave);
  if (!db.objectStoreNames.contains(SAVE_ASSETS_STORE)) return saveForAssets;
  if (saveHasEmbeddedAssetPayload(saveForAssets)) {
    await migrateLoadedSaveAssets(db, saveForAssets);
  }
  const assetIds = collectSaveAlbumAssetIds(saveForAssets);
  if (!assetIds.length) return saveForAssets;
  const records = materializeSaveAssetRecords(await loadSaveAssetRecords(db, assetIds));
  // Restore registers Blobs into the runtime cache and keeps asset: refs in album state
  // (does not re-expand multi-MB base64 dataUrls into React state).
  return restoreSaveAssetPayloadFromRecords(saveForAssets, records);
}

export interface CloudTransferSaveBundle {
  save: 存档数据;
  assetRecords: SaveAssetRecord[];
}

export async function loadSaveForCloudTransfer(id: number): Promise<CloudTransferSaveBundle | null> {
  const db = await openDB();
  const raw = await loadRawSave(db, id);
  const restoredRaw = raw ? await restoreDeltaSaveIfNeeded(db, raw) : null;
  if (!restoredRaw) return null;
  const restored = await hydrateStoredSave(restoredRaw);
  const assetIds = collectSaveAlbumAssetIds(restored);
  const indexedRecords = db.objectStoreNames.contains(SAVE_ASSETS_STORE)
    ? await loadSaveAssetRecords(db, assetIds)
    : [];
  const embeddedRecords = saveHasEmbeddedAssetPayload(restored) ? extractSaveAssetRecords(restored) : [];
  const records = new Map<string, SaveAssetRecord>();
  for (const record of [...embeddedRecords, ...indexedRecords]) {
    if (record.id) records.set(record.id, record);
  }
  return { save: restored, assetRecords: Array.from(records.values()) };
}

export async function loadLatestSave(): Promise<存档数据 | null> {
  let snapshot = await getSaveCatalogSnapshot();
  if (snapshot.items.length === 0 && snapshot.pendingIds.length > 0) {
    await startSaveCatalogRepair('missing-only');
    snapshot = await getSaveCatalogSnapshot();
  }
  const list = snapshot.items;
  if (list.length === 0) return null;
  const latestPlayable = list.find((item) => item.type === 'manual' || item.type === 'imported')
    ?? list.find((item) => item.type === 'auto')
    ?? list.find((item) => item.type !== 'backup');
  if (!latestPlayable) return null;
  return loadSave(latestPlayable.id);
}

/**
 * @deprecated 仅限无树 legacy 恢复点与过渡期使用：只删单条存档记录，不维护树结构。
 * 树内节点的删除必须调用 `deleteSaveTreeNode`（叶子仅删自身、内部节点级联修剪子树、newest 槽位重定向）。
 */
export async function deleteSave(id: number): Promise<void> {
  return runWithSaveMutationPriority(() => deleteSaveInternal(id));
}

async function deleteSaveInternal(id: number): Promise<void> {
  const db = await openDB();
  const isReferencedBase = await isSaveReferencedAsDeltaBase(db, id);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    if (!isReferencedBase) {
      saveStore.delete(id);
      summaryStore.delete(id);
    } else {
      markSaveAsHiddenDeltaBase(saveStore, summaryStore, id);
    }
    deleteDeltaBySaveId(tx.objectStore(SAVE_NODE_DELTAS_STORE), id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
  await cleanupUnreferencedHiddenSaves(db);
}

// ── 存档树基础设施（片 5d-1）：树查询最小集 + 分叉 API + 节点级删除 ──

/** 树查询最小集：返回 nodeId 节点及其全部后代（含自身）的目录摘要，按时间升序。 */
export async function getSaveTreeNodeSubtree(rootId: string, nodeId: string): Promise<SaveListItemSummary[]> {
  const subtree = await collectSaveTreeNodeSubtreeSummaries(rootId.trim(), nodeId.trim());
  return subtree.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
}

/** 最近存活祖先：沿 parentNodeId 上溯，跳过 excludedNodeIds（如被删子树），返回第一个存活节点；无则 null。 */
export async function getNearestLivingAncestor(
  rootId: string,
  nodeId: string,
  excludedNodeIds: ReadonlySet<string>,
): Promise<SaveListItemSummary | null> {
  const normalizedRootId = rootId.trim();
  const normalizedNodeId = nodeId.trim();
  if (!normalizedRootId || !normalizedNodeId) return null;
  const tree = await collectSaveTreeSummaries(normalizedRootId);
  const nodeById = new Map<string, SaveListItemSummary>();
  for (const item of tree) {
    const treeNodeId = item.saveTree?.nodeId;
    if (treeNodeId) nodeById.set(treeNodeId, item);
  }
  let cursor = nodeById.get(normalizedNodeId)?.saveTree?.parentNodeId ?? null;
  while (cursor) {
    if (!excludedNodeIds.has(cursor)) {
      const summary = nodeById.get(cursor);
      if (summary) return summary;
    }
    cursor = nodeById.get(cursor)?.saveTree?.parentNodeId ?? null;
  }
  return null;
}

export interface ForkSaveTreeLeafResult {
  headNodeId: string | null;
}

/**
 * 片 5d-1 分叉 API（子任务 A 重写）：从任意检查点分叉新叶子（读检查点 = 树操作）。
 * 目标检查点全量复制为新叶子行（saveRuntime.unsealedHead、全量存储、queueTasks 重置为空），
 * newest 指针直接指向新叶子——不再有「base + head + story 覆盖集」的延迟物化。
 * 目标节点在可见记录与历史备份中反查：目录按 visibility 把 type:'backup' 分流到
 * legacyBackups 而非 items，只查 items 会漏掉备份类恢复点。
 */
export async function forkSaveTreeLeaf(params: {
  rootId: string;
  targetNodeId: string;
  branchName?: string;
}): Promise<ForkSaveTreeLeafResult> {
  return runWithSaveMutationPriority(async () => {
    const rootId = params.rootId.trim();
    const targetNodeId = params.targetNodeId.trim();
    if (!rootId || !targetNodeId) {
      throw new Error('分叉存档树需要 rootId 与目标节点 ID。');
    }
    const catalog = await getSaveCatalogSnapshot();
    if (!catalog.catalogComplete) {
      throw new Error(`仍有 ${catalog.pendingIds.length} 个节点目录待恢复，请先完成恢复后再分叉存档树。`);
    }
    const targetSummary = [...catalog.items, ...catalog.legacyBackups]
      .find((item) => item.saveTree?.nodeId === targetNodeId);
    if (!targetSummary || targetSummary.saveTree?.rootId !== rootId) {
      throw new Error(`未找到要分叉的目标检查点：${targetNodeId}`);
    }
    const targetSave = await loadSave(targetSummary.id);
    if (!targetSave) {
      throw new Error(`目标检查点数据缺失：${targetNodeId}`);
    }
    const targetTree = (targetSave as SaveWithTree).saveTree;
    if (!targetTree?.nodeId) {
      throw new Error(`目标检查点缺少存档树元信息：${targetNodeId}`);
    }
    const branchName = typeof params.branchName === 'string' && params.branchName.trim()
      ? params.branchName.trim()
      : undefined;
    const headNodeId = createUnifiedId();
    const timestamp = Date.now();
    const {
      id: _targetId,
      saveStorage: _storage,
      saveRuntime: _runtime,
      queueTasks: _queueTasks,
      ...targetFields
    } = targetSave as StoredSaveMeta & { saveStorage?: unknown };
    void _targetId;
    void _storage;
    void _runtime;
    void _queueTasks;
    const leafPayload = {
      ...targetFields,
      id: 0,
      type: 'auto' as const,
      timestamp,
      queueTasks: [],
      saveTree: {
        rootId: targetTree.rootId,
        nodeId: headNodeId,
        parentNodeId: targetTree.nodeId,
        ...(branchName ? { branchName } : {}),
        createdAt: timestamp,
      } as 存档树元信息,
    } as 存档数据;
    await createLeafNode(leafPayload);
    const newest = await loadNewestStory();
    await saveNewestStory(指向NewestStory记录(newest, headNodeId));
    devLog('save', 'tree-fork-leaf', {
      rootId,
      targetNodeId,
      targetSaveId: targetSummary.id,
      headNodeId,
      branchName,
    });
    return { headNodeId };
  });
}

export interface DeleteSaveTreeNodeResult {
  deletedCount: number;
  deletedLeaf: boolean;
  newestRedirected: boolean;
}

/**
 * 片 5d-1 节点级删除：删叶子仅删自身；删内部节点级联修剪整个子树。
 * 若当前叶子（newest base/head）落在被删集合内，newest 重定向到最近存活祖先；
 * 无存活祖先（整棵树被删）时 newest 归零。
 */
export async function deleteSaveTreeNode(params: {
  rootId: string;
  nodeId: string;
}): Promise<DeleteSaveTreeNodeResult> {
  return runWithSaveMutationPriority(() => deleteSaveTreeNodeInternal(params.rootId.trim(), params.nodeId.trim()));
}

async function deleteSaveTreeNodeInternal(rootId: string, nodeId: string): Promise<DeleteSaveTreeNodeResult> {
  if (!rootId || !nodeId) {
    throw new Error('删除存档树节点需要 rootId 与 nodeId。');
  }
  const catalog = await getSaveCatalogSnapshot();
  if (!catalog.catalogComplete) {
    throw new Error(`仍有 ${catalog.pendingIds.length} 个节点目录待恢复，完成后才能删除存档树节点。`);
  }
  const subtree = await collectSaveTreeNodeSubtreeSummaries(rootId, nodeId);
  if (!subtree.length) {
    throw new Error(`未找到要删除的存档树节点：${nodeId}`);
  }
  return performTreeNodeDeletion(rootId, catalog, subtree);
}

export async function deleteSaveTree(rootId: string): Promise<number> {
  return runWithSaveMutationPriority(() => deleteSaveTreeInternal(rootId));
}

async function deleteSaveTreeInternal(rootId: string): Promise<number> {
  const trimmedRootId = rootId.trim();
  if (!trimmedRootId) return 0;
  const catalog = await getSaveCatalogSnapshot();
  if (!catalog.catalogComplete) {
    throw new Error(`仍有 ${catalog.pendingIds.length} 个节点目录待恢复，完成后才能删除整棵存档树。`);
  }
  const tree = await collectSaveTreeSummaries(trimmedRootId);
  if (!tree.length) return 0;
  const result = await performTreeNodeDeletion(trimmedRootId, catalog, tree);
  return result.deletedCount;
}

/** 执行删除主体：目录行/存档/delta 清理（复用 deleteManagedSaveItems）+ newest 指针重定向。 */
async function performTreeNodeDeletion(
  rootId: string,
  catalog: SaveCatalogSnapshot,
  subtree: SaveListItemSummary[],
): Promise<DeleteSaveTreeNodeResult> {
  const deletedNodeIds = new Set<string>();
  for (const item of subtree) {
    const nodeId = item.saveTree?.nodeId;
    if (nodeId) deletedNodeIds.add(nodeId);
  }

  const db = await openDB();
  await deleteManagedSaveItems(db, subtree);

  const newest = await loadNewestStory();
  const currentHeadNodeId = newest.headNodeId;
  const headDeleted = currentHeadNodeId !== null && deletedNodeIds.has(currentHeadNodeId);

  let newestRedirected = false;
  if (headDeleted) {
    const ancestor = currentHeadNodeId
      ? await getNearestLivingAncestor(rootId, currentHeadNodeId, deletedNodeIds)
      : null;
    if (ancestor && ancestor.saveTree?.nodeId) {
      await saveNewestStory(指向NewestStory记录(newest, ancestor.saveTree.nodeId));
      newestRedirected = true;
    } else {
      await saveNewestStory(创建空NewestStory记录());
      newestRedirected = true;
    }
    devLog('save', 'tree-delete-newest-redirect', {
      rootId,
      deletedCount: subtree.length,
      oldHeadNodeId: newest.headNodeId,
      redirectedTo: ancestor?.saveTree?.nodeId ?? null,
      reason: ancestor ? 'living-ancestor' : 'no-living-ancestor',
    });
  }

  devLog('save', 'tree-delete-node', {
    rootId,
    deletedCount: subtree.length,
    deletedLeaf: subtree.length === 1,
    newestRedirected,
  });
  return { deletedCount: subtree.length, deletedLeaf: subtree.length === 1, newestRedirected };
}

/** 收集子树目录摘要：从 nodeId 出发 BFS 全部后代（含自身）；节点不存在返回空数组。 */
async function collectSaveTreeNodeSubtreeSummaries(rootId: string, nodeId: string): Promise<SaveListItemSummary[]> {
  const tree = await collectSaveTreeSummaries(rootId);
  const nodeById = new Map<string, SaveListItemSummary>();
  for (const item of tree) {
    const treeNodeId = item.saveTree?.nodeId;
    if (treeNodeId) nodeById.set(treeNodeId, item);
  }
  if (!nodeById.has(nodeId)) return [];
  const childrenIndex = buildTreeChildrenIndex(tree);
  const result: SaveListItemSummary[] = [];
  const stack: string[] = [nodeId];
  let current = stack.pop();
  while (current) {
    const summary = nodeById.get(current);
    if (summary) result.push(summary);
    const children = childrenIndex.get(current) ?? [];
    for (const child of children) {
      const childNodeId = child.saveTree?.nodeId;
      if (childNodeId) stack.push(childNodeId);
    }
    current = stack.pop();
  }
  return result;
}

function buildTreeChildrenIndex(summaries: SaveListItemSummary[]): Map<string, SaveListItemSummary[]> {
  const children = new Map<string, SaveListItemSummary[]>();
  for (const item of summaries) {
    const parentNodeId = item.saveTree?.parentNodeId;
    if (!parentNodeId) continue;
    const list = children.get(parentNodeId) ?? [];
    list.push(item);
    children.set(parentNodeId, list);
  }
  return children;
}

export async function deleteLegacyBackupSaves(): Promise<number> {
  return runWithSaveMutationPriority(async () => {
    const catalog = await getSaveCatalogSnapshot();
    if (!catalog.legacyBackups.length) return 0;
    const db = await openDB();
    await deleteManagedSaveItems(db, catalog.legacyBackups);
    return catalog.legacyBackups.length;
  });
}

export async function loadSaveTree(rootId: string): Promise<存档数据[]> {
  const list = await getSaveList();
  const treeItems = list
    .filter((item) => item.saveTree?.rootId === rootId)
    .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
  const saves: 存档数据[] = [];
  for (const item of treeItems) {
    const save = await loadSave(item.id);
    if (save) saves.push(save);
  }
  return saves;
}

export async function stageCloudMergeRecord(
  transferId: string,
  recordKey: string,
  value: CloudMergeStagedRecord,
): Promise<void> {
  const db = await openDB();
  const key = cloudMergeStageKey(transferId, recordKey);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    tx.objectStore(SETTINGS_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('暂存云备份合并数据失败。'));
    tx.onabort = () => reject(tx.error ?? new Error('暂存云备份合并数据已中止。'));
  });
}

export async function deleteCloudMergeStagedRecord(
  transferId: string,
  recordKey: string,
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    tx.objectStore(SETTINGS_STORE).delete(cloudMergeStageKey(transferId, recordKey));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('清理云备份暂存条目失败。'));
  });
}

export async function loadCloudMergeStagedRecord(
  transferId: string,
  recordKey: string,
): Promise<CloudMergeStagedRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const request = tx.objectStore(SETTINGS_STORE).get(cloudMergeStageKey(transferId, recordKey));
    request.onsuccess = () => resolve((request.result as { value?: CloudMergeStagedRecord } | undefined)?.value ?? null);
    request.onerror = () => reject(toError(request.error));
  });
}

export async function clearCloudMergeStaging(transferId: string): Promise<void> {
  const db = await openDB();
  const prefix = cloudMergeStagePrefix(transferId);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const request = tx.objectStore(SETTINGS_STORE).openCursor(cloudMergeStageRange(prefix));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('清理云备份合并暂存区失败。'));
  });
}

export async function commitCloudMergeStaging(transferId: string): Promise<CloudMergeCommitResult> {
  return runWithSaveMutationPriority(async () => {
    const db = await openDB();
    return commitCloudMergeStagingTransaction(db, transferId);
  });
}

async function commitCloudMergeStagingTransaction(
  db: IDBDatabase,
  transferId: string,
): Promise<CloudMergeCommitResult> {
  const prefix = cloudMergeStagePrefix(transferId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [SETTINGS_STORE, SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_ASSETS_STORE, SAVE_NODE_DELTAS_STORE],
      'readwrite',
    );
    const settingsStore = tx.objectStore(SETTINGS_STORE);
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const assetStore = tx.objectStore(SAVE_ASSETS_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    const saveIds: number[] = [];
    const assetIds: string[] = [];
    const request = settingsStore.openCursor(cloudMergeStageRange(prefix));
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      try { tx.abort(); } catch { /* transaction already inactive */ }
      reject(error instanceof Error ? error : new Error('提交云备份合并事务失败。'));
    };
    request.onsuccess = () => {
      if (settled) return;
      const cursor = request.result;
      if (!cursor) return;
      const staged = (cursor.value as { value?: CloudMergeStagedRecord } | undefined)?.value;
      if (!staged || (staged.kind !== 'node' && staged.kind !== 'asset')) {
        fail(new Error(`云备份合并暂存条目无效：${JSON.stringify(cursor.key)}`));
        return;
      }
      if (staged.kind === 'asset') {
        if (!staged.record.id) {
          fail(new Error('云备份资源暂存条目缺少 ID。'));
          return;
        }
        assetStore.put(staged.record);
        assetIds.push(staged.record.id);
        cursor.delete();
        cursor.continue();
        return;
      }

      try {
        const normalized = stripSaveAssetPayloadForStorage({
          ...staged.save,
          type: normalizeSaveType(staged.save.type),
        });
        const { id: _discardedId, ...withoutId } = normalized;
        void _discardedId;
        const addRequest = saveStore.add(withoutId);
        addRequest.onsuccess = () => {
          try {
            const id = Number(addRequest.result);
            if (!Number.isSafeInteger(id) || id <= 0) throw new Error('云备份节点没有获得有效的本地 ID。');
            const saved = { ...normalized, id };
            summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(saved)));
            const delta = buildSaveNodeDeltaRecord(saved, id);
            if (delta) deltaStore.put(delta);
            saveIds.push(id);
            cursor.delete();
            cursor.continue();
          } catch (error) {
            fail(error);
          }
        };
        addRequest.onerror = () => fail(addRequest.error ?? new Error('写入云备份节点失败。'));
      } catch (error) {
        fail(error);
      }
    };
    request.onerror = () => fail(request.error ?? new Error('读取云备份合并暂存区失败。'));
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve({ saveIds, assetIds });
    };
    tx.onerror = () => fail(tx.error ?? new Error('提交云备份合并事务失败。'));
    tx.onabort = () => fail(tx.error ?? new Error('云备份合并事务已中止，本地存档没有改变。'));
  });
}

export async function hasAnySave(): Promise<boolean> {
  const snapshot = await getSaveCatalogSnapshot();
  return snapshot.items.length > 0 || snapshot.pendingIds.length > 0;
}

function deleteDeltaBySaveId(deltaStore: IDBObjectStore, saveId: number): void {
  const request = deltaStore.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const delta = cursor.value as SaveNodeDeltaRecord;
    if (delta.saveId === saveId) cursor.delete();
    cursor.continue();
  };
}

async function findAutoDeltaBase(db: IDBDatabase, save: 存档数据): Promise<{ baseSave: 存档数据; baseSaveId: number } | null> {
  if (save.type !== 'auto') return null;
  const tree = (save as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree;
  if (!tree?.parentNodeId) return null;
  const summaries = await readSaveSummaries(db);
  const parentSummary = summaries.find((item) => item.saveTree?.nodeId === tree.parentNodeId);
  if (!parentSummary?.id) return null;
  const parentSave = await loadDeltaBaseCandidateSave(db, parentSummary.id);
  if (!parentSave) return null;
  if (parentSummary.unsealedHead === true || isUnsealedHeadSave(parentSave)) {
    devLog('save', 'delta-base-skipped-unsealed-head', { saveId: parentSummary.id, nodeId: tree.parentNodeId });
    return null;
  }
  const parentIsDelta = isDeltaOnlyStoredSave(parentSave);
  const baseSaveId = parentIsDelta
    ? await resolveDeltaBaseSaveId(db, parentSave)
    : parentSummary.id;
  if (!baseSaveId) return null;
  const deltaCount = await countDeltasUsingBase(db, baseSaveId);
  if (deltaCount >= MAX_DELTA_NODES_PER_CHECKPOINT) return null;
  const baseSave = !parentIsDelta && baseSaveId === parentSummary.id
    ? parentSave
    : await loadDeltaBaseCandidateSave(db, baseSaveId);
  if (!baseSave || isDeltaOnlyStoredSave(baseSave)) return null;
  return { baseSave, baseSaveId };
}

async function loadDeltaBaseCandidateSave(db: IDBDatabase, id: number): Promise<存档数据 | null> {
  return loadRawSave(db, id);
}

async function loadRawSave(db: IDBDatabase, id: number): Promise<存档数据 | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const store = tx.objectStore(SAVES_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const result = request.result as 存档数据 | undefined;
      resolve(result ?? null);
    };
    request.onerror = () => reject(toError(request.error));
  });
}

async function restoreDeltaSaveIfNeeded(db: IDBDatabase, save: 存档数据, visited = new Set<number>()): Promise<存档数据> {
  if (!isDeltaOnlyStoredSave(save)) return save;
  const saveId = save.id || 0;
  if (visited.has(saveId)) return save;
  visited.add(saveId);
  const tree = (save as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree;
  if (!tree?.nodeId) return save;
  const delta = await loadDeltaRecordByNodeId(db, tree.nodeId);
  const baseSaveId = delta?.deltaPayload?.baseSaveId
    ?? (save as 存档数据 & { saveStorage?: { baseSaveId?: number } }).saveStorage?.baseSaveId;
  if (!delta || !baseSaveId) return save;
  const rawBase = await loadDeltaBaseCandidateSave(db, baseSaveId);
  if (!rawBase) return save;
  const base = await restoreDeltaSaveIfNeeded(db, rawBase, visited);
  return restoreSaveFromDelta(base, save, delta);
}

async function getReferencedDeltaBaseIds(db: IDBDatabase): Promise<Set<number>> {
  const referencedBaseIds = new Set<number>();
  await scanIndexedDeltaRecords(db, (delta) => {
    if (delta.deltaPayload?.baseSaveId) referencedBaseIds.add(delta.deltaPayload.baseSaveId);
  });
  return referencedBaseIds;
}

async function resolveDeltaBaseSaveId(db: IDBDatabase, save: 存档数据): Promise<number | null> {
  const directBaseId = (save as 存档数据 & { saveStorage?: { baseSaveId?: number } }).saveStorage?.baseSaveId;
  if (directBaseId) return directBaseId;
  const tree = (save as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree;
  if (!tree?.nodeId) return null;
  const delta = await loadDeltaRecordByNodeId(db, tree.nodeId);
  return delta?.deltaPayload?.baseSaveId ?? null;
}

async function countDeltasUsingBase(db: IDBDatabase, baseSaveId: number): Promise<number> {
  const matchingNodeIds = new Set<string>();
  await scanIndexedDeltaRecords(db, (delta) => {
    if (delta.deltaPayload?.baseSaveId === baseSaveId) {
      matchingNodeIds.add(delta.nodeId || `save:${delta.saveId}`);
    }
  });
  return matchingNodeIds.size;
}

async function isSaveReferencedAsDeltaBase(db: IDBDatabase, saveId: number): Promise<boolean> {
  const referencedBaseIds = await getReferencedDeltaBaseIds(db);
  return referencedBaseIds.has(saveId);
}

async function cleanupUnreferencedHiddenSaves(db: IDBDatabase): Promise<void> {
  const [records, referencedBaseIds] = await Promise.all([
    readSaveCatalogRecords(db),
    getReferencedDeltaBaseIds(db),
  ]);
  const orphanIds = Array.from(new Set([
    ...records
      .filter((record) => record.visibility === 'hidden-delta-base')
      .map((record) => record.id),
  ]))
    .filter((id) => !referencedBaseIds.has(id));
  if (!orphanIds.length) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    for (const id of orphanIds) {
      saveStore.delete(id);
      summaryStore.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

async function loadDeltaRecordByNodeId(db: IDBDatabase, nodeId: string): Promise<SaveNodeDeltaRecord | null> {
  if (!db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_NODE_DELTAS_STORE, 'readonly');
    const req = tx.objectStore(SAVE_NODE_DELTAS_STORE).get(nodeId);
    req.onsuccess = () => {
      const result = req.result as SaveNodeDeltaRecord | undefined;
      resolve(result ?? null);
    };
    req.onerror = () => reject(toError(req.error));
  });
}

async function scanIndexedDeltaRecords(
  db: IDBDatabase,
  visitor: (delta: SaveNodeDeltaRecord) => void,
): Promise<void> {
  if (!db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVE_NODE_DELTAS_STORE, 'readonly');
    const request = tx.objectStore(SAVE_NODE_DELTAS_STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      visitor(cursor.value as SaveNodeDeltaRecord);
      cursor.continue();
    };
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

function collectSaveAlbumAssetIds(save: 存档数据): string[] {
  const ids = new Set<string>();
  for (const asset of save.相册?.assets ?? []) {
    if (asset.id) ids.add(asset.id);
  }
  return Array.from(ids);
}

async function loadSaveAssetRecords(db: IDBDatabase, assetIds: string[]): Promise<SaveAssetRecord[]> {
  if (!assetIds.length) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_ASSETS_STORE, 'readonly');
    const store = tx.objectStore(SAVE_ASSETS_STORE);
    const records: SaveAssetRecord[] = [];
    let pending = assetIds.length;
    const finish = () => {
      pending -= 1;
      if (pending === 0) resolve(records);
    };
    for (const id of assetIds) {
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) records.push(req.result as SaveAssetRecord);
        finish();
      };
      req.onerror = () => reject(toError(req.error));
    }
  });
}

async function migrateLoadedSaveAssets(db: IDBDatabase, save: 存档数据): Promise<void> {
  const records = materializeSaveAssetRecords(extractSaveAssetRecords(save));
  if (!records.length) return;
  const storedSave = stripSaveAssetPayloadForStorage(save);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_ASSETS_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const assetStore = tx.objectStore(SAVE_ASSETS_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    for (const record of records) assetStore.put(record);
    saveStore.put(storedSave);
    summaryStore.put(buildSaveSummary(storedSave));
    const delta = buildSaveNodeDeltaRecord(storedSave, storedSave.id || 0);
    if (delta) {
      deltaStore.put(delta);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

// ── NewestStory（全局头指针槽，片 5a-2 D1-A：单记录仅存 headNodeId，不携带任何数据，
//    指向存档树中的活跃叶子或已封版节点；读叶子 = 水合，读检查点 = 分叉）──

export async function loadNewestStory(): Promise<NewestStory记录> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEWEST_STORY_STORE, 'readonly');
    const request = tx.objectStore(NEWEST_STORY_STORE).get(NEWEST_STORY_STORE_KEY);
    request.onsuccess = () => resolve(归一化NewestStory记录(request.result));
    request.onerror = () => {
      const error = request.error;
      reject(error instanceof Error ? error : new Error('读取 newestStory 记录失败。'));
    };
  });
}

export async function saveNewestStory(record: NewestStory记录): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NEWEST_STORY_STORE, 'readwrite');
    tx.objectStore(NEWEST_STORY_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      const error = tx.error;
      reject(error instanceof Error ? error : new Error('写入 newestStory 记录失败。'));
    };
  });
}

// ── Settings operations ──

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await writeIndexedSetting(key, value);
}

export async function loadSetting<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const request = tx.objectStore(SETTINGS_STORE).get(key);
    request.onsuccess = () => {
      const result = request.result as { value?: T } | undefined;
      resolve(result?.value ?? null);
    };
    request.onerror = () => reject(toError(request.error));
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await deleteIndexedSetting(key);
}

async function writeIndexedSetting(key: string, value: unknown): Promise<void> {
  const storedValue = 剥离游戏设置运行态键(key, value);
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put({ key, value: storedValue });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

/** 单点剥离（片 5a-2 D3）：gameSettings 落盘时剔除两运行态键，内存 state.gameSettings 不动。 */
function 剥离游戏设置运行态键(key: string, value: unknown): unknown {
  if (key !== 'gameSettings') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  if (!('macroGlobalVars' in source) && !('worldbookTriggerStates' in source)) return value;
  const { macroGlobalVars: _macro, worldbookTriggerStates: _trigger, ...rest } = source;
  void _macro;
  void _trigger;
  return rest;
}

async function deleteIndexedSetting(key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

function markSaveAsHiddenDeltaBase(
  saveStore: IDBObjectStore,
  summaryStore: IDBObjectStore,
  saveId: number,
): void {
  const req = saveStore.get(saveId);
  req.onsuccess = () => {
    const save = req.result as StoredSaveMeta | undefined;
    if (!save) return;
    saveStore.put({
      ...save,
      saveRuntime: {
        ...(save.saveRuntime ?? {}),
        hiddenDeltaBase: true,
      },
    });
    summaryStore.put(createHiddenDeltaBaseCatalogRecord({
      id: saveId,
      type: normalizeSaveType(save.type),
      timestamp: save.timestamp || 0,
    }));
  };
}

// ── Export / Import ──

export async function exportSavePackage(save: 存档数据): Promise<void> {
  const blob = await buildSavePackage(save);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const travelerName = sanitizeFilename(save.旅人.姓名 || 'traveler');
  const turnCount = save.turnCount;
  const stamp = new Date(save.timestamp || Date.now())
    .toISOString()
    .replace(/[:.]/g, '-');
  a.download = `KaiTuoYiShi-${travelerName}-turn-${turnCount}-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportSaveTreePackage(saves: 存档数据[]): Promise<void> {
  if (!saves.length) return;
  const blob = await buildSaveTreePackage(saves);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const latest = [...saves].sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0))[0];
  const travelerName = sanitizeFilename(latest.旅人.姓名 || 'traveler');
  const turnCount = latest.turnCount;
  const stamp = new Date(latest.timestamp || Date.now())
    .toISOString()
    .replace(/[:.]/g, '-');
  a.href = url;
  a.download = `KaiTuoYiShi-${travelerName}-tree-${saves.length}-nodes-turn-${turnCount}-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSaveJson(json: string): 存档数据 {
  const data: unknown = JSON.parse(json);
  if (!isImportableSave(data)) throw new Error('无效的存档文件');
  return data;
}

export async function importSaveFileAsMany(file: File): Promise<存档数据[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json') || file.type === 'application/json') {
    const saves = [importSaveJson(await file.text())];
    devLog('save', 'import-save-parsed', { nodeCount: saves.length });
    return saves;
  }
  if (name.endsWith('.ktysave') || name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    const saves = parseSaveTreePackage(await file.arrayBuffer());
    const remapped = remapImportedSaveTree(saves);
    if (!remapped.every(isImportableSave)) throw new Error('无效的存档包');
    devLog('save', 'import-save-parsed', { nodeCount: saves.length });
    const rootId = (remapped[0] as SaveWithTree | undefined)?.saveTree?.rootId;
    devLog('save', 'import-save-tree-remapped', { nodeCount: remapped.length, rootId });
    return remapped;
  }
  throw new Error('不支持的存档格式，请选择 .zip、.ktysave 或旧版 .json');
}

function isImportableSave(value: unknown): value is 存档数据 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return Boolean(
    raw.旅人
    && raw.世界
    && Array.isArray(raw.chatHistory)
    && raw.gameSettings
    && raw.apiSettings
    && raw.theme,
  );
}

function remapImportedSaveTree(saves: 存档数据[]): 存档数据[] {
  const rootId = createImportId();
  const nodeIdMap = new Map<string, string>();
  for (const save of saves) {
    const tree = (save as SaveWithTree).saveTree;
    if (tree?.nodeId) {
      nodeIdMap.set(tree.nodeId, createImportId());
    }
  }
  return saves.map((save, index) => {
    const tree = (save as SaveWithTree).saveTree;
    if (!tree?.nodeId) {
      return {
        ...save,
        saveTree: {
          rootId,
          nodeId: createImportId(),
          branchName: '导入节点',
          createdAt: save.timestamp || Date.now() + index,
        },
      } as 存档数据;
    }
    return {
      ...save,
      saveTree: {
        ...tree,
        rootId,
        nodeId: nodeIdMap.get(tree.nodeId) ?? createImportId(),
        parentNodeId: tree.parentNodeId ? nodeIdMap.get(tree.parentNodeId) : undefined,
        branchName: tree.branchName ?? '导入节点',
        createdAt: tree.createdAt || save.timestamp || Date.now() + index,
      },
    } as 存档数据;
  });
}

function createImportId(): string {
  return createUnifiedId();
}

function stripCloudBackupRestoreRuntime<T extends 存档数据>(save: T): T {
  const source = save as T & { saveRuntime?: Record<string, unknown> };
  if (!source.saveRuntime || !('cloudBackupOriginFingerprint' in source.saveRuntime)) return save;
  const { cloudBackupOriginFingerprint: _origin, ...remainingRuntime } = source.saveRuntime;
  void _origin;
  return {
    ...save,
    ...(Object.keys(remainingRuntime).length ? { saveRuntime: remainingRuntime } : { saveRuntime: undefined }),
  };
}

function cloudMergeStagePrefix(transferId: string): string {
  const safeTransferId = transferId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
  if (!safeTransferId) throw new Error('云备份合并任务 ID 无效。');
  return `internal.cloudMerge.${safeTransferId}.`;
}

function cloudMergeStageKey(transferId: string, recordKey: string): string {
  const safeRecordKey = recordKey.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 220);
  if (!safeRecordKey) throw new Error('云备份合并暂存键无效。');
  return `${cloudMergeStagePrefix(transferId)}${safeRecordKey}`;
}

function cloudMergeStageRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`, false, false);
}

function normalizeSaveType(type: unknown): 存档类型 {
  return type === 'auto' || type === 'backup' || type === 'imported' ? type : 'manual';
}

async function readSaveSummaries(db: IDBDatabase): Promise<SaveListItemSummary[]> {
  return (await readIndexedSaveCatalogSnapshot(db)).items;
}

async function readSaveCatalogRecords(db: IDBDatabase): Promise<SaveCatalogRecord[]> {
  if (!db.objectStoreNames.contains(SAVE_SUMMARIES_STORE)) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readonly');
    const store = tx.objectStore(SAVE_SUMMARIES_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const list = (request.result as unknown[])
        .map((value): SaveCatalogRecord | null => {
          const normalized = normalizeSaveCatalogRecord(value);
          if (normalized) return normalized;
          if (value && typeof value === 'object' && 'chatHistory' in value) {
            return createCatalogRecordFromSummary(buildSaveSummary(value as 存档数据));
          }
          return null;
        })
        .filter((record): record is SaveCatalogRecord => Boolean(record));
      resolve(list);
    };
    request.onerror = () => reject(toError(request.error));
  });
}

async function readIndexedSaveKeys(db: IDBDatabase): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const request = tx.objectStore(SAVES_STORE).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toError(request.error));
  });
}

async function readIndexedSaveCatalogSnapshot(db: IDBDatabase): Promise<SaveCatalogSnapshot> {
  const [records, keys] = await Promise.all([
    readSaveCatalogRecords(db),
    readIndexedSaveKeys(db),
  ]);
  return buildSaveCatalogSnapshot(records, keys);
}

export async function startSaveCatalogRepair(
  scope: SaveCatalogRepairScope = 'missing-only',
): Promise<SaveCatalogRepairResult> {
  const db = await openDB();
  return startSaveCatalogRepairTask(scope, {
    collectIds: async (requestedScope) => {
      if (requestedScope === 'full-validation') {
        return (await readIndexedSaveKeys(db))
          .map((key) => Math.floor(Number(key)))
          .filter((id) => Number.isFinite(id) && id > 0)
          .sort((a, b) => b - a);
      }
      return (await readIndexedSaveCatalogSnapshot(db)).pendingIds;
    },
    repairOne: (id) => repairOneSaveCatalogRecord(db, id),
    cleanupStaleRecords: () => cleanupStaleSaveCatalogRecords(db),
    acquireLease: () => acquireSaveCatalogRepairLease(db),
    renewLease: () => renewSaveCatalogRepairLease(db),
    releaseLease: () => releaseSaveCatalogRepairLease(db),
  });
}

export async function repairSaveDatabase(): Promise<void> {
  const activeState = getSaveCatalogRepairState();
  const fullValidationQueuedBehindBackground = (
    activeState.scope === 'missing-only'
    && activeState.phase !== 'idle'
    && activeState.phase !== 'completed'
    && activeState.phase !== 'partial-failure'
  );
  await startSaveCatalogRepair('full-validation');
  if (fullValidationQueuedBehindBackground) {
    await startSaveCatalogRepair('full-validation');
  }
  // 目录修复完成后顺带修复树完整性：把父指针指向不存在节点的行升格为根。
  // 自动轮转删除已取消（rotate 是断链根因），这里兜底修复历史存量断链。
  await repairDanglingSaveTreeParents();
}

/** 悬垂父链修复：把 saveTree.parentNodeId 指向不存在节点的行升格为根（置 null）。
 * 同步 saves 行与目录行两处；delta-only 行的 saveTree 在 restoreSaveFromDelta 中
 * 以行内值为准（后写覆盖 deltaPayload.fields），delta 记录无需改动。
 * 幂等可重放；返回修复行数。 */
export async function repairDanglingSaveTreeParents(): Promise<number> {
  return runWithSaveMutationPriority(async () => {
    const db = await openDB();
    const rows: Array<{ id: number; saveTree?: 存档树元信息 | null }> = [];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SAVES_STORE, 'readonly');
      const cur = tx.objectStore(SAVES_STORE).openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) {
          resolve();
          return;
        }
        const v = c.value as { id?: unknown; saveTree?: unknown } | undefined;
        if (v && typeof v.id === 'number' && isPlainRecord(v.saveTree)) {
          rows.push({ id: v.id, saveTree: v.saveTree as unknown as 存档树元信息 });
        }
        c.continue();
      };
      cur.onerror = () => reject(toError(cur.error));
    });
    const nodeIds = new Set<string>();
    for (const r of rows) {
      if (r.saveTree?.nodeId) nodeIds.add(r.saveTree.nodeId.trim());
    }
    const dangling = rows.filter((r) => r.saveTree?.parentNodeId && !nodeIds.has(r.saveTree.parentNodeId.trim()));
    if (!dangling.length) return 0;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE], 'readwrite');
      const saveStore = tx.objectStore(SAVES_STORE);
      const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
      for (const r of dangling) {
        const saveReq = saveStore.get(r.id);
        saveReq.onsuccess = () => {
          const save = saveReq.result as (存档数据 & { saveTree?: 存档树元信息 }) | undefined;
          if (!save?.saveTree) return;
          const { parentNodeId: _removedParentNodeId, ...rest } = save.saveTree;
          void _removedParentNodeId;
          save.saveTree = rest;
          saveStore.put(save);
        };
        saveReq.onerror = () => reject(toError(saveReq.error));
        const sumReq = summaryStore.get(r.id);
        sumReq.onsuccess = () => {
          const sum = sumReq.result as { id?: unknown; saveTree?: 存档树元信息 } | undefined;
          if (!sum?.saveTree) return;
          const { parentNodeId: _removedParentNodeId, ...rest } = sum.saveTree;
          void _removedParentNodeId;
          sum.saveTree = rest;
          summaryStore.put(sum);
        };
        sumReq.onerror = () => reject(toError(sumReq.error));
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(toError(tx.error));
      tx.onabort = () => reject(tx.error ?? new Error('悬垂父链修复事务已中止'));
    });
    devLog('save', 'repair-dangling-parents', {
      scanned: rows.length,
      repaired: dangling.length,
      dangling: dangling.map((r) => ({ id: r.id, nodeId: r.saveTree?.nodeId, parentNodeId: r.saveTree?.parentNodeId })),
    });
    return dangling.length;
  });
}

async function repairOneSaveCatalogRecord(db: IDBDatabase, id: number): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE], 'readwrite');
      const saveStore = tx.objectStore(SAVES_STORE);
      const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
      const request = saveStore.get(id);
      request.onsuccess = () => {
        const save = request.result as 存档数据 | undefined;
        if (!save) {
          summaryStore.delete(id);
          return;
        }
        if (isHiddenDeltaBaseSave(save)) {
          summaryStore.put(createHiddenDeltaBaseCatalogRecord({
            id,
            type: normalizeSaveType(save.type),
      timestamp: save.timestamp || 0,
          }));
          return;
        }
        summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(save)));
      };
      request.onerror = () => reject(toError(request.error));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(toError(tx.error));
      tx.onabort = () => reject(tx.error ?? new Error('存档目录恢复事务已中止'));
    });
  } catch (error) {
    await writeUnreadableSaveCatalogRecord(db, id, error).catch(() => {});
    throw error;
  }
}

function isHiddenDeltaBaseSave(save: 存档数据): boolean {
  return Boolean((save as StoredSaveMeta).saveRuntime?.hiddenDeltaBase);
}

export function isUnsealedHeadSave(save: 存档数据): boolean {
  return (save as StoredSaveMeta).saveRuntime?.unsealedHead === true;
}

async function writeUnreadableSaveCatalogRecord(
  db: IDBDatabase,
  id: number,
  error: unknown,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readwrite');
    const store = tx.objectStore(SAVE_SUMMARIES_STORE);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const current = normalizeSaveCatalogRecord(getRequest.result);
      const retryCount = current?.visibility === 'unreadable' ? current.retryCount + 1 : 1;
      store.put(createUnreadableSaveCatalogRecord({ id, error, retryCount }));
    };
    getRequest.onerror = () => reject(toError(getRequest.error));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

async function cleanupStaleSaveCatalogRecords(db: IDBDatabase): Promise<void> {
  const snapshot = await readIndexedSaveCatalogSnapshot(db);
  if (!snapshot.staleCatalogIds.length) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readwrite');
    const store = tx.objectStore(SAVE_SUMMARIES_STORE);
    for (const id of snapshot.staleCatalogIds) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

async function acquireSaveCatalogRepairLease(db: IDBDatabase): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get(SAVE_CATALOG_REPAIR_LEASE_KEY);
    let acquired = false;
    request.onsuccess = () => {
      const current = request.result as { key?: string; value?: { ownerId?: string; expiresAt?: number } } | undefined;
      const ownerId = current?.value?.ownerId;
      const expiresAt = Number(current?.value?.expiresAt) || 0;
      if (!ownerId || ownerId === SAVE_CATALOG_REPAIR_OWNER || expiresAt <= Date.now()) {
        acquired = true;
        store.put({
          key: SAVE_CATALOG_REPAIR_LEASE_KEY,
          value: {
            ownerId: SAVE_CATALOG_REPAIR_OWNER,
            expiresAt: Date.now() + SAVE_CATALOG_REPAIR_LEASE_MS,
          },
        });
      }
    };
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve(acquired);
    tx.onerror = () => reject(toError(tx.error));
  });
}

async function renewSaveCatalogRepairLease(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get(SAVE_CATALOG_REPAIR_LEASE_KEY);
    request.onsuccess = () => {
      const current = request.result as { value?: { ownerId?: string } } | undefined;
      if (current?.value?.ownerId !== SAVE_CATALOG_REPAIR_OWNER) {
        tx.abort();
        return;
      }
      store.put({
        key: SAVE_CATALOG_REPAIR_LEASE_KEY,
        value: {
          ownerId: SAVE_CATALOG_REPAIR_OWNER,
          expiresAt: Date.now() + SAVE_CATALOG_REPAIR_LEASE_MS,
        },
      });
    };
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('存档目录恢复租约续期失败'));
    tx.onabort = () => reject(new Error('存档目录恢复租约已由其他页面接管'));
  });
}

async function releaseSaveCatalogRepairLease(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get(SAVE_CATALOG_REPAIR_LEASE_KEY);
    request.onsuccess = () => {
      const current = request.result as { value?: { ownerId?: string } } | undefined;
      if (current?.value?.ownerId === SAVE_CATALOG_REPAIR_OWNER) {
        store.delete(SAVE_CATALOG_REPAIR_LEASE_KEY);
      }
    };
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

function buildSaveSummary(save: 存档数据): SaveListItemSummary {
  return {
    id: save.id,
    type: normalizeSaveType(save.type),
    timestamp: save.timestamp,
    saveTree: (save as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree,
    ...(isUnsealedHeadSave(save) ? { unsealedHead: true } : {}),
    travelerName: save.旅人.姓名,
    turnCount: save.turnCount ?? (save.chatHistory.length + 1),
    worldPeriodName: save.世界.当前时段.名称,
    currentDate: save.世界.当前日期,
    currentTime: save.世界.当前时间,
    currentLocation: save.世界.当前地点,
    lastSummary: summarizeSave(save),
    sizeBytes: estimateSaveSize(save),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSaveId(value: unknown): number | null {
  const id = Math.floor(Number(value));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeNodeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function summarizeSave(save: 存档数据): string {
  const latestAssistant = [...save.chatHistory]
    .reverse()
    .find((msg) => msg.role === 'assistant');
  const text = latestAssistant?.parsedResponse?.body || latestAssistant?.content || '';
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? Array.from(cleaned).slice(0, 120).join('') : '';
}

function estimateSaveSize(save: 存档数据): number {
  const chatBytes = save.chatHistory.reduce((sum, message) => {
    return sum + message.content.length + (message.parsedResponse?.body.length ?? 0);
  }, 0);
  const albumAssets = save.相册?.assets ?? [];
  const albumBytes = albumAssets.reduce((sum, asset) => {
    const declaredSize = asset.size || 0;
    if (declaredSize > 0) return sum + declaredSize;
    return sum + (asset.dataUrl?.length ?? 0) + (asset.originalUrl?.length ?? 0);
  }, 0);
  const queueBytes = (save.queueTasks ?? []).reduce((sum, task) => {
    return sum +
      task.title.length +
      (task.subtitle?.length ?? 0) +
      (task.detail?.length ?? 0) +
      (task.retryHint?.length ?? 0);
  }, 0);
  return Math.max(1024, chatBytes * 2 + albumBytes + queueBytes * 2 + 48_000);
}

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'traveler';
}
