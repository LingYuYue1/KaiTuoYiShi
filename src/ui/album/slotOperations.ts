/**
 * Centralized album slot / generate / delete operations (Stage 5.4 D).
 *
 * When a native kernel session is available, dispatches Kernel commands.
 * Otherwise applies domain pure functions (bindSlot / deleteEntries /
 * commitGeneratedAsset) on a KernelAlbum projection of legacy 相册系统.
 *
 * Object URLs never enter formal state — only AssetRef metadata.
 */

import type {
  图片槽位,
  图片目标类型,
  图片生成任务,
  图片资源,
  相册条目,
  相册系统,
} from '@/models/imageGeneration';
import {
  bindSlot,
  commitGeneratedAsset,
  deleteEntries,
  type BindSlotResult,
  type CommitGeneratedResult,
  type DeleteEntriesResult,
  type KernelAlbumEntry,
  type KernelAsset,
  type KernelImageSlot,
  type KernelImageTargetType,
  type KernelImageTask,
  type KernelSlotBinding,
} from '@/src/kernel/domain/album';
import type { IKernel } from '@/src/kernel/contract';
import type { ExecutionSink } from '@/src/ui/kernelClient/consumeExecution';
import {
  executeAlbumBindSlot,
  executeAlbumDelete,
  executeImageGenerate,
  type ImageGenerateIntent,
} from '@/src/ui/kernelClient/albumCommands';
import {
  applyBindSlotOnLegacyAlbum,
  fromKernelAlbum,
  toKernelAlbum,
} from './projectAlbum';
import { 创建相册资源引用 } from '@/utils/albumActions';
import {
  rememberAlbumAssetFromDataUrl,
  revokeAlbumAssets,
} from '@/utils/albumObjectUrl';

// ─── Result types ───────────────────────────────────────────────────────────

export type SlotBindResult =
  | Readonly<{
      ok: true;
      album: 相册系统;
      previous: KernelSlotBinding | null;
      /** Formal AssetRef for character/phone avatar fields */
      assetRef: string;
    }>
  | Readonly<{
      ok: false;
      reason: 'entry_not_found' | 'asset_not_found' | 'invalid_target';
    }>;

export type SlotDeleteResult =
  | Readonly<{
      ok: true;
      album: 相册系统;
      removedAssetIds: readonly string[];
      removedEntryIds: readonly string[];
    }>
  | Readonly<{ ok: false; reason: 'empty_ids' | 'none_found' }>;

export type SlotCommitResult =
  | Readonly<{ ok: true; album: 相册系统; entryId: string; assetId: string }>
  | Readonly<{
      ok: false;
      reason:
        | 'duplicate_asset'
        | 'invalid_asset'
        | 'invalid_entry'
        | 'asset_entry_mismatch';
    }>;

export type NativeKernelSession = Readonly<{
  kernel: IKernel;
  sessionId: string;
  expectedRevision: number;
  commandId: string;
  sink: ExecutionSink;
}>;

// ─── Bind / replace ─────────────────────────────────────────────────────────

/**
 * Bind (or replace) an entry onto a slot.
 * Domain bindSlot is SoT for slots + entry target fields.
 * Character avatar string fields are updated by the caller with `assetRef`.
 */
export function bindSlotOnAlbum(
  album: 相册系统,
  input: {
    entryId: string;
    targetType: 图片目标类型;
    targetId: string;
    slot: 图片槽位;
  },
): SlotBindResult {
  const result = applyBindSlotOnLegacyAlbum(album, input);
  if (!result.ok) return result;

  const entry = result.album.entries.find((item) => item.id === input.entryId);
  if (!entry?.assetId) {
    return { ok: false, reason: 'asset_not_found' };
  }

  // Ensure frontend Blob cache is warm for immediate LeftPanel / gallery paint.
  // Formal album may only have AssetRef after projection; previous row may still
  // hold data: bytes that fromKernelAlbum migrates — re-check both albums.
  const asset =
    result.album.assets.find((item) => item.id === entry.assetId)
    ?? album.assets.find((item) => item.id === entry.assetId);
  if (asset) {
    for (const candidate of [asset.dataUrl, asset.originalUrl, asset.url]) {
      if (typeof candidate === 'string' && candidate.startsWith('data:')) {
        rememberAlbumAssetFromDataUrl(entry.assetId, candidate);
        break;
      }
    }
  }

  return {
    ok: true,
    album: result.album,
    previous: result.previous,
    assetRef: 创建相册资源引用(entry.assetId),
  };
}

/**
 * Native path: album.bindSlot via kernel. Caller applies projection from sink.
 * Falls back to pure bindSlotOnAlbum when no session.
 */
