import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const saveCatalog = fs.readFileSync('services/storage/saveCatalog.ts', 'utf8');
const saveCatalogRepair = fs.readFileSync('services/storage/saveCatalogRepair.ts', 'utf8');
const saveRetention = fs.readFileSync('services/storage/saveRetention.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const compactor = fs.readFileSync('utils/saveRuntimeCompactor.ts', 'utf8');
const turnSnapshot = fs.readFileSync('hooks/useGame/turnSnapshot.ts', 'utf8');

const dbVersionMatch = dbService.match(/const DB_VERSION = (\d+)/);
assert(dbVersionMatch && Number(dbVersionMatch[1]) >= 5, '存档库版本必须继续升级，确保已打开过中间版本的玩家也会补建摘要表、图片资源表和增量节点表。');
assert(dbService.includes('SAVE_SUMMARIES_STORE'), '必须有独立存档摘要表。');
assert(dbService.includes('SAVE_ASSETS_STORE'), '必须有独立图片资源表，避免每个存档节点重复保存图片 base64。');
assert(dbService.includes('SAVE_NODE_DELTAS_STORE'), '必须有独立增量节点表，为后续真正增量读档铺路。');
assert(dbService.includes('summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(savedForDelta)))'), '保存时必须同步写入版本化轻量目录。');
assert(dbService.includes('buildSaveNodeDeltaRecord'), '保存时必须同步写入存档树节点增量记录。');
assert(dbService.includes('getAllKeys') || dbService.includes('openKeyCursor'), '存档目录检查必须只读取 saves 主键。');
assert(saveCatalog.includes("visibility: 'hidden-delta-base'") && saveCatalog.includes("visibility: 'legacy-backup'"), '目录必须标记隐藏增量基底和旧恢复点。');
assert(saveCatalogRepair.includes('repairPromise'), '目录恢复必须在服务层复用同一个任务。');
assert(saveCatalogRepair.includes('runWithSaveMutationPriority'), '保存和删除必须能让后台目录恢复暂停。');
assert(dbService.includes('repairOneSaveCatalogRecord'), '旧摘要必须一次只恢复一个完整存档。');
assert(!dbService.includes('for (let guard = 0; guard < 1000'), '索引修复不得保留千轮批量重建。');
assert(!dbService.includes('rebuildSaveSummariesBatch(64)'), '索引修复不得批量保留 64 个完整存档。');
assert(!dbService.includes('tx.objectStore(SAVE_SUMMARIES_STORE).clear()'), '索引修复不得先清空可用摘要。');
assert(dbService.includes('request.onblocked'), 'IndexedDB 升级被旧页面占用时必须返回错误，不能无限加载中。');
assert(dbService.includes('存档数据库打开超时'), 'IndexedDB 打开必须有超时兜底，不能让存档面板永久 pending。');
assert(dbService.includes("db.transaction(SAVE_SUMMARIES_STORE, 'readonly')"), '存档列表必须读取摘要表。');
const getSaveListBody = dbService.slice(
  dbService.indexOf('export async function getSaveList'),
  dbService.indexOf('export async function loadSave'),
);
assert(!getSaveListBody.includes('SAVES_STORE'), 'getSaveList 不得读取完整存档 store。');
assert(saveRetention.includes('MAX_MANUAL_SAVE_NODES_PER_TREE = 5'), '每棵存档树必须最多保留 5 个手动节点。');
assert(saveRetention.includes('MAX_AUTO_SAVE_NODES_PER_TREE = 6'), '每棵存档树必须最多保留 6 个自动节点。');
assert(saveRetention.includes('selectSaveNodeRotationCandidates'), '必须提供按存档树和节点类型计算轮转候选的纯函数。');
assert(saveRetention.includes('legacy-isolated-${item.type}-${item.id}'), '缺少 rootId 的旧节点必须各自隔离，避免猜测归属后误删。');
assert(!dbService.includes('MAX_AUTO_SAVE_TREES'), '存档树数量必须无限，不得保留自动树总数上限。');
assert(!dbService.includes('pruneManagedSavesBeforeWrite'), '保存前不得删除旧手动节点。');
assert(!dbService.includes('pruneAutoSaveTreesBeforeWrite'), '保存前不得删除旧自动节点或整棵树。');
assert(!dbService.includes('getAutoSaveTreeRotationCandidates'), '不得继续按自动树总数选择整树轮转候选。');
assert(dbService.includes('const candidates = selectSaveNodeRotationCandidates(all)'), '后台整理必须按单树、单类型选择超额节点。');
assert(dbService.includes('await rotateManagedSavesSafely(db);'), '新节点主存储成功后必须执行安全轮转。');
assert(dbService.includes("console.warn('[save-retention] post-save rotation failed'"), '轮转失败不得把已经成功保存的新节点报告为失败。');
assert(dbService.includes('const all = await readSaveSummaries(db)'), '轮转候选必须只读取 IndexedDB 摘要。');
assert(dbService.includes('deleteManagedSaveItems'), '自动存档轮转和显式删除必须复用同一套 delta-base 安全删除逻辑。');
assert(!dbService.includes('pruneManagedSavesBeforeWrite(db, \'backup\''), '系统不得继续自动创建和轮转读档前保护节点。');
assert(dbService.includes('summaryStore.delete(id)'), '删除存档必须同步删除摘要。');
assert(dbService.includes('deleteDeltaBySaveId'), '删除/轮转存档必须同步删除增量节点记录。');

assert(compactor.includes('export function compactPreTurnSnapshot'), '必须提供运行快照瘦身函数。');
const longSessionRetention = fs.readFileSync('utils/longSessionRetention.ts', 'utf8');
assert(longSessionRetention.includes('DETAILED_CHAT_TURNS = 20'), '长期会话必须保留最近 20 个完整 AI 回合。');
assert(longSessionRetention.includes('SUMMARY_VARIABLE_BATCHES = 80'), '变量批次必须保留最多 80 条轻量摘要。');
assert(longSessionRetention.includes('MAX_BATCH_FAILURE_RESULTS'), '旧变量批次必须限制失败摘要数量。');
assert(!dbService.includes('loadAllDeltaRecords') && !dbService.includes('SAVE_NODE_DELTAS_STORE).getAll'), 'delta 维护不得一次性加载所有 payload。');
assert(compactor.includes('stripAlbumAssetPayload'), '运行快照必须剥离相册图片 payload。');
assert(compactor.includes('dataUrl: asset.id ? 创建相册资源引用(asset.id) : asset.dataUrl'), '相册资源 dataUrl 必须变成 asset 引用。');
assert(compactor.includes('compactDataImages'), '运行快照必须递归压缩手机等系统里的图片数据。');
assert(compactor.includes('MAX_SNAPSHOT_QUEUE_TASKS'), '运行快照必须限制队列历史数量。');
assert(compactor.includes('buildPersistedZhikuSystem'), '运行快照必须只保存智库轻量运行态，不得复制完整内置目录。');
assert(turnSnapshot.includes('composeZhikuSystem'), '重 roll 恢复必须把智库轻量状态挂载到当前 V3 目录，且不得重复自制资料。');
assert(sendWorkflow.includes('const preTurnSnapshot = compactPreTurnSnapshot('), '持久化到聊天消息的快照必须瘦身。');
assert(sendWorkflow.includes('rollbackSnapshotOnAbort = preTurnSnapshot'), '中断回滚必须使用已隔离的运行快照。');
assert(sendWorkflow.includes("result.fullText = ''"), '正文落地后必须释放原始主模型响应工作集。');
assert(sendWorkflow.includes('apiMessages.length = 0'), '正文落地后必须释放主剧情 API 消息工作集。');
assert(sendWorkflow.includes("systemPrompt = ''"), '正文落地后必须释放主剧情 system prompt 工作集。');
assert(turnSnapshot.includes('restoreAlbumSnapshot'), '读档后重 roll 恢复相册时必须处理瘦身相册。');
assert(turnSnapshot.includes("asset.dataUrl.startsWith('asset:') && current"), '瘦身相册恢复时必须复用当前相册资源元数据。');
const saveLoadWorkflow = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');
assert(!saveLoadWorkflow.includes('saveLoadBackupIfNeeded'), '读档不得隐式创建保护节点。');
const saveLoadModal = fs.readFileSync('components/features/SaveLoad/SaveLoadModal.tsx', 'utf8');
assert(saveLoadModal.includes('loadError') && saveLoadModal.includes('修复摘要'), '存档弹窗列表读取失败时必须退出加载态，并提供修复摘要入口。');
assert(!saveLoadModal.includes('rebuildSaveSummariesBatch(24)'), '存档弹窗不得维护自己的摘要恢复循环。');
assert(saveLoadModal.includes('subscribeSaveCatalogRepair') && saveLoadModal.includes('startSaveCatalogRepair'), '存档弹窗必须复用服务层目录恢复状态。');
const storageManager = fs.readFileSync('components/features/Settings/StorageManager.tsx', 'utf8');
assert(!storageManager.includes('rebuildSaveSummariesBatch(24)'), '设置页不得维护自己的摘要恢复循环。');
assert(storageManager.includes('subscribeSaveCatalogRepair') && storageManager.includes('startSaveCatalogRepair'), '设置页必须复用服务层目录恢复状态。');

console.log('save performance regression ok');
