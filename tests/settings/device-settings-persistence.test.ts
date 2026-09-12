// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { 创建默认游戏设置 } from '@/models/settings';
import { hydratePersistedGameSettings } from '@/utils/gameSettingsHydration';
import { useDeviceSettings } from '@/hooks/useDeviceSettings';
import { saveSetting } from '@/services/storage/settings';
import type { API方案槽位 } from '@/models/apiProfiles';

vi.mock('@/services/storage/settings', () => ({
  saveSetting: vi.fn(() => Promise.resolve()),
  loadSetting: vi.fn(() => Promise.resolve(null)),
  deleteSetting: vi.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  vi.mocked(saveSetting).mockClear();
});

describe('设备设置持久化', () => {
  it('persistGameSettings 落盘前归一化旧记忆阈值', async () => {
    const { result } = renderHook(() => useDeviceSettings());
    const base = 创建默认游戏设置();
    // 无契约版本戳的旧阈值组合：落盘归一化应抬到当前默认。
    const { 记忆阈值契约版本: _版本, ...无戳记忆 } = base.记忆系统;
    void _版本;
    const 旧阈值游戏设置: typeof base = {
      ...base,
      记忆系统: {
        ...无戳记忆,
        即时转短期阈值: 25,
        短期转中期阈值: 20,
        中期转长期阈值: 10,
      } as typeof base.记忆系统,
    };

    await act(async () => {
      await result.current.persistGameSettings(旧阈值游戏设置);
    });

    expect(saveSetting).toHaveBeenCalledTimes(1);
    const [key, payload] = vi.mocked(saveSetting).mock.calls[0];
    expect(key).toBe('gameSettings');
    const saved = payload as ReturnType<typeof 创建默认游戏设置>;
    expect(saved.记忆系统.即时转短期阈值).toBe(创建默认游戏设置().记忆系统.即时转短期阈值);
    expect(saved.记忆系统.记忆阈值契约版本).toBe(创建默认游戏设置().记忆系统.记忆阈值契约版本);
  });

  it('旧档水合后落盘仍是完整合法设置', async () => {
    const hydrated = hydratePersistedGameSettings({ customPrompt: '旧版额外指示' });
    const { result } = renderHook(() => useDeviceSettings());

    await act(async () => {
      await result.current.persistGameSettings(hydrated.settings);
    });

    const [, payload] = vi.mocked(saveSetting).mock.calls[0];
    const saved = payload as ReturnType<typeof 创建默认游戏设置>;
    expect(saved.promptModules.some((module) => module.id === 'legacy_custom')).toBe(true);
    expect((saved as { customPrompt?: string }).customPrompt).toBe('');
  });

  it('persistApiProfileSlots 最多保留 12 个槽位', async () => {
    const { result } = renderHook(() => useDeviceSettings());
    const slots = Array.from({ length: 15 }, (_, index) => ({
      id: `slot-${index}`,
    })) as unknown as API方案槽位[];

    await act(async () => {
      await result.current.persistApiProfileSlots(slots);
    });

    const [key, payload] = vi.mocked(saveSetting).mock.calls[0];
    expect(key).toBe('apiProfileSlots');
    expect((payload as API方案槽位[]).length).toBe(12);
  });
});
