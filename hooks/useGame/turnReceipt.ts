import type { 聊天消息 } from '@/models/chat';

/** 已落地助手回复的不可变身份；仅在当前工作流内传递，不写入存档。 */
export interface TurnReceipt {
  readonly sessionEpoch: number;
  readonly turn: number;
  readonly leafId: string;
  readonly userMessageId: string;
  readonly assistantMessageId: string;
  readonly input: string;
}

export function createTurnReceipt(receipt: TurnReceipt): TurnReceipt {
  return Object.freeze(receipt);
}

export function createTurnReceiptFromMessages(params: {
  sessionEpoch: number;
  turn: number;
  leafId: string;
  userMessage: Pick<聊天消息, 'id' | 'content'>;
  assistantMessage: Pick<聊天消息, 'id'>;
}): TurnReceipt {
  return createTurnReceipt({
    sessionEpoch: params.sessionEpoch,
    turn: params.turn,
    leafId: params.leafId,
    userMessageId: params.userMessage.id,
    assistantMessageId: params.assistantMessage.id,
    input: params.userMessage.content,
  });
}
