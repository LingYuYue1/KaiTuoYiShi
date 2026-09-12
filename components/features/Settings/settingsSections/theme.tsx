import { Palette } from 'lucide-react';

import { ThemeSettingsTab } from '../ThemeSettings';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function ThemeSection({ deviceSettings, persistThemeChange }: SettingsSectionContext) {
  return <ThemeSettingsTab current={deviceSettings.theme} onChange={persistThemeChange} />;
}

export const themeSection: SettingsSectionDefinition = {
  key: 'theme',
  label: '主题风格',
  icon: '◇',
  navIcon: Palette,
  group: 'appearance',
  subtitle: '配色与氛围',
  Component: ThemeSection,
};
