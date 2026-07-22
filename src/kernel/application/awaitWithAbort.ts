export function awaitWithAbort<T>(work: Promise<T>, signal: AbortSignal, message: string): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(message));

  return new Promise<T>((resolve, reject) => {
    const finish = (settle: () => void) => {
      signal.removeEventListener('abort', onAbort);
      settle();
    };
    const onAbort = () => finish(() => reject(abortError(message)));

    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}
