// R1 集中行为回归（2026-08-09 计划 §6 R1）——单条集中回归，不拆分多个专项。
// 覆盖 R1 全部 8 项行为验收（按计划原文逐条）+ 剧情编织适配器映射规则。
// 第 7、8 项（到期事件不移动玩家焦点、旧动态世界字符串不生成事实）直接用集中回归用例
// 驱动 adjudicateStoryTurn 验证，不依赖真实主回合接线（接线属于 R2）。
// 生产模块经 esbuild 执行；全部输入为测试专用 synthetic，不进入生产资产。
import path from 'node:path';
import { bundleTs, makeEmptyState, makeEventInstance } from './story-runtime-core-test-helpers.mjs';

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }

// ═══════════════════ 测试夹具（synthetic，不进入生产资产） ═══════════════════

function makeKeyEvent(name) {
  return {
    事件名: name,
    事件说明: name + ' 说明',
    前置条件: [],
    触发条件: [],
    阻断条件: [],
    事件结果: [],
    对后续影响: [],
    信息可见性: { 谁知道: [], 谁不知道: [], 是否仅读者视角可见: false },
  };
}

function makeSegment(overrides) {
  return {
    id: 'seg_1',
    组号: 1,
    标题: '抵达雪国',
    章节范围: '第1章',
    章节标题: [],
    是否开局组: true,
    起始章序号: 1,
    结束章序号: 1,
    启用注入: true,
    原文内容: '',
    字数: 0,
    原文摘要: '',
    本段概括: '',
    时间线起点: '',
    时间线终点: '',
    开局已成立事实: [],
    前段延续事实: [],
    本段结束状态: [],
    给后续参考: [],
    原著硬约束: [],
    可提前铺垫: [],
    登场角色: [],
    涉及地点: [],
    涉及派系: [],
    角色档案: [],
    势力档案: [],
    地图地点档案: [],
    关键事件: [],
    时间线: [],
    角色推进: [],
    处理状态: '已完成',
    运行状态: '未开始',
    updatedAt: 1,
    ...overrides,
  };
}

const seg1 = makeSegment({
  id: 'seg_1', 组号: 1, 标题: '抵达雪国', 运行状态: '当前',
  本段结束状态: ['玩家已抵达雪国首府'],
  关键事件: [makeKeyEvent('雪原遭遇战')],
});
const seg2 = makeSegment({
  id: 'seg_2', 组号: 2, 标题: '矿场与决战', 运行状态: '未开始',
  时间线起点: '0001:01:01:08:00',
  时间线: [{ 标题: '矿场危机', 时间锚点: '0001:01:02:12:00', 描述: '', 涉及角色: [] }],
  关键事件: [makeKeyEvent('矿场危机'), makeKeyEvent('首领决战')],
});
const seg3 = makeSegment({
  id: 'seg_3', 组号: 3, 标题: '终局之战', 运行状态: '未开始',
  关键事件: [makeKeyEvent('终局之战')],
});

const archive = {
  id: 'arc_1', 系列ID: 'series_1', 分段ID: 'seg_prev', 分段组号: 0, 分段标题: '序章',
  归档回合: 0, 归档状态: '已经历', 摘要: '抵达雪国前奏', 角色推进摘要: [], 切换说明: '', 判定理由: [], createdAt: 1,
};

const series = {
  id: 'series_1', 标题: '测试系列', 作品名: '测试作品', 来源类型: 'custom', 来源智库条目ID: [],
  章节列表: [], 分段列表: [seg1, seg2, seg3], 每段章数: 1, 激活注入: true, 当前分段组号: 1,
  当前阶段概括: '', 核心角色摘要: [], 核心角色: [], 涉及地点索引: [], 涉及派系索引: [], createdAt: 1, updatedAt: 1,
};

const system = {
  系列列表: [series], 当前系列ID: 'series_1',
  当前进度: { 当前系列ID: 'series_1', 当前分段ID: 'seg_1', 当前分段组号: 1, 推进状态: '推进中', 已完成摘要: [], 当前待解问题: [], 切换说明: [], 历史归档: [archive], 最近判定理由: [], updatedAt: 1 },
};

