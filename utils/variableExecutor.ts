// 变量命令执行器：把通过校验的命令落地到 state setter。
// 输入一个命令 + 当前精简 state + setters 集合，执行后返回结果。
//
// 设计：每个命令都独立调用对应 setter。多条命令按顺序执行；前一条不会影响下一条的校验（因为校验是用旧 state 做的，由 sendWorkflow 决定是否每条都重校验）。

import type { 变量命令, 变量命令结果 } from '@/models/variableCommand';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import { 对齐世界日期与天数, 解析琥珀日期序数, 格式化琥珀日期序数 } from '@/models/world';
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
import type { 物品分类, 物品品质 } from '@/models/inventory';
import { 应用路径命令, 解析路径片段, 读取路径值 } from './variablePath';
import { extractRoot, validateCommand, type VariableState } from './variableRegistry';

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
  cmd = 规范化世界时间命令(cmd);
  let effectiveState = state;
  const parsedForEnsure = extractRoot(cmd.key);
  if (parsedForEnsure?.root === 'NPC') {
    const ensuredNpc = 确保NPC目标存在(state.NPC as NPC记录[], parsedForEnsure.rest, cmd);
    if (ensuredNpc) {
      effectiveState = { ...state, NPC: ensuredNpc };
      setters.setNPC(ensuredNpc);
    }
  }
  const validation = validateCommand(cmd, effectiveState);
  if (!validation.allowed) {
    return { command: cmd, ok: false, reason: validation.reason };
  }
  const { root, rest } = validation;
  if (!root || rest === undefined) {
    return { command: cmd, ok: false, reason: '内部错误：校验通过但未提取到根路径' };
  }

  if (root === '世界') {
    const timeGuardReason = 校验世界时间命令(cmd, rest, effectiveState.世界 as 世界状态, effectiveState.世界 as 世界状态);
    if (timeGuardReason) {
      return { command: cmd, ok: false, reason: timeGuardReason };
    }
  }

  let applyError: string | undefined;

  const isMalformedBackpackPush =
    root === '旅人' &&
    rest === '背包' &&
    cmd.action === 'push' &&
    !解析获取物品输入(cmd.value);
  if (isMalformedBackpackPush) {
    if (isPlaceholderBackpackObject(cmd.value)) {
      return { command: cmd, ok: true, reason: '已忽略背包占位符命令' };
    }
    return { command: cmd, ok: false, reason: '背包 push 值格式错误：请提供完整的物品对象' };
  }

  const runUpdate = <T,>(setter: React.Dispatch<React.SetStateAction<T>>): void => {
    setter((prev) => {
      const result = 应用路径命令(prev, rest, cmd.action, cmd.value);
      if (!result.ok) {
        applyError = result.reason ?? '应用失败';
        return prev;
      }
      // 整根删除：拒绝（避免把整个数组/对象置 undefined 破坏类型）
      if (rest.length === 0 && cmd.action === 'delete') {
        applyError = '禁止 delete 根路径';
        return prev;
      }
      return result.nextRootValue as T;
    });
  };

  switch (root) {
    case '旅人': runUpdate(setters.set旅人); break;
    case '世界': runUpdate(setters.set世界); break;
    case '记忆': runUpdate(setters.set记忆); break;
    case '忆庭': runUpdate(setters.set忆庭); break;
    case '智库':
      runUpdate(setters.set智库);
      setters.set智库((prev) => 归一化智库系统(prev));
      break;
    case '手机':
      runUpdate(setters.set手机);
      setters.set手机((prev) => 归一化手机系统(prev));
      break;
    case 'NPC': runUpdate(setters.setNPC); break;
    case '新闻': runUpdate(setters.set新闻); break;
    case '剧情': runUpdate(setters.set剧情); break;
  }

  if (applyError) return { command: cmd, ok: false, reason: applyError };
  return { command: cmd, ok: true };
}

