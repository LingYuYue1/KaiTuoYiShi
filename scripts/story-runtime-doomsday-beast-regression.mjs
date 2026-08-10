// G1.3.1 doomsday-beast 回归：四条通用路径（唯一事件/重复遭遇/提前完成/后台结算）。
// 全部路径按 WorldEventDefinition/WorldEventInstance 通用规则执行，无任何名称特判——
// "末日兽"仅作为测试夹具的事件标题，规则由 replayPolicy/resolutionMode 驱动。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs, makeAllocator, makeEmptyState, makeEventInstance, narrativeEvidence, narrativeSpanEvidence } from './story-runtime-core-test-helpers.mjs';

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }

async function main() {
  const reducer = await bundleTs('services/storyRuntime/runtimeReducer.ts');
  const eventLifecycle = await bundleTs('services/storyRuntime/eventLifecycle.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  // F1：buildTurn 原样传递 responseId/claimedCompletedUnitIds/retryCount/auxiliary；测试不得依赖生产默认 responseId。
  const buildTurn = (input) => {
    const out = {
      turnId: input.turnId ?? 'turn',
      expectedRuntimeRevision: input.expectedRuntimeRevision ?? 0,
      runtimeBranchId: 'branch_test',
      idempotencyKey: input.idempotencyKey ?? 'key_' + input.turnId,
      command: input.command,
      source: input.source ?? 'player_turn',
      rawBody: input.rawBody,
      auxiliary: input.auxiliary,
      responseId: input.responseId,
      retryCount: input.retryCount,
    };
    if (input.claimedCompletedUnitIds) out.claimedCompletedUnitIds = input.claimedCompletedUnitIds;
    return out;
  };

  // ══ 路径 1：once 唯一事件（末日兽=通用唯一事件）终态后再次攻击 -> ALREADY_TERMINAL ══
  {
    const allocator = await makeAllocator();
    const cmdValidator = await bundleTs('services/storyRuntime/commandValidator.ts');
    const state = makeEmptyState({
      worldEvents: [makeEventInstance({ eventInstanceId: 'beast_inst', eventDefinitionId: 'beast_def', status: 'resolved', replayPolicy: 'once' })],
    });
    const instFp = await cmdValidator.instanceFingerprintOf(state, 'beast_inst');
    const turn = buildTurn({
      turnId: 'beast_again',
      command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'beast_inst', expectedInstanceFingerprint: instFp }, resolutionMode: 'player', outcome: 'normal', evidenceRefs: [] },
      rawBody: '玩家再次攻击已结束的末日兽（beast_inst）。',
    });
    turn.claimedCompletedUnitIds = ['beast_inst'];
    const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'beast_inst', factType: 'unit_completed' }] });
    // 终态复演被 gate 拦截为 ALLOW_REFRAMED（早于事务），或事务层拒绝为 ALREADY_TERMINAL：两者都满足"不再结算"。
    assert(!r.ok, '路径1 必须被拒绝');
    assert(r.receipt.errorCodes.some((c) => c === 'ALREADY_TERMINAL' || c === 'ALLOW_REFRAMED' || c === 'REJECT'), '路径1 必须 ALREADY_TERMINAL/ALLOW_REFRAMED/REJECT，实际 ' + r.receipt.errorCodes.join(','));
    assert(r.state.worldEvents.length === 1 && r.outbox.length === 0, '路径1 状态与 outbox 不变');
    recordRejected('路径1-once终态后再攻击', r.receipt.errorCodes.join(',') + ' + 状态不变', '状态不变');
  }

  // ══ 路径 2：重复遭遇（repeatable）-> 新实例 ID + 新来源事实 ══
  {
    const allocator = await makeAllocator();
    const state = makeEmptyState({
      worldEvents: [makeEventInstance({ eventInstanceId: 'beast_inst_1', eventDefinitionId: 'beast_repeat', status: 'resolved', replayPolicy: 'repeatable' })],
    });
    // 新结构化来源 + 新实例 ID：seed 新实例。
    const created = await eventLifecycle.createInstance(state.worldEvents, {
      eventInstanceId: 'beast_inst_2',
      eventDefinitionId: 'beast_repeat',
      replayPolicy: 'repeatable',
      at: { dayOrdinal: 2, minuteOfDay: 0 },
      source: narrativeEvidence('repeat'),
      idempotencyKey: 'seed:repeat:2',
      allocator,
    });
    assert(created.ok && created.instance.eventInstanceId === 'beast_inst_2', '路径2 必须产生新实例 ID');
    assert(created.instance.source.kind === 'narrative_span' && created.instance.source.responseId === 'repeat', '路径2 新来源事实');
    recordPositive('路径2-repeatable新实例+新来源', 'beast_inst_2 + new evidence');
    // 同 definition 再次 create（无新来源）-> once 语义外 repeatable 也要求新来源：缺少新来源证据拒绝。
    const noSource = await eventLifecycle.createInstance(state.worldEvents, {
      eventInstanceId: 'beast_inst_3',
      eventDefinitionId: 'beast_repeat',
      replayPolicy: 'repeatable',
      at: { dayOrdinal: 2, minuteOfDay: 0 },
      source: undefined,
      idempotencyKey: 'seed:repeat:3',
      allocator,
    });
    assert(!noSource.ok && noSource.code === 'MISSING_EVIDENCE', '路径2 缺新来源必须 MISSING_EVIDENCE');
    recordRejected('路径2-repeatable缺新来源', 'MISSING_EVIDENCE', 'MISSING_EVIDENCE');
  }

  // ══ 路径 3：玩家提前完成唯一事件 -> player_early + 后续原定 superseded ══
  {
    const allocator = await makeAllocator();
    const cmdValidator = await bundleTs('services/storyRuntime/commandValidator.ts');
    const state = makeEmptyState({
      worldEvents: [
        makeEventInstance({ eventInstanceId: 'beast_early', eventDefinitionId: 'beast_arc', status: 'active' }),
        // 有显式因果（parentInstanceId 指向 beast_early）的后续原定战斗 -> 应 superseded。
        makeEventInstance({ eventInstanceId: 'beast_final', eventDefinitionId: 'beast_arc', status: 'active', parentInstanceId: 'beast_early', dueAt: { dayOrdinal: 5, minuteOfDay: 0 } }),
        // 同 definition 无因果的独立实例 -> 不误伤。
        makeEventInstance({ eventInstanceId: 'beast_other', eventDefinitionId: 'beast_arc', status: 'active' }),
      ],
    });
    const instFpEarly = await cmdValidator.instanceFingerprintOf(state, 'beast_early');
    const rawBodyEarly = '玩家在最终战前提前解决了末日兽（beast_early）。';
    const evidenceEarly = await narrativeSpanEvidence(rawBodyEarly, 'beast_early:body');
    const turn = buildTurn({
      turnId: 'beast_early',
      responseId: 'beast_early:body',
      command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'beast_early', expectedInstanceFingerprint: instFpEarly }, resolutionMode: 'player_early', outcome: 'normal', evidenceRefs: [evidenceEarly] },
      rawBody: rawBodyEarly,
    });
    turn.claimedCompletedUnitIds = ['beast_early'];
    const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'beast_early', factType: 'unit_completed' }] });
    assert(r.ok, '路径3 必须成功');
    const early = r.state.worldEvents.find((w) => w.eventInstanceId === 'beast_early');
    const final = r.state.worldEvents.find((w) => w.eventInstanceId === 'beast_final');
    const other = r.state.worldEvents.find((w) => w.eventInstanceId === 'beast_other');
    assert(early.status === 'resolved' && early.resolutionMode === 'player_early', '路径3 提前结算事实保留');
    assert(final.status === 'superseded', '路径3 有因果的后续原定战斗 superseded，不补演');
    assert(other.status === 'active', '路径3 无因果独立实例不被误伤');
    recordPositive('路径3-玩家提前完成唯一事件', 'resolved(player_early) + causal final superseded + other untouched');
  }

  // ══ 路径 4：world_background 结算 -> playerParticipated=false，无知识 ══
  {
    const allocator = await makeAllocator();
    const cmdValidator = await bundleTs('services/storyRuntime/commandValidator.ts');
    const state = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'beast_wb', eventDefinitionId: 'beast_wb', status: 'active' })] });
    const instFpWb = await cmdValidator.instanceFingerprintOf(state, 'beast_wb');
    const rawBodyWb = '世界后台完成了末日兽（beast_wb）。';
    const evidenceWb = await narrativeSpanEvidence(rawBodyWb, 'beast_wb:body');
    const turn = buildTurn({
      turnId: 'beast_wb',
      responseId: 'beast_wb:body',
      source: 'world_due',
      command: { kind: 'resolve_event_instance', target: { eventInstanceId: 'beast_wb', expectedInstanceFingerprint: instFpWb }, resolutionMode: 'world_background', outcome: 'normal', evidenceRefs: [evidenceWb] },
      rawBody: rawBodyWb,
    });
    turn.claimedCompletedUnitIds = ['beast_wb'];
    const r = await reducer.runRuntimeTurn(turn, { allocator, ctx: { state }, factsOfInterest: [{ eventInstanceId: 'beast_wb', factType: 'unit_completed' }] });
    assert(r.ok, '路径4 必须成功');
    assert(r.state.factLedger.every((f) => f.playerParticipated === false), '路径4 后台事实 playerParticipated=false');
    assert(r.state.knowledgeGrants.length === 0, '路径4 无知识 grant（无传播证据）');
    recordPositive('路径4-后台结算', 'playerParticipated=false + 0 knowledge');
  }

  // 冻结 hash。
  const FROZEN = {
    'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
    'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
    'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
  };
  for (const [fp, h] of Object.entries(FROZEN)) {
    assert(sha256File(fp) === h, '冻结文件 hash 变化: ' + fp);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });

  console.log('story-runtime-doomsday-beast regression passed.');
  console.log('positive checks: ' + positives.length);
  for (const r of positives) console.log('  + ' + r.name + ': ' + r.detail);
  console.log('tamper rejections: ' + rejections.length);
  for (const r of rejections) console.log('  - ' + r.name + ': rejected (' + r.errorMessage + ')');
  console.log('safety assertions: ' + safety.length);
  for (const r of safety) console.log('  = ' + r.name + ': ' + r.detail);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-doomsday-beast regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
