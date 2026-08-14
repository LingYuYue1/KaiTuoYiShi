import type { 存档数据 } from '@/models/settings';
import { 创建空NewestStory记录, NEWEST_STORY_STORE_KEY } from '@/models/newestStory';
import { devLog, devLogError } from '@/utils/devLog';
import { createUnifiedId, UNIFIED_ID_DB_VERSION } from '@/utils/id';
import type { 存档树元信息 } from '@/utils/saveTree';
import {
  buildSaveNodeDeltaRecord,
  isDeltaOnlyStoredSave,
  restoreSaveFromDelta,
  type SaveNodeDeltaRecord,
} from '@/utils/saveDeltaStorage';
import {
  extractSaveAssetRecords,
  materializeSaveAssetRecords,
  stripSaveAssetPayloadForStorage,
} from '@/utils/saveAssetStorage';
import { createCatalogRecordFromSummary } from '@/services/storage/saveCatalog';
import { buildSaveSummary, type SaveWithTree, type StoredSaveMeta } from './saveSummary';
import { isPlainRecord, normalizeNodeId, normalizeSaveId, toError } from '@/utils/storageUtils';

const DB_NAME = 'TimeJourneyDB';
const DB_VERSION = UNIFIED_ID_DB_VERSION;
export const SAVES_STORE = 'saves';
export const SAVE_SUMMARIES_STORE = 'saveSummaries';
export const SAVE_ASSETS_STORE = 'saveAssets';
export const SAVE_NODE_DELTAS_STORE = 'saveNodeDeltas';
export const SETTINGS_STORE = 'settings';
export const NEWEST_STORY_STORE = 'newestStory';
export const MAX_DELTA_NODES_PER_CHECKPOINT = 6;
export const SAVE_CATALOG_REPAIR_LEASE_KEY = 'internal.saveCatalogRepairLease.v2';
export const SAVE_CATALOG_REPAIR_LEASE_MS = 60_000;
export const SAVE_CATALOG_REPAIR_OWNER = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `catalog_${Date.now()}_${Math.random().toString(36).slice(2)}`;

let dbPromise: Promise<IDBDatabase> | null = null;

interface Migration {
  version: number;
  label: string;
  migrate: (transaction: IDBTransaction) => void;
}

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (db: IDBDatabase) => {
      if (settled) {
        // 已因超时/失败结算：迟到的成功连接必须关闭，避免孤儿连接。
        db.close();
        return;
      }
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
