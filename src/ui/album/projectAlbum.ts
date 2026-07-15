/**
 * Bridge KernelAlbum ↔ legacy 相册系统 (Stage 5.4 D).
 *
 * Formal side never embeds object URLs or raw base64 bytes.
 * Display URLs are resolved only via frontend adapters (albumObjectUrl / resolveAssetDisplayUrl).
 */

import type {
  图片生成任务,
  图片槽位,
  图片目标类型,
  图片资源,
  图片资源来源,
  图片资源状态,
  相册条目,
  相册系统,
} from '@/models/imageGeneration';
import {
  bindSlot,
  createEmptyKernelAlbum,
  type KernelAlbum,
  type KernelAlbumEntry,
  type KernelAsset,
  type KernelAssetSource,
  type KernelAssetStatus,
  type KernelImageSlot,
  type KernelImageTargetType,
  type KernelImageTask,
  type KernelSlotBinding,
} from '@/src/kernel/domain/album';
import { 创建相册资源引用 } from '@/utils/albumActions';
import {
  hasAlbumAssetBlob,
  isDataImageUrl,
  rememberAlbumAssetFromDataUrl,
} from '@/utils/albumObjectUrl';

/**
 * Project legacy 相册系统 → formal KernelAlbum.
 * Strips data:/blob: payloads; rebuilds slots from ready entries (latest wins per key).
 */
export function toKernelAlbum(album: 相册系统 | null | undefined): KernelAlbum {
  if (!album) return createEmptyKernelAlbum();

  const assets: KernelAsset[] = (album.assets ?? []).map(toKernelAsset).filter(
    (asset): asset is KernelAsset => asset !== null,
  );
  const assetIds = new Set(assets.map((asset) => asset.id));

  const entries: KernelAlbumEntry[] = (album.entries ?? [])
    .map(toKernelEntry)
    .filter((entry): entry is KernelAlbumEntry => {
      if (!entry) return false;
      return assetIds.has(entry.assetId);
    });

  const tasks: KernelImageTask[] = (album.tasks ?? [])
    .map(toKernelTask)
    .filter((task): task is KernelImageTask => task !== null);

  // Rebuild canonical slots: latest ready entry per (targetType, targetId, slot).
  const slotMap = new Map<string, KernelSlotBinding>();
  const sorted = entries.slice().sort((a, b) => a.createdAt - b.createdAt);
  for (const entry of sorted) {
    const targetId = (entry.targetId ?? '').trim();
    if (!targetId) continue;
    const asset = assets.find((item) => item.id === entry.assetId);
    if (!asset || asset.status !== 'ready') continue;
    const key = `${entry.targetType}\0${targetId}\0${entry.slot}`;
    slotMap.set(key, {
      targetType: entry.targetType,
      targetId,
      slot: entry.slot,
      assetId: entry.assetId,
      entryId: entry.id,
    });
  }

  return {
    assets,
    entries,
    tasks,
    slots: Array.from(slotMap.values()),
  };
}

/**
 * Project formal KernelAlbum → legacy 相册系统 for React state.
 * Assets carry AssetRef in dataUrl only — never raw data:/blob: bytes.
 */
