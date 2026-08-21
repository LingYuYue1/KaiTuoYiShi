import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { CommittedWorldFact } from '@/models/storyRuntime';
import { 创建聊天消息, type 聊天消息, type 回合快照, type 回合Token消耗, type 解析后回复 } from '@/models/chat';
import type { 新闻条目 } from '@/models/news';
import { sendChatMessage } from '@/services/ai/text';
import { isEmptyResponse, parseResponse } from '@/services/ai/responseParser';
import { appendApiErrorReport } from '@/services/ai/apiErrorReportService';
import { isNonRetryableAIError } from '@/services/ai/deepSeekRecovery';
import { callVariableModel, type NsfwBaselineCandidate, type VariableCoverageReport } from '@/services/ai/variableModel';
import { buildOpeningSystemPrompt, buildPathAwakeningSystemPrompt, buildSystemPrompt } from './systemPromptBuilder';
import {
  buildMainTurnEnforcementBlock,
  buildCotPseudoTaskSequence,
  createMainRequestHash,
  DEEPSEEK_MAIN_FORMAT_GUARD,
  deriveMainStoryMessageMode,
  finalizeMainRequest,
  insertDepthIntoHistory,
  type MainStoryMessageMode,
} from './mainRequestFinalizer';
import { resolveChatProviderCapabilities } from '@/services/ai/chatCompletionClient';
import { buildTavernMessageChain } from './tavernMessageChainBuilder';
import { applyTavernOutputRegexScripts } from './tavernRegexProcessor';
import { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';
import { getBuiltinPresetsV2 } from '@/data/builtinPresets';
import { 解析天气标签, 验证天气合法性 } from '@/data/weatherRules';
import {
  addImmediateMemory,
  autoCompressMemorySystemWithArchives,
  autoCompressMemorySystemWithArchivesAsync,
  compressNpcMemoryLedger,
  isMemorySystemNoise,
  构建即时记忆条目,
  构建短期记忆条目,
  写入四段记忆,
} from './memoryUtils';
import { runNewsGenerationStep } from './newsWorkflow';
import { applyAdjudicatedStoryProgress } from '@/services/storyProgressService';
import { buildStoryWeavingApiConfig, buildStoryAdvanceJudgeApiConfig, evaluateStoryWeavingGate, getStoryWeavingInjectionDiagnostics } from '@/services/storyWeaving';
import { judgeStoryAdvance } from '@/services/storyAdvanceJudge';
import { 归一化世界状态, 归一化剧情编织运行时切片, 格式化开局档案上下文, type 世界状态 } from '@/models/world';
import { buildStoryWeavingRuntimeProjection } from '@/services/storyRuntime/storyWeavingRuntimeAdapter';
import {
  applyStoryContinuityLocation,
  evaluateStoryContinuity,
  inferStoryRegionId,
  inferStorySeriesRegion,
} from '@/services/storyRuntime/storyContinuityGuard';
import { adjudicateStoryTurn, type StoryTurnAdjudication } from '@/services/storyRuntime/storyTurnAdjudicator';
import { adjudicateWorldEvolution, isWorldFactDuplicate } from '@/services/storyRuntime/worldEvolutionAdjudicator';
import {
  buildEarlyResolutionEvidence,
  buildStoryFactConsumerView,
  formatFactBrief,
  materializeAdjudicatedFacts,
  mergeNewFactIds,
  type StoryFactConsumerView,
} from '@/services/storyRuntime/storyFactConsumerView';
import {
  buildTurnEvidence,
  gameTimeOf,
  mergeProjectionEvents,
  runWorldEvolutionStep,
  scanDueWorldEvents,
} from './worldEvolutionWorkflow';
import { loadSetting, saveGame, saveSetting, updateSetting } from '@/services/dbService';
import {
  clearWorkflowRecoveryJournal,
  createWorkflowRecoveryJournal,
  persistWorkflowRecoveryJournal,
  updateWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import { buildSavePayload, commitActiveSaveTreeMeta } from './saveLoadWorkflow';
import { snapshotVariableState, commitVariableState, unpackVariableState } from '@/utils/variableExecutor';
import {
  createDocumentVisibilitySource,
  createVisibilityBufferedPublisher,
  type VisibilityBufferedPublisher,
} from '@/utils/visibilityBufferedPublisher';
import { createRafCoalescedSetter } from '@/utils/rafCoalescedSetter';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import type { 变量事实, 变量命令, 变量命令批次, 变量命令结果 } from '@/models/variableCommand';
import { 解析命途ID, 应用狭间结果, 踏入命途狭间, type 狭间评判 } from '@/services/pathService';
import { 创建默认记忆系统设置 } from '@/models/settings';
import type { API配置项, API设置, 文生图API配置 } from '@/models/settings';
import type { 队列任务ID, 队列任务记录, 队列任务状态 } from '@/models/queueTask';
import { formatZhikuCandidateDecisionTrace, type 智库召回诊断 } from '@/services/zhikuRetrieval';
import {
  compileZhikuTurn,
  compileZhikuTurnWithModel,
  type ZhikuRequestScope,
} from '@/services/zhikuRuntimeCompiler';
import { applyStoryArchiveZhikuRuntimeUnlock, mergeZhikuRuntimeUnlockPatch } from '@/services/zhikuRuntimeUnlock';
import { buildPersistedZhikuSystem } from '@/data/zhikuPreset';
import { hydratePersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import { getBuiltinPresets } from '@/data/builtinPresets';
import { retrieveYitingContextWithModel, type 忆庭召回结果 } from '@/services/yitingRetrieval';
import {
  executePhoneMemoryDualWrite,
  parsePhoneMemoryFailureTask,
  retryPhoneMemoryWrite,
} from '@/services/phoneMemoryDualWrite';
import { applyNpcFactMemories } from '@/services/npcFactMemory';
import { 创建默认智库系统设置 } from '@/models/settings';
import { selectNpcLedgersForTurn, 提取NPC同行记忆文本列表, 整理NPC记录列表, 筛选活跃NPC, type NPC记录, type NPC账本选择结果 } from '@/models/npc';
import type { 手机系统, 主动来信种子 } from '@/models/phone';
import {
  buildImmediateStoryReview,
  buildZhikuKeywordRecallQuery,
  buildLeanAssistantHistoryContent,
  buildMainRecallQuery,
  extractRecentStoryPlanSnippets,
  getMainHistoryWindow,
  getPathAwakeningHistoryWindow,
} from './historyWindow';
import { 归一化剧情编织系统, type 剧情编织系统 } from '@/models/storyWeaving';
import { restorePreTurnSnapshotPersisted } from './turnSnapshot';
import { getNsfwArchiveBlockReason } from '@/utils/nsfwArchivePolicy';
import { normalizePlayerSpeechBody, replaceBodyInRawResponse } from '@/utils/playerSpeechGuard';
import { resolvePlayerSpeechMode } from '@/utils/narrativeRuntimePolicy';
import { parseNarrativeBody, serializeNarrativeBody } from '@/utils/narrativeBodyParser';
import { enrichNpcArchives, needsNsfwBaseline } from '@/utils/npcArchiveEnrichment';
import { sanitizeParsedResponse, sanitizeContaminatedText } from '@/utils/textSanitizer';
import { appendWorldEvents } from '@/utils/worldEvents';
import { getZhikuCharacterParticipationForTurn } from './npcPresence';
import { estimateTextTokens } from '@/utils/tokenEstimate';
import { buildImagePromptTokenizerConfig } from '@/services/ai/imagePromptTokenizer';
import { applyNovelAIRulePreset } from '@/utils/imagePromptRules';
import { resolveStorySnapshot, selectPresentStorySnapshotNpcs } from '@/services/ai/storySnapshotPipeline';
import { 创建相册图片条目, 添加图片到相册, 创建相册资源引用 } from '@/utils/albumActions';
import { compactPreTurnSnapshot } from '@/utils/saveRuntimeCompactor';
import { compactChatHistoryForLongSession, compactVariableBatchHistory } from '@/utils/longSessionRetention';
import { findLinkedVariableBatchAssistant, findLinkedVariableBatchUser } from '@/utils/variableBatchIdentity';
import { analyzeVariableTurn } from '@/services/variableTurnAnalysis';
import type { MacroContext } from '@/utils/macroEngine';
import {
  buildPromptMacroContext,
  buildPromptWorldbookContext,
  resolvePromptWorldbookPlan,
} from './promptAssemblyContext';
import { updateTriggerStatesAfterTurn } from '@/utils/worldbook';
import type { VariableState } from '@/utils/variableRegistry';

function formatOriginalProtagonistForOpening(originalProtagonist: 世界状态['原著主角']): string {
  if (originalProtagonist === '星') return '原作主角星';
  if (originalProtagonist === '穹') return '原作主角穹';
  if (originalProtagonist === '星穹双主角') return '原作主角星与穹';
  return '所选原著主角';
}

function hasProtocolTag(rawText: string, tagNames: string[]): boolean {
  return tagNames.some((tag) => {
    const escaped = tag.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    return new RegExp(`<\\s*${escaped}\\s*>`, 'i').test(rawText);
  });
}

function getDeepSeekMainProtocolIssues(parsed: 解析后回复, rawText: string): string[] {
  const raw = rawText || parsed.rawText || '';
  const issues: string[] = [];
  if (!hasProtocolTag(raw, ['thinking', 'think', '思考']) || !parsed.thinking.trim()) {
    issues.push('缺少 <thinking> 或 thinking 为空');
  } else if (
    !/(?:^|\n)\s*(?:Step|Opening-Step|Awakening-Step|步骤)\s*0?\d/i.test(parsed.thinking) &&
    !/Step(?:0|1|2|3|4|5|6|7|8|9|10|11|12|13|14)/i.test(parsed.thinking)
  ) {
    issues.push('<thinking> 未按 Step 思维链展开');
  }
  if (!hasProtocolTag(raw, ['正文', 'body', 'content', 'text', '内容']) || !parsed.body.trim()) {
    issues.push('缺少 <正文> 或正文为空');
  }
  if (!hasProtocolTag(raw, ['短期记忆', 'memory', 'summary', 'recap', '记忆', '回忆'])) {
    issues.push('缺少 <短期记忆>');
  }
  if (!hasProtocolTag(raw, ['动态世界', 'world', 'worldevent', '世界', '事件'])) {
    issues.push('缺少 <动态世界>');
  }
  if (!hasProtocolTag(raw, ['变量草稿', 'variableDraft', '变量候选', '变量线索', '变量摘要'])) {
    issues.push('缺少 <变量草稿>');
  }
  return issues;
}

function buildDeepSeekProtocolRetryGuard(issues: string[]): string {
  return [
    'DeepSeek 主剧情自动重试：上一版输出未通过协议校验。',
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

function applyStoryProgressNpcMemory(npcs: NPC记录[], story: 剧情编织系统, _memoryLine: string, turn: number): NPC记录[] {  if (!story.当前进度) return npcs;
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
    `AI候选索引：${diagnostics.AI候选索引.join('；') || '无'}`,
    `AI形态修正：${diagnostics.AI形态修正.join('；') || '无'}`,
    `AI拒绝选择：${diagnostics.AI拒绝选择.join('；') || '无'}`,
    `AI未选择原因：${diagnostics.AI未选择原因 || '无'}`,
    `逐条召回轨迹：${formatZhikuCandidateDecisionTrace(diagnostics.candidateDecisions)}`,
    `最终注入角色资料（已去重）：${diagnostics.角色相关资料.join('、') || '无'}`,
    `最终注入强资料：${diagnostics.强相关资料.join('、') || '无'}`,
    `最终注入弱资料：${diagnostics.弱相关资料.join('、') || '无'}`,
    `已注入资料：${diagnostics.已注入资料.join('、') || '无'}`,
    `角色故事层注入：${diagnostics.角色故事层注入?.join('；') || '无'}`,
    `静态注入体量：${diagnostics.静态注入字符数} 字符 / 约 ${diagnostics.静态注入估算Token} tokens`,
    diagnostics.单条静态注入体量.length
      ? `单条体量：${diagnostics.单条静态注入体量.map((item) => `${item.标题} ${item.字符数}字/${item.估算Token}t（${item.保留优先级}）`).join('；')}`
      : '单条体量：无',
    `动态状态来源：${diagnostics.动态状态来源.join('；') || '无'}`,
    `去重记录：${diagnostics.去重记录.join('；') || '无'}`,
    diagnostics.删减记录.length
      ? `删减记录：${diagnostics.删减记录.map((item) => `${item.标题}（${item.原优先级}：${item.原因}）`).join('；')}`
      : '删减记录：无',
    `体量预警：${diagnostics.体量预警.join('；') || '无'}`,
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

function getStoryWeavingWriteSignature(system: 剧情编织系统): string {
  const omitRuntimeKeys = new Set(['当前系列ID', '当前进度', '当前分段组号', '运行状态', 'updatedAt']);
  const stripRuntimeState = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripRuntimeState);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !omitRuntimeKeys.has(key))
        .map(([key, child]) => [key, stripRuntimeState(child)]),
    );
  };
  return JSON.stringify(stripRuntimeState(归一化剧情编织系统(system)));
}

async function resolveStoryWeavingForBackgroundWrite(input: {
  workflowBase: 剧情编织系统;
  proposed: 剧情编织系统;
}): Promise<{ system: 剧情编织系统; concurrentChange: boolean }> {
  const latest = await loadSetting<剧情编织系统>('storyWeavingSystem');
  const latestNormalized = latest ? hydratePersistedStoryWeavingSystem(latest, input.workflowBase) : null;
  if (!latestNormalized) return { system: input.proposed, concurrentChange: false };
  const baseSignature = getStoryWeavingWriteSignature(归一化剧情编织系统(input.workflowBase));
  const latestSignature = getStoryWeavingWriteSignature(latestNormalized);
  if (baseSignature === latestSignature) {
    return { system: input.proposed, concurrentChange: false };
  }
  return { system: latestNormalized, concurrentChange: true };
}

function normalizePhoneSeedComparableText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？!?；;、,.…~～“”"'\[\]（）()《》<>]/g, '')
    .trim();
}

function isPhoneSeedTextSimilar(a: string, b: string): boolean {
  const left = normalizePhoneSeedComparableText(a);
  const right = normalizePhoneSeedComparableText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 12 && right.includes(left)) return true;
  if (right.length >= 12 && left.includes(right)) return true;
  const shared = [...new Set(left)].filter((char) => right.includes(char)).length;
  return shared / Math.max(1, Math.min(left.length, right.length)) >= 0.82;
}

function hasRecentSimilarPhoneSeed(input: {
  phone: 手机系统;
  npcId: string;
  turn: number;
  title: string;
  context: string;
  windowTurns?: number;
}): boolean {
  const windowTurns = Math.max(3, input.windowTurns ?? 12);
  const currentText = `${input.title}\n${input.context}`;
  return input.phone.messageSeeds.some((seed) => {
    if (input.turn - (Number(seed.turn) || 0) > windowTurns) return false;
    const sameTarget = seed.targetId === input.npcId || seed.targetId === `npc_${input.npcId}` || seed.relatedNpcIds.includes(input.npcId);
    if (!sameTarget) return false;
    return isPhoneSeedTextSimilar(currentText, `${seed.title}\n${seed.context}`);
  });
}

