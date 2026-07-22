#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

const bundled = await build({
  stdin: { contents: [
    "export { NativeKernel } from './src/kernel/NativeKernel';",
    "export { PersistentSessionRepository } from './src/kernel/adapters/indexeddb/PersistentSessionRepository';",
    "export { splitSettings } from './models/settingsPlanes';",
    "export { 创建空API设置, 创建默认游戏设置 } from './models/settings';",
  ].join('\n'), resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  alias: { '@': process.cwd() }, logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
const { NativeKernel, PersistentSessionRepository, splitSettings, 创建空API设置, 创建默认游戏设置 } = await import(moduleUrl);

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
flatSettings.文生图系统.正文生图.enabled = true;
const apiSettings = 创建空API设置();
apiSettings.activeConfigId = 'test-api';
apiSettings.configs.push({ id: 'test-api', name: 'test', provider: 'openai_compatible', baseUrl: '', apiKey: '', model: 'test', createdAt: 0, updatedAt: 0 });
const planes = splitSettings(flatSettings, apiSettings, 'deepspace');
const job = {
  id: 'job-1', sessionId: 'cancel-session', sourceRevision: 0,
  payload: { kind: 'narrative-image.generate', messageId: 'assistant-1' },
  maxAttempts: 2, createdAt: 0, state: 'queued', attempt: 0, availableAt: 0,
};
const story = {
  traveler: { 姓名: '旅人', 背包: [] }, world: { 当前日期: '今天' },
  conversation: { history: [
    { id: 'user-1', role: 'user', content: '继续', timestamp: 1 },
    { id: 'assistant-1', role: 'assistant', content: '场景', timestamp: 2, parsedResponse: { body: '场景' } },
  ], turnJournal: [], turnCount: 2 },
  memory: { system: { 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [] }, yiting: { 回忆档案: [] } },
  content: { zhikuRuntime: { 条目: [] }, worldbookTriggerStates: {} },
  phone: { contacts: [], chats: [], messageSeeds: [], unreadTotal: 0 }, characters: { npcs: [] },
  album: { assets: [], entries: [], tasks: [], bindings: [] }, news: [], plot: { nodes: [], weaving: {} },
  systems: { variableBatches: [] }, jobs: { records: [job] }, turn: { pendingOpeningTrigger: null }, policy: planes.story,
};

const repository = new PersistentSessionRepository(new MemoryBackend());
await repository.create({ sessionId: 'cancel-session', commandId: 'create', fingerprint: 'create', initialState: { story } });
let sequence = 0;
let markGeneratorStarted;
const generatorStarted = new Promise((resolve) => { markGeneratorStarted = resolve; });
const logs = [];
const createKernel = (sessions, generate, entries) => new NativeKernel({
  sessions,
  context: { captureDeviceOverlay: async () => ({ apiSettings: planes.apiProfiles, executionPolicy: planes.execution, appearance: planes.appearance, content: planes.content, savePolicy: planes.save, worldbooks: [] }) },
  content: {}, storyWeaving: {}, phoneReplies: {},
  albumAuthoring: { parseStorySnapshot: async () => ({ prompt: 'scene', negativePrompt: '', title: 'scene' }) },
  albumImages: { generate },
  clock: { now: () => ++sequence }, ids: { next: (prefix) => `${prefix}-${++sequence}` },
  logger: { write: (entry) => entries.push(entry) },
});
const kernel = createKernel(repository, async (_settings, _request, signal) => {
    markGeneratorStarted();
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('User cancelled job', 'AbortError')), { once: true }));
  }, logs);

await kernel.read({ type: 'session.read', sessionId: 'cancel-session' });
await generatorStarted;
const running = await repository.read('cancel-session');
const frames = [];
for await (const frame of kernel.execute({
  protocolVersion: 1, commandId: 'user-cancel', sessionId: 'cancel-session', expectedRevision: running.revision,
  command: { type: 'job.cancel', jobId: 'job-1', reason: 'Cancelled by User', cancelledAt: 99 },
})) frames.push(frame);

assert.equal(frames.at(-1)?.type, 'committed', 'User job.cancel must commit instead of losing to the session lock');
assert.equal((await repository.read('cancel-session')).state.story.jobs.records[0].state, 'cancelled', 'User cancellation must persist the durable cancelled state');
assert(logs.some((entry) => entry.scope === 'kernel.command' && entry.event === 'command.preempting'), 'job owner must log the cancellation request');
assert(logs.some((entry) => entry.scope === 'kernel.durable-job' && entry.event === 'execution.cancelled'), 'job executor must log its cancelled exit');
assert(logs.some((entry) => entry.scope === 'kernel.durable-job' && entry.event === 'cancelled'), 'persisted job cancellation must be logged');

