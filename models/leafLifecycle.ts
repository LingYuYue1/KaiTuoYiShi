/**
 * 活跃叶子瞬态字段的声明式生命周期（kernelization.md K3）。
 *
 * 字段清单只在本文件出现一次：封版剥离（strip）、新叶子/分叉重置（reset）与
 * 水合边界归一化（normalize）共用同一清单。字段特定的默认值与校验只住在
 * normalizeEphemeralFields；strip / reset 不点名任何具体字段。
 * 新增瞬态字段时只需扩展清单与归一化逻辑。
 */
import { OPENING_INPUT } from './opening';

/** 瞬态字段唯一清单：封版剥离与下一叶子重置都遍历它。 */
const EPHEMERAL_LEAF_FIELDS = ['pendingOpeningTrigger'] as const;

export type EphemeralFieldName = (typeof EPHEMERAL_LEAF_FIELDS)[number];

export interface EphemeralFieldIssue {
  field: EphemeralFieldName;
  reason: string;
  raw: unknown;
}

/** 归一化后的瞬态字段值。 */
export interface NormalizedEphemeralFields {
  pendingOpeningTrigger: string | null;
}

/** 封版载荷：剥离全部已声明瞬态字段，不进入检查点。 */
export function stripEphemeralFields<T extends object>(payload: T): T {
  const keys = new Set<string>(EPHEMERAL_LEAF_FIELDS);
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!keys.has(key)) cleaned[key] = value;
  }
  return cleaned as T;
}

/** 新叶子 / 分叉载荷：按清单把瞬态字段重置为默认值，不继承前驱值。 */
export function resetEphemeralFields<T extends object>(payload: T): T {
  const defaults = normalizeEphemeralFields({}).fields;
  const next = { ...payload } as Record<string, unknown>;
  for (const key of EPHEMERAL_LEAF_FIELDS) {
    next[key] = defaults[key];
  }
  return next as T;
}

/**
 * 边界归一化（K5 hydrate 专用）：字段特定的默认值、合法性规则只在这里。
 * 非法值返回 issue 且显式置默认值，不做静默兜底；调用方负责记录 issue
 * 并按需写回清理后的叶子。
 */
export function normalizeEphemeralFields(raw: unknown): {
  fields: NormalizedEphemeralFields;
  issues: EphemeralFieldIssue[];
} {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const fields: NormalizedEphemeralFields = { pendingOpeningTrigger: null };
  const issues: EphemeralFieldIssue[] = [];
  const rawTrigger = source.pendingOpeningTrigger;
  if (rawTrigger !== null && typeof rawTrigger !== 'undefined') {
    if (rawTrigger === OPENING_INPUT) {
      fields.pendingOpeningTrigger = OPENING_INPUT;
    } else {
      issues.push({ field: 'pendingOpeningTrigger', reason: '不是合法的开局引导输入', raw: rawTrigger });
    }
  }
  return { fields, issues };
}
