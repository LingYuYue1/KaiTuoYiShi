import { describe, expect, it } from 'vitest';
import { 创建空角色 } from '@/models/character';
import { 创建NPC记录 } from '@/models/npc';
import type { NPC记录 } from '@/models/npc';
import type { 相册系统, 图片资源 } from '@/models/imageGeneration';
import { 归一化相册系统 } from '@/models/imageGeneration';
import {
  buildAlbumResourceEntries,
  buildCharacterAlbumEntryIndex,
  buildCharacterLibraryRecords,
  buildSceneLibraryEntries,
  buildScopedCharacterGalleryEntries,
  buildVisibleCharacterEntries,
} from '@/components/features/GameSystems/album/albumWorkspaceLogic';
import { 挂载NPC头像图片 } from '@/utils/albumActions';
import {
  albumAssetMapOf as assetMapOf,
  makeAlbumAsset as makeAsset,
  makeAlbumEntry as makeEntry,
  registerAlbumCacheTeardown,
} from '../helpers/albumFixture';

registerAlbumCacheTeardown();

interface GalleryFixture {
  traveler: ReturnType<typeof 创建空角色>;
  npcA: NPC记录;
  npcB: NPC记录;
  album: 相册系统;
  assets: 图片资源[];
}

function createFixture(): GalleryFixture {
  const traveler = 创建空角色();
  traveler.姓名 = '测试旅人';
  const npcA = 创建NPC记录({ 姓名: '测试伙伴甲', 阶位: 'companion', 初见回合: 1 });
  const npcB = 创建NPC记录({ 姓名: '测试伙伴乙', 阶位: 'companion', 初见回合: 1 });

  const assets = [
    makeAsset({ id: 'asset-traveler', url: 'https://cdn.example/traveler.png' }),
    makeAsset({ id: 'asset-a-cover', url: 'https://cdn.example/a-cover.png' }),
    makeAsset({ id: 'asset-a-portrait', url: 'https://cdn.example/a-portrait.png' }),
    makeAsset({ id: 'asset-ref-b', url: 'https://cdn.example/ref-b.png' }),
    makeAsset({ id: 'asset-scene', url: 'https://cdn.example/scene.png' }),
    makeAsset({ id: 'asset-snapshot', url: 'https://cdn.example/snapshot.png' }),
    makeAsset({ id: 'asset-phone', url: 'https://cdn.example/phone.png' }),
    makeAsset({ id: 'asset-a-nsfw', url: 'https://cdn.example/a-nsfw.png', nsfw: true }),
    makeAsset({ id: 'asset-ghost-host', url: 'https://cdn.example/ghost-host.png' }),
  ];

  const album = 归一化相册系统({
    assets,
    entries: [
      makeEntry({ id: 'entry-traveler', assetId: 'asset-traveler', title: '旅人头像', targetType: 'traveler', targetId: 'traveler', createdAt: 10 }),
      makeEntry({ id: 'entry-a-cover', assetId: 'asset-a-cover', title: '甲的头像', targetId: npcA.id, createdAt: 20 }),
      makeEntry({ id: 'entry-a-portrait', assetId: 'asset-a-portrait', title: '甲的立绘', targetId: npcA.id, slot: 'portrait', createdAt: 30 }),
      makeEntry({ id: 'entry-ref-b', assetId: 'asset-ref-b', title: '乙的参考图', targetId: npcB.id, slot: 'misc', tags: ['参考图'], referenceTargets: [npcB.id], createdAt: 40 }),
      makeEntry({ id: 'entry-scene', assetId: 'asset-scene', title: '场景图', targetType: 'scene', targetId: undefined, slot: 'scene', createdAt: 50 }),
      makeEntry({ id: 'entry-snapshot', assetId: 'asset-snapshot', title: '快照图', targetType: 'scene', targetId: undefined, slot: 'scene', tags: ['故事快照'], createdAt: 60 }),
      makeEntry({ id: 'entry-phone', assetId: 'asset-phone', title: '手机壁纸', targetType: 'phone', targetId: undefined, slot: 'phone_wallpaper', createdAt: 70 }),
      makeEntry({ id: 'entry-a-nsfw', assetId: 'asset-a-nsfw', title: '甲的 NSFW 立绘', targetId: npcA.id, slot: 'portrait', nsfw: true, createdAt: 5 }),
      makeEntry({ id: 'entry-ghost-ref', assetId: 'asset-a-cover', title: '未知目标参考', targetType: 'misc', targetId: undefined, slot: 'misc', referenceTargets: ['ghost-target'], createdAt: 6 }),
    ],
    tasks: [],
  });

  return { traveler, npcA, npcB, album, assets };
}

