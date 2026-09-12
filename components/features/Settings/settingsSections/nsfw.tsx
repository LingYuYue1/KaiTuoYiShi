import { ShieldAlert } from 'lucide-react';

import { NsfwSettingsTab } from '../NsfwSettingsTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function NsfwSection({ gameSettings, persistGameSettingsChange, onPersistGameSettings }: SettingsSectionContext) {
  return (
    <NsfwSettingsTab
      settings={gameSettings}
      onChange={persistGameSettingsChange}
      onPersistSettings={onPersistGameSettings}
    />
  );
}

export const nsfwSection: SettingsSectionDefinition = {
  key: 'nsfw',
  label: 'NSFW',
  icon: '◇',
  navIcon: ShieldAlert,
  group: 'private',
  subtitle: '成人内容与私密档案',
  Component: NsfwSection,
};
