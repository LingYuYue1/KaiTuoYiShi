/**
 * Phase 2 — executeTurn behavior (Exit Gate items 2–5).
 */

import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type AdvanceTurnEnvelope,
} from '@/src/kernel/contract';
import { executeTurn } from '@/src/kernel/application/executeTurn';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';

const SESSION = asSessionId('exec-session');

function seed(revision = 0, turnCount = 1, travelerName = '开拓者') {
  const sessions = new InMemorySessionRepository();
  sessions.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(revision),
      state: { turnCount, travelerName },
    }),
  );
  return sessions;
}

function advance(
  text: string,
  opts?: Readonly<{ commandId?: string; expectedRevision?: number }>,
): AdvanceTurnEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts?.commandId ?? 'cmd-1'),
    sessionId: SESSION,
    expectedRevision: asRevision(opts?.expectedRevision ?? 0),
    command: { type: 'turn.advance', input: { text } },
  };
}

describe('executeTurn (Phase 2)', () => {
  it('progress frames do not write formal SessionRepository state', async () => {
    let release!: (v: {
      kind: 'success';
      chunks: string[];
      completedText: string;
    }) => void;
    const hold = new Promise<{
      kind: 'success';
      chunks: string[];
      completedText: string;
    }>((r) => {
      release = r;
    });

    const sessions = seed();
    const model = new ScriptedModelGateway(async () => hold);
    const before = await sessions.read(SESSION);

    const iter = executeTurn(advance('ping', { commandId: 'prog-1' }), {
      sessions,
      model,
    })[Symbol.asyncIterator]();

    // Start consume so model.complete is entered.
    const firstPromise = iter.next();
    await Promise.resolve();
    release({ kind: 'success', chunks: ['一', '二'], completedText: '一二' });

    const first = await firstPromise;
    expect(first.value?.type).toBe('progress');
    // Formal state unchanged after first progress.
    expect(await sessions.read(SESSION)).toEqual(before);

    // Drain remaining.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n = await iter.next();
      if (n.done) break;
    }
    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(before.revision + 1);
  });

  it('AI failure leaves formal state unchanged', async () => {
    const sessions = seed(2, 5, '星');
    const model = new ScriptedModelGateway();
    model.enqueue({ kind: 'failure', message: 'network reset', chunks: ['…'] });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      executeTurn(advance('继续', { commandId: 'ai-fail', expectedRevision: 2 }), {
        sessions,
        model,
      }),
    );

    expect(frames.some((f) => f.type === 'progress')).toBe(true);
    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure', message: 'network reset' },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
  });

  it('model throw leaves formal state unchanged', async () => {
    const sessions = seed();
    const model = new ScriptedModelGateway();
    model.enqueue({ kind: 'throw', message: 'provider 500' });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      executeTurn(advance('x', { commandId: 'throw-1' }), { sessions, model }),
    );
    expect(frames).toEqual([
      expect.objectContaining({
        type: 'rejected',
        error: expect.objectContaining({ code: 'model_failure' }),
      }),
    ]);
    expect(await sessions.read(SESSION)).toEqual(before);
  });

  it('empty narrative parse failure leaves formal state unchanged', async () => {
    const sessions = seed();
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['   '],
      completedText: '   <变量更新>\nset 旅人.姓名 = "x"\n</变量更新>',
    });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      executeTurn(advance('空叙事', { commandId: 'empty-narr' }), { sessions, model }),
    );
    expect(frames.at(-1)?.type).toBe('rejected');
    expect(await sessions.read(SESSION)).toEqual(before);
  });

  it('success commits exactly once (revision +1, one terminal)', async () => {
    const sessions = seed(0, 3);
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['三月七挥了挥手。'],
      completedText: '三月七挥了挥手。',
    });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      executeTurn(advance('打招呼', { commandId: 'ok-1' }), { sessions, model }),
    );

    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)?.type).toBe('committed');
    if (frames.at(-1)?.type !== 'committed') throw new Error('expected committed');
    expect(frames.at(-1)).toMatchObject({
      revision: before.revision + 1,
      view: {
        turnCount: before.state.turnCount + 1,
        messages: [
          { role: 'user', content: '打招呼' },
          { role: 'assistant', content: '三月七挥了挥手。' },
        ],
      },
    });

    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.state.turns).toHaveLength(1);
  });

  it('retrying a committed command replays its projection without calling the model', async () => {
    const sessions = seed();
    const model = new ScriptedModelGateway();
    model.enqueue({ kind: 'success', chunks: ['第一次。'] });
    const command = advance('重试', { commandId: 'idempotent-1' });

    const first = await collectAsync(executeTurn(command, { sessions, model }));
    const retry = await collectAsync(executeTurn(command, { sessions, model }));

    expect(first.at(-1)).toEqual(retry.at(-1));
    expect(await sessions.read(SESSION)).toMatchObject({ revision: 1 });
  });

  it('revision conflict is repeatable under test', async () => {
    const sessions = seed(0, 1);
    const model = new ScriptedModelGateway(async ({ playerText }) => ({
      kind: 'success' as const,
      chunks: [playerText],
      completedText: `回：${playerText}`,
    }));

    // First commit advances revision to 1.
    await collectAsync(
      executeTurn(advance('seed', { commandId: 'rev-seed' }), { sessions, model }),
    );
    const afterSeed = await sessions.read(SESSION);
    expect(afterSeed.revision).toBe(1);

    const frames = await collectAsync(
      executeTurn(
        advance('stale', { commandId: 'rev-stale', expectedRevision: 0 }),
        { sessions, model },
      ),
    );
    expect(frames).toEqual([
      expect.objectContaining({
        type: 'rejected',
        error: expect.objectContaining({ code: 'revision_conflict' }),
      }),
    ]);
    expect(await sessions.read(SESSION)).toEqual(afterSeed);
  });

  it('illegal variable block commits narrative but leaves travelerName unchanged', async () => {
    const illegalBlock = `<变量更新>
set 旅人.姓名 = {{not-json
set 未知根.字段 = "x"
delete
</变量更新>`;
    const sessions = seed(0, 1, '开拓者甲');
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['叙事仍成功。'],
      completedText: `叙事仍成功。\n${illegalBlock}`,
    });

    const frames = await collectAsync(
      executeTurn(advance('带非法变量', { commandId: 'ill-var' }), { sessions, model }),
    );
    expect(frames.at(-1)?.type).toBe('committed');
    const after = await sessions.read(SESSION);
    expect(after.state.travelerName).toBe('开拓者甲');
    expect(after.state.messages.at(-1)?.content).toBe('叙事仍成功。');
  });

  it('legal set 旅人.姓名 updates travelerName on formal commit', async () => {
    const legalBlock = `<变量更新>
set 旅人.姓名 = "星核旅人"
</变量更新>`;
    const sessions = seed(0, 1, '旧名');
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['好。'],
      completedText: `好。\n${legalBlock}`,
    });

    await collectAsync(
      executeTurn(advance('改名', { commandId: 'legal-var' }), { sessions, model }),
    );
    expect((await sessions.read(SESSION)).state.travelerName).toBe('星核旅人');
  });

  it('applies successive legal traveler-name updates in source order', async () => {
    const sessions = seed(0, 1, '旧名');
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['好。'],
      completedText: `好。\n<变量更新>\nset 旅人.姓名 = "第一名"\nset 旅人.姓名 = "最终名"\n</变量更新>`,
    });

    await collectAsync(
      executeTurn(advance('连续改名', { commandId: 'ordered-var' }), { sessions, model }),
    );
    expect((await sessions.read(SESSION)).state.travelerName).toBe('最终名');
  });

  it('committed projection contains formal state only, not streamed progress', async () => {
    const sessions = seed();
    const model = new ScriptedModelGateway();
    model.enqueue({ kind: 'success', chunks: ['片段', '完成'], completedText: '片段完成' });

    const frames = await collectAsync(
      executeTurn(advance('隔离', { commandId: 'projection-only' }), { sessions, model }),
    );
    const committed = frames.at(-1);
    expect(committed?.type).toBe('committed');
    if (committed?.type === 'committed') {
      expect(committed.view.lastProgressTexts).toBeUndefined();
    }
  });
});
