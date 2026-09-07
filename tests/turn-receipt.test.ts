import { describe, expect, it } from 'vitest';
import { createTurnReceiptFromMessages } from '@/hooks/useGame/turnReceipt';
import { requireTurnAfterReply } from '@/hooks/useGame/turnTypes';

describe('turn receipt', () => {
  it('keeps the landed reply identity together for downstream work', () => {
    const receipt = createTurnReceiptFromMessages({
      sessionEpoch: 7,
      turn: 3,
      leafId: 'leaf-1',
      userMessage: { id: 'user-1', content: 'go' },
      assistantMessage: { id: 'assistant-1' },
    });

    expect(receipt).toMatchObject({
      sessionEpoch: 7,
      turn: 3,
      leafId: 'leaf-1',
      assistantMessageId: 'assistant-1',
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    const batch = {
      turn: receipt.turn,
      targetMessageId: receipt.assistantMessageId,
    };
    expect(batch).toEqual({ turn: 3, targetMessageId: 'assistant-1' });
  });

  it('rejects tail execution before the reply is landed', () => {
    expect(() => requireTurnAfterReply({})).toThrow('回合结算必须先完成回复落地');
  });
});
