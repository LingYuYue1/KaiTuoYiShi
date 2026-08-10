// G1.3.1.3 reducer 回归：纯确定性核心（7 个玩家可理解场景 + 反向拒绝 + 12 命令矩阵 + G1.3.1.3 组合探针）。
// 生产模块经 esbuild 执行；全部输入为测试专用 synthetic，不进入生产资产。
// 结构闸门先于幂等 fingerprint：unknown/undefined/getter/cycle 命令稳定 INVALID_COMMAND，getter 0 调用；
// 证据绑定本回合真实输入：ghost/伪造 receipt、伪造 span、缺目标终态事实全部拒绝且旧 state 字节不变；
// 终态必须有目标实例自己的本回合 terminal fact；completedUnitIds 只报告本事务实际转移；
// 最终 state fingerprint 用规定 projection 重算与回执一致；outbox 结构化精确匹配。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs, loadBaseModules, loadSharedRuntimeEntry, makeAllocator, makeEmptyState, makeEventInstance, narrativeEvidence, narrativeSpanEvidence, makeTrustedCatalog, makeWorldEventDefinition } from './story-runtime-core-test-helpers.mjs';

const FROZEN_HASHES = {
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
  'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
};

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }

// F1：buildTurn 原样传递 responseId/claimedCompletedUnitIds/retryCount/auxiliary；测试不得依赖生产默认 responseId。
function buildTurn(input) {
  const out = {
    turnId: input.turnId ?? 'turn_1',
    expectedRuntimeRevision: input.expectedRuntimeRevision ?? 0,
    runtimeBranchId: input.runtimeBranchId ?? 'branch_test',
    idempotencyKey: input.idempotencyKey ?? 'key_' + (input.turnId ?? 'turn_1'),
    command: input.command,
    source: input.source ?? 'player_turn',
    rawBody: input.rawBody,
    auxiliary: input.auxiliary,
    responseId: input.responseId,
    retryCount: input.retryCount,
  };
  if (input.claimedCompletedUnitIds) out.claimedCompletedUnitIds = input.claimedCompletedUnitIds;
  return out;
}

