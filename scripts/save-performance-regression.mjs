import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const compactor = fs.readFileSync('utils/saveRuntimeCompactor.ts', 'utf8');
const turnSnapshot = fs.readFileSync('hooks/useGame/turnSnapshot.ts', 'utf8');

const dbVersionMatch = dbService.match(/const DB_VERSION = (\d+)/);
assert(dbVersionMatch && Number(dbVersionMatch[1]) >= 5, '存档库版本必须继续升级，确保已打开过中间版本的玩家也会补建摘要表、图片资源表和增量节点表。');
assert(dbService.includes('SAVE_SUMMARIES_STORE'), '必须有独立存档摘要表。');
assert(dbService.includes('SAVE_ASSETS_STORE'), '必须有独立图片资源表，避免每个存档节点重复保存图片 base64。');
assert(dbService.includes('SAVE_NODE_DELTAS_STORE'), '必须有独立增量节点表，为后续真正增量读档铺路。');
assert(dbService.includes('summaryStore.put(buildSaveSummary(savedForDelta))'), '保存时必须同步写入轻量摘要。');
assert(dbService.includes('buildSaveNodeDeltaRecord'), '保存时必须同步写入存档树节点增量记录。');
assert(dbService.includes('SUMMARY_REBUILD_BATCH_SIZE'), '旧存档摘要必须分批补建，避免打开列表时卡死。');
assert(dbService.includes('void ensureSaveSummaries(db, SUMMARY_REBUILD_BATCH_SIZE)'), '打开存档列表时必须先显示已有摘要，再后台分批补建旧摘要。');
assert(dbService.includes('openCursor(null, \'prev\')'), '补建旧摘要必须用 cursor 分批扫描，不得一次性 getAll 完整大存档。');
assert(dbService.includes('for (let guard = 0; guard < 1000') && dbService.includes('rebuildSaveSummariesBatch(64)'), '修复摘要必须循环重建完整可见索引，不能清空后只补一小批导致存档看似消失。');
assert(dbService.includes('request.onblocked'), 'IndexedDB 升级被旧页面占用时必须返回错误，不能无限加载中。');
assert(dbService.includes('存档数据库打开超时'), 'IndexedDB 打开必须有超时兜底，不能让存档面板永久 pending。');
assert(dbService.includes("db.transaction(SAVE_SUMMARIES_STORE, 'readonly')"), '存档列表必须读取摘要表。');
const getSaveListBody = dbService.slice(
  dbService.indexOf('export async function getSaveList'),
  dbService.indexOf('export async function loadSave'),
);
assert(!getSaveListBody.includes('SAVES_STORE'), 'getSaveList 不得读取完整存档 store。');
assert(dbService.includes('const MAX_MANUAL_SAVE_NODES = 6'), '手动存档必须限制最多 6 个节点，避免手动节点无限堆积。');
assert(dbService.includes('const saveType = normalizeSaveType(data.type)'), '保存前必须归一化存档类型，避免旧入口绕过手动节点上限。');
assert(dbService.includes("pruneManagedSavesBeforeWrite(db, 'manual', MAX_MANUAL_SAVE_NODES - 1)"), '手动存档必须写入前先清理旧手动节点。');
assert(dbService.includes('const MAX_AUTO_SAVE_TREES = 6'), '自动存档树必须限制最多 6 棵，避免自动树无限增长。');
assert(dbService.includes('pruneAutoSaveTreesBeforeWrite(db'), '自动存档必须写入前按存档树清理旧自动档，降低峰值。');
assert(dbService.includes('getAutoSaveTreeRotationCandidates'), '自动存档轮转必须按 rootId 选出整棵旧树，而不是按单个节点截断。');
assert(dbService.includes('deleteManagedSaveItems'), '自动/保护存档轮转必须复用同一套 delta-base 安全删除逻辑。');
assert(dbService.includes('pruneManagedSavesBeforeWrite(db, \'backup\''), '保护存档必须写入前先清理旧保护档。');
assert(dbService.includes('...manualSaves.slice(MAX_MANUAL_SAVE_NODES)'), '后台轮转必须兜底清理超限手动节点。');
assert(dbService.includes('tx.objectStore(SAVE_SUMMARIES_STORE).delete(id)'), '删除存档必须同步删除摘要。');
assert(dbService.includes('deleteDeltaBySaveId'), '删除/轮转存档必须同步删除增量节点记录。');

assert(compactor.includes('export function compactPreTurnSnapshot'), '必须提供运行快照瘦身函数。');
assert(compactor.includes('stripAlbumAssetPayload'), '运行快照必须剥离相册图片 payload。');
assert(compactor.includes('dataUrl: asset.dataUrl ? 创建相册资源引用(asset.id)'), '相册资源 dataUrl 必须变成 asset 引用。');
assert(compactor.includes('compactPhoneImages'), '运行快照必须压缩手机里的图片数据。');
assert(compactor.includes('MAX_SNAPSHOT_QUEUE_TASKS'), '运行快照必须限制队列历史数量。');
assert(sendWorkflow.includes('const fullPreTurnSnapshot: 回合快照'), '发送流程必须保留内存完整快照用于中断回滚。');
assert(sendWorkflow.includes('const preTurnSnapshot = compactPreTurnSnapshot(fullPreTurnSnapshot)'), '持久化到聊天消息的快照必须瘦身。');
assert(sendWorkflow.includes('rollbackSnapshotOnAbort = fullPreTurnSnapshot'), '中断回滚必须使用完整内存快照。');
assert(turnSnapshot.includes('restoreAlbumSnapshot'), '读档后重 roll 恢复相册时必须处理瘦身相册。');
assert(turnSnapshot.includes("asset.dataUrl.startsWith('asset:') && current?.dataUrl"), '瘦身相册恢复时必须从当前相册补回图片正本。');
const saveLoadWorkflow = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');
assert(saveLoadWorkflow.includes('backup before loading failed; continue loading selected save'), '读档前保护存档失败时不得阻断玩家读取目标存档。');
const saveLoadModal = fs.readFileSync('components/features/SaveLoad/SaveLoadModal.tsx', 'utf8');
assert(saveLoadModal.includes('loadError') && saveLoadModal.includes('修复摘要'), '存档弹窗列表读取失败时必须退出加载态，并提供修复摘要入口。');
assert(saveLoadModal.includes('rebuildSaveSummariesBatch(24)') && saveLoadModal.includes('正在恢复旧存档索引'), '存档弹窗必须后台持续补全旧摘要，避免旧存档看似消失。');
const storageManager = fs.readFileSync('components/features/Settings/StorageManager.tsx', 'utf8');
assert(storageManager.includes('rebuildSaveSummariesBatch(24)') && storageManager.includes('正在恢复旧存档索引'), '设置页存档管理也必须后台持续补全旧摘要。');

console.log('save performance regression ok');
