import { PATH_STAGE_DEFS, type 命途阶段 } from '@/models/path';
import type { 世界状态 } from '@/models/world';
import type { 命途ID, 剧情模式, 阵营ID, 官方开局预设, 创意工坊开局模板, 开局章节锚点 } from '@/models/journey';
import type { CanonicalTrailblazer, FreeOpeningCustomNpc, FreeOpeningPlanetSource, FreeOpeningWorkshopDraft, OpeningPlayerPreset, OpeningPresetDraft, OpeningSource } from '@/models/opening';
import { abilityPresets, getDefaultOpeningScenarioId, getOfficialOpeningPresetsByRegion, getOpeningChapterAnchor, getWorkshopOpeningTemplatesByRegion, factions, getFaction, getPath, isKnownOpeningScenarioId, openingChapterAnchors, paths, startingScenarios, storyModes, workshopOpeningTemplates } from '@/data/journeyPresets';
import { 归一化战技记录, type 战技记录, type 战技槽位摘要 } from '@/models/skill';

export { resolveSelectedScenarioPreset } from '@/models/opening';

export type Step = 'character' | 'path' | 'skill' | 'world' | 'historian' | 'overview';

export type OpeningScenario = (typeof startingScenarios)[number];

export type OpeningSkillSlotKey = `normal:${number}` | `path:${命途ID}:${number}`;

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
  { id: 'existing', title: '已有地点', text: '从黑塔空间站、雅利洛-VI、仙舟罗浮、匹诺康尼、翁法罗斯、二相乐园等已有关联地点切入。' },
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

// 开局向导历来取 14px / 9px / 10px，按刻度的邻近档位固定为 panelClip / mediumClip / cardClip。
export { panelClip as cardClip, mediumClip as smallClip, cardClip as tightClip } from '@/components/ui/clipPaths';

export const openingPageBackground =
  'radial-gradient(circle at 16% 4%, rgba(var(--tj-btn-primary-start), 0.16), transparent 28%), radial-gradient(circle at 84% 12%, rgba(var(--tj-tech-blue), 0.16), transparent 34%), radial-gradient(circle at 54% 110%, rgba(var(--tj-btn-primary-end), 0.11), transparent 38%), linear-gradient(180deg, rgb(var(--tj-bg-secondary)), rgb(var(--tj-bg-primary)))';

export const openingPageOverlay =
  'linear-gradient(rgba(var(--tj-btn-primary-start), 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.07) 1px, transparent 1px)';

export const openingPanelBackground =
  'linear-gradient(180deg, rgba(var(--tj-ui-panel), 0.80), rgba(var(--tj-panel-bg-end), 0.92)), radial-gradient(circle at top left, rgba(var(--tj-btn-primary-start), 0.10), transparent 36%)';

export const openingSoftPanelBackground = 'rgba(var(--tj-surface), 0.58)';

export const openingGlowLine =
  'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.25), transparent 18% 82%, rgba(var(--tj-btn-primary-end), 0.18))';

/* 以下四条原本是 box-shadow（用内阴影伪装描边）。内阴影会被 corner-shape 垫片丢弃，
   所以全部改成真 border，调用处同步从 `boxShadow:` 改为 `border:`。
   原先夹带的外投影本来就被切角整条裁掉、不可见，一并删除。
   Strong 版那条 `inset 3px 0 0` 左侧强调条无法用单条 border 表达，已经挪到
   调用处的 background 第一层（见 NewGameWizard）。 */
export const openingPanelShadow = '1px solid rgba(var(--tj-btn-primary-end), var(--tj-edge-tint))';

export const openingPanelShadowStrong = '1px solid rgba(var(--tj-btn-primary-end), var(--tj-edge-tint))';

export const openingCardBackground =
  'linear-gradient(180deg, rgba(var(--tj-ui-panel), 0.76), rgba(var(--tj-surface-bg-end), 0.88))';

export const openingActiveCardBackground =
  'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.18), rgba(var(--tj-btn-primary-end), 0.10)), rgba(var(--tj-surface-bg-end), 0.9)';

