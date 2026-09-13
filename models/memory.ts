export type 记忆压缩层级 = 'short' | 'middle' | 'long';
export type 记忆失败代码 = 'request_failed' | 'empty_output' | 'source_changed';
export type 记忆失败草稿状态 = 'pending' | 'retrying' | 'resolved' | 'ignored';
export type 记忆字段 = '即时记忆' | '短期记忆' | '中期记忆' | '长期记忆';

export interface 记忆失败草稿 {
  id: string;
  kind: 记忆压缩层级;
  status: 记忆失败草稿状态;
  /** 失败发生回合。 */
  turn: number;
  /** 失败请求实际使用的原始批次；有界内不截断，超界不建草稿。 */
  items: string[];
  /** 失败时的压缩提示词快照，重试按快照执行。 */
  prompt: string;
  failureCode: 记忆失败代码;
  failureMessage: string;
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface 记忆系统 {
  即时记忆: string[];
  短期记忆: string[];
  /** 中期记忆：由多条短期记忆再压缩，承接阶段性剧情链。 */
  中期记忆: string[];
  /** 长期记忆：由多条中期记忆再压缩，保留稳定事实。 */
  长期记忆: string[];
  /** 自动总结失败时保留的原始批次；重试或忽略后作为历史保留。 */
  失败草稿: 记忆失败草稿[];
}

/** 未处理草稿上限：超过后裁掉最旧的 pending。 */
export const MEMORY_DRAFT_MAX_PENDING = 3;
/** 草稿总上限：超过后先裁最旧的历史（resolved/ignored），再裁最旧 pending。 */
export const MEMORY_DRAFT_MAX_TOTAL = 8;
export const MEMORY_DRAFT_ITEM_CHAR_LIMIT = 2000;
export const MEMORY_DRAFT_TOTAL_CHAR_LIMIT = 16000;
export const MEMORY_DRAFT_PROMPT_CHAR_LIMIT = 4000;

export const 记忆压缩层级表: Record<记忆压缩层级, { 来源: 记忆字段; 目标: 记忆字段; 标签: string }> = {
  short: { 来源: '即时记忆', 目标: '短期记忆', 标签: '即时 → 短期' },
  middle: { 来源: '短期记忆', 目标: '中期记忆', 标签: '短期 → 中期' },
  long: { 来源: '中期记忆', 目标: '长期记忆', 标签: '中期 → 长期' },
};

export function 创建空记忆系统(): 记忆系统 {
  return {
    即时记忆: [],
    短期记忆: [],
    中期记忆: [],
    长期记忆: [],
    失败草稿: [],
  };
}

/** 超出边界返回 null：宁可走本地摘要，也不保存半份无法安全重试的快照。 */
export function 构建记忆失败草稿(input: {
  kind: 记忆压缩层级;
  turn: number;
  items: string[];
  prompt: string;
  failureCode: Exclude<记忆失败代码, 'source_changed'>;
  failureMessage: string;
  now: number;
}): 记忆失败草稿 | null {
  const items = input.items.filter((item) => item.trim());
  if (!items.length) return null;
  if (items.some((item) => item.length > MEMORY_DRAFT_ITEM_CHAR_LIMIT)) return null;
  if (items.reduce((sum, item) => sum + item.length, 0) > MEMORY_DRAFT_TOTAL_CHAR_LIMIT) return null;
  if (input.prompt.length > MEMORY_DRAFT_PROMPT_CHAR_LIMIT) return null;
  return {
    id: `memdraft_${input.kind}_${input.turn}_${input.now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    kind: input.kind,
    status: 'pending',
    turn: Math.max(1, Math.trunc(input.turn) || 1),
    items: [...items],
    prompt: input.prompt,
    failureCode: input.failureCode,
    failureMessage: input.failureMessage,
    attemptCount: 0,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** 同 kind 且快照仍等于队头的 pending 草稿会阻塞该层自动压缩，避免重复造草稿。 */
export function 查找阻塞记忆草稿(
  drafts: 记忆失败草稿[],
  kind: 记忆压缩层级,
  items: string[],
): 记忆失败草稿 | undefined {
  return drafts.find((draft) =>
    (draft.status === 'pending' || draft.status === 'retrying')
    && draft.kind === kind
    && draft.items.length === items.length
    && draft.items.every((item, index) => item === items[index]));
}

export function 更新记忆草稿(
  drafts: 记忆失败草稿[],
  id: string,
  patch: Partial<Omit<记忆失败草稿, 'id'>>,
  now: number,
): 记忆失败草稿[] {
  return drafts.map((draft) => (draft.id === id ? { ...draft, ...patch, updatedAt: now } : draft));
}

export function 剪裁记忆草稿(drafts: 记忆失败草稿[]): 记忆失败草稿[] {
  const result: 记忆失败草稿[] = [];
  for (const draft of drafts) {
    const existing = result.findIndex((item) => item.id === draft.id);
    if (existing >= 0) result[existing] = draft;
    else result.push(draft);
  }
  const isPending = (draft: 记忆失败草稿) => draft.status === 'pending' || draft.status === 'retrying';
  const removeOldest = (predicate: (draft: 记忆失败草稿) => boolean): boolean => {
    const index = result.findIndex(predicate);
    if (index < 0) return false;
    result.splice(index, 1);
    return true;
  };
  while (result.filter(isPending).length > MEMORY_DRAFT_MAX_PENDING) {
    if (!removeOldest(isPending)) break;
  }
  while (result.length > MEMORY_DRAFT_MAX_TOTAL) {
    if (!removeOldest((draft) => !isPending(draft)) && !removeOldest(isPending)) break;
  }
  return result;
}

export type 记忆草稿应用结果 = 'applied' | 'source_changed';

/** 按快照移除源层条目并追加摘要；源层已无快照条目时判为过期，草稿置 ignored。 */
export function 应用记忆草稿摘要(
  memory: 记忆系统,
  draft: 记忆失败草稿,
  summary: string,
  now: number,
): { memory: 记忆系统; outcome: 记忆草稿应用结果 } {
  const layer = 记忆压缩层级表[draft.kind];
  const source = memory[layer.来源];
  const snapshot = new Set(draft.items);
  const remaining = source.filter((item) => !snapshot.has(item));
  if (remaining.length === source.length) {
    return {
      memory: {
        ...memory,
        失败草稿: 更新记忆草稿(memory.失败草稿, draft.id, {
          status: 'ignored',
          failureCode: 'source_changed',
          failureMessage: '原始批次已被修改，草稿作废。',
        }, now),
      },
      outcome: 'source_changed',
    };
  }
  const moved = 移动记忆层(memory, draft.kind, remaining, summary);
  return {
    memory: {
      ...moved,
      失败草稿: 更新记忆草稿(memory.失败草稿, draft.id, {
        status: 'resolved',
        attemptCount: draft.attemptCount + 1,
      }, now),
    },
    outcome: 'applied',
  };
}

/** 把一层记忆替换为 remaining 并把摘要追加到目标层。 */
export function 移动记忆层(memory: 记忆系统, kind: 记忆压缩层级, remaining: string[], summary: string): 记忆系统 {
  switch (kind) {
    case 'short':
      return { ...memory, 即时记忆: remaining, 短期记忆: [...memory.短期记忆, summary] };
    case 'middle':
      return { ...memory, 短期记忆: remaining, 中期记忆: [...memory.中期记忆, summary] };
    case 'long':
      return { ...memory, 中期记忆: remaining, 长期记忆: [...memory.长期记忆, summary] };
  }
}

export function 归一化记忆系统(input?: unknown): { value: 记忆系统; issues: string[] } {
  const issues: string[] = [];
  const raw = (input ?? {}) as Record<string, unknown>;
  const value: 记忆系统 = {
    即时记忆: 归一化字符串数组(raw.即时记忆, '即时记忆', issues),
    短期记忆: 归一化字符串数组(raw.短期记忆, '短期记忆', issues),
    中期记忆: 归一化字符串数组(raw.中期记忆, '中期记忆', issues),
    长期记忆: 归一化字符串数组(raw.长期记忆, '长期记忆', issues),
    失败草稿: 剪裁记忆草稿(归一化记忆草稿(raw.失败草稿, issues)),
  };
  return { value, issues };
}

function 归一化字符串数组(input: unknown, label: string, issues: string[]): string[] {
  if (!Array.isArray(input)) {
    if (input !== undefined) issues.push(`${label} 不是数组，已置空。`);
    return [];
  }
  const result = input.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (result.length !== input.length) issues.push(`${label} 含 ${input.length - result.length} 条非法项，已清除。`);
  return result;
}

const 合法层级: readonly 记忆压缩层级[] = ['short', 'middle', 'long'];
const 合法状态: readonly 记忆失败草稿状态[] = ['pending', 'retrying', 'resolved', 'ignored'];
const 合法失败码: readonly 记忆失败代码[] = ['request_failed', 'empty_output', 'source_changed'];

function 归一化记忆草稿(input: unknown, issues: string[]): 记忆失败草稿[] {
  if (!Array.isArray(input)) {
    if (input !== undefined) issues.push('失败草稿不是数组，已置空。');
    return [];
  }
  const result: 记忆失败草稿[] = [];
  for (const item of input) {
    const draft = 校验记忆草稿(item, issues);
    if (draft) result.push(draft);
  }
  if (result.length !== input.length) issues.push(`失败草稿含 ${input.length - result.length} 条非法项，已清除。`);
  return result;
}

function 校验记忆草稿(input: unknown, issues: string[]): 记忆失败草稿 | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : '';
  const kind = 合法层级.includes(raw.kind as 记忆压缩层级) ? (raw.kind as 记忆压缩层级) : null;
  const status = 合法状态.includes(raw.status as 记忆失败草稿状态) ? (raw.status as 记忆失败草稿状态) : null;
  const items = Array.isArray(raw.items)
    ? raw.items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const failureCode = 合法失败码.includes(raw.failureCode as 记忆失败代码)
    ? (raw.failureCode as 记忆失败代码)
    : 'request_failed';
  if (!id || !kind || !status || !items.length) {
    if (id) issues.push(`失败草稿 ${id} 字段非法，已清除。`);
    return null;
  }
  if (
    items.some((item) => item.length > MEMORY_DRAFT_ITEM_CHAR_LIMIT)
    || items.reduce((sum, item) => sum + item.length, 0) > MEMORY_DRAFT_TOTAL_CHAR_LIMIT
  ) {
    issues.push(`失败草稿 ${id} 快照超出边界，已清除。`);
    return null;
  }
  const promptRaw = typeof raw.prompt === 'string' ? raw.prompt : '';
  if (promptRaw.length > MEMORY_DRAFT_PROMPT_CHAR_LIMIT) issues.push(`失败草稿 ${id} 提示词过长，已截断。`);
  return {
    id,
    kind,
    // 瞬态不落盘复活：崩溃时中断的重试在下次水合按待处理处理。
    status: status === 'retrying' ? 'pending' : status,
    turn: 非负整数(raw.turn, 1),
    items,
    prompt: promptRaw.slice(0, MEMORY_DRAFT_PROMPT_CHAR_LIMIT),
    failureCode,
    failureMessage: typeof raw.failureMessage === 'string' ? raw.failureMessage : '',
    attemptCount: 非负整数(raw.attemptCount, 0),
    createdAt: 非负整数(raw.createdAt, 0),
    updatedAt: 非负整数(raw.updatedAt, 0),
  };
}

function 非负整数(input: unknown, fallback: number): number {
  const value = Math.trunc(Number(input));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
