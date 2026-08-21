export interface 时段NPC {
  id: string;
  姓名: string;
  角色: string;
  性格: string;
  外貌: string;
  与玩家关系: string;
  记忆: string[];
}

export interface 派系定义 {
  id: string;
  名称: string;
  描述: string;
  影响力: number;
}

export interface 时段定义 {
  id: string;
  名称: string;
  年代: string;
  描述: string;
  氛围: string;
  关键事件: string[];
  科技水平: string;
  社会规范: string;
  派系: 派系定义[];
  人物: 时段NPC[];
}

import type { 官方开局预设, 创意工坊开局模板, 创意工坊开局模板包, 难度ID, 剧情模式, 命途ID, 开局来源, 起始场景, 自由开局地点来源 } from './journey';
import type { NPC记录 } from './npc';
import type { CommittedWorldFact, StoryFocus, WorldEventInstance, WorldEventInstanceStatus } from './storyRuntime';
import { 创建NPC记录, 获取NPC关系阶段, 获取NPC兼容关系, 归一化NPC记录列表 } from './npc';
import { matchCanonical } from '@/data/canonicalCharacters';
import {
  getOfficialOpeningPreset,
  getOfficialOpeningPresetByChapterId,
  getOpeningScenarioBundle,
  getOpeningChapterAnchor,
  getOpeningRegion,
} from '@/data/journeyPresets';

export const 默认琥珀日期 = '琥珀纪 2157.03.07';

const OPENING_NON_PERSON_NAME_RE =
  /(?:军|兵|士兵|卫兵|守卫|护卫|巡逻|队伍|小队|舰队|商会|公司|家族|组织|势力|部门|司|府|族|民众|路人|乘客|旅客|研究员|科员|医士|医者|商人|店员|怪物|丰饶孽物|反物质军团)$/u;
const OPENING_NON_PERSON_NAMES = new Set([
  '云骑',
  '云骑军',
  '银鬃铁卫',
  '地火',
  '家族',
  '猎犬家系',
  '公司',
  '星际和平公司',
  'IPC',
  '太卜司',
  '天舶司',
  '丹鼎司',
  '十王司',
  '反物质军团',
  '星核猎手',
  '列车组',
  '无名客',
]);

export interface 开局整理档案 {
  玩家身份?: string;
  来到此地原因?: string;
  当前目标?: string;
  起始情境?: string;
  自定义星球?: string;
  星球简介?: string;
  初始地点参考?: string;
  自定义起始地点?: string;
  原创地点说明?: string;
  原创事件说明?: string;
  原创组织说明?: string;
  初始NPC详情?: string[];
  自制NPC?: 开局自制NPC[];
  世界设定补充?: string[];
  主线参与程度?: string;
  初始日期参考?: string;
  初始时间参考?: string;
  关键角色参考?: string[];
  已认识角色?: string[];
  初始关系?: string[];
  叙事倾向?: string[];
  特别要求?: string[];
  冲突协调?: string[];
}

export interface 开局自制NPC {
  姓名: string;
  背景?: string;
  是否命途行者?: boolean;
  能力?: string;
  与玩家关系?: string;
  当前状态?: string;
}

export interface 开局档案 {
  来源: 开局来源;
  主线启用?: boolean;
  星球来源?: 自由开局地点来源;
  地区ID: string;
  地区名称: string;
  章节锚点ID: string;
  章节锚点名称: string;
  章节参考说明: string;
  参考性质: '背景参考';
  官方预设ID?: string;
  创意工坊模板ID?: string;
  玩家介入原文: string;
  整理档案?: 开局整理档案;
  防回退规则: string[];
}

export interface 世界状态 {
  当前时段: 时段定义;
  已访问时段: string[];
  /** 纪年法：崩铁世界观默认使用「琥珀纪年」。 */
  纪年法: string;
  /** 游戏内经过的天数，独立显示在主界面右上角。 */
  开拓天数: number;
  /** 当前日期：给 UI 与变量系统展示的年月日，如「琥珀纪 2157.03.07」。 */
  当前日期: string;
  /** 当前时间：一天内的具体时刻，统一使用 24 小时制，如「06:40」。 */
  当前时间: string;
  /** 当前地点：地图系统实装前，先以自由文本记录所在地点。 */
  当前地点: string;
  /** 结构化当前区域。旧档缺失时由开局档案/当前地点迁移推断，无法确认则为 unknown。 */
  当前区域ID: string;
  /** 当前天气：AI 每回合根据地点和剧情判断，如 "星尘暴"、"雪"。不影响游戏机制，仅用于 UI 氛围展示。 */
  当前天气?: string;
  全局事件: string[];
  活跃人物: 时段NPC[];
  氛围变化: string;

  // 由「踏上旅途」向导写入。
  难度?: 难度ID;
  剧情模式?: 剧情模式;
  起航之地ID?: string;
  自定义起始场景名称?: string;
  自定义起始地点?: string;
  自定义起始场景描述?: string;
  自定义起始场景要点?: string[];
  自定义开局?: string;
  原著主角?: '星' | '穹' | '星穹双主角';
  开局档案?: 开局档案;

  // ── 命途狭间 ──
  // 二段式触发:AI 在合适剧情节点发出邀请 → 玩家点「踏入」 → 下一回合进入狭间问答。
  // 待触发狭间:AI 已发出邀请,等待玩家在 UI 上点击「踏入」。
  // 进行中狭间:玩家已踏入,本回合 AI 应进入命途狭间专用流程(出题/评判)。
  待触发狭间?: 命途ID;
  进行中狭间?: 命途ID;

  /** 剧情编织运行时切片（R2 起）：世界事件实例、事实账本与焦点随普通存档保存，不启用独立 runtime 存储。 */
  剧情运行时?: 剧情编织运行时切片;
}

/** 剧情编织运行时切片：联合裁决所需的持久化运行状态（随 世界状态 进普通存档/回合快照）。 */
export interface 剧情编织运行时切片 {
  schemaVersion: 1;
  runtimeBranchId: string;
  /** 每回合唯一裁决后 +1；事实账本身份与裁决回执使用同一 revision。 */
  runtimeRevision: number;
  focus: StoryFocus;
  worldEvents: WorldEventInstance[];
  factLedger: CommittedWorldFact[];
  /** 最近一次联合裁决决策与原因（只读诊断，不驱动行为）。 */
  lastDecision?: 'stay' | 'advance_one' | 'resolve_early' | 'deviate' | 'pause' | 'jump_to';
  lastReasons?: string[];
  /** 本回合世界演变结算状态（settled=正常提交 / failed=API 或候选失败 / skipped=无条件未调用）。 */
  worldEvolutionStatus?: 'settled' | 'failed' | 'skipped';
  worldEvolutionFailureReason?: string;
  updatedAt: number;
}

const WORLD_EVENT_STATUSES: WorldEventInstanceStatus[] = ['scheduled', 'active', 'blocked', 'resolution_pending', 'resolved', 'cancelled', 'superseded', 'missed', 'archived'];

