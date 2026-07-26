/**
 * 阶段 5：回复落地 —— 文本净化、AI 消息构建、历史追加、turnCount 推进。
 * 读 d 字段: updatedHistory, userMsg, preTurnSnapshot, systemPrompt, apiMessages,
 *   deepSeekMainActive, deepSeekLockFormat, deepSeekMainMode,
 *   deepSeekProtocolIssuesForTurn, rerollSimilarityForTurn, rerollSimilarityRetried,
 *   mainRequestMode, shouldTryTavernV2, tavernV2Messages, tavernV2Error,
 *   yitingPreview, zhikuPreview, zhikuRecallEnabled, npcLedgerSelection,
 *   storyWeavingGate, storyWeavingDiagnostics, recallSummaryForTurn,
 *   recallFullContentForTurn
 * 写 d 字段: aiMsg, finalHistory, parsedForDisplay, displayText,
 *   pendingVariableStarted, recoveryJournal
 */
import type { TurnContext, TurnDeltas } from './turnTypes';
import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import { sanitizeParsedResponse, sanitizeContaminatedText } from '@/utils/textSanitizer';
import { normalizePlayerSpeechInBody, replaceBodyInRawResponse } from '@/utils/playerSpeechGuard';
import { stripLeakedHistoryMetaFromBody } from './mainResponseProtocol';
import { buildTurnTokenUsage } from './turnDiagnostics';
import { buildCachePrefixDiagnostics } from './turnDiagnostics';
import { buildNpcLedgerDebug, formatNpcLedgerPreview } from './npcLedgerWorkflow';
import { formatZhikuDiagnosticsPreview } from './recallDiagnostics';
import { revealStreamingPreview } from './workflowTaskRuntime';
import { pushQueueTask } from './workflowTaskRuntime';
import { compactChatHistoryForLongSession } from '@/utils/longSessionRetention';
import { updateWorkflowRecoveryJournal, persistWorkflowRecoveryJournal } from '@/services/workflowRecovery';

