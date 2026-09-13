import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { 聊天消息 } from '@/models/chat';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { API配置项 } from '@/models/settings';
import type { 队列任务记录 } from '@/models/queueTask';
import {
  captureVariableProjectionSnapshot,
  projectVariableCalibrationResult,
  restoreVariableProjectionSnapshot,
  runVariableCalibrationStep,
} from './variableWorkflow';
import { regenerateNarrativeImagesForMessage } from './narrativeImageWorkflow';
import { buildRecentTurnWindowForNews, cancelPendingQueueTasks, pushQueueTask } from './workflowTaskRuntime';
import { runNewsGenerationStep } from './newsWorkflow';
import { beginWorkflowTransaction, isWorkflowAbortError } from './workflowTransaction';
import type { TurnStatus } from './turnStatus';
import { compactVariableBatchHistory } from '@/utils/longSessionRetention';
import { devLog, devLogError } from '@/utils/devLog';

export function compactForRerollInstruction(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 900 ? `${cleaned.slice(0, 900)}...` : cleaned;
}

const BUSY_DETAIL = '当前有任务进行中，请等待完成后再重试。';

export async function retryQueueTask(
  state: UseGameStateReturn,
  getActiveConfig: () => API配置项 | null,
  task: 队列任务记录,
  mode: 'retry' | 'reroll' = 'retry',
): Promise<void> {
  if (task.id === 'narrative_image_parse' || task.id === 'narrative_image_generate') {
    const targetMessageId = task.targetMessageId ?? findLatestAssistantMessage(state.chatHistory)?.id;
    if (!targetMessageId) {
      pushQueueTask(state, task.id, 'failed', {
        detail: '未找到可重试的正文回合。',
        failCount: (task.failCount ?? 0) + 1,
      });
      return;
    }
    await regenerateNarrativeImagesForMessage(state, getActiveConfig, targetMessageId, { mode });
    return;
  }

  if (task.id === 'news') {
    await retryNewsQueueTask(state, task, mode);
    return;
  }

  if (task.id === 'variable') {
    await retryVariableQueueTask(state, getActiveConfig, task, mode);
  }
}