function 归一化运行时事件(instance: Partial<WorldEventInstance> | null | undefined): WorldEventInstance | null {
  if (!instance || typeof instance !== 'object') return null;
  if (typeof instance.eventInstanceId !== 'string' || !instance.eventInstanceId) return null;
  if (typeof instance.eventDefinitionId !== 'string' || !instance.eventDefinitionId) return null;
  const normalized: WorldEventInstance = {
    eventInstanceId: instance.eventInstanceId,
    eventDefinitionId: instance.eventDefinitionId,
    status: WORLD_EVENT_STATUSES.includes(instance.status as WorldEventInstanceStatus)
      ? instance.status as WorldEventInstanceStatus
      : 'scheduled',
    replayPolicy: instance.replayPolicy === 'allow_new_instance' || instance.replayPolicy === 'repeatable' ? instance.replayPolicy : 'once',
    participantIds: Array.isArray(instance.participantIds) ? instance.participantIds.filter((item): item is string => typeof item === 'string') : [],
    dependencyIds: Array.isArray(instance.dependencyIds) ? instance.dependencyIds.filter((item): item is string => typeof item === 'string') : [],
    publicFactIds: Array.isArray(instance.publicFactIds) ? instance.publicFactIds.filter((item): item is string => typeof item === 'string') : [],
    idempotencyKey: typeof instance.idempotencyKey === 'string' ? instance.idempotencyKey : 'weaving:' + instance.eventInstanceId,
    source: instance.source && typeof instance.source === 'object'
      ? instance.source as WorldEventInstance['source']
      : { kind: 'migration_record', migrationId: 'runtime-slice:' + instance.eventInstanceId, sourcePath: 'legacy', sourceFingerprint: 'legacy' },
  };
  if (typeof instance.parentInstanceId === 'string') normalized.parentInstanceId = instance.parentInstanceId;
  if (instance.startAt && typeof instance.startAt === 'object') normalized.startAt = instance.startAt as WorldEventInstance['startAt'];
  if (instance.dueAt && typeof instance.dueAt === 'object') normalized.dueAt = instance.dueAt as WorldEventInstance['dueAt'];
  if (instance.resolvedAt && typeof instance.resolvedAt === 'object') normalized.resolvedAt = instance.resolvedAt as WorldEventInstance['resolvedAt'];
  if (instance.resolutionMode === 'player' || instance.resolutionMode === 'world_background' || instance.resolutionMode === 'shared' || instance.resolutionMode === 'player_early' || instance.resolutionMode === 'unknown') {
    normalized.resolutionMode = instance.resolutionMode;
  }
  if (instance.outcome === 'normal' || instance.outcome === 'deviated' || instance.outcome === 'escaped' || instance.outcome === 'failed' || instance.outcome === 'unknown') {
    normalized.outcome = instance.outcome;
  }
  if (typeof instance.terminalFactId === 'string') normalized.terminalFactId = instance.terminalFactId;
  if (typeof instance.eventResolutionKey === 'string') normalized.eventResolutionKey = instance.eventResolutionKey;
  return normalized;
}

function 归一化运行时焦点(focus: Partial<StoryFocus> | null | undefined): StoryFocus {
  return {
    focusId: typeof focus?.focusId === 'string' && focus.focusId ? focus.focusId : 'focus:runtime',
    trackId: typeof focus?.trackId === 'string' ? focus.trackId : undefined,
    unitId: typeof focus?.unitId === 'string' ? focus.unitId : undefined,
    status: focus?.status === 'blocked' || focus?.status === 'awaiting_player' || focus?.status === 'completed' || focus?.status === 'diverged'
      ? focus.status
      : 'active',
    reasonCodes: Array.isArray(focus?.reasonCodes) ? focus.reasonCodes.filter((item): item is string => typeof item === 'string').slice(0, 12) : [],
    enteredAtRevision: Math.max(0, Math.trunc(Number(focus?.enteredAtRevision) || 0)),
  };
}

function 归一化运行时事实(fact: Partial<CommittedWorldFact> | null | undefined): CommittedWorldFact | null {
  if (!fact || typeof fact !== 'object') return null;
  if (typeof fact.factId !== 'string' || !fact.factId) return null;
  if (typeof fact.eventInstanceId !== 'string' || !fact.eventInstanceId) return null;
  return {
    factId: fact.factId,
    eventInstanceId: fact.eventInstanceId,
    sourceRevision: Math.max(0, Math.trunc(Number(fact.sourceRevision) || 0)),
    factType: typeof fact.factType === 'string' ? fact.factType : 'unknown',
    payload: fact.payload && typeof fact.payload === 'object' ? fact.payload as CommittedWorldFact['payload'] : {},
    occurredAt: fact.occurredAt && typeof fact.occurredAt === 'object' ? fact.occurredAt as CommittedWorldFact['occurredAt'] : { dayOrdinal: 1, minuteOfDay: 0 },
    committedAt: fact.committedAt && typeof fact.committedAt === 'object' ? fact.committedAt as CommittedWorldFact['committedAt'] : { dayOrdinal: 1, minuteOfDay: 0 },
    publicScope: fact.publicScope && typeof fact.publicScope === 'object' ? fact.publicScope as CommittedWorldFact['publicScope'] : { kind: 'private' },
    evidenceRefs: Array.isArray(fact.evidenceRefs) ? fact.evidenceRefs as CommittedWorldFact['evidenceRefs'] : [],
    evidenceLevel: fact.evidenceLevel === 'confirmed' || fact.evidenceLevel === 'supported' ? fact.evidenceLevel : 'supported',
    supersedesFactId: typeof fact.supersedesFactId === 'string' ? fact.supersedesFactId : undefined,
    invalidatesEventInstanceIds: Array.isArray(fact.invalidatesEventInstanceIds) ? fact.invalidatesEventInstanceIds.filter((item): item is string => typeof item === 'string') : [],
    playerParticipated: fact.playerParticipated === true,
    playerObserverVisible: fact.playerObserverVisible === true,
    createdBy: typeof fact.createdBy === 'string' ? fact.createdBy as CommittedWorldFact['createdBy'] : 'system',
  };
}

export function 归一化剧情编织运行时切片(input?: Partial<剧情编织运行时切片> | null): 剧情编织运行时切片 | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const worldEvents = Array.isArray(input.worldEvents)
    ? input.worldEvents.map(归一化运行时事件).filter((item): item is WorldEventInstance => item !== null).slice(-80)
    : [];
  const factLedger = Array.isArray(input.factLedger)
    ? input.factLedger.map(归一化运行时事实).filter((item): item is CommittedWorldFact => item !== null).slice(-240)
    : [];
  return {
    schemaVersion: 1,
    runtimeBranchId: typeof input.runtimeBranchId === 'string' && input.runtimeBranchId ? input.runtimeBranchId : 'branch:main',
    runtimeRevision: Math.max(0, Math.trunc(Number(input.runtimeRevision) || 0)),
    focus: 归一化运行时焦点(input.focus),
    worldEvents,
    factLedger,
    lastDecision: input.lastDecision === 'stay' || input.lastDecision === 'advance_one' || input.lastDecision === 'resolve_early' || input.lastDecision === 'deviate' || input.lastDecision === 'pause' || input.lastDecision === 'jump_to'
      ? input.lastDecision
      : undefined,
    lastReasons: Array.isArray(input.lastReasons) ? input.lastReasons.filter((item): item is string => typeof item === 'string').slice(0, 12) : undefined,
    worldEvolutionStatus: input.worldEvolutionStatus === 'settled' || input.worldEvolutionStatus === 'failed' || input.worldEvolutionStatus === 'skipped'
      ? input.worldEvolutionStatus
      : undefined,
    worldEvolutionFailureReason: typeof input.worldEvolutionFailureReason === 'string' ? input.worldEvolutionFailureReason : undefined,
    updatedAt: Math.trunc(Number(input.updatedAt)) || Date.now(),
  };
}

