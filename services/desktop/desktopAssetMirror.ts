import type { SaveAssetRecord } from '@/utils/saveAssetStorage';
import { createAppStorageAdapter } from '@/services/storage/appStorageAdapter';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';

interface DesktopAssetMirrorIndex {
  version: 1;
  updatedAt: number;
  assets: DesktopAssetMirrorSummary[];
}

export interface DesktopAssetMirrorSummary {
  id: string;
  path: string;
  metadataPath: string;
  mimeType?: string;
  width?: number;
  height?: number;
  size?: number;
  updatedAt: number;
}

export interface DesktopAssetMaintenanceSummary {
  totalAssets: number;
  totalBytes: number;
  referencedAssets: number;
  orphanAssets: number;
  orphanBytes: number;
}

export interface DesktopAssetMirrorHealth {
  indexStatus: 'ok' | 'missing' | 'invalid' | 'unreadable';
  indexedAssets: number;
  metadataFiles: number;
  validMetadataFiles: number;
  invalidMetadataFiles: number;
  unreadableMetadataFiles: number;
  readablePayloadFiles: number;
  missingPayloadFiles: number;
  missingIndexedMetadataFiles: number;
  orphanMetadataFiles: number;
}

interface DesktopAssetMirrorRecord {
  kind: 'kaituoyishi-desktop-asset';
  version: 1;
  mirroredAt: number;
  filePath: string;
  asset: Omit<SaveAssetRecord, 'dataUrl' | 'originalUrl'> & {
    hasDataUrl: boolean;
    hasOriginalUrl: boolean;
  };
}

const INDEX_PATH = 'assets/index.json';
const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;
const ASSET_METADATA_RE = /\.meta\.json$/;

export async function mirrorAssetRecordsToDesktop(records: SaveAssetRecord[]): Promise<void> {
  if (!isDesktopRuntime() || records.length === 0) return;
  const adapter = createAppStorageAdapter();
  const index = await readAssetIndex();
  const byId = new Map(index.assets.map((asset) => [asset.id, asset]));
  for (const record of records) {
    if (!record.id || (!record.dataUrl && !record.originalUrl)) continue;
    const payload = parseDataImage(record.dataUrl ?? record.originalUrl);
    if (!payload) continue;
    const path = assetFilePath(record.id, payload.mimeType);
    const metadataPath = assetMetadataPath(record.id);
    const mirrorRecord: DesktopAssetMirrorRecord = {
      kind: 'kaituoyishi-desktop-asset',
      version: 1,
      mirroredAt: Date.now(),
      filePath: path,
      asset: {
        id: record.id,
        url: record.url,
        localRef: record.localRef,
        mimeType: record.mimeType ?? payload.mimeType,
        width: record.width,
        height: record.height,
        size: estimateAssetSize(record, payload.base64Content),
        updatedAt: record.updatedAt,
        hasDataUrl: Boolean(record.dataUrl),
        hasOriginalUrl: Boolean(record.originalUrl),
      },
    };
    if (!adapter.writeBase64File) throw new Error('当前桌面存储适配器不支持图片文件写入');
    await adapter.writeBase64File(path, payload.base64Content);
    await adapter.writeJson(metadataPath, mirrorRecord);
    byId.set(record.id, {
      id: record.id,
      path,
      metadataPath,
      mimeType: record.mimeType ?? payload.mimeType,
      width: record.width,
      height: record.height,
      size: estimateAssetSize(record, payload.base64Content),
      updatedAt: record.updatedAt || Date.now(),
    });
  }
  await writeAssetIndex(Array.from(byId.values()));
}

export async function replaceDesktopAssetMirror(records: SaveAssetRecord[]): Promise<void> {
  if (!isDesktopRuntime()) return;
  const adapter = createAppStorageAdapter();
  const index = await readAssetIndex();
  for (const asset of index.assets) {
    await adapter.remove(asset.path);
    await adapter.remove(asset.metadataPath);
  }
  await adapter.remove(INDEX_PATH);
  await mirrorAssetRecordsToDesktop(records);
}

export async function listDesktopAssetMirror(): Promise<DesktopAssetMirrorSummary[]> {
  if (!isDesktopRuntime()) return [];
  return (await readAssetIndex()).assets;
}

export async function repairDesktopAssetMirrorIndex(): Promise<DesktopAssetMirrorSummary[]> {
  if (!isDesktopRuntime()) return [];
  const index = await rebuildAssetIndexFromMetadata();
  return index.assets;
}