/** 批量执行：依次跑每条命令，收集每条的结果。 */
export function applyVariableCommands(
  commands: 变量命令[],
  state: VariableState,
  setters: VariableSetters,
): 变量命令结果[] {
  return commands.map((cmd) => applyVariableCommand(cmd, state, setters));
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
export function reduceVariableCommands(
  commands: 变量命令[],
  initialState: VariableState,
): { results: 变量命令结果[]; nextState: VariableState } {
  let cursor = { ...initialState };
  const results: 变量命令结果[] = [];
  const normalizedCommands = commands.map(规范化世界时间命令);
  const batchTimePlan = 分析批次时间计划(normalizedCommands, initialState.世界 as 世界状态);

  for (const cmd of normalizedCommands) {
    const preEnsuredNpc = extractRoot(cmd.key)?.root === 'NPC'
      ? 确保NPC目标存在(cursor.NPC as NPC记录[], extractRoot(cmd.key)?.rest ?? '', cmd)
      : null;
    if (preEnsuredNpc) {
      cursor = { ...cursor, NPC: preEnsuredNpc };
    }
    const validation = validateCommand(cmd, cursor);
    if (!validation.allowed) {
      results.push({ command: cmd, ok: false, reason: validation.reason });
      continue;
    }
    const { root, rest } = validation;
    if (!root || rest === undefined) {
      results.push({ command: cmd, ok: false, reason: '内部错误：校验通过但未提取到根路径' });
      continue;
    }
    if (rest.length === 0 && cmd.action === 'delete') {
      results.push({ command: cmd, ok: false, reason: '禁止 delete 根路径' });
      continue;
    }

    if (root === '世界') {
      const timeGuardReason = 校验世界时间命令(
        cmd,
        rest,
        cursor.世界 as 世界状态,
        initialState.世界 as 世界状态,
        batchTimePlan,
      );
      if (timeGuardReason) {
        results.push({ command: cmd, ok: false, reason: timeGuardReason });
        continue;
      }
    }

    if (root === '世界' && rest === '当前时间' && cmd.action === 'set') {
      cursor = 补齐疑似跨夜时间(cursor, cmd);
    }

    if (root === '旅人' && rest === '背包' && cmd.action === 'push' && !解析获取物品输入(cmd.value)) {
      if (isPlaceholderBackpackObject(cmd.value)) {
        results.push({ command: cmd, ok: true, reason: '已忽略背包占位符命令' });
        continue;
      }
      results.push({ command: cmd, ok: false, reason: '背包 push 值格式错误：请提供完整的物品对象' });
      continue;
    }

    // 背包专用通道:push 旅人.背包 → 走 获取物品(),自动堆叠同名可堆叠物品
    if (root === '旅人' && cmd.action === 'push' && rest === '背包') {
      const 旅人 = cursor['旅人'] as 角色数据结构;
      const parsed = 解析获取物品输入(cmd.value);
      if (parsed) {
        const res = 获取物品(旅人, parsed, { 获得回合: 0 });
        cursor = { ...cursor, 旅人: res.traveler };
        results.push({ command: cmd, ok: true, reason: res.message });
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
        results.push({
          command: cmd,
          ok: true,
          reason: res.message,
        });
        continue;
      }
    }

    const applied = 应用路径命令(cursor[root], rest, cmd.action, cmd.value);
    if (!applied.ok) {
      results.push({ command: cmd, ok: false, reason: applied.reason ?? '应用失败' });
      continue;
    }
    cursor = { ...cursor, [root]: applied.nextRootValue };
    results.push({ command: cmd, ok: true });
  }

  cursor = 归一化变量世界状态(cursor);
  return { results, nextState: cursor };
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
  const aligned = 对齐世界日期与天数(world.开拓天数, world.当前日期);
  if (aligned.开拓天数 === world.开拓天数 && aligned.当前日期 === world.当前日期) return state;
  return {
    ...state,
    世界: {
      ...world,
      ...aligned,
    },
  };
}

function 补齐疑似跨夜时间(state: VariableState, cmd: 变量命令): VariableState {
  const world = state.世界 as 世界状态 | undefined;
  if (!world) return state;
  const current = 解析分钟序数(world.当前时间);
  const next = 解析分钟序数(cmd.value);
  if (current === null || next === null) return state;
  const looksOvernight = current >= 20 * 60 && next <= 6 * 60;
  if (!looksOvernight) return state;
  const aligned = 对齐世界日期与天数(
    Math.max(1, Math.trunc(Number(world.开拓天数) || 1)) + 1,
    world.当前日期,
  );
  return {
    ...state,
    世界: {
      ...world,
      ...aligned,
    },
  };
}

/** 把 reduceVariableCommands 的结果通过 setters 一次性提交。
 *  只对引用变化的 root 调 setter——这样:
 *  1. 变量模型没动的 root 不会 setState,避免覆盖玩家在校准期间的交互(如点击狭间邀请卡片)
 *  2. 没必要的 re-render 也省了
 *  initialState 必须是传给 reduceVariableCommands 的同一份初始 snapshot 引用。 */
export function commitVariableState(
  state: VariableState,
  initialState: VariableState,
  setters: VariableSetters,
): void {
  if (state.旅人 !== initialState.旅人) setters.set旅人(state.旅人 as 角色数据结构);
  if (state.世界 !== initialState.世界) setters.set世界(归一化变量世界状态(state).世界 as 世界状态);
  if (state.记忆 !== initialState.记忆) setters.set记忆(state.记忆 as 记忆系统);
  if (state.忆庭 !== initialState.忆庭) setters.set忆庭(state.忆庭 as 忆庭系统);
  if (state.智库 !== initialState.智库) setters.set智库(归一化智库系统(state.智库 as 智库系统));
  if (state.手机 !== initialState.手机) setters.set手机(归一化手机系统(state.手机 as 手机系统));
  if (state.NPC !== initialState.NPC) setters.setNPC(归一化NPC记录列表(state.NPC));
  if (state.新闻 !== initialState.新闻) setters.set新闻(state.新闻 as 新闻条目[]);
  if (state.剧情 !== initialState.剧情) setters.set剧情(state.剧情 as 剧情节点[]);
}

function 校验世界时间命令(
  cmd: 变量命令,
  rest: string,
  currentWorld: 世界状态,
  baselineWorld?: 世界状态,
  batchTimePlan?: 批次时间计划,
): string | null {
  if (rest === '当前日期') {
    if (cmd.action !== 'set') return '世界.当前日期 只能使用 set 写入完整日期';
    const next = 解析琥珀日期序数(cmd.value);
    if (next === null) return '当前日期必须使用“琥珀纪 YYYY.MM.DD”，禁止写现实日期或其他纪年';
    const current = 解析琥珀日期序数(currentWorld?.当前日期);
    if (current !== null && next < current) return '拒绝时间回退：世界.当前日期 不能早于当前日期';
    const baseline = 解析琥珀日期序数(baselineWorld?.当前日期);
    if (baseline !== null && next > baseline + 1) {
      cmd.value = 格式化琥珀日期序数(baseline + 1);
      return null;
    }
    return null;
  }

  if (rest === '当前时间') {
    if (cmd.action !== 'set') return '世界.当前时间 只能使用 set 写入 HH:mm';
    const next = 解析分钟序数(cmd.value);
    if (next === null) return '当前时间必须使用 24 小时制 HH:mm，禁止写时段词或场景名';
    const current = 解析分钟序数(currentWorld?.当前时间);
    const currentDate = 解析琥珀日期序数(currentWorld?.当前日期);
    const baselineDate = 解析琥珀日期序数(baselineWorld?.当前日期);
    const baselineTime = 解析分钟序数(baselineWorld?.当前时间);
    const dateAlreadyAdvanced = currentDate !== null && baselineDate !== null && currentDate > baselineDate;
    const dateWillAdvanceInBatch = batchTimePlan?.dateAdvances === true && batchTimePlan?.dayAdvances === true;
    if (!dateAlreadyAdvanced && current !== null && next < current) {
      if (current >= 20 * 60 && next <= 6 * 60) return null;
      if (dateWillAdvanceInBatch) return null;
      return `已忽略疑似时间回退：同一日期内 世界.当前时间 不能早于当前时间（当前 ${currentWorld?.当前时间 || '未知'}，尝试写入 ${String(cmd.value)}）；若剧情已跨日，请同批写入 世界.当前日期 的下一天`;
    }
    if (!dateAlreadyAdvanced && !dateWillAdvanceInBatch && baselineTime !== null && next - baselineTime > 60) {
      const capped = Math.min(23 * 60 + 59, baselineTime + 30);
      cmd.value = 格式化分钟序数(capped);
      return null;
    }
    return null;
  }

  if (rest === '开拓天数') {
    const current = Math.max(1, Math.trunc(Number(currentWorld?.开拓天数) || 1));
    if (cmd.action !== 'add' && cmd.action !== 'set' && cmd.action !== 'sub') {
      return '世界.开拓天数 只能使用 add 或 set';
    }
    if (cmd.action === 'sub') return '拒绝时间回退：世界.开拓天数 不允许使用 sub';
    if (cmd.action === 'add') {
      const delta = Number(cmd.value);
      if (!Number.isFinite(delta)) return '开拓天数 add 必须是数字';
      if (delta < 0) return '拒绝时间回退：世界.开拓天数 不能减少';
      if (delta > 1) cmd.value = 1;
      return null;
    }
    if (cmd.action === 'set') {
      const next = Number(cmd.value);
      if (!Number.isFinite(next)) return '开拓天数 set 必须是数字';
      if (next < current) return '拒绝时间回退：世界.开拓天数 不能小于当前值';
      if (next < 1) return '开拓天数不能小于 1';
      if (next > current + 1) cmd.value = current + 1;
    }
  }

  return null;
}

interface 批次时间计划 {
  dateAdvances: boolean;
  dayAdvances: boolean;
}

function 分析批次时间计划(commands: 变量命令[], baselineWorld: 世界状态): 批次时间计划 {
  const baselineDate = 解析琥珀日期序数(baselineWorld?.当前日期);
  const baselineDay = Math.max(1, Math.trunc(Number(baselineWorld?.开拓天数) || 1));
  const dateAdvances = commands.some((cmd) => {
    const parsed = extractRoot(cmd.key);
    if (parsed?.root !== '世界' || parsed.rest !== '当前日期' || cmd.action !== 'set') return false;
    const next = 解析琥珀日期序数(cmd.value);
    return baselineDate !== null && next !== null && next === baselineDate + 1;
  });
  const dayAdvances = commands.some((cmd) => {
    const parsed = extractRoot(cmd.key);
    if (parsed?.root !== '世界' || parsed.rest !== '开拓天数') return false;
    const value = Number(cmd.value);
    if (!Number.isFinite(value)) return false;
    if (cmd.action === 'add') return value === 1;
    if (cmd.action === 'set') return value === baselineDay + 1;
    return false;
  });
  return { dateAdvances, dayAdvances };
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
  const exists = records.some((item) =>
    item.id === selectorValue ||
    item.姓名 === selectorValue ||
    item.别名 === selectorValue,
  );
  if (exists) return null;
  const canonical = matchCanonical(NPC选择器值转角色名(selectorValue));
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
  if (typeof obj.装备槽位 === 'string') out.装备槽位 = obj.装备槽位 as 获取物品输入['装备槽位'];
  if (Array.isArray(obj.叙事效果)) {
    const cleaned = obj.叙事效果
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (cleaned.length > 0) out.叙事效果 = cleaned;
  }
  if (obj.属性加成 && typeof obj.属性加成 === 'object' && !Array.isArray(obj.属性加成)) {
    // 属性加成 必须是 {字段名: 数字} 纯数值映射;AI 偶尔会写成 {目标属性,数值} 对象,过滤掉
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj.属性加成 as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) cleaned[k] = v;
    }
    if (Object.keys(cleaned).length > 0) {
      out.属性加成 = cleaned as 获取物品输入['属性加成'];
    }
  }
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

    let value: unknown = null;
    if (action !== 'delete' && valueRaw !== undefined) {
      const parsedValue = 解析变量值(valueRaw);
      if (!parsedValue.ok) {
        parseErrors.push(`${parsedValue.reason}；命令：${line.slice(0, 160)}`);
        continue;
      }
      value = parsedValue.value;
    }

    commands.push({ action, key, value });
  }

  return { commands, parseErrors };
}
