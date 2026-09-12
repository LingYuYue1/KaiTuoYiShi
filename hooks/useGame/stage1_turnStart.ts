/**
 * 阶段 1：回合开始 —— 快照、瞬态字段消费、用户消息、历史清理
 */
import { 创建聊天消息 } from '@/models/chat';
import { OPENING_INPUT } from '@/models/opening';
import type { 世界状态 } from '@/models/world';
import { resetEphemeralFields } from '@/models/leafLifecycle';
import { compactPreTurnSnapshot } from '@/utils/saveRuntimeCompactor';
import { compactChatHistoryForLongSession } from '@/utils/longSessionRetention';
import {
  persistWorkflowRecoveryJournal,
  updateWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import { writeTurnLeaf } from './workflowTransaction';
import type { TurnContext } from './turnTypes';

export async function stage1_turnStart(
  ctx: TurnContext,
  headNodeId: string | null,
  userInput: string,
  effectiveWorld: 世界状态,
  recoveryJournal: ReturnType<typeof import('@/services/workflowRecovery').createWorkflowRecoveryJournal>,
) {
  const { state } = ctx;
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
  });

  // 开局引导（一次性瞬态字段）的唯一消费点：消费条件只看「本回合输入就是开局常量」，
  // 不回读 React 投影（派发方可能已提前清空投影）；写入随工作流守卫走同一叶子通道，
  // 失败/被顶替前保持未消费。
  if (userInput === OPENING_INPUT) {
    await writeTurnLeaf(ctx, headNodeId, resetEphemeralFields({}));
    state.setPendingOpeningTrigger(null);
  }

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
  // 投影点（裁决 S02 保留）：玩家消息须立即可见；存档只认 d，此 setter 仅刷新 UI
  state.setChatHistory(updatedHistory);

  return { preTurnSnapshot, userMsg, purgedHistory, recoveryJournal: rj, updatedHistory };
}
