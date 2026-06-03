import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settings = fs.readFileSync('models/settings.ts', 'utf8');
const client = fs.readFileSync('services/ai/chatCompletionClient.ts', 'utf8');
const apiTools = fs.readFileSync('services/ai/apiTools.ts', 'utf8');
const apiSettings = fs.readFileSync('components/features/Settings/ApiSettings.tsx', 'utf8');

const settingTabs = [
  'components/features/Settings/ApiSettings.tsx',
  'components/features/Settings/ImageGenerationSettingsTab.tsx',
  'components/features/Settings/MemorySystemSettings.tsx',
  'components/features/Settings/NewsSystemSettingsTab.tsx',
  'components/features/Settings/PhoneSystemSettingsTab.tsx',
  'components/features/Settings/StoryWeavingSettingsTab.tsx',
  'components/features/Settings/VariableUpdateSettings.tsx',
  'components/features/Settings/YitingSettingsTab.tsx',
  'components/features/Settings/ZhikuSettingsTab.tsx',
];

assert(settings.includes("'baidu'"), 'AI 提供商必须包含 baidu。');
assert(apiSettings.includes("value: 'baidu'"), '主 API 设置必须提供百度千帆 provider。');
assert(apiSettings.includes('百度千帆'), '主 API 设置必须显示百度千帆中文名称。');
assert(apiSettings.includes("defaultBaseUrl: 'https://qianfan.baidubce.com/v2'"), '百度千帆默认 Base URL 必须是千帆 v2。');
assert(apiSettings.includes("defaultModel: 'ernie-4.5-turbo-128k'"), '百度千帆必须提供默认模型。');

for (const file of settingTabs) {
  const text = fs.readFileSync(file, 'utf8');
  assert(text.includes("value: 'baidu'") && text.includes('百度千帆'), `${file} 必须提供百度千帆选项。`);
}

assert(!client.includes("provider === 'baidu'"), '百度千帆不应新增独立请求分支，应走 OpenAI 兼容。');
assert(client.includes('/chat/completions'), 'OpenAI 兼容路径必须继续请求 /chat/completions。');
assert(client.includes('Authorization: `Bearer ${config.apiKey}`'), 'OpenAI 兼容路径必须继续使用 Bearer API Key。');
assert(client.includes('buildOpenAICompatibleChatUrl'), 'OpenAI 兼容请求必须兼容玩家填写完整 /chat/completions 地址。');
assert(client.includes("if (/\\/chat\\/completions$/i.test(base)) return base;"), '完整 /chat/completions Base URL 不得重复拼接。');
assert(apiTools.includes("config.provider === 'baidu'"), '百度千帆模型列表必须有独立路径归一化，避免误请求 /v1/models。');
assert(apiTools.includes('fetchBaiduQianfanModels(baseRaw, apiKey)'), '百度千帆必须使用专用模型列表函数。');
assert(apiTools.includes("`${root}/v2/models`"), '百度千帆模型列表必须优先请求 /v2/models。');
assert(apiTools.includes("replace(/\\/v[12](?:\\/.*)?$/i, '')"), '百度千帆模型列表必须兼容玩家填写 /v1、/v2、/v2/coding 或完整接口地址。');
assert(apiSettings.includes('/v2/coding'), '百度千帆 Base URL 提示必须说明 Coding Plan 可填写 /v2/coding。');

console.log('baidu qianfan regression ok');
