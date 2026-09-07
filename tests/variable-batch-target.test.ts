import { describe, expect, it } from 'vitest';
import { findAssistantMessageForBatch } from '@/hooks/useGame/workflowRetry';
import { buildVariableBatch } from '@/hooks/useGame/variableWorkflow';
import type { 聊天消息 } from '@/models/chat';

const assistant = (id: string): 聊天消息 => ({
  id,
  role: 'assistant',
  content: id,
  timestamp: 1,
  gameTime: '3',
});

describe('variable batch message association', () => {
  it('derives batch ownership from the landed receipt', () => {
    const batch = buildVariableBatch({
      receipt: { turn: 8, assistantMessageId: 'assistant-8', input: 'continue' },
      source: 'main',
      results: [],
    });

    expect(batch.turn).toBe(8);
    expect(batch.targetMessageId).toBe('assistant-8');
  });

  it('uses the recorded message when a turn has multiple assistant messages', () => {
    const first = assistant('first');
    const target = assistant('target');

    expect(findAssistantMessageForBatch([first, target], {
      targetMessageId: target.id,
      turn: 3,
    })).toBe(target);
  });

  it('falls back to the same-turn assistant when the recorded message is stale', () => {
    const target = assistant('target');

    expect(findAssistantMessageForBatch([target], {
      targetMessageId: 'removed',
      turn: 3,
    })).toBe(target);
  });

  it('falls back to the latest assistant when the turn is unknown', () => {
    const latest = assistant('latest');
    latest.gameTime = '4';

    expect(findAssistantMessageForBatch([assistant('earlier'), latest], {
      turn: 99,
    })).toBe(latest);
  });

  it('ignores a target with the wrong role before applying turn fallback', () => {
    const user = { ...assistant('target'), role: 'user' as const };
    const sameTurn = assistant('same-turn');

    expect(findAssistantMessageForBatch([user, sameTurn], {
      targetMessageId: user.id,
      turn: 3,
    })).toBe(sameTurn);
  });
});
