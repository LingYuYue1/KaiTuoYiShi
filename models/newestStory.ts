/**
 * 片 5a-1 产出：newest 槽单记录 schema（纯类型 + 构造函数/归一化函数，不接任何调用方）。
 *
 * 设计依据（legacy_doc/slice5a-design.md「已裁决」）：
 *  - D1-A：newest 槽 = 字段级覆盖集——只存「自上个 checkpoint 以来被写过的字段及其当前值」，
 *    未写字段缺省 = 与 baseCheckpointId 指向的 checkpoint 一致。物理形态为新 objectStore
 *    `newestStory`（单记录固定 key，DB_VERSION +1，5a-2 建表）。
 *  - D2-A（经 T1 修正）：commitTurn 每回合必写，每回合**新增**一条 auto trace 节点
 *    （滚动 6 层、可从历史节点读档分支；非覆盖式单槽——同 id 覆盖方案已退役）；
 *    本记录在 commitTurn 成功后清空，baseCheckpointId 指向新 checkpoint。
 *  - D3：macroGlobalVars / worldbookTriggerStates 迁为 Story 顶层独立字段（5a-2 在 `存档数据`
 *    增顶层可选字段；本文件只定 newest 侧形状）。
 *
 * 字段集 = ideal_design.md §4 Story 平面清单（15 字段）+ D3 迁入 2 键 + pendingOpeningTrigger。
 * 每字段注释注明对应 UseGameStateReturn 切片与 `存档数据` 键名。
 *
 * 5a-2 接线预期（本文件不接线）：
 *  - 阶段边界写：mergeNewestStory(record, 本阶段覆盖字段)；
 *  - commitTurn：read newest → 以「checkpoint 基值 + record.story 逐字段覆盖」组装 auto 存档
 *    → 新增一条 auto 节点写入 saves（saveGame 正路：autoIncrement + delta 编码 + rotation）
 *    → 清空NewestStory记录(record, 新 checkpointId)；
 *  - 刷新（5b）：读 checkpoint + 回放 record.story。
 *
 * 类型依赖：仅 models/（本文件同目录相对导入）。hooks/useGame/turnTypes.ts 的 TurnDeltas
 * 属允许依赖，但本文件当前不需要——L4「回合写入字段集 == TurnDeltas 声明字段集」的映射
 * 见 legacy_doc/slice5a-1-schema-report.md c 节，5a-2 接线时若需要可在调用方侧引入。
 */
import type { 角色数据结构 } from './character';
import type { 聊天消息 } from './chat';
import type { 相册系统 } from './imageGeneration';
import type { 记忆系统 } from './memory';
import type { 新闻条目 } from './news';
import type { NPC记录 } from './npc';
import type { 手机系统 } from './phone';
import type { 剧情节点 } from './plot';
import type { 队列任务记录 } from './queueTask';
import type { 剧情编织系统 } from './storyWeaving';
import type { 变量命令批次 } from './variableCommand';
import type { 世界状态 } from './world';
import type { 忆庭系统 } from './yiting';
import type { 智库系统 } from './zhiku';

/**
 * newest 槽的覆盖写字段集：只存自上个 checkpoint 以来被写过的字段及其当前值。
 * 未写字段缺省 = 与 baseCheckpointId 指向的 checkpoint 一致（D1-A 字段级覆盖集，非条目级 diff；
 * 条目级由 5c 的 turnId 机制补充：`相册`、`chatHistory`、`手机.chats[].messages` 本片整体覆盖，
 * 5c 改条目级）。
 */
