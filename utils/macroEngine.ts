/**
 * ST 预设兼容：宏引擎
 *
 * 解析并执行 SillyTavern 预设中的条件变量宏：
 * - {{setvar::name::value}}  设置局部变量
 * - {{getvar::name}}         读取局部变量（不存在时返回空串）
 * - {{setglobalvar::name::value}} 设置全局变量
 * - {{getglobalvar::name}}   读取全局变量
 * - {{if condition}}content{{/if}}  条件渲染
 * - {{if condition}}A{{else}}B{{/if}} 条件分支
 * - {{random::a::b::c}}      随机选择一个选项（双人成行等预设使用）
 *
 * 变量简写：
 * - {{.name = value}}  等价于 setvar
 * - {{.name}}          等价于 getvar
 * - {{$name = value}}  等价于 setglobalvar
 * - {{$name}}          等价于 getglobalvar
 *
 * ST 标准宏（Phase 2 扩展）：
 * - {{char}} / {{user}}                角色名 / 玩家名
 * - {{lastMessage}} / {{lastUserMessage}} / {{lastCharMessage}}  最后消息
 * - {{pick::a::b::c}}                   不重复随机选取
 * - {{pick_var::name}}                  读取 pick 历史
 * - {{roll:dN}} / {{roll:N}}            骰子
 * - {{time}} / {{date}} / {{datetime}}  时间
 * - {{model}} / {{messageCount}} / {{turnCount}}  系统状态
 * - {{noop}} / {{newline}} / {{trim::}} / {{lower::}} / {{upper::}}  工具宏
 * - {{//comment}}                       注释（返回空串）
 * - {{bias::text}}                      偏置注入（静默忽略）
 *
 * 宏在提示词模块拼接后、发送给 AI 前执行。是纯文本预处理层，
 * 不涉及游戏状态、不写 VariableState——和变量系统完全独立。
 */

/** ST 宏所需的游戏状态快照（只读）。由调用方从游戏状态组装传入。 */
export interface MacroGameState {
  /** 当前角色名（{{char}} 替换值）。 */
  charName?: string;
  /** 当前玩家名（{{user}} 替换值）。 */
  userName?: string;
  /** 最后一条消息内容（{{lastMessage}} 替换值）。 */
  lastMessage?: string;
  /** 最后一条玩家消息内容（{{lastUserMessage}} 替换值）。 */
  lastUserMessage?: string;
  /** 最后一条角色消息内容（{{lastCharMessage}} 替换值）。 */
  lastCharMessage?: string;
  /** 消息总数（{{messageCount}} 替换值）。 */
  messageCount?: number;
  /** 当前回合数（{{turnCount}} 替换值）。 */
  turnCount?: number;
  /** 当前模型名（{{model}} 替换值）。 */
  modelName?: string;
  /** 最大上下文长度（{{maxPrompt}} 替换值）。 */
  maxContext?: number;
}

/** 宏变量上下文 */
export interface MacroContext {
  /** 局部变量：每次发送前重置 */
  local: Record<string, string>;
  /** 全局变量：跨会话持久化 */
  global: Record<string, string>;
  /** 游戏状态快照（ST 标准宏读取，可选）。 */
  gameState?: MacroGameState;
  /** pick 历史：每个 key 对应已被选过的选项列表（不重复随机选取）。 */
  pickHistory?: Record<string, string[]>;
}

/** 创建宏上下文。可传入初始全局变量副本（跨会话持久化的变量）。 */
export function createMacroContext(
  initialGlobals?: Record<string, string>,
  gameState?: MacroGameState,
): MacroContext {
  return {
    local: {},
    global: { ...(initialGlobals ?? {}) },
    gameState,
    pickHistory: {},
  };
}

