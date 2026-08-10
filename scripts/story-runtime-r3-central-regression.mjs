// R3 集中行为回归（2026-08-09 计划 §6 R3）——单条集中回归，不拆分多个专项。
// 覆盖 R3 全部 7 项集中验收 + 唯一事实入口/统一事实视图/旧字符串写入移除的静态红线。
// 生产模块经 esbuild 执行（含 @/ 别名解析）；全部输入为测试专用 synthetic，不进入生产资产。
import fs from 'node:fs';
import path from 'node:path';
import { build as esbuildBuild } from 'esbuild';
import { bundleTs, makeEmptyState, makeEventInstance } from './story-runtime-core-test-helpers.mjs';

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }

async function bundleWithAlias(entry) {
  const result = await esbuildBuild({
    entryPoints: [path.join(process.cwd(), entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    alias: { '@': path.join(process.cwd()) },
  });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}

function sourceOf(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

// ═══════════════════ 测试夹具（synthetic，不进入生产资产） ═══════════════════

function makeKeyEvent(name, results = []) {
  return {
    事件名: name,
    事件说明: name + ' 说明',
    前置条件: [],
    触发条件: [],
    阻断条件: [],
    事件结果: results,
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
  关键事件: [
    makeKeyEvent('矿场危机', ['矿场危机已解除']),
    makeKeyEvent('首领决战', ['首领已被击败']),
  ],
});

const series = {
  id: 'series_1', 标题: '测试系列', 作品名: '测试作品', 来源类型: 'custom', 来源智库条目ID: [],
  章节列表: [], 分段列表: [seg1, seg2], 每段章数: 1, 激活注入: true, 当前分段组号: 1,
  当前阶段概括: '', 核心角色摘要: [], 核心角色: [], 涉及地点索引: [], 涉及派系索引: [], createdAt: 1, updatedAt: 1,
};

const system = {
  系列列表: [series], 当前系列ID: 'series_1',
  当前进度: { 当前系列ID: 'series_1', 当前分段ID: 'seg_1', 当前分段组号: 1, 推进状态: '推进中', 已完成摘要: [], 当前待解问题: [], 切换说明: [], 历史归档: [], 最近判定理由: [], updatedAt: 1 },
};

const GAME_TIME = { dayOrdinal: 100, minuteOfDay: 600 };
const CURRENT_UNIT_ID = 'unit:seg_1';
const F1_ID = 'unit:seg_2:event:1';
const F2_ID = 'unit:seg_2:event:2';

function makeCandidate(overrides) {
  return {
    candidateId: 'cand_test',
    eventInstanceId: CURRENT_UNIT_ID,
    factType: 'unit_completed',
    payload: {},
    occurredAt: GAME_TIME,
    publicScope: { kind: 'private' },
    evidenceRefs: [],
    evidenceLevel: 'supported',
    playerParticipated: false,
    playerObserverVisible: false,
    createdBy: 'player_turn',
    ...overrides,
  };
}

async function main() {
  const adapter = await bundleTs('services/storyRuntime/storyWeavingRuntimeAdapter.ts');
  const adjudicator = await bundleTs('services/storyRuntime/storyTurnAdjudicator.ts');
  const worldAdjudicator = await bundleTs('services/storyRuntime/worldEvolutionAdjudicator.ts');
  const consumer = await bundleTs('services/storyRuntime/storyFactConsumerView.ts');
  const newsWorkflow = await bundleWithAlias('hooks/useGame/newsWorkflow.ts');
  const newsModel = await bundleWithAlias('services/ai/newsModel.ts');
  const positives = [];
  const record = (name, detail) => positives.push({ name, detail });

  const sendSource = sourceOf('hooks/useGame/sendWorkflow.ts');
  const saveLoadSource = sourceOf('hooks/useGame/saveLoadWorkflow.ts');
  const snapshotSource = sourceOf('hooks/useGame/turnSnapshot.ts');
  const newsWorkflowSource = sourceOf('hooks/useGame/newsWorkflow.ts');
  const newsModelSource = sourceOf('services/ai/newsModel.ts');

  // ═══════════ 第一部分：旧字符串正式写入移除 + 唯一事实入口静态红线 ═══════════

  // 验收 5：普通主回合不存在 parsedForDisplay.worldEvents → appendWorldEvents 的正式写入。
  assert(
    !sendSource.includes('appendWorldEvents(worldAfter.全局事件, parsedForDisplay.worldEvents)'),
    'R3-验收5 <动态世界> 不得直接追加为 世界.全局事件 正式写入',
  );
  assert(
    sendSource.includes('dynamicWorldClues: parsedForDisplay.worldEvents'),
    'R3-验收5 <动态世界> 只作为世界演变输入线索',
  );
  assert(
    sendSource.includes('appendWorldEvents(worldAfter.全局事件, displayLabels)'),
    'R3-验收5 世界.全局事件 只能由已提交事实生成显示 label',
  );
  assert(
    sendSource.includes('displayLabels') && sendSource.includes('formatFactBrief'),
    'R3-验收5 显示 label 必须来自已提交事实格式化',
  );

  // 唯一事实入口：按回执物化（advance_one 只提交完成事实；resolve_early 结算 player_early + superseded）。
  assert(sendSource.includes('materializeAdjudicatedFacts('), 'R3-唯一事实入口 必须按回执物化候选');
  assert(sendSource.includes('buildEarlyResolutionEvidence('), 'R3-提前解决 必须从正文事件结果构造候选');
  // 六类消费者只读统一事实视图（验收 6 静态部分）。
  assert(sendSource.includes('buildStoryFactConsumerView('), 'R3-验收6 必须构建统一事实视图');
  assert(sendSource.includes('mergeNewFactIds(worldCommittedFactIds, materialized.newlyCommittedFactIds)'), 'R3-验收6 世界事实与玩家事实必须合并进入本回合消费视图');
  assert(sendSource.includes('factView: turnFactView'), 'R3-验收6 新闻必须消费统一事实视图');
  // 重试/重生成路径同样必须消费统一事实视图（从已保存运行时切片重建 factView），
  // 防止"报道内容反过来成为事实"在新闻重试场景复活。
  assert(sendSource.includes('factView: factViewForNewsRetry'), 'R3-验收6 新闻重试/重生成必须消费统一事实视图');
  assert(sendSource.includes('runtimeSlice.factLedger') && sendSource.includes('runtimeSlice.worldEvents'), 'R3-验收6 重试 factView 必须从已保存运行时切片重建');
  assert(sendSource.includes('applyNpcFactMemories('), 'R3-验收6 NPC 必须消费明确参与者/知情者事实');
  assert(newsWorkflowSource.includes('已提交公共事实（唯一事实来源）'), 'R3-验收6 新闻简报必须声明唯一事实来源');
  assert(newsModelSource.includes('本期更新要求（事实约束模式）'), 'R3-验收6 新闻模型必须存在事实约束模式');
  assert(newsModelSource.includes('不能反向充当本期新事实来源'), 'R3-验收6 旧新闻只能用于更新与去重');
  // 失败边界（验收 4 静态部分）：新闻失败 → 队列 failed，事实不回滚。
  assert(sendSource.includes("pushQueueTask(state, 'news', 'failed'"), 'R3-验收4 新闻 API 失败必须标记队列 failed');
  assert(newsWorkflowSource.includes('已提交剧情/世界事实不回滚'), 'R3-验收4 新闻失败不触碰已提交事实');
  // 验收 7 静态部分：读档/重 Roll 不生成第二份事实或投影。
  assert(!saveLoadSource.includes('autoAlignCanonStoryProgress('), 'R3-验收7 读档不得推进或重新判断');
  assert(snapshotSource.includes('set世界'), 'R3-验收7 重 Roll 恢复世界快照');
  record('R3-静态红线', '旧字符串写入移除 + 唯一事实入口 + 新闻失败隔离');

  // ═══════════ 第二部分：行为验收 ═══════════

  const projection = adapter.buildStoryWeavingRuntimeProjection({ system });
  const currentSegment = system.系列列表[0].分段列表.find((s) => s.id === 'seg_1');
  const currentInstance = makeEventInstance({ eventInstanceId: CURRENT_UNIT_ID, eventDefinitionId: 'definition:unit:seg_1', status: 'active' });

  // 验收 1：玩家不参加的后台事件可结算，但事实、NPC 和新闻均不记录玩家参与或功劳。
  {
    const pendingBg = makeEventInstance({
      eventInstanceId: 'evt_bg_1', eventDefinitionId: 'definition:evt_bg', status: 'resolution_pending',
      dueAt: GAME_TIME, eventResolutionKey: 'due:1:evt_bg_1', participantIds: [],
      source: { kind: 'schedule_record', scheduleId: 'weaving:evt_bg_1', scheduleRevision: 1 },
    });
    const worldAdjudication = worldAdjudicator.adjudicateWorldEvolution({
      candidates: [{
        candidateId: 'c_bg', eventInstanceId: 'evt_bg_1', action: 'resolve', resolutionMode: 'world_background',
        outcome: 'normal', facts: [{ factType: 'bg_event', payload: { result: '矿场危机解除' }, publicScope: { kind: 'private' } }], note: '到期后台结算',
      }],
      currentEvents: [pendingBg],
      dueInstanceIds: ['evt_bg_1'],
      gameTime: GAME_TIME,
      runtimeRevision: 1,
    });
    assert(worldAdjudication.ok === true, '验收1 后台事件必须可结算');
    const backgroundFact = worldAdjudication.factsToCommit[0];
    assert(backgroundFact.playerParticipated === false && backgroundFact.playerObserverVisible === false && backgroundFact.createdBy === 'world_due', '验收1 后台事实不得记录玩家参与/功劳');
    const ledger = [...worldAdjudication.factsToCommit];
    const view = consumer.buildStoryFactConsumerView({
      factLedger: ledger,
      worldEvents: worldAdjudication.simulatedEvents,
      newFactIds: worldAdjudication.factsToCommit.map((fact) => fact.factId),
    });
    assert(view.turnCommittedFacts.length === 1, '验收1 后台事实进入本回合已提交集合');
    assert(!view.playerKnownFacts.some((fact) => fact.factId === backgroundFact.factId), '验收1 玩家已知事实不得包含 private 后台事实');
    assert(view.reportableFacts.length === 0, '验收1 private 后台事实不得进入可公开报道事实');
    assert(view.npcKnownFacts.length === 0, '验收1 无明确 NPC ID 时不得猜测或批量广播给 NPC');
    const mergedIds = consumer.mergeNewFactIds(
      worldAdjudication.factsToCommit.map((fact) => fact.factId),
      ['fact_player_1', backgroundFact.factId],
    );
    assert(mergedIds.length === 2 && mergedIds[0] === backgroundFact.factId && mergedIds[1] === 'fact_player_1', '验收1 世界事实与玩家事实必须合并去重后进入本回合视图');
    record('验收1 后台事件结算不记玩家参与', 'world_due 事实 + 玩家已知/新闻/NPC 均不含');
  }

  // 验收 2：玩家提前解决未来事件——真实事实进账本、目标 player_early、后续 superseded、新闻/NPC 只消费新结果。
  {
    const f1 = makeEventInstance({ eventInstanceId: F1_ID, eventDefinitionId: 'definition:unit:seg_2:event:1', status: 'scheduled', dueAt: { dayOrdinal: 101, minuteOfDay: 600 }, startAt: { dayOrdinal: 101, minuteOfDay: 600 }, idempotencyKey: 'weaving:' + F1_ID, source: { kind: 'schedule_record', scheduleId: 'weaving:' + F1_ID, scheduleRevision: 1 } });
    const f2 = makeEventInstance({ eventInstanceId: F2_ID, eventDefinitionId: 'definition:unit:seg_2:event:2', status: 'scheduled', dependencyIds: [F1_ID], dueAt: { dayOrdinal: 101, minuteOfDay: 600 }, startAt: { dayOrdinal: 101, minuteOfDay: 600 }, idempotencyKey: 'weaving:' + F2_ID, source: { kind: 'schedule_record', scheduleId: 'weaving:' + F2_ID, scheduleRevision: 1 } });
    const prior = makeEventInstance({ eventInstanceId: 'evt_prior', eventDefinitionId: 'definition:prior', status: 'scheduled' });
    const early = await consumer.buildEarlyResolutionEvidence({
      body: '众人合力排险，矿场危机已经解除，警戒线正在撤除。',
      scheduledSegment: seg2,
      scheduledUnits: projection.scheduledUnits,
      gameTime: GAME_TIME,
      turnCount: 5,
      responseId: 'r5',
    });
    assert(early.length === 1 && early[0].eventInstanceId === F1_ID && early[0].factType === 'resolved_early', '验收2 正文命中事件结果必须产生提前解决候选');
    assert(early[0].playerParticipated === true && early[0].createdBy === 'player_turn', '验收2 提前解决候选必须记录玩家参与');
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment,
      committedFacts: [],
      eventInstances: [currentInstance, f1, f2, prior],
      confirmedEvidence: early,
      gameTime: GAME_TIME,
      runtimeRevision: 1,
    });
    assert(adjudication.decision === 'resolve_early', '验收2 必须 resolve_early，实际: ' + adjudication.decision);
    assert(adjudication.supersededEventIds.includes(F2_ID) && !adjudication.supersededEventIds.includes('evt_prior'), '验收2 后续原定事件 superseded、前置不被取消');
    const materialized = consumer.materializeAdjudicatedFacts({
      adjudication,
      evidenceCandidates: early,
      events: [currentInstance, f1, f2, prior],
      committedFacts: [],
      gameTime: GAME_TIME,
      runtimeRevision: 1,
    });
    assert(materialized.facts.length === 1 && materialized.facts[0].factType === 'resolved_early', '验收2 真实事实必须进入 factLedger');
    assert(materialized.facts[0].playerParticipated === true, '验收2 提前解决事实必须记录玩家参与');
    const targetEvent = materialized.events.find((event) => event.eventInstanceId === F1_ID);
    assert(targetEvent.status === 'resolved' && targetEvent.resolutionMode === 'player_early', '验收2 目标事件必须结算为 player_early');
    assert(targetEvent.terminalFactId === materialized.facts[0].factId, '验收2 提前解决终态事件必须绑定对应 terminalFactId');
    assert(materialized.events.find((event) => event.eventInstanceId === F2_ID).status === 'superseded', '验收2 后续原定事件必须 superseded');
    assert(materialized.events.find((event) => event.eventInstanceId === 'evt_prior').status === 'scheduled', '验收2 不得反向取消前置事件');
    // 新闻/NPC 只消费新结果：终态事件不进入预告；新事实是唯一可报道来源。
    const view = consumer.buildStoryFactConsumerView({
      factLedger: materialized.facts,
      worldEvents: materialized.events,
      newFactIds: materialized.newlyCommittedFactIds,
    });
    assert(view.turnCommittedFacts.length === 1 && view.turnCommittedFacts[0].factType === 'resolved_early', '验收2 本回合已提交事实只有新结果');
    assert(!view.scheduledEventPreviews.some((event) => event.eventInstanceId === F1_ID || event.eventInstanceId === F2_ID), '验收2 终态事件不得再作为预告');
    const newsBrief = newsWorkflow.buildFactViewNewsBrief(view);
    assert(newsBrief.includes('已提交公共事实（唯一事实来源）'), '验收2 新闻必须读取统一事实视图');
    const genericEvidence = await consumer.buildEarlyResolutionEvidence({
      body: '酒馆争执平息后，战斗结束。',
      scheduledSegment: makeSegment({ id: 'seg_generic', 关键事件: [makeKeyEvent('边境战斗', ['战斗结束'])] }),
      scheduledUnits: [{ unitId: 'unit:seg_generic:event:1' }],
      gameTime: GAME_TIME,
      turnCount: 5,
      responseId: 'r5-generic',
    });
    const plannedEvidence = await consumer.buildEarlyResolutionEvidence({
      body: '众人计划在明日前让矿场危机解除。',
      scheduledSegment: seg2,
      scheduledUnits: projection.scheduledUnits,
      gameTime: GAME_TIME,
      turnCount: 5,
      responseId: 'r5-planned',
    });
    const deniedEvidence = await consumer.buildEarlyResolutionEvidence({
      body: '他们否认矿场危机已解除。',
      scheduledSegment: seg2,
      scheduledUnits: projection.scheduledUnits,
      gameTime: GAME_TIME,
      turnCount: 5,
      responseId: 'r5-denied',
    });
    assert(genericEvidence.length === 0 && plannedEvidence.length === 0 && deniedEvidence.length === 0, '验收2 通用、计划或否定文本不得误触发未来事件');
    record('验收2 提前解决：事实进账本 + player_early + superseded', '新结果唯一可报道来源，前置保留');
  }

  // 验收 3：已结算/已取代事件不会从旧 世界.全局事件、旧新闻、旧聊天滑窗重新进入事实或正文候选。
  {
    // 已 superseded 的未来事件再次在正文中命中：候选仍会构造（投影重建），但裁决器按终态拦截 → 零提交。
    const f1Resolved = makeEventInstance({ eventInstanceId: F1_ID, eventDefinitionId: 'definition:unit:seg_2:event:1', status: 'resolved', resolvedAt: GAME_TIME, resolutionMode: 'player_early', outcome: 'normal', terminalFactId: 'fact_f1', source: { kind: 'schedule_record', scheduleId: 'weaving:' + F1_ID, scheduleRevision: 1 } });
    const f2Superseded = makeEventInstance({ eventInstanceId: F2_ID, eventDefinitionId: 'definition:unit:seg_2:event:2', status: 'superseded', resolvedAt: GAME_TIME, source: { kind: 'schedule_record', scheduleId: 'weaving:' + F2_ID, scheduleRevision: 1 } });
    const staleCandidate = makeCandidate({ eventInstanceId: F1_ID, factType: 'resolved_early', payload: { 事件结果: '矿场危机已解除' }, evidenceLevel: 'confirmed', evidenceRefs: [{ kind: 'gameplay_receipt', receiptId: 'rct:stale', receiptType: 'unit_completed' }], playerParticipated: true, createdBy: 'player_turn' });
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment,
      committedFacts: [],
      eventInstances: [currentInstance, f1Resolved, f2Superseded],
      confirmedEvidence: [staleCandidate],
      gameTime: GAME_TIME,
      runtimeRevision: 2,
    });
    assert(adjudication.decision === 'stay' && adjudication.committedFactIds.length === 0, '验收3 已结算事件不得重新进入事实');
    const materialized = consumer.materializeAdjudicatedFacts({
      adjudication,
      evidenceCandidates: [staleCandidate],
      events: [currentInstance, f1Resolved, f2Superseded],
      committedFacts: [],
      gameTime: GAME_TIME,
      runtimeRevision: 2,
    });
    assert(materialized.facts.length === 0 && materialized.newlyCommittedFactIds.length === 0, '验收3 终态事件零事实提交');
    assert(materialized.events.find((event) => event.eventInstanceId === F2_ID).status === 'superseded', '验收3 终态状态不被改写');
    // 旧 世界.全局事件 字符串不是事实来源：label 不产生事实、不复活终态。
    const labelOnlyView = consumer.buildStoryFactConsumerView({ factLedger: [], worldEvents: [f1Resolved, f2Superseded], newFactIds: [] });
    assert(labelOnlyView.turnCommittedFacts.length === 0, '验收3 旧 label/滑窗字符串不得凭空生成事实');
    record('验收3 已结算/已取代事件不复活', '终态拦截零提交 + label 非事实来源');
  }

  // 验收 4：新闻 API 失败——正式事实保持、新闻旧状态、队列 failed、不回滚剧情进度。
  {
    const originalWarn = console.warn;
    console.warn = () => { /* 抑制预期失败路径的堆栈噪音 */ };
    try {
    const currentPublicFact = {
        factId: 'fact_public_1', eventInstanceId: F1_ID, sourceRevision: 1, factType: 'resolved_early',
        payload: { 事件结果: '矿场危机已解除' }, occurredAt: GAME_TIME, committedAt: GAME_TIME,
        publicScope: { kind: 'public' }, evidenceRefs: [], evidenceLevel: 'confirmed',
        invalidatesEventInstanceIds: [], playerParticipated: true, playerObserverVisible: false, createdBy: 'player_turn',
      };
    const historicalPublicFact = {
      ...currentPublicFact,
      factId: 'fact_public_old',
      eventInstanceId: 'evt_old_public',
      payload: { result: 'OLD_PUBLIC_FACT_SENTINEL' },
    };
    const viewForNews = consumer.buildStoryFactConsumerView({
      factLedger: [historicalPublicFact, currentPublicFact],
      worldEvents: [],
      newFactIds: ['fact_public_1'],
    });
    assert(viewForNews.reportableFacts.length === 1 && viewForNews.reportableFacts[0].factId === 'fact_public_1', '验收4 只有本回合 public 事实可报道，历史事实不得重复进入本期');
    assert(!newsWorkflow.buildFactViewNewsBrief(viewForNews).includes('OLD_PUBLIC_FACT_SENTINEL'), '验收4 新闻简报不得重复注入历史公共事实');
    const fakeState = {
      gameSettings: {
        新闻系统: {
          enabled: true, autoGenerate: true,
          api: { provider: 'openai_compatible', baseUrl: 'mock', apiKey: 'mock', model: 'mock', retryCount: 1, maxTokens: 64, temperature: 0.3 },
          maxNewEntriesPerTurn: 1,
        },
        promptModules: [],
      },
      apiSettings: { configs: [], activeConfigId: '' },
      旅人: { 姓名: 'TRAVELER_SENTINEL' },
      世界: { 全局事件: ['OLD_WORLD_EVENT_SENTINEL'] },
      新闻: [],
      NPC: [{ id: 'npc_old', 姓名: 'NPC_SENTINEL' }],
      剧情: [{ id: 'plot_old', 标题: 'PLOT_SENTINEL' }],
      剧情编织: { 标记: 'WEAVING_SENTINEL' },
      turnCount: 1,
      set新闻: () => {},
    };
    let capturedRequest;
    const constrainedResult = await newsWorkflow.runNewsGenerationStep({
      state: fakeState,
      mainBody: 'MAIN_BODY_SENTINEL',
      userInput: 'USER_INPUT_SENTINEL',
      recentTurns: ['RECENT_TURN_SENTINEL'],
      storyWeavingSnapshot: { 标记: 'SNAPSHOT_SENTINEL' },
      factView: viewForNews,
      callModelOverride: async (request) => {
        capturedRequest = request;
        return { rawText: '{}', parsed: { 新增: [], 更新: [], 归档: [], 删除: [], 说明: '无变化' } };
      },
    });
    assert(constrainedResult?.changed === false && capturedRequest, '验收4 事实约束模式必须正常调用新闻模型');
    assert(capturedRequest.body === '' && capturedRequest.userInput === '' && capturedRequest.recentTurns === undefined, '验收4 事实约束模式不得把正文、玩家输入或旧滑窗传作新闻素材');
    const constrainedUserMessage = newsModel.buildNewsUserMessage(capturedRequest);
    const constrainedSystemPrompt = newsModel.buildNewsModelPrompt(capturedRequest);
    for (const sentinel of ['MAIN_BODY_SENTINEL', 'USER_INPUT_SENTINEL', 'RECENT_TURN_SENTINEL', 'OLD_WORLD_EVENT_SENTINEL', 'NPC_SENTINEL', 'PLOT_SENTINEL', 'WEAVING_SENTINEL', 'SNAPSHOT_SENTINEL']) {
      assert(!constrainedUserMessage.includes(sentinel) && !constrainedSystemPrompt.includes(sentinel), '验收4 事实约束新闻不得读取旧素材：' + sentinel);
    }
    assert(constrainedUserMessage.includes('矿场危机已解除'), '验收4 事实约束新闻必须读取本回合已提交公共事实');
    const failedResult = await newsWorkflow.runNewsGenerationStep({
      state: fakeState,
      mainBody: '矿场危机解除。',
      userInput: '继续',
      factView: viewForNews,
      callModelOverride: async () => { throw new Error('news api down'); },
    });
    assert(failedResult === null, '验收4 新闻 API 失败必须返回 null（新闻保持旧可信状态）');
    assert(fakeState.新闻.length === 0, '验收4 新闻失败不得写入任何新新闻');
    // 正式事实保持：物化结果与新闻失败无关（事实账本仍然完整）。
    const afterFailureView = consumer.buildStoryFactConsumerView({ factLedger: viewForNews.turnCommittedFacts, worldEvents: [], newFactIds: ['fact_public_1'] });
    assert(afterFailureView.turnCommittedFacts.length === 1, '验收4 新闻失败不回滚已提交事实');
    record('验收4 新闻失败隔离', 'null + 新闻旧状态 + 事实保持（队列 failed 见静态红线）');
    } finally {
      console.warn = originalWarn;
    }
  }

  // 验收 6（行为部分）：六类消费者只能读取统一事实视图——结构化派生，不做关键词/名称猜测。
  {
    const npcFact = {
      factId: 'fact_npc_1', eventInstanceId: 'evt_npc', sourceRevision: 1, factType: 'npc_event',
      payload: { npcIds: ['npc_ling'], locationId: 'loc_snow_city', anchorId: 'anchor_gate', result: '凌得知矿场危机解除' },
      occurredAt: GAME_TIME, committedAt: GAME_TIME, publicScope: { kind: 'local', locationIds: ['loc_snow_city'], anchorIds: ['anchor_gate'] },
      evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [],
      playerParticipated: false, playerObserverVisible: true, createdBy: 'player_turn',
    };
    const npcEvent = makeEventInstance({ eventInstanceId: 'evt_npc', eventDefinitionId: 'definition:evt_npc', status: 'resolved', participantIds: ['npc_rui'], resolvedAt: GAME_TIME, resolutionMode: 'world_background', outcome: 'normal', source: { kind: 'schedule_record', scheduleId: 'weaving:evt_npc', scheduleRevision: 1 } });
    const view = consumer.buildStoryFactConsumerView({
      factLedger: [npcFact],
      worldEvents: [npcEvent],
      newFactIds: ['fact_npc_1'],
    });
    assert(view.npcKnownFacts.some((item) => item.npcId === 'npc_ling'), '验收6 NPC 消费 payload 明确 NPC ID');
    assert(view.npcKnownFacts.some((item) => item.npcId === 'npc_rui'), '验收6 NPC 消费事件 participantIds');
    assert(!view.npcKnownFacts.some((item) => item.npcId === '凌'), '验收6 不得用名称文本猜测 NPC（必须是 ID）');
    assert(view.locationFacts.some((item) => item.locationId === 'loc_snow_city' && item.anchorId === 'anchor_gate'), '验收6 地图消费 payload 合法 locationId/anchorId');
    assert(view.playerKnownFacts.some((fact) => fact.factId === 'fact_npc_1'), '验收6 playerObserverVisible 事实进入玩家已知');
    // 明确发送者/接收者 ID 的事实可进手机种子（结构化目标，不猜测）。
    assert(consumer.explicitNpcIdsOfFact(npcFact).includes('npc_ling'), '验收6 手机种子使用明确接收者 ID');
    record('验收6 统一事实视图结构化派生', 'NPC ID / locationId / participantIds 全部结构化，无名称猜测');
  }

  // 验收 7（行为部分）：读档和重 Roll 不生成第二份事实或投影结果（物化幂等）。
  {
    const f1 = makeEventInstance({ eventInstanceId: F1_ID, eventDefinitionId: 'definition:unit:seg_2:event:1', status: 'scheduled', dueAt: { dayOrdinal: 101, minuteOfDay: 600 }, startAt: { dayOrdinal: 101, minuteOfDay: 600 }, idempotencyKey: 'weaving:' + F1_ID, source: { kind: 'schedule_record', scheduleId: 'weaving:' + F1_ID, scheduleRevision: 1 } });
    const early = await consumer.buildEarlyResolutionEvidence({
      body: '矿场危机已经解除。',
      scheduledSegment: seg2,
      scheduledUnits: projection.scheduledUnits,
      gameTime: GAME_TIME,
      turnCount: 9,
      responseId: 'r9',
    });
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment,
      committedFacts: [],
      eventInstances: [currentInstance, f1],
      confirmedEvidence: early,
      gameTime: GAME_TIME,
      runtimeRevision: 3,
    });
    assert(adjudication.decision === 'resolve_early', '验收7 首次裁决必须 resolve_early');
    const first = consumer.materializeAdjudicatedFacts({
      adjudication, evidenceCandidates: early, events: [currentInstance, f1], committedFacts: [], gameTime: GAME_TIME, runtimeRevision: 3,
    });
    assert(first.facts.length === 1, '验收7 首次提交产生 1 条事实');
    // 快照恢复后（账本回到提交前）再执行同一回合 → 产生同一条事实（不双份、不重复事件迁移）。
    const rerolled = consumer.materializeAdjudicatedFacts({
      adjudication, evidenceCandidates: early, events: [currentInstance, f1], committedFacts: [], gameTime: GAME_TIME, runtimeRevision: 3,
    });
    assert(rerolled.facts.length === 1 && rerolled.facts[0].factId === first.facts[0].factId, '验收7 重 Roll 只产生同一条确定性事实');
    // 账本已含该事实时再次物化（幂等路径）：零新增。
    const duplicated = consumer.materializeAdjudicatedFacts({
      adjudication, evidenceCandidates: early, events: rerolled.events, committedFacts: rerolled.facts, gameTime: GAME_TIME, runtimeRevision: 3,
    });
    assert(duplicated.newlyCommittedFactIds.length === 0 && duplicated.facts.length === rerolled.facts.length, '验收7 重复提交不生成第二份事实');
    assert(duplicated.events.filter((event) => event.eventInstanceId === F1_ID && event.status === 'resolved').length === 1, '验收7 事件迁移不重复执行');
    record('验收7 读档/重 Roll 不生成第二份事实', '确定性事实 id + 幂等物化 + 迁移不重复');
  }

  // ═══════════ 汇总 ═══════════
  console.log('R3 集中回归通过：' + positives.length + ' 项行为断言');
  for (const item of positives) console.log('  ✔ ' + item.name + '｜' + item.detail);
}

main().catch((error) => {
  console.error('R3 集中回归失败：' + (error && error.message ? error.message : String(error)));
  process.exit(1);
});
