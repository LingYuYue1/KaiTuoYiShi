import { apiSection } from './api';
import { apiErrorsSection } from './apiErrors';
import { contextSection } from './context';
import { extraSection } from './extra';
import { gameSection } from './game';
import { memorySection } from './memory';
import { newsSection } from './news';
import { nsfwSection } from './nsfw';
import { phoneSection } from './phone';
import { promptsSection } from './prompts';
import { storageSection } from './storage';
import { storyWeavingSection } from './storyWeaving';
import { tavernPresetsSection } from './tavernPresets';
import { themeSection } from './theme';
import type { SettingsSectionDefinition, SettingsSectionGroup, SettingsTab } from './types';
import { variableUpdateSection } from './variableUpdate';
import { variableRepairSection } from './variableRepair';
import { variablesSection } from './variables';
import { visualSection } from './visual';
import { yitingSection } from './yiting';
import { zhikuSection } from './zhiku';

export const settingsSectionGroups: SettingsSectionGroup[] = [
  { id: 'appearance', label: '外观' },
  { id: 'narrative', label: '叙事' },
  { id: 'connection', label: '接口' },
  { id: 'subsystems', label: '子系统' },
  { id: 'data', label: '数据' },
  { id: 'private', label: '私密' },
];

/** 唯一的页签 → section 映射；SettingsModal 只消费它，不再自带 switch。 */
export const settingsSections: SettingsSectionDefinition[] = [
  visualSection,
  themeSection,
  gameSection,
  promptsSection,
  tavernPresetsSection,
  extraSection,
  apiSection,
  apiErrorsSection,
  variableUpdateSection,
  variableRepairSection,
  memorySection,
  yitingSection,
  newsSection,
  zhikuSection,
  storyWeavingSection,
  phoneSection,
  variablesSection,
  contextSection,
  storageSection,
  nsfwSection,
];

export function getSettingsSection(key: SettingsTab): SettingsSectionDefinition {
  return settingsSections.find((section) => section.key === key) ?? settingsSections[0];
}
