// 变量命令执行器：把通过校验的命令落地到 state setter。
// 输入一个命令 + 当前精简 state + setters 集合，执行后返回结果。
//
// 设计：每个命令都独立调用对应 setter。多条命令按顺序执行；前一条不会影响下一条的校验（因为校验是用旧 state 做的，由 sendWorkflow 决定是否每条都重校验）。

import type { 变量命令, 变量命令结果, 变量批次诊断 } from '@/models/variableCommand';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import { 对齐世界日期与天数, 解析琥珀日期序数, 从当前地点推断区域ID } from '@/models/world';
import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';
import { 归一化智库系统 } from '@/models/zhiku';
import type { 手机系统 } from '@/models/phone';
import { 归一化手机系统 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import { 创建NPC记录, 归一化NPC记录列表 } from '@/models/npc';
import { matchCanonical } from '@/data/canonicalCharacters';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import type { 命途ID } from '@/models/journey';
import { 推进命途进度 } from '@/services/pathService';
import { 获取物品, type 获取物品输入 } from './inventoryActions';
import type { 背包物品, 物品分类, 物品品质 } from '@/models/inventory';
import { 应用路径命令, 解析路径片段, 读取路径值 } from './variablePath';
import { canonicalizeJsonValue, JsonValueError } from './jsonValue';
import { extractRoot, validateCommand, type VariableRootKey, type VariableState } from './variableRegistry';
import { appendWorldEvents } from './worldEvents';

/** 执行器需要的 setters 集合（与 useGameState 对齐）。 */
export interface VariableSetters {
  set旅人: React.Dispatch<React.SetStateAction<角色数据结构>>;
  set世界: React.Dispatch<React.SetStateAction<世界状态>>;
  set记忆: React.Dispatch<React.SetStateAction<记忆系统>>;
  set忆庭: React.Dispatch<React.SetStateAction<忆庭系统>>;
  set智库: React.Dispatch<React.SetStateAction<智库系统>>;
  set手机: React.Dispatch<React.SetStateAction<手机系统>>;
  setNPC: React.Dispatch<React.SetStateAction<NPC记录[]>>;
  set新闻: React.Dispatch<React.SetStateAction<新闻条目[]>>;
  set剧情: React.Dispatch<React.SetStateAction<剧情节点[]>>;
}

export const VARIABLE_WRITABLE_ROOT_KEYS = ['旅人', '世界', '手机', 'NPC'] as const;
export type VariableWritableRootKey = typeof VARIABLE_WRITABLE_ROOT_KEYS[number];

export interface VariableWritableSetters {
  set旅人: React.Dispatch<React.SetStateAction<角色数据结构>>;
  set世界: React.Dispatch<React.SetStateAction<世界状态>>;
  set手机: React.Dispatch<React.SetStateAction<手机系统>>;
  setNPC: React.Dispatch<React.SetStateAction<NPC记录[]>>;
}

/** 多 root setter 无法提供真正跨 React root 的事务，这个错误保留已提交/失败边界供调用方诊断。 */
export class VariableCommitError extends Error {
  readonly committedRoots: VariableRootKey[];
  readonly failedRoot?: VariableRootKey;

  constructor(message: string, committedRoots: VariableRootKey[], failedRoot?: VariableRootKey) {
    super(message);
    this.name = 'VariableCommitError';
    this.committedRoots = committedRoots;
    this.failedRoot = failedRoot;
  }
}

/** 把当前 state 拍扁成 VariableState（执行器/校验用）。 */
export function snapshotVariableState(slices: {
  旅人: 角色数据结构;
  世界: 世界状态;
  记忆: 记忆系统;
  忆庭: 忆庭系统;
  智库: 智库系统;
  手机: 手机系统;
  NPC: NPC记录[];
  新闻: 新闻条目[];
  剧情: 剧情节点[];
}): VariableState {
  return {
    旅人: slices.旅人,
    世界: slices.世界,
    记忆: slices.记忆,
    忆庭: slices.忆庭,
    智库: slices.智库,
    手机: slices.手机,
    NPC: slices.NPC,
    新闻: slices.新闻,
    剧情: slices.剧情,
  };
}

/** 单条命令执行：先校验 → 在 setter 内部用 functional updater 计算新值。 */
export function applyVariableCommand(
  cmd: 变量命令,
  state: VariableState,
  setters: VariableSetters,
): 变量命令结果 {
  const reduced = reduceVariableCommands([cmd], state);
  const result = reduced.results[0];
  if (!result) {
    return {
      command: cmd,
      ok: false,
      kind: 'error',
      reason: reduced.diagnostics[0]?.message ?? '变量命令没有生成执行结果',
    };
  }
  if (!result.ok) return result;
  try {
    commitVariableState(reduced.nextState, state, setters);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ...result, ok: false, kind: 'error', reason: `变量批次提交失败：${reason}` };
  }
}

/** 批量执行：依次跑每条命令，收集每条的结果。 */
export function applyVariableCommands(
  commands: 变量命令[],
  state: VariableState,
  setters: VariableSetters,
): 变量命令结果[] {
  return applyVariableCommandsDetailed(commands, state, setters).results;
}

export interface VariableApplyBatchResult {
  results: 变量命令结果[];
  diagnostics: 变量批次诊断[];
}

