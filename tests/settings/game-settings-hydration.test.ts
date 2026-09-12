import { describe, expect, it } from 'vitest';
import { 创建默认记忆系统设置, 创建默认游戏设置 } from '@/models/settings';
import { hydratePersistedGameSettings, 归一化游戏设置 } from '@/utils/gameSettingsHydration';

const 默认 = 创建默认游戏设置();

describe('旧存档水合（纯边界）', () => {
  it('垃圾输入回落到完整默认设置', () => {
    for (const input of [null, undefined, 42, 'x', [1, 2, 3], true]) {
      const hydrated = hydratePersistedGameSettings(input);
      expect(hydrated.settings.wordCountTarget).toBe(默认.wordCountTarget);
      expect(hydrated.settings.记忆系统).toEqual(默认.记忆系统);
      expect(hydrated.macroGlobalVars).toEqual({});
      expect(hydrated.worldbookTriggerStates).toEqual({});
    }
  });

  it('缺新字段的旧档补齐默认值并剥离 V1 预设字段', () => {
    const hydrated = hydratePersistedGameSettings({
      旅人姓名: '旧旅人',
      variableApi: undefined,
      enableClaudeMode: undefined,
      stPresets: [{ id: 'v1' }],
      currentStPresetId: 'v1',
      stWorldInfos: [{ id: 'w1' }],
    });

    expect(hydrated.settings.variableApi).toEqual(默认.variableApi);
    expect(hydrated.settings.enableClaudeMode).toBe(默认.enableClaudeMode);
    expect(hydrated.settings).not.toHaveProperty('stPresets');
    expect(hydrated.settings).not.toHaveProperty('currentStPresetId');
    expect(hydrated.settings).not.toHaveProperty('stWorldInfos');
  });

  it('旧 customPrompt 转 legacy_custom 模块并清空原字段', () => {
    const hydrated = hydratePersistedGameSettings({ customPrompt: '旧版额外指示' });

    const legacyModule = hydrated.settings.promptModules.find((module) => module.id === 'legacy_custom');
    expect(legacyModule?.content).toBe('旧版额外指示');
    expect(legacyModule?.enabled).toBe(true);
    expect((hydrated.settings as { customPrompt?: string }).customPrompt).toBe('');
  });

  it('旧 gameSettings 残留运行态键被剥离并单独返回', () => {
    const hydrated = hydratePersistedGameSettings({
      macroGlobalVars: { 好感: '12' },
      worldbookTriggerStates: { 某书: 3 },
    });

    expect(hydrated.macroGlobalVars).toEqual({ 好感: '12' });
    expect(hydrated.worldbookTriggerStates).toEqual({ 某书: 3 });
    expect(hydrated.settings).not.toHaveProperty('macroGlobalVars');
    expect(hydrated.settings).not.toHaveProperty('worldbookTriggerStates');
  });

  it('不修改入参', () => {
    const input = {
      customPrompt: '旧版额外指示',
      macroGlobalVars: { a: '1' },
      stPresets: [{ id: 'v1' }],
      记忆系统: { 即时转短期阈值: 25, 短期转中期阈值: 20, 中期转长期阈值: 10 },
    };
    const snapshot = structuredClone(input);

    hydratePersistedGameSettings(input);

    expect(input).toEqual(snapshot);
  });

  it('水合幂等：二次水合结构不变', () => {
    const 一次 = hydratePersistedGameSettings({ customPrompt: '旧版额外指示', macroGlobalVars: { a: '1' } });
    const 二次 = hydratePersistedGameSettings(一次.settings);
    expect(二次.settings).toEqual(一次.settings);
  });

  it('旧记忆阈值组合仍走既有迁移契约', () => {
    const hydrated = hydratePersistedGameSettings({
      记忆系统: { 即时转短期阈值: 25, 短期转中期阈值: 20, 中期转长期阈值: 10 },
    });
    const 当前默认 = 创建默认记忆系统设置();
    expect(hydrated.settings.记忆系统.即时转短期阈值).toBe(当前默认.即时转短期阈值);
    expect(hydrated.settings.记忆系统.短期转中期阈值).toBe(当前默认.短期转中期阈值);
    expect(hydrated.settings.记忆系统.中期转长期阈值).toBe(当前默认.中期转长期阈值);
    expect(hydrated.settings.记忆系统.记忆阈值契约版本).toBe(当前默认.记忆阈值契约版本);
  });

  it('enableNoControl 开启时关闭代写扩写', () => {
    const hydrated = hydratePersistedGameSettings({ enableNoControl: true, enablePlayerSpeechExpansion: true });
    expect(hydrated.settings.enablePlayerSpeechExpansion).toBe(false);
  });
});

describe('写入侧归一化', () => {
  it('对当前形态设置幂等', () => {
    expect(归一化游戏设置(默认)).toEqual(默认);
  });

  it('垃圾子系统被收敛为合法形状', () => {
    const normalized = 归一化游戏设置({
      ...默认,
      记忆系统: {} as never,
      新闻系统: {} as never,
      额外功能: {} as never,
    });
    expect(normalized.记忆系统.记忆阈值契约版本).toBe(默认.记忆系统.记忆阈值契约版本);
    expect(normalized.新闻系统.maxNewEntriesPerTurn).toBe(默认.新闻系统.maxNewEntriesPerTurn);
    expect(Array.isArray(normalized.额外功能.污染词清理.words)).toBe(true);
  });
});