const CURRENT_UNIT_ID = 'unit:seg_1';
const F1_ID = 'unit:seg_2:event:1';
const F2_ID = 'unit:seg_2:event:2';
const FUTURE_ID = 'unit:seg_3';

function makeCandidate(overrides) {
  return {
    candidateId: 'cand_test',
    eventInstanceId: CURRENT_UNIT_ID,
    factType: 'unit_completed',
    payload: {},
    occurredAt: { dayOrdinal: 1, minuteOfDay: 10 },
    publicScope: { kind: 'private' },
    evidenceRefs: [],
    evidenceLevel: 'supported',
    playerParticipated: false,
    playerObserverVisible: false,
    createdBy: 'player_turn',
    ...overrides,
  };
}

function makeCommittedFact(overrides) {
  return {
    factId: 'fact_test',
    eventInstanceId: CURRENT_UNIT_ID,
    sourceRevision: 0,
    factType: 'unit_completed',
    payload: {},
    occurredAt: { dayOrdinal: 1, minuteOfDay: 10 },
    committedAt: { dayOrdinal: 1, minuteOfDay: 10 },
    publicScope: { kind: 'private' },
    evidenceRefs: [],
    evidenceLevel: 'confirmed',
    invalidatesEventInstanceIds: [],
    playerParticipated: true,
    playerObserverVisible: false,
    createdBy: 'player_turn',
    ...overrides,
  };
}

const RECEIPT_EVIDENCE = { kind: 'gameplay_receipt', receiptId: 'rct:complete', receiptType: 'unit_completed' };

