import { Cable } from 'lucide-react';

import { ApiSettingsOverviewTab } from '../ApiSettingsOverview';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function ApiSection(ctx: SettingsSectionContext) {
  return (
    <ApiSettingsOverviewTab
      deviceSettings={ctx.deviceSettings}
      onChange={ctx.onApiSettingsChange}
      onGameSettingsChange={ctx.persistGameSettingsChange}
      onPersistApiSettings={ctx.onPersistApiSettings}
      onPersistGameSettings={ctx.onPersistGameSettings}
      onPersistApiProfile={ctx.onPersistApiProfile}
      onLoadApiProfileSlots={ctx.onLoadApiProfileSlots}
      onPersistApiProfileSlots={ctx.onPersistApiProfileSlots}
      onLoadAuxApiProfiles={ctx.onLoadAuxApiProfiles}
      onPersistAuxApiProfiles={ctx.onPersistAuxApiProfiles}
      fetchModels={ctx.fetchModels}
      testConnection={ctx.testConnection}
    />
  );
}

export const apiSection: SettingsSectionDefinition = {
  key: 'api',
  label: 'API 接口',
  icon: '✦',
  navIcon: Cable,
  group: 'connection',
  subtitle: '主模型、密钥与连接配置',
  Component: ApiSection,
};