/** 兼容批量入口的详细版本：保留旧的 results[] 返回，同时暴露批次级提交诊断。 */
export function applyVariableCommandsDetailed(
  commands: 变量命令[],
  state: VariableState,
  setters: VariableSetters,
): VariableApplyBatchResult {
  const reduced = reduceVariableCommands(commands, state);
  if (!reduced.results.some((result) => result.ok)) return reduced;
  try {
    commitVariableState(reduced.nextState, state, setters);
    return reduced;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const commitError = error instanceof VariableCommitError ? error : undefined;
    return {
      results: reduced.results.map((result) => result.ok
        ? { ...result, ok: false, kind: 'error', stage: 'commit', reason: `变量批次提交失败：${reason}` }
        : result),
      diagnostics: [
        ...reduced.diagnostics,
        {
          code: commitError?.committedRoots.length ? 'VARIABLE_COMMIT_PARTIAL' : 'VARIABLE_COMMIT_FAILED',
          severity: 'error',
          stage: 'commit',
          message: `变量批次提交失败：${reason}`,
          ...(commitError?.failedRoot ? { root: commitError.failedRoot } : {}),
        },
      ],
    };
  }
}

/** 把 VariableState 拆回 8 个具名切片，方便组件/工作流消费。 */
export function unpackVariableState(state: VariableState) {
  return {
    旅人: state.旅人 as 角色数据结构,
    世界: state.世界 as 世界状态,
    记忆: state.记忆 as 记忆系统,
    忆庭: state.忆庭 as 忆庭系统,
    智库: state.智库 as 智库系统,
    手机: state.手机 as 手机系统,
    NPC: state.NPC as NPC记录[],
    新闻: state.新闻 as 新闻条目[],
    剧情: state.剧情 as 剧情节点[],
  };
}

/** 纯函数批处理：在内存里累计推进 state，不接 setter。
 *  返回最终的新 state 与每条命令的结果（含失败原因）。
 *  适合 sendWorkflow —— 一次性算完，再用 setters 一次性提交，避免连续 setState 的中间状态。 */
interface ReducerFactGroup {
  id: string;
  order: number;
  commands: Array<{ command: 变量命令; index: number }>;
  dependencies: Set<string>;
}

type ReducerFactGroupStatus = 'succeeded' | 'failed' | 'blocked';

