import { PATH_STAGE_DEFS, type 命途阶段 } from '@/models/path';
import type { 世界状态 } from '@/models/world';
import type { 命途ID, 剧情模式, 阵营ID, 开局来源, 自由开局地点来源, 官方开局预设 } from '@/models/journey';
import { abilityPresets, getOfficialOpeningPreset, getOfficialOpeningPresetByChapterId, openingChapterAnchors, getWorkshopOpeningTemplatesByRegion, factions, getFaction, getPath, paths, startingScenarios, storyModes, workshopOpeningTemplates } from '@/data/journeyPresets';
import { 归一化战技记录, type 战技记录, type 战技槽位摘要 } from '@/models/skill';

export type Step = 'character' | 'path' | 'skill' | 'world' | 'historian' | 'overview';

export type CanonicalTrailblazer = 'stelle' | 'caelus' | 'both';

export type OpeningScenario = (typeof startingScenarios)[number];

export type OpeningChapterAnchor = (typeof openingChapterAnchors)[number];

export type OpeningDisplayScenario = OpeningScenario | OpeningChapterAnchor;

export type OpeningSource = 开局来源;

export type FreeOpeningPlanetSource = 自由开局地点来源;

export type OpeningSkillSlotKey = `normal:${number}` | `path:${命途ID}:${number}`;

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

export interface FreeOpeningCustomNpc {
  id: string;
  name: string;
  background: string;
  pathstrider: string;
  ability: string;
}

export interface OpeningPlayerPreset {
  id: string;
  title: string;
  updatedAt: number;
  draft: OpeningPresetDraft;
}

export const STEPS: Step[] = ['character', 'path', 'skill', 'historian', 'world', 'overview'];

export const OPENING_PLAYER_PRESETS_KEY = 'openingPlayerPresets';

export const MAX_OPENING_PLAYER_PRESETS = 20;

export const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  character: { title: '玩家档案', subtitle: '写下主角的身份底稿' },
  path: { title: '命途能力', subtitle: '命途阶段、能力与战技' },
  skill: { title: '战技创作', subtitle: '写下开局战技与其限制' },
  historian: { title: '其他选项', subtitle: '原著主角、组织背景与模式预留' },
  world: { title: '开局锚点', subtitle: '开局来源、地区章节与玩家切入点' },
  overview: { title: '整理确认', subtitle: '确认后写入长期开局档案' },
};

export const STEP_RAIL_ITEMS: { key: Step; title: string; subtitle: string }[] = [
  { key: 'character', title: '玩家档案', subtitle: '身份、外貌、性格、背景' },
  { key: 'path', title: '命途能力', subtitle: '命途阶段、能力与战技' },
  { key: 'skill', title: '战技创作', subtitle: '开局战技与限制描写' },
  { key: 'historian', title: '其他选项', subtitle: '原著主角、组织背景、模式预留' },
  { key: 'world', title: '开局锚点', subtitle: '来源、地区、章节与切入' },
  { key: 'overview', title: '整理确认', subtitle: 'AI/本地结构化开局档案' },
];

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

export const FREE_OPENING_PLANET_SOURCE_OPTIONS: Array<{
  id: FreeOpeningPlanetSource;
  title: string;
  text: string;
}> = [
  { id: 'existing', title: '已有地点', text: '从黑塔空间站、雅利洛-VI、仙舟罗浮、匹诺康尼等已有关联地点切入。' },
  { id: 'custom', title: '自创地点', text: '开启原创舞台工作台，由玩家自建地点、NPC、势力与规则。' },
];

export const DEFAULT_FREE_OPENING_WORKSHOP: FreeOpeningWorkshopDraft = {
  planet: '',
  location: '',
  planetIntro: '',
  npcDetails: '',
  customNpcName: '',
  customNpcBackground: '',
  customNpcPathstrider: '',
  customNpcAbility: '',
  customNpcs: [],
  currentGoal: '',
  localConflict: '',
  factions: '',
  worldRules: '',
  tone: '',
};

export const cardClip =
  'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)';

export const smallClip =
  'polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px)';

export const tightClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

export const openingPageBackground =
  'radial-gradient(circle at 16% 4%, rgba(var(--tj-btn-primary-start), 0.16), transparent 28%), radial-gradient(circle at 84% 12%, rgba(var(--tj-tech-blue), 0.16), transparent 34%), radial-gradient(circle at 54% 110%, rgba(var(--tj-btn-primary-end), 0.11), transparent 38%), linear-gradient(180deg, rgb(var(--tj-bg-secondary)), rgb(var(--tj-bg-primary)))';

