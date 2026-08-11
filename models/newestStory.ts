/**
 * 子任务 A 产出：newest 退化为全局指针（单记录，只存 headNodeId）。
 *
 * 设计依据（ideal_design.md「回合闭环机制」「指针退化」）：
 *  - newest = 全局 ref 指针，指向当前活跃叶子（工作区）的 saveTree.nodeId。
 *  - 叶子节点物理存储在存档树 saves 表（saveRuntime.unsealedHead），持有完整领域状态快照；
 *    newest 不再携带任何数据（不再有 baseCheckpointId / story 覆盖集 / branchName）。
 *  - 读叶子 = 水合（bootRestoreFromNewest / loadActiveLeaf）；读检查点 = 分叉新叶子。
 *  - 旧格式记录（含 baseCheckpointId / story / branchName）由 dbService MIGRATIONS
 *    v10「newest-head-only」物化到对应叶子后清除；归一化对残留旧键直接忽略。
 *
 * 类型依赖：仅 models/（存档数据）。hooks/useGame/turnTypes.ts 属允许依赖，但本文件不需要。
 */
import type { 存档数据 } from './settings';

/**
 * 工作区（叶子）可写字段集 = 领域状态平面。newest 指针指向的叶子携带这些字段，
 * 检查点（封版）为其子集（queueTasks 等仅限活跃叶子的字段在封版时剥离）。
 * 替代旧「NewestStory字段集」——字段集合本身不变，只是不再作为覆盖集存储。
 */
export type 工作区字段集 = Pick<
  存档数据,
  | '旅人'
  | '世界'
  | 'chatHistory'
  | '记忆'
  | '忆庭'
  | '智库'
  | '手机'
  | 'NPC'
  | '相册'
  | '新闻'
  | '剧情'
  | '剧情编织'
  | 'variableBatches'
  | 'queueTasks'
  | 'turnCount'
  | 'macroGlobalVars'
  | 'worldbookTriggerStates'
  | 'pendingOpeningTrigger'
>;

/** newestStory store 的固定记录 key（store keyPath: 'key'）。 */
export const NEWEST_STORY_STORE_KEY = 'newest';

/**
 * newest 槽单记录 = 全局指针。唯一合法字段为 headNodeId（当前活跃叶子节点 id），
 * 不存任何数据；null = 尚无工作区（新局未建 / 整树删除后归零）。
 */
export interface NewestStory记录 {
  /** 固定 key（单记录）。 */
  key: typeof NEWEST_STORY_STORE_KEY;
  /** 当前活跃叶子（工作区）的 saveTree.nodeId；null = 尚未建立工作区。 */
  headNodeId: string | null;
  /** 最近一次写入时间戳（ms）。 */
  updatedAt: number;
}

/** 空记录：无工作区。用于新局起点与归一化兜底。 */
export function 创建空NewestStory记录(): NewestStory记录 {
  return {
    key: NEWEST_STORY_STORE_KEY,
    headNodeId: null,
    updatedAt: Date.now(),
  };
}

/**
 * 指针重定向：把 headNodeId 改为新值并刷新时间戳。
 * 调用方：commitTurn（晋升后指向新叶子）、分叉（指向新分叉叶子）、删除重定向（指向最近存活祖先 / null）。
 */
export function 指向NewestStory记录(
  record: NewestStory记录,
  headNodeId: string | null,
): NewestStory记录 {
  return {
    ...record,
    headNodeId,
    updatedAt: Date.now(),
  };
}

function 是普通对象(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 容忍旧数据/半成品（全仓惯例）：
 *  - 非对象 / null / 数组 → 空记录；
 *  - headNodeId 非空字符串 → 去首尾空白后保留；其他值 → null；
 *  - updatedAt 非法 → 当前时间；
 *  - 旧格式键（baseCheckpointId / story / branchName）不读取——由 MIGRATIONS v10 物化后清除，
 *    残留旧键在此被忽略（幂等兜底，不触发任何领域写入）。
 */
export function 归一化NewestStory记录(input?: unknown): NewestStory记录 {
  const raw = 是普通对象(input) ? (input as Record<string, unknown>) : null;
  if (!raw) return 创建空NewestStory记录();
  const headNodeId = raw.headNodeId;
  return {
    key: NEWEST_STORY_STORE_KEY,
    headNodeId: typeof headNodeId === 'string' && headNodeId.trim() ? headNodeId.trim() : null,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : Date.now(),
  };
}