export function reduceVariableCommands(
  commands: 变量命令[],
  initialState: VariableState,
): { results: 变量命令结果[]; nextState: VariableState; diagnostics: 变量批次诊断[] } {
  let cursor = { ...initialState };
  const normalizedCommands = commands.map(规范化世界时间命令);
  const resultByIndex = new Map<number, 变量命令结果>();
  const diagnostics: 变量批次诊断[] = [];
  const groups = new Map<string, ReducerFactGroup>();
  normalizedCommands.forEach((command, index) => {
    const id = command.factGroupId?.trim() || `command_${index}`;
    const existing = groups.get(id);
    if (existing) {
      existing.commands.push({ command, index });
      for (const dependency of command.dependsOnFactGroupIds ?? []) {
        if (dependency && dependency !== id) existing.dependencies.add(dependency);
      }
      return;
    }
    groups.set(id, {
      id,
      order: index,
      commands: [{ command, index }],
      dependencies: new Set((command.dependsOnFactGroupIds ?? []).filter((dependency) => dependency && dependency !== id)),
    });
  });
  const statuses = new Map<string, ReducerFactGroupStatus>();
  const committedCommands: 变量命令[] = [];

  const markGroupBlocked = (group: ReducerFactGroup, reason: string) => {
    statuses.set(group.id, 'blocked');
    for (const entry of group.commands) {
      resultByIndex.set(entry.index, {
        command: entry.command,
        ok: false,
        kind: 'rejected',
        reason,
      });
    }
  };

  const processGroup = (group: ReducerFactGroup) => {
    const groupBaseline = cursor;
    const groupResults: Array<{ entry: { command: 变量命令; index: number }; result: 变量命令结果 }> = [];
    const groupCommands: 变量命令[] = [];
    let groupFailureReason: string | undefined;
    const record = (entry: { command: 变量命令; index: number }, result: 变量命令结果) => {
      groupResults.push({ entry, result });
    };

    for (const entry of group.commands) {
      const cmd = entry.command;
      try {
        const parsedRoot = extractRoot(cmd.key);
        const backpackQuantityChange = parsedRoot?.root === '旅人'
          ? 应用背包数量扣减命令(cursor.旅人 as 角色数据结构, parsedRoot.rest, cmd)
          : { matched: false };
        let validation = validateCommand(cmd, cursor);
        if (!validation.allowed) {
          // 这是兼容动作：先完成路径形状识别，缺物品时允许安全 no-op，
          // 但不在通用校验前写入任何 state。
          if (backpackQuantityChange.matched) {
            if (backpackQuantityChange.nextTraveler) {
              cursor = { ...cursor, 旅人: backpackQuantityChange.nextTraveler };
              groupCommands.push(cmd);
            }
            record(entry, { command: cmd, ok: true, kind: 'warning', reason: backpackQuantityChange.reason });
            continue;
          }
          record(entry, { command: cmd, ok: false, kind: 'error', reason: validation.reason });
          groupFailureReason = validation.reason ?? '命令校验失败';
          break;
        }
        let { root, rest } = validation;
        if (!root || rest === undefined) {
          const reason = '内部错误：校验通过但未提取到根路径';
          record(entry, { command: cmd, ok: false, kind: 'error', reason });
          groupFailureReason = reason;
          break;
        }

        // canonical NPC 只允许在命令已通过路径/字段 preflight 后进入 projection。
        if (root === 'NPC' && cmd.action !== 'delete') {
          const ensuredNpc = 确保NPC目标存在(cursor.NPC as NPC记录[], rest, cmd);
          if (ensuredNpc) {
            const candidateState = { ...cursor, NPC: ensuredNpc };
            const ensuredValidation = validateCommand(cmd, candidateState);
            if (!ensuredValidation.allowed) {
              const reason = ensuredValidation.reason ?? 'canonical NPC 目标二次校验失败';
              record(entry, { command: cmd, ok: false, kind: 'error', reason });
              groupFailureReason = reason;
              break;
            }
            cursor = candidateState;
            validation = ensuredValidation;
            root = validation.root;
            rest = validation.rest;
          }
        }

        if (!root || rest === undefined) {
          const reason = '内部错误：二次校验通过但未提取到根路径';
          record(entry, { command: cmd, ok: false, kind: 'error', reason });
          groupFailureReason = reason;
          break;
        }
        if (rest.length === 0 && cmd.action === 'delete') {
          const reason = '禁止 delete 根路径';
          record(entry, { command: cmd, ok: false, kind: 'error', reason });
          groupFailureReason = reason;
          break;
        }

        if (backpackQuantityChange.matched) {
          if (backpackQuantityChange.nextTraveler) {
            cursor = { ...cursor, 旅人: backpackQuantityChange.nextTraveler };
            groupCommands.push(cmd);
          }
          record(entry, { command: cmd, ok: true, kind: 'warning', reason: backpackQuantityChange.reason });
          continue;
        }

        if (root === '世界') {
          const timeFormatReason = 校验世界时间格式(cmd, rest);
          if (timeFormatReason) {
            record(entry, { command: cmd, ok: false, kind: 'error', reason: timeFormatReason });
            groupFailureReason = timeFormatReason;
            break;
          }
        }

        if (root === '旅人' && rest === '背包' && cmd.action === 'push' && !解析获取物品输入(cmd.value)) {
          if (isPlaceholderBackpackObject(cmd.value)) {
            record(entry, { command: cmd, ok: true, kind: 'warning', reason: '已忽略背包占位符命令' });
            continue;
          }
          const reason = '背包 push 值格式错误：请提供完整的物品对象';
          record(entry, { command: cmd, ok: false, kind: 'error', reason });
          groupFailureReason = reason;
          break;
        }

        // 背包专用通道:push 旅人.背包 → 走 获取物品(),自动堆叠同名可堆叠物品
        if (root === '旅人' && cmd.action === 'push' && rest === '背包') {
          const 旅人 = cursor['旅人'] as 角色数据结构;
          const parsed = 解析获取物品输入(cmd.value);
          if (parsed) {
            const res = 获取物品(旅人, parsed, { 获得回合: 0 });
            cursor = { ...cursor, 旅人: res.traveler };
            groupCommands.push(cmd);
            record(entry, { command: cmd, ok: true, kind: 'command', reason: res.message });
            continue;
          }
        }

        // 命途进度专用通道:走 24h cap + 满进度 待升阶
        if (root === '旅人' && (cmd.action === 'add' || cmd.action === 'sub' || cmd.action === 'set')) {
          const 旅人 = cursor['旅人'] as 角色数据结构;
          const pathId = 解析命途进度命令(rest, 旅人);
          if (pathId) {
            let delta: number;
            if (cmd.action === 'add') {
              delta = Number(cmd.value) || 0;
            } else if (cmd.action === 'sub') {
              delta = -(Number(cmd.value) || 0);
            } else {
              // set:用差值
              const current = 读取路径值(旅人, rest);
              const oldVal = Number(current.value) || 0;
              delta = (Number(cmd.value) || 0) - oldVal;
            }
            const 世界 = cursor['世界'] as 世界状态;
            const currentDate = 世界?.当前日期 ?? 世界?.当前时间 ?? '';
            const res = 推进命途进度(旅人, pathId, delta, currentDate);
            cursor = { ...cursor, 旅人: res.traveler };
            groupCommands.push(cmd);
            record(entry, {
              command: cmd,
              ok: true,
              kind: 'command',
              reason: res.message,
            });
            continue;
          }
        }

        if (root === '世界' && rest === '全局事件' && cmd.action === 'push') {
          const world = cursor.世界 as 世界状态;
          cursor = {
            ...cursor,
            世界: {
              ...world,
              全局事件: appendWorldEvents(world.全局事件 ?? [], [cmd.value]),
            },
          };
          groupCommands.push(cmd);
          record(entry, { command: cmd, ok: true, kind: 'command' });
          continue;
        }

        // 手机联系人去重：push 前检查是否已有同名/同 id 联系人
        if (root === '手机' && rest === 'contacts' && cmd.action === 'push') {
          const phone = cursor.手机 as import('@/models/phone').手机系统 | undefined;
          const incoming = cmd.value as Record<string, unknown> | undefined;
          if (phone?.contacts && incoming) {
            const incomingId = typeof incoming.id === 'string' ? incoming.id : '';
            const incomingName = typeof incoming.name === 'string' ? incoming.name : '';
            const duplicate = phone.contacts.some((c) =>
              (incomingId && c.id === incomingId) ||
              (incomingName && c.name === incomingName),
            );
            if (duplicate) {
              record(entry, { command: cmd, ok: true, kind: 'warning', reason: `联系人 ${incomingName || incomingId} 已存在，跳过重复添加` });
              continue;
            }
          }
        }

        const applied = 应用路径命令(cursor[root], rest, cmd.action, cmd.value);
        if (!applied.ok) {
          const reason = applied.reason ?? '应用失败';
          record(entry, { command: cmd, ok: false, kind: 'error', reason });
          groupFailureReason = reason;
          break;
        }
        cursor = { ...cursor, [root]: applied.nextRootValue };
        groupCommands.push(cmd);
        record(entry, { command: cmd, ok: true, kind: 'command' });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        record(entry, { command: cmd, ok: false, kind: 'error', reason: `命令执行异常：${reason}` });
        groupFailureReason = `命令执行异常：${reason}`;
        break;
      }
    }

    const recordedIndexes = new Set(groupResults.map(({ entry }) => entry.index));
    if (groupFailureReason) {
      cursor = groupBaseline;
      const rollbackReason = `事实组 ${group.id} 已回滚：${groupFailureReason}`;
      for (const entry of group.commands) {
        if (!recordedIndexes.has(entry.index)) {
          groupResults.push({
            entry,
            result: { command: entry.command, ok: false, kind: 'rejected', reason: rollbackReason },
          });
        }
      }
      for (const { entry, result } of groupResults) {
        resultByIndex.set(entry.index, result.ok
          ? { ...result, ok: false, kind: 'rejected', reason: rollbackReason }
          : result);
      }
      statuses.set(group.id, 'failed');
      return;
    }

    for (const entry of group.commands) {
      if (!recordedIndexes.has(entry.index)) {
        const reason = '内部错误：事实组命令没有生成执行结果';
        groupResults.push({ entry, result: { command: entry.command, ok: false, kind: 'error', reason } });
        groupFailureReason = reason;
      }
    }
    if (groupFailureReason) {
      cursor = groupBaseline;
      const rollbackReason = `事实组 ${group.id} 已回滚：${groupFailureReason}`;
      for (const { entry, result } of groupResults) {
        resultByIndex.set(entry.index, result.ok
          ? { ...result, ok: false, kind: 'rejected', reason: rollbackReason }
          : result);
      }
      statuses.set(group.id, 'failed');
      return;
    }

    for (const { entry, result } of groupResults) resultByIndex.set(entry.index, result);
    committedCommands.push(...groupCommands);
    statuses.set(group.id, 'succeeded');
  };

  const pending = [...groups.values()].sort((left, right) => left.order - right.order);
  while (pending.length) {
    const readyIndex = pending.findIndex((group) =>
      [...group.dependencies].some((dependency) => !groups.has(dependency)) ||
      [...group.dependencies].every((dependency) => !pending.some((candidate) => candidate.id === dependency)),
    );
    if (readyIndex < 0) {
      for (const group of pending.splice(0)) {
        markGroupBlocked(group, `事实组 ${group.id} 因依赖循环而拒绝，未读取任何半成品状态。`);
        diagnostics.push({
          code: 'FACT_GROUP_DEPENDENCY_CYCLE',
          severity: 'error',
          stage: 'reduce',
          message: `事实组 ${group.id} 依赖循环`,
          factGroupId: group.id,
        });
      }
      break;
    }

    const group = pending.splice(readyIndex, 1)[0];
    const failedDependency = [...group.dependencies].find((dependency) =>
      !groups.has(dependency) || statuses.get(dependency) !== 'succeeded',
    );
    if (failedDependency) {
      markGroupBlocked(group, `事实组 ${group.id} 依赖事实组 ${failedDependency} 失败或不存在，已拒绝执行。`);
      continue;
    }
    processGroup(group);
  }

  try {
    const npcTouched = committedCommands.some((command) => extractRoot(command.key)?.root === 'NPC');
    cursor = 归一化变量世界状态(cursor);
    cursor = 同步变量世界区域(cursor, committedCommands);
    cursor = 去重NPC记录(cursor, npcTouched);
    cursor = 归一化已变更变量根(cursor, initialState, committedCommands);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const diagnostic = `批次末尾归一化失败：${reason}`;
    diagnostics.push({
      code: 'VARIABLE_BATCH_NORMALIZATION_FAILED',
      severity: 'error',
      stage: 'reduce',
      message: diagnostic,
    });
    cursor = { ...initialState };
    for (const [index, result] of resultByIndex) {
      if (result.ok) resultByIndex.set(index, { ...result, ok: false, kind: 'error', stage: 'reduce', reason: diagnostic });
    }
  }

  const results = normalizedCommands
    .map((_, index) => resultByIndex.get(index))
    .filter((result): result is 变量命令结果 => Boolean(result));
  return { results, nextState: cursor, diagnostics };
}

