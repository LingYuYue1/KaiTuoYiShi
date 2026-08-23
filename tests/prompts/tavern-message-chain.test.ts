import { describe, expect, it } from 'vitest';
import { buildTavernMessageChain } from '@/hooks/useGame/tavernMessageChainBuilder';
import { 创建默认游戏设置 } from '@/models/settings';
import type { STPreset } from '@/models/stTypes';

const PROBES = ['COT_GUARD_PROBE', 'FORMAT_GUARD_PROBE', 'ACTION_OPTIONS_PROBE'] as const;

function createSettingsWithProtocolProbes() {
  const settings = 创建默认游戏设置();
  settings.promptModules = settings.promptModules.map((item) => (
    item.id === 'builtin_main_plot_cot' ? { ...item, content: PROBES[0] }
    : item.id === 'builtin_response_format' ? { ...item, content: PROBES[1] }
    : item.id === 'builtin_action_options' ? { ...item, content: PROBES[2] }
    : item
  ));
  return settings;
}

function buildChain(preset: STPreset) {
  return buildTavernMessageChain({
    settings: createSettingsWithProtocolProbes(),
    preset,
    characterId: null,
    chatHistory: [],
    latestUserInput: '三月七，等等我。',
    playerName: '测试旅人',
    playerRole: null,
  });
}

describe('Tavern 消息链', () => {
  it('保留最新玩家输入，协议守卫内容不进入酒馆链', () => {
    const preset: STPreset = {
      prompts: [{ identifier: 'chatHistory', role: 'system', content: '' }],
      prompt_order: [{ character_id: 100001, order: [{ identifier: 'chatHistory', enabled: true }] }],
    };
    const messages = buildChain(preset);

    expect(messages.filter((message) => message.content === '三月七，等等我。')).toHaveLength(1);
    const finalText = messages.map((message) => message.content).join('\n');
    for (const probe of PROBES) {
      expect(finalText, `${probe} 应留在原生 systemPrompt 协议区`).not.toContain(probe);
    }
  });

  it('预设中的 cot/format 占位符被替换，不残留原始占位符', () => {
    const preset: STPreset = {
      prompts: [{ identifier: 'tavern_probe', role: 'system', content: '前文\n{{cot}}\n{{format}}\n后文' }],
      prompt_order: [{ character_id: 100001, order: [{ identifier: 'tavern_probe', enabled: true }] }],
    };
    const messages = buildChain(preset);
    const finalText = messages.map((message) => message.content).join('\n');

    expect(finalText).toContain('前文');
    expect(finalText).toContain('后文');
    expect(finalText).not.toMatch(/\{\{\s*cot\s*\}\}/i);
    expect(finalText).not.toMatch(/\{\{\s*format\s*\}\}/i);
  });
});
