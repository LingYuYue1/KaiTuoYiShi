import { describe, expect, it } from 'vitest';
import type { 相册系统 } from '@/models/imageGeneration';
import { 创建空相册系统 } from '@/models/imageGeneration';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  completeAlbumImport,
  loadAlbumAssetBytes,
  parseAlbumBytes,
} from '@/components/features/GameSystems/album/albumArchive';
import type { AlbumArchiveManifestV2, ArchiveAsset } from '@/components/features/GameSystems/album/albumArchive';
import { bytesToDataUrl, deduplicateAlbumContent, sha256Bytes } from '@/components/features/GameSystems/album/albumContent';
import { buildStoredZip } from '@/utils/zip';
import {
  makeAlbumAsset as makeAsset,
  makeAlbumEntry as makeEntry,
  makeAlbumTask as makeTask,
  registerAlbumCacheTeardown,
} from '../helpers/albumFixture';

registerAlbumCacheTeardown();

function zipOf(entries: Array<[string, unknown]>): Uint8Array {
  return buildStoredZip(entries.map(([name, value]) => ({
    name,
    data: value instanceof Uint8Array ? value : new TextEncoder().encode(JSON.stringify(value)),
  })));
}

function archiveAsset(overrides: Partial<ArchiveAsset> & { id: string }): ArchiveAsset {
  return {
    source: 'upload',
    nsfw: false,
    createdAt: 1,
    status: 'ready',
    ...overrides,
  };
}

function v2Manifest(overrides: Partial<AlbumArchiveManifestV2> = {}): AlbumArchiveManifestV2 {
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    entries: [],
    tasks: [],
    warnings: [],
    ...overrides,
  };
}

function extensionFromMime(mimeType: string): string {
  return /jpe?g/i.test(mimeType) ? 'jpg' : 'png';
}

async function buildArchiveBytes(album: 相册系统): Promise<Uint8Array> {
  const files: Array<{ name: string; data: Uint8Array }> = [];
  const assets: ArchiveAsset[] = [];
  for (const asset of album.assets) {
    const loaded = await loadAlbumAssetBytes(asset);
    const { dataUrl, ...metadata } = asset;
    void dataUrl;
    if (!loaded) {
      assets.push(metadata);
      continue;
    }
    const contentHash = await sha256Bytes(loaded.bytes);
    const file = `assets/${contentHash}.${extensionFromMime(loaded.mimeType)}`;
    files.push({ name: file, data: loaded.bytes });
    assets.push({ ...metadata, contentHash, mimeType: loaded.mimeType, file });
  }
  files.push({
    name: 'manifest.json',
    data: new TextEncoder().encode(JSON.stringify(v2Manifest({
      assets,
      entries: album.entries,
      tasks: album.tasks,
    }))),
  });
  return buildStoredZip(files);
}

