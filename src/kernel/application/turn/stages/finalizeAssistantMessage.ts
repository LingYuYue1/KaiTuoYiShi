import { 创建聊天消息, type 聊天消息, type 解析后回复 } from '@/models/chat';
import type { NPC账本选择结果 } from '@/models/npc';
import type { API配置项, 游戏设置 } from '@/models/settings';
import type { 世界状态 } from '@/models/world';
import type { StoryWeavingInjectionDiagnostics } from '@/src/kernel/contract/storyWeaving';
import type { 剧情编织门禁快照 } from '@/src/kernel/workflows/storyWeaving';
import { normalizePlayerSpeechInBody, replaceBodyInRawResponse } from '@/utils/playerSpeechGuard';
import { sanitizeContaminatedText, sanitizeParsedResponse } from '@/utils/textSanitizer';
import type { TurnExecutionState } from '../turnExecutionState';
import type { SendWorkflowDeps } from '../turnWorkflowTypes';
import type { NarrativeGeneration } from './generateNarrative';
import type { RequestMessagePlan } from './planRequestMessages';
import type { RecallContextResult } from './retrieveRecallContext';
import { revealStreamingPreview } from './turnRuntime';
import { buildCachePrefixDiagnostics, buildTurnTokenUsage } from './turnUsage';
import {
  buildNpcLedgerDebug,
  formatNpcLedgerPreview,
} from './npcDiagnostics';
import {
  formatZhikuDiagnosticsPreview,
  stripLeakedHistoryMetaFromBody,
} from '@/src/kernel/workflows/turnProtocol';

type ProgressSink = Readonly<{ flush(text: string): void; cancel(): void }>;

export async function finalizeAssistantMessage(input: Readonly<{
  state: TurnExecutionState;
  settings: 游戏设置;
  config: API配置项;
  userInput: string;
  world: 世界状态;
  history: 聊天消息[];
  systemPrompt: string;
  generation: NarrativeGeneration;
  request: RequestMessagePlan;
  tavernV2Enabled: boolean;
  recall: Pick<RecallContextResult, 'yitingPreview' | 'zhikuPreview' | 'zhikuRecallEnabled'>;
  recallSummary: string;
  recallFullContent: string;
  npcLedgers?: NPC账本选择结果;
  storyGate: 剧情编织门禁快照 | null;
  storyDiagnostics: StoryWeavingInjectionDiagnostics | null;
  startedAt: number;
  progress: ProgressSink;
  signal: AbortSignal;
  emitProcess?: SendWorkflowDeps['emitProcess'];
}>): Promise<Readonly<{
  message: 聊天消息;
  parsed: 解析后回复;
  narrative: string;
  duration: number;
}>> {
  const { result, streamedText, streamEventCount, successfulMessages } = input.generation;
  const duration = (Date.now() - input.startedAt) / 1000;
  const cleaned = sanitizeParsedResponse(result.parsed, input.settings.额外功能);
  const normalizedBody = normalizePlayerSpeechInBody({
    body: cleaned.body?.trim() ?? '',
    playerName: input.state.旅人.姓名 || input.state.旅人.别名 || '你',
    userInput: input.userInput,
  });
  const narrative = stripLeakedHistoryMetaFromBody(sanitizeContaminatedText(normalizedBody, input.settings.额外功能));
  if (!narrative.trim()) throw new Error('AI response body was removed by strict sanitization');
  await publishFinalPreview(input, narrative, streamEventCount);

  const awakeningTurn = Boolean(cleaned.awakenQuestions?.trim() || cleaned.awakenJudgement?.trim());
  const awakenPathId = awakeningTurn ? input.world.进行中狭间 ?? '' : '';
  if (awakeningTurn && !awakenPathId) throw new Error('Awakening response requires an active path id');
  const parsed = {
    ...cleaned,
    body: narrative,
    rawText: replaceBodyInRawResponse(cleaned.rawText || result.fullText || streamedText, narrative),
    ...(awakenPathId ? { awakenPathId } : {}),
  };
  const usage = buildTurnTokenUsage({
    apiUsage: result.usage,
    systemPrompt: input.systemPrompt,
    messages: successfulMessages,
    outputText: result.fullText || narrative,
    provider: input.config.provider,
    model: input.config.model,
  });
  const previousDebug = [...input.history].reverse()
    .find((message) => message.role === 'assistant' && message.debugContext?.systemPrompt)?.debugContext;
  const cachePrefixDiagnostics = buildCachePrefixDiagnostics({
    enabled: input.settings.enableCacheDiagnostics === true,
    systemPrompt: input.systemPrompt,
    messages: successfulMessages,
    previous: previousDebug ? { systemPrompt: previousDebug.systemPrompt, messages: previousDebug.messages } : undefined,
  });
  const message = 创建聊天消息('assistant', narrative, {
    gameTime: `${input.state.turnCount}`,
    parsedResponse: parsed,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    tokenUsage: usage,
    responseDurationSec: duration,
    debugContext: buildDebugContext(input, cachePrefixDiagnostics),
  });
  return { message, parsed, narrative, duration };
}