export function 创建空世界状态(period?: 时段定义): 世界状态 {
  return {
    当前时段: period ?? createPlaceholderPeriod(),
    已访问时段: [],
    纪年法: '琥珀纪年',
    开拓天数: 1,
    当前日期: '',
    当前时间: '',
    当前地点: '',
    当前区域ID: 'unknown',
    当前天气: 'clear',
    全局事件: [],
    活跃人物: [],
    氛围变化: '',
  };
}

export function 归一化世界状态(input?: Partial<世界状态> | null): 世界状态 {
  const base = 创建空世界状态(input?.当前时段);
  const alignedCalendar = 对齐世界日期与天数(
    Math.max(1, Math.trunc(Number(input?.开拓天数) || 1)),
    input?.当前日期?.trim() || 默认琥珀日期,
  );
  const normalized: 世界状态 = {
    ...base,
    ...(input ?? {}),
    当前时段: input?.当前时段 ?? base.当前时段,
    已访问时段: Array.isArray(input?.已访问时段) ? input.已访问时段 : [],
    纪年法: input?.纪年法?.trim() || '琥珀纪年',
    开拓天数: alignedCalendar.开拓天数,
    当前日期: alignedCalendar.当前日期,
    当前时间: normalizeClock(input?.当前时间) || '06:40',
    当前地点: input?.当前地点?.trim() || '',
    当前区域ID: inferCurrentRegionId(input),
    当前天气: input?.当前天气?.trim() || base.当前天气 || 'clear',
    全局事件: Array.isArray(input?.全局事件) ? input.全局事件 : [],
    活跃人物: Array.isArray(input?.活跃人物) ? input.活跃人物 : [],
    氛围变化: input?.氛围变化 ?? '',
  };
  normalized.开局档案 = 归一化开局档案(input?.开局档案, normalized);
  normalized.剧情运行时 = 归一化剧情编织运行时切片(input?.剧情运行时);
  return normalized;
}

/**
 * 旧档区域迁移：优先使用已保存的结构化区域，其次使用开局档案地区，最后从当前地点做保守关键词映射。
 * 不猜测未知地点所属区域，避免把旧档错误导向某条剧情线。
 */
export function 从当前地点推断区域ID(location?: string): string {
  const normalized = (location ?? '').replace(/\s+/g, '').toLowerCase();
  if (!normalized) return 'unknown';
  const aliases: Array<[string, string[]]> = [
    ['herta_space_station', ['黑塔空间站', '空间站', '主控舱段', '支援舱段', '收容舱段']],
    ['jarilo_vi', ['雅利洛', '贝洛伯格', '永冬岭', '下层区', '上层区', '磐岩镇', '大矿区', '残响回廊']],
    ['xianzhou_luofu', ['仙舟罗浮', '罗浮', '长乐天', '太卜司', '鳞渊境', '丹鼎司', '工造司']],
    ['penacony', ['匹诺康尼', '白日梦酒店', '梦境', '流梦礁', '朝露公馆']],
    ['amphoreus', ['翁法罗斯', '奥赫玛', '永恒之地', '悬锋城', '刻法勒', '万敌']],
    ['erxiang_paradise', ['二相乐园', '乐园']],
  ];
  return aliases.find(([, terms]) => terms.some((term) => normalized.includes(term.toLowerCase())))?.[0] ?? 'unknown';
}

function inferCurrentRegionId(input?: Partial<世界状态> | null): string {
  const explicit = typeof input?.当前区域ID === 'string' ? input.当前区域ID.trim() : '';
  if (explicit) return explicit;
  const location = input?.当前地点?.trim() || input?.自定义起始地点?.trim() || '';
  const locationRegion = 从当前地点推断区域ID(location);
  if (locationRegion !== 'unknown') return locationRegion;
  return input?.开局档案?.地区ID?.trim() || 'unknown';
}

export function 创建默认开局档案(world: Partial<世界状态> = {}): 开局档案 {
  const fallbackPreset = getOfficialOpeningPresetByChapterId(world.起航之地ID?.trim() || 'heita_station_incident')
    ?? getOfficialOpeningPreset('official_herta_station_incident');
  if (fallbackPreset) {
    return 根据官方开局预设创建开局档案(fallbackPreset, world);
  }
  const location = world.当前地点?.trim() || world.自定义起始地点?.trim() || '黑塔空间站';
  return {
    来源: 'official_preset',
    主线启用: true,
    星球来源: 'existing',
    地区ID: 'herta_space_station',
    地区名称: '黑塔空间站',
    章节锚点ID: world.起航之地ID?.trim() || 'heita_station_incident',
    章节锚点名称: world.自定义起始场景名称?.trim() || '黑塔空间站 · 主线苏醒前夕',
    章节参考说明: world.自定义起始场景描述?.trim() || '原著主线即将从黑塔空间站危机开始，空间站遭遇反物质军团入侵。',
    参考性质: '背景参考',
    官方预设ID: world.起航之地ID?.trim() || 'heita_station_incident',
    玩家介入原文: world.自定义开局?.trim() || '',
    整理档案: {
      玩家身份: world.自定义起始场景名称?.trim() ? `来自${location}的介入者` : undefined,
      初始地点参考: location,
      初始日期参考: world.当前日期?.trim() || 默认琥珀日期,
      初始时间参考: normalizeClock(world.当前时间) || '06:40',
      起始情境: world.自定义起始场景描述?.trim() || '黑塔空间站危机前后，玩家以自定义身份切入。',
      当前目标: world.自定义开局?.trim() ? '承接当前危机并稳定切入原著主线' : '先在当前场景站稳脚跟',
      特别要求: world.自定义开局?.trim() ? [world.自定义开局.trim()] : [],
    },
    防回退规则: [
      buildOpeningPriorStoryRule(world.起航之地ID?.trim() || 'heita_station_incident'),
      '开局锚点只在新游戏创建时建立一次，后续回合必须沿着当前地点和已成立事实推进。',
      '不得在无剧情理由时重播默认开局或让玩家重新经历同一段入场。',
      '若后续选择非黑塔地区开局，黑塔空间站只能作为资料、远方地点或后续旅程目标出现。',
    ],
  };
}

export function 根据官方开局预设创建开局档案(
  preset: 官方开局预设,
  world: Partial<世界状态> = {},
): 开局档案 {
  const region = getOpeningRegion(preset.regionId);
  const chapter = getOpeningChapterAnchor(preset.chapterId);
  return {
    来源: 'official_preset',
    主线启用: true,
    星球来源: 'existing',
    地区ID: preset.regionId,
    地区名称: preset.regionName || region?.name || '未知地区',
    章节锚点ID: preset.chapterId,
    章节锚点名称: preset.chapterName || chapter?.name || '未命名章节锚点',
    章节参考说明: preset.summary || chapter?.summary || '官方预设背景参考。',
    参考性质: '背景参考',
    官方预设ID: preset.id,
    玩家介入原文: world.自定义开局?.trim() || '',
    整理档案: {
      初始地点参考: preset.defaultLocationHint || region?.defaultLocationHint || world.当前地点?.trim() || '',
      初始日期参考: preset.referenceDate || world.当前日期?.trim() || 默认琥珀日期,
      初始时间参考: preset.referenceTime || normalizeClock(world.当前时间) || '06:40',
      起始情境: preset.summary || chapter?.summary || '官方预设开局。',
      当前目标: preset.openingPressure[0] ? `优先回应：${preset.openingPressure[0]}` : '承接官方预设开局压力并推进剧情',
      关键角色参考: preset.keyNpcs.slice(0, 8),
      叙事倾向: preset.recommendedEntryAngles.slice(0, 4),
      特别要求: preset.openingPressure.slice(0, 5),
      冲突协调: [
        '官方预设用于提供稳定背景，不代表玩家必须按原著走完全程。',
        '若玩家介入文本与章节锚点存在轻微偏差，优先把它解释为介入角度不同，而不是否定开局。',
      ],
    },
    防回退规则: [
      `本开局来源于官方预设「${preset.title}」，后续回合必须沿着该地区与章节锚点推进。`,
      buildOpeningPriorStoryRule(preset.chapterId),
      '不得无理由回到默认黑塔空间站开局，除非剧情明确转场或玩家主动返回。',
      '玩家介入文本是开局事实的一部分，不能被章节锚点覆盖掉。',
    ],
  };
}

