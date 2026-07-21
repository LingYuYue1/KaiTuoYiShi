import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: ['services/ai/chatCompletionClient.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  logLevel: 'silent',
});
const source = bundled.outputFiles[0].text;
const client = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readBody(call) {
  return JSON.parse(String(call.init.body));
}

const originalFetch = globalThis.fetch;
try {
  {
    const calls = [];
    const config = {
      provider: 'openai_compatible',
      baseUrl: 'https://relay.example/v1',
      apiKey: 'test-key',
      model: 'DeepSeek-R1-0528',
      maxTokens: 2048,
    };
    const snapshot = structuredClone(config);
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ choices: [{ message: { content: '', reasoning_content: 'hidden' }, finish_reason: 'length' }] });
    };
    await assert.rejects(
      () => client.chatCompletionNonStream(config, { messages: [{ role: 'user', content: '继续剧情' }] }),
      /returned no visible content/,
    );
    assert.deepEqual(config, snapshot, 'diagnostics must not mutate saved config');
    assert.equal(calls.length, 1, 'DeepSeek diagnostics must not retry, inject prompts, or probe model lists');
    assert.equal(readBody(calls[0]).model, 'DeepSeek-R1-0528');
    assert.equal(readBody(calls[0]).max_tokens, 2048);
  }

  {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ choices: [{ message: { content: '官方正文' }, finish_reason: 'stop' }] });
    };
    const text = await client.chatCompletionNonStream({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'test-key',
      model: 'deepseek-reasoner',
    }, { messages: [{ role: 'user', content: 'ping' }] });
    assert.equal(text, '官方正文');
    assert.equal(calls.length, 1);
    assert.equal(readBody(calls[0]).model, 'deepseek-reasoner', 'configured DeepSeek model must remain authoritative');
  }

  {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] });
    };
    const text = await client.chatCompletionNonStream({
      provider: 'openai_compatible',
      baseUrl: 'https://ordinary.example/v1',
      apiKey: 'test-key',
      model: 'gpt-compatible',
    }, { messages: [{ role: 'user', content: 'ping' }] });
    assert.equal(text, '');
    assert.equal(calls, 1);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('[deepseek-recovery] exact-model diagnostics ok');