async function retryNewsQueueTask(
  state: UseGameStateReturn,
  task: 队列任务记录,
  mode: 'retry' | 'reroll',
): Promise<void> {
  const assistant = findLatestAssistantMessage(state.chatHistory);
  if (!assistant) {
    pushQueueTask(state, 'news', 'failed', {
      detail: '未找到可用于新闻重试的正文回合。',
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  const userInput = findPreviousUserInput(state.chatHistory, assistant.id);
  const body = assistant.parsedResponse?.body.trim() || assistant.content.trim();
  if (!body) {
    pushQueueTask(state, 'news', 'failed', {
      detail: '当前正文为空，无法重试新闻生成。',
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  const newsSettings = state.deviceSettings.gameSettings.新闻系统;
  const interval = Math.max(5, Math.min(10, Math.trunc(newsSettings.generateIntervalTurns) || 5));
  const turn = Number(assistant.gameTime) || task.turn || state.turnCount;

  const tx = await beginWorkflowTransaction(state, {
    turnStatus: {
      kind: 'searching',
      text: mode === 'reroll' ? '正在重生成星际和平周报。' : '正在重试星际和平周报。',
    },
  });
  if (!tx) {
    pushQueueTask(state, 'news', 'failed', {
      detail: BUSY_DETAIL,
      turn,
      failCount: (task.failCount ?? 0) + 1,
      targetMessageId: assistant.id,
    });
    return;
  }

  let terminalStatus: TurnStatus | undefined;
  try {
    tx.pushTask('news', 'pending', {
      detail: mode === 'reroll' ? '正在重生成星际和平周报，本次不受回合间隔限制。' : '正在重试星际和平周报，本次不受回合间隔限制。',
      turn,
      retrying: true,
      failCount: task.failCount,
      targetMessageId: assistant.id,
      cancellable: true,
    });
    const result = await runNewsGenerationStep({
      state,
      traveler: state.旅人,
      world: state.世界,
      news: state.新闻,
      npcRecords: state.NPC,
      plotNodes: state.剧情,
      storyWeaving: state.剧情编织,
      turnCountAtStart: state.turnCount,
      mainBody: body,
      userInput,
      recentTurns: buildRecentTurnWindowForNews(state.chatHistory, userInput, body, interval),
      storyWeavingSnapshot: state.剧情编织,
      signal: tx.signal,
      shouldCommit: tx.isCurrent,
    });
    tx.assertActive();
    if (!result) {
      tx.pushTask('news', 'failed', {
        detail: '星际和平周报重试失败，请检查新闻 API 配置或模型返回。',
        turn,
        failCount: (task.failCount ?? 0) + 1,
        targetMessageId: assistant.id,
      });
      terminalStatus = { kind: 'failed', text: '星际和平周报重试失败。', failCount: 1 };
      return;
    }
    // 账本随结果同 patch 落叶子；叶子写入成功后才投影，保证可见 = 已保存。
    tx.pushTask('news', 'success', {
      detail: result.changed
        ? `星际和平周报已${mode === 'reroll' ? '重生成' : '重试更新'}，当前共 ${result.news.length} 条新闻记录。`
        : '星际和平周报已重试，但模型没有返回可写入的新变化。',
      turn,
      failCount: task.failCount,
      targetMessageId: assistant.id,
    });
    await tx.writeLeaf({ 新闻: result.news });
    if (result.changed) state.set新闻(result.news);
  } catch (error) {
    if (isWorkflowAbortError(error) || tx.signal.aborted) {
      if (tx.isCurrent()) {
        cancelPendingQueueTasks(state);
        terminalStatus = { kind: 'stopped', text: '已取消星际和平周报重试。' };
      }
      return;
    }
    devLogError('retry', 'retryNewsQueueTask.catch', error, {
      taskId: task.id,
      mode,
      turn: task.turn,
    });
    tx.pushTask('news', 'failed', {
      detail: `星际和平周报重试失败：${(error as Error).message}`,
      turn,
      failCount: (task.failCount ?? 0) + 1,
      targetMessageId: assistant.id,
    });
    terminalStatus = { kind: 'failed', text: '星际和平周报重试失败。', failCount: 1 };
  } finally {
    tx.settle(terminalStatus);
  }
}

async function retryVariableQueueTask(
  state: UseGameStateReturn,
  getActiveConfig: () => API配置项 | null,
  task: 队列任务记录,
  mode: 'retry' | 'reroll',
): Promise<void> {
  if (!state.deviceSettings.gameSettings.enableVariableUpdate) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: '变量更新未启用，无法手动重试。',
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  const batch = findRetryableVariableBatch(state.variableBatches, task.targetBatchId);
  if (!batch) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: '未找到可安全补结算的失败变量批次。全失败批可补；部分成功且无指纹的旧批次不可重放。',
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  const assistant = findAssistantMessageForBatch(state.chatHistory, batch);
  const mainConfig = getActiveConfig();
  if (!assistant || !mainConfig) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: !assistant ? '未找到变量批次对应的正文回合。' : '未配置主 API，无法补结算变量。',
      targetBatchId: batch.id,
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  const body = assistant.parsedResponse?.body.trim() || assistant.content.trim();
  if (!body) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: '当前正文为空，无法补结算变量。',
      targetBatchId: batch.id,
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  const userInput = findPreviousUserInput(state.chatHistory, assistant.id);
  const receipt = { turn: batch.turn, assistantMessageId: assistant.id, input: userInput };

  const tx = await beginWorkflowTransaction(state, {
    turnStatus: {
      kind: 'settling',
      text: mode === 'reroll' ? '正在重生成变量结算。' : '正在补结算变量。',
    },
  });
  if (!tx) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: BUSY_DETAIL,
      turn: batch.turn,
      targetMessageId: assistant.id,
      targetBatchId: batch.id,
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }

  // 事务快照：deferProjection 下叶子写入成功前不得有任何领域投影；
  // 写入失败 / 中止时按本快照还原（防御性，正常路径下快照未被触碰）。
  const snapshot = captureVariableProjectionSnapshot(state);
  const batchesAtStart = state.variableBatches;
  let projected = false;
  let terminalStatus: TurnStatus | undefined;
  try {
    tx.pushTask('variable', 'pending', {
      detail: mode === 'reroll' ? '正在重生成变量结算结果。' : '正在补结算变量。',
      turn: batch.turn,
      targetMessageId: assistant.id,
      targetBatchId: batch.id,
      retrying: true,
      failCount: task.failCount,
      cancellable: true,
    });
    const overrides = await runVariableCalibrationStep({
      state,
      mainApiConfig: mainConfig,
      userInput: receipt.input,
      body,
      variableDraft: assistant.parsedResponse?.variableDraft,
      receipt,
      memorySystemSnapshot: snapshot.记忆,
      travelerSnapshot: snapshot.旅人,
      worldSnapshot: snapshot.世界,
      signal: tx.signal,
      shouldCommit: tx.isCurrent,
      allowYiting: false,
      deferProjection: true,
    });
    tx.assertActive();
    const retryBatch = overrides?.batch;
    if (!retryBatch) {
      tx.pushTask('variable', 'failed', {
        detail: '变量补结算未返回结果。',
        turn: batch.turn,
        targetMessageId: assistant.id,
        targetBatchId: batch.id,
        failCount: (task.failCount ?? 0) + 1,
      });
      terminalStatus = { kind: 'failed', text: '变量补结算未返回结果。', failCount: 1 };
      return;
    }
    const hasFailure = retryBatch.results.some((result) => !result.ok);
    tx.pushTask('variable', hasFailure ? 'failed' : 'success', {
      detail: hasFailure
        ? '变量补结算完成，但仍存在失败命令，请展开查看原始信息。'
        : '变量补结算已落地。',
      turn: batch.turn,
      targetMessageId: assistant.id,
      targetBatchId: retryBatch.id,
      failCount: hasFailure ? (task.failCount ?? 0) + 1 : task.failCount,
    });
    const batchesForSave = compactVariableBatchHistory([...batchesAtStart, retryBatch]);
    await tx.writeLeaf({
      旅人: overrides.旅人 !== snapshot.旅人 ? overrides.旅人 : undefined,
      世界: overrides.世界 !== snapshot.世界 ? overrides.世界 : undefined,
      记忆: overrides.记忆 !== snapshot.记忆 ? overrides.记忆 : undefined,
      智库: overrides.智库 !== snapshot.智库 ? overrides.智库 : undefined,
      手机: overrides.手机 !== snapshot.手机 ? overrides.手机 : undefined,
      NPC: overrides.NPC !== snapshot.NPC ? overrides.NPC : undefined,
      新闻: overrides.新闻 !== snapshot.新闻 ? overrides.新闻 : undefined,
      剧情: overrides.剧情 !== snapshot.剧情 ? overrides.剧情 : undefined,
      variableBatches: batchesForSave,
    });
    projectVariableCalibrationResult({
      state,
      overrides,
      batch: retryBatch,
      batchesAtStart,
      allowYiting: false,
    });
    projected = true;
    if (hasFailure) {
      terminalStatus = { kind: 'failed', text: '变量补结算完成，但仍有失败命令。', failCount: 1 };
    }
  } catch (error) {
    if (isWorkflowAbortError(error) || tx.signal.aborted) {
      if (tx.isCurrent()) {
        if (!projected) restoreVariableProjectionSnapshot(state, snapshot);
        cancelPendingQueueTasks(state);
        terminalStatus = { kind: 'stopped', text: '已取消变量补结算。' };
      }
      return;
    }
    devLogError('retry', 'retryVariableQueueTask.catch', error, {
      taskId: task.id,
      mode,
      turn: batch.turn,
    });
    if (tx.isCurrent() && !projected) restoreVariableProjectionSnapshot(state, snapshot);
    tx.pushTask('variable', 'failed', {
      detail: `变量补结算失败：${(error as Error).message}`,
      turn: batch.turn,
      targetMessageId: assistant.id,
      targetBatchId: batch.id,
      failCount: (task.failCount ?? 0) + 1,
    });
    terminalStatus = { kind: 'failed', text: '变量补结算失败。', failCount: 1 };
  } finally {
    tx.settle(terminalStatus);
  }
}

function findLatestAssistantMessage(history: 聊天消息[]): 聊天消息 | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role === 'assistant') return item;
  }
  return undefined;
}

function findAssistantMessageForTurn(history: 聊天消息[], turn: number): 聊天消息 | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role === 'assistant' && Number(item.gameTime) === turn) return item;
  }
  return undefined;
}

