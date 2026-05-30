import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const savePackage = fs.readFileSync('services/savePackage.ts', 'utf8');
const saveModal = fs.readFileSync('components/features/SaveLoad/SaveLoadModal.tsx', 'utf8');
const storageManager = fs.readFileSync('components/features/Settings/StorageManager.tsx', 'utf8');

assert(savePackage.includes("app: 'KaiTuoYiShi'"), '存档包 manifest 必须标记应用名。');
assert(savePackage.includes("kind: 'save-package'"), '存档包 manifest 必须标记类型。');
assert(savePackage.includes('manifest.json'), '存档包必须包含 manifest.json。');
assert(savePackage.includes('save.json'), '存档包必须包含 save.json。');
assert(savePackage.includes('systems/story-weaving.json'), '剧情编织必须拆到独立系统文件。');
assert(savePackage.includes('systems/zhiku-runtime.json'), '智库运行时数据必须拆到独立系统文件。');
assert(savePackage.includes('systems/phone.json'), '手机系统必须拆到独立系统文件。');
assert(savePackage.includes('systems/npc.json'), 'NPC 档案必须拆到独立系统文件。');
assert(savePackage.includes('createZip') && savePackage.includes('readZip'), '必须提供 ZIP 打包和读取能力。');
assert(savePackage.includes('crc32'), 'ZIP 条目必须带 CRC 校验。');
assert(savePackage.includes('暂不支持压缩格式的存档包'), '第一阶段 ZIP 读取必须明确只支持 store 方法。');
assert(savePackage.includes('validatePackageManifest'), '导入存档包必须校验 manifest。');
assert(savePackage.includes('存档包版本过高，请更新客户端后再导入'), '导入存档包必须拒绝高版本包。');
assert(savePackage.includes('存档包清单包含非法路径'), '导入存档包必须拒绝非法路径。');
assert(savePackage.includes('存档包缺少清单文件'), '导入存档包必须校验清单文件存在。');
assert(savePackage.includes('PACKAGE_CORE_FILES'), '导入存档包必须校验核心文件。');
assert(savePackage.includes('SYSTEM_ENTRY_PATHS'), '系统文件路径必须集中维护，避免导入导出漂移。');
assert(savePackage.includes('sanitizeSaveForExport'), '存档包导出必须先走脱敏副本。');
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

assert(dbService.includes('exportSavePackage'), 'dbService 必须导出新存档包导出函数。');
assert(dbService.includes('importSaveFile'), 'dbService 必须导出统一导入函数。');
assert(dbService.includes('importSaveJson(await file.text())'), '统一导入函数必须保留旧 JSON 兼容。');
assert(dbService.includes('parseSavePackage(await file.arrayBuffer())'), '统一导入函数必须支持存档包。');
assert(dbService.includes('sanitizeSaveForExport(save), null, 2'), '旧 JSON 导出入口也必须复用脱敏逻辑。');
assert(dbService.includes('`.zip`') || dbService.includes('.zip`'), '导出文件后缀必须使用 .zip。');
assert(dbService.includes("name.endsWith('.ktysave')"), '导入函数必须保留旧 .ktysave 兼容。');

assert(saveModal.includes('exportSavePackage') && saveModal.includes('importSaveFile'), '游戏存档弹窗必须使用存档包导入导出。');
assert(saveModal.includes('.ktysave,.zip,.json'), '游戏存档弹窗必须同时接受新包和旧 JSON。');
assert(saveModal.includes('导入存档包'), '游戏存档弹窗 UI 文案必须更新为存档包。');
assert(saveModal.includes('导出存档包默认不包含 API Key'), '游戏存档弹窗必须提示导出包不会携带 API Key。');

assert(storageManager.includes('exportSavePackage') && storageManager.includes('importSaveFile'), '设置页存档管理必须使用存档包导入导出。');
assert(storageManager.includes('.ktysave,.zip,.json'), '设置页存档管理必须同时接受新包和旧 JSON。');
assert(storageManager.includes('导入存档包'), '设置页存档管理 UI 文案必须更新为存档包。');
assert(storageManager.includes('导出存档包默认不包含 API Key'), '设置页存档管理必须提示导出包不会携带 API Key。');

console.log('save package regression ok');