export const openingPageOverlay =
  'linear-gradient(rgba(var(--tj-btn-primary-start), 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.07) 1px, transparent 1px)';

export const openingPanelBackground =
  'linear-gradient(180deg, rgba(var(--tj-ui-panel), 0.80), rgba(var(--tj-panel-bg-end), 0.92)), radial-gradient(circle at top left, rgba(var(--tj-btn-primary-start), 0.10), transparent 36%)';

export const openingSoftPanelBackground = 'rgba(var(--tj-surface), 0.58)';

export const openingGlowLine =
  'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.25), transparent 18% 82%, rgba(var(--tj-btn-primary-end), 0.18))';

export const openingPanelShadow =
  'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.24), inset 0 0 28px rgba(var(--tj-btn-primary-start), 0.025), 0 16px 36px rgba(0, 0, 0, 0.30)';

export const openingPanelShadowStrong =
  'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.28), inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.45), 0 18px 44px rgba(0, 0, 0, 0.34)';

export const openingCardBackground =
  'linear-gradient(180deg, rgba(var(--tj-ui-panel), 0.76), rgba(var(--tj-surface-bg-end), 0.88))';

export const openingActiveCardBackground =
  'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.18), rgba(var(--tj-btn-primary-end), 0.10)), rgba(var(--tj-surface-bg-end), 0.9)';

export const openingCardBorder = 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.16)';

export const openingCyanBorder = 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.52), 0 0 20px rgba(var(--tj-btn-primary-start), 0.10)';

export function getFreeOpeningPlanetSourceOption(id: FreeOpeningPlanetSource) {
  return FREE_OPENING_PLANET_SOURCE_OPTIONS.find((item) => item.id === id) ?? FREE_OPENING_PLANET_SOURCE_OPTIONS[0];
}

export function getOpeningRegionDisplayName(regionName?: string): string {
  if (regionName === '贝洛伯格') return '雅利洛-VI';
  if (regionName === '罗浮仙舟') return '仙舟罗浮';
  return regionName || '未指定地点';
}

export function getOpeningDisplaySummary(item: OpeningDisplayScenario): string {
  return 'description' in item ? item.description : item.summary;
}

export function getOpeningDisplayHighlights(item: OpeningDisplayScenario): string[] {
  if ('openingHighlights' in item) return item.openingHighlights ?? [];
  if ('openingPressure' in item) return item.openingPressure;
  return [];
}

export function getOpeningOfficialChapterName(item: OpeningDisplayScenario): string {
  if ('officialChapterName' in item && item.officialChapterName) return item.officialChapterName;
  const chapter = openingChapterAnchors.find((anchor) => anchor.id === item.id);
  return chapter?.officialChapterName ?? '原作主线锚点';
}

export function getOpeningOfficialChapterPhase(item: OpeningDisplayScenario): string {
  if ('officialChapterPhase' in item && item.officialChapterPhase) return item.officialChapterPhase;
  const chapter = openingChapterAnchors.find((anchor) => anchor.id === item.id);
  return chapter?.officialChapterPhase ?? '';
}

export function getOpeningChapterBadge(item: OpeningDisplayScenario): string {
  const chapterName = getOpeningOfficialChapterName(item);
  const phase = getOpeningOfficialChapterPhase(item);
  return phase ? `${chapterName} · ${phase}` : chapterName;
}

export function getOpeningPriorStoryState(item: OpeningDisplayScenario): string {
  if ('priorStoryState' in item && item.priorStoryState) return item.priorStoryState;
  const chapter = openingChapterAnchors.find((anchor) => anchor.id === item.id);
  return chapter?.priorStoryState ?? '该锚点之前的原作章节仅作既成背景，不进入正文转跳推进。';
}

export function selectOpeningScenario(
  item: OpeningDisplayScenario,
  openingSource: OpeningSource,
  filteredWorkshopTemplates: ReturnType<typeof getWorkshopOpeningTemplatesByRegion>,
  onStartingScenarioId: (id: string) => void,
  onSelectedWorkshopTemplateId: (id: string) => void,
) {
  onStartingScenarioId(item.id);
  if (openingSource === 'workshop') {
    const matchingTemplate = filteredWorkshopTemplates.find((template) => template.chapterId === item.id);
    if (matchingTemplate) onSelectedWorkshopTemplateId(matchingTemplate.id);
  }
}

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

