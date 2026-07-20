import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadCompactor() {
  const bundled = await build({
    entryPoints: ['utils/saveRuntimeCompactor.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  const source = bundled.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const { compactPreTurnSnapshot } = await loadCompactor();
const albumImage = `data:image/png;base64,${'a'.repeat(2048)}`;
const orphanImage = `data:image/jpeg;base64,${'b'.repeat(2048)}`;
const shared = { nested: { value: 'before' } };
const longDebugText = 'x'.repeat(10_000);
const input = {
  旅人: { 姓名: '开拓者', profile: { level: 10 }, shared },
  世界: { location: { name: '空间站' }, shared },
  记忆: { debugPrompt: longDebugText },
  忆庭: { entries: [{ id: 'memory-1', text: 'before' }] },
  智库: { records: [{ id: 'record-1', title: 'before' }] },
  手机: { wallpaper: albumImage, draftImage: orphanImage },
  NPC: [{ id: 'npc-1', name: '三月七', memory: { text: 'before' } }],
  相册: {
    assets: [{ id: 'album-1', dataUrl: albumImage, originalUrl: albumImage }],
  },
  新闻: [{ id: 'news-1', title: 'before' }],
  剧情: { current: { title: 'before' } },
  剧情编织: undefined,
  variableBatches: [{ id: 'batch-1', commands: [{ path: '旅人.等级', value: 10 }] }],
  jobs: Array.from({ length: 15 }, (_, index) => ({
    id: `job-${index}`, sessionId: 'session', sourceRevision: 1,
    payload: { kind: 'news.generate', messageId: `message-${index}`, playerText: 'input' },
    maxAttempts: 3, createdAt: index, state: 'queued', attempt: 0, availableAt: index,
  })),
  turnCount: 12,
  pendingOpeningTrigger: null,
};

const snapshot = compactPreTurnSnapshot(input);

assert.notEqual(snapshot, input);
assert.notEqual(snapshot.旅人, input.旅人);
assert.notEqual(snapshot.旅人.profile, input.旅人.profile);
assert.notEqual(snapshot.NPC, input.NPC);
assert.notEqual(snapshot.NPC[0].memory, input.NPC[0].memory);
assert.equal(snapshot.旅人.shared, snapshot.世界.shared, 'shared input references should remain shared inside the clone');
assert.notEqual(snapshot.旅人.shared, shared, 'shared clone must not point back to runtime state');

input.旅人.profile.level = 99;
input.NPC[0].memory.text = 'after';
shared.nested.value = 'after';
input.variableBatches[0].commands[0].value = 99;
assert.equal(snapshot.旅人.profile.level, 10);
assert.equal(snapshot.NPC[0].memory.text, 'before');
assert.equal(snapshot.旅人.shared.nested.value, 'before');
assert.equal(snapshot.variableBatches[0].commands[0].value, 10);

snapshot.世界.location.name = '贝洛伯格';
snapshot.忆庭.entries[0].text = 'snapshot-only';
assert.equal(input.世界.location.name, '空间站');
assert.equal(input.忆庭.entries[0].text, 'before');

const serialized = JSON.stringify(snapshot);
assert(!serialized.includes('data:image/'), 'snapshot must not retain Base64 image payloads');
assert.equal(snapshot.相册.assets[0].dataUrl, 'asset:album-1');
assert.equal(snapshot.相册.assets[0].originalUrl, undefined);
assert.equal(snapshot.手机.wallpaper, 'asset:album-1');
assert.equal(snapshot.手机.draftImage, '[图片数据已从运行快照省略]');
assert(snapshot.记忆.debugPrompt.length < longDebugText.length);
assert.match(snapshot.记忆.debugPrompt, /运行快照已截断/);
assert.equal(snapshot.jobs.length, 15);
assert.equal(snapshot.jobs[0].id, 'job-0');

console.log('[reroll-snapshot-isolation] ok');
