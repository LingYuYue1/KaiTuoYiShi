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
const zhikuInjection = {
  类型: 'character',
  核心身份与阵营: '测试身份',
  独立人格与行为: '测试人格',
  说话方式: '测试说话方式',
  台词语料: '测试台词语料',
  外貌锚点: '测试外貌',
  当前形态与能力边界: '测试能力边界',
  精简角色故事: '测试故事',
  演绎红线: '测试红线',
};
const builtinZhikuEntry = {
  id: 'JS-999',
  标题: '内置测试人物',
  分类: 'character',
  摘要: '内置摘要',
  原文: `内置完整预览绝不能进入快照${'档案'.repeat(8_000)}`,
  注入内容: { ...zhikuInjection, 台词语料: '内置台词'.repeat(2_000) },
  来源: '内置测试来源',
  关键词: ['内置测试人物'],
  关联条目ID: [],
  重要度: 5,
  可用于联动: true,
  运行时解锁状态: '已解锁',
  运行时解锁备注: '快照覆盖',
  builtin: true,
  createdAt: 1,
  updatedAt: 1,
};
const customZhikuEntry = {
  ...builtinZhikuEntry,
  id: 'ZZ-999',
  标题: '自制测试人物',
  原文: '自制资料必须随快照保留',
  注入内容: zhikuInjection,
  运行时解锁状态: undefined,
  运行时解锁备注: undefined,
  builtin: false,
};
const input = {
  旅人: { 姓名: '开拓者', profile: { level: 10 }, shared },
  世界: { location: { name: '空间站' }, shared },
  记忆: { debugPrompt: longDebugText },
  忆庭: { entries: [{ id: 'memory-1', text: 'before' }] },
  智库: {
    目录版本: 'catalog:test',
    目录修订: 7,
    条目: [builtinZhikuEntry, customZhikuEntry],
  },
  手机: { wallpaper: albumImage, draftImage: orphanImage },
  NPC: [{ id: 'npc-1', name: '三月七', memory: { text: 'before' } }],
  相册: {
    assets: [{ id: 'album-1', dataUrl: albumImage, originalUrl: albumImage }],
  },
  新闻: [{ id: 'news-1', title: 'before' }],
  剧情: { current: { title: 'before' } },
  剧情编织: undefined,
  variableBatches: [{ id: 'batch-1', commands: [{ path: '旅人.等级', value: 10 }] }],
  queueTasks: Array.from({ length: 15 }, (_, index) => ({
    id: `task-${index}`,
    type: 'main_story',
    status: 'success',
    rawText: longDebugText,
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
assert.equal(snapshot.queueTasks.length, 12);
assert.equal(snapshot.queueTasks[0].id, 'task-3');
assert(snapshot.queueTasks.every((task) => task.rawText.length < longDebugText.length));
const snapshotZhiku = snapshot.智库;
assert.equal(snapshotZhiku.目录版本, 'catalog:test');
assert.equal(snapshotZhiku.目录修订, 7);
assert.equal(snapshotZhiku.条目.filter((entry) => entry.id === 'JS-999').length, 1);
assert.equal(snapshotZhiku.条目.filter((entry) => entry.id === 'ZZ-999').length, 1);
const compactedBuiltin = snapshotZhiku.条目.find((entry) => entry.id === 'JS-999');
const compactedCustom = snapshotZhiku.条目.find((entry) => entry.id === 'ZZ-999');
assert.equal(compactedBuiltin.原文, '');
assert.equal(compactedBuiltin.注入内容, undefined);
assert.equal(compactedBuiltin.运行时解锁备注, '快照覆盖');
assert.equal(compactedCustom.原文, '自制资料必须随快照保留');
assert.equal(compactedCustom.注入内容.说话方式, '测试说话方式');
assert(!serialized.includes('内置完整预览绝不能进入快照'));
assert(JSON.stringify(snapshotZhiku).length < JSON.stringify(input.智库).length / 3, 'Zhiku runtime snapshot must be materially smaller than the full catalog');

console.log('[reroll-snapshot-isolation] ok');