export function mergeFreeOpeningPrompt(baseText: string, workshopText: string): string {
  const parts = [baseText.trim(), workshopText.trim()].filter(Boolean);
  return parts.join('\n\n');
}

export function toOpeningSkillSlotKey(slot: 战技槽位摘要): OpeningSkillSlotKey {
  return slot.kind === 'normal'
    ? `normal:${slot.slotIndex}`
    : `path:${slot.pathId ?? 'none'}:${slot.slotIndex}`;
}

export function resolveOpeningSkillSlot(slots: 战技槽位摘要[], key: OpeningSkillSlotKey): 战技槽位摘要 | undefined {
  const [kind, pathOrIndex, maybeIndex] = key.split(':');
  if (kind === 'normal') {
    return slots.find((slot) => slot.kind === 'normal' && slot.slotIndex === Number(pathOrIndex));
  }
  return slots.find((slot) => slot.kind === 'path' && slot.pathId === pathOrIndex && slot.slotIndex === Number(maybeIndex));
}

export function openingSkillSlotTitle(slot: 战技槽位摘要): string {
  if (slot.kind === 'normal') return `普通战技槽 ${slot.slotIndex}`;
  const pathDef = slot.pathId ? getPath(slot.pathId) : undefined;
  return `${pathDef?.name ?? '命途'}战技槽 ${slot.slotIndex}`;
}

export function openingSkillRecordSlotLabel(skill: 战技记录): string {
  if (skill.槽位类型 === 'normal') return `普通战技槽 ${skill.槽位序号}`;
  const pathDef = skill.关联命途 ? getPath(skill.关联命途) : undefined;
  return `${pathDef?.name ?? '命途'}战技槽 ${skill.槽位序号}`;
}

export function sameOpeningSkillSlot(a: 战技记录, b: 战技记录): boolean {
  if (a.id === b.id) return false;
  if (a.槽位类型 !== b.槽位类型) return false;
  if (a.槽位序号 !== b.槽位序号) return false;
  if (a.槽位类型 === 'normal') return true;
  return a.关联命途 === b.关联命途;
}

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
  scenario?: OpeningScenario;
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

export function getCanonicalTrailblazer(id: CanonicalTrailblazer) {
  return CANONICAL_TRAILBLAZERS.find((item) => item.id === id) ?? CANONICAL_TRAILBLAZERS[0];
}

export function resolveSelectedScenarioPreset(startingScenarioId: string, selectedScenario?: OpeningScenario): 官方开局预设 | undefined {
  return getOfficialOpeningPresetByChapterId(startingScenarioId)
    ?? (selectedScenario?.officialPresetId ? getOfficialOpeningPreset(selectedScenario.officialPresetId) : undefined)
    ?? getOfficialOpeningPresetByChapterId(selectedScenario?.id ?? '');
}

export function formatCustomAbilityEntry(name: string, effect: string): string {
  return `${name.trim()}：${effect.trim()}`;
}

export function splitCustomAbilityEntry(text: string): { name: string; effect: string } {
  const normalized = text.trim();
  const separatorIndex = normalized.search(/[：:]/);
  if (separatorIndex < 0) return { name: normalized, effect: '' };
  return {
    name: normalized.slice(0, separatorIndex).trim() || normalized,
    effect: normalized.slice(separatorIndex + 1).trim(),
  };
}

