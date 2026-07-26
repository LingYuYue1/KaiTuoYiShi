/**
 * 阶段 9：NPC 账本 —— 档案补全、NSFW 基线补建、同行记忆压缩、账本调试。
 * 纯累积操作，无网络调用，同步函数。
 *
 * 读 d 字段:
 *   - variableOverrides (S8, stage8_variable ~第 60 行)
 *   - finalHistory (S5, stage5_replyLanding ~第 100 行)
 *   - aiMsg (S5, stage5_replyLanding ~第 80 行)
 * 写 d 字段: npcAfterCompression (S9), finalHistory (写回 updated)
 */
import type { TurnContext, TurnDeltas } from './turnTypes';
import { compressNpcMemoryLedger } from './memoryUtils';
import { 创建默认记忆系统设置 } from '@/models/settings';
import { enrichNpcArchives } from '@/utils/npcArchiveEnrichment';
import { attachNpcLedgerUpdateDebug, pushUniqueText } from './npcLedgerWorkflow';

export function stage9_npcLedger(
  ctx: TurnContext,
  d: TurnDeltas,
): Partial<TurnDeltas> {
  const { state } = ctx;
  const variableOverrides = d.variableOverrides as Record<string, any> | null | undefined;
  const finalHistory = d.finalHistory!;
  const aiMsg = d.aiMsg!;

  const npcSource = variableOverrides?.NPC ?? state.NPC;
  const archiveEnrichment = enrichNpcArchives(npcSource, {
    nsfwEnabled: state.gameSettings.enableNsfw,
    maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
    zhiku: state.智库,
  });

  // NSFW 基线补建：开启 NSFW 后，把需要补建基线的 NPC 信息传给变量模型，
  // 变量模型在变量更新那一次调用里顺带生成 NSFW 基线档案，走正常 nsfw_archive facts 落库链路。
  const npcSourceForCompression = archiveEnrichment.records;
  const memorySettings = state.gameSettings.记忆系统 ?? 创建默认记忆系统设置();
  const npcCompressionSummaryTriggered: string[] = [];
  let npcAfterCompression = npcSourceForCompression.map((npc) => {
    const ledgerCompression = compressNpcMemoryLedger({
      npcId: npc.id,
      entries: npc.同行记忆 ?? [],
      summaries: npc.总结记忆 ?? [],
      threshold: memorySettings.NPC记忆压缩阈值,
      prompt: memorySettings.NPC记忆压缩提示词,
      turn: state.turnCount,
      source: '变量',
    });
    if (!ledgerCompression.changed) {
      return npc;
    }
    if (ledgerCompression.summaryTriggered) {
      pushUniqueText(npcCompressionSummaryTriggered, npc.姓名);
    }
    return {
      ...npc,
      同行记忆: ledgerCompression.memories,
      总结记忆: ledgerCompression.summaries,
    };
  });
  const npcChanged =
    archiveEnrichment.changed ||
    npcAfterCompression.length !== npcSource.length ||
    npcAfterCompression.some((npc, index) => npc !== npcSource[index]);
  if (npcChanged) {
    state.setNPC(npcAfterCompression);
  }
  const npcLedgerUpdateDebug = variableOverrides?.npcLedgerUpdate || npcCompressionSummaryTriggered.length
    ? {
        updatedNames: variableOverrides?.npcLedgerUpdate?.updatedNames ?? [],
        memoryAppended: variableOverrides?.npcLedgerUpdate?.memoryAppended ?? [],
        ledgerFieldsUpdated: variableOverrides?.npcLedgerUpdate?.ledgerFieldsUpdated ?? [],
        summaryTriggered: [
          ...(variableOverrides?.npcLedgerUpdate?.summaryTriggered ?? []),
          ...npcCompressionSummaryTriggered,
        ].filter((name, index, list) => Boolean(name) && list.indexOf(name) === index),
        warnings: variableOverrides?.npcLedgerUpdate?.warnings ?? [],
      }
    : undefined;
  let updatedFinalHistory = finalHistory;
  if (npcLedgerUpdateDebug) {
    updatedFinalHistory = attachNpcLedgerUpdateDebug(finalHistory, aiMsg.id, npcLedgerUpdateDebug);
  }

  return { npcAfterCompression, finalHistory: updatedFinalHistory };
}
