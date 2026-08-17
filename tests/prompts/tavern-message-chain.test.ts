import { describe, expect, it } from 'vitest';
import { buildTavernMessageChain } from '@/hooks/useGame/tavernMessageChainBuilder';
import { 创建默认游戏设置 } from '@/models/settings';
import type { STPreset } from '@/models/stTypes';

describe('Tavern 消息链', () => {
  it('保留最新玩家输入，并在预设未提供占位符时补齐协议守卫', () => {
    const settings = 创建默认游戏设置();
    settings.promptModules = settings.promptModules.map((item) => (
      item.id === 'builtin_main_plot_cot' ? { ...item, content: 'COT_GUARD_MARKER' }
      : item.id === 'builtin_response_format' ? { ...item, content: 'FORMAT_GUARD_MARKER' }
      : item.id === 'builtin_action_options' ? { ...item, content: 'ACTION_OPTIONS_MARKER' }
      : item
    ));
    const preset: STPreset = {
      prompts: [{ identifier: 'chatHistory', role: 'system', content: '' }],
      prompt_order: [{ character_id: 100001, order: [{ identifier: 'chatHistory', enabled: true }] }],
    };
    const messages = buildTavernMessageChain({
      settings,
      preset,
      characterId: null,
      chatHistory: [],
      latestUserInput: '三月七，等等我。',
      playerName: '测试旅人',
      playerRole: null,
    });

    expect(messages.filter((message) => message.content === '三月七，等等我。')).toHaveLength(1);
    const finalText = messages.map((message) => message.content).join('\n');
    expect(finalText).toContain('COT_GUARD_MARKER');
    expect(finalText).toContain('FORMAT_GUARD_MARKER');
    expect(finalText).toContain('ACTION_OPTIONS_MARKER');
  });
});
