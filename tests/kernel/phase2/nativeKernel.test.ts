/**
 * Phase 2 — NativeKernel routing + createKernel("native-turn").
 * Exit Gate: AdvanceTurn fully owned by Native Kernel when mode is native-turn.
 */

import { describe, expect, it, vi } from 'vitest';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
} from '@/src/kernel/contract';
import { createKernel } from '@/src/kernel/createKernel';
import { NativeKernel } from '@/src/kernel/NativeKernel';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';
import { LegacyKernelAdapter } from '@/src/kernel/adapters/legacy/LegacyKernelAdapter';
import {
  wrapLegacyAdvanceTurn,
  buildCommittedSessionView,
} from '@/src/kernel/adapters/legacy/wrapLegacyAdvanceTurn';
import { consumeExecution } from '@/src/ui/kernelClient/consumeExecution';

const SESSION = asSessionId('native-session');

function makeNativeDeps(opts?: { travelerName?: string }) {
  const sessions = new InMemorySessionRepository();
  sessions.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(0),
      state: { turnCount: 1, travelerName: opts?.travelerName ?? '开拓者' },
    }),
  );
  const model = new ScriptedModelGateway(async ({ playerText }) => ({
    kind: 'success' as const,
    chunks: [`叙事：${playerText}`],
    completedText: `叙事：${playerText}`,
  }));
  return { sessions, model };
}

const advanceEnvelope = {
  protocolVersion: 1 as const,
  commandId: asCommandId('nk-1'),
  sessionId: SESSION,
  expectedRevision: asRevision(0),
  command: { type: 'turn.advance' as const, input: { text: '你好' } },
};

describe('NativeKernel (Phase 2)', () => {
  it('createKernel("native-turn") returns NativeKernel, not LegacyKernelAdapter', async () => {
    const deps = makeNativeDeps();
    const kernel = await createKernel('native-turn', {
      native: { sessions: deps.sessions, model: deps.model },
    });
    expect(kernel).toBeInstanceOf(NativeKernel);
    expect(kernel).not.toBeInstanceOf(LegacyKernelAdapter);
  });

  it('turn.advance is fully executed by Native Kernel (progress + commit)', async () => {
    const deps = makeNativeDeps();
    const kernel = await createKernel('native-turn', {
      native: { sessions: deps.sessions, model: deps.model },
    });

    const frames = await collectAsync(kernel.execute(advanceEnvelope));
    expect(frames.some((f) => f.type === 'progress')).toBe(true);
    const terminal = frames.at(-1);
    expect(terminal?.type).toBe('committed');
    if (terminal?.type !== 'committed') throw new Error('expected committed');
    expect(terminal.view.messages).toEqual([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '叙事：你好' },
    ]);

    const snap = await deps.sessions.read(SESSION);
    expect(snap.revision).toBe(1);
    expect(snap.state.turnCount).toBe(2);
  });

  it('AdvanceTurn never calls legacy advanceTurn port', async () => {
    const deps = makeNativeDeps();
    const legacyAdvance = vi.fn(
      wrapLegacyAdvanceTurn(async (env, events) => {
        events.onCommitted(
          buildCommittedSessionView({
            sessionId: env.sessionId,
            revision: 99,
            turnCount: 99,
            playerText: 'legacy',
            narrativeText: 'legacy',
            messages: [],
            commandId: env.commandId,
          }),
        );
      }),
    );

    const kernel = await createKernel('native-turn', {
      native: {
        sessions: deps.sessions,
        model: deps.model,
        legacy: { advanceTurn: legacyAdvance },
      },
    });

    const frames = await collectAsync(kernel.execute(advanceEnvelope));
    expect(legacyAdvance).not.toHaveBeenCalled();
    const terminal = frames.at(-1);
    expect(terminal?.type).toBe('committed');
    if (terminal?.type === 'committed') {
      expect(terminal.revision).toBe(1);
      expect(terminal.revision).not.toBe(99);
    }
  });

  it('turn.reroll without matching turnId is rejected by native path (not not_implemented)', async () => {
    const deps = makeNativeDeps();
    const kernel = new NativeKernel({
      sessions: deps.sessions,
      model: deps.model,
    });
    const frames = await collectAsync(
      kernel.execute({
        protocolVersion: 1,
        commandId: asCommandId('reroll-1'),
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        command: { type: 'turn.reroll', turnId: 't1' },
      }),
    );
    expect(frames).toEqual([
      expect.objectContaining({
        type: 'rejected',
        error: expect.objectContaining({
          code: 'unknown',
          message: expect.stringMatching(/Unknown turnId/),
        }),
      }),
    ]);
  });

  it('session.create without legacy falls back to not_implemented', async () => {
    const deps = makeNativeDeps();
    const kernel = new NativeKernel({
      sessions: deps.sessions,
      model: deps.model,
    });
    const frames = await collectAsync(
      kernel.execute({
        protocolVersion: 1,
        commandId: asCommandId('create-1'),
        command: { type: 'session.create', presetId: 'p1' },
      }),
    );
    expect(frames).toEqual([
      expect.objectContaining({
        type: 'rejected',
        error: expect.objectContaining({ code: 'not_implemented' }),
      }),
    ]);
  });

  it('read(session.read) projects from SessionRepository', async () => {
    const deps = makeNativeDeps();
    const kernel = await createKernel('native-turn', {
      native: { sessions: deps.sessions, model: deps.model },
    });
    await collectAsync(kernel.execute(advanceEnvelope));
    const view = await kernel.read({ type: 'session.read', sessionId: SESSION });
    expect(view).toMatchObject({
      sessionId: SESSION,
      revision: 1,
      turnCount: 2,
    });
    expect('messages' in view && view.messages.length).toBe(2);
  });

  it('consumeExecution works without React (native path)', async () => {
    const deps = makeNativeDeps();
    const kernel = await createKernel('native-turn', {
      native: { sessions: deps.sessions, model: deps.model },
    });

    const progress: string[] = [];
    let projection: unknown = null;
    let error: unknown = null;

    await consumeExecution(kernel, advanceEnvelope, {
      showProgress: (d) => progress.push(d.text),
      replaceProjection: (v) => {
        projection = v;
      },
      showError: (e) => {
        error = e;
      },
    });

    expect(error).toBeNull();
    expect(progress.length).toBeGreaterThan(0);
    expect(projection).toMatchObject({
      revision: 1,
      turnCount: 2,
    });
    // Progress did not dual-write: only one formal revision bump.
    expect((await deps.sessions.read(SESSION)).revision).toBe(1);
  });

  it('createKernel("native-turn") without native deps throws', async () => {
    await expect(createKernel('native-turn', {})).rejects.toThrow(/dependencies\.native/);
  });
});
