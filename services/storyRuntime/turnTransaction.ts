// G1.3.1.3 turnTransaction：单回合确定性事务模拟器。
// 顺序固定：结构闸门（先于 idempotency fingerprint）-> 读取 expected revision -> 语义校验 TurnCommand
//   -> 建立不可变 draft -> 提取候选并分级（resolve/supersede 目标由命令目标派生）
//   -> 应用玩家 confirmed facts -> 合并一次 advance_time -> due scan -> 事件生命周期裁决
//   -> 12 类命令逐 kind 执行（写入口先过共享证据绑定，验证失败零副作用）
//   -> 写入事实账本 -> 生成 outbox -> 生成 TurnAdjudicationReceipt
//   -> 最终 state fingerprint 用"排除本回合 idempotency record 内自引用 stateFingerprint 字段"的规定 projection 重算
//   -> 成功 draft 过 G1.2.2 生产 StoryRuntimeState validator -> 返回新 state（未接入正式 store）。
// 任何一步失败返回旧 state + 错误回执 + 空副作用；runtimeRevision 每次成功事务只加 1。
import type { StoryRuntimeState } from '../../models/storyRuntime';
import type { RuntimeCommand, TurnAdjudicationReceipt } from '../../models/storyRuntimeCommands';
import type { ProjectionOutboxItem } from '../../models/storyRuntimeProjection';
import type { IdAllocator, RuntimeCtx, TurnCommand, TurnResult } from './runtimeCore';
import { validateTurnCommand, validateEvidenceRefsForTurn, deriveFactsOfInterest, validateCommandStructure } from './commandValidator';
import { extractFactCandidates, bodyFingerprintOf } from './turnFactExtractor';
import { appendFact } from './factLedger';
import { advanceGameClock } from './gameClockReducer';
import { scanDueEvents } from './dueEventScanner';
import { applyPlayerEarlyResolution, transition, createInstance, TERMINAL_STATES } from './eventLifecycle';
import { upsertPlayerPlanItem, upsertWorldPlanItem } from './planningPool';
import { enqueueConvergence } from './convergenceQueue';
import { mergeOutbox, buildOutboxItem } from './outboxReducer';
import { canonicalJsonStringify } from './normalization';
import { sha256Fingerprint } from './id';
import { validateStoryRuntimeState } from './runtimeValidator';

export interface TurnTransactionDeps {
  allocator: IdAllocator;
  ctx: RuntimeCtx;
  defaultAdvanceMinutes?: number;
  factsOfInterest: Array<{ eventInstanceId: string; factType: string }>;
  narrativeDecision?: { outcome: 'allow' | 'allow_reframed' | 'retry' | 'reject' | 'hold'; acceptedBodyFingerprint?: string; codes: string[] };
}

/** E3：最终 state fingerprint projection——删除本回合 idempotency record 内自引用 stateFingerprint 字段后 canonical SHA-256。 */
export async function stateFingerprintProjectionOf(state: StoryRuntimeState, idempotencyKey: string): Promise<string> {
  const clone = JSON.parse(JSON.stringify(state)) as StoryRuntimeState;
  const record = clone.commandIdempotencyIndex[idempotencyKey] as { resultRef?: { stateFingerprint?: string } } | undefined;
  if (record && record.resultRef) delete record.resultRef.stateFingerprint;
  return sha256Fingerprint(clone);
}

/**
 * 执行单回合事务。纯函数（依赖注入 allocator/ctx）；失败零副作用；
 * 成功 draft 返回前必须通过 G1.2.2 生产 StoryRuntimeState validator。
 */
