import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const savePackage = fs.readFileSync('services/savePackage.ts', 'utf8');
const saveLoadWorkflow = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');
const saveModal = fs.readFileSync('components/features/SaveLoad/SaveLoadModal.tsx', 'utf8');
const storageManager = fs.readFileSync('components/features/Settings/StorageManager.tsx', 'utf8');

assert(savePackage.includes("app: 'KaiTuoYiShi'"), '存档包 manifest 必须标记应用名。');
assert(savePackage.includes("kind: 'save-package'"), '存档包 manifest 必须标记类型。');
assert(savePackage.includes("kind: 'save-package' | 'save-tree-package'"), '存档包 manifest 必须支持整棵存档树包类型。');
assert(savePackage.includes('manifest.json'), '存档包必须包含 manifest.json。');
assert(savePackage.includes('save.json'), '存档包必须包含 save.json。');
assert(savePackage.includes("const TREE_MANIFEST_PATH = 'tree/tree-manifest.json'"), '整树导出必须包含 tree-manifest。');
assert(savePackage.includes("const TREE_NODE_DIR = 'tree/nodes'"), '整树导出必须把节点写入 tree/nodes。');
assert(savePackage.includes('export async function buildSaveTreePackage'), '必须提供异步整棵存档树打包函数。');
assert(savePackage.includes('export async function parseSaveTreePackage'), '必须提供整棵存档树解析函数。');
assert(savePackage.includes("kind: 'save-tree-package'"), '整树包 manifest 必须写入 save-tree-package 类型。');
assert(savePackage.includes('parseSaveTreePackageFiles'), '树包解析必须读取 tree-manifest 和节点文件。');
assert(savePackage.includes("manifest.kind === 'save-tree-package'"), '单存档解析入口必须兼容树包并返回最新节点。');
assert(savePackage.includes('systems/story-weaving.json'), '剧情编织必须拆到独立系统文件。');
assert(savePackage.includes('systems/zhiku-runtime.json'), '智库运行时数据必须拆到独立系统文件。');
assert(savePackage.includes('systems/phone.json'), '手机系统必须拆到独立系统文件。');
assert(savePackage.includes('systems/npc.json'), 'NPC 档案必须拆到独立系统文件。');
assert(savePackage.includes('createZip') && savePackage.includes('readZip'), '必须提供 ZIP 打包和读取能力。');
assert(savePackage.includes('crc32'), 'ZIP 条目必须带 CRC 校验。');
assert(savePackage.includes('CompressionStream') && savePackage.includes('DecompressionStream'), 'ZIP 打包必须优先使用浏览器原生 deflate 压缩并支持解压。');
assert(savePackage.includes('deflateRawIfAvailable'), 'ZIP 写入必须在不支持压缩时自动回退 store 方法。');
assert(savePackage.includes('compression !== 0 && compression !== 8'), 'ZIP 读取必须同时兼容 store 和 deflate 方法。');
assert(savePackage.includes('当前浏览器不支持压缩存档包解压'), '压缩包读取失败时必须给出浏览器兼容提示。');
assert(savePackage.includes('validatePackageManifest'), '导入存档包必须校验 manifest。');
assert(savePackage.includes('存档包版本过高，请更新客户端后再导入'), '导入存档包必须拒绝高版本包。');
assert(savePackage.includes('存档包清单包含非法路径'), '导入存档包必须拒绝非法路径。');
assert(savePackage.includes('存档包缺少清单文件'), '导入存档包必须校验清单文件存在。');
assert(savePackage.includes('PACKAGE_CORE_FILES'), '导入存档包必须校验核心文件。');
assert(savePackage.includes("manifest.kind === 'save-tree-package' ? ['manifest.json', TREE_MANIFEST_PATH] : PACKAGE_CORE_FILES"), '树包和单包必须分别校验核心文件。');
assert(savePackage.includes('SYSTEM_ENTRY_PATHS'), '系统文件路径必须集中维护，避免导入导出漂移。');
assert(savePackage.includes('sanitizeSaveForExport'), '存档包导出必须先走脱敏副本。');
assert(savePackage.includes('stripRuntimeDebugFromChatHistory'), '存档包导出必须清理聊天调试上下文，避免玩家包被 debug 撑大。');
assert(savePackage.includes('delete clean.debugContext'), '存档包导出必须移除 chatHistory.debugContext。');
assert(!savePackage.includes('delete clean.preTurnSnapshot'), '存档包导出不得移除 chatHistory.preTurnSnapshot，否则导入后立即重roll无法完整回滚。');
assert(saveLoadWorkflow.includes('compactChatHistoryForLongSession'), '本地持久化存档必须复用长期会话聊天归一化。');
assert(saveLoadWorkflow.includes('compactVariableBatchHistory'), '本地持久化存档必须复用变量批次归一化。');
assert(!saveLoadWorkflow.includes('delete clean.preTurnSnapshot'), '本地持久化存档不得移除 chatHistory.preTurnSnapshot，否则读档后立即重roll无法完整回滚。');
assert(savePackage.includes('apiKeysRemoved: true'), '存档包 manifest 必须声明 API Key 已移除。');
assert(savePackage.includes('sanitized.apiSettings?.configs'), '主 API 配置列表的 apiKey 必须清理。');
assert(savePackage.includes('settings?.variableApi'), '变量 API 覆盖的 apiKey 必须清理。');
assert(savePackage.includes('settings?.新闻系统?.api'), '新闻 API 覆盖的 apiKey 必须清理。');
assert(savePackage.includes('settings?.手机系统?.api'), '手机 API 覆盖的 apiKey 必须清理。');
assert(savePackage.includes('settings?.智库系统?.api'), '智库 API 覆盖的 apiKey 必须清理。');
assert(savePackage.includes('settings?.剧情编织系统?.api'), '剧情编织 API 覆盖的 apiKey 必须清理。');
assert(savePackage.includes('settings?.记忆系统?.记忆总结API'), '记忆总结 API 覆盖的 apiKey 必须清理。');
assert(savePackage.includes('settings?.记忆系统?.忆庭召回API'), '忆庭召回 API 覆盖的 apiKey 必须清理。');
assert(savePackage.includes('settings?.记忆系统?.忆庭精炼API'), '忆庭精炼 API 覆盖的 apiKey 必须清理。');
assert(savePackage.includes('settings?.文生图系统?.普通接口'), '文生图普通接口 apiKey 必须清理。');
assert(savePackage.includes('settings?.文生图系统?.场景接口'), '文生图场景接口 apiKey 必须清理。');
assert(savePackage.includes('settings?.文生图系统?.NSFW接口'), '文生图 NSFW 接口 apiKey 必须清理。');
assert(savePackage.includes('settings?.文生图系统?.词组转化器API'), '文生图词组转化器 API apiKey 必须清理。');
assert(savePackage.includes('settings?.文生图系统?.正文生图?.parserApi'), '正文生图解析 API apiKey 必须清理。');
assert(savePackage.includes('settings?.文生图系统?.正文生图?.imageApi'), '正文生图生图 API apiKey 必须清理。');

