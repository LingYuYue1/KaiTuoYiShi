export interface CharacterPreset {
  id: string;
  name: string;
  originTime: string;
  originOccupation: string;
  appearance: string;
  personality: string;
  background: string;
}

// 角色预设已清空，等待 HSR 题材重构（开拓者身份模板）。
export const characterPresets: CharacterPreset[] = [];

export function getCharacterPresetById(id: string): CharacterPreset | undefined {
  return characterPresets.find((p) => p.id === id);
}
