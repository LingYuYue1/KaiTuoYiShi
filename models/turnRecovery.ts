/**
 * 活跃叶子恢复态（kernelization.md §10.1 / §10.4）：
 * 三态 turnPhase（awaitingLanding / settling / 封版后无状态）与恢复上下文。
 *
 * 两者只属于 newest 指针指向的活跃叶子，ephemeral 生命周期声明在
 * models/leafLifecycle.ts（commitLeaf 剥离、新叶子重置）。恢复信息不再有
 * 独立的日志存储；检查点不携带恢复上下文（K8）。
 */

/** 未封版回合的相位；null = 封版后无状态。 */
export type TurnPhase = 'awaitingLanding' | 'settling';

export interface TurnRecoveryContext {
  /** 本回合开始时的 turnCount。 */
  turnAtStart: number;
  /** 本回合原始输入（重试时原样重发）。 */
  userInput: string;
  /** 本回合用户消息 id（撤销时按 id 剥离残余写入）。 */
  userMessageId: string;
  /** 正文落地后的助手消息 id（settling 恢复用；awaitingLanding 为空）。 */
  assistantMessageId?: string;
}

const MAX_INPUT_LENGTH = 100_000;
const MAX_ID_LENGTH = 200;

/**
 * 容忍旧数据 / 手工改档：结构不完整时返回 issue 与 null，不静默兜底。
 * 调用方负责记录 issue 并写回清除。
 */
export function normalizeTurnRecoveryContext(raw: unknown): {
  value: TurnRecoveryContext | null;
  issue?: string;
} {
  if (raw === null || typeof raw === 'undefined') return { value: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: null, issue: '不是合法的恢复上下文对象' };
  }
  const record = raw as Record<string, unknown>;
  const turnAtStart = Math.trunc(Number(record.turnAtStart));
  const userInput = typeof record.userInput === 'string' ? record.userInput : '';
  const userMessageId = typeof record.userMessageId === 'string' ? record.userMessageId : '';
  if (!Number.isFinite(turnAtStart) || turnAtStart < 1 || !userInput.trim() || !userMessageId.trim()) {
    return { value: null, issue: '缺少回合数 / 输入文本 / 用户消息 id' };
  }
  const rawAssistantId = record.assistantMessageId;
  const assistantMessageId = typeof rawAssistantId === 'string' && rawAssistantId.trim()
    ? rawAssistantId.slice(0, MAX_ID_LENGTH)
    : undefined;
  return {
    value: {
      turnAtStart,
      userInput: userInput.slice(0, MAX_INPUT_LENGTH),
      userMessageId: userMessageId.slice(0, MAX_ID_LENGTH),
      ...(assistantMessageId ? { assistantMessageId } : {}),
    },
  };
}
