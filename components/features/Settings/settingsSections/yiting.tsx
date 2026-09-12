import { Sparkles } from 'lucide-react';

import { YitingSettingsTab } from '../YitingSettingsTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function YitingSection({
  deviceSettings,
  gameSettings,
  onGameSettingsChange,
  onPersistGameSettings,
  fetchModels,
  testConnection,
}: SettingsSectionContext) {
  return (
    <YitingSettingsTab
      settings={gameSettings}
      onChange={onGameSettingsChange}
      apiSettings={deviceSettings.apiSettings}
      onPersistSettings={onPersistGameSettings}
      fetchModels={fetchModels}
      testConnection={testConnection}
    />
  );
}

export const yitingSection: SettingsSectionDefinition = {
  key: 'yiting',
  label: '忆庭',
  icon: '✧',
  navIcon: Sparkles,
  group: 'subsystems',
  subtitle: '回忆库与召回',
  Component: YitingSection,
};
