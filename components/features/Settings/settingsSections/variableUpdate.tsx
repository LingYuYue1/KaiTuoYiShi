import { RefreshCw } from 'lucide-react';

import { VariableUpdateTab } from '../VariableUpdateSettings';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function VariableUpdateSection({
  deviceSettings,
  gameSettings,
  onGameSettingsChange,
  onPersistGameSettings,
  fetchModels,
}: SettingsSectionContext) {
  return (
    <VariableUpdateTab
      gameSettings={gameSettings}
      onGameSettingsChange={onGameSettingsChange}
      apiSettings={deviceSettings.apiSettings}
      onPersistSettings={onPersistGameSettings}
      fetchModels={fetchModels}
    />
  );
}

export const variableUpdateSection: SettingsSectionDefinition = {
  key: 'variableUpdate',
  label: '变量更新',
  icon: '◉',
  navIcon: RefreshCw,
  group: 'subsystems',
  subtitle: '变量模型与落地确认',
  Component: VariableUpdateSection,
};