export function 根据起始场景创建开局档案(
  scenario: 起始场景,
  world: Partial<世界状态> = {},
): 开局档案 {
  const bundle = getOpeningScenarioBundle(scenario.id);
  const preset = scenario.officialPresetId
    ? getOfficialOpeningPreset(scenario.officialPresetId)
    : bundle.preset;
  if (preset) return 根据官方开局预设创建开局档案(preset, world);
  return 创建默认开局档案({
    ...world,
    起航之地ID: scenario.id,
    自定义起始场景名称: scenario.name,
    自定义起始场景描述: scenario.description,
    自定义起始场景要点: scenario.openingHighlights,
  });
}

export function 归一化开局档案(value: unknown, world: Partial<世界状态> = {}): 开局档案 {
  if (!value || typeof value !== 'object') return 创建默认开局档案(world);
  const raw = value as Partial<开局档案>;
  const legacyFreedom = (raw as { 自由度模式?: unknown }).自由度模式;
  const fallback = 创建默认开局档案(world);
  return {
    来源: isOpeningSource(raw.来源) ? raw.来源 : fallback.来源,
    主线启用: typeof raw.主线启用 === 'boolean' ? raw.主线启用 : fallback.主线启用,
    星球来源: isFreeOpeningPlanetSource(raw.星球来源)
      ? raw.星球来源
      : isLegacyFreeOpeningFreedom(legacyFreedom) && legacyFreedom === 'high_freedom'
        ? 'custom'
        : fallback.星球来源,
    地区ID: sanitizeText(raw.地区ID) || fallback.地区ID,
    地区名称: sanitizeText(raw.地区名称) || fallback.地区名称,
    章节锚点ID: sanitizeText(raw.章节锚点ID) || fallback.章节锚点ID,
    章节锚点名称: sanitizeText(raw.章节锚点名称) || fallback.章节锚点名称,
    章节参考说明: sanitizeText(raw.章节参考说明) || fallback.章节参考说明,
    参考性质: '背景参考',
    官方预设ID: sanitizeOptionalText(raw.官方预设ID),
    创意工坊模板ID: sanitizeOptionalText(raw.创意工坊模板ID),
    玩家介入原文: sanitizeText(raw.玩家介入原文) || fallback.玩家介入原文,
    整理档案: normalizeOpeningSummary(raw.整理档案, fallback.整理档案),
    防回退规则: (() => {
      const rules = sanitizeStringArray(raw.防回退规则);
      const baseRules = rules.length ? rules : fallback.防回退规则;
      return 去重字符串([
        buildOpeningPriorStoryRule(sanitizeText(raw.章节锚点ID) || fallback.章节锚点ID),
        ...baseRules,
      ]).slice(0, 8);
    })(),
  };
}

export function 整理自由开局草稿(input: {
  regionName: string;
  chapterName: string;
  playerText: string;
  defaultLocationHint?: string;
  defaultDateHint?: string;
  defaultTimeHint?: string;
  planetSource?: 自由开局地点来源;
  mainlineEnabled?: boolean;
  keyNpcs?: string[];
}): 开局整理档案 {
  const text = input.playerText.trim();
  const mentionedNpcs = (input.keyNpcs ?? []).filter((name) => text.includes(name));
  const moodHints = detectOpeningMoodHints(text);
  const customLocation = inferOpeningLocation(text, input.defaultLocationHint);
  const isCustomLocationSource = input.planetSource === 'custom';
  return {
    玩家身份: inferOpeningIdentity(text),
    来到此地原因: inferOpeningReason(text, input.regionName),
    当前目标: isCustomLocationSource ? inferOpeningGoal(text) : undefined,
    起始情境: text
      ? `玩家自由介入${input.regionName}「${input.chapterName}」背景：${truncateText(text, 160)}`
      : `玩家以自由开局介入${input.regionName}「${input.chapterName}」背景。`,
    自定义星球: isCustomLocationSource ? inferCustomSettingDetail(text, ['星球', '星域', '行星', '殖民地', '世界', '自创地点']) : undefined,
    星球简介: isCustomLocationSource ? inferCustomSettingDetail(text, ['简介', '生态', '文明', '环境', '政治', '历史']) : undefined,
    初始地点参考: customLocation,
    自定义起始地点: customLocation && customLocation !== input.defaultLocationHint ? customLocation : undefined,
    原创地点说明: inferCustomSettingDetail(text, ['地点', '地方', '空间', '站点', '洞天', '星舰', '实验站']),
    原创事件说明: isCustomLocationSource ? inferCustomSettingDetail(text, ['事件', '事故', '委托', '任务', '异常', '危机', '交易']) : undefined,
    原创组织说明: isCustomLocationSource ? inferCustomSettingDetail(text, ['组织', '势力', '公司', '商会', '研究组', '家族', '舰队']) : undefined,
    初始NPC详情: inferOpeningNpcDetails(text),
    自制NPC: [],
    世界设定补充: isCustomLocationSource ? inferOpeningWorldDetails(text) : undefined,
    主线参与程度: input.mainlineEnabled === false ? '关闭主线坐标，按玩家自建开局工作台推进。' : '启用主线坐标，原作主线进度仅作背景参考。',
    初始日期参考: input.defaultDateHint || 默认琥珀日期,
    初始时间参考: normalizeClock(input.defaultTimeHint) || '06:40',
    关键角色参考: sanitizeStringArray(input.keyNpcs).slice(0, 8),
    已认识角色: mentionedNpcs,
    初始关系: mentionedNpcs.map((name) => `${name}：由玩家介入文本点名，关系按正文确认，不默认亲密。`),
    叙事倾向: moodHints.length ? moodHints : ['自由介入', '背景参考优先'],
    特别要求: text ? [text] : [],
    冲突协调: [
      input.mainlineEnabled === false
        ? '主线坐标已关闭：原作主线不会自动注入；若需要原作剧情，玩家需在剧情编织中手动启用对应主线。'
        : '若玩家自由设定与章节时间线轻微冲突，优先解释为提前结识、支线插入、委托、梦境、模拟宇宙或特殊经历。',
      input.mainlineEnabled === false ? '优先承接玩家自建地点、NPC 与设定。' : '章节锚点只作为背景参考，不硬锁玩家介入方式。',
    ],
  };
}