/** 领域归一化可能为 optional 字段显式写入 undefined；只在变更 root 的最终边界清理。 */
function 归一化已变更变量根(
  state: VariableState,
  initialState: VariableState,
  commands: 变量命令[],
): VariableState {
  const touchedRoots = new Set<VariableRootKey>();
  for (const command of commands) {
    const root = extractRoot(command.key)?.root;
    if (root) touchedRoots.add(root);
  }

  let nextState = state;
  for (const root of touchedRoots) {
    const currentValue = nextState[root];
    if (currentValue === initialState[root] || currentValue === undefined) continue;
    const canonical = canonicalizeJsonValue(currentValue);
    if (!canonical.ok) throw new JsonValueError(canonical.issues);
    if (canonical.value !== currentValue) {
      nextState = { ...nextState, [root]: canonical.value };
    }
  }
  return nextState;
}

/** NPC 去重统一走档案归一化，避免旧实现只保留一条而丢失另一条的记忆/约定。 */
function 去重NPC记录(state: VariableState, npcTouched = false): VariableState {
  const records = state.NPC as NPC记录[] | undefined;
  if (!records || records.length === 0 || (!npcTouched && records.length <= 1)) return state;
  const deduped = 归一化NPC记录列表(records);
  return { ...state, NPC: deduped };
}

function 规范化世界时间命令(cmd: 变量命令): 变量命令 {
  const parsed = extractRoot(cmd.key);
  if (parsed?.root !== '世界') return cmd;

  if ((parsed.rest === '当前时间' || parsed.rest === '当前日期') && cmd.action !== 'set' && cmd.action !== 'delete') {
    cmd = { ...cmd, action: 'set' };
  }

  if (parsed.rest === '当前时间' && typeof cmd.value === 'string') {
    const minutes = 解析分钟序数(cmd.value);
    if (minutes !== null) {
      return { ...cmd, value: 格式化分钟序数(minutes) };
    }
  }

  return cmd;
}

