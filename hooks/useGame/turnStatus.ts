/**
 * 回合工作流状态条：输入区小状态条的唯一状态源。
 *
 * 取代旧的 workflowHint + workflowStatus + 由 queueTasks 派生的
 * workflowFailed / workflowFailCount / workflowRetrying 多通道叠加：
 * - 状态条只消费这里的一个值，管线在正确的相位边界写入，UI 只做渲染。
 * - kind 描述语义：searching=预模型召回 / generating=主模型生成 /
 *   settling=正文落地后的后台结算 / failed / stopped 为终结态，idle 隐藏状态条。
 */
export type TurnStatus =
  | { kind: 'idle' }
  | { kind: 'searching'; text: string }
  | { kind: 'generating'; text: string }
  | { kind: 'settling'; text: string }
  | { kind: 'failed'; text: string; failCount: number }
  | { kind: 'stopped'; text: string };

export const TURN_STATUS_IDLE: TurnStatus = { kind: 'idle' };

/** 是否处于可取消的进行中相位（searching / generating 允许在状态条上点「取消」）。 */
export function isTurnStatusCancellable(status: TurnStatus): boolean {
  return status.kind === 'searching' || status.kind === 'generating';
}

/** 是否处于进行中（有 spinner）相位。 */
export function isTurnStatusActive(status: TurnStatus): boolean {
  return status.kind === 'searching' || status.kind === 'generating' || status.kind === 'settling';
}
