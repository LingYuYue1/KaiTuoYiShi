/**
 * Stage 5.4 — commitGeneratedAsset pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  commitGeneratedAsset,
  createEmptyKernelAlbum,
  type KernelAlbumEntry,
  type KernelAsset,
  type KernelImageTask,
} from '@/src/kernel/domain/album';

function readyAsset(
  partial: Pick<KernelAsset, 'id'> & Partial<KernelAsset>,
): KernelAsset {
  return {
    id: partial.id,
    source: partial.source ?? 'generated',
    status: partial.status ?? 'ready',
    nsfw: partial.nsfw ?? false,
    createdAt: partial.createdAt ?? 1,
    mimeType: partial.mimeType ?? 'image/png',
    prompt: partial.prompt,
    remoteUrl: partial.remoteUrl,
  };
}

function entry(
  partial: Pick<KernelAlbumEntry, 'id' | 'assetId'> & Partial<KernelAlbumEntry>,
): KernelAlbumEntry {
  return {
    id: partial.id,
    assetId: partial.assetId,
    title: partial.title ?? 'generated',
    targetType: partial.targetType ?? 'npc',
    targetId: partial.targetId ?? 'alice',
    slot: partial.slot ?? 'portrait',
    tags: partial.tags ?? [],
    nsfw: partial.nsfw ?? false,
    createdAt: partial.createdAt ?? 1,
    referenceTargets: partial.referenceTargets ?? [],
  };
}

function successTask(
  partial: Pick<KernelImageTask, 'id' | 'resultAssetId'> & Partial<KernelImageTask>,
): KernelImageTask {
  return {
    id: partial.id,
    targetType: partial.targetType ?? 'npc',
    targetId: partial.targetId ?? 'alice',
    slot: partial.slot ?? 'portrait',
    source: partial.source ?? 'manual',
    status: partial.status ?? 'success',
    backend: partial.backend ?? 'openai_compatible',
    nsfw: partial.nsfw ?? false,
    prompt: partial.prompt ?? 'a portrait',
    resultAssetId: partial.resultAssetId,
    retryCount: partial.retryCount ?? 0,
    createdAt: partial.createdAt ?? 1,
  };
}

describe('commitGeneratedAsset (Stage 5.4)', () => {
  it('commits ready asset + entry immutably', () => {
    const current = createEmptyKernelAlbum();
    const frozen = JSON.stringify(current);
    const asset = readyAsset({ id: 'asset_1', prompt: 'cat' });
    const e = entry({ id: 'entry_1', assetId: 'asset_1' });

    const result = commitGeneratedAsset(current, { asset, entry: e });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.album.assets).toHaveLength(1);
    expect(result.album.entries).toHaveLength(1);
    expect(result.album.slots).toEqual([]);
    expect(JSON.stringify(current)).toBe(frozen);
  });

  it('binds to slot when bindToSlot is true', () => {
    const result = commitGeneratedAsset(createEmptyKernelAlbum(), {
      asset: readyAsset({ id: 'asset_1' }),
      entry: entry({
        id: 'entry_1',
        assetId: 'asset_1',
        targetType: 'traveler',
        targetId: 'traveler',
        slot: 'avatar_profile',
      }),
      bindToSlot: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.album.slots).toEqual([
      {
        targetType: 'traveler',
        targetId: 'traveler',
        slot: 'avatar_profile',
        assetId: 'asset_1',
        entryId: 'entry_1',
      },
    ]);
  });

  it('commits optional success task', () => {
    const result = commitGeneratedAsset(createEmptyKernelAlbum(), {
      asset: readyAsset({ id: 'asset_1' }),
      entry: entry({ id: 'entry_1', assetId: 'asset_1' }),
      task: successTask({ id: 'task_1', resultAssetId: 'asset_1' }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.album.tasks).toHaveLength(1);
    expect(result.album.tasks[0].resultAssetId).toBe('asset_1');
  });

  it('rejects non-ready asset', () => {
    const result = commitGeneratedAsset(createEmptyKernelAlbum(), {
      asset: readyAsset({ id: 'asset_1', status: 'pending' }),
      entry: entry({ id: 'entry_1', assetId: 'asset_1' }),
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_asset' });
  });

  it('rejects duplicate asset id', () => {
    const seeded = commitGeneratedAsset(createEmptyKernelAlbum(), {
      asset: readyAsset({ id: 'asset_1' }),
      entry: entry({ id: 'entry_1', assetId: 'asset_1' }),
    });
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;

    const result = commitGeneratedAsset(seeded.album, {
      asset: readyAsset({ id: 'asset_1' }),
      entry: entry({ id: 'entry_2', assetId: 'asset_1' }),
    });
    expect(result).toEqual({ ok: false, reason: 'duplicate_asset' });
  });

  it('rejects asset/entry id mismatch', () => {
    const result = commitGeneratedAsset(createEmptyKernelAlbum(), {
      asset: readyAsset({ id: 'asset_1' }),
      entry: entry({ id: 'entry_1', assetId: 'asset_other' }),
    });
    expect(result).toEqual({ ok: false, reason: 'asset_entry_mismatch' });
  });

  it('rejects data: remoteUrl', () => {
    const result = commitGeneratedAsset(createEmptyKernelAlbum(), {
      asset: readyAsset({
        id: 'asset_1',
        remoteUrl: 'data:image/png;base64,AAAA',
      }),
      entry: entry({ id: 'entry_1', assetId: 'asset_1' }),
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_asset' });
  });

  it('rejects blob: remoteUrl', () => {
    const result = commitGeneratedAsset(createEmptyKernelAlbum(), {
      asset: readyAsset({
        id: 'asset_1',
        remoteUrl: 'blob:https://example.com/uuid',
      }),
      entry: entry({ id: 'entry_1', assetId: 'asset_1' }),
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_asset' });
  });

  it('accepts https remoteUrl', () => {
    const result = commitGeneratedAsset(createEmptyKernelAlbum(), {
      asset: readyAsset({
        id: 'asset_1',
        remoteUrl: 'https://cdn.example.com/img.png',
      }),
      entry: entry({ id: 'entry_1', assetId: 'asset_1' }),
    });
    expect(result.ok).toBe(true);
  });
});
