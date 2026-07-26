/**
 * 阶段 4：AI 请求与响应解析 —— 含 while 重试循环、流式 onDelta、Tavern 正则清理、
 * 抗空回/相似度/DeepSeek 协议校验。
 *
 * 红线：while 循环整体移动不拆散；streamMessageSetter 在 ctx 中不新建；
 * streamedText/previewText 不进 TurnDeltas，通过返回值传递。
 *
 * 读 d 字段: apiMessages, systemPrompt, tavernV2Messages, deepSeekMainActive,
 *   effectivePrefixMode, effectivePrefixContent, mainRequestMode, maxAttempts,
 *   currentPresetV2ForStage
 * 写 d 字段: deepSeekProtocolIssuesForTurn, rerollSimilarityForTurn,
 *   rerollSimilarityRetried（经 Stage4Output.deltas 返回）
 */
import type { TurnContext, TurnDeltas } from './turnTypes';
import { 创建聊天消息 } from '@/models/chat';
import { sendChatMessage } from '@/services/ai/text';
import { isEmptyResponse, parseResponse } from '@/services/ai/responseParser';
import { appendApiErrorReport } from '@/services/ai/apiErrorReportService';
import { isNonRetryableAIError } from '@/services/ai/deepSeekRecovery';
import { applyTavernOutputRegexScripts } from './tavernRegexProcessor';
import { calculateRerollSimilarity } from './workflowRetry';
import { getDeepSeekMainProtocolIssues } from './mainResponseProtocol';
import {
  buildRerollSimilarityRetryGuard,
} from './workflowRetry';
import {
  buildDeepSeekProtocolRetryGuard,
} from './mainResponseProtocol';
import {
  pushQueueTask,
  isPageHidden,
  splitStreamingReveal,
  waitStreamingPreviewDelay,
} from './workflowTaskRuntime';
import {
  createDocumentVisibilitySource,
  createVisibilityBufferedPublisher,
  type VisibilityBufferedPublisher,
} from '@/utils/visibilityBufferedPublisher';

export interface Stage4Output {
  deltas: Partial<TurnDeltas>;
  result: Awaited<ReturnType<typeof sendChatMessage>>;
  streamedText: string;
  previewText: string;
  streamEventCount: number;
  previewChain: Promise<void>;
  visibilityPublisher: VisibilityBufferedPublisher | null;
}

