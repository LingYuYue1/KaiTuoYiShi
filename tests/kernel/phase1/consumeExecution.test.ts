/**
 * Phase 1 — consumeExecution routes frames to the correct sink methods.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type CommandEnvelope,
  type ExecutionFrame,
  type IKernel,
  type SessionView,
  createEmptyAlbumView,
  createEmptyKnowledgeView,
  createEmptyNewsView,
  createEmptyPhoneView,
  createTravelerVariablesView,
} from '@/src/kernel/contract';
import { consumeExecution, type ExecutionSink } from '@/src/ui/kernelClient';

function makeView(revision: number): SessionView {
  return {
    sessionId: asSessionId('sink-session'),
    revision: asRevision(revision),
    turnCount: 2,
    turns: [{ id: 't1', playerText: 'hi', narrativeText: 'hello' }],
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ],
    travelerName: '开拓者',
    travelerVariables: createTravelerVariablesView(),
    knowledge: createEmptyKnowledgeView(),
    phone: createEmptyPhoneView(),
    news: createEmptyNewsView(),
    album: createEmptyAlbumView(),
  };
}

function fakeKernel(frames: ExecutionFrame[]): IKernel {
  return {
    async *execute() {
      for (const frame of frames) {
        yield frame;
      }
    },
    async read() {
      return makeView(0);
    },
  };
}

const envelope: CommandEnvelope = {
  protocolVersion: 1,
  commandId: asCommandId('sink-cmd-1'),
  sessionId: asSessionId('sink-session'),
  expectedRevision: asRevision(0),
  command: { type: 'turn.advance', input: { text: 'hi' } },
};

describe('consumeExecution (Phase 1)', () => {
  it('routes progress → showProgress, committed → replaceProjection', async () => {
    const sink: ExecutionSink = {
      showProgress: vi.fn(),
      replaceProjection: vi.fn(),
      showError: vi.fn(),
    };
    const view = makeView(1);
    const kernel = fakeKernel([
      {
        type: 'progress',
        commandId: envelope.commandId,
        delta: { kind: 'narrative', text: 'h' },
      },
      {
        type: 'progress',
        commandId: envelope.commandId,
        delta: { kind: 'narrative', text: 'hello' },
      },
      {
        type: 'committed',
        commandId: envelope.commandId,
        revision: asRevision(1),
        view,
      },
    ]);

    await consumeExecution(kernel, envelope, sink);

    expect(sink.showProgress).toHaveBeenCalledTimes(2);
    expect(sink.showProgress).toHaveBeenNthCalledWith(1, { kind: 'narrative', text: 'h' });
    expect(sink.showProgress).toHaveBeenNthCalledWith(2, { kind: 'narrative', text: 'hello' });
    expect(sink.replaceProjection).toHaveBeenCalledTimes(1);
    expect(sink.replaceProjection).toHaveBeenCalledWith(view);
    expect(sink.showError).not.toHaveBeenCalled();
  });

  it('routes rejected → showError and never replaceProjection', async () => {
    const sink: ExecutionSink = {
      showProgress: vi.fn(),
      replaceProjection: vi.fn(),
      showError: vi.fn(),
    };
    const kernel = fakeKernel([
      {
        type: 'progress',
        commandId: envelope.commandId,
        delta: { kind: 'narrative', text: '…' },
      },
      {
        type: 'rejected',
        commandId: envelope.commandId,
        error: { code: 'model_failure', message: 'boom' },
      },
    ]);

    await consumeExecution(kernel, envelope, sink);

    expect(sink.showProgress).toHaveBeenCalledTimes(1);
    expect(sink.showError).toHaveBeenCalledWith({
      code: 'model_failure',
      message: 'boom',
    });
    expect(sink.replaceProjection).not.toHaveBeenCalled();
  });
});
