import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-calibration-transaction-'));
const entry = path.join(outDir, 'entry.ts');
await fs.writeFile(entry, `
  export { linkVariableTurn, splitVariableRuntimeState, buildVariableBatchFromProjection, commitVariableProjection } from ${JSON.stringify(path.join(root, 'services/variableRuntime.ts'))};
  export { variableBatchHasFailure, variableBatchHasWarning } from ${JSON.stringify(path.join(root, 'utils/variableBatchStatus.ts'))};
`, 'utf8');
const outfile = path.join(outDir, 'runtime.mjs');

await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'silent',
  tsconfig: path.join(root, 'tsconfig.json'),
  plugins: [{
    name: 'workspace-alias',
    setup(build) {
      build.onResolve({ filter: /^@\// }, async (args) => {
        const base = path.join(root, args.path.slice(2));
        for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) {
          try {
            if ((await fs.stat(candidate)).isFile()) return { path: candidate };
          } catch {
            // try next candidate
          }
        }
        return { path: base };
      });
    },
  }],
});

try {
  const api = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const initialState = {
    旅人: { 背包: [] },
    世界: { 当前地点: '起点', 当前区域ID: 'unknown', 当前日期: '琥珀纪 2157.01.01', 当前时间: '08:00', 开拓天数: 1, 当前天气: 'clear', 全局事件: [] },
    记忆: {}, 忆庭: {}, 智库: {},
    手机: { messageSeeds: [] }, NPC: [], 新闻: [], 剧情: [],
  };
  const projection = api.linkVariableTurn({
    rawText: '<变量事实>{"facts":[{"type":"location","location":"新地点","evidence":"抵达新地点"}]}</变量事实>',
    current: api.splitVariableRuntimeState(initialState),
    turn: 1,
    operationSourceId: 'calibration-transaction',
    sourceEvidenceId: 'turn:1',
    factSource: '正文',
    mode: 'normal',
  });
  const batch = api.buildVariableBatchFromProjection(projection, { turn: 1, source: 'calibration', id: 'batch-1', timestamp: 1 });
  const events = [];
  const setters = {
    set旅人: () => events.push('旅人'),
    set世界: () => events.push('世界'),
    set手机: () => events.push('手机'),
    setNPC: () => events.push('NPC'),
  };
  api.commitVariableProjection({
    projection, setters, batch,
    appendBatch: () => { events.push('batch'); return true; },
  });
  assert.deepEqual(events, ['世界', 'batch'], '成功批次必须在 state setter 全部成功后再记录');

  let appendCount = 0;
  assert.throws(() => api.commitVariableProjection({
    projection,
    setters: { ...setters, set世界: () => { throw new Error('setter failed'); } },
    batch,
    appendBatch: () => { appendCount += 1; return true; },
  }), /setter failed/);
  assert.equal(appendCount, 0, 'state setter 失败时不得先留下成功批次');

  assert.equal(api.variableBatchHasFailure({ ...batch, diagnostics: [{ code: 'E', severity: 'error', stage: 'commit', message: '失败' }] }), true, '只有 error diagnostic 的批次也必须判定为失败');
  assert.equal(api.variableBatchHasFailure({ ...batch, diagnostics: [{ code: 'W', severity: 'warning', stage: 'preflight', message: '警告' }] }), false);
  assert.equal(api.variableBatchHasWarning({ ...batch, diagnostics: [{ code: 'W', severity: 'warning', stage: 'preflight', message: '警告' }] }), true);
  assert.equal(api.variableBatchHasFailure(batch), false);
  assert.equal(api.variableBatchHasWarning(batch), false);

  console.log('VARIABLE_CALIBRATION_TRANSACTION_REGRESSION_OK');
} finally {
  await fs.rm(outDir, { recursive: true, force: true });
}
