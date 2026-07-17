import type { 存档数据 } from '@/models/settings';
import type { SaveListItemSummary } from '@/services/storage/saveCatalog';
import {
  CLOUD_BACKUP_PART_HARD_BYTES,
  CLOUD_BACKUP_PART_TARGET_BYTES,
  createCloudSnapshotId,
  fingerprintCloudBackupNode,
  type CloudBackupAssetMeta,
  type CloudBackupNodeMeta,
  type CloudBackupPartEntry,
  type CloudBackupPartMeta,
  type CloudBackupPointerV2,
} from '@/services/cloudBackupPackage';
import { CloudBackupWorkerClient } from '@/services/cloudBackupWorkerClient';
import {
  cleanupExpiredCloudBackupTransfers,
  createCloudBackupTransfer,
  deleteCloudBackupTransfer,
  putCloudBackupTransferPart,
  updateCloudBackupTransfer,
} from '@/services/storage/cloudBackupTransferStore';
import { sanitizeSaveForExport } from '@/services/savePackage';
import {
  extractSaveAssetRecords,
  stripSaveAssetPayloadForStorage,
  type SaveAssetRecord,
} from '@/utils/saveAssetStorage';
import { dataUrlToBlob } from '@/utils/albumObjectUrl';

export interface CloudBackupBuildProgress {
  phase: 'checking' | 'packing-node' | 'packing-part' | 'completed';
  current: number;
  total: number;
  label: string;
}

export interface CloudBackupBuildSource {
  summaries: SaveListItemSummary[];
  legacyBackups?: SaveListItemSummary[];
  catalogComplete: boolean;
  pendingCount?: number;
  unreadableCount?: number;
  loadSave?: (id: number) => Promise<存档数据 | null>;
  loadSaveBundle?: (id: number) => Promise<{ save: 存档数据; assetRecords: SaveAssetRecord[] } | null>;
}

export interface CloudBackupBuildResult {
  transferId: string;
  pointer: CloudBackupPointerV2;
}

