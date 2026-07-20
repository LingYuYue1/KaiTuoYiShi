#!/usr/bin/env node
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({
  stdin: {
    contents: [
      "export { PersistentSessionRepository } from './src/kernel/adapters/indexeddb/PersistentSessionRepository';",
      "export { dropSessionInventoryItem, undoSessionInventoryDrop } from './src/kernel/application/executeInventoryCommand';",
      "export { createDefaultSettingsPlanes } from './models/settingsPlanes';",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  alias: { '@': process.cwd() },
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
const { PersistentSessionRepository, dropSessionInventoryItem, undoSessionInventoryDrop, createDefaultSettingsPlanes } = await import(moduleUrl);

class MemoryBackend {
  sessions = new Map();
  commands = new Map();

  async runAtomic(work) {
    const sessionWrites = new Map();
    const commandWrites = new Map();
    const result = await work({
      getSession: async (id) => structuredClone(sessionWrites.get(id) ?? this.sessions.get(id) ?? null),
      getCommand: async (sessionId, commandId) => structuredClone(
        commandWrites.get(`${sessionId}\0${commandId}`) ?? this.commands.get(`${sessionId}\0${commandId}`) ?? null,
      ),
      putSession: (record) => sessionWrites.set(record.sessionId, structuredClone(record)),
      putCommand: (record) => commandWrites.set(record.id, structuredClone(record)),
    });
    for (const [id, record] of sessionWrites) this.sessions.set(id, record);
    for (const [id, record] of commandWrites) this.commands.set(id, record);
    return result;
  }
}

const story = {
  traveler: {
    姓名: '测试旅人',
    背包: [{
      id: 'item-1', 类别: 'food', 名称: '热浮羊奶', 描述: '', 数量: 3,
      品质: '蓝', 可堆叠: true, 获得回合: 1,
    }],
  },
  world: {},
  conversation: { history: [], turnJournal: [], turnCount: 1 },
  memory: { system: {}, yiting: {} },
  characters: { npcs: [] }, phone: {}, album: {}, news: [],
  plot: { nodes: [], weaving: {} }, systems: { variableBatches: [] },
  turn: { pendingOpeningTrigger: null }, policy: createDefaultSettingsPlanes().story,
  content: { zhikuRuntime: {}, worldbookTriggerStates: {} }, jobs: { records: [] },
};

const repository = new PersistentSessionRepository(new MemoryBackend());
await repository.create({
  sessionId: 'inventory-session',
  commandId: 'create-command',
  fingerprint: 'create-fingerprint',
  initialState: { story },
});

async function collect(iterable) {
  const frames = [];
  for await (const frame of iterable) frames.push(frame);
  return frames;
}

const dropFrames = await collect(dropSessionInventoryItem({
  protocolVersion: 1,
  sessionId: 'inventory-session',
  commandId: 'drop-command',
  expectedRevision: 0,
  command: { type: 'inventory.drop', itemId: 'item-1', count: 2 },
}, repository));
assert.equal(dropFrames.at(-1)?.type, 'committed');
assert.equal(dropFrames.at(-1)?.view.story.traveler.背包[0].数量, 1);
const durableReceipt = await repository.findCommandReceipt('inventory-session', 'drop-command');
assert.equal(durableReceipt?.receipt.kind, 'inventory.drop');
assert.equal(durableReceipt?.receipt.item.数量, 2);
assert.equal(durableReceipt?.consumedBy, null);

const mismatchedRetry = await collect(dropSessionInventoryItem({
  protocolVersion: 1,
  sessionId: 'inventory-session',
  commandId: 'drop-command',
  expectedRevision: 0,
  command: { type: 'inventory.drop', itemId: 'item-1', count: 1 },
}, repository));
assert.equal(mismatchedRetry.at(-1)?.type, 'rejected');
assert.equal(mismatchedRetry.at(-1)?.error.code, 'duplicate_command');
assert.equal((await repository.read('inventory-session')).state.story.traveler.背包[0].数量, 1);

const undoFrames = await collect(undoSessionInventoryDrop({
  protocolVersion: 1,
  sessionId: 'inventory-session',
  commandId: 'undo-command',
  expectedRevision: 1,
  command: { type: 'inventory.undo-drop', dropCommandId: 'drop-command' },
}, repository));
assert.equal(undoFrames.at(-1)?.type, 'committed');
assert.equal(undoFrames.at(-1)?.view.story.traveler.背包[0].数量, 3);
assert.equal((await repository.findCommandReceipt('inventory-session', 'drop-command'))?.consumedBy, 'undo-command');

const secondUndo = await collect(undoSessionInventoryDrop({
  protocolVersion: 1,
  sessionId: 'inventory-session',
  commandId: 'second-undo-command',
  expectedRevision: 2,
  command: { type: 'inventory.undo-drop', dropCommandId: 'drop-command' },
}, repository));
assert.equal(secondUndo.at(-1)?.type, 'rejected');
assert.equal(secondUndo.at(-1)?.error.code, 'no_changes');
assert.equal((await repository.read('inventory-session')).state.story.traveler.背包[0].数量, 3);

console.log('inventory command regression ok');
