/**
 * Phase 1 — createKernel mode selection at composition root.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
} from '@/src/kernel/contract';
import { createKernel } from '@/src/kernel/createKernel';
import { wrapLegacyAdvanceTurn, buildCommittedSessionView } from '@/src/kernel/adapters/legacy/wrapLegacyAdvanceTurn';
import { LegacyKernelAdapter } from '@/src/kernel/adapters/legacy/LegacyKernelAdapter';

const envelope = {
  protocolVersion: 1 as const,
  commandId: asCommandId('ck-1'),
  sessionId: asSessionId('ck-session'),
  expectedRevision: asRevision(0),
  command: { type: 'turn.advance' as const, input: { text: 'ping' } },
};

describe('createKernel (Phase 1)', () => {
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

  it('createKernel("native-turn") does not silently act as legacy', async () => {
    const kernel = await createKernel('native-turn', {
      legacy: {
        // If native incorrectly fell through to legacy, this would commit.
        advanceTurn: wrapLegacyAdvanceTurn(async (_env, events) => {
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
    });

    expect(kernel).not.toBeInstanceOf(LegacyKernelAdapter);
    const frames = await collectAsync(kernel.execute(envelope));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      type: 'rejected',
      error: { code: 'not_implemented' },
    });
    // read must also refuse, not call legacy.
    await expect(kernel.read({ type: 'session.read', sessionId: envelope.sessionId })).rejects.toThrow(
      /not implemented/i,
    );
  });
});
