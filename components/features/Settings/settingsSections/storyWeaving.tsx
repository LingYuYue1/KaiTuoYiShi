import { ScrollText } from 'lucide-react';

import { StoryWeavingSettingsTab } from '../StoryWeavingSettingsTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function StoryWeavingSection({
  deviceSettings,
  gameSettings,
  onGameSettingsChange,
  onPersistGameSettings,
  fetchModels,
}: SettingsSectionContext) {
  return (
    <StoryWeavingSettingsTab
      settings={gameSettings}
      onChange={onGameSettingsChange}
      apiSettings={deviceSettings.apiSettings}
      onPersistSettings={onPersistGameSettings}
      fetchModels={fetchModels}
    />
  );
}

export const storyWeavingSection: SettingsSectionDefinition = {
  key: 'storyWeaving',
  label: '剧情编织',
  icon: '❘',
  navIcon: ScrollText,
  group: 'subsystems',
  subtitle: '滑窗注入与剧情 API',
  Component: StoryWeavingSection,
};
