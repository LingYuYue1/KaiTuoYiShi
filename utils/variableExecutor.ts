// 变量命令执行器：把通过校验的命令落地到 state setter。
// 输入一个命令 + 当前精简 state + setters 集合，执行后返回结果。
//
// 设计：每个命令都独立调用对应 setter。多条命令按顺序执行；前一条不会影响下一条的校验（因为校验是用旧 state 做的，由 sendWorkflow 决定是否每条都重校验）。

import type { 变量命令, 变量命令结果 } from '@/models/variableCommand';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';
import { 归一化智库系统 } from '@/models/zhiku';
import type { 手机系统 } from '@/models/phone';
import { 归一化手机系统 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import { 归一化NPC记录列表 } from '@/models/npc';
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
  const validation = validateCommand(cmd, state);
  if (!validation.allowed) {
    return { command: cmd, ok: false, reason: validation.reason };
  }
  const { root, rest } = validation;
  if (!root || rest === undefined) {
    return { command: cmd, ok: false, reason: '内部错误：校验通过但未提取到根路径' };
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

  for (const cmd of commands) {
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

  return { results, nextState: cursor };
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
  if (state.世界 !== initialState.世界) setters.set世界(state.世界 as 世界状态);
  if (state.记忆 !== initialState.记忆) setters.set记忆(state.记忆 as 记忆系统);
  if (state.忆庭 !== initialState.忆庭) setters.set忆庭(state.忆庭 as 忆庭系统);
  if (state.智库 !== initialState.智库) setters.set智库(归一化智库系统(state.智库 as 智库系统));
  if (state.手机 !== initialState.手机) setters.set手机(归一化手机系统(state.手机 as 手机系统));
  if (state.NPC !== initialState.NPC) setters.setNPC(归一化NPC记录列表(state.NPC));
  if (state.新闻 !== initialState.新闻) setters.set新闻(state.新闻 as 新闻条目[]);
  if (state.剧情 !== initialState.剧情) setters.set剧情(state.剧情 as 剧情节点[]);
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
  if (!head) return null;
  const action = head[1].toLowerCase() as 变量命令['action'];
  const rest = line.slice(head[0].length).trim();
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

    const startsCommand = /^(set|add|sub|push|delete)\s+/i.test(line);
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
