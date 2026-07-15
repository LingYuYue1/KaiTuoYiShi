/**
 * Pure album entry deletion (Stage 5.4).
 *
 * Removes entries by id, drops slot bindings that referenced those entries,
 * orphan-cleans assets with no remaining entries, and clears task.resultAssetId
 * when the referenced asset is removed.
 */

import type { KernelAlbum, KernelImageTask } from './types';

export type DeleteEntriesResult =
  | Readonly<{
      ok: true;
      album: KernelAlbum;
      removedAssetIds: readonly string[];
      removedEntryIds: readonly string[];
    }>
  | Readonly<{ ok: false; reason: 'empty_ids' | 'none_found' }>;

/**
 * Remove entries by id. Drop slot bindings that referenced those entries.
 * Remove assets that no longer have any entry (orphan cleanup).
 * Tasks that referenced removed resultAssetId: clear resultAssetId if asset removed.
 */
export function deleteEntries(
  album: KernelAlbum,
  entryIds: readonly string[],
): DeleteEntriesResult {
  if (!album || typeof album !== 'object') {
    throw new Error('deleteEntries: album must be a KernelAlbum object');
  }
  if (!Array.isArray(entryIds)) {
    throw new Error('deleteEntries: entryIds must be an array');
  }

  if (entryIds.length === 0) {
    return { ok: false, reason: 'empty_ids' };
  }

  const removeSet = new Set<string>();
  for (const id of entryIds) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      return { ok: false, reason: 'empty_ids' };
    }
    removeSet.add(id);
  }

  const removedEntryIds: string[] = [];
  const remainingEntries = album.entries.filter((entry) => {
    if (removeSet.has(entry.id)) {
      removedEntryIds.push(entry.id);
      return false;
    }
    return true;
  });

  if (removedEntryIds.length === 0) {
    return { ok: false, reason: 'none_found' };
  }

  const removedEntryIdSet = new Set(removedEntryIds);
  const slots = album.slots.filter(
    (binding) => !removedEntryIdSet.has(binding.entryId),
  );

  const stillReferencedAssetIds = new Set(
    remainingEntries.map((entry) => entry.assetId),
  );

  const removedAssetIds: string[] = [];
  const assets = album.assets.filter((asset) => {
    if (stillReferencedAssetIds.has(asset.id)) {
      return true;
    }
    // Only drop assets that were referenced by removed entries and are now orphaned.
    // Assets never referenced by any entry (pre-existing orphans) also drop if no entry remains.
    removedAssetIds.push(asset.id);
    return false;
  });

  // Re-evaluate: assets that still have no entry are orphans — already filtered.
  // But assets that were never in removed entries and still unreferenced: also orphans.
  // Spec: "Remove assets that no longer have any entry (orphan cleanup)."
  // So all assets without remaining entries go. Correct above.

  const removedAssetIdSet = new Set(removedAssetIds);
  const tasks: KernelImageTask[] = album.tasks.map((task) => {
    if (
      task.resultAssetId !== undefined
      && removedAssetIdSet.has(task.resultAssetId)
    ) {
      return {
        id: task.id,
        targetType: task.targetType,
        ...(task.targetId !== undefined ? { targetId: task.targetId } : {}),
        slot: task.slot,
        source: task.source,
        status: task.status,
        backend: task.backend,
        nsfw: task.nsfw,
        prompt: task.prompt,
        ...(task.negativePrompt !== undefined
          ? { negativePrompt: task.negativePrompt }
          : {}),
        ...(task.error !== undefined ? { error: task.error } : {}),
        retryCount: task.retryCount,
        createdAt: task.createdAt,
        ...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
        ...(task.finishedAt !== undefined ? { finishedAt: task.finishedAt } : {}),
      };
    }
    return task;
  });

  return {
    ok: true,
    album: {
      assets,
      entries: remainingEntries,
      tasks,
      slots,
    },
    removedAssetIds,
    removedEntryIds,
  };
}
