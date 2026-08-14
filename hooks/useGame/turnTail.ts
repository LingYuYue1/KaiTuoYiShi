import { type 工作区字段集, type NewestStory记录 } from '@/models/newestStory';
import { writeLeafNode } from '@/services/storage/saveTree';
import { compactVariableBatchHistory } from '@/utils/longSessionRetention';
import { stage6_memory } from './stage6_memory';
import { stage7_worldTraveler } from './stage7_worldTraveler';
import { stage8_variable } from './stage8_variable';
import { stage9_npcLedger } from './stage9_npcLedger';
import { stage10_storyZhiku } from './stage10_storyZhiku';
import { stage11_backgroundJobs } from './stage11_backgroundJobs';
import { stage12_save } from './stage12_save';
import type { TurnContext, TurnDeltas } from './turnTypes';

type VariableOverridesForNewest = {
  batch?: import('@/models/variableCommand').变量命令批次;
  旅人?: TurnContext['state']['旅人'];
  世界?: TurnContext['state']['世界'];
  新闻?: TurnContext['state']['新闻'];
  剧情?: TurnContext['state']['剧情'];
};

/** 过滤 undefined，保留叶子补丁的字段级覆盖语义。 */
export function 清理叶子补丁(patch: Partial<工作区字段集>): Partial<工作区字段集> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== 'undefined') cleaned[key] = value;
  }
  return cleaned;
}

/** S6-S12 共享尾段：正常回合与中断续跑从同一实现完成结算和封版。 */
export async function runTurnTail(
  ctx: TurnContext,
  d: TurnDeltas,
  initialNewest: NewestStory记录,
): Promise<void> {
  const { state, assertWorkflowActive } = ctx;
  const headNodeId = initialNewest.headNodeId;
  if (!headNodeId) {
    throw new Error('runTurnTail 失败：活跃叶子指针为空。');
  }

  Object.assign(d, await stage6_memory(ctx, d));
  Object.assign(d, stage7_worldTraveler(ctx, d));
  const worldAfter = d.worldAfter as typeof state.世界;
  const travelerAfter = d.travelerAfter as typeof state.旅人;

  if (worldAfter !== ctx.worldAtStart) state.set世界(worldAfter);
  if (travelerAfter !== ctx.travelerAtStart) state.set旅人(travelerAfter);

  Object.assign(d, await stage8_variable(ctx, d));
  Object.assign(d, stage9_npcLedger(ctx, d));
  Object.assign(d, await stage10_storyZhiku(ctx, d));

  {
    const variableOverrides = d.variableOverrides as VariableOverridesForNewest | null | undefined;
    const variableBatchForSave = d.failedVariableBatch ?? variableOverrides?.batch;
    const variableBatchesForSave = compactVariableBatchHistory(variableBatchForSave
      ? [...ctx.variableBatchesAtStart, variableBatchForSave]
      : ctx.variableBatchesAtStart);
    assertWorkflowActive();
    await writeLeafNode(headNodeId, 清理叶子补丁({
      记忆: d.memoryAfterStoryProgress ?? d.mem,
      忆庭: d.yitingWithCompression,
      世界: variableOverrides?.世界 ?? d.worldAfter,
      旅人: variableOverrides?.旅人 ?? d.travelerAfter,
      新闻: variableOverrides?.新闻,
      剧情: variableOverrides?.剧情,
      NPC: d.npcAfterCompression,
      variableBatches: variableBatchesForSave,
      // 片 5e（D4）：queueTasks 属主 = 工作区（叶子）字段，留在叶子；
      // commitTurn 封版晋升时剥离（不进检查点），新叶子继承本字段。
      queueTasks: ctx.queueTasksMirror,
    }));
  }

  Object.assign(d, await stage11_backgroundJobs(ctx, d));

  assertWorkflowActive();
  await writeLeafNode(headNodeId, 清理叶子补丁({
    剧情编织: d.storyWeavingForSave ?? undefined,
    智库: d.zhikuAfterRuntimeUnlock ?? undefined,
    手机: d.phoneAfterFallbackSeed,
    新闻: d.newsAfterGeneration ?? (d.variableOverrides as VariableOverridesForNewest | null | undefined)?.新闻,
    记忆: d.memoryAfterStoryProgress ?? undefined,
    忆庭: d.yitingAfterTurnRecall,
    chatHistory: d.finalHistoryForSave,
    相册: d.相册After,
  }));

  const finalHistoryForSave = d.finalHistoryForSave;
  const memoryAfterStoryProgress = d.memoryAfterStoryProgress ?? undefined;
  const yitingAfterTurnRecall = d.yitingAfterTurnRecall;
  const phoneAfterFallbackSeed = d.phoneAfterFallbackSeed;

  if (memoryAfterStoryProgress) state.set记忆(memoryAfterStoryProgress);
  if (yitingAfterTurnRecall) state.set忆庭(yitingAfterTurnRecall);
  if (phoneAfterFallbackSeed) state.set手机(phoneAfterFallbackSeed);
  if (finalHistoryForSave && finalHistoryForSave !== state.chatHistory) state.setChatHistory(finalHistoryForSave);

  Object.assign(d, await stage12_save(ctx, d, {
    finalHistoryForSave,
    memoryAfterStoryProgress,
    yitingAfterTurnRecall,
    phoneAfterFallbackSeed,
    newest: initialNewest,
  }));
}
