/**
 * Phase 3 — UI ProjectionStore pure applyExecutionFrame.
 */

import { describe, expect, it } from 'vitest';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type ExecutionFrame,
  type SessionView,
} from '@/src/kernel/contract';
import {
  applyExecutionFrame,
  createProjectionState,
  reduceExecutionFrames,
} from '@/src/ui/projections/projectionStore';

const SESSION = asSessionId('proj-session');

function baseView(overrides?: Partial<SessionView>): SessionView {
  return {
    sessionId: SESSION,
    revision: asRevision(0),
    turnCount: 1,
    turns: [],
    messages: [],
    ...overrides,
  };
}

describe('projectionStore', () => {
  it('createProjectionState starts with null progress', () => {
    const state = createProjectionState(baseView());
    expect(state.progress).toBeNull();
    expect(state.session.revision).toBe(0);
  });

  it('progress appends temporary narrative without changing session', () => {
    const initial = createProjectionState(baseView({ turnCount: 3 }));
    const frame: ExecutionFrame = {
      type: 'progress',
      commandId: asCommandId('c1'),
      delta: { kind: 'narrative', text: '叙事：一' },
    };
    const next = applyExecutionFrame(initial, frame);
    expect(next.session).toEqual(initial.session);
    expect(next.progress).toEqual({
      commandId: asCommandId('c1'),
      narrativeText: '叙事：一',
    });
  });

  it('progress for same commandId replaces cumulative text', () => {
    let state = createProjectionState(baseView());
    state = applyExecutionFrame(state, {
      type: 'progress',
      commandId: asCommandId('c1'),
      delta: { kind: 'narrative', text: '一' },
    });
    state = applyExecutionFrame(state, {
      type: 'progress',
      commandId: asCommandId('c1'),
      delta: { kind: 'narrative', text: '一二' },
    });
    expect(state.progress?.narrativeText).toBe('一二');
  });

  it('committed replaces session and clears progress', () => {
    let state = createProjectionState(baseView());
    state = applyExecutionFrame(state, {
      type: 'progress',
      commandId: asCommandId('c1'),
      delta: { kind: 'narrative', text: 'stream…' },
    });
    expect(state.progress).not.toBeNull();

    const committedView = baseView({
      revision: asRevision(1),
      turnCount: 2,
      turns: [{ id: 'turn_c1', playerText: 'go', narrativeText: 'done' }],
      messages: [
        { role: 'user', content: 'go' },
        { role: 'assistant', content: 'done' },
      ],
    });
    state = applyExecutionFrame(state, {
      type: 'committed',
      commandId: asCommandId('c1'),
      revision: asRevision(1),
      view: committedView,
    });

    expect(state.progress).toBeNull();
    expect(state.session).toEqual(committedView);
    expect(state.session.revision).toBe(1);
  });

  it('rejected clears progress and keeps last committed session', () => {
    const committed = baseView({
      revision: asRevision(2),
      turnCount: 4,
      turns: [{ id: 't', playerText: 'p', narrativeText: 'n' }],
    });
    let state = createProjectionState(committed);
    state = applyExecutionFrame(state, {
      type: 'progress',
      commandId: asCommandId('fail'),
      delta: { kind: 'narrative', text: 'partial' },
    });
    state = applyExecutionFrame(state, {
      type: 'rejected',
      commandId: asCommandId('fail'),
      error: { code: 'model_failure', message: 'timeout' },
    });

    expect(state.progress).toBeNull();
    expect(state.session).toEqual(committed);
    expect(state.session.revision).toBe(2);
  });

  it('reduceExecutionFrames folds a full stream', () => {
    const initial = createProjectionState(baseView());
    const frames: ExecutionFrame[] = [
      {
        type: 'progress',
        commandId: asCommandId('c2'),
        delta: { kind: 'narrative', text: 'a' },
      },
      {
        type: 'progress',
        commandId: asCommandId('c2'),
        delta: { kind: 'narrative', text: 'ab' },
      },
      {
        type: 'committed',
        commandId: asCommandId('c2'),
        revision: asRevision(1),
        view: baseView({
          revision: asRevision(1),
          turnCount: 2,
          turns: [{ id: 'turn_c2', playerText: 'x', narrativeText: 'ab' }],
        }),
      },
    ];
    const final = reduceExecutionFrames(initial, frames);
    expect(final.progress).toBeNull();
    expect(final.session.revision).toBe(1);
    expect(final.session.turns).toHaveLength(1);
  });
});
