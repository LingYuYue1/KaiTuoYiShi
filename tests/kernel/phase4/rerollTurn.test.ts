/**
 * Phase 4.1 — rerollTurn Option B behavior.
 *
 * - Re-executes from base with ScriptedModelGateway
 * - Formal state replaces narrative for that turn; revision +1 once
 * - Model failure → revision unchanged (no formal write)
 * - Unknown turnId → rejected
 * - Native path has no restorePreTurnSnapshot / setChatHistory rewrite chain
 */

import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type AdvanceTurnEnvelope,
  type RerollTurnEnvelope,
} from '@/src/kernel/contract';
import { executeTurn } from '@/src/kernel/application/executeTurn';
import { rerollTurn } from '@/src/kernel/application/rerollTurn';
import { NativeKernel } from '@/src/kernel/NativeKernel';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';
import { findTurnBaseSnapshot } from '@/src/kernel/domain/turn/findTurnBaseSnapshot';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SESSION = asSessionId('phase4-reroll');

function seedEmpty() {
  const sessions = new InMemorySessionRepository();
  sessions.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(0),
      state: { turnCount: 1, travelerName: '开拓者' },
    }),
  );
  return sessions;
}

function advance(
  text: string,
  opts: Readonly<{ commandId: string; expectedRevision: number }>,
): AdvanceTurnEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts.commandId),
    sessionId: SESSION,
    expectedRevision: asRevision(opts.expectedRevision),
    command: { type: 'turn.advance', input: { text } },
  };
}

function reroll(
  turnId: string,
  opts: Readonly<{ commandId: string; expectedRevision: number }>,
): RerollTurnEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts.commandId),
    sessionId: SESSION,
    expectedRevision: asRevision(opts.expectedRevision),
    command: { type: 'turn.reroll', turnId },
  };
}

async function commitTurn(
  sessions: InMemorySessionRepository,
  model: ScriptedModelGateway,
  text: string,
  narrative: string,
  commandId: string,
  expectedRevision: number,
) {
  model.enqueue({
    kind: 'success',
    chunks: [narrative],
    completedText: narrative,
  });
  const frames = await collectAsync(
    executeTurn(advance(text, { commandId, expectedRevision }), {
      sessions,
      model,
    }),
  );
  expect(frames.at(-1)?.type).toBe('committed');
  return sessions.read(SESSION);
}

