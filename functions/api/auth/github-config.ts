import { jsonResponse, optionsResponse, readRequiredEnv, type PagesContextLike } from './_shared';

export const onRequestOptions = (): Response => optionsResponse();

export const onRequestGet = ({ env }: PagesContextLike): Response => {
  try {
    return jsonResponse({
      clientId: readRequiredEnv(env, 'GITHUB_CLIENT_ID'),
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : '读取 GitHub OAuth 配置失败。' },
      { status: 500 },
    );
  }
};

