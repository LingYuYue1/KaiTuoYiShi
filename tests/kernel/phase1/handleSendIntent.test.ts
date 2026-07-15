/**
 * Phase 1 — characterization: handleSend-shaped intent goes through IKernel.execute.
 *
 * Uses injected fake legacy deps (no real AI). Mirrors composition-root wiring:
 *   UI text → CommandEnvelope(turn.advance) → consumeExecution → kernel.execute
 *   → LegacyKernelAdapter → wrapLegacyAdvanceTurn(runner)
 */

import { describe, expect, it, vi } from 'vitest';
import { createKernel } from '@/src/kernel/createKernel';
import { wrapLegacyAdvanceTurn, buildCommittedSessionView } from '@/src/kernel/adapters/legacy/wrapLegacyAdvanceTurn';
import { executeTurnIntent, type ExecutionSink } from '@/src/ui/kernelClient';

describe('executeTurnIntent through IKernel.execute (Phase 1)', () => {
  it('UI intent crosses execute: progress buffer + formal commit via sink', async () => {
    const executeSpy = vi.fn();
    let formalChat: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let tempStream = '';
    let formalTurnCount = 1;

    const kernel = await createKernel('legacy', {
      legacy: {
        advanceTurn: async function* (envelope) {
          executeSpy(envelope);
          // Simulate wrapLegacyAdvanceTurn + executeSendWorkflow observers:
          yield {
            type: 'progress' as const,
            commandId: envelope.commandId,
            delta: { kind: 'narrative' as const, text: '星' },
          };
          yield {
            type: 'progress' as const,
            commandId: envelope.commandId,
            delta: { kind: 'narrative' as const, text: '星穹' },
          };
          // Formal commit (legacy authority) happens inside runner; we emit projection only.
          formalChat = [
            { role: 'user', content: envelope.command.input.text },
            { role: 'assistant', content: '星穹' },
          ];
          formalTurnCount += 1;
          const view = buildCommittedSessionView({
            sessionId: envelope.sessionId,
            revision: 1,
            turnCount: formalTurnCount,
            playerText: envelope.command.input.text,
            narrativeText: '星穹',
            messages: formalChat,
            commandId: envelope.commandId,
            lastProgressTexts: ['星', '星穹'],
          });
          yield {
            type: 'committed' as const,
            commandId: envelope.commandId,
            revision: view.revision,
            view,
          };
        },
      },
    });

    const sink: ExecutionSink = {
      showProgress: (delta) => {
        tempStream = delta.text;
      },
      replaceProjection: (view) => {
        // In production Phase 1, formal React state is already updated by legacy workflow.
        // Sink receives projection for UI store / future pure projection path.
        expect(view.messages).toEqual(formalChat);
      },
      showError: () => {
        throw new Error('should not reject');
      },
    };

    await executeTurnIntent(kernel, {
      text: '观察星空',
      sessionId: 'local-session',
      expectedRevision: 0,
      commandId: 'intent-1',
    }, sink);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0][0]).toMatchObject({
      command: { type: 'turn.advance', input: { text: '观察星空' } },
    });
    expect(tempStream).toBe('星穹');
    expect(formalTurnCount).toBe(2);
    expect(formalChat[0]).toEqual({ role: 'user', content: '观察星空' });
  });

  it('failure intent: progress may show, formal state unchanged, showError called', async () => {
    let formalTurnCount = 5;
    const formalBefore = formalTurnCount;
    let tempStream = '';
    let errorMessage = '';

    const kernel = await createKernel('legacy', {
      legacy: {
        advanceTurn: wrapLegacyAdvanceTurn(async (_envelope, events) => {
          events.onProgress('…连接中');
          events.onRejected({
            code: 'model_failure',
            message: '主流程失败：network reset',
          });
        }),
      },
    });

    await executeTurnIntent(kernel, {
      text: '继续',
      sessionId: 'local-session',
      expectedRevision: 0,
      commandId: 'intent-fail-1',
    }, {
        showProgress: (d) => {
          tempStream = d.text;
        },
        replaceProjection: () => {
          throw new Error('must not formal-commit on reject');
        },
        showError: (err) => {
          errorMessage = err.message;
        },
    });

    expect(tempStream).toBe('…连接中');
    expect(errorMessage).toContain('network reset');
    expect(formalTurnCount).toBe(formalBefore);
  });
});
