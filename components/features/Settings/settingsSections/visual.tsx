import { Type as TypeIcon } from 'lucide-react';

import { VisualSettingsTab } from '../VisualSettingsTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function VisualSection({ gameSettings, persistGameSettingsChange }: SettingsSectionContext) {
  return <VisualSettingsTab settings={gameSettings} onChange={persistGameSettingsChange} />;
}

export const visualSection: SettingsSectionDefinition = {
  key: 'visual',
  label: '视觉设置',
  icon: '◇',
  navIcon: TypeIcon,
  group: 'appearance',
  subtitle: '正文显示与字号',
  Component: VisualSection,
};