assert(dbService.includes('exportSavePackage'), 'dbService 必须导出新存档包导出函数。');
assert(dbService.includes('export async function exportSavePackage'), '存档包导出必须是异步函数以等待压缩完成。');
assert(dbService.includes('exportSaveTreePackage'), 'dbService 必须导出整棵存档树包导出函数。');
assert(dbService.includes('export async function exportSaveTreePackage'), '整树包导出必须是异步函数以等待压缩完成。');
assert(dbService.includes('loadSaveTree'), 'dbService 必须能按 rootId 收集整棵存档树。');
assert(dbService.includes('importSaveFile'), 'dbService 必须导出统一导入函数。');
assert(dbService.includes('importSaveFileAsMany'), 'dbService 必须导出可导入多节点树包的入口。');
assert(dbService.includes('importSaveJson(await file.text())'), '统一导入函数必须保留旧 JSON 兼容。');
assert(dbService.includes('parseSavePackage(await file.arrayBuffer())'), '统一导入函数必须支持存档包。');
assert(dbService.includes('parseSaveTreePackage(await file.arrayBuffer())'), '多节点导入入口必须使用树包解析。');
assert(dbService.includes('remapImportedSaveTree'), '导入树包必须重映射 rootId/nodeId，避免和本地已有树冲突。');
assert(dbService.includes('nodeIdMap') && dbService.includes('parentNodeId: tree.parentNodeId ? nodeIdMap.get(tree.parentNodeId) : undefined'), '导入树包必须同步重映射父子节点关系。');
assert(
  dbService.includes('sanitizeSaveForExportAsync(save)') || dbService.includes('sanitizeSaveForExport(save), null, 2'),
  '旧 JSON 导出入口也必须复用脱敏逻辑。',
);
assert(dbService.includes('`.zip`') || dbService.includes('.zip`'), '导出文件后缀必须使用 .zip。');
assert(dbService.includes("name.endsWith('.ktysave')"), '导入函数必须保留旧 .ktysave 兼容。');

assert(saveModal.includes('exportSavePackage') && saveModal.includes('importSaveFileAsMany'), '游戏存档弹窗必须使用存档包导入导出。');
assert(saveModal.includes('exportSaveTreePackage') && saveModal.includes('loadSaveTree'), '游戏存档弹窗必须提供整树导出入口。');
assert(saveModal.includes('导出整树'), '游戏存档弹窗必须显示导出整树按钮。');
assert(saveModal.includes('.ktysave,.zip,.json'), '游戏存档弹窗必须同时接受新包和旧 JSON。');
assert(saveModal.includes('导入存档包'), '游戏存档弹窗 UI 文案必须更新为存档包。');

assert(storageManager.includes('exportSavePackage') && storageManager.includes('importSaveFileAsMany'), '设置页存档管理必须使用存档包导入导出。');
assert(storageManager.includes('exportSaveTreePackage') && storageManager.includes('loadSaveTree'), '设置页存档管理必须提供整树导出入口。');
assert(storageManager.includes('导出整树'), '设置页存档管理必须显示导出整树按钮。');
assert(storageManager.includes('.ktysave,.zip,.json'), '设置页存档管理必须同时接受新包和旧 JSON。');
assert(storageManager.includes('导入存档包'), '设置页存档管理 UI 文案必须更新为存档包。');
assert(storageManager.includes('导出存档包默认不包含 API Key'), '设置页存档管理必须提示导出包不会携带 API Key。');

console.log('save package regression ok');
