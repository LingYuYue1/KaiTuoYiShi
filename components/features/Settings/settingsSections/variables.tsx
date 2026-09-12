import { Database } from 'lucide-react';

import { VariableManagerTab } from '../VariableManager';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function VariablesSection({
  旅人,
  世界,
  记忆,
  忆庭,
  智库,
  手机,
  NPC,
  新闻,
  剧情编织,
  on剧情编织Change,
  variableSetters,
  variableEditingLocked = false,
}: SettingsSectionContext) {
  return (
    <VariableManagerTab
      旅人={旅人}
      世界={世界}
      记忆={记忆}
      忆庭={忆庭}
      智库={智库}
      手机={手机}
      NPC={NPC}
      新闻={新闻}
      剧情编织={剧情编织}
      set剧情编织={on剧情编织Change}
      setters={variableSetters}
      editingLocked={variableEditingLocked}
    />
  );
}

export const variablesSection: SettingsSectionDefinition = {
  key: 'variables',
  label: '变量管理',
  icon: '◈',
  navIcon: Database,
  group: 'data',
  subtitle: '存档数据查看与调试',
  Component: VariablesSection,
};