function 归一化变量世界状态(state: VariableState): VariableState {
  const world = state.世界 as 世界状态 | undefined;
  if (!world) return state;
  const safeDay = Math.max(1, Math.trunc(Number(world.开拓天数) || 1));
  const safeDate = typeof world.当前日期 === 'string' ? world.当前日期 : '';
  const safeAligned = 对齐世界日期与天数(safeDay, safeDate);
  if (safeAligned.开拓天数 === world.开拓天数 && safeAligned.当前日期 === world.当前日期) return state;
  return {
    ...state,
    世界: {
      ...world,
      ...safeAligned,
    },
  };
}

function 同步变量世界区域(state: VariableState, commands: 变量命令[]): VariableState {
  const world = state.世界 as 世界状态 | undefined;
  if (!world || !commands.some((command) => extractRoot(command.key)?.root === '世界' && extractRoot(command.key)?.rest === '当前地点')) {
    return state;
  }
  const inferred = 从当前地点推断区域ID(world.当前地点);
  if (inferred === 'unknown' || inferred === world.当前区域ID) return state;
  return { ...state, 世界: { ...world, 当前区域ID: inferred } };
}

function 解析背包数量扣减目标(rest: string, cmd: 变量命令): { field: string; expected: string; count: number } | null {
  if (cmd.action !== 'sub') return null;
  const tokens = 解析路径片段(rest);
  if (tokens.length !== 3 || tokens[0] !== '背包' || tokens[2] !== '数量') return null;
  const selector = tokens[1];
  if (typeof selector !== 'string' || !selector.startsWith('[') || !selector.endsWith(']')) return null;
  const inner = selector.slice(1, -1);
  const eq = inner.indexOf('=');
  if (eq < 0) return null;
  const field = inner.slice(0, eq).trim();
  const expected = inner.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  if (!field || !expected) return null;
  return {
    field,
    expected,
    count: Math.max(1, Math.trunc(Number(cmd.value) || 1)),
  };
}

function 匹配背包物品(item: 背包物品, field: string, expected: string): boolean {
  const normalizedExpected = expected.trim();
  const expectedLower = normalizedExpected.toLowerCase();
  const candidates = field === 'id'
    ? [item.id, item.名称]
    : [(item as unknown as Record<string, unknown>)[field]];
  return candidates.some((candidate) => {
    if (typeof candidate !== 'string') return false;
    const normalizedCandidate = candidate.trim();
    return normalizedCandidate === normalizedExpected || normalizedCandidate.toLowerCase() === expectedLower;
  });
}

function 应用背包数量扣减命令(
  traveler: 角色数据结构,
  rest: string,
  cmd: 变量命令,
): { matched: boolean; nextTraveler?: 角色数据结构; reason?: string } {
  const target = 解析背包数量扣减目标(rest, cmd);
  if (!target) return { matched: false };
  const inventory = traveler.背包 ?? [];
  const index = inventory.findIndex((item) => 匹配背包物品(item, target.field, target.expected));
  if (index < 0) {
    return {
      matched: true,
      reason: `已忽略背包消耗：背包中没有「${target.expected}」，不再视为变量错误。`,
    };
  }
  const item = inventory[index];
  const consumed = Math.min(item.数量, target.count);
  const remain = item.数量 - consumed;
  const nextInventory = [...inventory];
  if (remain > 0) nextInventory[index] = { ...item, 数量: remain };
  else nextInventory.splice(index, 1);
  return {
    matched: true,
    nextTraveler: { ...traveler, 背包: nextInventory },
    reason: remain > 0
      ? `消耗 ${item.名称} ×${consumed}（剩余 ${remain}）`
      : `消耗 ${item.名称} ×${consumed}（已用尽）`,
  };
}

function 预检变量提交状态(
  state: VariableState,
  initialState: VariableState,
  roots: readonly VariableRootKey[] = ['旅人', '世界', '记忆', '忆庭', '智库', '手机', 'NPC', '新闻', '剧情'],
): VariableState {
  let prepared = { ...state };
  if (prepared.世界 !== initialState.世界) prepared = 归一化变量世界状态(prepared);
  if (prepared.智库 !== initialState.智库) {
    prepared = { ...prepared, 智库: 归一化智库系统(prepared.智库 as 智库系统) };
  }
  if (prepared.手机 !== initialState.手机) {
    prepared = { ...prepared, 手机: 归一化手机系统(prepared.手机 as 手机系统) };
  }
  if (prepared.NPC !== initialState.NPC) {
    prepared = { ...prepared, NPC: 归一化NPC记录列表(prepared.NPC) };
  }

  for (const root of roots) {
    const value = prepared[root];
    if (value === undefined) continue;
    const canonical = canonicalizeJsonValue(value);
    if (!canonical.ok) throw new JsonValueError(canonical.issues);
    // 未变更 root 只做可序列化检查，避免因 clone 造成无意义的 setter 调用。
    if (prepared[root] !== state[root] || state[root] !== initialState[root]) {
      prepared = { ...prepared, [root]: canonical.value };
    }
  }
  return prepared;
}

/** 把 reduceVariableCommands 的结果通过 setters 一次性提交。
 *  只对引用变化的 root 调 setter，并在第一个 setter 前完成全部归一化/JSON 预检。
 *  多个 React setter 仍不是跨 root 真正原子事务；提交异常会停止后续 setter，
 *  调用方必须把它作为批次级提交诊断处理。 */
