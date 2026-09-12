import { Newspaper } from 'lucide-react';

import { NewsSystemSettingsTab } from '../NewsSystemSettingsTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function NewsSection({
  deviceSettings,
  gameSettings,
  onGameSettingsChange,
  onPersistGameSettings,
  fetchModels,
}: SettingsSectionContext) {
  return (
    <NewsSystemSettingsTab
      settings={gameSettings}
      onChange={onGameSettingsChange}
      apiSettings={deviceSettings.apiSettings}
      onPersistSettings={onPersistGameSettings}
      fetchModels={fetchModels}
    />
  );
}

export const newsSection: SettingsSectionDefinition = {
  key: 'news',
  label: '星际周报',
  icon: '◆',
  navIcon: Newspaper,
  group: 'subsystems',
  subtitle: '新闻接口与生成节流',
  Component: NewsSection,
};
