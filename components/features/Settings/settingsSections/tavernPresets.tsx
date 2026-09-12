import { Import as ImportIcon } from 'lucide-react';

import { TavernPresetsSettingsTab } from '../TavernPresetsSettingsTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function TavernPresetsSection({
  gameSettings,
  persistGameSettingsChange,
  deviceSettings,
  onWorldbooksChange,
  onExtractTavernRegexScripts,
  onAnalyzeTavernRegexScript,
  onDryRunTavernRegexScript,
}: SettingsSectionContext) {
  return (
    <TavernPresetsSettingsTab
      settings={gameSettings}
      onChange={persistGameSettingsChange}
      worldbooks={deviceSettings.worldbooks}
      onWorldbooksChange={onWorldbooksChange}
      onExtractTavernRegexScripts={onExtractTavernRegexScripts}
      onAnalyzeTavernRegexScript={onAnalyzeTavernRegexScript}
      onDryRunTavernRegexScript={onDryRunTavernRegexScript}
    />
  );
}

export const tavernPresetsSection: SettingsSectionDefinition = {
  key: 'tavernPresets',
  label: '酒馆预设',
  icon: '◆',
  navIcon: ImportIcon,
  group: 'narrative',
  subtitle: 'ST 导入与消息链',
  fullHeight: true,
  Component: TavernPresetsSection,
};
