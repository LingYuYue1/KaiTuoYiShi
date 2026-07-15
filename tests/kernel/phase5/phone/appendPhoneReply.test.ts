/**
 * Stage 5.3 — appendPhoneReply pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  appendPhoneReply,
  type KernelPhoneSystem,
} from '@/src/kernel/domain/phone';

function emptyPhone(): KernelPhoneSystem {
  return { threads: [] };
}

function phoneWithThread(): KernelPhoneSystem {
  return {
    threads: [
      {
        contactId: 'c1',
        contactName: '三月七',
        messages: [
          {
            id: 'm0',
            role: 'contact',
            contactId: 'c1',
            content: '嗨',
            turn: 1,
          },
        ],
      },
    ],
  };
}

describe('appendPhoneReply (Stage 5.3)', () => {
  it('appends user and contact messages to an existing thread', () => {
    const phone = phoneWithThread();
    const frozen = JSON.stringify(phone);

    const next = appendPhoneReply(phone, {
      contactId: 'c1',
      contactName: '三月七',
      userText: '在吗？',
      replyText: '在的！',
      turn: 4,
      userMessageId: 'u1',
      replyMessageId: 'r1',
    });

    expect(next.threads).toHaveLength(1);
    expect(next.threads[0].messages).toHaveLength(3);
    expect(next.threads[0].messages[1]).toEqual({
      id: 'u1',
      role: 'user',
      contactId: 'c1',
      content: '在吗？',
      turn: 4,
    });
    expect(next.threads[0].messages[2]).toEqual({
      id: 'r1',
      role: 'contact',
      contactId: 'c1',
      content: '在的！',
      turn: 4,
    });
    expect(JSON.stringify(phone)).toBe(frozen);
  });

  it('creates a new thread when contact is missing', () => {
    const next = appendPhoneReply(emptyPhone(), {
      contactId: 'c9',
      contactName: '丹恒',
      userText: '你好',
      replyText: '嗯。',
      turn: 2,
      userMessageId: 'u9',
      replyMessageId: 'r9',
    });

    expect(next.threads).toHaveLength(1);
    expect(next.threads[0].contactId).toBe('c9');
    expect(next.threads[0].contactName).toBe('丹恒');
    expect(next.threads[0].messages).toHaveLength(2);
  });

  it('throws on empty replyText', () => {
    expect(() =>
      appendPhoneReply(phoneWithThread(), {
        contactId: 'c1',
        contactName: '三月七',
        userText: '嗨',
        replyText: '   ',
        turn: 1,
        userMessageId: 'u1',
        replyMessageId: 'r1',
      }),
    ).toThrow(/input\.replyText must be a non-empty string/);
  });

  it('throws on empty userText', () => {
    expect(() =>
      appendPhoneReply(phoneWithThread(), {
        contactId: 'c1',
        contactName: '三月七',
        userText: '',
        replyText: '回',
        turn: 1,
        userMessageId: 'u1',
        replyMessageId: 'r1',
      }),
    ).toThrow(/input\.userText must be a non-empty string/);
  });

  it('throws on empty contactId', () => {
    expect(() =>
      appendPhoneReply(emptyPhone(), {
        contactId: '',
        contactName: 'X',
        userText: 'a',
        replyText: 'b',
        turn: 1,
        userMessageId: 'u1',
        replyMessageId: 'r1',
      }),
    ).toThrow(/input\.contactId must be a non-empty string/);
  });

  it('throws when message ids collide', () => {
    expect(() =>
      appendPhoneReply(emptyPhone(), {
        contactId: 'c1',
        contactName: 'X',
        userText: 'a',
        replyText: 'b',
        turn: 1,
        userMessageId: 'same',
        replyMessageId: 'same',
      }),
    ).toThrow(/userMessageId and replyMessageId must differ/);
  });
});
