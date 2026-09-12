import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-batch-migration-'));
const outfile = path.join(tempDir, 'migration.mjs');

function assert(condition, message) {
  if (!condition) throw new Error(`variable batch migration regression failed: ${message}`);
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
  await esbuild.build({
    entryPoints: [path.join(root, 'utils/variableBatchMigration.ts')],
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

  const { migrateVariableCommandBatch } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const legacyBatch = {
    turn: 7,
    timestamp: 1710000000000,
    source: 'calibration',
    rawText: 'legacy response',
    modelName: undefined,
    results: [
      {
        ok: false,
        kind: 'error',
        command: { action: 'set', key: '世界.当前时间' },
        reason: 'legacy command omitted value',
      },
      {
        ok: true,
        command: { action: 'delete', key: 'NPC[id=npc_x].备注', value: null },
      },
      {
        ok: false,
        command: { action: 'set', key: '世界.当前天气', value: undefined },
      },
      {
        ok: false,
        command: { action: 'invalid', key: '世界.无效动作', value: 'x' },
      },
      {
        ok: false,
        command: { action: 'set', key: '(解析失败：旧格式)' },
      },
    ],
    diagnostics: [
      { code: 'LEGACY_NOTE', severity: 'warning', stage: 'parse', message: 'legacy parser note' },
    ],
  };
  const before = structuredClone(legacyBatch);
  const first = migrateVariableCommandBatch(legacyBatch);
  const second = migrateVariableCommandBatch(first);

  assert(isDeepStrictEqual(legacyBatch, before), '迁移不得修改原始输入对象。');
  assert(isDeepStrictEqual(first, second), 'migrate(migrate(oldBatch)) 必须深度一致。');
  assert(findUndefined(first).length === 0, '迁移结果不得保留显式 undefined。');
  assert(first.schemaVersion === 3, '迁移结果必须升级到 schema v3。');
  assert(first.results.some((result) => result.command?.action === 'delete' && !Object.hasOwn(result.command, 'value')), '旧 delete null 占位必须迁移为省略 value。');
  assert(!first.results.some((result) => result.command?.key?.startsWith('(解析失败')), '解析失败占位不得继续作为可执行命令。');
  assert((first.diagnostics ?? []).length > 0, '坏命令和占位必须转为结构化诊断。');
  assert(new Set((first.diagnostics ?? []).map((item) => JSON.stringify(item))).size === first.diagnostics.length, '同一坏命令的迁移诊断不得重复累积。');

  const identityBase = { turn: 3, timestamp: 99, source: 'calibration', rawText: 'same response', results: [] };
  const valueA = migrateVariableCommandBatch({
    ...identityBase,
    results: [{ ok: true, command: { action: 'set', key: '世界.当前天气', value: '晴朗' } }],
  });
  const valueAAgain = migrateVariableCommandBatch({
    ...identityBase,
    results: [{ ok: true, command: { action: 'set', key: '世界.当前天气', value: '晴朗' } }],
  });
  const valueB = migrateVariableCommandBatch({
    ...identityBase,
    results: [{ ok: true, command: { action: 'set', key: '世界.当前天气', value: '暴风雪' } }],
  });
  assert(valueA.id === valueAAgain.id, '同一旧批次重复迁移必须得到稳定 ID。');
  assert(valueA.id !== valueB.id, '不同命令值的旧批次不得共享迁移 ID。');

  console.log('variable batch migration regression passed.');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
