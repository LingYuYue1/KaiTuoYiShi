import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`[save-delta-regression] ${message}`);
    process.exit(1);
  }
}

const delta = fs.readFileSync('utils/saveDeltaStorage.ts', 'utf8');
const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const savePackage = fs.readFileSync('services/savePackage.ts', 'utf8');

assert(delta.includes('export interface SaveNodeDeltaRecord'), '必须定义存档树节点增量记录。');
assert(delta.includes("export type SaveNodeBaseMode = 'checkpoint' | 'delta'"), '必须显式区分 checkpoint 与 delta 节点。');
assert(delta.includes('export function buildDeltaOnlyStoredSave'), '必须支持构造 delta-only 存储占位存档。');
assert(delta.includes('export function isDeltaOnlyStoredSave'), '必须提供 delta-only 存档识别函数。');
assert(delta.includes('export function restoreSaveFromDelta'), '必须提供从基底与差量恢复完整存档的函数。');
assert(delta.includes('deltaPayload?: SaveNodeDeltaPayload'), '增量记录必须能携带真实 delta payload。');
assert(delta.includes("baseMode: SaveNodeBaseMode"), '节点记录必须记录当前节点的基底模式。');
assert(delta.includes('chatFromIndex') && delta.includes('chatTail'), '增量记录必须包含聊天尾部索引。');
assert(delta.includes('assetIds: string[]'), '增量记录必须包含图片资源引用列表。');
assert(delta.includes('counters: {'), '增量记录必须包含系统计数快照。');
assert(delta.includes('contentHash'), '增量记录必须包含轻量校验 hash。');
assert(delta.includes('CHAT_TAIL_LIMIT'), '增量记录必须限制聊天尾部长度。');
assert(delta.includes("chatHistoryMode: 'append' | 'replace'"), '真实 delta 必须区分聊天追加与替换模式。');
assert(delta.includes('jsonCompatibleEqual'), '大状态字段必须使用无字符串化的 JSON 兼容深比较。');
assert(!delta.includes('JSON.stringify(a)') && !delta.includes('JSON.stringify(b)'), '大状态字段比较不得构造完整 JSON 字符串。');

