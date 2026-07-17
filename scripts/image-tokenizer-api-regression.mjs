import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settings = fs.readFileSync('models/settings.ts', 'utf8');
const tokenizer = fs.readFileSync('services/ai/imagePromptTokenizer.ts', 'utf8');
const imageSettings = fs.readFileSync('components/features/Settings/ImageGenerationSettingsTab.tsx', 'utf8');
const settingsModal = fs.readFileSync('components/features/Settings/SettingsModal.tsx', 'utf8');
const albumWorkspace = fs.readFileSync('components/features/GameSystems/AlbumWorkspace.tsx', 'utf8');
const apiSettings = fs.readFileSync('components/features/Settings/ApiSettings.tsx', 'utf8');
const savePackage = fs.readFileSync('services/savePackage.ts', 'utf8');
const requireIndependent = fs.readFileSync('services/ai/requireIndependentApiConfig.ts', 'utf8');

// --- Schema & defaults ---
assert(settings.includes('export interface 文生图词组转化器API覆盖'), '必须定义文生图词组转化器 API 覆盖。');
assert(settings.includes('创建空文生图词组转化器API覆盖'), '必须提供文生图词组转化器 API 默认空配置。');
assert(settings.includes('词组转化器API: 文生图词组转化器API覆盖'), '文生图系统设置必须包含词组转化器 API。');
assert(settings.includes('词组转化器API: 创建空文生图词组转化器API覆盖()'), '默认文生图系统必须初始化词组转化器 API。');
assert(settings.includes('input.词组转化器API'), '归一化文生图系统必须兼容旧存档缺失词组转化器 API。');
assert(settings.includes('enablePromptTokenizer: false'), '默认必须关闭词组转化器（避免空 API + enable 的无效状态）。');
assert(settings.includes('enablePromptTokenizer: input.enablePromptTokenizer === true'), '归一化必须 opt-in 词组转化器（缺省/false 均为关闭）。');
assert(!settings.includes('enablePromptTokenizer: true'), '默认文生图系统不得再默认开启词组转化器。');
assert(!settings.includes('enablePromptTokenizer: input.enablePromptTokenizer !== false'), '归一化不得再把缺省视为开启词组转化器。');

// --- buildImagePromptTokenizerConfig contract ---
assert(tokenizer.includes('settings.文生图系统.词组转化器API'), '词组转化器服务必须读取独立 API 覆盖。');
assert(tokenizer.includes('if (!settings.文生图系统.enablePromptTokenizer) return null'), '关闭词组转化器时必须返回 null。');
assert(
  tokenizer.includes("if (!api.provider || !api.baseUrl.trim() || !api.apiKey.trim() || !api.model.trim())")
    || tokenizer.includes('!api.provider || !api.baseUrl.trim() || !api.apiKey.trim() || !api.model.trim()'),
  '启用但 API 不完整时必须返回 null，而不是抛错。',
);
assert(tokenizer.includes('return null'), 'buildImagePromptTokenizerConfig 在不可用时必须返回 null。');
assert(tokenizer.includes("requireIndependentApiConfig('文生图词组转化器'"), '完整配置时仍应走 requireIndependentApiConfig 构建。');
// Stale main-API fallback must not exist.
assert(!tokenizer.includes('override.baseUrl.trim() || mainConfig.baseUrl'), '词组转化器不得再回退主 API Base URL。');
assert(!tokenizer.includes('override.apiKey.trim() || mainConfig.apiKey'), '词组转化器不得再回退主 API Key。');
assert(!tokenizer.includes('override.model.trim() || mainConfig.model'), '词组转化器不得再回退主 API 模型。');
assert(requireIndependent.includes('独立 API 配置不完整'), 'requireIndependentApiConfig 必须在字段缺失时抛错（完整路径守卫）。');

// --- 一键套用 includes 词组转化器API (text model), not image-gen endpoints ---
assert(apiSettings.includes('handleApplyAuxModel'), 'API 页必须提供其他 API 模型一键套用功能。');
assert(
  apiSettings.includes('词组转化器API: { ...gameSettings.文生图系统.词组转化器API, ...auxApiPatch }'),
  '一键套用必须写入文生图系统.词组转化器API。',
);
assert(
  apiSettings.includes('文生图系统: {') && apiSettings.includes('词组转化器API:'),
  '一键套用必须在文生图系统下只补丁词组转化器 API。',
);
// Must not overwrite image generation endpoints via aux apply.
const applyStart = apiSettings.indexOf('const handleApplyAuxModel');
const applyEnd = apiSettings.indexOf('const handleFetchAuxModels');
assert(applyStart >= 0 && applyEnd > applyStart, '必须能定位 handleApplyAuxModel 函数体。');
const applyBody = apiSettings.slice(applyStart, applyEnd);
assert(!applyBody.includes('普通接口:'), '一键套用不得覆盖文生图普通接口。');
assert(!applyBody.includes('场景接口:'), '一键套用不得覆盖文生图场景接口。');
assert(!applyBody.includes('NSFW接口:'), '一键套用不得覆盖文生图 NSFW 接口。');
assert(applyBody.includes('词组转化器API:'), '一键套用函数体必须包含词组转化器API。');

// --- Album soft-skip when tokenizer unavailable ---
assert(
  albumWorkspace.includes('if (!tokenizerConfig)') && albumWorkspace.includes('return { prompt: input.prompt, negative: input.negative }'),
  'applyTokenizerIfAvailable 在 config 为 null 时必须保留本地提示词。',
);
assert(
  !albumWorkspace.includes("if (!tokenizerConfig) throw new Error('文生图词组转化器独立 API 未完整配置')"),
  'applyTokenizerIfAvailable 不得再因 config null 抛错阻断本地提示词。',
);
// Analysis features still need tokenizer and should surface a clear error.
assert(albumWorkspace.includes('resolveImageAnalysisConfig'), '相册分析路径必须保留 resolveImageAnalysisConfig。');
assert(
  albumWorkspace.includes('请先在文生图设置中启用词组转化器')
    || albumWorkspace.includes('文生图词组转化器独立 API 未完整配置'),
  '依赖转化器的分析功能必须给出明确错误提示。',
);

// --- Settings UI ---
assert(imageSettings.includes('词组转化器 API'), '文生图设置页必须显示词组转化器 API 面板。');
assert(imageSettings.includes('handleFetchTokenizerModels'), '文生图设置页必须支持获取词组转化器模型列表。');
assert(imageSettings.includes('patchTokenizerApi'), '文生图设置页必须能修改词组转化器 API。');
assert(albumWorkspace.includes('<ImageGenerationSettingsTab'), '相册工作台必须渲染文生图设置页。');
assert(!settingsModal.includes('<ImageGenerationSettingsTab'), '设置弹窗不应再渲染文生图设置页。');
assert(savePackage.includes('stripDevicePreferencesFromSave'), '导出存档包必须移除包含词组转化器密钥的整个设备设置平面。');

console.log('image tokenizer api regression ok');