describe('rerollTurn (Phase 4.1)', () => {
  it('reconstructs a Phase 4 name-only variable baseline', () => {
    const snapshot = createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(1),
      state: {
        travelerName: '后续名',
        turns: [{
          id: 'turn_phase4',
          playerText: '旧输入',
          narrativeText: '旧叙事',
          travelerNameBefore: '旧名',
          variablesBefore: null,
        }],
      },
    });

    expect(findTurnBaseSnapshot(snapshot, 'turn_phase4')?.state.variables.旅人.姓名)
      .toBe('旧名');
  });

  it('findTurnBaseSnapshot truncates suffix and keeps original player text', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    await commitTurn(sessions, model, '第一句', '叙事甲', 'a1', 0);
    await commitTurn(sessions, model, '第二句', '叙事乙', 'a2', 1);
    const current = await sessions.read(SESSION);
    expect(current.state.turns).toHaveLength(2);

    const firstId = current.state.turns[0]!.id;
    const base = findTurnBaseSnapshot(current, firstId);
    expect(base).not.toBeNull();
    expect(base!.originalPlayerText).toBe('第一句');
    expect(base!.state.turns).toHaveLength(0);
    expect(base!.state.messages).toHaveLength(0);
    expect(base!.state.turnCount).toBe(1);

    const secondId = current.state.turns[1]!.id;
    const base2 = findTurnBaseSnapshot(current, secondId);
    expect(base2!.state.turns).toHaveLength(1);
    expect(base2!.state.messages).toEqual([
      { role: 'user', content: '第一句' },
      { role: 'assistant', content: '叙事甲' },
    ]);
    expect(base2!.originalPlayerText).toBe('第二句');
  });

  it('reroll from base re-executes; formal state replaces narrative; revision +1 once', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    await commitTurn(sessions, model, '你好', '旧叙事', 'adv-1', 0);
    const afterAdvance = await sessions.read(SESSION);
    expect(afterAdvance.revision).toBe(1);
    const turnId = afterAdvance.state.turns[0]!.id;
    expect(turnId).toBe('turn_adv-1');

    model.enqueue({
      kind: 'success',
      chunks: ['新叙事'],
      completedText: '新叙事',
    });

    const frames = await collectAsync(
      rerollTurn(reroll(turnId, { commandId: 'reroll-1', expectedRevision: 1 }), {
        sessions,
        model,
      }),
    );

    expect(frames.some((f) => f.type === 'progress')).toBe(true);
    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)).toMatchObject({
      type: 'committed',
      revision: 2,
      view: {
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '新叙事' },
        ],
      },
    });

    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(2);
    expect(after.state.turns).toHaveLength(1);
    expect(after.state.turns[0]!.narrativeText).toBe('新叙事');
    expect(after.state.turns[0]!.playerText).toBe('你好');
    // New turn id from reroll advance commandId, not original.
    expect(after.state.turns[0]!.id).toBe('turn_reroll-1:advance');
    expect(after.state.turnCount).toBe(2);
  });

  it('reroll of earlier turn replaces suffix (discards later turns)', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    await commitTurn(sessions, model, 'A', '叙事A', 't-a', 0);
    await commitTurn(sessions, model, 'B', '叙事B', 't-b', 1);
    const mid = await sessions.read(SESSION);
    const firstTurnId = mid.state.turns[0]!.id;

    model.enqueue({
      kind: 'success',
      chunks: ['叙事A-reroll'],
      completedText: '叙事A-reroll',
    });

    const frames = await collectAsync(
      rerollTurn(
        reroll(firstTurnId, { commandId: 'reroll-first', expectedRevision: 2 }),
        { sessions, model },
      ),
    );
    expect(frames.at(-1)?.type).toBe('committed');

    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(3);
    expect(after.state.turns).toHaveLength(1);
    expect(after.state.messages).toEqual([
      { role: 'user', content: 'A' },
      { role: 'assistant', content: '叙事A-reroll' },
    ]);
    // Suffix turn B is gone.
    expect(after.state.messages.some((m) => m.content === '叙事B')).toBe(false);
  });

  it('reroll restores the target turn base for formal traveler state', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    await commitTurn(
      sessions,
      model,
      'A',
      '叙事A\n<变量更新>\nset 旅人.姓名 = "中间名"\n</变量更新>',
      'name-a',
      0,
    );
    await commitTurn(
      sessions,
      model,
      'B',
      '叙事B\n<变量更新>\nset 旅人.姓名 = "后续名"\n</变量更新>',
      'name-b',
      1,
    );
    const before = await sessions.read(SESSION);
    const firstTurnId = before.state.turns[0]!.id;
    expect(before.state.travelerName).toBe('后续名');

    model.enqueue({
      kind: 'success',
      chunks: ['重跑叙事'],
      completedText: '重跑叙事',
    });
    await collectAsync(
      rerollTurn(
        reroll(firstTurnId, { commandId: 'reroll-name', expectedRevision: 2 }),
        { sessions, model },
      ),
    );

    const after = await sessions.read(SESSION);
    expect(after.state.travelerName).toBe('开拓者');
    expect(after.state.turns).toHaveLength(1);
  });

  it('model failure mid-reroll leaves formal state at pre-reroll current', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    await commitTurn(sessions, model, '锁定', '正式叙事', 'lock-1', 0);
    const before = await sessions.read(SESSION);
    const turnId = before.state.turns[0]!.id;

    model.enqueue({
      kind: 'failure',
      message: 'reroll model down',
      chunks: ['…'],
    });

    const frames = await collectAsync(
      rerollTurn(reroll(turnId, { commandId: 'reroll-fail', expectedRevision: 1 }), {
        sessions,
        model,
      }),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure', message: 'reroll model down' },
    });
    // Option B: formal state remains pre-reroll current (not truncated base).
    expect(await sessions.read(SESSION)).toEqual(before);
  });

  it('unknown turnId is rejected without formal mutation', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    await commitTurn(sessions, model, 'x', 'y', 'u1', 0);
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      rerollTurn(
        reroll('turn_does_not_exist', {
          commandId: 'reroll-missing',
          expectedRevision: 1,
        }),
        { sessions, model },
      ),
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
    expect(await sessions.read(SESSION)).toEqual(before);
  });

  it('reroll commandId is idempotent (retry replays committed projection)', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    await commitTurn(sessions, model, '再来', '一次', 'idem-adv', 0);
    const turnId = (await sessions.read(SESSION)).state.turns[0]!.id;

    model.enqueue({
      kind: 'success',
      chunks: ['二次'],
      completedText: '二次',
    });

    const env = reroll(turnId, { commandId: 'reroll-idem', expectedRevision: 1 });
    const first = await collectAsync(rerollTurn(env, { sessions, model }));
    const retry = await collectAsync(rerollTurn(env, { sessions, model }));

    expect(first.at(-1)).toEqual(retry.at(-1));
    expect((await sessions.read(SESSION)).revision).toBe(2);
  });

  it('NativeKernel routes turn.reroll to native rerollTurn (not legacy)', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    await commitTurn(sessions, model, '核', '旧', 'nk-adv', 0);
    const turnId = (await sessions.read(SESSION)).state.turns[0]!.id;

    model.enqueue({
      kind: 'success',
      chunks: ['新核'],
      completedText: '新核',
    });

    const kernel = new NativeKernel({ sessions, model });
    const frames = await collectAsync(
      kernel.execute(
        reroll(turnId, { commandId: 'nk-reroll', expectedRevision: 1 }),
      ),
    );
    expect(frames.at(-1)?.type).toBe('committed');
    expect((await sessions.read(SESSION)).state.turns[0]!.narrativeText).toBe(
      '新核',
    );
  });

  it('native reroll source has no legacy UI rewrite-chain call sites', () => {
    const root = path.resolve(__dirname, '../../../src/kernel');
    const files = [
      'application/rerollTurn.ts',
      'NativeKernel.ts',
      'domain/turn/findTurnBaseSnapshot.ts',
      'domain/turn/createRerollAdvanceCommand.ts',
    ];
    // Strip block + line comments so doc mentions do not false-positive.
    const stripComments = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const rel of files) {
      const code = stripComments(fs.readFileSync(path.join(root, rel), 'utf8'));
      expect(code).not.toMatch(/\brestorePreTurnSnapshot\b/);
      expect(code).not.toMatch(/\bsetChatHistory\b/);
      expect(code).not.toMatch(/\bpreTurnSnapshot\b/);
    }
  });
});