function buildFallbackPhoneSeed(input: {
  phone: 手机系统;
  npcs: NPC记录[];
  turn: number;
  userInput: string;
  body: string;
  maxSeedsPerTurn: number;
  contactCooldownTurns: number;
  // R3：手机只消费统一事实视图——公开事实、玩家已知事实，或有明确发送者/接收者 ID 的事实。
  factView?: StoryFactConsumerView | null;
}): 主动来信种子 | null {
  if (input.maxSeedsPerTurn <= 0) return null;
  const pendingCount = input.phone.messageSeeds.filter((seed) => seed.status === 'pending').length;
  if (pendingCount >= input.maxSeedsPerTurn) return null;
  if (input.phone.messageSeeds.some((seed) => seed.status === 'pending')) return null;

  const cooldown = Math.max(1, Math.trunc(input.contactCooldownTurns || 3));
  const fallbackGlobalCooldown = Math.max(3, cooldown);
  const lastNonUrgentSeedTurn = input.phone.messageSeeds
    .filter((seed) => seed.priority !== 'urgent')
    .reduce((latest, seed) => Math.max(latest, Number(seed.turn) || 0), 0);
  if (lastNonUrgentSeedTurn > 0 && input.turn - lastNonUrgentSeedTurn < fallbackGlobalCooldown) return null;

  // R3：本回合有明确新事实的 NPC（参与者/知情者）进入来信候选，且优先于普通互动触发。
  const turnCommittedIds = new Set((input.factView?.turnCommittedFacts ?? []).map((fact) => fact.factId));
  const factByNpc = new Map<string, CommittedWorldFact>();
  for (const item of input.factView?.npcKnownFacts ?? []) {
    const fresh = item.facts.find((fact) => turnCommittedIds.has(fact.factId));
    if (fresh) factByNpc.set(item.npcId, fresh);
  }

  const text = `${input.userInput}\n${input.body}`;
  const candidates = input.npcs
    .filter((npc) => npc.关系 !== 'enemy')
    .filter((npc) => npc.阶位 === 'companion' || npc.同行 || 提取NPC同行记忆文本列表(npc).length > 0 || factByNpc.has(npc.id))
    .filter((npc) => {
      if (factByNpc.has(npc.id)) return true;
      const recentTurn = Number(npc.最近回合 || 0);
      if (recentTurn < Math.max(1, input.turn - 4)) return false;
      const aliases = [npc.姓名, npc.别名].filter((item): item is string => Boolean(item?.trim()));
      return npc.同行 || aliases.some((name) => text.includes(name));
    })
    .filter((npc) => {
      const lastSeedTurn = input.phone.messageSeeds
        .filter((seed) =>
          seed.targetId === npc.id ||
          seed.targetId === `npc_${npc.id}` ||
          seed.relatedNpcIds.includes(npc.id),
        )
        .reduce((latest, seed) => Math.max(latest, Number(seed.turn) || 0), 0);
      return lastSeedTurn <= 0 || input.turn - lastSeedTurn >= cooldown;
    })
    .sort((a, b) => {
      const aFact = factByNpc.has(a.id) ? 1 : 0;
      const bFact = factByNpc.has(b.id) ? 1 : 0;
      if (aFact !== bFact) return bFact - aFact;
      if (a.同行 !== b.同行) return a.同行 ? -1 : 1;
      const recentDiff = Number(b.最近回合 || 0) - Number(a.最近回合 || 0);
      if (recentDiff !== 0) return recentDiff;
      return 提取NPC同行记忆文本列表(b).length - 提取NPC同行记忆文本列表(a).length;
    });

  const npc = candidates[0];
  if (!npc) return null;
  const factForNpc = factByNpc.get(npc.id);
  const reason = factForNpc
    ? formatFactBrief(factForNpc)
    : [
        input.body.replace(/\s+/g, ' ').trim().slice(0, 120),
        提取NPC同行记忆文本列表(npc).slice(-1)[0],
      ].filter(Boolean).join('；');
  const title = `${npc.姓名}的跟进短讯`;
  const context = `${npc.姓名}近期与玩家有互动，可低频发来一条跟进、确认状况或延续约定的短讯。已发生事实：${reason || '近期剧情互动。'}`;
  if (hasRecentSimilarPhoneSeed({
    phone: input.phone,
    npcId: npc.id,
    turn: input.turn,
    title,
    context,
  })) {
    return null;
  }
  return {
    id: `phone_seed_fallback_${input.turn}_${npc.id}_${Math.random().toString(36).slice(2, 8)}`,
    turn: input.turn,
    source: 'main_story',
    triggerType: npc.同行 ? 'quest' : 'relationship',
    priority: 'low',
    targetType: 'private',
    targetId: npc.id,
    title,
    context,
    relatedNpcIds: [npc.id],
    expiresAfterTurns: 6,
    status: 'pending',
  };
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
  state: UseGameStateReturn,
  id: 队列任务ID,
  status: 队列任务状态,
  patch?: {
    title?: string;
    subtitle?: string;
    detail?: string;
    rawText?: string;
    turn?: number;
    turnId?: string;
    targetMessageId?: string;
    targetUserMessageId?: string;
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
      turnId: patch?.turnId,
      timestamp: Date.now(),
      status,
      detail: patch?.detail,
      rawText: patch?.rawText,
      targetMessageId: patch?.targetMessageId,
      targetUserMessageId: patch?.targetUserMessageId,
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
  state: UseGameStateReturn,
  text: string,
  signal?: AbortSignal,
  options?: { delayMs?: number; minChunks?: number },
): Promise<void> {
  const chunks = splitStreamingReveal(text);
  if (!chunks.length) return;
  const streamSetter = createRafCoalescedSetter(setStreamingMessage);
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

export interface SendWorkflowDeps {
  state: UseGameStateReturn;
  getActiveConfig: () => import('@/models/settings').API配置项 | null;
  onBeforeSend: () => void;
  onAfterSend: () => void;
  rerollContext?: {
    nonce: string;
    previousResponse: string;
  } | null;
}


function compactForRerollInstruction(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 900 ? `${cleaned.slice(0, 900)}...` : cleaned;
}

function buildSingleApiSettings(config: API配置项): API设置 {
  return {
    activeConfigId: config.id,
    configs: [config],
  };
}

function resolveNarrativeImageTokenizerConfig(state: UseGameStateReturn, mainConfig: API配置项 | null): API配置项 | null {
  if (!mainConfig) return null;
  return buildImagePromptTokenizerConfig(state.gameSettings, buildSingleApiSettings(mainConfig));
}

function resolveNarrativeImageGenerationApi(state: UseGameStateReturn): 文生图API配置 | null {
  const imageSettings = state.gameSettings.文生图系统;
  return imageSettings.普通接口.enabled
    ? applyNovelAIRulePreset(imageSettings.普通接口, imageSettings.rules)
    : null;
}

function archiveNarrativeSnapshotToAlbum(
  state: UseGameStateReturn,
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
  state.set相册((prev) => 添加图片到相册(prev, item));
  return {
    ...image,
    dataUrl: 创建相册资源引用(item.asset.id),
    assetId: item.asset.id,
  };
}

async function generateNarrativeImagesForMessage(params: {
  state: UseGameStateReturn;
  messageId: string;
  body: string;
  tokenizerConfig: API配置项 | null;
  imageApiConfig: 文生图API配置;
  turn: number;
  signal?: AbortSignal;
  replaceExisting?: boolean;
}): Promise<import('@/models/chat').叙事插图[] | null> {
  const { state, messageId, body, tokenizerConfig, imageApiConfig, turn, signal, replaceExisting = false } = params;
  const failMessage = (error: string) => {
    if (!replaceExisting) return;
    state.setChatHistory((prev) => prev.map((msg) =>
      msg.id === messageId && msg.role === 'assistant'
        ? {
            ...msg,
            narrativeImages: [{
              id: `narrative_failed_${turn}_${Date.now()}`,
              dataUrl: '',
              type: 'scene' as const,
              kind: 'snapshot' as const,
              prompt: '',
              negativePrompt: '',
              description: '故事快照',
              status: 'failed' as const,
              error,
            }],
          }
        : msg,
    ));
  };
  pushQueueTask(state, 'narrative_image_parse', 'pending', {
    detail: '正在解析正文中的故事快照提示词。',
    turn,
    targetMessageId: messageId,
  });
  try {
    const { generateNarrativeImage } = await import('@/services/ai/imageGeneration');
    const playerAppearanceMode = state.gameSettings.文生图系统?.正文生图?.playerAppearanceMode ?? 'auto';
    const presentNpcRecords = selectPresentStorySnapshotNpcs(state.NPC ?? [], body);
    const traveler = state.旅人;
    const snapshot = await resolveStorySnapshot({
      apiConfig: tokenizerConfig,
      body,
      traveler,
      playerAppearanceMode,
      presentNpcs: presentNpcRecords,
      rules: state.gameSettings.文生图系统.rules,
      size: '1280x720',
      slot: 'scene',
      signal,
    });
    pushQueueTask(state, 'narrative_image_parse', 'success', {
      detail: snapshot.source === 'local'
        ? `模型解析未完成，已使用本地草稿：${snapshot.summary.title || '剧情瞬间'}。${snapshot.warning ? ` ${snapshot.warning}` : ''}`
        : `已解析故事快照：${snapshot.summary.title || '剧情瞬间'}。`,
      rawText: snapshot.diagnosticRawText,
      turn,
      targetMessageId: messageId,
    });
    const generatedImages: import('@/models/chat').叙事插图[] = [];
    pushQueueTask(state, 'narrative_image_generate', 'pending', {
      detail: `正在生成故事快照：${snapshot.summary.title || '剧情瞬间'}。`,
      turn,
      targetMessageId: messageId,
    });
    const imageId = `narrative_${turn}_snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const result = await generateNarrativeImage(
      imageApiConfig,
      snapshot.prompt,
      snapshot.negativePrompt,
      'scene',
      snapshot.summary.title || '故事快照',
      imageId,
      snapshot.renderContext,
      signal,
    );
    if (result.status === 'done' || result.status === 'failed') {
      result.kind = 'snapshot';
    }
    const archivedResult = archiveNarrativeSnapshotToAlbum(state, result, {
      title: snapshot.summary.title || '故事快照',
      size: '1280x720',
      sourcePrompt: body,
    });
    generatedImages.push(archivedResult);
    pushQueueTask(state, 'narrative_image_generate', result.status === 'done' ? 'success' : 'failed', {
      detail: result.status === 'done'
        ? `${snapshot.summary.title || '故事快照'} 故事快照生成完成。`
        : `${snapshot.summary.title || '故事快照'} 故事快照生成失败：${result.error}`,
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
      failMessage((err as Error).message);
      pushQueueTask(state, 'narrative_image_parse', 'failed', {
        detail: `故事快照解析失败：${(err as Error).message}`,
        turn,
        targetMessageId: messageId,
      });
    }
    return null;
  }
}

export async function regenerateNarrativeImagesForMessage(
  state: UseGameStateReturn,
  getActiveConfig: () => API配置项 | null,
  messageId: string,
): Promise<void> {
  const message = state.chatHistory.find((item) => item.id === messageId);
  if (!message || message.role !== 'assistant') return;
  const body = message.parsedResponse?.body?.trim() || message.content.trim();
  if (!body) return;
  const narrative = state.gameSettings.文生图系统?.正文生图;
  if (!narrative?.enabled) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '正文生图未启用，无法重新生成故事快照。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    return;
  }
  const mainConfig = getActiveConfig();
  const tokenizerConfig = resolveNarrativeImageTokenizerConfig(state, mainConfig);
  const imageApiConfig = resolveNarrativeImageGenerationApi(state);
  if (!imageApiConfig) {
    pushQueueTask(state, 'narrative_image_generate', 'failed', {
      detail: '正文生图主文生图接口未启用，无法生成故事快照。',
      turn: Number(message.gameTime) || state.turnCount,
      targetMessageId: messageId,
    });
    return;
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
    pushQueueTask(state, task.id, 'pending', {
      detail: mode === 'reroll' ? '正在重新解析并生成故事快照。' : '正在重试故事快照任务。',
      turn: task.turn || state.turnCount,
      targetMessageId,
      retrying: true,
      failCount: task.failCount,
    });
    await regenerateNarrativeImagesForMessage(state, getActiveConfig, targetMessageId);
    return;
  }

  if (task.id === 'news') {
    await retryNewsQueueTask(state, task, mode);
    return;
  }

  if (task.id === 'variable') {
    await retryVariableQueueTask(state, getActiveConfig, task, mode);
  }

  if (task.id === 'phone') {
    await retryPhoneMemoryWriteTask(state, task, getActiveConfig);
  }
}

/**
 * 手机记忆双写单侧失败重试：只执行 failed 的一侧，已 success / not_due 的一侧不重放；
 * 成功后更新原任务状态，不新增重复任务。
 */
async function retryPhoneMemoryWriteTask(
  state: UseGameStateReturn,
  task: 队列任务记录,
  getActiveConfig: () => API配置项 | null,
): Promise<void> {
  const payload = parsePhoneMemoryFailureTask(task);
  if (!payload) {
    pushQueueTask(state, 'phone', 'failed', {
      detail: '手机记忆写入任务缺少可恢复载荷，无法重试。',
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  const settings = state.gameSettings.记忆系统;
  state.setWorkflowHint(`正在补写失败侧：${payload.failedSide === 'yiting' ? '忆庭归档' : 'NPC 同行记忆'}。`);
  try {
    const outcome = await retryPhoneMemoryWrite(payload, {
      memory: state.记忆,
      yiting: state.忆庭,
      npcs: 筛选活跃NPC(state.NPC),
      settings,
      config: getActiveConfig(),
      turn: payload.turn || state.turnCount,
      gameTime: [state.世界.当前日期, state.世界.当前时间].filter(Boolean).join(' ').trim() || undefined,
    }, {
      getQueueTasks: () => state.queueTasks,
      buildSavePayload: (overrides) => buildSavePayload(state, 'auto', overrides),
      saveGame,
      publish: (next) => {
        state.set记忆(next.memory);
        state.set忆庭(next.yiting);
        state.setNPC(next.npcs);
        state.setQueueTasks(next.queueTasks);
      },
      onPersistFailure: (error) => state.setWorkflowHint(error),
    });
    if (!outcome.ok) {
      // persistFailed 已由 onPersistFailure 提示；普通业务失败保持原提示。
      if (!outcome.persistFailed) {
        state.setWorkflowHint(`手机记忆补写仍然失败：${outcome.error ?? '未知错误'}，可再次重试。`);
      }
    }
  } catch (err) {
    pushQueueTask(state, 'phone', 'failed', {
      detail: `手机记忆补写失败：${err instanceof Error ? err.message : String(err)}`,
      turn: payload.turn || state.turnCount,
      failCount: (task.failCount ?? 0) + 1,
    });
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
  const body = assistant.parsedResponse?.body?.trim() || assistant.content.trim();
  if (!body) {
    pushQueueTask(state, 'news', 'failed', {
      detail: '当前正文为空，无法重试新闻生成。',
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
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
  try {
    // R3 修复：新闻重试/重生成同样只消费统一事实视图——从已保存的运行时切片重建 factView，
    // 约束模式下正文、滑窗、NPC 等旧输入会被 newsWorkflow 清空，避免"报道内容反过来成为事实"；
    // 旧存档没有运行时切片时保持旧兼容行为（factView 为 null 走旧链路）。
    const runtimeSlice = state.世界.剧情运行时;
    let factViewForNewsRetry: StoryFactConsumerView | null = null;
    if (runtimeSlice && Array.isArray(runtimeSlice.factLedger) && Array.isArray(runtimeSlice.worldEvents)) {
      const sliceRevision = runtimeSlice.runtimeRevision;
      const lastFactIds = Number.isFinite(sliceRevision)
        ? runtimeSlice.factLedger
            .filter((fact) => fact.sourceRevision === sliceRevision)
            .map((fact) => fact.factId)
        : [];
      factViewForNewsRetry = buildStoryFactConsumerView({
        factLedger: runtimeSlice.factLedger,
        worldEvents: runtimeSlice.worldEvents,
        newFactIds: lastFactIds,
      });
    }
    const result = await runNewsGenerationStep({
      state,
      mainBody: body,
      userInput,
      recentTurns: buildRecentTurnWindowForNews(state.chatHistory, userInput, body, interval),
      storyWeavingSnapshot: state.剧情编织,
      factView: factViewForNewsRetry,
      signal: abortController.signal,
    });
    pushQueueTask(state, 'news', result ? 'success' : 'failed', {
      detail: result
        ? result.changed
          ? `星际和平周报已${mode === 'reroll' ? '重生成' : '重试更新'}，当前共 ${result.news.length} 条新闻记录。`
          : '星际和平周报已重试，但模型没有返回可写入的新变化。'
        : '星际和平周报重试失败，请检查新闻 API 配置或模型返回。',
      turn: Number(assistant.gameTime) || task.turn || state.turnCount,
      failCount: result ? task.failCount : (task.failCount ?? 0) + 1,
      targetMessageId: assistant.id,
    });
  } catch (err) {
    pushQueueTask(state, 'news', 'failed', {
      detail: `星际和平周报重试失败：${(err as Error).message}`,
      turn: Number(assistant.gameTime) || task.turn || state.turnCount,
      failCount: (task.failCount ?? 0) + 1,
      targetMessageId: assistant.id,
    });
  }
}

async function retryVariableQueueTask(
  state: UseGameStateReturn,
  getActiveConfig: () => API配置项 | null,
  task: 队列任务记录,
  mode: 'retry' | 'reroll',
): Promise<void> {
  if (!state.gameSettings.enableVariableUpdate) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: '变量更新未启用，无法手动重试。',
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  const batch = findRetryableVariableBatch(state.variableBatches, task.targetBatchId);
  if (!batch) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: '未找到可安全重试的失败变量批次。若上一批已有成功命令，为避免重复结算，请不要直接重跑整批。',
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  const assistant = findLinkedVariableBatchAssistant(state.chatHistory, batch);
  const userMessage = findLinkedVariableBatchUser(state.chatHistory, batch);
  const mainConfig = getActiveConfig();
  if (!assistant || !mainConfig) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: !assistant
        ? batch.associationStatus === 'ambiguous'
          ? '变量批次对应多个历史回合，无法安全确定正文；请使用单回合历史修复。'
          : '未找到变量批次对应的正文回合，已阻止回退到最新 assistant。'
        : '未配置主 API，无法重试变量结算。',
      targetBatchId: batch.id,
      turnId: batch.turnId,
      targetMessageId: batch.targetMessageId,
      targetUserMessageId: batch.targetUserMessageId,
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  const body = assistant.parsedResponse?.body?.trim() || assistant.content.trim();
  if (!body) {
    pushQueueTask(state, 'variable', 'failed', {
      detail: '当前正文为空，无法重试变量结算。',
      targetBatchId: batch.id,
      failCount: (task.failCount ?? 0) + 1,
    });
    return;
  }
  pushQueueTask(state, 'variable', 'pending', {
    detail: mode === 'reroll' ? '正在重生成变量结算结果。' : '正在重试变量结算。',
    turn: batch.turn,
    turnId: batch.turnId,
    targetMessageId: assistant.id,
    targetUserMessageId: userMessage?.id ?? batch.targetUserMessageId,
    targetBatchId: batch.id,
    retrying: true,
    failCount: task.failCount,
  });
  const overrides = await runVariableCalibrationStep({
    state,
    mainApiConfig: mainConfig,
    userInput: userMessage?.content ?? findPreviousUserInput(state.chatHistory, assistant.id),
    body,
    variableDraft: assistant.parsedResponse?.variableDraft,
    turnAfter: batch.turn + 1,
    memorySystemSnapshot: state.记忆,
    travelerSnapshot: state.旅人,
    worldSnapshot: state.世界,
    allowYiting: false,
    turnId: batch.turnId ?? assistant.turnId,
    targetMessageId: assistant.id,
    targetUserMessageId: userMessage?.id,
    mode: mode === 'reroll' ? 'reroll' : 'retry',
    supersedesBatchId: batch.id,
  });
  const retryBatch = overrides?.batch;
  const hasFailure = retryBatch?.results.some((result) => !result.ok && result.kind !== 'warning');
  const hasWarning = Boolean(retryBatch?.results.some((result) => !result.ok) || retryBatch?.coverage?.unresolvedTypes.length);
  pushQueueTask(state, 'variable', retryBatch ? hasFailure ? 'failed' : hasWarning ? 'warning' : 'success' : 'failed', {
    detail: retryBatch
      ? hasFailure
        ? '变量结算已重试，但仍存在失败命令，请展开查看原始信息。'
        : hasWarning
          ? `变量结算已重试并落地，但仍有待确认内容${retryBatch.coverage?.unresolvedTypes.length ? `：${retryBatch.coverage.unresolvedTypes.join('、')}` : ''}。`
          : '变量结算已重试并落地。'
      : '变量结算重试未返回结果。',
    turn: batch.turn,
    turnId: batch.turnId,
    targetMessageId: assistant.id,
    targetUserMessageId: userMessage?.id ?? batch.targetUserMessageId,
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
    '可以保留必要事实一致性，但正文展开方式必须明显不同；如果上一版已经处理某事件，本次不得因为重roll而把旧副作用当作已发生事实。',
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
  setStreamingMessage('');
  state.setWorkflowHint('忆庭召回 / 智库检索中');
  state.setWorkflowStatus('searching');
  state.setLiveRecallSummary('智库召回：检索中\n记忆召回：检索中');
  state.setLiveRecallFullContent('');
  pushQueueTask(state, 'main_story', 'pending', { detail: '正在调用主剧情模型。', cancellable: true });
  let pendingVariableStarted = false;
  let keepWorkflowHint = false;
  let rollbackHistoryOnAbort = state.chatHistory;
  let rollbackSnapshotOnAbort: 回合快照 | null = null;
  let turnStateCommitted = false;
  let visibilityPublisher: VisibilityBufferedPublisher | null = null;
  // Declared outside the stream setup so finally can always cancel a pending rAF commit.
  const streamMessageSetter = createRafCoalescedSetter(setStreamingMessage);
  let recoveryJournal = createWorkflowRecoveryJournal(userInput, state.turnCount);

  const startTime = Date.now();

  try {
    await persistWorkflowRecoveryJournal(recoveryJournal);

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
      // 回合前的 gameSettings 运行时字段：重 Roll/失败/中止时恢复，保证只有成功回合消费
      // cooldown/delay 与宏变量；不把 API Key 等无关设置复制进每条消息快照。
      gameSettingsTurnState: {
        macroGlobalVars: { ...(state.gameSettings.macroGlobalVars ?? {}) },
        worldbookTriggerStates: { ...(state.gameSettings.worldbookTriggerStates ?? {}) },
      },
    });
    rollbackSnapshotOnAbort = preTurnSnapshot;

    // 1. Add user message。同时把过往 assistant 上的 snapshot 全部清掉，只保留即将生成的最新一条，
    //    避免存档无限膨胀（snapshot 只服务"最近一次 reroll"，老的没用）。
    //    同时把 preTurnSnapshot 也挂到 user 消息上，这样主剧情生成失败（没有 assistant 消息）时，
    //    重roll 仍能找到快照回滚，不会误回退到上一回合。
    const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const userMsg = 创建聊天消息('user', userInput, {
      turnId,
      gameTime: `${state.turnCount}`,
      preTurnSnapshot,
    });
    recoveryJournal = updateWorkflowRecoveryJournal(recoveryJournal, { userMessageId: userMsg.id });
    await persistWorkflowRecoveryJournal(recoveryJournal);
    const purgedHistory = compactChatHistoryForLongSession(state.chatHistory.map((m) =>
      m.role === 'assistant' && m.preTurnSnapshot
        ? { ...m, preTurnSnapshot: undefined }
        : m,
    ));
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
    const zhikuRequestScope: ZhikuRequestScope = currentScope === 'opening'
      ? 'opening'
      : awakeningPhase === 'question'
        ? 'pathAwakeningQuestion'
        : awakeningPhase === 'judgement'
          ? 'pathAwakeningJudgement'
          : 'main';
    const zhikuParticipation = getZhikuCharacterParticipationForTurn({
      world: effectiveWorld,
      npcs: 筛选活跃NPC(state.NPC),
      history: updatedHistory,
      userInput,
      turnCount: state.turnCount,
      settings: state.gameSettings.记忆系统,
    });
    const openingArchiveText = 格式化开局档案上下文(effectiveWorld.开局档案);
    const worldbookCtx = buildPromptWorldbookContext({
      userInput,
      history: updatedHistory,
      world: effectiveWorld,
      travelerName: state.旅人.姓名,
      turnCount: state.turnCount,
      npcNames: zhikuParticipation.present,
      scope: currentScope,
      openingArchiveText,
      worldbookTriggerStates: state.gameSettings.worldbookTriggerStates,
    });
    const immediateStoryReviewForZhiku = !isOpeningSystemTrigger ? buildImmediateStoryReview(updatedHistory, Math.max(1, (state.gameSettings.记忆系统?.即时转短期阈值 ?? 10) - 1)) : '';
    const latestZhikuStoryPlan = [...updatedHistory]
      .reverse()
      .find((message) => message.role === 'assistant' && message.parsedResponse?.storyPlan?.trim())
      ?.parsedResponse?.storyPlan?.trim();
    const storyWeavingDiagnostics = state.gameSettings.剧情编织系统?.enabled && state.gameSettings.剧情编织系统.currentWindow
      ? getStoryWeavingInjectionDiagnostics(state.剧情编织)
      : null;
    const zhikuSceneContext = {
      ...worldbookCtx,
      startScenarioId: undefined,
      startSceneName: undefined,
      currentLocation: undefined,
      npcNames: [],
      presentNpcNamesForFallback: worldbookCtx.npcNames,
      anticipatedNpcNames: zhikuParticipation.anticipated,
      mentionedNpcNames: zhikuParticipation.mentioned,
      aiSupplementHints: {
        currentLocation: effectiveWorld.当前地点,
        presentNpcNames: worldbookCtx.npcNames,
        immediateStoryReview: immediateStoryReviewForZhiku,
        storyPlan: [
          latestZhikuStoryPlan,
          storyWeavingDiagnostics
            ? `当前剧情段：${storyWeavingDiagnostics.当前分段标题}；下一段预热：${storyWeavingDiagnostics.下一分段标题 || '无'}`
            : '',
        ].filter(Boolean).join('\n'),
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
      try {
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
        assertWorkflowActive();
        openingNewsPreprocessed = true;
        newsForPrompt = preNews?.news ?? state.新闻;
        openingNewsForSave = preNews?.news ?? null;
        pushQueueTask(state, 'news', 'success', {
          detail: preNews?.changed
            ? `开局新闻预处理完成，当前 ${preNews.news.length} 条新闻记录。`
            : preNews
              ? '开局新闻预处理完成，但本轮没有可写新闻变化。'
              : '开局新闻预处理未生成可用结果。',
        });
      } catch (err) {
        pushQueueTask(state, 'news', 'failed', {
          detail: err instanceof Error ? err.message : '开局新闻预处理失败。',
          failCount: state.gameSettings.新闻系统?.api.retryCount ?? 1,
        });
      }
    }
    const yitingEnabled = state.gameSettings.记忆系统?.忆庭启用 !== false;
    const yitingRecallEnabled = yitingEnabled && !isOpeningSystemTrigger && (state.gameSettings.记忆系统?.忆庭召回最早触发回合 ?? 10) < state.turnCount;
    const zhikuRecallEnabled = (zhikuRequestScope === 'main' || zhikuRequestScope === 'opening')
      && !!(state.gameSettings.智库系统?.enabled && state.智库 && worldbookCtx.recentUserInput);
    const zhikuAiSupplementEnabled = zhikuRecallEnabled && state.gameSettings.智库系统?.enableAiSupplement === true;
    const storyWeavingGate = state.gameSettings.剧情编织系统?.enabled && state.gameSettings.剧情编织系统.currentWindow
      ? evaluateStoryWeavingGate(state.剧情编织, worldbookCtx)
      : null;
    pushQueueTask(state, 'yiting', yitingRecallEnabled ? 'pending' : 'skipped', {
      detail: yitingRecallEnabled ? '正在检索回忆档案。' : '未到忆庭召回回合，已跳过。',
      cancellable: yitingRecallEnabled,
    });
    // 阶段1方案E·全知性防护：构建 NPC id→姓名 映射，供忆庭通讯回忆标记来源（对方:NPC名字）
    const yitingNpcNameMap = 筛选活跃NPC(state.NPC).reduce<Record<string, string>>((map, npc) => {
      if (npc.id && npc.姓名) map[npc.id] = npc.姓名;
      return map;
    }, {});
    let [yitingPreview, zhikuPreview] = await Promise.all([
      yitingRecallEnabled && state.忆庭 && recallQuery
        ? retrieveYitingContextWithModel(
            state.忆庭,
            recallQuery,
            state.gameSettings.记忆系统?.忆庭召回条数 ?? 8,
            state.gameSettings.记忆系统 ?? 创建默认记忆系统设置(),
            config,
            abortController.signal,
            state.gameSettings.记忆系统?.忆庭召回API.retryCount ?? 2,
            state.gameSettings.promptModules,
            yitingNpcNameMap,
          ).catch((err: unknown) => {
            pushQueueTask(state, 'yiting', 'failed', {
              detail: err instanceof Error ? err.message : '忆庭召回失败。',
              failCount: state.gameSettings.记忆系统?.忆庭召回API.retryCount ?? 1,
            });
            return null;
          })
        : Promise.resolve(null),
      !zhikuRecallEnabled
        ? Promise.resolve(compileZhikuTurn({
            system: undefined,
            query: zhikuRecallQuery,
            limit: state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries,
            scope: zhikuRequestScope,
            participation: zhikuParticipation,
            sceneContext: zhikuSceneContext,
          }))
        : zhikuAiSupplementEnabled
        ? compileZhikuTurnWithModel({
            system: state.智库,
            query: zhikuRecallQuery,
            limit: state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries,
            scope: zhikuRequestScope,
            participation: zhikuParticipation,
            settings: state.gameSettings.智库系统 ?? 创建默认智库系统设置(),
            mainConfig: config,
            signal: abortController.signal,
            retryCount: state.gameSettings.智库系统?.api.retryCount ?? 2,
            sceneContext: zhikuSceneContext,
            promptModules: state.gameSettings.promptModules,
          }).catch((err) => {
            console.warn('[zhiku-retrieval] 智库检索失败：', err);
            return compileZhikuTurn({
              system: state.智库,
              query: zhikuRecallQuery,
              limit: state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries,
              scope: zhikuRequestScope,
              participation: zhikuParticipation,
              sceneContext: zhikuSceneContext,
            });
          })
        : Promise.resolve(compileZhikuTurn({
            system: state.智库,
            query: zhikuRecallQuery,
            limit: state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries,
            scope: zhikuRequestScope,
            participation: zhikuParticipation,
            sceneContext: zhikuSceneContext,
          })),
    ]);
    assertWorkflowActive();
    // 剧情回忆静默注入：召回结果直接进入本轮上下文，不弹预览确认。
    const recallSummaryForTurn = [
      formatZhikuRecallSummary(zhikuPreview?.diagnostics),
      formatYitingRecallSummary(yitingPreview?.previewText),
    ].join('\n');
    const recallFullContentForTurn = [
      zhikuPreview.mainStoryInjection ? ['【智库完整召回】', zhikuPreview.mainStoryInjection].join('\n') : '',
      yitingPreview?.injection ? ['【记忆完整召回】', yitingPreview.injection].join('\n') : '',
    ].filter(Boolean).join('\n\n');
    state.setLiveRecallSummary(recallSummaryForTurn);
    state.setLiveRecallFullContent(recallFullContentForTurn);
    // 对标参考项目：回忆召回命中且关闭并存注入时，主剧情已暂停中期+长期+短期记忆注入。
    const yitingMutexActiveHint =
      state.gameSettings.记忆系统?.忆庭命中并存注入 !== true
      && Boolean(yitingPreview?.injection);
    const memoryHint = isOpeningSystemTrigger
      ? '开局专用上下文已注入：角色 / 场景 / 切入说明 / 开局世界书 / 开局 CoT'
      : state.gameSettings.enableMemoryInjection
      ? yitingMutexActiveHint
        ? `剧情回忆已命中，已暂停短期/中期/长期记忆注入（回忆承担旧事承接）；即时缓存 ${state.记忆.即时记忆.length} 条仅用于后续压缩`
        : `记忆上下文已注入：短期 ${state.记忆.短期记忆.length} 条 / 中期 ${(state.记忆.中期记忆 ?? []).length} 条 / 长期 ${state.记忆.长期记忆.length} 条${yitingPreview?.injection ? '；剧情回忆已命中并并存注入' : ''}；即时缓存 ${state.记忆.即时记忆.length} 条仅用于后续压缩`
      : '记忆上下文已跳过';
    const yitingHint = !yitingEnabled
      ? '忆庭召回已关闭'
      : yitingPreview?.entries.length
      ? `剧情回忆已召回：强 ${yitingPreview.strongEntries?.length ?? 0} 条 / 弱 ${yitingPreview.weakEntries?.length ?? 0} 条`
      : yitingRecallEnabled
        ? `忆庭已召回：${state.忆庭?.回忆档案?.length ? '无相关档案' : '当前还没有可召回档案'}`
        : `忆庭已召回：未到第${(state.gameSettings.记忆系统?.忆庭召回最早触发回合 ?? 10) + 1}回合`;
    const zhikuHint = state.gameSettings.智库系统?.enabled
      ? `智库内容已注入（${zhikuAiSupplementEnabled ? '关键词 + AI 补充' : '仅正文关键词'}）：${
          zhikuPreview?.entries.length
            ? zhikuPreview.entries.slice(0, 2).map((entry) => entry.标题).join('、')
            : '无相关条目'
        }`
      : '智库已跳过';
    state.setWorkflowHint(isOpeningSystemTrigger ? memoryHint : `${memoryHint} · ${yitingHint} · ${zhikuHint}`);
    state.setWorkflowStatus('done');
    const immediateStoryReview = !isOpeningSystemTrigger ? buildImmediateStoryReview(updatedHistory, Math.max(1, (state.gameSettings.记忆系统?.即时转短期阈值 ?? 10) - 1)) : '';
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
    const macroCtx: MacroContext = buildPromptMacroContext({
      history: updatedHistory,
      playerName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
      turnCount: state.turnCount,
      modelName: mainStoryConfig.model,
      maxContext: mainStoryConfig.maxContext,
      globals: prevGlobalSnapshot,
    });

    // 工作包A：世界书单回合唯一解析——builder 与触发状态提交共用同一 plan，不再重复筛选。
    const worldbookPlan = resolvePromptWorldbookPlan(
      state.worldbooks,
      worldbookCtx,
      state.gameSettings.enableWorldbookInjection,
    );
    // 工作包B：共享预处理——从回合前历史提取最近 1-2 条剧情规划（区5 剧情安排）
    const storyPlanSnippets = extractRecentStoryPlanSnippets(updatedHistory);
    // 工作包F：命途狭间回合判定（踏入/出题/评判）——提前声明供 builder 选择与后处理 scope gate 使用
    const isPathAwakeningTurn = isAwakeningEnterTrigger || awakeningPhase !== undefined;

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
          worldbookPlan ?? undefined,
          zhikuPreview,
        )
      : isPathAwakeningTurn
        ? buildPathAwakeningSystemPrompt(
            state.旅人,
            effectiveWorld,
            state.gameSettings,
            state.turnCount,
            state.worldbooks,
            worldbookCtx,
            zhikuPreview,
            awakeningPhase,
            storyRecallInjection || undefined,
            currentTriggerType,
            macroCtx,
            worldbookPlan ?? undefined,
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
          zhikuPreview,
          state.忆庭,
          state.手机,
          awakeningPhase,
          storyRecallInjection || (yitingRecallEnabled ? '' : undefined),
          (yitingPreview?.strongEntries?.length ?? 0) > 0,
          npcLedgerSelection,
          currentTriggerType,
          macroCtx,
          storyPlanSnippets,
          worldbookPlan ?? undefined,
        );

    // 宏引擎处理后计算 globalVars 候选（仅当 global 变化时）。不在 API 请求前 setGameSettings：
    // 只有成功提交的回合才保留宏全局变量变化，失败/停止/重 Roll 由回合快照恢复。
    const macroGlobalVarsAfter = Object.keys(macroCtx.global).length !== Object.keys(prevGlobalSnapshot).length
      || Object.entries(macroCtx.global).some(([k, v]) => prevGlobalSnapshot[k] !== v)
      ? { ...macroCtx.global }
      : prevGlobalSnapshot;

    // Phase 7.1：本回合世界书注入完成后计算触发状态表候选（用于 delay / cooldown 判断）。
    // 必须在 buildSystemPrompt 之后调用，保证本回合 cooldown 检查用的是上一回合的状态。
    // 同样只在成功回合结束时提交。
    // 工作包A：触发状态提交消费本回合 plan（不再重新筛选/重抽 probability）
    const worldbookTriggerStatesAfter = state.gameSettings.enableWorldbookInjection
      ? updateTriggerStatesAfterTurn(state.worldbooks, worldbookCtx, worldbookPlan ?? undefined)
      : state.gameSettings.worldbookTriggerStates;
    let systemPrompt = builtPrompt.systemPrompt;
    // 工作包B：天气已由 builder 作为区6 第3项统一组装，不再在此追加
    // Phase 4: In-Chat depth 注入。非 system 角色的模块消息按 depth 插入聊天历史。
    const moduleChatMessages = builtPrompt.chatModuleMessages;
    const nativeDepthMessages = moduleChatMessages.filter((m) => m._injectionPosition === 1);
    const currentPresetV2 = getCurrentSTPresetV2(state.gameSettings, getBuiltinPresetsV2());
    const shouldTryTavernV2 =
      state.gameSettings.enableStPreset !== false &&
      Boolean(currentPresetV2?.preset?.prompts?.length) &&
      Boolean(currentPresetV2?.preset?.prompt_order?.length);
    let tavernV2Messages: 聊天消息[] | null = null;
    let tavernV2Error: unknown = null;
    const recentHistory = awakeningPhase
      ? getPathAwakeningHistoryWindow(updatedHistory, awakeningPhase)
      : getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆);
    const tavernHistory = recentHistory.filter((msg) => msg.id !== userMsg.id);
    // 工作包G：初始重 Roll 约束只保留尾部 buildRerollGenerationGuard（B5）一份，删除 system 侧重复追加。

    if (shouldTryTavernV2 && currentPresetV2) {
      try {
        const latestTavernInput = isOpeningSystemTrigger
          ? openingInstruction
          : isAwakeningEnterTrigger
            ? awakeningInstruction
            : userInput;
        tavernV2Messages = buildTavernMessageChain({
          settings: state.gameSettings,
          preset: currentPresetV2.preset,
          characterId: state.gameSettings.currentStCharacterId ?? currentPresetV2.characterId ?? null,
          chatHistory: insertDepthIntoHistory(tavernHistory, nativeDepthMessages),
          latestUserInput: latestTavernInput,
          playerName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
          playerRole: state.旅人,
          includeNativeContextInWorldbook: false,
          triggerType: currentTriggerType,
          macroCtx,
          // 工作包D：scope-aware 兼容保护（main/opening/pathAwakening 各读对应 COT）
          scope: isOpeningSystemTrigger ? 'opening' : (isPathAwakeningTurn ? 'pathAwakening' : 'main'),
        }).map((msg) => 创建聊天消息(msg.role, msg.content));
        if (tavernV2Messages.length === 0) {
          tavernV2Messages = null;
          tavernV2Error = new Error('ST V2 消息链为空，已回退 legacy 主剧情路径');
          console.warn('[ST V2] 消息链为空，已回退 legacy 主剧情路径');
        }
      } catch (error) {
        tavernV2Messages = null;
        tavernV2Error = error;
        console.warn('[ST V2] 消息链构建失败，已回退 legacy 主剧情路径', error);
      }
    }

    // 3. Prepare messages for API（工作包C：五种消息模式分层组装）
    const apiMessages: 聊天消息[] = [];
    // 回合前历史（排除本轮输入——本轮输入在任务序列中只出现一次）
    const preTurnHistory: 聊天消息[] = [];
    for (const msg of recentHistory) {
      if (msg.id === userMsg.id) continue;
      if (msg.role === 'user' && msg.content.startsWith('[系统]')) continue;
      if (msg.role === 'user') {
        preTurnHistory.push(msg);
      } else if (msg.role === 'assistant' && msg.parsedResponse) {
        preTurnHistory.push(创建聊天消息('assistant', buildLeanAssistantHistoryContent(msg)));
      }
    }

    const providerCapabilities = resolveChatProviderCapabilities(mainStoryConfig);
    const deepSeekMainMode = state.gameSettings.deepSeekMainMode ?? 'off';
    const deepSeekTransportActive = providerCapabilities.transport === 'deepseek' && deepSeekMainMode !== 'off';
    const deepSeekMainActive = deepSeekTransportActive
      && !tavernV2Messages
      && !isOpeningSystemTrigger
      && !isPathAwakeningTurn;
    const deepSeekLockFormat = deepSeekTransportActive && deepSeekMainMode === 'lock_format';

    // 模式判定（工作包C）：有效 Tavern V2 → DeepSeek lock_format → DeepSeek standard → cot_pseudo → standard。
    // opening / 命途狭间（踏入/出题/评判）走专用尾部，不派生 cot_pseudo。
    const messageMode: MainStoryMessageMode = isOpeningSystemTrigger || isPathAwakeningTurn
      ? 'standard'
      : deriveMainStoryMessageMode({
          tavernV2Active: Boolean(tavernV2Messages),
          deepSeekMainActive,
          deepSeekLockFormat,
          enableCotFakeHistory: state.gameSettings.enableCotFakeHistory,
        });

    // position=0 兼容消息（user/assistant 角色模块，保持角色，位于任务序列之前）
    const positionZeroCompatMessages = moduleChatMessages
      .filter((m) => m._injectionPosition === 0 && m.role !== 'system')
      .sort((a, b) => (a._injectionOrder ?? 0) - (b._injectionOrder ?? 0))
      .map((m) => 创建聊天消息(m.role === 'assistant' ? 'assistant' : 'user', m.content));
    // depth 消息（position=1 模块 → 历史窗口内部插入）
    const depthMessages = tavernV2Messages ? [] : nativeDepthMessages;

    // 本回合条件约束（B2 开局/踏入指令、B3 狭间评判提醒、B4 DeepSeek守卫、B5 重roll守卫）
    const turnConstraints: 聊天消息[] = [];
    if (isOpeningSystemTrigger && !tavernV2Messages) {
      turnConstraints.push(创建聊天消息('user', openingInstruction));
    }
    // [系统] 触发被 API 过滤 → 必须额外推一条真实指令,否则 AI 收到空白消息直接卡住。
    if (isAwakeningEnterTrigger && awakeningInstruction && !tavernV2Messages) {
      turnConstraints.push(创建聊天消息('user', awakeningInstruction));
    }
    // 评判回合:再追加一条系统级提醒,强化「必输 <狭间评判> 标签」的指令优先级。
    // 实践中,AI 若只在 system prompt 里看到此规则,容易在长正文里漏掉标签;把它升到 user 末尾会显著提高遵循率。
    if (awakeningPhase === 'judgement') {
      turnConstraints.push(
        创建聊天消息(
          'user',
          '⚠ 命途狭间·回应回合提醒:你上一回合已出三题,玩家本轮给出了答案。本回合**必须**在所有标签之外、**单独**写一行 `<狭间评判>升阶</狭间评判>`。命途狭间没有失败、滞留或退转;三问只是让玩家明确自己的道路。漏掉这个标签会让玩家永远卡在虚境无法升阶——这是必须避免的错误。同时正文里要让命途意志回应玩家答案、确认其道路,再把旅人从虚境拉回现实场景。',
        ),
      );
    }
    if (deepSeekMainActive) {
      turnConstraints.push(创建聊天消息('user', DEEPSEEK_MAIN_FORMAT_GUARD));
    }
    if (deps.rerollContext && !isOpeningSystemTrigger) {
      turnConstraints.push(创建聊天消息(
        'user',
        buildRerollGenerationGuard(deps.rerollContext.nonce, deps.rerollContext.previousResponse),
      ));
    }

    // 区E 执法块（main scope：普通回合与 Tavern V2 均包含一次；由统一 finalizer 置于任务序列之前）
    const enforcementBlock = (
      zhikuRequestScope === 'main'
      || zhikuRequestScope === 'opening'
      || zhikuRequestScope === 'pathAwakeningQuestion'
      || zhikuRequestScope === 'pathAwakeningJudgement'
    )
      ? buildMainTurnEnforcementBlock({
          playerName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
          narrativePerson: state.gameSettings.narrativePerson,
          wordCountTarget: state.gameSettings.wordCountTarget,
          zhikuCharacterBrief: zhikuPreview.characterEnforcementBrief,
          storyWeavingActive: Boolean(state.gameSettings.剧情编织系统?.enabled && state.gameSettings.剧情编织系统.currentWindow),
          speechExpansionActive: resolvePlayerSpeechMode(state.gameSettings) === 'expansion',
        })
      : undefined;

    // 任务序列（按模式）：
    // - cot_pseudo：尾部三连（assistant 包装输入 → user 开始任务 → assistant 最小伪装）
    // - tavern_v2：Tavern 消息链
    // - opening/狭间踏入：指令已在 turnConstraints，任务序列为空
    // - standard / deepseek / 评判回合：真实输入（userMsg）一次
    let taskSequence: 聊天消息[];
    if (messageMode === 'cot_pseudo') {
      taskSequence = buildCotPseudoTaskSequence(userInput);
    } else if (tavernV2Messages) {
      taskSequence = tavernV2Messages;
    } else if (isOpeningSystemTrigger || isAwakeningEnterTrigger) {
      taskSequence = [];
    } else {
      taskSequence = [userMsg];
    }

    // Phase 4/7：assistant prefill（工作包C 8.6：cot_pseudo / Tavern V2 / DeepSeek 不叠加普通 preset prefill）
    const currentPresetId = state.gameSettings.currentStPresetId;
    const allPresets = [
      ...getBuiltinPresets(),
      ...(state.gameSettings.stPresets ?? []),
    ];
    const currentPreset = currentPresetId
      ? allPresets.find((p) => p.id === currentPresetId)
      : undefined;
    const presetAssistantPrefill = currentPreset?.assistantPrefill;
    let effectivePrefixMode = false;
    let effectivePrefixContent: string | undefined;
    if (messageMode === 'deepseek_prefix' || ((isOpeningSystemTrigger || isPathAwakeningTurn) && !tavernV2Messages && deepSeekLockFormat)) {
      // DeepSeek lock_format 必须固定从 <thinking>\n 续写
      effectivePrefixMode = true;
      effectivePrefixContent = '<thinking>\n';
    } else if (messageMode === 'standard' && !isOpeningSystemTrigger && !isPathAwakeningTurn && presetAssistantPrefill) {
      effectivePrefixMode = true;
      effectivePrefixContent = presetAssistantPrefill;
    }

    const shouldStreamMainRequest = state.gameSettings.enableStreaming && !isPageHidden();
    const mainRequestMode: 'stream' | 'non-stream' = shouldStreamMainRequest ? 'stream' : 'non-stream';
    const finalizedMainRequest = finalizeMainRequest({
      config: mainStoryConfig,
      systemPrompt,
      mode: messageMode,
      preTurnHistory: tavernV2Messages ? [] : preTurnHistory,
      depthMessages,
      positionZeroCompatMessages,
      turnConstraints,
      enforcementBlock,
      taskSequence,
      prefixMode: effectivePrefixMode,
      prefixContent: effectivePrefixContent,
      streaming: shouldStreamMainRequest,
      scope: zhikuRequestScope,
      zhikuCompileId: zhikuPreview.compileId,
    });
    systemPrompt = finalizedMainRequest.systemPrompt;
    apiMessages.length = 0;
    apiMessages.push(...finalizedMainRequest.messages);

    // 4. Stream AI response（含自动重试循环）
    let streamedText = '';
    let streamEventCount = 0;
    let previewText = '';
    let previewEpoch = 0;
    let previewChain: Promise<void> = Promise.resolve();
    visibilityPublisher = typeof document === 'undefined'
      ? null
      : createVisibilityBufferedPublisher({
          source: createDocumentVisibilitySource(document),
          commit: (text) => {
            previewEpoch += 1;
            previewText = text;
            streamMessageSetter.flush(text);
          },
        });
    let result: Awaited<ReturnType<typeof sendChatMessage>>;
    const configuredMaxAttempts = state.gameSettings.autoRetryOnError
      ? Math.max(1, state.gameSettings.autoRetryCount) + 1
      : 1;
    const maxAttempts = (deepSeekMainActive || deps.rerollContext) ? Math.max(2, configuredMaxAttempts) : configuredMaxAttempts;
    let lastErr: unknown = null;
    let deepSeekProtocolIssuesForTurn: string[] = [];
    let rerollSimilarityForTurn: number | undefined;
    let rerollSimilarityRetried = false;
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt++;
      streamedText = '';
      streamEventCount = 0;
      previewText = '';
      previewEpoch += 1;
      previewChain = Promise.resolve();
      streamMessageSetter.flush('');
      try {
        result = await sendChatMessage(mainStoryConfig, {
          messages: apiMessages,
          systemPrompt,
          onDelta: (delta) => {
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
                if (abortController.signal.aborted || deltaPreviewEpoch !== previewEpoch) return;
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
          repairTags: state.gameSettings.enableTagRepair,
          prefixMode: finalizedMainRequest.prefixMode,
          prefixContent: finalizedMainRequest.prefixContent,
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
              parsed: parseResponse(regexCleanup.text, { repair: state.gameSettings.enableTagRepair }),
            };
            streamedText = regexCleanup.text;
            console.info('[ST V2] 已执行安全输出正则清理:', regexCleanup.applied);
          }
        }
        const candidateText = (result.parsed.body?.trim() || result.fullText.trim() || streamedText.trim());
        // 抗空回检测：完全空，或纯标签无正文（isEmptyResponse 判断所有协议字段都为空）
        const isBlankResponse = !candidateText || isEmptyResponse(result.parsed);
        if (isBlankResponse) {
          void appendApiErrorReport({
            source: '主剧情工作流',
            config: mainStoryConfig,
            requestMode: mainRequestMode,
            error: new Error(`返回空响应，触发自动重试。主剧情第 ${attempt}/${maxAttempts} 次${isEmptyResponse(result.parsed) ? '（纯标签无正文）' : ''}。`),
            responseText: result.fullText || streamedText || '（空响应）',
          });
          if (attempt < Math.max(2, maxAttempts)) {
            console.warn(`[sendWorkflow] 第 ${attempt} 次返回空响应${isEmptyResponse(result.parsed) ? '（纯标签无正文）' : ''}，自动重试。`);
            continue;
          }
          throw new Error('AI response was empty');
        }
        // 主剧情不再执行“截断续写”自动重试。
        // 兼容模型常省略闭合标签，误判后续写会把完整上文回填进历史并污染下一轮。
        // 缺失标签统一交给 parseResponse/repairTags/sanitizeParsedResponse 兜底处理。
        const rerollSimilarity = deps.rerollContext
          ? calculateRerollSimilarity(candidateText, deps.rerollContext.previousResponse)
          : 0;
        if (deps.rerollContext) {
          rerollSimilarityForTurn = rerollSimilarity;
        }
        if (deps.rerollContext && !rerollSimilarityRetried && rerollSimilarity >= 0.86 && attempt < maxAttempts) {
          rerollSimilarityRetried = true;
          void appendApiErrorReport({
            source: '重roll相似度校验',
            config: mainStoryConfig,
            requestMode: mainRequestMode,
            error: new Error(`主剧情第 ${attempt}/${maxAttempts} 次重roll结果与上一版过于相似，相似度 ${Math.round(rerollSimilarity * 100)}%。`),
            responseText: result.fullText || streamedText || candidateText,
          });
          apiMessages.push(创建聊天消息('user', buildRerollSimilarityRetryGuard(deps.rerollContext.previousResponse, rerollSimilarity)));
          pushQueueTask(state, 'main_story', 'pending', {
            detail: '重roll结果与上一版过于相似，正在强制换写。',
            failCount: attempt,
            retrying: true,
            cancellable: true,
          });
          console.warn(`[sendWorkflow] 第 ${attempt}/${maxAttempts} 次重roll与上一版过于相似，自动换写，相似度：${rerollSimilarity.toFixed(3)}`);
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
            requestMode: mainRequestMode,
            error: new Error(`主剧情第 ${attempt}/${maxAttempts} 次输出协议不完整：${protocolIssues.join('；')}`),
            responseText: result.fullText || streamedText || '（空响应）',
          });
          if (attempt < maxAttempts) {
            apiMessages.push(创建聊天消息('user', buildDeepSeekProtocolRetryGuard(protocolIssues)));
            pushQueueTask(state, 'main_story', 'pending', {
              detail: `DeepSeek 输出协议不完整，正在重试：${protocolIssues.join('；')}`,
              failCount: attempt,
              retrying: true,
              cancellable: true,
            });
            console.warn(`[sendWorkflow] DeepSeek 第 ${attempt}/${maxAttempts} 次输出协议不完整，自动重试：`, protocolIssues);
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
            requestMode: mainRequestMode,
            error: innerErr,
            responseText: streamedText || previewText || '',
          });
        }
        if (isNonRetryableAIError(innerErr) || attempt >= maxAttempts) break;
        pushQueueTask(state, 'main_story', 'pending', {
          detail: `主剧情生成失败 ${attempt} 次，正在自动重试。`,
          failCount: attempt,
          retrying: true,
          cancellable: true,
        });
        console.warn(`[sendWorkflow] 第 ${attempt}/${maxAttempts} 次尝试失败，自动重试：`, innerErr);
      }
    }
    if (lastErr) throw lastErr;
    // 进入下面流程：result 一定已被赋值（lastErr 为空意味着 break 出循环）
    result = result!;

    visibilityPublisher?.flush();

    if (abortController.signal.aborted || !isCurrentWorkflow()) return;

    // 5. Build AI message
    const duration = (Date.now() - startTime) / 1000;
    pushQueueTask(state, 'main_story', 'success', {
      detail: `正文生成完成，用时 ${Math.round(duration)}s。`,
    });
    const cleanedParsed = sanitizeParsedResponse(result.parsed, state.gameSettings.额外功能);
    const normalizedPlayerSpeech = normalizePlayerSpeechBody({
      body: cleanedParsed.body?.trim() ?? '',
      playerName: state.旅人.姓名 || state.旅人.别名 || '你',
      playerAliases: [state.旅人.姓名, state.旅人.别名].filter((name): name is string => Boolean(name?.trim())),
      userInput,
      mode: resolvePlayerSpeechMode(state.gameSettings),
    });
    let finalBody = stripLeakedHistoryMetaFromBody(sanitizeContaminatedText(normalizedPlayerSpeech.body, state.gameSettings.额外功能));
    finalBody = serializeNarrativeBody(parseNarrativeBody(finalBody, {
      traveler: state.旅人,
      userInput,
      partial: false,
    }));
    const sanitizedRawText = replaceBodyInRawResponse(
      cleanedParsed.rawText || result.fullText || streamedText,
      finalBody,
    );
    const displayText = finalBody || sanitizeContaminatedText(result.fullText || streamedText, state.gameSettings.额外功能);
    if (state.gameSettings.enableStreaming) {
      if (streamEventCount > 0) {
        await previewChain;
      } else if (displayText.trim()) {
        await revealStreamingPreview(state, displayText, abortController.signal, {
          delayMs: 16,
          minChunks: 8,
        });
      }
      streamMessageSetter.flush('');
    } else {
      streamMessageSetter.cancel();
    }
    // 给狭间消息预先打上 awakenPathId 标签:出题/评判回合,此时 effectiveWorld.进行中狭间 还没清空,
    // 把命途 ID 写进 parsedResponse,让 TurnItem 在 进行中狭间 清空后仍能拿到命途名做美化。
    // 兜底:如果 effectiveWorld 当前帧没拿到(罕见 race),从 chatHistory 向前找最近一条出题消息
    // 取它的 awakenPathId,确保评判消息一定拿得到命途名。
    const isAwakeningTurn =
      !!(cleanedParsed.awakenQuestions?.trim() || cleanedParsed.awakenJudgement?.trim());
    let awakenPathId = '';
    if (isAwakeningTurn) {
      awakenPathId = effectiveWorld.进行中狭间 ?? '';
      if (!awakenPathId) {
        for (let i = updatedHistory.length - 1; i >= 0; i--) {
          const prev = updatedHistory[i];
          const prevPid = prev?.parsedResponse?.awakenPathId;
          if (prevPid) {
            awakenPathId = prevPid;
            break;
          }
        }
      }
    }
    const baseParsed = finalBody
      ? { ...cleanedParsed, body: finalBody, rawText: sanitizedRawText }
      : { ...cleanedParsed, body: displayText, rawText: sanitizedRawText };
    const parsedForDisplay = awakenPathId
      ? { ...baseParsed, awakenPathId }
      : baseParsed;
    const actualMainRequestHash = createMainRequestHash({
      systemPrompt,
      messages: apiMessages,
      prefixMode: finalizedMainRequest.prefixMode,
      prefixContent: finalizedMainRequest.prefixContent,
      scope: zhikuRequestScope,
      zhikuCompileId: zhikuPreview.compileId,
      transport: finalizedMainRequest.capabilities.transport,
      endpoint: finalizedMainRequest.capabilities.endpoint,
      streaming: shouldStreamMainRequest,
    });
    const tokenUsage = buildTurnTokenUsage({
      apiUsage: result.usage,
      systemPrompt,
      messages: apiMessages,
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
      messages: apiMessages,
      previous: previousDebugContext
        ? {
            systemPrompt: previousDebugContext.systemPrompt,
            messages: previousDebugContext.messages,
          }
        : undefined,
    });
    const aiMsg = 创建聊天消息('assistant', displayText, {
      turnId,
      gameTime: [state.世界.当前日期, state.世界.当前时间].filter(Boolean).join(' ').trim() || `${state.turnCount}`,
      parsedResponse: parsedForDisplay,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      tokenUsage,
      responseDurationSec: duration,
      preTurnSnapshot,
      debugContext: {
        systemPrompt,
        messages: apiMessages.map((msg) => ({ role: msg.role, content: msg.content })),
        requestHash: actualMainRequestHash,
        requestCapabilities: finalizedMainRequest.capabilities,
        deepSeekMainMode: deepSeekMainActive ? deepSeekMainMode : 'off',
        deepSeekCotFakeHistorySkipped: deepSeekMainActive && state.gameSettings.enableCotFakeHistory === true,
        deepSeekPrefixMode: finalizedMainRequest.prefixMode,
        deepSeekProtocolIssues: deepSeekProtocolIssuesForTurn,
        deepSeekMainOriginalModel: result.deepSeekRecovery?.originalModel,
        deepSeekMainAdaptedModel: result.deepSeekRecovery?.fallbackModel
          ?? (result.deepSeekRecovery?.initialModel !== result.deepSeekRecovery?.originalModel
            ? result.deepSeekRecovery?.initialModel
            : undefined),
        stV2Attempted: shouldTryTavernV2,
        stV2Used: Boolean(tavernV2Messages),
        stV2FallbackReason: tavernV2Error instanceof Error ? tavernV2Error.message : tavernV2Error ? String(tavernV2Error) : undefined,
        playerSpeechCorrections: normalizedPlayerSpeech.corrections.length
          ? normalizedPlayerSpeech.corrections
          : undefined,
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
    recoveryJournal = updateWorkflowRecoveryJournal(recoveryJournal, {
      phase: 'variable_settlement',
      assistantMessageId: aiMsg.id,
    });
    await persistWorkflowRecoveryJournal(recoveryJournal);
    let finalHistory = [...updatedHistory, aiMsg];
    // assistant 消息已携带 preTurnSnapshot，清掉 user 消息上的，避免存档膨胀
    const userMsgIdx = finalHistory.findIndex((m) => m.id === userMsg.id);
    if (userMsgIdx >= 0 && finalHistory[userMsgIdx].preTurnSnapshot) {
      finalHistory = finalHistory.map((m, i) => i === userMsgIdx ? { ...m, preTurnSnapshot: undefined } : m);
    }
    finalHistory = compactChatHistoryForLongSession(finalHistory);
    state.setChatHistory(finalHistory);
    state.setTurnCount((prev) => prev + 1);
    streamMessageSetter.flush('');
    state.setLoading(false);
    state.setPendingVariable(true);
    pendingVariableStarted = true;

    // 6. Update memory（对标参考项目：回合记忆写入 = 即时条目【时间+玩家输入+正文】+ 短期条目【AI shortTerm】+ 写入四段记忆）
    pushQueueTask(state, 'memory', 'pending', { detail: '正在写入即时记忆并检查压缩阈值。' });
    const memoryGameTime = [state.世界.当前日期, state.世界.当前时间].filter(Boolean).join(' ').trim();
    // 开局系统回合省略玩家输入（触发指令不是玩家发言，对齐参考项目开局写入语义）
    const 回合即时条目 = 构建即时记忆条目(
      memoryGameTime,
      isOpeningSystemTrigger ? '' : userInput,
      displayText,
      { 省略玩家输入: isOpeningSystemTrigger },
    );
    const 回合短期条目 = 构建短期记忆条目(memoryGameTime, parsedForDisplay.memory ?? '', displayText);
    const 记忆写入结果 = 写入四段记忆(state.记忆, 回合即时条目, 回合短期条目, {
      immediateLimit: state.gameSettings.记忆系统?.即时转短期阈值 ?? 10,
      recallRound: (state.忆庭?.回忆档案?.length ?? 0) + 1,
      gameTime: memoryGameTime,
    });
    let mem = 记忆写入结果.memory;
    // 回忆条目（每回合一条，名称【回忆N】）在回合后段汇入忆庭档案（yitingBase 合并处）。
    let pendingRecallEntry = 记忆写入结果.recallEntry;

    // 阶段1主链压缩：阈值常量提前计算，压缩结算统一推迟到本回合所有会修改记忆的
    // 步骤（剧情推进 / NPC 事实 / 忆庭入库）完成后，以最终记忆切片创建压缩请求。
    const memorySettings = state.gameSettings.记忆系统 ?? 创建默认记忆系统设置();
    const shortThreshold = memorySettings.短期转中期阈值 ?? 30;
    const middleThreshold = memorySettings.中期转长期阈值 ?? 50;
    const yitingWithCompression = state.忆庭;

    // 7 / 7a / 7b. 世界 + 旅人 的本回合修改全部累计到本地变量,最后一次性 set。
    //     这样在 8.5 变量校准里能拿到这些修改作为 snapshot——否则变量模型 commit 时
    //     会用「函数开始那一刻的 state.世界」覆盖,把刚写入的 待触发狭间/进行中狭间 抹掉,
    //     表现就是「狭间邀请卡片在变量校准结束后突然消失」。
    //     worldAfter 用 effectiveWorld 初始化(踏入触发已经把 进行中狭间 写入)。
    let worldAfter: typeof state.世界 = 归一化世界状态(effectiveWorld);
    let travelerAfter: typeof state.旅人 = state.旅人;

    // 7. 全局事件——R3 起移除 <动态世界> 的正式写入：parsedForDisplay.worldEvents 只作为世界演变线索
    //    （见步骤 4 dynamicWorldClues）；世界.全局事件 仅保留兼容显示投影，只能由已提交事实生成
    //    显示 label（见 R2/R3 提交点 displayLabels），label 不是事实 owner，不得反向生成事实。

    // 7a. 命途狭间·邀请发出 → 写入 世界.待触发狭间
    //     校验:必须是已踏上 + 待升阶 的命途,才允许邀请落地。AI 偶发误标(把已经过去的命途
    //     又邀请一次)直接静默丢弃。
    if (parsedForDisplay.awakenInvite?.trim() && !worldAfter.待触发狭间 && !worldAfter.进行中狭间) {
      const invitedId = 解析命途ID(parsedForDisplay.awakenInvite);
      if (invitedId) {
        const target = (travelerAfter.命途列表 ?? []).find((p) => p.id === invitedId);
        if (target?.待升阶) {
          worldAfter = { ...worldAfter, 待触发狭间: invitedId };
        } else {
          console.warn('[sendWorkflow] 命途狭间邀请被忽略:目标命途未达待升阶状态:', invitedId);
        }
      } else {
        console.warn('[sendWorkflow] 无法解析狭间邀请的命途 ID:', parsedForDisplay.awakenInvite);
      }
    }

    // 7b. 命途狭间·评判落地 → 调用 应用狭间结果,清空 世界.进行中狭间
    if (parsedForDisplay.awakenJudgement?.trim() && worldAfter.进行中狭间) {
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
        if (res.ok) {
          travelerAfter = res.traveler;
        } else {
          console.warn('[sendWorkflow] 应用狭间结果失败:', res.reason);
        }
        // 不论成功失败都清掉 进行中狭间,避免卡死在狭间回合
        worldAfter = { ...worldAfter, 进行中狭间: undefined };
      } else {
        console.warn('[sendWorkflow] 无法识别的狭间评判:', judgementRaw);
      }
    }

    // 天气解析：从 AI 响应中提取 <天气> 标签，写入世界状态
    // 注意:此处 worldAfter.当前地点 仍是本回合开始前的旧地点,变量模型尚未运行。
    // 如果 AI 同回合切地点+换天气(如 黑塔空间站→罗浮 + 星海潮汐),用旧地点校验会误拒。
    // 因此只要天气 ID 合法(解析天气标签 已校验过中文→ID 映射)就直接接受,
    // 地点白名单仅作 prompt 引导,不强制校验。
    const rawResponseTextForTurn = result.fullText || displayText;
    const 天气 = 解析天气标签(rawResponseTextForTurn);
    if (天气) {
      if (!验证天气合法性(天气, worldAfter.当前地点)) {
        console.info('[天气] 天气与当前地点白名单不匹配，仍接受（地点可能在本回合由变量模型更新）:', 天气, '| 旧地点:', worldAfter.当前地点);
      }
      worldAfter = { ...worldAfter, 当前天气: 天气 };
    }

    result.fullText = '';
    result.parsed = parseResponse('');
    result.usage = undefined;
    apiMessages.length = 0;
    systemPrompt = '';
    streamedText = '';
    previewText = '';
    tavernV2Messages = null;

    // 旅人仍沿用既有变量校准前快照；剧情编织运行时切片的世界提交延后到 R2 唯一提交点。
    if (travelerAfter !== state.旅人) state.set旅人(travelerAfter);

    // 8.5 变量模型校准：主回复完成 → 调用独立的变量模型分析正文，把结构化命令落地。
    //     失败/超时不影响主流程，只在 console 报警。
    pushQueueTask(state, 'variable', state.gameSettings.enableVariableUpdate ? 'pending' : 'skipped', {
      detail: state.gameSettings.enableVariableUpdate ? '正在调用变量模型校准正文。' : '变量更新未启用，已跳过。',
      turn: state.turnCount,
      turnId,
      targetMessageId: aiMsg.id,
      targetUserMessageId: userMsg.id,
    });
    const variableOverrides = await runVariableCalibrationStep({
      pathAwakeningTurn: isPathAwakeningTurn,
      state,
      mainApiConfig: config,
      userInput,
      body: displayText,
      variableDraft: parsedForDisplay.variableDraft,
      turnAfter: state.turnCount + 1,
      // 本回合主流程已经更新过的切片，传入保证变量模型看到最新值
      memorySystemSnapshot: mem,
      // 7/7a/7b 累积的 旅人 / 世界 也要带进去——否则校准 commit 会用旧值覆盖,
      // 把刚写入的 待触发狭间 / 应用狭间结果后的命途列表抹掉。
      travelerSnapshot: travelerAfter,
      worldSnapshot: worldAfter,
      deferWorldCommit: true,
      signal: abortController.signal,
      allowYiting: yitingEnabled,
      shouldCommit: isCurrentWorkflow,
      // 阶段1约定系统·写入环：把recall召回的通讯回忆拼成recallContext传给variableModel
      // AI 从中提取玩家与NPC在手机里建立的约定，用 agreement 事实输出
      recallContext: yitingPreview?.entries?.length
        ? yitingPreview.entries
            .filter((entry) => entry.分类 === '通讯')
            .map((entry) => {
              const title = entry.名称 || `第${entry.回合}回合回忆`;
              const body = entry.摘要 || entry.原文 || '';
              return `${title}：${body}`;
            })
            .join('\n\n')
        : undefined,
      turnId,
      targetMessageId: aiMsg.id,
      targetUserMessageId: userMsg.id,
      });
      assertWorkflowActive();
      // 变量批次先由校准步骤写入历史；若后续连续性守卫冻结地点，下面会把该地点命令
      // 标记为 rejected 并替换历史回执，避免“预演成功”被玩家误读成“正式已生效”。
      let variableBatchForSave = variableOverrides?.batch;
      // 连续性守卫先观察变量候选，再进入剧情裁决；跨区域候选不能等裁决完成后才拦截。
      const continuityVariableDecision = variableOverrides?.世界
        ? evaluateStoryContinuity({
            phase: 'post_variable',
            currentRegionId: effectiveWorld.当前区域ID,
            currentLocation: effectiveWorld.当前地点,
            openingRegionId: effectiveWorld.开局档案?.地区ID,
            candidateRegionId: inferStoryRegionId(variableOverrides.世界.当前地点),
            candidateLocation: variableOverrides.世界.当前地点,
            evidenceText: displayText,
          })
        : undefined;
      if (state.gameSettings.enableVariableUpdate) {
        const variableApplied = Boolean(variableOverrides && Object.keys(variableOverrides).some((key) => key !== 'batch' && key !== 'npcLedgerUpdate' && key !== 'coverage'));
        const unresolvedCoverage = variableOverrides?.coverage?.unresolvedTypes ?? variableOverrides?.batch?.coverage?.unresolvedTypes ?? [];
        const batchHasFailure = Boolean(variableOverrides?.batch?.results.some((result) => !result.ok && result.kind !== 'warning'));
        const batchHasWarning = Boolean(variableOverrides?.batch?.results.some((result) => !result.ok) || unresolvedCoverage.length);
        pushQueueTask(state, 'variable', batchHasFailure ? 'failed' : batchHasWarning ? 'warning' : 'success', {
          detail: batchHasFailure
            ? '变量结算存在解析或执行失败，请展开查看变量报告。'
            : unresolvedCoverage.length
              ? `${variableApplied ? '变量命令已落地，但' : '变量报告已记录，但'}仍有疑似未确认类别：${unresolvedCoverage.join('、')}。`
              : batchHasWarning
                ? '变量命令已落地，但部分候选事实被规则层忽略，请展开查看变量报告。'
                : variableApplied
                  ? '变量命令已落地。'
                  : '本回合没有可落地的变量命令，已记录变量报告。',
        });
      }

      const npcSource = variableOverrides?.NPC ?? state.NPC;
      const archiveEnrichment = enrichNpcArchives(npcSource, {
        nsfwEnabled: state.gameSettings.enableNsfw,
        maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
      });

      // NSFW 基线补建：开启 NSFW 后，把需要补建基线的 NPC 信息传给变量模型，
      // 变量模型在变量更新那一次调用里顺带生成 NSFW 基线档案，走正常 nsfw_archive facts 落库链路。
      const npcSourceForCompression = archiveEnrichment.records;
      const npcSourceForCompressionReady = 整理NPC记录列表(npcSourceForCompression, state.turnCount + 1);
      const npcMemorySettings = state.gameSettings.记忆系统 ?? 创建默认记忆系统设置();
      const npcCompressionSummaryTriggered: string[] = [];
      let npcAfterCompression = npcSourceForCompressionReady.map((npc) => {
        const ledgerCompression = compressNpcMemoryLedger({
          npcId: npc.id,
          entries: npc.同行记忆 ?? [],
          summaries: npc.总结记忆 ?? [],
          threshold: npcMemorySettings.NPC记忆压缩阈值,
          prompt: npcMemorySettings.NPC记忆压缩提示词,
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
      // ═══ R2：联合裁决唯一提交点（计划 §6 R2 12 步：世界先处理、剧情再读取、一次提交）═══
      // 步骤 0：回合前基线（只读，不修改正式状态）。运行时切片随普通存档/回合快照保存在 世界.剧情运行时。
      const baselineSlice = effectiveWorld.剧情运行时;
      const runtimeRevision = baselineSlice?.runtimeRevision ?? 0;
      const runtimeBranchId = baselineSlice?.runtimeBranchId ?? 'branch:main';
      const gameTime = gameTimeOf(effectiveWorld);
      const runtimeProjection = isOpeningSystemTrigger ? null : buildStoryWeavingRuntimeProjection({
        system: state.剧情编织,
        legacyWorldEventStrings: worldAfter.全局事件,
        historyArchives: state.剧情编织.当前进度?.历史归档,
      });
      const runtimeSeries = runtimeProjection
        ? state.剧情编织.系列列表.find((item) => item.id === runtimeProjection.currentFocus.trackId)
        : undefined;
      const runtimeCurrentSegment = runtimeSeries
        ?.分段列表.find((segment) => segment.id === runtimeProjection?.currentUnit.segmentId);
      const continuityPreDecision = runtimeSeries
        ? evaluateStoryContinuity({
            phase: 'pre_request',
            currentRegionId: worldAfter.当前区域ID,
            currentLocation: worldAfter.当前地点,
            openingRegionId: worldAfter.开局档案?.地区ID,
            seriesRegionId: inferStorySeriesRegion(runtimeSeries),
            seriesTitle: runtimeSeries.标题,
            seriesLocations: runtimeSeries.涉及地点索引,
          })
        : { action: 'allow' as const, mode: 'stay' as const, reasons: [] };
      let adjudication: StoryTurnAdjudication | null = null;
      let worldEvolutionStatus: 'settled' | 'failed' | 'skipped' | undefined;
      let worldEvolutionFailureReason: string | undefined;
      let storyProgressMemoryLine = '';
      let storyWeavingForSave = state.剧情编织;
      let storyWeavingConcurrentChange = false;
      // R3：统一事实视图（新闻/NPC/手机/记忆/智库/地图只消费这一份，不各自重新判断剧情是否发生）。
      let turnFactView: StoryFactConsumerView | null = null;
      // 工作包F 11.4：命途狭间两回合不执行剧情编织裁决/世界演变/事实物化（scope gate）
      if (runtimeProjection && runtimeCurrentSegment && !isPathAwakeningTurn) {
        // 步骤 0.5：方案C 独立 AI 语义判定（默认关闭）——与 AI 申报汇合后交给证据层。
        let storyAdvanceInput = aiMsg.parsedResponse?.storyAdvance;
        if (state.gameSettings.剧情编织系统?.剧情推进AI判定 === true) {
          const judgeConfig = buildStoryAdvanceJudgeApiConfig(state.gameSettings, state.apiSettings);
          if (judgeConfig) {
            const judgement = await judgeStoryAdvance(judgeConfig, {
              currentSegment: runtimeCurrentSegment,
              body: displayText,
              playerInput: userInput,
            }, abortController.signal);
            if (judgement) {
              storyAdvanceInput = {
                completed: judgement.completed || storyAdvanceInput?.completed === true,
                targetSegment: judgement.actualSegmentId ?? storyAdvanceInput?.targetSegment,
                basis: [storyAdvanceInput?.basis, judgement.reason].filter(Boolean).join('；') || undefined,
              };
            }
          }
        }
        // 步骤 1：从主剧情正文提取 confirmed evidence（命中明确结束状态）与提及（未来内容不入推进候选）。
        const evidenceResult = await buildTurnEvidence({
          body: displayText,
          currentSegment: runtimeCurrentSegment,
          futureSegments: runtimeSeries?.分段列表.filter((segment) => segment.组号 > runtimeCurrentSegment.组号),
          // 连续性守卫使用回合前已提交地点；变量候选地点不能先自证跨区域推进。
          currentLocation: worldAfter.当前地点,
          projection: runtimeProjection,
          gameTime,
          turnCount: state.turnCount + 1,
          responseId: aiMsg.id,
          storyAdvance: storyAdvanceInput,
        });
        // R3：正文命中下一分段关键事件的事件结果（完成后的结果）→ 玩家提前解决候选（计划 4.2 规则 7）。
        const runtimeNextSegment = runtimeSeries?.分段列表.find((segment) =>
            segment.组号 === runtimeCurrentSegment.组号 + 1
            && segment.启用注入 !== false
            && segment.处理状态 === '已完成',
          );
        const earlyResolutionEvidence = runtimeNextSegment
          ? await buildEarlyResolutionEvidence({
              body: displayText,
              scheduledSegment: runtimeNextSegment,
              scheduledUnits: runtimeProjection.scheduledUnits,
              gameTime,
              turnCount: state.turnCount + 1,
              responseId: aiMsg.id,
            })
          : [];
        const allConfirmedEvidence = [...evidenceResult.confirmedEvidence, ...earlyResolutionEvidence];
        // 步骤 2：合并持久化事件与下一分段投影（scheduled + 真实游戏时钟 dueAt）。
        const timelineAnchors = Object.fromEntries(
          runtimeProjection.scheduledUnits.map((unit) => [unit.unitId, unit.timelineAnchor]),
        );
        const mergedEvents = mergeProjectionEvents(
          baselineSlice?.worldEvents ?? [],
          runtimeProjection.scheduledEventInstances,
          gameTime,
          timelineAnchors,
        );
        // 步骤 3：dueEventScanner 按真实游戏时间扫描到期事件（后台先处理，不移动玩家焦点）。
        const scanned = scanDueWorldEvents(mergedEvents, runtimeRevision, gameTime);
        // 步骤 4：独立世界演变（<动态世界> 只作线索；只返回候选，不写任何状态）。
        pushQueueTask(state, 'world_evolution', 'pending', {
          detail: scanned.dueInstanceIds.length || parsedForDisplay.worldEvents.length
            ? '正在处理到期事件与动态世界线索。'
            : '正在检查本回合是否有待处理世界演变。',
          cancellable: true,
        });
        const evolutionResult = await runWorldEvolutionStep({
          config: buildStoryWeavingApiConfig(state.gameSettings, state.apiSettings),
          events: scanned.events,
          dueInstanceIds: scanned.dueInstanceIds,
          dynamicWorldClues: parsedForDisplay.worldEvents,
          legacyLabels: runtimeProjection.legacyLabels,
          gameTime,
          runtimeRevision,
          signal: abortController.signal,
        });
        assertWorkflowActive();
        worldEvolutionStatus = evolutionResult.ok ? (evolutionResult.skipped ? 'skipped' : 'settled') : 'failed';
        if (!evolutionResult.ok) worldEvolutionFailureReason = evolutionResult.failureReason;
        // 步骤 5：世界演变候选规范化/校验 → 只应用到内存 simulatedWorldState（非法候选整体拒绝，正式世界不变）。
        let simulatedEvents = scanned.events;
        let simulatedFacts = baselineSlice?.factLedger ?? [];
        const worldCommittedFactIds: string[] = [];
        if (evolutionResult.ok && evolutionResult.candidates.length > 0) {
          const worldAdjudication = adjudicateWorldEvolution({
            candidates: evolutionResult.candidates,
            currentEvents: simulatedEvents,
            dueInstanceIds: scanned.dueInstanceIds,
            gameTime,
            runtimeRevision,
          });
          if (worldAdjudication.ok) {
            simulatedEvents = worldAdjudication.simulatedEvents;
            for (const fact of worldAdjudication.factsToCommit) {
              if (!isWorldFactDuplicate(fact, simulatedFacts)) {
                simulatedFacts = [...simulatedFacts, fact];
                worldCommittedFactIds.push(fact.factId);
              }
            }
          } else {
            worldEvolutionStatus = 'failed';
            worldEvolutionFailureReason = worldAdjudication.message;
          }
        }
        const worldEvolutionQueueStatus: 队列任务状态 = worldEvolutionStatus === 'settled' ? 'success' : worldEvolutionStatus;
        pushQueueTask(state, 'world_evolution', worldEvolutionQueueStatus, {
          detail: worldEvolutionFailureReason
            ?? (worldEvolutionStatus === 'skipped' ? '没有到期事件或世界演变线索，已跳过。' : '世界演变候选已在内存模拟并纳入本回合裁决。'),
        });
        // 步骤 6：当前剧情焦点/剧情规划读取 simulatedWorldState（用更新后的模拟世界裁决，不扫描未来段自动对齐）。
        adjudication = adjudicateStoryTurn({
          currentFocus: runtimeProjection.currentFocus,
          currentSegment: runtimeCurrentSegment,
          committedFacts: simulatedFacts,
          eventInstances: simulatedEvents,
          confirmedEvidence: allConfirmedEvidence,
          gameTime,
          runtimeRevision,
        });
        if (continuityPreDecision.action === 'hold' || continuityVariableDecision?.action === 'hold' || continuityVariableDecision?.action === 'confirm') {
          adjudication = {
            ...adjudication,
            decision: 'pause',
            completedUnitIds: [],
            committedFactIds: [],
            targetSegmentId: undefined,
            reasons: [
              ...adjudication.reasons,
              ...continuityPreDecision.reasons,
              ...(continuityVariableDecision?.reasons ?? []),
            ],
          };
        }
        // R3 唯一事实入口：按回执 committedFactIds 精确物化玩家事实并应用事件迁移。
        // advance_one 只提交当前单元完成事实；resolve_early 结算目标为 player_early、后续原定事件 superseded（不反向取消前置）。
        const materialized = materializeAdjudicatedFacts({
          adjudication,
          evidenceCandidates: allConfirmedEvidence,
          events: simulatedEvents,
          committedFacts: simulatedFacts,
          gameTime,
          runtimeRevision,
        });
        simulatedEvents = materialized.events;
        simulatedFacts = materialized.facts;
        const turnCommittedFactIds = mergeNewFactIds(worldCommittedFactIds, materialized.newlyCommittedFactIds);
        turnFactView = buildStoryFactConsumerView({
          factLedger: simulatedFacts,
          worldEvents: simulatedEvents,
          newFactIds: turnCommittedFactIds,
        });
        // R3 兼容显示投影：世界.全局事件 只能由已提交事实生成显示 label（label 不是事实 owner）。
        const playerKnownIdSet = new Set(turnFactView.playerKnownFacts.map((fact) => fact.factId));
        const displayLabels = turnFactView.turnCommittedFacts
          .filter((fact) => playerKnownIdSet.has(fact.factId))
          .map(formatFactBrief);
        if (displayLabels.length) {
          worldAfter = { ...worldAfter, 全局事件: appendWorldEvents(worldAfter.全局事件, displayLabels) };
        }
        // 步骤 7：唯一正式提交——按回执一次更新剧情编织 / 运行时切片 / 兼容世界投影。
        const storyAdvance = applyAdjudicatedStoryProgress({
          storyWeaving: state.剧情编织,
          turnCount: state.turnCount + 1,
          decision: adjudication.decision,
          completedUnitIds: adjudication.completedUnitIds,
          reasons: adjudication.reasons,
          targetSegmentId: adjudication.targetSegmentId,
        });
        if (storyAdvance.changed) {
          assertWorkflowActive();
          const resolvedStory = await resolveStoryWeavingForBackgroundWrite({
            workflowBase: state.剧情编织,
            proposed: storyAdvance.system,
          });
          storyWeavingForSave = resolvedStory.system;
          storyWeavingConcurrentChange = resolvedStory.concurrentChange;
          if (!storyWeavingConcurrentChange) {
            state.set剧情编织(storyWeavingForSave);
          } else {
            pushQueueTask(state, 'zhiku', 'success', {
              detail: '检测到剧情编织面板已有更新，本回合后台未覆盖最新导入/分解结果。',
            });
          }
        } else {
          storyWeavingForSave = 归一化剧情编织系统(storyAdvance.system);
        }
        // 步骤 8：记忆/NPC 链消费同一回执（计划流程表第 10 步；本阶段只更新记忆与 NPC，不新建新闻/手机/智库/地图投影）。
        if (adjudication.decision === 'advance_one' && !storyWeavingConcurrentChange) {
          storyProgressMemoryLine = buildStoryProgressMemoryLine(state.剧情编织, storyWeavingForSave);
        } else if (adjudication.decision === 'resolve_early') {
          storyProgressMemoryLine = `剧情事件提前解决：${adjudication.supersededEventIds.join('、') || '无后续原定事件'} 已被取代，不补演原剧情。`;
        }
        // 步骤 9：一次更新运行时切片（随 worldAfter 一次 set世界；自动存档每回合只写一次裁决后唯一状态）。
        const postAdjudicationProjection = buildStoryWeavingRuntimeProjection({
          system: storyWeavingForSave,
          legacyWorldEventStrings: worldAfter.全局事件,
          historyArchives: storyWeavingForSave.当前进度?.历史归档,
          enteredAtRevision: runtimeRevision + 1,
        });
        const nextSlice = 归一化剧情编织运行时切片({
          schemaVersion: 1,
          runtimeBranchId,
          runtimeRevision: runtimeRevision + 1,
          focus: postAdjudicationProjection?.currentFocus ?? runtimeProjection.currentFocus,
          worldEvents: simulatedEvents,
          factLedger: simulatedFacts,
          lastDecision: adjudication.decision,
          lastReasons: adjudication.reasons,
          worldEvolutionStatus,
          worldEvolutionFailureReason,
          updatedAt: Date.now(),
        });
        worldAfter = { ...worldAfter, 剧情运行时: nextSlice };
      } else {
        storyWeavingForSave = 归一化剧情编织系统(state.剧情编织);
        if (baselineSlice) worldAfter = { ...worldAfter, 剧情运行时: baselineSlice };
        pushQueueTask(state, 'world_evolution', 'skipped', { detail: '开局系统回合不执行剧情编织世界演变。' });
      }
      if (variableOverrides?.世界) {
        const continuityPostDecision = runtimeSeries
          ? evaluateStoryContinuity({
              phase: 'post_variable',
              currentRegionId: effectiveWorld.当前区域ID,
              currentLocation: effectiveWorld.当前地点,
              openingRegionId: effectiveWorld.开局档案?.地区ID,
              seriesRegionId: inferStorySeriesRegion(runtimeSeries),
              seriesTitle: runtimeSeries.标题,
              seriesLocations: runtimeSeries.涉及地点索引,
              candidateRegionId: inferStoryRegionId(variableOverrides.世界.当前地点),
              candidateLocation: variableOverrides.世界.当前地点,
              evidenceText: displayText,
            })
          // 没有剧情编织系列时，前面的变量连续性裁决仍然是正式门禁；不能因此自动放行跨区地点。
          : continuityVariableDecision;
        const finalContinuityDecision = continuityVariableDecision?.action === 'hold' || continuityVariableDecision?.action === 'confirm'
          ? continuityVariableDecision
          : continuityPostDecision ?? continuityVariableDecision;
        const continuityWorldResult = applyStoryContinuityLocation(
          variableOverrides.世界,
          effectiveWorld,
          finalContinuityDecision,
        );
        if (finalContinuityDecision?.action === 'confirm') {
          state.setStoryContinuityConfirmation({
            kind: finalContinuityDecision.kind,
            proposal: finalContinuityDecision.proposal,
            reasons: finalContinuityDecision.reasons,
          });
        }
        if (continuityWorldResult.status !== 'applied') {
          if (variableOverrides.batch) {
            const blockedLocation = variableOverrides.世界.当前地点;
            const rejectedResults = variableOverrides.batch.results.map((result) => {
              const isBlockedLocation = result.ok
                && result.command.action !== 'delete'
                && result.command.key === '世界.当前地点'
                && result.command.value === blockedLocation;
              return isBlockedLocation
                ? {
                    ...result,
                    ok: false,
                    kind: 'rejected' as const,
                    reason: continuityWorldResult.status === 'pending_confirmation'
                      ? '连续性守卫暂缓地点切换：等待玩家确认跨区域转场。'
                      : '连续性守卫拦截地点切换：正文缺少明确跨区域转场证据。',
                  }
                : result;
            });
            variableBatchForSave = {
              ...variableOverrides.batch,
              results: rejectedResults,
              report: [
                variableOverrides.batch.report,
                continuityWorldResult.status === 'pending_confirmation'
                  ? `连续性守卫：地点候选「${blockedLocation}」等待跨区域确认，其他变量仍按本批次提交。`
                  : `连续性守卫：地点候选「${blockedLocation}」已拦截，其他变量仍按本批次提交。`,
              ].filter(Boolean).join('\n'),
            };
            state.setVariableBatches((prev) => prev.map((batch) => (
              batch.id === variableOverrides.batch?.id ? variableBatchForSave! : batch
            )));
          }
          pushQueueTask(state, 'variable', 'warning', {
            detail: continuityWorldResult.status === 'pending_confirmation'
              ? '变量命令已部分落地；地点切换等待跨区域确认，其他变量已提交。'
              : '变量命令已部分落地；地点切换被连续性守卫拦截，其他变量已提交。',
          });
          if (adjudication && adjudication.decision !== 'pause') {
            adjudication = {
              ...adjudication,
              decision: 'pause',
              completedUnitIds: [],
              committedFactIds: [],
              targetSegmentId: undefined,
              reasons: [...adjudication.reasons, ...(finalContinuityDecision?.reasons ?? [])],
            };
          }
        }
        worldAfter = {
          ...continuityWorldResult.world,
          剧情运行时: worldAfter.剧情运行时,
        };
      }
      // R2 唯一正式世界提交点：变量模型只返回覆盖，运行时切片和兼容世界投影在此合并后一次写回。
      if (worldAfter !== state.世界) state.set世界(worldAfter);
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
      // R3：NPC 只消费统一事实视图中的明确参与者/知情者事实（npcKnownFacts 来自 participantIds 或 payload 明确 NPC ID，
      // 不猜测名字、不批量广播；后台世界事件不写玩家功劳）。
      if (turnFactView && turnFactView.npcKnownFacts.length) {
        const npcAfterFactMemories = applyNpcFactMemories(
          npcAfterCompression,
          turnFactView.npcKnownFacts,
          turnFactView.turnCommittedFacts,
          state.turnCount + 1,
        );
        if (npcAfterFactMemories !== npcAfterCompression) {
          npcAfterCompression = npcAfterFactMemories;
          state.setNPC(npcAfterCompression);
        }
      }
      let zhikuAfterRuntimeUnlock = state.智库;
      let zhikuUnlockCandidate: {
        unlocked: Array<{ id: string; title: string; status: string; reason: string }>;
      } | null = null;
      if (adjudication?.decision === 'advance_one' && !storyWeavingConcurrentChange) {
        const zhikuUnlock = applyStoryArchiveZhikuRuntimeUnlock({
          zhiku: state.智库,
          storyWeaving: storyWeavingForSave,
        });
        if (zhikuUnlock.changed) {
          // 只计算本回合候选 patch；主回合完全成功收尾前不得立刻 set智库 / updateSetting，
          // 重 Roll / 失败 / 中止时由回合快照恢复到回合前智库运行态。
          assertWorkflowActive();
          zhikuUnlockCandidate = { unlocked: zhikuUnlock.unlocked };
          zhikuAfterRuntimeUnlock = mergeZhikuRuntimeUnlockPatch(state.智库, zhikuUnlock.unlocked);
          pushQueueTask(state, 'zhiku', 'pending', {
            detail: `剧情归档已更新智库门禁（待回合收尾提交）：${zhikuUnlock.unlocked.slice(0, 3).map((item) => `${item.title}→${item.status}`).join('、')}${zhikuUnlock.unlocked.length > 3 ? ` 等 ${zhikuUnlock.unlocked.length} 项` : ''}。`,
          });
        }
      }
      const newsSettings = state.gameSettings.新闻系统;
      const newsEnabled = Boolean(newsSettings?.enabled && newsSettings?.autoGenerate);
      const newsInterval = Math.max(5, Math.min(10, Math.trunc(newsSettings?.generateIntervalTurns ?? 5) || 5));
      const newsTurn = state.turnCount + 1;
      const shouldRunOpeningNews = isOpeningSystemTrigger && newsEnabled;
      // 工作包F 11.4：命途狭间回合不生成新闻
      const shouldRunNews = newsEnabled && !isPathAwakeningTurn && ((shouldRunOpeningNews && !openingNewsPreprocessed) || (newsTurn > 0 && newsTurn % newsInterval === 0));
      const yitingBase = mergeYitingSystems(yitingWithCompression, variableOverrides?.忆庭);
      // 对标参考项目：本回合回忆条目（写入四段记忆 生成，名称【回忆N】）汇入忆庭档案。
      let yitingAfterTurnRecall = pendingRecallEntry
        ? { ...yitingBase, 回忆档案: [...yitingBase.回忆档案, pendingRecallEntry] }
        : yitingBase;
      let newsAfterGeneration: 新闻条目[] | null = openingNewsForSave;
      let phoneAfterFallbackSeed = variableOverrides?.手机 ?? state.手机;
      let finalHistoryForSave = finalHistory;

      const runNewsBackgroundJob = async (): Promise<void> => {
        if (!newsSettings?.enabled || !newsSettings?.autoGenerate) {
          pushQueueTask(state, 'news', 'skipped', {
            detail: '星际和平周报未开启，已跳过。',
          });
          return;
        }
        if (!shouldRunNews) {
          pushQueueTask(state, 'news', 'skipped', {
            detail: `未到新闻触发间隔（每 ${newsInterval} 回合一次），已跳过。`,
          });
          return;
        }
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
          // R3：新闻只消费统一事实视图（已提交 public/broadcast 事实；scheduled 事件最多预告）。
          factView: turnFactView,
          signal: abortController.signal,
          shouldCommit: isCurrentWorkflow,
        });
        assertWorkflowActive();
        newsAfterGeneration = newsGenerationResult?.news ?? state.新闻;
        if (!newsGenerationResult && !abortController.signal.aborted) {
          // R3 失败边界：新闻生成失败在新闻任务内部隔离——已提交剧情/世界事实不回滚，新闻保持旧可信状态，队列 failed。
          pushQueueTask(state, 'news', 'failed', {
            detail: '星际和平周报生成失败，新闻保持旧可信状态，本回合已提交事实不回滚。',
            failCount: newsSettings.api.retryCount ?? 2,
            retryHint: '可在新闻设置中检查 API 配置后重试。',
          });
        } else {
          pushQueueTask(state, 'news', 'success', {
            detail: newsGenerationResult?.changed
              ? `星际和平周报已更新，当前共 ${newsAfterGeneration.length} 条新闻记录。`
              : newsGenerationResult
                ? '星际和平周报本回合没有可写新闻变化。'
                : '星际和平周报未生成有效结果。',
          });
        }
      };

      const runYitingArchiveJob = async (): Promise<void> => {
        // 对标参考项目：回忆档案 = 即时推导——本回合回忆条目（【回忆N】）已在
        // yitingAfterTurnRecall 初始化时由「写入四段记忆」生成并汇入，不再独立精炼回合纪要。
        // 这里只提交忆庭状态与召回提示。
        assertWorkflowActive();
        state.set忆庭(yitingAfterTurnRecall);
        pushQueueTask(state, 'memory', 'success', {
          detail: '回合记忆已按即时/短期合体写入回忆档案。',
        });
        if (!yitingEnabled) {
          pushQueueTask(state, 'yiting', 'skipped', {
            detail: '忆庭召回已关闭，但入库仍已执行。',
          });
        } else if (!yitingRecallEnabled) {
          pushQueueTask(state, 'yiting', 'skipped', {
            detail: `未到第${(memorySettings.忆庭召回最早触发回合 ?? 10) + 1}回合，忆庭召回已跳过。`,
          });
        } else if (yitingPreview?.entries.length) {
          pushQueueTask(state, 'yiting', 'success', {
            detail: yitingPreview.usedModel ? '忆庭召回已由独立模型完成。' : '忆庭召回已由本地摘要检索完成。',
          });
        } else {
          pushQueueTask(state, 'yiting', 'success', {
            detail: '忆庭已检索，本回合没有命中相关档案。',
          });
        }
      };

      const runPhoneFallbackJob = async (): Promise<void> => {
        if (!isPathAwakeningTurn && state.gameSettings.手机系统.enabled && state.gameSettings.手机系统.autoGenerateSeeds) {
          const fallbackSeed = buildFallbackPhoneSeed({
            phone: phoneAfterFallbackSeed,
            npcs: npcAfterCompression,
            turn: state.turnCount + 1,
            userInput,
            body: displayText,
            maxSeedsPerTurn: state.gameSettings.手机系统.maxSeedsPerTurn,
            contactCooldownTurns: state.gameSettings.手机系统.contactCooldownTurns,
            factView: turnFactView,
          });
          if (fallbackSeed) {
            phoneAfterFallbackSeed = {
              ...phoneAfterFallbackSeed,
              messageSeeds: [...phoneAfterFallbackSeed.messageSeeds, fallbackSeed],
              unreadTotal: phoneAfterFallbackSeed.unreadTotal + 1,
            };
            state.set手机(phoneAfterFallbackSeed);
            pushQueueTask(state, 'phone', 'success', {
              detail: `已补充低频主动来信种子：${fallbackSeed.title}。`,
            });
          }
        }
      };

      const runNarrativeImageJob = async (): Promise<void> => {
        const 正文生图设置 = state.gameSettings.文生图系统?.正文生图;
        if (!正文生图设置?.enabled || 正文生图设置.mode !== 'auto') return;
        const targetMessageId = aiMsg.id;
        const tokenizerConfig = resolveNarrativeImageTokenizerConfig(state, config);
        const imageApiConfig = resolveNarrativeImageGenerationApi(state);
        if (!imageApiConfig) {
          pushQueueTask(state, 'narrative_image_generate', 'failed', {
            detail: '正文生图主文生图接口未启用，无法生成故事快照。',
            turn: state.turnCount,
            targetMessageId,
          });
          return;
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
        if (generatedImages?.length) {
          finalHistoryForSave = finalHistory.map((msg) =>
            msg.id === targetMessageId && msg.role === 'assistant'
              ? {
                  ...msg,
                  narrativeImages: [...(msg.narrativeImages ?? []), ...generatedImages],
                }
              : msg,
          );
        }
      };

      if ((state.gameSettings.backgroundTaskMode ?? 'sequential') === 'parallel') {
        await Promise.all([
          runNewsBackgroundJob(),
          runYitingArchiveJob(),
          runPhoneFallbackJob(),
          runNarrativeImageJob(),
        ]);
      } else {
        await runNewsBackgroundJob();
        await runYitingArchiveJob();
        await runPhoneFallbackJob();
        await runNarrativeImageJob();
      }

      // 记忆压缩结算：主回合所有会修改记忆的步骤（剧情推进 / NPC 事实 / 忆庭入库）
      // 全部完成后，以最终记忆切片静默压缩（达阈值自动执行，不弹确认窗）。
      mem = memoryAfterStoryProgress;
      {
        // 即时层是滑动窗口、不调 AI 压缩；短期→中期、中期→长期达阈值时静默压缩
        // （AI 总结失败自动回退本地，失败草稿保留并弹重试提示）。
        const compression = await autoCompressMemorySystemWithArchivesAsync(
          mem,
          state.turnCount,
          memorySettings,
          config,
          abortController.signal,
        );
        assertWorkflowActive();
        mem = compression.memory;
        memoryAfterStoryProgress = mem;
        state.set记忆(mem);
        if (compression.failures.length > 0) {
          state.set记忆压缩失败({ 条数: compression.failures.length });
          pushQueueTask(state, 'memory', 'failed', {
            detail: `${compression.failures.length} 条记忆总结失败，原始材料已保留，可重试。`,
            failCount: compression.failures.length,
          });
        }
        // F6·对标既定方案：长期记忆超限归档条目（【长期纪要】）幂等汇入忆庭，可检索召回。
        const longTermArchives = compression.archives.filter(
          (entry) => entry.类型 === '长期压缩' && (entry.名称 ?? '').startsWith('【长期纪要'),
        );
          if (longTermArchives.length) {
            const existingKeys = new Set(
              yitingAfterTurnRecall.回忆档案.map((entry) => `${entry.名称 ?? ''}:${entry.摘要}`),
            );
            const newLongTermArchives = longTermArchives.filter(
              (entry) => !existingKeys.has(`${entry.名称 ?? ''}:${entry.摘要}`),
            );
            if (newLongTermArchives.length) {
              yitingAfterTurnRecall = {
                ...yitingAfterTurnRecall,
                回忆档案: [...yitingAfterTurnRecall.回忆档案, ...newLongTermArchives],
              };
              state.set忆庭(yitingAfterTurnRecall);
            }
          }
          const compressionDetail = compression.failures.length
            ? `记忆总结有 ${compression.failures.length} 批 API 失败，已保留完整失败草稿；当前回合继续使用本地 fallback。`
            : compression.usedModel
              ? '即时/短期/中期/长期记忆已调用记忆总结 API 完成整理。'
              : '即时/短期/中期/长期记忆已使用本地摘要完成整理。';
          pushQueueTask(state, 'memory', compression.failures.length ? 'failed' : 'success', {
            detail: compressionDetail,
            failCount: compression.failures.length || undefined,
            retryHint: compression.failures.length ? '打开记忆系统的“失败草稿”页重新总结。' : undefined,
          });
      }

      // 回合成功收尾：宏全局变量 / 世界书触发状态统一提交。
      // 智库运行时解锁保持候选，只在主回合正式存档成功之后才提交 React 状态与持久化
      // （见下方 auto-save 块），自动存档失败时由回合快照连同持久化一起回滚。
      const turnFinalGameSettings: typeof state.gameSettings = {
        ...state.gameSettings,
        ...(macroGlobalVarsAfter !== prevGlobalSnapshot ? { macroGlobalVars: macroGlobalVarsAfter } : {}),
        ...(worldbookTriggerStatesAfter !== state.gameSettings.worldbookTriggerStates
          ? { worldbookTriggerStates: worldbookTriggerStatesAfter }
          : {}),
      };
      if (turnFinalGameSettings.macroGlobalVars !== state.gameSettings.macroGlobalVars
        || turnFinalGameSettings.worldbookTriggerStates !== state.gameSettings.worldbookTriggerStates) {
        state.setGameSettings(turnFinalGameSettings);
      }

      /** 主回合正式存档成功后，才提交 React 智库状态与持久化智库运行态。 */
      const commitZhikuAfterAutoSave = async (): Promise<void> => {
        if (!zhikuUnlockCandidate) return;
        state.set智库(zhikuAfterRuntimeUnlock);
        await updateSetting<import('@/models/zhiku').智库系统>('zhikuSystem', (current) => (
          buildPersistedZhikuSystem(mergeZhikuRuntimeUnlockPatch(
            current ?? zhikuAfterRuntimeUnlock,
            zhikuUnlockCandidate.unlocked,
          ))
        ));
        assertWorkflowActive();
        pushQueueTask(state, 'zhiku', 'success', {
          detail: `剧情归档已更新智库门禁：${zhikuUnlockCandidate.unlocked.slice(0, 3).map((item) => `${item.title}→${item.status}`).join('、')}${zhikuUnlockCandidate.unlocked.length > 3 ? ` 等 ${zhikuUnlockCandidate.unlocked.length} 项` : ''}。`,
        });
      };

      // 10. Auto-save —— 每回合只在后台队列收尾写一次，避免正文/变量阶段重复生成多条自动存档。
      if (state.gameSettings.enableAutoSaveEveryTurn) {
        recoveryJournal = updateWorkflowRecoveryJournal(recoveryJournal, { phase: 'autosave' });
        await persistWorkflowRecoveryJournal(recoveryJournal);
        pushQueueTask(state, 'autosave', 'pending', { detail: '正在写入本回合自动存档。' });
        const variableBatchesForSave = compactVariableBatchHistory(variableBatchForSave
          ? [
              ...state.variableBatches.filter((batch) => batch.id !== variableBatchForSave?.id),
              variableBatchForSave,
            ]
          : state.variableBatches);
        // R2：存档必须携带裁决后的唯一运行时切片；变量模型返回的世界缺少切片时用 worldAfter 补齐。
        const worldForAutoSave = worldAfter;
        const saveData = buildSavePayload(state, 'auto', {
          chatHistory: finalHistoryForSave,
          记忆: memoryAfterStoryProgress,
          忆庭: yitingAfterTurnRecall,
          手机: phoneAfterFallbackSeed,
          旅人: variableOverrides?.旅人,
          世界: worldForAutoSave,
          NPC: npcAfterCompression,
          新闻: newsAfterGeneration ?? variableOverrides?.新闻,
          剧情: variableOverrides?.剧情,
          剧情编织: storyWeavingForSave,
          智库: zhikuAfterRuntimeUnlock,
          // 自动存档使用本回合最终 gameSettings（宏变量 / 世界书触发状态 / 智库解锁已含其中）。
          gameSettings: turnFinalGameSettings,
          variableBatches: variableBatchesForSave,
          queueTasks: state.queueTasks,
          turnCount: state.turnCount + 1,
        });
        assertWorkflowActive();
        await saveGame(saveData);
        turnStateCommitted = true;
        commitActiveSaveTreeMeta(saveData);
        assertWorkflowActive();
        pushQueueTask(state, 'autosave', 'success', { detail: '本回合自动存档完成。' });
        state.setHasSave(true);
        // 正式存档成功后才提交智库运行态（React + IndexedDB）。
        await commitZhikuAfterAutoSave();
      }

      if (!state.gameSettings.enableAutoSaveEveryTurn) {
        turnStateCommitted = true;
        // 无自动存档：本回合所有阻断操作成功后才提交智库运行态。
        await commitZhikuAfterAutoSave();
      }

    await saveSetting('theme', state.currentTheme);
    await saveSetting('apiSettings', state.apiSettings);
    // 与自动存档使用同一个最终 gameSettings 对象，不读闭包旧 state。
    await saveSetting('gameSettings', turnFinalGameSettings);
    await saveSetting('worldbooks', state.worldbooks);
    await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError' || abortController.signal.aborted) {
      if (!turnStateCommitted) {
        state.setChatHistory(rollbackHistoryOnAbort);
        if (rollbackSnapshotOnAbort) {
          // React 与持久化智库运行态一起回滚：刷新后不会重新出现被撤销的解锁。
          await restorePreTurnSnapshotPersisted(state, rollbackSnapshotOnAbort, updateSetting);
        }
      }
      await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);
      state.setWorkflowHint('已停止生成，本次输入已回到输入框，可修改后重新发送。');
      state.setWorkflowStatus('');
      keepWorkflowHint = true;
    } else {
      console.error('Send workflow error:', err);
      if (!turnStateCommitted && rollbackSnapshotOnAbort) {
        state.setChatHistory(rollbackHistoryOnAbort);
        await restorePreTurnSnapshotPersisted(state, rollbackSnapshotOnAbort, updateSetting);
        await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);
      }
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
      pushQueueTask(state, 'main_story', 'failed', {
        detail,
        failCount: state.gameSettings.autoRetryOnError ? Math.max(1, state.gameSettings.autoRetryCount) : 1,
      });
    }
  } finally {
    visibilityPublisher?.dispose();
    streamMessageSetter.cancel();
    if (isCurrentWorkflow()) {
      state.setLoading(false);
      setStreamingMessage('');
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
  state: UseGameStateReturn;
  mainApiConfig: import('@/models/settings').API配置项;
  userInput: string;
  body: string;
  variableDraft?: string;
  /** 主流程结束后的回合数(已 +1)。 */
  turnAfter: number;
  /** 稳定的 user → assistant 回合身份与目标消息。 */
  turnId?: string;
  targetMessageId?: string;
  targetUserMessageId?: string;
  mode?: 'normal' | 'retry' | 'repair' | 'reroll';
  supersedesBatchId?: string;
  memorySystemSnapshot: import('@/models/memory').记忆系统;
  /** 7/7a/7b 后的旅人快照(包含 应用狭间结果 写入的命途列表变化)。 */
  travelerSnapshot?: import('@/models/character').角色数据结构;
  /** 7/7a/7b 后的世界快照(包含全局事件追加、待触发狭间写入、进行中狭间清空)。 */
  worldSnapshot?: import('@/models/world').世界状态;
  /** R2 主回合把世界覆盖与运行时切片合并后统一写回，避免变量模型提前提交世界。 */
  deferWorldCommit?: boolean;
  signal?: AbortSignal;
  allowYiting?: boolean;
  shouldCommit?: () => boolean;
  /** 阶段1约定系统·写入环：recall 召回的历史通讯回忆拼接文本，传给 variableModel 提取约定 */
  recallContext?: string;
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
  coverage?: VariableCoverageReport;
}

/** 执行一次变量模型校准：调用独立 API → 解析命令 → 落地 → 推入 variableBatches。
 *  失败不抛错（不影响主流程的存档）。 */
async function runVariableCalibrationStep(
  params: VariableCalibrationParams & { pathAwakeningTurn?: boolean },
): Promise<VariableCalibrationOverrides | null> {
  const { state, mainApiConfig } = params;
  if (!state.gameSettings.enableVariableUpdate) return null;
  if (!params.body?.trim()) return null;

  // 选择变量模型 API：用 settings 里的 override，字段留空回退到主 API 同名字段。
  const override = state.gameSettings.variableApi;
  const overrodeAny =
    !!override.baseUrl.trim() || !!override.apiKey.trim() || !!override.model.trim();
  const variableConfig: import('@/models/settings').API配置项 = {
    ...mainApiConfig,
    provider: override.provider || mainApiConfig.provider,
    baseUrl: override.baseUrl.trim() || mainApiConfig.baseUrl,
    apiKey: override.apiKey.trim() || mainApiConfig.apiKey,
    model: override.model.trim() || mainApiConfig.model,
    // 未单独设置变量 API 输出上限时，不继承主剧情接口过小的限制。
    maxTokens: override.maxTokens ?? Math.max(mainApiConfig.maxTokens ?? 0, 3200),
    temperature: override.temperature ?? mainApiConfig.temperature,
  };

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

  try {
    // NSFW 基线候选：开启时，为缺少实质内容的活跃 NPC 在变量更新那一次调用里生成基线。
    // 归档 NPC 不得进入任何运行时选择链（含 NSFW 基线）。
    const nsfwBaselineCandidates: NsfwBaselineCandidate[] = [];
    if (state.gameSettings.enableNsfw) {
      const npcRecords = 筛选活跃NPC((stateSnapshot.NPC ?? []) as NPC记录[]);
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
    const { rawText, coverage } = await callVariableModel(variableConfig, {
      body: params.body,
      variableDraft: params.variableDraft,
      userInput: params.userInput,
      turnCount: params.turnAfter - 1, // 这条变量是给「刚结束的那回合」用的
      state: stateSnapshot,
      phoneSeedsEnabled: state.gameSettings.手机系统.enabled && state.gameSettings.手机系统.autoGenerateSeeds && !params.pathAwakeningTurn,
      nsfwEnabled: state.gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
      nsfwBaselineCandidates,
      signal: params.signal,
      retryCount: state.gameSettings.variableApi.retryCount ?? 2,
      promptModules: state.gameSettings.promptModules,
      recallContext: params.recallContext,
    });
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    const coverageReport = coverage ? {
      candidateTypes: coverage.candidateTypes,
      initialTypes: coverage.initialTypes,
      missingTypes: coverage.missingTypes,
      reviewAttempted: coverage.reviewAttempted,
      supplementedTypes: coverage.supplementedTypes,
      unresolvedTypes: coverage.unresolvedTypes,
    } : undefined;
    const analysis = analyzeVariableTurn({
      rawText,
      stateSnapshot,
      turn: params.turnAfter - 1,
      operationSourceId: params.turnId ?? params.targetMessageId,
      sourceTurnId: params.turnId,
      sourceMessageId: params.targetMessageId,
      phoneSeedsEnabled: state.gameSettings.手机系统.enabled && state.gameSettings.手机系统.autoGenerateSeeds && !params.pathAwakeningTurn,
      maxPhoneSeedsPerTurn: state.gameSettings.手机系统.maxSeedsPerTurn,
      nsfwEnabled: state.gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
      mode: params.mode,
      coverage: coverageReport,
    });
    const { parsedFacts, factCommands, commands, results: allResults, nextState, npcLedgerUpdate } = analysis;
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    // 把整个 batch 推入历史
    const batch: 变量命令批次 = {
      id: `vbatch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: 2,
      turn: params.turnAfter - 1,
      turnId: params.turnId,
      targetMessageId: params.targetMessageId,
      targetUserMessageId: params.targetUserMessageId,
      mode: params.mode ?? 'normal',
      supersedesBatchId: params.supersedesBatchId,
      timestamp: Date.now(),
      source: overrodeAny ? 'calibration' : 'main',
      modelName: variableConfig.model,
      facts: analysis.facts,
      results: allResults,
      report: [
        `变量事实：${parsedFacts.facts.length} 条，生成内部命令 ${factCommands.commands.length} 条。`,
        analysis.legacyCommandCount ? `兼容旧命令：${analysis.legacyCommandCount} 条。` : '兼容旧命令：0 条。',
        analysis.skippedTravelerProfileLegacyCount ? `已静默忽略旅人核心档案旧命令：${analysis.skippedTravelerProfileLegacyCount} 条。` : '',
        factCommands.warnings.length ? `事实警告：${factCommands.warnings.length} 条。` : '事实警告：0 条。',
        coverageReport?.reviewAttempted ? `覆盖复审：已触发，补写 ${coverageReport.supplementedTypes.join('、') || '无'}。` : '',
        coverageReport?.unresolvedTypes.length ? `覆盖警告：正文疑似发生但仍未确认：${coverageReport.unresolvedTypes.join('、')}。` : '',
        ...factCommands.notes,
      ].filter(Boolean).join('\n'),
      rawText,
      coverage: coverageReport,
    };
    if (params.shouldCommit?.() === false) return null;
    state.setVariableBatches((prev) => compactVariableBatchHistory([...prev, batch]));

    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    // 没有任何成功命令时，无需 setState；返回空 overrides 让 save 用主流程的值
    const anyApplied = allResults.some((result) => result.ok && result.kind === 'command');
    const worldSelfHealed = nextState.世界 !== stateSnapshot.世界;
    if (!anyApplied && !worldSelfHealed) return { batch, npcLedgerUpdate, coverage };
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    // 一次性提交所有切片到 React state。传 stateSnapshot 作 initialState,
    // commitVariableState 内部用引用相等过滤——变量模型没改的 root 不会 setState,
    // 避免覆盖玩家在校准这几秒里在 UI 上做的交互(比如点了「踏入命途狭间」)。
    commitVariableState(nextState, stateSnapshot, {
      set旅人: state.set旅人,
      set世界: params.deferWorldCommit ? (() => {}) : state.set世界,
      set记忆: state.set记忆,
      set忆庭: params.allowYiting === false ? (() => {}) : state.set忆庭,
      set智库: state.set智库,
      set手机: state.set手机,
      setNPC: state.setNPC,
      set新闻: state.set新闻,
      set剧情: state.set剧情,
    });

    return { ...unpackVariableState(nextState), batch, npcLedgerUpdate, coverage };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null;
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;
    console.warn('[variable-model] 校准失败：', err);
    pushQueueTask(state, 'variable', 'failed', {
      detail: (err as Error).message ?? '变量模型校准失败。',
    });
    // 失败也记一条 batch 让玩家知道
    const batch: 变量命令批次 = {
      id: `vbatch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: 2,
      turn: params.turnAfter - 1,
      turnId: params.turnId,
      targetMessageId: params.targetMessageId,
      targetUserMessageId: params.targetUserMessageId,
      mode: params.mode ?? 'normal',
      supersedesBatchId: params.supersedesBatchId,
      timestamp: Date.now(),
      source: overrodeAny ? 'calibration' : 'main',
      modelName: variableConfig.model,
      results: [{
        command: { action: 'set', key: '(变量模型调用失败)', value: null },
        ok: false,
        reason: (err as Error).message ?? '未知错误',
      }],
      rawText: err instanceof Error ? err.message : String(err ?? '变量模型调用失败'),
    };
    state.setVariableBatches((prev) => compactVariableBatchHistory([...prev, batch]));
    return {
      batch,
      npcLedgerUpdate: {
        updatedNames: [],
        memoryAppended: [],
        ledgerFieldsUpdated: [],
        summaryTriggered: [],
        warnings: [(err as Error).message ?? '变量模型校准失败。'],
      },
    };
  }
}
