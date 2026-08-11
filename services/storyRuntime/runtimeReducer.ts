// G1.3.1.1 runtimeReducer：确定性核心 reducer 的薄组合入口。
// - 正文发布门先于所有写入：candidateBodyFingerprint = raw body 的真实 Web Crypto SHA-256；
// - 把 extractor 结果（evidencedUnitIds）与结构化 consistency findings 传给 gate
//   （知识泄漏/未来跳跃/玩家行动未承接/未注册涌现事件由调用方显式注入 violationCodes）；
// - retryCount 使用 turn.retryCount（不硬编码 0）；
// - multi_unit 证据不足 -> gate retry/hold/reject，不得 allow；
// - allow_reframed 不 reveal 原正文（改写后的新正文须重新 fingerprint、重新 gate）。
import type { StoryRuntimeState } from '../../models/storyRuntime';
import type { IdAllocator, RuntimeCtx, TurnCommand, TurnResult } from './runtimeCore';
import { executeTurn } from './turnTransaction';
import { evaluateNarrativeGate } from './narrativePublicationGate';
import { extractFactCandidates, bodyFingerprintOf } from './turnFactExtractor';
import { validateCommandStructure, deriveFactsOfInterest } from './commandValidator';
import { sha256Fingerprint } from './id';
import { canonicalJsonStringify } from './normalization';

export interface RuntimeReducerDeps {
  allocator: IdAllocator;
  ctx: RuntimeCtx;
  factsOfInterest: Array<{ eventInstanceId: string; factType: string }>;
  /** 结构化一致性发现（知识泄漏/未来跳跃/玩家行动未承接/未注册涌现事件） */
  consistencyFindings?: Array<{ code: string }>;
}

/**
 * 执行单回合（正文发布门先于任何写入；extractor 结果与 consistency findings 传入 gate）。
 * 完成声明唯一权威入口 = TurnCommand.claimedCompletedUnitIds（gate、回执、事务读取同一份）。
 * gate 拒绝/retry/hold/allow_reframed 时：返回失败结果，正文不进入任何可见/下游写入口。
 */
