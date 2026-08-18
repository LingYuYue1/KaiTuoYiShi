import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { 角色数据结构 } from '@/models/character';
import { PATH_STAGE_DEFS, 创建命途进度 } from '@/models/path';
import type { 命途阶段, 命途进度 } from '@/models/path';
import type { 世界状态 } from '@/models/world';
import { 创建默认开局档案, 创建空世界状态, 根据官方开局预设创建开局档案, 根据开局档案创建初始NPC记录, 根据起始场景创建开局档案, 根据自由开局整理创建开局档案, 生成开局已成立事实 } from '@/models/world';
import type { NPC记录 } from '@/models/npc';
import type { API配置项, 主题预设 } from '@/models/settings';
import type {
  命途ID,
  剧情模式,
  阵营ID,
  开局来源,
  自由开局地点来源,
} from '@/models/journey';
import {
  abilityPresets,
  openingRegions,
  getOfficialOpeningPreset,
  getOfficialOpeningPresetByChapterId,
  getOfficialOpeningPresetsByRegion,
  openingChapterAnchors,
  getFreeOpeningGuide,
  getOpeningScenarioBundle,
  getOpeningRegion,
  getWorkshopOpeningTemplate,
  getWorkshopOpeningTemplatesByRegion,
  factions,
  getFaction,
  getPath,
  getStartingScenario,
  getStoryMode,
  paths,
  startingScenarios,
  storyModes,
  workshopOpeningTemplates,
} from '@/data/journeyPresets';
import {
  NORMAL_SKILL_SLOT_COUNT,
  创建战技记录,
  生成战技槽位摘要,
  归一化战技记录,
  type 战技记录,
  type 战技槽位摘要,
} from '@/models/skill';
import { loadSetting, saveSetting } from '@/services/dbService';
import type { TravelerTemplateContext, TravelerTemplateDraft } from '@/services/ai/travelerTemplate';
import { parseOpeningArchiveWithAI } from '@/services/ai/openingArchive';

interface NewGameWizardProps {
  onStart: (traveler: 角色数据结构, worldState: 世界状态, initialNpcRecords?: NPC记录[]) => void | Promise<void>;
  onBack: () => void;
  currentTheme: 主题预设;
  openingArchiveApiConfig?: API配置项 | null;
  onGenerateTravelerTemplate?: (context: TravelerTemplateContext) => Promise<TravelerTemplateDraft>;
}

type Step = 'character' | 'path' | 'skill' | 'world' | 'historian' | 'overview';
type CanonicalTrailblazer = 'stelle' | 'caelus' | 'both';
type OpeningScenario = (typeof startingScenarios)[number];
type OpeningChapterAnchor = (typeof openingChapterAnchors)[number];
type OpeningDisplayScenario = OpeningScenario | OpeningChapterAnchor;
type OpeningSource = 开局来源;
type FreeOpeningPlanetSource = 自由开局地点来源;
type OpeningSkillSlotKey = `normal:${number}` | `path:${命途ID}:${number}`;

interface OpeningPresetDraft {
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

interface FreeOpeningWorkshopDraft {
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

interface FreeOpeningCustomNpc {
  id: string;
  name: string;
  background: string;
  pathstrider: string;
  ability: string;
}

interface OpeningPlayerPreset {
  id: string;
  title: string;
  updatedAt: number;
  draft: OpeningPresetDraft;
}

const STEPS: Step[] = ['character', 'path', 'skill', 'historian', 'world', 'overview'];
const OPENING_PLAYER_PRESETS_KEY = 'openingPlayerPresets';
const MAX_OPENING_PLAYER_PRESETS = 20;

const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  character: { title: '玩家档案', subtitle: '写下主角的身份底稿' },
  path: { title: '命途能力', subtitle: '命途阶段、能力与战技' },
  skill: { title: '战技创作', subtitle: '写下开局战技与其限制' },
  historian: { title: '其他选项', subtitle: '原著主角、组织背景与模式预留' },
  world: { title: '开局锚点', subtitle: '开局来源、地区章节与玩家切入点' },
  overview: { title: '整理确认', subtitle: '确认后写入长期开局档案' },
};
const STEP_RAIL_ITEMS: { key: Step; title: string; subtitle: string }[] = [
  { key: 'character', title: '玩家档案', subtitle: '身份、外貌、性格、背景' },
  { key: 'path', title: '命途能力', subtitle: '命途阶段、能力与战技' },
  { key: 'skill', title: '战技创作', subtitle: '开局战技与限制描写' },
  { key: 'historian', title: '其他选项', subtitle: '原著主角、组织背景、模式预留' },
  { key: 'world', title: '开局锚点', subtitle: '来源、地区、章节与切入' },
  { key: 'overview', title: '整理确认', subtitle: 'AI/本地结构化开局档案' },
];

const CANONICAL_TRAILBLAZERS: {
  id: CanonicalTrailblazer;
  title: string;
  subtitle: string;
  worldValue: 世界状态['原著主角'];
}[] = [
  { id: 'stelle', title: '星', subtitle: '女主角', worldValue: '星' },
  { id: 'caelus', title: '穹', subtitle: '男主角', worldValue: '穹' },
  { id: 'both', title: '小孩子才做选择', subtitle: '星与穹都存在', worldValue: '星穹双主角' },
];

const FREE_OPENING_PLANET_SOURCE_OPTIONS: Array<{
  id: FreeOpeningPlanetSource;
  title: string;
  text: string;
}> = [
  { id: 'existing', title: '已有地点', text: '从黑塔空间站、雅利洛-VI、仙舟罗浮、匹诺康尼、翁法罗斯、二相乐园等已有关联地点切入。' },
  { id: 'custom', title: '自创地点', text: '开启原创舞台工作台，由玩家自建地点、NPC、势力与规则。' },
];

const DEFAULT_FREE_OPENING_WORKSHOP: FreeOpeningWorkshopDraft = {
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

const cardClip =
  'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)';
const smallClip =
  'polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px)';
const tightClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const OPENING_PATH_STAGE_DEFS = PATH_STAGE_DEFS;
const openingPageBackground =
  'radial-gradient(circle at 16% 4%, rgba(var(--tj-btn-primary-start), 0.16), transparent 28%), radial-gradient(circle at 84% 12%, rgba(var(--tj-tech-blue), 0.16), transparent 34%), radial-gradient(circle at 54% 110%, rgba(var(--tj-btn-primary-end), 0.11), transparent 38%), linear-gradient(180deg, rgb(var(--tj-bg-secondary)), rgb(var(--tj-bg-primary)))';
const openingPageOverlay =
  'linear-gradient(rgba(var(--tj-btn-primary-start), 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.07) 1px, transparent 1px)';
const openingTopPanelBackground =
  'linear-gradient(180deg, rgba(var(--tj-ui-panel), 0.80), rgba(var(--tj-panel-bg-end), 0.92)), radial-gradient(circle at top left, rgba(var(--tj-btn-primary-start), 0.10), transparent 36%)';
const openingLedgerBackground =
  'linear-gradient(180deg, rgba(var(--tj-ui-panel), 0.80), rgba(var(--tj-panel-bg-end), 0.92)), radial-gradient(circle at top left, rgba(var(--tj-btn-primary-start), 0.10), transparent 36%)';
const openingRailBackground =
  'linear-gradient(180deg, rgba(var(--tj-ui-panel), 0.80), rgba(var(--tj-panel-bg-end), 0.92)), radial-gradient(circle at top left, rgba(var(--tj-btn-primary-start), 0.10), transparent 36%)';
const openingSoftPanelBackground = 'rgba(var(--tj-surface), 0.58)';
const openingGlowLine =
  'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.25), transparent 18% 82%, rgba(var(--tj-btn-primary-end), 0.18))';
const openingPanelShadow =
  'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.24), inset 0 0 28px rgba(var(--tj-btn-primary-start), 0.025), 0 16px 36px rgba(0, 0, 0, 0.30)';
const openingPanelShadowStrong =
  'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.28), inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.45), 0 18px 44px rgba(0, 0, 0, 0.34)';
const openingCardBackground =
  'linear-gradient(180deg, rgba(var(--tj-ui-panel), 0.76), rgba(var(--tj-surface-bg-end), 0.88))';
const openingActiveCardBackground =
  'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.18), rgba(var(--tj-btn-primary-end), 0.10)), rgba(var(--tj-surface-bg-end), 0.9)';
const openingCardBorder = 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.16)';
const openingCyanBorder = 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.52), 0 0 20px rgba(var(--tj-btn-primary-start), 0.10)';

function getOpeningSourceLabel(source: OpeningSource): string {
  if (source === 'workshop') return '自由开局';
  if (source === 'free') return '自由开局';
  return '官方预设';
}

function getFreeOpeningPlanetSourceOption(id: FreeOpeningPlanetSource) {
  return FREE_OPENING_PLANET_SOURCE_OPTIONS.find((item) => item.id === id) ?? FREE_OPENING_PLANET_SOURCE_OPTIONS[0];
}

function getOpeningRegionDisplayName(regionName?: string): string {
  if (regionName === '贝洛伯格') return '雅利洛-VI';
  if (regionName === '罗浮仙舟') return '仙舟罗浮';
  return regionName || '未指定地点';
}

function getOpeningDisplaySummary(item: OpeningDisplayScenario): string {
  return 'description' in item ? item.description : item.summary;
}

function getOpeningDisplayHighlights(item: OpeningDisplayScenario): string[] {
  if ('openingHighlights' in item) return item.openingHighlights ?? [];
  if ('openingPressure' in item) return item.openingPressure ?? [];
  return [];
}

function getOpeningOfficialChapterName(item: OpeningDisplayScenario): string {
  if ('officialChapterName' in item && item.officialChapterName) return item.officialChapterName;
  const chapter = openingChapterAnchors.find((anchor) => anchor.id === item.id);
  return chapter?.officialChapterName ?? '原作主线锚点';
}

function getOpeningOfficialChapterPhase(item: OpeningDisplayScenario): string {
  if ('officialChapterPhase' in item && item.officialChapterPhase) return item.officialChapterPhase;
  const chapter = openingChapterAnchors.find((anchor) => anchor.id === item.id);
  return chapter?.officialChapterPhase ?? '';
}

function getOpeningChapterBadge(item: OpeningDisplayScenario): string {
  const chapterName = getOpeningOfficialChapterName(item);
  const phase = getOpeningOfficialChapterPhase(item);
  return phase ? `${chapterName} · ${phase}` : chapterName;
}

function getOpeningPriorStoryState(item: OpeningDisplayScenario): string {
  if ('priorStoryState' in item && item.priorStoryState) return item.priorStoryState;
  const chapter = openingChapterAnchors.find((anchor) => anchor.id === item.id);
  return chapter?.priorStoryState ?? '该锚点之前的原作章节仅作既成背景，不进入正文转跳推进。';
}

