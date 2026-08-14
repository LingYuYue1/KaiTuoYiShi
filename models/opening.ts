import type { 命途ID, 剧情模式, 阵营ID, 开局来源, 自由开局地点来源, 官方开局预设, 起始场景 } from '@/models/journey';
import { PATH_STAGE_DEFS, type 命途阶段 } from '@/models/path';
import type { 开局整理档案, 世界状态 } from '@/models/world';
import type { 战技记录 } from '@/models/skill';
import {
  abilityPresets,
  factions,
  getFaction,
  getOfficialOpeningPreset,
  getOfficialOpeningPresetByChapterId,
  getOpeningScenarioBundle,
  getPath,
  getStartingScenario,
  getStoryMode,
  storyModes,
} from '@/data/journeyPresets';

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

/**
 * 开局纯数据/纯函数聚合（GitHub #15 迁移自 wizardData / newGameInitialization）：
 * 不含 UI/组件逻辑，供 services、hooks 与 wizard 侧共用。
 */

/** 原著主角选项表（id/title/subtitle/worldValue）。 */
export const CANONICAL_TRAILBLAZERS: {
  id: CanonicalTrailblazer;
  title: string;
  subtitle: string;
  worldValue: 世界状态['原著主角'];
}[] = [
  { id: 'stelle', title: '星', subtitle: '女主角', worldValue: '星' },
  { id: 'caelus', title: '穹', subtitle: '男主角', worldValue: '穹' },
  { id: 'both', title: '小孩子才做选择', subtitle: '星与穹都存在', worldValue: '星穹双主角' },
];