export function findAssistantMessageForBatch(
  history: 聊天消息[],
  batch: Pick<变量命令批次, 'targetMessageId' | 'turn'>,
): 聊天消息 | undefined {
  const target = batch.targetMessageId
    ? history.find((item) => item.id === batch.targetMessageId && item.role === 'assistant')
    : undefined;
  if (batch.targetMessageId && !target) {
    devLog('retry', 'variable-batch-target-fallback', {
      targetMessageId: batch.targetMessageId,
      turn: batch.turn,
    });
  }
  return target ?? findAssistantMessageForTurn(history, batch.turn) ?? findLatestAssistantMessage(history);
}

function findPreviousUserInput(history: 聊天消息[], assistantId: string): string {
  const assistantIndex = history.findIndex((item) => item.id === assistantId);
  if (assistantIndex < 0) return '';
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role === 'user') return item.content;
  }
  return '';
}

export function findRetryableVariableBatch(batches: 变量命令批次[], targetBatchId?: string): 变量命令批次 | undefined {
  const candidates = targetBatchId
    ? batches.filter((batch) => batch.id === targetBatchId)
    : [...batches].reverse();
  // 全失败批：可证明无落地，可安全补结算。
  // 部分成功批：仅当全部成功结果带命令指纹时才可补——重跑时按指纹跳过已落地命令。
  // legacy（无指纹）的部分成功批不可安全重放。
  return candidates.find((batch) => {
    if (batch.results.length === 0) return false;
    if (batch.results.every((result) => !result.ok)) return true;
    const applied = batch.results.filter(
      (result) => result.ok && (!result.kind || result.kind === 'command'),
    );
    return applied.length > 0 && applied.every((result) => Boolean(result.commandFingerprint));
  });
}

