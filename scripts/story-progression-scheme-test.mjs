// 剧情推进方案 A/B/C 回归：真实空间站分段数据 + 生产函数全链路
// 覆盖：
//   B  = 完成要素池匹配（自然表达正文 → 完成证据）
//   A  = AI 申报解析 + 申报背书 + 跳段候选 + jump_to 裁决 + 跳段提交（中间段已跳过）
//   C  = 剧情推进判定开关默认关闭（设置归一化）
// 用法：node scripts/story-progression-scheme-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `story-progression-${process.pid}-${Date.now()}.mjs`);

await build({
  stdin: {
    contents: [
      "export * from './hooks/useGame/worldEvolutionWorkflow';",
      "export * from './services/storyRuntime/storyTurnAdjudicator';",
      "export * from './services/storyProgressService';",
      "export * from './services/ai/responseParser';",
      "export * from './models/settings';",
      "export * from './services/storyWeaving';",
    ].join('\n'),
    resolveDir: root,
    sourcefile: 'story-progression-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: bundlePath,
  logLevel: 'silent',
  tsconfig: path.join(root, 'tsconfig.json'),
});

const api = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
const canon = JSON.parse(fs.readFileSync(path.join(root, 'public/data/story-weaving-canon/story_canon_zhiku_herta_station_chapter1.json'), 'utf8'));
const seg2 = canon.分段列表[1];
const gameTime = { dayOrdinal: 3, minuteOfDay: 480 };
const projection = { currentFocus: { unitId: 'unit:' + seg2.id }, scheduledUnits: [], activeUnits: [] };
const futureSegments = canon.分段列表.slice(2);

// ---- B：完成要素池（自然表达正文 → 完成证据） ----
const naturalBody = '三月七拉着我一路小跑进了主控舱段，阿兰靠在监控室门口朝我们挥手。他把一根棒球棍塞进我手里，说是防卫科的老规矩。艾丝妲站在控制台前，说电梯权限已经重新封锁了，让我先熟悉一下空间站的路线。丹恒跟在最后面，没说话。';
const evB = await api.buildTurnEvidence({ body: naturalBody, currentSegment: seg2, futureSegments, currentLocation: '黑塔空间站·主控舱段', projection, gameTime, turnCount: 10, responseId: 'r10' });
assert(evB.confirmedEvidence.length > 0, '方案B：自然表达正文应生成完成证据（现状逐字匹配 0 命中）');
console.log('✓ B 完成要素池：自然表达正文 → 完成证据');

const unrelatedBody = '你沿着走廊走到餐厅，要了一份便当，和邻座的科员聊了几句空间站的日常。';
const evUnrelated = await api.buildTurnEvidence({ body: unrelatedBody, currentSegment: seg2, futureSegments, currentLocation: '黑塔空间站·餐厅', projection, gameTime, turnCount: 11, responseId: 'r11' });
assert(evUnrelated.confirmedEvidence.length === 0, '无关正文不应生成完成证据');
console.log('✓ B 无关正文不误判');

// ---- A：申报解析 ----
const parsed = api.parseResponse('正文内容\n<剧情规划>下一段继续。\n<剧情推进>\n完成: 是\n进入分段: 4\n依据: 正文写到了黑塔\n</剧情推进>\n</剧情规划>');
assert(parsed.storyAdvance?.completed === true && parsed.storyAdvance?.targetSegment === '4', '申报解析应识别完成与目标分段');
console.log('✓ A 申报解析：completed=true target=4');

// ---- A：申报完成背书（正文自然表达 + 申报完成 → 完成证据） ----
const evDeclared = await api.buildTurnEvidence({ body: naturalBody, currentSegment: seg2, futureSegments, currentLocation: '黑塔空间站·主控舱段', projection, gameTime, turnCount: 12, responseId: 'r12', storyAdvance: { completed: true, targetSegment: undefined } });
assert(evDeclared.confirmedEvidence.length > 0, '申报完成 + 正文背书应生成完成证据');
console.log('✓ A 申报完成背书');

// ---- A：跳段候选 + jump_to 裁决 + 提交 ----
const bodyTo4 = '末日兽终于被击退了，瓦尔特抬手压制住我体内的星核异动。黑塔的人偶从拐角走出来，说要带我去看看模拟宇宙。';
const evJump = await api.buildTurnEvidence({ body: bodyTo4, currentSegment: seg2, futureSegments, currentLocation: '黑塔空间站·主控舱段', projection, gameTime, turnCount: 13, responseId: 'r13', storyAdvance: { completed: true, targetSegment: '4' } });
const jumpEv = evJump.confirmedEvidence.find((e) => e.payload?.jumpTargetSegmentId);
assert(jumpEv, '申报跳段应生成跳段候选');
const adj = api.adjudicateStoryTurn({ currentFocus: { focusId: 'f1', status: 'active', reasonCodes: [], enteredAtRevision: 1 }, currentSegment: seg2, committedFacts: [], eventInstances: [], confirmedEvidence: evJump.confirmedEvidence, gameTime, runtimeRevision: 1 });
assert(adj.decision === 'jump_to' && adj.targetSegmentId === jumpEv.payload.jumpTargetSegmentId, '裁决应为 jump_to 且带目标分段');
const system = { 系列列表: [canon], 当前系列ID: canon.id, 当前进度: { 当前分段ID: seg2.id, 当前分段组号: 2, 历史归档: [], 门禁快照: null } };
const applied = api.applyAdjudicatedStoryProgress({ storyWeaving: system, turnCount: 14, decision: adj.decision, completedUnitIds: adj.completedUnitIds, reasons: adj.reasons, targetSegmentId: adj.targetSegmentId });
const segs = applied.system.系列列表[0].分段列表;
assert(segs.find((s) => s.组号 === 3)?.运行状态 === '已跳过', '中间分段应标记已跳过');
assert(segs.find((s) => s.组号 === 4)?.运行状态 === '当前', '目标分段应标记当前');
console.log('✓ A 跳段：候选→jump_to 裁决→提交（分段3已跳过/分段4当前）');

// ---- C：开关默认关闭 ----
const defaults = api.创建默认剧情编织系统设置();
assert(defaults.剧情推进AI判定 === false, '剧情推进 AI 判定应默认关闭');
const normalized = api.归一化剧情编织系统设置({});
assert(normalized.剧情推进AI判定 === false && normalized.推进判定API !== undefined, '归一化应保持默认关闭且 API 覆盖存在');
console.log('✓ C 开关默认关闭 + API 覆盖结构存在');

fs.rmSync(bundlePath, { force: true });
console.log('STORY_PROGRESSION_SCHEME_TEST_OK');
