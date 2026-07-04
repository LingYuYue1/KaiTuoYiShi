/**
 * Phase 7：原生内置预设
 *
 * 切换到本预设 = 恢复原生化体验（移除所有 ST 附加模块，恢复内置 CoT/格式）。
 * modules 为空数组：表示不附加任何 ST 段，仅保留游戏自带的 39 个内置模块
 * （这些内置模块本就在 promptModules 里，不需通过预设重复注入）。
 *
 * 特性：
 * - isBuiltin=true：不可删不可导入
 * - presetType='native'：原生内置
 * - 无 samplingParams / assistantPrefill（用 API 配置原值）
 */

import type { STPresetEntry } from '@/models/stTypes';

export const BUILTIN_PRESET_ID = 'builtin_preset';

export function createBuiltinPresetEntry(): STPresetEntry {
  return {
    id: BUILTIN_PRESET_ID,
    name: '开拓轶事内置预设',
    importedAt: 0,
    updatedAt: 0,
    modules: [],
    worldbookEntries: [],
    isBuiltin: true,
    presetType: 'native',
  };
}