export async function buildCompleteCloudBackup(
  source: CloudBackupBuildSource,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: CloudBackupBuildProgress) => void;
  } = {},
): Promise<CloudBackupBuildResult> {
  assertNotAborted(options.signal);
  options.onProgress?.({ phase: 'checking', current: 0, total: 1, label: '正在检查本地存档目录' });
  if (!source.catalogComplete) {
    throw new Error(`本地存档目录尚未完整：待恢复 ${source.pendingCount ?? 0}，不可读 ${source.unreadableCount ?? 0}。请先修复存档索引。`);
  }
  const byId = new Map<number, SaveListItemSummary>();
  for (const item of [...source.summaries, ...(source.legacyBackups ?? [])]) {
    if (item.id > 0) byId.set(item.id, item);
  }
  const ordered = Array.from(byId.values()).sort((left, right) => left.timestamp - right.timestamp || left.id - right.id);
  if (!ordered.length) throw new Error('本地还没有可打包的存档。');

  await cleanupExpiredCloudBackupTransfers().catch(() => 0);
  const snapshotId = createCloudSnapshotId();
  const transferId = `upload-${snapshotId}`;
  await createCloudBackupTransfer(transferId, 'upload', 'packing');

  const worker = new CloudBackupWorkerClient();
  const parts: CloudBackupPartMeta[] = [];
  const nodes: CloudBackupNodeMeta[] = [];
  const assets: CloudBackupAssetMeta[] = [];
  const assetByOriginalId = new Map<string, CloudBackupAssetMeta>();
  const assetByContentHash = new Map<string, CloudBackupAssetMeta>();
  let currentEntries: CloudBackupPartEntry[] = [];
  let currentRawBytes = 0;
  let partIndex = 0;

  const flushPart = async () => {
    if (!currentEntries.length) return;
    assertNotAborted(options.signal);
    options.onProgress?.({
      phase: 'packing-part',
      current: partIndex,
      total: Math.max(partIndex + 1, parts.length + 1),
      label: `正在封装分卷 ${partIndex + 1}`,
    });
    const packed = await worker.pack(currentEntries, options.signal);
    const path = `snapshots/${snapshotId}/parts/part-${String(partIndex).padStart(4, '0')}.ktycloud`;
    const meta: CloudBackupPartMeta = {
      path,
      index: partIndex,
      sizeBytes: packed.bytes.byteLength,
      sha256: packed.sha256,
      compression: packed.compression,
    };
    await putCloudBackupTransferPart(transferId, meta, new Blob([packed.bytes], { type: 'application/octet-stream' }));
    parts.push(meta);
    currentEntries = [];
    currentRawBytes = 0;
    partIndex += 1;
  };

  const addEntry = async (entry: CloudBackupPartEntry): Promise<number> => {
    if (entry.bytes.byteLength > CLOUD_BACKUP_PART_HARD_BYTES) {
      throw new Error(`云备份条目超过安全大小：${entry.name}（${formatBytes(entry.bytes.byteLength)}）。`);
    }
    if (currentEntries.length && currentRawBytes + entry.bytes.byteLength > CLOUD_BACKUP_PART_TARGET_BYTES) {
      await flushPart();
    }
    const assignedPart = partIndex;
    currentEntries.push(entry);
    currentRawBytes += entry.bytes.byteLength;
    if (currentRawBytes >= CLOUD_BACKUP_PART_TARGET_BYTES) await flushPart();
    return assignedPart;
  };

  try {
    for (let index = 0; index < ordered.length; index += 1) {
      assertNotAborted(options.signal);
      const summary = ordered[index];
      options.onProgress?.({
        phase: 'packing-node',
        current: index,
        total: ordered.length,
        label: `正在打包 ${summary.travelerName || '旅人'} · 第 ${summary.turnCount} 回合`,
      });
      const bundle = source.loadSaveBundle
        ? await source.loadSaveBundle(summary.id)
        : source.loadSave
          ? await source.loadSave(summary.id).then((save) => save ? ({ save, assetRecords: extractSaveAssetRecords(save) }) : null)
          : null;
      if (!bundle) throw new Error(`读取本地存档 #${summary.id} 失败，无法生成完整云备份。`);
      const save = { ...bundle.save, id: summary.id, type: summary.type } as 存档数据;
      const records = new Map(bundle.assetRecords.map((record) => [record.id, record]));
      for (const asset of save.相册?.assets ?? []) {
        if (!asset.id || assetByOriginalId.has(asset.id)) continue;
        const rawRecord = records.get(asset.id);
        if (!rawRecord) {
          if (String(asset.dataUrl || '').startsWith('asset:')) {
            throw new Error(`存档 #${summary.id} 引用的资源 ${asset.id} 缺失，无法生成完整云备份。`);
          }
          continue;
        }
        const record = rawRecord;
        const blob = resolveRecordBlob(record);
        if (!blob) throw new Error(`资源 ${asset.id} 无法读取为二进制数据。`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const contentHash = await worker.hash(bytes, options.signal);
        const existing = assetByContentHash.get(contentHash);
        if (existing) {
          const alias: CloudBackupAssetMeta = { ...existing, originalId: asset.id };
          assets.push(alias);
          assetByOriginalId.set(asset.id, alias);
          continue;
        }
        const entryPath = `assets/${contentHash}.bin`;
        const assignedPart = await addEntry({ name: entryPath, bytes });
        const meta: CloudBackupAssetMeta = {
          originalId: asset.id,
          contentHash,
          mimeType: record.mimeType || blob.type || 'application/octet-stream',
          sizeBytes: bytes.byteLength,
          entryPath,
          partIndex: assignedPart,
        };
        assets.push(meta);
        assetByOriginalId.set(asset.id, meta);
        assetByContentHash.set(contentHash, meta);
      }

      const portable = sanitizeSaveForExport(stripSaveAssetPayloadForStorage(save));
      const fingerprint = await fingerprintCloudBackupNode(portable);
      const entryPath = `nodes/${fingerprint}-${summary.id}.json`;
      const nodeBytes = new TextEncoder().encode(JSON.stringify(portable));
      const assignedPart = await addEntry({ name: entryPath, bytes: nodeBytes });
      const tree = (portable as 存档数据 & {
        saveTree?: { rootId?: string; nodeId?: string; parentNodeId?: string };
      }).saveTree;
      nodes.push({
        sourceSaveId: summary.id,
        type: String(summary.type || portable.type || 'manual'),
        timestamp: summary.timestamp || portable.timestamp || 0,
        turnCount: summary.turnCount || portable.turnCount || 0,
        rootId: tree?.rootId,
        nodeId: tree?.nodeId,
        parentNodeId: tree?.parentNodeId,
        fingerprint,
        entryPath,
        partIndex: assignedPart,
      });
      options.onProgress?.({
        phase: 'packing-node',
        current: index + 1,
        total: ordered.length,
        label: `已打包 ${summary.travelerName || '旅人'} · 第 ${summary.turnCount} 回合`,
      });
      await yieldToMainThread();
    }
    await flushPart();
    const rootKeys = new Set(nodes.map((node) => node.rootId || `legacy-${node.sourceSaveId}`));
    const uniqueAssetHashes = new Set(assets.map((asset) => asset.contentHash));
    const pointer: CloudBackupPointerV2 = {
      app: 'KaiTuoYiShi',
      kind: 'github-cloud-backup',
      version: 2,
      snapshotId,
      createdAt: new Date().toISOString(),
      nodeCount: nodes.length,
      treeCount: rootKeys.size,
      legacyBackupCount: ordered.filter((item) => item.type === 'backup').length,
      assetCount: uniqueAssetHashes.size,
      totalBytes: parts.reduce((sum, part) => sum + part.sizeBytes, 0),
      parts,
      nodes,
      assets,
    };
    await updateCloudBackupTransfer(transferId, { phase: 'packaged', pointer });
    options.onProgress?.({ phase: 'completed', current: ordered.length, total: ordered.length, label: '完整云备份打包完成' });
    return { transferId, pointer };
  } catch (error) {
    await deleteCloudBackupTransfer(transferId).catch(() => {});
    throw error;
  } finally {
    worker.dispose('云备份打包任务已结束。');
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('云备份任务已取消。', 'AbortError');
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function resolveRecordBlob(record: SaveAssetRecord): Blob | null {
  if (record.blob instanceof Blob) return record.blob;
  return dataUrlToBlob(record.dataUrl || '') ?? dataUrlToBlob(record.originalUrl || '');
}