export async function stage4_aiRequest(
  ctx: TurnContext,
  d: TurnDeltas,
  visibilityPublisher: VisibilityBufferedPublisher | null,
): Promise<Stage4Output> {
  const { state, deps, abortController, mainStoryConfig, streamMessageSetter, turnCountAtStart, queueTasksMirror } = ctx;
  const { apiMessages, systemPrompt, tavernV2Messages,
    deepSeekMainActive, effectivePrefixMode, effectivePrefixContent,
    mainRequestMode, maxAttempts, currentPresetV2ForStage } = d;

  const configuredMaxAttempts = state.gameSettings.autoRetryOnError
    ? Math.max(1, state.gameSettings.autoRetryCount) + 1
    : 1;
  const calcMaxAttempts = (deepSeekMainActive || deps.rerollContext)
    ? Math.max(2, maxAttempts ?? configuredMaxAttempts)
    : (maxAttempts ?? configuredMaxAttempts);

  let streamedText = '';
  let streamEventCount = 0;
  let previewText = '';
  let previewEpoch = 0;
  let previewChain: Promise<void> = Promise.resolve();

  let vp = visibilityPublisher;

  if (!vp && typeof document !== 'undefined') {
    vp = createVisibilityBufferedPublisher({
      source: createDocumentVisibilitySource(document),
      commit: (text) => {
        previewEpoch += 1;
        previewText = text;
        streamMessageSetter.flush(text);
      },
    });
  }

  let result: Awaited<ReturnType<typeof sendChatMessage>>;
  let deepSeekProtocolIssuesForTurn: string[] = [];
  let rerollSimilarityForTurn: number | undefined;
  let rerollSimilarityRetried = false;
  let lastErr: unknown = null;
  let attempt = 0;

  while (attempt < calcMaxAttempts) {
    attempt++;
    streamedText = '';
    streamEventCount = 0;
    previewText = '';
    previewEpoch += 1;
    previewChain = Promise.resolve();
    streamMessageSetter.flush('');
    try {
      result = await sendChatMessage(mainStoryConfig, {
        messages: apiMessages!,
        systemPrompt: systemPrompt!,
        onDelta: (delta) => {
          streamedText += delta;
          if (!state.gameSettings.enableStreaming) {
            streamMessageSetter.set(streamedText);
            return;
          }
          if (vp?.bufferWhenHidden(streamedText)) {
            previewEpoch += 1;
            previewText = streamedText;
            return;
          }
          streamEventCount += 1;
          const deltaPreviewEpoch = previewEpoch;
          previewChain = previewChain.then(async () => {
            const chunks = splitStreamingReveal(delta);
            for (const chunk of chunks) {
              if (abortController.signal.aborted || deltaPreviewEpoch !== previewEpoch) return;
              if (isPageHidden()) {
                previewEpoch += 1;
                previewText = streamedText;
                vp?.bufferWhenHidden(streamedText);
                return;
              }
              previewText += chunk;
              streamMessageSetter.set(previewText);
              await waitStreamingPreviewDelay(14, abortController.signal);
              if (isPageHidden()) {
                previewEpoch += 1;
                previewText = streamedText;
                vp?.bufferWhenHidden(streamedText);
                return;
              }
            }
          });
        },
        signal: abortController.signal,
        streaming: mainRequestMode === 'stream',
        repairTags: state.gameSettings.enableTagRepair,
        prefixMode: effectivePrefixMode,
        prefixContent: effectivePrefixContent,
        topP: mainStoryConfig.topP,
        topK: mainStoryConfig.topK,
        topA: mainStoryConfig.topA,
        minP: mainStoryConfig.minP,
        repetitionPenalty: mainStoryConfig.repetitionPenalty,
        frequencyPenalty: mainStoryConfig.frequencyPenalty,
        presencePenalty: mainStoryConfig.presencePenalty,
        maxContext: mainStoryConfig.maxContext,
      });

      if (tavernV2Messages && currentPresetV2ForStage) {
        const regexCleanup = applyTavernOutputRegexScripts(
          result.fullText || streamedText,
          (currentPresetV2ForStage as Record<string, unknown>).preset as Parameters<typeof applyTavernOutputRegexScripts>[1],
        );
        if (regexCleanup.applied.length > 0 && regexCleanup.text !== result.fullText) {
          result = {
            ...result,
            fullText: regexCleanup.text,
            parsed: parseResponse(regexCleanup.text, { repair: state.gameSettings.enableTagRepair }),
          };
          streamedText = regexCleanup.text;
          console.info('[ST V2] 已执行安全输出正则清理:', regexCleanup.applied);
        }
      }

      const candidateText = (result.parsed.body?.trim() || result.fullText.trim() || streamedText.trim());
      const isBlankResponse = !candidateText || isEmptyResponse(result.parsed);
      if (isBlankResponse) {
        void appendApiErrorReport({
          source: '主剧情工作流',
          config: mainStoryConfig,
          requestMode: (mainRequestMode ?? 'non-stream') as 'stream' | 'non-stream',
          error: new Error(`返回空响应，触发自动重试。主剧情第 ${attempt}/${calcMaxAttempts} 次${isEmptyResponse(result.parsed) ? '（纯标签无正文）' : ''}。`),
          responseText: result.fullText || streamedText || '（空响应）',
        });
        if (attempt < Math.max(2, calcMaxAttempts)) {
          console.warn(`[sendWorkflow] 第 ${attempt} 次返回空响应${isEmptyResponse(result.parsed) ? '（纯标签无正文）' : ''}，自动重试。`);
          continue;
        }
        throw new Error('AI response was empty');
      }

      const rerollSimilarity = deps.rerollContext
        ? calculateRerollSimilarity(candidateText, deps.rerollContext.previousResponse)
        : 0;
      if (deps.rerollContext) {
        rerollSimilarityForTurn = rerollSimilarity;
      }
      if (deps.rerollContext && rerollSimilarity >= 0.86 && attempt < calcMaxAttempts) {
        rerollSimilarityRetried = true;
        void appendApiErrorReport({
          source: '重roll相似度校验',
          config: mainStoryConfig,
          requestMode: (mainRequestMode ?? 'non-stream') as 'stream' | 'non-stream',
          error: new Error(`主剧情第 ${attempt}/${calcMaxAttempts} 次重roll结果与上一版过于相似，相似度 ${Math.round(rerollSimilarity * 100)}%。`),
          responseText: result.fullText || streamedText || candidateText,
        });
        apiMessages!.push(创建聊天消息('user', buildRerollSimilarityRetryGuard(
          deps.rerollContext!.previousResponse, rerollSimilarity,
        )));
        pushQueueTask(state, 'main_story', 'pending', {
          detail: '重roll结果与上一版过于相似，正在强制换写。',
          failCount: attempt, retrying: true, cancellable: true,
        }, turnCountAtStart, queueTasksMirror);
        console.warn(`[sendWorkflow] 第 ${attempt}/${calcMaxAttempts} 次重roll与上一版过于相似，自动换写，相似度：${rerollSimilarity.toFixed(3)}`);
        continue;
      }

      const protocolIssues = deepSeekMainActive
        ? getDeepSeekMainProtocolIssues(result.parsed, result.fullText || streamedText)
        : [];
      if (protocolIssues.length) {
        deepSeekProtocolIssuesForTurn = protocolIssues;
        void appendApiErrorReport({
          source: 'DeepSeek 主剧情协议校验',
          config: mainStoryConfig,
          requestMode: (mainRequestMode ?? 'non-stream') as 'stream' | 'non-stream',
          error: new Error(`主剧情第 ${attempt}/${calcMaxAttempts} 次输出协议不完整：${protocolIssues.join('；')}`),
          responseText: result.fullText || streamedText || '（空响应）',
        });
        if (attempt < calcMaxAttempts) {
          apiMessages!.push(创建聊天消息('user', buildDeepSeekProtocolRetryGuard(protocolIssues)));
          pushQueueTask(state, 'main_story', 'pending', {
            detail: `DeepSeek 输出协议不完整，正在重试：${protocolIssues.join('；')}`,
            failCount: attempt, retrying: true, cancellable: true,
          }, turnCountAtStart, queueTasksMirror);
          console.warn(`[sendWorkflow] DeepSeek 第 ${attempt}/${calcMaxAttempts} 次输出协议不完整，自动重试：`, protocolIssues);
          continue;
        }
      } else if (deepSeekMainActive) {
        deepSeekProtocolIssuesForTurn = [];
      }
      lastErr = null;
      break;
    } catch (innerErr) {
      if ((innerErr as Error).name === 'AbortError' || abortController.signal.aborted) {
        throw innerErr;
      }
      lastErr = innerErr;
      const innerMessage = innerErr instanceof Error ? innerErr.message : String(innerErr ?? '');
      const alreadyReportedByApiLayer =
        innerMessage.includes('API Error') ||
        innerMessage.includes('Failed to fetch') ||
        innerMessage.includes('No response body');
      if (!alreadyReportedByApiLayer) {
        void appendApiErrorReport({
          source: '主剧情工作流',
          config: mainStoryConfig,
          requestMode: (mainRequestMode ?? 'non-stream') as 'stream' | 'non-stream',
          error: innerErr,
          responseText: streamedText || previewText || '',
        });
      }
      if (isNonRetryableAIError(innerErr) || attempt >= calcMaxAttempts) break;
      pushQueueTask(state, 'main_story', 'pending', {
        detail: `主剧情生成失败 ${attempt} 次，正在自动重试。`,
        failCount: attempt, retrying: true, cancellable: true,
      }, turnCountAtStart, queueTasksMirror);
      console.warn(`[sendWorkflow] 第 ${attempt}/${calcMaxAttempts} 次尝试失败，自动重试：`, innerErr);
    }
  }

  if (lastErr) throw lastErr;

  return {
    deltas: {
      deepSeekProtocolIssuesForTurn,
      rerollSimilarityForTurn,
      rerollSimilarityRetried,
    },
    result: result!,
    streamedText,
    previewText,
    streamEventCount,
    previewChain,
    visibilityPublisher: vp,
  };
}
