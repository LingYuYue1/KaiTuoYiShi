/**
 * Phase 1/2 — createKernel mode selection at composition root.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
} from '@/src/kernel/contract';
import { createKernel } from '@/src/kernel/createKernel';
import {
  wrapLegacyAdvanceTurn,
  buildCommittedSessionView,
} from '@/src/kernel/adapters/legacy/wrapLegacyAdvanceTurn';
import { LegacyKernelAdapter } from '@/src/kernel/adapters/legacy/LegacyKernelAdapter';
import { NativeKernel } from '@/src/kernel/NativeKernel';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';

const envelope = {
  protocolVersion: 1 as const,
  commandId: asCommandId('ck-1'),
  sessionId: asSessionId('ck-session'),
  expectedRevision: asRevision(0),
  command: { type: 'turn.advance' as const, input: { text: 'ping' } },
};

describe('createKernel (Phase 1/2)', () => {
  it('createKernel("legacy") returns a working LegacyKernelAdapter', async () => {
    const kernel = await createKernel('legacy', {
      legacy: {
        advanceTurn: wrapLegacyAdvanceTurn(async (env, events) => {
          events.onProgress('p');
          events.onCommitted(
            buildCommittedSessionView({
              sessionId: env.sessionId,
              revision: 1,
              turnCount: 2,
              playerText: env.command.input.text,
              narrativeText: 'ok',
              messages: [
                { role: 'user', content: env.command.input.text },
                { role: 'assistant', content: 'ok' },
              ],
              commandId: env.commandId,
            }),
          );
        }),
      },
    });

    expect(kernel).toBeInstanceOf(LegacyKernelAdapter);
    const frames = await collectAsync(kernel.execute(envelope));
    expect(frames.some((f) => f.type === 'progress')).toBe(true);
    expect(frames.at(-1)?.type).toBe('committed');
  });

  it('createKernel("native-turn") returns NativeKernel that owns AdvanceTurn', async () => {
    const sessions = new InMemorySessionRepository();
    sessions.seed(
      createSessionSnapshot({
        sessionId: envelope.sessionId,
        revision: asRevision(0),
        state: { turnCount: 1 },
      }),
    );
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['ok'],
      completedText: 'ok',
    });

    // Legacy port that would commit if wrongly used.
    let legacyCalled = false;
    const kernel = await createKernel('native-turn', {
      legacy: {
        advanceTurn: wrapLegacyAdvanceTurn(async (_env, events) => {
          legacyCalled = true;
          events.onCommitted(
            buildCommittedSessionView({
              sessionId: asSessionId('should-not-run'),
              revision: 99,
              turnCount: 99,
              playerText: 'nope',
              narrativeText: 'nope',
              messages: [],
              commandId: 'should-not-run',
            }),
          );
        }),
      },
      native: { sessions, model },
    });

    expect(kernel).toBeInstanceOf(NativeKernel);
    expect(kernel).not.toBeInstanceOf(LegacyKernelAdapter);

    const frames = await collectAsync(kernel.execute(envelope));
    expect(legacyCalled).toBe(false);
    expect(frames.some((f) => f.type === 'progress')).toBe(true);
    const terminal = frames.at(-1);
    expect(terminal?.type).toBe('committed');
    if (terminal?.type === 'committed') {
      expect(terminal.revision).toBe(1);
      expect(terminal.view.messages).toEqual([
        { role: 'user', content: 'ping' },
        { role: 'assistant', content: 'ok' },
      ]);
    }

    // read from native SessionRepository projection
    const view = await kernel.read({
      type: 'session.read',
      sessionId: envelope.sessionId,
    });
    expect(view).toMatchObject({ revision: 1, turnCount: 2 });
  });

  it('createKernel("native-turn") without native deps fails closed', async () => {
    await expect(
      createKernel('native-turn', {
        legacy: {
          advanceTurn: wrapLegacyAdvanceTurn(async (_env, events) => {
            events.onCommitted(
              buildCommittedSessionView({
                sessionId: asSessionId('x'),
                revision: 1,
                turnCount: 1,
                playerText: 'x',
                narrativeText: 'x',
                messages: [],
                commandId: 'x',
              }),
            );
          }),
        },
      }),
    ).rejects.toThrow(/dependencies\.native/);
  });
});
