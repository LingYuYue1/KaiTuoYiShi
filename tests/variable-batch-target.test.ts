import { describe, expect, it } from 'vitest';
import { findAssistantMessageForBatch } from '@/hooks/useGame/workflowRetry';
import type { 聊天消息 } from '@/models/chat';

const assistant = (id: string): 聊天消息 => ({
  id,
  role: 'assistant',
  content: id,
  timestamp: 1,
  gameTime: '3',
});

describe('variable batch message association', () => {
  it('uses the recorded message when a turn has multiple assistant messages', () => {
    const first = assistant('first');
    const target = assistant('target');

    expect(findAssistantMessageForBatch([first, target], {
      targetMessageId: target.id,
      turn: 3,
    })).toBe(target);
  });
});
