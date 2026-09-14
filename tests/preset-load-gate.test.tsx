// 门禁必然解除：预置载入无论成功还是失败，presetLoad.status 都不能停在 'pending'。
//
// 这是「玩家永远进得去游戏」这条产品约束的技术表述。首页的智库 / 读取光锥 / 向导最终确认
// 都按 status !== 'pending' 解除禁用——只要存在一条停在 pending 的路径，玩家就会被永久挡在门外。
// 所以这里用最坏情况（网络全断）来验证终局一定到达。

// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGameState } from '@/hooks/useGameState';
import { bundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import { bundledZhikuPresets } from '@/data/zhikuPreset';

// 刻意不 mock 任何 loader：mock 掉智库仓库会让 `loadAllBundledZhikuPresets` 根本不被调用，
// 那 23 个文件的进度也就无从上报，测试会假过。这里要的是真实的两路都跑一遍。

describe('预置载入的门禁必然解除', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('网络全断时落到 failed 而非停在 pending，且进度仍走到总数', async () => {
    const { result, unmount } = renderHook(() => useGameState());

    await waitFor(
      () => { expect(result.current.presetLoad.status).not.toBe('pending'); },
      { timeout: 20000 },
    );

    expect(result.current.presetLoad.status).toBe('failed');
    expect(result.current.presetLoad.degraded).toBe(true);
    expect(result.current.presetLoad.total).toBe(
      bundledStoryWeavingPresets.length + bundledZhikuPresets.length,
    );
    expect(result.current.presetLoad.done).toBe(result.current.presetLoad.total);

    unmount();
  });
});
