import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-phone-boundary-'));
const outfile = path.join(tempDir, 'phone.mjs');

function assert(condition, message) {
  if (!condition) throw new Error(`variable phone boundary regression failed: ${message}`);
}

function findUndefined(value, currentPath = '$') {
  if (value === undefined) return [currentPath];
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => findUndefined(item, `${currentPath}[${index}]`));
  return Object.entries(value).flatMap(([key, item]) => findUndefined(item, `${currentPath}.${key}`));
}

async function resolveWorkspaceImport(specifier) {
  const base = path.join(root, specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next workspace extension.
    }
  }
  return base;
}

try {
  const source = await fs.readFile(path.join(root, 'services/phoneMemoryDualWrite.ts'), 'utf8');
  assert(source.includes('canonicalizeJsonValue'), '手机双写必须复用共享 JSON canonicalize 边界。');

  await esbuild.build({
    entryPoints: [path.join(root, 'services/phoneMemoryDualWrite.ts')],
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

  const { executePhoneMemoryDualWrite } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const input = {
    memory: {
      即时记忆: [],
      短期记忆: [],
      中期记忆: [],
      长期记忆: [],
      失败草稿: [],
    },
    yiting: { 回忆档案: [] },
    npcs: [{
      id: 'npc_boundary',
      姓名: 'Boundary NPC',
      阶位: 'companion',
      好感度: 0,
      关系: 'acquaintance',
      亲密关系: false,
      同行: true,
      初见回合: 1,
      最近回合: 1,
      备注: [],
      原著角色: false,
      同行记忆: [],
      约定: [],
    }],
    summary: 'a phone summary',
    contact: { npcId: 'npc_boundary' },
    turn: 4,
    settings: {
      启用中短长期API总结: true,
      即时转短期阈值: 100,
      短期转中期阈值: 100,
      中期转长期阈值: 100,
      NPC记忆压缩阈值: 20,
      NPC记忆压缩提示词: '',
    },
    gameTime: ' ',
  };
  const before = structuredClone(input);
  const result = await executePhoneMemoryDualWrite(input);

  assert(isDeepStrictEqual(input, before), '手机双写不得修改输入快照。');
  assert(findUndefined(result).length === 0, '手机双写结果不得保留显式 undefined。');
  assert(result.nextMemory.即时记忆.length === 1, '手机摘要仍必须写入即时记忆。');
  assert(result.nextNpcs[0].同行记忆.length === 1, '手机摘要仍必须写入 NPC 同行记忆。');
  assert(result.nextNpcs[0].同行记忆[0].时间 === undefined || !Object.hasOwn(result.nextNpcs[0].同行记忆[0], '时间'), '无游戏时间时不得制造时间占位字段。');

  console.log('variable phone boundary regression passed.');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
