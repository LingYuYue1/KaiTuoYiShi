import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadModule(entryPoint) {
  const bundled = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  const source = bundled.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function geminiSseResponse(text) {
  const chunk = { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] };
  return new Response(`data: ${JSON.stringify(chunk)}\n\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function readChallengeFromBody(body) {
  const match = JSON.stringify(body).match(/KT-[0-9A-F]{8}/);
  assert(match, 'connection test request must contain a random challenge');
  return match[0];
}

const endpointPolicy = await loadModule('services/ai/geminiEndpointPolicy.ts');
const apiTools = await loadModule('services/ai/apiTools.ts');
const originalFetch = globalThis.fetch;

try {
  assert.equal(
    endpointPolicy.normalizeGeminiBaseUrl('https://generativelanguage.googleapis.com'),
    'https://generativelanguage.googleapis.com/v1beta',
  );
  assert.equal(
    endpointPolicy.normalizeGeminiBaseUrl('https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent'),
    'https://generativelanguage.googleapis.com/v1beta',
  );
  assert.equal(
    endpointPolicy.normalizeGeminiBaseUrl('https://generativelanguage.googleapis.com/v1beta/'),
    'https://generativelanguage.googleapis.com/v1beta',
  );
  assert.equal(
    endpointPolicy.normalizeGeminiBaseUrl('https://generativelanguage.googleapis.com.evil.example/gemini'),
    'https://generativelanguage.googleapis.com.evil.example/gemini',
  );
  assert.equal(
    endpointPolicy.normalizeGeminiBaseUrl('https://proxy.generativelanguage.googleapis.com/gemini'),
    'https://proxy.generativelanguage.googleapis.com/gemini',
  );
  assert.equal(
    endpointPolicy.normalizeGeminiBaseUrl('https://relay.example/gemini/openai/chat/completions'),
    'https://relay.example/gemini',
  );

  {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return jsonResponse({
        models: [{ name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }],
      });
    };
    const models = await apiTools.fetchModels({
      provider: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
    });
    assert.deepEqual(models, ['gemini-2.5-pro']);
    assert.equal(calls[0], 'https://generativelanguage.googleapis.com/v1beta/models?key=test-key');
  }

  {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      const challenge = readChallengeFromBody(JSON.parse(String(init.body)));
      return geminiSseResponse(challenge);
    };
    const result = await apiTools.testConnection({
      provider: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      model: 'gemini-2.5-pro',
    });
    assert.equal(result.ok, true);
    assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-pro:streamGenerateContent\?alt=sse$/);
  }

  {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      const challenge = readChallengeFromBody(JSON.parse(String(init.body)));
      return geminiSseResponse(challenge);
    };
    const result = await apiTools.testConnection({
      provider: 'gemini',
      baseUrl: 'https://relay.example/custom-gemini',
      apiKey: 'test-key',
      model: 'gemini-2.5-pro',
    });
    assert.equal(result.ok, true);
    assert.match(calls[0].url, /^https:\/\/relay\.example\/custom-gemini\/models\//);
    assert.doesNotMatch(calls[0].url, /\/v1beta\//);
  }

  async function runOpenAiConnectionTest(makeContent, config = {}) {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      const challenge = readChallengeFromBody(JSON.parse(String(init.body)));
      return jsonResponse({ choices: [{ message: { content: makeContent(challenge) }, finish_reason: 'stop' }] });
    };
    const result = await apiTools.testConnection({
      provider: 'openai_compatible',
      baseUrl: 'https://relay.example/v1',
      apiKey: 'test-key',
      model: 'test-model',
      ...config,
    });
    return { calls, result };
  }

  assert.equal((await runOpenAiConnectionTest((challenge) => challenge)).result.ok, true);

  for (const makeContent of [
    () => '',
    () => 'OK',
    () => '<html>success</html>',
    () => '{"ok":true}',
    (challenge) => `${challenge}\n连接成功`,
  ]) {
    const { result } = await runOpenAiConnectionTest(makeContent);
    assert.equal(result.ok, false);
    assert.match(result.detail, /未通过随机码校验/);
  }

  {
    const { calls, result } = await runOpenAiConnectionTest(() => '', {
      model: 'DeepSeek-R1-0528',
    });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 1, 'connection test must not trigger DeepSeek model recovery');
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('gemini endpoint and connection validation regression ok');
