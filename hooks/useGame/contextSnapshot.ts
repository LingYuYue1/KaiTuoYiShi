import type { UseGameStateReturn } from '@/hooks/useGameState';
import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import { 创建手机会话 } from '@/models/phone';
import { 创建默认智库系统设置, 创建默认记忆系统设置 } from '@/models/settings';
import { buildNewsModelPrompt, buildNewsUserMessage } from '@/services/ai/newsModel';
import { buildPhoneMessages, buildPhoneSystemPrompt } from '@/services/ai/phoneService';
import { buildVariableModelPrompt } from '@/services/ai/variableModel';
import { retrieveYitingContext } from '@/services/yitingRetrieval';
import { retrieveZhikuContext } from '@/services/zhikuRetrieval';
import { evaluateStoryWeavingGate, getStoryWeavingInjectionDiagnostics } from '@/services/storyWeaving';
import { buildStoryPlanningAnalysis } from '@/services/storyPlanningAnalysis';
import { buildNpcRelationshipPlanning } from '@/services/npcRelationshipPlanning';
import { estimateTextTokens } from '@/utils/tokenEstimate';
import { snapshotVariableState } from '@/utils/variableExecutor';
import { buildImmediateStoryReview, buildMainRecallQuery, getMainHistoryWindow } from './historyWindow';
import { buildOpeningSystemPrompt, buildSystemPrompt } from './systemPromptBuilder';

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

export interface ContextSection {
  id: string;
  title: string;
  category: string;
  order: number;
  content: string;
  estimatedTokens: number;
}

export type ContextSnapshotKind = 'main' | 'variable' | 'phone' | 'news' | 'yiting' | 'zhiku';

export interface ContextSnapshot {
  kind: ContextSnapshotKind;
  title: string;
  sections: ContextSection[];
  fullText: string;
  estimatedTokens: number;
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
  return [...history]
    .reverse()
    .find((msg) => msg.role === 'assistant' && msg.debugContext?.zhikuRecallPreview?.trim())
    ?.debugContext?.zhikuRecallPreview
    ?.trim() ?? '';
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

  return {
    kind,
    title,
    sections,
    fullText,
    estimatedTokens,
    createdAt: Date.now(),
    sourceInput,
  };
}

