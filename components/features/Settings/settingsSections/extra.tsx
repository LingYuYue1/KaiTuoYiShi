import { WandSparkles } from 'lucide-react';

import { ExtraFeaturesSettingsTab } from '../ExtraFeaturesSettingsTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function ExtraSection({ gameSettings, persistGameSettingsChange, onPersistGameSettings }: SettingsSectionContext) {
  return (
    <ExtraFeaturesSettingsTab
      settings={gameSettings}
      onChange={persistGameSettingsChange}
      onPersistSettings={onPersistGameSettings}
    />
  );
}

export const extraSection: SettingsSectionDefinition = {
  key: 'extra',
  label: '额外功能',
  icon: '✦',
  navIcon: WandSparkles,
  group: 'narrative',
  subtitle: '污染词清理与扩展功能',
  Component: ExtraSection,
};