function selectOpeningScenario(
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

function formatFreeOpeningWorkshopDraft(draft: FreeOpeningWorkshopDraft, source: FreeOpeningPlanetSource): string {
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

function mergeFreeOpeningPrompt(baseText: string, workshopText: string): string {
  const parts = [baseText.trim(), workshopText.trim()].filter(Boolean);
  return parts.join('\n\n');
}

export function NewGameWizard({ onStart, onBack, openingArchiveApiConfig, onGenerateTravelerTemplate }: NewGameWizardProps) {
  const [step, setStep] = useState<Step>('character');
  const [openingPresets, setOpeningPresets] = useState<OpeningPlayerPreset[]>([]);
  const [openingSource, setOpeningSource] = useState<OpeningSource>('official_preset');
  const [freeOpeningMainlineEnabled, setFreeOpeningMainlineEnabled] = useState(true);
  const [freeOpeningPlanetSource, setFreeOpeningPlanetSource] = useState<FreeOpeningPlanetSource>('existing');
  const [freeOpeningWorkshop, setFreeOpeningWorkshop] = useState<FreeOpeningWorkshopDraft>(DEFAULT_FREE_OPENING_WORKSHOP);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [presetStatus, setPresetStatus] = useState('');

  const [storyMode, setStoryMode] = useState<剧情模式>('normal');

  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState(20);
  const [birthday, setBirthday] = useState('');
  const [appearance, setAppearance] = useState('');
  const [personality, setPersonality] = useState('');
  const [background, setBackground] = useState('');

  const [pathId, setPathId] = useState<命途ID>('none');
  const [pathStage, setPathStage] = useState<命途阶段>(0);
  const [factionId, setFactionId] = useState<阵营ID>('none');
  const [customIdentity, setCustomIdentity] = useState('');
  const [selectedAbilityIds, setSelectedAbilityIds] = useState<string[]>([]);
  const [customAbilityNameDraft, setCustomAbilityNameDraft] = useState('');
  const [customAbilityEffectDraft, setCustomAbilityEffectDraft] = useState('');
  const [customAbilities, setCustomAbilities] = useState<string[]>([]);
  const [openingSkills, setOpeningSkills] = useState<战技记录[]>([]);
  const [openingSkillNameDraft, setOpeningSkillNameDraft] = useState('');
  const [openingSkillDescDraft, setOpeningSkillDescDraft] = useState('');
  const [openingSkillSourceDraft, setOpeningSkillSourceDraft] = useState('');
  const [openingSkillKeywordsDraft, setOpeningSkillKeywordsDraft] = useState('');
  const [openingSkillCostDraft, setOpeningSkillCostDraft] = useState('');
  const [openingSkillCooldownDraft, setOpeningSkillCooldownDraft] = useState('');
  const [openingSkillNoteDraft, setOpeningSkillNoteDraft] = useState('');
  const [openingSkillSlotKey, setOpeningSkillSlotKey] = useState<OpeningSkillSlotKey>('normal:1');

  const [startingScenarioId, setStartingScenarioId] = useState<string>(
    startingScenarios[0]?.id ?? '',
  );
  const [selectedWorkshopTemplateId, setSelectedWorkshopTemplateId] = useState(workshopOpeningTemplates[0]?.id ?? '');
  const [canonicalTrailblazer, setCanonicalTrailblazer] = useState<CanonicalTrailblazer>('stelle');
  const [customStartPrompt, setCustomStartPrompt] = useState('');
  const [startingGame, setStartingGame] = useState(false);
const [openingArchiveStatus, setOpeningArchiveStatus] = useState('');
  const birthdayParts = useMemo(() => splitBirthday(birthday), [birthday]);

  useEffect(() => {
    const rootElement = document.getElementById('root');
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverflowX = document.body.style.overflowX;
    const previousBodyOverflowY = document.body.style.overflowY;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousRootHeight = document.documentElement.style.height;
    const previousRootOverflow = document.documentElement.style.overflow;
    const previousAppRootHeight = rootElement?.style.height ?? '';
    const previousAppRootOverflow = rootElement?.style.overflow ?? '';
    const previousBodyHeight = document.body.style.height;
    document.body.style.overflow = 'hidden';
    document.body.style.overflowX = 'hidden';
    document.body.style.overflowY = 'hidden';
    document.body.style.overscrollBehavior = 'auto';
    document.documentElement.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.height = '100%';
    if (rootElement) {
      rootElement.style.height = '100%';
      rootElement.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overflowX = previousBodyOverflowX;
      document.body.style.overflowY = previousBodyOverflowY;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.height = previousRootHeight;
      document.documentElement.style.overflow = previousRootOverflow;
      document.body.style.height = previousBodyHeight;
      if (rootElement) {
        rootElement.style.height = previousAppRootHeight;
        rootElement.style.overflow = previousAppRootOverflow;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSetting<OpeningPlayerPreset[]>(OPENING_PLAYER_PRESETS_KEY)
      .then((saved) => {
        if (cancelled) return;
        const normalized = normalizeOpeningPresets(saved);
        setOpeningPresets(normalized);
        if (normalized.length > 0) {
          setSelectedPresetId(normalized[0].id);
          setPresetNameDraft(normalized[0].title);
        }
      })
      .catch((err) => {
        console.warn('[new-game] 开局预设读取失败:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const storyModeDef = useMemo(
    () => getStoryMode(storyMode) ?? storyModes[0],
    [storyMode],
  );
  const selectedPath = useMemo(() => getPath(pathId), [pathId]);
  const selectedPathStage = useMemo(
    () => PATH_STAGE_DEFS.find((item) => item.stage === pathStage) ?? PATH_STAGE_DEFS[0],
    [pathStage],
  );
  const openingSkillSlots = useMemo(
    () => 生成战技槽位摘要(
      pathId && pathId !== 'none'
        ? [{
            ...创建命途进度(pathId, true, '开局承载', `初始阶段：${selectedPathStage.name}`),
            阶段: pathStage,
          } satisfies 命途进度]
        : [],
      openingSkills,
    ),
    [openingSkills, pathId, pathStage, selectedPathStage.name],
  );
  const openingSelectedSlot = useMemo(
    () => resolveOpeningSkillSlot(openingSkillSlots, openingSkillSlotKey) ?? openingSkillSlots[0],
    [openingSkillSlotKey, openingSkillSlots],
  );

  useEffect(() => {
    if (resolveOpeningSkillSlot(openingSkillSlots, openingSkillSlotKey) || !openingSkillSlots[0]) return;
    setOpeningSkillSlotKey(toOpeningSkillSlotKey(openingSkillSlots[0]));
  }, [openingSkillSlotKey, openingSkillSlots]);
  const selectedFaction = useMemo(() => getFaction(factionId) ?? factions[0], [factionId]);
  const selectedScenario = useMemo<OpeningScenario | undefined>(
    () => getStartingScenario(startingScenarioId),
    [startingScenarioId],
  );
  const selectedScenarioPreset = useMemo(
    () =>
      getOfficialOpeningPreset(startingScenarioId)
      ?? getOfficialOpeningPresetByChapterId(startingScenarioId)
      ?? (selectedScenario?.officialPresetId ? getOfficialOpeningPreset(selectedScenario.officialPresetId) : undefined)
      ?? getOfficialOpeningPresetByChapterId(selectedScenario?.id ?? ''),
    [selectedScenario, startingScenarioId],
  );
  const selectedScenarioBundle = useMemo(() => getOpeningScenarioBundle(startingScenarioId), [startingScenarioId]);
  const selectedRegionId =
    selectedScenarioBundle.region?.id
    ?? selectedScenarioPreset?.regionId
    ?? openingRegions[0]?.id
    ?? 'herta_space_station';
  const selectedOpeningRegion = getOpeningRegion(selectedRegionId) ?? openingRegions[0];
  const selectedOpeningDate = selectedScenarioPreset?.referenceDate ?? '琥珀纪 2157.03.07';
  const selectedOpeningTime = selectedScenarioPreset?.referenceTime ?? '06:40';
  const selectedOpeningLocation =
    selectedScenarioPreset?.defaultLocationHint
    ?? selectedScenarioBundle.chapter?.defaultLocationHint
    ?? selectedScenario?.name
    ?? '黑塔空间站';
  const selectedOpeningTitle =
    selectedScenarioPreset?.title
    ?? (selectedScenarioBundle.region && selectedScenarioBundle.chapter
      ? `${selectedScenarioBundle.region.name} · ${selectedScenarioBundle.chapter.name}`
      : selectedScenario?.name)
    ?? '未选择';

  const currentPresetDraft = useMemo<OpeningPresetDraft>(
    () => ({
      openingSource,
      freeOpeningMainlineEnabled,
      freeOpeningPlanetSource,
      freeOpeningWorkshop,
      storyMode,
      name,
      alias,
      gender,
      age,
      birthday,
      appearance,
      personality,
      background,
      pathId,
      pathStage,
      factionId,
      customIdentity,
      selectedAbilityIds,
      customAbilities,
      openingSkills,
      startingScenarioId,
      selectedWorkshopTemplateId,
      canonicalTrailblazer,
      customStartPrompt,
    }),
    [
      alias,
      appearance,
      background,
      birthday,
      canonicalTrailblazer,
      customAbilities,
      customIdentity,
      customStartPrompt,
      factionId,
      gender,
      freeOpeningMainlineEnabled,
      freeOpeningPlanetSource,
      freeOpeningWorkshop,
      age,
      name,
      openingSource,
      pathId,
      pathStage,
      personality,
      selectedAbilityIds,
      selectedWorkshopTemplateId,
      startingScenarioId,
      storyMode,
      openingSkills,
    ],
  );

  const selectedAbilityNames = useMemo(
    () => [
      ...selectedAbilityIds
        .map((id) => abilityPresets.find((ability) => ability.id === id)?.name)
        .filter((text): text is string => Boolean(text)),
      ...customAbilities,
    ],
    [customAbilities, selectedAbilityIds],
  );
  const openingHighlights = selectedScenarioPreset?.openingPressure ?? selectedScenarioBundle.chapter?.openingPressure ?? selectedScenario?.openingHighlights ?? [];
  const effectiveFreeMainlineEnabled = openingSource === 'official_preset' || freeOpeningMainlineEnabled;
  const freeOpeningWorkshopText = useMemo(() => formatFreeOpeningWorkshopDraft(freeOpeningWorkshop, freeOpeningPlanetSource), [freeOpeningPlanetSource, freeOpeningWorkshop]);
  const effectiveCustomStartPrompt = useMemo(
    () => mergeFreeOpeningPrompt(customStartPrompt, openingSource !== 'official_preset' ? freeOpeningWorkshopText : ''),
    [customStartPrompt, freeOpeningWorkshopText, openingSource],
  );

  const openingSummaryLines = useMemo(
    () =>
      buildOpeningSummary({
        scenario: selectedScenarioPreset
          ? {
              id: selectedScenarioPreset.chapterId,
              name: selectedScenarioPreset.title,
              description: selectedScenarioPreset.summary,
              openingHighlights: selectedScenarioPreset.openingPressure,
            }
          : selectedScenarioBundle.chapter
            ? {
                id: selectedScenarioBundle.chapter.id,
                name: selectedScenarioBundle.chapter.name,
                description: selectedScenarioBundle.chapter.summary,
                openingHighlights: selectedScenarioBundle.chapter.openingPressure,
              }
            : selectedScenario ?? {
                id: startingScenarioId,
                name: selectedOpeningTitle,
                description: '',
                openingHighlights: [],
              },
        location: selectedOpeningLocation,
        currentDate: selectedOpeningDate,
        currentTime: selectedOpeningTime,
        storyMode: storyModeDef.name,
        path: selectedPath,
        pathStage: pathId !== 'none' ? selectedPathStage : undefined,
        faction: selectedFaction,
        customIdentity,
        customStartPrompt: effectiveCustomStartPrompt,
        canonicalTrailblazer: getCanonicalTrailblazer(canonicalTrailblazer)?.worldValue,
        abilities: selectedAbilityNames,
        skills: openingSkills,
      }),
    [canonicalTrailblazer, customIdentity, effectiveCustomStartPrompt, openingSkills, pathId, selectedAbilityNames, selectedFaction, selectedOpeningDate, selectedOpeningLocation, selectedOpeningTime, selectedOpeningTitle, selectedPath, selectedPathStage, selectedScenario, selectedScenarioBundle.chapter, selectedScenarioPreset, startingScenarioId, storyModeDef.name],
  );

  const selectOpeningSource = (source: OpeningSource) => {
    setOpeningSource(source);
    if (source === 'workshop') {
      const template =
        getWorkshopOpeningTemplate(selectedWorkshopTemplateId)
        ?? getWorkshopOpeningTemplatesByRegion(selectedRegionId)[0]
        ?? workshopOpeningTemplates[0];
      if (!template) return;
      setSelectedWorkshopTemplateId(template.id);
      setStartingScenarioId(template.chapterId);
      if (!customStartPrompt.trim()) setCustomStartPrompt(template.playerEntryTemplate);
    }
  };

  const updateFreeOpeningWorkshop = (key: keyof FreeOpeningWorkshopDraft, value: string) => {
    setFreeOpeningWorkshop((prev) => ({ ...prev, [key]: value }));
  };

  const saveFreeOpeningCustomNpc = () => {
    const name = freeOpeningWorkshop.customNpcName.trim();
    const background = freeOpeningWorkshop.customNpcBackground.trim();
    const pathstrider = freeOpeningWorkshop.customNpcPathstrider.trim();
    const ability = freeOpeningWorkshop.customNpcAbility.trim();
    if (!name || !background) {
      window.alert('请至少填写自制 NPC 的名字和背景。');
      return;
    }
    const nextNpc: FreeOpeningCustomNpc = {
      id: `opening_npc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      background,
      pathstrider,
      ability,
    };
    setFreeOpeningWorkshop((prev) => ({
      ...prev,
      customNpcName: '',
      customNpcBackground: '',
      customNpcPathstrider: '',
      customNpcAbility: '',
      customNpcs: [...prev.customNpcs, nextNpc].slice(0, 12),
    }));
  };

  const removeFreeOpeningCustomNpc = (id: string) => {
    setFreeOpeningWorkshop((prev) => ({
      ...prev,
      customNpcs: prev.customNpcs.filter((npc) => npc.id !== id),
    }));
  };

  const selectOpeningRegion = (regionId: string) => {
    if (openingSource === 'workshop') {
      const template = getWorkshopOpeningTemplatesByRegion(regionId)[0];
      if (template) {
        selectWorkshopTemplate(template.id);
        return;
      }
    }
    const officialPreset = getOfficialOpeningPresetsByRegion(regionId)[0];
    if (officialPreset) {
      setStartingScenarioId(officialPreset.id);
      return;
    }
    const scenario = startingScenarios.find((item) => getOpeningScenarioBundle(item.id).region?.id === regionId);
    if (scenario) setStartingScenarioId(scenario.id);
  };

  const selectWorkshopTemplate = (templateId: string) => {
    const template = getWorkshopOpeningTemplate(templateId);
    if (!template) return;
    setOpeningSource('workshop');
    setSelectedWorkshopTemplateId(template.id);
    setStartingScenarioId(template.chapterId);
    setCustomStartPrompt(template.playerEntryTemplate);
  };

  const toggleAbility = (id: string) => {
    setSelectedAbilityIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const addCustomAbility = () => {
    const name = customAbilityNameDraft.trim();
    const effect = customAbilityEffectDraft.trim();
    if (!name || !effect) {
      window.alert('请先填写自定义特质名称和效果。');
      return;
    }
    const nextText = formatCustomAbilityEntry(name, effect);
    setCustomAbilities((prev) => (prev.includes(nextText) ? prev : [...prev, nextText]));
    setCustomAbilityNameDraft('');
    setCustomAbilityEffectDraft('');
  };

  const removeCustomAbility = (text: string) => {
    setCustomAbilities((prev) => prev.filter((x) => x !== text));
  };

  const addOpeningSkill = () => {
    if (!openingSelectedSlot) {
      window.alert('请先选择一个战技槽位。');
      return;
    }
    const skillName = openingSkillNameDraft.trim();
    const skillDescription = openingSkillDescDraft.trim();
    if (!skillName || !skillDescription) {
      window.alert('请先填写开局战技名称和描述。');
      return;
    }
    const nextSkill = 归一化战技记录(
      创建战技记录({
        名称: skillName,
        类别: openingSelectedSlot.kind === 'normal' ? '普通' : '命途',
        槽位类型: openingSelectedSlot.kind,
        槽位序号: openingSelectedSlot.slotIndex,
        描述: skillDescription,
        来源: openingSkillSourceDraft.trim() || (openingSelectedSlot.kind === 'normal' ? '开局预设 · 普通槽' : '开局预设 · 命途槽'),
        关联命途: openingSelectedSlot.pathId,
        关联阶段: openingSelectedSlot.pathStage,
        关键词: splitOpeningSkillKeywords(openingSkillKeywordsDraft),
        消耗: openingSkillCostDraft.trim(),
        冷却: openingSkillCooldownDraft.trim(),
        备注: openingSkillNoteDraft.trim(),
      }),
    );
    setOpeningSkills((prev) => {
      const withoutSameSlot = prev.filter((skill) => !sameOpeningSkillSlot(skill, nextSkill));
      return [...withoutSameSlot, nextSkill].slice(0, 8);
    });
    setOpeningSkillNameDraft('');
    setOpeningSkillDescDraft('');
    setOpeningSkillSourceDraft('');
    setOpeningSkillKeywordsDraft('');
    setOpeningSkillCostDraft('');
    setOpeningSkillCooldownDraft('');
    setOpeningSkillNoteDraft('');
  };

  const removeOpeningSkill = (skillId: string) => {
    setOpeningSkills((prev) => prev.filter((skill) => skill.id !== skillId));
  };

  const toggleOpeningSkill = (skillId: string) => {
    setOpeningSkills((prev) =>
      prev.map((skill) =>
        skill.id === skillId
          ? 归一化战技记录({ ...skill, 已启用: skill.已启用 === false, 更新时间: Date.now() })
          : skill,
      ),
    );
  };

  const persistOpeningPresets = async (nextPresets: OpeningPlayerPreset[]) => {
    const normalized = normalizeOpeningPresets(nextPresets);
    setOpeningPresets(normalized);
    await saveSetting(OPENING_PLAYER_PRESETS_KEY, normalized);
  };

  const applyOpeningPreset = (presetId: string) => {
    const preset = openingPresets.find((item) => item.id === presetId);
    if (!preset) return;
    const draft = sanitizeOpeningPresetDraft(preset.draft);
    setOpeningSource(draft.openingSource);
    setFreeOpeningMainlineEnabled(draft.freeOpeningMainlineEnabled);
    setFreeOpeningPlanetSource(draft.freeOpeningPlanetSource);
    setFreeOpeningWorkshop(draft.freeOpeningWorkshop);
    setStoryMode(draft.storyMode);
    setName(draft.name);
    setAlias(draft.alias);
    setGender(draft.gender);
    setAge(draft.age);
    setBirthday(draft.birthday);
    setAppearance(draft.appearance);
    setPersonality(draft.personality);
    setBackground(draft.background);
    setPathId(draft.pathId);
    setPathStage(draft.pathStage);
    setFactionId(draft.factionId);
    setCustomIdentity(draft.customIdentity);
    setSelectedAbilityIds(draft.selectedAbilityIds);
    setCustomAbilities(draft.customAbilities);
    setOpeningSkills(draft.openingSkills);
    setOpeningSkillNameDraft('');
    setOpeningSkillDescDraft('');
    setOpeningSkillSourceDraft('');
    setOpeningSkillKeywordsDraft('');
    setOpeningSkillCostDraft('');
    setOpeningSkillCooldownDraft('');
    setOpeningSkillNoteDraft('');
    setCustomAbilityNameDraft('');
    setCustomAbilityEffectDraft('');
    setStartingScenarioId(draft.startingScenarioId);
    setSelectedWorkshopTemplateId(draft.selectedWorkshopTemplateId);
    setCanonicalTrailblazer(draft.canonicalTrailblazer);
    setCustomStartPrompt(draft.customStartPrompt);
    setSelectedPresetId(preset.id);
    setPresetNameDraft(preset.title);
    setPresetStatus(`已套用预设：${preset.title}`);
  };

  const saveCurrentOpeningPreset = async () => {
    const title = (presetNameDraft.trim() || name.trim() || alias.trim() || '未命名开局预设').slice(0, 32);
    const existingBySelected = openingPresets.find((item) => item.id === selectedPresetId);
    const existingByTitle = openingPresets.find((item) => item.title === title);
    const id = existingBySelected?.id ?? existingByTitle?.id ?? `opening-${Date.now().toString(36)}`;
    const nextPreset: OpeningPlayerPreset = {
      id,
      title,
      updatedAt: Date.now(),
      draft: currentPresetDraft,
    };
    const nextPresets = [
      nextPreset,
      ...openingPresets.filter((item) => item.id !== id && item.title !== title),
    ].slice(0, MAX_OPENING_PLAYER_PRESETS);
    try {
      await persistOpeningPresets(nextPresets);
      setSelectedPresetId(id);
      setPresetNameDraft(title);
      setPresetStatus(`已保存预设：${title}`);
    } catch (err) {
      console.warn('[new-game] 开局预设保存失败:', err);
      setPresetStatus('保存失败，请稍后再试');
    }
  };

  const deleteSelectedOpeningPreset = async () => {
    if (!selectedPresetId) return;
    const target = openingPresets.find((item) => item.id === selectedPresetId);
    const nextPresets = openingPresets.filter((item) => item.id !== selectedPresetId);
    try {
      await persistOpeningPresets(nextPresets);
      setSelectedPresetId(nextPresets[0]?.id ?? '');
      setPresetNameDraft(nextPresets[0]?.title ?? '');
      setPresetStatus(target ? `已删除预设：${target.title}` : '已删除预设');
    } catch (err) {
      console.warn('[new-game] 开局预设删除失败:', err);
      setPresetStatus('删除失败，请稍后再试');
    }
  };

  const handlePathChange = (nextPathId: 命途ID) => {
    setPathId(nextPathId);
    if (nextPathId === 'none') setPathStage(0);
  };

  const handleStart = async () => {
    if (startingGame) return;
    setStartingGame(true);
    setOpeningArchiveStatus('');
    const selectedPathDef = getPath(pathId);
    const selectedScenarioDef = selectedScenario;
    const scenarioBundle = getOpeningScenarioBundle(startingScenarioId);
    const scenarioPreset = selectedScenarioPreset ?? scenarioBundle.preset;

    const abilityNames = selectedAbilityNames;

    const startingPaths =
      pathId && pathId !== 'none'
        ? [
            {
              ...创建命途进度(
                pathId,
                true,
                selectedOpeningTitle,
                `开局承载 · 初始阶段：${selectedPathStage.name}`,
              ),
              阶段: pathStage,
            },
          ]
        : [];
    const finalIdentity = customIdentity.trim();
    const factionIdentity = selectedFaction.id === 'none' ? '' : selectedFaction.name;
    const displayIdentity = [factionIdentity, finalIdentity].filter(Boolean).join(' · ');
    const travelerBackground = background.trim();
    const canonicalName = getCanonicalTrailblazer(canonicalTrailblazer)?.worldValue;

    const traveler: 角色数据结构 = {
      姓名: name.trim() || '无名开拓者',
      别名: alias.trim(),
      性别: gender.trim(),
      年龄: age,
      生日: birthday.trim(),
      身高: '',
      身份: displayIdentity,
      外貌: appearance.trim(),
      性格: personality.trim(),
      背景: travelerBackground,
      专长知识: [],
      头像: '',
      图像档案: {},
      属性: {
        力量: 0,
        智慧: 0,
        敏捷: 0,
        体质: 0,
        运气: 0,
      },
      主命途: pathId,
      命途列表: startingPaths,
      能力: abilityNames,
      背包: [],
      战技列表: openingSkills.map((skill) => 归一化战技记录({ ...skill, 已启用: skill.已启用 !== false })),
    };

    const worldState = 创建空世界状态();
    let resolvedOpeningLocation = selectedOpeningLocation;
    worldState.纪年法 = '琥珀纪年';
    worldState.开拓天数 = 1;
    worldState.当前日期 = selectedOpeningDate;
    worldState.当前时间 = selectedOpeningTime;
    worldState.当前地点 = resolvedOpeningLocation;
    worldState.剧情模式 = storyMode;
    worldState.起航之地ID = scenarioPreset?.chapterId ?? scenarioBundle.chapter?.id ?? startingScenarioId ?? 'herta_station_incident';
    worldState.原著主角 = canonicalName;
    worldState.自定义开局 = effectiveCustomStartPrompt;
    const customOpeningText = effectiveCustomStartPrompt;
    try {
      if (openingSource === 'official_preset') {
        worldState.开局档案 = scenarioPreset ? 根据官方开局预设创建开局档案(scenarioPreset, {
          ...worldState,
          自定义开局: customOpeningText,
        }) : 根据起始场景创建开局档案(selectedScenarioDef ?? {
          id: scenarioBundle.chapter?.id ?? startingScenarioId,
          name: selectedOpeningTitle,
          description: scenarioBundle.chapter?.summary ?? '',
          openingHighlights: scenarioBundle.chapter?.openingPressure ?? [],
          officialPresetId: scenarioBundle.preset?.id,
        }, {
          ...worldState,
          自定义开局: customOpeningText,
        });
      } else {
        const freeOpeningInput = {
          regionId: scenarioPreset?.regionId ?? scenarioBundle.region?.id ?? 'herta_space_station',
          regionName: scenarioPreset?.regionName ?? scenarioBundle.region?.name ?? '黑塔空间站',
          chapterId: scenarioPreset?.chapterId ?? scenarioBundle.chapter?.id ?? (startingScenarioId || 'herta_station_incident'),
          chapterName: scenarioPreset?.chapterName ?? scenarioBundle.chapter?.name ?? selectedScenarioDef?.name ?? '黑塔空间站 · 主线苏醒前夕',
          chapterSummary: scenarioPreset?.summary ?? scenarioBundle.chapter?.summary ?? selectedScenarioDef?.description ?? '',
          playerText: customOpeningText,
          defaultLocationHint: selectedOpeningLocation,
          defaultDateHint: selectedOpeningDate,
          defaultTimeHint: selectedOpeningTime,
          officialPresetId: scenarioPreset?.id,
          workshopTemplateId: openingSource === 'workshop' ? selectedWorkshopTemplateId : undefined,
          priorStoryState: scenarioBundle.chapter?.priorStoryState,
          planetSource: freeOpeningPlanetSource,
          mainlineEnabled: effectiveFreeMainlineEnabled,
          keyNpcs: scenarioPreset?.keyNpcs ?? scenarioBundle.preset?.keyNpcs ?? selectedScenarioDef?.openingHighlights ?? [],
        };
        let parsedArchive;
        if (openingArchiveApiConfig) {
          setOpeningArchiveStatus('正在整理开局档案...');
          try {
            parsedArchive = await parseOpeningArchiveWithAI(
              openingArchiveApiConfig,
              {
                regionName: freeOpeningInput.regionName,
                chapterName: freeOpeningInput.chapterName,
                chapterSummary: freeOpeningInput.chapterSummary,
                playerText: freeOpeningInput.playerText,
                defaultLocationHint: freeOpeningInput.defaultLocationHint,
                defaultDateHint: freeOpeningInput.defaultDateHint,
                defaultTimeHint: freeOpeningInput.defaultTimeHint,
                priorStoryState: freeOpeningInput.priorStoryState,
                planetSource: freeOpeningInput.planetSource,
                mainlineEnabled: freeOpeningInput.mainlineEnabled,
                keyNpcs: freeOpeningInput.keyNpcs,
                sourceLabel: openingSource === 'workshop' ? '创意工坊开局' : '自由开局',
              },
              openingArchiveApiConfig.retryCount ?? 2,
            );
            setOpeningArchiveStatus('开局档案已整理。');
          } catch (err) {
            console.warn('[opening-archive] AI 开局整理失败，改用本地整理兜底:', err);
            setOpeningArchiveStatus('开局整理失败，已改用本地兜底。');
          }
        }
        worldState.开局档案 = 根据自由开局整理创建开局档案({
          ...freeOpeningInput,
          整理档案: parsedArchive,
        });
        resolvedOpeningLocation =
          worldState.开局档案.整理档案?.自定义起始地点?.trim()
          || worldState.开局档案.整理档案?.初始地点参考?.trim()
          || selectedOpeningLocation;
        worldState.当前地点 = resolvedOpeningLocation;
      }
      worldState.全局事件 = 生成开局已成立事实(worldState.开局档案, {
        currentDate: selectedOpeningDate,
        currentTime: selectedOpeningTime,
        currentLocation: resolvedOpeningLocation,
        originalProtagonist: canonicalName,
        pathSummary: selectedPathDef
          ? `${selectedPathDef.name}（${selectedPathDef.aeon}）｜初始阶段：${selectedPathStage.name}（${selectedPathStage.title}）`
          : undefined,
        extraFacts: [
          ...openingSummaryLines,
          ...(selectedScenarioDef?.openingHighlights ?? []).map((text) => `场景要点：${text}`),
        ],
      });

      const initialNpcRecords = 根据开局档案创建初始NPC记录(worldState.开局档案);
      await onStart(traveler, worldState, initialNpcRecords);
    } finally {
      setStartingGame(false);
    }
  };

  const stepReady: Record<Step, boolean> = {
    character: name.trim().length > 0,
    path: true,
    skill: true,
    world: true,
    historian: true,
    overview: true,
  };

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goPrev = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const openWorkshopEntry = () => {
    window.alert('创意工坊后续会作为独立页面开放，可能需要登录后获取玩家内容。');
  };

  return (
    <div
      className="opening-terminal-shell opening-enter relative h-[100dvh] overflow-y-auto overflow-x-clip p-[18px] pb-[calc(var(--app-safe-bottom,0px)+18px)]"
style={{
  background: openingPageBackground,
}}
    >
      <style>{`
        @keyframes openingRain {
          from { transform: translateY(-22%); opacity: .1; }
          10% { opacity: .54; }
          to { transform: translateY(130vh); opacity: .18; }
        }
        @keyframes openingSweep {
          to { transform: translateY(calc(100vh + 220px)); }
        }
        @keyframes openingGridFlow {
          to { background-position: 0 44px, 44px 0; }
        }
        @keyframes openingLightDrift {
          to { transform: translate3d(7%, 2%, 0); }
        }
        @keyframes openingSpin {
          to { transform: rotate(360deg); }
        }
@keyframes openingDash {
  to { stroke-dashoffset: -440; }
}
@keyframes openingBootFade {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes openingBootFadeLeft {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes openingBootFadeRight {
  from { opacity: 0; transform: translateX(8px); }
  to   { opacity: 1; transform: translateX(0); }
}
.opening-terminal-shell.opening-enter .opening-stagger-header {
  animation: openingBootFade 0.38s ease-out both;
}
.opening-terminal-shell.opening-enter .opening-stagger-left {
  animation: openingBootFadeLeft 0.38s ease-out 0.12s both;
}
.opening-terminal-shell.opening-enter .opening-stagger-center {
  animation: openingBootFade 0.38s ease-out 0.22s both;
}
.opening-terminal-shell.opening-enter .opening-stagger-right {
  animation: openingBootFadeRight 0.38s ease-out 0.32s both;
}
.opening-terminal-shell .kaituo-btn-primary {
          background: linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.98), rgba(var(--tj-btn-primary-end), 0.88));
          color: rgb(var(--tj-bg-primary));
          box-shadow:
            inset 0 0 0 1px rgba(var(--tj-text-primary),0.38),
            0 0 22px rgba(var(--tj-btn-primary-start), 0.18);
        }
        .opening-terminal-shell .kaituo-btn-primary:hover {
          box-shadow:
            inset 0 0 0 1px rgba(var(--tj-text-primary),0.55),
            0 0 30px rgba(var(--tj-btn-primary-start), 0.28);
        }
        .opening-terminal-shell .kaituo-btn-primary:disabled {
          background: linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.42), rgba(var(--tj-btn-primary-end), 0.28));
          color: rgba(var(--tj-bg-primary), 0.58);
          box-shadow:
            inset 0 0 0 1px rgba(var(--tj-text-primary),0.18);
        }
      `}</style>

      <div
        className="pointer-events-none absolute inset-[-20%]"
        style={{
          background:
            'linear-gradient(115deg, transparent 0 36%, rgba(var(--tj-btn-primary-start), 0.10) 38%, transparent 42% 100%), linear-gradient(70deg, transparent 0 58%, rgba(var(--tj-btn-primary-end), 0.09) 60%, transparent 64% 100%)',
          transform: 'translate3d(-5%, 0, 0)',
          animation: 'openingLightDrift 9s ease-in-out infinite alternate',
        }}
      />

      <div className="pointer-events-none absolute inset-0 opacity-[0.52]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: openingPageOverlay,
            backgroundSize: '42px 42px',
            maskImage: 'linear-gradient(180deg, transparent, #000 10%, #000 82%, transparent)',
          }}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-x-[-12%] bottom-[-22%] hidden h-[46vh] opacity-[0.52] lg:block"
        style={{
          backgroundImage: openingPageOverlay,
          backgroundSize: '44px 44px',
          transform: 'perspective(560px) rotateX(62deg)',
          transformOrigin: 'bottom',
          animation: 'openingGridFlow 4.2s linear infinite',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.34]"
        style={{
          background:
            'repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 4px), linear-gradient(180deg, transparent, rgba(var(--tj-btn-primary-start), 0.06), transparent)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="pointer-events-none absolute left-0 right-0 top-[-140px] h-[120px]"
        style={{
          background:
            'linear-gradient(180deg, transparent, rgba(var(--tj-btn-primary-start), 0.16), rgba(var(--tj-btn-primary-end), 0.08), transparent)',
          animation: 'openingSweep 7s linear infinite',
        }}
      />
      <div className="pointer-events-none absolute right-[-16vw] top-[-18vw] hidden h-[52vw] min-h-[520px] w-[52vw] min-w-[520px] rounded-full border border-[rgba(var(--tj-btn-primary-start),0.16)] shadow-[inset_0_0_46px_rgba(var(--tj-btn-primary-start),0.05),_0_0_50px_rgba(var(--tj-btn-primary-start),0.08)] lg:block">
        <div className="absolute inset-[9%] rounded-full border border-dashed border-[rgba(var(--tj-btn-primary-end),0.18)]" />
        <div
          className="absolute inset-[22%] rounded-full border border-[rgba(var(--tj-btn-primary-start),0.13)]"
          style={{ animation: 'openingSpin 16s linear infinite' }}
        />
      </div>
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-[0.43]">
        {[
          ['4%', '-1s', 'AETHER-07\nANCHOR:LUOFU\nSYNC 92.4\nNPC_REF:6\nPATH: HUNT\nMEM SEED OK'],
          ['18%', '-5s', 'OPENING\nSOURCE:FREE\nCLOCK 06:40\nWORLD GATE\nZHIKU READY\nCOT ROUTE'],
          ['39%', '-8s', 'STATION\nMAP LOAD\nREGION ID\nQUEST SNAP\nVECTOR 31\nFRAME 04'],
          ['63%', '-3s', 'PROFILE\nTRAIL\nSKILL 03\nARCHIVE\nSAFETY OK\nLEDGER'],
          ['82%', '-7s', 'CANON\nNO RESET\nNO RETURN\nHERTA LOCK\nSOFT ANCHOR\nLIVE'],
        ].map(([left, delay, text]) => (
          <div
            key={left}
            className="absolute top-[-40vh] w-[72px] whitespace-pre-line font-mono text-[11px] leading-[1.75] text-[rgba(var(--tj-btn-primary-start),0.56)]"
            style={{
              left,
              textShadow: '0 0 10px rgba(var(--tj-btn-primary-start), 0.32)',
              animation: `openingRain 12s linear infinite ${delay}`,
            }}
          >
            {text}
          </div>
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 top-[14%] hidden h-px opacity-[0.55] lg:block"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-btn-primary-start), 0.16), transparent)' }}
      />

      <div className="opening-boot-scan pointer-events-none absolute inset-x-0 top-0 z-50 h-[2px]"
  style={{
    background: `linear-gradient(90deg, transparent, rgba(var(--tj-btn-primary-start), 0.7), rgba(var(--tj-btn-primary-end), 0.4), transparent)`,
    boxShadow: `0 0 12px rgba(var(--tj-btn-primary-start), 0.3), 0 2px 40px rgba(var(--tj-btn-primary-start), 0.15)`,
  }}
/>
<main className="relative z-10 mx-auto flex min-h-[calc(100dvh-36px)] w-full flex-col gap-[14px]">
        <header
          className="grid min-h-[78px] shrink-0 gap-4 px-[18px] py-[14px] md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          style={{
            background:
              'linear-gradient(90deg, rgba(var(--tj-ui-panel), 0.90), rgba(var(--tj-panel-bg-start), 0.76)), linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.12), transparent 48%, rgba(var(--tj-btn-primary-end), 0.09))',
            boxShadow: openingPanelShadowStrong,
            backdropFilter: 'blur(5px)',
            clipPath: cardClip,
          }}
        >
          <div className="min-w-0">
            <button
              onClick={onBack}
              className="mb-2 w-fit text-[11px] tracking-[0.28em] transition-opacity hover:opacity-80"
              style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }}
            >
              ← 返回
            </button>
            <div className="text-[11px] tracking-[0.38em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.58)' }}>
              KAI TUO TERMINAL / OPENING BRIEFING
            </div>
            <h1
              className="mt-1 font-serif text-2xl font-bold tracking-[0.12em] sm:text-3xl sm:tracking-[0.18em]"
              style={{
                color: 'rgba(var(--tj-text-primary),0.98)',
                textShadow: '0 0 18px rgba(var(--tj-btn-primary-end), 0.22)',
              }}
            >
              踏上旅途 · 星轨档案终端
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
              新版开局不再只是选择一段开场白，而是建立玩家、命途、介入方式与长期世界锚点。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 md:w-[450px]">
            <MiniStat label="开局来源" value={getOpeningSourceLabel(openingSource)} />
            <MiniStat label="地区锚点" value={selectedOpeningRegion?.name ?? '未指定'} />
            <MiniStat label="档案状态" value={openingArchiveStatus || '待整理'} />
          </div>
        </header>

        <section className="grid items-start gap-[14px] lg:grid-cols-[258px_minmax(0,1fr)_334px]">
          <aside className="hidden lg:block">
            <StepRail step={step} stepReady={stepReady} onStepChange={setStep} />
          </aside>

          <div
            className="relative flex min-w-0 flex-col p-0"
            style={{
              background: openingTopPanelBackground,
              boxShadow: openingPanelShadowStrong,
              backdropFilter: 'blur(5px)',
              clipPath: cardClip,
            }}
          >
            <div
              className="pointer-events-none absolute left-0 right-0 top-0 h-px"
              style={{ background: openingGlowLine }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={{
                background:
                  'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.25), transparent 18% 82%, rgba(var(--tj-btn-primary-end), 0.18)), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)',
              }}
            />
            <div className="relative flex min-h-full flex-col">
              <div className="border-b border-[rgba(var(--tj-btn-primary-end),0.16)] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] tracking-[0.32em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.62)' }}>
                      STEP {String(STEPS.indexOf(step) + 1).padStart(2, '0')} / {STEP_META[step].title.toUpperCase()}
                    </div>
                    <h2 className="mt-1 font-serif text-2xl font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-primary),0.96)' }}>
                      {STEP_META[step].title}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                      {STEP_META[step].subtitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openWorkshopEntry}
                    className="shrink-0 px-3 py-2 text-[11px] font-bold tracking-[0.18em] transition-shadow hover:shadow-[0_0_16px_rgba(var(--tj-btn-primary-start),0.16)]"
                    style={{
                      color: 'rgba(var(--tj-text-secondary), 0.78)',
                      background: 'rgba(var(--tj-surface-strong), 0.46)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                      clipPath: smallClip,
                    }}
                    title="后续作为独立页面开放"
                  >
                    创意工坊
                  </button>
                </div>
              </div>

              <div className="mb-4 min-w-0 overflow-x-auto kaituo-options-scroll px-4 lg:hidden">
                <ProgressBar step={step} />
              </div>

              <div
                className="px-4 pb-4 pt-4"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(var(--tj-ui-panel-strong), 0.20), rgba(var(--tj-bg-primary), 0.04))',
                }}
              >
                <div className="mb-4">
                  <OpeningPresetControls
                    presets={openingPresets}
                    selectedPresetId={selectedPresetId}
                    presetNameDraft={presetNameDraft}
                    status={presetStatus}
                    onPresetNameDraft={setPresetNameDraft}
                    onSelectPreset={setSelectedPresetId}
                    onApplyPreset={applyOpeningPreset}
                    onSavePreset={saveCurrentOpeningPreset}
                    onDeletePreset={deleteSelectedOpeningPreset}
                  />
                </div>
            {step === 'character' && (
              <CharacterStep
                name={name}
                onName={setName}
                alias={alias}
                onAlias={setAlias}
                gender={gender}
                onGender={setGender}
                age={age}
                onAge={setAge}
                birthday={birthday}
                birthdayMonth={birthdayParts.month}
                birthdayDay={birthdayParts.day}
                onBirthday={setBirthday}
                appearance={appearance}
                onAppearance={setAppearance}
                personality={personality}
                onPersonality={setPersonality}
                background={background}
                onBackground={setBackground}
                storyModeName={storyModeDef.name}
                templateOpeningContext={{
                  openingSourceLabel: openingSource === 'workshop' ? '创意工坊' : openingSource === 'free' ? '自由开局' : '官方预设',
                  openingRegionName: selectedOpeningRegion?.name,
                  openingChapterName: selectedScenarioPreset?.chapterName ?? selectedScenarioBundle.chapter?.name ?? selectedScenario?.name,
                  openingLocationHint: selectedOpeningLocation,
                  openingMainlineEnabled: effectiveFreeMainlineEnabled,
                  openingEntryText: effectiveCustomStartPrompt,
                }}
                onGenerateTemplate={onGenerateTravelerTemplate}
                onNext={goNext}
                onBack={goPrev}
                ready={stepReady.character}
              />
            )}

            {step === 'path' && (
              <PathStep
                pathId={pathId}
                pathStage={pathStage}
                onPath={handlePathChange}
                onPathStage={setPathStage}
                selectedAbilityIds={selectedAbilityIds}
                onToggleAbility={toggleAbility}
                customAbilities={customAbilities}
                customAbilityNameDraft={customAbilityNameDraft}
                customAbilityEffectDraft={customAbilityEffectDraft}
                onCustomAbilityNameDraft={setCustomAbilityNameDraft}
                onCustomAbilityEffectDraft={setCustomAbilityEffectDraft}
                onAddCustomAbility={addCustomAbility}
                onRemoveCustomAbility={removeCustomAbility}
                onNext={goNext}
                onBack={goPrev}
                ready={stepReady.path}
              />
            )}

            {step === 'skill' && (
              <SkillCreationStep
                openingSkills={openingSkills}
                openingSkillSlots={openingSkillSlots}
                selectedSlotKey={openingSkillSlotKey}
                selectedSlot={openingSelectedSlot}
                selectedPathId={pathId}
                selectedPathStage={pathStage}
                openingSkillNameDraft={openingSkillNameDraft}
                openingSkillDescDraft={openingSkillDescDraft}
                openingSkillSourceDraft={openingSkillSourceDraft}
                openingSkillKeywordsDraft={openingSkillKeywordsDraft}
                openingSkillCostDraft={openingSkillCostDraft}
                openingSkillCooldownDraft={openingSkillCooldownDraft}
                openingSkillNoteDraft={openingSkillNoteDraft}
                onSelectedSlotKey={setOpeningSkillSlotKey}
                onOpeningSkillNameDraft={setOpeningSkillNameDraft}
                onOpeningSkillDescDraft={setOpeningSkillDescDraft}
                onOpeningSkillSourceDraft={setOpeningSkillSourceDraft}
                onOpeningSkillKeywordsDraft={setOpeningSkillKeywordsDraft}
                onOpeningSkillCostDraft={setOpeningSkillCostDraft}
                onOpeningSkillCooldownDraft={setOpeningSkillCooldownDraft}
                onOpeningSkillNoteDraft={setOpeningSkillNoteDraft}
                onAddOpeningSkill={addOpeningSkill}
                onToggleOpeningSkill={toggleOpeningSkill}
                onRemoveOpeningSkill={removeOpeningSkill}
                onNext={goNext}
                onBack={goPrev}
              />
            )}

            {step === 'world' && (
              <OpeningAnchorStep
                storyMode={storyMode}
                onStoryMode={setStoryMode}
                startingScenarioId={startingScenarioId}
                onStartingScenarioId={setStartingScenarioId}
                selectedRegionId={selectedRegionId}
                onOpeningRegion={selectOpeningRegion}
                selectedWorkshopTemplateId={selectedWorkshopTemplateId}
                onSelectedWorkshopTemplateId={selectWorkshopTemplate}
                openingSource={openingSource}
                onOpeningSource={selectOpeningSource}
                freeOpeningMainlineEnabled={freeOpeningMainlineEnabled}
                onFreeOpeningMainlineEnabled={setFreeOpeningMainlineEnabled}
                freeOpeningPlanetSource={freeOpeningPlanetSource}
                onFreeOpeningPlanetSource={setFreeOpeningPlanetSource}
                freeOpeningWorkshop={freeOpeningWorkshop}
                onFreeOpeningWorkshop={updateFreeOpeningWorkshop}
                onSaveFreeOpeningCustomNpc={saveFreeOpeningCustomNpc}
                onRemoveFreeOpeningCustomNpc={removeFreeOpeningCustomNpc}
                customStartPrompt={customStartPrompt}
                onCustomStartPrompt={setCustomStartPrompt}
                onNext={goNext}
                onBack={goPrev}
              />
            )}

            {step === 'historian' && (
              <HistorianStep
                customIdentity={customIdentity}
                onCustomIdentity={setCustomIdentity}
                factionId={factionId}
                onFactionId={setFactionId}
                canonicalTrailblazer={canonicalTrailblazer}
                onCanonicalTrailblazer={setCanonicalTrailblazer}
                onNext={goNext}
                onBack={goPrev}
              />
            )}

            {step === 'overview' && (
              <OverviewStep
                name={name.trim() || '无名开拓者'}
                alias={alias}
                gender={gender}
                age={age}
                birthday={birthday}
                background={background}
                storyMode={storyMode}
                pathId={pathId}
                pathStage={pathStage}
                factionId={factionId}
                customIdentity={customIdentity}
                selectedScenario={selectedScenario}
                selectedOpeningTitle={selectedOpeningTitle}
                selectedOpeningRegionName={selectedOpeningRegion?.name ?? ''}
                openingSource={openingSource}
                freeOpeningMainlineEnabled={effectiveFreeMainlineEnabled}
                freeOpeningPlanetSource={freeOpeningPlanetSource}
                customStartPrompt={effectiveCustomStartPrompt}
                canonicalTrailblazer={canonicalTrailblazer}
                selectedAbilityNames={selectedAbilityNames}
                openingSkills={openingSkills}
                currentLocation={selectedOpeningLocation}
                onStart={handleStart}
                onBack={goPrev}
                starting={startingGame}
                openingArchiveStatus={openingArchiveStatus}
              />
            )}
            </div>
            </div>
          </div>

          <aside className="hidden lg:block">
            <OpeningLedger
              scenarioTitle={selectedOpeningTitle}
              storyMode={storyModeDef.name}
              path={selectedPath}
              pathStage={pathId !== 'none' ? selectedPathStage : undefined}
              faction={selectedFaction}
              currentDate={selectedOpeningDate}
              currentTime={selectedOpeningTime}
              currentLocation={selectedOpeningLocation}
              abilities={selectedAbilityNames}
              highlights={openingHighlights}
            />
          </aside>
        </section>
      </main>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="p-[10px_12px] text-left"
      style={{
        background: openingSoftPanelBackground,
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.30), inset 0 0 0 2px rgba(var(--tj-btn-primary-end), 0.08)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.64)' }}>
        {label}
      </div>
      <div className="mt-1 text-[13px] font-semibold" style={{ color: 'rgb(var(--tj-accent-secondary))' }}>
        {value}
      </div>
    </div>
  );
}

function OpeningPresetControls({
  presets,
  selectedPresetId,
  presetNameDraft,
  status,
  onPresetNameDraft,
  onSelectPreset,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
}: {
  presets: OpeningPlayerPreset[];
  selectedPresetId: string;
  presetNameDraft: string;
  status: string;
  onPresetNameDraft: (value: string) => void;
  onSelectPreset: (value: string) => void;
  onApplyPreset: (id: string) => void;
  onSavePreset: () => void;
  onDeletePreset: () => void;
}) {
  const hasSelected = Boolean(selectedPresetId && presets.some((item) => item.id === selectedPresetId));

  return (
    <div
      className="p-3 text-left"
      style={{
        background: 'rgba(var(--tj-surface-bg-start), 0.78)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] tracking-[0.26em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.65)' }}>
          我的开局预设
        </div>
        <div className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
          {presets.length}/{MAX_OPENING_PLAYER_PRESETS}
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
        <input
          value={presetNameDraft}
          onChange={(event) => onPresetNameDraft(event.target.value)}
          placeholder="预设名，例如：公司调查员"
          className="kaituo-input w-full px-3 py-2 text-xs"
          style={{ clipPath: smallClip }}
        />

        <select
          value={selectedPresetId}
          onChange={(event) => {
            const nextId = event.target.value;
            onSelectPreset(nextId);
            const selected = presets.find((item) => item.id === nextId);
            if (selected) onPresetNameDraft(selected.title);
          }}
          className="kaituo-input w-full px-3 py-2 text-xs"
          style={{ clipPath: smallClip }}
        >
          <option value="">暂无已保存预设</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.title}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onSavePreset}
            className="kaituo-btn kaituo-btn-primary px-2 py-2 text-[11px]"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => selectedPresetId && onApplyPreset(selectedPresetId)}
            disabled={!hasSelected}
            className="kaituo-btn kaituo-btn-secondary px-2 py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            套用
          </button>
          <button
            type="button"
            onClick={onDeletePreset}
            disabled={!hasSelected}
            className="px-2 py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: 'rgba(var(--tj-danger),0.12)',
              color: 'rgba(var(--tj-danger),0.92)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.22)',
              clipPath: smallClip,
            }}
          >
            删除
          </button>
        </div>
      </div>

      <div className="mt-2 text-[10px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
        {status || '只保存开局表单，不保存 API key 或存档进度。'}
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: Step }) {
  const currentIdx = STEPS.indexOf(step);
  return (
    <div className="flex min-w-[520px] items-center justify-center gap-1 sm:min-w-0">
      {STEPS.map((item, index) => {
        const active = item === step;
        const passed = index < currentIdx;
        const reached = active || passed;
        return (
          <div key={item} className="flex min-w-[92px] flex-1 items-center gap-1 sm:min-w-0">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="flex h-8 w-8 items-center justify-center text-xs font-bold"
                style={{
                  background: reached
                    ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.95))'
                    : 'rgba(var(--tj-panel-bg-end),0.7)',
                  color: reached ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.65)',
                  boxShadow: reached
                    ? '0 0 10px rgba(var(--tj-btn-primary-start), 0.24)'
                    : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
                  clipPath: smallClip,
                }}
              >
                {passed ? '✓' : index + 1}
              </div>
              <div
                className="w-full truncate text-center text-[10px] tracking-[0.1em] sm:tracking-[0.16em]"
                style={{ color: reached ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.84), rgba(var(--tj-btn-primary-end),0.78))' : 'rgba(var(--tj-text-secondary), 0.5)' }}
              >
                {STEP_META[item].title}
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className="mb-5 h-px w-5 shrink-0"
                style={{
                  background: passed
                    ? 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.65), rgba(var(--tj-btn-primary-start), 0.18))'
                    : 'rgba(var(--tj-btn-primary-start), 0.14)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function OpeningLedger({
  scenarioTitle,
  storyMode,
  path,
  pathStage,
  faction,
  currentDate,
  currentTime,
  currentLocation,
  abilities,
  highlights,
}: {
  scenarioTitle: string;
  storyMode: string;
  path?: ReturnType<typeof getPath>;
  pathStage?: (typeof PATH_STAGE_DEFS)[number];
  faction?: ReturnType<typeof getFaction>;
  currentDate: string;
  currentTime: string;
  currentLocation: string;
  abilities: string[];
  highlights: string[];
}) {
  return (
    <div
      className="overflow-hidden"
      style={{
        background: openingLedgerBackground,
        boxShadow: openingPanelShadow,
        backdropFilter: 'blur(5px)',
        clipPath: cardClip,
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(var(--tj-btn-primary-end),0.16)] px-[15px] pb-[10px] pt-[14px]">
        <div className="text-[11px] tracking-[0.34em]" style={{ color: 'rgba(var(--tj-btn-primary-end), 0.92)' }}>
          {'\u5b9e\u65f6\u5f00\u5c40\u6863\u6848'}
        </div>
        <span
          className="px-2 py-1 text-[10px] tracking-[0.18em]"
          style={{
            color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))',
            background: 'rgba(var(--tj-btn-primary-start), 0.10)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.24)',
            clipPath: smallClip,
          }}
        >
          LIVE
        </span>
      </div>
      <div className="grid gap-[10px] p-[14px]">
        <div
          className="relative h-[86px] overflow-hidden p-3"
          style={{
            background: openingCardBackground,
            boxShadow: openingCardBorder,
            clipPath: smallClip,
          }}
        >
          <div className="relative z-10 text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
            ARCHIVE SIGNAL
          </div>
          <svg viewBox="0 0 320 86" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full opacity-95">
            <path
              d="M0 58 C28 42 34 38 56 48 S94 70 118 50 154 16 178 38 208 62 238 42 274 24 320 30"
              fill="none"
              stroke="rgba(var(--tj-btn-primary-start), 0.66)"
              strokeWidth="2"
              strokeLinecap="round"
              style={{
                filter: 'drop-shadow(0 0 6px rgba(var(--tj-btn-primary-start), 0.4))',
                strokeDasharray: 220,
                animation: 'openingDash 4s linear infinite',
              }}
            />
          </svg>
        </div>
        <ArchiveCard label={'\u8d77\u70b9'} title={scenarioTitle || '\u672a\u9009\u62e9'} body={`${currentDate} · ${currentTime}`} />
        <ArchiveCard label={'\u5730\u70b9'} title={currentLocation} body={`\u5267\u60c5\u6a21\u5f0f\uff1a${storyMode}`} />
        <ArchiveCard label={'\u547d\u9014\u4e0e\u9636\u6bb5'} title={path ? `${path.name} · ${path.aeon}` : '\u65e0\u547d\u9014'} body={path && pathStage ? `${pathStage.name} · ${pathStage.title}` : '\u672a\u9009\u62e9'} />
        <ArchiveCard label={'\u7ec4\u7ec7\u80cc\u666f'} title={faction?.name ?? '\u65e0\u56fa\u5b9a\u7ec4\u7ec7'} body={abilities.length ? `\u80fd\u529b\uff1a${abilities.join('\u3001')}` : '\u80fd\u529b\uff1a\u6682\u672a\u9009\u62e9'} />

        {highlights.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              {'\u5f00\u5c40\u8981\u70b9'}
            </div>
            <div className="space-y-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
              {highlights.map((item) => (
                <ArchiveCard key={item} label={'\u80cc\u666f\u53c2\u8003'} title={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OpeningSkillSlotGroup({
  title,
  slots,
  selectedSlotKey,
  onSelect,
  emptyText = '暂无可用槽位。',
}: {
  title: string;
  slots: 战技槽位摘要[];
  selectedSlotKey: OpeningSkillSlotKey;
  onSelect: (key: OpeningSkillSlotKey) => void;
  emptyText?: string;
}) {
  return (
    <div
      className="p-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.45)',
        color: 'rgba(var(--tj-text-secondary), 0.82)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
        {title}
      </div>
      {slots.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => {
            const key = toOpeningSkillSlotKey(slot);
            const active = selectedSlotKey === key;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => onSelect(key)}
                className="min-w-[120px] px-3 py-2 text-left transition-transform hover:-translate-y-0.5"
                style={{
background: active
  ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.14), rgba(var(--tj-btn-primary-end), 0.06))'
  : 'rgba(var(--tj-surface-strong), 0.56)',
                  boxShadow: active
                    ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), 0 0 12px rgba(var(--tj-btn-primary-start), 0.10)'
                    : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                  clipPath: smallClip,
                }}
              >
                <div className="text-[10px]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.72)' }}>
                  {slot.kind === 'normal' ? `普通槽 ${slot.slotIndex}` : `${slot.pathId ? getPath(slot.pathId)?.name : '命途'} 槽 ${slot.slotIndex}`}
                </div>
                <div className="mt-1 truncate font-serif text-sm font-bold tracking-[0.12em]" style={{ color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}>
                  {slot.occupiedSkillName ?? '空槽'}
                </div>
                <div className="mt-1 text-[10px]" style={{ color: slot.occupiedSkillId ? 'rgba(var(--tj-btn-primary-start), 0.92)' : 'rgba(var(--tj-text-secondary), 0.72)' }}>
                  {slot.occupiedSkillId ? (slot.occupiedSkillEnabled === false ? '已填 · 停用' : '已填') : '未装备'}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className="p-3 text-xs leading-relaxed"
          style={{
            background: 'rgba(var(--tj-bg-primary), 0.35)',
            color: 'rgba(var(--tj-text-secondary), 0.72)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.10)',
            clipPath: smallClip,
          }}
        >
          {emptyText}
        </div>
      )}
    </div>
  );
}

function ArchiveCard({ label, title, body }: { label: string; title: string; body?: string }) {
  return (
    <div
      className="p-3"
      style={{
        background: openingCardBackground,
        boxShadow: openingCardBorder,
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>{label}</div>
      <div className="mt-[5px] break-words text-[13px] font-semibold leading-snug" style={{ color: 'rgb(var(--tj-text-primary))' }}>{title}</div>
      {body ? <div className="mt-[7px] break-words text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.84)' }}>{body}</div> : null}
    </div>
  );
}

function toOpeningSkillSlotKey(slot: 战技槽位摘要): OpeningSkillSlotKey {
  return slot.kind === 'normal'
    ? `normal:${slot.slotIndex}`
    : `path:${slot.pathId ?? 'none'}:${slot.slotIndex}`;
}

function resolveOpeningSkillSlot(slots: 战技槽位摘要[], key: OpeningSkillSlotKey): 战技槽位摘要 | undefined {
  const [kind, pathOrIndex, maybeIndex] = key.split(':');
  if (kind === 'normal') {
    return slots.find((slot) => slot.kind === 'normal' && slot.slotIndex === Number(pathOrIndex));
  }
  return slots.find((slot) => slot.kind === 'path' && slot.pathId === pathOrIndex && slot.slotIndex === Number(maybeIndex));
}

function openingSkillSlotTitle(slot: 战技槽位摘要): string {
  if (slot.kind === 'normal') return `普通战技槽 ${slot.slotIndex}`;
  const pathDef = slot.pathId ? getPath(slot.pathId) : undefined;
  return `${pathDef?.name ?? '命途'}战技槽 ${slot.slotIndex}`;
}

function openingSkillRecordSlotLabel(skill: 战技记录): string {
  if (skill.槽位类型 === 'normal') return `普通战技槽 ${skill.槽位序号}`;
  const pathDef = skill.关联命途 ? getPath(skill.关联命途) : undefined;
  return `${pathDef?.name ?? '命途'}战技槽 ${skill.槽位序号}`;
}

function sameOpeningSkillSlot(a: 战技记录, b: 战技记录): boolean {
  if (a.id === b.id) return false;
  if (a.槽位类型 !== b.槽位类型) return false;
  if (a.槽位序号 !== b.槽位序号) return false;
  if (a.槽位类型 === 'normal') return true;
  return a.关联命途 === b.关联命途;
}

function StepRail({
  step,
  stepReady,
  onStepChange,
}: {
  step: Step;
  stepReady: Record<Step, boolean>;
  onStepChange: (step: Step) => void;
}) {
  const currentIdx = STEPS.indexOf(step);
  const visualIdx = currentIdx;
  return (
    <div
      className="overflow-hidden"
      style={{
        background: openingRailBackground,
        boxShadow: openingPanelShadow,
        backdropFilter: 'blur(5px)',
        clipPath: cardClip,
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(var(--tj-btn-primary-end),0.16)] px-[15px] pb-[10px] pt-[14px]">
        <div className="text-[11px] tracking-[0.34em]" style={{ color: 'rgba(var(--tj-btn-primary-end), 0.92)' }}>
          建档流程
        </div>
        <div
          className="px-2 py-1 text-[10px] tracking-[0.18em]"
          style={{
            color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))',
            background: 'rgba(var(--tj-btn-primary-start), 0.10)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.24)',
            clipPath: smallClip,
          }}
        >
          SYNC
        </div>
      </div>
      <div className="grid gap-[9px] p-3">
        {STEP_RAIL_ITEMS.map((item, index) => {
          const active = item.key === step;
          const done = index < visualIdx;
          const ready = stepReady[item.key as Step];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onStepChange(item.key)}
              aria-current={active ? 'step' : undefined}
              className="grid w-full cursor-pointer grid-cols-[34px_minmax(0,1fr)] gap-[10px] p-3 text-left transition duration-200 hover:-translate-y-[1px] hover:shadow-[0_0_18px_rgba(var(--tj-btn-primary-start),0.14)] focus:outline-none focus-visible:shadow-[0_0_0_2px_rgba(var(--tj-btn-primary-start),0.45),0_0_18px_rgba(var(--tj-btn-primary-start),0.18)]"
              style={{
                background: active
                  ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.16), rgba(var(--tj-btn-primary-end), 0.08))'
                  : 'rgba(var(--tj-panel-bg-end), 0.58)',
                boxShadow: active
                  ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.48), 0 0 18px rgba(var(--tj-btn-primary-start), 0.10)'
                  : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.13)',
                clipPath: smallClip,
              }}
            >
              <div
                className="opening-step-badge flex h-[34px] w-[34px] shrink-0 items-center justify-center text-xs font-extrabold"
                style={{
background: done || active
  ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.98), rgba(var(--tj-btn-primary-end), 0.9))'
  : 'rgba(var(--tj-surface-strong), 0.74)',
                  color: done || active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.72)',
                  boxShadow: done
                    ? '0 0 12px rgba(var(--tj-btn-primary-start), 0.22)'
                    : active
                      ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.48), 0 0 12px rgba(var(--tj-btn-primary-start), 0.1)'
                    : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                  clipPath: smallClip,
                }}
              >
                {done ? '✓' : index + 1}
              </div>
              <div className="min-w-0">
                <div
                  className="text-sm font-medium"
                  style={{ color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                >
                  {item.title}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                  {item.subtitle}
                </div>
                {!done && !active && !ready ? (
                  <div className="mt-2 text-[10px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.5)' }}>
                    WAITING
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  backLabel = '上一步',
  nextLabel = '下一步',
  ready = true,
}: {
  onBack?: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  ready?: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      {onBack && (
        <button onClick={onBack} className="kaituo-btn kaituo-btn-secondary flex-1 px-4 py-3 text-sm">
          {backLabel}
        </button>
      )}
      <button
        onClick={onNext}
        disabled={!ready}
        className="kaituo-btn kaituo-btn-primary group flex-1 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full transition-transform duration-700 ease-out group-hover:translate-x-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-text-primary), 0.45), transparent)' }}
        />
        <span className="relative tracking-[0.2em] font-bold">{nextLabel}</span>
      </button>
    </div>
  );
}

function SectionTitle({ title, subtitle, compact = false }: { title: string; subtitle: string; compact?: boolean }) {
  return (
    <div className={`${compact ? '' : 'mb-5'} min-w-0`}>
      <div
        className="mb-2 text-[11px] tracking-[0.32em]"
        style={{ color: 'rgba(var(--tj-btn-primary-start), 0.62)' }}
      >
        {subtitle}
      </div>
      <h3
        className="font-serif text-xl font-bold tracking-[0.12em] sm:text-2xl sm:tracking-[0.18em]"
        style={{
          background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 45%, rgb(var(--tj-accent-secondary)) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {title}
      </h3>
    </div>
  );
}

function StoryModeSelector({
  storyMode,
  onStoryMode,
}: {
  storyMode: 剧情模式;
  onStoryMode: (mode: 剧情模式) => void;
}) {
  return (
    <section
      className="p-[13px]"
      style={{
        background: openingCardBackground,
        boxShadow: openingCardBorder,
        clipPath: smallClip,
      }}
    >
      <div className="mb-3">
        <div className="text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
          剧情偏向
        </div>
        <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
          决定开场与后续主剧情的关系发展方向，不锁定具体角色或事件。
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {storyModes.map((item) => {
          const active = storyMode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onStoryMode(item.id)}
              className="w-full p-4 text-left transition-transform hover:-translate-y-0.5"
              style={{
                background: active ? openingActiveCardBackground : 'rgba(var(--tj-panel-bg-end),0.58)',
                boxShadow: active ? openingCyanBorder : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                clipPath: tightClip,
              }}
            >
              <div
                className="font-serif text-base font-bold tracking-[0.14em]"
                style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
              >
                {item.name}
              </div>
              <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                {item.description}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CharacterStep({
  name,
  onName,
  alias,
  onAlias,
  gender,
  onGender,
  age,
  onAge,
  birthday,
  birthdayMonth,
  birthdayDay,
  onBirthday,
  appearance,
  onAppearance,
  personality,
  onPersonality,
  background,
  onBackground,
  storyModeName,
  templateOpeningContext,
  onGenerateTemplate,
  onNext,
  onBack,
  ready,
}: {
  name: string;
  onName: (v: string) => void;
  alias: string;
  onAlias: (v: string) => void;
  gender: string;
  onGender: (v: string) => void;
  age: number;
  onAge: (v: number) => void;
  birthday: string;
  birthdayMonth: string;
  birthdayDay: string;
  onBirthday: (v: string) => void;
  appearance: string;
  onAppearance: (v: string) => void;
  personality: string;
  onPersonality: (v: string) => void;
  background: string;
  onBackground: (v: string) => void;
  storyModeName: string;
  templateOpeningContext?: Pick<
    TravelerTemplateContext,
    'openingSourceLabel' | 'openingRegionName' | 'openingChapterName' | 'openingLocationHint' | 'openingMainlineEnabled' | 'openingEntryText'
  >;
  onGenerateTemplate?: (context: TravelerTemplateContext) => Promise<TravelerTemplateDraft>;
  onNext: () => void;
  onBack: () => void;
  ready: boolean;
}) {
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [templatePrompt, setTemplatePrompt] = useState('');

  const handleGenerateTemplate = async () => {
    if (!onGenerateTemplate || templateLoading) return;
    setTemplateError('');
    setTemplateLoading(true);
    try {
      const draft = await onGenerateTemplate({
        storyModeName,
        ...templateOpeningContext,
        existingName: name,
        existingAlias: alias,
        existingGender: gender,
        existingAge: age,
        existingBirthday: birthday,
        userPrompt: templatePrompt,
      });
      onName(draft.name);
      onAlias(draft.alias);
      onGender(draft.gender);
      onAge(draft.age);
      onBirthday(draft.birthday);
      onAppearance(draft.appearance);
      onPersonality(draft.personality);
      onBackground(draft.background);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : '模板生成失败，请稍后再试。');
    } finally {
      setTemplateLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <SectionTitle title="角色档案" subtitle="把主角写得更像一位真正会走进故事的人" compact />
        {onGenerateTemplate ? (
          <div className="flex w-full flex-col gap-1 sm:max-w-xl sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <input
                value={templatePrompt}
                onChange={(event) => setTemplatePrompt(event.target.value)}
                disabled={templateLoading}
                placeholder="可填生成偏好，例如：公司调查员、冷静强势、会一点虚数奇术"
                className="min-w-0 flex-1 px-3 py-2 text-xs outline-none disabled:cursor-wait disabled:opacity-60"
                style={{
                  background: 'rgba(var(--tj-panel-bg-end),0.52)',
                  color: 'rgba(var(--tj-text-primary),0.92)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                  clipPath: smallClip,
                }}
              />
              <button
                type="button"
                onClick={handleGenerateTemplate}
                disabled={templateLoading}
                className="kaituo-btn kaituo-btn-secondary shrink-0 px-4 py-2.5 text-xs disabled:cursor-wait disabled:opacity-60"
              >
                <span className="tracking-[0.18em]">{templateLoading ? '生成中...' : '随机生成模板'}</span>
              </button>
            </div>
            <span className="text-[10px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
              可填偏好；该功能走主 API 模型
            </span>
          </div>
        ) : null}
      </div>

      {templateError ? (
        <div
          className="mb-4 px-3 py-2 text-xs leading-relaxed"
          style={{
            background: 'rgba(var(--tj-danger),0.12)',
            color: 'rgba(var(--tj-danger),0.92)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.24)',
            clipPath: smallClip,
          }}
        >
          {templateError}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-1">
        <div className="space-y-4">
          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <LabelField label="姓名">
                <input
                  value={name}
                  onChange={(e) => onName(e.target.value)}
                  placeholder="例如：流云"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="别名 / 外号">
                <input
                  value={alias}
                  onChange={(e) => onAlias(e.target.value)}
                  placeholder="可留空"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="性别">
                <input
                  value={gender}
                  onChange={(e) => onGender(e.target.value)}
                  placeholder="例如：男 / 女 / 其他"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="年龄">
                <input
                  type="number"
                  value={age}
                  onChange={(e) => onAge(Number(e.target.value) || 0)}
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <div>
                <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                  生日
                </div>
                <div className="grid grid-cols-[1fr_1fr] gap-2">
                  <input
                    value={birthdayMonth}
                    onChange={(e) => onBirthday(mergeBirthday(e.target.value, birthdayDay))}
                    placeholder="月"
                    className="kaituo-input w-full px-3 py-2 text-sm"
                    style={{ clipPath: smallClip }}
                  />
                  <input
                    value={birthdayDay}
                    onChange={(e) => onBirthday(mergeBirthday(birthdayMonth, e.target.value))}
                    placeholder="日"
                    className="kaituo-input w-full px-3 py-2 text-sm"
                    style={{ clipPath: smallClip }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
              <LabelField label="外貌">
                <textarea
                  value={appearance}
                  onChange={(e) => onAppearance(e.target.value)}
                  rows={4}
                  placeholder="例如：黑发蓝眼、刘海遮住一只眼睛、身形清瘦但挺拔、左耳有耳钉、常穿深色外套"
                  className="kaituo-input w-full resize-none px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
            </LabelField>
            <div className="mt-4">
              <LabelField label="性格">
                <textarea
                  value={personality}
                  onChange={(e) => onPersonality(e.target.value)}
                  rows={4}
                  placeholder="例如：冷静、嘴硬心软、警惕但愿意信任同伴"
                  className="kaituo-input w-full resize-none px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
            </div>
            <div className="mt-4">
              <LabelField label="背景故事">
                <textarea
                  value={background}
                  onChange={(e) => onBackground(e.target.value)}
                  rows={6}
                  placeholder="可选。写下你的出身、过去经历、为何来到黑塔空间站、与命途或某个组织的关系。这里会显示在旅人档案中，也会被主剧情读取。"
                  className="kaituo-input w-full resize-none px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
                这里写的是角色自己的经历，不是开局系统摘要；切入剧情的具体方式仍在「介入方式」页填写。
              </p>
            </div>
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} ready={ready} nextLabel="继续：命途与能力" />
    </div>
  );
}

function PathStep({
  pathId,
  pathStage,
  onPath,
  onPathStage,
  selectedAbilityIds,
  onToggleAbility,
  customAbilities,
  customAbilityNameDraft,
  customAbilityEffectDraft,
  onCustomAbilityNameDraft,
  onCustomAbilityEffectDraft,
  onAddCustomAbility,
  onRemoveCustomAbility,
  onNext,
  onBack,
  ready,
}: {
  pathId: 命途ID;
  pathStage: 命途阶段;
  onPath: (id: 命途ID) => void;
  onPathStage: (stage: 命途阶段) => void;
  selectedAbilityIds: string[];
  onToggleAbility: (id: string) => void;
  customAbilities: string[];
  customAbilityNameDraft: string;
  customAbilityEffectDraft: string;
  onCustomAbilityNameDraft: (v: string) => void;
  onCustomAbilityEffectDraft: (v: string) => void;
  onAddCustomAbility: () => void;
  onRemoveCustomAbility: (text: string) => void;
  onNext: () => void;
  onBack: () => void;
  ready: boolean;
}) {
  const selectedPath = getPath(pathId);
  const selectedStage = PATH_STAGE_DEFS.find((item) => item.stage === pathStage) ?? PATH_STAGE_DEFS[0];

  return (
    <div>
      <SectionTitle title="命途与能力" subtitle="让角色在故事里拥有更清晰的轨迹" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <div>
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              命途选择
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {paths.map((item) => {
                const active = pathId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onPath(item.id)}
                    className="p-4 text-left transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active
                        ? 'linear-gradient(160deg, rgba(var(--tj-btn-primary-start), 0.13), rgba(var(--tj-btn-primary-end), 0.05))'
                        : 'rgba(var(--tj-panel-bg-end),0.58)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.5), 0 0 14px rgba(var(--tj-btn-primary-start), 0.12)'
                        : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                      clipPath: tightClip,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className="flex h-[30px] w-[30px] items-center justify-center text-[22px] leading-none"
                          style={{ color: active ? 'rgba(var(--tj-btn-primary-start),0.96)' : 'rgba(var(--tj-btn-primary-start),0.58)' }}
                        >
                          {item.emblem}
                        </div>
                        <div
                          className="mt-2 font-serif text-base font-bold tracking-[0.14em]"
                          style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                        >
                          {item.name}
                        </div>
                      </div>
                      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                        {item.aeon}
                      </div>
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                      {item.blurb}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedPath && (
              <div
                className="mt-3 p-3 text-xs leading-relaxed"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.52)',
                  color: 'rgba(var(--tj-text-secondary), 0.84)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                  clipPath: smallClip,
                }}
              >
                <div style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }}>
                  {selectedPath.name} · {selectedPath.aeon}
                </div>
                <div className="mt-1">{selectedPath.description}</div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              初始阶段
            </div>
            {selectedPath ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {OPENING_PATH_STAGE_DEFS.map((item) => {
                  const active = pathStage === item.stage;
                  return (
                    <button
                      key={item.stage}
                      onClick={() => onPathStage(item.stage)}
                      className="p-4 text-left transition-transform hover:-translate-y-0.5"
                      style={{
                        background: active
                          ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.12), rgba(var(--tj-btn-primary-end), 0.04))'
                          : 'rgba(var(--tj-panel-bg-end),0.58)',
                        boxShadow: active
                          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.46), 0 0 12px rgba(var(--tj-btn-primary-start), 0.1)'
                          : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.13)',
                        clipPath: tightClip,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div
                            className="font-serif text-base font-bold tracking-[0.14em]"
                            style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                          >
                            {item.name}
                          </div>
                          <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.72)' }}>
                            {item.title}
                          </div>
                        </div>
                        <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                          STAGE {item.stage}
                        </div>
                      </div>
                      <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                        {item.blurb}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className="p-3 text-xs leading-relaxed"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.52)',
                  color: 'rgba(var(--tj-text-secondary), 0.72)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
                  clipPath: smallClip,
                }}
              >
                未选择命途时无需选择阶段。
              </div>
            )}

            {selectedPath && (
              <div
                className="mt-3 p-3 text-xs leading-relaxed"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.52)',
                  color: 'rgba(var(--tj-text-secondary), 0.84)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                  clipPath: smallClip,
                }}
              >
                当前开局将以「{selectedStage.name} · {selectedStage.title}」写入旅人命途档案。高阶段会明显改变首回合叙事强度与周围人物反应。
              </div>
            )}
          </div>

        </div>

        <div className="space-y-5">
          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              开局特质
            </div>
            <div className="grid grid-cols-1 gap-3">
              {abilityPresets.map((item) => {
                const active = selectedAbilityIds.includes(item.id);
                const disabled = !active && selectedAbilityIds.length >= 2;
                return (
                  <button
                    key={item.id}
                    onClick={() => onToggleAbility(item.id)}
                    disabled={disabled}
                    className="p-4 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.10), rgba(var(--tj-btn-primary-end), 0.04))'
                        : 'rgba(var(--tj-bg-primary), 0.52)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.45), 0 0 12px rgba(var(--tj-btn-primary-start), 0.1)'
                        : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
                      clipPath: tightClip,
                    }}
                  >
                    <div
                      className="font-serif text-base font-bold tracking-[0.14em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                    >
                      <span style={{ color: 'rgba(var(--tj-btn-primary-start), 0.76)' }}>{active ? '✓ ' : '◆ '}</span>
                      {item.name}
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                      {item.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                自定义特质
              </div>
              <div className="grid gap-2">
                <input
                  value={customAbilityNameDraft}
                  onChange={(e) => onCustomAbilityNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('custom-ability-effect-input')?.focus();
                    }
                  }}
                  placeholder="输入特质名称，例如：奇物研究助手"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
                <div className="flex gap-2">
                  <input
                    id="custom-ability-effect-input"
                    value={customAbilityEffectDraft}
                    onChange={(e) => onCustomAbilityEffectDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onAddCustomAbility();
                      }
                    }}
                    placeholder="输入效果说明，例如：更熟悉奇物辨认与装置检修"
                    className="kaituo-input flex-1 px-3 py-2 text-sm"
                    style={{ clipPath: smallClip }}
                  />
                  <button
                    type="button"
                    onClick={onAddCustomAbility}
                    className="px-3 text-base"
                    style={{
                      background: 'rgba(var(--tj-btn-primary-start), 0.16)',
                      color: 'rgba(var(--tj-btn-primary-start), 0.95)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.32)',
                      clipPath: smallClip,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {customAbilities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customAbilities.map((item) => {
                    const parsed = splitCustomAbilityEntry(item);
                    return (
                      <button
                        key={item}
                        onClick={() => onRemoveCustomAbility(item)}
                        className="max-w-full px-3 py-2 text-left text-xs tracking-[0.12em]"
                        style={{
                          background: 'rgba(var(--tj-btn-primary-start), 0.12)',
                          color: 'rgba(var(--tj-btn-primary-start), 0.96)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.28)',
                          clipPath: smallClip,
                        }}
                        title="点击删除"
                      >
                        <span className="block font-semibold">{parsed.name} ×</span>
                        {parsed.effect ? (
                          <span className="mt-1 block max-w-[280px] truncate text-[10px] tracking-[0.06em] opacity-80">
                            {parsed.effect}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          <div
            className="p-4 text-xs leading-relaxed"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.52)',
              color: 'rgba(var(--tj-text-secondary), 0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
              clipPath: smallClip,
            }}
          >
            命途和能力会直接影响首回合正文里的措辞、可用行动与人物反应。这里写得越清楚，后面越不容易失真。
            <br />
            开局特质最多选择 2 个，自定义特质不计入上限。
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} ready={ready} nextLabel="继续：战技创作" />
    </div>
  );
}

function SkillCreationStep({
  openingSkills,
  openingSkillSlots,
  selectedSlotKey,
  selectedSlot,
  selectedPathId,
  selectedPathStage,
  openingSkillNameDraft,
  openingSkillDescDraft,
  openingSkillSourceDraft,
  openingSkillKeywordsDraft,
  openingSkillCostDraft,
  openingSkillCooldownDraft,
  openingSkillNoteDraft,
  onSelectedSlotKey,
  onOpeningSkillNameDraft,
  onOpeningSkillDescDraft,
  onOpeningSkillSourceDraft,
  onOpeningSkillKeywordsDraft,
  onOpeningSkillCostDraft,
  onOpeningSkillCooldownDraft,
  onOpeningSkillNoteDraft,
  onAddOpeningSkill,
  onToggleOpeningSkill,
  onRemoveOpeningSkill,
  onNext,
  onBack,
}: {
  openingSkills: 战技记录[];
  openingSkillSlots: 战技槽位摘要[];
  selectedSlotKey: OpeningSkillSlotKey;
  selectedSlot?: 战技槽位摘要;
  selectedPathId: 命途ID;
  selectedPathStage: 命途阶段;
  openingSkillNameDraft: string;
  openingSkillDescDraft: string;
  openingSkillSourceDraft: string;
  openingSkillKeywordsDraft: string;
  openingSkillCostDraft: string;
  openingSkillCooldownDraft: string;
  openingSkillNoteDraft: string;
  onSelectedSlotKey: (key: OpeningSkillSlotKey) => void;
  onOpeningSkillNameDraft: (v: string) => void;
  onOpeningSkillDescDraft: (v: string) => void;
  onOpeningSkillSourceDraft: (v: string) => void;
  onOpeningSkillKeywordsDraft: (v: string) => void;
  onOpeningSkillCostDraft: (v: string) => void;
  onOpeningSkillCooldownDraft: (v: string) => void;
  onOpeningSkillNoteDraft: (v: string) => void;
  onAddOpeningSkill: () => void;
  onToggleOpeningSkill: (skillId: string) => void;
  onRemoveOpeningSkill: (skillId: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const normalSlots = openingSkillSlots.filter((slot) => slot.kind === 'normal');
  const pathSlots = openingSkillSlots.filter((slot) => slot.kind === 'path');
  const selectedPath = selectedPathId !== 'none' ? getPath(selectedPathId) : undefined;
  const selectedStage = PATH_STAGE_DEFS.find((item) => item.stage === selectedPathStage) ?? PATH_STAGE_DEFS[0];
  const selectedSlotTitle = selectedSlot ? openingSkillSlotTitle(selectedSlot) : '未选择槽位';

  return (
    <div>
      <SectionTitle title="战技创作" subtitle="提前写好正文可调用的能力表现" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div
          className="p-4"
          style={{
            background: 'rgba(var(--tj-panel-bg-end),0.58)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
            clipPath: cardClip,
          }}
        >
          <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
            新建战技
          </div>
          <div className="mb-4 grid gap-3">
            <div
              className="p-3 text-xs leading-relaxed"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.52)',
                color: 'rgba(var(--tj-text-secondary), 0.84)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                clipPath: smallClip,
              }}
            >
              <div className="text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                当前装备槽位
              </div>
              <div className="mt-1 font-serif text-base font-bold tracking-[0.12em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                {selectedSlotTitle}
              </div>
              <div className="mt-1">
                普通战技固定 {NORMAL_SKILL_SLOT_COUNT} 槽；命途战技跟随前一步等阶开放。当前命途：
                {selectedPath ? `${selectedPath.name} · ${selectedStage.name}（${pathSlots.length} 槽）` : '未选择命途'}。
              </div>
            </div>

            <OpeningSkillSlotGroup
              title="普通战技槽"
              slots={normalSlots}
              selectedSlotKey={selectedSlotKey}
              onSelect={onSelectedSlotKey}
            />
            <OpeningSkillSlotGroup
              title="命途战技槽"
              slots={pathSlots}
              selectedSlotKey={selectedSlotKey}
              onSelect={onSelectedSlotKey}
              emptyText="前一步选择命途后，这里会出现对应等阶的命途槽位。"
            />
          </div>
          <div className="grid gap-3">
            <LabelField label="战技名称">
              <input
                value={openingSkillNameDraft}
                onChange={(e) => onOpeningSkillNameDraft(e.target.value)}
                placeholder="例如：星核呼吸、虚数折跃、云骑步法"
                className="kaituo-input w-full px-3 py-2 text-sm"
                style={{ clipPath: smallClip }}
              />
            </LabelField>
            <div className="grid gap-3 md:grid-cols-2">
              <LabelField label="来源">
                <input
                  value={openingSkillSourceDraft}
                  onChange={(e) => onOpeningSkillSourceDraft(e.target.value)}
                  placeholder={selectedSlot?.kind === 'path' ? '命途战技自定义' : '普通战技自制'}
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="关键词">
                <input
                  value={openingSkillKeywordsDraft}
                  onChange={(e) => onOpeningSkillKeywordsDraft(e.target.value)}
                  placeholder="追击、护盾、位移、治疗"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="消耗">
                <input
                  value={openingSkillCostDraft}
                  onChange={(e) => onOpeningSkillCostDraft(e.target.value)}
                  placeholder="体力负担 / 命途共鸣 / 材料消耗"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="冷却">
                <input
                  value={openingSkillCooldownDraft}
                  onChange={(e) => onOpeningSkillCooldownDraft(e.target.value)}
                  placeholder="无 / 短暂间隔 / 每场一次"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
            </div>
            <LabelField label="表现与限制">
              <textarea
                value={openingSkillDescDraft}
                onChange={(e) => onOpeningSkillDescDraft(e.target.value)}
                rows={6}
                placeholder="写下它在正文里的表现、代价、限制和适合出现的场景。比如：短时间提高反应速度，但会消耗体力；不能连续使用。"
                className="kaituo-input w-full resize-none px-3 py-2 text-sm"
                style={{ clipPath: smallClip }}
              />
            </LabelField>
            <LabelField label="备注">
              <textarea
                value={openingSkillNoteDraft}
                onChange={(e) => onOpeningSkillNoteDraft(e.target.value)}
                rows={3}
                placeholder="可记录演出风格、和伙伴配合方式、禁止滥用的边界。"
                className="kaituo-input w-full resize-none px-3 py-2 text-sm"
                style={{ clipPath: smallClip }}
              />
            </LabelField>
            <button
              type="button"
              onClick={onAddOpeningSkill}
              className="kaituo-btn kaituo-btn-primary px-4 py-3 text-sm"
            >
              <span className="tracking-[0.2em] font-bold">添加战技</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              已登记战技
            </div>
            {openingSkills.length > 0 ? (
              <div className="space-y-3">
                {openingSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="p-3 text-sm leading-relaxed"
                    style={{
                      background: openingCardBackground,
                      color: 'rgba(var(--tj-text-secondary), 0.84)',
                      boxShadow: openingCardBorder,
                      clipPath: smallClip,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                          {openingSkillRecordSlotLabel(skill)}
                        </div>
                        <div className="mt-1 font-serif text-base font-bold tracking-[0.12em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                          {skill.名称}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span
                            className="px-2 py-0.5 text-[10px] tracking-[0.12em]"
                            style={{
                              background: skill.已启用 === false ? 'rgba(var(--tj-text-secondary), 0.12)' : 'rgba(var(--tj-btn-primary-start), 0.12)',
                              color: skill.已启用 === false ? 'rgba(var(--tj-text-secondary), 0.78)' : 'rgba(var(--tj-btn-primary-start), 0.92)',
                              clipPath: smallClip,
                            }}
                          >
                            {skill.已启用 === false ? '已停用' : '已启用'}
                          </span>
                          {skill.来源 ? (
                            <span
                              className="px-2 py-0.5 text-[10px]"
                              style={{
                                background: 'rgba(var(--tj-bg-primary), 0.46)',
                                color: 'rgba(var(--tj-text-secondary), 0.82)',
                                clipPath: smallClip,
                              }}
                            >
                              {skill.来源}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-xs leading-relaxed">{skill.描述}</div>
                        {skill.关键词?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {skill.关键词.slice(0, 5).map((keyword) => (
                              <span
                                key={keyword}
                                className="px-2 py-0.5 text-[10px]"
                                style={{
                                  background: 'rgba(var(--tj-btn-primary-start), 0.08)',
                                  color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))',
                                  clipPath: smallClip,
                                }}
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {(skill.消耗 || skill.冷却 || skill.备注) && (
                          <div
                            className="mt-2 grid gap-1.5 text-[11px]"
                            style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}
                          >
                            {skill.消耗 ? <div>消耗：{skill.消耗}</div> : null}
                            {skill.冷却 ? <div>冷却：{skill.冷却}</div> : null}
                            {skill.备注 ? <div>备注：{skill.备注}</div> : null}
                          </div>
                        )}
                      </div>
                      <div className="grid shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleOpeningSkill(skill.id)}
                          className="px-2 py-1 text-[11px]"
                          style={{
                            background: skill.已启用 === false ? 'rgba(var(--tj-btn-primary-start), 0.12)' : 'rgba(var(--tj-text-secondary), 0.10)',
                            color: skill.已启用 === false ? 'rgba(var(--tj-btn-primary-start), 0.96)' : 'rgba(var(--tj-text-secondary), 0.82)',
                            clipPath: smallClip,
                          }}
                        >
                          {skill.已启用 === false ? '启用' : '停用'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveOpeningSkill(skill.id)}
                          className="px-2 py-1 text-[11px]"
                          style={{
                            background: 'rgba(var(--tj-btn-primary-start), 0.12)',
                            color: 'rgba(var(--tj-btn-primary-start), 0.96)',
                            clipPath: smallClip,
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="p-4 text-sm leading-relaxed"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.5)',
                  color: 'rgba(var(--tj-text-secondary), 0.72)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
                  clipPath: smallClip,
                }}
              >
                暂未登记战技。可以留空进入开局，也可以先写 1 到 3 个最常用的能力，让正文更稳定地调用它们。
              </div>
            )}
          </div>

          <div
            className="p-4 text-xs leading-relaxed"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.52)',
              color: 'rgba(var(--tj-text-secondary), 0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
              clipPath: smallClip,
            }}
          >
            战技会保存进开局预设，并随旅人档案进入游戏。建议写清楚“能做到什么”和“不能随便做到什么”，这样正文不会把能力写飞。
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextLabel="继续：其他选项" />
    </div>
  );
}

function OpeningAnchorStep({
  storyMode,
  onStoryMode,
  startingScenarioId,
  onStartingScenarioId,
  selectedRegionId,
  onOpeningRegion,
  selectedWorkshopTemplateId,
  onSelectedWorkshopTemplateId,
  openingSource,
  onOpeningSource,
  freeOpeningMainlineEnabled,
  onFreeOpeningMainlineEnabled,
  freeOpeningPlanetSource,
  onFreeOpeningPlanetSource,
  freeOpeningWorkshop,
  onFreeOpeningWorkshop,
  onSaveFreeOpeningCustomNpc,
  onRemoveFreeOpeningCustomNpc,
  customStartPrompt,
  onCustomStartPrompt,
  onNext,
  onBack,
}: {
  storyMode: 剧情模式;
  onStoryMode: (mode: 剧情模式) => void;
  startingScenarioId: string;
  onStartingScenarioId: (id: string) => void;
  selectedRegionId: string;
  onOpeningRegion: (regionId: string) => void;
  selectedWorkshopTemplateId: string;
  onSelectedWorkshopTemplateId: (id: string) => void;
  openingSource: OpeningSource;
  onOpeningSource: (source: OpeningSource) => void;
  freeOpeningMainlineEnabled: boolean;
  onFreeOpeningMainlineEnabled: (enabled: boolean) => void;
  freeOpeningPlanetSource: FreeOpeningPlanetSource;
  onFreeOpeningPlanetSource: (source: FreeOpeningPlanetSource) => void;
  freeOpeningWorkshop: FreeOpeningWorkshopDraft;
  onFreeOpeningWorkshop: (key: keyof FreeOpeningWorkshopDraft, value: string) => void;
  onSaveFreeOpeningCustomNpc: () => void;
  onRemoveFreeOpeningCustomNpc: (id: string) => void;
  customStartPrompt: string;
  onCustomStartPrompt: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const selectedRegion = getOpeningRegion(selectedRegionId) ?? openingRegions[0];
  const freeGuide = getFreeOpeningGuide(selectedRegionId);
  const filteredOfficialPresets = getOfficialOpeningPresetsByRegion(selectedRegionId);
  const filteredChapters = openingChapterAnchors.filter((item) => item.regionId === selectedRegionId);
  const filteredWorkshopTemplates = getWorkshopOpeningTemplatesByRegion(selectedRegionId);
  const selectedTemplate = selectedWorkshopTemplateId ? getWorkshopOpeningTemplate(selectedWorkshopTemplateId) : undefined;
  const effectiveMainlineEnabled = openingSource === 'official_preset' || freeOpeningMainlineEnabled;
  const visibleScenarios: OpeningDisplayScenario[] =
    openingSource === 'workshop'
      ? Array.from(
          new Map(
            filteredWorkshopTemplates
              .map((template) => {
                const chapter = openingChapterAnchors.find((item) => item.id === template.chapterId);
                return chapter ? [chapter.id, chapter] as const : null;
              })
              .filter((item): item is readonly [string, OpeningChapterAnchor] => Boolean(item)),
          ).values(),
        )
      : openingSource === 'official_preset'
        ? filteredOfficialPresets.map((preset) => ({
            // 官方预设可以共享同一个章节锚点，卡片身份必须使用预设 ID。
            id: preset.id,
            regionId: preset.regionId,
            // 卡片展示标题要区分同一章节下的不同开局预设，章节名由右侧徽章展示。
            name: preset.title,
            summary: preset.summary,
            officialChapterName: openingChapterAnchors.find((item) => item.id === preset.chapterId)?.officialChapterName,
            officialChapterPhase: openingChapterAnchors.find((item) => item.id === preset.chapterId)?.officialChapterPhase,
            priorStoryState: openingChapterAnchors.find((item) => item.id === preset.chapterId)?.priorStoryState,
            referenceDate: preset.referenceDate,
            referenceTime: preset.referenceTime,
            defaultLocationHint: preset.defaultLocationHint,
            keyNpcs: preset.keyNpcs,
            loreKeywords: preset.loreKeywords,
            openingPressure: preset.openingPressure,
          }))
        : filteredChapters;

  return (
    <div className="space-y-4">
      <StoryModeSelector storyMode={storyMode} onStoryMode={onStoryMode} />

      <div className="grid gap-3 md:grid-cols-2">
        {[
          { id: 'official_preset' as OpeningSource, title: '官方预设', text: '稳定章节背景，适合快速进入某个主线节点。' },
          { id: 'free' as OpeningSource, title: '自由开局', text: '选择地区与主线进度后，自由书写真实起点和介入方式。' },
        ].map((item) => {
          const active = openingSource === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpeningSource(item.id)}
              className="min-h-[110px] p-[13px] text-left transition-shadow"
              style={{
                background: active
                  ? openingActiveCardBackground
                  : openingCardBackground,
                boxShadow: active
                  ? openingCyanBorder
                  : openingCardBorder,
                clipPath: smallClip,
              }}
            >
              <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                {item.title}
              </div>
              <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>{item.text}</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-[14px] xl:grid-cols-[270px_minmax(0,1fr)]">
        <div
          className="min-h-0 p-[13px]"
          style={{
            background: openingCardBackground,
            boxShadow: openingCardBorder,
            clipPath: smallClip,
          }}
        >
          <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
            {openingSource === 'official_preset' ? '地区' : '已有地点'}
          </div>
          <div className="space-y-2">
            {openingRegions.map((region) => {
              const active = selectedRegionId === region.id;
              return (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => onOpeningRegion(region.id)}
                  className="w-full p-[13px] text-left transition-shadow"
                  style={{
                    background: active
                      ? openingCardBackground
                      : openingCardBackground,
                    boxShadow: active
                      ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.48), inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.55)'
                      : openingCardBorder,
                    clipPath: smallClip,
                  }}
                >
                  <div className="text-sm font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                    {getOpeningRegionDisplayName(region.name)}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                    {region.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {openingSource !== 'official_preset' ? (
            <div
              className="order-1 p-[13px]"
              style={{
                background: openingCardBackground,
                boxShadow: openingCardBorder,
                clipPath: smallClip,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                    主线状态
                  </div>
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                    启用主线时保留原作进度坐标；关闭后改由开局工作台和剧情编织推进。
                  </div>
                </div>
                <span
                  className="px-2 py-1 text-[11px]"
                  style={{
                    color: 'rgba(var(--tj-btn-primary-start), 0.88)',
                    background: 'rgba(var(--tj-btn-primary-start), 0.08)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                    clipPath: smallClip,
                  }}
                >
                  原创起点
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { enabled: true, label: '启用主线' },
                  { enabled: false, label: '关闭主线' },
                ].map((item) => {
                  const active = freeOpeningMainlineEnabled === item.enabled;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => onFreeOpeningMainlineEnabled(item.enabled)}
                      className="px-3 py-2 text-xs font-bold transition-shadow"
                      style={{
                        color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-secondary), 0.76)',
                        background: active ? openingActiveCardBackground : 'rgba(var(--tj-bg-primary), 0.35)',
                        boxShadow: active ? openingCyanBorder : openingCardBorder,
                        clipPath: smallClip,
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-btn-primary-end), 0.92)' }}>
                关闭主线后，原作主线不会自动注入正文。若后续需要罗浮、匹诺康尼、翁法罗斯、二相乐园等原作剧情，请在剧情编织中手动启用你想注入的主线内容。
              </div>
              {freeOpeningMainlineEnabled ? (
                <div
                  className="mt-3 p-3 text-xs leading-relaxed"
                  style={{
                    background: 'rgba(var(--tj-bg-primary), 0.48)',
                    color: 'rgba(var(--tj-text-secondary), 0.78)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
                    clipPath: smallClip,
                  }}
                >
                  开启后从左侧选择地点，然后选择主线锚点。主线锚点只负责原作进度坐标，不覆盖你的真实起始地点与自定义切入。
                </div>
              ) : null}
            </div>
          ) : null}

          {openingSource !== 'official_preset' ? (
            <div
              className="order-3 p-[13px]"
              style={{
                background: openingCardBackground,
                boxShadow: openingCardBorder,
                clipPath: smallClip,
              }}
            >
              <div className="font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                开局工作台
              </div>
              <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                {freeOpeningPlanetSource === 'custom'
                  ? '自创地点会在这里写入原创舞台、NPC、势力、规则与切入信息。'
                  : '已有地点只需要选择左侧地点、填写起始地点，并按需补充自制 NPC。'}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {FREE_OPENING_PLANET_SOURCE_OPTIONS.map((item) => {
                  const active = freeOpeningPlanetSource === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onFreeOpeningPlanetSource(item.id)}
                      className="p-2.5 text-left transition-shadow"
                      style={{
                        background: active ? openingActiveCardBackground : 'rgba(var(--tj-bg-primary), 0.35)',
                        boxShadow: active
                          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), 0 0 18px rgba(var(--tj-btn-primary-start), 0.08)'
                          : openingCardBorder,
                        clipPath: smallClip,
                      }}
                    >
                      <div className="text-xs font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                        {item.title}
                      </div>
                      <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
                        {item.text}
                      </div>
                    </button>
                  );
                })}
              </div>
              {freeOpeningPlanetSource === 'existing' ? (
                <div
                  className="mt-3 p-3 text-xs leading-relaxed"
                  style={{
                    background: 'rgba(var(--tj-bg-primary), 0.48)',
                    color: 'rgba(var(--tj-text-secondary), 0.78)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
                    clipPath: smallClip,
                  }}
                >
                  当前已有地点：{getOpeningRegionDisplayName(selectedRegion?.name)}。需要切换时，请在左侧选择黑塔空间站、雅利洛-VI、仙舟罗浮、匹诺康尼、翁法罗斯或二相乐园。
                </div>
              ) : null}
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="自创地点 / 星球"
                    value={freeOpeningWorkshop.planet}
                    placeholder="例如：遥远边境星球 / 企业殖民世界 / 自建行星"
                    onChange={(value) => onFreeOpeningWorkshop('planet', value)}
                  />
                ) : null}
                <FreeOpeningWorkshopField
                  label="起始地点"
                  value={freeOpeningWorkshop.location}
                  placeholder={freeOpeningPlanetSource === 'existing' ? '例如：主控舱段 / 下层区诊所 / 星槎海中枢 / 白日梦酒店大堂' : '例如：城邦下城区、太空港、研究站、荒原营地'}
                  onChange={(value) => onFreeOpeningWorkshop('location', value)}
                />
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="地点简介"
                    value={freeOpeningWorkshop.planetIntro}
                    placeholder="一句到三句写清地点环境、文明、冲突或资源。"
                    onChange={(value) => onFreeOpeningWorkshop('planetIntro', value)}
                  />
                ) : null}
                <div className="xl:col-span-2">
                  <FreeOpeningNpcEditor
                    workshop={freeOpeningWorkshop}
                    onWorkshopChange={onFreeOpeningWorkshop}
                    onSave={onSaveFreeOpeningCustomNpc}
                    onRemove={onRemoveFreeOpeningCustomNpc}
                  />
                </div>
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="当前目标"
                    value={freeOpeningWorkshop.currentGoal}
                    placeholder="例如：找人、调查事故、护送、避难、谈判、潜入"
                    onChange={(value) => onFreeOpeningWorkshop('currentGoal', value)}
                  />
                ) : null}
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="局部冲突"
                    value={freeOpeningWorkshop.localConflict}
                    placeholder="例如：封锁、失踪、资源争夺、组织谈判、旧债未清"
                    onChange={(value) => onFreeOpeningWorkshop('localConflict', value)}
                  />
                ) : null}
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="组织/势力"
                    value={freeOpeningWorkshop.factions}
                    placeholder="例如：商会、公司分部、地方武装、科研组、地下帮派"
                    onChange={(value) => onFreeOpeningWorkshop('factions', value)}
                  />
                ) : null}
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="世界规则"
                    value={freeOpeningWorkshop.worldRules}
                    placeholder="例如：这里有什么禁忌、技术限制、社会规则、特殊现象。"
                    onChange={(value) => onFreeOpeningWorkshop('worldRules', value)}
                  />
                ) : null}
                <div className="xl:col-span-2">
                  {freeOpeningPlanetSource === 'custom' ? (
                    <FreeOpeningWorkshopField
                      label="氛围 / 语气"
                      value={freeOpeningWorkshop.tone}
                      placeholder="例如：压迫、克制、冷硬、悬疑、日常、紧张、荒凉。"
                      onChange={(value) => onFreeOpeningWorkshop('tone', value)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div
            className="order-2 p-0"
            style={{
              background: 'transparent',
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                  {openingSource === 'official_preset' ? '章节锚点' : effectiveMainlineEnabled ? '主线进度' : '主线已关闭'}
                </div>
                {openingSource !== 'official_preset' ? (
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
                    {effectiveMainlineEnabled
                      ? '这里只决定原作世界推进到哪里，不限制你的起始地点、原创事件和真实开局设定。'
                      : '当前不从原作主线入手；请在开局工作台写清原创地点、NPC 与设定。'}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.66)' }}>
                {getOpeningRegionDisplayName(selectedRegion?.name)}
              </div>
            </div>
            {!effectiveMainlineEnabled ? (
              <div
                className="p-3 text-xs leading-relaxed"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.5)',
                  color: 'rgba(var(--tj-text-secondary), 0.78)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.18)',
                  clipPath: smallClip,
                }}
              >
                主线坐标已关闭。原作主线不会自动注入正文；后续若需要某段主线剧情，请进入剧情编织，手动启用对应章节或主线片段。
              </div>
            ) : (
            <div className={openingSource === 'official_preset' ? 'grid gap-3 lg:grid-cols-2' : 'space-y-2'}>
              {visibleScenarios.map((item) => {
                const active = startingScenarioId === item.id;
                const highlights = getOpeningDisplayHighlights(item).slice(0, openingSource === 'official_preset' ? 4 : 3);
                const commonButtonProps = {
                  type: 'button' as const,
                  onClick: () => selectOpeningScenario(
                    item,
                    openingSource,
                    filteredWorkshopTemplates,
                    onStartingScenarioId,
                    onSelectedWorkshopTemplateId,
                  ),
                };
                if (openingSource !== 'official_preset') {
                  return (
                    <button
                      key={item.id}
                      {...commonButtonProps}
                      className="w-full p-[13px] text-left transition-shadow"
                      style={{
                        background: active ? openingActiveCardBackground : openingCardBackground,
                        boxShadow: active
                          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), inset 4px 0 0 rgba(var(--tj-btn-primary-start), 0.54), 0 0 18px rgba(var(--tj-btn-primary-start), 0.08)'
                          : openingCardBorder,
                        clipPath: smallClip,
                      }}
                    >
                      <div className="grid gap-3 md:grid-cols-[172px_minmax(0,1fr)]">
                        <div>
                          <div className="text-[11px] leading-relaxed" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }}>
                            {getOpeningOfficialChapterName(item)}
                          </div>
                          <div className="mt-1 text-xs font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                            {getOpeningOfficialChapterPhase(item) || '主线坐标'}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                              {item.name}
                            </div>
                            <span
                              className="px-2 py-1 text-[11px]"
                              style={{
                                color: 'rgba(var(--tj-btn-primary-end), 0.9)',
                                background: 'rgba(var(--tj-btn-primary-end), 0.08)',
                                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.18)',
                                clipPath: smallClip,
                              }}
                            >
                              原作世界坐标
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.8)' }}>
                            {getOpeningDisplaySummary(item)}
                          </div>
                          <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                            前置处理：{getOpeningPriorStoryState(item)}
                          </div>
                          {highlights.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {highlights.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-1 text-[11px]"
                                  style={{
                                    color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))',
                                    background: 'rgba(var(--tj-btn-primary-start), 0.06)',
                                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                                    clipPath: smallClip,
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={item.id}
                    {...commonButtonProps}
                    className="min-h-[158px] p-[14px] text-left transition-shadow"
                    style={{
                      background: active
                        ? openingCardBackground
                        : openingCardBackground,
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), 0 0 20px rgba(var(--tj-btn-primary-start), 0.09)'
                        : openingCardBorder,
                      clipPath: tightClip,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="font-serif text-base font-bold tracking-[0.14em]"
                        style={{ color: 'rgb(var(--tj-text-primary))' }}
                      >
                        {item.name}
                      </div>
                      <div
                        className="max-w-[46%] px-2 py-1 text-right text-[11px] leading-snug"
                        style={{
                          color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))',
                          background: 'rgba(var(--tj-btn-primary-start), 0.08)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                          clipPath: smallClip,
                        }}
                      >
                        {getOpeningChapterBadge(item)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                      {getOpeningDisplaySummary(item)}
                    </div>
                    <div
                      className="mt-3 text-[11px] leading-relaxed"
                      style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}
                    >
                      前置处理：{getOpeningPriorStoryState(item)}
                    </div>
                    {highlights.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {highlights.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-[11px]"
                            style={{
                              color: 'rgba(var(--tj-btn-primary-end), 0.92)',
                              background: 'rgba(var(--tj-btn-primary-end), 0.08)',
                              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.18)',
                              clipPath: smallClip,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
              {visibleScenarios.length === 0 ? (
                <div
                  className="p-3 text-xs leading-relaxed"
                  style={{
                  background: 'rgba(var(--tj-bg-primary), 0.5)',
                  color: 'rgba(var(--tj-text-secondary), 0.72)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.22)',
                    clipPath: smallClip,
                  }}
                >
                  当前地区暂未配置可用锚点，后续可通过自由开局或创意工坊补充。
                </div>
              ) : null}
            </div>
            )}
          </div>

          <div className="order-4 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
            <div
              className="p-[13px] text-sm leading-relaxed"
              style={{
                background: openingCardBackground,
                color: 'rgba(var(--tj-text-secondary), 0.84)',
                boxShadow: openingCardBorder,
                clipPath: smallClip,
              }}
            >
              <div className="font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                我的开局设定
              </div>
              <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                会影响开局走向。你可以写接入点、当前剧情正在发生什么、你和谁有什么关系；这段话会发送给 AI，并联动写入开局档案和伙伴关系。例如写“和螺丝咕姆很熟”，伙伴关系也可能被整理进档案。
              </div>
              <textarea
                value={customStartPrompt}
                onChange={(event) => onCustomStartPrompt(event.target.value)}
                placeholder={
                  openingSource === 'official_preset'
                    ? '官方预设可留空。若想改变介入方式，也可以写下你希望如何进入当前章节。'
                    : selectedTemplate?.playerEntryTemplate ?? freeGuide?.sampleTexts?.[0] ?? '例如：开局地点是公司封锁的边缘实验站。我是受人委托追查奇物失控的外来旅人，当前正在等待接头人。'
                }
                className="mt-3 min-h-[152px] w-full resize-none px-3 py-3 text-sm leading-relaxed outline-none"
                style={{
                  color: 'rgb(var(--tj-text-primary))',
                  background: 'rgba(var(--tj-panel-bg-end),0.55)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                  clipPath: smallClip,
                }}
              />
            </div>

            <div
              className="p-[13px]"
              style={{
                background: openingCardBackground,
                boxShadow: openingCardBorder,
                clipPath: smallClip,
              }}
            >
              <div className="font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                写作引导
              </div>
              <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                点击后可追加到介入草稿。自由开局下可直接写原创地点、原创事件和原创组织。
              </div>
              {openingSource !== 'official_preset' && freeGuide?.overview ? (
                <div
                  className="mt-3 px-3 py-2 text-xs leading-relaxed"
                  style={{
                    color: 'rgba(var(--tj-text-secondary), 0.82)',
                    background: 'rgba(var(--tj-btn-primary-start), 0.05)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                    clipPath: smallClip,
                  }}
                >
                  当前地区：{selectedRegion?.name ?? '未指定'}。自由开局引导：{freeGuide.overview}
                </div>
              ) : null}
              <div className="mt-3 grid gap-2">
                {[
                  ...((openingSource !== 'official_preset' && freeGuide) ? [...freeGuide.identityHints, ...freeGuide.entryAngles] : []),
                  '开局地点是原著之外的一处临时据点。',
                  '这里发生了一件尚未公开的支线事件。',
                  '我和某个原创组织存在临时合作或旧账。',
                  '我与某位角色已相识，但关系仍需正文确认。',
                  '我想从日常互动开始，而不是直接进入大战。',
                  '章节锚点只是背景，我有自己的调查目标。',
                  '高层角色不会无条件信任我，需要合理契机。',
                ].slice(0, 4).map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => onCustomStartPrompt(customStartPrompt.trim() ? `${customStartPrompt.trim()}\n${hint}` : hint)}
                    className="p-2.5 text-left text-xs leading-relaxed transition-transform hover:-translate-y-0.5"
                    style={{
                      color: 'rgba(var(--tj-text-primary), 0.84)',
                      background: 'rgba(var(--tj-btn-primary-start), 0.06)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                      clipPath: smallClip,
                    }}
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextLabel="继续：整理确认" />
    </div>
  );
}

function FreeOpeningWorkshopField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[11px] font-bold tracking-[0.08em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }}>
        {label}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-[76px] w-full resize-y px-3 py-2 text-xs leading-relaxed outline-none"
        style={{
          color: 'rgb(var(--tj-text-primary))',
          background: 'rgba(var(--tj-panel-bg-end),0.55)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
          clipPath: smallClip,
        }}
      />
    </label>
  );
}

function FreeOpeningNpcEditor({
  workshop,
  onWorkshopChange,
  onSave,
  onRemove,
}: {
  workshop: FreeOpeningWorkshopDraft;
  onWorkshopChange: (key: keyof FreeOpeningWorkshopDraft, value: string) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
}) {
  const hasDraft = Boolean(
    workshop.customNpcName.trim()
    || workshop.customNpcBackground.trim()
    || workshop.customNpcPathstrider.trim()
    || workshop.customNpcAbility.trim(),
  );

  return (
    <div
      className="p-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.42)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold tracking-[0.12em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))' }}>
            补充自制 NPC
          </div>
          <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
            写完后保存为独立 NPC 条目，可继续添加多个自制角色。
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!hasDraft}
          className="px-3 py-2 text-xs font-bold transition-shadow disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            color: 'rgb(var(--tj-text-primary))',
            background: hasDraft ? openingActiveCardBackground : 'rgba(var(--tj-bg-primary), 0.42)',
            boxShadow: hasDraft ? openingCyanBorder : openingCardBorder,
            clipPath: smallClip,
          }}
        >
          保存 NPC
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <LabelField label="名字">
          <input
            value={workshop.customNpcName}
            onChange={(event) => onWorkshopChange('customNpcName', event.target.value)}
            placeholder="例如：接头人、守卫队长、医生、研究员"
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </LabelField>
        <LabelField label="是否为命途行者">
          <input
            value={workshop.customNpcPathstrider}
            onChange={(event) => onWorkshopChange('customNpcPathstrider', event.target.value)}
            placeholder="例如：是 / 不是 / 仅有部分命途共鸣 / 未知"
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </LabelField>
        <LabelField label="背景">
          <textarea
            value={workshop.customNpcBackground}
            onChange={(event) => onWorkshopChange('customNpcBackground', event.target.value)}
            placeholder="写清这个 NPC 的来历、处境、立场和与地点的关系。"
            className="kaituo-input min-h-[86px] w-full resize-y px-3 py-2 text-sm leading-relaxed"
            style={{ clipPath: smallClip }}
          />
        </LabelField>
        <LabelField label="能力">
          <textarea
            value={workshop.customNpcAbility}
            onChange={(event) => onWorkshopChange('customNpcAbility', event.target.value)}
            placeholder="写清这个 NPC 的战斗、技术、情报或特殊能力。"
            className="kaituo-input min-h-[86px] w-full resize-y px-3 py-2 text-sm leading-relaxed"
            style={{ clipPath: smallClip }}
          />
        </LabelField>
      </div>

      <div className="mt-3">
        <div className="mb-2 text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-end), 0.74)' }}>
          已保存 NPC
        </div>
        {workshop.customNpcs.length ? (
          <div className="grid gap-2">
            {workshop.customNpcs.map((npc) => (
              <div
                key={npc.id}
                className="p-3 text-xs leading-relaxed"
                style={{
                  background: openingCardBackground,
                  color: 'rgba(var(--tj-text-secondary), 0.82)',
                  boxShadow: openingCardBorder,
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                      {npc.name || '未命名 NPC'}
                    </div>
                    <div className="mt-1">
                      {npc.background || '未填写背景'}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {npc.pathstrider ? (
                        <span className="px-2 py-1" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))', background: 'rgba(var(--tj-btn-primary-start), 0.06)', clipPath: smallClip }}>
                          命途：{npc.pathstrider}
                        </span>
                      ) : null}
                      {npc.ability ? (
                        <span className="px-2 py-1" style={{ color: 'rgba(var(--tj-btn-primary-end), 0.86)', background: 'rgba(var(--tj-btn-primary-end), 0.08)', clipPath: smallClip }}>
                          能力：{npc.ability}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(npc.id)}
                    className="shrink-0 px-2 py-1 text-[11px]"
                    style={{
                      color: 'rgba(var(--tj-text-secondary), 0.82)',
                      background: 'rgba(var(--tj-bg-primary), 0.45)',
                      boxShadow: openingCardBorder,
                      clipPath: smallClip,
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="p-3 text-xs leading-relaxed"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.42)',
              color: 'rgba(var(--tj-text-secondary), 0.68)',
              boxShadow: openingCardBorder,
              clipPath: smallClip,
            }}
          >
            暂未保存自制 NPC。可以留空，也可以添加一个或多个只属于本开局的原创角色。
          </div>
        )}
      </div>
    </div>
  );
}

function HistorianStep({
  customIdentity,
  onCustomIdentity,
  factionId,
  onFactionId,
  canonicalTrailblazer,
  onCanonicalTrailblazer,
  onNext,
  onBack,
}: {
  customIdentity: string;
  onCustomIdentity: (v: string) => void;
  factionId: 阵营ID;
  onFactionId: (id: 阵营ID) => void;
  canonicalTrailblazer: CanonicalTrailblazer;
  onCanonicalTrailblazer: (v: CanonicalTrailblazer) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <SectionTitle title="其他选项" subtitle="这些设定会影响世界默认认知，但不决定你怎样切入主线" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <div className="space-y-5">
          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              原著主角选择
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {CANONICAL_TRAILBLAZERS.map((item) => {
                const active = canonicalTrailblazer === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onCanonicalTrailblazer(item.id)}
                    className="min-h-[118px] p-4 text-left transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.12), rgba(var(--tj-btn-primary-end), 0.05))'
                        : 'rgba(var(--tj-bg-primary), 0.52)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.46), 0 0 14px rgba(var(--tj-btn-primary-start), 0.1)'
                        : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
                      clipPath: tightClip,
                    }}
                  >
                    <div
                      className="font-serif text-base font-bold tracking-[0.14em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                    >
                      {item.title}
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                      {item.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
              这里只决定原著主角在世界中的默认存在方式。玩家自己的切入方式仍在下一页「开局锚点」里书写。
            </p>
          </div>

          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              组织背景
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {factions.map((item) => {
                const active = factionId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onFactionId(item.id)}
                    className="p-4 text-left transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.10), rgba(var(--tj-btn-primary-end), 0.04))'
                        : 'rgba(var(--tj-bg-primary), 0.52)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), 0 0 12px rgba(var(--tj-btn-primary-start), 0.1)'
                        : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
                      clipPath: smallClip,
                    }}
                  >
                    <div
                      className="font-serif text-sm font-bold tracking-[0.12em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                    >
                      <span style={{ color: 'rgba(var(--tj-btn-primary-start), 0.76)' }}>{active ? '✓ ' : '◆ '}</span>
                      {item.name}
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                      {item.description}
                    </div>
                    {active && item.openingHint ? (
                      <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.84), rgba(var(--tj-btn-primary-end),0.78))' }}>
                        {item.openingHint}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              自定义身份
            </div>
            <input
              value={customIdentity}
              onChange={(e) => onCustomIdentity(e.target.value)}
              placeholder="例如：空间站临时协助员、公司外勤、流浪的命途行者"
              className="kaituo-input w-full px-3 py-2 text-sm"
              style={{ clipPath: smallClip }}
            />
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
              可留空。这里描述你在开局时被他人如何理解，具体怎样进入事件仍由开局锚点页的介入草稿决定。
            </p>
          </div>

          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              游戏模式
            </div>
            <div
              className="p-4 text-sm leading-relaxed"
              style={{
                background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.08), rgba(var(--tj-btn-primary-end), 0.035))',
                color: 'rgba(var(--tj-text-secondary), 0.86)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                clipPath: smallClip,
              }}
            >
              <div className="font-serif text-base font-bold tracking-[0.14em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                原创旅人模式
              </div>
              <div className="mt-2 text-xs leading-relaxed">
                当前版本固定使用原创旅人模式。后续这里会预留「扮演原著主角」等模式入口，现在先不改变存档结构。
              </div>
              <div className="mt-3 inline-flex px-2 py-1 text-[11px] tracking-[0.16em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))', background: 'rgba(var(--tj-btn-primary-start), 0.08)', clipPath: smallClip }}>
                预留功能
              </div>
            </div>
          </div>

          <div
            className="p-4 text-xs leading-relaxed"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.52)',
              color: 'rgba(var(--tj-text-secondary), 0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
              clipPath: smallClip,
            }}
          >
            其他选项会影响世界默认认知，但不会替代开局锚点。下一页仍需要选择开局来源、地区章节，并填写玩家如何介入当前故事。
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextLabel="继续：开局锚点" />
    </div>
  );
}

function OverviewStep({
  name,
  alias,
  gender,
  age,
  birthday,
  background,
  storyMode,
  pathId,
  pathStage,
  factionId,
  customIdentity,
  selectedScenario,
  selectedOpeningTitle,
  selectedOpeningRegionName,
  openingSource,
  freeOpeningMainlineEnabled,
  freeOpeningPlanetSource,
  customStartPrompt,
  canonicalTrailblazer,
  selectedAbilityNames,
  openingSkills,
  currentLocation,
  onStart,
  onBack,
  starting,
  openingArchiveStatus,
}: {
  name: string;
  alias: string;
  gender: string;
  age: number;
  birthday: string;
  background: string;
  storyMode: 剧情模式;
  pathId: 命途ID;
  pathStage: 命途阶段;
  factionId: 阵营ID;
  customIdentity: string;
  selectedScenario?: OpeningScenario;
  selectedOpeningTitle: string;
  selectedOpeningRegionName: string;
  openingSource: OpeningSource;
  freeOpeningMainlineEnabled: boolean;
  freeOpeningPlanetSource: FreeOpeningPlanetSource;
  customStartPrompt: string;
  canonicalTrailblazer: CanonicalTrailblazer;
  selectedAbilityNames: string[];
  openingSkills: 战技记录[];
  currentLocation: string;
  onStart: () => void;
  onBack: () => void;
  starting?: boolean;
  openingArchiveStatus?: string;
}) {
  const mode = getStoryMode(storyMode) ?? storyModes[0];
  const path = getPath(pathId);
  const selectedStage = PATH_STAGE_DEFS.find((item) => item.stage === pathStage) ?? PATH_STAGE_DEFS[0];
  const faction = getFaction(factionId) ?? factions[0];

  return (
    <div>
      <SectionTitle title="总览确认" subtitle="最后检查一遍开局是否完整" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(290px,0.85fr)]">
        <div
          className="p-4"
          style={{
            background: 'rgba(var(--tj-panel-bg-end),0.58)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
            clipPath: cardClip,
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <OverviewRow label="姓名" value={name} />
            <OverviewRow label="别名" value={alias || '未填写'} />
            <OverviewRow label="性别" value={gender || '未填写'} />
            <OverviewRow label="年龄" value={`${age}`} />
            <OverviewRow label="生日" value={birthday || '未填写'} />
            <OverviewRow label="背景故事" value={background.trim() || '未填写'} />
            <OverviewRow label="剧情模式" value={mode.name} />
            <OverviewRow label="开局来源" value={openingSource === 'official_preset' ? '官方预设' : openingSource === 'workshop' ? '创意工坊' : '自由开局'} />
            {openingSource !== 'official_preset' ? (
              <OverviewRow label="主线坐标" value={freeOpeningMainlineEnabled ? '启用' : '关闭，需在剧情编织手动启用主线'} />
            ) : null}
            {openingSource !== 'official_preset' ? (
              <OverviewRow label="地点来源" value={getFreeOpeningPlanetSourceOption(freeOpeningPlanetSource).title} />
            ) : null}
            <OverviewRow label="地区" value={selectedOpeningRegionName || '未指定'} />
            <OverviewRow label="开局锚点" value={selectedOpeningTitle || selectedScenario?.name || '未选择'} />
            <OverviewRow label="当前地点" value={currentLocation || '未指定'} />
            <OverviewRow label="原著主角" value={getCanonicalTrailblazer(canonicalTrailblazer)?.worldValue ?? '未指定'} />
            <OverviewRow label="命途" value={path ? `${path.name} · ${path.aeon}` : '无命途'} />
            <OverviewRow label="命途阶段" value={path ? `${selectedStage.name} · ${selectedStage.title}` : '未选择'} />
            <OverviewRow label="组织背景" value={faction.name} />
            <OverviewRow label="身份" value={customIdentity.trim() || '未填写'} />
          </div>

          <div className="mt-4 grid gap-3">
            <div
              className="p-3"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.54)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                clipPath: smallClip,
              }}
            >
              <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                切入说明
              </div>
              <div className="text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary),0.92)' }}>
                {customStartPrompt.trim() || '未填写'}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <OverviewLabel>能力</OverviewLabel>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {selectedAbilityNames.length > 0 ? (
                selectedAbilityNames.map((item) => (
                  <span
                    key={item}
                    className="px-3 py-1"
                    style={{
                      background: 'rgba(var(--tj-btn-primary-start), 0.12)',
                      color: 'rgba(var(--tj-btn-primary-start), 0.95)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.24)',
                      clipPath: smallClip,
                    }}
                  >
                    {item}
                  </span>
                ))
              ) : (
                <span style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>暂未选择能力</span>
              )}
            </div>
          </div>

          <div className="mt-4">
            <OverviewLabel>开局战技</OverviewLabel>
            <div className="mt-2 grid gap-2 text-sm">
              {openingSkills.length > 0 ? (
                openingSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="p-3"
                    style={{
                      background: 'rgba(var(--tj-bg-primary), 0.52)',
                      color: 'rgba(var(--tj-text-secondary), 0.88)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
                      clipPath: smallClip,
                    }}
                  >
                    <div className="font-medium" style={{ color: 'rgba(var(--tj-text-primary),0.95)' }}>
                      {skill.名称}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed">{skill.描述}</div>
                  </div>
                ))
              ) : (
                <span style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>暂未登记战技</span>
              )}
            </div>
          </div>

        </div>

        <div className="space-y-4">
          <div
            className="p-4"
            style={{
              background: 'linear-gradient(180deg, rgba(var(--tj-panel-bg-start), 0.95) 0%, rgba(var(--tj-panel-bg-end), 0.98) 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.22)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              最终提醒
            </div>
            <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.86)' }}>
              <p>开局会把这些内容写入角色、世界状态和首回合提示词。</p>
              <p>换句话说，你现在确认的不只是外观和选择，而是整段旅程的第一页。</p>
              <p style={{ color: 'rgba(var(--tj-btn-primary-start), 0.9)' }}>开局档案会作为长期锚点写入世界状态，可以直接开始。</p>
            </div>
          </div>

          <div
            className="p-4 text-sm leading-relaxed"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              color: 'rgba(var(--tj-text-secondary),0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            这一步确认后，后面的正文不再只是“开始游戏”，而是带着你的设定正式进入第一回合。
          </div>
        </div>
      </div>

      <StepNav
        onBack={onBack}
        onNext={onStart}
        ready={!starting}
        backLabel="返回修改"
        nextLabel={starting ? '整理开局中...' : '踏上旅途'}
      />
      {openingArchiveStatus ? (
        <div className="mt-3 text-center text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
          {openingArchiveStatus}
        </div>
      ) : null}
    </div>
  );
}

function LabelField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function OverviewLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.72)' }}>
      {children}
    </div>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-sm">
      <div style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>{label}</div>
      <div className="break-words" style={{ color: 'rgba(var(--tj-text-primary),0.96)' }}>
        {value}
      </div>
    </div>
  );
}

function buildOpeningSummary({
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

function getCanonicalTrailblazer(id: CanonicalTrailblazer) {
  return CANONICAL_TRAILBLAZERS.find((item) => item.id === id) ?? CANONICAL_TRAILBLAZERS[0];
}

function formatCustomAbilityEntry(name: string, effect: string): string {
  return `${name.trim()}：${effect.trim()}`;
}

function splitCustomAbilityEntry(text: string): { name: string; effect: string } {
  const normalized = text.trim();
  const separatorIndex = normalized.search(/[：:]/);
  if (separatorIndex < 0) return { name: normalized, effect: '' };
  return {
    name: normalized.slice(0, separatorIndex).trim() || normalized,
    effect: normalized.slice(separatorIndex + 1).trim(),
  };
}

function splitOpeningSkillKeywords(value: string): string[] {
  return value
    .split(/[,，、\/|\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOpeningPresets(value: unknown): OpeningPlayerPreset[] {
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

function sanitizeOpeningPresetDraft(value: unknown): OpeningPresetDraft {
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
      typeof raw.startingScenarioId === 'string' && (
        startingScenarios.some((item) => item.id === raw.startingScenarioId)
        || Boolean(getOfficialOpeningPreset(raw.startingScenarioId))
      )
        ? raw.startingScenarioId
        : startingScenarios[0]?.id ?? '',
    selectedWorkshopTemplateId,
    canonicalTrailblazer: isCanonicalTrailblazer(raw.canonicalTrailblazer) ? raw.canonicalTrailblazer : 'stelle',
    customStartPrompt: sanitizeText(raw.customStartPrompt),
  };
}

function isOpeningSource(value: unknown): value is OpeningSource {
  return value === 'official_preset' || value === 'free' || value === 'workshop';
}

function isFreeOpeningPlanetSource(value: unknown): value is FreeOpeningPlanetSource {
  return value === 'existing' || value === 'custom';
}

function sanitizeFreeOpeningWorkshop(value: unknown): FreeOpeningWorkshopDraft {
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

function sanitizeFreeOpeningCustomNpcs(value: unknown): FreeOpeningCustomNpc[] {
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

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function sanitizeOpeningSkills(value: unknown): 战技记录[] {
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

function normalizeAge(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 20;
  return Math.max(0, Math.min(999, Math.round(num)));
}

function isStoryMode(value: unknown): value is 剧情模式 {
  return storyModes.some((item) => item.id === value);
}

function isPathId(value: unknown): value is 命途ID {
  return paths.some((item) => item.id === value);
}

function isPathStage(value: unknown): value is 命途阶段 {
  return PATH_STAGE_DEFS.some((item) => item.stage === value);
}

function isFactionId(value: unknown): value is 阵营ID {
  return factions.some((item) => item.id === value);
}

function isCanonicalTrailblazer(value: unknown): value is CanonicalTrailblazer {
  return CANONICAL_TRAILBLAZERS.some((item) => item.id === value);
}

function splitBirthday(value: string): { month: string; day: string } {
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

function mergeBirthday(month: string, day: string): string {
  const m = month.replace(/[^\d]/g, '').slice(0, 2);
  const d = day.replace(/[^\d]/g, '').slice(0, 2);
  if (!m && !d) return '';
  if (m && d) return `${m}月${d}日`;
  if (m) return `${m}月`;
  return `${d}日`;
}

function splitLines(value: string): string[] {
  return value
    .split(/\n|；|;/g)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}
