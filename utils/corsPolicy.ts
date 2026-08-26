/**
 * /api 端点统一 CORS 白名单。
 *
 * 背景：此前所有 /api 端点（LLM 转发代理、GitHub OAuth、在线心跳）都返回
 * access-control-allow-origin: *，任意第三方网页都可以把我们的 Pages 域名当
 * 开放转发中继刷配额。前端全部以相对路径同源调用这些端点——同源请求根本不读
 * CORS 头——因此收紧白名单不影响任何正常玩家流量；白名单只服务合法的显式跨域
 * 场景：正式站 / 预览站互调与本地开发。未来若绑定自定义域名，在此处追加即可。
 */
const ALLOWED_API_ORIGINS = new Set([
  'https://kaituoyishi.pages.dev',
  'https://kaituoyishi-preview.pages.dev',
]);

// 本地开发来源（vite dev server / wrangler pages dev）。
const LOCAL_API_ORIGIN_PATTERN = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

/** 返回该请求允许跨域的 Origin；非浏览器请求（无 Origin 头）或白名单外返回 null。 */
export function resolveAllowedApiOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (ALLOWED_API_ORIGINS.has(origin) || LOCAL_API_ORIGIN_PATTERN.test(origin)) return origin;
  return null;
}

/** 在给定响应头上写入 CORS 头；仅当来源在白名单内时写入（白名单外保持无 CORS 头，浏览器将拦截）。 */
export function applyApiCorsHeaders(request: Request, headers: Headers): void {
  const allowedOrigin = resolveAllowedApiOrigin(request);
  if (!allowedOrigin) return;
  headers.set('access-control-allow-origin', allowedOrigin);
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
}
