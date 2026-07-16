/**
 * Tavern 内置预设注册表。
 *
 * 只有显式选中的 V2 预设才会启用 Tavern 消息链；未选中时没有一个
 * “原生预设”对象参与运行时，因此这里不再注册 V1/native 占位项。
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
      importedAt: 0,
      updatedAt: 0,
      isBuiltin: true,
    },
    {
      id: BUILTIN_IZUMI_PRESET_ID,
      name: 'Izumi 0629',
      preset: izumiPreset as unknown as STPreset,
      importedAt: 0,
      updatedAt: 0,
      isBuiltin: true,
    },
  ];
}
