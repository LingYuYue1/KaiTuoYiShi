import { PromptSettingsSurface } from './PromptSettingsSurface';
import type { 游戏设置 } from '@/models/settings';

interface TavernPresetSettingsSurfaceProps {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
}

export function TavernPresetSettingsSurface(props: TavernPresetSettingsSurfaceProps) {
  return <PromptSettingsSurface {...props} mode="tavern" />;
}
