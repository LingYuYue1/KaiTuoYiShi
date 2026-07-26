import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadClient() {
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
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(chunks) {
  return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function createFetchQueue(responses, calls) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    assert(next, `unexpected fetch: ${String(url)}`);
    return typeof next === 'function' ? next(url, init) : next;
  };
}

function readBody(call) {
  return JSON.parse(String(call.init.body));
}

const client = await loadClient();
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
    const reasoningOnly = {
      choices: [{
        message: { content: '', reasoning_content: 'hidden reasoning' },
        finish_reason: 'length',
      }],
    };
    globalThis.fetch = createFetchQueue([
      jsonResponse(reasoningOnly),
      jsonResponse(reasoningOnly),
      jsonResponse({ data: [{ id: 'deepseek-v3' }, { id: 'deepseek-chat' }, { id: 'other-chat' }] }),
      jsonResponse({ choices: [{ message: { content: '最终正文' }, finish_reason: 'stop' }] }),
    ], calls);

    let summary;
    const text = await client.chatCompletionNonStream(config, {
      messages: [{ role: 'user', content: '继续剧情' }],
      maxTokens: 2048,
      onDeepSeekRecovery: (next) => { summary = next; },
    });

    assert.equal(text, '最终正文');
    assert.deepEqual(config, snapshot, 'recovery must not mutate saved config');
    assert.equal(calls.length, 4);
    assert.equal(readBody(calls[0]).model, 'DeepSeek-R1-0528');
    assert.equal(readBody(calls[1]).max_tokens, 8192);
    assert.match(readBody(calls[1]).messages.at(-1).content, /不得只返回 reasoning/);
    assert.match(calls[2].url, /\/models$/);
    assert.equal(readBody(calls[3]).model, 'deepseek-chat');
    assert.equal(summary.fallbackModel, 'deepseek-chat');
    assert.equal(summary.sawReasoning, true);
  }

  {
    const calls = [];
    const config = {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'test-key',
      model: 'deepseek-reasoner',
    };
    globalThis.fetch = createFetchQueue([
      jsonResponse({ choices: [{ message: { content: '官方正文' }, finish_reason: 'stop' }] }),
    ], calls);
    const text = await client.chatCompletionNonStream(config, {
      messages: [{ role: 'user', content: 'ping' }],
    });
    assert.equal(text, '官方正文');
    assert.equal(readBody(calls[0]).model, 'deepseek-chat');
    assert.equal(config.model, 'deepseek-reasoner');
  }

  {
    const calls = [];
    const reasoningChunk = {
      choices: [{ delta: { reasoning_content: 'hidden' }, finish_reason: 'length' }],
    };
    const finalChunk = {
      choices: [{ delta: { content: '流式正文' }, finish_reason: 'stop' }],
    };
    globalThis.fetch = createFetchQueue([
      sseResponse([reasoningChunk]),
      sseResponse([reasoningChunk]),
      jsonResponse({ data: [{ id: 'deepseek-chat' }] }),
      sseResponse([finalChunk]),
    ], calls);

    let doneCount = 0;
    let visible = '';
    const text = await client.chatCompletion({
      provider: 'openai_compatible',
      baseUrl: 'https://relay-stream.example/v1',
      apiKey: 'test-key',
      model: 'R1-0528',
    }, {
      messages: [{ role: 'user', content: '继续' }],
    }, {
      onDelta: (delta) => { visible += delta; },
      onDone: () => { doneCount += 1; },
      onError: (error) => { throw error; },
    });

    assert.equal(text, '流式正文');
    assert.equal(visible, '流式正文');
    assert.equal(doneCount, 1);
    assert.equal(calls.length, 4);
  }

  {
    const calls = [];
    globalThis.fetch = createFetchQueue([
      jsonResponse({ choices: [{ message: { content: '', reasoning_content: 'hidden' } }] }),
    ], calls);
    const text = await client.chatCompletionNonStream({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'test-key',
      model: 'deepseek-reasoner',
    }, {
      messages: [{ role: 'user', content: 'ping' }],
      deepSeekRecovery: 'disabled',
    });
    assert.equal(text, '');
    assert.equal(calls.length, 1);
    assert.equal(readBody(calls[0]).model, 'deepseek-reasoner');
  }

  {
    const calls = [];
    globalThis.fetch = createFetchQueue([
      jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }),
    ], calls);
    const text = await client.chatCompletionNonStream({
      provider: 'openai_compatible',
      baseUrl: 'https://ordinary.example/v1',
      apiKey: 'test-key',
      model: 'gpt-compatible',
    }, {
      messages: [{ role: 'user', content: 'ping' }],
    });
    assert.equal(text, '');
    assert.equal(calls.length, 1);
  }

  {
    const calls = [];
    globalThis.fetch = createFetchQueue([
      jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }),
    ], calls);
    const text = await client.chatCompletionNonStream({
      provider: 'openai_compatible',
      baseUrl: 'https://weak-r1.example/v1',
      apiKey: 'test-key',
      model: 'R1-0528',
    }, {
      messages: [{ role: 'user', content: 'ping' }],
    });
    assert.equal(text, '');
    assert.equal(calls.length, 1, 'weak R1 aliases need response-side reasoning evidence before recovery');
  }

  {
    const calls = [];
    const reasoningOnly = {
      choices: [{ message: { content: '', reasoning_content: 'hidden' }, finish_reason: 'length' }],
    };
    globalThis.fetch = createFetchQueue([
      jsonResponse(reasoningOnly),
      jsonResponse(reasoningOnly),
      jsonResponse({ data: [{ id: 'other-chat' }, { id: 'DeepSeek-R1-Distill' }] }),
    ], calls);
    await assert.rejects(
      () => client.chatCompletionNonStream({
        provider: 'deepseek',
        baseUrl: 'https://no-chat-candidate.example/v1',
        apiKey: 'test-key',
        model: 'DeepSeek-R1',
      }, {
        messages: [{ role: 'user', content: 'ping' }],
      }),
      (error) => error?.name === 'DeepSeekRecoveryExhaustedError' && error?.nonRetryable === true,
    );
    assert.equal(calls.length, 3);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('[deepseek-recovery] ok');
