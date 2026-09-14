// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { loadBundledZhikuCatalogWithFallback } from '@/data/zhikuCatalogRepository';
import { ZHIKU_BUNDLED_CATALOG_CACHE_KEY, ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY, ZHIKU_BUNDLED_ENTRY_COUNT } from '@/data/zhikuPreset';
import { useGameState } from '@/hooks/useGameState';
import { deleteSetting } from '@/services/storage/settings';
import { devLog } from '@/utils/devLog';

/**
 * 忠实复现生产加载：只 stub 最底层的 fetch，用仓库内真实的
 * public/zhiku-presets/*.json 响应；其余 URL 一律 404（与生产 CDN
 * 缺失行为一致）。刻意不限定 zhikuCatalogRepository，走真实合并与校验。
 */
function stubFetchWithRealFiles(): void {
  vi.stubGlobal('fetch', (input: RequestInfo | URL): Promise<Response> => {
    const raw = input instanceof Request ? input.url : input.toString();
    const withoutQuery = raw.split('?')[0];
    let pathname: string;
    try {
      pathname = new URL(withoutQuery, 'http://localhost').pathname;
    } catch {
      return Promise.resolve(new Response('bad url', { status: 400 }));
    }
    if (pathname.startsWith('/zhiku-presets/')) {
      const filePath = join(process.cwd(), 'public', pathname);
      try {
        const body = readFileSync(filePath, 'utf-8');
        return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));
      } catch {
        return Promise.resolve(new Response('preset missing', { status: 404 }));
      }
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  stubFetchWithRealFiles();
  await deleteSetting('zhikuSystem');
  await deleteSetting(ZHIKU_BUNDLED_CATALOG_CACHE_KEY);
  await deleteSetting(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY);
  await deleteSetting('storyWeavingSystem');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('真实内置目录加载（生产复现）', () => {
  it(`23 个真实预设通过完整性校验并产出 ${ZHIKU_BUNDLED_ENTRY_COUNT} 条`, async () => {
    const catalog = await loadBundledZhikuCatalogWithFallback();
    expect(catalog.source).toBe('network');
    expect(catalog.system.条目).toHaveLength(ZHIKU_BUNDLED_ENTRY_COUNT);
  });

  it('boot 合并后首页智库非空', async () => {
    const { result, unmount } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.zhikuCatalogStatus).toBe('ready'), { timeout: 15000 });
    expect(result.current.zhikuCatalogSource).toBe('network');
    expect(result.current.智库.条目).toHaveLength(ZHIKU_BUNDLED_ENTRY_COUNT);
    expect(vi.mocked(devLog)).toHaveBeenCalledWith(
      'save',
      'zhiku-boot-merged',
      expect.objectContaining({ total: ZHIKU_BUNDLED_ENTRY_COUNT, source: 'network' }),
    );
    unmount();
  });

  it('剧情编织资源停滞时首页智库仍可就绪（两路独立）', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
      const raw = input instanceof Request ? input.url : input.toString();
      const withoutQuery = raw.split('?')[0];
      let pathname: string;
      try {
        pathname = new URL(withoutQuery, 'http://localhost').pathname;
      } catch {
        return new Response('bad url', { status: 400 });
      }
      if (pathname.includes('story-weaving-canon')) {
        return new Promise<Response>(() => {});
      }
      if (pathname.startsWith('/zhiku-presets/')) {
        const body = readFileSync(join(process.cwd(), 'public', pathname), 'utf-8');
        return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    });
    const { result, unmount } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.zhikuCatalogStatus).toBe('ready'), { timeout: 4000 });
    expect(result.current.智库.条目).toHaveLength(ZHIKU_BUNDLED_ENTRY_COUNT);
    unmount();
  });
});
