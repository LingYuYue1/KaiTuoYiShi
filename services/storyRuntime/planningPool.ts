// G1.3.1 planningPool：玩家/世界规划池管理（只管理候选，不拥有事实写权）。
// - 三层分开保存：玩家线规划池、世界后台事件池、交汇队列（convergenceQueue 单独模块）；
// - 规划项状态改变必须有证据或明确命令来源；未来资产/新闻预告/模型计划不能直接改 completed；
// - 玩家不接受交汇项 -> 交汇项保持 available/offered/declined，不能反向推进玩家焦点；
// - 玩家偏离主线 -> 生成桥接/后果候选，不强行把焦点跳回原章节；
// - 规划池不直接写事实账本、不发布新闻、不授予知识。
import type { PlayerPlanItem, PlayerPlanItemStatus, WorldPlanItem, WorldPlanItemStatus, GameTime, EvidenceRef, StoryRuntimeState } from '../../models/storyRuntime';
import type { IdAllocator } from './runtimeCore';

export type PlanResult = { ok: true; state: StoryRuntimeState } | { ok: false; code: string; message: string };

const PLAYER_STATUS: PlayerPlanItemStatus[] = ['available', 'selected', 'blocked', 'expired', 'completed', 'replaced'];
const WORLD_STATUS: WorldPlanItemStatus[] = ['scheduled', 'active', 'blocked', 'expired', 'fulfilled', 'cancelled'];

// 终态：completed/fulfilled/replaced/expired/cancelled 不能由普通 upsert 回到 available/scheduled。
const PLAYER_TERMINAL = new Set<PlayerPlanItemStatus>(['completed', 'expired', 'replaced']);
const WORLD_TERMINAL = new Set<WorldPlanItemStatus>(['fulfilled', 'expired', 'cancelled']);

// D1：世界规划显式迁移表（普通 upsert 只能走表内合法迁移；终态不得回到 scheduled/active/blocked）。
const WORLD_PLAN_TRANSITIONS: Record<WorldPlanItemStatus, WorldPlanItemStatus[]> = {
  scheduled: ['active', 'blocked', 'expired', 'fulfilled', 'cancelled'],
  active: ['scheduled', 'blocked', 'expired', 'fulfilled', 'cancelled'],
  blocked: ['scheduled', 'active', 'expired', 'fulfilled', 'cancelled'],
  expired: [],
  fulfilled: [],
  cancelled: [],
};
// D2：玩家规划状态正反矩阵（终态不得回到 available/selected/blocked）。
const PLAYER_PLAN_TRANSITIONS: Record<PlayerPlanItemStatus, PlayerPlanItemStatus[]> = {
  available: ['selected', 'blocked', 'expired', 'completed', 'replaced'],
  selected: ['available', 'blocked', 'expired', 'completed', 'replaced'],
  blocked: ['available', 'selected', 'expired', 'completed', 'replaced'],
  expired: [],
  completed: [],
  replaced: [],
};

/** upsert 玩家规划项：仅改变 status/dependencyFactIds/evidenceRefs 等候选字段，不写事实。 */
export function upsertPlayerPlanItem(
  state: StoryRuntimeState,
  input: {
    planItemId: string;
    unitId?: string;
    status?: PlayerPlanItemStatus;
    dependencyFactIds?: string[];
    acceptanceModes?: PlayerPlanItem['acceptanceModes'];
    expiresAt?: GameTime;
    evidenceRefs?: EvidenceRef[];
    statusReason?: string;
  },
): PlanResult {
  if (input.status && !PLAYER_STATUS.includes(input.status)) {
    return { ok: false, code: 'INVALID_COMMAND', message: '非法玩家规划状态: ' + input.status };
  }
  const existing = state.playerPlanPool.find((p) => p.planItemId === input.planItemId);
  // 显式迁移表：终态不能由普通 upsert 复活回非终态；非终态之间的迁移也必须在表内（如需 correction
  // 必须走显式替代语义并保留旧项，不能借普通 upsert 复活旧项）。
  if (existing && input.status && input.status !== existing.status) {
    if (!(PLAYER_PLAN_TRANSITIONS[existing.status] ?? []).includes(input.status)) {
      return { ok: false, code: 'CONFLICT', message: '非法玩家规划迁移: ' + existing.status + ' -> ' + input.status + '（' + input.planItemId + '）' };
    }
  }
  // 新建或既有：进入 completed 都必须有证据（未来资产/新闻预告/模型计划不能直接完成）。
  if (input.status === 'completed' && (!input.evidenceRefs || input.evidenceRefs.length === 0)) {
    return { ok: false, code: 'MISSING_EVIDENCE', message: '规划项完成必须有证据: ' + input.planItemId };
  }
  const next: PlayerPlanItem = existing
    ? (() => {
        const merged: PlayerPlanItem = { ...existing, status: input.status ?? existing.status, dependencyFactIds: input.dependencyFactIds ?? existing.dependencyFactIds, acceptanceModes: input.acceptanceModes ?? existing.acceptanceModes, evidenceRefs: input.evidenceRefs ?? existing.evidenceRefs };
        const expiresAt = input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt;
        if (expiresAt !== undefined) merged.expiresAt = expiresAt;
        return merged;
      })()
    : (() => {
        const base: PlayerPlanItem = { planItemId: input.planItemId, unitId: input.unitId, status: input.status ?? 'available', dependencyFactIds: input.dependencyFactIds ?? [], acceptanceModes: input.acceptanceModes ?? [], evidenceRefs: input.evidenceRefs ?? [] };
        if (input.expiresAt !== undefined) base.expiresAt = input.expiresAt;
        return base;
      })();
  const playerPlanPool = existing
    ? state.playerPlanPool.map((p) => (p.planItemId === input.planItemId ? next : p))
    : [...state.playerPlanPool, next];
  return { ok: true, state: { ...state, playerPlanPool } };
}

