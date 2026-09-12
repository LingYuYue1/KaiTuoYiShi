import { FileText } from 'lucide-react';

import { PromptModulesTab } from '../PromptModulesTab';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function PromptsSection({ gameSettings, persistGameSettingsChange }: SettingsSectionContext) {
  return <PromptModulesTab settings={gameSettings} onChange={persistGameSettingsChange} />;
}

export const promptsSection: SettingsSectionDefinition = {
  key: 'prompts',
  label: '提示词模块',
  icon: '❘',
  navIcon: FileText,
  group: 'narrative',
  subtitle: 'AI 系统级硬规则',
  fullHeight: true,
  Component: PromptsSection,
};
