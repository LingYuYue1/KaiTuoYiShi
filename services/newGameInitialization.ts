/**
 * 新局初始化归一入口（GitHub #15）。
 * useGame 里 handlePrepareNewGame（fresh：向导 draft 派生旅人/世界）与
 * handleRestartOpening（restart：保留创角静态字段、清空运行时切片）两条重复的
 * 新局组装路径收敛于此。
 *
 * 职责边界：
 *  - createInitialWorkspace 是唯一公开面，异步编排：不做 React state 写入、不落库
 *    （IndexedDB 持久化由调用侧 handle 的 setter 投影 / saveSetting 与
 *    初始化新局checkpoint 编排，builder 不碰存储）；仅负责 fresh 侧内置剧情编织
 *    预设解析/对齐（失败降级 + devLogError）与 restart 侧同步对齐。
 *  - buildInitialWorkspace 是同步纯组装（无副作用、无 devLogError），所有
 *    React setter 投影与持久化由调用侧 handle 负责。
 *  - 私有 helper：buildFreshOpeningState / buildRestartOpeningState /
 *    createEmptyRuntimeSlices / normalizeWorkspace，全部 module 私有。
 *  - fresh/restart 差异只在「旅人/世界/openingArchive/storyWeaving 来源」一个分支点；
 *    其余运行时切片一律清空重建。device 级保留字段（智库/相册/macroGlobalVars/
 *    worldbookTriggerStates）原样透传并过一遍读档侧同一归一化函数收口。
 */
import type { 角色数据结构 } from '@/models/character';
import { 归一化旅人 } from '@/models/character';
import type { 世界状态, 开局档案 } from '@/models/world';
import {
  创建空世界状态,
  根据开局档案创建初始NPC记录,
  根据官方开局预设创建开局档案,
  根据起始场景创建开局档案,
  根据自由开局整理创建开局档案,
  生成开局已成立事实,
  归一化开局档案,
  归一化世界状态,
} from '@/models/world';
import type { NPC记录 } from '@/models/npc';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 创建空剧情编织系统 } from '@/models/storyWeaving';
import {
  alignStoryWeavingToOpeningArchive,
  loadAllBundledStoryWeavingPresets,
} from '@/data/storyWeavingPreset';
import { 创建空记忆系统 } from '@/models/memory';
import { 创建空忆庭系统, 归一化忆庭系统 } from '@/models/yiting';
import { 创建空手机系统, 归一化手机系统 } from '@/models/phone';
import { 归一化新闻列表 } from '@/models/news';
import { 归一化智库系统 } from '@/models/zhiku';
import { 归一化相册系统 } from '@/models/imageGeneration';
import type { 工作区字段集 } from '@/models/newestStory';
import { deriveOpeningDraftContext, type OpeningPresetDraft } from '@/models/opening';
import { 创建命途进度 } from '@/models/path';
import { 归一化战技记录 } from '@/models/skill';
import { devLogError } from '@/utils/devLog';

/** 新局第 0 回合开场触发器文案（fresh/restart 共用同一常量，读档侧按此恢复触发）。 */
const PENDING_OPENING_TRIGGER = '[系统] 开启第 0 回合';

export type CreateInitialWorkspaceInput =
  | { mode: 'fresh'; draft: OpeningPresetDraft; current: 工作区字段集 }
  | { mode: 'restart'; current: 工作区字段集 };

/** 完整工作区（所有字段必需）：builder 始终产出全字段，供 setter 投影与 checkpoint 直接消费。 */
export type 新局工作区字段集 = Required<工作区字段集>;

export interface CreateInitialWorkspaceResult {
  /** 完整工作区字段集：直接进 初始化新局checkpoint 与 React setter 投影（剧情编织在 workspace.剧情编织）。 */
  workspace: 新局工作区字段集;
}

/**
 * 新局初始化归一：唯一公开面（异步编排）。
 *  - fresh：旅人/世界/开局档案/NPC 全部从向导 draft 派生，剧情编织从内置预设加载并对齐开局档案；
 *  - restart：旅人保留静态创角字段（清空背包）、世界保留静态字段重置运行态、剧情编织对齐开局档案；
 *  - 两条路径共用同一套空运行时切片 + device 级保留 + 归一化收口（buildInitialWorkspace，纯同步组装）。
 */
export async function createInitialWorkspace(
  input: CreateInitialWorkspaceInput,
): Promise<CreateInitialWorkspaceResult> {
  const current = input.current;
  const pieces = input.mode === 'fresh'
    ? await resolveFreshPieces(input.draft, current)
    : resolveRestartPieces(current);
  return buildInitialWorkspace(pieces, current);
}

/**
 * 同步工作区组装（纯函数）：空运行时切片 + device 级保留 + 旅人/世界归一化收口。
 * 无副作用、不写日志，React setter 投影与持久化由调用侧 handle 负责。
 */
function buildInitialWorkspace(pieces: 新局组装件, current: 工作区字段集): CreateInitialWorkspaceResult {
  const workspace = normalizeWorkspace(pieces, current);
  return { workspace };
}

