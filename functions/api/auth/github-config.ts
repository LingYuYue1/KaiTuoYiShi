import { jsonResponse, optionsResponse, readRequiredEnv, type PagesContextLike } from './_shared';

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestGet = async ({ env }: PagesContextLike): Promise<Response> => {
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

