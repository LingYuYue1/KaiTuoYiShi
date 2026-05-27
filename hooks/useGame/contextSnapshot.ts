import type { UseGameStateReturn } from '@/hooks/useGameState';
import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import { 创建手机会话 } from '@/models/phone';
import { 创建默认智库系统设置, 创建默认记忆系统设置 } from '@/models/settings';
import { buildNewsModelPrompt, buildNewsUserMessage } from '@/services/ai/newsModel';
import { buildPhoneMessages, buildPhoneSystemPrompt } from '@/services/ai/phoneService';
import { buildVariableModelPrompt } from '@/services/ai/variableModel';
import { retrieveYitingContext } from '@/services/yitingRetrieval';
import { retrieveZhikuContext } from '@/services/zhikuRetrieval';
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
    history: state.chatHistory,
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
        sourceInput,
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
      '请阅读上面的正文，输出本回合的 <变量更新> 命令块。',
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
  };
  const sections: ContextSection[] = [];
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
      const fullText = index >= Math.max(0, Math.min(24, state.忆庭.回忆档案.length) - 20);
      return [
        `${index + 1}. ${entry.名称 || `第${entry.回合}回合回忆`}｜回合：${entry.回合}｜类型：${entry.类型 ?? '回忆'}`,
        fullText ? `原文：\n${entry.原文 || entry.摘要 || '无原文'}` : `概括：${entry.摘要 || entry.原文 || '无概括'}`,
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
      '本地预筛：topK 24；最近 6 条强制保底；最新 20 条候选给完整原文；更早候选给概括。',
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
  const sceneContext = {
    startScenarioId: state.世界.起航之地ID,
    startSceneName: state.世界.当前地点,
    currentLocation: state.世界.当前地点,
  };
  const limit = state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries;
  const fallback = retrieveZhikuContext(state.智库, sourceInput, limit, sceneContext);
  const candidateText = fallback.entries.length
    ? fallback.entries.map((entry, index) => `${index + 1}. ${entry.标题}\n摘要：${entry.摘要 || entry.原文.slice(0, 220) || '无摘要'}`).join('\n\n')
    : '（当前没有命中候选资料）';
  const sections: ContextSection[] = [];
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
      '- 原著剧情正文不参与智库普通召回；剧情推进由剧情编织系统管理，避免已完成剧情重复注入。',
      '- 如果完全无关，强相关资料与弱相关资料都写无。',
      '',
      '输出格式必须严格为两行：',
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
      `召回条数上限：${limit}`,
      '',
      '候选资料：',
      candidateText,
      '',
      '本地注入预览：',
      fallback.injection || '（未命中）',
    ].join('\n'),
  });
  return finalizeSnapshot('zhiku', '智库召回上下文', sections, sourceInput);
}