/** 自由开局工作台草稿 → 提示词文本（workshop 来源时并入 玩家切入说明）。 */
export function formatFreeOpeningWorkshopDraft(draft: FreeOpeningWorkshopDraft, source: FreeOpeningPlanetSource): string {
  const npcRows = draft.customNpcs
    .map((npc, index) => {
      const lines = [
        npc.name.trim() ? `名字：${npc.name.trim()}` : `未命名 NPC ${index + 1}`,
        npc.background.trim() ? `背景：${npc.background.trim()}` : '',
        npc.pathstrider.trim() ? `是否为命途行者：${npc.pathstrider.trim()}` : '',
        npc.ability.trim() ? `能力：${npc.ability.trim()}` : '',
      ].filter(Boolean);
      return lines.length ? `${index + 1}. ${lines.join('；')}` : '';
    })
    .filter(Boolean);
  const rows: Array<[string, string]> = source === 'custom' ? [
    ['自创地点/星球', draft.planet],
    ['起始地点', draft.location],
    ['地点简介', draft.planetIntro],
    ['补充自制NPC', npcRows.join('；')],
    ['当前目标', draft.currentGoal],
    ['局部冲突', draft.localConflict],
    ['组织势力', draft.factions],
    ['世界规则', draft.worldRules],
    ['氛围语气', draft.tone],
  ] : [
    ['起始地点', draft.location],
    ['补充自制NPC', npcRows.join('；')],
  ];
  const content = rows
    .map(([label, value]) => {
      const text = value.trim();
      return text ? `${label}：${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
  return content ? `【开局工作台】\n${content}` : '';
}

/** 合并 玩家切入说明 与 自由开局工作台文本（各取去空白后的非空段，双换行拼接）。 */
export function mergeFreeOpeningPrompt(baseText: string, workshopText: string): string {
  const parts = [baseText.trim(), workshopText.trim()].filter(Boolean);
  return parts.join('\n\n');
}

/** 按 id 取原著主角选项，未知 id 兜底第一项。 */
export function getCanonicalTrailblazer(id: CanonicalTrailblazer) {
  return CANONICAL_TRAILBLAZERS.find((item) => item.id === id) ?? CANONICAL_TRAILBLAZERS[0];
}

/** 开局摘要行：worldState.全局事件 的 extraFacts 素材（纯派生，不含副作用）。 */
export function buildOpeningSummary({
  scenario,
  location,
  currentDate,
  currentTime,
  storyMode,
  path,
  pathStage,
  faction,
  customIdentity,
  canonicalTrailblazer,
  customStartPrompt,
  abilities,
  skills,
}: {
  scenario?: 起始场景;
  location?: string;
  currentDate: string;
  currentTime: string;
  storyMode: string;
  path?: ReturnType<typeof getPath>;
  pathStage?: (typeof PATH_STAGE_DEFS)[number];
  faction?: ReturnType<typeof getFaction>;
  customIdentity?: string;
  canonicalTrailblazer?: 世界状态['原著主角'];
  customStartPrompt?: string;
  abilities: string[];
  skills?: 战技记录[];
}): string[] {
  const lines: string[] = [];
  lines.push(`起点：${scenario?.name ?? '未选择'}`);
  if (scenario?.description) lines.push(`场景：${scenario.description}`);
  lines.push(`底色：${storyMode}`);
  lines.push(`日期：${currentDate}`);
  lines.push(`时间：${currentTime}`);
  lines.push(`地点：${location ?? scenario?.name ?? '未选择'}`);
  lines.push(`原著主角：${canonicalTrailblazer ?? '未指定'}`);
  if (path) {
    lines.push(`命途：${path.name} · ${path.aeon}`);
    if (pathStage) lines.push(`命途阶段：${pathStage.name} · ${pathStage.title}`);
  } else {
    lines.push('命途：无命途');
  }
  if (faction) {
    lines.push(`组织背景：${faction.name}`);
    if (faction.openingHint) lines.push(`组织提示：${faction.openingHint}`);
  }
  if (customIdentity?.trim()) lines.push(`身份：${customIdentity.trim()}`);
  if (customStartPrompt?.trim()) lines.push(`切入说明：${customStartPrompt.trim()}`);
  lines.push(`能力：${abilities.length ? abilities.join('、') : '暂未选择'}`);
  lines.push(`开局战技：${skills?.length ? skills.map((skill) => skill.名称).join('、') : '暂未登记'}`);
  if (scenario?.openingHighlights?.length) {
    for (const item of scenario.openingHighlights) {
      lines.push(`场景要点：${item}`);
    }
  }
  return lines;
}

/** 解析所选开局场景对应的官方预设：章节锚点 → 场景官方PresetId → 场景id，逐级兜底。 */
export function resolveSelectedScenarioPreset(startingScenarioId: string, selectedScenario?: 起始场景): 官方开局预设 | undefined {
  return getOfficialOpeningPresetByChapterId(startingScenarioId)
    ?? (selectedScenario?.officialPresetId ? getOfficialOpeningPreset(selectedScenario.officialPresetId) : undefined)
    ?? getOfficialOpeningPresetByChapterId(selectedScenario?.id ?? '');
}

/**
 * 开局 draft → 全部派生值（原 NewGameWizard.handleStart 的组装前置 + openingSummaryLines memo）。
 * 纯领域派生，供 handleParseOpeningArchive 与 createInitialWorkspace(fresh) 共用，避免两处重复推导。
 */
export function deriveOpeningDraftContext(draft: OpeningPresetDraft) {
  const storyModeDef = getStoryMode(draft.storyMode) ?? storyModes[0];
  const selectedPath = getPath(draft.pathId);
  const selectedPathStage = PATH_STAGE_DEFS.find((item) => item.stage === draft.pathStage) ?? PATH_STAGE_DEFS[0];
  const selectedFaction = getFaction(draft.factionId) ?? factions[0];
  const selectedScenario = getStartingScenario(draft.startingScenarioId);
  const selectedScenarioPreset = resolveSelectedScenarioPreset(draft.startingScenarioId, selectedScenario);
  const scenarioBundle = getOpeningScenarioBundle(draft.startingScenarioId);
  const scenarioPreset = selectedScenarioPreset ?? scenarioBundle.preset;
  const selectedOpeningDate = scenarioPreset?.referenceDate ?? '琥珀纪 2157.03.07';
  const selectedOpeningTime = scenarioPreset?.referenceTime ?? '06:40';
  const selectedOpeningLocation =
    scenarioPreset?.defaultLocationHint
    ?? scenarioBundle.chapter?.defaultLocationHint
    ?? selectedScenario?.name
    ?? '黑塔空间站';
  const selectedOpeningTitle =
    scenarioPreset?.title
    ?? (scenarioBundle.region && scenarioBundle.chapter
      ? `${scenarioBundle.region.name} · ${scenarioBundle.chapter.name}`
      : selectedScenario?.name)
    ?? '未选择';
  const selectedAbilityNames = [
    ...draft.selectedAbilityIds
      .map((id) => abilityPresets.find((ability) => ability.id === id)?.name)
      .filter((text): text is string => Boolean(text)),
    ...draft.customAbilities,
  ];
  const freeOpeningWorkshopText = formatFreeOpeningWorkshopDraft(draft.freeOpeningWorkshop, draft.freeOpeningPlanetSource);
  const effectiveCustomStartPrompt = mergeFreeOpeningPrompt(draft.customStartPrompt, draft.openingSource !== 'official_preset' ? freeOpeningWorkshopText : '');
  const effectiveFreeMainlineEnabled = draft.openingSource === 'official_preset' || draft.freeOpeningMainlineEnabled;
  const canonicalName = getCanonicalTrailblazer(draft.canonicalTrailblazer).worldValue;
  const openingSummaryLines = buildOpeningSummary({
    scenario: selectedScenarioPreset
      ? {
          id: selectedScenarioPreset.chapterId,
          name: selectedScenarioPreset.title,
          description: selectedScenarioPreset.summary,
          openingHighlights: selectedScenarioPreset.openingPressure,
        }
      : scenarioBundle.chapter
        ? {
            id: scenarioBundle.chapter.id,
            name: scenarioBundle.chapter.name,
            description: scenarioBundle.chapter.summary,
            openingHighlights: scenarioBundle.chapter.openingPressure,
          }
        : selectedScenario ?? {
            id: draft.startingScenarioId,
            name: selectedOpeningTitle,
            description: '',
            openingHighlights: [],
          },
    location: selectedOpeningLocation,
    currentDate: selectedOpeningDate,
    currentTime: selectedOpeningTime,
    storyMode: storyModeDef.name,
    path: selectedPath,
    pathStage: draft.pathId !== 'none' ? selectedPathStage : undefined,
    faction: selectedFaction,
    customIdentity: draft.customIdentity,
    customStartPrompt: effectiveCustomStartPrompt,
    canonicalTrailblazer: canonicalName,
    abilities: selectedAbilityNames,
    skills: draft.openingSkills,
  });
  const freeOpeningInput = {
    regionId: scenarioPreset?.regionId ?? scenarioBundle.region?.id ?? 'herta_space_station',
    regionName: scenarioPreset?.regionName ?? scenarioBundle.region?.name ?? '黑塔空间站',
    chapterId: scenarioPreset?.chapterId ?? scenarioBundle.chapter?.id ?? (draft.startingScenarioId || 'herta_station_incident'),
    chapterName: scenarioPreset?.chapterName ?? scenarioBundle.chapter?.name ?? selectedScenario?.name ?? '黑塔空间站 · 主线苏醒前夕',
    chapterSummary: scenarioPreset?.summary ?? scenarioBundle.chapter?.summary ?? selectedScenario?.description ?? '',
    playerText: effectiveCustomStartPrompt,
    defaultLocationHint: selectedOpeningLocation,
    defaultDateHint: selectedOpeningDate,
    defaultTimeHint: selectedOpeningTime,
    officialPresetId: scenarioPreset?.id,
    workshopTemplateId: draft.openingSource === 'workshop' ? draft.selectedWorkshopTemplateId : undefined,
    priorStoryState: scenarioBundle.chapter?.priorStoryState,
    planetSource: draft.freeOpeningPlanetSource,
    mainlineEnabled: effectiveFreeMainlineEnabled,
    keyNpcs: scenarioPreset?.keyNpcs ?? scenarioBundle.preset?.keyNpcs ?? selectedScenario?.openingHighlights ?? [],
  };
  return {
    storyModeDef,
    selectedPath,
    selectedPathStage,
    selectedFaction,
    selectedScenario,
    selectedScenarioPreset,
    scenarioPreset,
    scenarioBundle,
    selectedOpeningDate,
    selectedOpeningTime,
    selectedOpeningLocation,
    selectedOpeningTitle,
    selectedAbilityNames,
    effectiveCustomStartPrompt,
    effectiveFreeMainlineEnabled,
    canonicalName,
    openingSummaryLines,
    freeOpeningInput,
  };
}
