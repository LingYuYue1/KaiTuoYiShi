export interface GitHubRetryNotice {
  phase: string;
  attempt: number;
  maxAttempts: number;
  waitMs: number;
  reason: string;
}

export interface GitHubRequestOptions extends RequestInit {
  phase?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  onRetry?: (notice: GitHubRetryNotice) => void;
}

export class GitHubRequestError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'GitHubRequestError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 800;
const DEFAULT_RETRY_MAX_DELAY_MS = 20_000;

export async function githubRequest(
  input: string | URL,
  options: GitHubRequestOptions = {},
): Promise<Response> {
  const {
    phase = '请求 GitHub',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = defaultMaxAttempts(options.method),
    retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS,
    onRetry,
    signal,
    ...requestInit
  } = options;
  const attempts = Math.max(1, Math.floor(maxAttempts || DEFAULT_MAX_ATTEMPTS));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    assertNotAborted(signal);
    const controller = new AbortController();
    let timedOut = false;
    const stopForwardingAbort = forwardAbort(signal, controller);
    const timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException(`${phase}超时。`, 'TimeoutError'));
    }, Math.max(1_000, timeoutMs));

    try {
      const response = await fetch(input, { ...requestInit, signal: controller.signal });
      if (!shouldRetryResponse(response) || attempt >= attempts) return response;

      const waitMs = retryDelayFromResponse(response, attempt, retryBaseDelayMs, retryMaxDelayMs);
      await response.body?.cancel().catch(() => {});
      onRetry?.({
        phase,
        attempt,
        maxAttempts: attempts,
        waitMs,
        reason: retryReason(response),
      });
      await abortableDelay(waitMs, signal);
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      const retryable = timedOut || isRetryableNetworkError(error);
      if (!retryable || attempt >= attempts) {
        const detail = timedOut ? `${phase}超时` : `${phase}网络请求失败`;
        throw new GitHubRequestError(`${detail}，请检查网络后重试。`, { retryable, cause: error });
      }

      const waitMs = exponentialDelay(attempt, retryBaseDelayMs, retryMaxDelayMs);
      onRetry?.({
        phase,
        attempt,
        maxAttempts: attempts,
        waitMs,
        reason: timedOut ? '请求超时' : '网络中断',
      });
      await abortableDelay(waitMs, signal);
    } finally {
      globalThis.clearTimeout(timeoutId);
      stopForwardingAbort();
    }
  }

  throw new GitHubRequestError(`${phase}失败。`);
}

export async function readGitHubError(response: Response, fallback: string): Promise<string> {
  let message = '';
  try {
    const data = await response.clone().json() as { message?: unknown };
    message = typeof data.message === 'string' ? data.message : '';
  } catch {
    // GitHub 偶尔会由代理返回非 JSON 错误页。
  }
  if (response.status === 401 || /bad credentials/i.test(message)) {
    return `${fallback}：GitHub 授权已失效，请点击“重新授权”后再试。`;
  }
  if (response.status === 403 && isRateLimited(response)) {
    return `${fallback}：GitHub 当前正在限流，请稍后重试。`;
  }
  return message ? `${fallback}：${message}` : `${fallback}（HTTP ${response.status}）`;
}

function defaultMaxAttempts(method?: string): number {
  const normalized = String(method || 'GET').toUpperCase();
  return normalized === 'GET' || normalized === 'HEAD' || normalized === 'OPTIONS'
    ? DEFAULT_MAX_ATTEMPTS
    : 1;
}

function shouldRetryResponse(response: Response): boolean {
  return response.status === 408
    || response.status === 429
    || response.status >= 500
    || (response.status === 403 && isRateLimited(response));
}

function isRateLimited(response: Response): boolean {
  return response.headers.has('retry-after')
    || response.headers.get('x-ratelimit-remaining') === '0';
}

function retryReason(response: Response): string {
  if (response.status === 408) return '请求超时';
  if (response.status === 429 || (response.status === 403 && isRateLimited(response))) return 'GitHub 限流';
  return `GitHub 暂时不可用（HTTP ${response.status}）`;
}

function retryDelayFromResponse(
  response: Response,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(maxDelayMs, Math.ceil(seconds * 1_000));
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.min(maxDelayMs, Math.max(0, retryAt - Date.now()));
  }

  const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
  if (response.headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(resetSeconds)) {
    return Math.min(maxDelayMs, Math.max(0, resetSeconds * 1_000 - Date.now()) + 250);
  }
  return exponentialDelay(attempt, baseDelayMs, maxDelayMs);
}

function exponentialDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(maxDelayMs, Math.max(0, baseDelayMs) * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * Math.min(350, Math.max(1, exponential * 0.2)));
  return exponential + jitter;
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException) return error.name === 'AbortError' || error.name === 'TimeoutError' || error.name === 'NetworkError';
  return false;
}

function forwardAbort(signal: AbortSignal | null | undefined, controller: AbortController): () => void {
  if (!signal) return () => {};
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}

function assertNotAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('操作已取消。', 'AbortError');
}

function abortableDelay(delayMs: number, signal?: AbortSignal | null): Promise<void> {
  assertNotAborted(signal);
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, Math.max(0, delayMs));
    const abort = () => {
      globalThis.clearTimeout(timeoutId);
      reject(signal?.reason ?? new DOMException('操作已取消。', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
