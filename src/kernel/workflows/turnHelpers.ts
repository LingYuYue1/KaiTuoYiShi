import type { RuntimeDraftState } from '@/src/kernel/domain/session/runtimeState';
import { 创建聊天消息, type 聊天消息, type 回合快照, type 回合Token消耗, type 解析后回复 } from '@/models/chat';
import type { 新闻条目 } from '@/models/news';
import { sendChatMessage } from '@/services/ai/text';
import { hasClosedResponseField, isEmptyResponse, parseResponse } from '@/src/kernel/protocol/mainResponse';
import { appendApiErrorReport } from '@/services/ai/apiErrorReportService';
import { callVariableModel, type NsfwBaselineCandidate } from '@/services/ai/variableModel';
import { buildOpeningSystemPrompt, buildSystemPrompt } from './systemPromptBuilder';
import { buildTavernMessageChain } from './tavernMessageChainBuilder';
import { applyTavernOutputRegexScripts } from './tavernRegexProcessor';
import { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';
import { getBuiltinPresetsV2 } from '@/data/builtinPresets';
import { 构建天气Prompt片段, 解析天气标签, 验证天气合法性 } from '@/data/weatherRules';
import {
  buildImmediateMemory,
  addImmediateMemory,
  autoCompressMemorySystemWithArchivesAsync,
  compressNpcMemoryLedger,
  upsertRecallEntry,
} from './memoryUtils';
import { runNewsGenerationStep } from './newsWorkflow';
import { autoAlignCanonStoryProgress } from '@/src/kernel/domain/story/storyProgress';
import { evaluateStoryWeavingGate, getStoryWeavingInjectionDiagnostics } from '@/src/kernel/workflows/storyWeaving';
import { 归一化世界状态, 格式化开局档案上下文, type 世界状态 } from '@/models/world';
import { snapshotVariableState, reduceVariableCommands, commitVariableState, unpackVariableState } from '@/utils/variableExecutor';
import { factsToVariableCommands, parseVariableFacts } from '@/utils/variableFacts';
import {
  createDocumentVisibilitySource,
  createVisibilityBufferedPublisher,
  type VisibilityBufferedPublisher,
} from '@/utils/visibilityBufferedPublisher';
import { createRafCoalescedSetter } from '@/utils/rafCoalescedSetter';
import type { 变量事实, 变量命令, 变量命令批次 } from '@/models/variableCommand';
import { 解析命途ID, 应用狭间结果, 踏入命途狭间, type 狭间评判 } from '@/src/kernel/domain/path/pathOperations';
import { 创建默认记忆系统设置 } from '@/models/settings';
import type { API配置项, 文生图API配置, 游戏设置 } from '@/models/settings';
import type { 队列任务ID, 队列任务记录, 队列任务状态 } from '@/models/queueTask';
import { retrieveZhikuContextWithModel, type 智库召回诊断 } from '@/services/zhikuRetrieval';
import { applyStoryArchiveZhikuRuntimeUnlock } from '@/services/zhikuRuntimeUnlock';
import { retrieveYitingContextWithModel } from '@/services/yitingRetrieval';
import { buildYitingArchiveEntry } from '@/services/yitingArchive';
import { 创建默认智库系统设置 } from '@/models/settings';
import { selectNpcLedgersForTurn, 提取NPC同行记忆文本列表, type NPC记录, type NPC账本选择结果 } from '@/models/npc';
import {
  buildImmediateStoryReview,
  buildZhikuKeywordRecallQuery,
  buildLeanAssistantHistoryContent,
  buildMainRecallQuery,
  getMainHistoryWindow,
} from './historyWindow';
import { type 剧情编织系统 } from '@/models/storyWeaving';
import { getNsfwArchiveBlockReason } from '@/utils/nsfwArchivePolicy';
import { normalizePlayerSpeechInBody, replaceBodyInRawResponse } from '@/utils/playerSpeechGuard';
import { enrichNpcArchives, needsNsfwBaseline } from '@/utils/npcArchiveEnrichment';
import { sanitizeParsedResponse, sanitizeContaminatedText } from '@/utils/textSanitizer';
import { appendWorldEvents } from '@/utils/worldEvents';
import { getAnticipatedNpcNamesForTurn, getZhikuNpcNamesForTurn } from './npcPresence';
import { estimateTextTokens } from '@/utils/tokenEstimate';
import { 应用场景角色锚点锁, 应用质量增强提示词 } from '@/utils/imagePromptRules';
import { buildImagePromptTokenizerConfig } from '@/services/ai/imagePromptTokenizer';
import { requireIndependentApiConfig } from '@/services/ai/requireIndependentApiConfig';
import { 创建相册图片条目, 创建相册资源引用 } from '@/utils/albumActions';
import { commitGeneratedOnAlbum } from './albumOperations';
import { compactPreTurnSnapshot } from '@/utils/saveRuntimeCompactor';
import { createMacroContext, type MacroContext, type MacroGameState } from '@/utils/macroEngine';
import { updateTriggerStatesAfterTurn } from '@/utils/worldbook';



export type ApiTokenUsage = Awaited<ReturnType<typeof sendChatMessage>>['usage'];

export function buildTurnTokenUsage(input: {
  apiUsage?: ApiTokenUsage;
  systemPrompt: string;
  messages: 聊天消息[];
  outputText: string;
  provider: string;
  model: string;
}): 回合Token消耗 {
  const promptText = [
    input.systemPrompt,
    ...input.messages.map((msg) => `${msg.role}\n${msg.content}`),
  ].filter(Boolean).join('\n\n');
  const estimatedInput = estimateTextTokens(promptText);
  const estimatedOutput = estimateTextTokens(input.outputText);
  const inputTokens = Math.round(input.apiUsage?.inputTokens ?? estimatedInput);
  const outputTokens = Math.round(input.apiUsage?.outputTokens ?? estimatedOutput);
  const totalTokens = Math.round(input.apiUsage?.totalTokens ?? inputTokens + outputTokens);
  const apiHasCoreUsage =
    typeof input.apiUsage?.inputTokens === 'number' ||
    typeof input.apiUsage?.outputTokens === 'number' ||
    typeof input.apiUsage?.totalTokens === 'number';
  const cachedTokens = typeof input.apiUsage?.cachedTokens === 'number'
    ? Math.round(input.apiUsage.cachedTokens)
    : undefined;
  const uncachedTokens = typeof input.apiUsage?.uncachedTokens === 'number'
    ? Math.round(input.apiUsage.uncachedTokens)
    : undefined;
  const apiHasAnyUsage = apiHasCoreUsage || typeof cachedTokens === 'number' || typeof uncachedTokens === 'number';
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens,
    uncachedTokens,
    cacheHitRate: typeof input.apiUsage?.cacheHitRate === 'number'
      ? input.apiUsage.cacheHitRate
      : apiHasCoreUsage && typeof cachedTokens === 'number' && inputTokens > 0
        ? cachedTokens / inputTokens
        : undefined,
    source: apiHasCoreUsage ? 'api' : apiHasAnyUsage ? 'mixed' : 'estimate',
    provider: input.apiUsage?.provider ?? input.provider,
    model: input.apiUsage?.model ?? input.model,
    usageFormat: input.apiUsage?.usageFormat,
    usagePath: input.apiUsage?.usagePath,
    rawUsageKeys: input.apiUsage?.rawUsageKeys,
    cacheDiagnostic: input.apiUsage?.cacheDiagnostic,
    rawUsage: input.apiUsage?.rawUsage,
  };
}