export function splitOpeningSkillKeywords(value: string): string[] {
  return value
    .split(/[,，、/|\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeOpeningPresets(value: unknown): OpeningPlayerPreset[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<OpeningPlayerPreset>;
      const draft = sanitizeOpeningPresetDraft(raw.draft);
      const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 32) : draft.name || '未命名开局预设';
      return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : `opening-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
        draft,
      };
    })
    .filter((item): item is OpeningPlayerPreset => Boolean(item))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_OPENING_PLAYER_PRESETS);
}

export function sanitizeOpeningPresetDraft(value: unknown): OpeningPresetDraft {
  const raw = value && typeof value === 'object' ? (value as Partial<OpeningPresetDraft>) : {};
  const legacyFreedom = value && typeof value === 'object'
    ? (value as { freeOpeningFreedom?: unknown }).freeOpeningFreedom
    : undefined;
  const migratedPlanetSource =
    isFreeOpeningPlanetSource(raw.freeOpeningPlanetSource)
      ? raw.freeOpeningPlanetSource
      : legacyFreedom === 'high_freedom' || legacyFreedom === 'if_rewrite'
        ? 'custom'
        : 'existing';
  const selectedWorkshopTemplateId =
    typeof raw.selectedWorkshopTemplateId === 'string' &&
    workshopOpeningTemplates.some((template) => template.id === raw.selectedWorkshopTemplateId)
      ? raw.selectedWorkshopTemplateId
      : workshopOpeningTemplates[0]?.id ?? '';
  return {
    openingSource: isOpeningSource(raw.openingSource) ? raw.openingSource : 'official_preset',
    freeOpeningMainlineEnabled: typeof raw.freeOpeningMainlineEnabled === 'boolean' ? raw.freeOpeningMainlineEnabled : true,
    freeOpeningPlanetSource: migratedPlanetSource,
    freeOpeningWorkshop: sanitizeFreeOpeningWorkshop(raw.freeOpeningWorkshop),
    storyMode: isStoryMode(raw.storyMode) ? raw.storyMode : 'normal',
    name: sanitizeText(raw.name),
    alias: sanitizeText(raw.alias),
    gender: sanitizeText(raw.gender),
    age: normalizeAge(raw.age),
    birthday: sanitizeText(raw.birthday),
    appearance: sanitizeText(raw.appearance),
    personality: sanitizeText(raw.personality),
    background: sanitizeText(raw.background),
    pathId: isPathId(raw.pathId) ? raw.pathId : 'none',
    pathStage: isPathStage(raw.pathStage) ? raw.pathStage : 0,
    factionId: isFactionId(raw.factionId) ? raw.factionId : 'none',
    customIdentity: sanitizeText(raw.customIdentity),
    selectedAbilityIds: sanitizeStringArray(raw.selectedAbilityIds)
      .filter((id) => abilityPresets.some((ability) => ability.id === id))
      .slice(0, 2),
    customAbilities: sanitizeStringArray(raw.customAbilities).slice(0, 8),
    openingSkills: sanitizeOpeningSkills(raw.openingSkills),
    startingScenarioId:
      typeof raw.startingScenarioId === 'string' && startingScenarios.some((item) => item.id === raw.startingScenarioId)
        ? raw.startingScenarioId
        : startingScenarios[0]?.id ?? '',
    selectedWorkshopTemplateId,
    canonicalTrailblazer: isCanonicalTrailblazer(raw.canonicalTrailblazer) ? raw.canonicalTrailblazer : 'stelle',
    customStartPrompt: sanitizeText(raw.customStartPrompt),
  };
}

export function isOpeningSource(value: unknown): value is OpeningSource {
  return value === 'official_preset' || value === 'free' || value === 'workshop';
}

export function isFreeOpeningPlanetSource(value: unknown): value is FreeOpeningPlanetSource {
  return value === 'existing' || value === 'custom';
}

export function sanitizeFreeOpeningWorkshop(value: unknown): FreeOpeningWorkshopDraft {
  const raw = value && typeof value === 'object' ? (value as Partial<FreeOpeningWorkshopDraft>) : {};
  const legacyNpcDetails = sanitizeText(raw.npcDetails);
  const rawCustomNpcList = (raw as { customNpcs?: unknown }).customNpcs;
  const hasNewNpcList = Array.isArray(rawCustomNpcList);
  const customNpcs = sanitizeFreeOpeningCustomNpcs(rawCustomNpcList);
  const migratedNpcName = sanitizeText(raw.customNpcName);
  const migratedNpcBackground = sanitizeText(raw.customNpcBackground) || legacyNpcDetails;
  const migratedNpcPathstrider = sanitizeText(raw.customNpcPathstrider);
  const migratedNpcAbility = sanitizeText(raw.customNpcAbility);
  const migratedNpcs = hasNewNpcList || customNpcs.length || (!migratedNpcName && !migratedNpcBackground)
    ? customNpcs
    : [{
        id: `opening_npc_migrated_${Date.now()}`,
        name: migratedNpcName || '未命名 NPC',
        background: migratedNpcBackground,
        pathstrider: migratedNpcPathstrider,
        ability: migratedNpcAbility,
      }];
  return {
    planet: sanitizeText(raw.planet),
    location: sanitizeText(raw.location),
    planetIntro: sanitizeText(raw.planetIntro),
    npcDetails: legacyNpcDetails,
    customNpcName: hasNewNpcList ? migratedNpcName : '',
    customNpcBackground: hasNewNpcList ? sanitizeText(raw.customNpcBackground) : '',
    customNpcPathstrider: hasNewNpcList ? migratedNpcPathstrider : '',
    customNpcAbility: hasNewNpcList ? migratedNpcAbility : '',
    customNpcs: migratedNpcs,
    currentGoal: sanitizeText(raw.currentGoal),
    localConflict: sanitizeText(raw.localConflict),
    factions: sanitizeText(raw.factions),
    worldRules: sanitizeText(raw.worldRules),
    tone: sanitizeText(raw.tone),
  };
}

export function sanitizeFreeOpeningCustomNpcs(value: unknown): FreeOpeningCustomNpc[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<FreeOpeningCustomNpc>;
      const name = sanitizeText(raw.name).trim();
      const background = sanitizeText(raw.background).trim();
      if (!name && !background) return null;
      return {
        id: sanitizeText(raw.id) || `opening_npc_${index}_${Date.now()}`,
        name: name || '未命名 NPC',
        background,
        pathstrider: sanitizeText(raw.pathstrider),
        ability: sanitizeText(raw.ability),
      };
    })
    .filter((item): item is FreeOpeningCustomNpc => Boolean(item))
    .slice(0, 12);
}

export function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function sanitizeOpeningSkills(value: unknown): 战技记录[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<战技记录>;
      const name = sanitizeText(raw.名称).trim();
      const description = sanitizeText(raw.描述).trim();
      if (!name || !description) return null;
      const slotIndex = Number(raw.槽位序号);
      const now = Date.now();
      return 归一化战技记录({
        id: typeof raw.id === 'string' && raw.id ? raw.id : `skill_${now}_${Math.random().toString(36).slice(2, 8)}`,
        名称: name,
        类别: raw.类别 === '命途' ? '命途' : '普通',
        槽位类型: raw.槽位类型 === 'path' ? 'path' : 'normal',
        槽位序号: Number.isFinite(slotIndex) && slotIndex > 0 ? Math.floor(slotIndex) : 1,
        描述: description,
        来源: sanitizeText(raw.来源) || '开局预设',
        关联命途: raw.关联命途,
        关联阶段: raw.关联阶段,
        关键词: sanitizeStringArray(raw.关键词),
        消耗: sanitizeText(raw.消耗),
        冷却: sanitizeText(raw.冷却),
        备注: sanitizeText(raw.备注),
        已启用: raw.已启用 !== false,
        创建于: typeof raw.创建于 === 'number' && Number.isFinite(raw.创建于) ? raw.创建于 : now,
        更新时间: typeof raw.更新时间 === 'number' && Number.isFinite(raw.更新时间) ? raw.更新时间 : now,
      });
    })
    .filter((item): item is 战技记录 => Boolean(item))
    .slice(0, 8);
}

export function normalizeAge(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 20;
  return Math.max(0, Math.min(999, Math.round(num)));
}

export function isStoryMode(value: unknown): value is 剧情模式 {
  return storyModes.some((item) => item.id === value);
}

export function isPathId(value: unknown): value is 命途ID {
  return paths.some((item) => item.id === value);
}

export function isPathStage(value: unknown): value is 命途阶段 {
  return PATH_STAGE_DEFS.some((item) => item.stage === value);
}

export function isFactionId(value: unknown): value is 阵营ID {
  return factions.some((item) => item.id === value);
}

export function isCanonicalTrailblazer(value: unknown): value is CanonicalTrailblazer {
  return CANONICAL_TRAILBLAZERS.some((item) => item.id === value);
}

export function splitBirthday(value: string): { month: string; day: string } {
  const trimmed = value.trim();
  if (!trimmed) return { month: '', day: '' };
  const match = trimmed.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (match) return { month: match[1], day: match[2] };
  const monthOnly = trimmed.match(/(\d{1,2})\s*月/);
  if (monthOnly) return { month: monthOnly[1], day: '' };
  const dayOnly = trimmed.match(/(\d{1,2})\s*日/);
  if (dayOnly) return { month: '', day: dayOnly[1] };
  const dotted = trimmed.match(/(?:\d{2,4}[./-])?(\d{1,2})[./-](\d{1,2})/);
  if (dotted) return { month: dotted[1], day: dotted[2] };
  return { month: '', day: '' };
}

export function mergeBirthday(month: string, day: string): string {
  const m = month.replace(/[^\d]/g, '').slice(0, 2);
  const d = day.replace(/[^\d]/g, '').slice(0, 2);
  if (!m && !d) return '';
  if (m && d) return `${m}月${d}日`;
  if (m) return `${m}月`;
  return `${d}日`;
}
