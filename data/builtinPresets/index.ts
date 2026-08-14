/**
 * 内置酒馆预设注册表（V2 保留式结构）。
 *
 * 内置预设以 JSON 文件形式存储，已手工融合。
 * 玩家导入的预设不在本注册表内，运行时存在 state.gameSettings.stPresetsV2 里。
 */

import type { STPreset, STPresetEntryV2 } from '@/models/stTypes';
import shuangrenchenghangPreset from './shuangrenchenghang.json';
import izumiPreset from './izumi.json';

export const BUILTIN_SHUANGRENCHENGHANG_PRESET_ID = 'builtin_shuangrenchenghang_v2';
export const BUILTIN_IZUMI_PRESET_ID = 'builtin_izumi_v2';

export function getBuiltinPresetsV2(): STPresetEntryV2[] {
  return [
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
