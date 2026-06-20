import type { 存档数据 } from '@/models/settings';
import type { 图片资源, 相册系统 } from '@/models/imageGeneration';
import { 创建相册资源引用 } from '@/utils/albumActions';

const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;

export interface SaveAssetRecord {
  id: string;
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
  return typeof value === 'string' && DATA_IMAGE_RE.test(value.trimStart());
}

export function extractSaveAssetRecords(save: 存档数据): SaveAssetRecord[] {
  const records = new Map<string, SaveAssetRecord>();
  for (const asset of save.相册?.assets ?? []) {
    if (!asset.id) continue;
    if (!isDataImage(asset.dataUrl) && !isDataImage(asset.originalUrl)) continue;
    records.set(asset.id, {
      id: asset.id,
      dataUrl: isDataImage(asset.dataUrl) ? asset.dataUrl : undefined,
      originalUrl: isDataImage(asset.originalUrl) ? asset.originalUrl : undefined,
      url: asset.url,
      localRef: asset.localRef,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      size: asset.size,
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

function stripAlbumAssetPayload(album: 相册系统): 相册系统 {
  return {
    ...album,
    assets: album.assets.map((asset) => {
      if (!asset.id) return asset;
      const hasEmbeddedPayload = isDataImage(asset.dataUrl) || isDataImage(asset.originalUrl);
      if (!hasEmbeddedPayload) return asset;
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
  return {
    ...asset,
    dataUrl: record.dataUrl ?? asset.dataUrl,
    originalUrl: record.originalUrl ?? asset.originalUrl,
    url: asset.url ?? record.url,
    localRef: asset.localRef ?? record.localRef,
    mimeType: asset.mimeType ?? record.mimeType,
    width: asset.width ?? record.width,
    height: asset.height ?? record.height,
    size: asset.size ?? record.size,
  };
}
