import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`[album-blob-runtime-regression] ${message}`);
    process.exit(1);
  }
}

const albumObjectUrl = fs.readFileSync('utils/albumObjectUrl.ts', 'utf8');
const saveAssetStorage = fs.readFileSync('utils/saveAssetStorage.ts', 'utf8');
const albumActions = fs.readFileSync('utils/albumActions.ts', 'utf8');
const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const workspaces = fs.readFileSync('components/features/GameSystems/album/workspaces.tsx', 'utf8');
const albumArchive = fs.readFileSync('components/features/GameSystems/album/albumArchive.ts', 'utf8');
const workerClient = fs.readFileSync('components/features/GameSystems/album/albumArchiveWorkerClient.ts', 'utf8');
const turnSnapshot = fs.readFileSync('hooks/useGame/turnSnapshot.ts', 'utf8');
const saveLoad = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');
const imageGen = fs.readFileSync('services/ai/imageGeneration.ts', 'utf8');
const savePackage = fs.readFileSync('services/savePackage.ts', 'utf8');

// Runtime model: asset refs + Blob cache, not long-lived base64 in React state.
assert(albumActions.includes('rememberAlbumAssetFromDataUrl(assetId, input.src)'), '创建相册图片条目必须立即把 dataUrl 写入 Blob 缓存。');
assert(albumActions.includes('const dataUrl = blob ? 创建相册资源引用(assetId)'), '创建相册图片条目必须只在 Blob 转换成功后写入 asset: 引用。');
assert(albumActions.includes('pickAssetDisplayUrl'), '相册资源解析必须走 Blob 优先的显示 URL。');

// Restore path must not re-expand multi-MB dataUrls into album state.
assert(saveAssetStorage.includes('dataUrl: 创建相册资源引用(asset.id)'), 'restore 必须写回 asset: 引用。');
assert(saveAssetStorage.includes('// Runtime album state: keep asset ref only'), 'restore 注释必须明确禁止 base64 回填 React 状态。');
assert(saveAssetStorage.includes('blob?: Blob'), 'SaveAssetRecord 必须支持 Blob 字段。');
assert(dbService.includes('materializeSaveAssetRecords(await loadSaveAssetRecords'), '读档后必须物化 IndexedDB 资源。');
assert(dbService.includes('// Restore registers Blobs into the runtime cache'), 'loadSave 必须说明 restore 只注册 Blob。');

// Object URL lifecycle
assert(albumObjectUrl.includes('URL.revokeObjectURL'), 'object URL 必须在资源删除或替换时 revoke。');
assert(workspaces.includes('revokeAlbumAssets(removed)'), '删除相册资源时必须 revoke 缓存。');

// Snapshots / reroll
assert(turnSnapshot.includes('// Snapshots store asset: refs only'), '回合快照还原必须保持 asset: 引用。');
assert(turnSnapshot.includes('dataUrl: asset.dataUrl'), '快照还原不得把 current 的大 payload 回填。');

// Import / export
assert(albumArchive.includes('materializeAlbumRuntimePayload'), '相册导入提交前必须物化 runtime payload。');
assert(workerClient.includes('materializeAssetForWorkerExport'), 'Worker 导出必须从主线程 Blob 缓存补齐二进制。');
assert(savePackage.includes('expandSaveAssetPayloadForExport'), '存档包导出必须展开 Blob 为 portable dataUrl。');
assert(saveLoad.includes('materializeAlbumRuntimePayload(归一化相册系统(save.相册))'), '读档应用状态前必须物化相册 payload。');

// API boundary
assert(imageGen.includes('referenceSrcToBase64'), '生图 API 边界必须按需把参考图转 base64。');

console.log('[album-blob-runtime-regression] ok');