export async function runRuntimeTurn(turn: TurnCommand, deps: RuntimeReducerDeps): Promise<TurnResult> {
  const allocator = deps.allocator;
  const ctx = deps.ctx;
  // A1/A2：结构闸门先于 idempotency fingerprint、canonical 序列化与 getter 读取。
  // 未知字段/错误 union/symbol/隐藏字段/getter/setter/sparse/undefined/循环引用 -> 稳定 INVALID_COMMAND + path，
  // 旧 state、revision、副作用字节不变（不 throw）。
  const structure = validateCommandStructure(turn.command);
  if (!structure.ok) {
    const invalid: TurnResult = {
      ok: false,
      state: ctx.state,
      receipt: {
        receiptId: turn.turnId + ':receipt', runtimeBranchId: turn.runtimeBranchId, inputRuntimeRevision: turn.expectedRuntimeRevision,
        acceptedCandidateIds: [], rejectedCandidateIds: [], completedUnitIds: [], blockedReasons: [structure.issue.message],
        sourceFactIds: [], outboxIds: [], errorCodes: ['INVALID_COMMAND'], durationMs: 0,
      },
      outbox: [],
      sideEffects: { factLedger: [], outbox: [], knowledgeGrants: [], narrativePublications: [] },
    };
    return invalid;
  }
  // 1. 计算正文真实 fingerprint（raw body canonical 的 Web Crypto SHA-256）。
  const bodyFp = turn.rawBody ? await bodyFingerprintOf(turn.rawBody) : '';
  // 幂等前置检查（先于 gate 与事务）：同 idempotencyKey 不同 payload（含正文改变）-> IDEMPOTENCY_KEY_REUSED；
  // 同 payload -> ALREADY_APPLIED（返回既有结果，零副作用）。
  const commandFingerprint = canonicalJsonStringify({ command: turn.command, bodyFingerprint: bodyFp });
  const idempotencyRecord = ctx.state.commandIdempotencyIndex[turn.idempotencyKey];
  if (idempotencyRecord) {
    if (idempotencyRecord.commandFingerprint !== commandFingerprint) {
      const reused: TurnResult = {
        ok: false,
        state: ctx.state,
        receipt: {
          receiptId: turn.turnId + ':receipt', runtimeBranchId: turn.runtimeBranchId, inputRuntimeRevision: turn.expectedRuntimeRevision,
          acceptedCandidateIds: [], rejectedCandidateIds: [], completedUnitIds: [], blockedReasons: ['不同 payload 冒用同一 idempotencyKey（含正文改变）'],
          sourceFactIds: [], outboxIds: [], errorCodes: ['IDEMPOTENCY_KEY_REUSED'], durationMs: 0,
        },
        outbox: [],
        sideEffects: { factLedger: [], outbox: [], knowledgeGrants: [], narrativePublications: [] },
      };
      return reused;
    }
    const applied: TurnResult = {
      ok: false,
      state: ctx.state,
      receipt: {
        receiptId: idempotencyRecord.receiptId, runtimeBranchId: turn.runtimeBranchId, inputRuntimeRevision: turn.expectedRuntimeRevision,
        outputRuntimeRevision: idempotencyRecord.resultRevision,
        acceptedCandidateIds: [], rejectedCandidateIds: [], completedUnitIds: [], blockedReasons: ['同 idempotencyKey 已应用，返回既有结果'],
        sourceFactIds: [], outboxIds: [], errorCodes: ['ALREADY_APPLIED'], durationMs: 0,
      },
      outbox: [],
      sideEffects: { factLedger: [], outbox: [], knowledgeGrants: [], narrativePublications: [] },
    };
    return applied;
  }
  // 2. 提取候选（occurredAt = 事务明确游戏时间）；resolve/supersede 目标由内核从命令目标派生。
  const interest = deriveFactsOfInterest(deps.factsOfInterest, turn.command);
  const extract = await extractFactCandidates(turn, interest, ctx.state.gameClock.now);
  // B：证据绑定失败（伪造 span / ghost receipt / 伪造类型等）必须整体失败（零写入），不得降级为"无证据"。
  if (!extract.ok) {
    const invalidEvidence: TurnResult = {
      ok: false,
      state: ctx.state,
      receipt: {
        receiptId: turn.turnId + ':receipt', runtimeBranchId: turn.runtimeBranchId, inputRuntimeRevision: turn.expectedRuntimeRevision,
        acceptedCandidateIds: [], rejectedCandidateIds: [], completedUnitIds: [], blockedReasons: [extract.message],
        sourceFactIds: [], outboxIds: [], errorCodes: [extract.code], durationMs: 0,
      },
      outbox: [],
      sideEffects: { factLedger: [], outbox: [], knowledgeGrants: [], narrativePublications: [] },
    };
    return invalidEvidence;
  }
  const evidencedUnitIds = extract.candidates.filter((c) => c.evidenceRefs.length > 0).map((c) => c.eventInstanceId);

  // 3. 正文发布门：先于所有可见写入；完成声明唯一来源 = turn.claimedCompletedUnitIds。
  const claimed = turn.claimedCompletedUnitIds ?? [];
  const violationCodes = (deps.consistencyFindings ?? []).map((f) => f.code) as never[];
  const gateInput = {
    rawBody: turn.rawBody ?? '',
    candidateBodyFingerprint: bodyFp,
    snapshot: {
      worldEvents: ctx.state.worldEvents.map((w) => ({ eventInstanceId: w.eventInstanceId, status: w.status })),
      factLedger: ctx.state.factLedger.map((f) => ({ factId: f.factId })),
      focus: { status: ctx.state.focus.status },
      runtimeRevision: ctx.state.runtimeRevision,
    },
    extractResult: extract.candidates.length > 0 ? { candidates: extract.candidates.map((c) => ({ eventInstanceId: c.eventInstanceId, evidenceRefs: c.evidenceRefs, evidenceLevel: c.evidenceLevel })) } : undefined,
    claimedUnitIds: claimed,
    evidencedUnitIds,
    violationCodes,
    retryCount: turn.retryCount ?? 0,
  };
  const gate = evaluateNarrativeGate(gateInput);
  // 只有 allow 才把正文直接 reveal 并进入下游；reject/retry/hold/allow_reframed 都拦截（零副作用）。
  if (gate.outcome !== 'allow') {
    const empty: TurnResult = {
      ok: false,
      state: ctx.state,
      receipt: {
        receiptId: turn.turnId + ':receipt',
        runtimeBranchId: turn.runtimeBranchId,
        inputRuntimeRevision: turn.expectedRuntimeRevision,
        acceptedCandidateIds: [],
        rejectedCandidateIds: [],
        completedUnitIds: [],
        blockedReasons: [gate.message],
        sourceFactIds: [],
        outboxIds: [],
        errorCodes: [gate.outcome.toUpperCase()],
        durationMs: 0,
      },
      outbox: [],
      sideEffects: { factLedger: [], outbox: [], knowledgeGrants: [], narrativePublications: [] },
    };
    return empty;
  }
  // gate allow：acceptedBodyFingerprint（= 同一正文 fingerprint）与 commit receipt 绑定。
  return executeTurn(turn, {
    allocator,
    ctx,
    factsOfInterest: deps.factsOfInterest,
    narrativeDecision: { outcome: gate.outcome, acceptedBodyFingerprint: gate.acceptedBodyFingerprint, codes: gate.codes },
  });
}

export async function stateFingerprintOf(state: StoryRuntimeState): Promise<string> {
  return sha256Fingerprint(state);
}
