/**
 * Stage 5.3 — phone.reply success, model failure, commandId idempotency.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type PhoneReplyEnvelope,
} from '@/src/kernel/contract';
import { phoneReply } from '@/src/kernel/application/phoneReply';
import { NativeKernel } from '@/src/kernel/NativeKernel';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';

const SESSION = asSessionId('phase53-phone-exec');

function seedEmpty() {
  const sessions = new InMemorySessionRepository();
  sessions.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(0),
      state: { turnCount: 3, travelerName: '开拓者' },
    }),
  );
  return sessions;
}

function reply(
  opts?: Readonly<{
    commandId?: string;
    expectedRevision?: number;
    contactId?: string;
    contactName?: string;
    userText?: string;
  }>,
): PhoneReplyEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts?.commandId ?? 'phone-cmd-1'),
    sessionId: SESSION,
    expectedRevision: asRevision(opts?.expectedRevision ?? 0),
    command: {
      type: 'phone.reply',
      contactId: opts?.contactId ?? 'npc_march',
      contactName: opts?.contactName ?? '三月七',
      userText: opts?.userText ?? '你好，最近怎么样？',
    },
  };
}

describe('phoneReply execute (Stage 5.3)', () => {
  it('commits player + contact messages and bumps revision once', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['还不错！刚从空间站回来。'],
      completedText: '还不错！刚从空间站回来。',
    });
    const before = await sessions.read(SESSION);
    expect(before.state.phone.threads).toEqual([]);

    const frames = await collectAsync(
      phoneReply(reply({ commandId: 'phone-ok-1' }), { sessions, model }),
    );

    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)?.type).toBe('committed');

    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.state.phone.threads).toHaveLength(1);
    const thread = after.state.phone.threads[0]!;
    expect(thread.contactId).toBe('npc_march');
    expect(thread.contactName).toBe('三月七');
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]).toMatchObject({
      role: 'user',
      content: '你好，最近怎么样？',
      turn: 3,
    });
    expect(thread.messages[1]).toMatchObject({
      role: 'contact',
      content: '还不错！刚从空间站回来。',
      turn: 3,
    });

    // Other formal fields preserved
    expect(after.state.knowledge).toEqual(before.state.knowledge);
    expect(after.state.news).toEqual(before.state.news);
    expect(after.state.variables).toEqual(before.state.variables);
    expect(after.state.turnCount).toBe(before.state.turnCount);

    const terminal = frames.at(-1);
    if (terminal?.type === 'committed') {
      expect(terminal.view.phone.threadCount).toBe(1);
      expect(terminal.view.phone.messageCount).toBe(2);
      expect(terminal.view.phone.lastMessages[0]?.content).toBe(
        '还不错！刚从空间站回来。',
      );
    }
  });

  it('model failure leaves phone state unchanged', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    model.enqueue({ kind: 'failure', message: 'upstream timeout' });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      phoneReply(reply({ commandId: 'phone-fail-1' }), { sessions, model }),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure' },
    });
    const after = await sessions.read(SESSION);
    expect(after).toEqual(before);
    expect(after.state.phone.threads).toEqual([]);
  });

  it('commandId idempotency returns prior commit without second model call', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['第一次回复'],
      completedText: '第一次回复',
    });
    model.enqueue({
      kind: 'success',
      chunks: ['不该被用到'],
      completedText: '不该被用到',
    });

    const envelope = reply({ commandId: 'phone-idem-1' });
    const first = await collectAsync(phoneReply(envelope, { sessions, model }));
    expect(first.at(-1)?.type).toBe('committed');
    const mid = await sessions.read(SESSION);

    const second = await collectAsync(phoneReply(envelope, { sessions, model }));
    expect(second.at(-1)?.type).toBe('committed');
    if (second.at(-1)?.type === 'committed' && first.at(-1)?.type === 'committed') {
      expect(second.at(-1)).toEqual(first.at(-1));
    }
    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(mid.revision);
    expect(after.state.phone.threads[0]?.messages).toHaveLength(2);
    expect(after.state.phone.threads[0]?.messages[1]?.content).toBe('第一次回复');
  });

  it('NativeKernel routes phone.reply (never legacy)', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['内核路由成功'],
      completedText: '内核路由成功',
    });
    const kernel = new NativeKernel({ sessions, model });

    const frames = await collectAsync(
      kernel.execute(reply({ commandId: 'phone-native-1' })),
    );
    expect(frames.at(-1)?.type).toBe('committed');
    const after = await sessions.read(SESSION);
    expect(after.state.phone.threads[0]?.messages[1]?.content).toBe('内核路由成功');
  });

  it('rejects empty userText without model call or write', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['不应到达'],
      completedText: '不应到达',
    });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      phoneReply(reply({ commandId: 'phone-empty', userText: '' }), {
        sessions,
        model,
      }),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'unknown' },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
  });
});
