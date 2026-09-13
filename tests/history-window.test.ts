import { describe, expect, it } from 'vitest';
import { 创建聊天消息 } from '@/models/chat';
import { 创建空记忆系统 } from '@/models/memory';
import { 创建默认游戏设置, 归一化记忆系统设置 } from '@/models/settings';
import {
  MAIN_HISTORY_LIMIT_CONSERVATIVE,
  MAIN_HISTORY_LIMIT_WITHOUT_MEMORY,
  getMainHistoryWindow,
  getMainHistoryWindowLimit,
} from '@/hooks/useGame/historyWindow';

function buildSettings(mode: 'conservative' | 'minimal', enableMemoryInjection = true) {
  const settings = 创建默认游戏设置();
  settings.enableMemoryInjection = enableMemoryInjection;
  settings.记忆系统 = 归一化记忆系统设置({ ...settings.记忆系统, 主剧情历史模式: mode });
  return settings;
}

function buildMemory(withMemory: boolean) {
  const memory = 创建空记忆系统();
  if (withMemory) memory.短期记忆.push('玩家在广场遇到三月七。');
  return memory;
}

function buildHistory(count: number) {
  return Array.from({ length: count }, (_, index) => 创建聊天消息('user', `第${index + 1}句`));
}

describe('主剧情历史模式', () => {
  it('默认 conservative：窗口为最近 20 条原文', () => {
    const settings = 创建默认游戏设置();
    const history = buildHistory(30);

    expect(settings.记忆系统.主剧情历史模式).toBe('conservative');
    expect(getMainHistoryWindowLimit(settings, buildMemory(false))).toBe(MAIN_HISTORY_LIMIT_CONSERVATIVE);
    const window = getMainHistoryWindow(history, settings, buildMemory(false));
    expect(window).toHaveLength(20);
    expect(window[0].content).toBe('第11句');
  });

  it('minimal + 有可注入记忆：窗口 0 条', () => {
    const settings = buildSettings('minimal');
    const memory = buildMemory(true);

    expect(getMainHistoryWindowLimit(settings, memory)).toBe(0);
    expect(getMainHistoryWindow(buildHistory(30), settings, memory)).toStrictEqual([]);
  });

  it('minimal + 无记忆：回退 20 条，避免上下文断档', () => {
    const settings = buildSettings('minimal');
    const memory = buildMemory(false);

    expect(getMainHistoryWindowLimit(settings, memory)).toBe(MAIN_HISTORY_LIMIT_WITHOUT_MEMORY);
    expect(getMainHistoryWindow(buildHistory(30), settings, memory)).toHaveLength(20);
  });

  it('minimal + 关闭记忆注入：即使有记忆也回退 20 条', () => {
    const settings = buildSettings('minimal', false);

    expect(getMainHistoryWindowLimit(settings, buildMemory(true))).toBe(MAIN_HISTORY_LIMIT_WITHOUT_MEMORY);
  });

  it('非法持久化值归一化为 conservative', () => {
    expect(归一化记忆系统设置({ 主剧情历史模式: 'legacy' as never }).主剧情历史模式).toBe('conservative');
  });
});