/* 面板左侧那条 3px 强调条原本写在 openingPanelShadowStrong 的 `inset 3px 0 0` 里。
   内阴影会被垫片丢弃，故改为背景条纹——必须排在 background 的第一层（背景自上而下叠加）。 */
export const openingPanelRail =
  'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), var(--tj-edge-tint-strong)) 0 3px, transparent 3px)';

export const openingCardBorder = '1px solid rgba(var(--tj-btn-primary-end), var(--tj-edge-tint-weak))';

export const openingCyanBorder = '1px solid rgba(var(--tj-btn-primary-start), var(--tj-edge))';

export function getFreeOpeningPlanetSourceOption(id: FreeOpeningPlanetSource) {
  return FREE_OPENING_PLANET_SOURCE_OPTIONS.find((item) => item.id === id) ?? FREE_OPENING_PLANET_SOURCE_OPTIONS[0];
}

export function getOpeningRegionDisplayName(regionName?: string): string {
  if (regionName === '贝洛伯格') return '雅利洛-VI';
  if (regionName === '罗浮仙舟') return '仙舟罗浮';
  return regionName || '未指定地点';
}

export type OpeningCardKind = 'official_preset' | 'workshop_template' | 'chapter';

/**
 * 开局锚点卡片：身份必须来自领域实体 ID（官方预设 / 工坊模板 / 章节锚点），
 * 不使用标题、数组下标或章节归属，避免同章节多预设时卡片塌缩或选错。
 */
export interface OpeningScenarioCard {
  id: string;
  kind: OpeningCardKind;
  regionId: string;
  /** 卡片主标题：官方预设与工坊模板用各自 title，自由开局用章节名。 */
  title: string;
  summary: string;
  chapterId: string;
  chapterName?: string;
  chapterPhase?: string;
  priorStoryState?: string;
  referenceDate?: string;
  referenceTime?: string;
  locationHint?: string;
  highlights: string[];
}

export function buildOfficialPresetCards(presets: 官方开局预设[]): OpeningScenarioCard[] {
  return presets.map((preset) => {
    const chapter = getOpeningChapterAnchor(preset.chapterId);
    return {
      id: preset.id,
      kind: 'official_preset',
      regionId: preset.regionId,
      title: preset.title,
      summary: preset.summary,
      chapterId: preset.chapterId,
      chapterName: chapter?.officialChapterName,
      chapterPhase: chapter?.officialChapterPhase,
      priorStoryState: chapter?.priorStoryState,
      referenceDate: preset.referenceDate,
      referenceTime: preset.referenceTime,
      locationHint: preset.defaultLocationHint,
      highlights: preset.openingPressure,
    };
  });
}

export function buildWorkshopTemplateCards(templates: 创意工坊开局模板[]): OpeningScenarioCard[] {
  return templates.map((template) => {
    const chapter = getOpeningChapterAnchor(template.chapterId);
    return {
      id: template.id,
      kind: 'workshop_template',
      regionId: template.regionId,
      title: template.title,
      summary: template.summary,
      chapterId: template.chapterId,
      chapterName: chapter?.officialChapterName,
      chapterPhase: chapter?.officialChapterPhase,
      priorStoryState: chapter?.priorStoryState,
      locationHint: template.defaultLocationHint,
      highlights: template.openingPressure,
    };
  });
}

export function buildChapterCards(chapters: 开局章节锚点[]): OpeningScenarioCard[] {
  return chapters.map((chapter) => ({
    id: chapter.id,
    kind: 'chapter',
    regionId: chapter.regionId,
    title: chapter.name,
    summary: chapter.summary,
    chapterId: chapter.id,
    chapterName: chapter.officialChapterName,
    chapterPhase: chapter.officialChapterPhase,
    priorStoryState: chapter.priorStoryState,
    referenceDate: chapter.referenceDate,
    referenceTime: chapter.referenceTime,
    locationHint: chapter.defaultLocationHint,
    highlights: chapter.openingPressure,
  }));
}

