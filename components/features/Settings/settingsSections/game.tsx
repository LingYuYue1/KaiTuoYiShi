import { BookOpen } from 'lucide-react';

import { GameSettingsTab } from '../GameSettings';
import type { SettingsSectionContext, SettingsSectionDefinition } from './types';

function GameSection({
  gameSettings,
  persistGameSettingsChange,
  onPersistGameSettings,
  世界,
  on世界Change,
}: SettingsSectionContext) {
  return (
    <GameSettingsTab
      settings={gameSettings}
      onChange={persistGameSettingsChange}
      onPersistSettings={onPersistGameSettings}
      worldState={世界}
      onWorldStateChange={on世界Change}
    />
  );
}

export const gameSection: SettingsSectionDefinition = {
  key: 'game',
  label: '游戏设定',
  icon: '❖',
  navIcon: BookOpen,
  group: 'narrative',
  subtitle: '叙述风格与人格',
  Component: GameSection,
};
