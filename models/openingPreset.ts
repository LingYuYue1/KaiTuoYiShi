import type { 命途阶段 } from './path';
import type { 战技记录 } from './skill';
import type { 命途ID, 剧情模式, 阵营ID, 开局来源, 自由开局地点来源 } from './journey';

export interface FreeOpeningCustomNpc {
  id: string;
  name: string;
  background: string;
  pathstrider: string;
  ability: string;
}

export interface FreeOpeningWorkshopDraft {
  planet: string;
  location: string;
  planetIntro: string;
  npcDetails: string;
  customNpcName: string;
  customNpcBackground: string;
  customNpcPathstrider: string;
  customNpcAbility: string;
  customNpcs: FreeOpeningCustomNpc[];
  currentGoal: string;
  localConflict: string;
  factions: string;
  worldRules: string;
  tone: string;
}

export interface OpeningPresetDraft {
  openingSource: 开局来源;
  freeOpeningMainlineEnabled: boolean;
  freeOpeningPlanetSource: 自由开局地点来源;
  freeOpeningWorkshop: FreeOpeningWorkshopDraft;
  storyMode: 剧情模式;
  name: string;
  alias: string;
  gender: string;
  age: number;
  birthday: string;
  appearance: string;
  personality: string;
  background: string;
  pathId: 命途ID;
  pathStage: 命途阶段;
  factionId: 阵营ID;
  customIdentity: string;
  selectedAbilityIds: string[];
  customAbilities: string[];
  openingSkills: 战技记录[];
  startingScenarioId: string;
  selectedWorkshopTemplateId: string;
  canonicalTrailblazer: 'stelle' | 'caelus' | 'both';
  customStartPrompt: string;
}

export interface OpeningPlayerPreset {
  id: string;
  title: string;
  updatedAt: number;
  draft: OpeningPresetDraft;
}

export const OPENING_PLAYER_PRESETS_KEY = 'openingPlayerPresets';