export function 根据自由开局整理创建开局档案(input: {
  regionId: string;
  regionName: string;
  chapterId: string;
  chapterName: string;
  chapterSummary: string;
  playerText: string;
  defaultLocationHint?: string;
  defaultDateHint?: string;
  defaultTimeHint?: string;
  officialPresetId?: string;
  workshopTemplateId?: string;
  priorStoryState?: string;
  planetSource?: 自由开局地点来源;
  mainlineEnabled?: boolean;
  keyNpcs?: string[];
  整理档案?: 开局整理档案;
}): 开局档案 {
  const mainlineEnabled = input.mainlineEnabled !== false;
  const planetSource = input.planetSource ?? 'existing';
  const summary = input.整理档案 ?? 整理自由开局草稿({
      regionName: input.regionName,
      chapterName: input.chapterName,
      playerText: input.playerText,
      defaultLocationHint: input.defaultLocationHint,
      defaultDateHint: input.defaultDateHint,
      defaultTimeHint: input.defaultTimeHint,
      planetSource,
      mainlineEnabled,
      keyNpcs: input.keyNpcs,
    });
  return {
    来源: input.workshopTemplateId ? 'workshop' : 'free',
    主线启用: mainlineEnabled,
    星球来源: planetSource,
    地区ID: input.regionId,
    地区名称: input.regionName,
    章节锚点ID: input.chapterId,
    章节锚点名称: input.chapterName,
    章节参考说明: input.chapterSummary,
    参考性质: '背景参考',
    官方预设ID: input.officialPresetId,
    创意工坊模板ID: input.workshopTemplateId,
    玩家介入原文: input.playerText.trim(),
    整理档案: summary,
    防回退规则: [
      input.workshopTemplateId
        ? `本开局来自创意工坊模板 ${input.workshopTemplateId}，模板和章节锚点仅作背景参考。`
        : `本开局为${input.regionName}自由开局，章节锚点仅作背景参考。`,
      buildFreeOpeningRule(planetSource, mainlineEnabled),
      mainlineEnabled
        ? buildOpeningPriorStoryRule(input.chapterId, input.priorStoryState)
        : '主线坐标关闭：章节锚点不自动注入正文推进；玩家需要在剧情编织中手动启用想要注入的主线剧情。',
      '优先承接玩家介入文本，不得把玩家写成默认黑塔空间站入场。',
      '若玩家文本与章节锚点冲突，优先进行合理化协调，而不是直接否定。',
    ],
  };
}

export function 根据创意工坊模板创建开局档案(
  template: 创意工坊开局模板,
  playerText: string,
): 开局档案 {
  const region = getOpeningRegion(template.regionId);
  const chapter = getOpeningChapterAnchor(template.chapterId);
  return 根据自由开局整理创建开局档案({
    regionId: template.regionId,
    regionName: region?.name || template.regionId,
    chapterId: template.chapterId,
    chapterName: chapter?.name || template.title,
    chapterSummary: template.summary || chapter?.summary || '创意工坊开局模板背景参考。',
    playerText: playerText.trim() || template.playerEntryTemplate,
    defaultLocationHint: template.defaultLocationHint || chapter?.defaultLocationHint || region?.defaultLocationHint,
    workshopTemplateId: template.id,
    priorStoryState: chapter?.priorStoryState,
    planetSource: 'existing',
    keyNpcs: template.keyNpcs,
  });
}

export function 根据开局档案创建初始NPC记录(archive?: 开局档案): NPC记录[] {
  const summary = archive?.整理档案;
  if (!archive || !summary) return [];
  const relationHints = sanitizeStringArray(summary.初始关系);
  if (archive.来源 === 'official_preset' && relationHints.length === 0) return [];

  const explicitNames = 去重字符串([
    ...sanitizeStringArray(summary.已认识角色),
    ...relationHints.map(extractOpeningRelationName),
    ...sanitizeOpeningCustomNpcs(summary.自制NPC).map((npc) => npc.姓名),
  ]).filter(isValidOpeningInitialNpcName);
  if (!explicitNames.length) return [];

  const records = explicitNames.map((name, index) => {
    const relationHint = findOpeningRelationHint(name, relationHints);
    const customNpc = sanitizeOpeningCustomNpcs(summary.自制NPC).find((npc) => npc.姓名 === name);
    // 开局档案明确声明的自制 NPC 优先保留 custom 身份，即使姓名碰到原著 alias。
    const canonical = customNpc ? null : matchCanonical(name);
    const openingSummary = relationHint
      || customNpc?.与玩家关系
      || customNpc?.当前状态
      || `${name}：开局档案写明已认识玩家，具体关系以后续正文承接。`;
    const openingAffinity = inferOpeningAffinity(openingSummary);
    const openingIntimacy = inferOpeningIntimateRelationship(openingSummary);
    const record = 创建NPC记录({
      姓名: canonical?.name || name,
      别名: canonical && canonical.name !== name ? name : undefined,
      阶位: canonical ? 'companion' : 'extra',
      初见回合: 0,
      原著角色: Boolean(canonical),
      NPC来源: customNpc ? 'custom' : canonical ? 'canonical' : 'unknown',
      性别: canonical?.gender,
      外貌: canonical?.appearance,
      性格: canonical?.personality,
      介绍: customNpc
        ? `由开局档案建立的自制 NPC。${[
            customNpc.背景,
            customNpc.是否命途行者 === true ? '命途行者。' : '',
            customNpc.能力 ? `能力：${customNpc.能力}` : '',
            openingSummary,
          ].filter(Boolean).join('；')}`
        : `由开局档案建立的初始关系对象。${openingSummary}`,
    });
    return {
      ...record,
      id: `opening-npc-${index}-${record.id}`,
      好感度: openingAffinity,
      关系: 获取NPC兼容关系(openingAffinity),
      亲密关系: openingIntimacy,
      同行: false,
      最近回合: 0,
      当前关系阶段: 获取NPC关系阶段(openingAffinity),
      最近互动: `开局档案：${openingSummary}`,
      对玩家长期印象: '在开局设定中已经知道玩家，后续亲疏、信任和称呼必须以正文互动继续确认。',
      共同经历: [`开局设定：${openingSummary}`],
      同行记忆: [
        {
          id: `opening-memory-${index}`,
          回合: 0,
          摘要: `开局设定：${openingSummary}`,
          来源: '其他' as const,
        },
      ],
      必须记得: [
        '该关系来自开局档案，代表长期关系参考，不代表当前镜头在场。',
      ],
      备注: 去重字符串([
        ...(record.备注 ?? []),
        `开局来源：${formatOpeningSource(archive.来源)} / ${archive.地区名称} / ${archive.章节锚点名称}`,
      ]),
    };
  });

  return 归一化NPC记录列表(records);
}

function isValidOpeningInitialNpcName(name: string): boolean {
  const text = sanitizeText(name);
  if (!text || text.length > 12) return false;
  if (OPENING_NON_PERSON_NAMES.has(text)) return false;
  if (OPENING_NON_PERSON_NAME_RE.test(text) && !matchCanonical(text)) return false;
  return true;
}

export function 归一化创意工坊开局模板包(value: unknown): 创意工坊开局模板包 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<创意工坊开局模板包> & { templates?: unknown };
  const templates = Array.isArray(raw.templates)
    ? raw.templates.map((item) => 归一化创意工坊开局模板(item)).filter((item): item is 创意工坊开局模板 => !!item)
    : [];
  if (templates.length === 0) return null;
  return {
    schema: raw.schema === 'kaituo-opening-workshop-pack' ? raw.schema : 'kaituo-opening-workshop-pack',
    version: sanitizeText(raw.version) || '0.1.0',
    title: sanitizeText(raw.title) || '未命名开局模板包',
    author: sanitizeOptionalText(raw.author),
    description: sanitizeOptionalText(raw.description),
    tags: sanitizeStringArray(raw.tags),
    templates,
  };
}

