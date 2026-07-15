/**
 * Stage 5.4 — deleteEntries pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  deleteEntries,
  type KernelAlbum,
  type KernelAlbumEntry,
  type KernelAsset,
  type KernelImageTask,
  type KernelSlotBinding,
} from '@/src/kernel/domain/album';

function asset(
  partial: Pick<KernelAsset, 'id'> & Partial<KernelAsset>,
): KernelAsset {
  return {
    id: partial.id,
    source: partial.source ?? 'generated',
    status: partial.status ?? 'ready',
    nsfw: partial.nsfw ?? false,
    createdAt: partial.createdAt ?? 1,
  };
}

function entry(
  partial: Pick<KernelAlbumEntry, 'id' | 'assetId'> & Partial<KernelAlbumEntry>,
): KernelAlbumEntry {
  return {
    id: partial.id,
    assetId: partial.assetId,
    title: partial.title ?? 'pic',
    targetType: partial.targetType ?? 'misc',
    targetId: partial.targetId,
    slot: partial.slot ?? 'misc',
    tags: partial.tags ?? [],
    nsfw: partial.nsfw ?? false,
    createdAt: partial.createdAt ?? 1,
    referenceTargets: partial.referenceTargets ?? [],
  };
}

function task(
  partial: Pick<KernelImageTask, 'id'> & Partial<KernelImageTask>,
): KernelImageTask {
  return {
    id: partial.id,
    targetType: partial.targetType ?? 'misc',
    targetId: partial.targetId,
    slot: partial.slot ?? 'misc',
    source: partial.source ?? 'manual',
    status: partial.status ?? 'success',
    backend: partial.backend ?? 'openai_compatible',
    nsfw: partial.nsfw ?? false,
    prompt: partial.prompt ?? 'p',
    negativePrompt: partial.negativePrompt,
    resultAssetId: partial.resultAssetId,
    error: partial.error,
    retryCount: partial.retryCount ?? 0,
    createdAt: partial.createdAt ?? 1,
    startedAt: partial.startedAt,
    finishedAt: partial.finishedAt,
  };
}

function album(partial: Partial<KernelAlbum>): KernelAlbum {
  return {
    assets: partial.assets ?? [],
    entries: partial.entries ?? [],
    tasks: partial.tasks ?? [],
    slots: partial.slots ?? [],
  };
}

describe('deleteEntries (Stage 5.4)', () => {
  it('removes entries, slot bindings, and orphan assets', () => {
    const binding: KernelSlotBinding = {
      targetType: 'npc',
      targetId: 'alice',
      slot: 'portrait',
      assetId: 'a1',
      entryId: 'e1',
    };
    const current = album({
      assets: [asset({ id: 'a1' }), asset({ id: 'a2' })],
      entries: [
        entry({ id: 'e1', assetId: 'a1' }),
        entry({ id: 'e2', assetId: 'a2' }),
      ],
      slots: [binding],
      tasks: [task({ id: 't1', resultAssetId: 'a1' })],
    });
    const frozen = JSON.stringify(current);

    const result = deleteEntries(current, ['e1']);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.removedEntryIds).toEqual(['e1']);
    expect(result.removedAssetIds).toEqual(['a1']);
    expect(result.album.entries.map((e) => e.id)).toEqual(['e2']);
    expect(result.album.assets.map((a) => a.id)).toEqual(['a2']);
    expect(result.album.slots).toEqual([]);
    expect(result.album.tasks[0].resultAssetId).toBeUndefined();
    expect(JSON.stringify(current)).toBe(frozen);
  });

  it('keeps shared asset when another entry still references it', () => {
    const current = album({
      assets: [asset({ id: 'shared' })],
      entries: [
        entry({ id: 'e1', assetId: 'shared' }),
        entry({ id: 'e2', assetId: 'shared' }),
      ],
      slots: [
        {
          targetType: 'npc',
          targetId: 'alice',
          slot: 'portrait',
          assetId: 'shared',
          entryId: 'e1',
        },
      ],
    });

    const result = deleteEntries(current, ['e1']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.removedAssetIds).toEqual([]);
    expect(result.album.assets.map((a) => a.id)).toEqual(['shared']);
    expect(result.album.entries.map((e) => e.id)).toEqual(['e2']);
    expect(result.album.slots).toEqual([]);
  });

  it('returns empty_ids for empty list', () => {
    const result = deleteEntries(album({ entries: [entry({ id: 'e1', assetId: 'a1' })] }), []);
    expect(result).toEqual({ ok: false, reason: 'empty_ids' });
  });

  it('returns none_found when no ids match', () => {
    const result = deleteEntries(
      album({ entries: [entry({ id: 'e1', assetId: 'a1' })] }),
      ['missing'],
    );
    expect(result).toEqual({ ok: false, reason: 'none_found' });
  });
});
