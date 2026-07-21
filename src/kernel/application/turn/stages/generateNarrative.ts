import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import type { API配置项, 游戏设置 } from '@/models/settings';
import { appendApiErrorReport } from '@/services/ai/apiErrorReportService';
import { sendChatMessage } from '@/services/ai/text';
import { parseResponse } from '@/src/kernel/protocol/mainResponse';
import type { TurnExecutionState } from '../turnExecutionState';
import type { SendWorkflowDeps } from '../turnWorkflowTypes';
import type { RequestMessagePlan } from './planRequestMessages';
import { calculateRerollSimilarity, buildRerollSimilarityRetryGuard } from './rerollPolicy';
import { pushQueueTask } from './turnRuntime';
import { applyTavernOutputRegexScripts } from '@/src/kernel/workflows/tavernRegexProcessor';
import { buildProtocolRetryGuard, getHardProtocolIssues, getMainProtocolIssues, getSoftProtocolIssues } from '@/src/kernel/workflows/turnProtocol';
import type { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';

type ChatResult = Awaited<ReturnType<typeof sendChatMessage>>;
type RerollContext = NonNullable<SendWorkflowDeps['rerollContext']>;
type ProgressSink = Readonly<{ set(text: string): void; flush(text: string): void }>;

export type NarrativeGeneration = Readonly<{
  result: ChatResult;
  streamedText: string;
  streamEventCount: number;
  successfulMessages: 聊天消息[];
  deepSeekProtocolIssues: string[];
  softProtocolIssues: string[];
  rerollSimilarity?: number;
  rerollSimilarityRetried: boolean;
  hardFailCount: number;
}>;

export async function generateNarrative(input: Readonly<{
  state: TurnExecutionState;
  config: API配置项;
  settings: 游戏设置;
  systemPrompt: string;
  request: RequestMessagePlan;
  reroll?: RerollContext | null;
  signal: AbortSignal;
  progress: ProgressSink;
  emitProcess?: SendWorkflowDeps['emitProcess'];
  tavernPreset?: NonNullable<ReturnType<typeof getCurrentSTPresetV2>>['preset'];
}>): Promise<NarrativeGeneration> {
  const maxAttempts = resolveMaxAttempts(input.settings, input.request.deepSeekMainActive, Boolean(input.reroll));
  let retryInstruction: 聊天消息 | null = null;
  let hardFailCount = 0;
  let rerollSimilarity: number | undefined;
  let rerollSimilarityRetried = false;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) input.emitProcess?.({ type: 'stage.retrying', stage: 'generating', attempt, limit: maxAttempts });
    input.progress.flush('');
    const messages = retryInstruction ? [...input.request.messages, retryInstruction] : input.request.messages;
    try {
      const generated = await executeAttempt(input, messages);
      const validation = validateCandidate({
        generated,
        deepSeek: input.request.deepSeekMainActive,
        reroll: input.reroll,
        attempt,
        maxAttempts,
        config: input.config,
        requestMode: input.request.requestMode,
      });
      hardFailCount = validation.hardFailCount;
      rerollSimilarity = validation.rerollSimilarity;
      rerollSimilarityRetried ||= validation.rerollSimilarityRetried;
      if (validation.retryInstruction) {
        retryInstruction = validation.retryInstruction;
        pushQueueTask(input.state, 'main_story', 'pending', validation.queuePatch);
        continue;
      }
      return {
        result: generated.result,
        streamedText: generated.streamedText,
        streamEventCount: generated.streamEventCount,
        successfulMessages: [...messages],
        deepSeekProtocolIssues: validation.deepSeekProtocolIssues,
        softProtocolIssues: validation.softProtocolIssues,
        rerollSimilarity,
        rerollSimilarityRetried,
        hardFailCount,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError' || input.signal.aborted) throw error;
      lastError = error;
      hardFailCount = attempt;
      reportAttemptFailure(input.config, input.request.requestMode, error);
      if (attempt < maxAttempts) {
        pushQueueTask(input.state, 'main_story', 'pending', {
          detail: `主剧情生成失败 ${attempt} 次，正在自动重试。`,
          failCount: attempt,
          retrying: true,
          cancellable: true,
        });
      }
    }
  }
  const terminalError = lastError instanceof Error ? lastError : new Error('Main story generation failed');
  Object.assign(terminalError, { attempts: hardFailCount });
  throw terminalError;
}

