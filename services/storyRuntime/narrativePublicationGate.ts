// G1.3.1 narrativePublicationGate：正文发布门（先于所有可见写入）。
// - 检查终态复演、终态复活、无推进、多单元强推、玩家行动未承接、未来跳跃、知识泄漏、未注册涌现事件；
// - allow_reframed 只能把已发生事件改写成后果/回忆/新实例候选，不能把原始复演当作新事实；
// - retry 必须有固定最大次数和允许的重写操作；耗尽后 hold（保留草稿不 reveal）；
// - 只有 gate 接受的 acceptedBodyFingerprint 才能与 commit receipt 绑定；
// - gate 拒绝前 body 不能进入 streamingMessage/chatHistory/历史窗口/变量/新闻/手机/记忆/Tavern prompt。
import type { NarrativeConsistencyCode, NarrativeRewriteOperation } from '../../models/storyRuntimeNarrative';
import { canonicalJsonStringify } from './normalization';

export type NarrativeGateOutcome = 'allow' | 'allow_reframed' | 'retry' | 'reject' | 'hold';

export interface NarrativeGateInput {
  rawBody: string;
  /** 正文 canonical bytes 的 SHA-256 fingerprint（由调用方用 Web Crypto 计算） */
  candidateBodyFingerprint: string;
  snapshot: { worldEvents: Array<{ eventInstanceId: string; status: string }>; factLedger: Array<{ factId: string }>; focus: { status: string }; runtimeRevision: number };
  extractResult?: { candidates: Array<{ eventInstanceId: string; evidenceRefs: unknown[]; evidenceLevel: string }> };
  /** 正文声明的完成单元 ID（multi_unit 判定） */
  claimedUnitIds: string[];
  /** 有独立证据的候选单元 ID（由 extractor 结果推导） */
  evidencedUnitIds?: string[];
  violationCodes?: NarrativeConsistencyCode[];
  retryCount?: number;
}

export interface NarrativeGateResult {
  outcome: NarrativeGateOutcome;
  codes: NarrativeConsistencyCode[];
  acceptedBodyFingerprint?: string;
  rewriteOperation?: NarrativeRewriteOperation;
  message: string;
}

export const MAX_RETRY = 3;
export const ALLOWED_REWRITES: NarrativeRewriteOperation[] = ['reframe_as_consequence', 'remove_unsupported_claims', 'continue_current_focus'];

/** 一致性检查：返回违规码列表（纯函数）。 */
export function checkNarrativeConsistency(input: NarrativeGateInput): NarrativeConsistencyCode[] {
  const codes: NarrativeConsistencyCode[] = [];
  // 终态复演 / 终态复活：claimed 单元引用已终态事件。
  for (const event of input.snapshot.worldEvents) {
    if (['resolved', 'cancelled', 'superseded', 'missed', 'archived'].includes(event.status)) {
      if (input.claimedUnitIds.some((u) => u === event.eventInstanceId)) codes.push('terminal_event_resurrection');
    }
  }
  // 无推进：没有 claimed 单元且没有"有效证据候选"（零证据 mentioned candidate 不算已推进）。
  const hasCandidates = input.extractResult && input.extractResult.candidates.some((c) => c.evidenceRefs.length > 0);
  if (input.claimedUnitIds.length === 0 && !hasCandidates && input.rawBody.trim().length > 0) {
    codes.push('narrative_no_progress');
  }
  // 多单元强推：声明完成的单元多于有独立证据的候选单元 -> 不得 allow（必须 retry/reject，直到删除无证据完成声明或补齐证据）。
  if (input.claimedUnitIds.length > 1) {
    const evidenced = input.evidencedUnitIds ?? [];
    const claimedWithoutEvidence = input.claimedUnitIds.filter((u) => !evidenced.includes(u));
    if (claimedWithoutEvidence.length > 0) codes.push('narrative_multi_unit');
  }
  // 玩家行动未承接：玩家输入但无对应候选（由调用方注入 violationCodes 补充）。
  // 未来跳跃 / 知识泄漏 / 未注册涌现事件：由调用方通过 violationCodes 显式注入（gate 不自猜）。
  for (const code of input.violationCodes ?? []) {
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

/**
 * 发布门：返回 allow/allow_reframed/retry/reject/hold。
 * - reject：终态复演/复活/知识泄漏等硬违规；
 * - allow_reframed：只允许把已发生事件改写为后果/回忆/新实例候选（不 reveal 原正文）；
 * - retry：无推进/多单元强推等软违规且 retryCount < MAX_RETRY；
 * - hold：retry 耗尽后保留草稿。
 */
export function evaluateNarrativeGate(input: NarrativeGateInput): NarrativeGateResult {
  const codes = checkNarrativeConsistency(input);
  const hardBlock = codes.some((c) => c === 'terminal_event_resurrection' || c === 'illegal_narrative_replay' || c === 'knowledge_leak');
  // narrative_multi_unit（无证据完成声明）与 narrative_no_progress 都是软违规：必须 retry/hold，不得 allow。
  const softBlock = codes.some((c) => c === 'narrative_no_progress' || c === 'narrative_multi_unit'
    || c === 'unsupported_future_leap' || c === 'player_action_not_accepted' || c === 'unregistered_emergent_event');

  if (hardBlock) {
    // 复演已发生事件：允许改写为后果/回忆（allow_reframed），不能把原始复演当作新事实。
    if (codes.includes('terminal_event_resurrection')) {
      return { outcome: 'allow_reframed', codes, rewriteOperation: 'reframe_as_consequence', message: '终态复演：只允许改写为后果/回忆/新实例候选' };
    }
    return { outcome: 'reject', codes, message: '硬违规：正文不得进入任何可见或下游写入口' };
  }
  if (softBlock) {
    const retryCount = input.retryCount ?? 0;
    if (retryCount < MAX_RETRY) {
      return { outcome: 'retry', codes, message: '软违规：固定最大重试次数内可重写' };
    }
    return { outcome: 'hold', codes, message: '重试耗尽：保留草稿但不 reveal' };
  }
  // 只有 gate 接受的 body fingerprint 才能与 commit receipt 绑定（与 raw body canonical 一致）。
  return { outcome: 'allow', codes, acceptedBodyFingerprint: input.candidateBodyFingerprint, message: '正文通过发布门' };
}

/** 正文是否已进入任何下游（纯检查，供记录器断言）。 */
export function bodyWouldEnterDownstream(outcome: NarrativeGateOutcome): boolean {
  return outcome === 'allow';
}

export { canonicalJsonStringify };