export async function loadDesktopAssetRecords(assetIds: Iterable<string>): Promise<SaveAssetRecord[]> {
  if (!isDesktopRuntime()) return [];
  const requested = new Set(Array.from(assetIds).filter(Boolean));
  if (requested.size === 0) return [];
  const adapter = createAppStorageAdapter();
  if (!adapter.readBase64File) return [];
  const index = await readAssetIndex();
  const byId = new Map(index.assets.map((asset) => [asset.id, asset]));
  const records: SaveAssetRecord[] = [];
  for (const id of requested) {
    const summary = byId.get(id);
    if (!summary) continue;
    try {
      const metadata = await adapter.readJson<DesktopAssetMirrorRecord>(summary.metadataPath);
      if (metadata?.kind !== 'kaituoyishi-desktop-asset' || metadata.asset.id !== id) continue;
      const base64Content = await adapter.readBase64File(summary.path);
      if (!base64Content) continue;
      const mimeType = metadata.asset.mimeType || summary.mimeType || 'image/png';
      const dataUrl = `data:${mimeType};base64,${base64Content}`;
      records.push({
        id,
        dataUrl,
        originalUrl: metadata.asset.hasOriginalUrl ? dataUrl : undefined,
        url: metadata.asset.url,
        localRef: metadata.asset.localRef,
        mimeType,
        width: metadata.asset.width,
        height: metadata.asset.height,
        size: metadata.asset.size,
        updatedAt: metadata.asset.updatedAt || metadata.mirroredAt,
      });
    } catch (error) {
      console.warn(`[desktop-asset-mirror] skip unreadable asset payload ${id}`, error);
    }
  }
  return records;
}

export async function summarizeDesktopAssetMirror(
  referencedAssetIds: Iterable<string>,
): Promise<DesktopAssetMaintenanceSummary> {
  if (!isDesktopRuntime()) {
    return { totalAssets: 0, totalBytes: 0, referencedAssets: 0, orphanAssets: 0, orphanBytes: 0 };
  }
  const referenced = new Set(referencedAssetIds);
  const assets = (await readAssetIndex()).assets;
  let referencedAssets = 0;
  let totalBytes = 0;
  let orphanBytes = 0;
  for (const asset of assets) {
    const size = Math.max(0, Number(asset.size) || 0);
    totalBytes += size;
    if (referenced.has(asset.id)) {
      referencedAssets += 1;
    } else {
      orphanBytes += size;
    }
  }
  return {
    totalAssets: assets.length,
    totalBytes,
    referencedAssets,
    orphanAssets: Math.max(0, assets.length - referencedAssets),
    orphanBytes,
  };
}

export async function cleanupUnreferencedDesktopAssets(
  referencedAssetIds: Iterable<string>,
): Promise<DesktopAssetMaintenanceSummary> {
  if (!isDesktopRuntime()) {
    return { totalAssets: 0, totalBytes: 0, referencedAssets: 0, orphanAssets: 0, orphanBytes: 0 };
  }
  const adapter = createAppStorageAdapter();
  const referenced = new Set(referencedAssetIds);
  const index = await readAssetIndex();
  const kept: DesktopAssetMirrorSummary[] = [];
  for (const asset of index.assets) {
    if (referenced.has(asset.id)) {
      kept.push(asset);
      continue;
    }
    await adapter.remove(asset.path);
    await adapter.remove(asset.metadataPath);
  }
  await writeAssetIndex(kept);
  return summarizeDesktopAssetMirror(referenced);
}

export async function inspectDesktopAssetMirrorHealth(): Promise<DesktopAssetMirrorHealth | null> {
  if (!isDesktopRuntime()) return null;
  const adapter = createAppStorageAdapter();
  const indexResult = await readAssetIndexForHealth(adapter);
  const indexedMetadataPaths = new Set((indexResult.index?.assets ?? []).map((asset) => asset.metadataPath).filter(Boolean));
  const indexedAssetIds = new Set((indexResult.index?.assets ?? []).map((asset) => asset.id).filter(Boolean));
  const metadataPaths = new Set<string>();
  let validMetadataFiles = 0;
  let invalidMetadataFiles = 0;
  let unreadableMetadataFiles = 0;
  let readablePayloadFiles = 0;
  let missingPayloadFiles = 0;
  const fileNames = await adapter.list('assets/generated-images');
  for (const fileName of fileNames) {
    if (!ASSET_METADATA_RE.test(fileName)) continue;
    const metadataPath = `assets/generated-images/${fileName}`;
    metadataPaths.add(metadataPath);
    try {
      const record = await adapter.readJson<DesktopAssetMirrorRecord>(metadataPath);
      if (record?.kind !== 'kaituoyishi-desktop-asset' || record.version !== 1 || !record.asset.id || !record.filePath) {
        invalidMetadataFiles += 1;
        continue;
      }
      validMetadataFiles += 1;
      if (!adapter.readBase64File) {
        missingPayloadFiles += 1;
        continue;
      }
      try {
        const payload = await adapter.readBase64File(record.filePath);
        if (payload) {
          readablePayloadFiles += 1;
        } else {
          missingPayloadFiles += 1;
        }
      } catch {
        missingPayloadFiles += 1;
      }
    } catch {
      unreadableMetadataFiles += 1;
    }
  }
  let missingIndexedMetadataFiles = 0;
  for (const metadataPath of indexedMetadataPaths) {
    if (!metadataPaths.has(metadataPath)) missingIndexedMetadataFiles += 1;
  }
  let orphanMetadataFiles = 0;
  for (const metadataPath of metadataPaths) {
    if (!indexedMetadataPaths.has(metadataPath)) orphanMetadataFiles += 1;
  }
  return {
    indexStatus: indexResult.status,
    indexedAssets: indexedAssetIds.size,
    metadataFiles: metadataPaths.size,
    validMetadataFiles,
    invalidMetadataFiles,
    unreadableMetadataFiles,
    readablePayloadFiles,
    missingPayloadFiles,
    missingIndexedMetadataFiles,
    orphanMetadataFiles,
  };
}

