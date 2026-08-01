import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`[save-asset-store-regression] ${message}`);
    process.exit(1);
  }
}

const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const assetStorage = fs.readFileSync('utils/saveAssetStorage.ts', 'utf8');
const albumPanel = fs.readFileSync('components/features/GameSystems/AlbumPanel.tsx', 'utf8');
const albumWorkspaces = fs.readFileSync('components/features/GameSystems/album/workspaces.tsx', 'utf8');
const leftPanel = fs.readFileSync('components/layout/LeftPanel.tsx', 'utf8');
const travelerProfile = fs.readFileSync('components/features/Character/TravelerProfileModal.tsx', 'utf8');
const turnItem = fs.readFileSync('components/features/Chat/TurnItem.tsx', 'utf8');
const messageRenderers = fs.readFileSync('components/features/Chat/MessageRenderers.tsx', 'utf8');
const companionPanel = fs.readFileSync('components/features/GameSystems/CompanionPanel.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const albumSurface = `${albumPanel}\n${albumWorkspaces}`;

const dbVersionMatch = dbService.match(/const DB_VERSION = (\d+)/);
assert(dbVersionMatch && Number(dbVersionMatch[1]) >= 5, 'IndexedDB 版本必须继续升级，确保已打开过中间版本的玩家也能补建 saveAssets 与 saveNodeDeltas 表。');
assert(dbService.includes("const SAVE_ASSETS_STORE = 'saveAssets'"), '必须定义独立图片资源表。');
assert(dbService.includes('db.createObjectStore(SAVE_ASSETS_STORE'), '升级流程必须创建 saveAssets 表。');
assert(dbService.includes('extractSaveAssetRecords(data)'), '保存时必须抽取相册图片资源。');
assert(dbService.includes('stripSaveAssetPayloadForStorage(data)'), '保存时必须剥离存档内相册图片 payload。');
assert(dbService.includes('restoreSaveAssetPayloadFromRecords(saveForAssets, records)'), '读档时必须只从 IndexedDB 资源表还原图片 payload。');
assert(dbService.includes('saveHasEmbeddedAssetPayload(saveForAssets)'), '读到旧存档时必须检测内嵌图片 payload。');
assert(dbService.includes('migrateLoadedSaveAssets(db, saveForAssets)'), '读到旧存档后必须惰性迁移图片资源，避免旧档一直巨大。');
assert(dbService.includes('loadSaveAssetRecords(db, assetIds)'), '读档时必须按 assetId 批量读取资源表。');
assert(dbService.includes('assetStore.clear()'), '批量替换存档时必须同步重建资源表。');

assert(assetStorage.includes('export interface SaveAssetRecord'), '必须定义图片资源记录。');
assert(assetStorage.includes('export function extractSaveAssetRecords'), '必须导出图片资源抽取函数。');
assert(assetStorage.includes('export function saveHasEmbeddedAssetPayload'), '必须导出旧档内嵌图片检测函数。');
assert(assetStorage.includes('export function stripSaveAssetPayloadForStorage'), '必须导出图片 payload 剥离函数。');
assert(assetStorage.includes('export function restoreSaveAssetPayloadFromRecords'), '必须导出图片 payload 还原函数。');
assert(assetStorage.includes('dataUrl: 创建相册资源引用(asset.id)'), '剥离相册资源时必须保留 asset 引用。');
assert(assetStorage.includes('blob?: Blob'), 'SaveAssetRecord 必须支持 Blob 二进制字段。');
assert(assetStorage.includes('materializeSaveAssetRecord'), '读档时必须把 legacy dataUrl 物化为 Blob 缓存。');
assert(assetStorage.includes('// Runtime album state: keep asset ref only'), '还原路径不得把 multi-MB base64 重新注入 React 相册状态。');
assert(assetStorage.includes('expandSaveAssetPayloadForExport'), '导出边界必须能把 Blob 展开为 portable dataUrl。');

const albumObjectUrl = fs.readFileSync('utils/albumObjectUrl.ts', 'utf8');
assert(albumObjectUrl.includes('revokeAlbumAsset'), '删除资源时必须 revoke object URL。');
assert(albumObjectUrl.includes('materializeAlbumRuntimePayload'), '必须提供运行时 dataUrl→Blob 物化入口。');
assert(dbService.includes('materializeSaveAssetRecords'), 'dbService 读档/保存路径必须物化 Blob 资源。');

assert(albumSurface.includes('const mountedSrc = entry ? 创建相册资源引用(entry.assetId) : params.src'), '从成品库挂载图片时必须写入 asset 引用，不能把 dataUrl 直接塞进变量。');
assert(albumSurface.includes('挂载旅人图片(prev, { slot: mapImageSlotToTravelerSlot(params.slot), src: mountedSrc })'), '旅人头像槽位挂载必须使用 mountedSrc。');
assert(albumSurface.includes('挂载NPC头像图片(prev, { npcId: params.targetId, slot: mapImageSlotToNpcAvatarSlot(params.slot), src: mountedSrc'), 'NPC 头像槽位挂载必须使用 mountedSrc。');
assert(albumSurface.includes('if (rawAvatar.trim().startsWith(\'asset:\')) return []'), '旅人当前 asset 引用头像不能再作为内置候选循环挂载。');
assert(albumSurface.includes('src: 解析相册资源引用(album, 读取NPC头像(npc, \'档案\'))'), '相册成品库 NPC 档案头像必须解析 asset 引用。');
assert(albumSurface.includes('src: 解析相册资源引用(album, traveler.图像档案?.头像 || traveler.头像 || undefined)'), '相册成品库旅人档案头像必须解析 asset 引用。');

assert(leftPanel.includes('解析相册资源引用(album, traveler.头像?.trim() || traveler.图像档案?.头像?.trim())'), '左侧旅人头像必须解析 asset 引用。');
assert(travelerProfile.includes('解析相册资源引用(album, traveler.头像?.trim() || traveler.图像档案?.头像?.trim())'), '旅人档案弹窗头像必须解析 asset 引用。');
assert(app.includes('<LeftPanel') && app.includes('album={state.相册}'), 'App 必须把相册传给左侧面板和头像显示入口。');
assert(app.includes('<TravelerProfileModal') && app.includes('album={state.相册}'), 'App 必须把相册传给旅人档案弹窗。');
assert(app.includes('<CompanionPanel') && app.includes('album={ctx.album}'), 'App 必须把相册传给伙伴面板。');

assert(turnItem.includes('<UserTurnBubble content={message.content} traveler={traveler} album={album}'), '玩家气泡必须接收相册。');
assert(turnItem.includes('解析相册资源引用(album, traveler?.图像档案?.正文头像?.trim() || traveler?.头像?.trim())'), '玩家气泡头像必须解析 asset 引用。');
assert(turnItem.includes('<BodyBlock content={parsed.body} npcRecords={npcRecords} traveler={traveler} album={album}'), '主剧情正文必须把相册传给 BodyBlock。');
assert(turnItem.includes('<BodyBlock content={content} npcRecords={npcRecords} traveler={traveler} album={album}'), '命途狭间正文必须把相册传给 BodyBlock。');
assert(turnItem.includes('<StreamingPreview') && turnItem.includes('album={album}'), '流式预览必须传递相册。');

assert(messageRenderers.includes('album?: 相册系统'), '正文渲染器 props 必须支持相册。');
assert(messageRenderers.includes('解析相册资源引用(album, 读取NPC头像(npc, \'正文\'))'), 'NPC 正文头像必须解析 asset 引用。');
assert(messageRenderers.includes('return <InnerVoiceBubble key={i} text={line.text} traveler={traveler} album={album}'), '心声气泡必须接收相册。');
assert(companionPanel.includes('const src = 解析相册资源引用(album, 读取NPC头像(npc, slot))'), '伙伴面板头像必须解析 asset 引用。');

console.log('[save-asset-store-regression] ok');
