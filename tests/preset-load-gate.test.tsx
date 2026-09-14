// 预置载入的 fail-fail 契约：**失败就是失败，门禁不放行**。
//
// 为什么是这个方向：AI 本就需要联网，残缺世界没有意义。所以「失败自动降级、照常放行」
// 是错的——失败必须明确展示（哪一路、为什么）并只给重试，入口保持禁用。
//
// 这里用最坏情况（网络全断）验证两路都落到 failed，且进度仍走到总数。

// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGameState } from '@/hooks/useGameState';
import { bundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import { bundledZhikuPresets } from '@/data/zhikuPreset';

// 刻意不 mock 任何 loader：mock 掉它们会让真实两路不被调用，进度也就无从上报，测试会假过。

describe('预置载入 fail-fail：失败保持失败，门禁不放行', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('网络全断时两路都落到 failed，进度仍走到总数，且不进入 ready', async () => {
    const { result, unmount } = renderHook(() => useGameState());

    await waitFor(
      () => { expect(result.current.presetLoad.story.status).toBe('failed'); },
      { timeout: 20000 },
    );
    await waitFor(
      () => { expect(result.current.presetLoad.zhiku.status).toBe('failed'); },
      { timeout: 20000 },
    );

    const expectedTotal = bundledStoryWeavingPresets.length + bundledZhikuPresets.length;
    expect(result.current.presetLoad.network.total).toBe(expectedTotal);
    // 网络单元是「取回」，失败也要计数：进度不会停在中途。
    expect(result.current.presetLoad.network.done).toBe(expectedTotal);
    expect(result.current.presetLoad.phase).toBe('failed');

    // 门禁据此关闭：ready 是唯一放行条件。
    expect(result.current.presetLoad.story.status).not.toBe('ready');
    expect(result.current.presetLoad.zhiku.status).not.toBe('ready');

    unmount();
  });
});
