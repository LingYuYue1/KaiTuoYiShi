import fs from 'node:fs';

const appSource = fs.readFileSync('App.tsx', 'utf8');
const saveLoadSource = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');
const zhikuPresetSource = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const savePackageSource = fs.readFileSync('services/savePackage.ts', 'utf8');
const useGameSource = fs.readFileSync('hooks/useGame.ts', 'utf8');
const sendWorkflowSource = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const allSources = [
  appSource,
  saveLoadSource,
  useGameSource,
  sendWorkflowSource,
  fs.readFileSync('hooks/useGameState.ts', 'utf8'),
].join('\n');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!allSources.includes('phoneSystemState'), '手机运行时数据不得写入或读取全局 phoneSystemState，避免多存档聊天/通讯录互串。');
assert(!saveLoadSource.includes('mergePhoneSystems'), '读档不得把目标存档手机与外部手机状态合并。');
assert(saveLoadSource.includes('state.set手机(归一化手机系统(save.手机))'), '读档手机状态必须只来自目标存档本身。');
assert(
  saveLoadSource.includes('loadBundledZhikuCatalogWithFallback') &&
    saveLoadSource.includes('composeZhikuSystem') &&
    saveLoadSource.includes('save.智库') &&
    zhikuPresetSource.includes('mergeZhikuRuntimeUnlockOverrides') &&
    zhikuPresetSource.includes('!entry.builtin && ZHIKU_CUSTOM_ID_PATTERN.test(entry.id)') &&
    saveLoadSource.includes('state.set智库(nextZhiku)'),
  '读档智库必须来自当前内置预设与目标存档自制条目/运行时覆盖，不能沿用当前运行态。',
);
assert(!saveLoadSource.includes('save.智库 ?? state.智库'), '读档不得用当前运行态智库兜底。');
assert(saveLoadSource.includes('state.setNPC(归一化NPC记录列表(save.NPC'), '读档 NPC 必须来自目标存档或空列表兜底。');
assert(saveLoadSource.includes('state.set新闻(归一化新闻列表(save.新闻))'), '读档新闻必须来自目标存档或空列表兜底。');
assert(saveLoadSource.includes('compactVariableBatchHistory(save.variableBatches ?? [])'), '读档变量批次必须来自目标存档、空列表兜底并执行长期会话归一化。');
assert(saveLoadSource.includes('state.setQueueTasks(save.queueTasks ?? [])'), '读档后台队列必须来自目标存档或空列表兜底。');
assert(saveLoadSource.includes('normalizeSavedGameSettings(save.gameSettings)'), '读档必须允许旧存档缺失 gameSettings，并用默认游戏设置兜底。');
assert(saveLoadSource.includes('if (!value || typeof value !== \'object\' || Array.isArray(value)) return defaults'), '旧存档 gameSettings 为空或异常时必须回落默认设置。');
assert(saveLoadSource.includes('normalizeSaveChatHistory(save.chatHistory)'), '读档必须允许旧存档缺失 chatHistory，并用空数组兜底。');
assert(saveLoadSource.includes('normalizeSavedTraveler(save.旅人'), '读档必须归一化旧旅人字段，补齐战技、命途列表等新增字段。');
assert(saveLoadSource.includes('确保命途列表'), '旧旅人只有主命途时必须恢复命途列表。');
assert(appSource.includes('onPhoneChange={state.set手机}'), '手机 UI 修改只能进入当前运行态，不能写全局手机备份。');

assert(saveLoadSource.includes('apiSettings: 创建空API设置()'), '新建存档不得把本机主 API 配置绑定进存档。');
assert(saveLoadSource.includes('buildSaveGameSettingsSnapshot'), '保存存档前必须清理 gameSettings 中的本机 API 覆盖项。');
assert(saveLoadSource.includes('preserveLocalApiGameSettings(nextGameSettingsFromSave, state.gameSettings)'), '读档必须保留本机 API 覆盖项。');
assert(!saveLoadSource.includes('state.setApiSettings(save.apiSettings)'), '读档不得用存档里的 apiSettings 覆盖本机 API 设置。');
assert(!saveLoadSource.includes('state.setCurrentTheme(save.theme)'), '读档不得用存档主题覆盖本机主题偏好。');
assert(saveLoadSource.includes('variableApi: localSettings.variableApi'), '读档必须保留本机变量模型 API 覆盖。');
assert(saveLoadSource.includes('enableClaudeMode: localSettings.enableClaudeMode === true'), '读档必须保留本机 Claude 专用模式。');
assert(saveLoadSource.includes('api: local.新闻系统.api'), '读档必须保留本机新闻系统 API 覆盖。');
assert(saveLoadSource.includes('api: local.手机系统.api'), '读档必须保留本机手机系统 API 覆盖。');
assert(saveLoadSource.includes('api: local.智库系统.api'), '读档必须保留本机智库系统 API 覆盖。');
assert(saveLoadSource.includes('api: local.剧情编织系统.api'), '读档必须保留本机剧情编织 API 覆盖。');
assert(saveLoadSource.includes('记忆总结API: local.记忆系统.记忆总结API'), '读档必须保留本机记忆总结 API 覆盖。');
assert(saveLoadSource.includes('忆庭召回API: local.记忆系统.忆庭召回API'), '读档必须保留本机忆庭召回 API 覆盖。');
assert(saveLoadSource.includes('忆庭精炼API: local.记忆系统.忆庭精炼API'), '读档必须保留本机忆庭精炼 API 覆盖。');
assert(saveLoadSource.includes('普通接口: local.文生图系统.普通接口'), '读档必须保留本机文生图普通接口。');
assert(saveLoadSource.includes('场景接口: local.文生图系统.场景接口'), '读档必须保留本机文生图场景接口。');
assert(saveLoadSource.includes('NSFW接口: local.文生图系统.NSFW接口'), '读档必须保留本机文生图 NSFW 接口。');
assert(saveLoadSource.includes('词组转化器API: local.文生图系统.词组转化器API'), '读档必须保留本机文生图词组转化器 API。');
assert(saveLoadSource.includes('parserApi: local.文生图系统.正文生图.parserApi'), '读档必须保留本机正文生图解析 API。');
assert(saveLoadSource.includes('imageApi: local.文生图系统.正文生图.imageApi'), '读档必须保留本机正文生图生图 API。');
assert(savePackageSource.includes('sanitized.apiSettings = 创建空API设置()'), '导出旧存档时也必须移除嵌入的主 API 配置。');
assert(savePackageSource.includes('stripEmbeddedApiSettings'), '存档包导出必须统一清理嵌入 API 配置。');

console.log('save isolation regression ok');