/**
 * 执行宏解析。输入是提示词文本，输出是替换宏后的文本。
 * 解析失败时原样输出该宏（不中断流程）。
 *
 * 执行顺序（关键）：
 *   0. processSTMacros — 最先执行 ST 标准宏（{{char}}/{{user}}/{{time}} 等），
 *      这些宏不依赖变量上下文，但可能依赖游戏状态快照。
 *   1. processRandom — 执行随机宏，不依赖变量上下文。
 *      让后续 setvar/if 看到的是已选定后的固定文本，避免同一回合多次随机。
 *   2. executeAssignments — 先执行全文 setvar/setglobalvar/简写赋值，
 *      让后续 if 条件能读到刚刚赋的值。
 *   3. processIfBlocks — 再评估 if/else 条件块，条件中的 getvar/getglobalvar
 *      能拿到第 2 步赋的值。
 *   4. processReads — 最后替换 getvar/getglobalvar/简写读取为实际值。
 *
 * 已知限制：if 块内部的 setvar 会被第 2 步无条件执行（不区分 if 真假分支）。
 * 实际 ST 预设中 setvar 一般写在 if 外，此限制可接受。
 *
 * @param text 待解析的文本
 * @param ctx 宏变量上下文
 * @returns 解析后的文本
 */
export function processMacros(text: string, ctx: MacroContext): string {
  let result = text;

  // 阶段 0：处理 ST 标准宏（{{char}}/{{user}}/{{time}} 等）
  result = processSTMacros(result, ctx);

  // 阶段 1：处理 random 宏（不依赖变量，先于赋值执行）
  result = processRandom(result);

  // 阶段 2：执行赋值（setvar/setglobalvar/简写赋值），移除赋值宏本身
  result = executeAssignments(result, ctx);

  // 阶段 3：处理 if/else 条件块（条件中的 getvar 能拿到阶段 2 赋的值）
  result = processIfBlocks(result, ctx);

  // 阶段 4：替换 getvar/getglobalvar/简写读取
  result = processReads(result, ctx);

  return result;
}

// ── Phase 2：ST 标准宏实现 ───────────────────────────────────────

/**
 * 处理 ST 标准宏。包含角色/消息/时间/系统状态/工具类宏。
 * 这些宏不依赖变量上下文，但部分依赖 gameState 快照。
 * 解析失败时原样输出该宏（不中断流程）。
 */