export async function stage5_replyLanding(
  ctx: TurnContext,
  d: TurnDeltas,
  result: Awaited<ReturnType<typeof import('@/services/ai/text').sendChatMessage>>,
  streamedText: string,
  streamEventCount: number,
  previewChain: Promise<void>,
  startTime: number,
): Promise<Partial<TurnDeltas>> {
  const { state, userInput, config, recoveryJournal, abortController, streamMessageSetter } = ctx;
  const {
    updatedHistory, userMsg, preTurnSnapshot, systemPrompt, apiMessages,
    deepSeekMainActive, deepSeekLockFormat, deepSeekMainMode,
    deepSeekProtocolIssuesForTurn, rerollSimilarityForTurn, rerollSimilarityRetried,
    mainRequestMode, shouldTryTavernV2, tavernV2Messages, tavernV2Error,
    yitingPreview, zhikuPreview, zhikuRecallEnabled, npcLedgerSelection,
    storyWeavingGate, storyWeavingDiagnostics,
    recallSummaryForTurn, recallFullContentForTurn,
  } = d;

  const effectiveWorld = ctx.effectiveWorld;
  const duration = (Date.now() - startTime) / 1000;
  pushQueueTask(state, 'main_story', 'success', { detail: `正文生成完成，用时 ${Math.round(duration)}s。` });

  const cleanedParsed = sanitizeParsedResponse(result.parsed, state.gameSettings.额外功能);
  const parsedBody = normalizePlayerSpeechInBody({
    body: cleanedParsed.body?.trim() ?? '',
    playerName: state.旅人.姓名 || state.旅人.别名 || '你',
    userInput,
  });
  const finalBody = stripLeakedHistoryMetaFromBody(sanitizeContaminatedText(parsedBody, state.gameSettings.额外功能));
  const sanitizedRawText = replaceBodyInRawResponse(
    cleanedParsed.rawText || result.fullText || streamedText,
    finalBody,
  );
  const displayText = finalBody || sanitizeContaminatedText(result.fullText || streamedText, state.gameSettings.额外功能);

  if (state.gameSettings.enableStreaming) {
    if (streamEventCount > 0) {
      await previewChain;
    } else if (displayText.trim()) {
      await revealStreamingPreview(state, displayText, abortController.signal, { delayMs: 16, minChunks: 8 });
    }
    streamMessageSetter.flush('');
  } else {
    streamMessageSetter.cancel();
  }

  const isAwakeningTurn = !!(cleanedParsed.awakenQuestions?.trim() || cleanedParsed.awakenJudgement?.trim());
  let awakenPathId = '';
  if (isAwakeningTurn) {
    awakenPathId = effectiveWorld.进行中狭间 ?? '';
    if (!awakenPathId) {
      const hist = updatedHistory!;
      for (let i = hist.length - 1; i >= 0; i--) {
        const prevPid = hist[i]?.parsedResponse?.awakenPathId;
        if (prevPid) { awakenPathId = prevPid; break; }
      }
    }
  }

  const baseParsed = finalBody
    ? { ...cleanedParsed, body: finalBody, rawText: sanitizedRawText }
    : { ...cleanedParsed, body: displayText, rawText: sanitizedRawText };
  const parsedForDisplay = awakenPathId ? { ...baseParsed, awakenPathId } : baseParsed;

  const tokenUsage = buildTurnTokenUsage({
    apiUsage: result.usage,
    systemPrompt: systemPrompt!,
    messages: apiMessages!,
    outputText: result.fullText || displayText,
    provider: config.provider,
    model: config.model,
  });

  const previousDebugContext = [...(updatedHistory!)].reverse()
    .find((msg) => msg.role === 'assistant' && msg.debugContext?.systemPrompt)?.debugContext;
  const cachePrefixDiagnostics = buildCachePrefixDiagnostics({
    enabled: state.gameSettings.enableCacheDiagnostics,
    systemPrompt: systemPrompt!,
    messages: apiMessages!,
    previous: previousDebugContext
      ? { systemPrompt: previousDebugContext.systemPrompt, messages: previousDebugContext.messages }
      : undefined,
  });

  type AnyRecord = Record<string, any>;
  const yp = yitingPreview as AnyRecord | null | undefined;
  const zp = zhikuPreview as AnyRecord | null | undefined;
  const sg = storyWeavingGate as AnyRecord | null | undefined;
  const sd = storyWeavingDiagnostics as AnyRecord | null | undefined;

  const aiMsg = 创建聊天消息('assistant', displayText, {
    gameTime: `${state.turnCount}`,
    parsedResponse: parsedForDisplay,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    tokenUsage,
    responseDurationSec: duration,
    preTurnSnapshot,
    debugContext: {
      systemPrompt: systemPrompt!,
      messages: apiMessages!.map((msg) => ({ role: msg.role, content: msg.content })),
      deepSeekMainMode: (deepSeekMainActive ? deepSeekMainMode : 'off') as 'off' | 'standard' | 'lock_format' | undefined,
      deepSeekCotFakeHistorySkipped: deepSeekMainActive && state.gameSettings.enableCotFakeHistory,
      deepSeekPrefixMode: deepSeekLockFormat,
      deepSeekProtocolIssues: deepSeekProtocolIssuesForTurn,
      deepSeekMainOriginalModel: result.deepSeekRecovery?.originalModel,
      deepSeekMainAdaptedModel: result.deepSeekRecovery?.fallbackModel
        ?? (result.deepSeekRecovery?.initialModel !== result.deepSeekRecovery?.originalModel
          ? result.deepSeekRecovery?.initialModel : undefined),
      stV2Attempted: shouldTryTavernV2,
      stV2Used: Boolean(tavernV2Messages),
      stV2FallbackReason: tavernV2Error instanceof Error ? tavernV2Error.message : tavernV2Error ? String(tavernV2Error) : undefined,
      rerollSimilarity: rerollSimilarityForTurn,
      rerollSimilarityRetried,
      cachePrefixDiagnostics,
      mainRequestMode: mainRequestMode as 'stream' | 'non-stream' | undefined,
      recallSummary: recallSummaryForTurn,
      recallFullContent: recallFullContentForTurn,
      yitingRecallPreview: yp?.previewText ?? '',
      yitingRecallRawText: yp?.rawText ?? '',
      yitingRecallUsedModel: yp?.usedModel === true,
      zhikuRecallPreview: formatZhikuDiagnosticsPreview(zp?.diagnostics),
      zhikuRecallInjection: zhikuRecallEnabled ? (zp?.injection ?? '') : '',
      zhikuRecallRawText: zp?.rawText ?? '',
      zhikuRecallUsedModel: zp?.usedModel === true,
      npcLedgerInjection: buildNpcLedgerDebug(npcLedgerSelection),
      npcLedgerSelectionRaw: npcLedgerSelection,
      recallPreview: [
        yp?.previewText ?? '',
        sg ? `剧情编织门禁：${sg.mode}｜第 ${sg.分段组号 ?? '?'} 段｜${(sg.reasons as string[]).join('；') || '无命中理由'}` : '',
        sd ? [
          `剧情编织注入健康：${sd.健康状态}`,
          `剧情编织实际注入：第 ${sd.当前分段组号} 段「${sd.当前分段标题}」｜${sd.当前分段运行状态}`,
          sd.归档锚点标题 ? `已跳过归档锚点：第 ${sd.归档锚点组号} 段「${sd.归档锚点标题}」` : '',
          sd.前一分段标题 ? `历史承接段：${sd.前一分段标题}` : '',
          sd.下一分段标题 ? `下一段预热：${sd.下一分段标题}` : '',
          (sd.检查项 as unknown[]).length ? `注入检查：${(sd.检查项 as unknown[]).join('；')}` : '',
        ].filter(Boolean).join('\n') : '',
        formatZhikuDiagnosticsPreview(zp?.diagnostics),
        formatNpcLedgerPreview(npcLedgerSelection),
      ].filter(Boolean).join('\n\n'),
    },
  });

  // recoveryJournal update — returned via d for caller to persist
  let rj = recoveryJournal;
  rj = updateWorkflowRecoveryJournal(rj, { phase: 'variable_settlement', assistantMessageId: aiMsg.id });
  await persistWorkflowRecoveryJournal(rj);

  let finalHistory = [...(updatedHistory!), aiMsg];
  const userMsgIdx = finalHistory.findIndex((m) => m.id === userMsg!.id);
  if (userMsgIdx >= 0 && finalHistory[userMsgIdx].preTurnSnapshot) {
    finalHistory = finalHistory.map((m, i) => i === userMsgIdx ? { ...m, preTurnSnapshot: undefined } : m);
  }
  finalHistory = compactChatHistoryForLongSession(finalHistory);
  state.setChatHistory(finalHistory);
  state.setTurnCount((prev) => prev + 1);
  streamMessageSetter.flush('');
  state.setLoading(false);
  state.setPendingVariable(true);

  return {
    aiMsg,
    finalHistory,
    parsedForDisplay,
    displayText,
    pendingVariableStarted: true,
    recoveryJournal: rj,
  } as Partial<TurnDeltas>;
}
