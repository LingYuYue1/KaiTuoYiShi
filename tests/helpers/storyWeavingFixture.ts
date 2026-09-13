import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, vi } from 'vitest';

export const STORY_WEAVING_CANON_DIR = path.join(process.cwd(), 'public', 'data', 'story-weaving-canon');

export function stubStoryWeavingCanonFetch(canonDir: string = STORY_WEAVING_CANON_DIR): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = url.match(/story-weaving-canon\/([^/]+\.json)$/u);
    if (!match) return new Response(null, { status: 404 });
    try {
      const body = await readFile(path.join(canonDir, match[1]), 'utf8');
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

export function registerCanonFetchTeardown(): void {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
}
