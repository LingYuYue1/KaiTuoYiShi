// 变量历史重解析（V2）：读取历史回合正文 → 变量模型 → 解析 → NSFW 策略 →
// 分类 → 修复计划。全程只读：不写叶子、不投影、不落账（提交由 variableRepairWorkflow 负责）。

import type { 聊天消息 } from '@/models/chat';
import type { NPC记录 } from '@/models/npc';
import type { API配置项 } from '@/models/settings';
import type { 提示词模块 } from '@/models/prompts';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { VariableState } from '@/utils/variableRegistry';
import { callVariableModel } from '@/services/ai/variableModel';
import { parseVariableCommands, snapshotVariableState } from '@/utils/variableExecutor';
import { factsToVariableCommands, parseVariableFacts } from '@/utils/variableFacts';
import { applyNsfwVariablePolicy } from '@/utils/variableNsfwPolicy';
import { listAppliedCommandFingerprints, variableStateFingerprint } from '@/utils/variableFingerprint';
import {
  分类修复命令,
  构建变量修复计划,
  type 变量修复计划,
  type 变量修复项,
} from '@/models/variableRepair';

export interface 变量重解析参数 {
  message: 聊天消息;
  turn: number;
  /** 归约输入投影（当前变量切片）。 */
  stateSnapshot: VariableState;
  /** 当前批次账本；只用于收集本条消息已落地指纹。 */
  batches: readonly 变量命令批次[];
  mainApiConfig: API配置项;
  userInput: string;
  nsfwEnabled: boolean;
  maleNsfwArchiveEnabled: boolean;
  retryCount?: number;
  promptModules?: 提示词模块[];
  signal?: AbortSignal;
}

/** 重解析一条历史回合并生成修复计划；调用方负责队列账本与界面草稿。 */
export async function 重新解析变量计划(params: 变量重解析参数): Promise<变量修复计划> {
  const body = params.message.parsedResponse?.body.trim() || params.message.content.trim();
  if (!body) throw new Error('该回合正文为空，无法重新解析变量。');
  if (params.message.role !== 'assistant') throw new Error('只有助手回合可以重新解析变量。');

  const { rawText } = await callVariableModel(params.mainApiConfig, {
    body,
    variableDraft: params.message.parsedResponse?.variableDraft,
    userInput: params.userInput,
    turnCount: params.turn,
    state: params.stateSnapshot,
    nsfwEnabled: params.nsfwEnabled,
    maleNsfwArchiveEnabled: params.maleNsfwArchiveEnabled,
    nsfwBaselineCandidates: [],
    signal: params.signal,
    retryCount: params.retryCount,
    promptModules: params.promptModules,
  });
  if (params.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const parsedFacts = parseVariableFacts(rawText);
  // 修复不生成新手机种子：避免重解析引入与历史回合无关的新事实。
  const factCommands = factsToVariableCommands(parsedFacts.facts, params.stateSnapshot, params.turn, {
    phoneSeedsEnabled: false,
    maxPhoneSeedsPerTurn: 0,
  });
  const parsedLegacy = parseVariableCommands(rawText);
  // 玩家手写旅人路径不在服务层静默过滤：交给分类器展示为 unsupported（透明优先）。
  const commands = [...factCommands.commands, ...parsedLegacy.commands];

  const { allowedCommands, rejectedCommands } = applyNsfwVariablePolicy(commands, {
    nsfwEnabled: params.nsfwEnabled,
    maleNsfwArchiveEnabled: params.maleNsfwArchiveEnabled,
  }, (params.stateSnapshot.NPC ?? []) as NPC记录[]);

  const appliedFingerprints = listAppliedCommandFingerprints(params.batches.filter(
    (batch) => batch.turn === params.turn && batch.targetMessageId === params.message.id,
  ));
  const classified = await 分类修复命令({
    commands: allowedCommands,
    state: params.stateSnapshot,
    appliedFingerprints,
  });
  const rejectedItems: 变量修复项[] = rejectedCommands.map((item, index) => ({
    id: `rejected_${index}`,
    category: 'unsupported',
    commands: [item.command],
    reason: item.reason,
    nsfwRejected: true,
  }));

  return 构建变量修复计划({
    turn: params.turn,
    targetMessageId: params.message.id,
    baseStateFingerprint: await variableStateFingerprint(params.stateSnapshot),
    modelName: params.mainApiConfig.model,
    items: [...classified, ...rejectedItems],
  });
}

/** 便捷：从游戏状态切片构造归约输入投影（与回合管线同一函数）。 */
export function 变量状态投影(slices: Parameters<typeof snapshotVariableState>[0]): VariableState {
  return snapshotVariableState(slices);
}
