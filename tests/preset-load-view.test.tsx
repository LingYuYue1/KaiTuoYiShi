// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePresetLoadView } from '@/hooks/usePresetLoadView';
import type { PresetSnapshot, LoadPhase } from '@/services/presetLoader';
import { 创建空剧情编织系统 } from '@/models/storyWeaving';
import { 创建空智库系统 } from '@/models/zhiku';

const snap = (phase: LoadPhase, overrides: Partial<PresetSnapshot> = {}): PresetSnapshot => ({
  phase,
  story: { status: 'loading' },
  zhiku: { status: 'loading' },
  network: { done: 1, total: 50 },
  startedAt: 1000,
  ...overrides,
});

describe('usePresetLoadView：只投影网络段', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('网络在展示阈值内完成 → 从不出现（不闪现 0→100）', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: PresetSnapshot }) => usePresetLoadView(snapshot),
      { initialProps: { snapshot: snap('network') } },
    );
    expect(result.current.visible).toBe(false);

    act(() => { vi.advanceTimersByTime(100); });
    rerender({ snapshot: snap('processing') });
    act(() => { vi.advanceTimersByTime(2000); });

    expect(result.current.visible).toBe(false);
  });

  it('网络持续超过阈值 → 出现', () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      ({ snapshot }: { snapshot: PresetSnapshot }) => usePresetLoadView(snapshot),
      { initialProps: { snapshot: snap('network') } },
    );

    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current.visible).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.visible).toBe(true);
    expect(result.current.tone).toBe('pending');
  });

  it('已出现后网络完成 → 走 finish → fade → 退场', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: PresetSnapshot }) => usePresetLoadView(snapshot),
      { initialProps: { snapshot: snap('network') } },
    );
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.visible).toBe(true);

    rerender({ snapshot: snap('processing') });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.tone).toBe('finishing');

    let sawFading = false;
    for (let index = 0; index < 40; index += 1) {
      act(() => { vi.advanceTimersByTime(50); });
      if (result.current.fading) sawFading = true;
      if (!result.current.visible) break;
    }
    expect(sawFading).toBe(true);
    expect(result.current.visible).toBe(false);
  });

  it('加工段失败 → 立即以失败样式出现并给出重试', () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      ({ snapshot }: { snapshot: PresetSnapshot }) => usePresetLoadView(snapshot),
      {
        initialProps: {
          snapshot: snap('failed', {
            story: { status: 'failed', reason: '原著挂了' },
            zhiku: { status: 'ready', value: 创建空智库系统() },
          }),
        },
      },
    );

    expect(result.current.visible).toBe(true);
    expect(result.current.tone).toBe('failed');
    expect(result.current.showRetry).toBe(true);
    expect(result.current.detail).toContain('原著挂了');
  });

  it('ready 且从未出现 → 保持不出现', () => {
    vi.useFakeTimers();
    const { result } = renderHook(
      ({ snapshot }: { snapshot: PresetSnapshot }) => usePresetLoadView(snapshot),
      {
        initialProps: {
          snapshot: snap('ready', {
            story: { status: 'ready', value: 创建空剧情编织系统() },
            zhiku: { status: 'ready', value: 创建空智库系统() },
          }),
        },
      },
    );
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.visible).toBe(false);
  });
});