function normalizeRerollCompareText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/[【】「」『』“”"'‘’（）()\u005B\u005D{}<>《》,，.。!！?？:：;；、\s]/g, '')
    .toLowerCase()
    .slice(0, 6000);
}

export function calculateRerollSimilarity(nextText: string, previousText: string): number {
  const left = normalizeRerollCompareText(nextText);
  const right = normalizeRerollCompareText(previousText);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length >= 80 && right.includes(left)) return 0.98;
  if (right.length >= 80 && left.includes(right)) return 0.98;

  const buildGrams = (text: string): Set<string> => {
    const grams = new Set<string>();
    for (let index = 0; index <= text.length - 8; index += 2) {
      grams.add(text.slice(index, index + 8));
    }
    return grams;
  };
  const leftGrams = buildGrams(left);
  const rightGrams = buildGrams(right);
  if (!leftGrams.size || !rightGrams.size) return 0;
  let shared = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) shared += 1;
  }
  return shared / Math.max(1, Math.min(leftGrams.size, rightGrams.size));
}

export function buildRerollGenerationGuard(nonce: string, previousResponse: string): string {
  return [
    '重roll末尾强约束：本轮是玩家主动要求重写上一版回复。',
    `重roll nonce: ${nonce}`,
    '事实起点、玩家输入和可用上下文保持一致，但正文表达路径必须明显不同。',
    '必须更换开场镜头、段落推进顺序、对白切入、收尾钩子和行动选项写法；不得复用上一版前三句、连续短语、变量草稿句式或相同结尾。',
    '如果上一版以旁白开场，本版优先从角色动作或短对白开场；如果上一版以对白开场，本版优先从环境、动作或感官细节切入。',
    '仍必须遵守当前主剧情输出标签和格式要求，不得因为重roll省略 <thinking>、<正文>、<短期记忆>、<动态世界> 或 <变量草稿>。',
    previousResponse
      ? `上一版回复摘录（只用于避重复，不是当前事实）：${compactForRerollInstruction(previousResponse)}`
      : '',
  ].filter(Boolean).join('\n');
}

export function buildRerollSimilarityRetryGuard(previousResponse: string, similarity: number): string {
  return [
    '重roll自动换写：上一版重roll结果与被替换回复过于相似。',
    `相似度：${Math.round(similarity * 100)}%。`,
    '请完全换一种写法重写本回合：',
    '- 保留事实起点和玩家输入，但更换开场镜头、行动顺序、对白切入、句式和收束钩子。',
    '- 不得复用上一版连续短语、段落结构、对白顺序或相同结尾。',
    '- 若上一版以旁白开场，本版优先以 NPC 动作或一句短对白开场；若上一版以对白开场，本版优先以环境或动作开场。',
    '- 仍必须遵守当前主剧情输出标签和格式要求，不得省略 <thinking>、<正文>、<短期记忆>、<动态世界> 或 <变量草稿>。',
    previousResponse
      ? `被替换回复摘录（只用于避重复）：${compactForRerollInstruction(previousResponse)}`
      : '',
  ].filter(Boolean).join('\n');
}