export type CacheDiagnosticsMessage = {
  role: 聊天消息['role'];
  content: string;
};

export type CacheDiagnosticsSection = {
  label: string;
  text: string;
  start: number;
  end: number;
};

export function splitSystemPromptForCacheDiagnostics(systemPrompt: string): Array<{ label: string; text: string }> {
  const lines = systemPrompt.split(/\r?\n/);
  const sections: Array<{ label: string; text: string }> = [];
  let label = 'System Prompt / 开头';
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) sections.push({ label, text });
    buffer = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    const heading =
      trimmed.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim() ||
      trimmed.match(/^【([^】]{2,40})】/)?.[1]?.trim();
    if (heading) {
      flush();
      label = `System Prompt / ${heading}`;
    }
    buffer.push(line);
  }
  flush();
  return sections.length ? sections : [{ label, text: systemPrompt }];
}

export function buildCacheDiagnosticsSections(systemPrompt: string, messages: CacheDiagnosticsMessage[]): CacheDiagnosticsSection[] {
  const rawSections = [
    ...splitSystemPromptForCacheDiagnostics(systemPrompt),
    ...messages.map((message, index) => ({
      label: `Messages / #${index + 1} ${message.role}`,
      text: message.content || '（空）',
    })),
  ];
  const sections: CacheDiagnosticsSection[] = [];
  let cursor = 0;
  for (const section of rawSections) {
    const start = cursor;
    const text = `<<<${section.label}>>>\n${section.text}`;
    const end = start + text.length;
    sections.push({ ...section, text, start, end });
    cursor = end + 2;
  }
  return sections;
}

export function serializeCacheDiagnosticsSections(sections: CacheDiagnosticsSection[]): string {
  return sections.map((section) => section.text).join('\n\n');
}

export function getCommonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left.charCodeAt(index) === right.charCodeAt(index)) index++;
  return index;
}

export function findCacheDiagnosticsSection(sections: CacheDiagnosticsSection[], index: number): CacheDiagnosticsSection | undefined {
  return sections.find((section) => index >= section.start && index <= section.end)
    ?? sections.at(-1);
}

export function excerptCacheDiagnosticsText(text: string, index: number): string {
  if (!text) return '（空）';
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 160);
  return text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260) || '（空）';
}

export function buildCachePrefixDiagnostics(input: {
  enabled: boolean;
  systemPrompt: string;
  messages: CacheDiagnosticsMessage[];
  previous?: {
    systemPrompt: string;
    messages: CacheDiagnosticsMessage[];
  };
}): NonNullable<聊天消息['debugContext']>['cachePrefixDiagnostics'] | undefined {
  if (!input.enabled || !input.previous) return undefined;
  const currentSections = buildCacheDiagnosticsSections(input.systemPrompt, input.messages);
  const previousSections = buildCacheDiagnosticsSections(input.previous.systemPrompt, input.previous.messages);
  const currentText = serializeCacheDiagnosticsSections(currentSections);
  const previousText = serializeCacheDiagnosticsSections(previousSections);
  const commonPrefixChars = getCommonPrefixLength(currentText, previousText);
  const currentPromptTokens = estimateTextTokens(currentText);
  const previousPromptTokens = estimateTextTokens(previousText);
  const commonPrefixTokens = estimateTextTokens(currentText.slice(0, commonPrefixChars));
  const firstCurrent = findCacheDiagnosticsSection(currentSections, commonPrefixChars);
  const firstPrevious = findCacheDiagnosticsSection(previousSections, commonPrefixChars);
  const changedTailTokens = estimateTextTokens(currentText.slice(commonPrefixChars));
  const largestChangedSections = currentSections
    .filter((section) => section.end >= commonPrefixChars)
    .map((section) => ({
      label: section.label,
      tokens: estimateTextTokens(section.text),
    }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 6);
  return {
    currentPromptTokens,
    previousPromptTokens,
    commonPrefixChars,
    commonPrefixTokens,
    commonPrefixRate: currentText.length ? commonPrefixChars / currentText.length : 0,
    firstDiffCurrentSection: firstCurrent?.label ?? '未知',
    firstDiffPreviousSection: firstPrevious?.label,
    firstDiffCurrentExcerpt: excerptCacheDiagnosticsText(currentText, commonPrefixChars),
    firstDiffPreviousExcerpt: excerptCacheDiagnosticsText(previousText, commonPrefixChars),
    changedTailTokens,
    largestChangedSections,
  };
}

export function buildNpcLedgerDebug(selection?: NPC账本选择结果): NonNullable<聊天消息['debugContext']>['npcLedgerInjection'] | undefined {
  if (!selection) return undefined;
  return {
    selectedNames: selection.selected.map((item) => item.npc.姓名),
    skippedNames: selection.skipped.slice(0, 12),
    injected: selection.selected.map((item) => ({
      name: item.npc.姓名,
      reason: item.reasons,
      fields: item.fields,
      hasRecentInteraction: Boolean(item.ledger.最近互动),
      hasMustRemember: item.ledger.必须记得.length > 0 || item.ledger.禁止遗忘.length > 0,
      hasUnresolvedItems: item.ledger.未完成事项.length > 0 || item.ledger.未解决冲突.length > 0,
    })),
  };
}

export type NpcLedgerUpdateDebug = NonNullable<聊天消息['debugContext']>['npcLedgerUpdate'];

export const NPC_LEDGER_FIELD_LABELS: Record<string, string> = {
  最近互动: '最近互动',
  对玩家长期印象: '对玩家长期印象',
  当前关系阶段: '当前关系阶段',
  共同经历: '共同经历',
  未完成事项: '未完成事项',
  未解决冲突: '未解决冲突',
  必须记得: '必须记得',
  禁止遗忘: '禁止遗忘',
  同行记忆: '同行记忆',
};

export function normalizeNpcDebugName(name: string): string {
  return name.trim() || '未知 NPC';
}

export function extractNpcNameFromCommandKey(key: string): string {
  const matched = key.match(/^NPC\[id=([^\]]+)\]/);
  return matched?.[1]?.trim() || '';
}

