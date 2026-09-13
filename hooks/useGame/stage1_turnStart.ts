/**
 * 阶段 1：回合开始 —— 快照、用户消息、回合相位落盘、历史清理
 */
import { 创建聊天消息 } from '@/models/chat';
import type { 世界状态 } from '@/models/world';
import type { TurnRecoveryContext } from '@/models/turnRecovery';
import { compactPreTurnSnapshot } from '@/utils/saveRuntimeCompactor';
import { compactChatHistoryForLongSession } from '@/utils/longSessionRetention';
import { writeTurnLeaf } from './workflowTransaction';
import { projectRecovery } from './recoveryActions';
import type { TurnContext } from './turnTypes';

export async function stage1_turnStart(
  ctx: TurnContext,
  headNodeId: string | null,
  userInput: string,
  effectiveWorld: 世界状态,
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

  const userMsg = 创建聊天消息('user', userInput, {
    gameTime: `${state.turnCount}`,
    preTurnSnapshot,
  });

  const purgedHistory = compactChatHistoryForLongSession(state.chatHistory.map((m) =>
    m.role === 'assistant' && m.preTurnSnapshot
      ? { ...m, preTurnSnapshot: undefined }
      : m,
  ));

  const updatedHistory = [...purgedHistory, userMsg];
  const recoveryContext: TurnRecoveryContext = {
    turnAtStart: state.turnCount,
    userInput,
    userMessageId: userMsg.id,
  };

  // 回合开始边界（kernelization §10.2）：用户消息与 awaitingLanding 相位在同一次
  // 受保护叶子写入中原子落盘——正文落地前的中断现场完全由叶子承载，刷新后可重试 / 撤销。
  // 开局引导的消费也在此完成：新局叶子的 awaitingLanding 被本回合上下文覆盖。
  await writeTurnLeaf(ctx, headNodeId, {
    chatHistory: updatedHistory,
    turnPhase: 'awaitingLanding',
    recoveryContext,
  });

  // 投影点（裁决 S02 保留）：玩家消息与相位须立即可见；存档只认叶子，此 setter 仅刷新 UI。
  state.setChatHistory(updatedHistory);
  projectRecovery(state, 'awaitingLanding', recoveryContext);

  return { preTurnSnapshot, userMsg, purgedHistory, recoveryContext, updatedHistory };
}
