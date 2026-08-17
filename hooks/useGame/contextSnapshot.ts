import type { UseGameStateReturn } from '@/hooks/useGameState';
import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import { 创建手机会话 } from '@/models/phone';
import { 创建默认智库系统设置, 创建默认记忆系统设置 } from '@/models/settings';
import { buildNewsModelPrompt, buildNewsUserMessage } from '@/services/ai/newsModel';
import { buildPhoneMessages, buildPhoneSystemPrompt, buildPhonePromptModulesSection } from '@/services/ai/phoneService';
import { buildVariableModelPrompt } from '@/services/ai/variableModel';
import { NPC_MEMORY_WRITE_RULE_PROMPT } from '@/data/variableWorldbook';
import { retrieveYitingContext, buildYitingRecallSystemPrompt } from '@/services/yitingRetrieval';
import { buildZhikuAiRequestForTurn, buildZhikuModelSystemPrompt, buildZhikuModelUserPrompt, formatZhikuCandidateDecisionTrace } from '@/services/zhikuRetrieval';
import { compileZhikuTurn, type ZhikuRequestScope } from '@/services/zhikuRuntimeCompiler';
import { evaluateStoryWeavingGate, getStoryWeavingInjectionDiagnostics } from '@/services/storyWeaving';
import { buildStoryPlanningAnalysis } from '@/services/storyPlanningAnalysis';
import { buildNpcRelationshipPlanning } from '@/services/npcRelationshipPlanning';
import { formatNpcLedgerForPrompt, selectNpcLedgersForTurn, type NPC账本选择结果 } from '@/models/npc';
import { estimateTextTokens } from '@/utils/tokenEstimate';
import { snapshotVariableState } from '@/utils/variableExecutor';
import {
  buildImmediateStoryReview,
  buildZhikuKeywordRecallQuery,
  buildLeanAssistantHistoryContent,
  buildMainRecallQuery,
  getMainHistoryWindow,
  getPathAwakeningHistoryWindow,
} from './historyWindow';
import { buildOpeningSystemPrompt, buildPathAwakeningSystemPrompt, buildSystemPrompt } from './systemPromptBuilder';
import { getBuiltinPresets, getBuiltinPresetsV2 } from '@/data/builtinPresets';
import { buildTavernMessageChain } from './tavernMessageChainBuilder';
import { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';
import { getExplicitNpcNamesForTurn, getZhikuCharacterParticipationForTurn } from './npcPresence';
import { 格式化开局档案上下文 } from '@/models/world';
import {
  buildMainTurnEnforcementBlock,
  buildCotPseudoTaskSequence,
  DEEPSEEK_MAIN_FORMAT_GUARD,
  deriveMainStoryMessageMode,
  finalizeMainRequest,
  insertDepthIntoHistory,
  type MainStoryMessageMode,
} from './mainRequestFinalizer';
import { resolveChatProviderCapabilities } from '@/services/ai/chatCompletionClient';
import { extractRecentStoryPlanSnippets } from './historyWindow';
import {
  buildPromptMacroContext,
  buildPromptWorldbookContext,
  resolvePromptWorldbookPlan,
} from './promptAssemblyContext';
import { resolvePlayerSpeechMode } from '@/utils/narrativeRuntimePolicy';

export interface ContextSection {
  id: string;
  title: string;
  category: string;
  order: number;
  content: string;
  estimatedTokens: number;
  upload?: boolean;
  diagnostic?: boolean;
}

export type ContextSnapshotKind = 'main' | 'variable' | 'phone' | 'news' | 'yiting' | 'zhiku';

export interface ContextSnapshot {
  kind: ContextSnapshotKind;
  title: string;
  sections: ContextSection[];
  fullText: string;
  estimatedTokens: number;
  uploadEstimatedTokens: number;
  diagnosticEstimatedTokens: number;
  createdAt: number;
  sourceInput: string;
}

function latestUserInput(history: 聊天消息[]): string {
  return [...history]
    .reverse()
    .find((msg) => msg.role === 'user' && msg.content.trim())
    ?.content
    .trim() ?? '';
}

function latestUserIndex(history: 聊天消息[]): number {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const msg = history[index];
    if (msg.role === 'user' && msg.content.trim()) return index;
  }
  return -1;
}

function historyThroughLatestUser(history: 聊天消息[]): 聊天消息[] {
  const index = latestUserIndex(history);
  return index >= 0 ? history.slice(0, index + 1) : history;
}

function latestAssistantZhikuDebugRecall(history: 聊天消息[]): string {
  const latest = [...history]
    .reverse()
    .find((msg) => msg.role === 'assistant' && (
      msg.debugContext?.zhikuRecallPreview?.trim() ||
      msg.debugContext?.zhikuRecallRawText?.trim() ||
      msg.debugContext?.zhikuRecallUsedModel !== undefined
    ));
  const debug = latest?.debugContext;
  if (!debug) return '';
  return [
    debug.zhikuRecallUsedModel
      ? `智库模型原始返回：\n${debug.zhikuRecallRawText?.trim() || '（智库模型已调用，但没有保存到原始返回文本。）'}`
      : '智库模型原始返回：\n（本回合只使用本地关键词召回，没有运行 AI 召回编译器。）',
    '',
    debug.zhikuRecallPreview?.trim() || '智库召回诊断：无',
  ].join('\n').trim();
}

function latestAssistantYitingDebugRecall(history: 聊天消息[]): string {
  const latest = [...history]
    .reverse()
    .find((msg) => msg.role === 'assistant' && (
      msg.debugContext?.yitingRecallPreview?.trim() ||
      msg.debugContext?.yitingRecallRawText?.trim() ||
      msg.debugContext?.yitingRecallUsedModel !== undefined
    ));
  const debug = latest?.debugContext;
  if (!debug) return '';
  return [
    debug.yitingRecallUsedModel
      ? `忆庭模型原始返回：\n${debug.yitingRecallRawText?.trim() || '（忆庭模型已调用，但没有保存到原始返回文本。）'}`
      : '忆庭模型原始返回：\n（本回合未调用忆庭模型，使用本地摘要检索，或未到忆庭召回触发回合。）',
    '',
    debug.yitingRecallPreview?.trim() || '忆庭召回诊断：无',
  ].join('\n').trim();
}

