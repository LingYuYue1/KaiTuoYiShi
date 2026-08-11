import { useCallback, useEffect, useState } from 'react';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const OAUTH_STATE_KEY = 'kty_github_oauth_pending_state';
// 记录本页实际使用的 redirect URI，保证「发授权请求」与「换 token 请求」使用同一个值。
const OAUTH_REDIRECT_KEY = 'kty_github_oauth_pending_redirect';
const CALLBACK_PATH = '/oauth/github/callback';
const PRODUCTION_ORIGIN = 'https://kaituoyishi.pages.dev';
const OAUTH_SCOPE = 'repo';

interface GitHubOAuthConfigResponse {
  clientId?: string;
  /** 服务端允许的 OAuth 回调地址；客户端优先使用该值。 */
  redirectUri?: string;
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

/**
 * 解析本次 OAuth 应使用的 redirect URI（授权请求与换 token 请求共用同一个值）：
 * - 服务端返回的 redirectUri 优先；
 * - 否则仅 localhost / 正式域允许使用当前 origin 下的明确回调；
 * - preview / LAN 等非正式域名不生成指向正式站的回调，明确提示「当前站点未配置 OAuth」，
 *   不把用户静默带到正式站造成状态丢失。
 * 导出供集中回归直接驱动真实行为。
 */
export function resolveRedirectUri(serverRedirectUri?: string): string {
  if (serverRedirectUri?.trim()) return serverRedirectUri.trim();
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || window.location.origin === PRODUCTION_ORIGIN) {
    return `${window.location.origin}${CALLBACK_PATH}`;
  }
  throw new Error(
    '当前站点未配置 GitHub OAuth 回调（仅正式站 kaituoyishi.pages.dev 与本地 localhost 支持授权绑定）。'
    + '请在该站点部署 GitHub OAuth App 并配置 GITHUB_OAUTH_REDIRECT_URI 后重试。',
  );
}

export function useGitHubOAuth(): GitHubOAuthResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const startGitHubOAuth = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      const configRes = await fetch('/api/auth/github-config');
      const config = await configRes.json() as GitHubOAuthConfigResponse;
      if (!configRes.ok || !config.clientId) {
        throw new Error(formatGitHubOAuthConfigError(config.error));
      }

      // 解析并锁定 redirect URI：非正式 origin 不静默跳正式站，未配置时明确报错。
      let redirectUri: string;
      try {
        redirectUri = resolveRedirectUri(config.redirectUri);
      } catch (err) {
        setPending(false);
        const message = err instanceof Error ? err.message : '当前站点未配置 OAuth。';
        setError(message);
        throw new Error(message);
      }

      const state = createOAuthState();
      localStorage.setItem(OAUTH_STATE_KEY, state);
      sessionStorage.setItem(OAUTH_REDIRECT_KEY, redirectUri);

      const params = new URLSearchParams({
        client_id: config.clientId,
        scope: OAUTH_SCOPE,
        state,
        redirect_uri: redirectUri,
      });
      window.location.href = `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
    } catch (err) {
      setPending(false);
      const message = err instanceof Error ? err.message : '打开 GitHub 授权失败。';
      setError(message);
      throw new Error(message);
    }
  }, []);

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
    // 换 token 请求必须使用与授权请求同一个 redirect URI。
    const pendingRedirect = sessionStorage.getItem(OAUTH_REDIRECT_KEY);
    sessionStorage.removeItem(OAUTH_REDIRECT_KEY);

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
      if (pendingRedirect) {
        body.redirectUri = pendingRedirect;
      } else {
        try {
          body.redirectUri = resolveRedirectUri(undefined);
        } catch (err) {
          throw new Error(err instanceof Error ? err.message : '当前站点未配置 OAuth 回调。');
        }
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
      throw new Error(message);
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    if (window.location.pathname === CALLBACK_PATH) setPending(true);
  }, []);

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

/** 回调 URL 清理只作用于当前 origin（相对路径，不跨站跳转）。 */
function cleanupCallbackUrl(): void {
  window.history.replaceState({}, document.title, '/');
}
