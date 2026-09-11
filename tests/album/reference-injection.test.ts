import { afterEach, describe, expect, it } from 'vitest';
import type { 相册系统, 图片资源, 相册条目, 图片生成任务 } from '@/models/imageGeneration';
import { 归一化相册系统 } from '@/models/imageGeneration';
import type { 文生图API配置, 文生图参考图设置, 文生图后端类型 } from '@/models/settings';
import { 创建默认文生图API配置, 创建默认文生图参考图设置 } from '@/models/settings';
import { clearAlbumAssetObjectUrlCache } from '@/utils/albumObjectUrl';
import { generateTargets } from '@/components/features/GameSystems/album/foundation';
import type { GenerateTarget } from '@/components/features/GameSystems/album/foundation';
import {
  evaluateReferenceInjection,
  referenceBackendCapability,
  resolveReferenceImagesForGeneration,
} from '@/components/features/GameSystems/album/referenceInjection';
import { mergeAlbumEntryMetadata } from '@/components/features/GameSystems/album/albumContent';

afterEach(() => {
  clearAlbumAssetObjectUrlCache();
});

function makeAsset(overrides: Partial<图片资源> & { id: string }): 图片资源 {
  return {
    source: 'upload',
    nsfw: false,
    createdAt: 1,
    status: 'ready',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<相册条目> & { id: string; assetId: string }): 相册条目 {
  return {
    title: overrides.id,
    targetType: 'npc',
    slot: 'avatar_profile',
    tags: [],
    nsfw: false,
    createdAt: 1,
    referenceTargets: [],
    ...overrides,
  };
}

type LegacyAlbumEntry = Omit<相册条目, 'referenceTargets'> & { referenceTargets?: string[] };

function normalizeLegacy(input: { assets?: 图片资源[]; entries?: LegacyAlbumEntry[]; tasks?: 图片生成任务[] }): 相册系统 {
  return 归一化相册系统(input as unknown as Partial<相册系统>);
}

function targetOf(id: GenerateTarget) {
  const target = generateTargets.find((item) => item.id === id);
  if (!target) throw new Error(`missing generate target: ${id}`);
  return target;
}

function apiFor(backend: 文生图后端类型, enabled = true): 文生图API配置 {
  return { ...创建默认文生图API配置(), enabled, backend };
}

function referenceSettings(overrides: Partial<文生图参考图设置> = {}): 文生图参考图设置 {
  return { ...创建默认文生图参考图设置(), enabled: true, ...overrides };
}

type AssetSource = Pick<图片资源, 'dataUrl' | 'url' | 'localRef'>;

function assetMapOf(assets: Array<{ id: string; url?: string; dataUrl?: string; localRef?: string }>): Map<string, AssetSource> {
  const map = new Map<string, AssetSource>();
  for (const asset of assets) map.set(asset.id, { url: asset.url, dataUrl: asset.dataUrl, localRef: asset.localRef });
  return map;
}

describe('reference injection boundary', () => {
  it('normalizes legacy reference_image entries into referenceTargets', () => {
    const album = normalizeLegacy({
      assets: [makeAsset({ id: 'asset-1' })],
      entries: [
        { id: 'legacy-npc', assetId: 'asset-1', title: '旧 NPC 参考', targetType: 'npc', targetId: 'npc-1', slot: 'reference_image', tags: [], nsfw: false, createdAt: 1 },
        { id: 'legacy-traveler', assetId: 'asset-1', title: '旧旅人参考', targetType: 'traveler', targetId: 'npc-ignored', slot: 'reference_image', tags: [], nsfw: false, createdAt: 2 },
        { id: 'legacy-explicit', assetId: 'asset-1', title: '显式目标', targetType: 'npc', targetId: 'npc-9', slot: 'reference_image', referenceTargets: ['npc-7', ' npc-7 '], tags: [], nsfw: false, createdAt: 3 },
        { id: 'plain-entry', assetId: 'asset-1', title: '普通图', targetType: 'npc', targetId: 'npc-1', slot: 'portrait', tags: [], nsfw: false, createdAt: 4 },
      ],
    });

    const byId = new Map(album.entries.map((entry) => [entry.id, entry]));
    expect(byId.get('legacy-npc')?.referenceTargets).toEqual(['npc-1']);
    expect(byId.get('legacy-traveler')?.referenceTargets).toEqual(['traveler']);
    expect(byId.get('legacy-explicit')?.referenceTargets).toEqual(['npc-7']);
    expect(byId.get('plain-entry')?.referenceTargets).toEqual([]);
  });

  it('treats an explicit empty referenceTargets array as an intentional opt-out', () => {
    const album = normalizeLegacy({
      assets: [makeAsset({ id: 'asset-1' })],
      entries: [{ id: 'explicit-empty', assetId: 'asset-1', title: '显式空目标', targetType: 'npc', targetId: 'npc-1', slot: 'reference_image', referenceTargets: [], tags: [], nsfw: false, createdAt: 1 }],
    });
    expect(album.entries[0].referenceTargets).toEqual([]);
  });

  it('keeps reference toggles idempotent through merge and normalization', () => {
    const merged = mergeAlbumEntryMetadata(
      makeEntry({ id: 'entry-1', assetId: 'asset-1', referenceTargets: ['npc-1'] }),
      makeEntry({ id: 'entry-2', assetId: 'asset-1', referenceTargets: ['npc-1', 'npc-1'] }),
    );
    expect(merged.referenceTargets).toEqual(['npc-1']);

    const album = 归一化相册系统({
      assets: [makeAsset({ id: 'asset-1' })],
      entries: [makeEntry({ id: 'entry-1', assetId: 'asset-1', referenceTargets: ['npc-1', ' npc-1 ', '', 'npc-2'] })],
      tasks: [],
    });
    expect(album.entries[0].referenceTargets).toEqual(['npc-1', 'npc-2']);
    expect(归一化相册系统(album).entries[0].referenceTargets).toEqual(['npc-1', 'npc-2']);
  });

  it('produces an empty payload when reference injection is disabled', () => {
    const target = targetOf('npc_avatar');
    const album = 归一化相册系统({
      assets: [makeAsset({ id: 'asset-1', url: 'https://cdn.example/ref.png' })],
      entries: [makeEntry({ id: 'ref-1', assetId: 'asset-1', targetId: 'npc-1', referenceTargets: ['npc-1'] })],
      tasks: [],
    });
    const settings = referenceSettings({ enabled: false });

    const decision = evaluateReferenceInjection({ target, targetId: 'npc-1', api: apiFor('sd_webui'), settings, album });
    expect(decision.status.code).toBe('disabled');
    expect(decision.status.usable).toBe(false);

    const payload = resolveReferenceImagesForGeneration({
      target,
      targetId: 'npc-1',
      api: apiFor('sd_webui'),
      settings,
      album,
      assetMap: assetMapOf([{ id: 'asset-1', url: 'https://cdn.example/ref.png' }]),
    });
    expect(payload.entries).toEqual([]);
    expect(payload.images).toEqual([]);
    expect(payload.status.code).toBe('disabled');
  });

  it('omits payloads for missing entries, missing assets, and non-injectable targets', () => {
    const target = targetOf('npc_avatar');
    const settings = referenceSettings();
    const api = apiFor('sd_webui');
    const refAsset = makeAsset({ id: 'asset-ref', url: 'https://cdn.example/ref.png' });
    const album = 归一化相册系统({
      assets: [refAsset],
      entries: [makeEntry({ id: 'ref-1', assetId: 'asset-ref', targetId: 'npc-2', referenceTargets: ['npc-2'] })],
      tasks: [],
    });

    const missingEntry = resolveReferenceImagesForGeneration({
      target,
      targetId: 'npc-1',
      api,
      settings,
      album,
      assetMap: assetMapOf([{ id: 'asset-ref', url: 'https://cdn.example/ref.png' }]),
    });
    expect(missingEntry.status.code).toBe('missing_reference');
    expect(missingEntry.entries).toEqual([]);
    expect(missingEntry.images).toEqual([]);

    const missingAsset = resolveReferenceImagesForGeneration({
      target,
      targetId: 'npc-1',
      api,
      settings,
      album: { ...album, entries: [makeEntry({ id: 'ref-1', assetId: 'asset-gone', targetId: 'npc-1', referenceTargets: ['npc-1'] })] },
      assetMap: assetMapOf([{ id: 'asset-ref', url: 'https://cdn.example/ref.png' }]),
    });
    expect(missingAsset.status.code).toBe('unavailable');
    expect(missingAsset.entries).toEqual([]);
    expect(missingAsset.images).toEqual([]);

    const noDisplayUrl = resolveReferenceImagesForGeneration({
      target,
      targetId: 'npc-1',
      api,
      settings,
      album: { ...album, entries: [makeEntry({ id: 'ref-1', assetId: 'asset-empty', targetId: 'npc-1', referenceTargets: ['npc-1'] })] },
      assetMap: assetMapOf([{ id: 'asset-empty' }]),
    });
    expect(noDisplayUrl.status.code).toBe('unavailable');
    expect(noDisplayUrl.images).toEqual([]);

    const sceneTarget = resolveReferenceImagesForGeneration({
      target: targetOf('scene'),
      api,
      settings,
      album,
      assetMap: assetMapOf([{ id: 'asset-ref', url: 'https://cdn.example/ref.png' }]),
    });
    expect(sceneTarget.status.code).toBe('not_applicable');
    expect(sceneTarget.images).toEqual([]);

    const noTargetId = resolveReferenceImagesForGeneration({
      target,
      api,
      settings,
      album,
      assetMap: assetMapOf([{ id: 'asset-ref', url: 'https://cdn.example/ref.png' }]),
    });
    expect(noTargetId.status.code).toBe('missing_reference');
    expect(noTargetId.images).toEqual([]);
  });

  it('keeps unsupported backends unsupported even when opted in', () => {
    const optedIn = referenceSettings({
      enableOpenAICompatibleReference: true,
      enableComfyWorkflowReference: true,
      enableNovelAIReference: true,
    });
    expect(referenceBackendCapability('sd_webui', optedIn).usable).toBe(true);
    expect(referenceBackendCapability('openai_compatible', optedIn).usable).toBe(true);
    expect(referenceBackendCapability('comfyui', optedIn).usable).toBe(true);
    expect(referenceBackendCapability('novelai', optedIn).usable).toBe(false);

    const defaults = referenceSettings();
    expect(referenceBackendCapability('openai_compatible', defaults).usable).toBe(false);
    expect(referenceBackendCapability('comfyui', defaults).usable).toBe(false);

    const target = targetOf('npc_avatar');
    const album = 归一化相册系统({
      assets: [makeAsset({ id: 'asset-1', url: 'https://cdn.example/ref.png' })],
      entries: [makeEntry({ id: 'ref-1', assetId: 'asset-1', targetId: 'npc-1', referenceTargets: ['npc-1'] })],
      tasks: [],
    });
    const assetMap = assetMapOf([{ id: 'asset-1', url: 'https://cdn.example/ref.png' }]);

    const novelai = resolveReferenceImagesForGeneration({ target, targetId: 'npc-1', api: apiFor('novelai'), settings: optedIn, album, assetMap });
    expect(novelai.status.code).toBe('unsupported');
    expect(novelai.status.usable).toBe(false);
    expect(novelai.entries).toEqual([]);
    expect(novelai.images).toEqual([]);

    const openAIWithoutOptIn = resolveReferenceImagesForGeneration({ target, targetId: 'npc-1', api: apiFor('openai_compatible'), settings: defaults, album, assetMap });
    expect(openAIWithoutOptIn.status.code).toBe('unsupported');
    expect(openAIWithoutOptIn.images).toEqual([]);

    const comfyWithoutWorkflow = resolveReferenceImagesForGeneration({ target, targetId: 'npc-1', api: apiFor('comfyui'), settings: defaults, album, assetMap });
    expect(comfyWithoutWorkflow.status.code).toBe('unsupported');
    expect(comfyWithoutWorkflow.images).toEqual([]);

    const apiDisabled = resolveReferenceImagesForGeneration({ target, targetId: 'npc-1', api: apiFor('sd_webui', false), settings: defaults, album, assetMap });
    expect(apiDisabled.status.code).toBe('unsupported');
    expect(apiDisabled.images).toEqual([]);
  });

  it('hands the matched entry and asset URL to a supported backend', () => {
    const target = targetOf('npc_avatar');
    const refA = makeEntry({ id: 'ref-a', assetId: 'asset-a', targetId: 'npc-1', referenceTargets: ['npc-1'] });
    const refB = makeEntry({ id: 'ref-b', assetId: 'asset-b', targetId: 'npc-2', referenceTargets: ['npc-2'] });
    const album = 归一化相册系统({
      assets: [
        makeAsset({ id: 'asset-a', url: 'https://cdn.example/a.png' }),
        makeAsset({ id: 'asset-b', url: 'https://cdn.example/b.png' }),
      ],
      entries: [refA, refB],
      tasks: [],
    });
    const assetMap = assetMapOf([
      { id: 'asset-a', url: 'https://cdn.example/a.png' },
      { id: 'asset-b', url: 'https://cdn.example/b.png' },
    ]);

    const payload = resolveReferenceImagesForGeneration({
      target,
      targetId: 'npc-2',
      api: apiFor('sd_webui'),
      settings: referenceSettings(),
      album,
      assetMap,
    });

    expect(payload.status.code).toBe('enabled');
    expect(payload.status.usable).toBe(true);
    expect(payload.entries).toEqual([refB]);
    expect(payload.images).toEqual([{ id: 'ref-b', src: 'https://cdn.example/b.png', role: 'character', weight: 1 }]);
  });

  it('resolves traveler and nsfw targets through their own identity', () => {
    const travelerRef = makeEntry({
      id: 'ref-traveler',
      assetId: 'asset-traveler',
      targetType: 'traveler',
      targetId: undefined,
      referenceTargets: ['traveler'],
    });
    const nsfwRef = makeEntry({
      id: 'ref-nsfw',
      assetId: 'asset-nsfw',
      targetType: 'nsfw_part',
      targetId: 'npc-3',
      slot: 'nsfw_body_reference',
      nsfw: true,
      referenceTargets: ['npc-3'],
    });
    const album = 归一化相册系统({
      assets: [
        makeAsset({ id: 'asset-traveler', url: 'https://cdn.example/traveler.png' }),
        makeAsset({ id: 'asset-nsfw', url: 'https://cdn.example/nsfw.png', nsfw: true }),
      ],
      entries: [travelerRef, nsfwRef],
      tasks: [],
    });
    const assetMap = assetMapOf([
      { id: 'asset-traveler', url: 'https://cdn.example/traveler.png' },
      { id: 'asset-nsfw', url: 'https://cdn.example/nsfw.png' },
    ]);

    const traveler = resolveReferenceImagesForGeneration({
      target: targetOf('traveler_avatar'),
      api: apiFor('sd_webui'),
      settings: referenceSettings(),
      album,
      assetMap,
    });
    expect(traveler.status.code).toBe('enabled');
    expect(traveler.images).toEqual([{ id: 'ref-traveler', src: 'https://cdn.example/traveler.png', role: 'character', weight: 1 }]);

    const nsfw = resolveReferenceImagesForGeneration({
      target: targetOf('nsfw_reference'),
      targetId: 'npc-3',
      api: apiFor('comfyui'),
      settings: referenceSettings({ enableComfyWorkflowReference: true }),
      album,
      assetMap,
    });
    expect(nsfw.status.code).toBe('enabled');
    expect(nsfw.entries).toEqual([nsfwRef]);
    expect(nsfw.images).toEqual([{ id: 'ref-nsfw', src: 'https://cdn.example/nsfw.png', role: 'character', weight: 1 }]);
  });

  it('keeps one reference per character while a single entry may serve many characters', () => {
    const refA = makeEntry({ id: 'ref-a', assetId: 'asset-a', targetId: 'npc-1', referenceTargets: ['npc-1', 'npc-2'] });
    const refB = makeEntry({ id: 'ref-b', assetId: 'asset-b', targetId: 'npc-3', referenceTargets: ['npc-2', 'npc-3'] });
    const rawAlbum: 相册系统 = {
      assets: [
        makeAsset({ id: 'asset-a', url: 'https://cdn.example/a.png' }),
        makeAsset({ id: 'asset-b', url: 'https://cdn.example/b.png' }),
      ],
      entries: [refA, refB],
      tasks: [],
    };

    const unnormalized = evaluateReferenceInjection({ target: targetOf('npc_avatar'), targetId: 'npc-2', api: apiFor('sd_webui'), settings: referenceSettings(), album: rawAlbum });
    expect(unnormalized.status.code).toBe('enabled');
    expect(unnormalized.entry?.id).toBe('ref-a');

    const album = 归一化相册系统(rawAlbum);
    const byId = new Map(album.entries.map((entry) => [entry.id, entry]));
    expect(byId.get('ref-a')?.referenceTargets).toEqual(['npc-1', 'npc-2']);
    expect(byId.get('ref-b')?.referenceTargets).toEqual(['npc-3']);

    const assetMap = assetMapOf([
      { id: 'asset-a', url: 'https://cdn.example/a.png' },
      { id: 'asset-b', url: 'https://cdn.example/b.png' },
    ]);
    const resolve = (targetId: string) => resolveReferenceImagesForGeneration({
      target: targetOf('npc_avatar'),
      targetId,
      api: apiFor('sd_webui'),
      settings: referenceSettings(),
      album,
      assetMap,
    });

    expect(resolve('npc-1').entries.map((entry) => entry.id)).toEqual(['ref-a']);
    expect(resolve('npc-2').entries.map((entry) => entry.id)).toEqual(['ref-a']);
    expect(resolve('npc-3').entries.map((entry) => entry.id)).toEqual(['ref-b']);
    expect(resolve('npc-2').images).toHaveLength(1);
  });
});