export function extractNpcFieldFromCommandKey(key: string): string {
  const matched = key.match(/^NPC\[[^\]]+\]\.([^.[\]]+)/);
  return matched?.[1]?.trim() || '';
}

export function pushUniqueText(list: string[], text: string) {
  const normalized = text.trim();
  if (!normalized || list.includes(normalized)) return;
  list.push(normalized);
}

export function buildNpcLedgerUpdateDebug(input: {
  facts: 变量事实[];
  commands: 变量命令[];
  results: Array<{ command: 变量命令; ok: boolean; reason?: string; kind?: string }>;
  warnings: string[];
  summaryTriggeredNames?: string[];
}): NpcLedgerUpdateDebug | undefined {
  const updatedNames: string[] = [];
  const memoryAppended: string[] = [];
  const ledgerFieldsUpdated: string[] = [];
  const warnings: string[] = [];
  const npcNameById = new Map<string, string>();

  for (const fact of input.facts) {
    if (fact.type !== 'npc') continue;
    const name = normalizeNpcDebugName(fact.name || fact.id || '');
    if (fact.id?.trim()) npcNameById.set(fact.id.trim(), name);
    const factFields = [
      fact.recentInteraction ? '最近互动' : '',
      fact.longTermImpression ? '对玩家长期印象' : '',
      fact.intimateRelationship !== undefined ? '亲密关系' : '',
      fact.sharedExperiences?.length ? '共同经历' : '',
      fact.openItems?.length ? '未完成事项' : '',
      fact.unresolvedConflicts?.length ? '未解决冲突' : '',
      fact.mustRemember?.length ? '必须记得' : '',
      fact.doNotForget?.length ? '禁止遗忘' : '',
    ].filter(Boolean);
    if (fact.memory) pushUniqueText(memoryAppended, `${name}：${fact.memory}`);
    if (factFields.length) pushUniqueText(ledgerFieldsUpdated, `${name}：${factFields.join('、')}`);
    if (fact.memory && !factFields.length) {
      pushUniqueText(warnings, `${name} 只写了 memory，没有同步 recentInteraction / mustRemember / openItems 等账本字段。`);
    }
    if (factFields.length || fact.memory || fact.affinityDelta !== undefined || fact.affinitySet !== undefined || fact.intimateRelationship !== undefined || fact.following !== undefined) {
      pushUniqueText(updatedNames, name);
    }
  }

  const successfulCommands = input.results.filter((item) => item.ok);
  for (const item of successfulCommands) {
    const key = item.command.key;
    if (!key.startsWith('NPC[')) continue;
    const commandName = extractNpcNameFromCommandKey(key);
    const name = npcNameById.get(commandName) ?? commandName;
    const field = extractNpcFieldFromCommandKey(key);
    if (name) pushUniqueText(updatedNames, name);
    if (field === '同行记忆') pushUniqueText(memoryAppended, `${name || 'NPC'}：已追加同行记忆`);
    const label = NPC_LEDGER_FIELD_LABELS[field];
    if (label && field !== '同行记忆') pushUniqueText(ledgerFieldsUpdated, `${name || 'NPC'}：${label}`);
  }

  for (const reason of input.warnings) {
    pushUniqueText(warnings, reason);
  }

  const summaryTriggered = input.summaryTriggeredNames ?? [];
  if (!updatedNames.length && !memoryAppended.length && !ledgerFieldsUpdated.length && !summaryTriggered.length && !warnings.length) {
    return undefined;
  }
  return {
    updatedNames,
    memoryAppended,
    ledgerFieldsUpdated,
    summaryTriggered,
    warnings,
  };
}

export function attachNpcLedgerUpdateDebug(
  history: 聊天消息[],
  messageId: string,
  update?: NpcLedgerUpdateDebug,
): 聊天消息[] {
  if (!update) return history;
  return history.map((msg) => {
    if (msg.id !== messageId) return msg;
    return {
      ...msg,
      debugContext: msg.debugContext
        ? { ...msg.debugContext, npcLedgerUpdate: update }
        : msg.debugContext,
    };
  });
}

export function formatNpcLedgerPreview(selection?: NPC账本选择结果): string {
  if (!selection) return '';
  const selected = selection.selected.map((item) => `${item.npc.姓名}（${item.reasons.slice(0, 3).join('、') || '相关'}）`);
  const skipped = selection.skipped.slice(0, 4).map((item) => `${item.name}：${item.reason}`);
  return [
    'NPC账本注入诊断：',
    selected.length ? `已注入：${selected.join('；')}` : '已注入：无',
    skipped.length ? `未注入示例：${skipped.join('；')}` : '',
  ].filter(Boolean).join('\n');
}

/** CoT 伪装历史：在 `user:开始任务` 后注入一条 assistant 历史，强化思考段输出习惯。
 *  内容刻意保留 `<thinking>` 段，让模型 in-context 学到「下次也要写 thinking」。 */
export const COT_FAKE_HISTORY_USER = '开始任务';
export const COT_FAKE_HISTORY_ASSISTANT = `<thinking>
- 系统就绪。当前任务：等待玩家发送指令后按 4 标签协议输出（thinking / 正文 / 短期记忆 / 动态世界）。
- 在收到首条具体指令前不输出正文，本条仅为格式确认。
</thinking>

<正文>
（待命中：等待玩家发起首回合）
</正文>

<短期记忆>
</短期记忆>

<动态世界>
</动态世界>`;

export function isDeepSeekMainConfig(config: { provider?: string; baseUrl?: string; model?: string }): boolean {
  const provider = String(config.provider ?? '').toLowerCase();
  const baseUrl = String(config.baseUrl ?? '').toLowerCase();
  const model = String(config.model ?? '').toLowerCase();
  return provider === 'deepseek' || baseUrl.includes('deepseek') || model.includes('deepseek');
}

