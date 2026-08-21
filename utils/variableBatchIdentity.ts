import type { 聊天消息 } from '@/models/chat';
import type { 变量命令批次 } from '@/models/variableCommand';
import { createStableEntityId } from '@/utils/stableFingerprint';

interface ChatTurnPair {
  user: 聊天消息;
  assistant: 聊天消息;
}

function buildChatTurnPairs(history: readonly 聊天消息[]): ChatTurnPair[] {
  const pairs: ChatTurnPair[] = [];
  for (let index = 0; index < history.length; index += 1) {
    const assistant = history[index];
    if (assistant.role !== 'assistant') continue;
    let user: 聊天消息 | undefined;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (history[cursor].role === 'user') {
        user = history[cursor];
        break;
      }
    }
    if (user) pairs.push({ user, assistant });
  }
  return pairs;
}

function numericGameTime(message: 聊天消息): number | null {
  if (!message.gameTime?.trim()) return null;
  const value = Number(message.gameTime);
  return Number.isFinite(value) && /^\d+(?:\.\d+)?$/.test(message.gameTime.trim()) ? value : null;
}

/**
 * 为旧变量批次补上稳定消息关联。
 * 只有一对一且来源明确时才会写入 link；多个候选或没有候选均保留为不可自动重试状态。
 */
export function linkVariableBatchesToChatHistory(
  batches: readonly 变量命令批次[] | null | undefined,
  history: readonly 聊天消息[] | null | undefined,
): 变量命令批次[] {
  if (!Array.isArray(batches) || !batches.length) return [];
  const pairs = buildChatTurnPairs(Array.isArray(history) ? history : []);

  return batches.map((batch) => {
    if (batch.targetMessageId || batch.targetUserMessageId) {
      const assistant = batch.targetMessageId
        ? pairs.find((pair) => pair.assistant.id === batch.targetMessageId)?.assistant
        : undefined;
      const pair = assistant ? pairs.find((candidate) => candidate.assistant.id === assistant.id) : undefined;
      const user = batch.targetUserMessageId
        ? pair && pair.user.id === batch.targetUserMessageId ? pair.user : undefined
        : pair?.user;
      if (assistant && user) {
        const turnId = batch.turnId
          ?? assistant.turnId
          ?? user.turnId
          ?? createStableEntityId('legacy_turn', [user.id, assistant.id]);
        return {
          ...batch,
          turnId,
          targetMessageId: assistant.id,
          targetUserMessageId: user.id,
          associationStatus: 'linked' as const,
        };
      }
      return {
        ...batch,
        associationStatus: 'unlinked' as const,
      };
    }

    if (batch.turnId) {
      const candidates = pairs.filter(({ user, assistant }) => user.turnId === batch.turnId && assistant.turnId === batch.turnId);
      if (candidates.length === 1) {
        return {
          ...batch,
          targetMessageId: candidates[0].assistant.id,
          targetUserMessageId: candidates[0].user.id,
          associationStatus: 'linked' as const,
        };
      }
      return {
        ...batch,
        associationStatus: candidates.length > 1 ? 'ambiguous' as const : 'unlinked' as const,
      };
    }

    const candidates = pairs.filter(({ user, assistant }) => {
      const sameUserTurn = numericGameTime(user) === batch.turn;
      const sameAssistantTurn = numericGameTime(assistant) === batch.turn;
      return sameUserTurn || sameAssistantTurn;
    });

    if (candidates.length !== 1) {
      return {
        ...batch,
        associationStatus: candidates.length > 1 ? 'ambiguous' : 'unlinked',
      };
    }

    const { user, assistant } = candidates[0];
    const turnId = assistant.turnId ?? user.turnId ?? createStableEntityId('legacy_turn', [user.id, assistant.id]);
    return {
      ...batch,
      turnId,
      targetMessageId: assistant.id,
      targetUserMessageId: user.id,
      associationStatus: 'linked',
    };
  });
}

export function findLinkedVariableBatchAssistant(
  history: readonly 聊天消息[] | null | undefined,
  batch: Pick<变量命令批次, 'turnId' | 'targetMessageId' | 'targetUserMessageId' | 'associationStatus'>,
): 聊天消息 | undefined {
  if (!Array.isArray(history)) return undefined;
  if (batch.associationStatus === 'ambiguous' || batch.associationStatus === 'unlinked') return undefined;
  if (batch.targetMessageId) {
    const message = history.find((item) => item.id === batch.targetMessageId && item.role === 'assistant');
    if (message && (!batch.turnId || !message.turnId || message.turnId === batch.turnId)) return message;
    return undefined;
  }
  if (!batch.turnId) return undefined;
  return history.find((item) => item.role === 'assistant' && item.turnId === batch.turnId);
}

export function findLinkedVariableBatchUser(
  history: readonly 聊天消息[] | null | undefined,
  batch: Pick<变量命令批次, 'turnId' | 'targetUserMessageId' | 'associationStatus'>,
): 聊天消息 | undefined {
  if (!Array.isArray(history)) return undefined;
  if (batch.associationStatus === 'ambiguous' || batch.associationStatus === 'unlinked') return undefined;
  if (batch.targetUserMessageId) {
    const message = history.find((item) => item.id === batch.targetUserMessageId && item.role === 'user');
    if (message && (!batch.turnId || !message.turnId || message.turnId === batch.turnId)) return message;
    return undefined;
  }
  if (!batch.turnId) return undefined;
  return history.find((item) => item.role === 'user' && item.turnId === batch.turnId);
}
