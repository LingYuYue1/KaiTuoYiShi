#!/usr/bin/env node
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const bundled = await build({
  stdin: { contents: [
    "export { SessionMigrationUseCases } from './src/kernel/application/sessionMigration';",
    "export { PortableSaveMigrationUseCases } from './src/kernel/application/portableSaveMigration';",
    "export { createStoryState } from './src/kernel/domain/session/storyState';",
    "export { readPortableSave } from './src/kernel/application/portableSave';",
    "export { readSessionRecord } from './src/kernel/domain/session/schema';",
    "export { 创建默认游戏设置, 创建空API设置 } from './models/settings';",
  ].join('\n'), resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  alias: { '@': process.cwd() }, logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
const {
  SessionMigrationUseCases,
  PortableSaveMigrationUseCases,
  createStoryState,
  readSessionRecord,
  readPortableSave,
  创建默认游戏设置,
  创建空API设置,
} = await import(moduleUrl);

const story = createStoryState({ traveler: { 姓名: '迁移旅人' }, world: {}, initialNpcRecords: [], zhikuRuntime: {} });
const runtime = {
  旅人: story.traveler, 世界: story.world, chatHistory: [], 记忆: story.memory.system, 忆庭: story.memory.yiting,
  智库: story.content.zhikuRuntime, 手机: story.phone, NPC: story.characters.npcs, 相册: story.album,
  新闻: story.news, 剧情: story.plot.nodes, 剧情编织: story.plot.weaving, variableBatches: [], queueTasks: [],
  apiSettings: 创建空API设置(), gameSettings: 创建默认游戏设置(), currentTheme: 'deepspace', worldbooks: [], turnCount: 1,
};
let row = { schemaVersion: 2, sessionId: 'local-session', revision: 7, state: { runtime } };
const settings = new Map();
settings.set('apiSettings', { activeConfigId: 'live-device', configs: [] });
settings.set('executionPolicy', { marker: 'live-device' });
const migration = new SessionMigrationUseCases({
  readRaw: async () => structuredClone(row),
  replaceV2: async (_id, next) => { assert.equal(row.schemaVersion, 2); row = structuredClone(next); },
}, {
  get: async (key) => structuredClone(settings.get(key) ?? null),
  set: async (key, value) => { settings.set(key, structuredClone(value)); },
  delete: async (key) => { settings.delete(key); },
});

assert.deepEqual(await migration.inspect('local-session'), { status: 'v2-required', travelerName: '迁移旅人', turnCount: 1 });
await migration.migrateV2('local-session');
assert.equal(row.schemaVersion, 5);
assert.equal(row.revision, 7);
assert.equal(row.state.story.traveler.姓名, '迁移旅人');
for (const forbidden of ['runtime', 'apiSettings', 'gameSettings', 'currentTheme', 'worldbooks']) assert.equal(forbidden in row.state.story, false);
assert.equal(readSessionRecord(row).schemaVersion, 5);
assert.equal(settings.get('apiSettings').activeConfigId, 'live-device');
assert.equal(settings.get('executionPolicy').marker, 'live-device');
assert.ok(settings.has('contentLibrary'));
assert.equal(settings.has('savePolicy'), false);
await assert.rejects(() => migration.migrateV2('local-session'), /No V2 session/);

row = { schemaVersion: 2, sessionId: 'recover-session', revision: 1, state: { runtime } };
await migration.migrateV2('recover-session', { recoverDevicePreferences: true });
assert.equal(settings.get('apiSettings').activeConfigId, runtime.apiSettings.activeConfigId);
assert.ok(settings.has('executionPolicy') && settings.has('savePolicy'));

let portableRows = [{
  id: 42, type: 'manual', timestamp: 1234, turnCount: 1,
  旅人: story.traveler, 世界: story.world, chatHistory: [], 记忆: story.memory.system,
  忆庭: story.memory.yiting, 智库: story.content.zhikuRuntime, 手机: story.phone, NPC: [], 相册: story.album,
  新闻: [], 剧情: [], 剧情编织: story.plot.weaving, variableBatches: [], queueTasks: [],
  gameSettings: 创建默认游戏设置(), apiSettings: 创建空API设置(), theme: 'deepspace',
}];
const portableMigration = new PortableSaveMigrationUseCases({
  readAllRaw: async () => structuredClone(portableRows),
  replaceAllCurrent: async (next) => { portableRows = structuredClone(next); },
}, {
  get: async (key) => structuredClone(settings.get(key) ?? null),
  set: async (key, value) => { settings.set(key, structuredClone(value)); },
  delete: async (key) => { settings.delete(key); },
});
assert.deepEqual(await portableMigration.inspect(), { requiredCount: 1, currentCount: 0 });
await portableMigration.migrate({ recoverDevicePreferences: false });
assert.equal(portableRows[0].portableSchemaVersion, 1);
assert.equal(portableRows[0].id, 42);
assert.equal('gameSettings' in portableRows[0], false);
assert.equal('apiSettings' in portableRows[0], false);
assert.equal(readPortableSave(portableRows[0]).旅人.姓名, '迁移旅人');
assert.deepEqual(await portableMigration.inspect(), { requiredCount: 0, currentCount: 1 });

portableRows = [{ portableSchemaVersion: 99 }];
await assert.rejects(() => portableMigration.inspect(), /无法迁移存档结构版本/);

const migrationAdapter = await readFile('src/kernel/adapters/indexeddb/IndexedDbSessionMigrationStorage.ts', 'utf8');
assert.match(migrationAdapter, /SESSION_MIGRATION_BACKUPS_STORE/);
assert.match(migrationAdapter, /objectStore\(SESSION_MIGRATION_BACKUPS_STORE\)\.put\(current\)/);
assert.ok(
  migrationAdapter.indexOf('objectStore(SESSION_MIGRATION_BACKUPS_STORE).put(current)')
    < migrationAdapter.indexOf('sessions.put(next'),
  'the exact V2 source row must be backed up before replacement is queued',
);
console.log('session V2 migration regression ok');
