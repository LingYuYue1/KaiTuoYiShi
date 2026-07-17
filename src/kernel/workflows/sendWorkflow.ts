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
import type { API配置项, 文生图API配置 } from '@/models/settings';
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
import { restorePreTurnSnapshot } from './turnSnapshot';
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

const DEEPSEEK_MAIN_FORMAT_GUARD = [
  'DeepSeek 主剧情格式校验：本轮必须从 <thinking> 开始输出，禁止直接从 <正文> 开始。',
  '必须完整输出 <thinking>、<正文>、<短期记忆>、<动态世界>、<变量草稿>；如本回合存在后续承接价值，再输出 <剧情规划>。',
  '<thinking> 内必须按当前生效的思维链 Step 标题，用中文逐步写出实际判断；不允许只写正文，不允许省略 thinking，不允许只写“已思考”。',
  '不要在标签外输出解释、道歉、说明或额外标题。',
].join('\n');

function formatOriginalProtagonistForOpening(originalProtagonist: 世界状态['原著主角']): string {
  if (originalProtagonist === '星') return '原作主角星';
  if (originalProtagonist === '穹') return '原作主角穹';
  if (originalProtagonist === '星穹双主角') return '原作主角星与穹';
  return '所选原著主角';
}

/**
 * Hard protocol issues block turn commit and may trigger main-loop auto-retry.
 * Only settlement-critical gaps belong here (empty/missing body; DeepSeek Step thinking).
 */
function getHardProtocolIssues(
  parsed: 解析后回复,
  rawText: string,
  requireStepThinking: boolean,
): string[] {
  const raw = rawText || parsed.rawText || '';
  const issues: string[] = [];
  const bodyOk = hasClosedResponseField(raw, 'body') && Boolean(parsed.body.trim());
  if (!bodyOk) {
    issues.push('缺少 <正文> 或正文为空');
  }
  // Completely empty raw is also hard (body check usually covers this).
  if (!raw.trim() && !parsed.body.trim()) {
    if (!issues.includes('缺少 <正文> 或正文为空')) {
      issues.push('响应完全为空');
    }
  }
  if (requireStepThinking) {
    if (!hasClosedResponseField(raw, 'thinking') || !parsed.thinking.trim()) {
      issues.push('缺少 <thinking> 或 thinking 为空');
    } else if (
      !/(?:^|\n)\s*(?:Step|Opening-Step|Awakening-Step|步骤)\s*0?\d/i.test(parsed.thinking) &&
      !/Step(?:0|1|2|3|4|5|6|7|8|9|10|11|12|13|14)/i.test(parsed.thinking)
    ) {
      issues.push('<thinking> 未按 Step 思维链展开');
    }
  }
  return issues;
}

/**
 * Soft protocol gaps: settlement can degrade (empty memory/world/variable draft).
 * Do not force main-loop retry solely for these when body is valid.
 */
function getSoftProtocolIssues(parsed: 解析后回复, rawText: string): string[] {
  const raw = rawText || parsed.rawText || '';
  const issues: string[] = [];
  const bodyOk = hasClosedResponseField(raw, 'body') && Boolean(parsed.body.trim());
  if (!bodyOk) return issues;
  if (!hasClosedResponseField(raw, 'thinking') || !parsed.thinking.trim()) {
    issues.push('缺少 <thinking> 或 thinking 为空');
  }
  if (!hasClosedResponseField(raw, 'memory')) {
    issues.push('缺少 <短期记忆>');
  }
  if (!hasClosedResponseField(raw, 'worldEvents')) {
    issues.push('缺少 <动态世界>');
  }
  if (!hasClosedResponseField(raw, 'variableDraft')) {
    issues.push('缺少 <变量草稿>');
  }
  return issues;
}

/** Combined issues for retry-guard messaging (hard first). */
function getMainProtocolIssues(
  parsed: 解析后回复,
  rawText: string,
  requireStepThinking: boolean,
): string[] {
  return [
    ...getHardProtocolIssues(parsed, rawText, requireStepThinking),
    ...getSoftProtocolIssues(parsed, rawText).filter((issue) => {
      // Soft thinking is hard under requireStepThinking; avoid duplicate wording.
      if (requireStepThinking && issue.includes('thinking')) return false;
      return true;
    }),
  ];
}

function buildProtocolRetryGuard(issues: string[]): string {
  return [
    '主剧情自动重试：上一版输出未通过协议校验。',
    `失败项：${issues.join('；') || '未知格式错误'}。`,
    '请完全重写，不要延续上一版残缺输出。',
    DEEPSEEK_MAIN_FORMAT_GUARD,
  ].join('\n');
}

function stripLeakedHistoryMetaFromBody(body: string): string {
  if (!body) return body;
  return body
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      if (!line) return raw;
      const historyTag = line.match(/^【\s*(历史时间|历史正文|历史狭间问答|历史狭间评判|历史短期记忆|历史变量草稿|历史剧情规划)\s*】\s*(.*)$/);
      if (!historyTag) return raw;
      const [, tag, rest] = historyTag;
      if (tag === '历史时间') return '';
      return rest.trim() ? `【旁白】${rest.trim()}` : '';
    })
    .filter((line) => line.trim())
    .join('\n');
}

function buildStoryProgressMemoryLine(previous: 剧情编织系统, next: 剧情编织系统): string {
  const before = previous.当前进度;
  const after = next.当前进度;
  if (!after) return '';
  if (
    before?.当前系列ID === after.当前系列ID &&
    before?.当前分段ID === after.当前分段ID &&
    before?.推进状态 === after.推进状态 &&
    before?.最近一次推进判定回合 === after.最近一次推进判定回合
  ) {
    return '';
  }
  const series = next.系列列表.find((item) => item.id === after.当前系列ID)
    ?? next.系列列表.find((item) => item.id === next.当前系列ID);
  const current = series?.分段列表.find((item) => item.id === after.当前分段ID)
    ?? series?.分段列表.find((item) => item.组号 === after.当前分段组号);
  const parts = [
    `剧情编织进度：${series?.标题 ?? '未知系列'} 当前进入第 ${after.当前分段组号} 段${current?.标题 ? `「${current.标题}」` : ''}`,
    `状态 ${after.推进状态}`,
  ];
  const latestArchive = after.历史归档.at(-1);
  if (latestArchive) {
    parts.push(`最新归档：第 ${latestArchive.分段组号} 段「${latestArchive.分段标题}」${latestArchive.摘要 ? `：${latestArchive.摘要}` : ''}`);
    if (latestArchive.角色推进摘要?.length) {
      parts.push(`角色阶段承接：${latestArchive.角色推进摘要.slice(0, 4).join('；')}`);
    }
  }
  if (after.已完成摘要.length) parts.push(`已归档：${after.已完成摘要.slice(-3).join('；')}`);
  if (after.当前待解问题.length) parts.push(`待解：${after.当前待解问题.slice(0, 3).join('；')}`);
  if (after.最近判定理由.length) parts.push(`判定：${after.最近判定理由.slice(0, 3).join('；')}`);
  return parts.join('。');
}

function applyStoryProgressNpcMemory(npcs: NPC记录[], story: 剧情编织系统, _memoryLine: string, turn: number): NPC记录[] {
  if (!story.当前进度) return npcs;
  const series = story.系列列表.find((item) => item.id === story.当前进度?.当前系列ID)
    ?? story.系列列表.find((item) => item.id === story.当前系列ID);
  if (!series) return npcs;
  const latestArchive = story.当前进度.历史归档.at(-1);
  const roleProgress = latestArchive?.角色推进摘要 ?? [];
  if (!roleProgress.length) return npcs;
  let changed = false;
  const next = npcs.map((npc) => {
    const aliases = [npc.姓名, npc.别名].filter((item): item is string => Boolean(item?.trim()));
    const matched = roleProgress.find((summary) =>
      aliases.some((name) => summary.includes(name)),
    );
    if (!matched || !(npc.阶位 === 'companion' || npc.同行 || 提取NPC同行记忆文本列表(npc).length > 0)) return npc;
    const existing = 提取NPC同行记忆文本列表(npc);
    const cleanSummary = matched.length > 120 ? `${matched.slice(0, 118)}…` : matched;
    if (existing.some((item) => item.includes(cleanSummary))) return npc;
    changed = true;
    return {
      ...npc,
      同行记忆: [
        ...(npc.同行记忆 ?? []),
        {
          id: `npc_story_progress_${npc.id}_${turn}_${Math.random().toString(36).slice(2, 6)}`,
          回合: turn,
          摘要: cleanSummary,
          来源: '其他' as const,
          关联NPCID: [npc.id],
        },
      ],
      最近回合: Math.max(npc.最近回合, turn),
    };
  });
  return changed ? next : npcs;
}

function formatZhikuDiagnosticsPreview(diagnostics?: 智库召回诊断): string {
  if (!diagnostics) return '';
  return [
    '智库召回诊断：',
    `场景锚点：${diagnostics.场景锚点.join('、') || '无'}`,
    `相关角色：${diagnostics.相关角色.join('、') || '无'}`,
    `在场角色兜底召回：${diagnostics.在场角色兜底召回.join('、') || '无'}`,
    `关键词召回：${diagnostics.关键词召回.join('、') || '无'}`,
    `AI检索补充：${diagnostics.AI检索补充.join('、') || '无'}`,
    `关键词资料召回：${diagnostics.关键词资料召回.join('、') || '无'}`,
    `AI检索补充强资料：${diagnostics.AI检索补充强资料.join('、') || '无'}`,
    `AI检索补充弱资料：${diagnostics.AI检索补充弱资料.join('、') || '无'}`,
    `候选资料：${diagnostics.候选资料.join('、') || '无'}`,
    `AI候选资料：${diagnostics.AI候选资料.join('、') || '无'}`,
    `最终注入角色资料（已去重）：${diagnostics.角色相关资料.join('、') || '无'}`,
    `最终注入强资料：${diagnostics.强相关资料.join('、') || '无'}`,
    `最终注入弱资料：${diagnostics.弱相关资料.join('、') || '无'}`,
    `已注入资料：${diagnostics.已注入资料.join('、') || '无'}`,
    `角色故事层注入：${diagnostics.角色故事层注入?.join('；') || '无'}`,
    diagnostics.被门禁过滤.length
      ? `门禁过滤：${diagnostics.被门禁过滤.map((item) => `${item.标题}（${item.原因}）`).join('；')}`
      : '门禁过滤：无',
    diagnostics.检查项.length ? `检查项：${diagnostics.检查项.join('；')}` : '',
  ].filter(Boolean).join('\n');
}

function getZhikuEntryKind(title: string): string {
  if (/【人物】|角色|人物/.test(title)) return '角色';
  if (/【地点】|地点|空间站|列车|贝洛伯格|罗浮|仙舟|匹诺康尼|雅利洛/.test(title)) return '地点';
  if (/【组织】|阵营|组织|公司|列车组|天才俱乐部/.test(title)) return '组织';
  if (/【物品】|道具|奇物|星核|光锥/.test(title)) return '物品';
  if (/【敌人】|敌人|军团|裂界|怪物/.test(title)) return '敌人';
  return '资料';
}

