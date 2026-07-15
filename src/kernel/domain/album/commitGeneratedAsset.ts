/**
 * Pure commit of a generated (or uploaded) asset + album entry (Stage 5.4).
 *
 * Used after ImageGenerator success + AssetStore.put.
 * Formal state gains AssetRef metadata only — never bytes / object URLs / data URLs.
 */

import { bindSlot } from './bindSlot';
import {
  findAsset,
  findEntry,
  type KernelAlbum,
  type KernelAlbumEntry,
  type KernelAsset,
  type KernelImageTask,
} from './types';

export type CommitGeneratedInput = Readonly<{
  asset: KernelAsset; // must status ready, id non-empty
  entry: KernelAlbumEntry; // must reference asset.id
  task?: KernelImageTask; // if provided, status must be success with resultAssetId
  /** If true, also bind entry to its targetType/targetId/slot */
  bindToSlot?: boolean;
}>;

export type CommitGeneratedResult =
  | Readonly<{ ok: true; album: KernelAlbum }>
  | Readonly<{
      ok: false;
      reason:
        | 'duplicate_asset'
        | 'invalid_asset'
        | 'invalid_entry'
        | 'asset_entry_mismatch';
    }>;

/**
 * Add committed asset+entry (+optional task).
 * If bindToSlot, run same replace semantics as bindSlot.
 * MUST reject if asset.status !== 'ready'.
 * MUST reject data:/blob: in remoteUrl if present.
 */
export function commitGeneratedAsset(
  album: KernelAlbum,
  input: CommitGeneratedInput,
): CommitGeneratedResult {
  if (!album || typeof album !== 'object') {
    throw new Error('commitGeneratedAsset: album must be a KernelAlbum object');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('commitGeneratedAsset: input must be an object');
  }

  const assetCheck = validateAsset(input.asset);
  if (assetCheck !== null) {
    return { ok: false, reason: assetCheck };
  }

  if (findAsset(album, input.asset.id)) {
    return { ok: false, reason: 'duplicate_asset' };
  }

  const entryCheck = validateEntry(input.entry);
  if (entryCheck !== null) {
    return { ok: false, reason: entryCheck };
  }

  if (input.entry.assetId !== input.asset.id) {
    return { ok: false, reason: 'asset_entry_mismatch' };
  }

  if (findEntry(album, input.entry.id)) {
    return { ok: false, reason: 'invalid_entry' };
  }

  if (input.task !== undefined) {
    const taskCheck = validateTask(input.task, input.asset.id);
    if (taskCheck !== null) {
      return { ok: false, reason: taskCheck };
    }
    if (album.tasks.some((task) => task.id === input.task!.id)) {
      return { ok: false, reason: 'invalid_entry' };
    }
  }

  let next: KernelAlbum = {
    assets: album.assets.concat([input.asset]),
    entries: album.entries.concat([cloneEntry(input.entry)]),
    tasks:
      input.task !== undefined
        ? album.tasks.concat([{ ...input.task }])
        : album.tasks,
    slots: album.slots,
  };

  if (input.bindToSlot === true) {
    const targetId = input.entry.targetId;
    if (typeof targetId !== 'string' || targetId.trim().length === 0) {
      return { ok: false, reason: 'invalid_entry' };
    }
    const bound = bindSlot(next, {
      entryId: input.entry.id,
      targetType: input.entry.targetType,
      targetId,
      slot: input.entry.slot,
    });
    if (!bound.ok) {
      return { ok: false, reason: 'invalid_entry' };
    }
    next = bound.album;
  }

  return { ok: true, album: next };
}

function validateAsset(
  asset: KernelAsset,
): 'invalid_asset' | null {
  if (!asset || typeof asset !== 'object') {
    return 'invalid_asset';
  }
  if (typeof asset.id !== 'string' || asset.id.trim().length === 0) {
    return 'invalid_asset';
  }
  if (asset.id !== asset.id.trim()) {
    return 'invalid_asset';
  }
  if (asset.status !== 'ready') {
    return 'invalid_asset';
  }
  if (
    asset.source !== 'generated'
    && asset.source !== 'upload'
    && asset.source !== 'remote'
  ) {
    return 'invalid_asset';
  }
  if (typeof asset.nsfw !== 'boolean') {
    return 'invalid_asset';
  }
  if (typeof asset.createdAt !== 'number' || !Number.isFinite(asset.createdAt)) {
    return 'invalid_asset';
  }
  if (asset.remoteUrl !== undefined) {
    if (typeof asset.remoteUrl !== 'string' || asset.remoteUrl.trim().length === 0) {
      return 'invalid_asset';
    }
    if (isForbiddenRemoteUrl(asset.remoteUrl)) {
      return 'invalid_asset';
    }
  }
  return null;
}

function validateEntry(
  entry: KernelAlbumEntry,
): 'invalid_entry' | null {
  if (!entry || typeof entry !== 'object') {
    return 'invalid_entry';
  }
  if (typeof entry.id !== 'string' || entry.id.trim().length === 0) {
    return 'invalid_entry';
  }
  if (typeof entry.assetId !== 'string' || entry.assetId.trim().length === 0) {
    return 'invalid_entry';
  }
  if (typeof entry.title !== 'string' || entry.title.trim().length === 0) {
    return 'invalid_entry';
  }
  if (!Array.isArray(entry.tags)) {
    return 'invalid_entry';
  }
  if (!Array.isArray(entry.referenceTargets)) {
    return 'invalid_entry';
  }
  if (typeof entry.nsfw !== 'boolean') {
    return 'invalid_entry';
  }
  if (typeof entry.createdAt !== 'number' || !Number.isFinite(entry.createdAt)) {
    return 'invalid_entry';
  }
  return null;
}

function validateTask(
  task: KernelImageTask,
  assetId: string,
): 'invalid_entry' | null {
  if (!task || typeof task !== 'object') {
    return 'invalid_entry';
  }
  if (typeof task.id !== 'string' || task.id.trim().length === 0) {
    return 'invalid_entry';
  }
  if (task.status !== 'success') {
    return 'invalid_entry';
  }
  if (task.resultAssetId !== assetId) {
    return 'invalid_entry';
  }
  if (typeof task.backend !== 'string' || task.backend.trim().length === 0) {
    return 'invalid_entry';
  }
  if (typeof task.prompt !== 'string') {
    return 'invalid_entry';
  }
  if (typeof task.retryCount !== 'number' || !Number.isFinite(task.retryCount)) {
    return 'invalid_entry';
  }
  if (typeof task.createdAt !== 'number' || !Number.isFinite(task.createdAt)) {
    return 'invalid_entry';
  }
  return null;
}

function isForbiddenRemoteUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return lower.startsWith('data:') || lower.startsWith('blob:');
}

function cloneEntry(entry: KernelAlbumEntry): KernelAlbumEntry {
  return {
    ...entry,
    tags: entry.tags.slice(),
    referenceTargets: entry.referenceTargets.slice(),
  };
}
