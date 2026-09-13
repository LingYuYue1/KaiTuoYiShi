// 变量回执指纹：批次基态指纹 + 单条命令内容指纹 + 「已落地则跳过」过滤。
// 指纹输入只含影响落地结果的规范化内容，不含模型响应、时间戳或 UI 元数据。

import { 是已落地命令结果, type 变量命令, type 变量命令批次 } from '@/models/variableCommand';
import type { VariableState } from '@/utils/variableRegistry';
import { stableHashHex } from '@/utils/stableHash';

/** 归约输入投影的基态指纹（命令落地前的变量投影）。 */
export function variableStateFingerprint(state: VariableState): Promise<string> {
  return stableHashHex(state);
}

/** 单条命令的规范化内容指纹：只含 action / trim 后的 key / value。 */
export function commandFingerprint(command: 变量命令): Promise<string> {
  return stableHashHex({
    action: command.action,
    key: command.key.trim(),
    value: command.value,
  });
}

/** 收集历史批次中已成功落地的命令指纹（诊断项无指纹，不参与）。 */
export function listAppliedCommandFingerprints(batches: readonly 变量命令批次[]): Set<string> {
  const applied = new Set<string>();
  for (const batch of batches) {
    for (const result of batch.results) {
      if (!result.commandFingerprint || !是已落地命令结果(result)) continue;
      applied.add(result.commandFingerprint);
    }
  }
  return applied;
}

/**
 * 指定回合 + 目标消息的历史批次 → 已落地指纹集合。
 * 「本回合本条消息的账本」是重放幂等判定的作用域，回合校准 / 补结算 / 历史修复共用同一口径。
 */
export function listAppliedFingerprintsForTurn(
  batches: readonly 变量命令批次[],
  turn: number,
  targetMessageId: string,
): Set<string> {
  return listAppliedCommandFingerprints(
    batches.filter((batch) => batch.turn === turn && batch.targetMessageId === targetMessageId),
  );
}

/**
 * 过滤掉历史已落地的命令（同指纹 + 曾成功），只保留需要重放的命令。
 * 指纹并行计算一次并随命令一起返回：调用方要靠它回填回执，避免第二次哈希。
 */
export async function filterCommandsByAppliedFingerprints(
  commands: readonly 变量命令[],
  applied: ReadonlySet<string>,
): Promise<Array<{ command: 变量命令; fingerprint: string }>> {
  const fingerprinted = await Promise.all(commands.map(async (command) => ({
    command,
    fingerprint: await commandFingerprint(command),
  })));
  return fingerprinted.filter((item) => !applied.has(item.fingerprint));
}