export function 归一化创意工坊开局模板(value: unknown): 创意工坊开局模板 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<创意工坊开局模板>;
  const id = sanitizeText(raw.id);
  const title = sanitizeText(raw.title);
  const regionId = sanitizeText(raw.regionId);
  const chapterId = sanitizeText(raw.chapterId);
  const playerEntryTemplate = sanitizeText(raw.playerEntryTemplate);
  if (!id || !title || !regionId || !chapterId || !playerEntryTemplate) return null;
  return {
    id,
    source: 'workshop',
    title,
    author: sanitizeOptionalText(raw.author),
    version: sanitizeText(raw.version) || '0.1.0',
    regionId,
    chapterId,
    summary: sanitizeText(raw.summary) || '创意工坊开局模板。',
    defaultLocationHint: sanitizeOptionalText(raw.defaultLocationHint),
    keyNpcs: sanitizeStringArray(raw.keyNpcs),
    loreKeywords: sanitizeStringArray(raw.loreKeywords),
    openingPressure: sanitizeStringArray(raw.openingPressure),
    tags: sanitizeStringArray(raw.tags),
    playerEntryTemplate,
    editableFields: Array.isArray(raw.editableFields)
      ? raw.editableFields
          .map((item): 创意工坊开局模板['editableFields'][number] | null => {
            if (!item || typeof item !== 'object') return null;
            const field = item as Partial<创意工坊开局模板['editableFields'][number]>;
            const fieldId = sanitizeText(field.id);
            const label = sanitizeText(field.label);
            const placeholder = sanitizeText(field.placeholder);
            if (!fieldId || !label || !placeholder) return null;
            const normalized: 创意工坊开局模板['editableFields'][number] = {
              id: fieldId,
              label,
              placeholder,
            };
            if (field.required === true) normalized.required = true;
            if (field.multiline === true) normalized.multiline = true;
            return normalized;
          })
          .filter((item): item is 创意工坊开局模板['editableFields'][number] => !!item)
      : [],
  };
}

export function 生成开局已成立事实(archive: 开局档案, options: {
  currentDate?: string;
  currentTime?: string;
  currentLocation?: string;
  originalProtagonist?: string;
  pathSummary?: string;
  extraFacts?: string[];
} = {}): string[] {
  const summary = archive.整理档案;
  const facts = [
    `开局档案：${formatOpeningSource(archive.来源)} / ${archive.地区名称} / ${archive.章节锚点名称}`,
    typeof archive.主线启用 === 'boolean' ? `主线坐标：${archive.主线启用 ? '启用' : '关闭（需在剧情编织手动启用主线注入）'}` : '',
    archive.星球来源 ? `地点来源：${formatFreeOpeningPlanetSource(archive.星球来源)}` : '',
    `章节参考：${archive.章节参考说明 || '无详细说明'}（仅作背景参考）`,
    `开局地点：${options.currentLocation || summary?.初始地点参考 || archive.地区名称}`,
    options.currentDate || options.currentTime ? `开局时间：${[options.currentDate, options.currentTime].filter(Boolean).join(' · ')}` : '',
    options.originalProtagonist ? `原著主角选择：${options.originalProtagonist}` : '',
    options.pathSummary ? `命途倾向：${options.pathSummary}` : '',
    archive.玩家介入原文 ? `玩家介入：${truncateText(archive.玩家介入原文, 160)}` : '',
    summary?.玩家身份 ? `开局身份：${summary.玩家身份}` : '',
    summary?.来到此地原因 ? `来到此地原因：${summary.来到此地原因}` : '',
    summary?.当前目标 ? `当前目标：${summary.当前目标}` : '',
    summary?.起始情境 ? `起始情境：${summary.起始情境}` : '',
    summary?.自定义星球 ? `自定义星球：${summary.自定义星球}` : '',
    summary?.星球简介 ? `星球简介：${summary.星球简介}` : '',
    summary?.初始地点参考 ? `初始地点参考：${summary.初始地点参考}` : '',
    summary?.自定义起始地点 ? `玩家自定义起始地点：${summary.自定义起始地点}` : '',
    summary?.原创地点说明 ? `原创地点说明：${summary.原创地点说明}` : '',
    summary?.原创事件说明 ? `原创事件说明：${summary.原创事件说明}` : '',
    summary?.原创组织说明 ? `原创组织说明：${summary.原创组织说明}` : '',
    summary?.初始NPC详情?.length ? `初始NPC详情：${summary.初始NPC详情.join('；')}` : '',
    summary?.自制NPC?.length ? `自制NPC：${formatOpeningCustomNpcs(summary.自制NPC)}` : '',
    summary?.世界设定补充?.length ? `世界设定补充：${summary.世界设定补充.join('；')}` : '',
    summary?.主线参与程度 ? `主线参与程度：${summary.主线参与程度}` : '',
    summary?.初始日期参考 || summary?.初始时间参考 ? `初始时间参考：${[summary?.初始日期参考, summary?.初始时间参考].filter(Boolean).join(' · ')}` : '',
    summary?.关键角色参考?.length ? `关键角色参考：${summary.关键角色参考.join('、')}（背景参考，不代表已认识或当前在场）` : '',
    summary?.已认识角色?.length ? `已认识角色：${summary.已认识角色.join('、')}` : '',
    summary?.初始关系?.length ? `初始关系：${summary.初始关系.join('；')}` : '',
    summary?.关键角色参考?.length || summary?.已认识角色?.length || summary?.初始关系?.length ? '人物边界：关键角色参考只代表背景相关人物；已认识角色/初始关系只代表长期关系参考；这些都不代表当前在场。' : '',
    summary?.叙事倾向?.length ? `叙事倾向：${summary.叙事倾向.join('、')}` : '',
    ...archive.防回退规则.map((rule) => `防回退规则：${rule}`),
    ...(options.extraFacts ?? []),
  ];
  return facts.map((item) => item.trim()).filter(Boolean).slice(0, 24);
}

export function 格式化开局档案上下文(archive?: 开局档案): string {
  if (!archive) return '';
  const summary = archive.整理档案;
  const sourceLabel = formatOpeningSource(archive.来源);
  const lines = [
    `开局来源：${sourceLabel}`,
    typeof archive.主线启用 === 'boolean' ? `主线坐标：${archive.主线启用 ? '启用' : '关闭；原作主线需在剧情编织中手动启用注入'}` : '',
    archive.星球来源 ? `地点来源：${formatFreeOpeningPlanetSource(archive.星球来源)}` : '',
    `开局地区：${archive.地区名称}`,
    `章节锚点：${archive.章节锚点名称}`,
    archive.章节参考说明 ? `章节参考：${archive.章节参考说明}` : '',
    summary?.初始地点参考 ? `初始地点参考：${summary.初始地点参考}` : '',
    summary?.初始日期参考 || summary?.初始时间参考 ? `初始时间参考：${[summary?.初始日期参考, summary?.初始时间参考].filter(Boolean).join(' · ')}` : '',
    summary?.玩家身份 ? `玩家身份：${summary.玩家身份}` : '',
    summary?.来到此地原因 ? `来到此地原因：${summary.来到此地原因}` : '',
    summary?.当前目标 ? `当前目标：${summary.当前目标}` : '',
    summary?.起始情境 ? `起始情境：${summary.起始情境}` : '',
    summary?.自定义星球 ? `自定义星球：${summary.自定义星球}` : '',
    summary?.星球简介 ? `星球简介：${summary.星球简介}` : '',
    summary?.自定义起始地点 ? `玩家自定义起始地点：${summary.自定义起始地点}` : '',
    summary?.原创地点说明 ? `原创地点说明：${summary.原创地点说明}` : '',
    summary?.原创事件说明 ? `原创事件说明：${summary.原创事件说明}` : '',
    summary?.原创组织说明 ? `原创组织说明：${summary.原创组织说明}` : '',
    summary?.初始NPC详情?.length ? `初始NPC详情：${summary.初始NPC详情.join('；')}` : '',
    summary?.自制NPC?.length ? `自制NPC：${formatOpeningCustomNpcs(summary.自制NPC)}` : '',
    summary?.世界设定补充?.length ? `世界设定补充：${summary.世界设定补充.join('；')}` : '',
    summary?.主线参与程度 ? `主线参与程度：${summary.主线参与程度}` : '',
    summary?.关键角色参考?.length ? `关键角色参考：${summary.关键角色参考.join('、')}（背景参考，不代表已认识或当前在场）` : '',
    summary?.已认识角色?.length ? `已认识角色：${summary.已认识角色.join('、')}` : '',
    summary?.初始关系?.length ? `初始关系：${summary.初始关系.join('；')}` : '',
    summary?.叙事倾向?.length ? `叙事倾向：${summary.叙事倾向.join('、')}` : '',
    archive.玩家介入原文 ? `玩家介入：${truncateText(archive.玩家介入原文, 220)}` : '',
    archive.防回退规则.length ? `防回退：${archive.防回退规则.slice(0, 4).join('；')}` : '',
  ];
  return lines.map((item) => item.trim()).filter(Boolean).join('\n');
}

