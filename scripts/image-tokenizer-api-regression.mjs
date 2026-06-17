import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settings = fs.readFileSync('models/settings.ts', 'utf8');
const tokenizer = fs.readFileSync('services/ai/imagePromptTokenizer.ts', 'utf8');
const imageSettings = fs.readFileSync('components/features/Settings/ImageGenerationSettingsTab.tsx', 'utf8');
const settingsModal = fs.readFileSync('components/features/Settings/SettingsModal.tsx', 'utf8');
const albumPanel = fs.readFileSync('components/features/GameSystems/AlbumPanel.tsx', 'utf8');
const savePackage = fs.readFileSync('services/savePackage.ts', 'utf8');

assert(settings.includes('export interface 文生图词组转化器API覆盖'), '必须定义文生图词组转化器 API 覆盖。');
assert(settings.includes('创建空文生图词组转化器API覆盖'), '必须提供文生图词组转化器 API 默认空配置。');
assert(settings.includes('词组转化器API: 文生图词组转化器API覆盖'), '文生图系统设置必须包含词组转化器 API。');
assert(settings.includes('词组转化器API: 创建空文生图词组转化器API覆盖()'), '默认文生图系统必须初始化词组转化器 API。');
assert(settings.includes('input.词组转化器API'), '归一化文生图系统必须兼容旧存档缺失词组转化器 API。');

assert(tokenizer.includes('settings.文生图系统.词组转化器API'), '词组转化器服务必须读取独立 API 覆盖。');
assert(tokenizer.includes('override.baseUrl.trim() || mainConfig.baseUrl'), '词组转化器 API Base URL 留空必须回退主 API。');
assert(tokenizer.includes('override.apiKey.trim() || mainConfig.apiKey'), '词组转化器 API Key 留空必须回退主 API。');
assert(tokenizer.includes('override.model.trim() || mainConfig.model'), '词组转化器模型留空必须回退主 API。');

assert(imageSettings.includes('词组转化器 API'), '文生图设置页必须显示词组转化器 API 面板。');
assert(imageSettings.includes('handleFetchTokenizerModels'), '文生图设置页必须支持获取词组转化器模型列表。');
assert(imageSettings.includes('patchTokenizerApi'), '文生图设置页必须能修改词组转化器 API。');
assert(imageSettings.includes('apiSettings: API设置'), '文生图设置页必须接收主 API 设置用于回退。');
assert(albumPanel.includes('<ImageGenerationSettingsTab'), '相册工作台必须渲染文生图设置页。');
assert(albumPanel.includes('apiSettings={apiSettings}'), '相册工作台必须把主 API 设置传给文生图设置页。');
assert(!settingsModal.includes('<ImageGenerationSettingsTab'), '设置弹窗不应再渲染文生图设置页。');
assert(savePackage.includes('settings?.文生图系统?.词组转化器API'), '导出存档包必须清理文生图词组转化器 API Key。');

console.log('image tokenizer api regression ok');
