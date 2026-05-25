export interface RetryOptions {
  retries?: number;
  label?: string;
  delayMs?: number;
  signal?: AbortSignal;
}

function shouldStopRetry(err: unknown, signal?: AbortSignal): boolean {
  return (err as Error)?.name === 'AbortError' || signal?.aborted === true;
}

export async function withRetries<T>(task: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = Math.max(0, Math.trunc(options.retries ?? 0));
  const delayMs = Math.max(0, Math.trunc(options.delayMs ?? 250));
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task();
    } catch (err) {
      lastErr = err;
      if (shouldStopRetry(err, options.signal) || attempt >= retries) {
        throw err;
      }
      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }

  const message = lastErr instanceof Error ? lastErr.message : String(lastErr ?? '未知错误');
  if (options.label) {
    throw new Error(`${options.label}失败（已重试 ${retries} 次）：${message}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error('重试失败');
}
