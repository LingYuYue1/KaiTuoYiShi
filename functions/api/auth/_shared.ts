import { applyApiCorsHeaders } from '../../../utils/corsPolicy';

export interface PagesContextLike {
  request: Request;
  env: Record<string, unknown>;
}

export function jsonResponse(request: Request, body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  applyApiCorsHeaders(request, headers);
  headers.set('content-type', 'application/json; charset=utf-8');

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function optionsResponse(request: Request): Response {
  const headers = new Headers();
  applyApiCorsHeaders(request, headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify({ ok: true }), { headers });
}

export function readRequiredEnv(env: Record<string, unknown>, key: string): string {
  const raw = env[key];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) throw new Error(`Cloudflare 环境变量缺失：${key}`);
  return value;
}
