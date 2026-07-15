/**
 * Stage 5.4 D — fromKernelAlbum must keep AssetRef displayable.
 * Regression: projecting formal album stripped base64 without warming Blob cache,
 * so LeftPanel 解析相册资源引用(asset:<id>) returned empty after slot bind.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAlbumAssetObjectUrlCache,
  hasAlbumAssetBlob,
  resolveAlbumAssetDisplayUrl,
} from '@/utils/albumObjectUrl';
import { 解析相册资源引用 } from '@/utils/albumActions';
import {
  applyBindSlotOnLegacyAlbum,
  fromKernelAlbum,
  toKernelAlbum,
} from '@/src/ui/album/projectAlbum';
import { bindSlotOnAlbum } from '@/src/ui/album/slotOperations';
import type { 相册系统 } from '@/models/imageGeneration';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function seedAlbum(): 相册系统 {
  return {
    assets: [
      {
        id: 'asset_display_1',
        dataUrl: TINY_PNG,
        source: 'generated',
        nsfw: false,
        createdAt: 1,
        status: 'ready',
      },
    ],
    entries: [
      {
        id: 'entry_display_1',
        assetId: 'asset_display_1',
        title: '测试头像',
        targetType: 'misc',
        slot: 'misc',
        tags: [],
        nsfw: false,
        createdAt: 1,
        referenceTargets: [],
      },
    ],
    tasks: [],
  };
}

afterEach(() => {
  clearAlbumAssetObjectUrlCache();
});

describe('projectAlbum display bridge (Stage 5.4 slot UI)', () => {
  it('fromKernelAlbum migrates previous dataUrl into Blob cache', () => {
    const legacy = seedAlbum();
    expect(hasAlbumAssetBlob('asset_display_1')).toBe(false);

    const formal = toKernelAlbum(legacy);
    const projected = fromKernelAlbum(formal, { previous: legacy });

    expect(projected.assets[0]?.dataUrl).toBe('asset:asset_display_1');
    expect(hasAlbumAssetBlob('asset_display_1')).toBe(true);
    expect(resolveAlbumAssetDisplayUrl('asset_display_1')).toMatch(/^blob:/);
  });

  it('bindSlotOnAlbum leaves AssetRef resolvable for LeftPanel', () => {
    const legacy = seedAlbum();
    // Simulate prior generate that only left formal AssetRef shape in React state
    // without calling remember (cold cache) — projection must rehydrate.
    clearAlbumAssetObjectUrlCache();

    const bound = bindSlotOnAlbum(legacy, {
      entryId: 'entry_display_1',
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'avatar_profile',
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    expect(bound.assetRef).toBe('asset:asset_display_1');
    const url = 解析相册资源引用(bound.album, bound.assetRef);
    expect(url).toBeTruthy();
    expect(url).toMatch(/^blob:/);

    const entry = bound.album.entries.find((item) => item.id === 'entry_display_1');
    expect(entry?.targetType).toBe('traveler');
    expect(entry?.targetId).toBe('traveler');
    expect(entry?.slot).toBe('avatar_profile');
  });

  it('applyBindSlotOnLegacyAlbum replaces previous slot binding entry targets', () => {
    const legacy = seedAlbum();
    // Second image starts unbound (misc) so first bind owns the profile slot.
    legacy.assets.push({
      id: 'asset_display_2',
      dataUrl: TINY_PNG,
      source: 'generated',
      nsfw: false,
      createdAt: 2,
      status: 'ready',
    });
    legacy.entries.push({
      id: 'entry_display_2',
      assetId: 'asset_display_2',
      title: '另一张',
      targetType: 'misc',
      slot: 'misc',
      tags: [],
      nsfw: false,
      createdAt: 2,
      referenceTargets: [],
    });

    const first = applyBindSlotOnLegacyAlbum(legacy, {
      entryId: 'entry_display_1',
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'avatar_profile',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.previous).toBeNull();

    const second = applyBindSlotOnLegacyAlbum(first.album, {
      entryId: 'entry_display_2',
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'avatar_profile',
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.previous?.entryId).toBe('entry_display_1');
    const boundEntry = second.album.entries.find((e) => e.id === 'entry_display_2');
    expect(boundEntry?.slot).toBe('avatar_profile');
    expect(boundEntry?.targetId).toBe('traveler');
  });
});
