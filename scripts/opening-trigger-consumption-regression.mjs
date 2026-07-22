#!/usr/bin/env node
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const bundled = await build({
  stdin: {
    contents: [
      "export { consumePendingOpeningTrigger } from './src/kernel/application/consumePendingOpeningTrigger';",
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
const { consumePendingOpeningTrigger } = await import(moduleUrl);

let snapshot = {
  sessionId: 'opening-session', revision: 0,
  state: {
    story: {
      traveler: {}, world: {}, conversation: { history: [], turnJournal: [], turnCount: 1 },
      memory: { system: {}, yiting: {} }, characters: { npcs: [] }, phone: {}, album: {}, news: [],
      plot: { nodes: [], weaving: {} }, systems: { variableBatches: [] },
      turn: { pendingOpeningTrigger: '[system] opening' }, policy: {},
      content: { zhikuRuntime: {}, worldbookTriggerStates: {} }, jobs: { records: [] },
    },
  },
};
const commands = new Map();
const repository = {
  findByCommandId: async (_sessionId, commandId) => commands.get(commandId) ?? null,
  read: async () => structuredClone(snapshot),
  compareAndSwap: async (input) => {
    if (input.expectedRevision !== snapshot.revision) return { type: 'conflict', actualRevision: snapshot.revision };
    snapshot = { sessionId: input.sessionId, revision: snapshot.revision + 1, state: structuredClone(input.nextState) };
    commands.set(input.commandId, { snapshot: structuredClone(snapshot), fingerprint: input.fingerprint });
    return { type: 'committed', snapshot: structuredClone(snapshot) };
  },
};

async function collect(iterable) {
  const frames = [];
  for await (const frame of iterable) frames.push(frame);
  return frames;
}

const stale = await collect(consumePendingOpeningTrigger({
  protocolVersion: 1, sessionId: 'opening-session', commandId: 'stale-command', expectedRevision: 0,
  command: { type: 'turn.opening.consume', trigger: '[system] stale' },
}, repository));
assert.equal(stale.at(-1)?.type, 'rejected');
assert.equal(stale.at(-1)?.error.code, 'no_changes');
assert.equal((await repository.read('opening-session')).state.story.turn.pendingOpeningTrigger, '[system] opening');

const consumed = await collect(consumePendingOpeningTrigger({
  protocolVersion: 1, sessionId: 'opening-session', commandId: 'consume-command', expectedRevision: 0,
  command: { type: 'turn.opening.consume', trigger: '[system] opening' },
}, repository));
assert.equal(consumed.at(-1)?.type, 'committed');
assert.equal(consumed.at(-1)?.view.story.turn.pendingOpeningTrigger, null);

const duplicate = await collect(consumePendingOpeningTrigger({
  protocolVersion: 1, sessionId: 'opening-session', commandId: 'duplicate-command', expectedRevision: 1,
  command: { type: 'turn.opening.consume', trigger: '[system] opening' },
}, repository));
assert.equal(duplicate.at(-1)?.type, 'rejected');
assert.equal(duplicate.at(-1)?.error.code, 'no_changes');
assert.equal((await repository.read('opening-session')).revision, 1);

const app = readFileSync('App.tsx', 'utf8');
const useGame = readFileSync('hooks/useGame.ts', 'utf8');
assert.match(app, /actions\.handleOpeningTrigger\(text\)/);
assert.doesNotMatch(app, /handleSend\(text\)\.catch\(\(\) => \{ openingTriggerSentRef\.current = null/);
assert.match(useGame, /turns\.consumeOpening\(\{ trigger: text \}\)/);
assert.match(useGame, /scope: 'ui\.opening-trigger'/);

console.log('opening trigger consumption regression ok');
