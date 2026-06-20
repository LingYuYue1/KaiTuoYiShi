import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settings = fs.readFileSync('models/settings.ts', 'utf8');
const client = fs.readFileSync('services/ai/chatCompletionClient.ts', 'utf8');
const apiTools = fs.readFileSync('services/ai/apiTools.ts', 'utf8');
const apiSettings = fs.readFileSync('components/features/Settings/ApiSettings.tsx', 'utf8');
const qianfanProxy = fs.readFileSync('functions/api/qianfan.ts', 'utf8');
const qianfanProxyCore = fs.readFileSync('services/ai/qianfanProxyCore.ts', 'utf8');
const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');

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

assert(!client.includes("if (provider === 'baidu')"), '百度千帆不应新增独立请求分支，应走 OpenAI 兼容。');
assert(client.includes('/chat/completions'), 'OpenAI 兼容路径必须继续请求 /chat/completions。');
assert(client.includes('Authorization: `Bearer ${config.apiKey}`'), 'OpenAI 兼容路径必须继续使用 Bearer API Key。');
assert(client.includes('buildOpenAICompatibleChatUrl'), 'OpenAI 兼容请求必须兼容玩家填写完整 /chat/completions 地址。');
assert(client.includes("if (/\\/chat\\/completions$/i.test(base)) return base;"), '完整 /chat/completions Base URL 不得重复拼接。');
assert(client.includes('normalizeOpenAICompatibleModel'), '百度千帆必须在 OpenAI 兼容请求前归一化特殊模型名。');
assert(client.includes("return 'glm-5.1'"), '百度千帆必须把玩家常填的 glm5.1 / GLM5.1 优先归一为小写模型 ID glm-5.1。');
assert(client.includes('formatOpenAICompatibleError'), '百度千帆失败时必须提供专用错误诊断，避免玩家只看到反复重试。');
assert(client.includes('百度千帆 API Error'), '百度千帆错误提示必须明确标出供应商。');
assert(
  /isBaiduQianfanConfig\(config\)\s*\?\s*'\/api\/qianfan'/.test(client),
  '百度千帆聊天请求必须走同源 /api/qianfan 代理，避免浏览器 CORS Failed to fetch。',
);
assert(client.includes('buildQianfanProxyBody'), '百度千帆聊天请求必须构造代理请求体。');
assert(apiTools.includes("config.provider === 'baidu'"), '百度千帆模型列表必须有独立路径归一化，避免误请求 /v1/models。');
assert(apiTools.includes('fetchBaiduQianfanModels(baseRaw, apiKey)'), '百度千帆必须使用专用模型列表函数。');
assert(apiTools.includes("fetch('/api/qianfan'"), '百度千帆模型列表也必须走同源代理，避免 CORS。');
assert(apiTools.includes("`${root}/v2/models`"), '百度千帆模型列表必须优先请求 /v2/models。');
assert(apiTools.includes("replace(/\\/v[12](?:\\/.*)?$/i, '')"), '百度千帆模型列表必须兼容玩家填写 /v1、/v2、/v2/coding 或完整接口地址。');
assert(apiSettings.includes('/v2/coding'), '百度千帆 Base URL 提示必须说明 Coding Plan 可填写 /v2/coding。');
assert(qianfanProxy.includes('handleQianfanProxyRequest'), 'Cloudflare 百度千帆代理必须复用共享代理核心。');
assert(qianfanProxyCore.includes('qianfan.baidubce.com'), '百度千帆代理必须限制只能转发到 qianfan.baidubce.com。');
assert(qianfanProxyCore.includes('buildQianfanChatUrl'), '百度千帆代理必须支持 chat/completions 转发。');
assert(qianfanProxyCore.includes('buildQianfanModelsUrl'), '百度千帆代理必须支持 models 转发。');
assert(qianfanProxyCore.includes('buildQianfanFallbackChatUrls'), '百度千帆代理必须集中处理候选路径。');
assert(qianfanProxyCore.includes("if (/\\/v2\\/coding(?:\\/chat\\/completions)?$/i.test(base)) return [];"), 'Coding Plan Key 必须留在 /v2/coding，不得回退 /v2。');
assert(qianfanProxyCore.includes('coding_plan_api_key_not_allowed'), '当独立 API 误填 /v2 且使用 Coding Plan Key 时，代理必须识别百度错误码。');
assert(qianfanProxyCore.includes('buildQianfanCodingPlanChatUrl'), '当 /v2 返回 Coding Plan Key 错误时，代理必须补试 /v2/coding。');
assert(qianfanProxyCore.includes('upstream.status !== 404'), '百度千帆代理必须只在上游 404 时继续尝试路径/模型别名回退。');
assert(qianfanProxyCore.includes('buildQianfanChatPayloadVariants'), '百度千帆代理必须支持 GLM-5.1 大小写模型别名兜底。');
assert(qianfanProxyCore.includes("model: 'GLM-5.1'"), '百度千帆代理必须在小写 glm-5.1 404 后尝试大写 GLM-5.1。');
assert(qianfanProxyCore.includes('attempts.push'), '百度千帆代理必须记录 404 候选路径和模型尝试明细。');
assert(qianfanProxyCore.includes('均返回 404'), '百度千帆代理必须在所有候选都 404 时返回明确诊断。');
assert(viteConfig.includes("server.middlewares.use('/api/qianfan'"), '本地 Vite 开发模式必须支持 /api/qianfan 代理。');
assert(viteConfig.includes('handleQianfanProxyRequest'), '本地 Vite 代理必须复用同一套千帆代理核心。');

console.log('baidu qianfan regression ok');
