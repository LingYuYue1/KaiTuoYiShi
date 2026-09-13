import { afterEach, describe, expect, it, vi } from 'vitest';
import type { API配置项 } from '@/models/settings';
import {
  assertClineBaseUrl,
  buildClineProxyBody,
  handleClineProxyRequest,
  isClineBaseUrl,
  normalizeClineBaseUrl,
} from '@/services/ai/clineProxyCore';
import {
  buildClineRequestBody,
  buildOpenAICompatibleTransport,
  formatOpenAICompatibleError,
} from '@/services/ai/chatCompletionOpenAICompat';

function clineConfig(overrides: Partial<API配置项> = {}): API配置项 {
  return {
    id: 'cline-1',
    name: 'Cline',
    provider: 'cline',
    baseUrl: 'https://api.cline.bot/api/v1',
    apiKey: 'sk-cline',
    model: 'cline-pass/kimi-k3',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function postPayload(payload: unknown): Request {
  return new Request('http://localhost/api/cline', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cline 基础地址归一化与代理白名单', () => {
  it('归一化官方主机、/api 与子路径', () => {
    expect(normalizeClineBaseUrl('https://api.cline.bot')).toBe('https://api.cline.bot/api/v1');
    expect(normalizeClineBaseUrl('https://api.cline.bot/api')).toBe('https://api.cline.bot/api/v1');
    expect(normalizeClineBaseUrl('https://api.cline.bot/api/v1/chat/completions')).toBe('https://api.cline.bot/api/v1');
    expect(normalizeClineBaseUrl('https://api.cline.bot/api/v1/?debug=1')).toBe('https://api.cline.bot/api/v1');
  });

  it('isClineBaseUrl 只认官方主机，assert 拒绝其它上游', () => {
    expect(isClineBaseUrl('https://api.cline.bot/api/v1')).toBe(true);
    expect(isClineBaseUrl('https://example.com/v1')).toBe(false);
    expect(assertClineBaseUrl('https://api.cline.bot/api/v1')).toBe('https://api.cline.bot/api/v1');
    expect(() => assertClineBaseUrl('https://example.com/v1')).toThrow('仅允许代理 Cline API');
  });

  it('代理体携带归一化 baseUrl、API Key 与请求体', () => {
    const parsed = JSON.parse(buildClineProxyBody(
      { baseUrl: 'https://api.cline.bot/', apiKey: 'sk' },
      { model: 'm' },
    )) as unknown;
    expect(parsed).toStrictEqual({
      baseUrl: 'https://api.cline.bot/api/v1',
      apiKey: 'sk',
      body: { model: 'm' },
    });
  });
});

describe('Cline 同源代理处理', () => {
  it('转发到官方 chat/completions 并携带 Bearer Key', async () => {
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockImplementation(() => Promise.resolve(
      new Response('data: {"choices":[]}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    ));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleClineProxyRequest(postPayload({
      baseUrl: 'https://api.cline.bot/api/v1',
      apiKey: 'sk-secret',
      body: { model: 'cline-pass/kimi-k3', stream: true },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.cline.bot/api/v1/chat/completions');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-secret');
    expect(JSON.parse(init?.body as string)).toStrictEqual({ model: 'cline-pass/kimi-k3', stream: true });
  });

  it('拒绝非白名单上游，不发请求', async () => {
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleClineProxyRequest(postPayload({
      baseUrl: 'https://evil.example.com/v1',
      apiKey: 'sk',
      body: {},
    }));

    expect(response.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('非法 JSON 与缺字段返回 400', async () => {
    expect((await handleClineProxyRequest(postPayload('{oops'))).status).toBe(400);
    expect((await handleClineProxyRequest(postPayload({ baseUrl: 'https://api.cline.bot/api/v1' }))).status).toBe(400);
  });
});

describe('Cline 传输路由与请求体', () => {
  it('走 /api/cline 代理且不携带 Authorization（由代理注入）', () => {
    const transport = buildOpenAICompatibleTransport(
      clineConfig(),
      [{ role: 'user', content: 'hi' }],
      { messages: [] },
      false,
    );
    expect(transport.url).toBe('/api/cline');
    expect(transport.upstreamUrl).toBe('https://api.cline.bot/api/v1/chat/completions');
    expect((transport.headers as Record<string, string>).Authorization).toBeUndefined();
    const envelope = JSON.parse(transport.body) as { baseUrl: string; apiKey: string; body: { messages: unknown } };
    expect(envelope.baseUrl).toBe('https://api.cline.bot/api/v1');
    expect(envelope.apiKey).toBe('sk-cline');
    expect(envelope.body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('精简请求体不透传 stream_options / 采样 / max_context 扩展字段', () => {
    const body = buildClineRequestBody(
      clineConfig({ maxTokens: 512, temperature: 0.3 }),
      [{ role: 'user', content: 'hi' }],
      {
        messages: [],
        maxTokens: 512,
        maxContext: 64000,
        frequencyPenalty: 0.5,
        onUsage: vi.fn(),
      },
      true,
    );
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'stream', 'temperature']);
    expect(body).toMatchObject({ model: 'cline-pass/kimi-k3', stream: true, temperature: 0.3, max_tokens: 512 });
  });

  it('错误提示区分 401 / 402 / 404', () => {
    expect(formatOpenAICompatibleError(clineConfig(), 401, '').message).toContain('provider/model');
    expect(formatOpenAICompatibleError(clineConfig(), 402, '').message).toContain('余额不足');
    expect(formatOpenAICompatibleError(clineConfig(), 404, '').message).toContain('api.cline.bot/api/v1');
  });
});
