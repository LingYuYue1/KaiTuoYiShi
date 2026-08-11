// R2 集中行为回归（2026-08-09 计划 §6 R2）——单条集中回归，不拆分多个专项。
// 覆盖 R2 全部 9 项行为验收 + 12 步主回合流程静态红线。
// 生产模块经 esbuild 执行（storyProgressService 使用 @/ 别名，本地 bundleWithAlias 解析）；
// 全部输入为测试专用 synthetic，不进入生产资产；世界演变 API 通过 callModel 注入模拟。
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
  登场角色: ['三月七'],
  涉及地点: ['雪国'],
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

const series = {
  id: 'series_1', 标题: '测试系列', 作品名: '测试作品', 来源类型: 'custom', 来源智库条目ID: [],
  章节列表: [], 分段列表: [seg1, seg2, seg3], 每段章数: 1, 激活注入: true, 当前分段组号: 1,
  当前阶段概括: '', 核心角色摘要: [], 核心角色: [], 涉及地点索引: [], 涉及派系索引: [], createdAt: 1, updatedAt: 1,
};

const system = {
  系列列表: [series], 当前系列ID: 'series_1',
  当前进度: { 当前系列ID: 'series_1', 当前分段ID: 'seg_1', 当前分段组号: 1, 推进状态: '推进中', 已完成摘要: [], 当前待解问题: [], 切换说明: [], 历史归档: [], 最近判定理由: [], updatedAt: 1 },
};

const GAME_TIME = { dayOrdinal: 100, minuteOfDay: 600 };
const CURRENT_UNIT_ID = 'unit:seg_1';
const F1_ID = 'unit:seg_2:event:1';

