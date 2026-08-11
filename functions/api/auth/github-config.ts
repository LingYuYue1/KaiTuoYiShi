import { jsonResponse, optionsResponse, readRequiredEnv, type PagesContextLike } from './_shared';

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestGet = async ({ env }: PagesContextLike): Promise<Response> => {
  try {
    // redirectUri 可选：服务端允许的 OAuth 回调地址。客户端优先使用该值，
    // 未配置时只在 localhost / 正式域使用当前 origin 下的明确回调，其余域名明确报错。
    const rawRedirectUri = env.GITHUB_OAUTH_REDIRECT_URI;
    const redirectUri = typeof rawRedirectUri === 'string' && rawRedirectUri.trim()
      ? rawRedirectUri.trim()
      : undefined;
    return jsonResponse({
      clientId: readRequiredEnv(env, 'GITHUB_CLIENT_ID'),
      ...(redirectUri ? { redirectUri } : {}),
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : '读取 GitHub OAuth 配置失败。' },
      { status: 500 },
    );
  }
};