export interface NewestStory字段集 {
  /** 对应 UseGameStateReturn.旅人 / 存档数据.旅人。回合产出源：S7 travelerAfter、S8 variableOverrides.旅人。 */
  旅人: 角色数据结构;
  /** 对应 UseGameStateReturn.世界 / 存档数据.世界。回合产出源：S7 worldAfter、S8 variableOverrides.世界。 */
  世界: 世界状态;
  /** 对应 UseGameStateReturn.chatHistory / 存档数据.chatHistory。回合产出源：S5 finalHistory → S11 finalHistoryForSave（后者覆盖前者）。本片整体覆盖，5c 改 turnId 条目级。 */
  chatHistory: 聊天消息[];
  /** 对应 UseGameStateReturn.记忆 / 存档数据.记忆。回合产出源：S6 mem → S10 memoryAfterStoryProgress。 */
  记忆: 记忆系统;
  /** 对应 UseGameStateReturn.忆庭 / 存档数据.忆庭。回合产出源：S6 yitingWithCompression → S11 yitingAfterTurnRecall（后者覆盖前者）。 */
  忆庭: 忆庭系统;
  /** 对应 UseGameStateReturn.智库 / 存档数据.智库。回合产出源：S10 zhikuAfterRuntimeUnlock。 */
  智库: 智库系统;
  /** 对应 UseGameStateReturn.手机 / 存档数据.手机。回合产出源：S11 phoneAfterFallbackSeed。5c 起 chats[].messages 改 turnId 条目级。 */
  手机: 手机系统;
  /** 对应 UseGameStateReturn.NPC / 存档数据.NPC。回合产出源：S9 npcAfterCompression（S10 剧情记忆注入后写回）。 */
  NPC: NPC记录[];
  /** 对应 UseGameStateReturn.相册 / 存档数据.相册。回合产出源：背景任务 narrativeImageWorkflow 直写 state（不在 TurnDeltas 内，见报告题外发现 #1）。本片整体覆盖，5c 改 turnId 条目级。 */
  相册: 相册系统;
  /** 对应 UseGameStateReturn.新闻 / 存档数据.新闻。回合产出源：S8 variableOverrides.新闻、S11 newsAfterGeneration。 */
  新闻: 新闻条目[];
  /** 对应 UseGameStateReturn.剧情 / 存档数据.剧情。回合产出源：S8 variableOverrides.剧情。 */
  剧情: 剧情节点[];
  /** 对应 UseGameStateReturn.剧情编织 / 存档数据.剧情编织。回合产出源：S10 storyWeavingForSave。 */
  剧情编织: 剧情编织系统;
  /** 对应 UseGameStateReturn.variableBatches / 存档数据.variableBatches。回合产出源：S8 failedVariableBatch 追加 + compactVariableBatchHistory。 */
  variableBatches: 变量命令批次[];
  /** 对应 UseGameStateReturn.queueTasks / 存档数据.queueTasks。回合产出源：ctx.queueTasksMirror（展示部分，不在 TurnDeltas 内）。 */
  queueTasks: 队列任务记录[];
  /** 对应 UseGameStateReturn.turnCount / 存档数据.turnCount。回合产出源：turnCountAtStart + 1（管线计算，不在 TurnDeltas 内）。 */
  turnCount: number;
  /** D3 迁入顶层：对应 state.gameSettings.macroGlobalVars（5a-2 迁出后）/ 存档数据.macroGlobalVars?（5a-2 新增顶层可选字段）。回合产出源：S2 macroGlobalVarsAfterTurn。 */
  macroGlobalVars: Record<string, string>;
  /** D3 迁入顶层：对应 state.gameSettings.worldbookTriggerStates（5a-2 迁出后）/ 存档数据.worldbookTriggerStates?（5a-2 新增顶层可选字段）。回合产出源：S2 worldbookTriggerStatesAfterTurn。 */
  worldbookTriggerStates: Record<string, number>;
  /** 对应 UseGameStateReturn.pendingOpeningTrigger / 存档数据.pendingOpeningTrigger?（5a-2 新增顶层可选字段）。回合管线不产出；由 E-1 新局边界（handleStartGame / handleRestartOpening）写入。 */
  pendingOpeningTrigger: string | null;
}

/** newestStory store 的固定记录 key（store keyPath: 'key'，5a-2 upgrade 建表）。 */
export const NEWEST_STORY_STORE_KEY = 'newest';

/**
 * newest 槽单记录。字段级覆盖集（D1-A）：story 只含自上个 checkpoint 以来被写过的字段，
 * 未写字段缺省 = 与 baseCheckpointId 指向的 checkpoint 一致。
 */
export interface NewestStory记录 {
  /** 固定 key（单记录）。 */
  key: typeof NEWEST_STORY_STORE_KEY;
  /** 过渡字段；@deprecated: 5b2-2 废弃。上个 checkpoint 的 saves id；null = 尚无 checkpoint。 */
  baseCheckpointId: number | null;
  /** 当前未封版 head 的 saveTree.nodeId；null = 尚未建立或旧记录无法回填。 */
  headNodeId: string | null;
  /**
   * 片 5d-1 新增（v9）：分叉新叶子时标记分叉来源/新标签。节点二分类语义里
   * 「叶子 = 可写工作区身份」由 base/head 承担，branchName 只是该叶子身份的分支标签。
   * 无分叉 = undefined；重定向/归零时清空。
   */
  branchName?: string;
  /** 最近一次写入时间戳（ms）。 */
  updatedAt: number;
  /** 过渡字段；@deprecated: 5b2-2 废弃。覆盖写字段（当前值）。 */
  story: Partial<NewestStory字段集>;
}