function processSTMacros(text: string, ctx: MacroContext): string {
  const gs = ctx.gameState ?? {};
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const datetimeStr = `${dateStr} ${timeStr}`;

  let result = text;

  // ── 角色与消息宏 ──────────────────────────────────────────
  // {{char}} / {{user}}：角色名 / 玩家名
  result = result.replace(/\{\{char\}\}/g, gs.charName ?? '');
  result = result.replace(/\{\{user\}\}/g, gs.userName ?? '');

  // {{lastMessage}} / {{lastUserMessage}} / {{lastCharMessage}}
  result = result.replace(/\{\{lastMessage\}\}/g, gs.lastMessage ?? '');
  result = result.replace(/\{\{lastUserMessage\}\}/g, gs.lastUserMessage ?? '');
  result = result.replace(/\{\{lastCharMessage\}\}/g, gs.lastCharMessage ?? '');

  // ── 时间宏 ──────────────────────────────────────────────
  result = result.replace(/\{\{time\}\}/g, timeStr);
  result = result.replace(/\{\{date\}\}/g, dateStr);
  result = result.replace(/\{\{datetime\}\}/g, datetimeStr);

  // ── 系统状态宏 ──────────────────────────────────────────
  result = result.replace(/\{\{model\}\}/g, gs.modelName ?? '');
  result = result.replace(/\{\{messageCount\}\}/g, gs.messageCount != null ? String(gs.messageCount) : '');
  result = result.replace(/\{\{turnCount\}\}/g, gs.turnCount != null ? String(gs.turnCount) : '');
  result = result.replace(/\{\{maxPrompt\}\}/g, gs.maxContext != null ? String(gs.maxContext) : '');

  // ── 工具宏 ──────────────────────────────────────────────
  // {{noop}} — 空操作，返回空串
  result = result.replace(/\{\{noop\}\}/g, '');
  // {{newline}} — 换行
  result = result.replace(/\{\{newline\}\}/g, '\n');
  // {{//comment}} — 注释，返回空串（用 RegExp 构造避免字面量 // 被解析为注释）
  result = result.replace(new RegExp('\\{\\{//[^}]*\\}\\}', 'g'), '');
  // {{bias::text}} — 偏置注入，我们不支持，静默忽略返回空串
  result = result.replace(/\{\{bias::[^}]*\}\}/g, '');
  // {{trim::text}} — 去首尾空白
  result = result.replace(/\{\{trim::([^}]*)\}\}/g, (_m, s: string) => s.trim());
  // {{lower::text}} / {{upper::text}} — 大小写转换
  result = result.replace(/\{\{lower::([^}]*)\}\}/g, (_m, s: string) => s.toLowerCase());
  result = result.replace(/\{\{upper::([^}]*)\}\}/g, (_m, s: string) => s.toUpperCase());

  // ── 随机与选择宏 ────────────────────────────────────────
  // {{pick::a::b::c}} — 不重复随机选取（用 pickHistory 记录已选）
  result = result.replace(/\{\{pick::([^}]*)\}\}/g, (match, options: string) => {
    const trimmed = options.trim();
    if (!trimmed) return '';
    const parts = trimmed.split('::').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    // 用整个 match 作为 key（同一段 pick 文本共享一个 pick 池）
    if (!ctx.pickHistory) ctx.pickHistory = {};
    const key = match;
    const used = ctx.pickHistory[key] ?? [];
    const remaining = parts.filter((p) => !used.includes(p));
    // 全部选完则重置
    const candidates = remaining.length > 0 ? remaining : parts;
    const idx = Math.floor(Math.random() * candidates.length);
    const chosen = candidates[idx];
    if (remaining.length > 0) {
      ctx.pickHistory[key] = [...used, chosen];
    } else {
      // 重置后只记录本次选择
      ctx.pickHistory[key] = [chosen];
    }
    return chosen;
  });

  // {{pick_var::name}} — 读取 pick 历史（读取最后一次 pick 的结果）
  result = result.replace(/\{\{pick_var::([^}]+)\}\}/g, (_m, name: string) => {
    const key = name.trim();
    if (!ctx.pickHistory) return '';
    const history = ctx.pickHistory[key];
    if (!history || history.length === 0) return '';
    return history[history.length - 1];
  });

  // {{roll:dN}} / {{roll:N}} — 骰子
  result = result.replace(/\{\{roll:([^}]+)\}\}/g, (_m, spec: string) => {
    const s = spec.trim();
    // dN 格式：1d6 / 2d20 / d100
    const dMatch = s.match(/^(\d*)d(\d+)$/i);
    if (dMatch) {
      const count = dMatch[1] ? parseInt(dMatch[1], 10) : 1;
      const sides = parseInt(dMatch[2], 10);
      if (sides <= 0 || count <= 0) return '0';
      let total = 0;
      for (let i = 0; i < count; i++) {
        total += Math.floor(Math.random() * sides) + 1;
      }
      return String(total);
    }
    // 纯数字格式：roll:N → 1-N 的随机整数
    const nMatch = s.match(/^(\d+)$/);
    if (nMatch) {
      const n = parseInt(nMatch[1], 10);
      if (n <= 0) return '0';
      return String(Math.floor(Math.random() * n) + 1);
    }
    // 不识别，原样返回
    return _m;
  });

  return result;
}