assert(dbService.includes("const SAVE_NODE_DELTAS_STORE = 'saveNodeDeltas'"), '必须定义 saveNodeDeltas 表。');
assert(dbService.includes('db.createObjectStore(SAVE_NODE_DELTAS_STORE'), 'DB 升级必须创建 saveNodeDeltas 表。');
assert(dbService.includes('findAutoDeltaBase(db, storedData)'), '保存前必须尝试寻找自动存档 delta 基底。');
assert(dbService.includes('const initialStoredData = deltaBase') && dbService.includes('buildDeltaOnlyStoredSave(storedData, deltaBase.baseSaveId)'), '命中 delta 基底时首次 add 必须直接写轻量占位。');
assert(!dbService.includes('loadAllDeltaRecords') && !dbService.includes('SAVE_NODE_DELTAS_STORE).getAll'), 'delta 维护不得一次性加载所有 payload。');
assert(dbService.includes('scanIndexedDeltaRecords') && dbService.includes('openCursor()'), 'delta 计数和引用检查必须逐条游标扫描。');
assert(dbService.includes("if (save.type !== 'auto') return null"), '只有自动存档可以走 delta-only，手动/备份必须保持完整检查点。');
assert(dbService.includes('MAX_DELTA_NODES_PER_CHECKPOINT'), '必须限制同一个 checkpoint 下连续 delta 节点数量。');
assert(dbService.includes('const summaries = await readSaveSummaries(db)'), '自动存档 delta 基底候选必须只读取 IndexedDB 摘要。');
assert(dbService.includes('loadDeltaBaseCandidateSave'), '自动存档 delta 基底读取必须经过统一帮助函数。');
assert(dbService.includes('return loadRawSave(db, id)'), 'delta 基底存档必须只从 IndexedDB 读取。');
assert(dbService.includes('resolveDeltaBaseSaveId(db, parentSave)'), '父节点是 delta-only 时必须追溯到最近 checkpoint 基底。');
assert(dbService.includes('countDeltasUsingBase(db, baseSaveId)'), '必须统计当前 checkpoint 已挂载的 delta 节点数量。');
assert(dbService.includes('deltaCount >= MAX_DELTA_NODES_PER_CHECKPOINT'), '达到上限后必须回退为完整 checkpoint。');
assert(dbService.includes('store.put(buildDeltaOnlyStoredSave(savedForDelta, deltaBase.baseSaveId))'), '自动存档命中基底时必须将 saves 表正文替换为 delta-only 占位。');
assert(dbService.includes("storageMode: 'delta'"), '写入 delta-only 时必须把节点记录标记为 delta 模式。');
assert(dbService.includes('restoreDeltaSaveIfNeeded(db, save)'), '读档必须先恢复 delta-only 存档。');
assert(dbService.includes('const rawBase = await loadDeltaBaseCandidateSave(db, baseSaveId)'), 'delta-only 恢复读取基底时必须经过 IndexedDB 帮助函数。');
assert(dbService.indexOf('const rawBase = await loadDeltaBaseCandidateSave(db, baseSaveId)') < dbService.indexOf('return restoreSaveFromDelta(base, save, delta)'), 'delta-only 恢复必须先解析基底存档，再合成 delta payload。');
assert(dbService.includes('restoreSaveFromDelta(base, save, delta)'), '读档恢复必须从基底与 delta payload 合成完整存档。');
assert(dbService.includes('getReferencedDeltaBaseIds'), '删除和轮转必须识别仍被 delta 引用的基底存档。');
assert(dbService.includes('cleanupUnreferencedHiddenSaves'), '被隐藏保留的基底不再被引用后必须支持清理。');
assert(dbService.includes('hiddenDeltaBase'), '隐藏基底必须有显式标记，避免清理时误删未摘要的旧存档。');
assert(dbService.includes('markSaveAsHiddenDeltaBase'), '被引用基底从列表移除时必须先标记为隐藏基底。');
assert(dbService.includes("saveRuntime?.hiddenDeltaBase"), '孤儿清理只能删除显式隐藏基底，不能删除普通无摘要存档。');
assert(dbService.includes('isHiddenDeltaBaseSave(save)'), '摘要补建必须跳过隐藏基底，避免隐藏依赖重新出现在存档列表。');
assert(dbService.includes('isSaveReferencedAsDeltaBase(db, id)'), '手动删除存档前必须检查是否仍被 delta 节点引用。');
assert(dbService.includes('if (!isReferencedBase)') && dbService.includes('markSaveAsHiddenDeltaBase(saveStore, summaryStore, id)'), '被引用的基底存档删除时只能从主列表移除，不能破坏后续 delta 读档。');
assert(dbService.includes('createHiddenDeltaBaseCatalogRecord'), '被引用基底隐藏后必须写入轻量目录标记，避免重复扫描完整存档。');
assert(dbService.includes('buildSaveNodeDeltaRecord(storedSave, normalizedId)'), '批量替换存档必须重建节点增量记录。');
assert(dbService.includes('buildSaveNodeDeltaRecord(storedSave, Number(storedSave.id) || 0)'), '旧档惰性迁移必须补写节点增量记录。');
assert(dbService.includes('deleteDeltaBySaveId'), '删除与轮转必须清理对应节点增量记录。');

assert(savePackage.includes("const TREE_NODE_DELTA_PATH = 'tree/node-delta.json'"), '导出包必须定义节点增量文件路径。');
assert(savePackage.includes('buildSaveNodeDeltaRecord(save, Number(save.id) || 0)'), '导出包必须包含当前节点增量记录。');
assert(savePackage.includes('TREE_NODE_DELTA_PATH'), '导出包 manifest 文件列表必须携带节点增量文件。');

console.log('[save-delta-regression] ok');
