import { 归一化记忆系统设置, type 记忆系统设置 } from '@/models/settings';
import type { GameStateHarness } from './gameStateHarness';

/** 注意：各文件的 vi.mock('@/services/ai/chatCompletionClient') 按 Vitest 提升语义必须保留在用例文件内，不可抽取。 */
export const MEMORY_API_NOW = 1_700_000_000_000;

export function buildRecallApiConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: 'openai_compatible',
    baseUrl: 'https://recall.example/v1',
    apiKey: 'sk-recall',
    model: 'recall-model',
    retryCount: 0,
    ...overrides,
  };
}

export function configureHarnessMemoryApi(
  harness: GameStateHarness,
  settingsOverrides: Record<string, unknown> = {},
): void {
  harness.setGameSettings((prev) => ({
    ...prev,
    记忆系统: 归一化记忆系统设置({
      ...prev.记忆系统,
      ...settingsOverrides,
    }),
  }));
}

export function buildMemorySettings(overrides: Record<string, unknown> = {}): 记忆系统设置 {
  return 归一化记忆系统设置({
    即时转短期阈值: 2,
    短期转中期阈值: 2,
    中期转长期阈值: 2,
    启用中短长期API总结: true,
    记忆总结API: buildRecallApiConfig(),
    ...overrides,
  });
}
