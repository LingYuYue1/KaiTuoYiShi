#!/usr/bin/env node
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({
  stdin: {
    contents: [
      "export { PersistentSessionRepository } from './src/kernel/adapters/indexeddb/PersistentSessionRepository';",
      "export { executePlotCommand } from './src/kernel/application/executePlotCommand';",
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
const { PersistentSessionRepository, executePlotCommand, createDefaultSettingsPlanes } = await import(moduleUrl);

class MemoryBackend {
  sessions = new Map();
  commands = new Map();
  async runAtomic(work) {
    const sessionWrites = new Map();
    const commandWrites = new Map();
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

const segment = (id, group) => ({
  id, 组号: group, 标题: `第${group}段`, 章节范围: `${group}`, 章节标题: [], 是否开局组: group === 1,
  起始章序号: group, 结束章序号: group, 原文内容: '正文', 字数: 2, 原文摘要: '', 时间线起点: '', 时间线终点: '',
  开局已成立事实: [], 角色档案: [], 势力档案: [], 地图地点档案: [], 时间线: [], 关键事件: [],
  本段概括: '', 前段延续事实: [], 本段结束状态: [], 给后续参考: [], 登场角色: [], 涉及地点: [], 涉及派系: [],
  启用注入: true, 处理状态: '待处理', 运行状态: group === 1 ? '当前' : '未开始', createdAt: 1, updatedAt: 1,
});
const series = {
  id: 'series-1', 标题: '旧标题', 作品名: '旧标题', 来源类型: 'custom', 原始文本: '正文', 章节列表: [],
  分段列表: [segment('segment-1', 1), segment('segment-2', 2)], 每段章数: 1, 激活注入: true, 当前分段组号: 1,
  核心角色: [], 涉及地点索引: [], createdAt: 1, updatedAt: 1,
};
const planes = createDefaultSettingsPlanes();
const story = {
  traveler: { 姓名: '测试旅人', 背包: [] }, world: {}, conversation: { history: [], turnJournal: [], turnCount: 1 },
  memory: { system: {}, yiting: {} }, content: { zhikuRuntime: { 条目: [] }, worldbookTriggerStates: {} }, phone: {}, characters: { npcs: [] },
  album: {}, news: [], plot: { nodes: [], weaving: { 系列列表: [series], 当前系列ID: series.id } }, systems: { variableBatches: [] },
  jobs: { records: [] }, turn: { pendingOpeningTrigger: null }, policy: planes.story,
};

const repository = new PersistentSessionRepository(new MemoryBackend());
await repository.create({ sessionId: 'plot-session', commandId: 'create', fingerprint: 'create', initialState: { story } });
const collect = async (iterable) => { const frames = []; for await (const frame of iterable) frames.push(frame); return frames; };
const baseDependencies = {
  sessions: repository,
  content: { loadBundledZhiku: async () => ({ 条目: [] }), loadBundledStoryWeaving: async () => ({ 系列列表: [] }) },
  context: { captureDeviceOverlay: async () => ({ apiSettings: planes.apiProfiles, executionPolicy: planes.execution, appearance: planes.appearance, content: planes.content, savePolicy: planes.save, worldbooks: [] }) },
  signal: new AbortController().signal,
};

const rename = await collect(executePlotCommand({
  protocolVersion: 1, sessionId: 'plot-session', commandId: 'rename', expectedRevision: 0,
  command: { type: 'plot.rename-series', seriesId: 'series-1', title: '新标题', updatedAt: 2 },
}, { ...baseDependencies, processor: { decompose: async () => { throw new Error('unused'); } } }));
assert.equal(rename.at(-1)?.type, 'committed');
assert.equal(rename.at(-1)?.view.story.plot.weaving.系列列表[0].标题, '新标题');

let captures = 0;
let decompositions = 0;
const batch = await collect(executePlotCommand({
  protocolVersion: 1, sessionId: 'plot-session', commandId: 'batch', expectedRevision: 1,
  command: { type: 'plot.decompose-batch', seriesId: 'series-1', mode: 'all' },
}, {
  ...baseDependencies,
  context: { captureDeviceOverlay: async () => { captures += 1; return (await baseDependencies.context.captureDeviceOverlay()); } },
  processor: { decompose: async ({ segment: current }) => { decompositions += 1; return { ...current, 处理状态: '已完成', updatedAt: 3 }; } },
}));
assert.equal(batch.at(-1)?.type, 'committed');
assert.equal(captures, 1, 'batch captures device context once');
assert.equal(decompositions, 2, 'batch processes every target');
assert.equal(batch.at(-1)?.view.story.plot.weaving.系列列表[0].分段列表.every((item) => item.处理状态 === '已完成'), true);

const beforeFailure = await repository.read('plot-session');
await assert.rejects(() => collect(executePlotCommand({
  protocolVersion: 1, sessionId: 'plot-session', commandId: 'failed', expectedRevision: 2,
  command: { type: 'plot.decompose', seriesId: 'series-1', segmentId: 'segment-1' },
}, { ...baseDependencies, processor: { decompose: async () => { throw new Error('model failed'); } } })), /model failed/);
const afterFailure = await repository.read('plot-session');
assert.equal(afterFailure.revision, beforeFailure.revision, 'failed external work commits no story state');

console.log('plot command regression ok');