export function commitVariableState(
  state: VariableState,
  initialState: VariableState,
  setters: VariableSetters,
): VariableRootKey[] {
  const prepared = 预检变量提交状态(state, initialState);
  const committedRoots: VariableRootKey[] = [];
  const commit = (root: VariableRootKey, setter: () => void) => {
    try {
      setter();
      committedRoots.push(root);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new VariableCommitError(
        `变量提交在 root「${root}」失败；已提交 root：${committedRoots.join('、') || '无'}；原因：${reason}`,
        committedRoots,
        root,
      );
    }
  };
  if (prepared.旅人 !== initialState.旅人) commit('旅人', () => setters.set旅人(prepared.旅人 as 角色数据结构));
  if (prepared.世界 !== initialState.世界) commit('世界', () => setters.set世界(prepared.世界 as 世界状态));
  if (prepared.记忆 !== initialState.记忆) commit('记忆', () => setters.set记忆(prepared.记忆 as 记忆系统));
  if (prepared.忆庭 !== initialState.忆庭) commit('忆庭', () => setters.set忆庭(prepared.忆庭 as 忆庭系统));
  if (prepared.智库 !== initialState.智库) commit('智库', () => setters.set智库(prepared.智库 as 智库系统));
  if (prepared.手机 !== initialState.手机) commit('手机', () => setters.set手机(prepared.手机 as 手机系统));
  if (prepared.NPC !== initialState.NPC) commit('NPC', () => setters.setNPC(prepared.NPC as NPC记录[]));
  if (prepared.新闻 !== initialState.新闻) commit('新闻', () => setters.set新闻(prepared.新闻 as 新闻条目[]));
  if (prepared.剧情 !== initialState.剧情) commit('剧情', () => setters.set剧情(prepared.剧情 as 剧情节点[]));
  return committedRoots;
}

/** 正常变量 linker 的提交 adapter：只允许四个正式可写 root，不接受空 setter。 */
export function commitVariableWritableState(
  state: VariableState,
  initialState: VariableState,
  setters: VariableWritableSetters,
  requestedRoots: readonly VariableWritableRootKey[] = VARIABLE_WRITABLE_ROOT_KEYS,
): VariableWritableRootKey[] {
  const roots = VARIABLE_WRITABLE_ROOT_KEYS.filter((root) => requestedRoots.includes(root));
  const prepared = 预检变量提交状态(state, initialState, roots);
  const committedRoots: VariableWritableRootKey[] = [];
  const commit = (root: VariableWritableRootKey, setter: () => void) => {
    try {
      setter();
      committedRoots.push(root);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new VariableCommitError(
        `变量提交在 root「${root}」失败；已提交 root：${committedRoots.join('、') || '无'}；原因：${reason}`,
        committedRoots,
        root,
      );
    }
  };
  if (roots.includes('旅人') && prepared.旅人 !== initialState.旅人) commit('旅人', () => setters.set旅人(prepared.旅人 as 角色数据结构));
  if (roots.includes('世界') && prepared.世界 !== initialState.世界) commit('世界', () => setters.set世界(prepared.世界 as 世界状态));
  if (roots.includes('手机') && prepared.手机 !== initialState.手机) commit('手机', () => setters.set手机(prepared.手机 as 手机系统));
  if (roots.includes('NPC') && prepared.NPC !== initialState.NPC) commit('NPC', () => setters.setNPC(prepared.NPC as NPC记录[]));
  return committedRoots;
}

function 校验世界时间格式(cmd: 变量命令, rest: string): string | null {
  if (rest === '当前日期') {
    if (cmd.action !== 'set') return '世界.当前日期 只能使用 set 写入完整日期';
    const next = 解析琥珀日期序数(cmd.value);
    if (next === null) return '当前日期必须使用“琥珀纪 YYYY.MM.DD”，禁止写现实日期或其他纪年';
    return null;
  }

  if (rest === '当前时间') {
    if (cmd.action !== 'set') return '世界.当前时间 只能使用 set 写入 HH:mm';
    const next = 解析分钟序数(cmd.value);
    if (next === null) return '当前时间必须使用 24 小时制 HH:mm，禁止写时段词或场景名';
    return null;
  }

  if (rest === '开拓天数') {
    if (cmd.action !== 'add' && cmd.action !== 'set' && cmd.action !== 'sub') {
      return '世界.开拓天数 只能使用 add、sub 或 set';
    }
    const value = Number(cmd.value);
    if (!Number.isFinite(value) || !Number.isInteger(value)) return '开拓天数必须使用整数';
    if (cmd.action === 'set' && value < 1) return '开拓天数不能小于 1';
    cmd.value = value;
  }

  return null;
}

function 确保NPC目标存在(records: NPC记录[], rest: string, cmd: 变量命令): NPC记录[] | null {
  if (cmd.action === 'push' && !rest) return null;
  const match = rest.match(/^\[([^\]]+)\]/);
  if (!match) return null;
  const eq = match[1].indexOf('=');
  if (eq < 0) return null;
  const selectorField = match[1].slice(0, eq).trim();
  const selectorValue = match[1].slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  if (!selectorValue) return null;
  // 严格匹配（id / 姓名 / 别名）
  const exists = records.some((item) =>
    item.id === selectorValue ||
    item.姓名 === selectorValue ||
    item.别名 === selectorValue,
  );
  if (exists) return null;
  // 模糊匹配（原著角色库 canonical name），与 findNpc 保持一致
  const canonicalName = NPC选择器值转角色名(selectorValue);
  const canonical = matchCanonical(canonicalName);
  if (canonical) {
    const fuzzyExists = records.some((item) =>
      item.姓名 === canonical.name ||
      canonical.aliases?.some((a) => a === item.姓名 || a === item.别名),
    );
    if (fuzzyExists) return null;
  }
  if (!canonical) return null;
  const stableId = selectorField === 'id' && selectorValue.startsWith('npc_')
    ? selectorValue
    : `npc_${角色名转NPCID(canonical.name)}`;
  const nowTurn = typeof cmd.value === 'number' ? cmd.value : 0;
  const created = {
    ...创建NPC记录({
    姓名: canonical.name,
    阶位: 'companion',
    初见回合: nowTurn,
    原著角色: true,
    性别: canonical.gender as import('@/models/npc').NPC性别 | undefined,
    外貌: canonical.appearance,
    性格: canonical.personality,
    介绍: `${canonical.name}是当前剧情中出现的原著角色。`,
    }),
    id: stableId,
    关系: 'acquaintance' as const,
    备注: ['原著角色自动建档'],
  };
  return [...records, created];
}

