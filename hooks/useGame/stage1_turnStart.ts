/**
 * 阶段 1：回合开始 —— 快照、用户消息、历史清理
 */
import type { UseGameStateReturn } from '@/hooks/useGameState';
import { 创建聊天消息 } from '@/models/chat';
import type { 世界状态 } from '@/models/world';
import { compactPreTurnSnapshot } from '@/utils/saveRuntimeCompactor';
import { compactChatHistoryForLongSession } from '@/utils/longSessionRetention';
import {
  persistWorkflowRecoveryJournal,
  updateWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';

export async function stage1_turnStart(
  state: UseGameStateReturn,
  userInput: string,
  effectiveWorld: 世界状态,
  recoveryJournal: ReturnType<typeof import('@/services/workflowRecovery').createWorkflowRecoveryJournal>,
) {
  const preTurnSnapshot = compactPreTurnSnapshot({
    旅人: state.旅人,
    世界: effectiveWorld,
    记忆: state.记忆,
    忆庭: state.忆庭,
    智库: state.智库,
    手机: state.手机,
    NPC: state.NPC,
    相册: state.相册,
    新闻: state.新闻,
    剧情: state.剧情,
    剧情编织: state.剧情编织,
    variableBatches: state.variableBatches,
    queueTasks: state.queueTasks,
    turnCount: state.turnCount,
    pendingOpeningTrigger: state.pendingOpeningTrigger,
  });

  const userMsg = 创建聊天消息('user', userInput, {
    gameTime: `${state.turnCount}`,
    preTurnSnapshot,
  });

  let rj = recoveryJournal;
  rj = updateWorkflowRecoveryJournal(rj, { userMessageId: userMsg.id });
  await persistWorkflowRecoveryJournal(rj);

  const purgedHistory = compactChatHistoryForLongSession(state.chatHistory.map((m) =>
    m.role === 'assistant' && m.preTurnSnapshot
      ? { ...m, preTurnSnapshot: undefined }
      : m,
  ));

  const updatedHistory = [...purgedHistory, userMsg];
  state.setChatHistory(updatedHistory);

  return { preTurnSnapshot, userMsg, purgedHistory, recoveryJournal: rj, updatedHistory };
}
