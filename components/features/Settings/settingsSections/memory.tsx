import { Brain } from 'lucide-react';

import { MemorySystemSettingsTab } from '../MemorySystemSettings';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function MemorySection({
  deviceSettings,
  gameSettings,
  onGameSettingsChange,
  onPersistGameSettings,
  fetchModels,
  testConnection,
}: SettingsSectionContext) {
  return (
    <MemorySystemSettingsTab
      settings={gameSettings}
      onChange={onGameSettingsChange}
      apiSettings={deviceSettings.apiSettings}
      onPersistSettings={onPersistGameSettings}
      fetchModels={fetchModels}
      testConnection={testConnection}
    />
  );
}

export const memorySection: SettingsSectionDefinition = {
  key: 'memory',
  label: '记忆系统',
  icon: '◈',
  navIcon: Brain,
  group: 'subsystems',
  subtitle: '压缩阈值与记忆 API',
  Component: MemorySection,
};
