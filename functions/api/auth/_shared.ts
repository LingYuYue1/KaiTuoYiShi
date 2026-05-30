export interface PagesContextLike {
  request: Request;
  env: Record<string, string | undefined>;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function optionsResponse(): Response {
  return jsonResponse({ ok: true });
}

export function readRequiredEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Cloudflare 环境变量缺失：${key}`);
  return value;
}