function NPC选择器值转角色名(value: string): string {
  const normalized = value.replace(/^npc[_-]/i, '').toLowerCase();
  const map: Record<string, string> = {
    march7th: '三月七',
    march7: '三月七',
    march: '三月七',
    danheng: '丹恒',
    dan_heng: '丹恒',
    himeko: '姬子',
    welt: '瓦尔特',
    pompom: '帕姆',
    'pom-pom': '帕姆',
    herta: '黑塔',
    asta: '艾丝妲',
    arlan: '阿兰',
    stelle: '星',
    caelus: '穹',
  };
  return map[normalized] ?? value;
}

function 角色名转NPCID(name: string): string {
  const map: Record<string, string> = {
    三月七: 'march7th',
    丹恒: 'danheng',
    姬子: 'himeko',
    瓦尔特: 'welt',
    帕姆: 'pompom',
    黑塔: 'herta',
    艾丝妲: 'asta',
    阿兰: 'arlan',
    星: 'stelle',
    穹: 'caelus',
  };
  return map[name] ?? name.toLowerCase().replace(/\s+/g, '_');
}

function 解析分钟序数(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function 格式化分钟序数(minutesOfDay: number): string {
  const hours = Math.floor(minutesOfDay / 60);
  const minutes = minutesOfDay % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// ── 背包 push 入参解析 ──
// AI 传过来的 value 是 JSON 字面量,字段大体跟 创建背包物品 入参对齐,
// 这里只做最基本的字段挑拣与类型兜底,详细品质/堆叠默认值交给 创建背包物品 / 获取物品。
const ITEM_CATEGORIES: 物品分类[] = ['food', 'consumable', 'lightcone', 'weapon', 'clothing', 'accessory', 'memento', 'key'];
const ITEM_QUALITIES: 物品品质[] = ['蓝', '紫', '金'];

function 解析获取物品输入(raw: unknown): 获取物品输入 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const 名称 = typeof obj.名称 === 'string' ? obj.名称.trim() : '';
  const 类别 = obj.类别 as 物品分类;
  if (!名称) return null;
  if (isPlaceholderText(名称)) return null;
  if (!ITEM_CATEGORIES.includes(类别)) return null;
  const out: 获取物品输入 = { 类别, 名称 };
  if (typeof obj.描述 === 'string' && !isPlaceholderText(obj.描述)) out.描述 = obj.描述;
  if (typeof obj.数量 === 'number') out.数量 = obj.数量;
  if (typeof obj.品质 === 'string' && ITEM_QUALITIES.includes(obj.品质 as 物品品质)) {
    out.品质 = obj.品质 as 物品品质;
  }
  if (typeof obj.可堆叠 === 'boolean') out.可堆叠 = obj.可堆叠;
  // 玩家装备系统已退役：忽略旧模型偶尔输出的装备槽位，避免新物品继续落旧穿戴字段。
  if (Array.isArray(obj.叙事效果)) {
    const cleaned = obj.叙事效果
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (cleaned.length > 0) out.叙事效果 = cleaned;
  }
  // 旧数值装备字段已退役：即使模型夹带 属性加成，也不再写入新背包物品。
  if (Array.isArray(obj.使用效果)) {
    const cleaned = obj.使用效果.filter(
      (e): e is { 目标属性: string; 数值: number } =>
        Boolean(e) &&
        typeof e === 'object' &&
        typeof (e as { 目标属性?: unknown }).目标属性 === 'string' &&
        typeof (e as { 数值?: unknown }).数值 === 'number',
    );
    if (cleaned.length > 0) out.使用效果 = cleaned as 获取物品输入['使用效果'];
  }
  if (typeof obj.价值 === 'number') out.价值 = obj.价值;
  if (typeof obj.来源 === 'string') out.来源 = obj.来源 as 获取物品输入['来源'];
  if (typeof obj.来源描述 === 'string') out.来源描述 = obj.来源描述;
  if (typeof obj.获得时间 === 'string') out.获得时间 = obj.获得时间;
  return out;
}

function isPlaceholderBackpackObject(raw: unknown): boolean {
  if (typeof raw === 'string') return isPlaceholderBackpackValue(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  return (
    isPlaceholderText(obj.名称) ||
    isPlaceholderText(obj.描述) ||
    Object.values(obj).some((value) => isPlaceholderText(value))
  );
}

function isPlaceholderText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text === '' || text === '...' || text === '名称' || text === '描述' || text === '物品' || text === '未知物品';
}

// ── 命途进度路径专用通道 ──
// 当命令目标是 旅人.命途列表[索引或 id=...].进度 时,改走 推进命途进度,以走 24h 累计上限。
function 解析命途进度命令(rest: string, 旅人: 角色数据结构): 命途ID | null {
  const tokens = 解析路径片段(rest);
  if (tokens.length < 3) return null;
  if (tokens[0] !== '命途列表') return null;
  if (tokens[tokens.length - 1] !== '进度') return null;
  const selector = tokens[1];
  const paths = 旅人.命途列表 ?? [];

  if (typeof selector === 'number') {
    return paths[selector]?.id ?? null;
  }
  if (typeof selector === 'string' && selector.startsWith('[') && selector.endsWith(']')) {
    const inner = selector.slice(1, -1);
    const eq = inner.indexOf('=');
    if (eq < 0) return null;
    const field = inner.slice(0, eq).trim();
    const value = inner.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (field !== 'id') return null;
    return value as 命途ID;
  }
  return null;
}

function 清理变量命令块(block: string): string {
  return block
    .replace(/```(?:json|JSON|ts|typescript)?/g, '')
    .replace(/```/g, '')
    .replace(/\r/g, '')
    .trim();
}

function JSON括号是否闭合(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return true;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const ch of trimmed) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
  }
  return depth <= 0 && !inString;
}

