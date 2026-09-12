/**
 * 活跃叶子瞬态字段的声明式生命周期（kernelization.md K3）。
 *
 * 字段名只在 EPHEMERAL_FIELDS 注册表出现一次；封版剥离（seal）、分叉重置（fork）、
 * 下一叶子重置（nextLeaf）与边界归一化都经本模块的泛型助手，生命周期代码不再逐个
 * 点名具体字段。新增瞬态字段时只需补注册表条目。
 */
import { OPENING_INPUT } from './opening';

export type EphemeralFieldName = 'pendingOpeningTrigger';
export type EphemeralResetBoundary = 'seal' | 'fork' | 'nextLeaf';

export interface EphemeralFieldIssue {
  field: string;
  reason: string;
  raw: unknown;
}

interface EphemeralFieldDeclaration {
  defaultValue: unknown;
  resetOn: readonly EphemeralResetBoundary[];
  normalize: (raw: unknown) => { value: unknown; issue?: EphemeralFieldIssue };
}

/** 合法值只有开局常量文本；其余一律判非法并上报 issue，不静默兜底。 */
function normalizeOpeningTrigger(raw: unknown): { value: string | null; issue?: EphemeralFieldIssue } {
  if (raw === null || typeof raw === 'undefined') return { value: null };
  if (raw === OPENING_INPUT) return { value: OPENING_INPUT };
  return {
    value: null,
    issue: { field: 'pendingOpeningTrigger', reason: '不是合法的开局引导输入', raw },
  };
}

/** 瞬态字段唯一声明点。 */
export const EPHEMERAL_FIELDS = {
  pendingOpeningTrigger: {
    defaultValue: null,
    resetOn: ['seal', 'fork', 'nextLeaf'],
    normalize: normalizeOpeningTrigger,
  },
} as const satisfies Record<EphemeralFieldName, EphemeralFieldDeclaration>;

/** 归一化后的瞬态字段值。 */
export interface NormalizedEphemeralFields {
  pendingOpeningTrigger: string | null;
}

function ephemeralKeys(): EphemeralFieldName[] {
  return Object.keys(EPHEMERAL_FIELDS) as EphemeralFieldName[];
}

/** 封版载荷：剥离全部已声明瞬态字段，不进入检查点。 */
export function stripEphemeralFields<T extends object>(payload: T): T {
  const keys = new Set<string>(ephemeralKeys());
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!keys.has(key)) cleaned[key] = value;
  }
  return cleaned as T;
}

/** 新叶子 / 分叉载荷：按声明把瞬态字段重置为默认值，不继承前驱值。 */
export function resetEphemeralFields<T extends object>(
  payload: T,
  boundary: Exclude<EphemeralResetBoundary, 'seal'> = 'nextLeaf',
): T {
  const next = { ...payload } as Record<string, unknown>;
  for (const key of ephemeralKeys()) {
    const declaration = EPHEMERAL_FIELDS[key] as EphemeralFieldDeclaration;
    if (!declaration.resetOn.includes(boundary)) continue;
    next[key] = declaration.defaultValue;
  }
  return next as T;
}

/**
 * 边界归一化（K5 hydrate 专用）：逐个字段校验，非法值返回 issue 且显式置默认值。
 * 调用方负责记录 issue 并按需写回清理后的叶子。
 */
export function normalizeEphemeralFields(raw: unknown): {
  fields: NormalizedEphemeralFields;
  issues: EphemeralFieldIssue[];
} {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const fields: Record<string, unknown> = {};
  const issues: EphemeralFieldIssue[] = [];
  for (const key of ephemeralKeys()) {
    const declaration = EPHEMERAL_FIELDS[key] as EphemeralFieldDeclaration;
    const result = declaration.normalize(source[key]);
    fields[key] = result.value;
    if (result.issue) issues.push(result.issue);
  }
  return { fields: fields as unknown as NormalizedEphemeralFields, issues };
}
