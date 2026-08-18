import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settings = fs.readFileSync('models/settings.ts', 'utf8');
const client = fs.readFileSync('services/ai/chatCompletionClient.ts', 'utf8');
const apiTools = fs.readFileSync('services/ai/apiTools.ts', 'utf8');
const clineModels = fs.readFileSync('services/ai/clineModels.ts', 'utf8');
const apiSettings = fs.readFileSync('components/features/Settings/ApiSettings.tsx', 'utf8');
const proxyCore = fs.readFileSync('services/ai/clineProxyCore.ts', 'utf8');
const pagesFunction = fs.readFileSync('functions/api/cline.ts', 'utf8');
const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');

const settingTabs = [
  'components/features/Settings/ApiSettings.tsx',
  'components/features/Settings/MemorySystemSettings.tsx',
  'components/features/Settings/NewsSystemSettingsTab.tsx',
  'components/features/Settings/PhoneSystemSettingsTab.tsx',
  'components/features/Settings/StoryWeavingSettingsTab.tsx',
  'components/features/Settings/VariableUpdateSettings.tsx',
  'components/features/Settings/YitingSettingsTab.tsx',
  'components/features/Settings/ZhikuSettingsTab.tsx',
];

assert(settings.includes("'cline'"), 'AI provider union must include cline');
assert(apiSettings.includes("value: 'cline'"), 'main API settings must expose Cline');
assert(apiSettings.includes("https://api.cline.bot/api/v1"), 'Cline default Base URL must use api/v1');
assert(apiSettings.includes("defaultModel: 'cline-pass/kimi-k3'"), 'Cline default model must use a documented ClinePass model ID');
for (const file of settingTabs) {
  const text = fs.readFileSync(file, 'utf8');
  assert(text.includes("value: 'cline'"), `${file} must expose Cline`);
}

assert(client.includes("config.provider === 'cline'"), 'chat client must detect the Cline provider');
assert(client.includes('api.cline.bot'), 'chat client must auto-detect the Cline Base URL');
assert(client.includes("'/api/cline'"), 'Cline chat requests must use the same-origin proxy');
assert(client.includes('buildClineProxyBody'), 'Cline chat requests must use a dedicated proxy body');
assert(client.includes('function buildClineRequestBody'), 'Cline must have a narrow request body builder');
assert(client.includes("supportsAssistantPrefill: transport !== 'mimo' && transport !== 'cline'"), 'Cline must disable assistant prefill');
assert(apiTools.includes('CLINE_RECOMMENDED_MODELS'), 'Cline model listing must use the static recommendation catalog');
assert(!apiTools.includes('fetchClineModels'), 'Cline model listing must not call a nonexistent /models endpoint');
assert(!apiTools.includes("fetch('/api/cline'"), 'Cline model listing must not proxy a nonexistent /models endpoint');
const expectedClineModels = [
  'cline-pass/glm-5.2',
  'cline-pass/kimi-k3',
  'cline-pass/kimi-k2.7-code',
  'cline-pass/kimi-k2.6',
  'cline-pass/deepseek-v4-pro',
  'cline-pass/deepseek-v4-flash',
  'cline-pass/mimo-v2.5',
  'cline-pass/mimo-v2.5-pro',
  'cline-pass/minimax-m3',
  'cline-pass/qwen3.8-max',
  'cline-pass/qwen3.7-max',
  'cline-pass/qwen3.7-plus',
  'anthropic/claude-sonnet-4-6',
  'openai/gpt-4o',
  'google/gemini-2.5-pro',
  'deepseek/deepseek-chat',
  'minimax/minimax-m2.5',
];
for (const model of expectedClineModels) {
  assert(clineModels.includes(model), `Cline recommendation catalog must include ${model}`);
}

assert(proxyCore.includes('api.cline.bot'), 'Cline proxy must restrict the upstream host');
assert(proxyCore.includes('chat/completions'), 'Cline proxy must support chat completions');
assert(!proxyCore.includes("payload.kind === 'models'"), 'Cline proxy must not expose a nonexistent model-list endpoint');
assert(proxyCore.includes('access-control-allow-origin'), 'Cline proxy must expose CORS headers to the app');
assert(pagesFunction.includes('handleClineProxyRequest'), 'Cloudflare Cline function must reuse the shared proxy core');
assert(viteConfig.includes("server.middlewares.use('/api/cline'"), 'local Vite must expose /api/cline');

