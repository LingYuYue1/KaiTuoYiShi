import { jsonResponse, optionsResponse, readRequiredEnv, type PagesContextLike } from './_shared';

interface GitHubTokenRequest {
  code?: string;
  redirectUri?: string;
}

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestPost = async ({ request, env }: PagesContextLike): Promise<Response> => {
  try {
    const payload = await request.json() as GitHubTokenRequest;
    const code = payload.code?.trim();
    const redirectUri = payload.redirectUri?.trim();
    if (!code) return jsonResponse({ error: '缺少 GitHub 授权 code。' }, { status: 400 });
    const tokenBody: Record<string, string> = {
      client_id: readRequiredEnv(env, 'GITHUB_CLIENT_ID'),
      client_secret: readRequiredEnv(env, 'GITHUB_CLIENT_SECRET'),
      code,
    };
    if (redirectUri) tokenBody.redirect_uri = redirectUri;

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(tokenBody),
    });

    const data = await res.json() as GitHubTokenResponse;
    if (!res.ok || data.error || !data.access_token) {
      return jsonResponse(
        {
          error: data.error_description || data.error || 'GitHub 授权换取 Token 失败。',
        },
        { status: 400 },
      );
    }

    return jsonResponse({
      accessToken: data.access_token,
      tokenType: data.token_type ?? 'bearer',
      scope: data.scope ?? '',
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'GitHub OAuth 绑定失败。' },
      { status: 500 },
    );
  }
};
