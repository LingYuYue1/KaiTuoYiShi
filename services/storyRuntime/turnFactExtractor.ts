// G1.3.1.3 turnFactExtractor：把正文/系统命令/变量候选/gameplay receipt 转成 RuntimeFactCandidate（分级，不提交）。
// - 证据必须引用本回合真实输入，任何一条绑定失败都整体失败（不得跳过仍结算）：
//   narrative_span -> bodyFingerprint==rawBody 真实 SHA-256、offset 整数且 0<=start<end<=len、
//                     textFingerprint==rawBody.slice(start,end) 真实 SHA-256、responseId 绑定本回合；
//   system_command  -> commandId/commandFingerprint 匹配 auxiliary 且 scope.unit==目标单元；
//   gameplay_receipt-> receiptId/receiptType 匹配 auxiliary、绑定 eventInstanceId==目标单元、
//                     同一 receiptId 只绑定一个单元（重复/ghost/伪造类型整体拒绝）；
// - 正文"提及事件 ID"不构成完成证据；
// - resolve/supersede 目标由内核从命令目标派生（factsOfInterest 缺目标时自动补入，禁止静默跳过）；
// - occurredAt 使用事务明确 GameTime（调用方传入，不硬编码）；
// - responseId 不提供生产默认值：narrative_span 证据必须显式绑定本回合 turn.responseId；
// - 无独立证据的单元 -> mentioned 候选（evidenceRefs 空），由事务层跳过。
import type { EvidenceRef, EvidenceRefKind } from '../../models/storyRuntime';
import type { RuntimeFactCandidate, TurnCommand } from './runtimeCore';
import { validateNarrativeSpanEvidence, validateSystemCommandEvidence, validateGameplayReceiptEvidence, deriveFactsOfInterest } from './commandValidator';
import { sha256Fingerprint } from './id';

export type ExtractResult = { ok: true; candidates: RuntimeFactCandidate[] } | { ok: false; code: string; message: string };

const CONFIRMED_KINDS: EvidenceRefKind[] = ['narrative_span', 'system_command', 'gameplay_receipt'];

/** 正文 fingerprint：raw body canonical bytes 的 Web Crypto SHA-256。 */
export async function bodyFingerprintOf(rawBody: string): Promise<string> {
  return sha256Fingerprint(rawBody);
}

/**
 * 将 TurnCommand 的正文/auxiliary 输入分级为事实候选。
 * 每条证据逐项与本回合真实输入核对；伪造/虚构/篡改/幽灵证据导致整体失败（不落盘任何 fact）。
 */
