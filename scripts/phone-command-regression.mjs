#!/usr/bin/env node
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({
  stdin: { contents: [
    "export { PersistentSessionRepository } from './src/kernel/adapters/indexeddb/PersistentSessionRepository';",
    "export { executePhoneCommand } from './src/kernel/application/executePhoneCommand';",
    "export { splitSettings } from './models/settingsPlanes';",
    "export { 创建空API设置, 创建默认游戏设置 } from './models/settings';",
  ].join('\n'), resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  alias: { '@': process.cwd() }, logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
const { PersistentSessionRepository, executePhoneCommand, splitSettings, 创建空API设置, 创建默认游戏设置 } = await import(moduleUrl);

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
flatSettings.手机系统 = { ...flatSettings.手机系统, enabled: true, contactCooldownTurns: 2, groupCooldownTurns: 2, privateArchiveThreshold: 8, groupArchiveThreshold: 12, api: {}, autoGenerateSeeds: true };
flatSettings.记忆系统 = { ...flatSettings.记忆系统, 即时转短期阈值: 99, 短期转中期阈值: 99, 中期转长期阈值: 99, NPC记忆压缩阈值: 15, NPC记忆压缩提示词: '' };
const planes = splitSettings(flatSettings, 创建空API设置(), 'deepspace');
const story = {
  traveler: { 姓名: '旅人', 背包: [] }, world: { 当前日期: '今天' }, conversation: { history: [], turnJournal: [], turnCount: 3 },
  memory: { system: { 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] }, yiting: { 回忆档案: [] } },
  content: { zhikuRuntime: { 条目: [] }, worldbookTriggerStates: {} }, phone: { contacts: [], chats: [], messageSeeds: [], unreadTotal: 0 },
  characters: { npcs: [{ id: 'npc-1', 姓名: '三月七', 关系: 'friend', 好感度: 50, 同行记忆: [], 总结记忆: [] }] },
  album: { assets: [], entries: [], tasks: [], bindings: [] }, news: [], plot: { nodes: [], weaving: {} },
  systems: { variableBatches: [] }, jobs: { records: [] }, turn: { pendingOpeningTrigger: null },
  policy: planes.story,
};
const repository = new PersistentSessionRepository(new MemoryBackend());
await repository.create({ sessionId: 'phone-session', commandId: 'create', fingerprint: 'create', initialState: { story } });
const dependencies = {
  sessions: repository,
  context: { captureDeviceOverlay: async () => ({ apiSettings: planes.apiProfiles, executionPolicy: planes.execution, appearance: planes.appearance, content: planes.content, savePolicy: planes.save, worldbooks: [] }) },
  replies: { generate: async () => ({ messages: ['收到，马上来。', '路上再说。', '别乱跑。', '等我。'], summary: '三月七答应会合' }) },
  signal: new AbortController().signal,
  clock: { now: () => 99 },
};
const collect = async (iterable) => { const frames = []; for await (const frame of iterable) frames.push(frame); return frames; };
const run = (commandId, expectedRevision, command) => collect(executePhoneCommand({ protocolVersion: 1, sessionId: 'phone-session', commandId, expectedRevision, command }, dependencies));

const opened = await run('open', 0, { type: 'phone.open-private-chat', npcId: 'npc-1', createdAt: 10 });
assert.equal(opened.at(-1)?.type, 'committed');
assert.equal(opened.at(-1)?.view.story.phone.chats[0].id, 'phone_chat_open');
assert.equal(opened.at(-1)?.view.story.phone.contacts[0].npcId, 'npc-1');

const sent = await run('send', 1, { type: 'phone.send', chatId: 'phone_chat_open', text: '在哪里会合？', createdAt: 11 });
assert.equal(sent.at(-1)?.type, 'committed');
assert.equal(sent.at(-1)?.view.story.phone.chats[0].messages.length, 5);
assert.equal(sent.at(-1)?.view.story.memory.system.即时记忆.some((line) => line.includes('三月七答应会合')), true);
assert.equal(sent.at(-1)?.view.story.characters.npcs[0].同行记忆.some((entry) => entry.来源 === '手机'), true);

console.log('phone command regression ok');
