/**
 * Stage 5.3 — phone.reply revision conflict leaves state unchanged.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type PhoneReplyEnvelope,
} from '@/src/kernel/contract';
import { phoneReply } from '@/src/kernel/application/phoneReply';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';

const SESSION = asSessionId('phase53-phone-rev');

describe('phoneReply revision conflict (Stage 5.3)', () => {
  it('rejects stale expectedRevision before model call', async () => {
    const sessions = new InMemorySessionRepository();
    sessions.seed(
      createSessionSnapshot({
        sessionId: SESSION,
        revision: asRevision(2),
        state: { turnCount: 1, travelerName: '开拓者' },
      }),
    );
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['不应调用'],
      completedText: '不应调用',
    });
    const before = await sessions.read(SESSION);

    const envelope: PhoneReplyEnvelope = {
      protocolVersion: 1,
      commandId: asCommandId('phone-stale-1'),
      sessionId: SESSION,
      expectedRevision: asRevision(0),
      command: {
        type: 'phone.reply',
        contactId: 'npc_1',
        contactName: '丹恒',
        userText: '在吗',
      },
    };

    const frames = await collectAsync(phoneReply(envelope, { sessions, model }));
    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: {
        code: 'revision_conflict',
        details: { actualRevision: 2 },
      },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
  });

  it('CAS conflict after concurrent write rejects without double-apply', async () => {
    const sessions = new InMemorySessionRepository();
    sessions.seed(
      createSessionSnapshot({
        sessionId: SESSION,
        revision: asRevision(0),
        state: { turnCount: 1, travelerName: '开拓者' },
      }),
    );
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['并发回复'],
      completedText: '并发回复',
    });

    // Simulate another writer bumping revision while model streams.
    const originalComplete = model.complete.bind(model);
    model.complete = async function* (request) {
      await sessions.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        nextState: {
          ...(await sessions.read(SESSION)).state,
          travelerName: '并发写入者',
        },
        commandId: asCommandId('other-writer'),
      });
      yield* originalComplete(request);
    };

    const envelope: PhoneReplyEnvelope = {
      protocolVersion: 1,
      commandId: asCommandId('phone-cas-race'),
      sessionId: SESSION,
      expectedRevision: asRevision(0),
      command: {
        type: 'phone.reply',
        contactId: 'npc_1',
        contactName: '丹恒',
        userText: '在吗',
      },
    };

    const frames = await collectAsync(phoneReply(envelope, { sessions, model }));
    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'revision_conflict' },
    });

    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(1);
    expect(after.state.travelerName).toBe('并发写入者');
    // Phone reply must not have been written under the stale CAS.
    expect(after.state.phone.threads).toEqual([]);
  });
});
