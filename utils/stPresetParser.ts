import type { 提示词模块 } from '@/models/prompts';
import type { STPreset } from '@/models/stTypes';
import { normalizeSTPreset } from './stSettingsNormalizer';

/** Legacy prompt modules are inert once the V2 Tavern chain owns the preset. */
export function isSTImportedModule(module: 提示词模块): boolean {
  return module.source === 'st_preset' || module.id.startsWith('st_import_');
}

/**
 * Parse and validate one Tavern V2 export.
 *
 * This is deliberately strict: malformed JSON or an incomplete prompt graph
 * is an import error, never a partially usable preset.
 */
export function parseSTPresetV2(jsonText: string): STPreset {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`ST 预设 JSON 解析失败：${message}`);
  }
  return normalizeSTPreset(raw);
}
