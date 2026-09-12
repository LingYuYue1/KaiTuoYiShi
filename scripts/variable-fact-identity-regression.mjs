import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-fact-identity-'));

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
  export { getVariableFactEntityKey, buildVariableFactGroupId } from ${JSON.stringify(path.join(root, 'utils/variableFactRecords.ts'))};
  export { factsToVariableCommands } from ${JSON.stringify(path.join(root, 'utils/variableFacts.ts'))};
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
  const canonicalById = { type: 'npc', id: 'npc_march7th', name: '三月七', memory: '第一次证据' };
  const canonicalByAlias = { type: 'npc', id: 'march7th', name: 'March 7th', memory: '第二次证据' };
  assert.equal(
    runtime.getVariableFactEntityKey(canonicalById),
    runtime.getVariableFactEntityKey(canonicalByAlias),
    '同一原著 NPC 的 canonical id、无前缀 id 与英文 alias 必须共用实体键',
  );
  assert.notEqual(
    runtime.getVariableFactEntityKey({ type: 'npc', id: 'npc_custom_1', name: '三月七' }),
    runtime.getVariableFactEntityKey(canonicalById),
    '带 custom id 的自定义 NPC 不得因姓名撞 alias 而并入 canonical NPC',
  );

  const npcAtIndexZero = runtime.buildVariableFactGroupId(canonicalById, 0, 'identity-turn');
  const npcAtIndexFour = runtime.buildVariableFactGroupId(canonicalById, 4, 'identity-turn');
  assert.equal(npcAtIndexZero, npcAtIndexFour, '普通事实组 ID 不应因事实数组重排而变化');
  const timeAtIndexZero = runtime.buildVariableFactGroupId({ type: 'time', mode: 'elapsed', minutes: 2 }, 0, 'identity-turn');
  const timeAtIndexFour = runtime.buildVariableFactGroupId({ type: 'time', mode: 'elapsed', minutes: 2 }, 4, 'identity-turn');
  assert.notEqual(timeAtIndexZero, timeAtIndexFour, '时间事实组 ID 必须保留顺序位置');

  const state = {
    旅人: {}, 世界: { 当前日期: '琥珀纪 2157.03.07', 当前时间: '08:00', 开拓天数: 1 },
    记忆: {}, 忆庭: {}, 智库: {}, 手机: { messageSeeds: [], contacts: [] },
    NPC: [{ id: 'npc_march7th', 姓名: '三月七', 阶位: 'companion', 好感度: 20, 关系: 'acquaintance', 亲密关系: false, 同行: false, 初见回合: 1, 最近回合: 1, 备注: [] }],
    新闻: [], 剧情: [],
  };
  const merged = runtime.factsToVariableCommands([{
    ...canonicalById,
    affinityDelta: 1,
  }, {
    ...canonicalByAlias,
    affinityDelta: 2,
  }], state, 2, { operationSourceId: 'identity-merge-turn', phoneSeedsEnabled: false });
  const affinityCommand = merged.commands.find((command) => command.key.endsWith('.好感度'));
  assert.equal(affinityCommand?.action, 'add', '同实体 NPC 事实应先合并为一条增量命令');
  assert.equal(affinityCommand?.value, 3, '同实体 NPC 的好感变化应确定性累加');

  console.log('VARIABLE_FACT_IDENTITY_REGRESSION_OK');
} finally {
  await fs.rm(outDir, { recursive: true, force: true });
}
