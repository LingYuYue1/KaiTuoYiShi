import assert from 'node:assert/strict';
import { githubRequest, readGitHubError } from '../services/githubRequest.ts';

const originalFetch = globalThis.fetch;

try {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ message: 'temporary' }), { status: 503 })
      : new Response('{}', { status: 200 });
  };
  const recovered = await githubRequest('https://api.github.test/retry', {
    phase: '上传分卷 1/2',
    maxAttempts: 2,
    retryBaseDelayMs: 0,
    retryMaxDelayMs: 0,
  });
  assert.equal(recovered.status, 200);
  assert.equal(calls, 2, '503 应执行有限重试');

  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
  };
  const unauthorized = await githubRequest('https://api.github.test/auth', { maxAttempts: 3 });
  assert.equal(calls, 1, '401 不应重试');
  assert.match(await readGitHubError(unauthorized, '读取失败'), /重新授权/);

  calls = 0;
  let notice;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response('{}', { status: 429, headers: { 'retry-after': '0' } })
      : new Response('{}', { status: 200 });
  };
  await githubRequest('https://api.github.test/rate-limit', {
    maxAttempts: 2,
    onRetry: (value) => { notice = value; },
  });
  assert.equal(notice?.reason, 'GitHub 限流');
  assert.equal(notice?.waitMs, 0);

  const controller = new AbortController();
  controller.abort(new DOMException('用户取消', 'AbortError'));
  await assert.rejects(
    githubRequest('https://api.github.test/abort', { signal: controller.signal }),
    /用户取消/,
  );

  console.log('[github-request-regression] ok');
} finally {
  globalThis.fetch = originalFetch;
}