const standaloneRepository = new PersistentSessionRepository(new MemoryBackend());
const standaloneStory = structuredClone(story);
standaloneStory.jobs.records[0] = { ...standaloneStory.jobs.records[0], id: 'job-standalone', sessionId: 'standalone-session' };
await standaloneRepository.create({ sessionId: 'standalone-session', commandId: 'create-standalone', fingerprint: 'create', initialState: { story: standaloneStory } });
const standaloneLogs = [];
const standaloneKernel = createKernel(standaloneRepository, async () => {
  throw new DOMException('Provider aborted independently', 'AbortError');
}, standaloneLogs);
await standaloneKernel.read({ type: 'session.read', sessionId: 'standalone-session' });
for (let attempt = 0; attempt < 100; attempt++) {
  if ((await standaloneRepository.read('standalone-session')).state.story.jobs.records[0].state === 'cancelled') break;
  await new Promise((resolve) => setTimeout(resolve, 0));
}
assert.equal((await standaloneRepository.read('standalone-session')).state.story.jobs.records[0].state, 'cancelled', 'unpaired AbortError must persist a terminal durable state');
assert(standaloneLogs.some((entry) => entry.scope === 'kernel.durable-job' && entry.event === 'cancelled'), 'standalone abort persistence must be logged');

const resetRepository = new PersistentSessionRepository(new MemoryBackend());
const resetStory = structuredClone(story);
resetStory.jobs.records[0] = { ...resetStory.jobs.records[0], id: 'job-before-reset', sessionId: 'reset-session' };
await resetRepository.create({ sessionId: 'reset-session', commandId: 'create-reset', fingerprint: 'create', initialState: { story: resetStory } });
let markResetJobStarted;
const resetJobStarted = new Promise((resolve) => { markResetJobStarted = resolve; });
const resetLogs = [];
const resetKernel = createKernel(resetRepository, async (_settings, _request, signal) => {
  markResetJobStarted();
  await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Reset replaced job', 'AbortError')), { once: true }));
}, resetLogs);
await resetKernel.read({ type: 'session.read', sessionId: 'reset-session' });
await resetJobStarted;
const beforeReset = await resetRepository.read('reset-session');
const replacementStory = structuredClone(resetStory);
replacementStory.jobs.records = [];
const resetFrames = [];
for await (const frame of resetKernel.execute({
  protocolVersion: 1, commandId: 'user-reset', sessionId: 'reset-session', expectedRevision: beforeReset.revision,
  command: { type: 'session.reset', story: replacementStory },
})) resetFrames.push(frame);
assert.equal(resetFrames.at(-1)?.type, 'committed', 'session.reset must replace an existing active owner');
assert.equal((await resetRepository.read('reset-session')).state.story.jobs.records.length, 0, 'session reset must commit the replacement story after preemption');
assert(resetLogs.some((entry) => entry.event === 'command.preempting' && entry.data?.reason === 'session-replacement'), 'session replacement preemption must be logged');

const nativeKernelSource = fs.readFileSync('src/kernel/NativeKernel.ts', 'utf8');
const useGameSource = fs.readFileSync('hooks/useGame.ts', 'utf8');
const inputAreaSource = fs.readFileSync('components/features/Chat/InputArea.tsx', 'utf8');
assert(nativeKernelSource.includes('logger: KernelLogger;'), 'NativeKernel logger must remain mandatory');
assert(!nativeKernelSource.includes('dependencies.logger ??'), 'NativeKernel must not hide missing logger composition');
assert(nativeKernelSource.includes("envelope.command.type === 'session.reset'"), 'session reset must have explicit preemption policy');
assert(nativeKernelSource.includes("event: 'command.admitted'"), 'kernel must log command admission');
assert(nativeKernelSource.includes("event: 'command.released'"), 'kernel must log command release');
assert(!useGameSource.includes('if (s.loading) throw new Error(\'Cannot restart while a kernel command is running\')'), 'restart must be allowed to replace a stuck command');
assert(inputAreaSource.includes('ignoreHandledAction(onRestartOpening?.())'), 'restart click must consume async failures');

console.log('command preemption and cancellation regression ok');
