/**
 * Stage 5.4 — bindSlot pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  bindSlot,
  createEmptyKernelAlbum,
  type KernelAlbum,
  type KernelAlbumEntry,
  type KernelAsset,
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
    mimeType: partial.mimeType,
    contentHash: partial.contentHash,
    width: partial.width,
    height: partial.height,
    size: partial.size,
    prompt: partial.prompt,
    negativePrompt: partial.negativePrompt,
    model: partial.model,
    backend: partial.backend,
    remoteUrl: partial.remoteUrl,
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
    note: partial.note,
    referenceTargets: partial.referenceTargets ?? [],
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

describe('bindSlot (Stage 5.4)', () => {
  it('binds a new slot and updates entry target fields', () => {
    const current = album({
      assets: [asset({ id: 'a1' })],
      entries: [entry({ id: 'e1', assetId: 'a1', targetType: 'misc', slot: 'misc' })],
    });
    const frozen = JSON.stringify(current);

    const result = bindSlot(current, {
      entryId: 'e1',
      targetType: 'npc',
      targetId: 'npc_alice',
      slot: 'avatar_profile',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.previous).toBeNull();
    expect(result.album.slots).toEqual([
      {
        targetType: 'npc',
        targetId: 'npc_alice',
        slot: 'avatar_profile',
        assetId: 'a1',
        entryId: 'e1',
      },
    ]);
    expect(result.album.entries[0]).toMatchObject({
      id: 'e1',
      targetType: 'npc',
      targetId: 'npc_alice',
      slot: 'avatar_profile',
    });
    expect(JSON.stringify(current)).toBe(frozen);
  });

  it('replaces an existing slot binding (previous unbound from slots)', () => {
    const previousBinding: KernelSlotBinding = {
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'portrait',
      assetId: 'old_asset',
      entryId: 'e_old',
    };
    const current = album({
      assets: [
        asset({ id: 'old_asset' }),
        asset({ id: 'new_asset' }),
      ],
      entries: [
        entry({
          id: 'e_old',
          assetId: 'old_asset',
          targetType: 'traveler',
          targetId: 'traveler',
          slot: 'portrait',
        }),
        entry({
          id: 'e_new',
          assetId: 'new_asset',
          targetType: 'misc',
          slot: 'misc',
        }),
      ],
      slots: [previousBinding],
    });

    const result = bindSlot(current, {
      entryId: 'e_new',
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'portrait',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.previous).toEqual(previousBinding);
    expect(result.album.slots).toHaveLength(1);
    expect(result.album.slots[0]).toEqual({
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'portrait',
      assetId: 'new_asset',
      entryId: 'e_new',
    });
    // Previous entry historical fields stay; slots is source of truth
    expect(result.album.entries.find((e) => e.id === 'e_old')).toMatchObject({
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'portrait',
    });
  });

  it('returns entry_not_found when entry missing', () => {
    const result = bindSlot(createEmptyKernelAlbum(), {
      entryId: 'missing',
      targetType: 'npc',
      targetId: 'x',
      slot: 'portrait',
    });
    expect(result).toEqual({ ok: false, reason: 'entry_not_found' });
  });

  it('returns asset_not_found when asset is not ready', () => {
    const current = album({
      assets: [asset({ id: 'a1', status: 'pending' })],
      entries: [entry({ id: 'e1', assetId: 'a1' })],
    });
    const result = bindSlot(current, {
      entryId: 'e1',
      targetType: 'npc',
      targetId: 'x',
      slot: 'portrait',
    });
    expect(result).toEqual({ ok: false, reason: 'asset_not_found' });
  });

  it('returns invalid_target for empty targetId', () => {
    const current = album({
      assets: [asset({ id: 'a1' })],
      entries: [entry({ id: 'e1', assetId: 'a1' })],
    });
    const result = bindSlot(current, {
      entryId: 'e1',
      targetType: 'npc',
      targetId: '',
      slot: 'portrait',
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_target' });
  });
});