export function 对齐世界日期与天数(dayValue: number, dateText: string): Pick<世界状态, '开拓天数' | '当前日期'> {
  const baseSerial = 解析琥珀日期序数(默认琥珀日期);
  const dateSerial = 解析琥珀日期序数(dateText);
  const dayProgress = Math.max(0, Math.trunc(dayValue) - 1);
  const dateProgress = baseSerial !== null && dateSerial !== null
    ? Math.max(0, dateSerial - baseSerial)
    : 0;
  const progress = Math.max(dayProgress, dateProgress);
  return {
    开拓天数: progress + 1,
    当前日期: baseSerial !== null ? 格式化琥珀日期序数(baseSerial + progress) : (dateText || 默认琥珀日期),
  };
}

export function 推进琥珀日期(dateText: string, deltaDays = 1): string {
  const serial = 解析琥珀日期序数(dateText);
  if (serial === null) return dateText || 默认琥珀日期;
  return 格式化琥珀日期序数(serial + Math.trunc(deltaDays));
}

export function 解析琥珀日期序数(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^琥珀纪\s*(\d{1,6})\.(\d{1,2})\.(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return year * 372 + (month - 1) * 31 + day;
}

export function 格式化琥珀日期序数(serial: number): string {
  const safeSerial = Math.max(1, Math.trunc(serial));
  const year = Math.floor((safeSerial - 1) / 372);
  const dayOfYear = safeSerial - year * 372;
  const month = Math.floor((dayOfYear - 1) / 31) + 1;
  const day = ((dayOfYear - 1) % 31) + 1;
  return `琥珀纪 ${year}.${month.toString().padStart(2, '0')}.${day.toString().padStart(2, '0')}`;
}

function normalizeClock(value?: string | null): string {
  const raw = value?.trim();
  if (!raw) return '';
  const embedded = raw.match(/(\d{1,2}:\d{2})/);
  if (embedded) {
    const [hours, minutes] = embedded[1].split(':').map((part) => Number(part));
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return `${Math.max(0, Math.min(23, hours)).toString().padStart(2, '0')}:${Math.max(0, Math.min(59, minutes)).toString().padStart(2, '0')}`;
    }
  }
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hours, minutes] = raw.split(':').map((part) => Number(part));
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return `${Math.max(0, Math.min(23, hours)).toString().padStart(2, '0')}:${Math.max(0, Math.min(59, minutes)).toString().padStart(2, '0')}`;
    }
  }

  const legacyMap: Record<string, string> = {
    清晨: '06:40',
    上午: '09:40',
    午后: '14:10',
    黄昏: '18:20',
    夜晚: '21:30',
    深夜: '00:30',
  };
  return legacyMap[raw] ?? raw;
}

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeOptionalText(value: unknown): string | undefined {
  const text = sanitizeText(value);
  return text || undefined;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item))
    .filter(Boolean);
}

function sanitizeOpeningCustomNpcs(value: unknown): 开局自制NPC[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): 开局自制NPC | null => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<开局自制NPC>;
      const 姓名 = sanitizeText(raw.姓名);
      if (!isValidOpeningInitialNpcName(姓名)) return null;
      return {
        姓名,
        背景: sanitizeOptionalText(raw.背景),
        是否命途行者: typeof raw.是否命途行者 === 'boolean' ? raw.是否命途行者 : undefined,
        能力: sanitizeOptionalText(raw.能力),
        与玩家关系: sanitizeOptionalText(raw.与玩家关系),
        当前状态: sanitizeOptionalText(raw.当前状态),
      };
    })
    .filter((item): item is 开局自制NPC => !!item)
    .slice(0, 12);
}

function formatOpeningCustomNpcs(value: 开局自制NPC[]): string {
  return sanitizeOpeningCustomNpcs(value)
    .map((npc) => [
      npc.姓名,
      npc.背景 ? `背景:${npc.背景}` : '',
      typeof npc.是否命途行者 === 'boolean' ? `命途行者:${npc.是否命途行者 ? '是' : '否'}` : '',
      npc.能力 ? `能力:${npc.能力}` : '',
      npc.与玩家关系 ? `关系:${npc.与玩家关系}` : '',
      npc.当前状态 ? `当前状态:${npc.当前状态}` : '',
    ].filter(Boolean).join(' / '))
    .join('；');
}

function buildOpeningPriorStoryRule(chapterId: string, override?: string): string {
  const state = sanitizeText(override) || getOpeningChapterAnchor(chapterId)?.priorStoryState;
  if (state) return `前置剧情处理：${state}`;
  return '前置剧情处理：章节锚点之前的原作主线只作既成背景、资料参考或回忆来源，不进入正文自动跳转、补演或推进目标。';
}

function 去重字符串(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  items.forEach((item) => {
    const text = sanitizeText(item);
    if (!text || seen.has(text)) return;
    seen.add(text);
    output.push(text);
  });
  return output;
}

