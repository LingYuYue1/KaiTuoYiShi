import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-setter-failure-'));
const entry = path.join(outDir, 'entry.ts');
await fs.writeFile(entry, `export { applyVariableCommandsDetailed } from ${JSON.stringify(path.join(root, 'utils/variableExecutor.ts'))};\n`, 'utf8');
const outfile = path.join(outDir, 'runtime.mjs');
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
  const { applyVariableCommandsDetailed } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const state = {
    旅人: {}, 世界: { 当前日期: '琥珀纪 2157.03.07', 当前时间: '08:00', 开拓天数: 1, 当前地点: '列车' },
    记忆: {}, 忆庭: {}, 智库: {}, 手机: { messageSeeds: [], contacts: [] },
    NPC: [{ id: 'npc_march7th', 姓名: '三月七', 阶位: 'companion', 好感度: 20, 关系: 'acquaintance', 亲密关系: false, 同行: false, 初见回合: 1, 最近回合: 1, 备注: [] }],
    新闻: [], 剧情: [],
  };
  const mutations = [];
  const result = applyVariableCommandsDetailed([
    { action: 'set', key: '世界.当前地点', value: '空间站', factGroupId: 'world-group' },
    { action: 'add', key: 'NPC[id=npc_march7th].好感度', value: 1, factGroupId: 'npc-group' },
  ], state, {
    set旅人: () => {},
    set世界: (value) => mutations.push(['世界', value]),
    set记忆: () => {}, set忆庭: () => {}, set智库: () => {}, set手机: () => {},
    setNPC: () => { throw new Error('模拟 NPC setter 故障'); },
    set新闻: () => {}, set剧情: () => {},
  });
  assert.equal(result.diagnostics.some((item) => item.code === 'VARIABLE_COMMIT_PARTIAL' && item.root === 'NPC'), true, 'setter 失败必须记录已部分提交及失败 root');
  assert.equal(result.results.length, 2, 'setter 失败不得伪造没有 command 的 null 结果');
  assert.equal(result.results.every((item) => item.command && item.ok === false && item.stage === 'commit'), true, '提交失败的命令结果必须保留原 command 与 commit 阶段');
  assert.equal(mutations.length, 1, '失败 setter 前已成功的 root 应明确可观测');

  console.log('VARIABLE_SETTER_FAILURE_REGRESSION_OK');
} finally {
  await fs.rm(outDir, { recursive: true, force: true });
}