export async function executeTurn(turn: TurnCommand, deps: TurnTransactionDeps): Promise<TurnResult> {
  const { state } = deps.ctx;
  // A1/A2：结构闸门先于幂等 fingerprint / canonical 序列化 / getter 读取（不 throw）。
  const structure = validateCommandStructure(turn.command);
  if (!structure.ok) {
    return { ok: false, state, receipt: { receiptId: turn.turnId + ':receipt', runtimeBranchId: turn.runtimeBranchId, inputRuntimeRevision: turn.expectedRuntimeRevision, acceptedCandidateIds: [], rejectedCandidateIds: [], completedUnitIds: [], blockedReasons: [structure.issue.message], sourceFactIds: [], outboxIds: [], errorCodes: ['INVALID_COMMAND'], durationMs: 0 }, outbox: [], sideEffects: { factLedger: [], outbox: [], knowledgeGrants: [], narrativePublications: [] } };
  }
  const idempotencyRecord = state.commandIdempotencyIndex[turn.idempotencyKey];
  // 幂等指纹 = 命令 + 正文 fingerprint（同 key 同命令但正文改变 -> IDEMPOTENCY_KEY_REUSED）。
  const bodyFp = turn.rawBody ? await bodyFingerprintOf(turn.rawBody) : '';
  const commandFingerprint = canonicalJsonStringify({ command: turn.command, bodyFingerprint: bodyFp });

  const emptyReceipt: TurnAdjudicationReceipt = {
    receiptId: turn.turnId + ':receipt',
    runtimeBranchId: turn.runtimeBranchId,
    inputRuntimeRevision: turn.expectedRuntimeRevision,
    acceptedCandidateIds: [],
    rejectedCandidateIds: [],
    completedUnitIds: [],
    blockedReasons: [],
    sourceFactIds: [],
    outboxIds: [],
    errorCodes: [],
    durationMs: 0,
  };
  const emptyFailure = (code: string, message: string, receipt?: TurnAdjudicationReceipt): TurnResult => {
    const r: TurnAdjudicationReceipt = {
      ...(receipt ?? emptyReceipt),
      errorCodes: [code],
      blockedReasons: [message],
    };
    return { ok: false, state, receipt: r, outbox: [], sideEffects: { factLedger: [], outbox: [], knowledgeGrants: [], narrativePublications: [] } };
  };

  // 0. revision 校验。
  if (turn.expectedRuntimeRevision !== state.runtimeRevision) {
    return emptyFailure('STALE_BRANCH', 'expected revision ' + turn.expectedRuntimeRevision + ' != current ' + state.runtimeRevision);
  }
  if (turn.runtimeBranchId !== state.runtimeBranchId) {
    return emptyFailure('STALE_BRANCH', 'branch 不匹配');
  }
  // 幂等：同 key 同 payload -> 返回既有结果（模拟）；同 key 不同 payload（含正文改变）-> validator 拒绝。
  const commandValidation = await validateTurnCommand(turn.command, deps.ctx, {
    turn,
    idempotency: {
      hasRecord: idempotencyRecord !== undefined,
      existingFingerprint: idempotencyRecord?.commandFingerprint,
      commandFingerprint,
    },
  });
  if (!commandValidation.ok) {
    return emptyFailure(commandValidation.issue.code, commandValidation.issue.message);
  }
  if (idempotencyRecord) {
    const retryReceipt: TurnAdjudicationReceipt = {
      ...emptyReceipt,
      receiptId: idempotencyRecord.receiptId,
      outputRuntimeRevision: idempotencyRecord.resultRevision,
      errorCodes: ['ALREADY_APPLIED'],
      blockedReasons: ['同 idempotencyKey 已应用，返回既有结果'],
    };
    return { ok: false, state, receipt: retryReceipt, outbox: [], sideEffects: { factLedger: [], outbox: [], knowledgeGrants: [], narrativePublications: [] } };
  }

  // 1. 建立不可变 draft。
  let draft: StoryRuntimeState = {
    ...state,
    runtimeRevision: state.runtimeRevision + 1,
    turnCount: state.turnCount + 1,
    lastCommittedTurnId: turn.turnId,
  };
  const outbox: ProjectionOutboxItem[] = [];
  const committedFactIds: string[] = [];
  // eventInstanceId -> 本回合 committed terminal factId（禁止 sourceFactIds[0] 猜目标）。
  const terminalFactByInstance = new Map<string, string>();
  // 本事务实际从非终态转移的 unit/event ID（completedUnitIds 唯一来源，不扫描历史 resolvedAt）。
  const transitionedUnitIds = new Set<string>();

  // 2. 提取候选并分级（now = 事务明确游戏时间）；resolve/supersede 目标由内核从命令目标派生。
  const interest = deriveFactsOfInterest(deps.factsOfInterest, turn.command);
  const extract = await extractFactCandidates(turn, interest, draft.gameClock.now);
  if (!extract.ok) return emptyFailure(extract.code, extract.message);
  const candidates = extract.candidates;

  // 3. 应用有独立证据的 confirmed facts（只追加；无证据候选跳过；失败即整事务失败）。
  const acceptedCandidateIds: string[] = [];
  const sourceFactIds: string[] = [];
  const evidencedUnitIds: string[] = [];
  const cmdKind = turn.command.kind;
  for (const candidate of candidates) {
    if (candidate.evidenceRefs.length === 0) continue;
    evidencedUnitIds.push(candidate.eventInstanceId);
    const appended = await appendFact(draft, candidate, deps.allocator);
    if (!appended.ok) return emptyFailure(appended.code, appended.message, { ...emptyReceipt, acceptedCandidateIds, sourceFactIds });
    if (appended.fact.sourceRevision === draft.runtimeRevision) {
      draft = appended.state;
      acceptedCandidateIds.push(candidate.candidateId);
      sourceFactIds.push(appended.fact.factId);
      committedFactIds.push(appended.fact.factId);
      // 本事件在本回合新提交的事实，记入 eventInstanceId -> factId 映射（终态绑定用）。
      terminalFactByInstance.set(candidate.eventInstanceId, appended.fact.factId);
      // 非 resolve/supersede 命令时，有证据候选同时把对应单元事件结算（场景5）。
      if (cmdKind !== 'resolve_event_instance' && cmdKind !== 'supersede_event_instance') {
        const target = draft.worldEvents.find((w) => w.eventInstanceId === candidate.eventInstanceId);
        if (target && !TERMINAL_STATES.includes(target.status)) {
          const t = transition(target, 'resolved', { at: draft.gameClock.now, resolutionMode: candidate.playerParticipated ? 'player' : 'world_background', outcome: 'normal', terminalFactId: appended.fact.factId });
          if (t.ok) {
            draft = { ...draft, worldEvents: draft.worldEvents.map((w) => (w.eventInstanceId === target.eventInstanceId ? t.instance : w)) };
            transitionedUnitIds.add(target.eventInstanceId);
          }
        }
      }
    }
  }

  // 4. 合并一次 advance_time（lastAdvanceRevision = 实际提交后 revision）。
  if (turn.command.kind === 'advance_time') {
    const clock = advanceGameClock(draft, { deltaMinutes: turn.command.deltaMinutes, commandId: turn.turnId, policyVersion: draft.gameClock.policyVersion, committedRevision: draft.runtimeRevision });
    if (!clock.ok) return emptyFailure(clock.code, clock.message);
    draft = clock.state;
  }

  // 5. due scan（只处理自身已到期；未来依赖不入列；同一 revision 只领取一次）。
  const scan = scanDueEvents(draft, draft.gameClock.now);
  if (!scan.ok) return emptyFailure(scan.code, scan.message);
  draft = scan.state;

  // 6. 事件生命周期裁决：create / resolve / supersede / player_early。
  const cmd = turn.command as RuntimeCommand;
  if (cmd.kind === 'create_event_instance') {
    const defId = cmd.proposal.definitionRef.eventDefinitionId;
    const def = deps.ctx.catalog?.eventDefinitions?.find((d) => d.eventDefinitionId === defId);
    if (!def) return emptyFailure('CONFLICT', 'catalog 中不存在该 event definition: ' + defId);
    const replayPolicy = (def as { replayPolicy?: 'once' | 'allow_new_instance' | 'repeatable' }).replayPolicy ?? 'once';
    const instanceId = await deps.allocator('event:instance', { definitionId: defId, at: draft.gameClock.now, bodyFingerprint: bodyFp }, defId);
    // 先做 replayPolicy/引用裁决（once 终态 -> ALREADY_TERMINAL 等），再绑定证据；绑定失败不提交实例（零副作用）。
    const created = await createInstance(draft.worldEvents, {
      eventInstanceId: instanceId,
      eventDefinitionId: defId,
      replayPolicy,
      at: draft.gameClock.now,
      source: cmd.proposal.evidenceRefs[0],
      idempotencyKey: turn.idempotencyKey,
      allocator: deps.allocator,
    });
    if (!created.ok) return emptyFailure(created.code, created.message);
    const evidence = await validateEvidenceRefsForTurn(cmd.proposal.evidenceRefs, turn, { path: 'command.proposal.evidenceRefs', requireNonEmpty: true });
    if (!evidence.ok) return emptyFailure(evidence.issue.code, evidence.issue.message);
    draft = { ...draft, worldEvents: [...draft.worldEvents, created.instance] };
  } else if (cmd.kind === 'resolve_event_instance') {
    const instance = draft.worldEvents.find((w) => w.eventInstanceId === cmd.target.eventInstanceId);
    if (!instance) return emptyFailure('CONFLICT', '目标实例不存在');
    if (TERMINAL_STATES.includes(instance.status)) return emptyFailure('ALREADY_TERMINAL', '终态事件不允许再次结算');
    // C1：终态必须绑定目标实例自己的本回合 terminal fact（player/player_early 都强制）。
    const terminalFactId = terminalFactByInstance.get(instance.eventInstanceId);
    if (!terminalFactId) return emptyFailure('MISSING_EVIDENCE', '事件终态必须绑定本事件本回合的 terminal fact');
    if (cmd.resolutionMode === 'player_early') {
      const r = applyPlayerEarlyResolution(draft.worldEvents, instance.eventInstanceId, instance.eventDefinitionId, { at: draft.gameClock.now, terminalFactId });
      draft = { ...draft, worldEvents: r.instances };
    } else {
      const t = transition(instance, 'resolved', { at: draft.gameClock.now, resolutionMode: cmd.resolutionMode, outcome: cmd.outcome, terminalFactId });
      if (!t.ok) return emptyFailure(t.code, t.message);
      draft = { ...draft, worldEvents: draft.worldEvents.map((w) => (w.eventInstanceId === instance.eventInstanceId ? t.instance : w)) };
    }
    transitionedUnitIds.add(instance.eventInstanceId);
  } else if (cmd.kind === 'supersede_event_instance') {
    const instance = draft.worldEvents.find((w) => w.eventInstanceId === cmd.target.eventInstanceId);
    if (!instance) return emptyFailure('CONFLICT', '目标实例不存在');
    if (TERMINAL_STATES.includes(instance.status)) return emptyFailure('ALREADY_TERMINAL', '终态事件不允许被替换');
    // C1：supersede 也必须绑定目标实例自己的本回合 terminal fact；无 -> MISSING_EVIDENCE。
    const terminalFactId = terminalFactByInstance.get(instance.eventInstanceId);
    if (!terminalFactId) return emptyFailure('MISSING_EVIDENCE', '事件替代必须绑定本事件本回合的 terminal fact');
    const t = transition(instance, 'superseded', { at: draft.gameClock.now, terminalFactId });
    if (!t.ok) return emptyFailure(t.code, t.message);
    draft = { ...draft, worldEvents: draft.worldEvents.map((w) => (w.eventInstanceId === instance.eventInstanceId ? t.instance : w)) };
    transitionedUnitIds.add(instance.eventInstanceId);
  }

  // 6b. 其余命令逐 kind 实际执行（写入口先过共享证据绑定；验证失败不得产生任何 fact/grant/schedule/notice/outbox）。
  if (cmd.kind === 'append_fact') {
    const p = cmd.proposal;
    const evidence = await validateEvidenceRefsForTurn(p.evidenceRefs, turn, { unitId: p.eventTarget.eventInstanceId, path: 'command.proposal.evidenceRefs', requireNonEmpty: true });
    if (!evidence.ok) return emptyFailure(evidence.issue.code, evidence.issue.message);
    const candidate = {
      candidateId: 'cmd:append_fact',
      eventInstanceId: p.eventTarget.eventInstanceId,
      factType: p.factType,
      payload: p.payload ?? {},
      occurredAt: draft.gameClock.now,
      publicScope: p.publicScope ?? { kind: 'private' },
      evidenceRefs: p.evidenceRefs ?? [],
      evidenceLevel: p.evidenceLevel,
      playerParticipated: p.playerParticipated ?? false,
      playerObserverVisible: false,
      createdBy: (turn.source === 'player_turn' ? 'player_turn' : 'world_due') as 'player_turn' | 'world_due',
    };
    const appended = await appendFact(draft, candidate, deps.allocator);
    if (!appended.ok) return emptyFailure(appended.code, appended.message);
    if (appended.fact.sourceRevision === draft.runtimeRevision) {
      draft = appended.state;
      committedFactIds.push(appended.fact.factId);
      sourceFactIds.push(appended.fact.factId);
      terminalFactByInstance.set(p.eventTarget.eventInstanceId, appended.fact.factId);
    }
  } else if (cmd.kind === 'upsert_plan_item') {
    const p = cmd.proposal;
    const evidence = await validateEvidenceRefsForTurn(p.evidenceRefs ?? [], turn, { unitId: p.unitId ?? undefined, path: 'command.proposal.evidenceRefs', requireNonEmpty: true });
    if (!evidence.ok) return emptyFailure(evidence.issue.code, evidence.issue.message);
    // D（G1.3.1.4）：计划身份键 = runtimeBranchId + unitId（玩家池）/ eventDefinitionId（世界池），
    // 不含 revision/当前时间；同一身份键的重复 upsert 定位并更新同一计划项（不追加重复剧情候选）。
    // 先查找既有项复用其 planItemId；找不到才用确定性 allocator（stableId 规则，不含时间/随机/下标）生成。
    const planItemId = p.eventDefinitionId
      ? (draft.worldPlanPool.find((x) => x.eventDefinitionId === p.eventDefinitionId)?.planItemId
        ?? await deps.allocator('plan', { branch: draft.runtimeBranchId, eventDef: p.eventDefinitionId }, ''))
      : (draft.playerPlanPool.find((x) => x.unitId === p.unitId)?.planItemId
        ?? await deps.allocator('plan', { branch: draft.runtimeBranchId, unit: p.unitId }, ''));
    const result = p.eventDefinitionId
      ? await upsertWorldPlanItem(draft, { planItemId, eventDefinitionId: p.eventDefinitionId, evidenceRefs: p.evidenceRefs })
      : upsertPlayerPlanItem(draft, { planItemId, unitId: p.unitId, evidenceRefs: p.evidenceRefs, acceptanceModes: p.acceptanceModes });
    if (!result.ok) return emptyFailure(result.code, result.message);
    draft = result.state;
  } else if (cmd.kind === 'enqueue_convergence') {
    const p = cmd.proposal;
    const evidence = await validateEvidenceRefsForTurn(p.evidenceRefs ?? [], turn, { path: 'command.proposal.evidenceRefs', requireNonEmpty: true });
    if (!evidence.ok) return emptyFailure(evidence.issue.code, evidence.issue.message);
    const convergenceId = await deps.allocator('convergence', { sourceFactIds: p.sourceFactIds, revision: draft.runtimeRevision }, turn.idempotencyKey);
    const result = await enqueueConvergence(draft, {
      convergenceId,
      sourceFactIds: p.sourceFactIds ?? [],
      eligiblePlanItemIds: p.eligiblePlanItemIds ?? [],
      playerDecisionRequired: true,
      evidenceRefs: p.evidenceRefs ?? [],
      allocator: deps.allocator,
    });
    if (!result.ok) return emptyFailure(result.code, result.message);
    draft = result.state;
  } else if (cmd.kind === 'grant_knowledge') {
    const p = cmd.proposal;
    const evidence = await validateEvidenceRefsForTurn(p.evidenceRefs, turn, { path: 'command.proposal.evidenceRefs', requireNonEmpty: true });
    if (!evidence.ok) return emptyFailure(evidence.issue.code, evidence.issue.message);
    const grantId = await deps.allocator('grant', { subjectId: p.subjectId, subjectType: p.subjectType, revision: draft.runtimeRevision }, turn.idempotencyKey);
    const grant = {
      runtimeBranchId: draft.runtimeBranchId,
      grantId,
      subjectType: p.subjectType,
      subjectId: p.subjectId,
      subjectRef: p.subjectRef,
      effectiveFromRuntimeRevision: draft.runtimeRevision,
      evidenceRefs: p.evidenceRefs ?? [],
      idempotencyKey: turn.idempotencyKey,
    };
    draft = { ...draft, knowledgeGrants: [...draft.knowledgeGrants, grant] };
  } else if (cmd.kind === 'publish_public_schedule') {
    const p = cmd.proposal;
    const evidence = await validateEvidenceRefsForTurn(p.source ? [p.source] : [], turn, { path: 'command.proposal.source', requireNonEmpty: true });
    if (!evidence.ok) return emptyFailure(evidence.issue.code, evidence.issue.message);
    const scheduleId = await deps.allocator('schedule', { sourceDefinitionId: p.sourceDefinitionId, plannedAt: p.plannedAt, revision: draft.runtimeRevision }, turn.idempotencyKey);
    const schedule = {
      scheduleId,
      sourceDefinitionId: p.sourceDefinitionId,
      status: 'planned' as const,
      plannedAt: p.plannedAt,
      publicScope: p.publicScope ?? { kind: 'private' },
      source: p.source,
      scheduleRevision: 1,
      idempotencyKey: turn.idempotencyKey,
    };
    draft = { ...draft, publicSchedules: [...draft.publicSchedules, schedule] };
  } else if (cmd.kind === 'issue_official_notice') {
    const p = cmd.proposal;
    const evidence = await validateEvidenceRefsForTurn(p.source ? [p.source] : [], turn, { path: 'command.proposal.source', requireNonEmpty: true });
    if (!evidence.ok) return emptyFailure(evidence.issue.code, evidence.issue.message);
    const noticeId = await deps.allocator('notice', { issuerId: p.issuerId, claimFingerprint: p.claimFingerprint, revision: draft.runtimeRevision }, turn.idempotencyKey);
    const notice = {
      noticeId,
      noticeRevision: 1,
      issuerId: p.issuerId,
      claimFingerprint: p.claimFingerprint,
      status: 'active' as const,
      publicScope: p.publicScope ?? { kind: 'private' },
      source: p.source,
      issuedAt: draft.gameClock.now,
    };
    draft = { ...draft, officialNotices: [...draft.officialNotices, notice] };
  } else if (cmd.kind === 'path_command') {
    // enter：必须有正文承接证据（有证据候选）才算实际执行；否则明确拒绝。
    if (acceptedCandidateIds.length === 0) {
      return emptyFailure('MISSING_EVIDENCE', 'path_command enter 必须有正文承接证据');
    }
  }
  // advance_time/create/resolve/supersede 已在上述分支执行；register_emergent_event_definition 与
  // path_command decline/judge 已在 validator 明确拒绝（deferred owner），不会到这里。

  // 7. 规划池/交汇队列已由上述命令分支更新；completedUnitIds 只报告本事务实际从非终态转移的
  //    unit/event ID（transitionedUnitIds），不得扫描历史 resolvedAt 重复报告旧完成单元。
  const completedUnitIds = [...transitionedUnitIds];

  // 8. 终态与事实双向一致：终态实例绑定本事件本回合 terminalFactId；公共 scope 事实加入 publicFactIds（验证 ledger 反向引用）。
  draft = {
    ...draft,
    worldEvents: draft.worldEvents.map((w) => {
      const isTerminal = TERMINAL_STATES.includes(w.status);
      const factForThis = terminalFactByInstance.get(w.eventInstanceId);
      const pubFacts = draft.factLedger.filter((f) => f.eventInstanceId === w.eventInstanceId && f.publicScope.kind !== 'private').map((f) => f.factId);
      const next = { ...w, publicFactIds: [...new Set([...(w.publicFactIds ?? []), ...pubFacts])] };
      // 终态且本回合有该事件事实 -> 绑定；否则保持 optional 缺省（不猜 sourceFactIds[0]）。
      if (isTerminal && factForThis !== undefined) next.terminalFactId = factForThis;
      return next;
    }),
  };

  // 9. 生成 outbox（事实事务成功后才产生；失败时为空）。
  if (deps.narrativeDecision?.outcome === 'allow' && sourceFactIds.length > 0) {
    const item = await buildOutboxItem(draft, {
      kind: 'news',
      aggregateKey: 'unit:' + (deps.factsOfInterest[0]?.eventInstanceId ?? ''),
      operation: 'create',
      payload: { sourceFactIds, bodyFingerprint: bodyFp },
      sourceRefFingerprint: bodyFp || canonicalJsonStringify({ sourceFactIds }),
      sourceRevision: draft.runtimeRevision,
      consumerIds: ['news'],
      allocator: deps.allocator,
    });
    if (!item.ok) return emptyFailure(item.code, item.message);
    const merged = mergeOutbox(outbox, item.outbox);
    if (!merged.ok) return emptyFailure(merged.code, merged.message);
    outbox.length = 0;
    outbox.push(...merged.outbox);
  }

  // 10. 写命令幂等索引 + 回执。
  const receiptId = await deps.allocator('receipt', { turnId: turn.turnId, runtimeRevision: draft.runtimeRevision }, turn.idempotencyKey);
  const receipt: TurnAdjudicationReceipt = {
    receiptId,
    runtimeBranchId: draft.runtimeBranchId,
    inputRuntimeRevision: turn.expectedRuntimeRevision,
    outputRuntimeRevision: draft.runtimeRevision,
    narrativeDecision: deps.narrativeDecision ? { outcome: deps.narrativeDecision.outcome, codes: deps.narrativeDecision.codes as never, evidenceRefs: [], focusBefore: draft.focus.focusId, focusAfterCandidate: draft.focus.focusId, replayedEventInstanceIds: [], completedUnitIds, retryCount: turn.retryCount ?? 0, candidateBodyFingerprint: bodyFp, acceptedBodyFingerprint: deps.narrativeDecision.acceptedBodyFingerprint } : undefined,
    acceptedCandidateIds,
    rejectedCandidateIds: [],
    completedUnitIds,
    blockedReasons: [],
    sourceFactIds,
    outboxIds: outbox.map((o) => o.outboxId),
    errorCodes: [],
    durationMs: 0,
  };
  draft = {
    ...draft,
    turnReceipts: [...draft.turnReceipts, receipt],
  };
  // E4：resultHash 保持 sha256:<64 hex>（组成不依赖自引用 stateFingerprint，避免循环）。
  const resultHash = await sha256Fingerprint({ sourceFactIds, outboxIds: outbox.map((o) => o.outboxId), revision: draft.runtimeRevision });
  // E3：最终 state fingerprint 用规定 projection 重算（删除本回合 idempotency record 内自引用 stateFingerprint 字段），
  //     必须先构造"记录含 resultRef 但无 stateFingerprint"的投影，再写入最终 record。
  //     （投影状态只用于指纹计算，从不返回；schema 类型要求 stateFingerprint 必填，因此这里做定向断言。）
  const projectionState: StoryRuntimeState = {
    ...draft,
    commandIdempotencyIndex: {
      ...draft.commandIdempotencyIndex,
      [turn.idempotencyKey]: { commandFingerprint, resultRevision: draft.runtimeRevision, resultCode: 'ok', receiptId, resultHash, resultRef: { saveNodeId: draft.saveNodeId } },
    },
  } as StoryRuntimeState;
  const stateFp = await stateFingerprintProjectionOf(projectionState, turn.idempotencyKey);
  draft = {
    ...draft,
    commandIdempotencyIndex: {
      ...draft.commandIdempotencyIndex,
      [turn.idempotencyKey]: { commandFingerprint, resultRevision: draft.runtimeRevision, resultCode: 'ok', receiptId, resultHash, resultRef: { saveNodeId: draft.saveNodeId, stateFingerprint: stateFp } },
    },
  };

  // 11. 校验：revision 单调 + 成功 draft 必须通过 G1.2.2 生产 StoryRuntimeState validator。
  if (draft.runtimeRevision !== state.runtimeRevision + 1) return emptyFailure('INVALID_COMMAND', 'runtimeRevision 每次成功事务只加 1');
  const structural = validateStoryRuntimeState(draft);
  if (!structural.ok) {
    return emptyFailure('INVALID_COMMAND', '成功 draft 未通过生产 StoryRuntimeState 校验: ' + JSON.stringify(structural.issues.slice(0, 1)));
  }

  return {
    ok: true,
    state: draft,
    receipt,
    outbox,
    sideEffects: {
      factLedger: draft.factLedger.filter((f) => f.sourceRevision === draft.runtimeRevision).map((f) => ({ factId: f.factId, factType: f.factType, evidenceLevel: f.evidenceLevel, eventInstanceId: f.eventInstanceId })),
      outbox: outbox.map((o) => o.outboxId),
      knowledgeGrants: draft.knowledgeGrants.filter((g) => g.effectiveFromRuntimeRevision === draft.runtimeRevision).map((g) => g.grantId),
      narrativePublications: [],
    },
  };
}
