import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settings = fs.readFileSync('models/settings.ts', 'utf8');
const client = fs.readFileSync('services/ai/chatCompletionClient.ts', 'utf8');
const apiTools = fs.readFileSync('services/ai/apiTools.ts', 'utf8');
const apiSettings = fs.readFileSync('components/features/Settings/ApiSettings.tsx', 'utf8');
const arkProxy = fs.readFileSync('functions/api/ark.ts', 'utf8');
const arkProxyCore = fs.readFileSync('services/ai/arkProxyCore.ts', 'utf8');
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

assert(settings.includes("'ark'"), 'AI 提供商必须包含独立 ark。');
assert(apiSettings.includes("value: 'ark'"), '主 API 设置必须提供火山方舟 provider。');
assert(apiSettings.includes('火山方舟'), '主 API 设置必须显示火山方舟名称。');
assert(apiSettings.includes("defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3'"), '火山方舟默认 Base URL 必须是官方 api/v3。');
assert(apiSettings.includes("defaultModel: 'doubao-seed-1-6'"), '火山方舟必须提供默认模型占位。');

for (const file of settingTabs) {
  const text = fs.readFileSync(file, 'utf8');
  assert(text.includes("value: 'ark'") && text.includes('火山方舟'), `${file} 必须提供火山方舟选项。`);
}

assert(client.includes("config.provider === 'ark'"), '聊天客户端必须把火山方舟作为独立 provider 检测。');
assert(client.includes("return 'ark'"), '火山方舟检测不能落回 OpenAI 兼容。');
assert(client.includes("from './arkProxyCore'"), '聊天客户端必须复用火山方舟代理工具。');
assert(client.includes('normalizeArkBaseUrl'), '聊天客户端必须归一化火山方舟 Base URL。');
assert(client.includes('buildArkProxyBody'), '聊天客户端必须构造火山方舟代理请求体。');
assert(/isArkConfig\(config\)\s*\?\s*'\/api\/ark'/.test(client), '流式火山方舟请求必须走同源 /api/ark 代理。');
assert(/isArkConfig\(deepSeekPayload\.config\)\s*\?\s*'\/api\/ark'/.test(client), '非流式火山方舟请求必须走同源 /api/ark 代理。');
assert(client.includes('火山方舟 API Error'), '火山方舟失败时必须提供专用错误诊断。');
assert(client.includes('ModelNotOpen') || client.includes('modelnotopen'), '火山方舟 ModelNotOpen 必须提示去控制台开通模型服务。');
assert(!client.includes("if (provider === 'ark') {\n    return streamOpenAICompatible"), '火山方舟不得作为普通 OpenAI 兼容直连分支。');

assert(apiTools.includes("config.provider === 'ark'"), '模型列表必须支持火山方舟 provider。');
assert(apiTools.includes('fetchArkModels(baseRaw, apiKey)'), '火山方舟模型列表必须使用专用函数。');
assert(apiTools.includes("fetch('/api/ark'"), '火山方舟模型列表必须走同源代理，避免浏览器 CORS Failed to fetch。');
assert(apiTools.includes('火山方舟模型列表'), '火山方舟模型列表失败必须记录专用来源。');

assert(arkProxy.includes('handleArkProxyRequest'), 'Cloudflare 火山方舟代理必须复用共享代理核心。');
assert(arkProxyCore.includes('ark.cn-beijing.volces.com/api/v3'), '火山方舟代理必须限制只能转发到官方 api/v3。');
assert(arkProxyCore.includes('export function normalizeArkBaseUrl'), '火山方舟 Base URL 归一化函数必须可复用。');
assert(arkProxyCore.includes('export function isArkBaseUrl'), '火山方舟 Base URL 检测函数必须可复用。');
assert(arkProxyCore.includes("payload.kind === 'models'"), '火山方舟代理必须支持模型列表请求。');
assert(arkProxyCore.includes('chat/completions'), '火山方舟代理必须支持 OpenAI-compatible chat completions。');
assert(viteConfig.includes("server.middlewares.use('/api/ark'"), '本地 Vite 开发模式必须支持 /api/ark 代理。');
assert(viteConfig.includes('handleArkProxyRequest'), '本地 Vite 火山方舟代理必须复用同一套代理核心。');

console.log('volcengine ark api regression ok');