/** upsert 世界后台规划项：事件定义驱动，不直接写事实。 */
export function upsertWorldPlanItem(
  state: StoryRuntimeState,
  input: {
    planItemId: string;
    eventDefinitionId: string;
    status?: WorldPlanItemStatus;
    dueAt?: GameTime;
    dependencyIds?: string[];
    publicScheduleId?: string;
    consequenceDefinitionIds?: string[];
    evidenceRefs?: EvidenceRef[];
  },
): PlanResult {
  if (input.status && !WORLD_STATUS.includes(input.status)) {
    return { ok: false, code: 'INVALID_COMMAND', message: '非法世界规划状态: ' + input.status };
  }
  if (input.status === 'fulfilled' && (!input.evidenceRefs || input.evidenceRefs.length === 0)) {
    return { ok: false, code: 'MISSING_EVIDENCE', message: '世界规划项完成必须有证据: ' + input.planItemId };
  }
  const existing = state.worldPlanPool.find((p) => p.planItemId === input.planItemId);
  // D1：显式迁移表——终态（fulfilled/expired/cancelled）不得回到 scheduled/active/blocked；
  //     非终态之间的迁移也必须在表内（correction/replacement 必须走独立命令和新 ID，不能借普通 upsert 复活旧项）。
  if (existing && input.status && input.status !== existing.status) {
    if (!(WORLD_PLAN_TRANSITIONS[existing.status] ?? []).includes(input.status)) {
      return { ok: false, code: 'CONFLICT', message: '非法世界规划迁移: ' + existing.status + ' -> ' + input.status + '（' + input.planItemId + '）' };
    }
  }
  const next: WorldPlanItem = existing
    ? (() => {
        const merged: WorldPlanItem = { ...existing, status: input.status ?? existing.status, dependencyIds: input.dependencyIds ?? existing.dependencyIds, consequenceDefinitionIds: input.consequenceDefinitionIds ?? existing.consequenceDefinitionIds, evidenceRefs: input.evidenceRefs ?? existing.evidenceRefs };
        const dueAt = input.dueAt !== undefined ? input.dueAt : existing.dueAt;
        if (dueAt !== undefined) merged.dueAt = dueAt;
        const publicScheduleId = input.publicScheduleId !== undefined ? input.publicScheduleId : existing.publicScheduleId;
        if (publicScheduleId !== undefined) merged.publicScheduleId = publicScheduleId;
        return merged;
      })()
    : (() => {
        const base: WorldPlanItem = { planItemId: input.planItemId, eventDefinitionId: input.eventDefinitionId, status: input.status ?? 'scheduled', dependencyIds: input.dependencyIds ?? [], consequenceDefinitionIds: input.consequenceDefinitionIds ?? [], evidenceRefs: input.evidenceRefs ?? [] };
        if (input.dueAt !== undefined) base.dueAt = input.dueAt;
        if (input.publicScheduleId !== undefined) base.publicScheduleId = input.publicScheduleId;
        return base;
      })();
  const worldPlanPool = existing
    ? state.worldPlanPool.map((p) => (p.planItemId === input.planItemId ? next : p))
    : [...state.worldPlanPool, next];
  return { ok: true, state: { ...state, worldPlanPool } };
}

/** 玩家偏离主线 -> 生成桥接/后果候选（不强行跳回原章节）。 */
export async function createBridgeCandidate(
  state: StoryRuntimeState,
  input: { planItemId: string; unitId?: string; reason: string; allocator: IdAllocator },
): Promise<PlanResult> {
  const planItemId = input.planItemId || (await input.allocator('plan:bridge', { unit: input.unitId, reason: input.reason }, ''));
  const item: PlayerPlanItem = {
    planItemId,
    unitId: input.unitId,
    status: 'available',
    dependencyFactIds: [],
    acceptanceModes: [],
    evidenceRefs: [],
  };
  return { ok: true, state: { ...state, playerPlanPool: [...state.playerPlanPool, item] } };
}
