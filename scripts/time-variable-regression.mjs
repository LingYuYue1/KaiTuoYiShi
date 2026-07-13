import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'time-variable-regression-'));

async function resolveWorkspaceImport(specifier) {
  const base = path.join(root, specifier.slice(2));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return base;
}

async function bundle(entry, name) {
  const outfile = path.join(outDir, `${name}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    plugins: [
      {
        name: 'workspace-alias',
        setup(build) {
          build.onResolve({ filter: /^@\// }, async (args) => ({
            path: await resolveWorkspaceImport(args.path),
          }));
        },
      },
    ],
  });
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}

const { factsToVariableCommands } = await bundle('utils/variableFacts.ts', 'variableFacts');
const { reduceVariableCommands } = await bundle('utils/variableExecutor.ts', 'variableExecutor');

const baselineState = {
  世界: {
    开拓天数: 1,
    当前日期: '琥珀纪 2157.03.07',
    当前时间: '23:50',
  },
  NPC: [],
  手机: { messageSeeds: [] },
};

const elapsedResult = factsToVariableCommands([
  { type: 'time', mode: 'elapsed', minutes: 15, evidence: '又等了十五分钟，时间越过午夜。' },
], baselineState, 2, { phoneSeedsEnabled: false });

assert(elapsedResult.warnings.length === 0, `跨日 elapsed 不应产生警告：${elapsedResult.warnings.join('；')}`);
assert(elapsedResult.commands.some((cmd) => cmd.key === '世界.开拓天数' && cmd.value === 2), '跨日 elapsed 应推进开拓天数。');
assert(elapsedResult.commands.some((cmd) => cmd.key === '世界.当前日期' && cmd.value === '琥珀纪 2157.03.08'), '跨日 elapsed 应推进当前日期。');
assert(elapsedResult.commands.some((cmd) => cmd.key === '世界.当前时间' && cmd.value === '00:05'), '跨日 elapsed 应写入绕回后的 HH:mm。');

const reduced = reduceVariableCommands(elapsedResult.commands, baselineState);
assert(reduced.results.every((result) => result.ok), `跨日 elapsed 命令不应被执行器拒绝：${reduced.results.map((result) => result.reason).filter(Boolean).join('；')}`);
assert(reduced.nextState.世界.开拓天数 === 2, `执行后开拓天数应为第 2 天，实际结果：${JSON.stringify({ results: reduced.results, world: reduced.nextState.世界 }, null, 2)}`);
assert(reduced.nextState.世界.当前日期 === '琥珀纪 2157.03.08', '执行后日期应为下一天。');
assert(reduced.nextState.世界.当前时间 === '00:05', '执行后时间应为 00:05。');

const sameDayResult = factsToVariableCommands([
  { type: 'time', mode: 'elapsed', minutes: 10, evidence: '十分钟后。' },
], {
  ...baselineState,
  世界: { ...baselineState.世界, 当前时间: '10:00' },
}, 3, { phoneSeedsEnabled: false });

assert(sameDayResult.commands.length === 1, '同日 elapsed 仍只应更新时间。');
assert(sameDayResult.commands[0].key === '世界.当前时间' && sameDayResult.commands[0].value === '10:10', '同日 elapsed 应保持原有时间推进行为。');

console.log('time-variable-regression passed');
