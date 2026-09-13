// 变量回执指纹：批次基态指纹 + 单条命令内容指纹 + 「已落地则跳过」过滤。
// 指纹输入只含影响落地结果的规范化内容，不含模型响应、时间戳或 UI 元数据。

import type { 变量命令, 变量命令批次 } from '@/models/variableCommand';
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
      if (!result.ok || !result.commandFingerprint) continue;
      if (result.kind && result.kind !== 'command') continue;
      applied.add(result.commandFingerprint);
    }
  }
  return applied;
}

/** 过滤掉历史已落地的命令（同指纹 + 曾成功），只保留需要重放的命令。 */
export async function filterCommandsByAppliedFingerprints(
  commands: readonly 变量命令[],
  applied: ReadonlySet<string>,
): Promise<变量命令[]> {
  if (applied.size === 0) return [...commands];
  const kept: 变量命令[] = [];
  for (const command of commands) {
    if (applied.has(await commandFingerprint(command))) continue;
    kept.push(command);
  }
  return kept;
}
