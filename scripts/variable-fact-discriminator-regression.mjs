import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-fact-discriminator-'));
const outfile = path.join(tempDir, 'variableFacts.mjs');

async function resolveWorkspaceImport(specifier) {
  const base = path.join(root, specifier.slice(2));
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
  ]) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // try the next workspace extension
    }
  }
  return base;
}

try {
  await esbuild.build({
    entryPoints: [path.join(root, 'utils/variableFacts.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
    plugins: [{
      name: 'workspace-alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, async (args) => ({
          path: await resolveWorkspaceImport(args.path),
        }));
      },
    }],
  });

  const { parseVariableFacts } = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  const rawText = `<变量事实>${JSON.stringify({
    facts: [
      { mode: 'elapsed', minutes: 15, evidence: '正文明确经过十五分钟' },
      { location: '雅利洛-VI 雪原边缘', evidence: '正文明确降落到雪原' },
      { weather: 'blizzard', evidence: '正文明确写出暴风雪' },
      { text: '列车组成功降落至雅利洛-VI 雪原', evidence: '正文明确写出成功降落' },
      { id: 'npc_danheng', name: '丹恒', recentInteraction: '与玩家共同检查降落舱', evidence: '正文明确写出共同检查' },
      { id: 'npc_march7th', name: '三月七', sharedExperiences: ['共同乘坐降落舱登陆'], evidence: '正文明确写出共同登陆' },
      { id: 'npc_stelle', name: '星', recentInteraction: '与玩家一起抵达雪原', evidence: '正文明确写出一起抵达' },
      { id: 'npc_himeko', name: '姬子', recentInteraction: '带领队伍前往月台', evidence: '正文明确写出带队行动' },
    ],
  })}</变量事实>`;

  const parsed = parseVariableFacts(rawText);
  assert.equal(parsed.parseErrors.length, 0, `无 type 的真实事实形状不应全部解析失败：${parsed.parseErrors.join('；')}`);
  assert.deepEqual(
    parsed.facts.map((fact) => fact.type),
    ['time', 'location', 'weather', 'world_event', 'npc', 'npc', 'npc', 'npc'],
    '事实类型应从明确字段恢复，保持原始顺序',
  );
  const wrapped = '<变量事实>' + JSON.stringify({ facts: [
    { factType: 'location', payload: { location: '黑塔空间站·主控舱段' } },
    { fact_type: 'weather', data: { weather: 'clear' } },
  ] }) + '</变量事实>';
  const wrappedParsed = parseVariableFacts(wrapped);
  assert.equal(wrappedParsed.parseErrors.length, 0, '带 factType/payload 的旧事实包裹也应可解析。');
  assert.deepEqual(wrappedParsed.facts.map((fact) => fact.type), ['location', 'weather']);
  console.log('VARIABLE_FACT_DISCRIMINATOR_REGRESSION_OK');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
