/**
 * Stage 5.3 — buildPhonePrompt pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  buildPhonePrompt,
  type KernelPhoneSystem,
} from '@/src/kernel/domain/phone';

function phone(): KernelPhoneSystem {
  return {
    threads: [
      {
        contactId: 'c1',
        contactName: '三月七',
        messages: [
          {
            id: 'm1',
            role: 'user',
            contactId: 'c1',
            content: '今天有空吗？',
            turn: 2,
          },
          {
            id: 'm2',
            role: 'contact',
            contactId: 'c1',
            content: '有！去哪玩？',
            turn: 2,
          },
        ],
      },
    ],
  };
}

describe('buildPhonePrompt (Stage 5.3)', () => {
  it('includes history and the new user text', () => {
    const prompt = buildPhonePrompt(phone(), {
      contactId: 'c1',
      userText: '去观景车厢',
      turnCount: 5,
    });

    expect(prompt).toContain('当前回合：5');
    expect(prompt).toContain('联系人：三月七（c1）');
    expect(prompt).toContain('玩家：今天有空吗？');
    expect(prompt).toContain('对方：有！去哪玩？');
    expect(prompt).toContain('玩家刚发送：去观景车厢');
    expect(prompt).toContain('请生成对方回复。');
  });

  it('throws when thread does not exist', () => {
    expect(() =>
      buildPhonePrompt(phone(), {
        contactId: 'missing',
        userText: 'hi',
        turnCount: 1,
      }),
    ).toThrow(/thread not found for contactId: missing/);
  });

  it('throws on empty userText', () => {
    expect(() =>
      buildPhonePrompt(phone(), {
        contactId: 'c1',
        userText: '  ',
        turnCount: 1,
      }),
    ).toThrow(/input\.userText must be a non-empty string/);
  });

  it('shows empty-history marker for brand-new threads', () => {
    const emptyThread: KernelPhoneSystem = {
      threads: [
        {
          contactId: 'c2',
          contactName: '丹恒',
          messages: [],
        },
      ],
    };

    const prompt = buildPhonePrompt(emptyThread, {
      contactId: 'c2',
      userText: '第一次联系',
      turnCount: 1,
    });

    expect(prompt).toContain('（无历史消息）');
    expect(prompt).toContain('玩家刚发送：第一次联系');
  });
});
