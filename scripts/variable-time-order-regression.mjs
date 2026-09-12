import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-time-order-'));

async function resolveWorkspaceImport(specifier) {
  const base = path.join(root, specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return base;
}

const entry = path.join(outDir, 'entry.ts');
await fs.writeFile(entry, `
  export { factsToVariableCommands } from ${JSON.stringify(path.join(root, 'utils/variableFacts.ts'))};
  export { reduceVariableCommands } from ${JSON.stringify(path.join(root, 'utils/variableExecutor.ts'))};
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
      build.onResolve({ filter: /^@\// }, async (args) => ({ path: await resolveWorkspaceImport(args.path) }));
    },
  }],
});

try {
  const runtime = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const baseState = (time = '08:00', date = '琥珀纪 2157.03.07', day = 1) => ({
    旅人: {},
    世界: { 当前日期: date, 当前时间: time, 开拓天数: day, 当前地点: '列车' },
    记忆: {}, 忆庭: {}, 智库: {}, 手机: { messageSeeds: [], contacts: [] },
    NPC: [], 新闻: [], 剧情: [],
  });

  // 同一批次的多个时间事实必须按原始顺序执行，不能被合成“最后一个 mode”。
  const sequential = runtime.factsToVariableCommands([
    { type: 'time', mode: 'elapsed', minutes: 5, evidence: '几分钟后' },
    { type: 'time', mode: 'next_day', targetTime: '00:30', evidence: '正文明确一夜过去，进入次日凌晨' },
    { type: 'time', mode: 'set_time', targetTime: '01:00', evidence: '正文明确随后继续到一点' },
  ], baseState(), 2, { operationSourceId: 'time-order-turn' });
  assert.equal(new Set(sequential.commands.map((command) => command.factGroupId)).size, 3, '不同时间事实必须保留为三个有序事实组');
  const reduced = runtime.reduceVariableCommands(sequential.commands, baseState());
  assert.equal(reduced.nextState.世界.当前日期, '琥珀纪 2157.03.08', 'next_day 必须按项目琥珀历推进日期');
  assert.equal(reduced.nextState.世界.开拓天数, 2, 'next_day 必须同步推进开拓天数');
  assert.equal(reduced.nextState.世界.当前时间, '01:00', 'next_day 后的 set_time 必须继续作用于新日期');

  // elapsed 不再裁成 30 分钟，正文明确的长耗时按原值推进。
  const longElapsed = runtime.factsToVariableCommands([
    { type: 'time', mode: 'elapsed', minutes: 120, evidence: '两小时后' },
  ], baseState(), 2, { operationSourceId: 'time-long-elapsed' });
  const longElapsedReduced = runtime.reduceVariableCommands(longElapsed.commands, baseState());
  assert.equal(longElapsedReduced.nextState.世界.当前时间, '10:00', '120 分钟必须完整推进，不得裁成 30 分钟');
  assert.equal(longElapsedReduced.nextState.世界.当前日期, '琥珀纪 2157.03.07', '未跨日的长耗时不得改变日期');

  // elapsed 跨午夜时也要在投影阶段同步日期，避免后续事实看到旧日期。
  const overnight = runtime.factsToVariableCommands([
    { type: 'time', mode: 'elapsed', minutes: 5, evidence: '从23:58经过五分钟到凌晨' },
  ], baseState('23:58'), 2, { operationSourceId: 'time-overflow-turn' });
  const overnightReduced = runtime.reduceVariableCommands(overnight.commands, baseState('23:58'));
  assert.equal(overnightReduced.nextState.世界.当前日期, '琥珀纪 2157.03.08', 'elapsed 跨午夜必须按项目琥珀历推进日期');
  assert.equal(overnightReduced.nextState.世界.开拓天数, 2, 'elapsed 跨午夜必须同步推进开拓天数');
  assert.equal(overnightReduced.nextState.世界.当前时间, '00:03', 'elapsed 跨午夜必须保留时间余数');

  // elapsed 可一次跨多日，日期、开拓天数与时间余数必须统一换算。
  const multiDay = runtime.factsToVariableCommands([
    { type: 'time', mode: 'elapsed', minutes: 3000, evidence: '连续航行五十小时后' },
  ], baseState(), 2, { operationSourceId: 'time-multi-day' });
  const multiDayReduced = runtime.reduceVariableCommands(multiDay.commands, baseState());
  assert.equal(multiDayReduced.nextState.世界.当前日期, '琥珀纪 2157.03.09', '3000 分钟必须完整推进两天');
  assert.equal(multiDayReduced.nextState.世界.开拓天数, 3, '跨两日必须同步增加两天开拓天数');
  assert.equal(multiDayReduced.nextState.世界.当前时间, '10:00', '跨多日后必须保留时间余数');

  // set_time 是模型给出的明确状态，不再由执行器判断是否像“同日回退”。
  const directClock = runtime.factsToVariableCommands([
    { type: 'time', mode: 'set_time', targetTime: '07:15', evidence: '当前钟表显示七点十五分' },
  ], baseState('18:30'), 2, { operationSourceId: 'time-direct-clock' });
  const directClockReduced = runtime.reduceVariableCommands(directClock.commands, baseState('18:30'));
  assert.equal(directClockReduced.nextState.世界.当前时间, '07:15', '合法 set_time 必须直接写入，不得按旧时间拒绝');
  assert.equal(directClockReduced.nextState.世界.当前日期, '琥珀纪 2157.03.07', 'set_time 本身不得猜测跨日');

  // 旧命令兼容仍保留格式校验，但不得把长日期/天数推进裁成一天。
  const directCalendar = runtime.reduceVariableCommands([
    { action: 'set', key: '世界.当前日期', value: '琥珀纪 2157.03.10', factGroupId: 'calendar-direct' },
    { action: 'set', key: '世界.开拓天数', value: 4, factGroupId: 'calendar-direct' },
  ], baseState());
  assert(directCalendar.results.every((result) => result.ok), '合法多日日期命令必须全部成功');
  assert.equal(directCalendar.nextState.世界.当前日期, '琥珀纪 2157.03.10', '日期不得被裁成仅推进一天');
  assert.equal(directCalendar.nextState.世界.开拓天数, 4, '开拓天数不得被裁成仅增加一天');

  const factsSource = await fs.readFile(path.join(root, 'utils/variableFacts.ts'), 'utf8');
  const executorSource = await fs.readFile(path.join(root, 'utils/variableExecutor.ts'), 'utf8');
  for (const forbidden of [
    'Math.min(30',
    '疑似同日时间回退',
    '校验世界时间命令',
    '补齐疑似跨夜时间',
    '分析批次时间计划',
    '拒绝时间回退',
  ]) {
    assert.ok(!factsSource.includes(forbidden) && !executorSource.includes(forbidden), `时间链仍残留剧情式裁决：${forbidden}`);
  }

  console.log('VARIABLE_TIME_ORDER_REGRESSION_OK');
} finally {
  await fs.rm(outDir, { recursive: true, force: true });
}
