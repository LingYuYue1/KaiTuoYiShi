/**
 * 活跃叶子恢复态的放弃 / 撤销动作（kernelization §10.2，U2）。
 *
 * 恢复信息只属于活跃叶子：放弃 = 写回清除 turnPhase / recoveryContext；
 * awaitingLanding 的未落地回合同时剥离本回合用户消息（残余写入）。
 * 撤销与重试共用本动作：撤销把输入文本交还输入区，重试随后重新发送同一文本。
 */
import type { UseGameStateReturn } from '@/hooks/useGameState';
import { resetEphemeralFields } from '@/models/leafLifecycle';
import type { TurnPhase, TurnRecoveryContext } from '@/models/turnRecovery';
import { loadActiveLeaf, writeLeafNode } from '@/services/storage/saveTree';
import { devLog, devLogError } from '@/utils/devLog';

export interface AbandonTurnRecoveryResult {
  ok: boolean;
  /** 被放弃回合的原始输入；无恢复现场时为 null。 */
  text: string | null;
}

/**
 * 恢复态投影的唯一写入点：turnPhase（state）与 recovery（activeWorkflow）恒成对出现，
 * 调用方不再分别 set 两次（新鲜开局的 awaitingLanding + null 除外，它本就是成对值）。
 */
export function projectRecovery(
  state: UseGameStateReturn,
  phase: TurnPhase | null,
  recovery: TurnRecoveryContext | null,
): void {
  state.setTurnPhase(phase);
  state.activeWorkflow.setRecovery(recovery);
}

/** 恢复投影复位：封版 / 放弃 / 恢复失效后回到无未封版回合状态。 */
export function clearRecoveryProjection(state: UseGameStateReturn): void {
  projectRecovery(state, null, null);
}

/**
 * 叶子恢复态写回清除（storage）：续跑守卫失效、boot 不一致两条路径共用。
 * 失败吞错并返回 false（调用方按语义记日志 / 降级），成功返回 true。
 */
export async function writeClearedRecovery(headNodeId: string | null): Promise<boolean> {
  if (!headNodeId) return false;
  try {
    await writeLeafNode(headNodeId, resetEphemeralFields({}));
    return true;
  } catch (error) {
    devLogError('recover', 'leaf-recovery-clear-failed', error, { headNodeId });
    return false;
  }
}

export async function abandonTurnRecovery(state: UseGameStateReturn): Promise<AbandonTurnRecoveryResult> {
  const recovery = state.activeWorkflow.recovery;
  const phase = state.turnPhase;
  if (!recovery || !phase) return { ok: true, text: null };

  let ok = true;
  try {
    const active = await loadActiveLeaf();
    if (active.status === 'ok' && active.newest.headNodeId) {
      const stripPendingUserMessage = phase === 'awaitingLanding';
      const chatHistory = stripPendingUserMessage
        ? active.leaf.chatHistory.filter((message) => message.id !== recovery.userMessageId)
        : active.leaf.chatHistory;
      await writeLeafNode(active.newest.headNodeId, resetEphemeralFields({
        chatHistory,
      }));
      state.setChatHistory(chatHistory);
      devLog('recover', 'turn-recovery-abandoned', {
        phase,
        headNodeId: active.newest.headNodeId,
        strippedUserMessage: stripPendingUserMessage,
      });
    } else {
      ok = false;
      devLog('recover', 'turn-recovery-abandon-skipped', { phase, reason: active.status });
    }
  } catch (error) {
    ok = false;
    devLogError('recover', 'turn-recovery-abandon-failed', error, { phase });
  } finally {
    clearRecoveryProjection(state);
  }
  return { ok, text: recovery.userInput };
}
