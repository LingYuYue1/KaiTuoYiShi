/**
 * Phase 1 — LegacyKernelAdapter behavior.
 * Progress does not formal-commit; one terminal frame; reject path; translation only.
 */

import { describe, expect, it, vi } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type AdvanceTurnEnvelope,
  type ExecutionFrame,
  type SessionView,
} from '@/src/kernel/contract';
import { LegacyKernelAdapter } from '@/src/kernel/adapters/legacy/LegacyKernelAdapter';
import {
  wrapLegacyAdvanceTurn,
  buildCommittedSessionView,
} from '@/src/kernel/adapters/legacy/wrapLegacyAdvanceTurn';

const SESSION = asSessionId('phase1-session');

function advanceEnvelope(
  text: string,
  commandId = 'p1-adv-1',
  expectedRevision = 0,
): AdvanceTurnEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(commandId),
    sessionId: SESSION,
    expectedRevision: asRevision(expectedRevision),
    command: { type: 'turn.advance', input: { text } },
  };
}

describe('LegacyKernelAdapter (Phase 1)', () => {
  it('implements IKernel: progress does not formal-commit; exactly one terminal', async () => {
    let formalRevision = 0;
    const formalSnapshots: SessionView[] = [];

    const adapter = new LegacyKernelAdapter({
      advanceTurn: wrapLegacyAdvanceTurn(async (envelope, events) => {
        events.onProgress('半');
        events.onProgress('半截叙事');
        // Formal commit only after stream completes — progress must not bump revision.
        formalRevision += 1;
        const view = buildCommittedSessionView({
          sessionId: envelope.sessionId,
          revision: formalRevision,
          turnCount: 2,
          playerText: envelope.command.input.text,
          narrativeText: '半截叙事',
          messages: [
            { role: 'user', content: envelope.command.input.text },
            { role: 'assistant', content: '半截叙事' },
          ],
          commandId: envelope.commandId,
          lastProgressTexts: ['半', '半截叙事'],
        });
        formalSnapshots.push(view);
        events.onCommitted(view);
      }),
    });

    const beforeRev = formalRevision;
    const frames = await collectAsync(adapter.execute(advanceEnvelope('你好')));

    const progress = frames.filter((f) => f.type === 'progress');
    expect(progress.length).toBe(2);
    for (const frame of progress) {
      expect(frame).not.toHaveProperty('revision');
      expect(frame).not.toHaveProperty('view');
    }
    // Formal revision only advanced once at commit time (inside runner after progress).
    expect(formalRevision).toBe(beforeRev + 1);
    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)?.type).toBe('committed');
    if (frames.at(-1)?.type === 'committed') {
      expect(frames.at(-1)).toMatchObject({
        revision: asRevision(1),
        view: { turnCount: 2 },
      });
    }
    expect(formalSnapshots).toHaveLength(1);
  });

  it('reject path yields rejected and does not require formal commit', async () => {
    let formalRevision = 0;
    const adapter = new LegacyKernelAdapter({
      advanceTurn: wrapLegacyAdvanceTurn(async (_envelope, events) => {
        events.onProgress('…');
        events.onRejected({
          code: 'model_failure',
          message: 'upstream 500',
        });
      }),
    });

    const frames = await collectAsync(adapter.execute(advanceEnvelope('fail', 'p1-fail-1')));
    expect(frames.some((f) => f.type === 'progress')).toBe(true);
    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure', message: 'upstream 500' },
    });
    expect(terminalFrames(frames)).toHaveLength(1);
    expect(formalRevision).toBe(0);
  });

  it('unsupported / stub commands yield clear rejected frames (no silent no-op)', async () => {
    const adapter = new LegacyKernelAdapter({
      advanceTurn: async function* () {
        // unused
      },
    });

    const rerollFrames = await collectAsync(
      adapter.execute({
        protocolVersion: 1,
        commandId: asCommandId('p1-reroll'),
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        command: { type: 'turn.reroll', turnId: 't1' },
      }),
    );
    expect(rerollFrames).toEqual([
      expect.objectContaining({
        type: 'rejected',
        error: expect.objectContaining({ code: 'not_implemented' }),
      }),
    ]);

    const createFrames = await collectAsync(
      adapter.execute({
        protocolVersion: 1,
        commandId: asCommandId('p1-create'),
        command: { type: 'session.create', presetId: 'default' },
      }),
    );
    expect(createFrames).toEqual([
      expect.objectContaining({
        type: 'rejected',
        error: expect.objectContaining({ code: 'not_implemented' }),
      }),
    ]);
  });

  it('runner throw becomes rejected (translation, not silent success)', async () => {
    const adapter = new LegacyKernelAdapter({
      advanceTurn: wrapLegacyAdvanceTurn(async () => {
        throw new Error('legacy boom');
      }),
    });
    const frames = await collectAsync(adapter.execute(advanceEnvelope('x', 'p1-throw')));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      type: 'rejected',
      error: { code: 'unknown', message: 'legacy boom' },
    });
  });

  it('yields progress frames interleaved before terminal from async runner', async () => {
    const adapter = new LegacyKernelAdapter({
      advanceTurn: wrapLegacyAdvanceTurn(async (envelope, events) => {
        events.onProgress('A');
        await Promise.resolve();
        events.onProgress('AB');
        events.onCommitted(
          buildCommittedSessionView({
            sessionId: envelope.sessionId,
            revision: 1,
            turnCount: 2,
            playerText: envelope.command.input.text,
            narrativeText: 'AB',
            messages: [
              { role: 'user', content: envelope.command.input.text },
              { role: 'assistant', content: 'AB' },
            ],
            commandId: envelope.commandId,
          }),
        );
      }),
    });

    const seen: ExecutionFrame['type'][] = [];
    for await (const frame of adapter.execute(advanceEnvelope('stream', 'p1-stream'))) {
      seen.push(frame.type);
    }
    expect(seen[0]).toBe('progress');
    expect(seen.at(-1)).toBe('committed');
    expect(seen.filter((t) => t === 'committed' || t === 'rejected')).toHaveLength(1);
  });

  it('cancels the legacy workflow when the command iterator closes before terminal', async () => {
    const cancel = vi.fn();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const advanceTurn = wrapLegacyAdvanceTurn(async (_envelope, events) => {
      events.onProgress('waiting');
      await wait;
    }, cancel);
    const iterator = advanceTurn(advanceEnvelope('cancel'))[Symbol.asyncIterator]();

    expect((await iterator.next()).value).toMatchObject({ type: 'progress' });
    await iterator.return?.();
    expect(cancel).toHaveBeenCalledTimes(1);
    release();
  });
});