export async function bindSlotViaKernelOrLocal(
  album: 相册系统,
  input: {
    entryId: string;
    targetType: 图片目标类型;
    targetId: string;
    slot: 图片槽位;
  },
  session?: NativeKernelSession | null,
): Promise<SlotBindResult> {
  if (session) {
    await executeAlbumBindSlot(
      session.kernel,
      {
        commandId: session.commandId,
        sessionId: session.sessionId,
        expectedRevision: session.expectedRevision,
        entryId: input.entryId,
        targetType: input.targetType as KernelImageTargetType,
        targetId: input.targetId,
        slot: input.slot as KernelImageSlot,
      },
      session.sink,
    );
    // Native path: formal album is in kernel; local result is best-effort projection
    // for callers still writing React state from the pure path in the same turn.
    // Prefer sink.replaceProjection for authority when KERNEL_MODE is native.
    return bindSlotOnAlbum(album, input);
  }
  return bindSlotOnAlbum(album, input);
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/**
 * Delete entries via domain deleteEntries. Revokes frontend object URLs for orphans.
 */
export function deleteEntriesOnAlbum(
  album: 相册系统,
  entryIds: readonly string[],
): SlotDeleteResult {
  const kernel = toKernelAlbum(album);
  const result: DeleteEntriesResult = deleteEntries(kernel, entryIds);
  if (!result.ok) return result;

  if (result.removedAssetIds.length > 0) {
    revokeAlbumAssets(result.removedAssetIds);
  }

  return {
    ok: true,
    album: fromKernelAlbum(result.album, { previous: album }),
    removedAssetIds: result.removedAssetIds,
    removedEntryIds: result.removedEntryIds,
  };
}

export async function deleteEntriesViaKernelOrLocal(
  album: 相册系统,
  entryIds: readonly string[],
  session?: NativeKernelSession | null,
): Promise<SlotDeleteResult> {
  if (session) {
    await executeAlbumDelete(
      session.kernel,
      {
        commandId: session.commandId,
        sessionId: session.sessionId,
        expectedRevision: session.expectedRevision,
        entryIds,
      },
      session.sink,
    );
  }
  return deleteEntriesOnAlbum(album, entryIds);
}

// ─── Commit generated (success-only formal write) ───────────────────────────

export type CommitGeneratedLegacyInput = Readonly<{
  asset: 图片资源;
  entry: 相册条目;
  task?: 图片生成任务;
  /** If true, also bind entry to its targetType/targetId/slot */
  bindToSlot?: boolean;
  /**
   * Optional raw data URL / bytes source for frontend object-URL cache only.
   * Never stored in formal KernelAlbum.
   */
  displayDataUrl?: string;
}>;

/**
 * Commit a successfully generated (or uploaded) asset into formal album.
 * Failure paths must not call this — no half assets.
 * Optionally caches display bytes in the frontend object-URL layer.
 */
export function commitGeneratedOnAlbum(
  album: 相册系统,
  input: CommitGeneratedLegacyInput,
): SlotCommitResult {
  // Frontend-only binary cache — formal shape stays AssetRef.
  // Prefer explicit displayDataUrl; also rehydrate from asset fields so mount
  // → LeftPanel resolve does not go blank after AssetRef projection.
  if (input.asset.id) {
    const candidates = [
      input.displayDataUrl,
      input.asset.dataUrl,
      input.asset.originalUrl,
      input.asset.url,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.startsWith('data:')) {
        rememberAlbumAssetFromDataUrl(input.asset.id, candidate);
        break;
      }
    }
  }

  const kernelAsset = legacyAssetToKernel(input.asset);
  const kernelEntry = legacyEntryToKernel(input.entry);
  if (!kernelAsset || !kernelEntry) {
    return { ok: false, reason: 'invalid_asset' };
  }

  const kernelTask = input.task ? legacyTaskToKernel(input.task) : undefined;
  if (input.task && !kernelTask) {
    return { ok: false, reason: 'invalid_entry' };
  }

  const kernel = toKernelAlbum(album);
  const result: CommitGeneratedResult = commitGeneratedAsset(kernel, {
    asset: kernelAsset,
    entry: kernelEntry,
    ...(kernelTask ? { task: kernelTask } : {}),
    ...(input.bindToSlot === true ? { bindToSlot: true } : {}),
  });

  if (!result.ok) return result;

  // Preserve richer legacy fields (dimensions, sourcePrompt, etc.) via previous.
  const withNew = {
    ...album,
    assets: [sanitizeLegacyAsset(input.asset), ...album.assets],
    entries: [input.entry, ...album.entries],
    tasks: input.task
      ? [
          {
            ...input.task,
            status: 'success' as const,
            resultAssetId: input.asset.id,
            finishedAt: input.task.finishedAt ?? Date.now(),
          },
          ...album.tasks,
        ]
      : album.tasks,
  };

  return {
    ok: true,
    album: fromKernelAlbum(result.album, { previous: withNew }),
    entryId: input.entry.id,
    assetId: input.asset.id,
  };
}