/**
 * 处理 {{random::选项1::选项2::选项3::...}}
 * 从 :: 分隔的选项中随机选一个。双人成行等 ST 预设用 random 宏做正强化越狱，
 * 每次发送 AI 看到不同措辞，增加越狱指令的多样性，降低模型识别为固定 prompt 的概率。
 *
 * 语法说明：
 * - 选项之间用 :: 分隔（与 setvar::name::value 一致）
 * - 至少 2 个选项才有意义；只有 1 个选项时直接返回该选项
 * - 0 个选项（空 random）返回空串
 * - 选项内可含空格、中文、标点，但不能含 }}（会截断宏）
 *
 * 执行时机：最先执行（阶段 0），不依赖变量上下文。
 * 让后续 setvar/if 看到的是已选定后的固定文本，避免同一回合多次随机。
 */
function processRandom(text: string): string {
  // 匹配 {{random::...}}，选项部分不含 }}
  return text.replace(/\{\{random::([^}]*)\}\}/g, (_match, options: string) => {
    const trimmed = options.trim();
    if (!trimmed) return '';
    // 按 :: 分割选项
    const parts = trimmed.split('::');
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].trim();
    // 随机选一个
    const idx = Math.floor(Math.random() * parts.length);
    return parts[idx].trim();
  });
}

/**
 * 处理 {{if condition}}content{{/if}} 和 {{if condition}}A{{else}}B{{/if}}
 */
function processIfBlocks(text: string, ctx: MacroContext): string {
  // 匹配 {{if condition}}...{{/if}}（支持嵌套，从最内层开始）
  const IF_PATTERN = /\{\{if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  let result = text;
  let prev: string;
  // 循环处理嵌套 if（最多 10 层防死循环）
  for (let i = 0; i < 10; i++) {
    prev = result;
    result = result.replace(IF_PATTERN, (_match, condition: string, body: string) => {
      // 检查是否有 {{else}}
      const elseMatch = body.match(/^([\s\S]*?)\{\{else\}\}([\s\S]*)$/);
      const cond = evaluateCondition(condition.trim(), ctx);
      if (elseMatch) {
        return cond ? elseMatch[1] : elseMatch[2];
      }
      return cond ? body : '';
    });
    if (result === prev) break;
  }
  return result;
}

/**
 * 评估条件表达式。支持：
 * - 裸字符串：非空为 true，空为 false
 * - == / != 比较
 * - ST 标准裸语法：getvar::name / getglobalvar::name（不带 {{}}）
 * - 带大括号语法：{{getvar::name}} / {{.name}} / {{$name}}
 */
function evaluateCondition(condition: string, ctx: MacroContext): boolean {
  // 先替换条件中的 getvar/getglobalvar（支持 ST 标准裸语法与带大括号语法）
  let cond = condition;
  // ST 标准裸语法：getvar::name（不带 {{}}，ST 官方 if 条件主要用这种）
  cond = cond.replace(/\bgetvar::([a-zA-Z_]\w*)/g, (_m, name: string) => ctx.local[name.trim()] ?? '');
  cond = cond.replace(/\bgetglobalvar::([a-zA-Z_]\w*)/g, (_m, name: string) => ctx.global[name.trim()] ?? '');
  // 带大括号语法：{{getvar::name}} / {{getglobalvar::name}}
  cond = cond.replace(/\{\{getvar::([^}]+)\}\}/g, (_m, name: string) => ctx.local[name.trim()] ?? '');
  cond = cond.replace(/\{\{getglobalvar::([^}]+)\}\}/g, (_m, name: string) => ctx.global[name.trim()] ?? '');
  // 简写：{{.name}} / {{$name}}
  cond = cond.replace(/\{\{\.([^}]+)\}\}/g, (_m, name: string) => {
    const trimmed = name.trim();
    if (!trimmed.includes('=')) return ctx.local[trimmed] ?? '';
    return _m;
  });
  cond = cond.replace(/\{\{\$([^}]+)\}\}/g, (_m, name: string) => {
    const trimmed = name.trim();
    if (!trimmed.includes('=')) return ctx.global[trimmed] ?? '';
    return _m;
  });

  cond = cond.trim();

  // == 比较
  const eqMatch = cond.match(/^(.+?)\s*==\s*(.+)$/);
  if (eqMatch) {
    return eqMatch[1].trim() === eqMatch[2].trim();
  }

  // != 比较
  const neqMatch = cond.match(/^(.+?)\s*!=\s*(.+)$/);
  if (neqMatch) {
    return neqMatch[1].trim() !== neqMatch[2].trim();
  }

  // 裸字符串：非空为 true
  return cond.length > 0 && cond !== 'false' && cond !== '0';
}

