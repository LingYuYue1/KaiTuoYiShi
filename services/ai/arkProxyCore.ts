type ArkProxyBody = {
  baseUrl?: string;
  apiKey?: string;
  kind?: 'chat' | 'models';
  body?: unknown;
};

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeArkBaseUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '');
  base = base.split('?')[0] ?? base;
  base = base
    .replace(/\/api\/v3\/chat\/completions$/i, '/api/v3')
    .replace(/\/api\/v3\/models$/i, '/api/v3')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models$/i, '');
  if (/^https:\/\/ark\.cn-beijing\.volces\.com$/i.test(base)) return `${base}/api/v3`;
  return base;
}

export function isArkBaseUrl(baseUrl: string): boolean {
  return /^https:\/\/ark\.cn-beijing\.volces\.com(?:\/|$)/i.test(baseUrl.trim());
}

export function assertArkBaseUrl(baseUrl: string): string {
  const base = normalizeArkBaseUrl(baseUrl);
  if (!/^https:\/\/ark\.cn-beijing\.volces\.com\/api\/v3$/i.test(base)) {
    throw new Error('仅允许代理火山方舟 OpenAI 兼容接口：https://ark.cn-beijing.volces.com/api/v3。');
  }
  return base;
}

export function buildArkProxyBody(config: { baseUrl: string; apiKey: string }, body: Record<string, unknown>): string {
  return JSON.stringify({
    kind: 'chat',
    baseUrl: normalizeArkBaseUrl(config.baseUrl),
    apiKey: config.apiKey,
    body,
  });
}

function buildArkUpstreamUrl(payload: ArkProxyBody): string {
  const base = assertArkBaseUrl(readText(payload.baseUrl));
  if (payload.kind === 'models') return `${base}/models`;
  return `${base}/chat/completions`;
}

function proxyHeaders(upstream?: Response): Headers {
  const headers = new Headers();
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('cache-control', 'no-store');
  headers.set('content-type', upstream?.headers.get('content-type') || 'application/json; charset=utf-8');
  return headers;
}

export async function handleArkProxyRequest(request: Request): Promise<Response> {
  let payload: ArkProxyBody;
  try {
    payload = await request.json() as ArkProxyBody;
  } catch {
    return new Response(JSON.stringify({ error: '请求体不是有效 JSON。' }), {
      status: 400,
      headers: proxyHeaders(),
    });
  }

  const baseUrl = readText(payload.baseUrl);
  const apiKey = readText(payload.apiKey);
  if (!baseUrl || !apiKey) {
    return new Response(JSON.stringify({ error: '缺少火山方舟 Base URL 或 API Key。' }), {
      status: 400,
      headers: proxyHeaders(),
    });
  }

  try {
    const upstreamUrl = buildArkUpstreamUrl(payload);
    const upstream = await fetch(upstreamUrl, {
      method: payload.kind === 'models' ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: payload.kind === 'models' ? undefined : JSON.stringify(payload.body ?? {}),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: proxyHeaders(upstream),
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 502,
      headers: proxyHeaders(),
    });
  }
}
