import { proxyHeaders, readText } from './proxyCoreShared';

type ClineProxyBody = {
  baseUrl?: string;
  apiKey?: string;
  body?: unknown;
};

export function normalizeClineBaseUrl(baseUrl: string): string {
  // 先剥离查询串再去尾斜杠：`.../v1/?x=1` 这类地址先去斜杠会留下 `v1/`。
  let base = (baseUrl.trim().split('?')[0] ?? '').replace(/\/+$/, '');
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

/** 代理面收敛：只允许转发 Cline 官方主机，避免同源代理被当作任意上游跳板。 */
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

export async function handleClineProxyRequest(request: Request): Promise<Response> {
  let payload: ClineProxyBody;
  try {
    payload = await request.json() as ClineProxyBody;
  } catch {
    return new Response(JSON.stringify({ error: '请求体不是有效 JSON。' }), {
      status: 400,
      headers: proxyHeaders(),
    });
  }

  const baseUrl = readText(payload.baseUrl);
  const apiKey = readText(payload.apiKey);
  if (!baseUrl || !apiKey) {
    return new Response(JSON.stringify({ error: '缺少 Cline Base URL 或 API Key。' }), {
      status: 400,
      headers: proxyHeaders(),
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
