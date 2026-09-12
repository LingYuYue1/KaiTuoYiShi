/**
 * 活跃叶子瞬态字段的声明式生命周期（kernelization.md K3）。
 *
 * 字段清单只在本文件出现一次：封版剥离（strip）、新叶子/分叉重置（reset）与
 * 水合边界归一化（normalize）共用同一清单。字段特定的默认值与校验只住在
 * normalizeEphemeralFields；strip / reset 不点名任何具体字段。
 * 新增瞬态字段时只需扩展清单与归一化逻辑。
 */
import { normalizeTurnRecoveryContext, type TurnPhase, type TurnRecoveryContext } from './turnRecovery';

/** 瞬态字段唯一清单：封版剥离与下一叶子重置都遍历它。 */
const EPHEMERAL_LEAF_FIELDS = ['turnPhase', 'recoveryContext'] as const;

/**
 * 迁移期只剥不读的旧瞬态字段（ADR 0002）：U2 起 turnPhase / recoveryContext 取代
 * pendingOpeningTrigger。旧叶子行仍可能携带该键，封版时一并剥离，不进入检查点；
 * 它不参与归一化与重置。
 */
const LEGACY_EPHEMERAL_FIELDS = ['pendingOpeningTrigger'] as const;

export type EphemeralFieldName = (typeof EPHEMERAL_LEAF_FIELDS)[number];

export interface EphemeralFieldIssue {
  field: EphemeralFieldName;
  reason: string;
  raw: unknown;
}

/** 归一化后的瞬态字段值。 */
export interface NormalizedEphemeralFields {
  turnPhase: TurnPhase | null;
  recoveryContext: TurnRecoveryContext | null;
}

/** 封版载荷：剥离全部已声明瞬态字段（含迁移期旧字段），不进入检查点。 */
export function stripEphemeralFields<T extends object>(payload: T): T {
  const keys = new Set<string>([...EPHEMERAL_LEAF_FIELDS, ...LEGACY_EPHEMERAL_FIELDS]);
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
  const fields: NormalizedEphemeralFields = { turnPhase: null, recoveryContext: null };
  const issues: EphemeralFieldIssue[] = [];

  const rawPhase = source.turnPhase;
  if (rawPhase !== null && typeof rawPhase !== 'undefined') {
    if (rawPhase === 'awaitingLanding' || rawPhase === 'settling') {
      fields.turnPhase = rawPhase;
    } else {
      issues.push({ field: 'turnPhase', reason: '不是合法的回合相位', raw: rawPhase });
    }
  }

  const context = normalizeTurnRecoveryContext(source.recoveryContext);
  fields.recoveryContext = context.value;
  if (context.issue) {
    issues.push({ field: 'recoveryContext', reason: context.issue, raw: source.recoveryContext });
  }
  // 无相位 = 封版后无状态，恢复上下文必须一并作废。
  if (fields.turnPhase === null) fields.recoveryContext = null;

  return { fields, issues };
}
