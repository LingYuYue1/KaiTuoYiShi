import type { 存档数据 } from '@/models/settings';
import type { 图片资源, 相册系统 } from '@/models/imageGeneration';
import { 创建相册资源引用 } from '@/utils/albumActions';
import {
  blobToDataUrl,
  dataUrlToBlob,
  getAlbumAssetBlob,
  hasAlbumAssetBlob,
  isDataImageUrl,
  pickAssetDisplayUrl,
  rememberAlbumAssetBlob,
  rememberAlbumAssetFromDataUrl,
} from '@/utils/albumObjectUrl';

export { pickAssetDisplayUrl } from '@/utils/albumObjectUrl';

/**
 * Persistable asset record.
 *
 * Prefer `blob` for IndexedDB storage. Legacy saves may only have `dataUrl`
 * base64 strings — those are migrated to Blob on first read.
 */
export interface SaveAssetRecord {
  id: string;
  /** Binary image payload (preferred). */
  blob?: Blob;
  /** Legacy / export-compatible base64 data URL. Prefer not to rehydrate into React state. */
  dataUrl?: string;
  originalUrl?: string;
  url?: string;
  localRef?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  size?: number;
  updatedAt: number;
}

function isDataImage(value: unknown): value is string {
  return isDataImageUrl(value);
}

function estimateBlobSize(blob: Blob | undefined, dataUrl?: string): number | undefined {
  if (blob && blob.size > 0) return blob.size;
  if (dataUrl && isDataImage(dataUrl)) {
    const comma = dataUrl.indexOf(',');
    if (comma >= 0) return Math.max(1, Math.floor(((dataUrl.length - comma - 1) * 3) / 4));
  }
  return undefined;
}

function resolveBlobForRecord(asset: 图片资源): { blob?: Blob; dataUrl?: string; originalUrl?: string } {
  const cached = getAlbumAssetBlob(asset.id);
  if (cached) {
    return {
      blob: cached,
      dataUrl: undefined,
      originalUrl: isDataImage(asset.originalUrl) ? undefined : asset.originalUrl,
    };
  }
  if (isDataImage(asset.dataUrl)) {
    const blob = dataUrlToBlob(asset.dataUrl) ?? undefined;
    if (blob) {
      rememberAlbumAssetBlob(asset.id, blob, asset.mimeType || blob.type);
      return {
        blob,
        dataUrl: undefined,
        originalUrl: isDataImage(asset.originalUrl) ? undefined : asset.originalUrl,
      };
    }
    return {
      dataUrl: asset.dataUrl,
      originalUrl: isDataImage(asset.originalUrl) ? asset.originalUrl : asset.originalUrl,
    };
  }
  if (isDataImage(asset.originalUrl)) {
    const blob = dataUrlToBlob(asset.originalUrl) ?? undefined;
    if (blob) {
      rememberAlbumAssetBlob(asset.id, blob, asset.mimeType || blob.type);
      return { blob, dataUrl: undefined, originalUrl: undefined };
    }
    return { originalUrl: asset.originalUrl };
  }
  return {
    originalUrl: asset.originalUrl,
  };
}

export function extractSaveAssetRecords(save: 存档数据): SaveAssetRecord[] {
  const records = new Map<string, SaveAssetRecord>();
  for (const asset of save.相册?.assets ?? []) {
    if (!asset.id) continue;
    const hasCachedBlob = hasAlbumAssetBlob(asset.id);
    const hasEmbedded = isDataImage(asset.dataUrl) || isDataImage(asset.originalUrl);
    if (!hasCachedBlob && !hasEmbedded) continue;

    const resolved = resolveBlobForRecord(asset);
    records.set(asset.id, {
      id: asset.id,
      blob: resolved.blob,
      // Keep legacy dataUrl only when Blob conversion failed.
      dataUrl: resolved.blob ? undefined : resolved.dataUrl,
      originalUrl: resolved.blob ? undefined : (isDataImage(resolved.originalUrl) ? resolved.originalUrl : undefined),
      url: asset.url,
      localRef: asset.localRef,
      mimeType: asset.mimeType || resolved.blob?.type,
      width: asset.width,
      height: asset.height,
      size: asset.size ?? estimateBlobSize(resolved.blob, resolved.dataUrl),
      updatedAt: Date.now(),
    });
  }
  return Array.from(records.values());
}

export function saveHasEmbeddedAssetPayload(save: 存档数据): boolean {
  return Boolean(
    save.相册?.assets?.some((asset) => isDataImage(asset.dataUrl) || isDataImage(asset.originalUrl)),
  );
}

export function stripSaveAssetPayloadForStorage<T extends 存档数据>(save: T): T {
  if (!save.相册?.assets?.length) return save;
  return {
    ...save,
    相册: stripAlbumAssetPayload(save.相册),
  } as T;
}

/**
 * Restore album assets for runtime use.
 *
 * Binary payloads are registered into the Blob cache. React/album state keeps
 * `asset:<id>` references — it does NOT re-expand multi-MB base64 dataUrls.
 */
