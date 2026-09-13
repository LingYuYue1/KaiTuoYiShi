// 变量历史修复提交（V2）：应用计划 → 唯一事务写活跃叶子 → 投影。
// 不封版、不移动指针；已落地命令由指纹跳过，写失败不投影（可见 = 已保存）。

import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { 变量修复计划, 变量修复回执 } from '@/models/variableRepair';
import { 应用变量修复计划 } from '@/models/variableRepair';
import { 派生变量批次结局 } from '@/models/variableCommand';
import { compactVariableBatchHistory } from '@/utils/longSessionRetention';
import { commitVariableState, snapshotVariableState, unpackVariableState } from '@/utils/variableExecutor';
import { listAppliedCommandFingerprints } from '@/utils/variableFingerprint';
import { buildVariableBatch } from './variableWorkflow';
import { beginWorkflowTransaction, isWorkflowAbortError } from './workflowTransaction';
import type { TurnStatus } from './turnStatus';
import { devLogError } from '@/utils/devLog';

const 忙时回执: 变量修复回执 = {
  code: 'NO_CHANGES',
  detail: '当前有任务进行中，请等待完成后再提交变量修复。',
};

/** 提交修复计划：归约 → 事务写入 → 投影。返回回执供预览弹窗展示。 */
export async function 提交变量修复计划(params: {
  state: UseGameStateReturn;
  plan: 变量修复计划;
  confirmedItemIds: readonly string[];
}): Promise<变量修复回执> {
  const { state, plan } = params;
  const snapshot = snapshotVariableState({
    旅人: state.旅人,
    世界: state.世界,
    记忆: state.记忆,
    忆庭: state.忆庭,
    智库: state.智库,
    手机: state.手机,
    NPC: state.NPC,
    新闻: state.新闻,
    剧情: state.剧情,
  });
  const appliedFingerprints = listAppliedCommandFingerprints(state.variableBatches.filter(
    (batch) => batch.turn === plan.turn && batch.targetMessageId === plan.targetMessageId,
  ));
  const receipt = await 应用变量修复计划({
    plan,
    currentState: snapshot,
    confirmedItemIds: params.confirmedItemIds,
    appliedFingerprints,
  });
  if (receipt.code !== 'OK' || !receipt.nextState || !receipt.results || !receipt.pending) {
    return receipt;
  }

  const results = receipt.results.map((result, index) => ({
    ...result,
    kind: 'command' as const,
    commandFingerprint: receipt.pending?.[index]?.fingerprint,
  }));
  const appliedCount = results.filter((result) => result.ok).length;
  const batch = buildVariableBatch({
    receipt: { turn: plan.turn, assistantMessageId: plan.targetMessageId, input: '' },
    source: 'calibration',
    modelName: plan.modelName,
    results,
    baseStateFingerprint: plan.baseStateFingerprint,
    outcome: 派生变量批次结局(results),
    report: `历史重解析修复：提交 ${results.length} 条，落地 ${appliedCount} 条。`,
  });
  const batchesForSave = compactVariableBatchHistory([...state.variableBatches, batch]);
  const nextState = receipt.nextState;
  const next = unpackVariableState(nextState);

  const tx = await beginWorkflowTransaction(state, {
    turnStatus: { kind: 'settling', text: '正在提交变量修复。' },
  });
  if (!tx) return 忙时回执;

  let terminalStatus: TurnStatus | undefined;
  try {
    tx.pushTask('variable_reparse', 'pending', {
      detail: '正在提交变量修复。',
      turn: plan.turn,
      targetMessageId: plan.targetMessageId,
      cancellable: true,
    });
    await tx.writeLeaf({
      旅人: next.旅人 !== snapshot.旅人 ? next.旅人 : undefined,
      世界: next.世界 !== snapshot.世界 ? next.世界 : undefined,
      记忆: next.记忆 !== snapshot.记忆 ? next.记忆 : undefined,
      智库: next.智库 !== snapshot.智库 ? next.智库 : undefined,
      手机: next.手机 !== snapshot.手机 ? next.手机 : undefined,
      NPC: next.NPC !== snapshot.NPC ? next.NPC : undefined,
      新闻: next.新闻 !== snapshot.新闻 ? next.新闻 : undefined,
      剧情: next.剧情 !== snapshot.剧情 ? next.剧情 : undefined,
      variableBatches: batchesForSave,
    });
    tx.assertActive();
    commitVariableState(nextState, snapshot, {
      set旅人: state.set旅人,
      set世界: state.set世界,
      set记忆: state.set记忆,
      set忆庭: state.set忆庭,
      set智库: state.set智库,
      set手机: state.set手机,
      setNPC: state.setNPC,
      set新闻: state.set新闻,
      set剧情: state.set剧情,
    });
    state.setVariableBatches(batchesForSave);
    tx.pushTask('variable_reparse', 'success', {
      detail: `变量修复已落地：${appliedCount}/${results.length} 条。`,
      turn: plan.turn,
      targetMessageId: plan.targetMessageId,
    });
    return { code: 'OK', detail: `变量修复已落地：${appliedCount}/${results.length} 条。`, results };
  } catch (error) {
    if (isWorkflowAbortError(error) || tx.signal.aborted) {
      if (tx.isCurrent()) {
        tx.pushTask('variable_reparse', 'cancelled', {
          detail: '已取消变量修复提交。',
          turn: plan.turn,
          targetMessageId: plan.targetMessageId,
          cancelled: true,
        });
        terminalStatus = { kind: 'stopped', text: '已取消变量修复提交。' };
      }
      return { code: 'NO_CHANGES', detail: '已取消变量修复提交。' };
    }
    devLogError('save', '变量修复提交失败', error, {
      turn: plan.turn,
      targetMessageId: plan.targetMessageId,
    });
    tx.pushTask('variable_reparse', 'failed', {
      detail: `变量修复写入失败：${(error as Error).message}`,
      turn: plan.turn,
      targetMessageId: plan.targetMessageId,
      failCount: 1,
    });
    terminalStatus = { kind: 'failed', text: '变量修复写入失败。', failCount: 1 };
    return { code: 'NO_CHANGES', detail: `变量修复写入失败：${(error as Error).message}` };
  } finally {
    tx.settle(terminalStatus);
  }
}