async function main() {
  const adapter = await bundleTs('services/storyRuntime/storyWeavingRuntimeAdapter.ts');
  const adjudicator = await bundleTs('services/storyRuntime/storyTurnAdjudicator.ts');
  const scan = await bundleTs('services/storyRuntime/dueEventScanner.ts');
  const positives = [];
  const record = (name, detail) => positives.push({ name, detail });
  const GAME_TIME = { dayOrdinal: 1, minuteOfDay: 10 };

  const currentFocus = { focusId: 'focus:series_1:seg_1', trackId: 'series_1', unitId: CURRENT_UNIT_ID, status: 'active', reasonCodes: ['story_weaving:segment:当前'], enteredAtRevision: 0 };
  const adjudicate = (overrides) => adjudicator.adjudicateStoryTurn({
    currentFocus,
    currentSegment: seg1,
    committedFacts: [],
    eventInstances: [makeEventInstance({ eventInstanceId: CURRENT_UNIT_ID, eventDefinitionId: 'definition:unit:seg_1', status: 'active' })],
    confirmedEvidence: [],
    gameTime: GAME_TIME,
    runtimeRevision: 0,
    ...overrides,
  });

  // ═══════════ 第一部分：剧情编织适配器映射规则 ═══════════

  const projection = adapter.buildStoryWeavingRuntimeProjection({
    system,
    legacyWorldEventStrings: ['星核爆发', '裂界蔓延', '星核爆发'],
    historyArchives: [archive],
  });
  assert(projection, '适配器必须能解析当前分段');

  // A1 当前分段 → 当前焦点（沿用分段既有稳定 id）。
  assert(projection.currentFocus.unitId === CURRENT_UNIT_ID, '当前焦点 unitId 必须沿用分段稳定 id');
  assert(projection.currentFocus.status === 'active', '当前分段「当前」必须映射 active 焦点');
  assert(projection.currentFocus.trackId === 'series_1' && projection.currentFocus.focusId === 'focus:series_1:seg_1', '焦点必须带系列与分段');
  assert(projection.currentUnit.unitId === CURRENT_UNIT_ID && projection.currentUnit.title === '抵达雪国', '当前单元必须是当前分段级单元');
  assert(JSON.stringify(projection.currentUnit.endStates) === JSON.stringify(['玩家已抵达雪国首府']), '当前单元必须携带本段结束状态');
  record('A1 当前分段映射当前焦点', 'unit:seg_1 active + 结束状态');

  // A2 当前分段关键事件 → active 情节单元（派生稳定 id）。
  assert(projection.activeUnits.length === 1, '当前分段 1 个关键事件必须映射 1 个 active 单元');
  assert(projection.activeUnits[0].unitId === 'unit:seg_1:event:1' && projection.activeUnits[0].status === 'active', '关键事件单元 id/状态错误');
  assert(projection.activeUnits[0].title === '雪原遭遇战', '关键事件单元标题错误');
  record('A2 当前分段关键事件映射 active 单元', 'unit:seg_1:event:1');

  // A3 下一分段关键事件 → scheduled 世界事件；旧文本时间锚点不伪造 GameTime。
  assert(projection.scheduledUnits.length === 2, '下一分段 2 个关键事件必须映射 2 个 scheduled 单元');
  assert(projection.scheduledUnits.every((unit) => unit.kind === 'future_scheduled' && unit.status === 'scheduled'), '下一分段单元必须 future_scheduled/scheduled');
  const dueF1 = projection.scheduledUnits.find((unit) => unit.unitId === F1_ID);
  const dueF2 = projection.scheduledUnits.find((unit) => unit.unitId === F2_ID);
  assert(dueF1 && dueF1.timelineAnchor === '0001:01:02:12:00' && dueF1.dueAt === undefined, '矿场危机必须保留文本锚点且不伪造 dueAt');
  assert(dueF2 && dueF2.timelineAnchor === '0001:01:01:08:00' && dueF2.dueAt === undefined, '首领决战必须保留段级文本锚点且不伪造 dueAt');
  assert(projection.scheduledEventInstances.length === 2, 'scheduled 单元必须输出事件实例投影');
  assert(projection.scheduledEventInstances.every((instance) => instance.status === 'scheduled' && instance.source.kind === 'schedule_record'), 'scheduled 实例必须 status=scheduled 且 source=排期记录投影');
  assert(projection.scheduledEventInstances.every((instance) => instance.dueAt === undefined), '旧文本时间锚点不得直接进入 dueEventScanner');
  record('A3 下一分段关键事件映射 scheduled 世界事件', '2 个 scheduled + 文本锚点，无伪 GameTime');

  // A4 旧 世界.全局事件 → 只映射 legacy label，绝不生成已发生事实或事件实例。
  assert(JSON.stringify(projection.legacyLabels) === JSON.stringify(['星核爆发', '裂界蔓延']), 'legacy 字符串必须去重为 label');
  const legacyInInstances = [...projection.scheduledEventInstances, ...projection.activeUnits].some((unit) => String(unit.unitId).includes('星核') || String(unit.unitId).includes('裂界'));
  assert(!legacyInInstances, 'legacy 字符串不得生成任何事件实例/单元');
  record('A4 旧 世界.全局事件 只映射 legacy label', '2 条 label，0 实例/事实');

  // A5 旧历史归档 → 终态提示，不伪造过去事实。
  assert(projection.terminalHints.length === 1, '历史归档必须映射终态提示');
  assert(projection.terminalHints[0].unitId === 'archive:arc_1' && projection.terminalHints[0].archivedStatus === '已经历', '终态提示必须带归档单元 id 与状态');
  assert(projection.terminalHints[0].label.includes('序章'), '终态提示必须保留分段标题');
  record('A5 旧历史归档映射终态提示', 'archive:arc_1 已经历');

  // A6 未来分段不进入普通回合候选集合。
  for (const excluded of [F1_ID, F2_ID, 'unit:seg_2', FUTURE_ID, 'unit:seg_3:event:1']) {
    assert(projection.excludedFutureUnits.includes(excluded), '未来单元必须排除: ' + excluded);
  }
  assert(!projection.excludedFutureUnits.includes(CURRENT_UNIT_ID), '当前单元不得被排除');
  record('A6 未来分段排除出普通回合候选', 'seg2 全部 + seg3 全部排除，当前单元保留');

  // A7 归档运行状态的分段不能映射为 active 当前焦点。
  const archivedProjection = adapter.buildStoryWeavingRuntimeProjection({
    system,
    currentSegment: makeSegment({ id: 'seg_done', 组号: 1, 运行状态: '已经历', 处理状态: '已完成' }),
    nextSegment: seg2,
  });
  assert(archivedProjection.currentFocus.status === 'completed', '归档分段必须映射 completed 焦点，不能成为当前');
  record('A7 归档分段不能成为当前焦点', '已经历 -> completed');

  // ═══════════ 第二部分：联合裁决器行为验收（直接驱动 adjudicateStoryTurn） ═══════════

  // 验收 1：当前目标未完成时保持（stay）。
  {
    const result = adjudicate({ confirmedEvidence: [] });
    assert(result.decision === 'stay', '验收1 无完成证据必须 stay，实际: ' + result.decision);
    assert(result.currentUnitId === CURRENT_UNIT_ID && result.completedUnitIds.length === 0 && result.committedFactIds.length === 0, '验收1 必须保持当前焦点且无提交');
    assert(result.reasons.some((r) => r.includes('保持当前焦点')), '验收1 必须说明保持原因');
    record('验收1 当前目标未完成时保持', 'stay + 空提交 + 说明原因');
  }

  // 验收 2：当前目标有明确完成证据时只推进一格（advance_one）。
  {
    const candidate = makeCandidate({ evidenceLevel: 'confirmed', evidenceRefs: [RECEIPT_EVIDENCE], playerParticipated: true });
    const result = adjudicate({ confirmedEvidence: [candidate] });
    assert(result.decision === 'advance_one', '验收2 已验证 receipt 必须 advance_one，实际: ' + result.decision);
    assert(JSON.stringify(result.completedUnitIds) === JSON.stringify([CURRENT_UNIT_ID]), '验收2 必须只完成当前一格');
    const expectedFactId = adjudicator.adjudicationFactIdentity(candidate, 0);
    assert(JSON.stringify(result.committedFactIds) === JSON.stringify([expectedFactId]), '验收2 提交事实身份必须与裁决器契约一致');
    record('验收2 明确完成证据只推进一格', 'advance_one + completedUnitIds=[unit:seg_1]');
    // 验收 2 补：payload 命中明确结束状态（narrative_span 单独出现）同样只推进一格。
    const endStateCandidate = makeCandidate({ evidenceLevel: 'confirmed', evidenceRefs: [{ kind: 'narrative_span', responseId: 'r1', bodyFingerprint: 'fp', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'fp' }], payload: { endState: '玩家已抵达雪国首府' } });
    const result2 = adjudicate({ confirmedEvidence: [endStateCandidate] });
    assert(result2.decision === 'advance_one', '验收2b 命中明确结束状态必须 advance_one，实际: ' + result2.decision);
    assert(result2.completedUnitIds.length === 1, '验收2b 仍只推进一格');
    record('验收2b 命中明确结束状态只推进一格', 'advance_one（endState payload）');

    // 真实组合：适配器输出可直接交给裁决器，不需要手工伪造当前 active instance。
    const directResult = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment: seg1,
      committedFacts: [],
      eventInstances: projection.scheduledEventInstances,
      confirmedEvidence: [candidate],
      gameTime: GAME_TIME,
      runtimeRevision: 0,
    });
    assert(directResult.decision === 'advance_one', '适配器与裁决器直接组合必须能推进当前单元，实际: ' + directResult.decision);
    record('验收2c 适配器与裁决器直接组合', 'advance_one，无手工 active instance');

    const ordinaryReceipt = makeCandidate({ factType: 'location_entered', evidenceLevel: 'confirmed', evidenceRefs: [{ kind: 'gameplay_receipt', receiptId: 'rct:enter', receiptType: 'location_entered' }], playerParticipated: true });
    const ordinaryResult = adjudicate({ confirmedEvidence: [ordinaryReceipt] });
    assert(ordinaryResult.decision === 'stay', '非完成型 gameplay receipt 不得推进剧情，实际: ' + ordinaryResult.decision);
    record('验收2d 普通 gameplay receipt 不推进', 'location_entered -> stay');
  }

  // 验收 3：正文提到未来人物、地点和事件时不跳段（stay）。
  {
    const mentionFuture = makeCandidate({ eventInstanceId: FUTURE_ID, evidenceLevel: 'supported', evidenceRefs: [] });
    const result = adjudicate({ confirmedEvidence: [mentionFuture] });
    assert(result.decision === 'stay', '验收3 仅提及未来单元必须 stay，实际: ' + result.decision);
    assert(result.currentUnitId === CURRENT_UNIT_ID && result.completedUnitIds.length === 0, '验收3 不得推进或结算未来单元');
    assert(result.reasons.some((r) => r.includes('提及')), '验收3 必须说明仅提及不推进');
    record('验收3 提到未来内容不跳段', 'stay + 未来单元不入候选');
    // 验收 3 补：已验证 narrative_span 但未命中结束状态/命令/receipt 也不推进。
    const spanOnly = makeCandidate({ evidenceLevel: 'confirmed', evidenceRefs: [{ kind: 'narrative_span', responseId: 'r1', bodyFingerprint: 'fp', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'fp' }] });
    const resultSpan = adjudicate({ confirmedEvidence: [spanOnly] });
    assert(resultSpan.decision === 'stay', '验收3b 单独 narrative_span 未命中结束状态必须 stay，实际: ' + resultSpan.decision);
    record('验收3b 单独正文证据不构成完成', 'stay + 未命中明确结束状态');
  }

  // 验收 4：同一完成证据重复提交时不产生第二次结算（stay）。
  {
    const candidate = makeCandidate({ evidenceLevel: 'confirmed', evidenceRefs: [RECEIPT_EVIDENCE], playerParticipated: true });
    const committedFacts = [makeCommittedFact({ eventInstanceId: CURRENT_UNIT_ID, factType: 'unit_completed', payload: {} })];
    const result = adjudicate({ confirmedEvidence: [candidate], committedFacts });
    assert(result.decision === 'stay', '验收4 同一完成证据重复提交必须 stay，实际: ' + result.decision);
    assert(result.completedUnitIds.length === 0 && result.committedFactIds.length === 0, '验收4 不得产生第二次结算');
    assert(result.reasons.some((r) => r.includes('第二次结算')), '验收4 必须说明重复提交原因');
    record('验收4 同一完成证据不二次结算', 'stay + 空提交');
  }

  // 验收 5：已终态事件不能再次成为当前事件（stay）。
  {
    const terminalCurrent = makeEventInstance({ eventInstanceId: CURRENT_UNIT_ID, eventDefinitionId: 'definition:unit:seg_1', status: 'resolved', resolvedAt: GAME_TIME, terminalFactId: 'fact_old', outcome: 'normal', resolutionMode: 'player' });
    const result = adjudicate({ eventInstances: [terminalCurrent] });
    assert(result.decision === 'stay', '验收5 当前单元已终态必须 stay，实际: ' + result.decision);
    assert(result.completedUnitIds.length === 0 && result.committedFactIds.length === 0, '验收5 终态不得复活');
    assert(result.reasons.some((r) => r.includes('终态')), '验收5 必须说明终态原因');
    record('验收5 已终态事件不能成为当前事件', 'stay + 终态不可复活');
  }

  // 验收 6：提前解决产生 resolve_early + superseded，不补演原事件。
  {
    const f1 = makeEventInstance({ eventInstanceId: F1_ID, eventDefinitionId: 'definition:unit:seg_2:event:1', status: 'scheduled', dueAt: { dayOrdinal: 405, minuteOfDay: 720 }, startAt: { dayOrdinal: 405, minuteOfDay: 720 }, idempotencyKey: 'weaving:unit:seg_2:event:1', source: { kind: 'schedule_record', scheduleId: 'weaving:unit:seg_2:event:1', scheduleRevision: 1 } });
    const f2 = makeEventInstance({ eventInstanceId: F2_ID, eventDefinitionId: 'definition:unit:seg_2:event:2', status: 'scheduled', dependencyIds: [F1_ID], dueAt: { dayOrdinal: 405, minuteOfDay: 480 }, startAt: { dayOrdinal: 404, minuteOfDay: 480 }, idempotencyKey: 'weaving:unit:seg_2:event:2', source: { kind: 'schedule_record', scheduleId: 'weaving:unit:seg_2:event:2', scheduleRevision: 1 } });
    const earlyCandidate = makeCandidate({ eventInstanceId: F1_ID, evidenceLevel: 'confirmed', evidenceRefs: [RECEIPT_EVIDENCE], playerParticipated: true, createdBy: 'player_turn' });
    const result = adjudicate({ eventInstances: [makeEventInstance({ eventInstanceId: CURRENT_UNIT_ID, eventDefinitionId: 'definition:unit:seg_1', status: 'active' }), f1, f2], confirmedEvidence: [earlyCandidate] });
    assert(result.decision === 'resolve_early', '验收6 提前解决必须 resolve_early，实际: ' + result.decision);
    assert(JSON.stringify(result.supersededEventIds) === JSON.stringify([F2_ID]), '验收6 原定后续事件必须 superseded: ' + JSON.stringify(result.supersededEventIds));
    assert(result.currentUnitId === CURRENT_UNIT_ID && result.completedUnitIds.length === 0, '验收6 玩家焦点不移动、不补演原事件');
    assert(result.committedFactIds.length === 1, '验收6 必须记录真实提前结算事实');
    record('验收6 提前解决产生 resolve_early + superseded', F2_ID + ' superseded，焦点不动');

    const prior = makeEventInstance({ eventInstanceId: 'evt_prior', eventDefinitionId: 'definition:prior', status: 'scheduled' });
    const dependentTarget = makeEventInstance({ eventInstanceId: 'evt_target', eventDefinitionId: 'definition:target', status: 'scheduled', dependencyIds: ['evt_prior'] });
    const dependencyResult = adjudicate({ eventInstances: [prior, dependentTarget], confirmedEvidence: [makeCandidate({ eventInstanceId: 'evt_target', evidenceLevel: 'confirmed', evidenceRefs: [RECEIPT_EVIDENCE], playerParticipated: true })] });
    assert(!dependencyResult.supersededEventIds.includes('evt_prior'), '提前解决目标不得反向取消其前置事件');
    record('验收6b 提前解决不反向取消前置', 'evt_prior 保留');
  }

  // 验收 7：到期后台事件可以进入待结算状态，但不会自动移动玩家焦点。
  {
    // 先复用 dueEventScanner：到期 scheduled 后台事件 → resolution_pending（事件终态与后台到期处理）。
    const bgState = makeEmptyState({ worldEvents: [makeEventInstance({ eventInstanceId: 'evt_bg_1', eventDefinitionId: 'definition:evt_bg', status: 'scheduled', dueAt: { dayOrdinal: 1, minuteOfDay: 5 }, startAt: { dayOrdinal: 1, minuteOfDay: 5 }, idempotencyKey: 'weaving:evt_bg_1', source: { kind: 'schedule_record', scheduleId: 'weaving:evt_bg_1', scheduleRevision: 1 } })] });
    const scanned = scan.scanDueEvents(bgState, GAME_TIME);
    assert(scanned.ok, '验收7 扫描必须成功');
    const pendingInstance = scanned.state.worldEvents.find((w) => w.eventInstanceId === 'evt_bg_1');
    assert(pendingInstance.status === 'resolution_pending', '验收7 到期后台事件必须进入待结算');
    assert(pendingInstance.eventResolutionKey && pendingInstance.eventResolutionKey.startsWith('due:'), '验收7 待结算必须带事件领取 key');
    // 裁决器：待结算后台事件存在但无玩家完成证据 → 玩家焦点不动。
    const result = adjudicate({ eventInstances: [makeEventInstance({ eventInstanceId: CURRENT_UNIT_ID, eventDefinitionId: 'definition:unit:seg_1', status: 'active' }), pendingInstance], confirmedEvidence: [] });
    assert(result.decision === 'stay', '验收7 后台到期不得改变玩家线决策，实际: ' + result.decision);
    assert(result.currentUnitId === CURRENT_UNIT_ID && result.completedUnitIds.length === 0, '验收7 不得自动移动玩家焦点');
    assert(result.reasons.some((r) => r.includes('待结算') && r.includes('不影响玩家焦点')), '验收7 必须说明后台事件不影响玩家焦点');
    record('验收7 到期后台事件不移动玩家焦点', 'dueEventScanner -> resolution_pending，裁决 stay');

    const worldDueCandidate = makeCandidate({ eventInstanceId: 'evt_bg_1', evidenceLevel: 'confirmed', evidenceRefs: [{ kind: 'gameplay_receipt', receiptId: 'rct:world', receiptType: 'unit_completed' }], playerParticipated: false, createdBy: 'world_due' });
    const worldDueResult = adjudicate({ eventInstances: [pendingInstance], confirmedEvidence: [worldDueCandidate] });
    assert(worldDueResult.decision === 'stay', 'world_due 候选不得伪装成玩家 resolve_early，实际: ' + worldDueResult.decision);
    assert(worldDueResult.committedFactIds.length === 0, 'world_due 不得通过玩家提前解决分支提交事实');
    record('验收7b 后台候选不伪造玩家参与', 'world_due -> stay');
  }

  // 验收 8：旧动态世界字符串不会直接生成 resolved 事实。
  {
    // 8a：适配器侧——旧字符串只映射 legacy label（见 A4），本用例再断言不会产出任何可写事实载体。
    assert(projection.legacyLabels.length === 2 && projection.scheduledEventInstances.length === 2 && projection.terminalHints.length === 1, '验收8a 旧字符串不得生成额外实例或事实');
    // 8b：裁决器侧——旧字符串来源的终态实例再次出现确认证据时，不得生成新事实、不得复活。
    const legacyResolved = makeEventInstance({
      eventInstanceId: 'evt_legacy_1', eventDefinitionId: 'definition:legacy', status: 'resolved', resolvedAt: { dayOrdinal: 1, minuteOfDay: 5 },
      terminalFactId: 'fact_legacy', outcome: 'normal', resolutionMode: 'world_background',
      idempotencyKey: 'weaving:legacy_1', source: { kind: 'schedule_record', scheduleId: 'weaving:legacy_1', scheduleRevision: 1 },
    });
    const legacyCandidate = makeCandidate({ eventInstanceId: 'evt_legacy_1', evidenceLevel: 'confirmed', evidenceRefs: [RECEIPT_EVIDENCE] });
    const result = adjudicate({ eventInstances: [makeEventInstance({ eventInstanceId: CURRENT_UNIT_ID, eventDefinitionId: 'definition:unit:seg_1', status: 'active' }), legacyResolved], confirmedEvidence: [legacyCandidate] });
    assert(result.decision === 'stay', '验收8b 旧字符串不得让终态复活，实际: ' + result.decision);
    assert(result.completedUnitIds.length === 0 && result.committedFactIds.length === 0, '验收8b 不得从旧字符串生成 resolved 事实');
    assert(result.reasons.some((r) => r.includes('终态')), '验收8b 必须说明终态不可复活');
    record('验收8 旧动态世界字符串不生成 resolved 事实', 'label-only + 终态候选零提交');
  }

  // ═══════════ 汇总 ═══════════
  console.log('R1 集中回归通过：' + positives.length + ' 项行为断言');
  for (const item of positives) console.log('  ✔ ' + item.name + '｜' + item.detail);
}

main().catch((error) => {
  console.error('R1 集中回归失败：' + (error && error.message ? error.message : String(error)));
  process.exit(1);
});
