import { 归一化相册系统 } from '@/models/imageGeneration';
import type { 图片资源, 相册条目, 相册系统 } from '@/models/imageGeneration';
import { getAlbumAssetBlob, isDataImageUrl, rememberAlbumAssetFromDataUrl } from '@/utils/albumObjectUrl';
import { sha256BytesHex } from '@/services/storyRuntime/id';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function normalizeContentHash(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim().toLowerCase();
  return SHA256_PATTERN.test(normalized) ? normalized : undefined;
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  // 统一共享字节 SHA-256：LAN HTTP 无 crypto.subtle 时本地回退，输出与 Web Crypto 完全一致。
  return sha256BytesHex(bytes);
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mimeType: string } | null {
  if (!dataUrl.startsWith('data:')) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] || 'application/octet-stream';
  try {
    const binary = header.includes(';base64') ? atob(body) : decodeURIComponent(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  }
  return `data:${mimeType || 'application/octet-stream'};base64,${btoa(binary)}`;
}

export async function hashDataUrl(dataUrl: string): Promise<string | undefined> {
  const decoded = dataUrlToBytes(dataUrl);
  return decoded ? sha256Bytes(decoded.bytes) : undefined;
}

export async function hydrateAlbumContentHashes(album: 相册系统): Promise<相册系统> {
  const assets: 图片资源[] = [];
  for (let index = 0; index < album.assets.length; index += 1) {
    const asset = album.assets[index];
    const existing = normalizeContentHash(asset.contentHash);
    if (existing) {
      assets.push(existing === asset.contentHash ? asset : { ...asset, contentHash: existing });
      continue;
    }
    // Prefer Blob cache bytes for hashing when dataUrl is only an asset: ref.
    const cached = asset.id ? getAlbumAssetBlob(asset.id) : undefined;
    if (cached) {
      const contentHash = await sha256Bytes(new Uint8Array(await cached.arrayBuffer()));
      assets.push({ ...asset, contentHash });
      if ((index + 1) % 4 === 0) await yieldAlbumWork();
      continue;
    }
    if (!asset.dataUrl || !isDataImageUrl(asset.dataUrl)) {
      assets.push(asset);
      continue;
    }
    if (asset.id) rememberAlbumAssetFromDataUrl(asset.id, asset.dataUrl);
    const contentHash = await hashDataUrl(asset.dataUrl);
    assets.push(contentHash ? { ...asset, contentHash } : asset);
    if ((index + 1) % 4 === 0) await yieldAlbumWork();
  }
  return assets.every((asset, index) => asset === album.assets[index]) ? album : { ...album, assets };
}

function yieldAlbumWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function assetContentKey(asset: 图片资源): string {
  const contentHash = normalizeContentHash(asset.contentHash);
  if (contentHash) return `sha256:${contentHash}`;
  if (asset.dataUrl && isDataImageUrl(asset.dataUrl)) return `data:${asset.dataUrl}`;
  const remote = asset.url?.trim() || asset.originalUrl?.trim() || asset.localRef?.trim();
  if (remote && !remote.startsWith('asset:')) return `remote:${remote}`;
  return `asset:${asset.id}`;
}

export function findAssetByContent(album: 相册系统, contentHash: string, src?: string): 图片资源 | undefined {
  const normalizedHash = normalizeContentHash(contentHash);
  return album.assets.find((asset) => {
    if (normalizedHash && normalizeContentHash(asset.contentHash) === normalizedHash) return true;
    if (src && (asset.dataUrl === src || asset.url === src || asset.originalUrl === src || asset.localRef === src)) return true;
    return false;
  });
}

export function addOrReuseAlbumImage(
  album: 相册系统,
  item: { asset: 图片资源; entry: 相册条目 },
  contentHash: string,
  src?: string,
): { album: 相册系统; entry: 相册条目; reused: boolean } {
  const existingAsset = findAssetByContent(album, contentHash, src);
  if (!existingAsset) {
    return {
      album: { ...album, assets: [item.asset, ...album.assets], entries: [item.entry, ...album.entries] },
      entry: item.entry,
      reused: false,
    };
  }

  const existingEntry = album.entries.find((entry) =>
    entry.assetId === existingAsset.id &&
    entry.targetType === item.entry.targetType &&
    (entry.targetId || '') === (item.entry.targetId || '') &&
    entry.slot === item.entry.slot,
  );
  if (existingEntry) return { album, entry: existingEntry, reused: true };

  const entry = { ...item.entry, assetId: existingAsset.id };
  return {
    album: { ...album, entries: [entry, ...album.entries] },
    entry,
    reused: true,
  };
}

export function mergeAlbumEntryMetadata(existing: 相册条目, incoming: 相册条目): 相册条目 {
  return {
    ...existing,
    tags: Array.from(new Set([...(existing.tags ?? []), ...(incoming.tags ?? [])])),
    referenceTargets: Array.from(new Set([...(existing.referenceTargets ?? []), ...(incoming.referenceTargets ?? [])])),
    note: existing.note || incoming.note,
  };
}

export async function deduplicateAlbumContent(input: 相册系统): Promise<相册系统> {
  const album = await hydrateAlbumContentHashes(归一化相册系统(input));
  const keyToAsset = new Map<string, 图片资源>();
  const assetIdRemap = new Map<string, string>();
  const assets: 图片资源[] = [];

  for (const asset of album.assets) {
    const key = assetContentKey(asset);
    const existing = keyToAsset.get(key);
    if (existing) {
      assetIdRemap.set(asset.id, existing.id);
      continue;
    }
    keyToAsset.set(key, asset);
    assetIdRemap.set(asset.id, asset.id);
    assets.push(asset);
  }

  const entryKeyToIndex = new Map<string, number>();
  const entryIdRemap = new Map<string, string>();
  const entries: 相册条目[] = [];
  for (const entry of album.entries) {
    const assetId = assetIdRemap.get(entry.assetId) || entry.assetId;
    const rewritten = { ...entry, assetId };
    const key = [assetId, rewritten.targetType, rewritten.targetId || '', rewritten.slot].join('|');
    const existingIndex = entryKeyToIndex.get(key);
    if (existingIndex !== undefined) {
      const existing = entries[existingIndex];
      entries[existingIndex] = mergeAlbumEntryMetadata(existing, rewritten);
      entryIdRemap.set(entry.id, existing.id);
      continue;
    }
    entryKeyToIndex.set(key, entries.length);
    entryIdRemap.set(entry.id, entry.id);
    entries.push(rewritten);
  }

  const tasks = album.tasks.map((task) => ({
    ...task,
    resultAssetId: task.resultAssetId ? assetIdRemap.get(task.resultAssetId) || task.resultAssetId : undefined,
    referenceImageIds: task.referenceImageIds?.map((entryId) => entryIdRemap.get(entryId) || entryId),
  }));

  return 归一化相册系统({ assets, entries, tasks });
}
