import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`[save-asset-store-regression] ${message}`);
    process.exit(1);
  }
}

const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const assetStorage = fs.readFileSync('utils/saveAssetStorage.ts', 'utf8');
const albumPanel = fs.readFileSync('components/features/GameSystems/AlbumWorkspace.tsx', 'utf8');
const albumWorkspaces = fs.readFileSync('components/features/GameSystems/album/workspaces.tsx', 'utf8');
const albumLibraryWorkspace = fs.readFileSync('components/features/GameSystems/album/libWorkspace.tsx', 'utf8');
const leftPanel = fs.readFileSync('components/layout/LeftPanel.tsx', 'utf8');
const travelerProfile = fs.readFileSync('components/features/Character/TravelerProfileModal.tsx', 'utf8');
const turnItem = fs.readFileSync('components/features/Chat/TurnItem.tsx', 'utf8');
const messageRenderers = fs.readFileSync('components/features/Chat/MessageRenderers.tsx', 'utf8');
const companionPanel = fs.readFileSync('components/features/GameSystems/CompanionPanel.tsx', 'utf8');
const phoneModal = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');
const phoneWallpapers = fs.readFileSync('utils/phoneWallpapers.ts', 'utf8');
const starMapPanel = fs.readFileSync('components/features/GameSystems/StarMapPanel.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const albumSurface = `${albumPanel}\n${albumWorkspaces}`;

const dbVersionMatch = dbService.match(/const DB_VERSION = (\d+)/);
assert(dbVersionMatch && Number(dbVersionMatch[1]) >= 5, 'IndexedDB 版本必须继续升级，确保已打开过中间版本的玩家也能补建 saveAssets 与 saveNodeDeltas 表。');
assert(dbService.includes("const SAVE_ASSETS_STORE = 'saveAssets'"), '必须定义独立图片资源表。');
assert(dbService.includes('db.createObjectStore(SAVE_ASSETS_STORE'), '升级流程必须创建 saveAssets 表。');
assert(dbService.includes('extractSaveAssetRecords(data)'), '保存时必须抽取相册图片资源。');
assert(dbService.includes('stripSaveAssetPayloadForStorage(data)'), '保存时必须剥离存档内相册图片 payload。');
assert(dbService.includes('restoreSaveAssetPayloadFromRecords(saveForAssets, [...records, ...desktopRecords])'), '读档时必须从资源表还原图片 payload（合并 IndexedDB 与 desktop 镜像）。');
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

assert(albumSurface.includes('const mountedSrc = bound.assetRef'), '从成品库挂载图片时必须写入 asset 引用，不能把 dataUrl 直接塞进变量。');
assert(albumSurface.includes('设置旅人图片当前显示(prev, { slot: mapImageSlotToTravelerSlot(params.slot), src: mountedSrc })'), '旅人头像槽位挂载必须使用 mountedSrc。');
assert(albumSurface.includes('设置NPC头像当前显示(prev, { npcId: params.targetId, slot: mapImageSlotToNpcAvatarSlot(params.slot), src: mountedSrc'), 'NPC 头像槽位挂载必须使用 mountedSrc。');
assert(albumSurface.includes('if (rawAvatar.trim().startsWith(\'asset:\')) return []'), '旅人当前 asset 引用头像不能再作为内置候选循环挂载。');
assert(albumWorkspaces.includes('key: 图片槽位;'), '角色已挂载槽位必须使用统一的图片槽位标识，不能使用展示专用 key。');
assert(albumWorkspaces.includes("resolveDisplayedSlot(currentAlbum, assetMap, 'npc', npc.id, 'avatar_story', '正文头像')"), '正文槽位占用状态必须读取原始槽位，不能回退到档案头像。');
assert(albumWorkspaces.includes("resolveDisplayedSlot(currentAlbum, assetMap, 'npc', npc.id, 'avatar_phone', '手机头像')"), '手机槽位占用状态必须读取原始槽位，不能回退到档案头像。');
assert(albumLibraryWorkspace.includes('slots={activeRecord?.slots ?? []}'), '槽位选择器必须读取角色档案中的真实已挂载槽位。');
assert(albumLibraryWorkspace.includes('selectedEntryId={activeItem?.entry.id}'), '槽位选择器必须接收当前成品 ID，以区分推荐槽位与图片实际所在槽位。');
assert(albumWorkspaces.includes('const recommended = option.slot === recommendedSlot;'), '推荐槽位必须精确匹配，正文或手机头像不能错误高亮档案头像。');
assert(!albumWorkspaces.includes("recommendedSlot?.startsWith('avatar_')"), '推荐槽位不得把全部头像槽位折叠到档案头像。');
assert(albumWorkspaces.includes("const stateLabel = current ? '当前显示' : occupied ? '已有显示 · 点击更换' : '';"), '槽位选择器必须分别显示当前图片和已占用状态。');
assert(!albumPanel.includes("targetType: 'traveler',\n                  targetId: params.targetId,\n                  slot: params.slot,"), '旅人挂载不得改写图片的推荐槽位。');
assert(!albumPanel.includes("targetId: params.targetId,\n                slot: params.slot,\n                nsfw:"), 'NPC 挂载不得改写图片的推荐槽位。');

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
assert(phoneModal.includes('album?: 相册系统'), '手机必须接收相册以解析槽位图片。');
assert(phoneModal.includes('src={解析相册资源引用(album, msg.avatar || (contact && msg.senderId === contact.id ? contact.avatar : undefined))}'), '手机消息头像必须在渲染时解析 asset 引用。');
assert(phoneModal.includes('src={解析相册资源引用(album, traveler.图像档案?.手机头像 || traveler.头像 || undefined)}'), '旅人手机头像必须解析 asset 引用。');
assert(!phoneModal.includes("avatar: 读取NPC头像(npc, '手机')"), '手机回退联系人也必须解析 asset 引用。');
assert(phoneModal.includes('列出手机相册壁纸') && phoneModal.includes('是当前手机壁纸'), '手机壁纸 UI 必须复用独立的相册壁纸选择模块。');
assert(phoneWallpapers.includes("entry.slot !== 'phone_wallpaper' && entry.slot !== 'phone_chat_background'"), '壁纸菜单必须包含 phone_wallpaper / phone_chat_background 槽位。');
assert(phoneModal.includes('onSetHome(wallpaper.assetRef)') && phoneWallpapers.includes('创建相册资源引用(asset.id)'), '相册壁纸设为桌面必须写入 asset: 引用。');
assert(phoneModal.includes('onSetChat(wallpaper.assetRef)'), '相册壁纸设为短讯必须写入 asset: 引用。');
assert(phoneModal.includes('相册中暂无手机背景，可在相册生成后在此选择'), '相册壁纸空状态文案必须保留。');
assert(starMapPanel.includes('album: 相册系统;'), '星图必须接收相册以解析 NPC 槽位头像。');
assert(starMapPanel.includes('const avatar = 解析相册资源引用(album, 读取NPC头像(npc, \'档案\'));'), '星图 NPC 头像必须解析 asset 引用。');
assert(app.includes('<StarMapPanel') && app.includes('album={ctx.album}'), 'App 必须把相册传给星图。');

console.log('[save-asset-store-regression] ok');