describe('album archive round trip', () => {
  it('preserves assets, entries, tasks and reference associations through export and import', async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    const asset = makeAsset({ id: 'asset-1', dataUrl: bytesToDataUrl(imageBytes, 'image/png'), mimeType: 'image/png', createdAt: 100 });
    const entry = makeEntry({
      id: 'entry-1',
      assetId: 'asset-1',
      title: '角色图甲',
      targetId: 'npc-1',
      slot: 'portrait',
      referenceTargets: ['npc-1', 'npc-2'],
      createdAt: 150,
    });
    const task = makeTask({
      id: 'task-1',
      resultAssetId: 'asset-1',
      referenceImageIds: ['entry-1'],
      retryCount: 2,
      dimensions: '1024x1365',
      createdAt: 200,
      finishedAt: 300,
    });
    const album: 相册系统 = { assets: [asset], entries: [entry], tasks: [task] };

    const parsed = await parseAlbumBytes(await buildArchiveBytes(album));

    expect(parsed.warnings).toBe(0);
    expect(parsed.skippedEntries).toBe(0);
    expect(parsed.album.assets).toHaveLength(1);
    expect(parsed.album.assets[0].id).toBe('asset-1');
    expect(parsed.album.assets[0].contentHash).toBe(await sha256Bytes(imageBytes));
    expect(parsed.album.assets[0].dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
    expect(parsed.album.entries).toHaveLength(1);
    expect(parsed.album.entries[0].referenceTargets).toEqual(['npc-1', 'npc-2']);
    expect(parsed.album.entries[0].targetId).toBe('npc-1');
    expect(parsed.album.entries[0].slot).toBe('portrait');
    expect(parsed.album.tasks).toHaveLength(1);
    expect(parsed.album.tasks[0].resultAssetId).toBe('asset-1');
    expect(parsed.album.tasks[0].referenceImageIds).toEqual(['entry-1']);

    const imported = await completeAlbumImport({ parsed, currentAlbum: 创建空相册系统(), mode: 'replace' });
    const importedTask = imported.album.tasks[0];
    expect(imported.album.assets.map((item) => item.id)).toContain(importedTask.resultAssetId);
    for (const referenceId of importedTask.referenceImageIds ?? []) {
      expect(imported.album.entries.map((item) => item.id)).toContain(referenceId);
    }
    expect(imported.album.entries[0].referenceTargets).toEqual(['npc-1', 'npc-2']);
    expect(imported.stats.mergedEntries).toBe(0);
  });

  it('normalizes legacy reference_image entries on the JSON boundary', async () => {
    const parsed = await parseAlbumBytes(new TextEncoder().encode(JSON.stringify({
      assets: [makeAsset({ id: 'asset-legacy', url: 'https://cdn.example/legacy.png', source: 'remote' })],
      entries: [{
        id: 'entry-legacy',
        assetId: 'asset-legacy',
        title: '旧参考图',
        targetType: 'npc',
        targetId: 'npc-9',
        slot: 'reference_image',
        tags: [],
        nsfw: false,
        createdAt: 2,
      }],
      tasks: [makeTask({ id: 'task-legacy', resultAssetId: 'asset-legacy' })],
    })));

    expect(parsed.album.entries[0].referenceTargets).toEqual(['npc-9']);
    expect(parsed.album.tasks[0].resultAssetId).toBe('asset-legacy');
  });

  it('normalizes legacy reference_image entries inside legacy ZIP archives', async () => {
    const parsed = await parseAlbumBytes(zipOf([
      ['manifest.json', {
        entries: [{
          file: 'images/legacy.png',
          title: '旧参考图',
          targetType: 'npc',
          targetId: 'npc-9',
          slot: 'reference_image',
          tags: ['参考图'],
          nsfw: false,
          createdAt: 5,
        }],
      }],
      ['images/legacy.png', new Uint8Array([137, 80, 78, 71, 9, 9, 9])],
    ]));

    expect(parsed.album.entries).toHaveLength(1);
    expect(parsed.album.entries[0].slot).toBe('reference_image');
    expect(parsed.album.entries[0].referenceTargets).toEqual(['npc-9']);
    expect(parsed.album.assets).toHaveLength(1);
  });

  it('remaps duplicate asset and entry ids consistently across tasks', async () => {
    const sharedHash = 'a'.repeat(64);
    const album: 相册系统 = {
      assets: [
        makeAsset({ id: 'asset-1', contentHash: sharedHash }),
        makeAsset({ id: 'asset-2', contentHash: sharedHash }),
      ],
      entries: [
        makeEntry({ id: 'entry-1', assetId: 'asset-1', targetId: 'npc-1', slot: 'portrait', tags: ['a'], referenceTargets: ['npc-1', 'npc-2'], createdAt: 10 }),
        makeEntry({ id: 'entry-2', assetId: 'asset-2', targetId: 'npc-1', slot: 'portrait', tags: ['b'], referenceTargets: ['npc-1'], createdAt: 20 }),
      ],
      tasks: [makeTask({ id: 'task-1', resultAssetId: 'asset-2', referenceImageIds: ['entry-2', 'entry-1'] })],
    };

    const deduped = await deduplicateAlbumContent(album);

    expect(deduped.assets.map((item) => item.id)).toEqual(['asset-1']);
    expect(deduped.entries).toHaveLength(1);
    expect(deduped.entries[0].id).toBe('entry-1');
    expect(deduped.entries[0].assetId).toBe('asset-1');
    expect(deduped.entries[0].tags).toEqual(['a', 'b']);
    expect(deduped.entries[0].referenceTargets).toEqual(['npc-1', 'npc-2']);
    expect(deduped.tasks[0].resultAssetId).toBe('asset-1');
    expect(deduped.tasks[0].referenceImageIds).toEqual(['entry-1']);
  });

  it.each([
    ['非备份字节', () => new TextEncoder().encode('这不是一个相册备份')],
    ['缺集合字段', () => new TextEncoder().encode(JSON.stringify({ foo: 1 }))],
    ['ZIP 缺 manifest', () => zipOf([['assets/only.bin', new Uint8Array([1, 2, 3])]])],
    ['manifest 非 JSON', () => buildStoredZip([{ name: 'manifest.json', data: new TextEncoder().encode('{') }])],
    ['重复 asset id', () => zipOf([['manifest.json', v2Manifest({ assets: [archiveAsset({ id: 'asset-dup' }), archiveAsset({ id: 'asset-dup' })] })]])],
    ['asset 文件缺失', () => zipOf([['manifest.json', v2Manifest({ assets: [archiveAsset({ id: 'asset-x', file: 'assets/missing.png' })] })]])],
    ['entry 悬空 asset', () => zipOf([['manifest.json', v2Manifest({
      assets: [archiveAsset({ id: 'asset-1' })],
      entries: [makeEntry({ id: 'entry-1', assetId: 'asset-gone' })],
    })]])],
    ['内容哈希不一致', () => zipOf([
      ['manifest.json', v2Manifest({ assets: [archiveAsset({ id: 'asset-1', file: 'assets/x.png', contentHash: 'b'.repeat(64) })] })],
      ['assets/x.png', new Uint8Array([9, 9, 9, 9])],
    ])],
  ])('rejects malformed archives at the import boundary: %s', async (_name, build) => {
    await expect(parseAlbumBytes(build())).rejects.toThrow();
  });
});
