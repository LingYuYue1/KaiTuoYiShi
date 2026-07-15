/**
 * Phase 3 — UI can restore Projection via kernel.read after commit.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type AdvanceTurnEnvelope,
  type SessionView,
} from '@/src/kernel/contract';
import { executeTurn } from '@/src/kernel/application/executeTurn';
import { createMemoryPersistentSessionRepository } from '@/src/kernel/adapters/indexeddb/PersistentSessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';
import { createKernel } from '@/src/kernel/createKernel';
import {
  applyExecutionFrame,
  createProjectionState,
  restoreProjectionFromKernel,
  commitProjectionView,
  type ProjectionState,
} from '@/src/ui/projections';

function advance(
  sessionId: ReturnType<typeof asSessionId>,
  text: string,
  opts: Readonly<{ commandId: string; expectedRevision: number }>,
): AdvanceTurnEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts.commandId),
    sessionId,
    expectedRevision: asRevision(opts.expectedRevision),
    command: { type: 'turn.advance', input: { text } },
  };
}

describe('projection restore via kernel.read', () => {
  it('after commit, kernel.read SessionView matches projection.session', async () => {
    const sessionId = asSessionId('proj-restore-commit');
    const sessions = createMemoryPersistentSessionRepository();
    await sessions.seed(
      createSessionSnapshot({
        sessionId,
        revision: asRevision(0),
        state: { turnCount: 1, travelerName: '开拓者' },
      }),
    );

    const model = new ScriptedModelGateway(async ({ playerText }) => ({
      kind: 'success',
      chunks: [`叙事：${playerText}`],
      completedText: `叙事：${playerText}`,
    }));

    const kernel = await createKernel('native-turn', {
      native: { sessions, model },
    });

    // Seed projection from kernel.read (empty session).
    let projection: ProjectionState = await restoreProjectionFromKernel(
      kernel,
      sessionId,
    );
    expect(projection.progress).toBeNull();
    expect(projection.session.revision).toBe(0);
    expect(projection.session.turnCount).toBe(1);

    const frames = await collectAsync(
      executeTurn(
        advance(sessionId, '第一步', {
          commandId: 'cmd-restore-1',
          expectedRevision: 0,
        }),
        { sessions, model },
      ),
    );
    const committed = terminalFrames(frames).find((f) => f.type === 'committed');
    expect(committed?.type).toBe('committed');
    if (!committed || committed.type !== 'committed') {
      throw new Error('expected committed frame');
    }

    // Host sink: applyExecutionFrame on progress then committed.
    for (const frame of frames) {
      projection = applyExecutionFrame(projection, frame);
    }
    expect(projection.progress).toBeNull();
    expect(projection.session.revision).toBe(1);
    expect(projection.session).toEqual(committed.view);

    // Restore path: kernel.read returns matching SessionView.
    const restored = await restoreProjectionFromKernel(kernel, sessionId);
    expect(restored.progress).toBeNull();
    expect(restored.session.sessionId).toBe(sessionId);
    expect(restored.session.revision).toBe(projection.session.revision);
    expect(restored.session.turnCount).toBe(projection.session.turnCount);
    expect(restored.session.messages).toEqual(projection.session.messages);
  });

  it('progress does not formal-commit session; rejected keeps last committed', async () => {
    const sessionId = asSessionId('proj-restore-reject');
    const sessions = createMemoryPersistentSessionRepository();
    await sessions.seed(
      createSessionSnapshot({
        sessionId,
        revision: asRevision(0),
        state: { turnCount: 1 },
      }),
    );
    const model = new ScriptedModelGateway(async () => ({
      kind: 'success',
      chunks: ['叙事：ok'],
      completedText: '叙事：ok',
    }));
    const kernel = await createKernel('native-turn', {
      native: { sessions, model },
    });

    let projection = await restoreProjectionFromKernel(kernel, sessionId);
    const before = projection.session;

    projection = applyExecutionFrame(projection, {
      type: 'progress',
      commandId: asCommandId('mid'),
      delta: { kind: 'narrative', text: 'partial…' },
    });
    expect(projection.session).toEqual(before);
    expect(projection.progress?.narrativeText).toBe('partial…');

    // kernel.read still returns formal session (not progress).
    const midRead = (await kernel.read({
      type: 'session.read',
      sessionId,
    })) as SessionView;
    expect(midRead.revision).toBe(before.revision);

    projection = applyExecutionFrame(projection, {
      type: 'rejected',
      commandId: asCommandId('mid'),
      error: { code: 'model_failure', message: 'boom' },
    });
    expect(projection.progress).toBeNull();
    expect(projection.session).toEqual(before);
  });

  it('commitProjectionView helper clears progress from preferred view', async () => {
    const sessionId = asSessionId('proj-restore-helper');
    let projection = createProjectionState({
      sessionId,
      revision: asRevision(0),
      turnCount: 1,
      turns: [],
      messages: [],
      travelerName: '开拓者',
      travelerVariables: {
        姓名: '开拓者',
        身份: '',
        外貌: '',
        性格: '',
        背景: '',
        数值属性: {},
      },
      knowledge: {
        yitingEntryCount: 0,
        zhikuEntryCount: 0,
        storyArchiveCount: 0,
        unlockedZhikuTitles: [],
      },
      phone: { threadCount: 0, messageCount: 0, lastMessages: [] },
      news: { entryCount: 0, latestTitles: [] },
    });
    projection = applyExecutionFrame(projection, {
      type: 'progress',
      commandId: asCommandId('c'),
      delta: { kind: 'narrative', text: 'stream' },
    });
    const view: SessionView = {
      sessionId,
      revision: asRevision(2),
      turnCount: 3,
      turns: [{ id: 't', playerText: 'p', narrativeText: 'n' }],
      messages: [
        { role: 'user', content: 'p' },
        { role: 'assistant', content: 'n' },
      ],
      travelerName: '开拓者',
      travelerVariables: {
        姓名: '开拓者',
        身份: '',
        外貌: '',
        性格: '',
        背景: '',
        数值属性: {},
      },
      knowledge: {
        yitingEntryCount: 0,
        zhikuEntryCount: 0,
        storyArchiveCount: 0,
        unlockedZhikuTitles: [],
      },
      phone: { threadCount: 0, messageCount: 0, lastMessages: [] },
      news: { entryCount: 0, latestTitles: [] },
    };
    projection = commitProjectionView(projection, asCommandId('c'), view);
    expect(projection.progress).toBeNull();
    expect(projection.session).toEqual(view);
  });
});
