import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: ['src/kernel/domain/turn/turnJournal.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  write: false,
  logLevel: 'silent',
});
const journal = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const shared = { nested: { value: 'before' } };
const story = {
  traveler: { 姓名: '开拓者', profile: { level: 10 }, shared },
  world: { 当前地点: '空间站', shared },
  conversation: { history: [{ id: 'user-1', role: 'user', content: '前进', timestamp: 1 }], turnJournal: [], turnCount: 12 },
  memory: { system: { entries: [{ text: 'before' }] }, yiting: { entries: [] } },
  characters: { npcs: [{ id: 'npc-1', memory: { text: 'before' } }] },
  phone: { chats: [] },
  album: { assets: [{ id: 'asset-1', url: 'asset:asset-1' }], entries: [], generationTasks: [] },
  news: [{ id: 'news-1', title: 'before' }],
  plot: { nodes: [], weaving: { 系列列表: [] } },
  systems: { variableBatches: [{ id: 'batch-1', results: [] }] },
  content: { zhikuRuntime: { entries: [] }, worldbookTriggerStates: {} },
  turn: { pendingOpeningTrigger: null },
  jobs: { records: [] },
};

const snapshot = journal.captureTurnSnapshot(story);
assert.notEqual(snapshot.旅人, story.traveler);
assert.notEqual(snapshot.NPC, story.characters.npcs);
assert.equal(snapshot.旅人.shared, snapshot.世界.shared, 'shared references must remain shared inside the clone');
assert.notEqual(snapshot.旅人.shared, shared, 'snapshot references must not point back to live story state');

story.traveler.profile.level = 99;
story.characters.npcs[0].memory.text = 'after';
shared.nested.value = 'after';
assert.equal(snapshot.旅人.profile.level, 10);
assert.equal(snapshot.NPC[0].memory.text, 'before');
assert.equal(snapshot.旅人.shared.nested.value, 'before');

const next = journal.appendTurnJournalEntry(story, {
  turnIndex: 12,
  committedRevision: 8,
  committedAt: 100,
  preTurnSnapshot: snapshot,
});
assert.equal(next.conversation.turnJournal.length, 1);
assert.equal(next.conversation.turnJournal[0].preTurnSnapshot, snapshot);
assert.equal('preTurnSnapshot' in next.conversation.history[0], false, 'chat messages must not own rollback snapshots');

console.log('[reroll-snapshot-isolation] ok');
