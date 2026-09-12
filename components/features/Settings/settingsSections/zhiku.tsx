import { BookMarked } from 'lucide-react';

import { ZhikuSettingsTab } from '../ZhikuSettingsTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function ZhikuSection({
  deviceSettings,
  gameSettings,
  onGameSettingsChange,
  onPersistGameSettings,
  fetchModels,
}: SettingsSectionContext) {
  return (
    <ZhikuSettingsTab
      settings={gameSettings}
      onChange={onGameSettingsChange}
      apiSettings={deviceSettings.apiSettings}
      onPersistSettings={onPersistGameSettings}
      fetchModels={fetchModels}
    />
  );
}

export const zhikuSection: SettingsSectionDefinition = {
  key: 'zhiku',
  label: '智库',
  icon: '❖',
  navIcon: BookMarked,
  group: 'subsystems',
  subtitle: '原著资料接口',
  Component: ZhikuSection,
};
