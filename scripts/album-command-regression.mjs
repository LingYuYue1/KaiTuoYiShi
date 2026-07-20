#!/usr/bin/env node
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({
  stdin: { contents: [
    "export { PersistentSessionRepository } from './src/kernel/adapters/indexeddb/PersistentSessionRepository';",
    "export { executeAlbumCommand } from './src/kernel/application/executeAlbumCommand';",
    "export { splitSettings } from './models/settingsPlanes';",
    "export { 创建空API设置, 创建默认游戏设置 } from './models/settings';",
  ].join('\n'), resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  alias: { '@': process.cwd() }, logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
const { PersistentSessionRepository, executeAlbumCommand, splitSettings, 创建空API设置, 创建默认游戏设置 } = await import(moduleUrl);

class MemoryBackend {
  sessions = new Map(); commands = new Map();
  async runAtomic(work) {
    const sessionWrites = new Map(); const commandWrites = new Map();
    const result = await work({
      getSession: async (id) => structuredClone(sessionWrites.get(id) ?? this.sessions.get(id) ?? null),
      getCommand: async (sessionId, commandId) => structuredClone(commandWrites.get(`${sessionId}\0${commandId}`) ?? this.commands.get(`${sessionId}\0${commandId}`) ?? null),
      putSession: (record) => sessionWrites.set(record.sessionId, structuredClone(record)),
      putCommand: (record) => commandWrites.set(record.id, structuredClone(record)),
    });
    for (const [id, record] of sessionWrites) this.sessions.set(id, record);
    for (const [id, record] of commandWrites) this.commands.set(id, record);
    return result;
  }
}

const flatSettings = 创建默认游戏设置();
flatSettings.文生图系统 = { ...flatSettings.文生图系统, enabled: true, 普通接口: { ...flatSettings.文生图系统.普通接口, enabled: true, backend: 'openai_compatible' }, NSFW接口: { ...flatSettings.文生图系统.NSFW接口, enabled: false, backend: 'openai_compatible' }, 参考图: { enabled: true, enableComfyWorkflowReference: false, enableOpenAICompatibleReference: true } };
const planes = splitSettings(flatSettings, 创建空API设置(), 'deepspace');
const story = {
  traveler: { 姓名: '旅人', 背包: [] }, world: {}, conversation: { history: [], turnJournal: [], turnCount: 1 },
  memory: { system: {}, yiting: {} }, content: { zhikuRuntime: { 条目: [] }, worldbookTriggerStates: {} }, phone: {},
  characters: { npcs: [{ id: 'npc-1', 姓名: '三月七', 头像: '', 图像档案: {} }] },
  album: { assets: [], entries: [], tasks: [], bindings: [] }, news: [], plot: { nodes: [], weaving: {} },
  systems: { variableBatches: [] }, jobs: { records: [] }, turn: { pendingOpeningTrigger: null },
  policy: planes.story,
};
const repository = new PersistentSessionRepository(new MemoryBackend());
await repository.create({ sessionId: 'album-session', commandId: 'create', fingerprint: 'create', initialState: { story } });
const dependencies = {
  sessions: repository,
  context: { captureDeviceOverlay: async () => ({ apiSettings: planes.apiProfiles, executionPolicy: planes.execution, appearance: planes.appearance, content: planes.content, savePolicy: planes.save, worldbooks: [] }) },
  generator: { generate: async (_settings, request) => ({ url: 'https://example.test/generated.png', backend: 'openai_compatible', retryCount: 1, mimeType: 'image/png', referenceCount: request.references.length }) },
  signal: new AbortController().signal,
  clock: { now: () => 99 },
};
const collect = async (iterable) => { const frames = []; for await (const frame of iterable) frames.push(frame); return frames; };
const run = (commandId, expectedRevision, command) => collect(executeAlbumCommand({
  protocolVersion: 1, sessionId: 'album-session', commandId, expectedRevision, command,
}, dependencies));

const imported = await run('reference', 0, {
  type: 'album.import-reference', targetKind: 'npc', targetId: 'npc-1', name: '三月七',
  src: 'data:image/png;base64,AA==', mimeType: 'image/png', contentHash: 'a'.repeat(64), createdAt: 2,
});
assert.equal(imported.at(-1)?.type, 'committed');
assert.equal(imported.at(-1)?.view.story.album.entries[0].referenceTargets.includes('npc-1'), true);

const bound = await run('bind', 1, {
  type: 'album.bind-slot', entryId: 'album_reference', targetKind: 'npc', targetId: 'npc-1', targetType: 'npc', slot: 'avatar_phone', source: '文生图',
});
assert.equal(bound.at(-1)?.type, 'committed');
assert.equal(bound.at(-1)?.view.story.album.bindings[0].entryId, 'album_reference');
assert.equal(bound.at(-1)?.view.story.characters.npcs[0].图像档案.头像槽位.手机, 'asset:asset_reference');

const removed = await run('delete', 2, { type: 'album.delete-entries', entryIds: ['album_reference'] });
assert.equal(removed.at(-1)?.type, 'committed');
assert.equal(removed.at(-1)?.view.story.album.entries.length, 0);
assert.equal(removed.at(-1)?.view.story.characters.npcs[0].图像档案.头像槽位, undefined);

const generated = await run('generate', 3, {
  type: 'album.generate', title: '新头像', source: 'manual', prompt: 'portrait', nsfw: false,
  targetType: 'npc', targetId: 'npc-1', slot: 'avatar_profile', tags: ['生成'], createdAt: 3,
});
assert.equal(generated.at(-1)?.type, 'committed');
assert.equal(generated.at(-1)?.view.story.album.entries[0].id, 'album_generate');
assert.equal(generated.at(-1)?.view.story.album.tasks[0].id, 'img_task_generate');
assert.equal(generated.at(-1)?.view.story.album.tasks[0].retryCount, 1);

console.log('album command regression ok');
