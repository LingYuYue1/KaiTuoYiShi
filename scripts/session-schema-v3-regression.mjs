#!/usr/bin/env node
/** Exact current-session schema regression. No previous schema is accepted. */

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundled = await build({
  entryPoints: ['src/kernel/domain/session/schema.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  alias: { '@': '.' },
  logLevel: 'silent',
});
const tempDir = mkdtempSync(join(tmpdir(), 'kty-schema-regression-'));
const tempFile = join(tempDir, 'schema.bundle.mjs');
writeFileSync(tempFile, bundled.outputFiles[0].text);
const schema = await import(pathToFileURL(tempFile).href);
process.on('exit', () => rmSync(tempDir, { recursive: true, force: true }));

const { readSessionRecord, SESSION_SCHEMA_VERSION, SessionSchemaError } = schema;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
    return;
  }
  console.error(`  ✓ ${message}`);
  passed++;
}

function turnSnapshot() {
  return {
    旅人: { 姓名: '开拓者' }, 世界: {}, 记忆: {}, 忆庭: {}, 智库: {}, 手机: {},
    NPC: [], 相册: {}, 新闻: [], 剧情: [], 剧情编织: {}, variableBatches: [],
    jobs: [], turnCount: 1, pendingOpeningTrigger: null,
  };
}

function storyPolicy() {
  return {
    news: {}, phone: {}, zhiku: {}, storyWeaving: {}, memory: {}, image: {},
    extraFeatures: {}, starMap: {}, enableMaleNsfwArchive: false,
  };
}

function currentRecord() {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId: 'test-session',
    revision: 7,
    state: {
      story: {
        traveler: { 姓名: '开拓者' },
        world: {},
        conversation: { history: [], turnCount: 1, turnJournal: [{
          turnIndex: 1,
          committedRevision: 0,
          committedAt: 0,
          preTurnSnapshot: turnSnapshot(),
        }] },
        memory: { system: {}, yiting: {} },
        characters: { npcs: [] },
        phone: {},
        album: {},
        news: [],
        plot: { nodes: [], weaving: {} },
        systems: { variableBatches: [] },
        turn: { pendingOpeningTrigger: null },
        policy: storyPolicy(),
        content: { zhikuRuntime: {}, worldbookTriggerStates: { wb_1: 3 } },
        jobs: { records: [] },
      },
    },
  };
}

function readFailure(value) {
  try {
    readSessionRecord(value);
    return null;
  } catch (error) {
    return error;
  }
}

console.error('\n── Exact current schema only ──\n');
{
  const record = readSessionRecord(currentRecord());
  assert(record.schemaVersion === SESSION_SCHEMA_VERSION, 'current schema is accepted');
  assert(record.revision === 7, 'revision is preserved');

  const old = currentRecord();
  old.schemaVersion = SESSION_SCHEMA_VERSION - 1;
  const error = readFailure(old);
  assert(error instanceof SessionSchemaError && error.code === 'schema_mismatch', 'previous schema is rejected without migration');
}

console.error('\n── Device plane is impossible in stored state ──\n');
for (const [field, value] of [
  ['apiSettings', { configs: [] }],
  ['gameSettings', {}],
  ['currentTheme', 'deepspace'],
  ['worldbooks', []],
]) {
  const poisoned = currentRecord();
  poisoned.state.story[field] = value;
  const error = readFailure(poisoned);
  assert(error instanceof SessionSchemaError && error.message.includes(field), `${field} is rejected`);
}

for (const field of ['apiSettings', 'gameSettings', 'currentTheme', 'worldbooks']) {
  const poisoned = currentRecord();
  poisoned.state.story[field] = undefined;
  const error = readFailure(poisoned);
  assert(error instanceof SessionSchemaError && error.message.includes(field), `${field} key is rejected even when undefined`);
}

console.error('\n── Story authority fields are exact ──\n');
for (const [path, value] of [
  [['conversation', 'turnJournal'], {}],
  [['conversation', 'turnJournal'], [{ turnIndex: 1, committedRevision: 0, committedAt: 0, preTurnSnapshot: { jobs: [] } }]],
  [['content', 'worldbookTriggerStates'], 'invalid'],
  [['content', 'worldbookTriggerStates'], { wb: 'invalid' }],
  [['turn', 'pendingOpeningTrigger'], 42],
  [['characters', 'npcs'], null],
  [['jobs', 'records'], null],
  [['policy', 'news'], null],
  [['plot', 'weaving'], null],
]) {
  const poisoned = currentRecord();
  poisoned.state.story[path[0]][path[1]] = value;
  assert(readFailure(poisoned) instanceof SessionSchemaError, `${path.join('.')} malformed shape is rejected`);
}

console.error('\n── Writer and reader share the exact boundary ──\n');
{
  const state = currentRecord().state;
  assert(!('apiSettings' in state.story), 'story has no apiSettings field');
  assert(!('gameSettings' in state.story), 'story has no gameSettings field');
  assert(!('currentTheme' in state.story), 'story has no currentTheme field');
  assert(!('worldbooks' in state.story), 'story has no worldbooks field');
  assert(readFailure({ ...currentRecord(), state }) === null, 'exact writer shape passes exact reader');
}

console.error(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
console.error('session schema regression ok');
