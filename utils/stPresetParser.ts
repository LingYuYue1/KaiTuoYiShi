/**
 * ST（SillyTavern）预设 JSON 解析器（V2 保留式）。
 *
 * 只把 SillyTavern 导出的预设 JSON 解析并规范化为原始 prompts + prompt_order 结构，
 * 不转译为提示词模块。酒馆消息链由 tavernMessageChainBuilder 消费。
 */

import type { STPreset } from '@/models/stTypes';
import { parseJsonWithRepair } from './jsonRepair';
import { normalizeSTPreset } from './stSettingsNormalizer';

export interface STPresetV2ParseResult {
  preset: STPreset | null;
  usedRepair: boolean;
  error?: string;
}

/**
 * V2 保留式解析入口。
 *
 * 只把 ST JSON 解析并规范化为原始 prompts + prompt_order 结构，
 * 不转译为 promptModules，不修改内置模块，不产生 st_import_*。
 */
export function parseSTPresetV2(jsonText: string): STPresetV2ParseResult {
  const parsed = parseJsonWithRepair(jsonText);
  if (parsed.value === null) {
    return {
      preset: null,
      usedRepair: parsed.usedRepair,
      error: parsed.error ?? 'ST 预设 JSON 解析失败',
    };
  }

  const preset = normalizeSTPreset(parsed.value);
  if (!preset) {
    return {
      preset: null,
      usedRepair: parsed.usedRepair,
      error: '未找到有效的 prompts / prompt_order 结构',
    };
  }

  return {
    preset,
    usedRepair: parsed.usedRepair,
  };
}
