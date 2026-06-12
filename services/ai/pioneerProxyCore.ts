type PioneerProxyBody = {
  baseUrl?: string;
  apiKey?: string;
  kind?: 'chat' | 'models';
  body?: unknown;
};

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePioneerBaseUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '');
  base = base.split('?')[0] ?? base;
  base = base
    .replace(/\/v1\/chat\/completions$/i, '/v1')
    .replace(/\/v1\/models$/i, '/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models$/i, '');
  if (/^https:\/\/api\.pioneer\.ai$/i.test(base)) return `${base}/v1`;
  return base;
}

export function isPioneerBaseUrl(baseUrl: string): boolean {
  return /^https:\/\/api\.pioneer\.ai(?:\/|$)/i.test(baseUrl.trim());
}

export function assertPioneerBaseUrl(baseUrl: string): string {
  const base = normalizePioneerBaseUrl(baseUrl);
  if (!/^https:\/\/api\.pioneer\.ai\/v1$/i.test(base)) {
    throw new Error('仅允许代理 Pioneer OpenAI 兼容接口：https://api.pioneer.ai/v1。');
  }
  return base;
}

function buildPioneerUpstreamUrl(payload: PioneerProxyBody): string {
  const base = assertPioneerBaseUrl(readText(payload.baseUrl));
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

export async function handlePioneerProxyRequest(request: Request): Promise<Response> {
  let payload: PioneerProxyBody;
  try {
    payload = await request.json() as PioneerProxyBody;
  } catch {
    return new Response(JSON.stringify({ error: '请求体不是有效 JSON。' }), {
      status: 400,
      headers: proxyHeaders(),
    });
  }

  const baseUrl = readText(payload.baseUrl);
  const apiKey = readText(payload.apiKey);
  if (!baseUrl || !apiKey) {
    return new Response(JSON.stringify({ error: '缺少 Pioneer Base URL 或 API Key。' }), {
      status: 400,
      headers: proxyHeaders(),
    });
  }

  try {
    const upstreamUrl = buildPioneerUpstreamUrl(payload);
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
