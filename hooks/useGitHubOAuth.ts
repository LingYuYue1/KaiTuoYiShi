import { useCallback, useState } from 'react';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const OAUTH_STATE_KEY = 'kty_github_oauth_pending_state';
const CALLBACK_PATH = '/oauth/github/callback';
const PRODUCTION_ORIGIN = 'https://kaituoyishi.pages.dev';
const OAUTH_SCOPE = 'repo';

interface GitHubOAuthConfigResponse {
  clientId?: string;
  error?: string;
}

interface GitHubOAuthTokenResponse {
  accessToken?: string;
  error?: string;
}

export interface GitHubOAuthResult {
  pending: boolean;
  error: string;
  startGitHubOAuth: () => Promise<void>;
  consumeGitHubOAuthCallback: () => Promise<string | null>;
}

export function useGitHubOAuth(): GitHubOAuthResult {
  const [pending, setPending] = useState(() => window.location.pathname === CALLBACK_PATH);
  const [error, setError] = useState('');

  const buildRedirectUri = useCallback(() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `${window.location.origin}${CALLBACK_PATH}`;
    }
    return `${PRODUCTION_ORIGIN}${CALLBACK_PATH}`;
  }, []);

  const startGitHubOAuth = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      const configRes = await fetch('/api/auth/github-config');
      const config = await configRes.json() as GitHubOAuthConfigResponse;
      if (!configRes.ok || !config.clientId) {
        throw new Error(formatGitHubOAuthConfigError(config.error));
      }

      const state = createOAuthState();
      localStorage.setItem(OAUTH_STATE_KEY, state);

      const params = new URLSearchParams({
        client_id: config.clientId,
        scope: OAUTH_SCOPE,
        state,
      });
      if (shouldUseExplicitRedirectUri()) {
        params.set('redirect_uri', buildRedirectUri());
      }
      window.location.href = `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
    } catch (err) {
      setPending(false);
      const message = err instanceof Error ? err.message : '打开 GitHub 授权失败。';
      setError(message);
      throw new Error(message, { cause: err });
    }
  }, [buildRedirectUri]);

  const consumeGitHubOAuthCallback = useCallback(async (): Promise<string | null> => {
    if (window.location.pathname !== CALLBACK_PATH) return null;
    const params = new URLSearchParams(window.location.search);
    const githubError = params.get('error_description') || params.get('error');
    if (githubError) {
      cleanupCallbackUrl();
      throw new Error(`GitHub 授权已取消或失败：${githubError}`);
    }

    const code = params.get('code')?.trim();
    const state = params.get('state')?.trim();
    const expectedState = localStorage.getItem(OAUTH_STATE_KEY);
    localStorage.removeItem(OAUTH_STATE_KEY);

    if (!code) {
      cleanupCallbackUrl();
      throw new Error('GitHub 回调缺少授权 code。');
    }
    if (!state || !expectedState || state !== expectedState) {
      cleanupCallbackUrl();
      throw new Error('GitHub 授权状态校验失败，请重新绑定。');
    }

    setPending(true);
    setError('');
    try {
      const body: { code: string; redirectUri?: string } = { code };
      if (shouldUseExplicitRedirectUri()) {
        body.redirectUri = buildRedirectUri();
      }
      const res = await fetch('/api/auth/github', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as GitHubOAuthTokenResponse;
      if (!res.ok || !data.accessToken) {
        throw new Error(data.error || 'GitHub 授权换取 Token 失败。');
      }
      cleanupCallbackUrl();
      return data.accessToken;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'GitHub OAuth 绑定失败。';
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setPending(false);
    }
  }, [buildRedirectUri]);

  return {
    pending,
    error,
    startGitHubOAuth,
    consumeGitHubOAuthCallback,
  };
}

function formatGitHubOAuthConfigError(error?: string): string {
  if (error?.includes('GITHUB_CLIENT_ID')) {
    return 'GitHub 云存档 OAuth 未完成部署配置：Cloudflare Pages 环境变量缺少 GITHUB_CLIENT_ID。请站点部署者在 Cloudflare 项目中配置 GitHub OAuth App 的 Client ID。';
  }
  return error || 'GitHub OAuth Client ID 未配置。';
}

function createOAuthState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cleanupCallbackUrl(): void {
  window.history.replaceState({}, document.title, '/');
}

function shouldUseExplicitRedirectUri(): boolean {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}
