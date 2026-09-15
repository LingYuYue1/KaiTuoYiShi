// 变量修复中心批量草稿（纯域）：扫描进度的可恢复状态机。
// 只建模形态与派生，不触碰存储与 AI；持久化形态由 services/storage/variableRepairDraft 收口，
// 扫描动作由 hooks/useGame/variableRepairCenter 收口。

import type { 变量修复计划 } from '@/models/variableRepair';

/** 草稿状态：只列有生产者的值（单回合扫描失败记在项上，不是草稿状态）。 */
export type 变量修复草稿状态 = 'scanning' | 'paused' | 'ready' | 'completed' | 'cancelled';

export type 变量修复草稿项状态 = 'pending' | 'scanning' | 'ready' | 'failed';

export interface 变量修复草稿项 {
  turn: number;
  targetMessageId: string;
  status: 变量修复草稿项状态;
  计划?: 变量修复计划;
  错误?: string;
}

export interface 变量修复草稿 {
  version: 1;
  state: 变量修复草稿状态;
  /**
   * 扫描起点的变量状态指纹，全批计划共用（计划不再各自重算，避免续扫后两者漂移）。
   * 载入时校验，不匹配即作废；提交时由计划带进 应用变量修复计划 判 STALE_PLAN。
   */
  指纹: string;
  createdAt: number;
  updatedAt: number;
  项: 变量修复草稿项[];
}

export interface 草稿归一化结果 {
  draft?: 变量修复草稿;
  issues: string[];
}

const 草稿状态集: readonly 变量修复草稿状态[] = [
  'scanning', 'paused', 'ready', 'completed', 'cancelled',
];
const 项状态集: readonly 变量修复草稿项状态[] = ['pending', 'scanning', 'ready', 'failed'];

export function 构建变量修复草稿(
  targets: ReadonlyArray<{ turn: number; targetMessageId: string }>,
  指纹: string,
  now?: number,
): 变量修复草稿 {
  const timestamp = now ?? Date.now();
  return {
    version: 1,
    state: 'scanning',
    指纹,
    createdAt: timestamp,
    updatedAt: timestamp,
    项: targets.map((target) => ({
      turn: target.turn,
      targetMessageId: target.targetMessageId,
      status: 'pending',
    })),
  };
}

export function 归一化变量修复草稿(raw: unknown): 草稿归一化结果 {
  const issues: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { issues: ['草稿不是对象。'] };
  }
  const source = raw as Record<string, unknown>;
  if (source.version !== 1) {
    return { issues: [`草稿版本不受支持：${String(source.version)}`] };
  }
  if (
    typeof source.state !== 'string'
    || !草稿状态集.includes(source.state as 变量修复草稿状态)
  ) {
    return { issues: [`草稿状态非法：${String(source.state)}`] };
  }
  if (typeof source.指纹 !== 'string' || source.指纹.length === 0) {
    return { issues: ['草稿指纹缺失。'] };
  }
  if (typeof source.createdAt !== 'number' || typeof source.updatedAt !== 'number') {
    return { issues: ['草稿时间戳缺失。'] };
  }
  if (!Array.isArray(source.项)) {
    return { issues: ['草稿项列表缺失。'] };
  }
  const 项: 变量修复草稿项[] = [];
  source.项.forEach((entry, index) => {
    const 检查 = 归一化草稿项(entry);
    if (检查.item) 项.push(检查.item);
    if (检查.issues.length > 0) {
      for (const issue of 检查.issues) issues.push(`第 ${index + 1} 项被丢弃：${issue}`);
    }
  });
  return {
    draft: {
      version: 1,
      state: source.state as 变量修复草稿状态,
      指纹: source.指纹,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      项,
    },
    issues,
  };
}

function 归一化草稿项(raw: unknown): { item?: 变量修复草稿项; issues: string[] } {
  const issues: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { issues: ['不是对象。'] };
  }
  const source = raw as Record<string, unknown>;
  if (typeof source.targetMessageId !== 'string' || source.targetMessageId.length === 0) {
    return { issues: ['目标消息 ID 缺失。'] };
  }
  if (typeof source.turn !== 'number' || !Number.isFinite(source.turn)) {
    return { issues: ['回合号非法。'] };
  }
  const status = source.status;
  if (typeof status !== 'string' || !项状态集.includes(status as 变量修复草稿项状态)) {
    return { issues: ['项状态非法。'] };
  }
  const 计划 = source.计划;
  if (计划 !== undefined && !计划形态合法(计划)) {
    return { issues: ['修复计划形态非法。'] };
  }
  const item: 变量修复草稿项 = {
    turn: source.turn,
    targetMessageId: source.targetMessageId,
    status: status as 变量修复草稿项状态,
    ...(计划 !== undefined ? { 计划: 计划 as 变量修复计划 } : {}),
    ...(typeof source.错误 === 'string' && source.错误.length > 0 ? { 错误: source.错误 } : {}),
  };
  return { item, issues };
}

function 计划形态合法(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const plan = raw as Record<string, unknown>;
  return plan.schemaVersion === 1
    && typeof plan.turn === 'number'
    && typeof plan.targetMessageId === 'string'
    && typeof plan.baseStateFingerprint === 'string'
    && typeof plan.createdAt === 'number'
    && Array.isArray(plan.items);
}

/** 草稿是否基于旧变量状态（载入时判定用；提交期的过期判定在 应用变量修复计划）。 */
export function 草稿是否过期(draft: 变量修复草稿, 当前指纹: string): boolean {
  return draft.指纹 !== 当前指纹;
}

export function 推进草稿项(
  draft: 变量修复草稿,
  targetMessageId: string,
  patch: { status?: 变量修复草稿项状态; 计划?: 变量修复计划; 错误?: string },
  now?: number,
): 变量修复草稿 {
  const 索引 = draft.项.findIndex((item) => item.targetMessageId === targetMessageId);
  if (索引 < 0) return draft;
  const nextItems = draft.项.map((item, index) => {
    if (index !== 索引) return item;
    return {
      ...item,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.计划 !== undefined ? { 计划: patch.计划 } : {}),
      ...(patch.错误 !== undefined ? { 错误: patch.错误 } : {}),
    };
  });
  return { ...draft, 项: nextItems, updatedAt: now ?? Date.now() };
}

export interface 草稿汇总 {
  total: number;
  pending: number;
  ready: number;
  failed: number;
  /** ready 计划中 safe + confirm 修复项总数（可提交余量）。 */
  可提交项: number;
}

export function 汇总变量修复草稿(draft: 变量修复草稿): 草稿汇总 {
  let pending = 0;
  let ready = 0;
  let failed = 0;
  let 可提交项 = 0;
  for (const item of draft.项) {
    if (item.status === 'ready') {
      ready += 1;
      可提交项 += (item.计划?.items ?? []).filter(
        (entry) => entry.category === 'safe' || entry.category === 'confirm',
      ).length;
    } else if (item.status === 'failed') {
      failed += 1;
    } else {
      pending += 1;
    }
  }
  return { total: draft.项.length, pending, ready, failed, 可提交项 };
}

/** 扫描收敛判定：全部项已 ready / failed 且非空 → 'ready'；否则保持当前状态。 */
export function 完成扫描状态(draft: 变量修复草稿): 变量修复草稿状态 {
  if (
    draft.项.length > 0
    && draft.项.every((item) => item.status === 'ready' || item.status === 'failed')
  ) {
    return 'ready';
  }
  return draft.state;
}
