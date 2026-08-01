/**
 * Album asset binary runtime cache.
 *
 * React/album state should hold `asset:<id>` references (or remote URLs), not
 * multi-MB base64 data URLs. Binary payloads live here as Blob values; short-lived
 * object URLs are created on demand for currently displayed images.
 */

const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;

interface AlbumAssetCacheEntry {
  blob: Blob;
  mimeType?: string;
  objectUrl?: string;
}

const assetCache = new Map<string, AlbumAssetCacheEntry>();

export function isDataImageUrl(value: unknown): value is string {
  return typeof value === 'string' && DATA_IMAGE_RE.test(value.trimStart());
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl.startsWith('data:')) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] || 'application/octet-stream';
  try {
    const binary = header.includes(';base64') ? atob(body) : decodeURIComponent(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('Blob 转 dataUrl 失败'));
    reader.readAsDataURL(blob);
  });
}

export function rememberAlbumAssetBlob(assetId: string, blob: Blob, mimeType?: string): void {
  const id = assetId.trim();
  if (!id || !blob) return;
  const existing = assetCache.get(id);
  if (existing && existing.blob === blob) {
    if (mimeType && !existing.mimeType) existing.mimeType = mimeType;
    return;
  }
  if (existing?.objectUrl) {
    URL.revokeObjectURL(existing.objectUrl);
  }
  assetCache.set(id, {
    blob,
    mimeType: mimeType || blob.type || existing?.mimeType,
  });
}

export function rememberAlbumAssetFromDataUrl(assetId: string, dataUrl: string): Blob | null {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return null;
  rememberAlbumAssetBlob(assetId, blob, blob.type);
  return blob;
}

export function getAlbumAssetBlob(assetId: string): Blob | undefined {
  return assetCache.get(assetId.trim())?.blob;
}

export function hasAlbumAssetBlob(assetId: string): boolean {
  return assetCache.has(assetId.trim());
}

/**
 * Returns a displayable object URL for the asset without changing refcount.
 * Creates the object URL lazily. Prefer acquire/release around mounted consumers.
 */
export function resolveAlbumAssetDisplayUrl(assetId: string): string | undefined {
  const entry = assetCache.get(assetId.trim());
  if (!entry) return undefined;
  if (!entry.objectUrl) {
    entry.objectUrl = URL.createObjectURL(entry.blob);
  }
  return entry.objectUrl;
}

/** Drop blob + object URL for a deleted asset. */
export function revokeAlbumAsset(assetId: string): void {
  const id = assetId.trim();
  const entry = assetCache.get(id);
  if (!entry) return;
  if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  assetCache.delete(id);
}

export function revokeAlbumAssets(assetIds: Iterable<string>): void {
  for (const id of assetIds) revokeAlbumAsset(id);
}

export function pruneAlbumAssetCache(retainedAssetIds: Iterable<string>): void {
  const retained = new Set(Array.from(retainedAssetIds, (id) => id.trim()).filter(Boolean));
  for (const id of assetCache.keys()) {
    if (!retained.has(id)) revokeAlbumAsset(id);
  }
}

/** Test / full teardown helper. */
export function clearAlbumAssetObjectUrlCache(): void {
  for (const entry of assetCache.values()) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  }
  assetCache.clear();
}

export function getAlbumAssetCacheStats(): { size: number; objectUrls: number; totalBytes: number } {
  let objectUrls = 0;
  let totalBytes = 0;
  for (const entry of assetCache.values()) {
    if (entry.objectUrl) objectUrls += 1;
    totalBytes += entry.blob.size;
  }
  return { size: assetCache.size, objectUrls, totalBytes };
}

/**
 * Convert embedded base64 dataUrls into Blob cache + `asset:<id>` refs before
 * album state enters long-lived React memory. Safe to call multiple times.
 */
export function materializeAlbumRuntimePayload<T extends { assets: Array<{ id: string; dataUrl?: string; size?: number }> }>(album: T): T {
  let changed = false;
  const assets = album.assets.map((asset) => {
    if (!asset.id) return asset;
    if (asset.dataUrl && asset.dataUrl.startsWith('data:')) {
      const blob = rememberAlbumAssetFromDataUrl(asset.id, asset.dataUrl);
      if (!blob) return asset;
      changed = true;
      return {
        ...asset,
        dataUrl: `asset:${asset.id}`,
        size: asset.size ?? blob.size,
      };
    }
    return asset;
  });
  return changed ? { ...album, assets } : album;
}

/**
 * Resolve a displayable URL for an album asset without re-expanding base64 into
 * long-lived state. Order: Blob object URL → asset ref cache → remote/local → legacy dataUrl.
 */
export function pickAssetDisplayUrl(asset: {
  id?: string;
  dataUrl?: string;
  url?: string;
  localRef?: string;
  originalUrl?: string;
}): string | undefined {
  if (asset.id) {
    const cached = resolveAlbumAssetDisplayUrl(asset.id);
    if (cached) return cached;
  }
  const dataUrl = asset.dataUrl?.trim();
  if (dataUrl) {
    if (dataUrl.startsWith('asset:')) {
      const assetId = dataUrl.slice('asset:'.length).trim() || asset.id;
      if (assetId) {
        const objectUrl = resolveAlbumAssetDisplayUrl(assetId);
        if (objectUrl) return objectUrl;
      }
    } else if (isDataImageUrl(dataUrl) && asset.id) {
      rememberAlbumAssetFromDataUrl(asset.id, dataUrl);
      return resolveAlbumAssetDisplayUrl(asset.id) ?? dataUrl;
    } else if (!isDataImageUrl(dataUrl)) {
      return dataUrl;
    } else {
      return dataUrl;
    }
  }
  return asset.url?.trim() || asset.localRef?.trim() || asset.originalUrl?.trim() || undefined;
}
