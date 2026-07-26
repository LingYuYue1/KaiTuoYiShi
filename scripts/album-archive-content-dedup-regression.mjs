import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function importBundled(entryPoint) {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    alias: { '@': process.cwd() },
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const archive = await importBundled('components/features/GameSystems/album/albumArchive.ts');
const content = await importBundled('components/features/GameSystems/album/albumContent.ts');

const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const contentHash = await content.sha256Bytes(imageBytes);
const entry = {
  id: 'entry-1',
  assetId: 'asset-1',
  title: '测试图片',
  targetType: 'npc',
  targetId: 'npc-1',
  slot: 'avatar_profile',
  tags: ['头像'],
  referenceTargets: ['npc-1'],
  nsfw: false,
  createdAt: 1,
};
const task = {
  id: 'task-1',
  targetType: 'npc',
  targetId: 'npc-1',
  slot: 'avatar_profile',
  source: 'manual',
  status: 'success',
  backend: 'sd_webui',
  nsfw: false,
  prompt: 'test',
  referenceImageIds: ['entry-1'],
  resultAssetId: 'asset-1',
  retryCount: 0,
  createdAt: 1,
};
const manifest = {
  format: 'kaituo-album-backup',
  version: 2,
  exportedAt: new Date(0).toISOString(),
  assets: [{ id: 'asset-1', file: `assets/${contentHash}.png`, contentHash, mimeType: 'image/png', source: 'upload', nsfw: false, createdAt: 1, status: 'ready' }],
  entries: [entry],
  tasks: [task],
  warnings: [],
};
const zipBlob = archive.createZipBlob([
  { name: `assets/${contentHash}.png`, data: imageBytes },
  { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
]);
const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
const restored = await archive.parseAlbumZip(zipBytes);
assert.equal(restored.album.assets.length, 1);
assert.equal(restored.album.assets[0].contentHash, contentHash);
assert.equal(restored.album.entries[0].assetId, 'asset-1');
assert.equal(restored.album.tasks[0].resultAssetId, 'asset-1');
assert.deepEqual(restored.album.tasks[0].referenceImageIds, ['entry-1']);

const currentAlbum = {
  assets: [{ id: 'current-asset', dataUrl: content.bytesToDataUrl(imageBytes, 'image/png'), contentHash, source: 'upload', nsfw: false, createdAt: 1, status: 'ready' }],
  entries: [{ ...entry, id: 'current-entry', assetId: 'current-asset', tags: ['现有'] }],
  tasks: [],
};
const repeatedUpload = content.addOrReuseAlbumImage(
  currentAlbum,
  {
    asset: { ...currentAlbum.assets[0], id: 'new-upload-asset' },
    entry: { ...entry, id: 'new-upload-entry', assetId: 'new-upload-asset' },
  },
  contentHash,
  currentAlbum.assets[0].dataUrl,
);
assert.equal(repeatedUpload.reused, true);
assert.equal(repeatedUpload.album.assets.length, 1, '重复上传不得增加资源');
assert.equal(repeatedUpload.album.entries.length, 1, '重复上传不得增加图库卡片');

const crossTargetUpload = content.addOrReuseAlbumImage(
  currentAlbum,
  {
    asset: { ...currentAlbum.assets[0], id: 'other-target-asset' },
    entry: { ...entry, id: 'other-target-entry', assetId: 'other-target-asset', targetId: 'npc-2' },
  },
  contentHash,
  currentAlbum.assets[0].dataUrl,
);
assert.equal(crossTargetUpload.reused, true);
assert.equal(crossTargetUpload.album.assets.length, 1, '跨目标使用相同图片必须共享资源');
assert.equal(crossTargetUpload.album.entries.length, 2, '跨目标使用相同图片必须保留独立归属卡片');
assert.equal(crossTargetUpload.entry.assetId, 'current-asset');
assert.equal(crossTargetUpload.entry.targetId, 'npc-2');

const merged = await archive.mergeAlbumsByContent(currentAlbum, restored.album);
assert.equal(merged.album.assets.length, 1, '相同内容必须复用资源');
assert.equal(merged.album.entries.length, 1, '同一目标相同图片必须合并条目');
assert.equal(merged.stats.reusedAssets, 1);
assert.equal(merged.stats.mergedEntries, 1);
assert.deepEqual(new Set(merged.album.entries[0].tags), new Set(['现有', '头像']));

const duplicateAlbum = await content.deduplicateAlbumContent({
  assets: [
    { ...currentAlbum.assets[0], id: 'duplicate-a' },
    { ...currentAlbum.assets[0], id: 'duplicate-b' },
  ],
  entries: [
    { ...entry, id: 'duplicate-entry-a', assetId: 'duplicate-a' },
    { ...entry, id: 'duplicate-entry-b', assetId: 'duplicate-b' },
  ],
  tasks: [{ ...task, resultAssetId: 'duplicate-b', referenceImageIds: ['duplicate-entry-b'] }],
});
assert.equal(duplicateAlbum.assets.length, 1);
assert.equal(duplicateAlbum.entries.length, 1);
assert.equal(duplicateAlbum.tasks[0].resultAssetId, duplicateAlbum.assets[0].id);
assert.equal(duplicateAlbum.tasks[0].referenceImageIds[0], duplicateAlbum.entries[0].id);

const legacyManifest = {
  exportedAt: new Date(0).toISOString(),
  entries: [{ title: '旧备份图片', file: 'characters/legacy.png', targetType: 'npc', targetId: 'npc-1', slot: 'avatar_profile', tags: ['旧版'], referenceTargets: [], nsfw: false, createdAt: 1 }],
};
const legacyZip = archive.createZipBlob([
  { name: 'characters/legacy.png', data: imageBytes },
  { name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(legacyManifest)) },
]);
const legacyRestored = await archive.parseAlbumZip(new Uint8Array(await legacyZip.arrayBuffer()));
assert.equal(legacyRestored.album.assets.length, 1);
assert.equal(legacyRestored.album.entries[0].title, '旧备份图片');

const jsonAlbum = JSON.stringify(currentAlbum);
const jsonFile = { arrayBuffer: async () => new TextEncoder().encode(jsonAlbum).buffer };
const jsonRestored = await archive.parseAlbumFile(jsonFile);
assert.equal(jsonRestored.album.assets.length, 1);
assert.equal(jsonRestored.album.entries.length, 1);

const corrupted = zipBytes.slice();
const imageOffset = findSequence(corrupted, imageBytes);
assert.ok(imageOffset >= 0);
corrupted[imageOffset + imageBytes.length - 1] ^= 0xff;
assert.throws(() => archive.readStoredZip(corrupted), /CRC32 校验失败/);

assert.throws(() => archive.createZipBlob([{ name: '../escape.png', data: imageBytes }]), /不安全路径/);

const unsupportedCompression = zipBytes.slice();
const centralOffset = findSignature(unsupportedCompression, 0x02014b50);
assert.ok(centralOffset >= 0);
unsupportedCompression[centralOffset + 10] = 8;
unsupportedCompression[centralOffset + 11] = 0;
assert.throws(() => archive.readStoredZip(unsupportedCompression), /不支持的 ZIP 压缩方法/);

const beforeFailure = structuredClone(currentAlbum);
await assert.rejects(
  archive.importAlbum({
    file: { arrayBuffer: async () => corrupted.buffer.slice(corrupted.byteOffset, corrupted.byteOffset + corrupted.byteLength) },
    currentAlbum,
    mode: 'replace',
  }),
  /CRC32 校验失败/,
);
assert.deepEqual(currentAlbum, beforeFailure, '失败导入不得修改当前相册');

function findSequence(haystack, needle) {
  outer: for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    for (let inner = 0; inner < needle.length; inner += 1) if (haystack[index + inner] !== needle[inner]) continue outer;
    return index;
  }
  return -1;
}

function findSignature(bytes, signature) {
  for (let index = 0; index <= bytes.length - 4; index += 1) {
    const value = (bytes[index] | (bytes[index + 1] << 8) | (bytes[index + 2] << 16) | (bytes[index + 3] << 24)) >>> 0;
    if (value === signature) return index;
  }
  return -1;
}

console.log('album archive and content dedup regression ok');
