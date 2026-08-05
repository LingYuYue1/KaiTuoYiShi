import { PromptModulesTab } from './PromptModulesTab';
import type { API设置, 游戏设置 } from '@/models/settings';
import type { 世界书 } from '@/models/worldbook';
import type { 剧情模式 } from '@/models/journey';

interface TavernPresetsSettingsTabProps {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  worldbooks: 世界书[];
  onWorldbooksChange: (books: 世界书[]) => void;
  apiSettings: API设置;
  onApiSettingsChange: (s: API设置) => void;
  storyMode?: 剧情模式;
}

export function TavernPresetsSettingsTab(props: TavernPresetsSettingsTabProps) {
  return <PromptModulesTab {...props} mode="tavern" />;
}