export function applyNsfwVariablePolicy(
  commands: 变量命令[],
  policy: { nsfwEnabled: boolean; maleNsfwArchiveEnabled: boolean },
  npcs: NPC记录[] = [],
): {
  allowedCommands: 变量命令[];
  rejectedCommands: Array<{ command: 变量命令; ok: false; reason: string }>;
} {
  const allowedCommands: 变量命令[] = [];
  const rejectedCommands: Array<{ command: 变量命令; ok: false; reason: string }> = [];

  for (const command of commands) {
    const key = command.key ?? '';
    const valueText = JSON.stringify(command.value ?? '');
    const touchesNsfw = key.includes('NSFW档案') || valueText.includes('NSFW档案');
    const touchesMaleArchive =
      key.includes('男性身体档案') ||
      key.includes('男性器') ||
      valueText.includes('男性身体档案') ||
      valueText.includes('男性器');

    if (touchesNsfw && !policy.nsfwEnabled) {
      rejectedCommands.push({
        command,
        ok: false,
        reason: 'NSFW 总开关未开启，已阻止写入 NSFW 档案。',
      });
      continue;
    }

    if (touchesNsfw) {
      const blockedReason = getNsfwBlockedCommandReason(command, npcs);
      if (blockedReason) {
        rejectedCommands.push({
          command,
          ok: false,
          reason: blockedReason,
        });
        continue;
      }
    }

    if (touchesMaleArchive && !policy.maleNsfwArchiveEnabled) {
      rejectedCommands.push({
        command,
        ok: false,
        reason: '男性 NSFW 档案开关未开启，已阻止写入男性身体档案。',
      });
      continue;
    }

    allowedCommands.push(command);
  }

  return { allowedCommands, rejectedCommands };
}

export function getNsfwBlockedCommandReason(command: 变量命令, npcs: NPC记录[]): string | null {
  const text = `${command.key}\n${JSON.stringify(command.value ?? '')}`;
  const selector = command.key.match(/^NPC\[([^\]]+)\]/)?.[1] ?? '';
  const selectorValue = selector.includes('=')
    ? selector.split('=').slice(1).join('=').replace(/^["']|["']$/g, '').trim()
    : selector.trim();
  const npc = npcs.find((item) =>
    item.id === selectorValue ||
    item.姓名 === selectorValue ||
    item.别名 === selectorValue ||
    text.includes(item.姓名) ||
    Boolean(item.别名 && text.includes(item.别名)),
  );
  const reason = getNsfwArchiveBlockReason(npc, selectorValue, text);
  return reason ? `NSFW 档案已阻止：${reason}。` : null;
}

export function pushQueueTask(
  state: RuntimeDraftState,
  id: 队列任务ID,
  status: 队列任务状态,
  patch?: {
    title?: string;
    subtitle?: string;
    detail?: string;
    rawText?: string;
    turn?: number;
    targetMessageId?: string;
    targetBatchId?: string;
    retryHint?: string;
    failCount?: number;
    retrying?: boolean;
    cancellable?: boolean;
    cancelled?: boolean;
  },
) {
  const titleMap: Record<队列任务ID, string> = {
    main_story: '主剧情生成',
    memory: '记忆整理',
    variable: '变量生成',
    news: '星际和平周报',
    world_evolution: '世界演变',
    yiting: '忆庭召回',
    zhiku: '智库检索',
    phone: '手机来信',
    autosave: '自动存档',
    narrative_image_parse: '故事快照解析',
    narrative_image_generate: '故事快照生成',
  };
  const subtitleMap: Record<队列任务ID, string> = {
    main_story: '主 API 输出正文与行动选项',
    memory: '即时记忆写入与自动压缩',
    variable: '解析正文并落地变量命令',
    news: '独立 API 推演新闻与后台事件',
    world_evolution: '后续接入独立世界演变 API',
    narrative_image_parse: '从正文提取故事快照提示词',
    narrative_image_generate: '调用生图 API 生成故事快照',
    yiting: '后续接入回忆检索队列',
    zhiku: '独立 API 检索原著资料',
    phone: '主动来信种子与通讯入口',
    autosave: '写入最近自动存档',
  };
  state.setQueueTasks((prev) => [
    ...prev.slice(-24),
    {
      id,
      title: patch?.title ?? titleMap[id],
      subtitle: patch?.subtitle ?? subtitleMap[id],
      turn: patch?.turn ?? state.turnCount,
      timestamp: Date.now(),
      status,
      detail: patch?.detail,
      rawText: patch?.rawText,
      targetMessageId: patch?.targetMessageId,
      targetBatchId: patch?.targetBatchId,
      retryHint: patch?.retryHint,
      failCount: patch?.failCount,
      retrying: patch?.retrying,
      cancellable: patch?.cancellable,
      cancelled: patch?.cancelled,
    },
  ]);
}

export function splitStreamingReveal(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sentenceChunks = trimmed.match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g)?.filter(Boolean) ?? [];
  if (sentenceChunks.length > 1) return sentenceChunks;
  const chars = Array.from(trimmed);
  if (chars.length <= 16) return [trimmed];
  const chunkSize = Math.max(4, Math.ceil(chars.length / 10));
  const chunks: string[] = [];
  for (let i = 0; i < chars.length; i += chunkSize) {
    chunks.push(chars.slice(i, i + chunkSize).join(''));
  }
  return chunks;
}

export function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

export function waitStreamingPreviewDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted || isPageHidden() || typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let done = false;
    let timer: number | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      if (typeof timer === 'number') window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const onVisibilityChange = () => {
      if (isPageHidden()) finish();
    };
    timer = window.setTimeout(finish, ms);
    document.addEventListener('visibilitychange', onVisibilityChange);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

export function buildRecentTurnWindowForNews(history: 聊天消息[], currentUserInput: string, currentBody: string, interval: number): string[] {
  const windowSize = Math.max(5, Math.min(10, Math.trunc(interval) || 5));
  const pairs: string[] = [];
  let pendingUser = '';

  for (const msg of history) {
    if (msg.role === 'user') {
      pendingUser = msg.content;
      continue;
    }
    if (msg.role === 'assistant') {
      const body = msg.parsedResponse?.body || msg.content;
      if (pendingUser || body) {
        pairs.push(`- 玩家：${pendingUser || '（无）'}\n  正文：${body.slice(0, 420)}`);
      }
      pendingUser = '';
    }
  }

  pairs.push(`- 玩家：${currentUserInput || '（无）'}\n  正文：${currentBody.slice(0, 420)}`);
  return pairs.slice(-windowSize);
}

export async function revealStreamingPreview(
  text: string,
  onProgress: (text: string) => void,
  signal?: AbortSignal,
  options?: { delayMs?: number; minChunks?: number },
): Promise<void> {
  const chunks = splitStreamingReveal(text);
  if (!chunks.length) return;
  const streamSetter = createRafCoalescedSetter(onProgress);
  if (isPageHidden()) {
    streamSetter.flush(text.trim());
    return;
  }
  const minChunks = options?.minChunks ?? 8;
  const delayMs = options?.delayMs ?? 18;
  const revealChunks =
    chunks.length >= minChunks
      ? chunks
      : (() => {
          const chars = Array.from(text.trim());
          const chunkSize = Math.max(3, Math.ceil(chars.length / minChunks));
          const expanded: string[] = [];
          for (let i = 0; i < chars.length; i += chunkSize) {
            expanded.push(chars.slice(i, i + chunkSize).join(''));
          }
          return expanded;
        })();

  let preview = '';
  try {
    for (const chunk of revealChunks) {
      if (signal?.aborted) return;
      preview += chunk;
      streamSetter.set(preview);
      await waitStreamingPreviewDelay(delayMs, signal);
      if (isPageHidden()) {
        streamSetter.flush(text.trim());
        return;
      }
    }
    // Ensure the final preview is committed before callers clear/replace it.
    streamSetter.flush(preview);
  } finally {
    streamSetter.cancel();
  }
}