function latestAssistantNpcLedgerDebug(history: 聊天消息[]): string {
  const latest = [...history]
    .reverse()
    .find((msg) => msg.role === 'assistant' && (msg.debugContext?.npcLedgerInjection || msg.debugContext?.npcLedgerUpdate));
  const injection = latest?.debugContext?.npcLedgerInjection;
  const update = latest?.debugContext?.npcLedgerUpdate;
  if (!injection && !update) return '';
  return [
    injection ? '【NPC账本注入诊断】' : '',
    injection ? `已注入：${injection.selectedNames.length ? injection.selectedNames.join('、') : '无'}` : '',
    injection?.injected.length
      ? `注入详情：\n${injection.injected.map((item) => [
          `- ${item.name}`,
          `  原因：${item.reason.join('；') || '相关'}`,
          `  字段：${item.fields.join('；') || '无账本字段，仅旧档案兜底'}`,
          `  标记：最近互动=${item.hasRecentInteraction ? '是' : '否'}；必须记得=${item.hasMustRemember ? '是' : '否'}；未完成事项=${item.hasUnresolvedItems ? '是' : '否'}`,
        ].join('\n')).join('\n')}`
      : '',
    injection?.skippedNames.length
      ? `未注入示例：\n${injection.skippedNames.slice(0, 8).map((item) => `- ${item.name}：${item.reason}`).join('\n')}`
      : '',
    update ? '【NPC账本更新诊断】' : '',
    update ? `更新 NPC：${update.updatedNames.length ? update.updatedNames.join('、') : '无'}` : '',
    update?.memoryAppended.length
      ? `追加同行记忆：\n${update.memoryAppended.slice(0, 8).map((item) => `- ${item}`).join('\n')}`
      : '',
    update?.ledgerFieldsUpdated.length
      ? `账本字段：\n${update.ledgerFieldsUpdated.slice(0, 12).map((item) => `- ${item}`).join('\n')}`
      : '',
    update?.summaryTriggered.length
      ? `触发总结记忆压缩：${update.summaryTriggered.join('、')}`
      : '',
    update?.warnings.length
      ? `警告：\n${update.warnings.slice(0, 8).map((item) => `- ${item}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');
}

function formatNpcLedgerSelectionSnapshot(selection: NPC账本选择结果): string {
  return [
    '# 本回合 NPC 账本预期注入',
    '',
    selection.selected.length
      ? selection.selected.map(formatNpcLedgerForPrompt).join('\n\n')
      : '（本回合没有 NPC 账本进入强制承接区。）',
    selection.skipped.length
      ? `\n未注入示例：\n${selection.skipped.slice(0, 10).map((item) => `- ${item.name}：${item.reason}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');
}

function sectionTitle(content: string, fallback: string): string {
  const first = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return first?.replace(/^#+\s*/, '').slice(0, 36) || fallback;
}

function addSection(
  sections: ContextSection[],
  input: Omit<ContextSection, 'order' | 'estimatedTokens'>,
): void {
  if (!input.content.trim()) return;
  sections.push({
    ...input,
    order: sections.length + 1,
    estimatedTokens: estimateTextTokens(input.content),
  });
}

function finalizeSnapshot(
  kind: ContextSnapshotKind,
  title: string,
  sections: ContextSection[],
  sourceInput: string,
): ContextSnapshot {
  const fullText = sections
    .map((section) => `【${section.category}｜${section.title}】\n${section.content}`)
    .join('\n\n---\n\n');
  const estimatedTokens = sections.reduce((sum, section) => sum + section.estimatedTokens, 0);
  const uploadEstimatedTokens = sections
    .filter((section) => section.upload !== false && !section.diagnostic)
    .reduce((sum, section) => sum + section.estimatedTokens, 0);
  const diagnosticEstimatedTokens = sections
    .filter((section) => section.diagnostic || section.upload === false)
    .reduce((sum, section) => sum + section.estimatedTokens, 0);

  return {
    kind,
    title,
    sections,
    fullText,
    estimatedTokens,
    uploadEstimatedTokens,
    diagnosticEstimatedTokens,
    createdAt: Date.now(),
    sourceInput,
  };
}

/** 按内容特征给请求消息命名（对标参考项目 messageEntries 的 title 语义，避免笼统叫「历史记录」）。 */
function describeApiMessage(msg: 聊天消息): string {
  const content = msg.content?.trim() ?? '';
  if (content.startsWith('# 本回合生成前核对')) return '本回合生成前核对';
  if (content.startsWith('以下是用户最新输入内容')) return '最新用户输入（模型消息）';
  if (content === '开始任务') return '开始任务';
  if (content.startsWith('<thinking>') && content.includes('思考已开始')) return 'COT 伪装历史';
  return msg.role === 'assistant' ? 'assistant 消息' : 'user 消息';
}

function formatMessages(messages: Array<{ role: string; content: string }>, titles?: string[]): string {
  return messages
    .map((msg, index) => {
      const title = titles?.[index] ? `（${titles[index]}）` : '';
      return `## ${index + 1}. ${msg.role}${title}\n\n${msg.content}`;
    })
    .join('\n\n---\n\n');
}

function formatMainRequestOrderOverview(
  systemPromptSections: Array<{ title: string; content: string }>,
  apiMessages: 聊天消息[],
  tavernStatus?: {
    attempted: boolean;
    used: boolean;
    presetName?: string;
    reason?: string;
  },
): string {
  const lines: string[] = [
    '# 主剧情真实请求顺序总览',
    '',
    '本区块是本地诊断，不会发送给模型；下面列出的 System Prompt 分段与 API messages 才是本轮真实请求顺序。',
    '',
    '## System Prompt 分段',
  ];
  if (systemPromptSections.length) {
    systemPromptSections.forEach((section, index) => {
      lines.push(`${index + 1}. ${section.title}｜约 ${estimateTextTokens(section.content)} tokens`);
    });
  } else {
    lines.push('- 无 System Prompt 分段。');
  }

  lines.push('', '## API Messages');
  if (apiMessages.length) {
    apiMessages.forEach((message, index) => {
      const preview = message.content.replace(/\s+/g, ' ').trim().slice(0, 90);
      lines.push(`${index + 1}. role=${message.role}｜约 ${estimateTextTokens(message.content)} tokens｜${preview || '（空）'}`);
    });
  } else {
    lines.push('- 无 API messages。');
  }

  if (tavernStatus) {
    lines.push(
      '',
      '## 酒馆预设状态',
      `- 预设：${tavernStatus.presetName || '未选择'}`,
      `- 尝试酒馆消息链：${tavernStatus.attempted ? '是' : '否'}`,
      `- 当前快照已使用酒馆 messages：${tavernStatus.used ? '是' : '否'}`,
      tavernStatus.reason ? `- 说明：${tavernStatus.reason}` : '',
    );
  }

  return lines.filter(Boolean).join('\n');
}

function splitPromptSections(systemPrompt: string): Array<{ title: string; content: string }> {
  return systemPrompt
    .split(/\n\n---\n\n/g)
    .map((content, index) => ({
      title: sectionTitle(content, `系统提示词 ${index + 1}`),
      content: content.trim(),
    }))
    .filter((item) => item.content);
}

function categoryForPromptSection(title: string): string {
  if (title.startsWith('提示词｜')) return '提示词';
  if (title.startsWith('世界书｜')) return '世界书';
  if (title.includes('记忆') || title.includes('忆庭')) return '记忆';
  if (title.includes('智库')) return '智库';
  if (title.includes('星际和平周报') || title.includes('新闻')) return '新闻';
  if (title.includes('手机')) return '手机';
  if (title.includes('剧情编织')) return '剧情';
  if (title.includes('思维链')) return '思维链';
  return '系统';
}

function formatStoryWeavingProgressSnapshot(state: UseGameStateReturn): string {
  const story = state.剧情编织;
  const progress = story.当前进度;
  const diagnostics = getStoryWeavingInjectionDiagnostics(story);
  const series = story.系列列表.find((item) => item.id === (progress?.当前系列ID || story.当前系列ID))
    ?? story.系列列表.find((item) => item.激活注入 !== false)
    ?? story.系列列表[0];
  const current = series?.分段列表.find((segment) => segment.id === progress?.当前分段ID)
    ?? series?.分段列表.find((segment) => segment.组号 === progress?.当前分段组号)
    ?? series?.分段列表.find((segment) => segment.组号 === series.当前分段组号)
    ?? series?.分段列表.find((segment) => segment.运行状态 === '当前');
  if (!series || !current) return '当前没有可用的剧情编织进度锚点。';
  return [
    '# 剧情编织进度快照',
    '',
    `系列：${series.标题}`,
    `当前分段：第 ${current.组号} 段「${current.标题}」`,
    `运行状态：${current.运行状态}`,
    `推进状态：${progress?.推进状态 ?? '未记录'}`,
    diagnostics ? `注入健康：${diagnostics.健康状态}` : '',
    diagnostics ? `实际注入当前段：第 ${diagnostics.当前分段组号} 段「${diagnostics.当前分段标题}」｜${diagnostics.当前分段运行状态}` : '',
    diagnostics?.归档锚点标题 ? `已跳过归档锚点：第 ${diagnostics.归档锚点组号} 段「${diagnostics.归档锚点标题}」` : '',
    diagnostics?.检查项.length ? `注入检查：\n${diagnostics.检查项.map((item) => `- ${item}`).join('\n')}` : '',
    `最近判定回合：${progress?.最近一次推进判定回合 ?? '未记录'}`,
    progress?.最近门禁结果 ? `最近门禁结果：${progress.最近门禁结果}` : '',
    progress?.已完成摘要?.length ? `已完成摘要：\n${progress.已完成摘要.map((item) => `- ${item}`).join('\n')}` : '',
    progress?.当前待解问题?.length ? `当前待解问题：\n${progress.当前待解问题.map((item) => `- ${item}`).join('\n')}` : '',
    progress?.最近判定理由?.length ? `最近判定理由：\n${progress.最近判定理由.map((item) => `- ${item}`).join('\n')}` : '',
    progress?.历史归档?.length ? `历史归档：\n${progress.历史归档.slice(-8).map((item) => {
      const roleProgress = item.角色推进摘要?.length ? `｜角色推进：${item.角色推进摘要.slice(0, 3).join('；')}` : '';
      return `- 第${item.分段组号}段「${item.分段标题}」｜${item.归档状态}${item.归档回合 ? `｜回合${item.归档回合}` : ''}：${item.摘要}${roleProgress}`;
    }).join('\n')}` : '',
    current.本段结束状态.length ? `本段结束状态：\n${current.本段结束状态.slice(0, 6).map((item) => `- ${item}`).join('\n')}` : '',
    current.给后续参考.length ? `给后续参考：\n${current.给后续参考.slice(0, 6).map((item) => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

function formatStoryWeavingGateSnapshot(state: UseGameStateReturn, ctx: {
  recentUserInput: string;
  recentAIResponse?: string;
  currentLocation?: string;
  openingRegionName?: string;
  openingChapterName?: string;
  openingEntryText?: string;
  openingSource?: import('@/models/journey').开局来源;
  openingArchiveText?: string;
}): string {
  const gate = evaluateStoryWeavingGate(state.剧情编织, {
    recentUserInput: ctx.recentUserInput,
    recentAIResponse: ctx.recentAIResponse ?? '',
    currentLocation: ctx.currentLocation ?? '',
    openingRegionName: ctx.openingRegionName,
    openingChapterName: ctx.openingChapterName,
    openingEntryText: ctx.openingEntryText,
    openingSource: ctx.openingSource,
    openingArchiveText: ctx.openingArchiveText,
  });
  const diagnostics = getStoryWeavingInjectionDiagnostics(state.剧情编织);
  if (!gate) return '当前没有可评估的剧情编织门禁。';
  return [
    '# 剧情编织门禁预览',
    '',
    `系列ID：${gate.系列ID ?? '未知'}`,
    `分段：第 ${gate.分段组号 ?? '?'} 段`,
    `门禁结果：${gate.mode}`,
    diagnostics ? `注入健康：${diagnostics.健康状态}` : '',
    diagnostics ? `实际注入当前段：第 ${diagnostics.当前分段组号} 段「${diagnostics.当前分段标题}」｜${diagnostics.当前分段运行状态}` : '',
    diagnostics?.归档锚点标题 ? `已跳过归档锚点：第 ${diagnostics.归档锚点组号} 段「${diagnostics.归档锚点标题}」` : '',
    diagnostics?.前一分段标题 ? `历史承接段：${diagnostics.前一分段标题}` : '',
    diagnostics?.下一分段标题 ? `下一段预热：${diagnostics.下一分段标题}` : '',
    diagnostics?.检查项.length ? `注入检查：\n${diagnostics.检查项.map((item) => `- ${item}`).join('\n')}` : '',
    gate.reasons.length ? `命中理由：\n${gate.reasons.map((item) => `- ${item}`).join('\n')}` : '命中理由：无，默认软参考',
  ].filter(Boolean).join('\n');
}

function formatStoryPlanningAnalysisSnapshot(state: UseGameStateReturn): string {
  const analysis = buildStoryPlanningAnalysis(state.剧情编织);
  if (!analysis) return '当前没有可用的剧情规划分析。';
  return [
    '# 剧情规划分析快照',
    '',
    `系列：${analysis.系列标题}`,
    `当前分段：第 ${analysis.当前分段组号} 段「${analysis.当前分段标题}」`,
    `推进状态：${analysis.推进状态}`,
    `门禁结果：${analysis.门禁结果}`,
    `建议动作：${analysis.建议动作}`,
    `偏离风险：${analysis.偏离风险}`,
    analysis.分析理由.length ? `分析理由：\n${analysis.分析理由.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.关注事项.length ? `关注事项：\n${analysis.关注事项.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.切段条件.length ? `切段条件：\n${analysis.切段条件.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.待迁移事项.length ? `待迁移事项：\n${analysis.待迁移事项.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.下一步调度.length ? `下一步调度：\n${analysis.下一步调度.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.归档检查.length ? `归档检查：\n${analysis.归档检查.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.历史摘要.length ? `历史摘要：\n${analysis.历史摘要.map((item) => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

function formatNpcRelationshipPlanningSnapshot(state: UseGameStateReturn): string {
  const analysis = buildNpcRelationshipPlanning(state.NPC, state.turnCount);
  return [
    '# NPC 关系规划分析',
    '',
    analysis.总览,
    '',
    ...analysis.条目.slice(0, 8).map((item, index) => [
      `${index + 1}. ${item.姓名}｜${item.关系}｜好感 ${item.好感度}｜${item.同行 ? '同行' : '未同行'}`,
      `优先级：${item.优先级}`,
      `建议动作：${item.建议动作}`,
      item.理由.length ? `理由：${item.理由.join('；')}` : '',
      item.关注点.length ? `关注点：${item.关注点.join('；')}` : '',
    ].filter(Boolean).join('\n')),
  ].filter(Boolean).join('\n\n');
}

/** 工作包H：回合前历史（排除当前输入，压缩 assistant）——快照与真实发送同一套组装核心。 */
function buildPreTurnHistory(
  history: 聊天消息[],
  sourceInput: string,
  settings: UseGameStateReturn['gameSettings'],
  memorySystem: UseGameStateReturn['记忆'],
): 聊天消息[] {
  const messages: 聊天消息[] = [];
  const recentHistory = getMainHistoryWindow(history, settings, memorySystem);

  for (let index = 0; index < recentHistory.length; index += 1) {
    const msg = recentHistory[index];
    const isLastRecentMessage = index === recentHistory.length - 1;
    if (msg.role === 'user' && msg.content.startsWith('[系统]')) continue;
    // 排除当前输入（真实发送时它也由任务序列注入一次）
    if (isLastRecentMessage && msg.role === 'user' && msg.content.trim() === sourceInput) continue;
    if (msg.role === 'user') {
      messages.push(msg);
    } else if (msg.role === 'assistant' && msg.parsedResponse) {
      messages.push(创建聊天消息('assistant', buildLeanAssistantHistoryContent(msg)));
    }
  }

  return messages;
}
export function buildContextSnapshot(state: UseGameStateReturn, kind: ContextSnapshotKind = 'main'): ContextSnapshot {
  switch (kind) {
    case 'variable':
      return buildVariableContextSnapshot(state);
    case 'phone':
      return buildPhoneContextSnapshot(state);
    case 'news':
      return buildNewsContextSnapshot(state);
    case 'yiting':
      return buildYitingContextSnapshot(state);
    case 'zhiku':
      return buildZhikuContextSnapshot(state);
    case 'main':
    default:
      return buildMainContextSnapshot(state);
  }
}

function buildMainContextSnapshot(state: UseGameStateReturn): ContextSnapshot {
  const sourceInput = latestUserInput(state.chatHistory);
  const recallHistory = historyThroughLatestUser(state.chatHistory);
  const isOpeningSystemTrigger = state.turnCount === 1 && sourceInput.startsWith('[系统]');
  const isAwakeningEnterTrigger = sourceInput === '[系统] 踏入命途狭间';
  const awakeningPathId = state.世界.进行中狭间 ?? state.世界.待触发狭间;
  const currentScope: 'opening' | 'main' | 'pathAwakening' = state.世界.进行中狭间
    ? 'pathAwakening'
    : state.turnCount === 1
      ? 'opening'
      : 'main';
  const awakeningPhase: 'question' | 'judgement' | undefined = state.世界.进行中狭间
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
    settings: state.gameSettings.记忆系统,
    world: state.世界,
    npcs: state.NPC,
    history: recallHistory,
    userInput: sourceInput,
    turnCount: state.turnCount,
  });

  const openingArchiveText = 格式化开局档案上下文(state.世界.开局档案);
  const worldbookCtx = buildPromptWorldbookContext({
    userInput: sourceInput,
    history: recallHistory,
    world: state.世界,
    travelerName: state.旅人.姓名,
    turnCount: state.turnCount,
    npcNames: zhikuParticipation.present,
    scope: currentScope,
    openingArchiveText,
    worldbookTriggerStates: state.gameSettings.worldbookTriggerStates,
  });
  const immediateStoryReviewForZhiku = !isOpeningSystemTrigger ? buildImmediateStoryReview(state.chatHistory, Math.max(1, (state.gameSettings.记忆系统?.即时转短期阈值 ?? 10) - 1)) : '';
  const zhikuSceneContext = {
    ...worldbookCtx,
    startScenarioId: undefined,
    startSceneName: undefined,
    currentLocation: undefined,
    openingRegionName: worldbookCtx.openingRegionName,
    openingChapterName: worldbookCtx.openingChapterName,
    openingEntryText: worldbookCtx.openingEntryText,
    npcNames: [],
    presentNpcNamesForFallback: worldbookCtx.npcNames,
    anticipatedNpcNames: zhikuParticipation.anticipated,
    mentionedNpcNames: zhikuParticipation.mentioned,
    aiSupplementHints: {
      currentLocation: state.世界.当前地点,
      presentNpcNames: worldbookCtx.npcNames,
      immediateStoryReview: immediateStoryReviewForZhiku,
      openingArchiveText,
    },
  };
  const recallQuery = buildMainRecallQuery({
    userInput: sourceInput,
    history: recallHistory,
    currentLocation: state.世界.当前地点,
    npcNames: worldbookCtx.npcNames,
  });
  const zhikuRecallQuery = buildZhikuKeywordRecallQuery({
    userInput: sourceInput,
    history: recallHistory,
  });

  const yitingEnabled = state.gameSettings.记忆系统?.忆庭启用 !== false;
  const yitingThreshold = state.gameSettings.记忆系统?.忆庭召回最早触发回合 ?? 10;
  const yitingPreview = yitingEnabled && recallQuery && state.turnCount > yitingThreshold
    ? retrieveYitingContext(
        state.忆庭,
        recallQuery,
        state.gameSettings.记忆系统?.忆庭召回条数 ?? 创建默认记忆系统设置().忆庭召回条数,
      )
    : null;
  const zhikuPreview = compileZhikuTurn({
    system: state.gameSettings.智库系统?.enabled ? state.智库 : undefined,
    query: zhikuRecallQuery,
    limit: state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries,
    scope: zhikuRequestScope,
    participation: zhikuParticipation,
    sceneContext: zhikuSceneContext,
  });

  const immediateStoryReview = immediateStoryReviewForZhiku;
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
        sceneNames: state.世界.当前时段?.人物?.map((npc) => npc.姓名),
        recalledNames: worldbookCtx.npcNames,
      })
    : undefined;

  // 工作包C：命途狭间回合判定
  const isPathAwakeningTurn = isAwakeningEnterTrigger || awakeningPhase !== undefined;
  const mainStoryConfig = state.apiSettings.configs.find((item) => item.id === state.apiSettings.activeConfigId)
    ?? state.apiSettings.configs[0]
    ?? {
      id: '__snapshot_unconfigured__',
      name: '未配置主 API',
      provider: 'openai_compatible' as const,
      baseUrl: '',
      apiKey: '',
      model: '',
      createdAt: 0,
      updatedAt: 0,
    };
  const macroCtx = buildPromptMacroContext({
    history: recallHistory,
    playerName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
    turnCount: state.turnCount,
    modelName: mainStoryConfig.model,
    maxContext: mainStoryConfig.maxContext,
    globals: state.gameSettings.macroGlobalVars,
  });
  // 工作包A：世界书单回合唯一解析（快照与真实发送共用同一 plan 来源）
  const worldbookPlan = resolvePromptWorldbookPlan(
    state.worldbooks,
    worldbookCtx,
    state.gameSettings.enableWorldbookInjection,
  );
  // 工作包B：最近 1-2 条剧情规划（区5 剧情安排）
  const storyPlanSnippets = extractRecentStoryPlanSnippets(state.chatHistory);

  const builtPrompt = isOpeningSystemTrigger
    ? buildOpeningSystemPrompt(
        state.旅人,
        state.世界,
        state.gameSettings,
        state.turnCount,
        state.worldbooks,
        worldbookCtx,
        state.新闻,
        isOpeningSystemTrigger ? 'opening' : 'normal',
        macroCtx,
        worldbookPlan ?? undefined,
        zhikuPreview,
      )
    : isPathAwakeningTurn
      ? buildPathAwakeningSystemPrompt(
          state.旅人,
          state.世界,
          state.gameSettings,
          state.turnCount,
          state.worldbooks,
          worldbookCtx,
          zhikuPreview,
          awakeningPhase,
          storyRecallInjection || undefined,
          'normal',
          macroCtx,
          worldbookPlan ?? undefined,
        )
      : buildSystemPrompt(
        state.旅人,
        state.世界,
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
        storyRecallInjection || (yitingEnabled && recallQuery && state.turnCount > yitingThreshold ? '' : undefined),
        (yitingPreview?.strongEntries?.length ?? 0) > 0,
        npcLedgerSelection,
        isOpeningSystemTrigger ? 'opening' : 'normal',
        macroCtx,
        storyPlanSnippets,
        worldbookPlan ?? undefined,
      );
  // 上下文快照需要跟真实发送路径对齐：V2 酒馆预设只额外发送 Tavern messages，
  // 原生 systemPrompt 仍完整发送，因此 Tavern 链路不重复塞原生底座和当前用户输入。
  // 工作包B：天气已由 builder 作为区6 第3项统一组装，快照不再追加
  let systemPrompt = builtPrompt.systemPrompt;
  const recentHistory = awakeningPhase
    ? getPathAwakeningHistoryWindow(recallHistory, awakeningPhase)
    : getMainHistoryWindow(recallHistory, state.gameSettings, state.记忆);
  const tavernHistory = recentHistory.filter((msg, index) => {
    if (msg.role !== 'user') return true;
    const isLastRecentMessage = index === recentHistory.length - 1;
    return !(isLastRecentMessage && msg.content.trim() === sourceInput);
  });
  // Tavern V2 判定与消息链构建（工作包D：scope-aware 兼容保护）
  const currentPresetV2 = getCurrentSTPresetV2(state.gameSettings, getBuiltinPresetsV2());
  const shouldTryTavernV2 =
    state.gameSettings.enableStPreset !== false &&
    Boolean(currentPresetV2?.preset?.prompts?.length) &&
    Boolean(currentPresetV2?.preset?.prompt_order?.length);
  const tavernStatus: Parameters<typeof formatMainRequestOrderOverview>[2] = {
    attempted: shouldTryTavernV2,
    used: false,
    presetName: currentPresetV2?.name,
    reason: currentPresetV2
      ? state.gameSettings.enableStPreset === false
        ? '酒馆预设总开关关闭。'
        : ''
      : '未选择酒馆 V2 预设，因此本回合仍走原生主流程。',
  };
  let requestMessagesTitle = '历史记录';
  let requestMessagesCategory = '历史';
  let apiMessages: 聊天消息[] = [];
  const nativeDepthMessages = builtPrompt.chatModuleMessages.filter((m) => m._injectionPosition === 1);
  if (shouldTryTavernV2 && currentPresetV2) {
    try {
      const latestTavernInput = isOpeningSystemTrigger
        ? '请根据当前角色、当前场景、世界书与内置提示词，直接生成第 0 回合开场叙事。不要等待玩家再次输入。'
        : isAwakeningEnterTrigger && awakeningPathId
          ? `玩家选择踏入「命途狭间」(命途 ID: ${awakeningPathId})。请按 pathAwakening 流程生成第一道诘问,不要推进主剧情,不要等玩家再次发言。`
          : sourceInput;
      const tavernMessages = buildTavernMessageChain({
        settings: state.gameSettings,
        preset: currentPresetV2.preset,
        characterId: state.gameSettings.currentStCharacterId ?? currentPresetV2.characterId ?? null,
        chatHistory: insertDepthIntoHistory(tavernHistory, nativeDepthMessages),
        latestUserInput: latestTavernInput,
        playerName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
        playerRole: state.旅人,
        includeNativeContextInWorldbook: false,
        triggerType: isOpeningSystemTrigger ? 'opening' : 'normal',
        macroCtx,
        scope: isOpeningSystemTrigger ? 'opening' : (isPathAwakeningTurn ? 'pathAwakening' : 'main'),
      }).map((msg) => 创建聊天消息(msg.role, msg.content));
      if (tavernMessages.length) {
        apiMessages = tavernMessages;
        requestMessagesTitle = '酒馆预设消息链';
        requestMessagesCategory = '酒馆预设';
        tavernStatus.used = true;
        tavernStatus.reason = '快照已按当前酒馆 V2 预设生成额外 API messages；原生游戏底座 systemPrompt 仍会完整发送。酒馆 chatHistory 槽位只使用原生近期历史窗口，并排除当前用户输入，避免全量历史和本轮输入重复注入。';
      } else {
        tavernStatus.reason = '酒馆消息链为空；真实发送时会回退原生主流程。';
      }
    } catch (error) {
      tavernStatus.reason = `酒馆消息链构建失败；真实发送时会回退原生主流程。${error instanceof Error ? error.message : String(error)}`;
    }
  }
  // 回合前历史（排除当前输入——当前输入在任务序列中只出现一次）
  const preTurnHistory = awakeningPhase
    ? recentHistory
        .filter((msg) => msg.role === 'user' || (msg.role === 'assistant' && msg.parsedResponse))
        .map((msg) => msg.role === 'assistant'
          ? 创建聊天消息('assistant', buildLeanAssistantHistoryContent(msg))
          : msg)
    : buildPreTurnHistory(recallHistory, sourceInput, state.gameSettings, state.记忆);
  const providerCapabilities = resolveChatProviderCapabilities(mainStoryConfig);
  const deepSeekMainMode = state.gameSettings.deepSeekMainMode ?? 'off';
  const deepSeekTransportActive = providerCapabilities.transport === 'deepseek' && deepSeekMainMode !== 'off';
  const deepSeekMainActive = deepSeekTransportActive
    && !tavernStatus.used
    && !isOpeningSystemTrigger
    && !isPathAwakeningTurn;
  const deepSeekLockFormat = deepSeekTransportActive && deepSeekMainMode === 'lock_format';
  // 模式判定（工作包C）：opening / 命途狭间走专用尾部
  const messageMode: MainStoryMessageMode = isOpeningSystemTrigger || isPathAwakeningTurn
    ? 'standard'
    : deriveMainStoryMessageMode({
        tavernV2Active: tavernStatus.used,
        deepSeekMainActive,
        deepSeekLockFormat,
        enableCotFakeHistory: state.gameSettings.enableCotFakeHistory,
      });
  // position=0 兼容消息（user/assistant 角色模块）
  const positionZeroCompatMessages = builtPrompt.chatModuleMessages
    .filter((m) => m._injectionPosition === 0 && m.role !== 'system')
    .sort((a, b) => (a._injectionOrder ?? 0) - (b._injectionOrder ?? 0))
    .map((m) => 创建聊天消息(m.role === 'assistant' ? 'assistant' : 'user', m.content));
  const depthMessages = tavernStatus.used ? [] : nativeDepthMessages;
  // 本回合条件约束
  const turnConstraints: 聊天消息[] = [];
  if (isOpeningSystemTrigger && !tavernStatus.used) {
    turnConstraints.push(创建聊天消息('user', '请根据当前角色、当前场景、世界书与内置提示词，直接生成第 0 回合开场叙事。不要等待玩家再次输入。'));
  }
  if (isAwakeningEnterTrigger && awakeningPathId && !tavernStatus.used) {
    turnConstraints.push(创建聊天消息('user', `玩家选择踏入「命途狭间」(命途 ID: ${awakeningPathId})。请按 pathAwakening 流程生成第一道诘问,不要推进主剧情,不要等玩家再次发言。`));
  }
  if (awakeningPhase === 'judgement') {
    turnConstraints.push(创建聊天消息('user', '⚠ 命途狭间·回应回合提醒:你上一回合已出三题,玩家本轮给出了答案。本回合**必须**在所有标签之外、**单独**写一行 `<狭间评判>升阶</狭间评判>`。命途狭间没有失败、滞留或退转;三问只是让玩家明确自己的道路。漏掉这个标签会让玩家永远卡在虚境无法升阶——这是必须避免的错误。同时正文里要让命途意志回应玩家答案、确认其道路,再把旅人从虚境拉回现实场景。'));
  }
  if (deepSeekMainActive) turnConstraints.push(创建聊天消息('user', DEEPSEEK_MAIN_FORMAT_GUARD));
  // 区E 执法块（main scope）
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
  // 任务序列（按模式）
  let taskSequence: 聊天消息[];
  if (messageMode === 'cot_pseudo') {
    taskSequence = buildCotPseudoTaskSequence(sourceInput);
  } else if (tavernStatus.used && currentPresetV2) {
    taskSequence = apiMessages; // Tavern 消息链（上面已构建）
  } else if (isOpeningSystemTrigger || isAwakeningEnterTrigger) {
    taskSequence = [];
  } else {
    taskSequence = [创建聊天消息('user', sourceInput)];
  }
  // prefill（工作包C 8.6）
  const currentPresetId = state.gameSettings.currentStPresetId;
  const currentPreset = currentPresetId
    ? [...getBuiltinPresets(), ...(state.gameSettings.stPresets ?? [])].find((item) => item.id === currentPresetId)
    : undefined;
  const presetAssistantPrefill = currentPreset?.assistantPrefill;
  let effectivePrefixMode = false;
  let effectivePrefixContent: string | undefined;
  if ((messageMode === 'deepseek_prefix' || ((isOpeningSystemTrigger || isPathAwakeningTurn) && !tavernStatus.used && deepSeekLockFormat))) {
    effectivePrefixMode = true;
    effectivePrefixContent = '<thinking>\n';
  } else if (messageMode === 'standard' && !isOpeningSystemTrigger && !isPathAwakeningTurn && presetAssistantPrefill) {
    effectivePrefixMode = true;
    effectivePrefixContent = presetAssistantPrefill;
  }
  const finalizedMainRequest = finalizeMainRequest({
    config: mainStoryConfig,
    systemPrompt,
    mode: messageMode,
    preTurnHistory: tavernStatus.used ? [] : preTurnHistory,
    depthMessages,
    positionZeroCompatMessages,
    turnConstraints,
    enforcementBlock,
    taskSequence,
    prefixMode: effectivePrefixMode,
    prefixContent: effectivePrefixContent,
    streaming: state.gameSettings.enableStreaming,
    scope: zhikuRequestScope,
    zhikuCompileId: zhikuPreview.compileId,
  });
  systemPrompt = finalizedMainRequest.systemPrompt;
  apiMessages = finalizedMainRequest.messages;
  const systemPromptSections = splitPromptSections(systemPrompt);
  const sections: ContextSection[] = [];
  // F2·对标既定方案：忆庭强回忆命中且关闭并存注入时，明确显示暂停原因（真实请求已同步收紧）。
  const yitingMutexActiveSnapshot =
    state.gameSettings.记忆系统?.忆庭命中并存注入 !== true
    && Boolean(yitingPreview?.injection);
  if (yitingMutexActiveSnapshot) {
    addSection(sections, {
      id: 'yiting_mutex_suppression',
      title: '忆庭互斥·记忆注入暂停说明',
      category: '诊断',
      content: '忆庭召回命中强回忆且「忆庭命中并存注入」开关关闭：本回合已暂停短期/中期记忆注入，长期记忆仅保留少量锚点（最近 3 条），旧事承接由忆庭强回忆原文注入承担。',
      upload: false,
      diagnostic: true,
    });
  }
  addSection(sections, {
    id: 'main_request_order_overview',
    title: '主剧情真实请求顺序总览',
    category: '诊断',
    content: formatMainRequestOrderOverview(systemPromptSections, apiMessages, tavernStatus),
    upload: false,
    diagnostic: true,
  });
  addSection(sections, {
    id: 'story_weaving_progress',
    title: '剧情编织进度快照',
    category: '诊断',
    content: formatStoryWeavingProgressSnapshot(state),
    upload: false,
    diagnostic: true,
  });
  addSection(sections, {
    id: 'story_weaving_gate',
    title: '剧情编织门禁预览',
    category: '诊断',
    content: formatStoryWeavingGateSnapshot(state, worldbookCtx),
    upload: false,
    diagnostic: true,
  });
  addSection(sections, {
    id: 'story_planning_analysis',
    title: '剧情规划分析快照',
    category: '诊断',
    content: formatStoryPlanningAnalysisSnapshot(state),
    upload: false,
    diagnostic: true,
  });
  addSection(sections, {
    id: 'npc_relationship_planning',
    title: 'NPC 关系规划分析',
    category: '诊断',
    content: formatNpcRelationshipPlanningSnapshot(state),
    upload: false,
    diagnostic: true,
  });
  addSection(sections, {
    id: 'npc_ledger_actual_saved',
    title: '上一回合真实保存的 NPC 账本诊断',
    category: '实际',
    content: latestAssistantNpcLedgerDebug(state.chatHistory) || '（上一条 AI 回复没有保存 NPC 账本诊断；请从本功能更新后的新回合开始查看。）',
    upload: false,
    diagnostic: true,
  });
  if (npcLedgerSelection) {
    addSection(sections, {
      id: 'npc_ledger_preview',
      title: '本回合 NPC 账本预期注入',
      category: '诊断',
      content: formatNpcLedgerSelectionSnapshot(npcLedgerSelection),
      upload: false,
      diagnostic: true,
    });
  }
  systemPromptSections.forEach((item, index) => {
    addSection(sections, {
      id: `system_${index}`,
      title: item.title,
      category: categoryForPromptSection(item.title),
      content: item.content,
      upload: true,
    });
  });

  if (apiMessages.length) {
    // 原生 minimal 模式下无历史消息，剩余均为执法块 + 任务序列（COT 伪装历史等），
    // 不应再叫「历史记录」（对标参考项目：消息逐条命名）。
    if (!tavernStatus.used && preTurnHistory.length === 0) {
      requestMessagesTitle = '请求消息';
      requestMessagesCategory = '请求';
    }
    const messageTitles = apiMessages.map(describeApiMessage);
    addSection(sections, {
      id: requestMessagesCategory === '酒馆预设' ? 'tavern_preset_message_chain' : 'history_window',
      title: `${requestMessagesTitle}（${apiMessages.length} 条）`,
      category: requestMessagesCategory,
      content: formatMessages(apiMessages.map((msg) => ({ role: msg.role, content: msg.content })), messageTitles),
      upload: true,
    });
  }

  return finalizeSnapshot('main', '主剧情当前 AI 上下文', sections, sourceInput);
}

function buildVariableContextSnapshot(state: UseGameStateReturn): ContextSnapshot {
  const sourceInput = latestUserInput(state.chatHistory);
  const lastAssistant = [...state.chatHistory].reverse().find((msg) => msg.role === 'assistant');
  const body = lastAssistant?.parsedResponse?.body || lastAssistant?.content || '（当前还没有主模型正文，变量模型暂无可校准内容。）';
  const variableDraft = lastAssistant?.parsedResponse?.variableDraft || '';
  const variableState = snapshotVariableState({
    旅人: state.旅人,
    世界: state.世界,
    记忆: state.记忆,
    忆庭: state.忆庭,
    智库: state.智库,
    手机: state.手机,
    NPC: state.NPC,
    新闻: state.新闻,
    剧情: state.剧情,
  });
  const sections: ContextSection[] = [];
  addSection(sections, {
    id: 'variable_npc_memory_rule',
    title: 'NPC档案记忆写入法则（完整）',
    category: '诊断',
    content: [
      '本区块是从变量模型系统提示词中单独抽出的完整 NPC 写入法则，方便核对；真实请求仍通过“变量模型系统提示词”发送。',
      '',
      NPC_MEMORY_WRITE_RULE_PROMPT,
    ].join('\n'),
    upload: false,
    diagnostic: true,
  });
  addSection(sections, {
    id: 'variable_system',
    title: '变量模型系统提示词',
    category: '系统',
    content: buildVariableModelPrompt(variableState, {
      enabled: state.gameSettings.enableNsfw,
      maleArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
    }, state.gameSettings.promptModules),
  });
  addSection(sections, {
    id: 'variable_user',
    title: '变量模型用户消息',
    category: '用户',
    content: [
      `## 第 ${Math.max(1, state.turnCount - 1)} 回合的正文`,
      '',
      '玩家输入：',
      sourceInput || '（无）',
      '',
      '主模型变量草稿：',
      variableDraft.trim() || '（无）',
      '',
      '主模型回复正文：',
      body,
      '',
      '---',
      '',
      '请阅读上面的正文，输出 <thinking>、<变量事实> JSON 和兼容 <变量更新> 块。默认让 <变量更新> 留空。',
      '只按“主模型回复正文”里实际发生的台前事实落库；剧情编织/智库/新闻/回忆材料如果没有进入正文，不是变量事实。',
    ].join('\n'),
  });
  return finalizeSnapshot('variable', '变量模型上下文', sections, sourceInput);
}

function buildPhoneContextSnapshot(state: UseGameStateReturn): ContextSnapshot {
  const sourceInput = latestUserInput(state.chatHistory);
  const chat = state.手机.chats[0] ?? 创建手机会话({
    type: 'private',
    title: '预览会话',
    participantIds: [],
  });
  const contact = chat.participantIds[0]
    ? state.手机.contacts.find((item) => item.id === chat.participantIds[0] || item.npcId === chat.participantIds[0])
    : state.手机.contacts[0];
  const seed = state.手机.messageSeeds.find((item) => item.status === 'pending');
  const ctx = {
    traveler: state.旅人,
    world: state.世界,
    memory: state.记忆,
    yiting: state.忆庭,
    npcRecords: state.NPC,
    news: state.新闻,
    turnCount: state.turnCount,
    chat,
    contact,
    userText: sourceInput,
    seed,
    mainChatHistory: state.chatHistory,
    storyWeaving: state.剧情编织,
    zhiku: state.智库,
  };
  const sections: ContextSection[] = [];
  addSection(sections, {
    id: 'phone_story_progress_diagnostic',
    title: '剧情编织进度诊断',
    category: '诊断',
    content: formatStoryWeavingProgressSnapshot(state),
    upload: false,
    diagnostic: true,
  });
  addSection(sections, {
    id: 'phone_system',
    title: '手机系统提示词',
    category: '系统',
    content: buildPhonePromptModulesSection(state.gameSettings.promptModules) || buildPhoneSystemPrompt(ctx),
  });
  addSection(sections, {
    id: 'phone_messages',
    title: '手机消息窗口',
    category: '历史/用户',
    content: formatMessages(buildPhoneMessages(ctx)),
  });
  return finalizeSnapshot('phone', '手机系统上下文', sections, sourceInput);
}

function buildNewsContextSnapshot(state: UseGameStateReturn): ContextSnapshot {
  const sourceInput = latestUserInput(state.chatHistory);
  const lastAssistant = [...state.chatHistory].reverse().find((msg) => msg.role === 'assistant');
  const body = lastAssistant?.parsedResponse?.body || lastAssistant?.content || '（当前还没有主回复正文。）';
  const recentTurns = state.chatHistory
    .slice(-12)
    .map((msg) => `- ${msg.role === 'user' ? '玩家' : 'AI'}：${(msg.parsedResponse?.body || msg.content).slice(0, 420)}`);
  const request = {
    config: state.apiSettings.configs.find((item) => item.id === state.apiSettings.activeConfigId) ?? state.apiSettings.configs[0] ?? {
      id: '__preview__',
      name: '预览',
      provider: 'openai_compatible' as const,
      baseUrl: '',
      apiKey: '',
      model: '',
      createdAt: 0,
      updatedAt: 0,
    },
    turnCount: state.turnCount,
    userInput: sourceInput,
    body,
    recentTurns,
    traveler: state.旅人,
    world: state.世界,
    news: state.新闻,
    npcRecords: state.NPC,
    plotNodes: state.剧情,
    storyWeaving: state.剧情编织,
    promptModules: state.gameSettings.promptModules,
  };
  const sections: ContextSection[] = [];
  addSection(sections, {
    id: 'news_system',
    title: '星际周报系统提示词',
    category: '系统',
    content: buildNewsModelPrompt(request),
  });
  addSection(sections, {
    id: 'news_user',
    title: '星际周报用户消息',
    category: '用户',
    content: buildNewsUserMessage(request),
  });
  return finalizeSnapshot('news', '星际周报上下文', sections, sourceInput);
}

function buildYitingContextSnapshot(state: UseGameStateReturn): ContextSnapshot {
  const sourceInput = latestUserInput(state.chatHistory);
  const settings = state.gameSettings.记忆系统 ?? 创建默认记忆系统设置();
  const actualRecallPreview = latestAssistantYitingDebugRecall(state.chatHistory);
  const recallQuery = buildMainRecallQuery({
    userInput: sourceInput,
    history: state.chatHistory,
    currentLocation: state.世界.当前地点,
    npcNames: getExplicitNpcNamesForTurn({
      world: state.世界,
      npcs: state.NPC,
      history: state.chatHistory,
      userInput: sourceInput,
      turnCount: state.turnCount,
    }),
  });
  const fallback = retrieveYitingContext(state.忆庭, recallQuery, settings.忆庭召回条数 ?? 8);
  const candidates = state.忆庭.回忆档案
    .slice(-24)
    .map((entry, index) => {
      return [
        `${index + 1}. ${entry.名称 || `第${entry.回合}回合回忆`}｜回合：${entry.回合}｜类型：${entry.类型 ?? '回忆'}`,
        `概括：\n${entry.摘要 || (entry.原文 ? `${entry.原文.slice(0, 220)}…` : '无概括')}`,
      ].join('\n');
    })
    .join('\n\n');
  const sections: ContextSection[] = [];
  addSection(sections, {
    id: 'yiting_system',
    title: '忆庭召回提示词',
    category: '系统',
    content: buildYitingRecallSystemPrompt(state.gameSettings.promptModules),
  });
  addSection(sections, {
    id: 'yiting_user',
    title: '忆庭召回用户消息',
    category: '用户',
    content: [
      `玩家当前输入：${sourceInput || '（无）'}`,
      '',
      '实际召回查询：',
      recallQuery || '（无）',
      `召回条数上限：${settings.忆庭召回条数 ?? 8}`,
      '本地预筛：topK 24；最近 6 条强制保底；候选统一给概要层，不把正文原文作为主剧情召回材料。',
      '',
      '候选回忆：',
      candidates || '（当前没有候选回忆档案）',
      '',
      '本地召回预览：',
      fallback.previewText || fallback.injection || '（未命中）',
    ].join('\n'),
  });
  addSection(sections, {
    id: 'yiting_actual_saved_preview',
    title: '上一回合真实保存的忆庭召回诊断',
    category: '实际',
    content: actualRecallPreview || '（上一条 AI 回复没有保存忆庭召回诊断；请从新增诊断后的新回合开始查看。）',
    upload: false,
    diagnostic: true,
  });
  return finalizeSnapshot('yiting', '忆庭召回上下文', sections, sourceInput);
}

function buildZhikuContextSnapshot(state: UseGameStateReturn): ContextSnapshot {
  const sourceInput = latestUserInput(state.chatHistory);
  const recallHistory = historyThroughLatestUser(state.chatHistory);
  const participation = getZhikuCharacterParticipationForTurn({
    settings: state.gameSettings.记忆系统,
    world: state.世界,
    npcs: state.NPC,
    history: recallHistory,
    userInput: sourceInput,
    turnCount: state.turnCount,
  });
  const immediateStoryReview = buildImmediateStoryReview(state.chatHistory, Math.max(1, (state.gameSettings.记忆系统?.即时转短期阈值 ?? 10) - 1));
  const latestStoryPlan = [...state.chatHistory]
    .reverse()
    .find((message) => message.role === 'assistant' && message.parsedResponse?.storyPlan?.trim())
    ?.parsedResponse?.storyPlan?.trim();
  const storyWeavingForZhiku = state.gameSettings.剧情编织系统?.enabled && state.gameSettings.剧情编织系统.currentWindow
    ? getStoryWeavingInjectionDiagnostics(state.剧情编织)
    : null;
  const sceneContext = {
    startScenarioId: undefined,
    startSceneName: undefined,
    currentLocation: undefined,
    npcNames: [],
    presentNpcNamesForFallback: participation.present,
    anticipatedNpcNames: participation.anticipated,
    mentionedNpcNames: participation.mentioned,
    aiSupplementHints: {
      currentLocation: state.世界.当前地点,
      presentNpcNames: participation.present,
      immediateStoryReview,
      storyPlan: [
        latestStoryPlan,
        storyWeavingForZhiku
          ? `当前剧情段：${storyWeavingForZhiku.当前分段标题}；下一段预热：${storyWeavingForZhiku.下一分段标题 || '无'}`
          : '',
      ].filter(Boolean).join('\n'),
    },
    originalProtagonist: state.世界.原著主角,
  };
  const recallQuery = buildZhikuKeywordRecallQuery({
    userInput: sourceInput,
    history: recallHistory,
  });
  const limit = state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries;
  const aiSupplementEnabled = state.gameSettings.智库系统?.enableAiSupplement === true;
  const fallback = compileZhikuTurn({
    system: state.智库,
    query: recallQuery,
    limit,
    scope: 'diagnostic',
    participation,
    sceneContext,
  });
  const aiCandidateIndex = buildZhikuAiRequestForTurn(state.智库, recallQuery, fallback.entries, sceneContext);
  const actualRecallPreview = latestAssistantZhikuDebugRecall(state.chatHistory);
  const zhikuDiagnostics = fallback.diagnostics;
  const diagnosticText = zhikuDiagnostics
    ? [
        `场景锚点：${zhikuDiagnostics.场景锚点.join('、') || '无'}`,
        `相关角色：${zhikuDiagnostics.相关角色.join('、') || '无'}`,
        `在场角色兜底召回：${zhikuDiagnostics.在场角色兜底召回.join('、') || '无'}`,
        `关键词召回：${zhikuDiagnostics.关键词召回.join('、') || '无'}`,
        `AI检索补充：${zhikuDiagnostics.AI检索补充.join('、') || '无'}`,
        `关键词资料召回：${zhikuDiagnostics.关键词资料召回.join('、') || '无'}`,
        `AI检索补充强资料：${zhikuDiagnostics.AI检索补充强资料.join('、') || '无'}`,
        `AI检索补充弱资料：${zhikuDiagnostics.AI检索补充弱资料.join('、') || '无'}`,
        `候选资料：${zhikuDiagnostics.候选资料.join('、') || '无'}`,
        `AI候选资料：${zhikuDiagnostics.AI候选资料.join('、') || '无'}`,
        `AI候选索引：${zhikuDiagnostics.AI候选索引.join('；') || '无'}`,
        `AI形态修正：${zhikuDiagnostics.AI形态修正.join('；') || '无'}`,
        `AI拒绝选择：${zhikuDiagnostics.AI拒绝选择.join('；') || '无'}`,
        `AI未选择原因：${zhikuDiagnostics.AI未选择原因 || '无'}`,
        `逐条召回轨迹：${formatZhikuCandidateDecisionTrace(zhikuDiagnostics.candidateDecisions)}`,
        `最终注入角色资料（已去重）：${zhikuDiagnostics.角色相关资料.join('、') || '无'}`,
        `最终注入强资料：${zhikuDiagnostics.强相关资料.join('、') || '无'}`,
        `最终注入弱资料：${zhikuDiagnostics.弱相关资料.join('、') || '无'}`,
        `已注入资料：${zhikuDiagnostics.已注入资料.join('、') || '无'}`,
        `静态注入体量：${zhikuDiagnostics.静态注入字符数} 字符 / 约 ${zhikuDiagnostics.静态注入估算Token} tokens`,
        zhikuDiagnostics.单条静态注入体量.length
          ? `单条体量：${zhikuDiagnostics.单条静态注入体量.map((item) => `${item.标题} ${item.字符数}字/${item.估算Token}t（${item.保留优先级}）`).join('；')}`
          : '单条体量：无',
        `动态状态来源：${zhikuDiagnostics.动态状态来源.join('；') || '无'}`,
        `去重记录：${zhikuDiagnostics.去重记录.join('；') || '无'}`,
        zhikuDiagnostics.删减记录.length
          ? `删减记录：${zhikuDiagnostics.删减记录.map((item) => `${item.标题}（${item.原优先级}：${item.原因}）`).join('；')}`
          : '删减记录：无',
        `体量预警：${zhikuDiagnostics.体量预警.join('；') || '无'}`,
        zhikuDiagnostics.被门禁过滤.length
          ? `门禁过滤：${zhikuDiagnostics.被门禁过滤.map((item) => `${item.标题}（${item.原因}）`).join('；')}`
          : '门禁过滤：无',
        `检查项：${zhikuDiagnostics.检查项.join('；') || '无'}`,
      ].join('\n')
    : '（无诊断信息）';
  const sections: ContextSection[] = [];
  addSection(sections, {
    id: 'zhiku_actual_saved_preview',
    title: '上一回合真实保存的召回诊断',
    category: '实际',
    content: actualRecallPreview || '（上一条 AI 回复没有保存召回诊断；请从新增诊断后的新回合开始查看。）',
    upload: false,
    diagnostic: true,
  });
  if (aiSupplementEnabled) {
    addSection(sections, {
      id: 'zhiku_system',
      title: '智库 AI 召回编译器提示词',
      category: '系统',
      content: buildZhikuModelSystemPrompt(zhikuDiagnostics?.场景锚点 ?? [], state.gameSettings.promptModules),
    });
    addSection(sections, {
      id: 'zhiku_user',
      title: '智库 AI 补充用户消息',
      category: '用户',
      content: buildZhikuModelUserPrompt(aiCandidateIndex.request),
    });
  }
  addSection(sections, {
    id: 'zhiku_local_diagnostics',
    title: '智库本地召回诊断',
    category: '诊断',
    content: [
      aiSupplementEnabled
        ? `AI 主动补充已开启；当前玩家输入：${sourceInput || '（无）'}`
        : 'AI 主动补充未开启。本回合只执行正文关键词检索，不会发送智库补充 API 请求。',
      '',
      `正文关键词窗口：${recallQuery || '（无）'}`,
      '',
      '本地召回诊断：',
      diagnosticText,
      '',
      '本地注入预览：',
      fallback.injection || '（未命中）',
    ].join('\n'),
    upload: false,
    diagnostic: true,
  });
  return finalizeSnapshot('zhiku', '智库召回上下文', sections, sourceInput);
}