const runtimeOut = path.join('.tmp', 'cline-proxy-regression.mjs');
fs.mkdirSync(path.dirname(runtimeOut), { recursive: true });
await build({
  entryPoints: ['services/ai/clineProxyCore.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: runtimeOut,
  logLevel: 'silent',
});
const proxy = await import(`${pathToFileURL(path.resolve(runtimeOut)).href}?t=${Date.now()}`);
const originalFetch = globalThis.fetch;
let captured;
globalThis.fetch = async (url, init = {}) => {
  captured = { url: String(url), init };
  return new Response(JSON.stringify({
    id: 'cline-test',
    choices: [{ message: { role: 'assistant', content: 'ok' } }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
try {
  const response = await proxy.handleClineProxyRequest(new Request('http://localhost/api/cline', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'chat',
      baseUrl: 'https://api.cline.bot/api/v1/chat/completions',
      apiKey: 'cline-test-key',
      body: { model: 'anthropic/claude-sonnet-4-6', messages: [{ role: 'user', content: 'hi' }], stream: false },
    }),
  }));
  assert(response.status === 200, 'Cline proxy chat request should return upstream status');
  assert(captured.url === 'https://api.cline.bot/api/v1/chat/completions', 'Cline proxy must normalize the chat endpoint');
  assert(captured.init.method === 'POST', 'Cline proxy chat must use POST');
  assert(captured.init.headers.Authorization === 'Bearer cline-test-key', 'Cline proxy must use Bearer auth');
  assert(JSON.parse(captured.init.body).model === 'anthropic/claude-sonnet-4-6', 'Cline proxy must forward the request body');
  assert(response.headers.get('access-control-allow-origin') === '*', 'Cline proxy must return CORS headers');
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(runtimeOut, { force: true });
}

const bundledClient = await build({
  entryPoints: ['services/ai/chatCompletionClient.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  logLevel: 'silent',
});
const chatClient = await import(`data:text/javascript;base64,${Buffer.from(bundledClient.outputFiles[0].text).toString('base64')}`);
const bundledApiTools = await build({
  entryPoints: ['services/ai/apiTools.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  logLevel: 'silent',
});
const apiToolsRuntime = await import(`data:text/javascript;base64,${Buffer.from(bundledApiTools.outputFiles[0].text).toString('base64')}`);
const clineConfig = {
  provider: 'cline',
  baseUrl: 'https://api.cline.bot/api/v1',
  apiKey: 'cline-test-key',
  model: 'anthropic/claude-sonnet-4-6',
  maxTokens: 128,
  temperature: 0.4,
};
const legacyOpenAICompatibleClineConfig = { ...clineConfig, provider: 'openai_compatible' };

try {
  {
    globalThis.fetch = async () => {
      throw new Error('Cline static model catalog must not make a network request');
    };
    const models = await apiToolsRuntime.fetchModels({
      ...clineConfig,
      retryCount: 0,
    });
    assert(models.join('|') === expectedClineModels.join('|'), 'Cline model listing must return the static recommendation catalog without network access');
  }

  {
    let capturedConnectionBody;
    globalThis.fetch = async (_url, init = {}) => {
      capturedConnectionBody = JSON.parse(String(init.body));
      const userMessage = capturedConnectionBody.body.messages.find((message) => message.role === 'user')?.content ?? '';
      const challenge = userMessage.match(/KT-[0-9A-F]+/)?.[0] ?? '';
      const content = capturedConnectionBody.body.max_tokens >= 256 ? challenge : '';
      return new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await apiToolsRuntime.testConnection({ ...clineConfig, retryCount: 0 });
    assert(result.ok, 'Cline connection test must leave enough output budget for reasoning models to return the challenge');
    assert(capturedConnectionBody.body.max_tokens >= 256, 'Cline connection test must use at least 256 max_tokens');
  }

  {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        data: {
          choices: [{ message: { role: 'assistant', content: 'Cline 非流式正文' }, finish_reason: 'stop' }],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const text = await chatClient.chatCompletionNonStream(legacyOpenAICompatibleClineConfig, {
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert(text === 'Cline 非流式正文', 'Cline non-stream parser must accept a data envelope');
    assert(calls[0].url === '/api/cline', 'Cline non-stream request must use the same-origin proxy');
    const proxyBody = JSON.parse(String(calls[0].init.body));
    assert(proxyBody.body.stream === false, 'Cline non-stream request must disable streaming');
    assert(!('stream_options' in proxyBody.body), 'Cline request must not send stream_options');
  }

  {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return new Response([
        `data: ${JSON.stringify({ data: { choices: [{ delta: { content: 'Cline ' } }] } })}`,
        `data: ${JSON.stringify({ data: { choices: [{ delta: { content: '流式正文' }, finish_reason: 'stop' }] } })}`,
        'data: [DONE]',
        '',
      ].join('\n\n'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    };
    const deltas = [];
    const text = await chatClient.chatCompletion(clineConfig, {
      messages: [{ role: 'user', content: 'hi' }],
    }, {
      onDelta: (delta) => deltas.push(delta),
      onDone: () => {},
      onError: (error) => { throw error; },
    });
    assert(text === 'Cline 流式正文', 'Cline stream parser must accept a data envelope');
    assert(deltas.join('') === text, 'Cline stream deltas must contain the visible response');
    assert(calls[0].url === '/api/cline', 'Cline stream request must use the same-origin proxy');
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('cline api adaptation regression ok');