async function readAssetIndex(): Promise<DesktopAssetMirrorIndex> {
  const adapter = createAppStorageAdapter();
  try {
    const index = await adapter.readJson<DesktopAssetMirrorIndex>(INDEX_PATH);
    if (index && index.version === 1 && Array.isArray(index.assets)) {
      return index;
    }
  } catch (error) {
    console.warn('[desktop-asset-mirror] asset index read failed, trying metadata scan', error);
  }
  return rebuildAssetIndexFromMetadata(adapter);
}

async function readAssetIndexForHealth(
  adapter = createAppStorageAdapter(),
): Promise<{ status: DesktopAssetMirrorHealth['indexStatus']; index: DesktopAssetMirrorIndex | null }> {
  try {
    const index = await adapter.readJson<DesktopAssetMirrorIndex>(INDEX_PATH);
    if (!index) return { status: 'missing', index: null };
    if (index.version === 1 && Array.isArray(index.assets)) {
      return { status: 'ok', index };
    }
    return { status: 'invalid', index: null };
  } catch {
    return { status: 'unreadable', index: null };
  }
}

async function writeAssetIndex(assets: DesktopAssetMirrorSummary[]): Promise<void> {
  const adapter = createAppStorageAdapter();
  await adapter.writeJson<DesktopAssetMirrorIndex>(INDEX_PATH, {
    version: 1,
    updatedAt: Date.now(),
    assets: assets.sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)),
  });
}

function assetFilePath(id: string, mimeType: string): string {
  return `assets/generated-images/${sanitizeAssetId(id)}.${extensionForMimeType(mimeType)}`;
}

function assetMetadataPath(id: string): string {
  return `assets/generated-images/${sanitizeAssetId(id)}.meta.json`;
}

async function rebuildAssetIndexFromMetadata(
  adapter = createAppStorageAdapter(),
): Promise<DesktopAssetMirrorIndex> {
  const assets: DesktopAssetMirrorSummary[] = [];
  const fileNames = await adapter.list('assets/generated-images');
  for (const fileName of fileNames) {
    if (!ASSET_METADATA_RE.test(fileName)) continue;
    const metadataPath = `assets/generated-images/${fileName}`;
    try {
      const record = await adapter.readJson<DesktopAssetMirrorRecord>(metadataPath);
      if (record?.kind !== 'kaituoyishi-desktop-asset' || record.version !== 1 || !record.asset.id || !record.filePath) {
        continue;
      }
      assets.push({
        id: record.asset.id,
        path: record.filePath,
        metadataPath,
        mimeType: record.asset.mimeType,
        width: record.asset.width,
        height: record.asset.height,
        size: record.asset.size,
        updatedAt: record.asset.updatedAt || record.mirroredAt || Date.now(),
      });
    } catch (error) {
      console.warn(`[desktop-asset-mirror] skip unreadable asset metadata ${fileName}`, error);
    }
  }
  const index: DesktopAssetMirrorIndex = {
    version: 1,
    updatedAt: Date.now(),
    assets: assets.sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)),
  };
  if (index.assets.length > 0) {
    await writeAssetIndex(index.assets);
  }
  return index;
}

function sanitizeAssetId(id: string): string {
  return id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96) || `asset_${Date.now()}`;
}

function parseDataImage(value?: string): { mimeType: string; base64Content: string } | null {
  if (!value) return null;
  const match = value.trim().match(DATA_URL_RE);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), base64Content: match[2] };
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'png';
}

function estimateAssetSize(record: SaveAssetRecord, base64Content?: string): number {
  const declaredSize = Number(record.size) || 0;
  if (declaredSize > 0) return declaredSize;
  if (base64Content) return Math.max(1, Math.floor((base64Content.length * 3) / 4));
  return Math.max(String(record.dataUrl ?? '').length, String(record.originalUrl ?? '').length);
}