/** 空记录：base 未知、无覆盖字段。用于新局起点与归一化兜底。 */
export function 创建空NewestStory记录(): NewestStory记录 {
  return {
    key: NEWEST_STORY_STORE_KEY,
    baseCheckpointId: null,
    headNodeId: null,
    updatedAt: Date.now(),
    story: {},
  };
}

/**
 * 写入时合并（D1-A 建议的 mergeNewestStory）：以 patch 整体覆盖对应字段（写时覆盖，不做字段内 diff）。
 * 供 5a-2 阶段边界写入调用；调用方负责把 TurnDeltas 字段映射为 NewestStory字段集（映射见报告 c 节）。
 */
export function mergeNewestStory(
  record: NewestStory记录,
  patch: Partial<NewestStory字段集>,
): NewestStory记录 {
  const currentStory = (record as { story: Partial<NewestStory字段集> }).story;
  return {
    ...record,
    updatedAt: Date.now(),
    story: {
      ...currentStory,
      ...patch,
    },
  };
}

/**
 * commitTurn 成功后清空 newest：base 指向新 checkpoint，覆盖字段归零（D2-A「newest 清空」）。
 * 5a-2 在 checkpoint 落盘成功后调用。
 */
export function 清空NewestStory记录(record: NewestStory记录, baseCheckpointId: number): NewestStory记录 {
  return {
    ...record,
    baseCheckpointId,
    updatedAt: Date.now(),
    story: {},
  };
}

/**
 * 片 5d-1 分叉 API 的 newest 侧效果：从任意检查点分叉新叶子。
 * base 指向分叉目标 checkpoint、head 分配新叶子身份（新 unified id）、覆盖集清空、
 * branchName 标记分叉来源/新标签。保持与 commitTurn 晋升链兼容——下一回合晋升时
 * 以 base 为前驱生成新 auto 节点。
 */
export function 分叉NewestStory记录(
  record: NewestStory记录,
  params: { baseCheckpointId: number; headNodeId: string; branchName?: string },
): NewestStory记录 {
  const { branchName: _oldBranchName, ...rest } = record;
  void _oldBranchName;
  const branchName = typeof params.branchName === 'string' && params.branchName.trim()
    ? params.branchName.trim()
    : undefined;
  return {
    ...rest,
    baseCheckpointId: params.baseCheckpointId,
    headNodeId: params.headNodeId,
    ...(branchName ? { branchName } : {}),
    updatedAt: Date.now(),
    story: {},
  };
}

/**
 * 片 5d-1 节点删除后的 newest 重定向：当前叶子被删后，把工作区身份改指向最近存活祖先。
 * 覆盖集清空（删除即重置工作区），branchName 清空（新身份不再是原分叉标签）。
 * baseCheckpointId/headNodeId 为 null 时调用方应改用 创建空NewestStory记录。
 */
export function 重定向NewestStory记录(
  record: NewestStory记录,
  params: { baseCheckpointId: number; headNodeId: string },
): NewestStory记录 {
  const { branchName: _branchName, ...rest } = record;
  void _branchName;
  return {
    ...rest,
    baseCheckpointId: params.baseCheckpointId,
    headNodeId: params.headNodeId,
    updatedAt: Date.now(),
    story: {},
  };
}