export function mergeYitingSystems(
  base: import('@/models/yiting').忆庭系统,
  override?: import('@/models/yiting').忆庭系统,
): import('@/models/yiting').忆庭系统 {
  if (!override) return base;
  const merged = [...base.回忆档案];
  for (const entry of override.回忆档案 ?? []) {
    if (!merged.some((item) => item.id === entry.id)) {
      merged.push(entry);
    }
  }
  return { ...override, 回忆档案: merged };
}

/**
 * Optional Phase-1 kernel bridge observers.
 * Translation-only hooks for LegacyKernelAdapter — no new domain rules.
 * Formal game state is still committed by this workflow (legacy authority).
 */
export type SendWorkflowSettlement =
  | Readonly<{
      ok: true;
      /** Narrative body after formal assistant commit (empty if no assistant body). */
      narrativeText: string;
      /** Projection data captured at the legacy formal-commit boundary. */
      messages: readonly Readonly<{ role: 'user' | 'assistant'; content: string }>[];
      turnCount: number;
    }>
  | Readonly<{
      ok: false;
      error: Error;
      cancelled: boolean;
    }>;

export interface SendWorkflowDeps {
  signal?: AbortSignal;
  worldbooks: import('@/models/worldbook').世界书[];
  emitProcess?: (event: unknown) => void;
  state: RuntimeDraftState;
  gameSettings: 游戏设置;
  getActiveConfig: () => import('@/models/settings').API配置项 | null;
  onBeforeSend: () => void;
  onAfterSend: () => void;
  rerollContext?: {
    nonce: string;
    previousResponse: string;
  } | null;
  /**
   * Cumulative stream preview text for IKernel progress frames.
   * Workflow must not touch UI stores — only this callback.
   * Must not formal-commit.
   */
  onStreamProgress?: (text: string) => void;
  /**
   * Exactly one settlement signal per workflow run (success or failure).
   * Used by IKernel committed/rejected frames.
   */
  onWorkflowSettled?: (result: SendWorkflowSettlement) => void;
}


export function compactForRerollInstruction(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 900 ? `${cleaned.slice(0, 900)}...` : cleaned;
}

export function resolveNarrativeImageTokenizerConfig(state: RuntimeDraftState, gameSettings: 游戏设置): API配置项 | null {
  return buildImagePromptTokenizerConfig(gameSettings);
}

export function resolveNarrativeImageGenerationApi(state: RuntimeDraftState, gameSettings: 游戏设置): 文生图API配置 | null {
  const imageSettings = gameSettings.文生图系统;
  return imageSettings.普通接口.enabled ? imageSettings.普通接口 : null;
}

export function archiveNarrativeSnapshotToAlbum(
  state: RuntimeDraftState,
  image: import('@/models/chat').叙事插图,
  params: {
    title: string;
    size: string;
    sourcePrompt: string;
  },
): import('@/models/chat').叙事插图 {
  if (image.status !== 'done' || !image.dataUrl) return image;
  const item = 创建相册图片条目({
    title: params.title || image.description || '故事快照',
    src: image.dataUrl,
    source: 'generated',
    targetType: 'scene',
    slot: 'scene',
    prompt: image.prompt,
    negativePrompt: image.negativePrompt,
    sourcePrompt: params.sourcePrompt,
    finalPrompt: image.prompt,
    finalNegativePrompt: image.negativePrompt,
    dimensions: params.size,
    tags: ['故事快照', '正文生图'],
    note: '故事快照',
  });
  // Stage 5.4 D: single formal commit via domain commitGeneratedAsset (no half asset).
  // Object URL / dataUrl bytes stay in frontend cache; formal field is AssetRef.
  const committed = commitGeneratedOnAlbum(state.相册, {
    asset: item.asset,
    entry: item.entry,
    displayDataUrl: image.dataUrl?.startsWith('data:') ? image.dataUrl : undefined,
  });
  state.set相册(committed.album);
  return {
    ...image,
    dataUrl: 创建相册资源引用(item.asset.id),
    assetId: item.asset.id,
  };
}