export function restoreSaveAssetPayloadFromRecords<T extends 存档数据>(
  save: T,
  records: SaveAssetRecord[],
): T {
  if (!save.相册?.assets?.length || !records.length) return save;
  const byId = new Map(records.map((record) => [record.id, record]));
  return {
    ...save,
    相册: {
      ...save.相册,
      assets: save.相册.assets.map((asset) => restoreAssetPayload(asset, byId)),
    },
  } as T;
}

/**
 * Normalize a single SaveAssetRecord: convert legacy dataUrl → Blob when possible
 * and register into the runtime cache. Returns a record that prefers Blob storage.
 */
export function materializeSaveAssetRecord(record: SaveAssetRecord): SaveAssetRecord {
  if (!record.id) return record;
  if (record.blob instanceof Blob) {
    rememberAlbumAssetBlob(record.id, record.blob, record.mimeType || record.blob.type);
    return {
      ...record,
      mimeType: record.mimeType || record.blob.type,
      size: record.size || record.blob.size,
      // Drop base64 from the write path when Blob is present.
      dataUrl: undefined,
      originalUrl: isDataImage(record.originalUrl) ? undefined : record.originalUrl,
    };
  }
  if (isDataImage(record.dataUrl)) {
    const blob = rememberAlbumAssetFromDataUrl(record.id, record.dataUrl);
    if (blob) {
      return {
        ...record,
        blob,
        mimeType: record.mimeType || blob.type,
        size: record.size || blob.size,
        dataUrl: undefined,
        originalUrl: isDataImage(record.originalUrl) ? undefined : record.originalUrl,
      };
    }
  }
  if (isDataImage(record.originalUrl)) {
    const blob = rememberAlbumAssetFromDataUrl(record.id, record.originalUrl);
    if (blob) {
      return {
        ...record,
        blob,
        mimeType: record.mimeType || blob.type,
        size: record.size || blob.size,
        dataUrl: undefined,
        originalUrl: undefined,
      };
    }
  }
  return record;
}

export function materializeSaveAssetRecords(records: SaveAssetRecord[]): SaveAssetRecord[] {
  return records.map(materializeSaveAssetRecord);
}

function stripAlbumAssetPayload(album: 相册系统): 相册系统 {
  return {
    ...album,
    assets: album.assets.map((asset) => {
      if (!asset.id) return asset;
      const hasEmbeddedPayload = isDataImage(asset.dataUrl) || isDataImage(asset.originalUrl);
      const hasBlob = hasAlbumAssetBlob(asset.id);
      if (!hasEmbeddedPayload && !hasBlob) return asset;
      // Ensure binary is cached before stripping so extractSaveAssetRecords can persist it.
      if (hasEmbeddedPayload && !hasBlob) {
        if (isDataImage(asset.dataUrl)) rememberAlbumAssetFromDataUrl(asset.id, asset.dataUrl);
        else if (isDataImage(asset.originalUrl)) rememberAlbumAssetFromDataUrl(asset.id, asset.originalUrl);
      }
      return {
        ...asset,
        dataUrl: 创建相册资源引用(asset.id),
        originalUrl: isDataImage(asset.originalUrl) ? undefined : asset.originalUrl,
      };
    }),
  };
}

function restoreAssetPayload(asset: 图片资源, records: Map<string, SaveAssetRecord>): 图片资源 {
  const record = records.get(asset.id);
  if (!record) return asset;

  const materialized = materializeSaveAssetRecord(record);
  // Runtime album state: keep asset ref only — never re-inject multi-MB base64.
  return {
    ...asset,
    dataUrl: 创建相册资源引用(asset.id),
    // Preserve non-data remote original URLs only.
    originalUrl: isDataImage(materialized.originalUrl)
      ? undefined
      : (materialized.originalUrl ?? (isDataImage(asset.originalUrl) ? undefined : asset.originalUrl)),
    url: asset.url ?? materialized.url,
    localRef: asset.localRef ?? materialized.localRef,
    mimeType: asset.mimeType ?? materialized.mimeType,
    width: asset.width ?? materialized.width,
    height: asset.height ?? materialized.height,
    size: asset.size ?? materialized.size,
  };
}

/**
 * Expand Blob-backed assets into base64 dataUrls for portable export packages /
 * cloud JSON that cannot carry a separate IDB asset store.
 * Only use at export boundaries — never for long-lived React state.
 */
export async function expandSaveAssetPayloadForExport<T extends 存档数据>(save: T): Promise<T> {
  if (!save.相册?.assets?.length) return save;
  let changed = false;
  const assets: 图片资源[] = [];
  for (const asset of save.相册.assets) {
    if (!asset.id) {
      assets.push(asset);
      continue;
    }
    if (isDataImage(asset.dataUrl)) {
      assets.push(asset);
      continue;
    }
    const blob = getAlbumAssetBlob(asset.id);
    if (!blob) {
      assets.push(asset);
      continue;
    }
    const dataUrl = await blobToDataUrl(blob);
    assets.push({
      ...asset,
      dataUrl,
      mimeType: asset.mimeType || blob.type,
      size: asset.size || blob.size,
    });
    changed = true;
  }
  if (!changed) return save;
  return {
    ...save,
    相册: {
      ...save.相册,
      assets,
    },
  } as T;
}
