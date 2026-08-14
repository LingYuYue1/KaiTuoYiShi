import type { 存档数据 } from '@/models/settings';
import type { 存档树元信息 } from '@/utils/saveTree';
import { devLog } from '@/utils/devLog';
import type { SaveCatalogRepairResult, SaveCatalogRepairScope } from '@/contracts/storage';
import { buildSaveSummary, isHiddenDeltaBaseSave, normalizeSaveType } from './saveSummary';
import { readIndexedSaveCatalogSnapshot, readIndexedSaveKeys } from './saveRecord';
import {
  createCatalogRecordFromSummary,
  createHiddenDeltaBaseCatalogRecord,
  createUnreadableSaveCatalogRecord,
  normalizeSaveCatalogRecord,
} from '@/services/storage/saveCatalog';
import { runWithSaveMutationPriority, startSaveCatalogRepairTask } from '@/services/storage/saveCatalogRepair';
import {
  openDB,
  SAVES_STORE,
  SAVE_SUMMARIES_STORE,
  SETTINGS_STORE,
  SAVE_CATALOG_REPAIR_LEASE_KEY,
  SAVE_CATALOG_REPAIR_LEASE_MS,
  SAVE_CATALOG_REPAIR_OWNER,
} from './dbConnection';
import { isPlainRecord, toError } from '@/utils/storageUtils';

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
  // 单飞任务会自动等待当前进行中的修复结束，再以 full-validation 启动，
  // 因此一次调用即保证全量校验真实执行，无需二次触发。
  await startSaveCatalogRepair('full-validation');
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