async function executeAttempt(
  input: Parameters<typeof generateNarrative>[0],
  messages: readonly 聊天消息[],
): Promise<{ result: ChatResult; streamedText: string; streamEventCount: number }> {
  let streamedText = '';
  let streamEventCount = 0;
  let result = await sendChatMessage(input.config, {
    messages: [...messages],
    systemPrompt: input.systemPrompt,
    onDelta: (delta) => {
      if (input.signal.aborted) return;
      streamedText += delta;
      streamEventCount += 1;
      input.progress.set(streamedText);
    },
    signal: input.signal,
    streaming: input.request.shouldStream,
    prefixMode: input.request.prefixMode,
    prefixContent: input.request.prefixContent,
    topP: input.config.topP,
    topK: input.config.topK,
    topA: input.config.topA,
    minP: input.config.minP,
    repetitionPenalty: input.config.repetitionPenalty,
    frequencyPenalty: input.config.frequencyPenalty,
    presencePenalty: input.config.presencePenalty,
    maxContext: input.config.maxContext,
  });
  if (input.tavernPreset) {
    const cleanup = applyTavernOutputRegexScripts(result.fullText || streamedText, input.tavernPreset);
    if (cleanup.applied.length && cleanup.text !== result.fullText) {
      result = { ...result, fullText: cleanup.text, parsed: parseResponse(cleanup.text) };
      streamedText = cleanup.text;
    }
  }
  return { result, streamedText, streamEventCount };
}

function validateCandidate(input: Readonly<{
  generated: Awaited<ReturnType<typeof executeAttempt>>;
  deepSeek: boolean;
  reroll?: RerollContext | null;
  attempt: number;
  maxAttempts: number;
  config: API配置项;
  requestMode: 'stream' | 'non-stream';
}>): Readonly<{
  retryInstruction: 聊天消息 | null;
  queuePatch: Parameters<typeof pushQueueTask>[3];
  hardFailCount: number;
  softProtocolIssues: string[];
  deepSeekProtocolIssues: string[];
  rerollSimilarity?: number;
  rerollSimilarityRetried: boolean;
}> {
  const { result, streamedText } = input.generated;
  const candidate = result.parsed.body.trim();
  if (!candidate) {
    reportValidationFailure(input, '返回空响应', result.fullText || streamedText);
    if (input.attempt >= input.maxAttempts) throw new Error('AI response was empty');
    return retry(创建聊天消息('user', '请完整重写本回合，必须输出非空 <正文>。'), '主剧情输出为空，正在重试。', input.attempt);
  }
  const similarity = input.reroll ? calculateRerollSimilarity(candidate, input.reroll.previousResponse) : undefined;
  if (input.reroll && similarity !== undefined && similarity >= 0.86 && input.attempt < input.maxAttempts) {
    reportValidationFailure(input, `重roll相似度 ${Math.round(similarity * 100)}%`, result.fullText || streamedText);
    return { ...retry(创建聊天消息('user', buildRerollSimilarityRetryGuard(input.reroll.previousResponse, similarity)), '主剧情与上一版过于相似，正在换写。', input.attempt), rerollSimilarity: similarity, rerollSimilarityRetried: true };
  }
  const raw = result.fullText || streamedText;
  const hard = getHardProtocolIssues(result.parsed, raw, input.deepSeek);
  const soft = getSoftProtocolIssues(result.parsed, raw);
  if (hard.length) {
    reportValidationFailure(input, hard.join('；'), raw);
    if (input.attempt >= input.maxAttempts) throw new Error(`AI response protocol is invalid: ${hard.join('; ')}`);
    return { ...retry(创建聊天消息('user', buildProtocolRetryGuard(hard)), `主剧情协议不完整，正在重试：${hard.join('；')}`, input.attempt), deepSeekProtocolIssues: input.deepSeek ? getMainProtocolIssues(result.parsed, raw, true) : [] };
  }
  return { retryInstruction: null, queuePatch: undefined, hardFailCount: 0, softProtocolIssues: soft, deepSeekProtocolIssues: input.deepSeek ? soft : [], rerollSimilarity: similarity, rerollSimilarityRetried: false };
}

function retry(instruction: 聊天消息, detail: string, attempt: number) {
  return { retryInstruction: instruction, queuePatch: { detail, failCount: attempt, retrying: true, cancellable: true }, hardFailCount: attempt, softProtocolIssues: [], deepSeekProtocolIssues: [], rerollSimilarityRetried: false };
}

function resolveMaxAttempts(settings: 游戏设置, deepSeek: boolean, reroll: boolean): number {
  const configured = settings.autoRetryOnError ? Math.max(1, settings.autoRetryCount) + 1 : 1;
  return deepSeek || reroll ? Math.max(2, configured) : configured;
}

function reportValidationFailure(input: Parameters<typeof validateCandidate>[0], reason: string, responseText: string): void {
  void appendApiErrorReport({ source: '主剧情协议校验', config: input.config, requestMode: input.requestMode, error: new Error(`第 ${input.attempt}/${input.maxAttempts} 次：${reason}`), responseText });
}

function reportAttemptFailure(config: API配置项, requestMode: 'stream' | 'non-stream', error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('API Error') || message.includes('Failed to fetch') || message.includes('No response body')) return;
  void appendApiErrorReport({ source: '主剧情工作流', config, requestMode, error });
}