export async function extractFactCandidates(
  turn: TurnCommand,
  factsOfInterest: Array<{ eventInstanceId: string; factType: string }>,
  now: { dayOrdinal: number; minuteOfDay: number },
): Promise<ExtractResult> {
  if (turn === null || typeof turn !== 'object') {
    return { ok: false, code: 'INVALID_COMMAND', message: 'turn 输入未知，无法提取' };
  }
  const rawBody = turn.rawBody ?? '';
  // 不提供生产默认 responseId：narrative_span 证据必须显式绑定本回合响应身份。
  const responseId = turn.responseId ?? '';
  const cmd = turn.command as { kind?: string; target?: { eventInstanceId: string }; evidenceRefs?: EvidenceRef[] };
  const cmdTargetId = (cmd.kind === 'resolve_event_instance' || cmd.kind === 'supersede_event_instance') && cmd.target
    ? cmd.target.eventInstanceId
    : null;
  // C3：内核从命令目标派生，禁止"factsOfInterest 无目标仍结算"。
  const interestList = deriveFactsOfInterest(factsOfInterest, cmd);

  const candidates: RuntimeFactCandidate[] = [];
  for (const interest of interestList) {
    const unitEvidence: EvidenceRef[] = [];
    const kinds = new Set<EvidenceRefKind>();
    // system command：必须匹配本回合 auxiliary 且 scope.unit==目标单元。
    for (const sys of turn.auxiliary?.validatedSystemCommands ?? []) {
      if (sys.scope?.unit === interest.eventInstanceId) {
        const v = validateSystemCommandEvidence({ commandId: sys.commandId, commandFingerprint: sys.commandFingerprint }, turn.auxiliary, interest.eventInstanceId, 'evidenceRefs');
        if (!v.ok) return { ok: false, code: v.issue.code, message: v.issue.message };
        unitEvidence.push({ kind: 'system_command', commandId: sys.commandId, commandFingerprint: sys.commandFingerprint });
        kinds.add('system_command');
      }
    }
    // gameplay receipt：必须匹配 auxiliary 且绑定目标单元；重复/ghost/伪造类型整体失败。
    for (const receipt of turn.auxiliary?.gameplayReceipts ?? []) {
      if (receipt.eventInstanceId !== interest.eventInstanceId) continue;
      const v = validateGameplayReceiptEvidence({ receiptId: receipt.receiptId, receiptType: receipt.receiptType }, turn.auxiliary, interest.eventInstanceId, 'evidenceRefs');
      if (!v.ok) return { ok: false, code: v.issue.code, message: v.issue.message };
      unitEvidence.push({ kind: 'gameplay_receipt', receiptId: receipt.receiptId, receiptType: receipt.receiptType });
      kinds.add('gameplay_receipt');
    }
    // resolve/supersede 命令：命令证据逐项验证后归属 target 单元；任何伪造证据整体失败。
    if (cmdTargetId === interest.eventInstanceId) {
      for (const ref of cmd.evidenceRefs ?? []) {
        if (ref === null || typeof ref !== 'object') return { ok: false, code: 'INVALID_COMMAND', message: '命令证据必须是普通对象' };
        const r = ref as { kind?: string; startOffset?: unknown; endOffset?: unknown; textFingerprint?: unknown; bodyFingerprint?: unknown; responseId?: unknown; commandId?: unknown; commandFingerprint?: unknown; receiptId?: unknown; receiptType?: unknown };
        if (r.kind === 'narrative_span') {
          const v = await validateNarrativeSpanEvidence({ startOffset: r.startOffset, endOffset: r.endOffset, textFingerprint: r.textFingerprint, bodyFingerprint: r.bodyFingerprint, responseId: r.responseId }, rawBody, responseId, 'command.evidenceRefs');
          if (!v.ok) return { ok: false, code: v.issue.code, message: v.issue.message };
          unitEvidence.push(ref);
          kinds.add('narrative_span');
        } else if (r.kind === 'system_command') {
          const v = validateSystemCommandEvidence({ commandId: r.commandId, commandFingerprint: r.commandFingerprint }, turn.auxiliary, interest.eventInstanceId, 'command.evidenceRefs');
          if (!v.ok) return { ok: false, code: v.issue.code, message: v.issue.message };
          unitEvidence.push(ref);
          kinds.add('system_command');
        } else if (r.kind === 'gameplay_receipt') {
          const v = validateGameplayReceiptEvidence({ receiptId: r.receiptId, receiptType: r.receiptType }, turn.auxiliary, interest.eventInstanceId, 'command.evidenceRefs');
          if (!v.ok) return { ok: false, code: v.issue.code, message: v.issue.message };
          unitEvidence.push(ref);
          kinds.add('gameplay_receipt');
        } else {
          // A（G1.3.1.4）：无 owner 记录型 evidence（schedule/notice/broadcast/article/migration/projection/publication）
          // 不能作为任何确认性写入依据——整体失败（零写入），不得当作 mentioned/supported 证据放行。
          return { ok: false, code: 'MISSING_EVIDENCE', message: '本阶段尚无 ' + String(r.kind) + ' owner：记录型证据不能作为完成/写入依据' };
        }
      }
    }
    // 正文提及 ID 不构成完成证据。
    if (unitEvidence.length === 0) {
      candidates.push({
        candidateId: 'cand:' + interest.eventInstanceId + ':' + interest.factType,
        eventInstanceId: interest.eventInstanceId,
        factType: interest.factType,
        payload: {},
        occurredAt: now,
        publicScope: { kind: 'private' },
        evidenceRefs: [],
        evidenceLevel: 'supported',
        playerParticipated: turn.source === 'player_turn',
        playerObserverVisible: false,
        createdBy: turn.source === 'player_turn' ? 'player_turn' : 'world_due',
      });
      continue;
    }
    const confirmed = unitEvidence.some((e) => CONFIRMED_KINDS.includes(e.kind));
    candidates.push({
      candidateId: 'cand:' + interest.eventInstanceId + ':' + interest.factType,
      eventInstanceId: interest.eventInstanceId,
      factType: interest.factType,
      payload: {},
      occurredAt: now,
      publicScope: { kind: 'private' },
      evidenceRefs: unitEvidence,
      evidenceLevel: confirmed ? 'confirmed' : 'supported',
      playerParticipated: turn.source === 'player_turn',
      playerObserverVisible: false,
      createdBy: turn.source === 'player_turn' ? 'player_turn' : 'world_due',
    });
  }
  return { ok: true, candidates };
}