export function fromKernelAlbum(
  album: KernelAlbum,
  displayHints?: Readonly<{
    /** Preserve legacy-only fields (prompt extras, dimensions, etc.) by asset id */
    previous?: 相册系统;
  }>,
): 相册系统 {
  const prevAssets = new Map(
    (displayHints?.previous?.assets ?? []).map((asset) => [asset.id, asset]),
  );
  const prevEntries = new Map(
    (displayHints?.previous?.entries ?? []).map((entry) => [entry.id, entry]),
  );
  const prevTasks = new Map(
    (displayHints?.previous?.tasks ?? []).map((task) => [task.id, task]),
  );

  const assets: 图片资源[] = album.assets.map((asset) => {
    const prev = prevAssets.get(asset.id);
    // When projecting formal AssetRef-only shape, migrate any legacy inline
    // base64 from `previous` into the frontend Blob cache first. Otherwise
    // LeftPanel / slot UI resolve asset:<id> to empty and avatars go blank.
    migratePreviousAssetBytesToCache(asset.id, prev);
    const remoteUrl = pickRemoteUrlFromHints(asset.remoteUrl, prev);
    return {
      id: asset.id,
      url: remoteUrl ?? (prev?.url && !isForbiddenDisplayUrl(prev.url) ? prev.url : undefined),
      originalUrl:
        remoteUrl
        ?? (prev?.originalUrl && !isForbiddenDisplayUrl(prev.originalUrl)
          ? prev.originalUrl
          : undefined),
      // Formal ref only — binary lives in albumObjectUrl / AssetStore.
      dataUrl: 创建相册资源引用(asset.id),
      contentHash: asset.contentHash ?? prev?.contentHash,
      mimeType: asset.mimeType ?? prev?.mimeType,
      width: asset.width ?? prev?.width,
      height: asset.height ?? prev?.height,
      size: asset.size ?? prev?.size,
      source: asset.source as 图片资源来源,
      nsfw: asset.nsfw,
      createdAt: asset.createdAt,
      prompt: asset.prompt ?? prev?.prompt,
      negativePrompt: asset.negativePrompt ?? prev?.negativePrompt,
      sourcePrompt: prev?.sourcePrompt,
      finalPrompt: prev?.finalPrompt,
      finalNegativePrompt: prev?.finalNegativePrompt,
      anchorMode: prev?.anchorMode,
      anchorSummary: prev?.anchorSummary,
      referenceImageIds: prev?.referenceImageIds,
      dimensions: prev?.dimensions,
      model: asset.model ?? prev?.model,
      backend: asset.backend ?? prev?.backend,
      status: asset.status as 图片资源状态,
      error: prev?.error,
    };
  });

  const entries: 相册条目[] = album.entries.map((entry) => {
    const prev = prevEntries.get(entry.id);
    return {
      id: entry.id,
      assetId: entry.assetId,
      title: entry.title,
      targetType: entry.targetType as 图片目标类型,
      targetId: entry.targetId,
      slot: entry.slot as 图片槽位,
      tags: entry.tags.slice(),
      nsfw: entry.nsfw,
      createdAt: entry.createdAt,
      note: entry.note ?? prev?.note,
      referenceTargets: entry.referenceTargets.slice(),
    };
  });

  const tasks: 图片生成任务[] = album.tasks.map((task) => {
    const prev = prevTasks.get(task.id);
    return {
      id: task.id,
      targetType: task.targetType as 图片目标类型,
      targetId: task.targetId,
      slot: task.slot as 图片槽位,
      source: task.source,
      status: task.status,
      backend: task.backend,
      nsfw: task.nsfw,
      prompt: task.prompt,
      negativePrompt: task.negativePrompt ?? prev?.negativePrompt,
      sourcePrompt: prev?.sourcePrompt,
      finalPrompt: prev?.finalPrompt,
      finalNegativePrompt: prev?.finalNegativePrompt,
      anchorMode: prev?.anchorMode,
      anchorSummary: prev?.anchorSummary,
      referenceImageIds: prev?.referenceImageIds,
      dimensions: prev?.dimensions,
      resultAssetId: task.resultAssetId,
      error: task.error,
      retryCount: task.retryCount,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
    };
  });

  return { assets, entries, tasks };
}

/**
 * Apply domain bindSlot on a legacy album and project back.
 * Single authority for slot map / entry target fields (replace semantics).
 */
