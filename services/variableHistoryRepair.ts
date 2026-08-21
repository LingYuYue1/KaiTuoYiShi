import type { 聊天消息 } from '@/models/chat';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { VariableRepairPlan } from '@/utils/variableRepair';

export interface VariableHistoryRepairCandidate {
  message: 聊天消息;
  turn: number;
  hasBatch: boolean;
  status: 'missing' | 'failed' | 'unresolved' | 'recorded';
}

export interface VariableHistoryRepairDraft {
  schemaVersion: 1;
  id: string;
  stateFingerprint: string;
  messageIds: string[];
  completedMessageIds: string[];
  plans: VariableRepairPlan[];
  status: 'running' | 'paused' | 'ready' | 'completed' | 'cancelled' | 'failed';
  updatedAt: number;
  error?: string;
}

export interface VariableHistoryRepairProgress {
  total: number;
  completed: number;
  currentMessageId?: string;
}

export function listVariableHistoryRepairCandidates(
  chatHistory: readonly 聊天消息[],
  batches: readonly 变量命令批次[],
  range?: { start?: number; end?: number },
): VariableHistoryRepairCandidate[] {
  const batchByMessageId = new Map<string, 变量命令批次>();
  for (const batch of batches) {
    if (batch.targetMessageId) batchByMessageId.set(batch.targetMessageId, batch);
  }
  return chatHistory
    .filter((message) => message.role === 'assistant' && !message.isStreaming)
    .map((message) => {
      const turn = Number(message.gameTime);
      const normalizedTurn = Number.isFinite(turn) && turn > 0 ? Math.trunc(turn) : 0;
      const batch = batchByMessageId.get(message.id);
      const hasBody = Boolean(message.parsedResponse?.body?.trim() || message.content.trim());
      const failed = Boolean(batch?.results.some((result) => !result.ok && result.kind !== 'warning'));
      const unresolved = Boolean(batch?.coverage?.unresolvedTypes.length);
      const status: VariableHistoryRepairCandidate['status'] = !batch
        ? 'missing'
        : failed
          ? 'failed'
          : unresolved
            ? 'unresolved'
            : 'recorded';
      return {
        message,
        turn: normalizedTurn,
        hasBatch: Boolean(batch),
        status,
        hasBody,
      };
    })
    .filter((candidate) => candidate.hasBody)
    .filter((candidate) => range?.start === undefined || candidate.turn === 0 || candidate.turn >= range.start)
    .filter((candidate) => range?.end === undefined || candidate.turn === 0 || candidate.turn <= range.end)
    .filter((candidate) => candidate.status !== 'recorded')
    .map(({ hasBody: _hasBody, ...candidate }) => candidate)
    .sort((left, right) => left.turn - right.turn || left.message.timestamp - right.message.timestamp);
}

export function createVariableHistoryRepairDraft(input: {
  id: string;
  stateFingerprint: string;
  messageIds: string[];
  plans?: VariableRepairPlan[];
  completedMessageIds?: string[];
  status?: VariableHistoryRepairDraft['status'];
  error?: string;
}): VariableHistoryRepairDraft {
  return {
    schemaVersion: 1,
    id: input.id,
    stateFingerprint: input.stateFingerprint,
    messageIds: [...input.messageIds],
    completedMessageIds: [...(input.completedMessageIds ?? [])],
    plans: [...(input.plans ?? [])],
    status: input.status ?? 'running',
    updatedAt: Date.now(),
    ...(input.error ? { error: input.error } : {}),
  };
}

export function isVariableHistoryRepairAbort(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
    || (error instanceof Error && /abort|cancel/i.test(error.message));
}
