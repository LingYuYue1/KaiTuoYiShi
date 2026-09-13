import { getOfficialOpeningPreset } from '@/data/journeyPresets';
import type { 官方开局预设 } from '@/models/journey';

export function requireOfficialOpeningPreset(id: string): 官方开局预设 {
  const preset = getOfficialOpeningPreset(id);
  if (!preset) throw new Error(`缺少官方开局预设：${id}`);
  return preset;
}