async function publishFinalPreview(
  input: Parameters<typeof finalizeAssistantMessage>[0],
  narrative: string,
  streamEventCount: number,
): Promise<void> {
  if (!input.settings.enableStreaming) {
    input.progress.cancel();
    return;
  }
  if (streamEventCount > 0) input.progress.flush(narrative);
  else if (narrative.trim()) {
    await revealStreamingPreview(narrative, (text) => input.emitProcess?.({ type: 'stream.delta', text }), input.signal, {
      delayMs: 16,
      minChunks: 8,
    });
  }
  input.progress.flush('');
}

function buildDebugContext(
  input: Parameters<typeof finalizeAssistantMessage>[0],
  cachePrefixDiagnostics: ReturnType<typeof buildCachePrefixDiagnostics>,
): NonNullable<聊天消息['debugContext']> {
  const { generation, request, recall, storyGate, storyDiagnostics } = input;
  return {
    systemPrompt: input.systemPrompt,
    messages: generation.successfulMessages.map((message) => ({ role: message.role, content: message.content })),
    deepSeekMainMode: request.deepSeekMainActive ? request.deepSeekMainMode : 'off',
    deepSeekCotFakeHistorySkipped: request.deepSeekMainActive && input.settings.enableCotFakeHistory === true,
    deepSeekPrefixMode: request.deepSeekLockFormat,
    deepSeekProtocolIssues: generation.deepSeekProtocolIssues,
    softProtocolIssues: generation.softProtocolIssues,
    deepSeekMainOriginalModel: generation.result.deepSeekRecovery?.model,
    stV2Used: input.tavernV2Enabled,
    rerollSimilarity: generation.rerollSimilarity,
    rerollSimilarityRetried: generation.rerollSimilarityRetried,
    cachePrefixDiagnostics,
    mainRequestMode: request.requestMode,
    recallSummary: input.recallSummary,
    recallFullContent: input.recallFullContent,
    yitingRecallPreview: recall.yitingPreview?.previewText ?? '',
    yitingRecallRawText: recall.yitingPreview?.rawText ?? '',
    yitingRecallUsedModel: recall.yitingPreview?.usedModel === true,
    zhikuRecallPreview: formatZhikuDiagnosticsPreview(recall.zhikuPreview?.diagnostics),
    zhikuRecallInjection: recall.zhikuRecallEnabled ? recall.zhikuPreview?.injection ?? '' : '',
    zhikuRecallRawText: recall.zhikuPreview?.rawText ?? '',
    zhikuRecallUsedModel: recall.zhikuPreview?.usedModel === true,
    npcLedgerInjection: buildNpcLedgerDebug(input.npcLedgers),
    npcLedgerSelectionRaw: input.npcLedgers,
    recallPreview: formatRecallPreview(input),
  };
}

function formatRecallPreview(input: Parameters<typeof finalizeAssistantMessage>[0]): string {
  const gate = input.storyGate;
  const diagnostics = input.storyDiagnostics;
  const diagnosticText = diagnostics ? [
    `剧情编织注入健康：${diagnostics.健康状态}`,
    `剧情编织实际注入：第 ${diagnostics.当前分段组号} 段「${diagnostics.当前分段标题}」｜${diagnostics.当前分段运行状态}`,
    diagnostics.归档锚点标题 ? `已跳过归档锚点：第 ${diagnostics.归档锚点组号} 段「${diagnostics.归档锚点标题}」` : '',
    diagnostics.前一分段标题 ? `历史承接段：${diagnostics.前一分段标题}` : '',
    diagnostics.下一分段标题 ? `下一段预热：${diagnostics.下一分段标题}` : '',
    diagnostics.检查项.length ? `注入检查：${diagnostics.检查项.join('；')}` : '',
  ].filter(Boolean).join('\n') : '';
  return [
    input.recall.yitingPreview?.previewText ?? '',
    gate ? `剧情编织门禁：${gate.mode}｜第 ${gate.分段组号 ?? '?'} 段｜${gate.reasons.join('；') || '无命中理由'}` : '',
    diagnosticText,
    formatZhikuDiagnosticsPreview(input.recall.zhikuPreview?.diagnostics),
    formatNpcLedgerPreview(input.npcLedgers),
  ].filter(Boolean).join('\n\n');
}