let sharedFixture: GalleryFixture | null = null;

function getSharedFixture(): GalleryFixture {
  if (!sharedFixture) sharedFixture = createFixture();
  return sharedFixture;
}

describe('gallery scope projections', () => {
  it('projects only character-library entries into the character resource scope', () => {
    const { album, assets } = getSharedFixture();

    const visible = buildAlbumResourceEntries(album, assetMapOf(assets), false);
    expect(visible.map((item) => item.entry.id)).toEqual(['entry-a-portrait', 'entry-a-cover', 'entry-traveler']);
    expect(visible.map((item) => item.src)).toEqual([
      'https://cdn.example/a-portrait.png',
      'https://cdn.example/a-cover.png',
      'https://cdn.example/traveler.png',
    ]);

    const withNsfw = buildAlbumResourceEntries(album, assetMapOf(assets), true);
    expect(withNsfw.map((item) => item.entry.id)).toEqual([
      'entry-a-portrait',
      'entry-a-cover',
      'entry-traveler',
      'entry-a-nsfw',
    ]);
  });

  it('projects scene, snapshot and phone records into their own scope', () => {
    const { album, assets } = getSharedFixture();

    const sceneEntries = buildSceneLibraryEntries(album, assetMapOf(assets));
    expect(sceneEntries.map((item) => [item.entry.id, item.kind])).toEqual([
      ['entry-phone', 'phone'],
      ['entry-snapshot', 'snapshot'],
      ['entry-scene', 'scene'],
    ]);
    expect(sceneEntries.every((item) => item.label.length > 0)).toBe(true);
  });

  it('keeps reference associations attached to the correct target', () => {
    const { traveler, npcA, npcB, album } = getSharedFixture();

    const index = buildCharacterAlbumEntryIndex(traveler, [npcA, npcB], album, true);
    expect(index.get(npcA.id)?.map((entry) => entry.id)).toEqual(['entry-a-cover', 'entry-a-portrait', 'entry-a-nsfw']);
    expect(index.get(npcB.id)?.map((entry) => entry.id)).toEqual(['entry-ref-b']);
    expect(index.get('traveler')?.map((entry) => entry.id)).toEqual(['entry-traveler']);
    expect(index.has('ghost-target')).toBe(false);
    expect([...index.values()].flat().map((entry) => entry.id)).not.toContain('entry-ghost-ref');

    const withoutNsfw = buildCharacterAlbumEntryIndex(traveler, [npcA, npcB], album, false);
    expect(withoutNsfw.get(npcA.id)?.map((entry) => entry.id)).toEqual(['entry-a-cover', 'entry-a-portrait']);
  });

  it('narrows scoped entries to the selected record without losing owner entries', () => {
    const { traveler, npcA, npcB, album, assets } = getSharedFixture();
    const records = buildCharacterLibraryRecords(traveler, [npcA, npcB], album, assetMapOf(assets), false);
    const resourceEntries = buildAlbumResourceEntries(album, assetMapOf(assets), false);

    const recordA = records.find((record) => record.id === npcA.id);
    const scopedA = buildScopedCharacterGalleryEntries(recordA ?? null, resourceEntries);
    expect(scopedA.map((item) => item.entry.id)).toEqual(['entry-a-cover', 'entry-a-portrait']);

    const recordB = records.find((record) => record.id === npcB.id);
    const scopedB = buildScopedCharacterGalleryEntries(recordB ?? null, resourceEntries);
    expect(scopedB.map((item) => item.entry.id)).toEqual(['entry-ref-b']);

    const travelerRecord = records.find((record) => record.kind === 'traveler');
    const scopedTraveler = buildScopedCharacterGalleryEntries(travelerRecord ?? null, resourceEntries);
    expect(scopedTraveler.map((item) => item.entry.id)).toEqual(['entry-traveler']);

    expect(buildScopedCharacterGalleryEntries(null, resourceEntries)).toEqual([]);
  });

  it('deduplicates entries that arrive through record and resource projections', () => {
    const { traveler, npcA, npcB, album, assets } = getSharedFixture();
    const records = buildCharacterLibraryRecords(traveler, [npcA, npcB], album, assetMapOf(assets), true);
    const resourceEntries = buildAlbumResourceEntries(album, assetMapOf(assets), true);

    const recordA = records.find((record) => record.id === npcA.id);
    const visibleA = buildVisibleCharacterEntries(recordA ?? null, resourceEntries, album);
    const idsA = visibleA.map((item) => item.entry.id);
    expect(new Set(idsA).size).toBe(idsA.length);
    expect(idsA).toEqual(['entry-a-cover', 'entry-a-portrait', 'entry-a-nsfw']);

    const travelerRecord = records.find((record) => record.kind === 'traveler');
    const visibleTraveler = buildVisibleCharacterEntries(travelerRecord ?? null, resourceEntries, album);
    const idsTraveler = visibleTraveler.map((item) => item.entry.id);
    expect(new Set(idsTraveler).size).toBe(idsTraveler.length);
    expect(idsTraveler).toContain('entry-traveler');
  });

  it('includes built-in avatar candidates once alongside album entries', () => {
    const traveler = 创建空角色();
    traveler.姓名 = '测试旅人';
    const silverWolf = 创建NPC记录({ 姓名: '银狼', 阶位: 'companion', 原著角色: true, 初见回合: 1 });
    const album = 归一化相册系统({
      assets: [makeAsset({ id: 'asset-sw', url: 'https://cdn.example/sw.png' })],
      entries: [makeEntry({ id: 'entry-sw', assetId: 'asset-sw', title: '银狼同人图', targetId: silverWolf.id, createdAt: 10 })],
      tasks: [],
    });

    const records = buildCharacterLibraryRecords(traveler, [silverWolf], album, assetMapOf([]), false);
    const record = records.find((item) => item.id === silverWolf.id);
    const visible = buildVisibleCharacterEntries(record ?? null, buildAlbumResourceEntries(album, assetMapOf([]), false), album);
    const ids = visible.map((item) => item.entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('entry-sw');
    expect(ids.filter((id) => id.startsWith('builtin-avatar:')).length).toBeGreaterThan(0);
  });
});

describe('gallery mounting', () => {
  it('resolves mounted asset references to the selected asset URL', () => {
    const traveler = 创建空角色();
    traveler.姓名 = '测试旅人';
    const npc = 创建NPC记录({ 姓名: '测试伙伴甲', 阶位: 'companion', 初见回合: 1 });
    const asset = makeAsset({ id: 'asset-mount', url: 'https://cdn.example/mounted.png' });
    const album = 归一化相册系统({ assets: [asset], entries: [], tasks: [] });
    const [mounted] = 挂载NPC头像图片([npc], { npcId: npc.id, slot: '档案', src: 'asset:asset-mount' });

    const records = buildCharacterLibraryRecords(traveler, [mounted], album, assetMapOf([asset]), false);
    const record = records.find((item) => item.id === npc.id);

    expect(record?.avatar).toBe('https://cdn.example/mounted.png');
    expect(record?.slots.find((slot) => slot.key === 'avatar-profile')?.src).toBe('https://cdn.example/mounted.png');
  });

  it('does not mount an unrelated asset when the requested asset is missing', () => {
    const traveler = 创建空角色();
    traveler.姓名 = '测试旅人';
    const npc = 创建NPC记录({ 姓名: '测试伙伴甲', 阶位: 'companion', 初见回合: 1 });
    const otherAsset = makeAsset({ id: 'asset-other', url: 'https://cdn.example/other.png' });
    const album = 归一化相册系统({ assets: [otherAsset], entries: [], tasks: [] });
    const [mounted] = 挂载NPC头像图片([npc], { npcId: npc.id, slot: '档案', src: 'asset:asset-missing' });

    const records = buildCharacterLibraryRecords(traveler, [mounted], album, assetMapOf([otherAsset]), false);
    const record = records.find((item) => item.id === npc.id);
    const profileSlot = record?.slots.find((slot) => slot.key === 'avatar-profile');

    expect(profileSlot?.src).toBeUndefined();
    expect(record?.avatar).toBeUndefined();
  });
});
