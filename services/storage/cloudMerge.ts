import type { 存档数据 } from '@/models/settings';
import { buildSaveSummary, 剥离检查点队列任务, normalizeSaveType } from './saveSummary';
import { stripSaveAssetPayloadForStorage, type SaveAssetRecord } from '@/utils/saveAssetStorage';
import { buildSaveNodeDeltaRecord } from '@/utils/saveDeltaStorage';
import { createCatalogRecordFromSummary } from '@/services/storage/saveCatalog';
import { runWithSaveMutationPriority } from '@/services/storage/saveCatalogRepair';
import {
  openDB,
  SAVES_STORE,
  SAVE_SUMMARIES_STORE,
  SAVE_ASSETS_STORE,
  SAVE_NODE_DELTAS_STORE,
  SETTINGS_STORE,
} from './dbConnection';
import { toError } from '@/utils/storageUtils';

export type CloudMergeStagedRecord =
  | { kind: 'node'; createdAt: number; save: 存档数据 }
  | { kind: 'raw-node'; createdAt: number; save: 存档数据 }
  | { kind: 'asset'; createdAt: number; record: SaveAssetRecord };

export interface CloudMergeCommitResult {
  saveIds: number[];
  assetIds: string[];
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
        // 最终兜底：写入 saves 前再次按节点类型剥离 queueTasks（暂存路径可能已剥，幂等）。
        const normalized = stripSaveAssetPayloadForStorage(剥离检查点队列任务({
          ...staged.save,
          type: normalizeSaveType(staged.save.type),
        }));
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