export function applyBindSlotOnLegacyAlbum(
  album: 相册系统,
  input: {
    entryId: string;
    targetType: 图片目标类型;
    targetId: string;
    slot: 图片槽位;
  },
):
  | { ok: true; album: 相册系统; previous: KernelSlotBinding | null }
  | { ok: false; reason: 'entry_not_found' | 'asset_not_found' | 'invalid_target' } {
  const kernel = toKernelAlbum(album);
  const result = bindSlot(kernel, {
    entryId: input.entryId,
    targetType: input.targetType as KernelImageTargetType,
    targetId: input.targetId,
    slot: input.slot as KernelImageSlot,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    album: fromKernelAlbum(result.album, { previous: album }),
    previous: result.previous,
  };
}

function toKernelAsset(asset: 图片资源): KernelAsset | null {
  const id = String(asset.id || '').trim();
  if (!id) return null;
  const source = normalizeSource(asset.source);
  const status = normalizeStatus(asset.status);
  const remoteUrl = pickRemoteUrl(asset);
  return {
    id,
    mimeType: asset.mimeType,
    contentHash: asset.contentHash,
    width: asset.width,
    height: asset.height,
    size: asset.size,
    source,
    status,
    nsfw: asset.nsfw === true,
    createdAt: Number(asset.createdAt) || 0,
    prompt: asset.prompt,
    negativePrompt: asset.negativePrompt,
    model: asset.model,
    backend: typeof asset.backend === 'string' ? asset.backend : undefined,
    ...(remoteUrl ? { remoteUrl } : {}),
  };
}

function toKernelEntry(entry: 相册条目): KernelAlbumEntry | null {
  const id = String(entry.id || '').trim();
  const assetId = String(entry.assetId || '').trim();
  if (!id || !assetId) return null;
  return {
    id,
    assetId,
    title: String(entry.title || '未命名图片'),
    targetType: entry.targetType as KernelImageTargetType,
    targetId: entry.targetId,
    slot: entry.slot as KernelImageSlot,
    tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
    nsfw: entry.nsfw === true,
    createdAt: Number(entry.createdAt) || 0,
    note: entry.note,
    referenceTargets: Array.isArray(entry.referenceTargets)
      ? entry.referenceTargets.slice()
      : [],
  };
}

function toKernelTask(task: 图片生成任务): KernelImageTask | null {
  const id = String(task.id || '').trim();
  if (!id) return null;
  return {
    id,
    targetType: task.targetType as KernelImageTargetType,
    targetId: task.targetId,
    slot: task.slot as KernelImageSlot,
    source: task.source,
    status: task.status,
    backend: String(task.backend || 'unknown'),
    nsfw: task.nsfw === true,
    prompt: String(task.prompt || ''),
    negativePrompt: task.negativePrompt,
    resultAssetId: task.resultAssetId,
    error: task.error,
    retryCount: Math.max(0, Math.trunc(Number(task.retryCount) || 0)),
    createdAt: Number(task.createdAt) || 0,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
  };
}

function normalizeSource(source: 图片资源来源 | undefined): KernelAssetSource {
  if (source === 'upload' || source === 'remote' || source === 'generated') return source;
  return 'generated';
}

function normalizeStatus(status: 图片资源状态 | undefined): KernelAssetStatus {
  if (status === 'failed' || status === 'pending' || status === 'ready') return status;
  return 'ready';
}

function pickRemoteUrl(asset: 图片资源): string | undefined {
  for (const candidate of [asset.originalUrl, asset.url, asset.localRef]) {
    if (typeof candidate !== 'string') continue;
    const value = candidate.trim();
    if (!value) continue;
    if (isForbiddenDisplayUrl(value)) continue;
    return value;
  }
  return undefined;
}

function pickRemoteUrlFromHints(
  remoteUrl: string | undefined,
  prev: 图片资源 | undefined,
): string | undefined {
  if (remoteUrl && !isForbiddenDisplayUrl(remoteUrl)) return remoteUrl;
  if (!prev) return undefined;
  return pickRemoteUrl(prev);
}

function isForbiddenDisplayUrl(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return (
    lower.startsWith('data:')
    || lower.startsWith('blob:')
    || lower.startsWith('asset:')
  );
}

/**
 * Move inline base64 from a previous legacy asset into the runtime Blob cache
 * so `asset:<id>` refs remain displayable after formal projection.
 */
function migratePreviousAssetBytesToCache(
  assetId: string,
  prev: 图片资源 | undefined,
): void {
  if (!prev || hasAlbumAssetBlob(assetId)) return;
  for (const candidate of [prev.dataUrl, prev.originalUrl, prev.url]) {
    if (typeof candidate !== 'string') continue;
    const value = candidate.trim();
    if (!value || !isDataImageUrl(value)) continue;
    rememberAlbumAssetFromDataUrl(assetId, value);
    return;
  }
}
