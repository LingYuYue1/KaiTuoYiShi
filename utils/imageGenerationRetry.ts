export const DEFAULT_IMAGE_RETRY_COUNT = 2;

const RETRY_DELAY_MS = 1200;

export function readImageError(error: unknown, fallback = '图片生成失败'): string {
  const message = typeof (error as { message?: unknown })?.message === 'string'
    ? String((error as { message: string }).message).trim()
    : '';
  return message || fallback;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => window.setTimeout(resolve, ms));
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort);
  });
}

export async function runImageGenerationWithRetry<T>(
  runner: () => Promise<T>,
  options?: {
    maxRetries?: number;
    signal?: AbortSignal;
    onAttempt?: (attempt: number, totalAttempts: number) => void;
    onRetry?: (attempt: number, totalAttempts: number, errorMessage: string) => void;
  },
): Promise<T> {
  const maxRetries = Math.max(0, Math.trunc(Number(options?.maxRetries ?? DEFAULT_IMAGE_RETRY_COUNT) || 0));
  const totalAttempts = maxRetries + 1;
  let lastError: unknown;
  for (let index = 0; index < totalAttempts; index += 1) {
    if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const attempt = index + 1;
    options?.onAttempt?.(attempt, totalAttempts);
    try {
      return await runner();
    } catch (error) {
      lastError = error;
      if (options?.signal?.aborted || index >= maxRetries) throw error;
      const errorMessage = readImageError(error);
      options?.onRetry?.(attempt, totalAttempts, errorMessage);
      await wait(Math.min(5000, RETRY_DELAY_MS * attempt), options?.signal);
    }
  }
  throw lastError;
}
