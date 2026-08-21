import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-repair-'));
const outfile = path.join(tempDir, 'repair.mjs');

await esbuild.build({
  entryPoints: [path.join(root, 'utils/variableRepair.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  plugins: [{
    name: 'workspace-alias',
    setup(build) {
      build.onResolve({ filter: /^@\// }, async (args) => {
        const base = path.join(root, args.path.slice(2));
        for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
          try {
            await fs.access(candidate);
            return { path: candidate };
          } catch {
            // continue
          }
        }
        return { path: base };
      });
    },
  }],
});

const analysisOutfile = path.join(tempDir, 'analysis.mjs');
await esbuild.build({
  entryPoints: [path.join(root, 'services/variableTurnAnalysis.ts')],
  outfile: analysisOutfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  plugins: [{
    name: 'workspace-alias',
    setup(build) {
      build.onResolve({ filter: /^@\// }, async (args) => {
        const base = path.join(root, args.path.slice(2));
        for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
          try {
            await fs.access(candidate);
            return { path: candidate };
          } catch {
            // continue
          }
        }
        return { path: base };
      });
    },
  }],
});

try {
  const repair = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const analysisModule = await import(`${pathToFileURL(analysisOutfile).href}?t=${Date.now()}`);

  const baseState = {
    旅人: { 背包: [] },
    世界: {
      当前日期: '琥珀纪 2157.01.01',
      当前时间: '08:00',
      开拓天数: 1,
      当前地点: '贝洛伯格·行政区',
      当前天气: 'clear',
      全局事件: [],
    },
    记忆: {},
    忆庭: {},
    智库: {},
    手机: { messageSeeds: [], contacts: [] },
    NPC: [],
    新闻: [],
    剧情: [],
  };

  const rawText = '<变量事实>{"facts":[' +
    '{"type":"npc","id":"npc_march7th","name":"三月七","memory":"在行政区与玩家确认了下一步行动。","recentInteraction":"三月七与玩家讨论下一步行动。","evidence":"正文明确写出三月七与玩家讨论行动"},' +
    '{"type":"npc","id":"npc_danheng","name":"丹恒","affinityDelta":2,"memory":"丹恒认可了玩家的判断。","evidence":"正文明确写出丹恒表示认可"},' +
    '{"type":"item","action":"gain","category":"key","name":"旧城区门禁卡","quantity":1,"evidence":"正文写明玩家收下门禁卡"},' +
    '{"type":"time","mode":"elapsed","minutes":10,"evidence":"十分钟后"}' +
    ']}</变量事实>';
  const analysis = analysisModule.analyzeVariableTurn({
    rawText,
    stateSnapshot: baseState,
    turn: 8,
    operationSourceId: 'turn_8',
    sourceTurnId: 'turn_8',
    sourceMessageId: 'assistant_8',
    phoneSeedsEnabled: false,
    mode: 'repair',
  });

  const plan = repair.buildVariableRepairPlan({
    analysis,
    baseState,
    turn: 8,
    turnId: 'turn_8',
    targetMessageId: 'assistant_8',
    targetUserMessageId: 'user_8',
  });
  assert(plan.items.some((item) => item.category === 'safe'), '低风险 NPC 事实必须进入 safe。');
  assert(plan.items.some((item) => item.category === 'confirm' && item.fact?.type === 'npc'), 'NPC 好感事实必须进入 confirm。');
  assert(plan.items.some((item) => item.category === 'confirm' && item.fact?.type === 'item'), '物品事实必须进入 confirm。');
  assert(plan.items.some((item) => item.category === 'conflict'), '历史 time 事实必须进入 conflict。');
  assert(plan.conflictItems.every((item) => item.commands.length === 0), '冲突项不得携带可直接提交命令。');

  const setters = {};
  const current = { ...baseState };
  for (const rootKey of ['旅人', '世界', '记忆', '忆庭', '智库', '手机', 'NPC', '新闻', '剧情']) {
    setters[`set${rootKey}`] = (value) => { current[rootKey] = value; };
  }
  const firstCommit = repair.commitVariableRepairPlan({
    plan,
    currentState: baseState,
    setters,
    confirmedItemIds: [],
    existingBatches: [],
  });
  assert(firstCommit.ok, `safe 修复应该成功提交：${firstCommit.receipt.message}`);
  assert(firstCommit.batch?.mode === 'repair', '修复提交必须生成 repair 批次。');
  assert(firstCommit.batch?.repairPlanId === plan.id, 'repair 批次必须绑定 planId。');
  assert(Array.isArray(current.NPC) && current.NPC.length === 1, '安全 NPC 事实应只写入一条 NPC。');
  assert(current.世界.当前时间 === baseState.世界.当前时间, '历史冲突时间不得覆盖当前世界。');

  const duplicate = repair.commitVariableRepairPlan({
    plan,
    currentState: baseState,
    setters,
    confirmedItemIds: [],
    existingBatches: [firstCommit.batch],
  });
  assert(!duplicate.ok && duplicate.receipt.code === 'ALREADY_COMMITTED', '同一计划重复提交必须被拒绝。');

  const staleState = { ...baseState, 世界: { ...baseState.世界, 当前地点: '贝洛伯格·歌德大酒店' } };
  const stale = repair.commitVariableRepairPlan({
    plan,
    currentState: staleState,
    setters,
    confirmedItemIds: [],
    existingBatches: [],
  });
  assert(!stale.ok && stale.receipt.code === 'STALE_PLAN', '预览后 state 变化必须返回 STALE_PLAN。');
  assert(stale.results.length === 0, 'STALE_PLAN 必须零命令副作用。');

  const existingPlan = repair.buildVariableRepairPlan({
    analysis,
    baseState,
    turn: 8,
    turnId: 'turn_8',
    sourceBatchId: 'old_batch',
    existingBatches: [{
      id: 'old_batch', turn: 8, timestamp: 1, source: 'calibration', results: [],
      facts: analysis.facts,
    }],
  });
  assert(existingPlan.items.some((item) => item.category === 'existing'), '相同 semanticFingerprint 必须进入 existing。');

  console.log('variable repair regression ok');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