/**
 * Native image.generate path. Progress → sink only; formal album on committed.
 * Local fallback commits via commitGeneratedOnAlbum after caller obtains bytes.
 */
export async function generateImageViaKernel(
  session: NativeKernelSession,
  command: ImageGenerateIntent['command'],
): Promise<void> {
  await executeImageGenerate(
    session.kernel,
    {
      commandId: session.commandId,
      sessionId: session.sessionId,
      expectedRevision: session.expectedRevision,
      command,
    },
    session.sink,
  );
}

// ─── Pure domain re-exports for advanced callers ────────────────────────────

export {
  bindSlot,
  commitGeneratedAsset,
  deleteEntries,
  toKernelAlbum,
  fromKernelAlbum,
};
export type { BindSlotResult, CommitGeneratedResult, DeleteEntriesResult };

// ─── Internal mappers ───────────────────────────────────────────────────────

function sanitizeLegacyAsset(asset: 图片资源): 图片资源 {
  const dataUrl = asset.dataUrl?.startsWith('data:')
    ? 创建相册资源引用(asset.id)
    : asset.dataUrl?.startsWith('asset:')
      ? asset.dataUrl
      : 创建相册资源引用(asset.id);
  return {
    ...asset,
    dataUrl,
    // Drop raw base64 if it leaked into url fields
    url: asset.url?.startsWith('data:') ? undefined : asset.url,
    originalUrl: asset.originalUrl?.startsWith('data:')
      ? undefined
      : asset.originalUrl,
  };
}

function legacyAssetToKernel(asset: 图片资源): KernelAsset | null {
  const id = String(asset.id || '').trim();
  if (!id) return null;
  const status = asset.status === 'ready' || asset.status === 'failed' || asset.status === 'pending'
    ? asset.status
    : 'ready';
  if (status !== 'ready') return null;
  const source =
    asset.source === 'upload' || asset.source === 'remote' || asset.source === 'generated'
      ? asset.source
      : 'generated';
  const remoteCandidates = [asset.originalUrl, asset.url];
  let remoteUrl: string | undefined;
  for (const candidate of remoteCandidates) {
    const value = candidate?.trim();
    if (!value) continue;
    if (value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('asset:')) continue;
    remoteUrl = value;
    break;
  }
  return {
    id,
    mimeType: asset.mimeType,
    contentHash: asset.contentHash,
    width: asset.width,
    height: asset.height,
    size: asset.size,
    source,
    status: 'ready',
    nsfw: asset.nsfw === true,
    createdAt: Number(asset.createdAt) || Date.now(),
    prompt: asset.prompt,
    negativePrompt: asset.negativePrompt,
    model: asset.model,
    backend: typeof asset.backend === 'string' ? asset.backend : undefined,
    ...(remoteUrl ? { remoteUrl } : {}),
  };
}

function legacyEntryToKernel(entry: 相册条目): KernelAlbumEntry | null {
  const id = String(entry.id || '').trim();
  const assetId = String(entry.assetId || '').trim();
  if (!id || !assetId) return null;
  if (!String(entry.title || '').trim()) return null;
  return {
    id,
    assetId,
    title: String(entry.title || '未命名图片'),
    targetType: entry.targetType as KernelImageTargetType,
    targetId: entry.targetId,
    slot: entry.slot as KernelImageSlot,
    tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
    nsfw: entry.nsfw === true,
    createdAt: Number(entry.createdAt) || Date.now(),
    note: entry.note,
    referenceTargets: Array.isArray(entry.referenceTargets)
      ? entry.referenceTargets.slice()
      : [],
  };
}

function legacyTaskToKernel(task: 图片生成任务): KernelImageTask | null {
  const id = String(task.id || '').trim();
  if (!id) return null;
  if (task.status !== 'success') return null;
  if (!task.resultAssetId) return null;
  return {
    id,
    targetType: task.targetType as KernelImageTargetType,
    targetId: task.targetId,
    slot: task.slot as KernelImageSlot,
    source: task.source,
    status: 'success',
    backend: String(task.backend || 'unknown'),
    nsfw: task.nsfw === true,
    prompt: String(task.prompt || ''),
    negativePrompt: task.negativePrompt,
    resultAssetId: task.resultAssetId,
    error: task.error,
    retryCount: Math.max(0, Math.trunc(Number(task.retryCount) || 0)),
    createdAt: Number(task.createdAt) || Date.now(),
    startedAt: task.startedAt,
    finishedAt: task.finishedAt ?? Date.now(),
  };
}