function 查找赋值等号(line: string): number {
  let bracketDepth = 0;
  let braceDepth = 0;
  let parenDepth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (inString) {
      if (ch === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if ((ch === '=' || ch === '＝') && bracketDepth === 0 && braceDepth === 0 && parenDepth === 0) {
      return i;
    }
  }
  return -1;
}

function 解析变量命令行(line: string): { action: 变量命令['action']; key: string; valueRaw?: string } | null {
  const head = line.match(/^(set|add|sub|push|delete)\s+/i);
  const action = (head ? head[1].toLowerCase() : 'set') as 变量命令['action'];
  const rest = (head ? line.slice(head[0].length) : line).trim();
  if (!rest) return null;

  const eqIndex = 查找赋值等号(rest);
  if (eqIndex < 0) {
    return { action, key: rest.trim() };
  }
  const key = rest.slice(0, eqIndex).trim();
  const valueRaw = rest.slice(eqIndex + 1).trim();
  if (!key) return null;
  return { action, key, valueRaw };
}

function 拆分变量命令行(block: string): string[] {
  const output: string[] = [];
  let current = '';

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    const startsCommand = /^(set|add|sub|push|delete)\s+/i.test(line) || /^[\w一-龥.[\]_-]+\s*[=＝]/.test(line);
    if (!current) {
      current = line;
      continue;
    }

    const eqIndex = 查找赋值等号(current);
    const valuePart = eqIndex >= 0 ? current.slice(eqIndex + 1).trim() : '';
    const currentJsonOpen = Boolean(valuePart) && !JSON括号是否闭合(valuePart);

    if (startsCommand && !currentJsonOpen) {
      output.push(current);
      current = line;
    } else {
      current += `\n${line}`;
    }
  }

  if (current) output.push(current);
  return output;
}

function 解析变量值(raw: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json|JSON)?\s*/, '')
    .replace(/```$/, '')
    .trim();
  if (!trimmed) return { ok: false, reason: '空值' };

  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    const repaired = trimmed
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/：/g, ':')
      .replace(/,\s*([}\]])/g, '$1');
    try {
      return { ok: true, value: JSON.parse(repaired) };
    } catch {
      if (/^[A-Za-z_一-龥][\w一-龥\s-]*$/.test(trimmed)) {
        return { ok: true, value: trimmed };
      }
      return { ok: false, reason: `JSON 值无法解析：${trimmed.slice(0, 120)}` };
    }
  }
}

function isPlaceholderBackpackValue(raw: string | undefined): boolean {
  if (!raw) return false;
  const text = raw.trim();
  return (
    text === '{id,名称,描述,...}' ||
    text === '{名称,描述,...}' ||
    text === '{"id","名称","描述"}' ||
    /\.\.\./.test(text)
  );
}

function isPlaceholderValue(raw: string | undefined): boolean {
  if (!raw) return false;
  const text = raw.trim();
  return /\.\.\./.test(text) || /[{,]\s*(id|回合|摘要|名称|描述)\s*[,}]/.test(text);
}

/** 从 AI 文本中解析 <变量更新>...</变量更新> 块。每条命令：`<action> <path> = <json>`。
 *  支持多行 JSON / 代码块 / 全角等号；delete 可省略 = 后面的值。 */
export function parseVariableCommands(rawText: string): { commands: 变量命令[]; parseErrors: string[] } {
  const commands: 变量命令[] = [];
  const parseErrors: string[] = [];

  const blockMatch = rawText.match(/<变量更新>([\s\S]*?)<\/变量更新>/);
  if (!blockMatch) return { commands, parseErrors };

  const lines = 拆分变量命令行(清理变量命令块(blockMatch[1]));

  for (const line of lines) {
    // 形如：  push  旅人.背包 = {"名称":"面包","数量":1}
    //        delete 剧情[id=node_002]
    //        add   世界.开拓天数 = 1
    const parsedLine = 解析变量命令行(line);
    if (!parsedLine) {
      parseErrors.push(`无法解析：${line.slice(0, 160)}`);
      continue;
    }
    const { action, key, valueRaw } = parsedLine;

    if (action !== 'delete' && valueRaw === undefined) {
      parseErrors.push(`${action} 缺少值：${line}`);
      continue;
    }

    if (action === 'push' && key.trim() === '旅人.背包' && isPlaceholderBackpackValue(valueRaw)) {
      continue;
    }
    if (isPlaceholderValue(valueRaw)) {
      continue;
    }

    // 顺便确认根合法（错的也按拒绝处理，让 validateCommand 给出明确原因）
    if (!extractRoot(key)) {
      parseErrors.push(`未知根路径：${key}`);
      // 不 continue，让 validate 阶段也吐一遍，便于在面板里看到
    }

    let value: unknown;
    if (action !== 'delete' && valueRaw !== undefined) {
      const parsedValue = 解析变量值(valueRaw);
      if (!parsedValue.ok) {
        parseErrors.push(`${parsedValue.reason}；命令：${line.slice(0, 160)}`);
        continue;
      }
      value = parsedValue.value;
    }

    commands.push(action === 'delete' ? { action, key } : { action, key, value });
  }

  return { commands, parseErrors };
}
