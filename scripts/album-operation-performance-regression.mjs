import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const workspaces = await importBundled('components/features/GameSystems/album/workspaces.tsx');

const traveler = { 姓名: '测试旅人' };
const npcs = [
  { id: 'npc-1', 姓名: '测试伙伴甲', 阶位: 'companion', 原著角色: false },
  { id: 'npc-2', 姓名: '测试伙伴乙', 阶位: 'companion', 原著角色: false },
];
const album = {
  assets: [
    { id: 'asset-shared', dataUrl: 'data:image/png;base64,AQ==', source: 'upload', nsfw: false, createdAt: 1, status: 'ready' },
    { id: 'asset-avatar', dataUrl: 'data:image/png;base64,Ag==', source: 'upload', nsfw: false, createdAt: 2, status: 'ready' },
  ],
  entries: [
    {
      id: 'entry-shared-reference',
      assetId: 'asset-shared',
      title: '共享参考图',
      targetType: 'npc',
      targetId: 'npc-1',
      slot: 'misc',
      tags: ['参考图'],
      referenceTargets: ['npc-1', 'npc-2'],
      nsfw: false,
      createdAt: 1,
    },
    {
      id: 'entry-avatar-reference',
      assetId: 'asset-avatar',
      title: '伙伴甲头像',
      targetType: 'npc',
      targetId: 'npc-1',
      slot: 'avatar_profile',
      tags: ['头像'],
      referenceTargets: ['npc-1'],
      nsfw: false,
      createdAt: 2,
    },
    {
      id: 'entry-legacy-target-reference',
      assetId: 'asset-shared',
      title: '伙伴乙旧版参考图',
      targetType: 'npc',
      targetId: 'npc-2',
      slot: 'misc',
      tags: ['参考图'],
      nsfw: false,
      createdAt: 3,
    },
  ],
  tasks: [],
};
const assetMap = new Map(album.assets.map((asset) => [asset.id, asset]));
const records = workspaces.buildCharacterLibraryRecords(traveler, npcs, album, assetMap, false);
const npcOne = records.find((record) => record.id === 'npc-1');
const npcTwo = records.find((record) => record.id === 'npc-2');

assert.equal(npcOne.resourceCount, 2, '参考图与普通角色图都必须计入角色资源，同一条目不得重复');
assert.equal(npcTwo.resourceCount, 2, '共享参考归属和仅含 targetId 的旧版参考图都必须计入第二个角色');
assert.equal(album.assets.length, 2, '角色计数不得复制底层图片资源');

const archive = fs.readFileSync('components/features/GameSystems/album/albumArchive.ts', 'utf8');
const worker = fs.readFileSync('components/features/GameSystems/album/albumArchive.worker.ts', 'utf8');
const client = fs.readFileSync('components/features/GameSystems/album/albumArchiveWorkerClient.ts', 'utf8');
const panel = fs.readFileSync('components/features/GameSystems/AlbumPanel.tsx', 'utf8');
const library = fs.readFileSync('components/features/GameSystems/album/libWorkspace.tsx', 'utf8');
const content = fs.readFileSync('components/features/GameSystems/album/albumContent.ts', 'utf8');

assert(archive.includes('bytes.subarray(dataOffset, dataEnd)'), 'ZIP 导入必须使用字节视图，不能逐文件复制完整图片');
assert(archive.includes('parts.push(localHeader, nameBytes, file.data)'), 'ZIP 导出必须使用 Blob parts，不能把图片拼入连续副本');
assert(worker.includes("case 'export:asset'") && worker.includes("case 'import:init'"), '相册重计算必须在专用 Worker 中执行');
assert(client.includes("new Worker(new URL('./albumArchive.worker.ts', import.meta.url)"), '相册界面必须通过模块 Worker 执行归档');
assert(
  client.includes("await requestWorker(worker, { type: 'export:asset', asset: exportAsset })")
    || client.includes("await requestWorker(worker, { type: 'export:asset', asset: album.assets[index] })"),
  '导出资源必须逐项发送，不能一次复制整本相册',
);
assert(client.includes('materializeAssetForWorkerExport'), '导出前必须从主线程 Blob 缓存补齐 worker 可用的二进制');
assert(client.includes("[buffer]"), '导入 ZIP ArrayBuffer 必须转移给 Worker');
assert(!content.includes('Promise.all(album.assets.map'), '旧资源哈希补算不得使用无上限 Promise.all');
assert(panel.includes('startAlbumUpdate') && panel.includes('albumOperationBusy'), '删除和导入提交必须使用低优先级更新并锁定重操作');
assert(library.includes("contentVisibility: 'auto'") && library.includes('operationLabel'), '图库卡片必须隔离屏外渲染并展示操作阶段');
assert(!/entries\.some\(\(item\) => item\.id === entry\.id\)/.test(fs.readFileSync('components/features/GameSystems/album/workspaces.tsx', 'utf8')), '角色资源索引不得用数组逐项查重退化为平方复杂度');

console.log('album operation performance regression ok');