/**
 * 执行赋值宏（不处理读取）。在 processIfBlocks 之前跑，
 * 让 if 条件能读到本回合刚刚赋的值。
 * - {{setvar::name::value}}
 * - {{setglobalvar::name::value}}
 * - {{.name = value}}（局部赋值简写）
 * - {{$name = value}}（全局赋值简写）
 *
 * 已知限制：if 块内部的 setvar 也会被这里无条件执行。
 */
function executeAssignments(text: string, ctx: MacroContext): string {
  let result = text;

  // {{setvar::name::value}}
  result = result.replace(/\{\{setvar::([^:}]+)::([^}]*)\}\}/g, (_m, name: string, value: string) => {
    ctx.local[name.trim()] = value.trim();
    return ''; // setvar 不输出内容
  });

  // {{setglobalvar::name::value}}
  result = result.replace(/\{\{setglobalvar::([^:}]+)::([^}]*)\}\}/g, (_m, name: string, value: string) => {
    ctx.global[name.trim()] = value.trim();
    return '';
  });

  // 简写：{{.name = value}}（局部赋值）—— 必须在 {{.name}} 读取之前匹配
  result = result.replace(/\{\{\.(\w+)\s*=\s*([^}]+)\}\}/g, (_m, name: string, value: string) => {
    ctx.local[name.trim()] = value.trim();
    return '';
  });

  // 简写：{{$name = value}}（全局赋值）—— 必须在 {{$name}} 读取之前匹配
  result = result.replace(/\{\{\$(\w+)\s*=\s*([^}]+)\}\}/g, (_m, name: string, value: string) => {
    ctx.global[name.trim()] = value.trim();
    return '';
  });

  return result;
}

/**
 * 替换读取宏（不处理赋值）。在 processIfBlocks 之后跑，
 * 把 if 选中分支里残留的 getvar 替换为实际值。
 * - {{getvar::name}}
 * - {{getglobalvar::name}}
 * - {{.name}}（局部读取简写）
 * - {{$name}}（全局读取简写）
 */
function processReads(text: string, ctx: MacroContext): string {
  let result = text;

  // {{getvar::name}}
  result = result.replace(/\{\{getvar::([^}]+)\}\}/g, (_m, name: string) => {
    return ctx.local[name.trim()] ?? '';
  });

  // {{getglobalvar::name}}
  result = result.replace(/\{\{getglobalvar::([^}]+)\}\}/g, (_m, name: string) => {
    return ctx.global[name.trim()] ?? '';
  });

  // 简写：{{.name}}（局部读取）
  result = result.replace(/\{\{\.(\w+)\}\}/g, (_m, name: string) => {
    return ctx.local[name.trim()] ?? '';
  });

  // 简写：{{$name}}（全局读取）
  result = result.replace(/\{\{\$(\w+)\}\}/g, (_m, name: string) => {
    return ctx.global[name.trim()] ?? '';
  });

  return result;
}

/**
 * 批量处理多个模块的文本。共享同一个 MacroContext，
 * 这样前面的模块 setvar 的变量可以被后面的模块 getvar 读取。
 *
 * @param texts 多个模块的文本数组
 * @param ctx 宏变量上下文
 * @returns 处理后的文本数组
 */
export function processMacrosBatch(texts: string[], ctx: MacroContext): string[] {
  return texts.map((text) => processMacros(text, ctx));
}
