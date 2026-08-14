import type { 命途ID, 剧情模式, 阵营ID, 开局来源, 自由开局地点来源 } from '@/models/journey';
import type { 命途阶段 } from '@/models/path';
import type { 开局整理档案 } from '@/models/world';
import type { 战技记录 } from '@/models/skill';

export type CanonicalTrailblazer = 'stelle' | 'caelus' | 'both';

export type OpeningSource = 开局来源;

export type FreeOpeningPlanetSource = 自由开局地点来源;

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

export interface FreeOpeningCustomNpc {
  id: string;
  name: string;
  background: string;
  pathstrider: string;
  ability: string;
}

export interface OpeningPresetDraft {
  openingSource: OpeningSource;
  freeOpeningMainlineEnabled: boolean;
  freeOpeningPlanetSource: FreeOpeningPlanetSource;
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
  canonicalTrailblazer: CanonicalTrailblazer;
  customStartPrompt: string;
  /** AI 整理的开局档案（自由/创意工坊开局）。由门面 handleParseOpeningArchive 产出，null 表示跳过/失败，走本地整理兜底。 */
  parsedArchive: 开局整理档案 | null;
}

export interface OpeningPlayerPreset {
  id: string;
  title: string;
  updatedAt: number;
  draft: OpeningPresetDraft;
}