export async function generateNarrativeImagesForMessage(params: {
  state: RuntimeDraftState;
  gameSettings: 游戏设置;
  messageId: string;
  body: string;
  tokenizerConfig: API配置项;
  imageApiConfig: 文生图API配置;
  turn: number;
  signal?: AbortSignal;
  emitProcess?: (event: unknown) => void;
  replaceExisting?: boolean;
}): Promise<import('@/models/chat').叙事插图[]> {
  const { state, messageId, body, tokenizerConfig, imageApiConfig, turn, signal, replaceExisting = false } = params;
  pushQueueTask(state, 'narrative_image_parse', 'pending', {
    detail: '正在解析正文中的故事快照提示词。',
    turn,
    targetMessageId: messageId,
  });
  try {
    const { parseStorySnapshotPrompt } = await import('@/services/ai/narrativeImageParse');
    const { generateNarrativeImage } = await import('@/services/ai/imageGeneration');
    const playerAppearanceMode = params.gameSettings.文生图系统?.正文生图?.playerAppearanceMode ?? 'auto';
    const presentNpcRecords = (state.NPC ?? [])
      .filter((npc: import('@/models/npc').NPC记录) => npc.阶位 === 'companion' && (npc.外貌 || npc.穿着))
      .slice(0, 8);
    const traveler = state.旅人;
    const presentNpcs = presentNpcRecords
      .map((npc: import('@/models/npc').NPC记录) => ({
        name: npc.姓名,
        appearance: typeof npc.外貌 === 'string' ? npc.外貌 : undefined,
        clothing: typeof npc.穿着 === 'string' ? npc.穿着 : undefined,
      }));
    const parsedSnapshot = await parseStorySnapshotPrompt(tokenizerConfig, {
      body,
      traveler: playerAppearanceMode === 'off' ? undefined : {
        name: traveler.姓名 || traveler.别名 || '玩家角色',
        gender: traveler.性别 || undefined,
        appearance: traveler.外貌 || undefined,
        identity: traveler.身份 || undefined,
        anchorPrompt: traveler.图像档案?.角色锚点 ? JSON.stringify(traveler.图像档案.角色锚点) : undefined,
      },
      playerAppearanceMode,
      presentNpcs,
    }, signal);
    pushQueueTask(state, 'narrative_image_parse', 'success', {
      detail: `已解析故事快照：${parsedSnapshot.title || '剧情瞬间'}。`,
      turn,
      targetMessageId: messageId,
    });
    const generatedImages: import('@/models/chat').叙事插图[] = [];
    pushQueueTask(state, 'narrative_image_generate', 'pending', {
      detail: `正在生成故事快照：${parsedSnapshot.title || '剧情瞬间'}。`,
      turn,
      targetMessageId: messageId,
    });
    const imageId = `narrative_${turn}_snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const lockedPrompt = 应用场景角色锚点锁({
      prompt: parsedSnapshot.prompt,
      negative: parsedSnapshot.negativePrompt,
      traveler: playerAppearanceMode === 'off' ? undefined : traveler,
      forceTravelerVisible: playerAppearanceMode === 'force',
      presentNpcs: presentNpcRecords,
    });
    const promptRefined = 应用质量增强提示词(
      params.gameSettings.文生图系统.rules,
      lockedPrompt.prompt,
      lockedPrompt.negative,
    );
    const result = await generateNarrativeImage(
      imageApiConfig,
      promptRefined.prompt,
      promptRefined.negative,
      'scene',
      parsedSnapshot.title || '故事快照',
      imageId,
      signal,
    );
    if (result.status !== 'done') throw new Error(result.error || '故事快照生成失败');
    result.kind = 'snapshot';
    const archivedResult = archiveNarrativeSnapshotToAlbum(state, result, {
      title: parsedSnapshot.title || '故事快照',
      size: '1280x720',
      sourcePrompt: body,
    });
    generatedImages.push(archivedResult);
    pushQueueTask(state, 'narrative_image_generate', result.status === 'done' ? 'success' : 'failed', {
      detail: result.status === 'done'
        ? `${parsedSnapshot.title || '故事快照'} 故事快照生成完成。`
        : `${parsedSnapshot.title || '故事快照'} 故事快照生成失败：${result.error}`,
      turn,
      targetMessageId: messageId,
    });
    if (generatedImages.length > 0) {
      state.setChatHistory((prev) => {
        const targetIdx = prev.findIndex((msg) => msg.id === messageId);
        if (targetIdx < 0) return prev;
        const targetMsg = prev[targetIdx];
        if (targetMsg.role !== 'assistant') return prev;
        const updated = [...prev];
        updated[targetIdx] = {
          ...targetMsg,
          narrativeImages: replaceExisting
            ? generatedImages
            : [...(targetMsg.narrativeImages ?? []), ...generatedImages],
        };
        return updated;
      });
    }
    return generatedImages;
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      pushQueueTask(state, 'narrative_image_parse', 'failed', {
        detail: `故事快照解析失败：${(err as Error).message}`,
        turn,
        targetMessageId: messageId,
      });
    }
    throw err;
  }
}

export async function regenerateNarrativeImagesForMessage(
  state: RuntimeDraftState,
  gameSettings: 游戏设置,
  messageId: string,
): Promise<void> {
  const message = state.chatHistory.find((item) => item.id === messageId);
  if (!message || message.role !== 'assistant') throw new Error('未找到需要重新生成插图的正文消息');
  const body = message.parsedResponse?.body?.trim() || message.content.trim();
  if (!body) throw new Error('正文为空，无法重新生成插图');
  const narrative = gameSettings.文生图系统?.正文生图;
  if (!narrative?.enabled) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '正文生图未启用，无法重新生成故事快照。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    throw new Error('正文生图未启用');
  }
  const tokenizerConfig = resolveNarrativeImageTokenizerConfig(state, gameSettings);
  if (!tokenizerConfig) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '正文生图词组转化器未配置，无法解析故事快照提示词。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    throw new Error('正文生图词组转化器未启用');
  }
  const imageApiConfig = resolveNarrativeImageGenerationApi(state, gameSettings);
  if (!imageApiConfig) {
    pushQueueTask(state, 'narrative_image_generate', 'failed', {
      detail: '正文生图主文生图接口未启用，无法生成故事快照。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    throw new Error('正文生图接口未启用');
  }
  const turn = Number(message.gameTime) || state.turnCount;
  const previousImages = message.narrativeImages ?? [];
  state.setChatHistory((prev) => prev.map((item) =>
    item.id === messageId
      ? {
          ...item,
          narrativeImages: previousImages.length
            ? previousImages.map((img) => ({ ...img, status: 'generating' as const, error: undefined }))
            : [{
                id: `narrative_regen_${turn}_${Date.now()}`,
                dataUrl: '',
                type: 'scene' as const,
                prompt: '',
                negativePrompt: '',
                description: '故事快照',
                kind: 'snapshot' as const,
                status: 'generating' as const,
              }],
        }
      : item,
  ));
  await generateNarrativeImagesForMessage({
    gameSettings,
    state,
    messageId,
    body,
    tokenizerConfig,
    imageApiConfig,
    turn,
    replaceExisting: true,
  });
}

export async function retryQueueTask(
  state: RuntimeDraftState,
  gameSettings: 游戏设置,
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
      throw new Error('未找到可重试的正文回合');
    }
    pushQueueTask(state, task.id, 'pending', {
      detail: mode === 'reroll' ? '正在重新解析并生成故事快照。' : '正在重试故事快照任务。',
      turn: task.turn || state.turnCount,
      targetMessageId,
      retrying: true,
      failCount: task.failCount,
    });
    await regenerateNarrativeImagesForMessage(state, gameSettings, targetMessageId);
    return;
  }

  if (task.id === 'news') {
    await retryNewsQueueTask(state, gameSettings, task, mode);
    return;
  }

  if (task.id === 'variable') {
    await retryVariableQueueTask(state, gameSettings, task, mode);
    return;
  }
  throw new Error(`队列任务不支持重试：${task.id}`);
}

export async function retryNewsQueueTask(
  state: RuntimeDraftState,
  gameSettings: 游戏设置,
  task: 队列任务记录,
  mode: 'retry' | 'reroll',
): Promise<void> {
  const assistant = findLatestAssistantMessage(state.chatHistory);
  if (!assistant) {
    throw new Error('未找到可用于新闻重试的正文回合');
  }
  const userInput = findPreviousUserInput(state.chatHistory, assistant.id);
  const body = assistant.parsedResponse?.body?.trim() || assistant.content.trim();
  if (!body) {
    throw new Error('当前正文为空，无法重试新闻生成');
  }
  const newsSettings = gameSettings.新闻系统;
  const interval = Math.max(5, Math.min(10, Math.trunc(newsSettings?.generateIntervalTurns ?? 5) || 5));
  const abortController = new AbortController();
  pushQueueTask(state, 'news', 'pending', {
    detail: mode === 'reroll' ? '正在重生成星际和平周报，本次不受回合间隔限制。' : '正在重试星际和平周报，本次不受回合间隔限制。',
    turn: Number(assistant.gameTime) || task.turn || state.turnCount,
    retrying: true,
    failCount: task.failCount,
    targetMessageId: assistant.id,
  });
  const result = await runNewsGenerationStep({
    gameSettings: gameSettings,
    state,
    mainBody: body,
    userInput,
    recentTurns: buildRecentTurnWindowForNews(state.chatHistory, userInput, body, interval),
    storyWeavingSnapshot: state.剧情编织,
    signal: abortController.signal,
  });
  if (!result) throw new Error('新闻系统未启用，无法重试');
  pushQueueTask(state, 'news', 'success', {
    detail: result.changed
      ? `星际和平周报已${mode === 'reroll' ? '重生成' : '重试更新'}，当前共 ${result.news.length} 条新闻记录。`
      : '星际和平周报已重试，本回合没有可写入的新变化。',
    turn: Number(assistant.gameTime) || task.turn || state.turnCount,
    failCount: task.failCount,
    targetMessageId: assistant.id,
  });
}

export async function retryVariableQueueTask(
  state: RuntimeDraftState,
  gameSettings: 游戏设置,
  task: 队列任务记录,
  mode: 'retry' | 'reroll',
): Promise<void> {
  if (!gameSettings.enableVariableUpdate) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: '变量更新未启用，无法手动重试。',
      failCount: (task.failCount ?? 0) + 1,
    });
    throw new Error('变量更新未启用');
  }
  const batch = findRetryableVariableBatch(state.variableBatches, task.targetBatchId);
  if (!batch) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: '未找到可安全重试的失败变量批次。若上一批已有成功命令，为避免重复结算，请不要直接重跑整批。',
      failCount: (task.failCount ?? 0) + 1,
    });
    throw new Error('未找到可安全重试的失败变量批次');
  }
  const assistant = findAssistantMessageForTurn(state.chatHistory, batch.turn) ?? findLatestAssistantMessage(state.chatHistory);
  if (!assistant) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: '未找到变量批次对应的正文回合。',
      targetBatchId: batch.id,
      failCount: (task.failCount ?? 0) + 1,
    });
    throw new Error('未找到变量批次对应的正文回合');
  }
  const body = assistant.parsedResponse?.body?.trim() || assistant.content.trim();
  if (!body) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: '当前正文为空，无法重试变量结算。',
      targetBatchId: batch.id,
      failCount: (task.failCount ?? 0) + 1,
    });
    throw new Error('当前正文为空，无法重试变量结算');
  }
  pushQueueTask(state, 'variable', 'pending', {
    detail: mode === 'reroll' ? '正在重生成变量结算结果。' : '正在重试变量结算。',
    turn: batch.turn,
    targetMessageId: assistant.id,
    targetBatchId: batch.id,
    retrying: true,
    failCount: task.failCount,
  });
  const overrides = await runVariableCalibrationStep({
      gameSettings,
    state,
    userInput: findPreviousUserInput(state.chatHistory, assistant.id),
    body,
    variableDraft: assistant.parsedResponse?.variableDraft,
    turnAfter: batch.turn + 1,
    memorySystemSnapshot: state.记忆,
    travelerSnapshot: state.旅人,
    worldSnapshot: state.世界,
  });
  const retryBatch = overrides?.batch;
  const hasFailure = retryBatch?.results.some((result) => !result.ok);
  pushQueueTask(state, 'variable', retryBatch && !hasFailure ? 'success' : retryBatch ? 'failed' : 'failed', {
    detail: retryBatch
      ? hasFailure
        ? '变量结算已重试，但仍存在失败命令，请展开查看原始信息。'
        : '变量结算已重试并落地。'
      : '变量结算重试未返回结果。',
    turn: batch.turn,
    targetMessageId: assistant.id,
    targetBatchId: retryBatch?.id ?? batch.id,
    failCount: hasFailure || !retryBatch ? (task.failCount ?? 0) + 1 : task.failCount,
  });
}

export function findLatestAssistantMessage(history: 聊天消息[]): 聊天消息 | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role === 'assistant') return item;
  }
  return undefined;
}

export function findAssistantMessageForTurn(history: 聊天消息[], turn: number): 聊天消息 | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role === 'assistant' && Number(item.gameTime) === turn) return item;
  }
  return undefined;
}

export function findPreviousUserInput(history: 聊天消息[], assistantId: string): string {
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
  // 只允许整批完全失败的结果手动重试。
  // 若同一批里已有成功命令，重跑整批可能让已成功的 set/push 再落地一次，造成重复结算。
  return candidates.find((batch) =>
    batch.results.length > 0 &&
    batch.results.every((result) => !result.ok),
  );
}

export function normalizeRerollCompareText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/[【】「」『』“”"'‘’（）()\[\]{}<>《》,，.。!！?？:：;；、\s]/g, '')
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

export interface VariableCalibrationParams {
  state: RuntimeDraftState;
  gameSettings: 游戏设置;
  userInput: string;
  body: string;
  variableDraft?: string;
  /** 主流程结束后的回合数(已 +1)。 */
  turnAfter: number;
  memorySystemSnapshot: import('@/models/memory').记忆系统;
  /** 7/7a/7b 后的旅人快照(包含 应用狭间结果 写入的命途列表变化)。 */
  travelerSnapshot?: import('@/models/character').角色数据结构;
  /** 7/7a/7b 后的世界快照(包含全局事件追加、待触发狭间写入、进行中狭间清空)。 */
  worldSnapshot?: import('@/models/world').世界状态;
  signal?: AbortSignal;
  emitProcess?: (event: unknown) => void;
  shouldCommit?: () => boolean;
}

export interface VariableCalibrationOverrides {
  旅人?: import('@/models/character').角色数据结构;
  世界?: import('@/models/world').世界状态;
  记忆?: import('@/models/memory').记忆系统;
  忆庭?: import('@/models/yiting').忆庭系统;
  智库?: import('@/models/zhiku').智库系统;
  手机?: import('@/models/phone').手机系统;
  NPC?: import('@/models/npc').NPC记录[];
  新闻?: import('@/models/news').新闻条目[];
  剧情?: import('@/models/plot').剧情节点[];
  batch?: 变量命令批次;
  npcLedgerUpdate?: NpcLedgerUpdateDebug;
}

/** 执行一次变量模型校准：调用独立 API → 解析命令 → 落地 → 推入 variableBatches。
 *  失败不抛错（不影响主流程的存档）。 */
export async function runVariableCalibrationStep(
  params: VariableCalibrationParams,
): Promise<VariableCalibrationOverrides | null> {
  const { state, gameSettings } = params;
  if (!gameSettings.enableVariableUpdate) return null;
  if (!params.body?.trim()) return null;

  const override = gameSettings.variableApi;
  const variableConfig = requireIndependentApiConfig('变量更新', override, {
    maxTokens: 4096,
    temperature: 0.2,
  });

  // 构造当前状态快照(用主流程已更新过的切片)。
  const stateSnapshot = snapshotVariableState({
    旅人: params.travelerSnapshot ?? state.旅人,
    世界: params.worldSnapshot ?? state.世界,
    记忆: params.memorySystemSnapshot,
    忆庭: state.忆庭,
    智库: state.智库,
    手机: state.手机,
    NPC: state.NPC,
    新闻: state.新闻,
    剧情: state.剧情,
  });

  // NSFW 基线候选：开启时，为缺少实质内容的 NPC 在变量更新那一次调用里生成基线。
    const nsfwBaselineCandidates: NsfwBaselineCandidate[] = [];
    if (gameSettings.enableNsfw) {
      const npcRecords = (stateSnapshot.NPC ?? []) as NPC记录[];
      for (const npc of npcRecords) {
        if (nsfwBaselineCandidates.length >= 2) break;
        if (needsNsfwBaseline(npc, undefined, {
          nsfwEnabled: true,
          maleNsfwArchiveEnabled: gameSettings.enableMaleNsfwArchive,
        })) {
          nsfwBaselineCandidates.push({
            npcId: npc.id,
            npcName: npc.姓名 ?? npc.别名 ?? '',
            gender: npc.性别,
            appearance: typeof npc.外貌 === 'string' ? npc.外貌 : undefined,
            personality: typeof npc.性格 === 'string' ? npc.性格 : undefined,
            intro: typeof npc.介绍 === 'string' ? npc.介绍 : undefined,
          });
        }
      }
    }
    const { rawText } = await callVariableModel(variableConfig, {
      body: params.body,
      variableDraft: params.variableDraft,
      userInput: params.userInput,
      turnCount: params.turnAfter - 1, // 这条变量是给「刚结束的那回合」用的
      state: stateSnapshot,
      nsfwEnabled: gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: gameSettings.enableMaleNsfwArchive,
      nsfwBaselineCandidates,
      signal: params.signal,
      retryCount: gameSettings.variableApi.retryCount ?? 2,
      promptModules: gameSettings.promptModules,
    });
    assertCalibrationActive(params);

    const parsedFacts = parseVariableFacts(rawText);
    const factCommands = factsToVariableCommands(parsedFacts.facts, stateSnapshot, params.turnAfter - 1, {
      phoneSeedsEnabled: gameSettings.手机系统.enabled && gameSettings.手机系统.autoGenerateSeeds,
      maxPhoneSeedsPerTurn: gameSettings.手机系统.maxSeedsPerTurn,
    });
    if (parsedFacts.parseErrors.length) {
      throw new Error(`变量事实解析失败：${parsedFacts.parseErrors.join('；')}`);
    }
    if (factCommands.warnings.length) {
      throw new Error(`变量事实归约失败：${factCommands.warnings.join('；')}`);
    }
    const commands = factCommands.commands;
    const { allowedCommands, rejectedCommands } = applyNsfwVariablePolicy(commands, {
      nsfwEnabled: gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: gameSettings.enableMaleNsfwArchive,
    }, stateSnapshot.NPC as NPC记录[]);
    if (rejectedCommands.length) {
      throw new Error(`变量策略拒绝整批命令：${rejectedCommands.map((item) => item.reason).join('；')}`);
    }
    const { results, nextState } = reduceVariableCommands(allowedCommands, stateSnapshot);
    const failedResult = results.find((result) => !result.ok);
    if (failedResult) {
      throw new Error(`变量命令归约失败：${failedResult.reason ?? failedResult.command.key}`);
    }
    assertCalibrationActive(params);

    const commandResults = results.map((item) => ({ ...item, kind: 'command' as const }));
    const npcLedgerUpdate = buildNpcLedgerUpdateDebug({
      facts: parsedFacts.facts,
      commands,
      results: commandResults,
      warnings: [],
    });

    // 把整个 batch 推入历史
    const batch: 变量命令批次 = {
      id: `vbatch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      turn: params.turnAfter - 1,
      timestamp: Date.now(),
      source: 'calibration',
      modelName: variableConfig.model,
      results: commandResults,
      report: [
        `变量事实：${parsedFacts.facts.length} 条，生成内部命令 ${factCommands.commands.length} 条。`,
        ...factCommands.notes,
      ].filter(Boolean).join('\n'),
      rawText,
    };
    assertCalibrationActive(params);
    state.setVariableBatches((prev) => [...prev, batch]);

    assertCalibrationActive(params);

    // 没有任何成功命令时，无需 setState；返回空 overrides 让 save 用主流程的值
    const anyApplied = results.some((r) => r.ok);
    const worldSelfHealed = nextState.世界 !== stateSnapshot.世界;
    if (!anyApplied && !worldSelfHealed) return { batch, npcLedgerUpdate };
    assertCalibrationActive(params);

    // 一次性提交所有切片到 React state。传 stateSnapshot 作 initialState,
    // commitVariableState 内部用引用相等过滤——变量模型没改的 root 不会 setState,
    // 避免覆盖玩家在校准这几秒里在 UI 上做的交互(比如点了「踏入命途狭间」)。
    commitVariableState(nextState, stateSnapshot, {
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

    return { ...unpackVariableState(nextState), batch, npcLedgerUpdate };
}

export function assertCalibrationActive(params: Pick<VariableCalibrationParams, 'signal' | 'shouldCommit'>): void {
  if (params.signal?.aborted || params.shouldCommit?.() === false) {
    throw new DOMException('Variable calibration aborted', 'AbortError');
  }
}

// ── Re-export from turnProtocol for backward compat ──
export { DEEPSEEK_MAIN_FORMAT_GUARD, formatOriginalProtagonistForOpening, getHardProtocolIssues, getSoftProtocolIssues, getMainProtocolIssues, buildProtocolRetryGuard, stripLeakedHistoryMetaFromBody, buildStoryProgressMemoryLine, applyStoryProgressNpcMemory, formatZhikuDiagnosticsPreview, getZhikuEntryKind, cleanRecallTitle, formatZhikuRecallSummary, formatYitingRecallSummary } from "./turnProtocol";