function 是普通对象(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 各覆盖字段的形状校验。只做结构容错（字段级兜底），不做领域模型深归一化——
 * 深归一化在读取/合并边界（5a-2 的 applySaveToState 路径）进行，符合戒律 13
 * （归一化在 load 时做，不在 commit 出口做）。形状不合法的字段直接丢弃：
 * 该字段缺省 = 与 checkpoint 一致，是撕裂半成品的最安全退化。
 */
function 归一化覆盖字段(rawStory: Record<string, unknown>): Partial<NewestStory字段集> {
  const story: Partial<NewestStory字段集> = {};
  if (取合法值(rawStory, '旅人', 是普通对象)) story.旅人 = rawStory.旅人 as 角色数据结构;
  if (取合法值(rawStory, '世界', 是普通对象)) story.世界 = rawStory.世界 as 世界状态;
  if (取合法值(rawStory, 'chatHistory', Array.isArray)) story.chatHistory = rawStory.chatHistory as 聊天消息[];
  if (取合法值(rawStory, '记忆', 是普通对象)) story.记忆 = rawStory.记忆 as 记忆系统;
  if (取合法值(rawStory, '忆庭', 是普通对象)) story.忆庭 = rawStory.忆庭 as 忆庭系统;
  if (取合法值(rawStory, '智库', 是普通对象)) story.智库 = rawStory.智库 as 智库系统;
  if (取合法值(rawStory, '手机', 是普通对象)) story.手机 = rawStory.手机 as 手机系统;
  if (取合法值(rawStory, 'NPC', Array.isArray)) story.NPC = rawStory.NPC as NPC记录[];
  if (取合法值(rawStory, '相册', 是普通对象)) story.相册 = rawStory.相册 as 相册系统;
  if (取合法值(rawStory, '新闻', Array.isArray)) story.新闻 = rawStory.新闻 as 新闻条目[];
  if (取合法值(rawStory, '剧情', Array.isArray)) story.剧情 = rawStory.剧情 as 剧情节点[];
  if (取合法值(rawStory, '剧情编织', 是普通对象)) story.剧情编织 = rawStory.剧情编织 as 剧情编织系统;
  if (取合法值(rawStory, 'variableBatches', Array.isArray)) story.variableBatches = rawStory.variableBatches as 变量命令批次[];
  if (取合法值(rawStory, 'queueTasks', Array.isArray)) story.queueTasks = rawStory.queueTasks as 队列任务记录[];
  if (取合法值(rawStory, 'turnCount', 是有限数字)) story.turnCount = rawStory.turnCount as number;
  if (取合法值(rawStory, 'macroGlobalVars', 是普通对象)) story.macroGlobalVars = rawStory.macroGlobalVars as Record<string, string>;
  if (取合法值(rawStory, 'worldbookTriggerStates', 是普通对象)) story.worldbookTriggerStates = rawStory.worldbookTriggerStates as Record<string, number>;
  if (取合法值(rawStory, 'pendingOpeningTrigger', 是空串或null)) story.pendingOpeningTrigger = rawStory.pendingOpeningTrigger as string | null;
  return story;
}

function 取合法值(
  rawStory: Record<string, unknown>,
  key: keyof NewestStory字段集,
  check: (value: unknown) => boolean,
): boolean {
  const value = rawStory[key];
  return value !== undefined && check(value);
}

function 是有限数字(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function 是空串或null(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

/**
 * 容忍旧数据/半成品（全仓惯例，仿 models/settings.ts 各归一化函数）：
 *  - 非对象 / null / 数组 → 空记录；
 *  - 未知 key 丢弃，已知 key 形状不合法则丢弃该字段（缺省 = 与 checkpoint 一致）；
 *  - baseCheckpointId 非正数 / 非有限数 → null（尚无 checkpoint）；
 *  - headNodeId 非空字符串 → 去首尾空白后保留；其他值 → null；
 *  - branchName 非空字符串 → 去首尾空白后保留；其他值 → undefined（无分叉标签）；
 *  - updatedAt 非法 → 当前时间。
 */
export function 归一化NewestStory记录(input?: unknown): NewestStory记录 {
  const raw = 是普通对象(input) ? (input as Record<string, unknown>) : null;
  if (!raw) return 创建空NewestStory记录();
  const baseCheckpointId = raw.baseCheckpointId;
  const headNodeId = raw.headNodeId;
  const branchName = raw.branchName;
  const rawStory = 是普通对象(raw.story) ? (raw.story as Record<string, unknown>) : {};
  const normalizedBranchName = typeof branchName === 'string' && branchName.trim()
    ? branchName.trim()
    : undefined;
  return {
    key: NEWEST_STORY_STORE_KEY,
    baseCheckpointId:
      typeof baseCheckpointId === 'number' && Number.isFinite(baseCheckpointId) && baseCheckpointId > 0
        ? baseCheckpointId
        : null,
    headNodeId: typeof headNodeId === 'string' && headNodeId.trim() ? headNodeId.trim() : null,
    ...(normalizedBranchName ? { branchName: normalizedBranchName } : {}),
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : Date.now(),
    story: 归一化覆盖字段(rawStory),
  };
}
