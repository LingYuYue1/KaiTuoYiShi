/**
 * Stage 5.1 — revision conflict leaves variables unchanged.
 * Covers turn.advance and variables.apply.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type AdvanceTurnEnvelope,
  type ApplyVariablesEnvelope,
} from '@/src/kernel/contract';
import { executeTurn } from '@/src/kernel/application/executeTurn';
import { applyVariables } from '@/src/kernel/application/applyVariables';
import { NativeKernel } from '@/src/kernel/NativeKernel';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';
import { createEmptyKernelVariables } from '@/src/kernel/domain/variables';

const SESSION = asSessionId('phase5-rev');

function seed(revision = 0) {
  const sessions = new InMemorySessionRepository();
  sessions.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(revision),
      state: {
        turnCount: 1,
        travelerName: '开拓者',
        variables: createEmptyKernelVariables({
          旅人: { 姓名: '开拓者', 身份: '初值', 数值属性: { 好感: 1 } },
        }),
      },
    }),
  );
  return sessions;
}

describe('variables revision conflict (Stage 5.1)', () => {
  it('rejects a no-op variable command without consuming a revision', async () => {
    const sessions = seed(0);

    const frames = await collectAsync(
      applyVariables(
        {
          protocolVersion: 1,
          commandId: asCommandId('apply-noop'),
          sessionId: SESSION,
          expectedRevision: asRevision(0),
          command: {
            type: 'variables.apply',
            commands: [{ action: 'set', key: '旅人.姓名', value: '开拓者' }],
          },
        } satisfies ApplyVariablesEnvelope,
        { sessions },
      ),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'no_changes' },
    });
    expect((await sessions.read(SESSION)).revision).toBe(0);
  });

  it('stale turn.advance does not mutate variables', async () => {
    const sessions = seed(0);
    const model = new ScriptedModelGateway(async ({ playerText }) => ({
      kind: 'success' as const,
      chunks: [playerText],
      completedText: `${playerText}
<变量更新>
set 旅人.姓名 = "被挡住"
</变量更新>`,
    }));

    // First commit → revision 1
    await collectAsync(
      executeTurn(
        {
          protocolVersion: 1,
          commandId: asCommandId('seed'),
          sessionId: SESSION,
          expectedRevision: asRevision(0),
          command: { type: 'turn.advance', input: { text: 'seed' } },
        } satisfies AdvanceTurnEnvelope,
        { sessions, model },
      ),
    );
    const afterSeed = await sessions.read(SESSION);
    expect(afterSeed.revision).toBe(1);

    const frames = await collectAsync(
      executeTurn(
        {
          protocolVersion: 1,
          commandId: asCommandId('stale'),
          sessionId: SESSION,
          expectedRevision: asRevision(0), // stale
          command: { type: 'turn.advance', input: { text: 'stale' } },
        } satisfies AdvanceTurnEnvelope,
        { sessions, model },
      ),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'revision_conflict' },
    });
    expect(await sessions.read(SESSION)).toEqual(afterSeed);
  });

  it('variables.apply CAS conflict leaves vars unchanged', async () => {
    const sessions = seed(0);
    // Advance revision with a dummy apply first.
    await collectAsync(
      applyVariables(
        {
          protocolVersion: 1,
          commandId: asCommandId('apply-1'),
          sessionId: SESSION,
          expectedRevision: asRevision(0),
          command: {
            type: 'variables.apply',
            commands: [{ action: 'set', key: '旅人.身份', value: '已更新' }],
          },
        } satisfies ApplyVariablesEnvelope,
        { sessions },
      ),
    );
    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(1);
    expect(after.state.variables.旅人.身份).toBe('已更新');

    const frames = await collectAsync(
      applyVariables(
        {
          protocolVersion: 1,
          commandId: asCommandId('apply-stale'),
          sessionId: SESSION,
          expectedRevision: asRevision(0),
          command: {
            type: 'variables.apply',
            commands: [{ action: 'set', key: '旅人.姓名', value: '冲突名' }],
          },
        } satisfies ApplyVariablesEnvelope,
        { sessions },
      ),
    );
    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'revision_conflict' },
    });
    const final = await sessions.read(SESSION);
    expect(final.state.travelerName).toBe('开拓者');
    expect(final.state.variables.旅人.身份).toBe('已更新');
    expect(final.revision).toBe(1);
  });

  it('NativeKernel routes variables.apply successfully', async () => {
    const sessions = seed(0);
    const model = new ScriptedModelGateway();
    const kernel = new NativeKernel({ sessions, model });

    const frames = await collectAsync(
      kernel.execute({
        protocolVersion: 1,
        commandId: asCommandId('nk-apply'),
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        command: {
          type: 'variables.apply',
          commands: [
            { action: 'set', key: '旅人.姓名', value: '内核名' },
            { action: 'add', key: '旅人.数值属性.好感', value: 4 },
          ],
        },
      }),
    );

    expect(frames.at(-1)?.type).toBe('committed');
    const snap = await sessions.read(SESSION);
    expect(snap.state.travelerName).toBe('内核名');
    expect(snap.state.variables.旅人.数值属性.好感).toBe(5);
    const terminal = frames.at(-1);
    if (terminal?.type === 'committed') {
      expect(terminal.view.travelerVariables.姓名).toBe('内核名');
    }
  });
});
