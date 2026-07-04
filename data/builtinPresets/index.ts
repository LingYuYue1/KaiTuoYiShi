/**
 * Phase 7：内置预设注册表
 *
 * 管理所有内置预设（原生 + 二创成品）。玩家导入的预设不在本注册表内，
 * 它们运行时存在 state.gameSettings.stPresets 里。
 *
 * 内置预设特性：
 * - isBuiltin=true：不可删不可导入
 * - presetType：'native'（原生内置）/ 'adapted'（二创成品）
 * - 二创成品以 JSON 文件形式存储，已手工融合，不需要运行时融合
 */

import type { STMessageRole, STPreset, STPresetEntry, STPresetEntryV2, STPresetPrompt } from '@/models/stTypes';
import { createBuiltinPresetEntry } from './builtinPreset';
import shuangrenchenghangPreset from './shuangrenchenghang.json';
import izumiPreset from './izumi.json';

export const BUILTIN_SHUANGRENCHENGHANG_PRESET_ID = 'builtin_shuangrenchenghang_v2';
export const BUILTIN_IZUMI_PRESET_ID = 'builtin_izumi_v2';

/**
 * 获取所有内置预设。
 *
 * 返回顺序：原生内置预设在前，二创成品预设在后。
 * UI 层可据此排序展示。
 */
export function getBuiltinPresets(): STPresetEntry[] {
  return [
    createBuiltinPresetEntry(),
  ];
}

/**
 * 判断预设 id 是否为内置预设。
 */
export function isBuiltinPreset(id: string): boolean {
  return getBuiltinPresets().some((p) => p.id === id);
}

/**
 * 根据 id 获取内置预设。找不到返回 undefined。
 */
export function getBuiltinPresetById(id: string): STPresetEntry | undefined {
  return getBuiltinPresets().find((p) => p.id === id);
}

function normalizeMessageRole(role: unknown): STMessageRole {
  return role === 'user' || role === 'assistant' ? role : 'system';
}

function toV2PromptIdentifier(moduleId: string, index: number): string {
  return moduleId.replace(/^st_import_/, '').replace(/^adapted_/, 'adapted_') || `prompt_${index + 1}`;
}

function convertBuiltinPresetToV2(entry: STPresetEntry): STPresetEntryV2 | null {
  if (entry.presetType === 'native' || entry.modules.length === 0) return null;
  const prompts: STPresetPrompt[] = entry.modules
    .filter((module) => module.enabled !== false)
    .filter((module) => typeof module.content === 'string' && module.content.trim())
    .map((module, index) => ({
      identifier: toV2PromptIdentifier(module.id, index),
      name: module.title,
      role: normalizeMessageRole(module.role),
      content: module.content,
      injection_position: module.injectionPosition,
      injection_depth: module.injectionDepth,
      injection_order: module.injectionOrder,
    }));
  if (prompts.length === 0) return null;
  return {
    id: `${entry.id}_v2`,
    name: `${entry.name} · V2消息链`,
    preset: {
      prompts,
      prompt_order: [{
        character_id: 100001,
        order: prompts.map((prompt) => ({ identifier: prompt.identifier, enabled: true })),
      }],
    },
    characterId: 100001,
    importedAt: entry.importedAt,
    updatedAt: entry.updatedAt,
    isBuiltin: true,
  };
}

export function getBuiltinPresetsV2(): STPresetEntryV2[] {
  const converted = getBuiltinPresets()
    .map(convertBuiltinPresetToV2)
    .filter((entry): entry is STPresetEntryV2 => entry !== null);
  return [
    ...converted,
    {
      id: BUILTIN_SHUANGRENCHENGHANG_PRESET_ID,
      name: '双人成行v10.0—青云上',
      preset: shuangrenchenghangPreset as unknown as STPreset,
      characterId: 100001,
      importedAt: 0,
      updatedAt: 0,
      isBuiltin: true,
    },
    {
      id: BUILTIN_IZUMI_PRESET_ID,
      name: 'Izumi 0629',
      preset: izumiPreset as unknown as STPreset,
      characterId: 100001,
      importedAt: 0,
      updatedAt: 0,
      isBuiltin: true,
    },
  ];
}
