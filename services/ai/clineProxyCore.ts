import { applyApiCorsHeaders } from '../../utils/corsPolicy';
type ClineProxyBody = {
  baseUrl?: string;
  apiKey?: string;
  body?: unknown;
};

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeClineBaseUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '');
  base = base.split('?')[0] ?? base;
  base = base
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models(?:\/.*)?$/i, '');
  if (/^https:\/\/api\.cline\.bot$/i.test(base)) return `${base}/api/v1`;
  if (/\/api$/i.test(base)) return `${base}/v1`;
  return base;
}

export function isClineBaseUrl(baseUrl: string): boolean {
  return /^https:\/\/api\.cline\.bot(?:\/|$)/i.test(baseUrl.trim());
}

export function assertClineBaseUrl(baseUrl: string): string {
  const base = normalizeClineBaseUrl(baseUrl);
  if (!/^https:\/\/api\.cline\.bot\/api\/v1$/i.test(base)) {
    throw new Error('仅允许代理 Cline API：https://api.cline.bot/api/v1。');
  }
  return base;
}

export function buildClineProxyBody(
  config: { baseUrl: string; apiKey: string },
  body: Record<string, unknown>,
): string {
  return JSON.stringify({
    baseUrl: normalizeClineBaseUrl(config.baseUrl),
    apiKey: config.apiKey,
    body,
  });
}

function buildClineUpstreamUrl(payload: ClineProxyBody): string {
  const base = assertClineBaseUrl(readText(payload.baseUrl));
  return `${base}/chat/completions`;
}

function proxyHeaders(request: Request, upstream?: Response): Headers {
  const headers = new Headers();
  // CORS 收敛到统一白名单（utils/corsPolicy）：同源请求不受影响
  applyApiCorsHeaders(request, headers);
  headers.set('cache-control', 'no-store');
  headers.set('content-type', upstream?.headers.get('content-type') || 'application/json; charset=utf-8');
  return headers;
}

export async function handleClineProxyRequest(request: Request): Promise<Response> {
  let payload: ClineProxyBody;
  try {
    payload = await request.json() as ClineProxyBody;
  } catch {
    return new Response(JSON.stringify({ error: '请求体不是有效 JSON。' }), {
      status: 400,
      headers: proxyHeaders(request),
    });
  }

  const baseUrl = readText(payload.baseUrl);
  const apiKey = readText(payload.apiKey);
  if (!baseUrl || !apiKey) {
    return new Response(JSON.stringify({ error: '缺少 Cline Base URL 或 API Key。' }), {
      status: 400,
      headers: proxyHeaders(request),
    });
  }

  try {
    const upstream = await fetch(buildClineUpstreamUrl(payload), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload.body ?? {}),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: proxyHeaders(request, upstream),
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 502,
      headers: proxyHeaders(request),
    });
  }
}