function cleanRecallTitle(title: string): string {
  return String(title || '')
    .replace(/^【[^】]+】/, '')
    .split(/[｜|：:]/)[0]
    .replace(/\s+/g, '')
    .trim();
}

function formatZhikuRecallSummary(diagnostics?: 智库召回诊断): string {
  if (!diagnostics) return '智库召回：无';
  const formatList = (titles: string[]) => {
    const items = titles
      .map((title) => {
        const name = cleanRecallTitle(title);
        return name ? `${getZhikuEntryKind(title)}${name}` : '';
      })
      .filter(Boolean);
    return items.length ? items.join('，') : '无';
  };
  return [
    `在场角色兜底召回：${formatList(diagnostics.在场角色兜底召回)}`,
    `关键词召回：${formatList(diagnostics.关键词召回)}`,
    `AI检索补充：${formatList(diagnostics.AI检索补充)}`,
    `关键词资料召回：${formatList(diagnostics.关键词资料召回)}`,
    `AI检索补充强资料：${formatList(diagnostics.AI检索补充强资料)}`,
    `AI检索补充弱资料：${formatList(diagnostics.AI检索补充弱资料)}`,
  ].join('\n');
}

function formatYitingRecallSummary(previewText?: string): string {
  const text = String(previewText || '').trim();
  if (!text) return '记忆召回：无';
  const names = Array.from(
    new Set(
      text
        .split(/[|\n，,]/)
        .map((item) => item.replace(/^强回忆[:：]/, '').replace(/^弱回忆[:：]/, '').trim())
        .filter((item) => item && item !== '无'),
    ),
  );
  return `记忆召回：${names.length ? names.join('，') : '无'}`;
}

type ApiTokenUsage = Awaited<ReturnType<typeof sendChatMessage>>['usage'];

function buildTurnTokenUsage(input: {
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

type CacheDiagnosticsMessage = {
  role: 聊天消息['role'];
  content: string;
};

type CacheDiagnosticsSection = {
  label: string;
  text: string;
  start: number;
  end: number;
};

function splitSystemPromptForCacheDiagnostics(systemPrompt: string): Array<{ label: string; text: string }> {
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

function buildCacheDiagnosticsSections(systemPrompt: string, messages: CacheDiagnosticsMessage[]): CacheDiagnosticsSection[] {
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

function serializeCacheDiagnosticsSections(sections: CacheDiagnosticsSection[]): string {
  return sections.map((section) => section.text).join('\n\n');
}

function getCommonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left.charCodeAt(index) === right.charCodeAt(index)) index++;
  return index;
}

function findCacheDiagnosticsSection(sections: CacheDiagnosticsSection[], index: number): CacheDiagnosticsSection | undefined {
  return sections.find((section) => index >= section.start && index <= section.end)
    ?? sections.at(-1);
}

function excerptCacheDiagnosticsText(text: string, index: number): string {
  if (!text) return '（空）';
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 160);
  return text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260) || '（空）';
}

