#!/usr/bin/env node
/**
 * session-facade-regression.mjs — Behavior evidence for Phase 2 CommandRunner
 * + KernelSessionDirectory (IKernelIdealRefactorPlan §3 CommandHandle semantics).
 *
 * Uses a stub IKernel — no IndexedDB required.
 */

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundled = await build({
  entryPoints: ['src/kernel/application/sessionDirectory.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  alias: { '@': '.' },
  logLevel: 'silent',
});
const tempDir = mkdtempSync(join(tmpdir(), 'kty-facade-regression-'));
const tempFile = join(tempDir, 'facade.bundle.mjs');
writeFileSync(tempFile, bundled.outputFiles[0].text);
const { KernelSessionDirectory } = await import(pathToFileURL(tempFile).href);
process.on('exit', () => rmSync(tempDir, { recursive: true, force: true }));

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (!condition) { console.error(`  ✗ FAIL: ${message}`); failed++; return; }
  console.error(`  ✓ ${message}`);
  passed++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Stub kernel: turn.advance streams two deltas then commits; supports abort. */
function makeStubKernel() {
  const cancelled = new Set();
  const executed = [];
  const commitListeners = new Set();
  return {
    executed,
    cancelled,
    subscribeCommitted(listener) {
      commitListeners.add(listener);
      return () => commitListeners.delete(listener);
    },
    read: async (query) => {
      if (query.type === 'session.exists') return { sessionId: query.sessionId, exists: true };
      return {
        sessionId: query.sessionId,
        revision: 41,
        runtime: { turnCount: 1, chatHistory: [] },
        turns: [],
      };
    },
    async *execute(envelope) {
      executed.push(envelope);
      yield { type: 'accepted', commandId: envelope.commandId };
      if (envelope.command.type === 'turn.advance') {
        yield { type: 'progress', commandId: envelope.commandId, delta: { kind: 'narrative', text: '你' } };
        await sleep(5);
        if (cancelled.has(String(envelope.commandId))) {
          yield { type: 'rejected', commandId: envelope.commandId, error: { code: 'cancelled', message: 'aborted' } };
          return;
        }
        yield { type: 'progress', commandId: envelope.commandId, delta: { kind: 'narrative', text: '好' } };
        const committed = {
          type: 'committed',
          commandId: envelope.commandId,
          revision: 42,
          view: { sessionId: envelope.sessionId, revision: 42, runtime: { turnCount: 2 }, turns: [] },
        };
        for (const listener of commitListeners) listener({ view: committed.view, cause: envelope.command.type });
        yield committed;
        return;
      }
      yield { type: 'rejected', commandId: envelope.commandId, error: { code: 'unknown', message: 'unsupported' } };
    },
    cancel: async () => {},
    cancelAndWait: async (commandId) => { cancelled.add(String(commandId)); await sleep(10); },
    getPreference: async () => null,
    setPreference: async () => {},
    deletePreference: async () => {},
  };
}

let nextId = 0;
function makeDirectory(kernel) {
  return new KernelSessionDirectory(
    kernel,
    { captureDeviceOverlay: async () => { throw new Error('unused context'); } },
    { generate: async () => { throw new Error('unused skill generator'); } },
    { build: async () => { throw new Error('unused context builder'); } },
    {
      extractCharacterAnchor: async () => { throw new Error('unused album authoring'); },
      tokenizePrompt: async () => { throw new Error('unused album authoring'); },
      parseScene: async () => { throw new Error('unused album authoring'); },
      parseStorySnapshot: async () => { throw new Error('unused album authoring'); },
    },
    { now: () => 1_700_000_000_000 },
    { next: (scope) => `${scope}_test_${++nextId}` },
  );
}

console.error('\n── CommandHandle semantics ──\n');

{
  // Eager start + exactly-one-terminal without any subscriber
  const kernel = makeStubKernel();
  const directory = makeDirectory(kernel);
  const session = await directory.open('s1');
  const handle = session.turns.advance({ text: '前进' });
  const terminal = await handle.result;
  assert(terminal.outcome === 'committed', 'result settles committed with zero event consumers');
  assert(terminal.result.revision === 42, 'terminal carries committed revision');
  assert(kernel.executed.length === 1, 'execution started eagerly');
  assert(kernel.executed[0].expectedRevision === 41, 'ISession supplied expectedRevision from projection read');
  assert(kernel.executed[0].command.type === 'turn.advance', 'typed use case built the envelope');
  assert(typeof kernel.executed[0].commandId === 'string' && kernel.executed[0].commandId.length > 10, 'ISession generated command identity');
}

{
  // Multicast ordering: two subscribers see identical ordered sequences
  const kernel = makeStubKernel();
  const directory = makeDirectory(kernel);
  const session = await directory.open('s1');
  const handle = session.turns.advance({ text: '前进' });
  const a = [];
  const b = [];
  handle.events.subscribe((e) => a.push(`${e.sequence}:${e.type}`));
  handle.events.subscribe((e) => b.push(`${e.sequence}:${e.type}`));
  await handle.result;
  await sleep(5);
  assert(a.length > 0 && a.join('|') === b.join('|'), `both subscribers saw the same ordered sequence (${a.join('|')})`);
  assert(a[0].endsWith('command.accepted'), 'sequence starts with command.accepted');
  const terminals = a.filter((e) => e.includes('command.committed') || e.includes('command.rejected'));
  assert(terminals.length === 1, 'exactly one terminal event');
  const sequences = a.map((entry) => Number(entry.split(':')[0]));
  assert(sequences.every((value, index) => value === index), 'sequence increases by one from zero');
}

{
  // Detach never cancels; cancelAndWait is the only cancel path
  const kernel = makeStubKernel();
  const directory = makeDirectory(kernel);
  const session = await directory.open('s1');
  const handle = session.turns.advance({ text: '前进' });
  const iterator = handle.events[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.return?.();
  const terminal = await handle.result;
  assert(terminal.outcome === 'committed', 'returning from event iterator did not cancel the command');
}

{
  // cancelAndWait routes through kernel and returns the terminal
  const kernel = makeStubKernel();
  const directory = makeDirectory(kernel);
  const session = await directory.open('s1');
  const handle = session.turns.advance({ text: '前进' });
  await sleep(1); // let the prologue read + first delta land
  const terminal = await handle.cancelAndWait();
  assert(terminal.outcome === 'rejected' && terminal.error.code === 'cancelled', 'cancelAndWait produced the cancelled terminal');
  const second = await handle.cancelAndWait();
  assert(second.outcome === 'rejected', 'cancelAndWait is idempotent after settlement');
}

{
  // close({cancel-and-wait}) cancels the active command
  const kernel = makeStubKernel();
  const directory = makeDirectory(kernel);
  const session = await directory.open('s1');
  const handle = session.turns.advance({ text: '前进' });
  await sleep(1);
  await session.close({ activeCommand: 'cancel-and-wait' });
  const terminal = await handle.result;
  assert(terminal.outcome === 'rejected' && terminal.error.code === 'cancelled', 'close(cancel-and-wait) cancelled the active command');
}

{
  // Command identity is stable from the moment the handle is returned
  const kernel = makeStubKernel();
  const directory = makeDirectory(kernel);
  const session = await directory.open('s1');
  const handle = session.turns.advance({ text: '前进' });
  const initialId = handle.commandId;
  await handle.result;
  assert(handle.commandId === initialId, 'commandId never changes after the handle is returned');
  assert(String(kernel.executed[0].commandId) === String(initialId), 'envelope uses the same identity the handle exposed');
}

{
  // Path mutations are semantic session commands, never component-side graph writes.
  const kernel = makeStubKernel();
  const directory = makeDirectory(kernel);
  const session = await directory.open('s1');
  await session.paths.setPrimary({ pathId: 'hunt' }).result;
  assert(kernel.executed[0].command.type === 'path.set-primary', 'path primary change uses a typed session command');
  assert(kernel.executed[0].command.pathId === 'hunt', 'path command carries only semantic input');

  await session.paths.declineAwakening().result;
  assert(kernel.executed[1].command.type === 'path.awakening.decline', 'path decline uses a typed session command');

  await session.paths.enterAwakening().result;
  assert(kernel.executed[2].command.type === 'path.awakening.enter', 'path entry uses a semantic turn command');

  await session.messages.editBody({ messageId: 'assistant-1', body: '修订正文' }).result;
  assert(kernel.executed[3].command.type === 'message.edit-body', 'message editing uses a typed session command');
  assert(kernel.executed[3].command.messageId === 'assistant-1', 'message edit carries an identity, not a history graph');

  await session.companions.setTier({ npcId: 'npc-1', tier: 'companion' }).result;
  assert(kernel.executed[4].command.type === 'companion.set-tier', 'companion tier uses a typed session command');
  assert(kernel.executed[4].command.npcId === 'npc-1', 'companion command carries only NPC identity and intent');

  await session.companions.setTraveling({ npcId: 'npc-1', traveling: true }).result;
  assert(kernel.executed[5].command.type === 'companion.set-traveling', 'companion presence uses a typed session command');

  await session.memory.compress({ layer: 'short', force: true }).result;
  assert(kernel.executed[6].command.type === 'memory.compress', 'memory compression uses a typed session command');
  assert(kernel.executed[6].command.layer === 'short', 'memory command carries a layer intent, not replacement memory state');

  await session.world.setStoryMode({ mode: 'normal' }).result;
  assert(kernel.executed[7].command.type === 'world.set-story-mode', 'story mode uses a typed session command');
  assert(!('runtime' in kernel.executed[7].command), 'story mode command cannot replace the world graph');

  await session.skills.save({
    slot: { kind: 'normal', index: 1 },
    draft: { name: '星火', description: '凝聚星火。', source: '自制', keywords: ['星火'], cost: '', cooldown: '', notes: '' },
  }).result;
  assert(kernel.executed[8].command.type === 'skill.save', 'skill save uses a typed session command');
  assert(!('traveler' in kernel.executed[8].command), 'skill save cannot replace the traveler graph');

  await session.skills.setEnabled({ skillId: 'skill-1', enabled: false }).result;
  assert(kernel.executed[9].command.type === 'skill.set-enabled', 'skill activation uses a typed session command');
  assert(kernel.executed[9].command.enabled === false, 'skill activation carries the explicit target state');

  await session.skills.delete({ skillId: 'skill-1' }).result;
  assert(kernel.executed[10].command.type === 'skill.delete', 'skill deletion uses a typed session command');
  assert(kernel.executed[10].command.skillId === 'skill-1', 'skill deletion carries only the skill identity');

  const dropHandle = session.inventory.drop({ itemId: 'item-1', count: 2 });
  await dropHandle.result;
  assert(kernel.executed[11].command.type === 'inventory.drop', 'inventory drop uses a typed session command');
  assert(!('item' in kernel.executed[11].command), 'inventory drop does not accept a UI-supplied item snapshot');

  await session.inventory.undoDrop({ dropCommandId: dropHandle.commandId }).result;
  assert(kernel.executed[12].command.type === 'inventory.undo-drop', 'inventory undo uses the durable drop command receipt');
  assert(kernel.executed[12].command.dropCommandId === dropHandle.commandId, 'inventory undo references the kernel-issued receipt identity');

  await session.inventory.use({ itemId: 'item-1' }).result;
  assert(kernel.executed[13].command.type === 'inventory.use', 'inventory use is a typed story command');

  await session.zhiku.create({ draft: { 标题: '自制资料', 分类: 'story' } }).result;
  assert(kernel.executed[14].command.type === 'zhiku.create', 'Zhiku creation uses a typed session command');
  assert(!('entries' in kernel.executed[14].command), 'Zhiku creation carries a draft, not a replacement library');

  await session.zhiku.update({ entryId: 'zhiku-1', patch: { 摘要: '修订摘要' } }).result;
  assert(kernel.executed[15].command.type === 'zhiku.update', 'Zhiku editing uses a typed session command');
  assert(kernel.executed[15].command.entryId === 'zhiku-1', 'Zhiku editing targets one durable entry');

  await session.zhiku.delete({ entryId: 'zhiku-1' }).result;
  assert(kernel.executed[16].command.type === 'zhiku.delete', 'Zhiku deletion uses a typed session command');

  await session.zhiku.refreshBundled().result;
  assert(kernel.executed[17].command.type === 'zhiku.refresh-bundled', 'bundled Zhiku refresh resolves content inside the kernel');

  await session.plot.renameSeries({ seriesId: 'series-1', title: '新标题' }).result;
  assert(kernel.executed[18].command.type === 'plot.rename-series', 'plot rename uses a semantic session command');
  assert(!('storyWeaving' in kernel.executed[18].command), 'plot rename cannot replace the weaving graph');

  await session.plot.saveSegment({
    seriesId: 'series-1', segmentId: 'segment-1',
    draft: { title: '分段', chapterRange: '1-2', injectionEnabled: true, summary: '', priorFacts: [], endingState: [], futureReferences: [], characters: [], locations: [], factions: [] },
  }).result;
  assert(kernel.executed[19].command.type === 'plot.save-segment', 'plot segment editing uses a semantic session command');

  await session.plot.decomposeBatch({ seriesId: 'series-1', mode: 'pending' }).result;
  assert(kernel.executed[20].command.type === 'plot.decompose-batch', 'plot batch decomposition has one command lifecycle');

  await session.album.setReference({ entryId: 'entry-1', characterId: 'npc-1', enabled: true }).result;
  assert(kernel.executed[21].command.type === 'album.set-reference', 'album reference editing uses a semantic session command');
  assert(!('album' in kernel.executed[21].command), 'album reference editing cannot replace the album graph');

  await session.album.bindSlot({ entryId: 'entry-1', targetKind: 'npc', targetId: 'npc-1', targetType: 'npc', slot: 'avatar', source: '文生图' }).result;
  assert(kernel.executed[22].command.type === 'album.bind-slot', 'album binding and character projection share one command lifecycle');

  await session.album.deleteEntries({ entryIds: ['entry-1'] }).result;
  assert(kernel.executed[23].command.type === 'album.delete-entries', 'album deletion and binding cleanup share one command lifecycle');
}

{
  // cancelAndWait during an unresolved revision read still routes cancellation
  const kernel = makeStubKernel();
  const slowRead = kernel.read;
  kernel.read = async (query) => {
    if (query.type === 'session.read') await sleep(30); // stall the prologue
    return slowRead(query);
  };
  const directory = makeDirectory(kernel);
  const session = await directory.open('s1');
  const handle = session.turns.advance({ text: '前进' });
  const terminal = await handle.cancelAndWait(); // called before the read resolves
  assert(terminal.outcome === 'rejected' && terminal.error.code === 'cancelled',
    'early cancelAndWait cancels the command as soon as it starts');
}

{
  // Same-tick cancellation must wait until the executor has registered the
  // command; an executor is allowed to ignore cancellation for unknown IDs.
  const active = new Set();
  const cancelled = new Set();
  const kernel = makeStubKernel();
  kernel.execute = async function* (envelope) {
    active.add(String(envelope.commandId));
    try {
      yield { type: 'accepted', commandId: envelope.commandId };
      await sleep(5);
      if (cancelled.has(String(envelope.commandId))) {
        yield { type: 'rejected', commandId: envelope.commandId, error: { code: 'cancelled', message: 'aborted' } };
        return;
      }
      yield {
        type: 'committed', commandId: envelope.commandId, revision: 42,
        view: { sessionId: envelope.sessionId, revision: 42, runtime: { turnCount: 2 }, turns: [] },
      };
    } finally {
      active.delete(String(envelope.commandId));
    }
  };
  kernel.cancelAndWait = async (commandId) => {
    if (active.has(String(commandId))) cancelled.add(String(commandId));
  };

  const directory = makeDirectory(kernel);
  const session = await directory.open('s1');
  const handle = session.turns.advance({ text: '前进' });
  const terminal = await handle.cancelAndWait();
  assert(terminal.outcome === 'rejected' && terminal.error.code === 'cancelled',
    'same-tick cancel waits for executor registration before routing cancellation');
}

console.error(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
console.error('session facade regression ok');
