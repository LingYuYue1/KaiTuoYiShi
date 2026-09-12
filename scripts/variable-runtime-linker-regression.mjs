import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-runtime-linker-'));
const outfile = path.join(tempDir, 'runtime.mjs');

const baseState = () => ({
  旅人: { 背包: [] },
  世界: {
    当前地点: '黑塔空间站·收容舱段',
    当前区域ID: 'herta_space_station',
    当前日期: '琥珀纪 2157.01.01',
    当前时间: '08:00',
    开拓天数: 1,
    当前天气: 'clear',
    全局事件: [],
  },
  记忆: { 即时记忆: ['可信旧记忆'] },
  忆庭: {},
  智库: {},
  手机: { messageSeeds: [] },
  NPC: [],
  新闻: [],
  剧情: [],
});

try {
  await build({
    stdin: {
      contents: "export * from './services/variableRuntime';",
      resolveDir: root,
      sourcefile: 'variable-runtime-linker-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile,
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
  });
  const runtime = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  const initial = baseState();
  const current = runtime.splitVariableRuntimeState(initial);
  assert.deepEqual(Object.keys(current.writable).sort(), ['NPC', '世界', '手机', '旅人'].sort(), 'linker 可写状态只能包含四个正式 root。');
  assert.deepEqual(Object.keys(current.read).sort(), ['剧情', '忆庭', '新闻', '智库', '记忆'].sort(), 'service-owned root 必须只进入读取上下文。');

  const projection = runtime.linkVariableTurn({
    rawText: [
      '<变量事实>',
      JSON.stringify({ facts: [{ type: 'time', mode: 'elapsed', minutes: 30, evidence: '经过半小时' }] }),
      '</变量事实>',
      '<变量更新>',
      'set 世界.不存在字段 = 1',
      'set 记忆.即时记忆 = ["不应写入"]',
      '</变量更新>',
    ].join('\n'),
    current,
    turn: 2,
    operationSourceId: 'runtime-linker-regression',
    sourceEvidenceId: 'chat_history:assistant-2',
    factSource: '正文',
    mode: 'normal',
    phoneSeedsEnabled: false,
    nsfwEnabled: false,
  });

  assert.deepEqual(projection.changedRoots, ['世界'], '只有真实变化的正式 root 才能出现在 changedRoots。');
  assert.equal(projection.nextState.世界.当前时间, '08:30', '一个坏旧命令不能连坐合法 time 事实。');
  assert.equal(projection.analysis.nextState.记忆, initial.记忆, 'service-owned root 不得被旧命令改写。');
  assert.equal(projection.analysis.skippedServiceOwnedLegacyCount, 1, 'service-owned 旧命令必须被 linker 明确隔离。');
  assert(projection.analysis.results.some((result) => !result.ok), '坏的可写命令必须保留逐项失败结果。');
  assert(projection.analysis.diagnostics.some((item) => item.code === 'VARIABLE_LEGACY_ROOT_OWNED_BY_SERVICE'), 'service-owned 旧命令必须留下结构化诊断。');

  const batch = runtime.buildVariableBatchFromProjection(projection, {
    turn: 2,
    turnId: 'turn-2',
    targetMessageId: 'assistant-2',
    targetUserMessageId: 'user-2',
    source: 'calibration',
    modelName: 'regression-model',
  });
  assert.equal(batch.turn, 2, '批次必须保留目标回合。');
  assert.equal(batch.sourceEvidenceId, 'chat_history:assistant-2', '批次必须继承 linker 的证据身份。');

  const committed = [];
  const appended = [];
  const setters = {
    set旅人: () => committed.push('旅人'),
    set世界: (value) => { committed.push('世界'); assert.equal(value.当前时间, '08:30'); },
    set手机: () => committed.push('手机'),
    setNPC: () => committed.push('NPC'),
  };
  const deferred = runtime.commitVariableProjection({
    projection,
    setters,
    roots: [],
    batch,
    appendBatch: (value) => { appended.push(value.id); return true; },
  });
  assert.deepEqual(deferred.deferredRoots, ['世界'], '主回合可显式延后世界 root，不能用空 setter 假提交。');
  assert.equal(deferred.batchRecorded, false, '存在延后 root 时不得提前封口批次。');
  assert.deepEqual(committed, [], '延后 root 不得触发任何 setter。');

  const finalized = runtime.commitVariableProjection({
    projection,
    setters,
    roots: ['世界'],
    batch,
    appendBatch: (value) => { appended.push(value.id); return true; },
  });
  assert.deepEqual(finalized.committedRoots, ['世界'], '最终提交必须回执真实 setter root。');
  assert.equal(finalized.batchRecorded, true, '所有变化 root 提交后才能记录批次。');
  assert.deepEqual(appended, [batch.id], '批次只能记录一次。');

  console.log('VARIABLE_RUNTIME_LINKER_REGRESSION_OK');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