/** 按开局来源构建当前地区的卡片集合；每种来源只返回该来源自己的领域实体。 */
export function buildOpeningScenarioCards(openingSource: OpeningSource, regionId: string): OpeningScenarioCard[] {
  if (openingSource === 'official_preset') {
    return buildOfficialPresetCards(getOfficialOpeningPresetsByRegion(regionId));
  }
  if (openingSource === 'workshop') {
    return buildWorkshopTemplateCards(getWorkshopOpeningTemplatesByRegion(regionId));
  }
  return buildChapterCards(openingChapterAnchors.filter((chapter) => chapter.regionId === regionId));
}

/** 当前应高亮的卡片 ID：工坊来源以模板 ID 为准，其余来源以开局身份 ID 为准。 */
export function getActiveOpeningCardId(
  openingSource: OpeningSource,
  startingScenarioId: string,
  selectedWorkshopTemplateId: string,
): string {
  return openingSource === 'workshop' ? selectedWorkshopTemplateId : startingScenarioId;
}

export function getOpeningCardChapterName(card: OpeningScenarioCard): string {
  return card.chapterName || '原作主线锚点';
}

export function getOpeningCardChapterPhase(card: OpeningScenarioCard): string {
  return card.chapterPhase || '';
}

export function getOpeningCardBadge(card: OpeningScenarioCard): string {
  const chapterName = getOpeningCardChapterName(card);
  return card.chapterPhase ? `${chapterName} · ${card.chapterPhase}` : chapterName;
}

export function getOpeningCardPriorStoryState(card: OpeningScenarioCard): string {
  return card.priorStoryState || '该锚点之前的原作章节仅作既成背景，不进入正文转跳推进。';
}

/**
 * 选中卡片时写回稳定身份：
 *  - 官方预设 / 自由开局：写回卡片自身 ID（预设 ID / 章节锚点 ID）；
 *  - 创意工坊：模板 ID 写回工坊模板，章节锚点 ID 写回开局身份（开局档案仍按章节落档）。
 */
export function selectOpeningScenario(
  card: OpeningScenarioCard,
  openingSource: OpeningSource,
  onStartingScenarioId: (id: string) => void,
  onSelectedWorkshopTemplateId: (id: string) => void,
) {
  if (openingSource === 'workshop' && card.kind === 'workshop_template') {
    onSelectedWorkshopTemplateId(card.id);
    onStartingScenarioId(card.chapterId);
    return;
  }
  onStartingScenarioId(card.id);
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

export function createOpeningPresetId(): string {
  return `opening-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 按预设自身 ID 覆盖保存；标题只影响展示，不参与身份判定，避免同名预设互相覆盖。 */
export function upsertOpeningPlayerPreset(presets: OpeningPlayerPreset[], preset: OpeningPlayerPreset): OpeningPlayerPreset[] {
  return [preset, ...presets.filter((item) => item.id !== preset.id)].slice(0, MAX_OPENING_PLAYER_PRESETS);
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
  const sorted = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<OpeningPlayerPreset>;
      const draft = sanitizeOpeningPresetDraft(raw.draft);
      const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 32) : draft.name || '未命名开局预设';
      return {
        id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createOpeningPresetId(),
        title,
        updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
        draft,
      };
    })
    .filter((item): item is OpeningPlayerPreset => Boolean(item))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  // 身份是预设 ID：同 ID 记录只保留最新一条，但不同 ID 的同名预设必须同时保留。
  const seen = new Set<string>();
  return sorted
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
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
    startingScenarioId: isKnownOpeningScenarioId(raw.startingScenarioId)
      ? raw.startingScenarioId.trim()
      : getDefaultOpeningScenarioId(),
    selectedWorkshopTemplateId,
    canonicalTrailblazer: isCanonicalTrailblazer(raw.canonicalTrailblazer) ? raw.canonicalTrailblazer : 'stelle',
    customStartPrompt: sanitizeText(raw.customStartPrompt),
    // parsedArchive 是瞬态解析结果，不随预设持久化；恢复预设时统一置 null，由开局流程重新整理。
    parsedArchive: null,
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
