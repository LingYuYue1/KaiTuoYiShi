import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(`variable undefined safety regression failed: ${message}`);
}

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-undefined-safety-'));

async function resolveWorkspaceImport(specifier) {
  const base = path.join(root, specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {
      // try next candidate
    }
  }
  return base;
}

async function bundle(name, entry) {
  const outfile = path.join(outDir, `${name}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
    plugins: [{
      name: 'workspace-alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, async (args) => ({ path: await resolveWorkspaceImport(args.path) }));
      },
    }],
    tsconfig: path.join(root, 'tsconfig.json'),
  });
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}

const [facts, executor, variablePath, migration, fingerprint] = await Promise.all([
  bundle('facts', 'utils/variableFacts.ts'),
  bundle('executor', 'utils/variableExecutor.ts'),
  bundle('variable-path', 'utils/variablePath.ts'),
  bundle('migration', 'utils/variableBatchMigration.ts'),
  bundle('fingerprint', 'utils/stableFingerprint.ts'),
]);

assert(typeof fingerprint.stableStringify(undefined) === 'string', 'undefined 的稳定序列化必须始终返回字符串。');
let fingerprintError = null;
try {
  fingerprint.stableFingerprint(undefined);
} catch (error) {
  fingerprintError = error;
}
assert(!fingerprintError, `stableFingerprint(undefined) 不得因 text.length 崩溃：${fingerprintError?.message ?? ''}`);

const initialState = {
  旅人: {},
  世界: {},
  记忆: {},
  忆庭: {},
  智库: {},
  手机: { messageSeeds: [] },
  NPC: [{
    id: 'npc_partial_archive',
    姓名: '部分档案角色',
    NPC来源: 'custom',
    阶位: 'companion',
    好感度: 30,
    关系: 'friend',
    亲密关系: true,
    同行: false,
    初见回合: 1,
    最近回合: 2,
    备注: [],
    NSFW档案: {
      enabled: true,
      年龄确认: 'adult',
      亲密阶段: '已建立亲密关系',
      女性身体档案: { 胸部: '已有记录' },
    },
  }],
  新闻: [],
  剧情: [],
};

initialState.NPC.push({
  id: 'npc_partial_male_archive',
  姓名: '部分男性档案角色',
  NPC来源: 'custom',
  阶位: 'companion',
  好感度: 30,
  关系: 'friend',
  亲密关系: true,
  同行: false,
  初见回合: 1,
  最近回合: 2,
  备注: [],
  NSFW档案: {
    enabled: true,
    年龄确认: 'adult',
    亲密阶段: '已建立亲密关系',
    男性身体档案: { 男性器: '已有记录' },
  },
});

const generated = facts.factsToVariableCommands([
  {
    type: 'nsfw_archive',
    npcId: 'npc_partial_archive',
    npcName: '部分档案角色',
    intimacyStage: '阶段更新但没有新增身体字段',
    evidence: '正文明确出现阶段变化',
  },
  {
    type: 'nsfw_archive',
    npcId: 'npc_partial_male_archive',
    npcName: '部分男性档案角色',
    notes: '只更新备注，不新增男性身体字段',
    evidence: '正文明确出现备注',
  },
], initialState, 3, {
  phoneSeedsEnabled: false,
  operationSourceId: 'variable-undefined-safety-regression',
});

const archiveCommands = generated.commands.filter((command) => command.key.endsWith('.NSFW档案'));
assert(archiveCommands.length === 2, '部分 nsfw_archive 事实必须各生成档案 patch 命令。');

let failure = null;
let reduced;
try {
  reduced = executor.reduceVariableCommands(generated.commands, initialState);
} catch (error) {
  failure = error;
}

assert(!failure, failure?.message ?? '变量 reducer 不应因缺失可选字段抛出异常。');
assert(reduced?.nextState.NPC[0].NSFW档案?.女性身体档案?.胸部 === '已有记录', '已有女性档案字段必须保留。');
assert(reduced?.nextState.NPC[1].NSFW档案?.男性身体档案?.男性器 === '已有记录', '已有男性档案字段必须保留。');

function findUndefined(value, path = '$') {
  if (value === undefined) return [path];
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => findUndefined(item, `${path}[${index}]`));
  return Object.entries(value).flatMap(([key, item]) => findUndefined(item, `${path}.${key}`));
}

const undefinedPaths = findUndefined(reduced.nextState);
assert(undefinedPaths.length === 0, `最终 projection 不得保留 undefined：${undefinedPaths.join(', ')}`);
assert(generated.commands.every((command) => findUndefined(command).length === 0), '事实投影生成的命令不得携带显式 undefined');
assert(generated.commands.filter((command) => command.action === 'delete').every((command) => !Object.hasOwn(command, 'value')), 'delete 命令不得携带 null/undefined value 占位字段');

const migrated = migration.migrateVariableCommandBatch({
  id: 'legacy-undefined', turn: 2, timestamp: 3, source: 'calibration', turnId: undefined,
  modelName: undefined, results: [{ ok: true, command: { action: 'delete', key: 'NPC[id=npc_x].归档回合', value: null } }],
});
assert(findUndefined(migrated).length === 0, '批次迁移边界不得保留显式 undefined');
assert(migrated.results[0].command && !Object.hasOwn(migrated.results[0].command, 'value'), '旧 delete 占位值迁移后必须省略');

const omittedObject = variablePath.应用路径命令(
  { existing: { keep: 'yes' } },
  'existing',
  'set',
  { added: 'yes', omitted: undefined },
);
assert(omittedObject.ok, '对象字段中的 undefined 应被安全省略。');
assert(omittedObject.nextRootValue.existing.keep === 'yes', '对象深合并不能清空既有兄弟字段。');
assert(!Object.hasOwn(omittedObject.nextRootValue.existing, 'omitted'), '对象中的 undefined 键必须被移除。');

const undefinedArray = variablePath.应用路径命令([], '', 'push', ['valid', undefined]);
assert(!undefinedArray.ok && undefinedArray.reason.includes('数组元素不能是 undefined'), '数组中的 undefined 必须拒绝并给出诊断。');

const nonFinite = variablePath.应用路径命令({}, 'value', 'set', Number.NaN);
assert(!nonFinite.ok && nonFinite.reason.includes('有限数值'), 'NaN 必须拒绝并给出诊断。');

await fs.rm(outDir, { recursive: true, force: true });
console.log('variable undefined safety regression passed.');