/** fresh 编排：内置剧情编织预设加载/对齐（与重构前 handlePrepareNewGame 一致，失败降级为当前剧情编织，仅记录诊断）。 */
async function resolveFreshPieces(draft: OpeningPresetDraft, current: 工作区字段集): Promise<新局组装件> {
  const base = buildFreshOpeningState(draft);
  let storyWeaving = current.剧情编织 ?? 创建空剧情编织系统();
  try {
    storyWeaving = alignStoryWeavingToOpeningArchive(
      await loadAllBundledStoryWeavingPresets(),
      base.openingArchive,
    );
  } catch (err) {
    devLogError('save', 'story-weaving-new-game-fallback', err, { entry: 'start' });
  }
  return { ...base, storyWeaving };
}

/** restart 编排：对当前剧情编织同步对齐开局档案（无内置预设解析，不涉及诊断降级）。 */
function resolveRestartPieces(current: 工作区字段集): 新局组装件 {
  const base = buildRestartOpeningState(current);
  const storyWeaving = alignStoryWeavingToOpeningArchive(
    current.剧情编织 ?? 创建空剧情编织系统(),
    base.openingArchive,
  );
  return { ...base, storyWeaving };
}

/** fresh 组装件：draft → 旅人/世界/开局档案/NPC（复制原 handlePrepareNewGame 的组装逻辑）。 */
function buildFreshOpeningState(draft: OpeningPresetDraft): Omit<新局组装件, 'storyWeaving'> {
  const {
    selectedPath,
    selectedPathStage,
    selectedFaction,
    selectedScenario,
    scenarioPreset,
    scenarioBundle,
    selectedOpeningDate,
    selectedOpeningTime,
    selectedOpeningLocation,
    selectedOpeningTitle,
    selectedAbilityNames,
    effectiveCustomStartPrompt,
    canonicalName,
    openingSummaryLines,
    freeOpeningInput,
  } = deriveOpeningDraftContext(draft);

  const startingPaths =
    draft.pathId !== 'none'
      ? [
          {
            ...创建命途进度(
              draft.pathId,
              true,
              selectedOpeningTitle,
              `开局承载 · 初始阶段：${selectedPathStage.name}`,
            ),
            阶段: draft.pathStage,
          },
        ]
      : [];
  const finalIdentity = draft.customIdentity.trim();
  const factionIdentity = selectedFaction.id === 'none' ? '' : selectedFaction.name;
  const displayIdentity = [factionIdentity, finalIdentity].filter(Boolean).join(' · ');

  const traveler: 角色数据结构 = {
    姓名: draft.name.trim() || '无名开拓者',
    别名: draft.alias.trim(),
    性别: draft.gender.trim(),
    年龄: draft.age,
    生日: draft.birthday.trim(),
    身高: '',
    身份: displayIdentity,
    外貌: draft.appearance.trim(),
    性格: draft.personality.trim(),
    背景: draft.background.trim(),
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
    主命途: draft.pathId,
    命途列表: startingPaths,
    能力: selectedAbilityNames,
    背包: [],
    战技列表: draft.openingSkills.map((skill) => 归一化战技记录({ ...skill, 已启用: skill.已启用 !== false })),
  };

  const worldState = 创建空世界状态();
  let resolvedOpeningLocation = selectedOpeningLocation;
  worldState.纪年法 = '琥珀纪年';
  worldState.开拓天数 = 1;
  worldState.当前日期 = selectedOpeningDate;
  worldState.当前时间 = selectedOpeningTime;
  worldState.当前地点 = resolvedOpeningLocation;
  worldState.剧情模式 = draft.storyMode;
  worldState.起航之地ID = scenarioPreset?.chapterId ?? scenarioBundle.chapter?.id ?? (draft.startingScenarioId || 'herta_station_incident');
  worldState.原著主角 = canonicalName;
  worldState.自定义开局 = effectiveCustomStartPrompt;
  if (draft.openingSource === 'official_preset') {
    worldState.开局档案 = scenarioPreset ? 根据官方开局预设创建开局档案(scenarioPreset, {
      ...worldState,
      自定义开局: effectiveCustomStartPrompt,
    }) : 根据起始场景创建开局档案(selectedScenario ?? {
      id: scenarioBundle.chapter?.id ?? draft.startingScenarioId,
      name: selectedOpeningTitle,
      description: scenarioBundle.chapter?.summary ?? '',
      openingHighlights: scenarioBundle.chapter?.openingPressure ?? [],
      officialPresetId: scenarioBundle.preset?.id,
    }, {
      ...worldState,
      自定义开局: effectiveCustomStartPrompt,
    });
  } else {
    worldState.开局档案 = 根据自由开局整理创建开局档案({
      ...freeOpeningInput,
      整理档案: draft.parsedArchive ?? undefined,
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
    pathSummary: selectedPath
      ? `${selectedPath.name}（${selectedPath.aeon}）｜初始阶段：${selectedPathStage.name}（${selectedPathStage.title}）`
      : undefined,
    extraFacts: [
      ...openingSummaryLines,
      ...(selectedScenario?.openingHighlights ?? []).map((text) => `场景要点：${text}`),
    ],
  });
  const npcRecords = 根据开局档案创建初始NPC记录(worldState.开局档案);

  return {
    旅人: traveler,
    世界: worldState,
    openingArchive: worldState.开局档案,
    npcRecords,
  };
}

/**
 * restart 组装件：保留创角静态字段，重置运行态（复制原 handleRestartOpening 的组装逻辑）。
 * 单点集中声明「保留 vs 清空」：worldState 在这里只重建开局档案对应的已成立事实，
 * 运行时累积切片（已访问时段/活跃人物/氛围变化）一律清空。
 */
function buildRestartOpeningState(current: 工作区字段集): Omit<新局组装件, 'storyWeaving'> {
  const openingArchive = 归一化开局档案(current.世界.开局档案, current.世界);
  const npcRecords = 根据开局档案创建初始NPC记录(openingArchive);

  // worldState：保留创角时的 currentPeriod / difficulty / storyMode / startingScenarioId / customStartPrompt。
  // 重新开局时必须重建开局档案对应的已成立事实，否则非黑塔/自由开局会只剩字段，缺少后续注入锚点。
  const prev = current.世界;
  const openingSummary = openingArchive.整理档案;
  const nextLocation =
    openingSummary?.初始地点参考?.trim()
    || prev.当前地点.trim()
    || openingArchive.地区名称;
  const nextDate = openingSummary?.初始日期参考?.trim() || prev.当前日期;
  const nextTime = openingSummary?.初始时间参考?.trim() || prev.当前时间 || '06:40';
  const worldState: 世界状态 = {
    ...prev,
    开局档案: openingArchive,
    起航之地ID: openingArchive.章节锚点ID || prev.起航之地ID,
    自定义开局: openingArchive.玩家介入原文 || prev.自定义开局,
    当前地点: nextLocation,
    已访问时段: [],
    纪年法: prev.纪年法 || '琥珀纪年',
    开拓天数: 1,
    当前日期: nextDate,
    当前时间: nextTime,
    全局事件: 生成开局已成立事实(openingArchive, {
      currentDate: nextDate,
      currentTime: nextTime,
      currentLocation: nextLocation,
      originalProtagonist: prev.原著主角,
    }),
    活跃人物: [],
    氛围变化: '',
  };

  return {
    // traveler：保留创角时的所有静态字段，把道具运行时累积重置回开局态
    旅人: { ...current.旅人, 背包: [] },
    世界: worldState,
    openingArchive,
    npcRecords,
  };
}

/** 空运行时切片：fresh/restart 共用的清空重建集合。手机/忆庭/新闻按读档侧同一归一化函数收口。 */
function createEmptyRuntimeSlices(): {
  chatHistory: 新局工作区字段集['chatHistory'];
  memory: 新局工作区字段集['记忆'];
  yiting: 新局工作区字段集['忆庭'];
  phone: 新局工作区字段集['手机'];
  news: 新局工作区字段集['新闻'];
  plot: 新局工作区字段集['剧情'];
  variableBatches: 新局工作区字段集['variableBatches'];
  queueTasks: 新局工作区字段集['queueTasks'];
} {
  return {
    chatHistory: [],
    memory: 创建空记忆系统(),
    yiting: 归一化忆庭系统(创建空忆庭系统()),
    phone: 归一化手机系统(创建空手机系统()),
    news: 归一化新闻列表([]),
    plot: [],
    variableBatches: [],
    queueTasks: [],
  };
}

/** 最终组装：空运行时切片 + device 级保留 + 旅人/世界归一化收口（对齐读档侧 saveLoadWorkflow）。 */
function normalizeWorkspace(pieces: 新局组装件, current: 工作区字段集): 新局工作区字段集 {
  const empty = createEmptyRuntimeSlices();
  return {
    旅人: 归一化旅人(pieces.旅人),
    世界: 归一化世界状态(pieces.世界),
    chatHistory: empty.chatHistory,
    记忆: empty.memory,
    忆庭: empty.yiting,
    智库: 归一化智库系统(current.智库),
    手机: empty.phone,
    NPC: pieces.npcRecords,
    相册: 归一化相册系统(current.相册),
    新闻: empty.news,
    剧情: empty.plot,
    剧情编织: pieces.storyWeaving,
    variableBatches: empty.variableBatches,
    queueTasks: empty.queueTasks,
    turnCount: 1,
    macroGlobalVars: current.macroGlobalVars ?? {},
    worldbookTriggerStates: current.worldbookTriggerStates ?? {},
    pendingOpeningTrigger: PENDING_OPENING_TRIGGER,
  };
}

interface 新局组装件 {
  旅人: 角色数据结构;
  世界: 世界状态;
  openingArchive: 开局档案;
  npcRecords: NPC记录[];
  storyWeaving: 剧情编织系统;
}
