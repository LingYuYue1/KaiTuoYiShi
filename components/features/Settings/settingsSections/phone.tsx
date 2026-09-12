import { Smartphone } from 'lucide-react';

import { PhoneSystemSettingsTab } from '../PhoneSystemSettingsTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function PhoneSection({
  deviceSettings,
  gameSettings,
  onGameSettingsChange,
  onPersistGameSettings,
  fetchModels,
}: SettingsSectionContext) {
  return (
    <PhoneSystemSettingsTab
      settings={gameSettings}
      onChange={onGameSettingsChange}
      apiSettings={deviceSettings.apiSettings}
      onPersistSettings={onPersistGameSettings}
      fetchModels={fetchModels}
    />
  );
}

export const phoneSection: SettingsSectionDefinition = {
  key: 'phone',
  label: '手机系统',
  icon: '▣',
  navIcon: Smartphone,
  group: 'subsystems',
  subtitle: '私聊、群聊与主动来信',
  Component: PhoneSection,
};