function extractOpeningRelationName(text: string): string {
  const clean = sanitizeText(text);
  if (!clean) return '';
  const [head] = clean.split(/[：:，,。；;\s]/);
  return sanitizeText(head).replace(/[「」"']/g, '');
}

function findOpeningRelationHint(name: string, hints: string[]): string {
  const cleanName = sanitizeText(name);
  if (!cleanName) return '';
  return hints.find((hint) => {
    const cleanHint = sanitizeText(hint);
    return cleanHint.startsWith(`${cleanName}：`) || cleanHint.startsWith(`${cleanName}:`) || cleanHint.includes(cleanName);
  }) ?? '';
}

function inferOpeningAffinity(summary: string): number {
  if (/(敌对|仇敌|仇人|死敌)/.test(summary)) return -31;
  if (/(陌生|不认识)/.test(summary)) return -1;
  if (/(生死挚友|生死之交)/.test(summary)) return 101;
  if (/(知己|挚友)/.test(summary)) return 50;
  if (/(熟识|朋友|好友|认识|同伴|队友|恋人|伴侣|爱人|夫妻)/.test(summary)) return 20;
  return 20;
}

function inferOpeningIntimateRelationship(summary: string): boolean {
  return /(恋人|伴侣|爱人|夫妻|情侣|已交往)/.test(summary);
}

function isOpeningSource(value: unknown): value is 开局来源 {
  return value === 'official_preset' || value === 'free' || value === 'workshop';
}

function isFreeOpeningPlanetSource(value: unknown): value is 自由开局地点来源 {
  return value === 'existing' || value === 'custom';
}

function isLegacyFreeOpeningFreedom(value: unknown): value is 'canon_close' | 'side_expansion' | 'high_freedom' | 'if_rewrite' {
  return value === 'canon_close' || value === 'side_expansion' || value === 'high_freedom' || value === 'if_rewrite';
}

function formatOpeningSource(value: 开局来源): string {
  if (value === 'free') return '自由开局';
  if (value === 'workshop') return '创意工坊';
  return '官方预设';
}

function formatFreeOpeningPlanetSource(value: 自由开局地点来源): string {
  return value === 'custom' ? '自创地点' : '已有地点';
}

function buildFreeOpeningRule(planetSource: 自由开局地点来源, mainlineEnabled = true): string {
  const mainlineRule = mainlineEnabled
    ? '主线坐标启用：所选主线进度只提供原作世界推进坐标，不等于玩家必须从主线事件入手。'
    : '主线坐标关闭：原作主线不会自动注入；若需要原作剧情，玩家需在剧情编织中手动启用对应主线。';
  const planetRule = planetSource === 'custom'
    ? '地点来源：自创地点。优先承接玩家自建地点、NPC、组织与世界规则。'
    : '地点来源：已有地点。优先承接玩家在所选原作地点上的自由切入；不要求补写星球简介。';
  return `${mainlineRule} ${planetRule}`;
}

function normalizeOpeningSummary(
  value: unknown,
  fallback?: 开局整理档案,
): 开局整理档案 | undefined {
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Partial<开局整理档案>;
  return {
    玩家身份: sanitizeOptionalText(raw.玩家身份),
    来到此地原因: sanitizeOptionalText(raw.来到此地原因),
    当前目标: sanitizeOptionalText(raw.当前目标),
    起始情境: sanitizeOptionalText(raw.起始情境) || fallback?.起始情境,
    自定义星球: sanitizeOptionalText(raw.自定义星球) || fallback?.自定义星球,
    星球简介: sanitizeOptionalText(raw.星球简介) || fallback?.星球简介,
    初始地点参考: sanitizeOptionalText(raw.初始地点参考) || fallback?.初始地点参考,
    自定义起始地点: sanitizeOptionalText(raw.自定义起始地点) || fallback?.自定义起始地点,
    原创地点说明: sanitizeOptionalText(raw.原创地点说明) || fallback?.原创地点说明,
    原创事件说明: sanitizeOptionalText(raw.原创事件说明) || fallback?.原创事件说明,
    原创组织说明: sanitizeOptionalText(raw.原创组织说明) || fallback?.原创组织说明,
    初始NPC详情: sanitizeStringArray(raw.初始NPC详情).length ? sanitizeStringArray(raw.初始NPC详情) : fallback?.初始NPC详情,
    自制NPC: sanitizeOpeningCustomNpcs(raw.自制NPC).length ? sanitizeOpeningCustomNpcs(raw.自制NPC) : fallback?.自制NPC,
    世界设定补充: sanitizeStringArray(raw.世界设定补充).length ? sanitizeStringArray(raw.世界设定补充) : fallback?.世界设定补充,
    主线参与程度: sanitizeOptionalText(raw.主线参与程度) || fallback?.主线参与程度,
    初始日期参考: sanitizeOptionalText(raw.初始日期参考) || fallback?.初始日期参考,
    初始时间参考: normalizeClock(raw.初始时间参考) || fallback?.初始时间参考,
    关键角色参考: sanitizeStringArray(raw.关键角色参考 ?? (raw as Record<string, unknown>).keyNpcs),
    已认识角色: sanitizeStringArray(raw.已认识角色),
    初始关系: sanitizeStringArray(raw.初始关系),
    叙事倾向: sanitizeStringArray(raw.叙事倾向),
    特别要求: sanitizeStringArray(raw.特别要求).length
      ? sanitizeStringArray(raw.特别要求)
      : fallback?.特别要求,
    冲突协调: sanitizeStringArray(raw.冲突协调),
  };
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function inferOpeningIdentity(text: string): string | undefined {
  const patterns = [
    /我是([^，。；\n]{2,36})/,
    /身份是([^，。；\n]{2,36})/,
    /作为([^，。；\n]{2,36})/,
    /以([^，。；\n]{2,36})身份/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return text ? '由玩家自由开局文本定义的介入者' : undefined;
}

function inferOpeningReason(text: string, regionName: string): string | undefined {
  const reasonKeywords = ['委托', '调查', '追踪', '邀请', '逃亡', '旅行', '寻找', '护送', '交易', '救援', '误入'];
  const matched = reasonKeywords.find((kw) => text.includes(kw));
  if (matched) return `因${matched}相关事件来到${regionName}`;
  return text ? `玩家自由文本指定其来到${regionName}` : undefined;
}

function inferOpeningGoal(text: string): string | undefined {
  const goalPatterns = [
    /想要([^，。；\n]{2,40})/,
    /目标是([^，。；\n]{2,40})/,
    /希望([^，。；\n]{2,40})/,
    /准备([^，。；\n]{2,40})/,
  ];
  for (const pattern of goalPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return text ? '按玩家自由介入文本推进当前目标' : undefined;
}

function inferOpeningLocation(text: string, fallback?: string): string | undefined {
  const locationPatterns = [
    /从([^，。；\n]{2,30})开始/,
    /在([^，。；\n]{2,30})开始/,
    /地点是([^，。；\n]{2,30})/,
    /开局地点是([^，。；\n]{2,30})/,
    /起始地点是([^，。；\n]{2,30})/,
    /位于([^，。；\n]{2,30})/,
  ];
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return fallback;
}

function inferCustomSettingDetail(text: string, keywords: string[]): string | undefined {
  const clean = text.trim();
  if (!clean) return undefined;
  const sentences = clean
    .split(/[。！？!?\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const hit = sentences.find((sentence) => keywords.some((keyword) => sentence.includes(keyword)));
  return hit ? truncateText(hit, 100) : undefined;
}

function inferOpeningNpcDetails(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  return clean
    .split(/[。！？!?\n]+/g)
    .map((item) => item.trim())
    .filter((item) => /NPC|npc|角色|人物|同伴|居民|老板|医生|队长|导师|接头人|商人|家族|云骑|公司/.test(item))
    .slice(0, 6)
    .map((item) => truncateText(item, 120));
}

function inferOpeningWorldDetails(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  return clean
    .split(/[。！？!?\n]+/g)
    .map((item) => item.trim())
    .filter((item) => /设定|规则|禁忌|科技|政治|信仰|生态|资源|危机|风俗|制度|历史|传闻/.test(item))
    .slice(0, 6)
    .map((item) => truncateText(item, 120));
}

function detectOpeningMoodHints(text: string): string[] {
  const candidates: Array<[string, string]> = [
    ['日常', '日常互动'],
    ['轻松', '轻松'],
    ['悬疑', '悬疑'],
    ['战斗', '战斗'],
    ['暧昧', '暧昧'],
    ['主线', '参与主线'],
    ['支线', '偏支线'],
    ['调查', '调查'],
    ['冲突', '直接进入冲突'],
  ];
  return candidates.filter(([kw]) => text.includes(kw)).map(([, label]) => label);
}

function createPlaceholderPeriod(): 时段定义 {
  return {
    id: '',
    名称: '',
    年代: '',
    描述: '',
    氛围: '',
    关键事件: [],
    科技水平: '',
    社会规范: '',
    派系: [],
    人物: [],
  };
}