function formatMessages(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((msg, index) => `## ${index + 1}. ${msg.role}\n\n${msg.content}`)
    .join('\n\n---\n\n');
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
}): string {
  const gate = evaluateStoryWeavingGate(state.剧情编织, {
    recentUserInput: ctx.recentUserInput,
    recentAIResponse: ctx.recentAIResponse ?? '',
    currentLocation: ctx.currentLocation ?? '',
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

function buildApiMessages(
  history: 聊天消息[],
  options: {
    isOpeningSystemTrigger: boolean;
    isAwakeningEnterTrigger: boolean;
    awakeningPhase?: 'question' | 'judgement';
    awakeningPathId?: string;
    enableCotFakeHistory: boolean;
    settings: UseGameStateReturn['gameSettings'];
    memorySystem: UseGameStateReturn['记忆'];
  },
): 聊天消息[] {
  const messages: 聊天消息[] = [];
  const recentHistory = getMainHistoryWindow(history, options.settings, options.memorySystem);

  for (const msg of recentHistory) {
    if (msg.role === 'user' && msg.content.startsWith('[系统]')) continue;
    if (msg.role === 'user') {
      messages.push(msg);
    } else if (msg.role === 'assistant' && msg.parsedResponse) {
      messages.push(创建聊天消息('assistant', msg.content));
    }
  }

  if (options.isOpeningSystemTrigger) {
    messages.push(创建聊天消息(
      'user',
      '请根据当前角色、当前场景、世界书与内置提示词，直接生成第 0 回合开场叙事。不要等待玩家再次输入。',
    ));
  }

  if (options.isAwakeningEnterTrigger && options.awakeningPathId) {
    messages.push(创建聊天消息(
      'user',
      `玩家选择踏入「命途狭间」(命途 ID: ${options.awakeningPathId})。请按 pathAwakening 流程生成第一道诘问,不要推进主剧情,不要等玩家再次发言。`,
    ));
  }

  if (options.awakeningPhase === 'judgement') {
    messages.push(创建聊天消息(
      'user',
      '⚠ 命途狭间·回应回合提醒:你上一回合已出三题,玩家本轮给出了答案。本回合**必须**在所有标签之外、**单独**写一行 `<狭间评判>升阶</狭间评判>`。命途狭间没有失败、滞留或退转;三问只是让玩家明确自己的道路。漏掉这个标签会让玩家永远卡在虚境无法升阶——这是必须避免的错误。同时正文里要让命途意志回应玩家答案、确认其道路,再把旅人从虚境拉回现实场景。',
    ));
  }

  if (options.enableCotFakeHistory && !options.isOpeningSystemTrigger) {
    messages.unshift(
      创建聊天消息('user', COT_FAKE_HISTORY_USER),
      创建聊天消息('assistant', COT_FAKE_HISTORY_ASSISTANT),
    );
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

  const worldbookCtx = {
    recentUserInput: sourceInput,
    recentAIResponse: '',
    worldName: state.世界.当前时段?.名称 ?? '',
    travelerName: state.旅人.姓名,
    turnCount: state.turnCount,
    startScenarioId: state.世界.起航之地ID,
    startSceneName: state.世界.当前地点,
    currentLocation: state.世界.当前地点,
    currentScope,
    storyMode: state.世界.剧情模式,
  };
  const recallQuery = buildMainRecallQuery({
    userInput: sourceInput,
    history: recallHistory,
    currentLocation: state.世界.当前地点,
    npcNames: state.NPC
      .filter((npc) => npc.同行 || Number(npc.最近回合 || 0) >= Math.max(1, state.turnCount - 15))
      .map((npc) => npc.姓名),
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
  const zhikuPreview = state.gameSettings.智库系统?.enabled && sourceInput
    ? retrieveZhikuContext(
        state.智库,
        recallQuery,
        state.gameSettings.智库系统.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries,
        worldbookCtx,
      )
    : null;

  const immediateStoryReview = !isOpeningSystemTrigger ? buildImmediateStoryReview(state.chatHistory, 12) : '';
  const storyRecallInjection = [
    immediateStoryReview
      ? ['# 即时剧情回顾', '', '【即时剧情回顾】', immediateStoryReview].join('\n')
      : '',
    yitingPreview?.injection ?? '',
  ].filter((item) => item.trim()).join('\n\n');

  const systemPrompt = isOpeningSystemTrigger
    ? buildOpeningSystemPrompt(
        state.旅人,
        state.世界,
        state.gameSettings,
        state.turnCount,
        state.worldbooks,
        worldbookCtx,
        state.新闻,
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
        state.智库,
        state.忆庭,
        state.手机,
        awakeningPhase,
        storyRecallInjection || (yitingEnabled && recallQuery && state.turnCount > yitingThreshold ? '' : undefined),
        zhikuPreview?.injection,
        Boolean(yitingPreview?.injection),
      );

  const sections: ContextSection[] = [];
  addSection(sections, {
    id: 'story_weaving_progress',
    title: '剧情编织进度快照',
    category: '剧情',
    content: formatStoryWeavingProgressSnapshot(state),
  });
  addSection(sections, {
    id: 'story_weaving_gate',
    title: '剧情编织门禁预览',
    category: '剧情',
    content: formatStoryWeavingGateSnapshot(state, worldbookCtx),
  });
  addSection(sections, {
    id: 'story_planning_analysis',
    title: '剧情规划分析快照',
    category: '剧情',
    content: formatStoryPlanningAnalysisSnapshot(state),
  });
  addSection(sections, {
    id: 'npc_relationship_planning',
    title: 'NPC 关系规划分析',
    category: '伙伴',
    content: formatNpcRelationshipPlanningSnapshot(state),
  });
  splitPromptSections(systemPrompt).forEach((item, index) => {
    addSection(sections, {
      id: `system_${index}`,
      title: item.title,
      category: categoryForPromptSection(item.title),
      content: item.content,
    });
  });

  const apiMessages = buildApiMessages(state.chatHistory, {
    isOpeningSystemTrigger,
    isAwakeningEnterTrigger,
    awakeningPhase,
    awakeningPathId,
    enableCotFakeHistory: state.gameSettings.enableCotFakeHistory,
    settings: state.gameSettings,
    memorySystem: state.记忆,
  });
  if (apiMessages.length) {
    addSection(sections, {
      id: 'history_window',
      title: `历史记录（${apiMessages.length} 条）`,
      category: '历史',
      content: formatMessages(apiMessages.map((msg) => ({ role: msg.role, content: msg.content }))),
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
    id: 'variable_system',
    title: '变量模型系统提示词',
    category: '系统',
    content: buildVariableModelPrompt(variableState, {
      enabled: state.gameSettings.enableNsfw,
      maleArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
    }),
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
    id: 'yiting_story_progress',
    title: '剧情编织进度快照',
    category: '剧情',
    content: formatStoryWeavingProgressSnapshot(state),
  });
  addSection(sections, {
    id: 'phone_system',
    title: '手机系统提示词',
    category: '系统',
    content: buildPhoneSystemPrompt(ctx),
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
  const recallQuery = buildMainRecallQuery({
    userInput: sourceInput,
    history: state.chatHistory,
    currentLocation: state.世界.当前地点,
    npcNames: state.NPC
      .filter((npc) => npc.同行 || Number(npc.最近回合 || 0) >= Math.max(1, state.turnCount - 15))
      .map((npc) => npc.姓名),
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
    content: [
      settings.忆庭召回提示词,
      '',
      '额外约束：',
      '- 候选回忆已经用数字编号。你只能返回这些数字编号，不要返回标题、摘要或解释。',
      '- 强回忆不设固定 1-2 条上限；若连续事件链、同一角色多轮互动、同一任务多个关键节点都影响当前回合，可以返回 3-6 条。',
      '- 弱回忆用于背景补充；不要把本该强承接的关键前因降为弱回忆。',
      '- 若候选中没有真正相关内容，强回忆和弱回忆都写“无”。',
    ].join('\n'),
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
  return finalizeSnapshot('yiting', '忆庭召回上下文', sections, sourceInput);
}

function buildZhikuContextSnapshot(state: UseGameStateReturn): ContextSnapshot {
  const sourceInput = latestUserInput(state.chatHistory);
  const recallHistory = historyThroughLatestUser(state.chatHistory);
  const sceneContext = {
    startScenarioId: state.世界.起航之地ID,
    startSceneName: state.世界.当前地点,
    currentLocation: state.世界.当前地点,
    npcNames: state.NPC
      .filter((npc) => npc.同行 || Number(npc.最近回合 || 0) >= Math.max(1, state.turnCount - 15))
      .map((npc) => npc.姓名),
  };
  const recallQuery = buildMainRecallQuery({
    userInput: sourceInput,
    history: recallHistory,
    currentLocation: state.世界.当前地点,
    npcNames: sceneContext.npcNames,
  });
  const limit = state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries;
  const fallback = retrieveZhikuContext(state.智库, recallQuery, limit, sceneContext);
  const actualRecallPreview = latestAssistantZhikuDebugRecall(state.chatHistory);
  const candidateText = fallback.entries.length
    ? fallback.entries.map((entry, index) => `${index + 1}. ${entry.标题}\n摘要：${entry.摘要 || entry.原文.slice(0, 220) || '无摘要'}`).join('\n\n')
    : '（当前没有命中候选资料）';
  const zhikuDiagnostics = fallback.diagnostics;
  const diagnosticText = zhikuDiagnostics
    ? [
        `场景锚点：${zhikuDiagnostics.场景锚点.join('、') || '无'}`,
        `相关角色：${zhikuDiagnostics.相关角色.join('、') || '无'}`,
        `人物锚点：${zhikuDiagnostics.人物锚点.join('、') || '无'}`,
        `候选资料：${zhikuDiagnostics.候选资料.join('、') || '无'}`,
        `角色相关资料：${zhikuDiagnostics.角色相关资料.join('、') || '无'}`,
        `强相关资料：${zhikuDiagnostics.强相关资料.join('、') || '无'}`,
        `弱相关资料：${zhikuDiagnostics.弱相关资料.join('、') || '无'}`,
        `已注入资料：${zhikuDiagnostics.已注入资料.join('、') || '无'}`,
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
  });
  addSection(sections, {
    id: 'zhiku_system',
    title: '智库召回提示词',
    category: '系统',
    content: [
      '你是原著资料中枢「智库」的召回模型。你的任务不是写正文，而是从候选资料中挑出最相关条目，供后续注入主剧情。',
      '',
      '规则：',
      '- 只返回候选列表中的编号，不要编造新条目。',
      '- 优先选择与当前输入直接相关、能影响剧情理解或设定判断的条目。',
      '- 角色相关资料只挑人物表现、主体人格、OOC风险、角色边界类条目，且不占用强/弱相关资料名额。',
      '- 强相关资料、弱相关资料只挑非角色类设定资料；原著剧情正文仍由剧情编织管理，不走智库普通召回。',
      '- 原著剧情正文不参与智库普通召回；剧情推进由剧情编织系统管理，避免已完成剧情重复注入。',
      '- 如果完全无关，对应分类写无。',
      '',
      '输出格式必须严格为三行：',
      '角色相关资料：【编号】|【编号】',
      '强相关资料：【编号】|【编号】',
      '弱相关资料：【编号】|【编号】',
    ].join('\n'),
  });
  addSection(sections, {
    id: 'zhiku_user',
    title: '智库召回用户消息',
    category: '用户',
    content: [
      `玩家当前输入：${sourceInput || '（无）'}`,
      '',
      '主流程增强召回查询：',
      recallQuery || '（无）',
      '',
      `召回条数上限：${limit}`,
      '',
      '候选资料：',
      candidateText,
      '',
      '本地召回诊断：',
      diagnosticText,
      '',
      '本地注入预览：',
      fallback.injection || '（未命中）',
    ].join('\n'),
  });
  return finalizeSnapshot('zhiku', '智库召回上下文', sections, sourceInput);
}