async function main() {
  // G1.3.1.6：runRuntimeTurn 必须与 StoryAssetCatalogStore 构造/verifier 来自同一生产模块图（共享入口），
  // 模块私有 WeakSet brand 才是同一份；其他纯函数模块（extractor/outbox/planning/scan/txn）可独立 bundle。
  const shared = await loadSharedRuntimeEntry();
  const reducer = { runRuntimeTurn: shared.runRuntimeTurn, stateFingerprintOf: shared.stateFingerprintOf };
  const txn = await bundleTs('services/storyRuntime/turnTransaction.ts');
  const eventLifecycle = await bundleTs('services/storyRuntime/eventLifecycle.ts');
  const cmdValidator = await bundleTs('services/storyRuntime/commandValidator.ts');
  const extractorModule = await bundleTs('services/storyRuntime/turnFactExtractor.ts');
  const outbox = await bundleTs('services/storyRuntime/outboxReducer.ts');
  const planning = await bundleTs('services/storyRuntime/planningPool.ts');
  const convergence = await bundleTs('services/storyRuntime/convergenceQueue.ts');
  const scan = await bundleTs('services/storyRuntime/dueEventScanner.ts');
  const { normalization } = await loadBaseModules();
  const { canonicalJsonStringify } = normalization;
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  const stateFingerprint = (s) => canonicalJsonStringify(s);

  // ═══════════ 场景 1：正常参与主线 ═══════════
  {
    const allocator = await makeAllocator();
    const rawBody = '玩家与主线一起完成装置修复（evt_inst_1）。';
    const responseId = 'turn_main:body';
    const evidence = await narrativeSpanEvidence(rawBody, responseId);
    const state = makeEmptyState({ worldEvents: [makeEventInstance()] });
    const instFp = await cmdValidator.instanceFingerprintOf(state, 'evt_inst_1');
    const ctx = { state };
    const turn = buildTurn({
      turnId: 'turn_main',
      responseId,
      command: {
        kind: 'resolve_event_instance',
        target: { eventInstanceId: 'evt_inst_1', expectedInstanceFingerprint: instFp },
        resolutionMode: 'player',
        outcome: 'normal',
        evidenceRefs: [evidence],
      },
      rawBody,
    });
    const result = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [{ eventInstanceId: 'evt_inst_1', factType: 'unit_completed' }] });
    assert(result.ok, '场景1 必须成功: ' + JSON.stringify(result));
    const instance = result.state.worldEvents.find((w) => w.eventInstanceId === 'evt_inst_1');
    assert(instance.status === 'resolved', '场景1 事件必须 resolved');
    assert(result.state.factLedger.length === 1, '场景1 必须产生唯一 fact');
    assert(result.receipt.receiptId && result.receipt.outputRuntimeRevision === 1, '场景1 必须唯一回执');
    assert(result.state.runtimeRevision === 1, '场景1 revision 只加 1');
    recordPositive('场景1-正常参与主线', 'resolved + 1 fact + 1 receipt + revision=1');
    // 新闻只作为后续 outbox，不反向改事实。
    assert(result.outbox.length === 1 && result.outbox[0].kind === 'news', '场景1 产生 news outbox');
    assert(result.state.factLedger.length === 1, '场景1 outbox 不反向改事实');
    // §12：acceptedBodyFingerprint 必须等于 raw body 真实 SHA-256（组合入口核对，不自报）。
    const acceptedFp = result.receipt.narrativeDecision?.acceptedBodyFingerprint;
    const expectedBodyFp = await extractorModule.bodyFingerprintOf(rawBody);
    assert(acceptedFp === expectedBodyFp, '场景1 acceptedBodyFingerprint 必须等于 raw body 真实 hash');
    // E3/E4：最终 state fingerprint 用规定 projection 重算一致；resultHash 真实 sha256；focus 非空占位。
    const storedFp = result.state.commandIdempotencyIndex[turn.idempotencyKey].resultRef.stateFingerprint;
    const recomputedFp = await txn.stateFingerprintProjectionOf(result.state, turn.idempotencyKey);
    assert(storedFp === recomputedFp, '场景1 resultRef.stateFingerprint 必须与最终规定 projection 重算一致');
    const resultHash = result.state.commandIdempotencyIndex[turn.idempotencyKey].resultHash;
    assert(typeof resultHash === 'string' && resultHash.startsWith('sha256:') && resultHash.length === 71, '场景1 resultHash 必须 sha256:<64 hex>');
    assert(result.receipt.narrativeDecision?.focusBefore === result.state.focus.focusId && result.receipt.narrativeDecision?.focusAfterCandidate === result.state.focus.focusId, '场景1 focusBefore/focusAfterCandidate 不得为空占位');
    recordPositive('场景1-E3投影指纹重算一致', storedFp.slice(0, 16) + ' == ' + recomputedFp.slice(0, 16));
  }

  // ═══════════ 场景 2：玩家完全绕开（世界后台结算） ═══════════
  {
    const allocator = await makeAllocator();
    const state = makeEmptyState({
      worldEvents: [makeEventInstance({ eventInstanceId: 'evt_world', eventDefinitionId: 'evt_def_b', dueAt: { dayOrdinal: 1, minuteOfDay: 5 } })],
    });
    const ctx = { state };
    // 玩家回合只推进时间，不碰事件；后台 due 事件由 world_due 结算。
    const turn = buildTurn({
      turnId: 'turn_bypass',
      command: { kind: 'advance_time', deltaMinutes: 10, reason: 'player_wait' },
      source: 'player_turn',
    });
    const result = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] });
    assert(result.ok, '场景2 必须成功');
    // 后台事件仍 scheduled（本包事务不自动结算 due 事件；due scan 只标 blocked/排序）——玩家线不被强行跳转。
    const worldInst = result.state.worldEvents.find((w) => w.eventInstanceId === 'evt_world');
    assert(worldInst !== undefined, '场景2 后台事件保留');
    assert(result.state.gameClock.now.minuteOfDay === 10, '场景2 时间推进');
    // 玩家无参与回执：factLedger 为空（玩家回合未提交事实）。
    assert(result.state.factLedger.length === 0, '场景2 玩家无参与回执');
    assert(result.state.knowledgeGrants.length === 0, '场景2 无知识 grant');
    recordPositive('场景2-玩家完全绕开', 'clock advance + no player fact + no knowledge');
  }

  // ═══════════ 场景 3：玩家提前解决未来事件 ═══════════
  {
    const allocator = await makeAllocator();
    const state = makeEmptyState({
      worldEvents: [
        makeEventInstance({ eventInstanceId: 'evt_future', eventDefinitionId: 'evt_def_c', status: 'active' }),
        // 有显式因果（parentInstanceId 指向 evt_future）的后续原定事件 -> 应 superseded。
        makeEventInstance({ eventInstanceId: 'evt_followup', eventDefinitionId: 'evt_def_c', status: 'active', parentInstanceId: 'evt_future', dueAt: { dayOrdinal: 3, minuteOfDay: 0 } }),
        // 同 definition 但无因果关系的独立实例 -> 不误伤（保持 active）。
        makeEventInstance({ eventInstanceId: 'evt_independent', eventDefinitionId: 'evt_def_c', status: 'active' }),
      ],
    });
    const ctx = { state };
    const instFpFuture = await cmdValidator.instanceFingerprintOf(state, 'evt_future');
    const rawBodyEarly = '玩家在原定章节前提前完成了装置危机（evt_future）。';
    const evidenceEarly = await narrativeSpanEvidence(rawBodyEarly, 'turn_early:body');
    const turn = buildTurn({
      turnId: 'turn_early',
      responseId: 'turn_early:body',
      command: {
        kind: 'resolve_event_instance',
        target: { eventInstanceId: 'evt_future', expectedInstanceFingerprint: instFpFuture },
        resolutionMode: 'player_early',
        outcome: 'normal',
        evidenceRefs: [evidenceEarly],
      },
      rawBody: rawBodyEarly,
    });
    const result = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [{ eventInstanceId: 'evt_future', factType: 'unit_completed' }] });
    assert(result.ok, '场景3 必须成功');
    const future = result.state.worldEvents.find((w) => w.eventInstanceId === 'evt_future');
    const followup = result.state.worldEvents.find((w) => w.eventInstanceId === 'evt_followup');
    const independent = result.state.worldEvents.find((w) => w.eventInstanceId === 'evt_independent');
    assert(future.status === 'resolved' && future.resolutionMode === 'player_early', '场景3 原实例承认提前结算');
    assert(followup.status === 'superseded', '场景3 有因果的后续原定事件 superseded（不补演旧战斗）');
    assert(independent.status === 'active', '场景3 无因果的独立实例不被误伤');
    assert(future.terminalFactId !== undefined && future.terminalFactId === result.state.factLedger.find((f) => f.eventInstanceId === 'evt_future')?.factId, '场景3 player_early 终态必须绑定本事件本回合 terminal fact');
    recordPositive('场景3-玩家提前解决未来事件', 'resolved(player_early) + causal followup superseded + independent untouched');
  }

  // ═══════════ 场景 4：玩家再次攻击已结束事件 ═══════════
  {
    const allocator = await makeAllocator();
    const base = makeEmptyState({
      worldEvents: [makeEventInstance({ eventInstanceId: 'evt_done', status: 'resolved', resolvedAt: { dayOrdinal: 1, minuteOfDay: 0 } })],
    });
    const before = stateFingerprint(base);
    const ctx = { state: base };
    const turn = buildTurn({
      turnId: 'turn_repeat',
      command: {
        kind: 'resolve_event_instance',
        target: { eventInstanceId: 'evt_done', expectedInstanceFingerprint: 'fp' },
        resolutionMode: 'player',
        outcome: 'normal',
        evidenceRefs: [],
      },
    });
    const result = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] });
    assert(!result.ok && result.receipt.errorCodes.includes('ALREADY_TERMINAL'), '场景4 必须 ALREADY_TERMINAL，实际 ' + result.receipt.errorCodes.join(','));
    assert(stateFingerprint(result.state) === before, '场景4 状态、事实、outbox 数量不变');
    assert(result.state.runtimeRevision === 0, '场景4 拒绝后 revision 不变');
    recordRejected('场景4-再次攻击已结束事件', 'ALREADY_TERMINAL @ 终态事件不允许再次结算', 'ALREADY_TERMINAL');
  }

  // ═══════════ 场景 5：一回合完成多个小单元（只有前两个有证据） ═══════════
  {
    const allocator = await makeAllocator();
    const state = makeEmptyState({
      worldEvents: [
        makeEventInstance({ eventInstanceId: 'unit_a', eventDefinitionId: 'evt_a', status: 'active' }),
        makeEventInstance({ eventInstanceId: 'unit_b', eventDefinitionId: 'evt_b', status: 'active' }),
        makeEventInstance({ eventInstanceId: 'unit_c', eventDefinitionId: 'evt_c', status: 'active' }),
      ],
    });
    const ctx = { state };
    // 前两个单元各自有正文证据；第三个无。
    const turn = buildTurn({
      turnId: 'turn_multi',
      command: { kind: 'path_command', action: 'enter', targetId: 'units' },
      rawBody: '正文同时处理了单元 A 与单元 B，未涉足单元 C。',
      auxiliary: {
        validatedSystemCommands: [
          { commandId: 'sys_a', commandFingerprint: 'fa', scope: { unit: 'unit_a' } },
          { commandId: 'sys_b', commandFingerprint: 'fb', scope: { unit: 'unit_b' } },
        ],
      },
      claimedCompletedUnitIds: ['unit_a', 'unit_b'],
    });
    const result = await reducer.runRuntimeTurn(turn, {
      allocator,
      ctx,
      factsOfInterest: [
        { eventInstanceId: 'unit_a', factType: 'unit_completed' },
        { eventInstanceId: 'unit_b', factType: 'unit_completed' },
        { eventInstanceId: 'unit_c', factType: 'unit_completed' },
      ],
    });
    assert(result.ok, '场景5 必须成功');
    const completed = result.state.worldEvents.filter((w) => w.status === 'resolved').map((w) => w.eventInstanceId);
    assert(completed.includes('unit_a') && completed.includes('unit_b'), '场景5 前两个单元完成');
    assert(!completed.includes('unit_c'), '场景5 第三个单元不得被顺带消耗');
    const c = result.state.worldEvents.find((w) => w.eventInstanceId === 'unit_c');
    assert(c.status === 'active', '场景5 第三个单元保持原状态（不因后单元有证据被顺带消耗）');
    // C4：completedUnitIds 只报告本回合实际从非终态转移的单元。
    assert(JSON.stringify([...result.receipt.completedUnitIds].sort()) === JSON.stringify(['unit_a', 'unit_b']), '场景5 completedUnitIds 只报告实际转移单元');
    recordPositive('场景5-多单元证据', 'A+B resolved, C active');

    // 反向：声明三单元但只有两个有证据 -> gate multi_unit 拒绝（retry），不 allow。
    const turnClaimAll = buildTurn({
      turnId: 'turn_multi_claim_all',
      command: { kind: 'path_command', action: 'enter', targetId: 'units' },
      rawBody: '正文声称三个单元全部完成（unit_a/unit_b/unit_c）。',
      auxiliary: {
        validatedSystemCommands: [
          { commandId: 'sys_a', commandFingerprint: 'fa', scope: { unit: 'unit_a' } },
          { commandId: 'sys_b', commandFingerprint: 'fb', scope: { unit: 'unit_b' } },
        ],
      },
      claimedCompletedUnitIds: ['unit_a', 'unit_b', 'unit_c'],
    });
    const rejectResult = await reducer.runRuntimeTurn(turnClaimAll, {
      allocator,
      ctx,
      factsOfInterest: [
        { eventInstanceId: 'unit_a', factType: 'unit_completed' },
        { eventInstanceId: 'unit_b', factType: 'unit_completed' },
        { eventInstanceId: 'unit_c', factType: 'unit_completed' },
      ],
    });
    assert(!rejectResult.ok && rejectResult.receipt.errorCodes.includes('RETRY'), '场景5-反向-声明三单元但证据不足必须 retry，实际 ' + rejectResult.receipt.errorCodes.join(','));
    recordRejected('场景5-反向-多单元证据不足不allow', 'RETRY（multi_unit）', 'RETRY');
  }

  // ═══════════ 场景 6：玩家只看到新闻（无知识传播则角色/NPC 不知情） ═══════════
  {
    const allocator = await makeAllocator();
    const state = makeEmptyState({
      worldEvents: [makeEventInstance({ eventInstanceId: 'evt_news', status: 'active' })],
    });
    const ctx = { state };
    const instFpNews = await cmdValidator.instanceFingerprintOf(state, 'evt_news');
    const rawBodyNews = '世界后台完成（evt_news）。';
    const evidenceNews = await narrativeSpanEvidence(rawBodyNews, 'turn_news:body');
    const turn = buildTurn({
      turnId: 'turn_news',
      responseId: 'turn_news:body',
      command: {
        kind: 'resolve_event_instance',
        target: { eventInstanceId: 'evt_news', expectedInstanceFingerprint: instFpNews },
        resolutionMode: 'world_background',
        outcome: 'normal',
        evidenceRefs: [evidenceNews],
      },
      source: 'world_due',
      rawBody: rawBodyNews,
    });
    const result = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [{ eventInstanceId: 'evt_news', factType: 'unit_completed' }] });
    assert(result.ok, '场景6 必须成功');
    // 玩家上帝视角可看到 outbox（新闻）；无 KnowledgeGrant -> 玩家角色/NPC 不知情。
    assert(result.outbox.some((o) => o.kind === 'news'), '场景6 产生新闻 outbox');
    assert(result.state.knowledgeGrants.length === 0, '场景6 无 KnowledgeGrant');
    assert(result.state.factLedger.every((f) => f.playerParticipated === false), '场景6 后台事实 playerParticipated=false');
    recordPositive('场景6-玩家只看到新闻', 'news outbox + 0 knowledge grants');
  }

  // ═══════════ 场景 7：非法正文在发布门前被拦截 ═══════════
  {
    const allocator = await makeAllocator();
    const state = makeEmptyState({
      worldEvents: [makeEventInstance({ eventInstanceId: 'evt_terminal', status: 'resolved' })],
    });
    const ctx = { state };
    const turn = buildTurn({
      turnId: 'turn_gate',
      command: { kind: 'path_command', action: 'enter', targetId: 'terminal' },
      rawBody: '正文声称重新经历了已结束的装置危机（evt_terminal）。',
      claimedCompletedUnitIds: ['evt_terminal'],
    });
    const result = await reducer.runRuntimeTurn(turn, {
      allocator,
      ctx,
      factsOfInterest: [{ eventInstanceId: 'evt_terminal', factType: 'unit_completed' }],
    });
    assert(!result.ok, '场景7 必须被 gate 拒绝');
    assert(result.receipt.errorCodes.includes('ALLOW_REFRAMED') || result.receipt.errorCodes.includes('REJECT'), '场景7 gate 拒绝/改写，实际 ' + result.receipt.errorCodes.join(','));
    assert(result.outbox.length === 0 && result.state.factLedger.length === 0, '场景7 无副作用');
    recordRejected('场景7-非法正文 gate 拦截', 'gate reject/allow_reframed + 零副作用', '零副作用');
  }

  // ═══════════ 反向（§7 固定拒绝） ═══════════
  {
    const allocator = await makeAllocator();
    // 1. 缺少 expected revision -> STALE_BRANCH。
    {
      const state = makeEmptyState();
      const turn = buildTurn({ turnId: 't_stale', expectedRuntimeRevision: 5, command: { kind: 'advance_time', deltaMinutes: 0, reason: 'turn_default' } });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('STALE_BRANCH'), '反向-缺少expected revision 必须 STALE_BRANCH');
      recordRejected('反向-缺少expected revision', 'STALE_BRANCH', 'STALE_BRANCH');
    }
    // 2. 错误 branch。
    {
      const state = makeEmptyState();
      const turn = buildTurn({ turnId: 't_branch', runtimeBranchId: 'branch_wrong', command: { kind: 'advance_time', deltaMinutes: 0, reason: 'turn_default' } });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('STALE_BRANCH'), '反向-错误branch 必须 STALE_BRANCH');
      recordRejected('反向-错误branch', 'STALE_BRANCH', 'STALE_BRANCH');
    }
    // 3. 冲突 idempotency key（同 key 不同 payload）-> IDEMPOTENCY_KEY_REUSED。
    {
      const state = makeEmptyState({ commandIdempotencyIndex: { key_x: { commandFingerprint: 'payloadA', resultRevision: 1, resultCode: 'ok', receiptId: 'r', resultHash: 'h', resultRef: { saveNodeId: 's', stateFingerprint: 'sf' } } } });
      const turn = buildTurn({ turnId: 't_key', idempotencyKey: 'key_x', command: { kind: 'advance_time', deltaMinutes: 5, reason: 'travel' } });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('IDEMPOTENCY_KEY_REUSED'), '反向-冲突幂等键 必须 IDEMPOTENCY_KEY_REUSED');
      recordRejected('反向-冲突idempotencyKey', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_KEY_REUSED');
    }
    // 4. 重复 idempotency key（同 payload）-> ALREADY_APPLIED，零副作用。
    {
      // commandFingerprint 现在 = canonical({command, bodyFingerprint})；advance_time 无正文 -> bodyFingerprint=''。
      const commandFp = canonicalJsonStringify({ command: { kind: 'advance_time', deltaMinutes: 0, reason: 'turn_default' }, bodyFingerprint: '' });
      const state = makeEmptyState({ commandIdempotencyIndex: { key_y: { commandFingerprint: commandFp, resultRevision: 1, resultCode: 'ok', receiptId: 'existing', resultHash: 'h', resultRef: { saveNodeId: 's', stateFingerprint: 'sf' } } } });
      const turn = buildTurn({ turnId: 't_dup', idempotencyKey: 'key_y', command: { kind: 'advance_time', deltaMinutes: 0, reason: 'turn_default' } });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('ALREADY_APPLIED'), '反向-重复幂等键 必须 ALREADY_APPLIED');
      assert(r.outbox.length === 0, '反向-重复幂等键 零副作用');
      recordRejected('反向-重复idempotencyKey', 'ALREADY_APPLIED + 零副作用', 'ALREADY_APPLIED');
    }
    // 5. 终态唯一事件 resolve/create/push/update 全部拒绝（场景4 已覆盖 resolve；此处覆盖 create 同 definition）。
    {
      const { store, catalogFingerprint, eventDefinitions } = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_def_a' })]);
      const definitionFingerprint = eventDefinitions[0].definitionFingerprint;
      const state = makeEmptyState({ assetCatalogFingerprint: catalogFingerprint, worldEvents: [makeEventInstance({ eventInstanceId: 'evt_dead', status: 'resolved' })] });
      const ctx = {
        state,
        catalog: { catalogFingerprint, store, eventDefinitions },
      };
      const turn = buildTurn({
        turnId: 't_create_again',
        command: {
          kind: 'create_event_instance',
          proposal: { definitionRef: { eventDefinitionId: 'evt_def_a', definitionFingerprint }, evidenceRefs: [narrativeEvidence('re')] },
        },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('ALREADY_TERMINAL'), '反向-终态后同定义 create 必须 ALREADY_TERMINAL，实际 ' + r.receipt.errorCodes.join(','));
      recordRejected('反向-终态后同定义create', 'ALREADY_TERMINAL', 'ALREADY_TERMINAL');
    }
    // 5b. 空证据 + 错 target fingerprint resolve -> 拒绝（实例指纹由当前 state 内部计算，无 provider）。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_inst_1', status: 'active' })] });
      const ctx = { state };
      const turn = buildTurn({
        turnId: 't_bad_target',
        command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_inst_1', expectedInstanceFingerprint: 'sha256:wrong_fp' }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] });
      assert(!r.ok, '反向-空证据+错fingerprint resolve 必须拒绝');
      assert(r.receipt.errorCodes.some((c) => c === 'STALE_BRANCH' || c === 'MISSING_EVIDENCE'), '反向-拒绝码，实际 ' + r.receipt.errorCodes.join(','));
      recordRejected('反向-空证据错fingerprint resolve', r.receipt.errorCodes.join(',') + ' 拒绝', '拒绝');
    }
    // 6. 事实缺证据（confirmed 无 evidence）-> MISSING_EVIDENCE。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ status: 'active' })] });
      const instFpNoEv = await cmdValidator.instanceFingerprintOf(state, 'evt_inst_1');
      const turn = buildTurn({
        turnId: 't_noev',
        command: {
          kind: 'append_fact',
          proposal: { eventTarget: { eventInstanceId: 'evt_inst_1', expectedInstanceFingerprint: instFpNoEv }, factType: 'x', payload: {}, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', playerParticipated: true },
        },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('MISSING_EVIDENCE'), '反向-事实缺证据 必须 MISSING_EVIDENCE，实际 ' + r.receipt.errorCodes.join(','));
      recordRejected('反向-事实缺证据', 'MISSING_EVIDENCE', 'MISSING_EVIDENCE');
    }
    // 7. 同标题/别名/敌人名称伪造新实例：once 已有终态 -> ALREADY_TERMINAL（标题不能绕过机器身份）。
    {
      const { store, catalogFingerprint, eventDefinitions } = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_def_d' })]);
      const definitionFingerprint = eventDefinitions[0].definitionFingerprint;
      const state = makeEmptyState({ assetCatalogFingerprint: catalogFingerprint, worldEvents: [makeEventInstance({ eventInstanceId: 'evt_orig', status: 'resolved', eventDefinitionId: 'evt_def_d' })] });
      const ctx = {
        state,
        catalog: { catalogFingerprint, store, eventDefinitions },
      };
      const turn = buildTurn({
        turnId: 't_fake',
        command: {
          kind: 'create_event_instance',
          proposal: { definitionRef: { eventDefinitionId: 'evt_def_d', definitionFingerprint }, evidenceRefs: [narrativeEvidence('fake')] },
        },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('ALREADY_TERMINAL'), '反向-同定义伪造新实例 必须拒绝');
      recordRejected('反向-同定义伪造新实例', 'ALREADY_TERMINAL', 'ALREADY_TERMINAL');
    }
    // 8. dueAt 依赖环 -> DEPENDENCY_CYCLE（scan 将环成员标 blocked）。
    {
      const state = makeEmptyState({
        worldEvents: [
          makeEventInstance({ eventInstanceId: 'evt_cyc_a', eventDefinitionId: 'evt_a', status: 'scheduled', dependencyIds: ['evt_cyc_b'], dueAt: { dayOrdinal: 1, minuteOfDay: 0 } }),
          makeEventInstance({ eventInstanceId: 'evt_cyc_b', eventDefinitionId: 'evt_b', status: 'scheduled', dependencyIds: ['evt_cyc_a'], dueAt: { dayOrdinal: 1, minuteOfDay: 0 } }),
        ],
      });
      const result = scan.scanDueEvents(state, { dayOrdinal: 1, minuteOfDay: 5 });
      assert(result.ok && result.cycles.length > 0, '反向-dueAt依赖环 必须检测');
      assert(result.state.worldEvents.every((w) => w.status === 'blocked'), '反向-依赖环成员 blocked');
      recordRejected('反向-dueAt依赖环', 'DEPENDENCY_CYCLE (blocked)', 'blocked');
    }
    // 9. 事务失败时旧 state/账本/outbox 字节不变（STALE_BRANCH 已证；此处证 factLedger/outbox 不变）。
    {
      const state = makeEmptyState({ factLedger: [{ factId: 'f0', eventInstanceId: 'e', sourceRevision: 0, factType: 't', payload: {}, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' }] });
      const before = stateFingerprint(state);
      const turn = buildTurn({ turnId: 't_fail', expectedRuntimeRevision: 9, command: { kind: 'advance_time', deltaMinutes: 0, reason: 'turn_default' } });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && stateFingerprint(r.state) === before, '反向-失败事务旧state字节不变');
      assert(r.outbox.length === 0 && r.sideEffects.factLedger.length === 0, '反向-失败事务零副作用');
      recordRejected('反向-失败事务零副作用', 'old state bytes unchanged', 'unchanged');
    }
    // 10. ID 生成禁止数组位置/当前时间（静态探针：模块源码无 index/Date.now 参与 stableId）。
    {
      const txnSrc = fs.readFileSync(path.join(process.cwd(), 'services/storyRuntime/turnTransaction.ts'), 'utf8');
      const seed = fs.readFileSync(path.join(process.cwd(), 'services/storyRuntime/worldEventSeeder.ts'), 'utf8');
      const combined = (txnSrc + '\n' + seed).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      assert(!combined.includes('Date.now') && !combined.includes('Math.random'), '事务/seed 禁止时间/随机');
      recordRejected('反向-ID禁用时间/随机', 'static tokens absent', 'absent');
    }
  }

  // ── §11 复审探针（受版本控制）──
  {
    const allocator = await makeAllocator();
    // 1. 一条 gameplay receipt + A/B/C -> 只允许明确绑定的 1 个单元。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'unit_a' }), makeEventInstance({ eventInstanceId: 'unit_b' }), makeEventInstance({ eventInstanceId: 'unit_c' })] });
      const turn = buildTurn({
        turnId: 't_receipt',
        command: { kind: 'path_command', action: 'enter', targetId: 'units' },
        rawBody: '完成单元 A（unit_a）。',
        auxiliary: { gameplayReceipts: [{ receiptId: 'g1', receiptType: 'x', eventInstanceId: 'unit_a' }] },
        claimedCompletedUnitIds: ['unit_a'],
      });
      const r = await reducer.runRuntimeTurn(turn, {
        allocator,
        ctx: { state },
        factsOfInterest: [{ eventInstanceId: 'unit_a', factType: 'unit_completed' }, { eventInstanceId: 'unit_b', factType: 'unit_completed' }, { eventInstanceId: 'unit_c', factType: 'unit_completed' }],
      });
      assert(r.ok, '探针-绑定 receipt 必须成功');
      const resolved = r.state.worldEvents.filter((w) => w.status === 'resolved').map((w) => w.eventInstanceId);
      assert(JSON.stringify(resolved) === JSON.stringify(['unit_a']), '探针-一条 receipt 只完成绑定单元，实际 ' + JSON.stringify(resolved));
      recordPositive('探针-一条receipt只绑定一单元', 'unit_a only');
    }
    // 2. 同 UTF-8 byte length 不同正文 -> byte length 相同但 fingerprint 不同（F2）。
    {
      const body1 = '正文A'; // UTF-8: 3+3+1 = 7 bytes
      const body2 = 'BBBBBBB'; // UTF-8: 7 bytes
      assert(Buffer.byteLength(body1, 'utf8') === Buffer.byteLength(body2, 'utf8'), '探针-两条正文 UTF-8 byte length 必须相同，实际 ' + Buffer.byteLength(body1, 'utf8') + ' vs ' + Buffer.byteLength(body2, 'utf8'));
      const bodyFp1 = await extractorModule.bodyFingerprintOf(body1);
      const bodyFp2 = await extractorModule.bodyFingerprintOf(body2);
      assert(bodyFp1 !== bodyFp2, '探针-同长度不同正文 fingerprint 必须不同');
      recordPositive('探针-同长度不同正文fingerprint不同', 'bytes=' + Buffer.byteLength(body1, 'utf8') + ' ' + bodyFp1.slice(0, 16) + ' != ' + bodyFp2.slice(0, 16));
    }
    // 3. 同 key 同命令但正文改变 -> IDEMPOTENCY_KEY_REUSED。
    {
      const state = makeEmptyState();
      const first = buildTurn({ turnId: 't_body1', idempotencyKey: 'key_body', command: { kind: 'path_command', action: 'enter', targetId: 'x' }, rawBody: '正文v1（unit_x）。', auxiliary: { validatedSystemCommands: [{ commandId: 'sys', commandFingerprint: 'f', scope: { unit: 'unit_x' } }] }, claimedCompletedUnitIds: ['unit_x'] });
      const s1 = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'unit_x' })] });
      const r1 = await reducer.runRuntimeTurn(first, { allocator, ctx: { state: s1 }, factsOfInterest: [{ eventInstanceId: 'unit_x', factType: 'unit_completed' }] });
      assert(r1.ok, '探针-首次正文必须成功');
      // 同 key 换正文 -> IDEMPOTENCY_KEY_REUSED（幂等检查先于 gate）。
      const second = buildTurn({ turnId: 't_body2', expectedRuntimeRevision: r1.state.runtimeRevision, idempotencyKey: 'key_body', command: { kind: 'path_command', action: 'enter', targetId: 'x' }, rawBody: '正文v2 完全不同（unit_x）。', auxiliary: { validatedSystemCommands: [{ commandId: 'sys', commandFingerprint: 'f', scope: { unit: 'unit_x' } }] }, claimedCompletedUnitIds: ['unit_x'] });
      const r2 = await reducer.runRuntimeTurn(second, { allocator, ctx: { state: r1.state }, factsOfInterest: [{ eventInstanceId: 'unit_x', factType: 'unit_completed' }] });
      assert(!r2.ok && r2.receipt.errorCodes.includes('IDEMPOTENCY_KEY_REUSED'), '探针-同key改正文必须 IDEMPOTENCY_KEY_REUSED，实际 ' + r2.receipt.errorCodes.join(','));
      recordRejected('探针-同key改正文IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_KEY_REUSED');
    }
    // 4. 事实时间 == 明确事务 GameTime（occurredAt 不再硬编码 {0,0}）。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_t' })] });
      const instFpT = await cmdValidator.instanceFingerprintOf(state, 'evt_t');
      const rawBodyT = '完成（evt_t）。';
      const evidenceT = await narrativeSpanEvidence(rawBodyT, 't_time:body');
      const turn = buildTurn({
        turnId: 't_time',
        responseId: 't_time:body',
        command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_t', expectedInstanceFingerprint: instFpT }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [evidenceT] },
        rawBody: rawBodyT,
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'evt_t', factType: 'unit_completed' }] });
      assert(r.ok, '探针-时间事务必须成功');
      assert(r.state.factLedger[0].occurredAt.dayOrdinal === 1 && r.state.factLedger[0].occurredAt.minuteOfDay === 0, '探针-事实 occurredAt 必须等于事务 GameTime');
      recordPositive('探针-事实时间==事务GameTime', 'dayOrdinal 1 / minuteOfDay 0');
    }
    // 5. terminalFactId 与 ledger 双向一致 + completedUnitIds 是 unit IDs。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_bind' })] });
      const instFpBind = await cmdValidator.instanceFingerprintOf(state, 'evt_bind');
      const rawBodyBind = '完成（evt_bind）。';
      const evidenceBind = await narrativeSpanEvidence(rawBodyBind, 't_bind:body');
      const turn = buildTurn({
        turnId: 't_bind',
        responseId: 't_bind:body',
        command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_bind', expectedInstanceFingerprint: instFpBind }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [evidenceBind] },
        rawBody: rawBodyBind,
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'evt_bind', factType: 'unit_completed' }] });
      assert(r.ok, '探针-绑定事务必须成功');
      const inst = r.state.worldEvents.find((w) => w.eventInstanceId === 'evt_bind');
      const fact = r.state.factLedger[0];
      assert(inst.terminalFactId === fact.factId, '探针-终态实例 terminalFactId 必须绑定 ledger fact');
      assert(r.receipt.completedUnitIds.includes('evt_bind'), '探针-completedUnitIds 保存 unit ID');
      assert(!r.receipt.completedUnitIds.includes('cand:'), '探针-completedUnitIds 不含 candidate ID');
      recordPositive('探针-terminalFactId双向+completedUnitIds=unitIDs', 'bound + unit IDs');
    }
    // 6. clock.lastAdvanceRevision == 提交后 runtimeRevision。
    {
      const state = makeEmptyState();
      const turn = buildTurn({ turnId: 't_clock', command: { kind: 'advance_time', deltaMinutes: 10, reason: 'travel' } });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r.ok, '探针-时钟事务必须成功');
      assert(r.state.gameClock.lastAdvanceRevision === r.state.runtimeRevision, '探针-lastAdvanceRevision 必须等于提交后 revision，实际 ' + r.state.gameClock.lastAdvanceRevision + ' != ' + r.state.runtimeRevision);
      recordPositive('探针-clock.lastAdvanceRevision==runtimeRevision', String(r.state.runtimeRevision));
    }
    // 7. null evidence -> 稳定拒绝，不 throw。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_null', status: 'active' })] });
      const instFpNull = await cmdValidator.instanceFingerprintOf(state, 'evt_null');
      const turn = buildTurn({
        turnId: 't_null',
        command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_null', expectedInstanceFingerprint: instFpNull }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [null] },
      });
      let rejected = false;
      let errorMessage = '';
      try { const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] }); rejected = !r.ok; errorMessage = r.receipt.errorCodes.join(','); } catch (error) { errorMessage = 'THREW: ' + error.message; }
      assert(rejected && !errorMessage.startsWith('THREW'), '探针-null evidence 必须稳定拒绝不 throw，实际 ' + errorMessage);
      recordRejected('探针-null evidence稳定拒绝', errorMessage, 'INVALID_COMMAND');
    }
    // 8. repeatable 同一来源伪造新实例 -> 拒绝（MISSING_EVIDENCE）。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_r1', eventDefinitionId: 'evt_repeat', status: 'resolved', replayPolicy: 'repeatable' })] });
      const created = await eventLifecycle.createInstance(state.worldEvents, {
        eventInstanceId: 'evt_r2', eventDefinitionId: 'evt_repeat', replayPolicy: 'repeatable', at: { dayOrdinal: 2, minuteOfDay: 0 }, source: undefined, idempotencyKey: 'seed:r2', allocator,
      });
      assert(!created.ok && created.code === 'MISSING_EVIDENCE', '探针-repeatable 同源伪造必须拒绝');
      recordRejected('探针-repeatable同源伪造拒绝', 'MISSING_EVIDENCE', 'MISSING_EVIDENCE');
    }
    // 9. future dependency 不进入 due IDs（未来依赖不入列）。
    {
      const state = makeEmptyState({
        worldEvents: [
          makeEventInstance({ eventInstanceId: 'evt_due', eventDefinitionId: 'evt_a', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 0 }, dependencyIds: ['evt_future_dep'] }),
          makeEventInstance({ eventInstanceId: 'evt_future_dep', eventDefinitionId: 'evt_b', status: 'scheduled', dueAt: { dayOrdinal: 9, minuteOfDay: 0 } }),
        ],
      });
      const r = scan.scanDueEvents(state, { dayOrdinal: 1, minuteOfDay: 5 });
      assert(!r.dueInstanceIds.includes('evt_future_dep'), '探针-未来依赖不得进入 due IDs');
      assert(!r.dueInstanceIds.includes('evt_due'), '探针-依赖未满足的 child 不得进入 due IDs');
      recordRejected('探针-future dependency不入due', 'both excluded（未来依赖与依赖未满足的 child 都不入列）', '不入列');
    }
    // 10. 同 revision 二次 scan -> 不重复领取。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_due2', eventDefinitionId: 'evt_a', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 0 } })] });
      const first = scan.scanDueEvents(state, { dayOrdinal: 1, minuteOfDay: 5 });
      assert(first.dueInstanceIds.includes('evt_due2'), '探针-首次 scan 必须领取');
      assert(first.state.worldEvents[0].status === 'resolution_pending' && first.state.worldEvents[0].eventResolutionKey !== undefined, '探针-领取必须标 resolution_pending+eventResolutionKey');
      const second = scan.scanDueEvents(first.state, { dayOrdinal: 1, minuteOfDay: 5 });
      assert(!second.dueInstanceIds.includes('evt_due2'), '探针-同 revision 二次 scan 不得重复领取');
      recordRejected('探针-同revision重扫不重复领取', 'second scan empty（已领取实例被过滤，不重复领取）', '不重复领取');
    }
    // 11. unrelated outbox 对任意 fact -> false（outboxHasFact 删恒真分支/删 substring 兜底）。
    {
      const state = makeEmptyState();
      const item = await outbox.buildOutboxItem(state, {
        kind: 'news', aggregateKey: 'k', operation: 'create', payload: { unrelated: true }, sourceRefFingerprint: 'sha256:src_other', sourceRevision: 1, consumerIds: ['news'], allocator,
      });
      assert(item.ok, '探针-outbox 构造必须成功');
      assert(outbox.outboxHasFact(item.outbox, 'fact_xyz') === false, '探针-unrelated outbox 对任意 fact 必须 false');
      recordPositive('探针-unrelated outbox不冒充fact', 'false');
    }
  }

  // ── §10 H：12 命令逐 kind 组合入口矩阵（每行实际调用 runRuntimeTurn；写入口必须绑定本回合 auxiliary）──
  {
    const allocator = await makeAllocator();
    const matrixRows = [];
    const sysEvidence = (tag) => ({ kind: 'system_command', commandId: 'sys_' + tag, commandFingerprint: 'sha256:sys_' + tag });
    const sysAux = (tag) => ({ validatedSystemCommands: [{ commandId: 'sys_' + tag, commandFingerprint: 'sha256:sys_' + tag, scope: { unit: '' } }] });
    // 1 advance_time（delta>0）-> 成功 clock.now 变化。
    {
      const state = makeEmptyState();
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({ turnId: 'm_adv', command: { kind: 'advance_time', deltaMinutes: 10, reason: 'travel' } });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r.ok, 'advance_time 必须成功');
      assert(r.state.gameClock.now.minuteOfDay === 10, 'advance_time 必须推进 clock');
      assert(r.state.runtimeRevision === beforeRev + 1, 'advance_time revision +1');
      matrixRows.push('advance_time / success / gameClock.now / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-advance_time', 'success clock+10');
    }
    // 2 create_event_instance（需可信 catalog store 绑定 + 真实 definition fingerprint + 绑定证据）-> 成功新增实例。
    {
      const def = makeWorldEventDefinition({ eventDefinitionId: 'evt_cre' });
      const definitionFingerprint = await cmdValidator.definitionFingerprintOf({ ...def, definitionFingerprint: '' });
      const { store, catalogFingerprint, eventDefinitions } = await makeTrustedCatalog([{ ...def, definitionFingerprint }]);
      const state = makeEmptyState({ assetCatalogFingerprint: catalogFingerprint });
      const ctx = { state, catalog: { catalogFingerprint, store, eventDefinitions } };
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({
        turnId: 'm_cre',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_cre', definitionFingerprint }, evidenceRefs: [sysEvidence('cre')] } },
        auxiliary: sysAux('cre'),
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] });
      assert(r.ok, 'create_event_instance 必须成功: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.worldEvents.length === 1, 'create_event_instance 必须新增实例');
      assert(r.state.runtimeRevision === beforeRev + 1, 'create_event_instance revision +1');
      matrixRows.push('create_event_instance / success / worldEvents+1 / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-create_event_instance', 'success worldEvents+1');
    }
    // 3 resolve_event_instance -> 成功 resolved（真实指纹 + 真实 span）。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_res' })] });
      const instFp = await cmdValidator.instanceFingerprintOf(state, 'evt_res');
      const rawBody = '完成（evt_res）。';
      const evidence = await narrativeSpanEvidence(rawBody, 'm_res:body');
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({ turnId: 'm_res', responseId: 'm_res:body', command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_res', expectedInstanceFingerprint: instFp }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [evidence] }, rawBody, claimedCompletedUnitIds: ['evt_res'] });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'evt_res', factType: 'unit_completed' }] });
      assert(r.ok, 'resolve_event_instance 必须成功');
      assert(r.state.worldEvents.find((w) => w.eventInstanceId === 'evt_res').status === 'resolved', 'resolve 必须 resolved');
      assert(r.state.runtimeRevision === beforeRev + 1, 'resolve revision +1');
      matrixRows.push('resolve_event_instance / success / resolved / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-resolve_event_instance', 'success resolved');
    }
    // 4 supersede_event_instance -> 成功 superseded。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_sup' })] });
      const instFp = await cmdValidator.instanceFingerprintOf(state, 'evt_sup');
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({
        turnId: 'm_sup',
        command: { kind: 'supersede_event_instance', target: { eventInstanceId: 'evt_sup', expectedInstanceFingerprint: instFp }, reason: '替代', evidenceRefs: [sysEvidence('sup')] },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_sup', commandFingerprint: 'sha256:sys_sup', scope: { unit: 'evt_sup' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r.ok, 'supersede 必须成功: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.worldEvents.find((w) => w.eventInstanceId === 'evt_sup').status === 'superseded', 'supersede 必须 superseded');
      assert(r.state.runtimeRevision === beforeRev + 1, 'supersede revision +1');
      matrixRows.push('supersede_event_instance / success / superseded / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-supersede_event_instance', 'success superseded');
    }
    // 5 append_fact -> 成功 ledger +1。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_fact' })] });
      const instFp = await cmdValidator.instanceFingerprintOf(state, 'evt_fact');
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({
        turnId: 'm_fact',
        command: { kind: 'append_fact', proposal: { eventTarget: { eventInstanceId: 'evt_fact', expectedInstanceFingerprint: instFp }, factType: 'restored', payload: { ok: true }, publicScope: { kind: 'private' }, evidenceRefs: [sysEvidence('fact')], evidenceLevel: 'supported', playerParticipated: true } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_fact', commandFingerprint: 'sha256:sys_fact', scope: { unit: 'evt_fact' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r.ok, 'append_fact 必须成功: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.factLedger.length === 1, 'append_fact 必须真正追加事实');
      assert(r.state.runtimeRevision === beforeRev + 1, 'append_fact revision +1');
      matrixRows.push('append_fact / success / factLedger+1 / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-append_fact', 'success factLedger+1');
    }
    // 6 upsert_plan_item（player）-> 成功 playerPlanPool +1。
    {
      const state = makeEmptyState();
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({ turnId: 'm_plan', command: { kind: 'upsert_plan_item', proposal: { unitId: 'unit_p', dependencyFactIds: [], acceptanceModes: ['正文承接'], evidenceRefs: [sysEvidence('plan')] } }, auxiliary: { validatedSystemCommands: [{ commandId: 'sys_plan', commandFingerprint: 'sha256:sys_plan', scope: { unit: 'unit_p' } }] } });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r.ok, 'upsert_plan_item 必须成功: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.playerPlanPool.length === 1, 'upsert_plan_item 必须真正入 pool');
      assert(r.state.runtimeRevision === beforeRev + 1, 'upsert_plan_item revision +1');
      matrixRows.push('upsert_plan_item / success / playerPlanPool+1 / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-upsert_plan_item', 'success playerPlanPool+1');
    }
    // 7 enqueue_convergence（需 sourceFactIds 存在）-> 成功 convergenceQueue +1。
    {
      const fact = { factId: 'sha256:fact_a', eventInstanceId: 'evt_fact', sourceRevision: 0, factType: 't', payload: {}, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'supported', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' };
      const state = makeEmptyState({ factLedger: [fact] });
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({ turnId: 'm_conv', command: { kind: 'enqueue_convergence', proposal: { sourceFactIds: ['sha256:fact_a'], eligiblePlanItemIds: [], evidenceRefs: [sysEvidence('conv')] } }, auxiliary: sysAux('conv') });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r.ok, 'enqueue_convergence 必须成功: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.convergenceQueue.length === 1, 'enqueue_convergence 必须真正入队');
      assert(r.state.runtimeRevision === beforeRev + 1, 'enqueue_convergence revision +1');
      matrixRows.push('enqueue_convergence / success / convergenceQueue+1 / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-enqueue_convergence', 'success convergenceQueue+1');
    }
    // 8 register_emergent_event_definition -> 明确拒绝，state/revision 不变。
    {
      const state = makeEmptyState();
      const before = JSON.stringify(state);
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({ turnId: 'm_reg', command: { kind: 'register_emergent_event_definition', proposal: { title: 'x', actorEntityIds: [], targetEntityIds: [], dependencyDefinitionIds: [], completionPredicate: { predicateId: 'p', targetEntityIds: [], requiredFactTypes: [], requiredEvidenceKinds: [], payloadMatchers: [], minimumEvidenceCount: 1, deterministicKey: 'k', allowedOutcomes: [], failureOutcomes: [] }, replayPolicy: 'once', publicScope: { kind: 'private' }, causeEvidenceRefs: [], identityAnchors: [] } } });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('INVALID_COMMAND'), 'register_emergent 必须明确拒绝');
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === beforeRev, 'register_emergent 拒绝后 state 字节不变');
      matrixRows.push('register_emergent_event_definition / reject / INVALID_COMMAND / ' + beforeRev + '->' + beforeRev);
      recordRejected('矩阵-register_emergent_event_definition', 'INVALID_COMMAND 拒绝 + 字节不变', 'INVALID_COMMAND');
    }
    // 9 grant_knowledge -> 成功 knowledgeGrants +1。
    {
      const state = makeEmptyState();
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({ turnId: 'm_grant', command: { kind: 'grant_knowledge', proposal: { subjectType: 'npc', subjectId: 'npc_1', subjectRef: { kind: 'committed_fact', factId: 'sha256:fact_a', sourceRevision: 0 }, evidenceRefs: [sysEvidence('grant')] } }, auxiliary: sysAux('grant') });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r.ok, 'grant_knowledge 必须成功: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.knowledgeGrants.length === 1, 'grant_knowledge 必须真正追加 grant');
      assert(r.state.runtimeRevision === beforeRev + 1, 'grant_knowledge revision +1');
      matrixRows.push('grant_knowledge / success / knowledgeGrants+1 / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-grant_knowledge', 'success knowledgeGrants+1');
    }
    // 10 publish_public_schedule -> 成功 publicSchedules +1。
    {
      const state = makeEmptyState();
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({ turnId: 'm_sched', command: { kind: 'publish_public_schedule', proposal: { sourceDefinitionId: 'evt_cre', plannedAt: { dayOrdinal: 2, minuteOfDay: 0 }, publicScope: { kind: 'private' }, source: sysEvidence('sched') } }, auxiliary: sysAux('sched') });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r.ok, 'publish_public_schedule 必须成功: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.publicSchedules.length === 1, 'publish_public_schedule 必须真正生成 schedule');
      assert(r.state.runtimeRevision === beforeRev + 1, 'publish_public_schedule revision +1');
      matrixRows.push('publish_public_schedule / success / publicSchedules+1 / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-publish_public_schedule', 'success publicSchedules+1');
    }
    // 11 issue_official_notice -> 成功 officialNotices +1。
    {
      const state = makeEmptyState();
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({ turnId: 'm_notice', command: { kind: 'issue_official_notice', proposal: { issuerId: 'station', claimFingerprint: 'sha256:claim', publicScope: { kind: 'private' }, source: sysEvidence('notice') } }, auxiliary: sysAux('notice') });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r.ok, 'issue_official_notice 必须成功: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.officialNotices.length === 1, 'issue_official_notice 必须真正生成 notice');
      assert(r.state.runtimeRevision === beforeRev + 1, 'issue_official_notice revision +1');
      matrixRows.push('issue_official_notice / success / officialNotices+1 / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-issue_official_notice', 'success officialNotices+1');
    }
    // 12 path_command enter（有证据候选）-> 成功单元 resolved。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'unit_x' })] });
      const beforeRev = state.runtimeRevision;
      const turn = buildTurn({
        turnId: 'm_path',
        command: { kind: 'path_command', action: 'enter', targetId: 'unit_x' },
        rawBody: '完成单元（unit_x）。',
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_path', commandFingerprint: 'sha256:sys_path', scope: { unit: 'unit_x' } }] },
        claimedCompletedUnitIds: ['unit_x'],
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'unit_x', factType: 'unit_completed' }] });
      assert(r.ok, 'path_command enter 必须成功: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.worldEvents.find((w) => w.eventInstanceId === 'unit_x').status === 'resolved', 'path_command enter 必须结算单元');
      assert(r.state.runtimeRevision === beforeRev + 1, 'path_command revision +1');
      matrixRows.push('path_command(enter) / success / unit resolved / ' + beforeRev + '->' + r.state.runtimeRevision);
      recordPositive('矩阵-path_command-enter', 'success unit resolved');
    }
    assert(matrixRows.length === 12, '12 命令矩阵必须覆盖全部 kind，实际 ' + matrixRows.length);
    positives.push({ name: '矩阵-12命令全kind组合入口', detail: matrixRows.join('; ') });
  }

  // ── §7 E：due 分批领取矩阵（parent→child 跨 revision）──
  {
    // 同批 parent-child：本次只领取 parent（依赖未终态不算满足），child 保持 blocked。
    {
      const state = makeEmptyState({
        worldEvents: [
          makeEventInstance({ eventInstanceId: 'evt_p', eventDefinitionId: 'evt_p', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 0 } }),
          makeEventInstance({ eventInstanceId: 'evt_c', eventDefinitionId: 'evt_c', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 0 }, dependencyIds: ['evt_p'] }),
        ],
      });
      const first = scan.scanDueEvents(state, { dayOrdinal: 1, minuteOfDay: 5 });
      assert(first.dueInstanceIds.includes('evt_p') && !first.dueInstanceIds.includes('evt_c'), 'E-同批 parent-child 本次只领 parent');
      // parent 结算提交后（状态 resolved + 新 revision 不清领取键），下一 revision 才可领 child。
      const parentResolved = first.state.worldEvents.map((w) => (w.eventInstanceId === 'evt_p' ? { ...w, status: 'resolved' } : w));
      const second = scan.scanDueEvents({ ...first.state, worldEvents: parentResolved }, { dayOrdinal: 1, minuteOfDay: 5 });
      assert(second.dueInstanceIds.includes('evt_c'), 'E-parent 结算后下一 revision 才可领 child');
      recordPositive('E-due分批领取parent→child跨revision', 'first parent only, second child');
    }
    // 环外前驱/后继不列 cycles 但保持 blocked（依赖未满足）。
    {
      const state = makeEmptyState({
        worldEvents: [
          makeEventInstance({ eventInstanceId: 'evt_pre', eventDefinitionId: 'a', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 0 }, dependencyIds: ['evt_cyc_x'] }),
          makeEventInstance({ eventInstanceId: 'evt_cyc_x', eventDefinitionId: 'b', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 0 }, dependencyIds: ['evt_cyc_y'] }),
          makeEventInstance({ eventInstanceId: 'evt_cyc_y', eventDefinitionId: 'c', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 0 }, dependencyIds: ['evt_cyc_x'] }),
        ],
      });
      const r = scan.scanDueEvents(state, { dayOrdinal: 1, minuteOfDay: 5 });
      assert(r.cycles.includes('evt_cyc_x') && r.cycles.includes('evt_cyc_y'), 'E-二节点环成员必须进 cycles');
      assert(!r.cycles.includes('evt_pre'), 'E-环外前驱不得冒充 cycle member');
      assert(r.state.worldEvents.find((w) => w.eventInstanceId === 'evt_pre').status === 'blocked', 'E-环外前驱因依赖未满足 blocked');
      assert(!r.dueInstanceIds.includes('evt_cyc_x') && !r.dueInstanceIds.includes('evt_cyc_y') && !r.dueInstanceIds.includes('evt_pre'), 'E-cycle/blocked 不得进入 due IDs');
      recordPositive('E-环外前驱不冒充cycle+blocked', 'cycles=2, pre blocked');
    }
    // 缺失依赖 -> blocked（不当作 satisfied）。
    {
      const state = makeEmptyState({
        worldEvents: [makeEventInstance({ eventInstanceId: 'evt_miss', eventDefinitionId: 'm', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 0 }, dependencyIds: ['evt_ghost'] })],
      });
      const r = scan.scanDueEvents(state, { dayOrdinal: 1, minuteOfDay: 5 });
      assert(!r.dueInstanceIds.includes('evt_miss'), 'E-缺失依赖不得入 due');
      assert(r.state.worldEvents.find((w) => w.eventInstanceId === 'evt_miss').status === 'blocked', 'E-缺失依赖必须 blocked');
      recordPositive('E-缺失依赖blocked', 'blocked');
    }
    // 输入重排不影响结果（稳定排序）。
    {
      const state = makeEmptyState({
        worldEvents: [
          makeEventInstance({ eventInstanceId: 'evt_z', eventDefinitionId: 'z', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 0 } }),
          makeEventInstance({ eventInstanceId: 'evt_a', eventDefinitionId: 'a', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 0 } }),
        ],
      });
      const r = scan.scanDueEvents(state, { dayOrdinal: 1, minuteOfDay: 5 });
      assert(JSON.stringify(r.dueInstanceIds) === JSON.stringify(['evt_a', 'evt_z']), 'E-同 dueAt 按稳定 ID 排序');
      recordPositive('E-同dueAt稳定排序+输入重排', 'a,z');
    }
  }

  // ── §5 C：重复 receiptId 跨单元必须整体拒绝（复制同 receiptId 绑定 A/B）──
  {
    const allocator = await makeAllocator();
    const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'unit_a' }), makeEventInstance({ eventInstanceId: 'unit_b' })] });
    const turn = buildTurn({
      turnId: 't_dup_receipt',
      command: { kind: 'path_command', action: 'enter', targetId: 'units' },
      rawBody: '完成（unit_a）（unit_b）。',
      auxiliary: {
        gameplayReceipts: [
          { receiptId: 'g_dup', receiptType: 'x', eventInstanceId: 'unit_a' },
          { receiptId: 'g_dup', receiptType: 'x', eventInstanceId: 'unit_b' },
        ],
      },
      claimedCompletedUnitIds: ['unit_a', 'unit_b'],
    });
    const before = JSON.stringify(state);
    const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'unit_a', factType: 'unit_completed' }, { eventInstanceId: 'unit_b', factType: 'unit_completed' }] });
    assert(!r.ok, '重复 receiptId 跨单元必须整体拒绝');
    assert(JSON.stringify(r.state) === before, '重复 receiptId 拒绝后旧 state 字节不变');
    assert(r.state.runtimeRevision === 0, '重复 receiptId 拒绝后 revision 不变');
    recordRejected('探针-重复receiptId跨单元拒绝', 'INVALID_COMMAND + 旧 state 字节不变', '旧 state');
  }

  // ── §9 G1.3.1.3 组合探针（受版本控制）──
  {
    const allocator = await makeAllocator();
    // A1：unknown command field -> INVALID_COMMAND / revision 不变。
    {
      const state = makeEmptyState();
      const before = JSON.stringify(state);
      const turn = buildTurn({ turnId: 't_unknown', command: { kind: 'advance_time', deltaMinutes: 10, reason: 'travel', unknownField: 'x' } });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.3-未知命令字段必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.includes('INVALID_COMMAND'), 'G1.3.1.3-未知命令字段必须 INVALID_COMMAND，实际 ' + r.receipt.errorCodes.join(','));
      assert(r.receipt.blockedReasons.some((b) => b.includes('未知字段') || b.includes('unknown')), 'G1.3.1.3-未知命令字段必须带稳定 path/原因，实际 ' + r.receipt.blockedReasons.join('|'));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.3-未知命令字段拒绝后旧 state 字节与 revision 不变');
      recordRejected('G1.3.1.3-unknown command field', 'INVALID_COMMAND + 字节/revision 不变', 'INVALID_COMMAND');
    }
    // A2：undefined 命令字段（extra: undefined）-> 稳定 INVALID_COMMAND，不 throw（不得在 fingerprint 阶段抛 JSON 错）。
    {
      const state = makeEmptyState();
      const before = JSON.stringify(state);
      const turn = buildTurn({ turnId: 't_undef', command: { kind: 'advance_time', deltaMinutes: 10, reason: 'travel', extra: undefined } });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.3-undefined 命令字段必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.includes('INVALID_COMMAND'), 'G1.3.1.3-undefined 命令字段必须 INVALID_COMMAND，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.3-undefined 字段拒绝后旧 state 字节与 revision 不变');
      recordRejected('G1.3.1.3-undefined command field', 'INVALID_COMMAND（结构闸门先于 fingerprint）+ 字节不变', 'INVALID_COMMAND');
    }
    // A3/A4：getter 命令 -> 稳定 INVALID_COMMAND，getter 调用次数为 0。
    {
      const state = makeEmptyState();
      const before = JSON.stringify(state);
      const getterCalls = { n: 0 };
      const cmd = { kind: 'advance_time', deltaMinutes: 10, reason: 'travel' };
      Object.defineProperty(cmd, 'leak', { get() { getterCalls.n += 1; return 'x'; }, enumerable: true });
      const turn = buildTurn({ turnId: 't_getter', command: cmd });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.3-getter 命令必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.includes('INVALID_COMMAND'), 'G1.3.1.3-getter 命令必须 INVALID_COMMAND，实际 ' + r.receipt.errorCodes.join(','));
      assert(getterCalls.n === 0, 'G1.3.1.3-getter 调用次数必须为 0，实际 ' + getterCalls.n);
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.3-getter 拒绝后旧 state 字节与 revision 不变');
      recordRejected('G1.3.1.3-getter command 0次调用', 'INVALID_COMMAND + getter 0 调用', 'INVALID_COMMAND');
    }
    // A5：循环 command -> 稳定 INVALID_COMMAND（结构闸门 unknown_field，不进入 canonical 序列化）。
    {
      const state = makeEmptyState();
      const before = JSON.stringify(state);
      const cmd = { kind: 'advance_time', deltaMinutes: 10, reason: 'travel' };
      cmd.self = cmd;
      const turn = buildTurn({ turnId: 't_cycle', command: cmd });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.3-循环命令必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.includes('INVALID_COMMAND'), 'G1.3.1.3-循环命令必须 INVALID_COMMAND，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.3-循环命令拒绝后旧 state 字节与 revision 不变');
      recordRejected('G1.3.1.3-cycle command', 'INVALID_COMMAND + 字节不变（结构闸门先于序列化）', 'INVALID_COMMAND');
    }
    // B4：ghost receipt append -> MISSING_EVIDENCE / ledger 不变 / 旧 state 字节不变。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_g', status: 'active' })] });
      const instFpG = await cmdValidator.instanceFingerprintOf(state, 'evt_g');
      const before = JSON.stringify(state);
      const turn = buildTurn({
        turnId: 't_ghost',
        command: { kind: 'append_fact', proposal: { eventTarget: { eventInstanceId: 'evt_g', expectedInstanceFingerprint: instFpG }, factType: 'x', payload: {}, publicScope: { kind: 'private' }, evidenceRefs: [{ kind: 'gameplay_receipt', receiptId: 'ghost_receipt', receiptType: 'REAL_TYPE' }], evidenceLevel: 'confirmed', playerParticipated: true } },
        auxiliary: {},
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('MISSING_EVIDENCE'), 'G1.3.1.3-ghost receipt append 必须 MISSING_EVIDENCE，实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.factLedger.length === 0, 'G1.3.1.3-ghost receipt append ledger 不变');
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.3-ghost receipt append 旧 state 字节与 revision 不变');
      recordRejected('G1.3.1.3-ghost receipt append', 'MISSING_EVIDENCE + ledger 不变', 'MISSING_EVIDENCE');
    }
    // B4：forged receiptType -> MISSING_EVIDENCE / ledger 不变（不保存伪造 ref）。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_f', status: 'active' })] });
      const instFpF = await cmdValidator.instanceFingerprintOf(state, 'evt_f');
      const before = JSON.stringify(state);
      const turn = buildTurn({
        turnId: 't_forged',
        command: { kind: 'append_fact', proposal: { eventTarget: { eventInstanceId: 'evt_f', expectedInstanceFingerprint: instFpF }, factType: 'x', payload: {}, publicScope: { kind: 'private' }, evidenceRefs: [{ kind: 'gameplay_receipt', receiptId: 'g1', receiptType: 'FORGED_TYPE' }], evidenceLevel: 'confirmed', playerParticipated: true } },
        auxiliary: { gameplayReceipts: [{ receiptId: 'g1', receiptType: 'REAL_TYPE', eventInstanceId: 'evt_f' }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('MISSING_EVIDENCE'), 'G1.3.1.3-forged receiptType 必须 MISSING_EVIDENCE，实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.factLedger.length === 0, 'G1.3.1.3-forged receiptType ledger 不变');
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.3-forged receiptType 旧 state 字节与 revision 不变');
      recordRejected('G1.3.1.3-forged receiptType', 'MISSING_EVIDENCE + ledger 不变', 'MISSING_EVIDENCE');
    }
    // B3：伪造 narrative span（bodyFingerprint 不是 raw body 真实 hash）-> MISSING_EVIDENCE / 零写入。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_span', status: 'active' })] });
      const instFpSpan = await cmdValidator.instanceFingerprintOf(state, 'evt_span');
      const before = JSON.stringify(state);
      const turn = buildTurn({
        turnId: 't_forged_span',
        responseId: 't_forged_span:body',
        command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_span', expectedInstanceFingerprint: instFpSpan }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [{ kind: 'narrative_span', responseId: 't_forged_span:body', bodyFingerprint: 'sha256:FORGED', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:FORGED_TEXT' }] },
        rawBody: '正文（evt_span）。',
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('MISSING_EVIDENCE'), 'G1.3.1.3-伪造 narrative span 必须 MISSING_EVIDENCE，实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.factLedger.length === 0 && r.state.worldEvents.find((w) => w.eventInstanceId === 'evt_span').status === 'active', 'G1.3.1.3-伪造 span 零写入（ledger 空且事件未结算）');
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.3-伪造 span 旧 state 字节与 revision 不变');
      recordRejected('G1.3.1.3-伪造 narrative span', 'MISSING_EVIDENCE + 零写入', 'MISSING_EVIDENCE');
    }
    // C-A：player_early 证据无法绑定目标（scope.unit 指向其他单元）-> MISSING_EVIDENCE（缺目标 terminal fact 不得孤儿结算）。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_early', status: 'active' })] });
      const instFpEarly = await cmdValidator.instanceFingerprintOf(state, 'evt_early');
      const before = JSON.stringify(state);
      const turn = buildTurn({
        turnId: 't_early_missing',
        command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_early', expectedInstanceFingerprint: instFpEarly }, resolutionMode: 'player_early', outcome: 'normal', evidenceRefs: [{ kind: 'system_command', commandId: 'sys_other', commandFingerprint: 'sha256:sys_other' }] },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_other', commandFingerprint: 'sha256:sys_other', scope: { unit: 'other_unit' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('MISSING_EVIDENCE'), 'G1.3.1.3-player_early 缺目标 terminal fact 必须 MISSING_EVIDENCE，实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.worldEvents.find((w) => w.eventInstanceId === 'evt_early').status === 'active', 'G1.3.1.3-player_early 不得孤儿结算');
      assert(r.state.factLedger.length === 0 && JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.3-player_early 缺目标 零写入 + 旧 state 不变');
      recordRejected('G1.3.1.3-player_early缺目标terminal fact', 'MISSING_EVIDENCE + 不孤儿结算', 'MISSING_EVIDENCE');
    }
    // C-B：supersede 缺目标 terminal fact（伪造 span）-> MISSING_EVIDENCE。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_sup2', status: 'active' })] });
      const instFpSup = await cmdValidator.instanceFingerprintOf(state, 'evt_sup2');
      const before = JSON.stringify(state);
      const turn = buildTurn({
        turnId: 't_sup_missing',
        responseId: 't_sup_missing:body',
        command: { kind: 'supersede_event_instance', target: { eventInstanceId: 'evt_sup2', expectedInstanceFingerprint: instFpSup }, reason: '替代', evidenceRefs: [{ kind: 'narrative_span', responseId: 't_sup_missing:body', bodyFingerprint: 'sha256:FORGED_SUP', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:FORGED_SUP_TEXT' }] },
        rawBody: '替代（evt_sup2）。',
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('MISSING_EVIDENCE'), 'G1.3.1.3-supersede 缺目标 terminal fact 必须 MISSING_EVIDENCE，实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.worldEvents.find((w) => w.eventInstanceId === 'evt_sup2').status === 'active', 'G1.3.1.3-supersede 不得无事实替代');
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.3-supersede 缺目标 旧 state 字节与 revision 不变');
      recordRejected('G1.3.1.3-supersede缺目标terminal fact', 'MISSING_EVIDENCE + 不替代', 'MISSING_EVIDENCE');
    }
    // C-C：A 命令携带 B 事实（factsOfInterest 只含 B，证据绑定 A）-> A 绑定自己的 terminal fact，B 不完成。
    {
      const state = makeEmptyState({
        worldEvents: [
          makeEventInstance({ eventInstanceId: 'evt_a_c', status: 'active' }),
          makeEventInstance({ eventInstanceId: 'evt_b_c', status: 'active' }),
        ],
      });
      const instFpA = await cmdValidator.instanceFingerprintOf(state, 'evt_a_c');
      const turn = buildTurn({
        turnId: 't_carry',
        command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_a_c', expectedInstanceFingerprint: instFpA }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [{ kind: 'system_command', commandId: 'sys_a_c', commandFingerprint: 'sha256:sys_a_c' }] },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_a_c', commandFingerprint: 'sha256:sys_a_c', scope: { unit: 'evt_a_c' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'evt_b_c', factType: 'unit_completed' }] });
      assert(r.ok, 'G1.3.1.3-A 命令携带 B 事实（证据绑定 A）必须成功');
      const aInst = r.state.worldEvents.find((w) => w.eventInstanceId === 'evt_a_c');
      const bInst = r.state.worldEvents.find((w) => w.eventInstanceId === 'evt_b_c');
      const aFacts = r.state.factLedger.filter((f) => f.eventInstanceId === 'evt_a_c');
      assert(aInst.status === 'resolved' && aInst.terminalFactId !== undefined, 'G1.3.1.3-A 必须 resolved 且绑定 terminal fact');
      assert(aInst.terminalFactId === aFacts[0]?.factId, 'G1.3.1.3-终态必须绑定 A 自己的本回合事实（不能拿 B 的事实当 A 的终态）');
      assert(bInst.status === 'active' && !r.state.factLedger.some((f) => f.eventInstanceId === 'evt_b_c'), 'G1.3.1.3-B（仅 mentioned）不得完成、不得落事实');
      assert(JSON.stringify(r.receipt.completedUnitIds) === JSON.stringify(['evt_a_c']), 'G1.3.1.3-completedUnitIds 只报告 A');
      recordPositive('G1.3.1.3-A命令携带B事实终态绑定A', 'A resolved + own terminal fact, B untouched');
    }
    // C-D：历史 old_done + 本回合 fresh -> completedUnitIds 只报告 fresh（不扫描历史 resolvedAt）。
    {
      const state = makeEmptyState({
        worldEvents: [
          makeEventInstance({ eventInstanceId: 'evt_old_done', status: 'resolved', resolvedAt: { dayOrdinal: 1, minuteOfDay: 0 } }),
          makeEventInstance({ eventInstanceId: 'evt_fresh', status: 'active' }),
        ],
      });
      const instFpFresh = await cmdValidator.instanceFingerprintOf(state, 'evt_fresh');
      const rawBodyFresh = '完成（evt_fresh）。';
      const evidenceFresh = await narrativeSpanEvidence(rawBodyFresh, 't_fresh:body');
      const turn = buildTurn({
        turnId: 't_fresh',
        responseId: 't_fresh:body',
        command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_fresh', expectedInstanceFingerprint: instFpFresh }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [evidenceFresh] },
        rawBody: rawBodyFresh,
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'evt_fresh', factType: 'unit_completed' }] });
      assert(r.ok, 'G1.3.1.3-fresh resolve 必须成功');
      assert(JSON.stringify(r.receipt.completedUnitIds) === JSON.stringify(['evt_fresh']), 'G1.3.1.3-completedUnitIds 只报告本回合 fresh（不重复报告历史 old_done）');
      recordPositive('G1.3.1.3-历史old_done+本回合fresh', 'completedUnitIds=[evt_fresh] only');
    }
    // D1：fulfilled world plan -> scheduled -> CONFLICT（显式迁移表）。
    {
      const state = makeEmptyState({
        worldPlanPool: [{ planItemId: 'wp_fulfilled', eventDefinitionId: 'wd', status: 'fulfilled', dependencyIds: [], consequenceDefinitionIds: [], evidenceRefs: [{ kind: 'system_command', commandId: 's', commandFingerprint: 'f' }] }],
      });
      const r = planning.upsertWorldPlanItem(state, { planItemId: 'wp_fulfilled', eventDefinitionId: 'wd', status: 'scheduled' });
      assert(!r.ok && r.code === 'CONFLICT', 'G1.3.1.3-fulfilled world plan -> scheduled 必须 CONFLICT，实际 ' + r.code);
      assert(state.worldPlanPool[0].status === 'fulfilled', 'G1.3.1.3-拒绝后 world plan 保持 fulfilled');
      recordRejected('G1.3.1.3-fulfilled world plan->scheduled', 'CONFLICT（终态不复活）', 'CONFLICT');
    }
    // D1 正向：scheduled -> active 允许。
    {
      const state = makeEmptyState({
        worldPlanPool: [{ planItemId: 'wp_act', eventDefinitionId: 'wd', status: 'scheduled', dependencyIds: [], consequenceDefinitionIds: [], evidenceRefs: [] }],
      });
      const r = planning.upsertWorldPlanItem(state, { planItemId: 'wp_act', eventDefinitionId: 'wd', status: 'active' });
      assert(r.ok && r.state.worldPlanPool[0].status === 'active', 'G1.3.1.3-scheduled->active 必须允许');
      recordPositive('G1.3.1.3-world plan scheduled->active', 'allowed');
    }
    // D2：player plan completed -> available -> CONFLICT。
    {
      const state = makeEmptyState({
        playerPlanPool: [{ planItemId: 'pp_done', unitId: 'u', status: 'completed', dependencyFactIds: [], acceptanceModes: [], evidenceRefs: [{ kind: 'system_command', commandId: 's', commandFingerprint: 'f' }] }],
      });
      const r = planning.upsertPlayerPlanItem(state, { planItemId: 'pp_done', unitId: 'u', status: 'available' });
      assert(!r.ok && r.code === 'CONFLICT', 'G1.3.1.3-completed player plan -> available 必须 CONFLICT，实际 ' + r.code);
      recordRejected('G1.3.1.3-completed player plan->available', 'CONFLICT（终态不复活）', 'CONFLICT');
    }
    // D2：convergence accepted -> available -> CONFLICT。
    {
      const state = makeEmptyState({
        convergenceQueue: [{ convergenceId: 'cv_done', sourceFactIds: ['sha256:fact_a'], status: 'accepted', eligiblePlanItemIds: [], playerDecisionRequired: true, evidenceRefs: [{ kind: 'system_command', commandId: 's', commandFingerprint: 'f' }] }],
      });
      const r = convergence.updateConvergenceItem(state, { convergenceId: 'cv_done', status: 'available' });
      assert(!r.ok && r.code === 'CONFLICT', 'G1.3.1.3-accepted convergence -> available 必须 CONFLICT，实际 ' + r.code);
      recordRejected('G1.3.1.3-accepted convergence->available', 'CONFLICT（终态不复活）', 'CONFLICT');
    }
    // E1：outbox substring trap -> false（删除 substring/includes 兜底）；结构化 committed_fact 引用精确命中 -> true。
    {
      const state = makeEmptyState();
      // 陷阱：sourceRefFingerprint 含目标 factId 子串但不可解析为结构化 ref -> false。
      const trapItem = await outbox.buildOutboxItem(state, {
        kind: 'news', aggregateKey: 'k', operation: 'create', payload: { sourceFactIds: ['sha256:fact_other'] }, sourceRefFingerprint: 'evil:sha256:fact_target:', sourceRevision: 1, consumerIds: ['news'], allocator,
      });
      assert(trapItem.ok, 'G1.3.1.3-outbox 陷阱项构造必须成功');
      assert(outbox.outboxHasFact(trapItem.outbox, 'sha256:fact_target') === false, 'G1.3.1.3-outbox substring trap 必须 false（子串不得命中）');
      assert(outbox.outboxHasFact(trapItem.outbox, 'sha256:fact_other') === false, 'G1.3.1.3-无解析结构必须 false（不能靠 payload 猜测）');
      // 结构化：sourceRef 提供 canonical NewsSourceRef（committed_fact）-> 精确命中。
      const structuredItem = await outbox.buildOutboxItem(state, {
        kind: 'news', aggregateKey: 'k', operation: 'create', payload: { sourceFactIds: ['sha256:fact_other'] }, sourceRefFingerprint: 'ignored', sourceRef: { kind: 'committed_fact', factId: 'sha256:fact_other', sourceRevision: 1 }, sourceRevision: 1, consumerIds: ['news'], allocator,
      });
      assert(structuredItem.ok, 'G1.3.1.3-outbox 结构化项构造必须成功');
      assert(outbox.outboxHasFact(structuredItem.outbox, 'sha256:fact_other') === true, 'G1.3.1.3-结构化 committed_fact 精确命中必须 true');
      assert(outbox.outboxHasFact(structuredItem.outbox, 'sha256:fact_target') === false, 'G1.3.1.3-不同 factId 必须 false');
      recordPositive('G1.3.1.3-outbox substring trap', 'substring=false / 无结构=false / 结构化精确=true');
    }
    // E2：mergeOutbox 同源同 payload 幂等；同源不同 payload 稳定 CONFLICT（不 throw）。
    {
      const state = makeEmptyState();
      const item = await outbox.buildOutboxItem(state, {
        kind: 'news', aggregateKey: 'k', operation: 'create', payload: { sourceFactIds: ['sha256:fact_same'] }, sourceRefFingerprint: 'sha256:src_same', sourceRevision: 1, consumerIds: ['news'], allocator,
      });
      const merged = outbox.mergeOutbox([], item.outbox);
      assert(merged.ok && merged.outbox.length === 1, 'G1.3.1.3-首次合并成功');
      const remerged = outbox.mergeOutbox(merged.outbox, item.outbox);
      assert(remerged.ok && remerged.outbox.length === 1, 'G1.3.1.3-同源同 payload 幂等不追加');
      // 同源不同 payload：构造一个 sourceRefFingerprint 相同但 payload 不同的 item。
      const item2 = await outbox.buildOutboxItem(state, {
        kind: 'news', aggregateKey: 'k', operation: 'create', payload: { sourceFactIds: ['sha256:fact_diff'] }, sourceRefFingerprint: 'sha256:src_same', sourceRevision: 1, consumerIds: ['news'], allocator,
      });
      let conflictResult = null;
      let threw = '';
      try { conflictResult = outbox.mergeOutbox(merged.outbox, item2.outbox); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.3-同源不同 payload 必须稳定 CONFLICT 不 throw，实际 ' + threw);
      assert(conflictResult && !conflictResult.ok && conflictResult.code === 'CONFLICT', 'G1.3.1.3-同源不同 payload 必须返回稳定 CONFLICT');
      recordRejected('G1.3.1.3-mergeOutbox 同源不同payload', 'CONFLICT（不 throw、不静默追加）', 'CONFLICT');
    }
    // E3：resultRef.stateFingerprint == 最终规定 projection 重算（上一成功事务直接核对）。
    {
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_fp', status: 'active' })] });
      const instFp = await cmdValidator.instanceFingerprintOf(state, 'evt_fp');
      const rawBody = '完成（evt_fp）。';
      const evidence = await narrativeSpanEvidence(rawBody, 't_fp:body');
      const turn = buildTurn({ turnId: 't_fp', responseId: 't_fp:body', command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_fp', expectedInstanceFingerprint: instFp }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [evidence] }, rawBody });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'evt_fp', factType: 'unit_completed' }] });
      assert(r.ok, 'G1.3.1.3-指纹核对事务必须成功');
      const stored = r.state.commandIdempotencyIndex[turn.idempotencyKey].resultRef.stateFingerprint;
      const recomputed = await txn.stateFingerprintProjectionOf(r.state, turn.idempotencyKey);
      assert(stored === recomputed, 'G1.3.1.3-resultRef.stateFingerprint 必须与最终规定 projection 重算一致，实际 ' + stored.slice(0, 16) + ' != ' + recomputed.slice(0, 16));
      recordPositive('G1.3.1.3-resultRef.stateFingerprint重算一致', stored.slice(0, 16) + ' == ' + recomputed.slice(0, 16));
    }
    // D4：self-loop due -> cycles 包含 self / 不进 due / blocked。
    {
      const state = makeEmptyState({
        worldEvents: [makeEventInstance({ eventInstanceId: 'evt_self', eventDefinitionId: 's', status: 'scheduled', dependencyIds: ['evt_self'], dueAt: { dayOrdinal: 1, minuteOfDay: 0 } })],
      });
      const r = scan.scanDueEvents(state, { dayOrdinal: 1, minuteOfDay: 5 });
      assert(r.cycles.includes('evt_self'), 'G1.3.1.3-self-loop 必须进 cycles');
      assert(!r.dueInstanceIds.includes('evt_self'), 'G1.3.1.3-self-loop 不得进入 due IDs');
      assert(r.state.worldEvents[0].status === 'blocked', 'G1.3.1.3-self-loop 必须标 blocked');
      recordRejected('G1.3.1.3-self-loop due', 'cycles=[self] + 不进 due + blocked', 'blocked');
    }
  }

  // ── §9 G1.3.1.4 组合探针（受版本控制）──
  {
    const allocator = await makeAllocator();
    // A1：七种无 owner 记录型 evidence × create/append/grant 三个写入口 = 全部拒绝（MISSING_EVIDENCE、零写入、旧 state 字节不变）。
    {
      const NO_OWNER_KINDS = ['schedule_record', 'notice_record', 'broadcast_record', 'article_version', 'migration_record', 'projection_record', 'narrative_publication'];
      const { store, catalogFingerprint, eventDefinitions } = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_noo' })]);
      const definitionFingerprint = eventDefinitions[0].definitionFingerprint;
      for (const kind of NO_OWNER_KINDS) {
        const noOwnerRef = (() => {
          if (kind === 'schedule_record') return { kind, scheduleId: 'fake', scheduleRevision: 1 };
          if (kind === 'notice_record') return { kind, noticeId: 'fake', noticeRevision: 1 };
          if (kind === 'broadcast_record') return { kind, broadcastId: 'fake', sourceRevision: 1, recipientSnapshotFingerprint: 'sha256:r' };
          if (kind === 'article_version') return { kind, articleId: 'fake', articleVersion: 1, claimFingerprint: 'sha256:c' };
          if (kind === 'migration_record') return { kind, migrationId: 'fake', sourcePath: '/tmp/mig', sourceFingerprint: 'sha256:m' };
          if (kind === 'projection_record') return { kind, projectionKind: 'news', projectionId: 'fake', projectionRevision: 1 };
          return { kind, publicationId: 'fake', bodyFingerprint: 'sha256:p', commitReceiptId: 'receipt_fake' };
        })();
        // create_event_instance
        {
          const state = makeEmptyState({ assetCatalogFingerprint: catalogFingerprint });
          const before = JSON.stringify(state);
          const turn = buildTurn({
            turnId: 'noo_create_' + kind,
            command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_noo', definitionFingerprint }, evidenceRefs: [noOwnerRef] } },
            auxiliary: {},
          });
          const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint, store, eventDefinitions } }, factsOfInterest: [] });
          assert(!r.ok && r.receipt.errorCodes.includes('MISSING_EVIDENCE'), 'A-无owner ' + kind + ' create 必须 MISSING_EVIDENCE，实际 ' + r.receipt.errorCodes.join(','));
          assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'A-无owner ' + kind + ' create 旧 state 字节与 revision 不变');
          recordRejected('A-无owner记录型evidence·' + kind + '·create', 'MISSING_EVIDENCE + 零写入', 'MISSING_EVIDENCE');
        }
        // append_fact
        {
          const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_fact_noo', status: 'active' })] });
          const instFpNoo = await cmdValidator.instanceFingerprintOf(state, 'evt_fact_noo');
          const before = JSON.stringify(state);
          const turn = buildTurn({
            turnId: 'noo_append_' + kind,
            command: { kind: 'append_fact', proposal: { eventTarget: { eventInstanceId: 'evt_fact_noo', expectedInstanceFingerprint: instFpNoo }, factType: 'x', payload: {}, publicScope: { kind: 'private' }, evidenceRefs: [noOwnerRef], evidenceLevel: 'confirmed', playerParticipated: true } },
            auxiliary: {},
          });
          const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
          assert(!r.ok && r.receipt.errorCodes.includes('MISSING_EVIDENCE'), 'A-无owner ' + kind + ' append 必须 MISSING_EVIDENCE，实际 ' + r.receipt.errorCodes.join(','));
          assert(r.state.factLedger.length === 0 && JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'A-无owner ' + kind + ' append ledger 与旧 state 字节不变');
          recordRejected('A-无owner记录型evidence·' + kind + '·append', 'MISSING_EVIDENCE + ledger 不变', 'MISSING_EVIDENCE');
        }
        // grant_knowledge
        {
          const state = makeEmptyState();
          const before = JSON.stringify(state);
          const turn = buildTurn({
            turnId: 'noo_grant_' + kind,
            command: { kind: 'grant_knowledge', proposal: { subjectType: 'npc', subjectId: 'npc_noo', subjectRef: { kind: 'committed_fact', factId: 'sha256:fact_noo', sourceRevision: 0 }, evidenceRefs: [noOwnerRef] } },
            auxiliary: {},
          });
          const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
          assert(!r.ok && r.receipt.errorCodes.includes('MISSING_EVIDENCE'), 'A-无owner ' + kind + ' grant 必须 MISSING_EVIDENCE，实际 ' + r.receipt.errorCodes.join(','));
          assert(r.state.knowledgeGrants.length === 0 && JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'A-无owner ' + kind + ' grant knowledge 零写入 + 旧 state 字节不变');
          recordRejected('A-无owner记录型evidence·' + kind + '·grant', 'MISSING_EVIDENCE + knowledge 不变', 'MISSING_EVIDENCE');
        }
      }
    }
    // P1-2：publish_public_schedule / issue_official_notice 用无 owner 记录型 evidence 作为 source
    //        -> 稳定 MISSING_EVIDENCE（不是 INVALID_PROTECTED_FIELD 误伤），零写入、旧 state 字节不变。
    {
      const state = makeEmptyState();
      const before = JSON.stringify(state);
      const schedTurn = buildTurn({
        turnId: 't_sched_noowner',
        command: { kind: 'publish_public_schedule', proposal: { sourceDefinitionId: 'evt_s', plannedAt: { dayOrdinal: 2, minuteOfDay: 0 }, publicScope: { kind: 'private' }, source: { kind: 'schedule_record', scheduleId: 'fake', scheduleRevision: 1 } } },
        auxiliary: {},
      });
      const rs = await reducer.runRuntimeTurn(schedTurn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!rs.ok && rs.receipt.errorCodes.includes('MISSING_EVIDENCE'), 'P1-2-无owner schedule_record 作为 source 必须 MISSING_EVIDENCE，实际 ' + rs.receipt.errorCodes.join(','));
      assert(!rs.receipt.errorCodes.includes('INVALID_PROTECTED_FIELD'), 'P1-2-schedule_record 不得被 protected 扫描误伤为 INVALID_PROTECTED_FIELD');
      assert(rs.state.publicSchedules.length === 0 && JSON.stringify(rs.state) === before && rs.state.runtimeRevision === 0, 'P1-2-schedule 拒绝后零写入 + 旧 state 字节不变');
      recordRejected('P1-2-无owner schedule_record 作 source', 'MISSING_EVIDENCE + 零写入（非 protected 误伤）', 'MISSING_EVIDENCE');
      const noticeTurn = buildTurn({
        turnId: 't_notice_noowner',
        command: { kind: 'issue_official_notice', proposal: { issuerId: 'station', claimFingerprint: 'sha256:claim', publicScope: { kind: 'private' }, source: { kind: 'notice_record', noticeId: 'fake', noticeRevision: 1 } } },
        auxiliary: {},
      });
      const rn = await reducer.runRuntimeTurn(noticeTurn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(!rn.ok && rn.receipt.errorCodes.includes('MISSING_EVIDENCE'), 'P1-2-无owner notice_record 作为 source 必须 MISSING_EVIDENCE，实际 ' + rn.receipt.errorCodes.join(','));
      assert(!rn.receipt.errorCodes.includes('INVALID_PROTECTED_FIELD'), 'P1-2-notice_record 不得被 protected 扫描误伤为 INVALID_PROTECTED_FIELD');
      assert(rn.state.officialNotices.length === 0 && JSON.stringify(rn.state) === before && rn.state.runtimeRevision === 0, 'P1-2-notice 拒绝后零写入 + 旧 state 字节不变');
      recordRejected('P1-2-无owner notice_record 作 source', 'MISSING_EVIDENCE + 零写入（非 protected 误伤）', 'MISSING_EVIDENCE');
    }
    // A2：合法 system_command/gameplay_receipt/narrative_span 路径继续通过（断言现有正向探针仍成功）。
    {
      // narrative_span resolve（真实绑定）仍成功。
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_aok' })] });
      const instFpAok = await cmdValidator.instanceFingerprintOf(state, 'evt_aok');
      const rawBodyAok = '完成（evt_aok）。';
      const evidenceAok = await narrativeSpanEvidence(rawBodyAok, 't_aok:body');
      const turn = buildTurn({ turnId: 't_aok', responseId: 't_aok:body', command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_aok', expectedInstanceFingerprint: instFpAok }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [evidenceAok] }, rawBody: rawBodyAok });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'evt_aok', factType: 'unit_completed' }] });
      assert(r.ok, 'A-合法 narrative_span 路径必须继续通过');
      recordPositive('A-合法narrative_span继续通过', 'resolved');
      // system_command（path_command enter + scope.unit 绑定）仍成功。
      const state2 = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'unit_ok' })] });
      const turn2 = buildTurn({ turnId: 't_ok_sys', command: { kind: 'path_command', action: 'enter', targetId: 'unit_ok' }, rawBody: '完成（unit_ok）。', auxiliary: { validatedSystemCommands: [{ commandId: 'sys_ok', commandFingerprint: 'sha256:sys_ok', scope: { unit: 'unit_ok' } }] }, claimedCompletedUnitIds: ['unit_ok'] });
      const r2 = await reducer.runRuntimeTurn(turn2, { allocator, ctx: { state: state2 }, factsOfInterest: [{ eventInstanceId: 'unit_ok', factType: 'unit_completed' }] });
      assert(r2.ok, 'A-合法 system_command 路径必须继续通过');
      recordPositive('A-合法system_command继续通过', 'unit resolved');
      // gameplay_receipt（绑定单元）仍成功。
      const state3 = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'unit_okr' })] });
      const turn3 = buildTurn({ turnId: 't_ok_receipt', command: { kind: 'path_command', action: 'enter', targetId: 'unit_okr' }, rawBody: '完成（unit_okr）。', auxiliary: { gameplayReceipts: [{ receiptId: 'g_ok', receiptType: 'x', eventInstanceId: 'unit_okr' }] }, claimedCompletedUnitIds: ['unit_okr'] });
      const r3 = await reducer.runRuntimeTurn(turn3, { allocator, ctx: { state: state3 }, factsOfInterest: [{ eventInstanceId: 'unit_okr', factType: 'unit_completed' }] });
      assert(r3.ok, 'A-合法 gameplay_receipt 路径必须继续通过');
      recordPositive('A-合法gameplay_receipt继续通过', 'unit resolved');
    }
    // B1：伪造 catalog——改 definition 内容但把 catalogFingerprint 字符串填成 state 值 -> 拒绝（内容与 store 不一致）。
    {
      const { store, catalogFingerprint } = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_gen' })]);
      const forgedDef = makeWorldEventDefinition({ eventDefinitionId: 'evt_forged', title: 'forged title' });
      const forgedDefFp = await cmdValidator.definitionFingerprintOf({ ...forgedDef, definitionFingerprint: '' });
      const state = makeEmptyState({ assetCatalogFingerprint: catalogFingerprint });
      const before = JSON.stringify(state);
      const ctx = { state, catalog: { catalogFingerprint, store, eventDefinitions: [{ ...forgedDef, definitionFingerprint: forgedDefFp }] } };
      const turn = buildTurn({
        turnId: 't_forged_cat',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_forged', definitionFingerprint: forgedDefFp }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_fc', commandFingerprint: 'sha256:sys_fc' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_fc', commandFingerprint: 'sha256:sys_fc', scope: { unit: '' } }] },
      });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'B-伪造 catalog 内容必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.some((c) => c === 'STALE_BRANCH' || c === 'CONFLICT'), 'B-改 definition 但伪造 catalogFingerprint 必须 STALE_BRANCH/CONFLICT，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'B-伪造 catalog 拒绝后旧 state 字节与 revision 不变');
      recordRejected('B-改definition伪造catalogFingerprint', 'STALE_BRANCH/CONFLICT + 字节不变', 'STALE_BRANCH');
    }
    // B2：伪造 catalog——增加 definition 后重算局部 fingerprint（store 无该 fingerprint）-> 拒绝。
    {
      const { store, catalogFingerprint } = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_gen2' })]);
      const extraDef = makeWorldEventDefinition({ eventDefinitionId: 'evt_extra', title: 'extra' });
      const extraDefFp = await cmdValidator.definitionFingerprintOf({ ...extraDef, definitionFingerprint: '' });
      const state = makeEmptyState({ assetCatalogFingerprint: catalogFingerprint });
      const before = JSON.stringify(state);
      // 内容与 store 不同（多了一个 definition）-> 即使 fingerprint 字符串一致也拒绝。
      const ctx = { state, catalog: { catalogFingerprint, store, eventDefinitions: [makeWorldEventDefinition({ eventDefinitionId: 'evt_gen2' }), { ...extraDef, definitionFingerprint: extraDefFp }] } };
      const turn = buildTurn({
        turnId: 't_extra_cat',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_extra', definitionFingerprint: extraDefFp }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_ec', commandFingerprint: 'sha256:sys_ec' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_ec', commandFingerprint: 'sha256:sys_ec', scope: { unit: '' } }] },
      });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'B-增加 definition 必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.some((c) => c === 'STALE_BRANCH' || c === 'CONFLICT'), 'B-增加 definition 后重算必须 STALE_BRANCH/CONFLICT，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'B-增加 definition 拒绝后旧 state 字节与 revision 不变');
      recordRejected('B-增加definition重算局部fingerprint', 'STALE_BRANCH/CONFLICT + 字节不变', 'STALE_BRANCH');
    }
    // B3：无可信 store 的临时 catalog -> create 拒绝（不接受临时 catalog）。
    {
      const { catalogFingerprint, eventDefinitions } = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_gen3' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: catalogFingerprint });
      const before = JSON.stringify(state);
      const ctx = { state, catalog: { catalogFingerprint, eventDefinitions } }; // 无 store
      const turn = buildTurn({
        turnId: 't_tmp_cat',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_gen3', definitionFingerprint: eventDefinitions[0].definitionFingerprint }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_tc', commandFingerprint: 'sha256:sys_tc' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_tc', commandFingerprint: 'sha256:sys_tc', scope: { unit: '' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'B-无可信 store 的临时 catalog 必须 CONFLICT，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'B-临时 catalog 拒绝后旧 state 字节与 revision 不变');
      recordRejected('B-无可信store临时catalog', 'CONFLICT（本阶段不接受临时 catalog）', 'CONFLICT');
    }
    // C1：目标实例 source 循环 / getter / custom prototype -> 稳定 INVALID_COMMAND，不 throw。
    {
      const cyc = { kind: 'narrative_span' };
      cyc.self = cyc;
      const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_cyc_inst', source: cyc })] });
      // 旧 state 字节快照：把循环 source 换成稳定标记（JSON.stringify 对循环本身会 throw，这正是被拒容器）。
      const before = JSON.stringify({ ...state, worldEvents: state.worldEvents.map((w) => ({ ...w, source: '__CYCLE__' })) });
      const turn = buildTurn({
        turnId: 't_cyc_inst',
        command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'evt_cyc_inst', expectedInstanceFingerprint: 'sha256:x' }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [] },
      });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'C-实例 source 循环必须稳定失败不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.includes('INVALID_COMMAND'), 'C-实例 source 循环必须 INVALID_COMMAND，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify({ ...r.state, worldEvents: r.state.worldEvents.map((w) => ({ ...w, source: '__CYCLE__' })) }) === before && r.state.runtimeRevision === 0, 'C-实例 source 循环拒绝后旧 state 字节（循环源标记）与 revision 不变');
      recordRejected('C-实例source循环', 'INVALID_COMMAND + 字节不变（不 throw）', 'INVALID_COMMAND');
    }
    // C2：catalog definition getter / custom prototype -> 稳定失败，不 throw。
    {
      const { store, catalogFingerprint } = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_gen4' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: catalogFingerprint });
      const before = JSON.stringify(state);
      const getterDef = makeWorldEventDefinition({ eventDefinitionId: 'evt_get', title: 'x' });
      Object.defineProperty(getterDef, 'leak', { get() { return 'x'; }, enumerable: true });
      const getterCalls = { n: 0 };
      Object.defineProperty(getterDef, 'leak2', { get() { getterCalls.n += 1; return 'y'; }, enumerable: true });
      const ctx = { state, catalog: { catalogFingerprint, store, eventDefinitions: [getterDef] } };
      const turn = buildTurn({
        turnId: 't_getter_def',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_get', definitionFingerprint: 'sha256:def' }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_gd', commandFingerprint: 'sha256:sys_gd' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_gd', commandFingerprint: 'sha256:sys_gd', scope: { unit: '' } }] },
      });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'C-catalog definition getter 必须稳定失败不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.includes('INVALID_COMMAND'), 'C-catalog definition getter 必须 INVALID_COMMAND，实际 ' + r.receipt.errorCodes.join(','));
      assert(getterCalls.n === 0, 'C-catalog definition getter 调用次数必须为 0，实际 ' + getterCalls.n);
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'C-catalog definition getter 拒绝后旧 state 字节与 revision 不变');
      recordRejected('C-catalog definition getter', 'INVALID_COMMAND + getter 0 调用 + 字节不变', 'INVALID_COMMAND');
    }
    // C3：catalog definition custom prototype -> 稳定失败，不 throw。
    {
      const { store, catalogFingerprint } = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_gen5' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: catalogFingerprint });
      const before = JSON.stringify(state);
      class FakeDef {}
      const protoDef = new FakeDef();
      Object.assign(protoDef, makeWorldEventDefinition({ eventDefinitionId: 'evt_proto', title: 'p' }));
      const ctx = { state, catalog: { catalogFingerprint, store, eventDefinitions: [protoDef] } };
      const turn = buildTurn({
        turnId: 't_proto_def',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_proto', definitionFingerprint: 'sha256:def' }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_pd', commandFingerprint: 'sha256:sys_pd' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_pd', commandFingerprint: 'sha256:sys_pd', scope: { unit: '' } }] },
      });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'C-catalog definition custom prototype 必须稳定失败不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.includes('INVALID_COMMAND'), 'C-catalog definition custom prototype 必须 INVALID_COMMAND，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'C-catalog definition custom prototype 拒绝后旧 state 字节与 revision 不变');
      recordRejected('C-catalog definition custom prototype', 'INVALID_COMMAND + 字节不变（不 throw）', 'INVALID_COMMAND');
    }
    // D1：同 unit 两次不同 idempotencyKey -> playerPlanPool 长度仍 1、同 planItemId。
    {
      const state = makeEmptyState();
      const turn1 = buildTurn({ turnId: 't_plan_1', idempotencyKey: 'key_plan_1', command: { kind: 'upsert_plan_item', proposal: { unitId: 'unit_dup', dependencyFactIds: [], acceptanceModes: ['正文承接'], evidenceRefs: [{ kind: 'system_command', commandId: 'sys_d1', commandFingerprint: 'sha256:sys_d1' }] } }, auxiliary: { validatedSystemCommands: [{ commandId: 'sys_d1', commandFingerprint: 'sha256:sys_d1', scope: { unit: 'unit_dup' } }] } });
      const r1 = await reducer.runRuntimeTurn(turn1, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r1.ok, 'D-同 unit 首次 upsert 必须成功');
      const id1 = r1.state.playerPlanPool[0].planItemId;
      const turn2 = buildTurn({ turnId: 't_plan_2', expectedRuntimeRevision: r1.state.runtimeRevision, idempotencyKey: 'key_plan_2', command: { kind: 'upsert_plan_item', proposal: { unitId: 'unit_dup', dependencyFactIds: [], acceptanceModes: ['正文承接'], evidenceRefs: [{ kind: 'system_command', commandId: 'sys_d1', commandFingerprint: 'sha256:sys_d1' }] } }, auxiliary: { validatedSystemCommands: [{ commandId: 'sys_d1', commandFingerprint: 'sha256:sys_d1', scope: { unit: 'unit_dup' } }] } });
      const r2 = await reducer.runRuntimeTurn(turn2, { allocator, ctx: { state: r1.state }, factsOfInterest: [] });
      assert(r2.ok, 'D-同 unit 二次 upsert 必须成功');
      assert(r2.state.playerPlanPool.length === 1, 'D-同 unit 重复 upsert pool 长度仍 1，实际 ' + r2.state.playerPlanPool.length);
      assert(r2.state.playerPlanPool[0].planItemId === id1, 'D-同 unit 重复 upsert 复用同一 planItemId');
      recordPositive('D-同unit两次不同key不追加', 'pool=1, planItemId=' + id1.slice(0, 16));
    }
    // D2：同 eventDefinition 两次不同 idempotencyKey -> worldPlanPool 长度仍 1。
    {
      const state = makeEmptyState();
      const turn1 = buildTurn({ turnId: 't_wplan_1', idempotencyKey: 'key_wplan_1', command: { kind: 'upsert_plan_item', proposal: { eventDefinitionId: 'evt_wdup', dependencyFactIds: [], evidenceRefs: [{ kind: 'system_command', commandId: 'sys_w1', commandFingerprint: 'sha256:sys_w1' }] } }, auxiliary: { validatedSystemCommands: [{ commandId: 'sys_w1', commandFingerprint: 'sha256:sys_w1', scope: { unit: '' } }] } });
      const r1 = await reducer.runRuntimeTurn(turn1, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r1.ok, 'D-同 eventDefinition 首次 upsert 必须成功');
      const wid1 = r1.state.worldPlanPool[0].planItemId;
      const turn2 = buildTurn({ turnId: 't_wplan_2', expectedRuntimeRevision: r1.state.runtimeRevision, idempotencyKey: 'key_wplan_2', command: { kind: 'upsert_plan_item', proposal: { eventDefinitionId: 'evt_wdup', dependencyFactIds: [], evidenceRefs: [{ kind: 'system_command', commandId: 'sys_w1', commandFingerprint: 'sha256:sys_w1' }] } }, auxiliary: { validatedSystemCommands: [{ commandId: 'sys_w1', commandFingerprint: 'sha256:sys_w1', scope: { unit: '' } }] } });
      const r2 = await reducer.runRuntimeTurn(turn2, { allocator, ctx: { state: r1.state }, factsOfInterest: [] });
      assert(r2.ok, 'D-同 eventDefinition 二次 upsert 必须成功');
      assert(r2.state.worldPlanPool.length === 1, 'D-同 eventDefinition 重复 upsert world pool 长度仍 1，实际 ' + r2.state.worldPlanPool.length);
      assert(r2.state.worldPlanPool[0].planItemId === wid1, 'D-同 eventDefinition 重复 upsert 复用同一 planItemId');
      recordPositive('D-同eventDefinition两次不同key不追加', 'world pool=1, planItemId=' + wid1.slice(0, 16));
    }
    // D3：终态计划项重复 upsert -> 不追加第二项、不复活（命令无 status 字段，普通 upsert 只能保持终态；
    //     显式 status 迁移的复活由 planningPool 正反矩阵在 D2 单测探针拒绝 CONFLICT）。
    {
      const state = makeEmptyState({
        playerPlanPool: [{ planItemId: 'pp_done2', unitId: 'unit_done', status: 'completed', dependencyFactIds: [], acceptanceModes: [], evidenceRefs: [{ kind: 'system_command', commandId: 's', commandFingerprint: 'f' }] }],
      });
      const before = JSON.stringify(state);
      const turn = buildTurn({ turnId: 't_plan_resurrect', command: { kind: 'upsert_plan_item', proposal: { unitId: 'unit_done', dependencyFactIds: [], acceptanceModes: [], evidenceRefs: [{ kind: 'system_command', commandId: 's', commandFingerprint: 'f' }] } }, auxiliary: { validatedSystemCommands: [{ commandId: 's', commandFingerprint: 'f', scope: { unit: 'unit_done' } }] } });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [] });
      assert(r.state.playerPlanPool.length === 1, 'D-终态计划项重复 upsert 不得追加第二项，实际 ' + r.state.playerPlanPool.length);
      assert(r.state.playerPlanPool[0].status === 'completed', 'D-终态计划项重复 upsert 不得复活，实际 ' + r.state.playerPlanPool[0].status);
      recordRejected('D-终态计划项upsert不复活', 'pool=1 + 保持 completed（不追加、不复活）', 'completed');
    }
  }

  // ── §9 G1.3.1.5 组合探针（受版本控制）──
  {
    const allocator = await makeAllocator();
    const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_t5' })]);
    const defFpT5 = trusted.eventDefinitions[0].definitionFingerprint;
    const trustedState = () => makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
    const trustedCtx = () => ({ catalog: { catalogFingerprint: trusted.catalogFingerprint, store: trusted.store, eventDefinitions: trusted.eventDefinitions } });
    const createTurn = (turnId, evidenceTag) => buildTurn({
      turnId,
      command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_t5', definitionFingerprint: defFpT5 }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_' + evidenceTag, commandFingerprint: 'sha256:sys_' + evidenceTag }] } },
      auxiliary: { validatedSystemCommands: [{ commandId: 'sys_' + evidenceTag, commandFingerprint: 'sha256:sys_' + evidenceTag, scope: { unit: '' } }] },
    });
    // 1. 正式 StoryAssetCatalogStore + 正式 snapshot -> 通过（positive，生产 runRuntimeTurn 入口）。
    {
      const state = trustedState();
      const turn = createTurn('t5_real', 'real');
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, ...trustedCtx() }, factsOfInterest: [] });
      assert(r.ok, 'G1.3.1.5-正式 store 必须成功 create: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.worldEvents.length === 1, 'G1.3.1.5-正式 store create 新增实例');
      recordPositive('G1.3.1.5-正式store成功create', 'worldEvents+1 revision 0->1');
    }
    // 2. store 缺失 -> CONFLICT，零写入（已有 B3，此处显式断言能力检查入口）。
    {
      const state = trustedState();
      const before = JSON.stringify(state);
      const turn = createTurn('t5_missing', 'missing');
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'G1.3.1.5-store 缺失必须 CONFLICT，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.5-store 缺失零写入 + 字节不变');
      recordRejected('G1.3.1.5-store缺失', 'CONFLICT + 零写入', 'CONFLICT');
    }
    // 3. duck-typed {has,get} store -> 拒绝，零写入。
    {
      const duck = { has: (fp) => fp === trusted.catalogFingerprint, get: (fp) => trusted.store.get(fp) };
      const state = trustedState();
      const before = JSON.stringify(state);
      const turn = createTurn('t5_duck', 'duck');
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: duck, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'G1.3.1.5-duck store 必须拒绝（CONFLICT），实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.worldEvents.length === 0 && JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.5-duck store 零写入 + 字节不变');
      recordRejected('G1.3.1.5-duck-typed {has,get}', 'CONFLICT + 零写入', 'CONFLICT');
    }
    // 4. Object.create(null) duck store -> 拒绝，零写入。
    {
      const nullDuck = Object.create(null);
      nullDuck.has = (fp) => fp === trusted.catalogFingerprint;
      nullDuck.get = (fp) => trusted.store.get(fp);
      const state = trustedState();
      const before = JSON.stringify(state);
      const turn = createTurn('t5_null_duck', 'null_duck');
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: nullDuck, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.some((c) => c === 'CONFLICT' || c === 'INVALID_COMMAND'), 'G1.3.1.5-null-proto duck store 必须拒绝，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.5-null-proto duck 零写入 + 字节不变');
      recordRejected('G1.3.1.5-Object.create(null) duck store', r.receipt.errorCodes.join(',') + ' + 零写入', '零写入');
    }
    // 5. own 覆盖（realStore.has = () => true）-> G1.3.1.7 原型冻结后赋值本身抛 TypeError（篡改被拒绝），
    //    读取路径不变（正式 store 仍成功 create）。使用独立 store 实例，不污染共享实例。
    {
      const fresh = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_t5' })]);
      const replaced = fresh.store;
      let mutationError = '';
      try { replaced.has = () => true; } catch (error) { mutationError = 'THREW: ' + error.message; }
      assert(mutationError !== '', 'G1.3.1.7-own 覆盖必须被拒绝（冻结原型使赋值抛 TypeError），实际未抛');
      assert(shared.isStoryAssetCatalogStore(replaced) === true, 'G1.3.1.7-篡改被拒后 store 仍是可信直接实例');
      // 读取路径未变：正式 store 仍成功 create（写入的是合法 snapshot，不是伪造数据）。
      const state = trustedState();
      const turn = createTurn('t5_replaced', 'replaced');
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: replaced, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] });
      assert(r.ok, 'G1.3.1.7-own 覆盖被拒后读取路径不变（create 仍成功）: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.worldEvents.length === 1, 'G1.3.1.7-own 覆盖被拒后 create 写入合法事件');
      recordRejected('G1.3.1.7-own覆盖被冻结原型拒绝', '赋值抛 TypeError（篡改被拒）+ 读取路径不变', '被拒');
    }
    // 6. has/get 属性为 getter（getter 抛异常）-> own 覆盖可被定义，但 verifier 必须拒绝（descriptor 检查，getter 0 次调用），
    //    入口稳定拒绝、零写入。
    {
      const fresh = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_t5' })]);
      const state = trustedState();
      const before = JSON.stringify(state);
      const getterCalls = { n: 0 };
      const getterStore = fresh.store;
      let defineError = '';
      try {
        Object.defineProperty(getterStore, 'has', { get() { getterCalls.n += 1; throw new Error('getter has'); }, enumerable: true, configurable: true });
      } catch (error) { defineError = 'THREW: ' + error.message; }
      assert(defineError === '', 'G1.3.1.7-own getter 可定义（原型冻结不阻断实例自有属性），但必须被 verifier 拒绝，实际定义抛错 ' + defineError);
      assert(shared.isStoryAssetCatalogStore(getterStore) === false, 'G1.3.1.7-own getter 覆盖后 verifier 必须拒绝');
      assert(getterCalls.n === 0, 'G1.3.1.7-getter 调用次数必须为 0，实际 ' + getterCalls.n);
      const turn = createTurn('t5_getter', 'getter');
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: getterStore, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.7-own getter store 必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.some((c) => c === 'INVALID_COMMAND' || c === 'CONFLICT'), 'G1.3.1.7-own getter store 必须稳定拒绝，实际 ' + r.receipt.errorCodes.join(','));
      assert(getterCalls.n === 0, 'G1.3.1.7-getter 调用次数必须保持 0，实际 ' + getterCalls.n);
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.7-own getter store 零写入 + 字节不变');
      recordRejected('G1.3.1.7-own getter 覆盖', r.receipt.errorCodes.join(',') + ' + getter 0 调用 + 零写入', '零写入');
    }
    // 7. Proxy 转发正式 store -> 拒绝（G1.3.1.6：Proxy 对象不在 WeakSet brand 中，透明转发不能拥有 owner capability）。
    {
      const forwarding = new Proxy(trusted.store, {});
      const state = trustedState();
      const before = JSON.stringify(state);
      const turn = createTurn('t5_fwd_proxy', 'fwd');
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: forwarding, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.6-透明 Proxy 必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'G1.3.1.6-透明 Proxy 必须 CONFLICT（brand 身份拒绝），实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.6-透明 Proxy 零写入 + 字节不变');
      recordRejected('G1.3.1.6-透明Proxy转发正式store', 'CONFLICT（Proxy 不在 brand 中）+ 零写入', 'CONFLICT');
    }
    // 8. Proxy get trap 抛异常 / 返回伪造方法 -> 稳定拒绝，不 throw。
    {
      const throwing = new Proxy(trusted.store, { get() { throw new Error('proxy get trap'); } });
      const state = trustedState();
      const before = JSON.stringify(state);
      const turn = createTurn('t5_proxy_throw', 'proxy_throw');
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: throwing, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.5-Proxy get trap 抛异常必须稳定失败不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.some((c) => c === 'INVALID_COMMAND' || c === 'CONFLICT'), 'G1.3.1.5-Proxy get trap 抛异常必须 INVALID_COMMAND/CONFLICT，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.5-Proxy get trap 抛异常零写入 + 字节不变');
      recordRejected('G1.3.1.5-Proxy get trap 抛异常', r.receipt.errorCodes.join(',') + ' + 字节不变（不 throw）', '字节不变');
    }
    // 9. Proxy 返回伪造 get 方法 -> 稳定拒绝（方法绑定检查），不 throw。
    {
      const liar = new Proxy(trusted.store, { get(t, p, r) { if (p === 'get') return () => ({ eventDefinitions: [] }); return Reflect.get(t, p, r); } });
      const state = trustedState();
      const before = JSON.stringify(state);
      const turn = createTurn('t5_liar', 'liar');
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: liar, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.6-伪造 get 方法的 Proxy 必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.some((c) => c === 'INVALID_COMMAND' || c === 'CONFLICT'), 'G1.3.1.6-伪造 get 方法必须稳定拒绝，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.6-伪造 get 方法零写入 + 字节不变');
      recordRejected('G1.3.1.6-Proxy返回伪造get方法', r.receipt.errorCodes.join(',') + ' + 字节不变', '字节不变');
    }
    // 10. catalogFingerprint 错误（store 有 snapshot 但 fingerprint 不匹配）-> STALE_BRANCH，零写入。
    {
      const state = trustedState();
      const before = JSON.stringify(state);
      const turn = createTurn('t5_wrong_fp', 'wrong_fp');
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: 'sha256:wrong', store: trusted.store, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('STALE_BRANCH'), 'G1.3.1.5-错误 fingerprint 必须 STALE_BRANCH，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.5-错误 fingerprint 零写入 + 字节不变');
      recordRejected('G1.3.1.5-错误catalogFingerprint', 'STALE_BRANCH + 零写入', 'STALE_BRANCH');
    }
    // 11. 快照缺失（store 无该 fingerprint）-> CONFLICT，零写入。
    {
      const other = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_other5' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: other.catalogFingerprint });
      const before = JSON.stringify(state);
      const turn = createTurn('t5_no_snapshot', 'no_snapshot');
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: other.catalogFingerprint, store: other.store, eventDefinitions: other.eventDefinitions } }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'G1.3.1.5-快照缺失必须 CONFLICT，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.5-快照缺失零写入 + 字节不变');
      recordRejected('G1.3.1.5-store快照缺失', 'CONFLICT + 零写入', 'CONFLICT');
    }
  }

  // ── §9 G1.3.1.6 组合探针（受版本控制，全部走生产 runRuntimeTurn/StoryAssetCatalogStore/shared 入口）──
  {
    const allocator = await makeAllocator();
    // G1.3.1.6 核心：store 构造/verifier/commandValidator/runRuntimeTurn 来自同一生产模块图（共享入口），
    // 模块私有 WeakSet brand 同一份；正式 store 正向通过，跨 bundle/伪造对象/Proxy 全部拒绝。
    // 0. 共享入口内部一致性：同一 graph 中 verifier 认可 store；独立 bundle 的 verifier 不认可同一 store。
    {
      const shared = await loadSharedRuntimeEntry();
      const own = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g0' })]);
      assert(shared.isStoryAssetCatalogStore(own.store) === true, 'G1.3.1.6-同一生产模块图 verifier 必须认可正式 store');
      // 独立 bundle 的 verifier（另一个 esbuild 图，WeakSet 不同）不认可同一 store：证明 brand 未放宽。
      const otherStoreBundle = await bundleTs('services/storyRuntime/storyAssetCatalogStore.ts');
      const otherVerifier = otherStoreBundle.isStoryAssetCatalogStore;
      assert(otherVerifier(own.store) === false, 'G1.3.1.6-跨 bundle verifier 必须不认可正式 store（brand 未放宽）');
      assert(otherVerifier({ has: () => true, get: () => null }) === false, 'G1.3.1.6-跨 bundle duck 对象必须不认可');
      assert(otherVerifier(new Proxy(own.store, {})) === false, 'G1.3.1.6-跨 bundle Proxy 必须不认可');
      recordPositive('G1.3.1.6-同bundle认可/跨bundle不认可', 'brand 未放宽');
    }
    // 1. 正式 store（共享入口同一图）-> 通过（positive）。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const turn = buildTurn({
        turnId: 't6_real',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_g1', definitionFingerprint: trusted.eventDefinitions[0].definitionFingerprint }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_g1', commandFingerprint: 'sha256:sys_g1' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_g1', commandFingerprint: 'sha256:sys_g1', scope: { unit: '' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: trusted.store, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] });
      assert(r.ok, 'G1.3.1.6-正式 store（同一图）必须成功 create: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.worldEvents.length === 1, 'G1.3.1.6-正式 store 新增实例');
      recordPositive('G1.3.1.6-正式store同图成功create', 'worldEvents+1 revision 0->1');
    }
    // 2. 同名 class StoryAssetCatalogStore + 自制 snapshots Map（攻击者复现 P0-1）-> 拒绝，零写入。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const before = JSON.stringify(state);
      class StoryAssetCatalogStore {
        constructor() { this.snapshots = new Map([[trusted.catalogFingerprint, '{"fake":true}']]); }
        has(fp) { return fp === trusted.catalogFingerprint; }
        get(fp) { return { eventDefinitions: [{ eventDefinitionId: 'evt_forged', origin: 'catalog', title: 'attacker definition', definitionFingerprint: 'sha256:x' }] }; }
        put() { return { ok: false, reason: 'no' }; }
        guardOverwrite() { return { ok: false, reason: 'no' }; }
        clear() {}
      }
      const attacker = new StoryAssetCatalogStore();
      const turn = buildTurn({
        turnId: 't6_same_class',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_forged', definitionFingerprint: 'sha256:x' }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_sc', commandFingerprint: 'sha256:sys_sc' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_sc', commandFingerprint: 'sha256:sys_sc', scope: { unit: '' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: attacker, eventDefinitions: [{ eventDefinitionId: 'evt_forged', origin: 'catalog', title: 'attacker definition' }] } }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'G1.3.1.6-同名 class 必须 CONFLICT（brand 拒绝），实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.worldEvents.length === 0 && JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.6-同名 class 零写入 + 字节不变');
      recordRejected('G1.3.1.6-同名class+自制snapshots', 'CONFLICT + 零写入（brand 身份拒绝）', 'CONFLICT');
    }
    // 3. Proxy 替换 snapshots 数据路径（get snapshots -> forged Map）-> 拒绝（Proxy 不在 brand），零写入。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const before = JSON.stringify(state);
      const forgedMap = new Map([[trusted.catalogFingerprint, '{"forged":true}']]);
      const snapSub = new Proxy(trusted.store, { get(t, p, r) { if (p === 'snapshots') return forgedMap; return Reflect.get(t, p, r); } });
      const turn = buildTurn({
        turnId: 't6_snap_sub',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_g1', definitionFingerprint: trusted.eventDefinitions[0].definitionFingerprint }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_ss', commandFingerprint: 'sha256:sys_ss' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_ss', commandFingerprint: 'sha256:sys_ss', scope: { unit: '' } }] },
      });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: snapSub, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.6-snapshots 替换 Proxy 必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'G1.3.1.6-snapshots 替换 Proxy 必须 CONFLICT，实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.worldEvents.length === 0 && JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.6-snapshots 替换 Proxy 零写入 + 字节不变');
      recordRejected('G1.3.1.6-Proxy替换snapshots数据路径', 'CONFLICT + 零写入（Proxy 不在 brand）', 'CONFLICT');
    }
    // 4. Proxy 替换 has/get 方法 -> 拒绝，零写入。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const before = JSON.stringify(state);
      const forgedMethods = new Proxy(trusted.store, { get(t, p, r) { if (p === 'get') return () => ({ eventDefinitions: [{ eventDefinitionId: 'evt_forged', origin: 'catalog', title: 'proxy forged' }] }); return Reflect.get(t, p, r); } });
      const turn = buildTurn({
        turnId: 't6_forged_methods',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_forged', definitionFingerprint: 'sha256:x' }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_fm', commandFingerprint: 'sha256:sys_fm' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_fm', commandFingerprint: 'sha256:sys_fm', scope: { unit: '' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: forgedMethods, eventDefinitions: [{ eventDefinitionId: 'evt_forged', origin: 'catalog', title: 'proxy forged' }] } }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'G1.3.1.6-伪造方法 Proxy 必须 CONFLICT，实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.worldEvents.length === 0 && JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.6-伪造方法 Proxy 零写入 + 字节不变');
      recordRejected('G1.3.1.6-Proxy替换has/get方法', 'CONFLICT + 零写入', 'CONFLICT');
    }
    // 5. 伪造 constructor.name + 原型方法面（攻击者复现 P0-2 同形原型）-> 拒绝，零写入。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const before = JSON.stringify(state);
      function ForgedStore() { this.snapshots = new Map(); }
      ForgedStore.prototype.has = function (fp) { return fp === trusted.catalogFingerprint; };
      ForgedStore.prototype.get = function (fp) { return { eventDefinitions: [{ eventDefinitionId: 'evt_forged', origin: 'catalog', title: 'forged proto' }] }; };
      ForgedStore.prototype.put = function () { return { ok: false, reason: 'no' }; };
      ForgedStore.prototype.guardOverwrite = function () { return { ok: false, reason: 'no' }; };
      ForgedStore.prototype.clear = function () {};
      Object.defineProperty(ForgedStore, 'name', { value: 'StoryAssetCatalogStore' });
      Object.defineProperty(ForgedStore.prototype.constructor, 'name', { value: 'StoryAssetCatalogStore' });
      const forgedProto = new ForgedStore();
      const turn = buildTurn({
        turnId: 't6_forged_proto',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_forged', definitionFingerprint: 'sha256:x' }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_fp', commandFingerprint: 'sha256:sys_fp' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_fp', commandFingerprint: 'sha256:sys_fp', scope: { unit: '' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: forgedProto, eventDefinitions: [{ eventDefinitionId: 'evt_forged', origin: 'catalog', title: 'forged proto' }] } }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'G1.3.1.6-伪造 constructor.name+原型方法面 必须 CONFLICT，实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.worldEvents.length === 0 && JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.6-伪造原型零写入 + 字节不变');
      recordRejected('G1.3.1.6-伪造constructor.name+原型方法面', 'CONFLICT + 零写入（brand 身份拒绝）', 'CONFLICT');
    }
    // 6. 跨 bundle 正式 store（另一个 esbuild 图构造，brand 不在同一份）-> 拒绝（跨 bundle 不能绿灯）。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const otherStoreBundle = await bundleTs('services/storyRuntime/storyAssetCatalogStore.ts');
      const crossBundleStore = new otherStoreBundle.StoryAssetCatalogStore();
      const put = await crossBundleStore.put(trusted.catalog);
      assert(put.ok, 'G1.3.1.6-跨 bundle store 独立可 put');
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const before = JSON.stringify(state);
      const turn = buildTurn({
        turnId: 't6_cross_bundle',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_g1', definitionFingerprint: trusted.eventDefinitions[0].definitionFingerprint }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_cb', commandFingerprint: 'sha256:sys_cb' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_cb', commandFingerprint: 'sha256:sys_cb', scope: { unit: '' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: crossBundleStore, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] });
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'G1.3.1.6-跨 bundle store 必须 CONFLICT（brand 不同份），实际 ' + r.receipt.errorCodes.join(','));
      assert(r.state.worldEvents.length === 0 && JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.6-跨 bundle store 零写入 + 字节不变');
      recordRejected('G1.3.1.6-跨bundle正式store', 'CONFLICT + 零写入（brand 未放宽）', 'CONFLICT');
    }
    // 7. verifier 读取异常 / Proxy trap 异常 / has/get 抛异常 -> 稳定失败不 throw（覆盖 D 章节）。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const before = JSON.stringify(state);
      const throwingHas = new Proxy(trusted.store, { get(t, p, r) { if (p === 'has') return () => { throw new Error('has boom'); }; return Reflect.get(t, p, r); } });
      const turn = buildTurn({
        turnId: 't6_has_throw',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_g1', definitionFingerprint: trusted.eventDefinitions[0].definitionFingerprint }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_ht', commandFingerprint: 'sha256:sys_ht' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_ht', commandFingerprint: 'sha256:sys_ht', scope: { unit: '' } }] },
      });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: throwingHas, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.6-has 抛异常必须稳定失败不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.some((c) => c === 'INVALID_COMMAND' || c === 'CONFLICT'), 'G1.3.1.6-has 抛异常必须稳定失败，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.6-has 抛异常零写入 + 字节不变');
      recordRejected('G1.3.1.6-Proxy has 抛异常', r.receipt.errorCodes.join(',') + ' + 字节不变（不 throw）', '字节不变');
    }
  }

  // ── §9 G1.3.1.7 组合探针（受版本控制，全部走共享生产模块图 + 真实 runRuntimeTurn 入口）──
  {
    const allocator = await makeAllocator();
    // 0. 既有 store API 回归继续通过（put/get/has/clear/size + 同指纹字节保护）。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_api' })]);
      assert(trusted.store.has(trusted.catalogFingerprint) === true, 'G1.3.1.7-store.has 必须命中');
      const got = trusted.store.get(trusted.catalogFingerprint);
      assert(got !== null && typeof got === 'object', 'G1.3.1.7-store.get 必须返回 snapshot');
      assert(trusted.store.size === 1, 'G1.3.1.7-store.size 必须为 1');
      // 同 fingerprint 不同 bytes 拒绝（覆盖守卫）。
      assert(trusted.store.guardOverwrite(trusted.catalogFingerprint, '{"different":true}').ok === false, 'G1.3.1.7-同指纹不同 bytes 必须拒绝');
      // clear 后 has 返回 false。
      const cleared = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_clear' })]);
      cleared.store.clear();
      assert(cleared.store.has(cleared.catalogFingerprint) === false, 'G1.3.1.7-store.clear 必须生效');
      recordPositive('G1.3.1.7-store put/get/has/clear/size 回归通过', '同指纹字节保护 + clear 生效');
    }
    // 1. 恶意子类（class ForgedStore extends StoryAssetCatalogStore，覆盖 has/get）-> 构造必须被拒绝
    //    （new.target 检查抛 TypeError）；若用反射绕过构造（仅当可行），verifier/入口必须拒绝，不能写入。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const before = JSON.stringify(state);
      let ctorError = '';
      let forgedStore = null;
      try {
        class ForgedStore extends shared.StoryAssetCatalogStore {
          has(fp) { return fp === trusted.catalogFingerprint; }
          get() { return { eventDefinitions: [{ eventDefinitionId: 'evt_forged', origin: 'catalog', title: 'attacker', definitionFingerprint: 'sha256:x' }] }; }
        }
        forgedStore = new ForgedStore();
      } catch (error) { ctorError = 'THREW: ' + error.message; }
      assert(ctorError !== '', 'G1.3.1.7-恶意子类构造必须被拒绝（new.target 检查），实际未抛');
      assert(shared.isStoryAssetCatalogStore(forgedStore) === false, 'G1.3.1.7-子类对象不得被 verifier 认可');
      // 即使绕过构造（用 Reflect.construct 显式指定 newTarget 为基类），入口也必须拒绝并零写入。
      let bypassed = null;
      let bypassError = '';
      try {
        bypassed = Reflect.construct(shared.StoryAssetCatalogStore, [], function ForgedTarget() {});
      } catch (error) { bypassError = 'THREW: ' + error.message; }
      if (bypassed !== null) {
        const turn = buildTurn({
          turnId: 't7_bypass',
          command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_forged', definitionFingerprint: 'sha256:x' }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_bp', commandFingerprint: 'sha256:sys_bp' }] } },
          auxiliary: { validatedSystemCommands: [{ commandId: 'sys_bp', commandFingerprint: 'sha256:sys_bp', scope: { unit: '' } }] },
        });
        const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: bypassed, eventDefinitions: [{ eventDefinitionId: 'evt_forged', origin: 'catalog', title: 'attacker' }] } }, factsOfInterest: [] });
        assert(!r.ok && r.receipt.errorCodes.some((c) => c === 'CONFLICT' || c === 'INVALID_COMMAND'), 'G1.3.1.7-反射绕过构造的实例必须拒绝，实际 ' + r.receipt.errorCodes.join(','));
        assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.7-反射绕过实例零写入 + 字节不变');
      }
      recordRejected('G1.3.1.7-恶意子类继承brand', '构造被拒（new.target 检查）+ verifier 拒绝 + 零写入', '被拒');
    }
    // 2. Object.setPrototypeOf(realStore, forgedProto) -> verifier/入口稳定拒绝，不能写入。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const before = JSON.stringify(state);
      const forgedProto = { has: () => true, get: () => ({ eventDefinitions: [{ eventDefinitionId: 'evt_forged', origin: 'catalog', title: 'proto forged', definitionFingerprint: 'sha256:x' }] }) };
      const tampered = trusted.store;
      Object.setPrototypeOf(tampered, forgedProto);
      assert(shared.isStoryAssetCatalogStore(tampered) === false, 'G1.3.1.7-setPrototypeOf 篡改后 verifier 必须拒绝');
      const turn = buildTurn({
        turnId: 't7_proto',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_forged', definitionFingerprint: 'sha256:x' }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_pt', commandFingerprint: 'sha256:sys_pt' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_pt', commandFingerprint: 'sha256:sys_pt', scope: { unit: '' } }] },
      });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: tampered, eventDefinitions: [{ eventDefinitionId: 'evt_forged', origin: 'catalog', title: 'proto forged' }] } }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.7-setPrototypeOf 篡改必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.includes('CONFLICT'), 'G1.3.1.7-setPrototypeOf 篡改必须 CONFLICT，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.7-setPrototypeOf 篡改零写入 + 字节不变');
      recordRejected('G1.3.1.7-setPrototypeOf篡改', 'CONFLICT + 零写入（原型绑定拒绝）', 'CONFLICT');
    }
    // 3. 原型方法替换（StoryAssetCatalogStore.prototype.has = ...）-> 冻结原型使赋值抛 TypeError；
    //    即使赋值成功（理论），verifier 的方法指针检查也会拒绝；合法实例读取路径不变（put/get 仍走 #snapshots）。
    {
      let protoMutationError = '';
      try {
        shared.StoryAssetCatalogStore.prototype.has = () => true;
      } catch (error) { protoMutationError = 'THREW: ' + error.message; }
      assert(protoMutationError !== '', 'G1.3.1.7-原型方法替换必须被拒绝（冻结原型抛 TypeError），实际未抛');
      // 读取路径不变：正式 store 仍可 put 并正确读取真实 snapshot。
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const turn = buildTurn({
        turnId: 't7_proto_mut',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_g1', definitionFingerprint: trusted.eventDefinitions[0].definitionFingerprint }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_pm', commandFingerprint: 'sha256:sys_pm' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_pm', commandFingerprint: 'sha256:sys_pm', scope: { unit: '' } }] },
      });
      const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: trusted.store, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] });
      assert(r.ok, 'G1.3.1.7-原型方法替换被拒后读取路径不变（create 仍成功）: ' + JSON.stringify(r.receipt.errorCodes));
      assert(r.state.worldEvents.length === 1, 'G1.3.1.7-原型方法替换被拒后 create 写入合法事件');
      recordRejected('G1.3.1.7-原型方法替换', '赋值抛 TypeError（冻结原型，篡改被拒）+ 读取路径不变', '被拒');
    }
    // 4. 绑定方法/defineProperty 篡改（构造后 own 覆盖）-> 可被定义但 verifier 必须拒绝（own 覆盖检查），
    //    入口稳定拒绝、零写入。
    {
      const trusted = await makeTrustedCatalog([makeWorldEventDefinition({ eventDefinitionId: 'evt_g1' })]);
      const state = makeEmptyState({ assetCatalogFingerprint: trusted.catalogFingerprint });
      const before = JSON.stringify(state);
      let defineError = '';
      try {
        Object.defineProperty(trusted.store, 'has', { value: () => true, writable: true, enumerable: true, configurable: true });
      } catch (error) { defineError = 'THREW: ' + error.message; }
      assert(defineError === '', 'G1.3.1.7-own defineProperty 可定义（原型冻结不阻断实例自有属性），但必须被 verifier 拒绝，实际抛错 ' + defineError);
      assert(shared.isStoryAssetCatalogStore(trusted.store) === false, 'G1.3.1.7-own 覆盖后 verifier 必须拒绝');
      const turn = buildTurn({
        turnId: 't7_own_def',
        command: { kind: 'create_event_instance', proposal: { definitionRef: { eventDefinitionId: 'evt_g1', definitionFingerprint: trusted.eventDefinitions[0].definitionFingerprint }, evidenceRefs: [{ kind: 'system_command', commandId: 'sys_od', commandFingerprint: 'sha256:sys_od' }] } },
        auxiliary: { validatedSystemCommands: [{ commandId: 'sys_od', commandFingerprint: 'sha256:sys_od', scope: { unit: '' } }] },
      });
      let r;
      let threw = '';
      try { r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state, catalog: { catalogFingerprint: trusted.catalogFingerprint, store: trusted.store, eventDefinitions: trusted.eventDefinitions } }, factsOfInterest: [] }); } catch (error) { threw = 'THREW: ' + error.message; }
      assert(!threw, 'G1.3.1.7-own defineProperty 篡改必须稳定拒绝不 throw，实际 ' + threw);
      assert(!r.ok && r.receipt.errorCodes.some((c) => c === 'INVALID_COMMAND' || c === 'CONFLICT'), 'G1.3.1.7-own defineProperty 篡改必须稳定拒绝，实际 ' + r.receipt.errorCodes.join(','));
      assert(JSON.stringify(r.state) === before && r.state.runtimeRevision === 0, 'G1.3.1.7-own defineProperty 篡改零写入 + 字节不变');
      recordRejected('G1.3.1.7-defineProperty篡改own方法', r.receipt.errorCodes.join(',') + ' + 零写入（own 覆盖拒绝）', '零写入');
    }
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-reducer regression passed.');
  console.log('positive checks: ' + positives.length);
  for (const result of positives) console.log('  + ' + result.name + ': ' + result.detail);
  console.log('tamper rejections: ' + rejections.length);
  for (const result of rejections) console.log('  - ' + result.name + ': rejected (' + result.errorMessage + ')');
  console.log('safety assertions: ' + safety.length);
  for (const result of safety) console.log('  = ' + result.name + ': ' + result.detail);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-reducer regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