async function main() {
  const adapter = await bundleTs('services/storyRuntime/storyWeavingRuntimeAdapter.ts');
  const adjudicator = await bundleTs('services/storyRuntime/storyTurnAdjudicator.ts');
  const runtimeId = await bundleTs('services/storyRuntime/id.ts');
  const worldAdjudicator = await bundleTs('services/storyRuntime/worldEvolutionAdjudicator.ts');
  const workflow = await bundleTs('hooks/useGame/worldEvolutionWorkflow.ts');
  const progressService = await bundleWithAlias('services/storyProgressService.ts');
  const positives = [];
  const record = (name, detail) => positives.push({ name, detail });

  // 局域网 HTTP 不是 secure context，浏览器可能没有 crypto.subtle；回退实现必须与 Web Crypto 字节一致。
  {
    const samples = [
      '',
      'a'.repeat(55),
      'b'.repeat(56),
      'c'.repeat(64),
      '剧情推进'.repeat(300),
      { text: '剧情推进', nested: { b: 2, a: 1 } },
    ];
    const webCryptoFingerprints = await Promise.all(samples.map((sample) => runtimeId.sha256Fingerprint(sample)));
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    let fallbackFingerprints;
    try {
      fallbackFingerprints = await Promise.all(samples.map((sample) => runtimeId.sha256Fingerprint(sample)));
    } finally {
      if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
    }
    assert(
      fallbackFingerprints.every((fingerprint, index) => fingerprint === webCryptoFingerprints[index]),
      '无 crypto.subtle 时的 SHA-256 回退必须在短文本、分块边界、长中文与对象输入上都与 Web Crypto 完全一致',
    );
    record('R2-非安全上下文 SHA-256 兼容', 'LAN HTTP 无 crypto.subtle 时仍生成相同 fingerprint');
  }

  // ═══════════ 第一部分：12 步主回合流程静态红线 ═══════════

  const sendSource = sourceOf('hooks/useGame/sendWorkflow.ts');
  const saveLoadSource = sourceOf('hooks/useGame/saveLoadWorkflow.ts');
  const snapshotSource = sourceOf('hooks/useGame/turnSnapshot.ts');
  const useGameSource = sourceOf('hooks/useGame.ts');

  // 步骤 0：回合前基线（快照 + 运行时切片只读基线）。
  assert(sendSource.includes('compactPreTurnSnapshot('), 'R2-步骤0 回合前快照必须存在');
  assert(sendSource.includes('baselineSlice = effectiveWorld.剧情运行时'), 'R2-步骤0 必须固定回合前运行时切片基线');
  // 步骤 1：从正文提取 confirmed evidence（<动态世界> 只作世界演变线索）。
  assert(sendSource.includes('buildTurnEvidence('), 'R2-步骤1 必须从正文提取证据候选');
  assert(sendSource.includes('dynamicWorldClues: parsedForDisplay.worldEvents'), 'R2-步骤1 <动态世界> 只作世界演变线索');
  // 步骤 2/3：合并投影事件 + dueEventScanner 到期扫描。
  assert(sendSource.includes('mergeProjectionEvents('), 'R2-步骤2 必须合并持久化事件与投影');
  assert(sendSource.includes('scanDueWorldEvents('), 'R2-步骤3 必须按真实游戏时间扫描到期事件');
  // 步骤 4：独立世界演变只返回候选。
  assert(sendSource.includes('runWorldEvolutionStep('), 'R2-步骤4 必须执行独立世界演变');
  // 步骤 5：候选校验只应用到内存模拟世界。
  assert(sendSource.includes('adjudicateWorldEvolution('), 'R2-步骤5 必须规范化并校验世界演变候选');
  assert(sendSource.includes('simulatedEvents'), 'R2-步骤5 必须只应用到内存 simulatedWorldState');
  // 步骤 6：焦点读取模拟世界后一次联合裁决。
  assert(sendSource.includes('adjudicateStoryTurn('), 'R2-步骤6/7 必须每回合只调用一次联合裁决');
  // 步骤 7：唯一正式提交点。
  assert(sendSource.includes('applyAdjudicatedStoryProgress('), 'R2-步骤7 必须按回执一次推进剧情编织');
  assert(!sendSource.includes('autoAlignCanonStoryProgress('), 'R2 普通回合不得再调用 autoAlignCanonStoryProgress 修改进度');
  // 步骤 8：记忆/NPC 消费同一回执。
  assert(sendSource.includes('applyStoryProgressNpcMemory('), 'R2-步骤8 记忆/NPC 链消费同一回执');
  // 步骤 9：一次更新运行时切片 + 每回合一次自动存档。
  assert(sendSource.includes('归一化剧情编织运行时切片('), 'R2-步骤9 必须一次更新运行时切片');
  assert((sendSource.match(/state\.set世界\(worldAfter\)/g) || []).length === 1, 'R2-步骤9 裁决后的 worldAfter 必须只有一个正式提交点');
  assert(sendSource.indexOf('state.set世界(worldAfter)') > sendSource.indexOf('归一化剧情编织运行时切片('), 'R2-步骤9 世界提交必须发生在运行时切片生成之后');
  assert(sendSource.includes('deferWorldCommit: true'), 'R2-步骤9 变量模型不得提前提交世界状态');
  assert((sendSource.match(/await saveGame\(/g) || []).length === 1, 'R2-步骤9 自动存档每回合只执行一次');
  assert(!sendSource.includes("saveSetting('storyWeavingSystem'"), 'R2 运行时推进不得写入 storyWeavingSystem 设置形成第二 owner');
  // 步骤 10：读档只恢复保存状态，不推进剧情。
  assert(!saveLoadSource.includes('autoAlignCanonStoryProgress('), 'R2-步骤10 读档不得推进或重新判断剧情');
  assert(!saveLoadSource.includes("saveSetting('storyWeavingSystem'"), 'R2 读档不得把运行进度回写设置存储');
  assert(saveLoadSource.includes('剧情运行时') === false || saveLoadSource.includes('只恢复保存状态'), 'R2-步骤10 读档只恢复保存状态');
  // 步骤 11：重 Roll 恢复回合前快照（世界含运行时切片）。
  assert(snapshotSource.includes('set世界'), 'R2-步骤11 重 Roll 必须恢复世界快照（含运行时切片）');
  assert(!useGameSource.includes("await saveSetting('storyWeavingSystem'"), 'R2 重 Roll 不得把恢复后的运行进度回写设置存储');
  record('R2-12步流程静态红线', 'sendWorkflow/saveLoadWorkflow/turnSnapshot 逐条确认');

  // autoAlignCanonStoryProgress 已只读化（普通回合不再修改剧情进度）。
  const readOnlyResult = progressService.autoAlignCanonStoryProgress({ storyWeaving: system, turnCount: 5, body: '玩家已抵达雪国首府', userInput: '继续' });
  assert(readOnlyResult.changed === false && readOnlyResult.progressed === false, 'autoAlignCanonStoryProgress 必须只读（不修改进度）');
  const readOnlySystem = readOnlyResult.system;
  assert(readOnlySystem.系列列表[0].分段列表.find((s) => s.id === 'seg_1').运行状态 === '当前', 'autoAlign 只读后当前段运行状态不得被修改');
  record('R2-autoAlignCanonStoryProgress 只读化', 'changed=false + 运行状态不变');

  // ═══════════ 第二部分：行为验收 ═══════════

  // 验收 1：明确完成当前目标后，下一回合注入下一单元。
  {
    const projection = adapter.buildStoryWeavingRuntimeProjection({ system });
    const currentSegment = system.系列列表[0].分段列表.find((s) => s.id === 'seg_1');
    const body = '风雪渐歇，玩家终于抵达雪国首府城门';
    const evidence = await workflow.buildTurnEvidence({ body, currentSegment, projection, gameTime: GAME_TIME, turnCount: 2, responseId: 'assistant:test:2' });
    assert(evidence.confirmedEvidence.length === 1, '验收1 结束状态命中必须产生 1 条 confirmed evidence');
    const narrativeRef = evidence.confirmedEvidence[0].evidenceRefs[0];
    assert(narrativeRef.responseId === 'assistant:test:2', '验收1 narrative_span 必须绑定真实回复 ID');
    assert(narrativeRef.startOffset === body.indexOf('抵达雪国首府') && body.slice(narrativeRef.startOffset, narrativeRef.endOffset) === '抵达雪国首府', '验收1 narrative_span 必须使用正文真实 offsets');
    assert(/^sha256:[0-9a-f]{64}$/.test(narrativeRef.bodyFingerprint) && /^sha256:[0-9a-f]{64}$/.test(narrativeRef.textFingerprint), '验收1 narrative_span 必须使用真实 SHA-256 fingerprint');
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment,
      committedFacts: [],
      eventInstances: projection.scheduledEventInstances,
      confirmedEvidence: evidence.confirmedEvidence,
      gameTime: GAME_TIME,
      runtimeRevision: 0,
    });
    assert(adjudication.decision === 'advance_one', '验收1 明确完成必须 advance_one，实际: ' + adjudication.decision);
    const advanced = progressService.applyAdjudicatedStoryProgress({
      storyWeaving: system,
      turnCount: 2,
      decision: adjudication.decision,
      completedUnitIds: adjudication.completedUnitIds,
      reasons: adjudication.reasons,
    });
    assert(advanced.changed === true, '验收1 推进必须改变剧情编织');
    const nextSegment = advanced.system.系列列表[0].分段列表.find((s) => s.id === 'seg_2');
    assert(nextSegment.运行状态 === '当前', '验收1 下一分段必须进入「当前」');
    assert(advanced.system.系列列表[0].分段列表.find((s) => s.id === 'seg_1').运行状态 === '已经历', '验收1 当前分段必须归档为「已经历」');
    // 下一回合注入下一单元：重新投影。
    const nextProjection = adapter.buildStoryWeavingRuntimeProjection({ system: advanced.system });
    assert(nextProjection.currentUnit.unitId === 'unit:seg_2', '验收1 下一回合注入的必须是下一单元，实际: ' + nextProjection.currentUnit.unitId);
    record('验收1 明确完成推进一格，下一回合注入下一单元', 'seg_1 已经历 -> seg_2 当前 -> unit:seg_2');
  }

  // 验收 2：未完成时，连续提及和普通动作词不会推进。
  {
    const projection = adapter.buildStoryWeavingRuntimeProjection({ system });
    const currentSegment = system.系列列表[0].分段列表.find((s) => s.id === 'seg_1');
    const body = '玩家继续调查，三月七在前方引路，一行人抵达雪国的集市。';
    const evidence = await workflow.buildTurnEvidence({ body, currentSegment, projection, gameTime: GAME_TIME, turnCount: 3, responseId: 'assistant:test:3' });
    assert(evidence.confirmedEvidence.length === 0, '验收2 动作词/提及不得产生完成证据');
    assert(evidence.mentioned.length > 0, '验收2 提及必须被识别（不推进）');
    const negated = await workflow.buildTurnEvidence({ body: '玩家还没有抵达雪国首府', currentSegment, projection, gameTime: GAME_TIME, turnCount: 3, responseId: 'assistant:test:3-negated' });
    assert(negated.confirmedEvidence.length === 0, '验收2 否定语境不得伪造完成证据');
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment,
      committedFacts: [],
      eventInstances: projection.scheduledEventInstances,
      confirmedEvidence: evidence.confirmedEvidence,
      gameTime: GAME_TIME,
      runtimeRevision: 1,
    });
    assert(adjudication.decision === 'stay', '验收2 未完成时连续提及必须 stay，实际: ' + adjudication.decision);
    const advanced = progressService.applyAdjudicatedStoryProgress({
      storyWeaving: system, turnCount: 3, decision: adjudication.decision, completedUnitIds: [], reasons: adjudication.reasons,
    });
    assert(advanced.changed === false, '验收2 不得推进剧情编织');
    record('验收2 连续提及/动作词不推进', 'stay + changed=false');
  }

  // 验收 2b：手动校准只是合法游标；若某回合漏掉当前段结束语，后续正文已明确进入后段时应恢复推进。
  // 恢复仍只完成当前段，一回合最多前进一格，不能直接跳到正文所处的更远分段。
  {
    const manualCurrent = makeSegment({
      ...seg2,
      id: 'seg_manual_2',
      组号: 2,
      标题: '空间站收束',
      运行状态: '当前',
      本段结束状态: ['空间站危机已经解除'],
      涉及地点: ['黑塔空间站'],
    });
    const nextSegment = makeSegment({
      ...seg3,
      id: 'seg_manual_3',
      组号: 3,
      标题: '列车启程',
      运行状态: '未开始',
      开局已成立事实: ['列车组已经离开空间站'],
      前段延续事实: ['空间站危机已经解除'],
      本段结束状态: ['列车抵达下一颗星球'],
      涉及地点: ['星穹列车'],
    });
    const manualSystem = {
      ...system,
      系列列表: [{
        ...series,
        当前分段组号: 2,
        分段列表: [{ ...seg1, 运行状态: '已经历' }, manualCurrent, nextSegment],
      }],
      当前进度: {
        ...system.当前进度,
        当前分段ID: manualCurrent.id,
        当前分段组号: manualCurrent.组号,
        最近判定理由: ['手动修正剧情编织进度'],
      },
    };
    const projection = adapter.buildStoryWeavingRuntimeProjection({ system: manualSystem });
    const body = '舷窗外，黑塔空间站已经远去。开拓者回到星穹列车客房，列车正驶向下一站。';
    const evidence = await workflow.buildTurnEvidence({
      body,
      currentSegment: manualCurrent,
      futureSegments: [nextSegment],
      currentLocation: '星穹列车·客房',
      projection,
      gameTime: GAME_TIME,
      turnCount: 4,
      responseId: 'assistant:test:manual-progress-recovery',
    });
    assert(evidence.confirmedEvidence.length === 1, '验收2b 后续阶段已明确成立时必须恢复生成当前段完成证据');
    assert(evidence.confirmedEvidence[0].eventInstanceId === 'unit:' + manualCurrent.id, '验收2b 恢复证据只能结算当前段');
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment: manualCurrent,
      committedFacts: [],
      eventInstances: projection.scheduledEventInstances,
      confirmedEvidence: evidence.confirmedEvidence,
      gameTime: GAME_TIME,
      runtimeRevision: 2,
    });
    assert(adjudication.decision === 'advance_one', '验收2b 手动校准后仍应正常 advance_one，实际 ' + adjudication.decision);
    const advanced = progressService.applyAdjudicatedStoryProgress({
      storyWeaving: manualSystem,
      turnCount: 4,
      decision: adjudication.decision,
      completedUnitIds: adjudication.completedUnitIds,
      reasons: adjudication.reasons,
    });
    assert(advanced.system.当前进度.当前分段ID === nextSegment.id, '验收2b 只能从第2段推进到第3段，不得跨段跳跃');

    const futureMentionOnly = await workflow.buildTurnEvidence({
      body: '三月七说以后可以回星穹列车休息，大家先处理眼前的空间站危机。',
      currentSegment: manualCurrent,
      futureSegments: [nextSegment],
      currentLocation: '黑塔空间站·主控舱段',
      projection,
      gameTime: GAME_TIME,
      turnCount: 5,
      responseId: 'assistant:test:future-mention-only',
    });
    assert(futureMentionOnly.confirmedEvidence.length === 0, '验收2b 仅提到未来地点、但结构化世界尚未进入后段时不得推进');
    const recalledFutureState = await workflow.buildTurnEvidence({
      body: '三月七回忆起旧故事里列车组已经离开空间站的场面。',
      currentSegment: manualCurrent,
      futureSegments: [nextSegment],
      currentLocation: '黑塔空间站·主控舱段',
      projection,
      gameTime: GAME_TIME,
      turnCount: 6,
      responseId: 'assistant:test:recalled-future-state',
    });
    assert(recalledFutureState.confirmedEvidence.length === 0, '验收2b 回忆/传闻中的后段状态不得当作当前世界已成立');
    record('验收2b 手动校准后可从漏判恢复', '后段已成立 -> 当前段 advance_one；未来提及 -> stay');
  }

  // 真实资产复现：黑塔主线曾手动校到第 2 段，正文和结构化地点已经进入列车阶段。
  {
    const canon = JSON.parse(sourceOf('data/storyWeavingCanonDecomposed.json'));
    const hertaSeries = canon.系列列表.find((item) => item.id === 'story_canon_zhiku_herta_station_chapter1');
    const hertaCurrent = hertaSeries?.分段列表.find((segment) => segment.组号 === 2);
    const hertaNext = hertaSeries?.分段列表.find((segment) => segment.组号 === 3);
    assert(hertaSeries && hertaCurrent && hertaNext, '真实资产验收必须找到黑塔主线第 2/3 段');
    const hertaSystem = {
      ...canon,
      当前系列ID: hertaSeries.id,
      系列列表: canon.系列列表.map((item) => item.id !== hertaSeries.id
        ? item
        : {
            ...item,
            当前分段组号: 2,
            分段列表: item.分段列表.map((segment) => ({
              ...segment,
              运行状态: segment.组号 < 2 ? '已经历' : segment.组号 === 2 ? '当前' : '未开始',
            })),
          }),
      当前进度: {
        ...canon.当前进度,
        当前系列ID: hertaSeries.id,
        当前分段ID: hertaCurrent.id,
        当前分段组号: 2,
        最近判定理由: ['手动修正剧情编织进度'],
      },
    };
    const projection = adapter.buildStoryWeavingRuntimeProjection({ system: hertaSystem });
    const body = '列车已经离开黑塔空间站。开拓者回到星穹列车客房，列车正在驶向雅利洛-VI。';
    const evidence = await workflow.buildTurnEvidence({
      body,
      currentSegment: hertaCurrent,
      futureSegments: hertaSeries.分段列表.filter((segment) => segment.组号 > hertaCurrent.组号),
      currentLocation: '星穹列车·客房',
      projection,
      gameTime: GAME_TIME,
      turnCount: 41,
      responseId: 'assistant:test:herta-real-save',
    });
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment: hertaCurrent,
      committedFacts: [],
      eventInstances: projection.scheduledEventInstances,
      confirmedEvidence: evidence.confirmedEvidence,
      gameTime: GAME_TIME,
      runtimeRevision: 8,
    });
    const advanced = progressService.applyAdjudicatedStoryProgress({
      storyWeaving: hertaSystem,
      turnCount: 41,
      decision: adjudication.decision,
      completedUnitIds: adjudication.completedUnitIds,
      reasons: adjudication.reasons,
    });
    assert(adjudication.decision === 'advance_one', '真实资产验收：列车阶段已成立时第 2 段必须恢复推进');
    assert(advanced.system.当前进度.当前分段ID === hertaNext.id, '真实资产验收：本回合只能推进到真实第 3 段');
    record('真实黑塔旧游标恢复推进', '第2段 + 列车客房/离站正文 -> 第3段，不跳到第6段');
  }

  // 验收 3：提到未来分段不会把当前段标为已跳过。
  {
    const projection = adapter.buildStoryWeavingRuntimeProjection({ system });
    const currentSegment = system.系列列表[0].分段列表.find((s) => s.id === 'seg_1');
    const evidence = await workflow.buildTurnEvidence({ body: '酒馆里有人低声议论着首领决战的消息', currentSegment, projection, gameTime: GAME_TIME, turnCount: 4, responseId: 'assistant:test:4' });
    assert(evidence.confirmedEvidence.length === 0, '验收3 提及未来事件不得产生完成证据');
    assert(evidence.mentioned.some((term) => term === '首领决战'), '验收3 未来事件标题必须进入提及');
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment,
      committedFacts: [],
      eventInstances: projection.scheduledEventInstances,
      confirmedEvidence: evidence.confirmedEvidence,
      gameTime: GAME_TIME,
      runtimeRevision: 2,
    });
    assert(adjudication.decision === 'stay', '验收3 提及未来内容必须 stay，实际: ' + adjudication.decision);
    const advanced = progressService.applyAdjudicatedStoryProgress({
      storyWeaving: system, turnCount: 4, decision: adjudication.decision, completedUnitIds: [], reasons: adjudication.reasons,
    });
    const statuses = advanced.system.系列列表[0].分段列表.map((s) => `${s.id}:${s.运行状态}`);
    assert(!statuses.some((item) => item.includes('已跳过')), '验收3 未来段提及不得把当前段标为已跳过: ' + statuses.join('、'));
    record('验收3 提到未来分段不标已跳过', 'stay + 无已跳过状态');
  }

  // 验收 4：到期世界事件先进入模拟结果，剧情读取更新后的模拟世界。
  {
    const projection = adapter.buildStoryWeavingRuntimeProjection({ system });
    const currentSegment = system.系列列表[0].分段列表.find((s) => s.id === 'seg_1');
    const timelineAnchors = Object.fromEntries(projection.scheduledUnits.map((unit) => [unit.unitId, unit.timelineAnchor]));
    const merged = workflow.mergeProjectionEvents([], projection.scheduledEventInstances, GAME_TIME, timelineAnchors);
    assert(merged.some((event) => event.eventInstanceId === F1_ID && event.dueAt.dayOrdinal === 101), '验收4 投影事件必须获得真实游戏时钟 dueAt（下一游戏日）');
    assert(merged.find((event) => event.eventInstanceId === F1_ID).dueAt.minuteOfDay === 12 * 60, '验收4 投影事件必须使用对应时间线锚点，而不是忽略锚点沿用当前时刻');
    const later = { dayOrdinal: 102, minuteOfDay: 600 };
    const scanned = workflow.scanDueWorldEvents(merged, 3, later);
    assert(scanned.dueInstanceIds.length === 2, '验收4 到期扫描必须领取下一分段事件');
    const pending = scanned.events.find((event) => event.eventInstanceId === F1_ID);
    assert(pending.status === 'resolution_pending', '验收4 到期事件必须进入待结算');
    const evolution = await workflow.runWorldEvolutionStep({
      config: { provider: 'openai_compatible', baseUrl: 'mock', apiKey: 'mock', model: 'mock', maxTokens: 64, temperature: 0.2, retryCount: 0 },
      events: scanned.events,
      dueInstanceIds: scanned.dueInstanceIds,
      dynamicWorldClues: ['矿场传来震动'],
      legacyLabels: ['星核爆发'],
      gameTime: later,
      runtimeRevision: 3,
      callModel: async () => JSON.stringify({ candidates: [{ eventInstanceId: F1_ID, action: 'resolve', resolutionMode: 'world_background', outcome: 'normal', facts: [{ factType: '矿场危机已解除', payload: { result: '矿场危机解除' } }], note: '到期后台结算' }] }),
    });
    assert(evolution.ok && evolution.candidates.length === 1, '验收4 世界演变必须返回候选');
    const worldAdjudication = worldAdjudicator.adjudicateWorldEvolution({
      candidates: evolution.candidates,
      currentEvents: scanned.events,
      dueInstanceIds: scanned.dueInstanceIds,
      gameTime: later,
      runtimeRevision: 3,
    });
    assert(worldAdjudication.ok === true, '验收4 候选校验必须成功');
    const simulatedEvents = worldAdjudication.simulatedEvents;
    const resolvedEvent = simulatedEvents.find((event) => event.eventInstanceId === F1_ID);
    assert(resolvedEvent.status === 'resolved' && resolvedEvent.resolutionMode === 'world_background', '验收4 模拟世界事件必须后台结算');
    assert(worldAdjudication.factsToCommit.length === 1, '验收4 必须产生 1 条待提交世界事实');
    // 剧情裁决读取的是更新后的模拟世界（事件已 resolved → 终态不可复活）。
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment,
      committedFacts: [],
      eventInstances: simulatedEvents,
      confirmedEvidence: [{
        candidateId: 'cand_legacy', eventInstanceId: F1_ID, factType: 'unit_completed', payload: {},
        occurredAt: later, publicScope: { kind: 'private' }, evidenceRefs: [{ kind: 'gameplay_receipt', receiptId: 'rct:late', receiptType: 'unit_completed' }],
        evidenceLevel: 'confirmed', playerParticipated: false, playerObserverVisible: false, createdBy: 'world_due',
      }],
      gameTime: later,
      runtimeRevision: 3,
    });
    assert(adjudication.decision === 'stay' && adjudication.committedFactIds.length === 0, '验收4 裁决读取模拟世界后不得把已结算事件当作新事件');
    const atomicReject = worldAdjudicator.adjudicateWorldEvolution({
      candidates: [
        { candidateId: 'valid-first', eventInstanceId: F1_ID, action: 'resolve', facts: [] },
        { candidateId: 'invalid-second', eventInstanceId: 'missing-event', action: 'transition', toStatus: 'resolved', facts: [] },
      ],
      currentEvents: scanned.events,
      dueInstanceIds: scanned.dueInstanceIds,
      gameTime: later,
      runtimeRevision: 3,
    });
    assert(atomicReject.ok === false, '验收4 任一世界候选非法时必须整批拒绝，不能保留前面候选的部分模拟结果');
    const malformedFactReject = worldAdjudicator.adjudicateWorldEvolution({
      candidates: [{ candidateId: 'bad-fact', eventInstanceId: F1_ID, action: 'resolve', facts: [null] }],
      currentEvents: scanned.events,
      dueInstanceIds: scanned.dueInstanceIds,
      gameTime: later,
      runtimeRevision: 3,
    });
    assert(malformedFactReject.ok === false, '验收4 候选中的非法事实不得被静默过滤，必须整批拒绝');
    const cancelled = worldAdjudicator.adjudicateWorldEvolution({
      candidates: [{ candidateId: 'cancel-scheduled', eventInstanceId: F1_ID, action: 'transition', toStatus: 'cancelled', facts: [] }],
      currentEvents: merged,
      dueInstanceIds: [],
      gameTime: later,
      runtimeRevision: 3,
    });
    assert(cancelled.ok === true && cancelled.simulatedEvents.find((event) => event.eventInstanceId === F1_ID).status === 'cancelled', '验收4 合法的 scheduled -> cancelled 迁移必须保留，不能在规范化阶段误删终态目标');
    record('验收4 到期事件先模拟，剧情读取更新后的模拟世界', 'resolution_pending -> resolved(world_background) + 裁决读模拟世界');
  }

  // 验收 5：后台事件不记录玩家参与，也不移动玩家焦点。
  {
    const fact = worldAdjudicator.worldFactIdentity('evt_bg_2', 5, 'bg_event', {});
    assert(typeof fact === 'string' && fact.length > 0, '验收5 世界事实身份必须确定性生成');
    const adjudication = worldAdjudicator.adjudicateWorldEvolution({
      candidates: [{
        candidateId: 'c1', eventInstanceId: 'evt_bg_2', action: 'create_instance', facts: [{ factType: 'bg_event', payload: {} }], note: '后台新事件',
      }],
      currentEvents: [],
      dueInstanceIds: [],
      gameTime: GAME_TIME,
      runtimeRevision: 5,
    });
    assert(adjudication.ok === true, '验收5 后台新事件候选必须可应用');
    const factLedger = adjudication.factsToCommit.length ? adjudication.factsToCommit : [];
    assert(factLedger.every((f) => f.playerParticipated === false && f.playerObserverVisible === false && f.createdBy === 'world_due'), '验收5 后台事件不得记录玩家参与/知情/功劳');
    // world_due 候选不进入玩家 resolve_early（焦点不动）。
    const projection = adapter.buildStoryWeavingRuntimeProjection({ system });
    const currentSegment = system.系列列表[0].分段列表.find((s) => s.id === 'seg_1');
    const due = { dayOrdinal: 101, minuteOfDay: 600 };
    const bgInstance = makeEventInstance({ eventInstanceId: 'evt_bg_2', eventDefinitionId: 'definition:evt_bg_2', status: 'resolution_pending', dueAt: due, eventResolutionKey: 'due:5:evt_bg_2' });
    const turnAdjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment,
      committedFacts: [],
      eventInstances: [bgInstance],
      confirmedEvidence: [{
        candidateId: 'cand_bg', eventInstanceId: 'evt_bg_2', factType: 'unit_completed', payload: {},
        occurredAt: due, publicScope: { kind: 'private' }, evidenceRefs: [{ kind: 'gameplay_receipt', receiptId: 'rct:bg', receiptType: 'unit_completed' }],
        evidenceLevel: 'confirmed', playerParticipated: false, playerObserverVisible: false, createdBy: 'world_due',
      }],
      gameTime: due,
      runtimeRevision: 5,
    });
    assert(turnAdjudication.decision === 'stay' && turnAdjudication.currentUnitId === CURRENT_UNIT_ID, '验收5 后台事件不得移动玩家焦点或伪造玩家参与');
    record('验收5 后台事件不记玩家参与、不移动焦点', 'world_due 事实边界 + stay');
  }

  // 验收 6：世界演变 API 失败时正式世界不变，主剧情仍可继续并记录未结算原因。
  {
    const events = [makeEventInstance({ eventInstanceId: 'evt_bg_3', eventDefinitionId: 'definition:evt_bg_3', status: 'resolution_pending', dueAt: GAME_TIME, eventResolutionKey: 'due:6:evt_bg_3' })];
    const failed = await workflow.runWorldEvolutionStep({
      config: { provider: 'openai_compatible', baseUrl: 'mock', apiKey: 'mock', model: 'mock', maxTokens: 64, temperature: 0.2, retryCount: 0 },
      events,
      dueInstanceIds: ['evt_bg_3'],
      dynamicWorldClues: ['裂界扩张'],
      legacyLabels: [],
      gameTime: GAME_TIME,
      runtimeRevision: 6,
      callModel: async () => { throw new Error('world evolution api down'); },
    });
    assert(failed.ok === false && typeof failed.failureReason === 'string' && failed.failureReason.includes('失败'), '验收6 API 失败必须返回失败原因');
    assert(failed.candidates.length === 0, '验收6 失败不得产生候选');
    // 正式世界不变：事件列表与输入一致（无任何状态迁移）。
    const after = events;
    assert(after.every((event) => event.status === 'resolution_pending'), '验收6 API 失败时正式世界保持不变，到期事件保持待结算');
    // 非法候选 JSON 也整体拒绝。
    const invalidJson = await workflow.runWorldEvolutionStep({
      config: { provider: 'openai_compatible', baseUrl: 'mock', apiKey: 'mock', model: 'mock', maxTokens: 64, temperature: 0.2, retryCount: 0 },
      events,
      dueInstanceIds: ['evt_bg_3'],
      dynamicWorldClues: ['裂界扩张'],
      legacyLabels: [],
      gameTime: GAME_TIME,
      runtimeRevision: 6,
      callModel: async () => 'not a json at all',
    });
    assert(invalidJson.ok === false && invalidJson.failureReason.includes('无法解析'), '验收6 非法候选 JSON 必须整体拒绝');
    // 主剧情仍可继续：无证据裁决 stay，并记录未结算原因（切片 worldEvolutionStatus=failed）。
    const projection = adapter.buildStoryWeavingRuntimeProjection({ system });
    const currentSegment = system.系列列表[0].分段列表.find((s) => s.id === 'seg_1');
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment,
      committedFacts: [],
      eventInstances: events,
      confirmedEvidence: [],
      gameTime: GAME_TIME,
      runtimeRevision: 6,
    });
    assert(adjudication.decision === 'stay', '验收6 世界演变失败后主剧情仍可继续（stay）');
    record('验收6 世界演变失败正式世界不变', 'failed + 原因 + 到期事件保持待结算 + 主剧情继续');
  }

  // 验收 7：读档不会推进剧情或重新执行世界事件。
  {
    // 读档路径已移除 autoAlign 推进（静态红线）；行为侧：读档只归一化恢复，运行状态不变。
    const restored = progressService.autoAlignCanonStoryProgress({ storyWeaving: system, turnCount: 99, body: '任意正文', userInput: '任意输入' });
    assert(restored.system.系列列表[0].分段列表.every((s) => s.运行状态 === (s.id === 'seg_1' ? '当前' : '未开始')), '验收7 恢复路径不得改变任何分段运行状态');
    assert(!saveLoadSource.includes('autoAlignCanonStoryProgress'), '验收7 saveLoadWorkflow 不得调用自动推进');
    record('验收7 读档不推进、不重执行世界事件', 'applySaveToState 无 autoAlign 调用 + 状态原样');
  }

  // 验收 8：重 Roll 不生成双份事实、归档、世界事件、新闻或 NPC 记忆。
  {
    // 重 Roll 恢复回合前快照（世界含运行时切片）：turnSnapshot 必须恢复 世界。
    assert(snapshotSource.includes('set世界(归一化世界状态(snapshot.世界'), '验收8 重 Roll 必须恢复世界快照（含切片）');
    // 切片快照恢复后，同一完成证据再次提交不得产生第二份事实（跨 revision 去重）。
    const projection = adapter.buildStoryWeavingRuntimeProjection({ system });
    const currentSegment = system.系列列表[0].分段列表.find((s) => s.id === 'seg_1');
    const candidate = {
      candidateId: 'cand_reroll', eventInstanceId: CURRENT_UNIT_ID, factType: 'unit_completed', payload: {},
      occurredAt: GAME_TIME, publicScope: { kind: 'private' }, evidenceRefs: [{ kind: 'gameplay_receipt', receiptId: 'rct:reroll', receiptType: 'unit_completed' }],
      evidenceLevel: 'confirmed', playerParticipated: true, playerObserverVisible: false, createdBy: 'player_turn',
    };
    const committedFact = {
      factId: 'fact_reroll', eventInstanceId: CURRENT_UNIT_ID, sourceRevision: 7, factType: 'unit_completed', payload: {},
      occurredAt: GAME_TIME, committedAt: GAME_TIME, publicScope: { kind: 'private' }, evidenceRefs: [],
      evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: true, playerObserverVisible: false, createdBy: 'player_turn',
    };
    // 第一次提交（快照恢复前的旧分支已提交过）→ 重 Roll 后快照恢复 → 重新裁决同一证据 → 不二次结算。
    const adjudication = adjudicator.adjudicateStoryTurn({
      currentFocus: projection.currentFocus,
      currentSegment,
      committedFacts: [committedFact],
      eventInstances: projection.scheduledEventInstances,
      confirmedEvidence: [candidate],
      gameTime: GAME_TIME,
      runtimeRevision: 7,
    });
    assert(adjudication.decision === 'stay' && adjudication.committedFactIds.length === 0, '验收8 重 Roll 后同一证据不得生成第二份事实');
    // 世界事实去重同样生效。
    assert(worldAdjudicator.isWorldFactDuplicate(committedFact, [committedFact]) === true, '验收8 世界事实重复提交必须被识别');
    record('验收8 重 Roll 不生成双份', '快照恢复 + 事实跨 revision 去重');
  }

  // 验收 9：保存失败保留上一可信状态。
  {
    // 自动存档每回合只执行一次且失败走 catch（旧可信存档保留）——静态红线。
    assert((sendSource.match(/await saveGame\(/g) || []).length === 1, '验收9 自动存档每回合只执行一次');
    assert(sendSource.includes('if (!turnStateCommitted && rollbackSnapshotOnAbort)') && (sendSource.includes('restorePreTurnSnapshot(state, rollbackSnapshotOnAbort)') || sendSource.includes('restorePreTurnSnapshotPersisted(state, rollbackSnapshotOnAbort, updateSetting)')), '验收9 非 Abort 保存失败必须恢复回合前快照（含持久化智库运行态）');
    assert(sendSource.indexOf('turnStateCommitted = true') > sendSource.indexOf('await saveGame(saveData)'), '验收9 只有自动存档成功后才能把本回合标记为可信提交');
    assert(sendSource.includes('const worldForAutoSave = worldAfter'), '验收9 自动存档必须使用已合并变量覆盖与最新运行时切片的唯一 worldAfter');
    // 切片随普通存档往返（buildSavePayload 世界 override 携带切片）：归一化往返不丢数据。
    const slice = {
      schemaVersion: 1, runtimeBranchId: 'branch:test', runtimeRevision: 7,
      focus: { focusId: 'focus:series_1:seg_1', trackId: 'series_1', unitId: CURRENT_UNIT_ID, status: 'active', reasonCodes: [], enteredAtRevision: 0 },
      worldEvents: [makeEventInstance({ eventInstanceId: 'evt_save', eventDefinitionId: 'definition:evt_save', status: 'resolution_pending', eventResolutionKey: 'due:9:evt_save' })],
      factLedger: [committedFactFixture()],
      lastDecision: 'stay', lastReasons: ['存档往返'],
      worldEvolutionStatus: 'settled', updatedAt: 1,
    };
    const worldModule = await bundleTs('models/world.ts');
    const normalized = worldModule.归一化剧情编织运行时切片(slice);
    assert(normalized.runtimeRevision === 7 && normalized.worldEvents.length === 1 && normalized.factLedger.length === 1, '验收9 切片存档往返必须完整保留');
    assert(normalized.worldEvents[0].status === 'resolution_pending' && normalized.worldEvents[0].eventResolutionKey === 'due:9:evt_save', '验收9 切片待结算状态必须保留');
    assert(normalized.focus.unitId === CURRENT_UNIT_ID && normalized.lastDecision === 'stay', '验收9 切片焦点与回执必须保留');
    record('验收9 保存失败保留上一可信状态 + 切片往返', '一次自动存档 + 失败回滚 + 切片归一化往返完整');
  }

  // ═══════════ 汇总 ═══════════
  console.log('R2 集中回归通过：' + positives.length + ' 项行为断言');
  for (const item of positives) console.log('  ✔ ' + item.name + '｜' + item.detail);
}

function committedFactFixture() {
  return {
    factId: 'fact_save_1', eventInstanceId: 'evt_save', sourceRevision: 7, factType: 'bg_event', payload: {},
    occurredAt: GAME_TIME, committedAt: GAME_TIME, publicScope: { kind: 'private' }, evidenceRefs: [],
    evidenceLevel: 'supported', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'world_due',
  };
}

main().catch((error) => {
  console.error('R2 集中回归失败：' + (error && error.message ? error.message : String(error)));
  process.exit(1);
});