function buildCachePrefixDiagnostics(input: {
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

function buildNpcLedgerDebug(selection?: NPC账本选择结果): NonNullable<聊天消息['debugContext']>['npcLedgerInjection'] | undefined {
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

type NpcLedgerUpdateDebug = NonNullable<聊天消息['debugContext']>['npcLedgerUpdate'];

const NPC_LEDGER_FIELD_LABELS: Record<string, string> = {
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

function normalizeNpcDebugName(name: string): string {
  return name.trim() || '未知 NPC';
}

function extractNpcNameFromCommandKey(key: string): string {
  const matched = key.match(/^NPC\[id=([^\]]+)\]/);
  return matched?.[1]?.trim() || '';
}

function extractNpcFieldFromCommandKey(key: string): string {
  const matched = key.match(/^NPC\[[^\]]+\]\.([^.[\]]+)/);
  return matched?.[1]?.trim() || '';
}

function pushUniqueText(list: string[], text: string) {
  const normalized = text.trim();
  if (!normalized || list.includes(normalized)) return;
  list.push(normalized);
}

function buildNpcLedgerUpdateDebug(input: {
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

function attachNpcLedgerUpdateDebug(
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

function formatNpcLedgerPreview(selection?: NPC账本选择结果): string {
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
const COT_FAKE_HISTORY_USER = '开始任务';
const COT_FAKE_HISTORY_ASSISTANT = `<thinking>
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

function isDeepSeekMainConfig(config: { provider?: string; baseUrl?: string; model?: string }): boolean {
  const provider = String(config.provider ?? '').toLowerCase();
  const baseUrl = String(config.baseUrl ?? '').toLowerCase();
  const model = String(config.model ?? '').toLowerCase();
  return provider === 'deepseek' || baseUrl.includes('deepseek') || model.includes('deepseek');
}

function applyNsfwVariablePolicy(
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

function getNsfwBlockedCommandReason(command: 变量命令, npcs: NPC记录[]): string | null {
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

function pushQueueTask(
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

function splitStreamingReveal(text: string): string[] {
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

function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

function waitStreamingPreviewDelay(ms: number, signal?: AbortSignal): Promise<void> {
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

function buildRecentTurnWindowForNews(history: 聊天消息[], currentUserInput: string, currentBody: string, interval: number): string[] {
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

async function revealStreamingPreview(
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

function mergeYitingSystems(
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
  state: RuntimeDraftState;
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


function compactForRerollInstruction(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 900 ? `${cleaned.slice(0, 900)}...` : cleaned;
}

function resolveNarrativeImageTokenizerConfig(state: RuntimeDraftState): API配置项 | null {
  return buildImagePromptTokenizerConfig(state.gameSettings);
}

function resolveNarrativeImageGenerationApi(state: RuntimeDraftState): 文生图API配置 | null {
  const imageSettings = state.gameSettings.文生图系统;
  return imageSettings.普通接口.enabled ? imageSettings.普通接口 : null;
}

function archiveNarrativeSnapshotToAlbum(
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

async function generateNarrativeImagesForMessage(params: {
  state: RuntimeDraftState;
  messageId: string;
  body: string;
  tokenizerConfig: API配置项;
  imageApiConfig: 文生图API配置;
  turn: number;
  signal?: AbortSignal;
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
    const playerAppearanceMode = state.gameSettings.文生图系统?.正文生图?.playerAppearanceMode ?? 'auto';
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
      state.gameSettings.文生图系统.rules,
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
  messageId: string,
): Promise<void> {
  const message = state.chatHistory.find((item) => item.id === messageId);
  if (!message || message.role !== 'assistant') throw new Error('未找到需要重新生成插图的正文消息');
  const body = message.parsedResponse?.body?.trim() || message.content.trim();
  if (!body) throw new Error('正文为空，无法重新生成插图');
  const narrative = state.gameSettings.文生图系统?.正文生图;
  if (!narrative?.enabled) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '正文生图未启用，无法重新生成故事快照。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    throw new Error('正文生图未启用');
  }
  const tokenizerConfig = resolveNarrativeImageTokenizerConfig(state);
  if (!tokenizerConfig) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '正文生图词组转化器未配置，无法解析故事快照提示词。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    throw new Error('正文生图词组转化器未启用');
  }
  const imageApiConfig = resolveNarrativeImageGenerationApi(state);
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
    await regenerateNarrativeImagesForMessage(state, targetMessageId);
    return;
  }

  if (task.id === 'news') {
    await retryNewsQueueTask(state, task, mode);
    return;
  }

  if (task.id === 'variable') {
    await retryVariableQueueTask(state, task, mode);
    return;
  }
  throw new Error(`队列任务不支持重试：${task.id}`);
}

async function retryNewsQueueTask(
  state: RuntimeDraftState,
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
  const newsSettings = state.gameSettings.新闻系统;
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

async function retryVariableQueueTask(
  state: RuntimeDraftState,
  task: 队列任务记录,
  mode: 'retry' | 'reroll',
): Promise<void> {
  if (!state.gameSettings.enableVariableUpdate) {
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

function findPreviousUserInput(history: 聊天消息[], assistantId: string): string {
  const assistantIndex = history.findIndex((item) => item.id === assistantId);
  if (assistantIndex < 0) return '';
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role === 'user') return item.content;
  }
  return '';
}

function findRetryableVariableBatch(batches: 变量命令批次[], targetBatchId?: string): 变量命令批次 | undefined {
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

function normalizeRerollCompareText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/[【】「」『』“”"'‘’（）()\[\]{}<>《》,，.。!！?？:：;；、\s]/g, '')
    .toLowerCase()
    .slice(0, 6000);
}

function calculateRerollSimilarity(nextText: string, previousText: string): number {
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

function buildRerollGenerationGuard(nonce: string, previousResponse: string): string {
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

function buildRerollSimilarityRetryGuard(previousResponse: string, similarity: number): string {
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

export async function executeSendWorkflow(
  userInput: string,
  deps: SendWorkflowDeps,
): Promise<void> {
  const { state } = deps;
  const rawConfig = deps.getActiveConfig();
  if (!rawConfig) {
    alert('请先在设置中配置API');
    deps.onWorkflowSettled?.({
      ok: false,
      cancelled: false,
      error: new Error('请先在设置中配置API'),
    });
    return;
  }
  const config = rawConfig;
  const mainStoryConfig = config;
  const isOpeningSystemTrigger = state.turnCount === 1 && userInput.startsWith('[系统]');
  const openingInstruction =
    '请根据当前角色、当前场景、世界书与内置提示词，直接生成第 0 回合开场叙事。不要等待玩家再次输入。';

  // 「踏入命途狭间」触发:玩家点击邀请卡片 → App 调 handleSend('[系统] 踏入命途狭间')。
  // 在快照/作用域/systemPrompt 计算之前先把 世界.待触发狭间 转成 世界.进行中狭间——
  // 否则 currentScope 拿不到 pathAwakening,系统提示词不会切到狭间问答模块,AI 出不了题。
  const isAwakeningEnterTrigger = userInput === '[系统] 踏入命途狭间';
  let effectiveWorld: typeof state.世界 = state.世界;
  if (isAwakeningEnterTrigger && state.世界.待触发狭间) {
    effectiveWorld = 踏入命途狭间(state.世界);
    state.set世界(effectiveWorld);
  }
  const awakeningPathId = isAwakeningEnterTrigger ? effectiveWorld.进行中狭间 : undefined;
  const awakeningInstruction = awakeningPathId
    ? `玩家选择踏入「命途狭间」(命途 ID: ${awakeningPathId})。请按 pathAwakening 流程生成第一道诘问,不要推进主剧情,不要等玩家再次发言。`
    : '';

  // Abort previous request
  state.abortControllerRef.current?.abort();
  const abortController = new AbortController();
  state.abortControllerRef.current = abortController;
  const isCurrentWorkflow = () => state.abortControllerRef.current === abortController;
  const assertWorkflowActive = () => {
    if (abortController.signal.aborted || !isCurrentWorkflow()) {
      throw new DOMException('Workflow aborted', 'AbortError');
    }
  };

  deps.onBeforeSend();
  state.setLoading(true);
  deps.onStreamProgress?.('');
  state.setWorkflowHint('忆庭召回 / 智库检索中');
  state.setWorkflowStatus('searching');
  state.setLiveRecallSummary('智库召回：检索中\n记忆召回：检索中');
  state.setLiveRecallFullContent('');
  pushQueueTask(state, 'main_story', 'pending', { detail: '正在调用主剧情模型。', cancellable: true });
  let pendingVariableStarted = false;
  let keepWorkflowHint = false;
  /** Actual hard-failure attempts for final failed queue task (not settings autoRetryCount). */
  let hardFailCount = 0;
  let rollbackHistoryOnAbort = state.chatHistory;
  let rollbackSnapshotOnAbort: 回合快照 | null = null;
  let visibilityPublisher: VisibilityBufferedPublisher | null = null;
  // Declared outside the stream setup so finally can always cancel a pending rAF commit.
  // Progress reaches UI only via onStreamProgress → TurnEngine progress frames → projection.
  const streamMessageSetter = createRafCoalescedSetter((text: string) => {
    deps.onStreamProgress?.(text);
  });
  /** Phase-1: ensure onWorkflowSettled fires exactly once per run. */
  let settlementReported = false;
  const reportSettlement = (result: SendWorkflowSettlement) => {
    if (settlementReported) return;
    settlementReported = true;
    deps.onWorkflowSettled?.(result);
  };
  /** Captured at the legacy formal-commit boundary for the committed projection. */
  let committedProjection: Extract<SendWorkflowSettlement, { ok: true }> | null = null;

  const startTime = Date.now();

  try {
    // 0. 本回合 user 发送之前的全状态快照，留给 reroll 回滚用。
    //    避免重 roll 时上次的变量副作用堆叠（NPC / 新闻等都会双份）。
    const preTurnSnapshot = compactPreTurnSnapshot({
      旅人: state.旅人,
      世界: effectiveWorld,
      记忆: state.记忆,
      忆庭: state.忆庭,
      智库: state.智库,
      手机: state.手机,
      NPC: state.NPC,
      相册: state.相册,
      新闻: state.新闻,
      剧情: state.剧情,
      剧情编织: state.剧情编织,
      variableBatches: state.variableBatches,
      queueTasks: state.queueTasks,
      turnCount: state.turnCount,
      pendingOpeningTrigger: state.pendingOpeningTrigger,
    });
    rollbackSnapshotOnAbort = preTurnSnapshot;

    // 1. Add user message。同时把过往 assistant 上的 snapshot 全部清掉，只保留即将生成的最新一条，
    //    避免存档无限膨胀（snapshot 只服务"最近一次 reroll"，老的没用）。
    //    同时把 preTurnSnapshot 也挂到 user 消息上，这样主剧情生成失败（没有 assistant 消息）时，
    //    重roll 仍能找到快照回滚，不会误回退到上一回合。
    const userMsg = 创建聊天消息('user', userInput, {
      gameTime: `${state.turnCount}`,
      preTurnSnapshot,
    });
    const purgedHistory = state.chatHistory.map((m) =>
      m.role === 'assistant' && m.preTurnSnapshot
        ? { ...m, preTurnSnapshot: undefined }
        : m,
    );
    rollbackHistoryOnAbort = purgedHistory;
    const updatedHistory = [...purgedHistory, userMsg];
    state.setChatHistory(updatedHistory);

    // 2. Build system prompt
    // currentScope 优先级:进行中狭间 > 开局/主流程。狭间专用 scope 让世界书 + 提示词模块同步切换。
    // 用 effectiveWorld(踏入触发已经把 进行中狭间 写入),否则 React 异步 setState 会让本帧还是旧 scope。
    const currentScope: 'opening' | 'main' | 'pathAwakening' = effectiveWorld.进行中狭间
      ? 'pathAwakening'
      : state.turnCount === 1
        ? 'opening'
        : 'main';
    // 命途狭间阶段:出题 vs 评判。
    //   - 玩家本回合刚点踏入 → 出题回合,AI 应该出 3 题
    //   - 进行中狭间 != null 且 不是踏入触发 → 评判回合,AI 必须落 <狭间评判> 标签
    //   - 不在狭间流程里 → undefined
    const awakeningPhase: 'question' | 'judgement' | undefined = effectiveWorld.进行中狭间
      ? (isAwakeningEnterTrigger ? 'question' : 'judgement')
      : undefined;
    const openingArchiveText = 格式化开局档案上下文(effectiveWorld.开局档案);
    const worldbookCtx = {
      recentUserInput: userInput,
      recentAIResponse: '',
      worldName: effectiveWorld.当前时段?.名称 ?? '',
      travelerName: state.旅人.姓名,
      turnCount: state.turnCount,
      startScenarioId: effectiveWorld.起航之地ID,
      startSceneName: effectiveWorld.开局档案?.章节锚点名称 ?? effectiveWorld.当前地点,
      currentLocation: effectiveWorld.当前地点,
      openingRegionName: effectiveWorld.开局档案?.地区名称,
      openingChapterName: effectiveWorld.开局档案?.章节锚点名称,
      openingEntryText: effectiveWorld.开局档案?.玩家介入原文,
      openingSource: effectiveWorld.开局档案?.来源,
      openingArchiveText,
      npcNames: getZhikuNpcNamesForTurn({
        world: effectiveWorld,
        npcs: state.NPC,
        history: updatedHistory,
        userInput,
        turnCount: state.turnCount,
      }),
      originalProtagonist: effectiveWorld.原著主角,
      currentScope,
      // 当前剧情模式，用于按 storyModeGate 过滤主线世界书（4 选 1）
      storyMode: effectiveWorld.剧情模式,
      // Phase 7.1：世界书扫描扩展（消息历史 + 触发状态）
      recentMessages: updatedHistory
        .map((m) => (typeof m.content === 'string' ? m.content : ''))
        .filter(Boolean)
        .slice(-100),
      messageCount: state.turnCount,
      worldbookTriggerStates: state.gameSettings.worldbookTriggerStates,
    };
    const anticipatedZhikuNpcNames = getAnticipatedNpcNamesForTurn({
      world: effectiveWorld,
      history: updatedHistory,
      userInput,
    });
    const immediateStoryReviewForZhiku = !isOpeningSystemTrigger ? buildImmediateStoryReview(updatedHistory) : '';
    const zhikuSceneContext = {
      ...worldbookCtx,
      startScenarioId: undefined,
      startSceneName: undefined,
      currentLocation: undefined,
      npcNames: [],
      presentNpcNamesForFallback: worldbookCtx.npcNames,
      anticipatedNpcNames: anticipatedZhikuNpcNames,
      aiSupplementHints: {
        currentLocation: effectiveWorld.当前地点,
        presentNpcNames: worldbookCtx.npcNames,
        immediateStoryReview: immediateStoryReviewForZhiku,
        openingArchiveText,
      },
    };
    const recallQuery = buildMainRecallQuery({
      userInput,
      history: updatedHistory,
      currentLocation: effectiveWorld.当前地点,
      npcNames: worldbookCtx.npcNames,
    });
    const zhikuRecallQuery = buildZhikuKeywordRecallQuery({
      userInput,
      history: updatedHistory,
    });
    let newsForPrompt = state.新闻;
    let openingNewsForSave: 新闻条目[] | null = null;
    let openingNewsPreprocessed = false;
    if (isOpeningSystemTrigger && state.gameSettings.新闻系统?.enabled && state.gameSettings.新闻系统?.autoGenerate) {
      pushQueueTask(state, 'news', 'pending', {
        detail: '开局前正在先处理一次星际和平周报，用作首回合世界背景。',
        cancellable: true,
      });
      const openingProtagonist = formatOriginalProtagonistForOpening(effectiveWorld.原著主角);
        const openingArchive = effectiveWorld.开局档案;
        const openingPressure = openingArchive?.整理档案?.特别要求?.length
          ? openingArchive.整理档案.特别要求.join('；')
          : openingArchive?.章节参考说明 || effectiveWorld.当前地点 || '当前开局地区';
        const openingNewsBody = [
          `开局初始化：当前开局为${openingArchive?.地区名称 ?? effectiveWorld.当前地点 ?? '未知地区'}「${openingArchive?.章节锚点名称 ?? effectiveWorld.起航之地ID ?? '未命名章节'}」。`,
          `章节参考：${openingArchive?.章节参考说明 ?? '按当前开局档案和世界状态生成首回合世界事件苗头。'}`,
          `开局压力：${openingPressure}`,
          openingArchive?.玩家介入原文 ? `玩家介入：${openingArchive.玩家介入原文}` : '',
          `原著主角配置：${openingProtagonist}`,
        ].filter(Boolean).join('\n');
      const preNews = await runNewsGenerationStep({
          state,
          mainBody: openingNewsBody,
          userInput,
          recentTurns: [`- 系统：开局初始化\n  正文：${openingArchive?.地区名称 ?? effectiveWorld.当前地点 ?? '当前地区'}「${openingArchive?.章节锚点名称 ?? '当前开局'}」即将开始，新闻系统先生成可供首回合参考的世界事件苗头。`],
          signal: abortController.signal,
          shouldCommit: isCurrentWorkflow,
      });
      if (!preNews) throw new Error('Opening news generation was enabled but did not execute');
      assertWorkflowActive();
      openingNewsPreprocessed = true;
      newsForPrompt = preNews.news;
      openingNewsForSave = preNews.news;
      pushQueueTask(state, 'news', 'success', {
        detail: preNews.changed
          ? `开局新闻预处理完成，当前 ${preNews.news.length} 条新闻记录。`
          : '开局新闻预处理完成，但本轮没有可写新闻变化。',
      });
    }
    const yitingEnabled = state.gameSettings.记忆系统?.忆庭启用 !== false;
    const yitingRecallEnabled = yitingEnabled && !isOpeningSystemTrigger && (state.gameSettings.记忆系统?.忆庭召回最早触发回合 ?? 10) < state.turnCount;
    const zhikuRecallEnabled = !isOpeningSystemTrigger && !!(state.gameSettings.智库系统?.enabled && state.智库 && worldbookCtx.recentUserInput);
    const storyWeavingGate = state.gameSettings.剧情编织系统?.enabled && state.gameSettings.剧情编织系统.currentWindow
      ? evaluateStoryWeavingGate(state.剧情编织, worldbookCtx)
      : null;
    const storyWeavingDiagnostics = state.gameSettings.剧情编织系统?.enabled && state.gameSettings.剧情编织系统.currentWindow
      ? getStoryWeavingInjectionDiagnostics(state.剧情编织)
      : null;
    if (yitingRecallEnabled) {
      pushQueueTask(state, 'yiting', 'pending', {
        detail: '正在检索回忆档案。',
        cancellable: true,
      });
    }
    const [yitingPreview, zhikuPreview] = await Promise.all([
      yitingRecallEnabled && state.忆庭 && recallQuery
        ? retrieveYitingContextWithModel(
            state.忆庭,
            recallQuery,
            state.gameSettings.记忆系统?.忆庭召回条数 ?? 8,
            state.gameSettings.记忆系统 ?? 创建默认记忆系统设置(),
            abortController.signal,
            state.gameSettings.记忆系统?.忆庭召回API.retryCount ?? 2,
            state.gameSettings.promptModules,
          )
        : Promise.resolve(null),
      zhikuRecallEnabled
        ? retrieveZhikuContextWithModel(
            state.智库,
            zhikuRecallQuery,
            state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries,
            state.gameSettings.智库系统 ?? 创建默认智库系统设置(),
            abortController.signal,
            state.gameSettings.智库系统?.api.retryCount ?? 2,
            zhikuSceneContext,
            state.gameSettings.promptModules,
          )
        : Promise.resolve(null),
    ]);
    assertWorkflowActive();
    const recallSummaryForTurn = [
      formatZhikuRecallSummary(zhikuPreview?.diagnostics),
      formatYitingRecallSummary(yitingPreview?.previewText),
    ].join('\n');
    const recallFullContentForTurn = [
      zhikuPreview?.injection ? ['【智库完整召回】', zhikuPreview.injection].join('\n') : '',
      yitingPreview?.injection ? ['【记忆完整召回】', yitingPreview.injection].join('\n') : '',
    ].filter(Boolean).join('\n\n');
    state.setLiveRecallSummary(recallSummaryForTurn);
    state.setLiveRecallFullContent(recallFullContentForTurn);
    const memoryHint = isOpeningSystemTrigger
      ? '开局专用上下文已注入：角色 / 场景 / 切入说明 / 开局世界书 / 开局 CoT'
      : yitingPreview?.injection
      ? `剧情回忆已命中，已暂停普通短中长期记忆注入：强 ${yitingPreview.strongEntries?.length ?? 0} 条 / 弱 ${yitingPreview.weakEntries?.length ?? 0} 条`
      : state.gameSettings.enableMemoryInjection
      ? `记忆上下文已注入：短期 ${state.记忆.短期记忆.length} 条 / 中期 ${(state.记忆.中期记忆 ?? []).length} 条 / 长期 ${state.记忆.长期记忆.length} 条；即时缓存 ${state.记忆.即时记忆.length} 条仅用于后续压缩`
      : '记忆注入未启用';
    const yitingHint = !yitingEnabled
      ? '忆庭召回已关闭'
      : yitingPreview?.entries.length
      ? `剧情回忆已召回：强 ${yitingPreview.strongEntries?.length ?? 0} 条 / 弱 ${yitingPreview.weakEntries?.length ?? 0} 条`
      : yitingRecallEnabled
        ? `忆庭已召回：${state.忆庭?.回忆档案?.length ? '无相关档案' : '当前还没有可召回档案'}`
        : `忆庭已召回：未到第${(state.gameSettings.记忆系统?.忆庭召回最早触发回合 ?? 10) + 1}回合`;
    const zhikuHint = state.gameSettings.智库系统?.enabled
      ? `智库内容已注入：${
          zhikuPreview?.entries.length
            ? zhikuPreview.entries.slice(0, 2).map((entry) => entry.标题).join('、')
            : '无相关条目'
        }`
      : '智库未启用';
    state.setWorkflowHint(isOpeningSystemTrigger ? memoryHint : `${memoryHint} · ${yitingHint} · ${zhikuHint}`);
    state.setWorkflowStatus('done');
    const immediateStoryReview = !isOpeningSystemTrigger ? buildImmediateStoryReview(updatedHistory) : '';
    const storyRecallInjection = [
      immediateStoryReview
        ? ['# 即时剧情回顾', '', '【即时剧情回顾】', immediateStoryReview].join('\n')
        : '',
      yitingPreview?.injection ?? '',
    ].filter((item) => item.trim()).join('\n\n');
    const npcLedgerSelection = !isOpeningSystemTrigger
      ? selectNpcLedgersForTurn({
          records: state.NPC,
          turnCount: state.turnCount,
          explicitNames: worldbookCtx.npcNames,
          sceneNames: effectiveWorld.当前时段?.人物?.map((npc) => npc.姓名),
          recalledNames: worldbookCtx.npcNames,
        })
      : undefined;
    const currentTriggerType = deps.rerollContext
      ? 'swipe'
      : isOpeningSystemTrigger
        ? 'opening'
        : 'normal';

    // ST 预设兼容：宏引擎上下文。
    // local 每回合重置；global 从 settings 读取副本（避免直接 mutate state）。
    // 处理完后若 global 变化，回写到 settings.macroGlobalVars 实现跨会话持久化。
    const prevGlobalSnapshot = state.gameSettings.macroGlobalVars ?? {};
    // 组装游戏状态快照供 ST 标准宏使用（{{char}}/{{user}}/{{lastMessage}} 等）
    const lastMsg = updatedHistory[updatedHistory.length - 1];
    const lastUserMsg = [...updatedHistory].reverse().find((m) => m.role === 'user');
    const lastAssistantMsg = [...updatedHistory].reverse().find((m) => m.role === 'assistant');
    const macroGameState: MacroGameState = {
      charName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
      userName: state.旅人.姓名 || '开拓者',
      lastMessage: lastMsg?.content ?? '',
      lastUserMessage: lastUserMsg?.content ?? '',
      lastCharMessage: lastAssistantMsg?.content ?? '',
      messageCount: updatedHistory.length,
      turnCount: state.turnCount,
      modelName: mainStoryConfig.model,
      maxContext: mainStoryConfig.maxContext,
    };
    const macroCtx: MacroContext = createMacroContext(prevGlobalSnapshot, macroGameState);

    const builtPrompt = isOpeningSystemTrigger
      ? buildOpeningSystemPrompt(
          state.旅人,
          effectiveWorld,
          state.gameSettings,
          state.turnCount,
          state.worldbooks,
          worldbookCtx,
          newsForPrompt,
          currentTriggerType,
          macroCtx,
        )
      : buildSystemPrompt(
          state.旅人,
          effectiveWorld,
          state.记忆,
          state.gameSettings,
          state.turnCount,
          state.worldbooks,
          worldbookCtx,
          state.NPC,
          state.新闻,
          state.剧情,
          state.剧情编织,
          state.智库,
          state.忆庭,
          state.手机,
          awakeningPhase,
          storyRecallInjection || (yitingRecallEnabled ? '' : undefined),
          // Only `not-run` delegates to the prompt builder's keyword fallback.
          // A completed `no-match` is an explicit empty override, not a hidden retry path.
          zhikuRecallEnabled
            ? zhikuPreview?.status === 'injection'
              ? zhikuPreview.injection
              : zhikuPreview?.status === 'no-match'
                ? ''
                : undefined
            : undefined,
          Boolean(yitingPreview?.injection),
          npcLedgerSelection,
          currentTriggerType,
          macroCtx,
        );

    // 宏引擎处理后回写 globalVars（仅当 global 变化时）
    if (Object.keys(macroCtx.global).length !== Object.keys(prevGlobalSnapshot).length
      || Object.entries(macroCtx.global).some(([k, v]) => prevGlobalSnapshot[k] !== v)) {
      state.setGameSettings((prev) => ({ ...prev, macroGlobalVars: { ...macroCtx.global } }));
    }

    // Phase 7.1：本回合世界书注入完成后，回写触发状态表（用于 delay / cooldown 判断）。
    // 必须在 buildSystemPrompt 之后调用，保证本回合 cooldown 检查用的是上一回合的状态。
    const nextTriggerStates = updateTriggerStatesAfterTurn(state.worldbooks, worldbookCtx);
    if (nextTriggerStates !== state.gameSettings.worldbookTriggerStates) {
      state.setGameSettings((prev) => ({ ...prev, worldbookTriggerStates: nextTriggerStates }));
    }
    let systemPrompt = builtPrompt.systemPrompt;
    // 天气判断 prompt 注入
    const 天气片断 = 构建天气Prompt片段(effectiveWorld.当前地点, effectiveWorld.当前天气);
    systemPrompt = systemPrompt + '\n\n' + 天气片断;
    // Phase 4: In-Chat depth 注入。非 system 角色的模块消息按 depth 插入聊天历史。
    const moduleChatMessages = builtPrompt.chatModuleMessages;
    const currentPresetV2 = getCurrentSTPresetV2(state.gameSettings, getBuiltinPresetsV2());
    const tavernV2Enabled = Boolean(currentPresetV2);
    let tavernV2Messages: 聊天消息[] | null = null;
    const recentHistory = getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆);
    if (deps.rerollContext && !isOpeningSystemTrigger) {
      systemPrompt = [
        systemPrompt,
        '',
        '# 重roll生成约束',
        `本次请求是玩家对上一版回复的重roll。重roll nonce: ${deps.rerollContext.nonce}`,
        '必须基于同一事实起点重新组织镜头、描写、对话和节奏；禁止复用上一版回复的具体段落、句式、变量草稿或行动选项。',
        '开场方式、对白切入、段落顺序和结尾钩子都要换；不要复用上一版前三句、连续短语或相同收束。',
        '可以保留必要事实一致性，但正文展开方式必须明显不同；如果上一版已经处理某事件，本次不得因为重roll而把旧副作用当作已发生事实。',
        deps.rerollContext.previousResponse
          ? `上一版回复摘录（仅用于避重复，不是当前事实）：${compactForRerollInstruction(deps.rerollContext.previousResponse)}`
          : '',
      ].filter(Boolean).join('\n');
    }

    if (currentPresetV2) {
      if (!currentPresetV2.preset.prompts?.length) throw new Error('ST V2 preset has no prompts');
      if (!currentPresetV2.preset.prompt_order?.length) throw new Error('ST V2 preset has no prompt order');
      const latestTavernInput = isOpeningSystemTrigger
        ? openingInstruction
        : isAwakeningEnterTrigger
          ? awakeningInstruction
          : userInput;
      tavernV2Messages = buildTavernMessageChain({
        preset: currentPresetV2.preset,
        characterId: state.gameSettings.currentStCharacterId ?? null,
        chatHistory: recentHistory,
        latestUserInput: latestTavernInput,
        playerName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
        playerRole: state.旅人,
        macroCtx,
      }).map((msg) => 创建聊天消息(msg.role, msg.content));
      if (tavernV2Messages.length === 0) throw new Error('ST V2 消息链为空');
    }

    // 3. Prepare messages for API
    const apiMessages: 聊天消息[] = [];
    if (tavernV2Messages) {
      apiMessages.push(...tavernV2Messages);
    } else {
      for (const msg of recentHistory) {
        // 跳过 [系统] 触发消息，避免污染 AI 上下文
        if (msg.role === 'user' && msg.content.startsWith('[系统]')) {
          continue;
        }
        if (msg.role === 'user') {
          apiMessages.push(msg);
        } else if (msg.role === 'assistant' && msg.parsedResponse) {
          apiMessages.push(创建聊天消息('assistant', buildLeanAssistantHistoryContent(msg)));
        }
      }
      if (isOpeningSystemTrigger) {
        apiMessages.push(创建聊天消息('user', openingInstruction));
      }
      // [系统] 触发被 API 过滤 → 必须额外推一条真实指令,否则 AI 收到空白消息直接卡住。
      if (isAwakeningEnterTrigger && awakeningInstruction) {
        apiMessages.push(创建聊天消息('user', awakeningInstruction));
      }
    }
    // 评判回合:再追加一条系统级提醒,强化「必输 <狭间评判> 标签」的指令优先级。
    // 实践中,AI 若只在 system prompt 里看到此规则,容易在长正文里漏掉标签;把它升到 user 末尾会显著提高遵循率。
    if (awakeningPhase === 'judgement') {
      apiMessages.push(
        创建聊天消息(
          'user',
          '⚠ 命途狭间·回应回合提醒:你上一回合已出三题,玩家本轮给出了答案。本回合**必须**在所有标签之外、**单独**写一行 `<狭间评判>升阶</狭间评判>`。命途狭间没有失败、滞留或退转;三问只是让玩家明确自己的道路。漏掉这个标签会让玩家永远卡在虚境无法升阶——这是必须避免的错误。同时正文里要让命途意志回应玩家答案、确认其道路,再把旅人从虚境拉回现实场景。',
        ),
      );
    }

    const deepSeekMainMode = state.gameSettings.deepSeekMainMode ?? 'off';
    const deepSeekMainActive = isDeepSeekMainConfig(mainStoryConfig) && deepSeekMainMode !== 'off';
    const deepSeekLockFormat = deepSeekMainActive && deepSeekMainMode === 'lock_format';
    const shouldUseCotFakeHistory =
      state.gameSettings.enableCotFakeHistory && !isOpeningSystemTrigger && !deepSeekMainActive;

    const effectivePrefixMode = deepSeekLockFormat;
    const effectivePrefixContent = deepSeekLockFormat ? '<thinking>\n' : undefined;

    if (deepSeekMainActive) {
      apiMessages.push(创建聊天消息('user', DEEPSEEK_MAIN_FORMAT_GUARD));
    }
    if (deps.rerollContext && !isOpeningSystemTrigger) {
      apiMessages.push(创建聊天消息(
        'user',
        buildRerollGenerationGuard(deps.rerollContext.nonce, deps.rerollContext.previousResponse),
      ));
    }

    // 3b. CoT 伪装历史注入：在消息序列最前面塞一对 user/assistant，强化思考段输出习惯。
    //     DeepSeek 专用模式下不注入这段伪装续聊，避免污染真实 user 输入并降低格式漂移。
    if (shouldUseCotFakeHistory) {
      apiMessages.unshift(
        创建聊天消息('user', COT_FAKE_HISTORY_USER),
        创建聊天消息('assistant', COT_FAKE_HISTORY_ASSISTANT),
      );
    }

    // 3c. ST 预设 In-Chat depth 注入。
    //     injectionPosition=1 的模块按 injectionDepth 插入聊天历史。
    //     depth=0 末尾后，depth=1 末尾前，依此类推。
    if (!tavernV2Messages && moduleChatMessages.length > 0) {
      const unsupportedMessages = moduleChatMessages.filter((message) => message._injectionPosition !== 1);
      if (unsupportedMessages.length) {
        throw new Error('user/assistant 提示词模块只支持 In-Chat depth 注入');
      }
      const depthMessages = [...moduleChatMessages]
        .sort((a, b) => (b._injectionDepth ?? 0) - (a._injectionDepth ?? 0));
      for (const msg of depthMessages) {
        const depth = msg._injectionDepth ?? 0;
        const insertIndex = Math.max(0, apiMessages.length - depth);
        apiMessages.splice(insertIndex, 0, 创建聊天消息(msg.role as 'user' | 'assistant', msg.content));
      }
    }

    const shouldStreamMainRequest = state.gameSettings.enableStreaming && !isPageHidden();
    const mainRequestMode: 'stream' | 'non-stream' = shouldStreamMainRequest ? 'stream' : 'non-stream';

    // 4. Stream AI response（含自动重试循环）
    let streamedText = '';
    let streamEventCount = 0;
    let previewText = '';
    let previewEpoch = 0;
    let previewAttempt = 0;
    let previewChain: Promise<void> = Promise.resolve();
    let result: Awaited<ReturnType<typeof sendChatMessage>> | null = null;
    const configuredMaxAttempts = state.gameSettings.autoRetryOnError
      ? Math.max(1, state.gameSettings.autoRetryCount) + 1
      : 1;
    const maxAttempts = (deepSeekMainActive || deps.rerollContext) ? Math.max(2, configuredMaxAttempts) : configuredMaxAttempts;
    let lastErr: unknown = null;
    let deepSeekProtocolIssuesForTurn: string[] = [];
    let softProtocolIssuesForTurn: string[] = [];
    let rerollSimilarityForTurn: number | undefined;
    let rerollSimilarityRetried = false;
    let retryInstruction: 聊天消息 | null = null;
    let successfulRequestMessages: 聊天消息[] = apiMessages;
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt++;
      const currentPreviewAttempt = ++previewAttempt;
      streamedText = '';
      streamEventCount = 0;
      previewText = '';
      previewEpoch += 1;
      previewChain = Promise.resolve();
      visibilityPublisher?.dispose();
      visibilityPublisher = typeof document === 'undefined'
        ? null
        : createVisibilityBufferedPublisher({
            source: createDocumentVisibilitySource(document),
            commit: (text) => {
              if (currentPreviewAttempt !== previewAttempt || !isCurrentWorkflow()) return;
              previewEpoch += 1;
              previewText = text;
              streamMessageSetter.flush(text);
            },
          });
      streamMessageSetter.flush('');
      const attemptMessages = retryInstruction
        ? [...apiMessages, retryInstruction]
        : apiMessages;
      try {
        result = await sendChatMessage(mainStoryConfig, {
          messages: attemptMessages,
          systemPrompt,
          onDelta: (delta) => {
            if (currentPreviewAttempt !== previewAttempt || !isCurrentWorkflow()) return;
            streamedText += delta;
            if (!state.gameSettings.enableStreaming) {
              streamMessageSetter.set(streamedText);
              return;
            }
            if (visibilityPublisher?.bufferWhenHidden(streamedText)) {
              previewEpoch += 1;
              previewText = streamedText;
              return;
            }
            streamEventCount += 1;
            const deltaPreviewEpoch = previewEpoch;
            previewChain = previewChain.then(async () => {
              const chunks = splitStreamingReveal(delta);
              for (const chunk of chunks) {
                if (
                  abortController.signal.aborted
                  || currentPreviewAttempt !== previewAttempt
                  || deltaPreviewEpoch !== previewEpoch
                ) return;
                if (isPageHidden()) {
                  previewEpoch += 1;
                  previewText = streamedText;
                  visibilityPublisher?.bufferWhenHidden(streamedText);
                  return;
                }
                previewText += chunk;
                streamMessageSetter.set(previewText);
                await waitStreamingPreviewDelay(14, abortController.signal);
                if (isPageHidden()) {
                  previewEpoch += 1;
                  previewText = streamedText;
                  visibilityPublisher?.bufferWhenHidden(streamedText);
                  return;
                }
              }
            });
          },
          signal: abortController.signal,
          streaming: shouldStreamMainRequest,
          prefixMode: effectivePrefixMode,
          prefixContent: effectivePrefixContent,
          // Phase 3：透传 API 配置的采样参数（支持 ST 预设同步过来的高级参数）
          topP: mainStoryConfig.topP,
          topK: mainStoryConfig.topK,
          topA: mainStoryConfig.topA,
          minP: mainStoryConfig.minP,
          repetitionPenalty: mainStoryConfig.repetitionPenalty,
          frequencyPenalty: mainStoryConfig.frequencyPenalty,
          presencePenalty: mainStoryConfig.presencePenalty,
          maxContext: mainStoryConfig.maxContext,
        });
        if (tavernV2Messages && currentPresetV2) {
          const regexCleanup = applyTavernOutputRegexScripts(result.fullText || streamedText, currentPresetV2.preset);
          if (regexCleanup.applied.length > 0 && regexCleanup.text !== result.fullText) {
            result = {
              ...result,
              fullText: regexCleanup.text,
              parsed: parseResponse(regexCleanup.text),
            };
            streamedText = regexCleanup.text;
            console.info('[ST V2] 已执行安全输出正则清理:', regexCleanup.applied);
          }
        }
        const candidateText = result.parsed.body.trim();
        // 抗空回检测：完全空，或纯标签无正文（isEmptyResponse 判断所有协议字段都为空）
        const isBlankResponse = !candidateText || isEmptyResponse(result.parsed);
        if (isBlankResponse) {
          hardFailCount = attempt;
          void appendApiErrorReport({
            source: '主剧情工作流',
            config: mainStoryConfig,
            requestMode: mainRequestMode,
            error: new Error(`返回空响应，触发自动重试。主剧情第 ${attempt}/${maxAttempts} 次${isEmptyResponse(result.parsed) ? '（纯标签无正文）' : ''}。`),
            responseText: result.fullText || streamedText || '（空响应）',
          });
          if (attempt < maxAttempts) {
            pushQueueTask(state, 'main_story', 'pending', {
              detail: `主剧情输出为空，正在重试。`,
              failCount: hardFailCount,
              retrying: true,
              cancellable: true,
            });
            console.warn(`[sendWorkflow] 第 ${attempt} 次返回空响应${isEmptyResponse(result.parsed) ? '（纯标签无正文）' : ''}，自动重试。`);
            continue;
          }
          throw new Error('AI response was empty');
        }
        // 主剧情不再执行“截断续写”自动重试。
        // 兼容模型常省略闭合标签，误判后续写会把完整上文回填进历史并污染下一轮。
        // Missing protocol tags are rejected by the strict parser or protocol checks.
        const rerollSimilarity = deps.rerollContext
          ? calculateRerollSimilarity(candidateText, deps.rerollContext.previousResponse)
          : 0;
        if (deps.rerollContext) {
          rerollSimilarityForTurn = rerollSimilarity;
        }
        if (deps.rerollContext && rerollSimilarity >= 0.86 && attempt < maxAttempts) {
          rerollSimilarityRetried = true;
          void appendApiErrorReport({
            source: '重roll相似度校验',
            config: mainStoryConfig,
            requestMode: mainRequestMode,
            error: new Error(`主剧情第 ${attempt}/${maxAttempts} 次重roll结果与上一版过于相似，相似度 ${Math.round(rerollSimilarity * 100)}%。`),
            responseText: result.fullText || streamedText || candidateText,
          });
          retryInstruction = 创建聊天消息(
            'user',
            buildRerollSimilarityRetryGuard(deps.rerollContext.previousResponse, rerollSimilarity),
          );
          // Similarity rewrite consumes an attempt but is not a user-facing "failure".
          pushQueueTask(state, 'main_story', 'pending', {
            detail: '主剧情与上一版过于相似，正在换写',
            retrying: true,
            cancellable: true,
          });
          console.warn(`[sendWorkflow] 第 ${attempt}/${maxAttempts} 次重roll与上一版过于相似，自动换写，相似度：${rerollSimilarity.toFixed(3)}`);
          continue;
        }
        const rawForProtocol = result.fullText || streamedText;
        const hardProtocolIssues = getHardProtocolIssues(
          result.parsed,
          rawForProtocol,
          deepSeekMainActive,
        );
        const softProtocolIssues = getSoftProtocolIssues(result.parsed, rawForProtocol);
        if (hardProtocolIssues.length) {
          hardFailCount = attempt;
          const protocolIssues = getMainProtocolIssues(
            result.parsed,
            rawForProtocol,
            deepSeekMainActive,
          );
          if (deepSeekMainActive) deepSeekProtocolIssuesForTurn = protocolIssues;
          void appendApiErrorReport({
            source: '主剧情协议校验',
            config: mainStoryConfig,
            requestMode: mainRequestMode,
            error: new Error(`主剧情第 ${attempt}/${maxAttempts} 次输出协议不完整：${hardProtocolIssues.join('；')}`),
            responseText: rawForProtocol || '（空响应）',
          });
          if (attempt < maxAttempts) {
            retryInstruction = 创建聊天消息('user', buildProtocolRetryGuard(hardProtocolIssues));
            pushQueueTask(state, 'main_story', 'pending', {
              detail: `主剧情输出协议不完整，正在重试：${hardProtocolIssues.join('；')}`,
              failCount: hardFailCount,
              retrying: true,
              cancellable: true,
            });
            console.warn(`[sendWorkflow] 第 ${attempt}/${maxAttempts} 次硬协议不完整，自动重试：`, hardProtocolIssues);
            continue;
          }
          throw new Error(`AI response protocol is invalid: ${hardProtocolIssues.join('; ')}`);
        }
        // Soft-only gaps: accept the turn; settlement tolerates empty memory/world/variable draft.
        softProtocolIssuesForTurn = softProtocolIssues;
        if (deepSeekMainActive) {
          deepSeekProtocolIssuesForTurn = softProtocolIssues.length ? softProtocolIssues : [];
        }
        if (softProtocolIssues.length) {
          console.warn(
            `[sendWorkflow] 第 ${attempt}/${maxAttempts} 次协议软缺失，按正文提交：`,
            softProtocolIssues,
          );
        }
        successfulRequestMessages = attemptMessages;
        lastErr = null;
        break;
      } catch (innerErr) {
        if ((innerErr as Error).name === 'AbortError' || abortController.signal.aborted) {
          throw innerErr;
        }
        lastErr = innerErr;
        hardFailCount = attempt;
        const innerMessage = innerErr instanceof Error ? innerErr.message : String(innerErr ?? '');
        const alreadyReportedByApiLayer =
          innerMessage.includes('API Error') ||
          innerMessage.includes('Failed to fetch') ||
          innerMessage.includes('No response body');
        if (!alreadyReportedByApiLayer) {
          void appendApiErrorReport({
            source: '主剧情工作流',
          config: mainStoryConfig,
            requestMode: mainRequestMode,
            error: innerErr,
            responseText: streamedText || previewText || '',
          });
        }
        if (attempt >= maxAttempts) break;
        pushQueueTask(state, 'main_story', 'pending', {
          detail: `主剧情生成失败 ${hardFailCount} 次，正在自动重试。`,
          failCount: hardFailCount,
          retrying: true,
          cancellable: true,
        });
        console.warn(`[sendWorkflow] 第 ${attempt}/${maxAttempts} 次尝试失败，自动重试：`, innerErr);
      }
    }
    if (lastErr) throw lastErr;
    if (!result) throw new Error('Main story generation completed without a result');

    visibilityPublisher?.flush();

    if (abortController.signal.aborted || !isCurrentWorkflow()) return;

    // 5. Build AI message
    const duration = (Date.now() - startTime) / 1000;
    pushQueueTask(state, 'main_story', 'success', {
      detail: softProtocolIssuesForTurn.length
        ? `正文生成完成，用时 ${Math.round(duration)}s。协议部分字段缺失，已按正文提交。`
        : `正文生成完成，用时 ${Math.round(duration)}s。`,
    });
    const cleanedParsed = sanitizeParsedResponse(result.parsed, state.gameSettings.额外功能);
    const parsedBody = normalizePlayerSpeechInBody({
      body: cleanedParsed.body?.trim() ?? '',
      playerName: state.旅人.姓名 || state.旅人.别名 || '你',
      userInput,
    });
    let finalBody = stripLeakedHistoryMetaFromBody(sanitizeContaminatedText(parsedBody, state.gameSettings.额外功能));
    if (!finalBody.trim()) throw new Error('AI response body was removed by strict sanitization');
    const sanitizedRawText = replaceBodyInRawResponse(
      cleanedParsed.rawText || result.fullText || streamedText,
      finalBody,
    );
    const displayText = finalBody;
    if (state.gameSettings.enableStreaming) {
      if (streamEventCount > 0) {
        await previewChain;
      } else if (displayText.trim()) {
        await revealStreamingPreview(
          displayText,
          (text) => { deps.onStreamProgress?.(text); },
          abortController.signal,
          {
            delayMs: 16,
            minChunks: 8,
          },
        );
      }
      streamMessageSetter.flush('');
    } else {
      streamMessageSetter.cancel();
    }
    // 给狭间消息预先打上 awakenPathId 标签:出题/评判回合,此时 effectiveWorld.进行中狭间 还没清空,
    // 把命途 ID 写进 parsedResponse,让 TurnItem 在 进行中狭间 清空后仍能拿到命途名做美化。
    const isAwakeningTurn =
      !!(cleanedParsed.awakenQuestions?.trim() || cleanedParsed.awakenJudgement?.trim());
    let awakenPathId = '';
    if (isAwakeningTurn) {
      awakenPathId = effectiveWorld.进行中狭间 ?? '';
      if (!awakenPathId) throw new Error('Awakening response requires an active path id');
    }
    const baseParsed = { ...cleanedParsed, body: finalBody, rawText: sanitizedRawText };
    const parsedForDisplay = awakenPathId
      ? { ...baseParsed, awakenPathId }
      : baseParsed;
    const tokenUsage = buildTurnTokenUsage({
      apiUsage: result.usage,
      systemPrompt,
      messages: successfulRequestMessages,
      outputText: result.fullText || displayText,
      provider: config.provider,
      model: config.model,
    });
    const previousDebugContext = [...updatedHistory]
      .reverse()
      .find((msg) => msg.role === 'assistant' && msg.debugContext?.systemPrompt)?.debugContext;
    const cachePrefixDiagnostics = buildCachePrefixDiagnostics({
      enabled: state.gameSettings.enableCacheDiagnostics === true,
      systemPrompt,
      messages: successfulRequestMessages,
      previous: previousDebugContext
        ? {
            systemPrompt: previousDebugContext.systemPrompt,
            messages: previousDebugContext.messages,
          }
        : undefined,
    });
    const aiMsg = 创建聊天消息('assistant', displayText, {
      gameTime: `${state.turnCount}`,
      parsedResponse: parsedForDisplay,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      tokenUsage,
      responseDurationSec: duration,
      preTurnSnapshot,
      debugContext: {
        systemPrompt,
        messages: successfulRequestMessages.map((msg) => ({ role: msg.role, content: msg.content })),
        deepSeekMainMode: deepSeekMainActive ? deepSeekMainMode : 'off',
        deepSeekCotFakeHistorySkipped: deepSeekMainActive && state.gameSettings.enableCotFakeHistory === true,
        deepSeekPrefixMode: deepSeekLockFormat,
        deepSeekProtocolIssues: deepSeekProtocolIssuesForTurn,
        softProtocolIssues: softProtocolIssuesForTurn,
        deepSeekMainOriginalModel: result.deepSeekRecovery?.model,
        stV2Used: tavernV2Enabled,
        rerollSimilarity: rerollSimilarityForTurn,
        rerollSimilarityRetried,
        cachePrefixDiagnostics,
        mainRequestMode,
        recallSummary: recallSummaryForTurn,
        recallFullContent: recallFullContentForTurn,
        yitingRecallPreview: yitingPreview?.previewText ?? '',
        yitingRecallRawText: yitingPreview?.rawText ?? '',
        yitingRecallUsedModel: yitingPreview?.usedModel === true,
        zhikuRecallPreview: formatZhikuDiagnosticsPreview(zhikuPreview?.diagnostics),
        zhikuRecallInjection: zhikuRecallEnabled ? (zhikuPreview?.injection ?? '') : '',
        zhikuRecallRawText: zhikuPreview?.rawText ?? '',
        zhikuRecallUsedModel: zhikuPreview?.usedModel === true,
        npcLedgerInjection: buildNpcLedgerDebug(npcLedgerSelection),
        npcLedgerSelectionRaw: npcLedgerSelection,
        recallPreview: [
          yitingPreview?.previewText ?? '',
          storyWeavingGate
            ? `剧情编织门禁：${storyWeavingGate.mode}｜第 ${storyWeavingGate.分段组号 ?? '?'} 段｜${storyWeavingGate.reasons.join('；') || '无命中理由'}`
            : '',
          storyWeavingDiagnostics
            ? [
              `剧情编织注入健康：${storyWeavingDiagnostics.健康状态}`,
              `剧情编织实际注入：第 ${storyWeavingDiagnostics.当前分段组号} 段「${storyWeavingDiagnostics.当前分段标题}」｜${storyWeavingDiagnostics.当前分段运行状态}`,
              storyWeavingDiagnostics.归档锚点标题 ? `已跳过归档锚点：第 ${storyWeavingDiagnostics.归档锚点组号} 段「${storyWeavingDiagnostics.归档锚点标题}」` : '',
              storyWeavingDiagnostics.前一分段标题 ? `历史承接段：${storyWeavingDiagnostics.前一分段标题}` : '',
              storyWeavingDiagnostics.下一分段标题 ? `下一段预热：${storyWeavingDiagnostics.下一分段标题}` : '',
              storyWeavingDiagnostics.检查项.length ? `注入检查：${storyWeavingDiagnostics.检查项.join('；')}` : '',
            ].filter(Boolean).join('\n')
            : '',
          formatZhikuDiagnosticsPreview(zhikuPreview?.diagnostics),
          formatNpcLedgerPreview(npcLedgerSelection),
        ].filter(Boolean).join('\n\n'),
      },
    });
    let finalHistory = [...updatedHistory, aiMsg];
    // assistant 消息已携带 preTurnSnapshot，清掉 user 消息上的，避免存档膨胀
    const userMsgIdx = finalHistory.findIndex((m) => m.id === userMsg.id);
    if (userMsgIdx >= 0 && finalHistory[userMsgIdx].preTurnSnapshot) {
      finalHistory = finalHistory.map((m, i) => i === userMsgIdx ? { ...m, preTurnSnapshot: undefined } : m);
    }
    state.setChatHistory(finalHistory);
    state.setTurnCount((prev) => prev + 1);
    committedProjection = {
      ok: true,
      narrativeText: displayText,
      messages: finalHistory
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({
          role: message.role as 'user' | 'assistant',
          content: message.content,
        })),
      turnCount: state.turnCount + 1,
    };
    streamMessageSetter.flush('');
    state.setLoading(false);
    state.setPendingVariable(true);
    pendingVariableStarted = true;

    // 6. Update memory
    pushQueueTask(state, 'memory', 'pending', { detail: '正在写入即时记忆并检查压缩阈值。' });
    const rawMemory = buildImmediateMemory(userInput, [
      parsedForDisplay.memory?.trim() ? `本回合小结：${parsedForDisplay.memory.trim()}` : '',
      displayText,
    ].filter(Boolean).join('\n\n'));
    let mem = addImmediateMemory(state.记忆, rawMemory, state.turnCount);
    const compression = await autoCompressMemorySystemWithArchivesAsync(
      mem,
      state.turnCount,
      state.gameSettings.记忆系统 ?? 创建默认记忆系统设置(),
      abortController.signal,
    );
    assertWorkflowActive();
    mem = compression.memory;
    state.set记忆(mem);
    const yitingWithCompression = state.忆庭;
    pushQueueTask(state, 'memory', 'success', {
      detail: compression.usedModel
        ? '即时/短期/中期/长期记忆已调用记忆总结 API 完成整理。'
        : '本回合未达到记忆压缩阈值。',
    });

    // 7 / 7a / 7b. 世界 + 旅人 的本回合修改全部累计到本地变量,最后一次性 set。
    //     这样在 8.5 变量校准里能拿到这些修改作为 snapshot——否则变量模型 commit 时
    //     会用「函数开始那一刻的 state.世界」覆盖,把刚写入的 待触发狭间/进行中狭间 抹掉,
    //     表现就是「狭间邀请卡片在变量校准结束后突然消失」。
    //     worldAfter 用 effectiveWorld 初始化(踏入触发已经把 进行中狭间 写入)。
    let worldAfter: typeof state.世界 = 归一化世界状态(effectiveWorld);
    let travelerAfter: typeof state.旅人 = state.旅人;

    // 7. 全局事件
    if (parsedForDisplay.worldEvents.length) {
      worldAfter = {
        ...worldAfter,
        全局事件: appendWorldEvents(worldAfter.全局事件, parsedForDisplay.worldEvents),
      };
    }

    // 7a. 命途狭间·邀请发出 → 写入 世界.待触发狭间
    //     校验:必须是已踏上 + 待升阶 的命途,才允许邀请落地。AI 偶发误标(把已经过去的命途
    //     又邀请一次)直接静默丢弃。
    if (parsedForDisplay.awakenInvite?.trim()) {
      if (worldAfter.待触发狭间 || worldAfter.进行中狭间) {
        throw new Error('Awakening invitation conflicts with an existing awakening state');
      }
      const invitedId = 解析命途ID(parsedForDisplay.awakenInvite);
      if (!invitedId) throw new Error(`Cannot parse awakening invitation: ${parsedForDisplay.awakenInvite}`);
      const target = (travelerAfter.命途列表 ?? []).find((p) => p.id === invitedId);
      if (!target?.待升阶) throw new Error(`Awakening invitation target is not ready: ${invitedId}`);
      worldAfter = { ...worldAfter, 待触发狭间: invitedId };
    }

    // 7b. 命途狭间·评判落地 → 调用 应用狭间结果,清空 世界.进行中狭间
    if (parsedForDisplay.awakenJudgement?.trim()) {
      if (!worldAfter.进行中狭间) throw new Error('Awakening judgement has no active path');
      const pathId = worldAfter.进行中狭间;
      const judgementRaw = parsedForDisplay.awakenJudgement.trim();
      const judgement: 狭间评判 | null =
        judgementRaw.includes('升阶')
        || judgementRaw.includes('突破')
        || judgementRaw.includes('确认')
        || /promote|advance|awaken/i.test(judgementRaw)
          ? '升阶'
          : null;
      if (judgement) {
        const res = 应用狭间结果(travelerAfter, pathId, judgement);
        if (!res.ok) throw new Error(`Failed to apply awakening judgement: ${res.reason}`);
        travelerAfter = res.traveler;
        worldAfter = { ...worldAfter, 进行中狭间: undefined };
      } else {
        throw new Error(`Cannot parse awakening judgement: ${judgementRaw}`);
      }
    }

    // 天气解析：从 AI 响应中提取 <天气> 标签，写入世界状态
    // 注意:此处 worldAfter.当前地点 仍是本回合开始前的旧地点,变量模型尚未运行。
    // 如果 AI 同回合切地点+换天气(如 黑塔空间站→罗浮 + 星海潮汐),用旧地点校验会误拒。
    // 因此只要天气 ID 合法(解析天气标签 已校验过中文→ID 映射)就直接接受,
    // 地点白名单仅作 prompt 引导,不强制校验。
    const 天气 = 解析天气标签(result.fullText || displayText);
    if (天气) {
      if (!验证天气合法性(天气, worldAfter.当前地点)) {
        throw new Error(`Weather ${天气} is invalid for ${worldAfter.当前地点}`);
      }
      worldAfter = { ...worldAfter, 当前天气: 天气 };
    }

    // 一次性 commit。直接传值不用 functional updater,因为 worldAfter / travelerAfter
    // 已基于 state.世界 / state.旅人 派生,React 批处理后效果等价。
    if (worldAfter !== state.世界) state.set世界(worldAfter);
    if (travelerAfter !== state.旅人) state.set旅人(travelerAfter);

    let variableOverrides: VariableCalibrationOverrides | null = null;
    if (state.gameSettings.enableVariableUpdate) {
      pushQueueTask(state, 'variable', 'pending', {
        detail: '正在调用变量模型校准正文。',
      });
      variableOverrides = await runVariableCalibrationStep({
        state,
        userInput,
        body: displayText,
        variableDraft: parsedForDisplay.variableDraft,
        turnAfter: state.turnCount + 1,
        memorySystemSnapshot: mem,
        travelerSnapshot: travelerAfter,
        worldSnapshot: worldAfter,
        signal: abortController.signal,
        shouldCommit: isCurrentWorkflow,
      });
      assertWorkflowActive();
      const variableApplied = Boolean(variableOverrides && Object.keys(variableOverrides).some((key) => key !== 'batch' && key !== 'npcLedgerUpdate'));
      pushQueueTask(state, 'variable', 'success', {
        detail: variableApplied ? '变量命令已落地。' : '本回合没有可落地的变量命令，已记录变量报告。',
      });
    }

      const npcSource = variableOverrides?.NPC ?? state.NPC;
      const archiveEnrichment = enrichNpcArchives(npcSource, {
        nsfwEnabled: state.gameSettings.enableNsfw,
        maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
        zhiku: state.智库,
      });

      // NSFW 基线补建：开启 NSFW 后，把需要补建基线的 NPC 信息传给变量模型，
      // 变量模型在变量更新那一次调用里顺带生成 NSFW 基线档案，走正常 nsfw_archive facts 落库链路。
      const npcSourceForCompression = archiveEnrichment.records;
      const memorySettings = state.gameSettings.记忆系统 ?? 创建默认记忆系统设置();
      const npcCompressionSummaryTriggered: string[] = [];
      let npcAfterCompression = npcSourceForCompression.map((npc) => {
        const ledgerCompression = compressNpcMemoryLedger({
          npcId: npc.id,
          entries: npc.同行记忆 ?? [],
          summaries: npc.总结记忆 ?? [],
          threshold: memorySettings.NPC记忆压缩阈值,
          prompt: memorySettings.NPC记忆压缩提示词,
          turn: state.turnCount,
          source: '变量',
        });
        if (!ledgerCompression.changed) {
          return npc;
        }
        if (ledgerCompression.summaryTriggered) {
          pushUniqueText(npcCompressionSummaryTriggered, npc.姓名);
        }
        return {
          ...npc,
          同行记忆: ledgerCompression.memories,
          总结记忆: ledgerCompression.summaries,
        };
      });
      const npcChanged =
        archiveEnrichment.changed ||
        npcAfterCompression.length !== npcSource.length ||
        npcAfterCompression.some((npc, index) => npc !== npcSource[index]);
      if (npcChanged) {
        state.setNPC(npcAfterCompression);
      }
      const npcLedgerUpdateDebug = variableOverrides?.npcLedgerUpdate || npcCompressionSummaryTriggered.length
        ? {
            updatedNames: variableOverrides?.npcLedgerUpdate?.updatedNames ?? [],
            memoryAppended: variableOverrides?.npcLedgerUpdate?.memoryAppended ?? [],
            ledgerFieldsUpdated: variableOverrides?.npcLedgerUpdate?.ledgerFieldsUpdated ?? [],
            summaryTriggered: [
              ...(variableOverrides?.npcLedgerUpdate?.summaryTriggered ?? []),
              ...npcCompressionSummaryTriggered,
            ].filter((name, index, list) => Boolean(name) && list.indexOf(name) === index),
            warnings: variableOverrides?.npcLedgerUpdate?.warnings ?? [],
          }
        : undefined;
      if (npcLedgerUpdateDebug) {
        finalHistory = attachNpcLedgerUpdateDebug(finalHistory, aiMsg.id, npcLedgerUpdateDebug);
        state.setChatHistory(finalHistory);
      }

      let memoryAfterStoryProgress = variableOverrides?.记忆 ?? mem;
      const storyAlignment = isOpeningSystemTrigger
        ? { system: state.剧情编织, changed: false, progressed: false }
        : autoAlignCanonStoryProgress({
            storyWeaving: state.剧情编织,
            turnCount: state.turnCount + 1,
            userInput,
            body: displayText,
            currentLocation: variableOverrides?.世界?.当前地点 ?? worldAfter.当前地点 ?? effectiveWorld.当前地点,
            gateSnapshot: storyWeavingGate,
          });
      const storyProgressMemoryLine = storyAlignment.progressed
        ? buildStoryProgressMemoryLine(state.剧情编织, storyAlignment.system)
        : '';
      const storyWeavingForSave = storyAlignment.system;
      if (storyAlignment.changed) {
        assertWorkflowActive();
        state.set剧情编织(storyWeavingForSave);
        assertWorkflowActive();
        if (storyProgressMemoryLine) {
          memoryAfterStoryProgress = addImmediateMemory(memoryAfterStoryProgress, storyProgressMemoryLine, state.turnCount + 1);
          mem = memoryAfterStoryProgress;
          state.set记忆(memoryAfterStoryProgress);
          const npcAfterStoryProgress = applyStoryProgressNpcMemory(
            npcAfterCompression,
            storyWeavingForSave,
            storyProgressMemoryLine,
            state.turnCount + 1,
          );
          if (npcAfterStoryProgress !== npcAfterCompression) {
            npcAfterCompression = npcAfterStoryProgress;
            state.setNPC(npcAfterCompression);
          }
        }
      }
      let zhikuAfterRuntimeUnlock = state.智库;
      if (storyAlignment.progressed) {
        const zhikuUnlock = applyStoryArchiveZhikuRuntimeUnlock({
          zhiku: state.智库,
          storyWeaving: storyWeavingForSave,
        });
        if (zhikuUnlock.changed) {
          assertWorkflowActive();
          zhikuAfterRuntimeUnlock = zhikuUnlock.system;
          state.set智库(zhikuAfterRuntimeUnlock);
          assertWorkflowActive();
          pushQueueTask(state, 'zhiku', 'success', {
            detail: `剧情归档已更新智库门禁：${zhikuUnlock.unlocked.slice(0, 3).map((item) => `${item.title}→${item.status}`).join('、')}${zhikuUnlock.unlocked.length > 3 ? ` 等 ${zhikuUnlock.unlocked.length} 项` : ''}。`,
          });
        }
      }
      const newsSettings = state.gameSettings.新闻系统;
      const newsEnabled = Boolean(newsSettings?.enabled && newsSettings?.autoGenerate);
      const newsInterval = Math.max(5, Math.min(10, Math.trunc(newsSettings?.generateIntervalTurns ?? 5) || 5));
      const newsTurn = state.turnCount + 1;
      const shouldRunOpeningNews = isOpeningSystemTrigger && newsEnabled;
      const shouldRunNews = newsEnabled && ((shouldRunOpeningNews && !openingNewsPreprocessed) || (newsTurn > 0 && newsTurn % newsInterval === 0));
      const yitingBase = mergeYitingSystems(yitingWithCompression, variableOverrides?.忆庭);
      const turnRecallSource = {
        turn: state.turnCount,
        userInput,
        body: displayText,
        memory: parsedForDisplay.memory,
        worldEvents: storyProgressMemoryLine
          ? [...parsedForDisplay.worldEvents, storyProgressMemoryLine]
          : parsedForDisplay.worldEvents,
        actionOptions: parsedForDisplay.actionOptions,
        gameTime: effectiveWorld?.当前日期 || undefined,
        gameClock: effectiveWorld?.当前时间 || undefined,
        location: effectiveWorld?.当前地点 || undefined,
      };
      let newsAfterGeneration: 新闻条目[] | null = openingNewsForSave;
      let yitingAfterTurnRecall = yitingBase;

      const runNewsBackgroundJob = async (): Promise<void> => {
        if (!shouldRunNews) return;
        pushQueueTask(state, 'news', 'pending', {
          detail: shouldRunOpeningNews
            ? '开局首回合正在先处理一次星际和平周报。'
            : `正在调用星际和平周报独立 API（读取最近 ${newsInterval} 回合）。`,
          cancellable: true,
        });
        const newsGenerationResult = await runNewsGenerationStep({
          state,
          mainBody: displayText,
          userInput,
          recentTurns: buildRecentTurnWindowForNews(finalHistory, userInput, displayText, newsInterval),
          storyWeavingSnapshot: storyWeavingForSave,
          signal: abortController.signal,
          shouldCommit: isCurrentWorkflow,
        });
        if (!newsGenerationResult) throw new Error('新闻生成任务未执行');
        assertWorkflowActive();
        newsAfterGeneration = newsGenerationResult.news;
        pushQueueTask(state, 'news', 'success', {
          detail: newsGenerationResult.changed
            ? `星际和平周报已更新，当前共 ${newsAfterGeneration.length} 条新闻记录。`
            : '星际和平周报本回合没有可写新闻变化。',
        });
      };

      const runYitingArchiveJob = async (): Promise<void> => {
        if (!yitingEnabled || !memorySettings.忆庭独立精炼) return;
        const turnRecallEntryResult = await buildYitingArchiveEntry(
          turnRecallSource,
          memorySettings,
          abortController.signal,
          memorySettings.忆庭召回API.retryCount ?? 2,
          state.gameSettings.promptModules,
        );
        assertWorkflowActive();
        const turnRecallEntry = turnRecallEntryResult.entry;
        yitingAfterTurnRecall = upsertRecallEntry(yitingBase, turnRecallEntry);
        state.set忆庭(yitingAfterTurnRecall);
        pushQueueTask(state, 'memory', 'success', {
          detail: '忆庭纪要已由独立模型压缩并入库。',
        });
        if (yitingRecallEnabled && yitingPreview?.entries.length) {
          pushQueueTask(state, 'yiting', 'success', {
            detail: '忆庭召回已由独立模型完成。',
          });
        } else if (yitingRecallEnabled) {
          pushQueueTask(state, 'yiting', 'success', {
            detail: '忆庭已检索，本回合没有命中相关档案。',
          });
        }
      };

      const runNarrativeImageJob = async (): Promise<void> => {
        const 正文生图设置 = state.gameSettings.文生图系统?.正文生图;
        if (!正文生图设置?.enabled || 正文生图设置.mode !== 'auto') return;
        const targetMessageId = aiMsg.id;
        const tokenizerConfig = resolveNarrativeImageTokenizerConfig(state);
        const imageApiConfig = resolveNarrativeImageGenerationApi(state);
        if (!tokenizerConfig) {
          throw new Error('正文生图词组转化器未启用');
        }
        if (!imageApiConfig) {
          throw new Error('正文生图接口未启用');
        }
        const generatedImages = await generateNarrativeImagesForMessage({
          state,
          messageId: targetMessageId,
          body: displayText,
          tokenizerConfig,
          imageApiConfig,
          turn: state.turnCount,
          signal: abortController.signal,
        });
        assertWorkflowActive();
        if (generatedImages.length) {
          finalHistory = finalHistory.map((msg) =>
            msg.id === targetMessageId && msg.role === 'assistant'
              ? {
                  ...msg,
                  narrativeImages: [...(msg.narrativeImages ?? []), ...generatedImages],
                }
              : msg,
          );
          state.setChatHistory(finalHistory);
        }
      };

      if ((state.gameSettings.backgroundTaskMode ?? 'sequential') === 'parallel') {
        await Promise.all([
          runNewsBackgroundJob(),
          runYitingArchiveJob(),
          runNarrativeImageJob(),
        ]);
      } else {
        await runNewsBackgroundJob();
        await runYitingArchiveJob();
        await runNarrativeImageJob();
      }

    state.setHasSave(true);
    reportSettlement(committedProjection);
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError' || abortController.signal.aborted) {
      state.setChatHistory(rollbackHistoryOnAbort);
      if (rollbackSnapshotOnAbort) {
        restorePreTurnSnapshot(state, rollbackSnapshotOnAbort);
      }
      state.setWorkflowHint('已停止生成，本次输入已回到输入框，可修改后重新发送。');
      state.setWorkflowStatus('');
      keepWorkflowHint = true;
      reportSettlement({
        ok: false,
        cancelled: true,
        error: err instanceof Error ? err : new Error('Workflow aborted'),
      });
    } else {
      console.error('Send workflow error:', err);
      keepWorkflowHint = true;
      const detail = err instanceof Error ? err.message : '主流程调用失败。';
      const alreadyReportedByApiLayer = Boolean(
        err && typeof err === 'object' && (err as { alreadyReportedByApiLayer?: boolean }).alreadyReportedByApiLayer,
      );
      if (!alreadyReportedByApiLayer) {
        void appendApiErrorReport({
          source: '主剧情工作流',
          config,
          requestMode: state.gameSettings.enableStreaming ? 'stream' : 'non-stream',
          error: err,
        });
      }
      state.setWorkflowHint(`主流程失败：${detail}`);
      state.setWorkflowStatus('');
      // Prefer actual hard-failure attempts over settings-only autoRetryCount.
      // Settlement errors after a successful main generation report a single failure.
      const finalFailCount = hardFailCount > 0 ? hardFailCount : 1;
      pushQueueTask(state, 'main_story', 'failed', {
        detail,
        failCount: finalFailCount,
      });
      reportSettlement({
        ok: false,
        cancelled: false,
        error: err instanceof Error ? err : new Error(detail),
      });
    }
  } finally {
    visibilityPublisher?.dispose();
    streamMessageSetter.cancel();
    if (isCurrentWorkflow()) {
      state.setLoading(false);
      if (!keepWorkflowHint) {
        state.setWorkflowHint('');
        state.setWorkflowStatus('');
      }
      state.setPendingVariable(false);
      if (!pendingVariableStarted) {
        pushQueueTask(state, 'memory', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
        pushQueueTask(state, 'variable', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
        pushQueueTask(state, 'news', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
        pushQueueTask(state, 'autosave', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
      }
      state.abortControllerRef.current = null;
      deps.onAfterSend();
    }
  }
}

// ── 变量模型校准 ──

interface VariableCalibrationParams {
  state: RuntimeDraftState;
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
  shouldCommit?: () => boolean;
}

interface VariableCalibrationOverrides {
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
async function runVariableCalibrationStep(
  params: VariableCalibrationParams,
): Promise<VariableCalibrationOverrides | null> {
  const { state } = params;
  if (!state.gameSettings.enableVariableUpdate) return null;
  if (!params.body?.trim()) return null;

  const override = state.gameSettings.variableApi;
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
    if (state.gameSettings.enableNsfw) {
      const npcRecords = (stateSnapshot.NPC ?? []) as NPC记录[];
      for (const npc of npcRecords) {
        if (nsfwBaselineCandidates.length >= 2) break;
        if (needsNsfwBaseline(npc, undefined, {
          nsfwEnabled: true,
          maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
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
      nsfwEnabled: state.gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
      nsfwBaselineCandidates,
      signal: params.signal,
      retryCount: state.gameSettings.variableApi.retryCount ?? 2,
      promptModules: state.gameSettings.promptModules,
    });
    assertCalibrationActive(params);

    const parsedFacts = parseVariableFacts(rawText);
    const factCommands = factsToVariableCommands(parsedFacts.facts, stateSnapshot, params.turnAfter - 1, {
      phoneSeedsEnabled: state.gameSettings.手机系统.enabled && state.gameSettings.手机系统.autoGenerateSeeds,
      maxPhoneSeedsPerTurn: state.gameSettings.手机系统.maxSeedsPerTurn,
    });
    if (parsedFacts.parseErrors.length) {
      throw new Error(`变量事实解析失败：${parsedFacts.parseErrors.join('；')}`);
    }
    if (factCommands.warnings.length) {
      throw new Error(`变量事实归约失败：${factCommands.warnings.join('；')}`);
    }
    const commands = factCommands.commands;
    const { allowedCommands, rejectedCommands } = applyNsfwVariablePolicy(commands, {
      nsfwEnabled: state.gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
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

function assertCalibrationActive(params: Pick<VariableCalibrationParams, 'signal' | 'shouldCommit'>): void {
  if (params.signal?.aborted || params.shouldCommit?.() === false) {
    throw new DOMException('Variable calibration aborted', 'AbortError');
  }
}
