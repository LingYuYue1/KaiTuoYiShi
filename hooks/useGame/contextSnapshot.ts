import type { UseGameStateReturn } from '@/hooks/useGameState';
import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import { 创建手机会话 } from '@/models/phone';
import { buildNewsModelPrompt, buildNewsUserMessage } from '@/services/ai/newsModel';
import { buildPhoneMessages, buildPhoneSystemPrompt, buildPhonePromptModulesSection } from '@/services/ai/phoneService';
import { buildVariableModelPrompt } from '@/services/ai/variableModel';
import { NPC_MEMORY_WRITE_RULE_PROMPT } from '@/data/variableWorldbook';
import { retrieveYitingContext, buildYitingRecallSystemPrompt } from '@/services/yitingRetrieval';
import { buildZhikuModelSystemPrompt, buildZhikuModelUserPrompt, retrieveZhikuContext } from '@/services/zhikuRetrieval';
import { selectNpcLedgersForTurn } from '@/models/npc';
import { estimateTextTokens } from '@/utils/tokenEstimate';
import { snapshotVariableState } from '@/utils/variableExecutor';
import {
  buildImmediateStoryReview,
  buildZhikuKeywordRecallQuery,
  buildMainRecallQuery,
  extractRecentStoryPlanSnippets,
  getMainHistoryWindow,
  getPathAwakeningHistoryWindow,
  toPromptHistory,
} from './historyWindow';
import { isDeepSeekMainConfig } from './mainResponseProtocol';
import { buildSystemPrompt, createSystemPromptInput } from './systemPromptBuilder';
import { getBuiltinPresetsV2 } from '@/data/builtinPresets';
import { buildTavernMessageChain } from './tavernMessageChainBuilder';
import { getCurrentSTPresetV2 } from '@/utils/stSettingsNormalizer';
import { getAnticipatedNpcNamesForTurn, getExplicitNpcNamesForTurn, getZhikuNpcNamesForTurn } from './npcPresence';
import { 格式化开局档案上下文 } from '@/models/world';
import { buildPromptMacroContext } from '@/utils/macroEngine';
import { buildPromptWorldbookContext } from './promptAssembly';
import {
  OPENING_TURN_INSTRUCTION,
  buildAwakeningEnterInstruction,
  compilePrompt,
  insertDepthIntoHistory,
} from './mainRequestFinalizer';
import {
  categoryForPromptSection,
  formatMainRequestOrderOverview,
  formatNpcLedgerSelectionSnapshot,
  formatNpcRelationshipPlanningSnapshot,
  formatStoryPlanningAnalysisSnapshot,
  formatStoryWeavingGateSnapshot,
  formatStoryWeavingProgressSnapshot,
  latestAssistantNpcLedgerDebug,
  latestAssistantZhikuDebugRecall,
  splitPromptSections,
} from './contextSnapshotDiagnostics';

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

function formatMessages(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((msg, index) => `## ${index + 1}. ${msg.role}\n\n${msg.content}`)
    .join('\n\n---\n\n');
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
  const isPathAwakeningTurn = currentScope === 'pathAwakening';
  const awakeningPhase: 'question' | 'judgement' | undefined = state.世界.进行中狭间
    ? (isAwakeningEnterTrigger ? 'question' : 'judgement')
    : undefined;

  const openingArchiveText = 格式化开局档案上下文(state.世界.开局档案);
  const npcNames = getZhikuNpcNamesForTurn({
    world: state.世界,
    npcs: state.NPC,
    history: recallHistory,
    userInput: sourceInput,
    turnCount: state.turnCount,
  });
  const worldbookCtx = buildPromptWorldbookContext({
    userInput: sourceInput,
    history: recallHistory,
    world: state.世界,
    travelerName: state.旅人.姓名,
    turnCount: state.turnCount,
    npcNames,
    scope: currentScope,
    openingArchiveText,
    worldbookTriggerStates: state.worldbookTriggerStates,
  });
  const anticipatedZhikuNpcNames = getAnticipatedNpcNamesForTurn({
    world: state.世界,
    history: recallHistory,
    userInput: sourceInput,
  });
  const immediateStoryReviewForZhiku = !isOpeningSystemTrigger ? buildImmediateStoryReview(state.chatHistory) : '';
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
    anticipatedNpcNames: anticipatedZhikuNpcNames,
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

  const yitingEnabled = state.deviceSettings.gameSettings.记忆系统.忆庭启用;
  const yitingThreshold = state.deviceSettings.gameSettings.记忆系统.忆庭召回最早触发回合;
  const yitingPreview = yitingEnabled && recallQuery && state.turnCount > yitingThreshold
    ? retrieveYitingContext(
        state.忆庭,
        recallQuery,
        state.deviceSettings.gameSettings.记忆系统.忆庭召回条数,
      )
    : null;
  const zhikuRecallEnabled = (currentScope === 'main' || currentScope === 'opening')
    && Boolean(state.deviceSettings.gameSettings.智库系统.enabled && sourceInput);
  const zhikuPreview = zhikuRecallEnabled
    ? retrieveZhikuContext(
        state.智库,
        zhikuRecallQuery,
        state.deviceSettings.gameSettings.智库系统.maxRelatedEntries,
        zhikuSceneContext,
      )
    : null;

  const storyRecallInjection = [
    immediateStoryReviewForZhiku
      ? ['# 即时剧情回顾', '', '【即时剧情回顾】', immediateStoryReviewForZhiku].join('\n')
      : '',
    yitingPreview?.injection ?? '',
  ].filter((item) => item.trim()).join('\n\n');
  const npcLedgerSelection = !isOpeningSystemTrigger
    ? selectNpcLedgersForTurn({
        records: state.NPC,
        turnCount: state.turnCount,
        explicitNames: worldbookCtx.npcNames,
        sceneNames: state.世界.当前时段.人物.map((npc) => npc.姓名),
        recalledNames: worldbookCtx.npcNames,
      })
    : undefined;

  const playerName = state.旅人.姓名 || state.旅人.别名 || '开拓者';
  const mainStoryConfig = state.deviceSettings.apiSettings.configs.find((item) => item.id === state.deviceSettings.apiSettings.activeConfigId)
    ?? state.deviceSettings.apiSettings.configs.at(0);
  const macroCtx = buildPromptMacroContext({
    history: recallHistory,
    playerName,
    turnCount: state.turnCount,
    modelName: mainStoryConfig?.model,
    maxContext: mainStoryConfig?.maxContext,
    globals: state.macroGlobalVars,
  });
  const builtPrompt = buildSystemPrompt(createSystemPromptInput({
    scope: isOpeningSystemTrigger ? 'opening' : currentScope,
    traveler: state.旅人,
    world: state.世界,
    settings: state.deviceSettings.gameSettings,
    turnCount: state.turnCount,
    worldbooks: state.deviceSettings.worldbooks,
    worldbookCtx,
    memory: state.记忆,
    npcRecords: state.NPC,
    news: state.新闻,
    plotNodes: state.剧情,
    storyWeaving: state.剧情编织,
    zhiku: state.智库,
    yiting: state.忆庭,
    phone: state.手机,
    awakeningPhase,
    yitingInjectionOverride: storyRecallInjection || (yitingEnabled && recallQuery && state.turnCount > yitingThreshold ? '' : undefined),
    zhikuInjectionOverride: zhikuRecallEnabled ? (zhikuPreview?.injection ?? '') : undefined,
    npcLedgerSelection,
    triggerType: isOpeningSystemTrigger ? 'opening' : isAwakeningEnterTrigger ? 'pathAwakening' : 'normal',
    macroCtx,
    storyPlanSnippets: extractRecentStoryPlanSnippets(recallHistory),
  }));

  const latestTaskInput = isOpeningSystemTrigger
    ? OPENING_TURN_INSTRUCTION
    : isAwakeningEnterTrigger && awakeningPathId
      ? buildAwakeningEnterInstruction(awakeningPathId)
      : sourceInput;
  const rawWindow = isPathAwakeningTurn && awakeningPhase
    ? getPathAwakeningHistoryWindow(recallHistory, awakeningPhase)
    : getMainHistoryWindow(recallHistory, state.deviceSettings.gameSettings, state.记忆);
  const latestUser = [...recallHistory].reverse().find((msg) => msg.role === 'user');
  const preTurnHistory = toPromptHistory(
    isPathAwakeningTurn ? rawWindow : rawWindow.filter((msg) => msg.id !== latestUser?.id),
  );

  const currentPresetV2 = getCurrentSTPresetV2(state.deviceSettings.gameSettings, getBuiltinPresetsV2());
  const shouldTryTavernV2 =
    state.deviceSettings.gameSettings.enableStPreset !== false &&
    Boolean(currentPresetV2?.preset.prompts.length) &&
    Boolean(currentPresetV2?.preset.prompt_order.length);
  const tavernStatus: Parameters<typeof formatMainRequestOrderOverview>[2] = {
    attempted: shouldTryTavernV2,
    used: false,
    presetName: currentPresetV2?.name,
    reason: currentPresetV2
      ? state.deviceSettings.gameSettings.enableStPreset === false
        ? '酒馆预设总开关关闭。'
        : ''
      : '未选择酒馆 V2 预设，因此本回合仍走原生主流程。',
  };
  let tavernV2Messages: 聊天消息[] | null = null;
  if (shouldTryTavernV2 && currentPresetV2) {
    try {
      const depthMessages = builtPrompt.chatModuleMessages.filter((item) => item._injectionPosition === 1);
      const tavernMessages = buildTavernMessageChain({
        settings: state.deviceSettings.gameSettings,
        preset: currentPresetV2.preset,
        characterId: state.deviceSettings.gameSettings.currentStCharacterId ?? currentPresetV2.characterId ?? null,
        chatHistory: insertDepthIntoHistory(preTurnHistory, depthMessages),
        latestUserInput: latestTaskInput,
        scope: currentScope,
        playerName,
        playerRole: state.旅人,
        includeNativeContextInWorldbook: false,
        triggerType: isOpeningSystemTrigger ? 'opening' : isAwakeningEnterTrigger ? 'pathAwakening' : 'normal',
        macroCtx,
      }).map((msg) => 创建聊天消息(msg.role, msg.content));
      if (tavernMessages.length) {
        tavernV2Messages = tavernMessages;
        tavernStatus.used = true;
        tavernStatus.reason = '快照已按当前酒馆 V2 预设生成额外 API messages；原生游戏底座 systemPrompt 仍会完整发送。酒馆 chatHistory 槽位只使用原生近期历史窗口，并排除当前用户输入，避免全量历史和本轮输入重复注入。';
      } else {
        tavernStatus.reason = '酒馆消息链为空；真实发送时会回退原生主流程。';
      }
    } catch (error) {
      tavernStatus.reason = `酒馆消息链构建失败；真实发送时会回退原生主流程。${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const deepSeekMainMode = state.deviceSettings.gameSettings.deepSeekMainMode;
  const deepSeekMainActive = Boolean(mainStoryConfig && isDeepSeekMainConfig(mainStoryConfig) && deepSeekMainMode !== 'off');
  const deepSeekLockFormat = deepSeekMainActive && deepSeekMainMode === 'lock_format';
  const finalized = compilePrompt({
    scope: isOpeningSystemTrigger ? 'opening' : currentScope,
    awakeningPhase,
    prompt: builtPrompt,
    preTurnHistory,
    latestUserInput: latestTaskInput,
    tavernMessages: tavernV2Messages,
    deepSeekMainActive,
    deepSeekLockFormat,
    enableCotFakeHistory: state.deviceSettings.gameSettings.enableCotFakeHistory,
    reroll: null,
    prefixMode: deepSeekLockFormat,
    prefixContent: deepSeekLockFormat ? '<thinking>\n' : undefined,
    provider: mainStoryConfig?.provider,
  });
  const apiMessages = finalized.messages;
  const systemPromptSections = splitPromptSections(finalized.systemPrompt);
  const requestMessagesTitle = tavernStatus.used ? '酒馆预设消息链' : '历史记录';
  const requestMessagesCategory = tavernStatus.used ? '酒馆预设' : '历史';

  const sections: ContextSection[] = [];
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
    addSection(sections, {
      id: requestMessagesCategory === '酒馆预设' ? 'tavern_preset_message_chain' : 'history_window',
      title: `${requestMessagesTitle}（${apiMessages.length} 条）`,
      category: requestMessagesCategory,
      content: formatMessages(apiMessages.map((msg) => ({ role: msg.role, content: msg.content }))),
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
      enabled: state.deviceSettings.gameSettings.enableNsfw,
      maleArchiveEnabled: state.deviceSettings.gameSettings.enableMaleNsfwArchive,
    }, state.deviceSettings.gameSettings.promptModules),
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
    content: buildPhonePromptModulesSection(state.deviceSettings.gameSettings.promptModules) || buildPhoneSystemPrompt(ctx),
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
    config: state.deviceSettings.apiSettings.configs.find((item) => item.id === state.deviceSettings.apiSettings.activeConfigId) ?? state.deviceSettings.apiSettings.configs.at(0) ?? {
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
    promptModules: state.deviceSettings.gameSettings.promptModules,
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
  const settings = state.deviceSettings.gameSettings.记忆系统;
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
  const fallback = retrieveYitingContext(state.忆庭, recallQuery, settings.忆庭召回条数);
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
    content: buildYitingRecallSystemPrompt(state.deviceSettings.gameSettings.promptModules),
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
      `召回条数上限：${settings.忆庭召回条数}`,
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
  const presentZhikuNpcNames = getZhikuNpcNamesForTurn({
    world: state.世界,
    npcs: state.NPC,
    history: recallHistory,
    userInput: sourceInput,
    turnCount: state.turnCount,
  });
  const anticipatedZhikuNpcNames = getAnticipatedNpcNamesForTurn({
    world: state.世界,
    history: recallHistory,
    userInput: sourceInput,
  });
  const immediateStoryReview = buildImmediateStoryReview(state.chatHistory);
  const sceneContext = {
    startScenarioId: undefined,
    startSceneName: undefined,
    currentLocation: undefined,
    npcNames: [],
    presentNpcNamesForFallback: presentZhikuNpcNames,
    anticipatedNpcNames: anticipatedZhikuNpcNames,
    aiSupplementHints: {
      currentLocation: state.世界.当前地点,
      presentNpcNames: presentZhikuNpcNames,
      immediateStoryReview,
    },
    originalProtagonist: state.世界.原著主角,
  };
  const recallQuery = buildZhikuKeywordRecallQuery({
    userInput: sourceInput,
    history: recallHistory,
  });
  const limit = state.deviceSettings.gameSettings.智库系统.maxRelatedEntries;
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
        `在场角色兜底召回：${zhikuDiagnostics.在场角色兜底召回.join('、') || '无'}`,
        `关键词召回：${zhikuDiagnostics.关键词召回.join('、') || '无'}`,
        `AI检索补充：${zhikuDiagnostics.AI检索补充.join('、') || '无'}`,
        `关键词资料召回：${zhikuDiagnostics.关键词资料召回.join('、') || '无'}`,
        `AI检索补充强资料：${zhikuDiagnostics.AI检索补充强资料.join('、') || '无'}`,
        `AI检索补充弱资料：${zhikuDiagnostics.AI检索补充弱资料.join('、') || '无'}`,
        `候选资料：${zhikuDiagnostics.候选资料.join('、') || '无'}`,
        `AI候选资料：${zhikuDiagnostics.AI候选资料.join('、') || '无'}`,
        `最终注入角色资料（已去重）：${zhikuDiagnostics.角色相关资料.join('、') || '无'}`,
        `最终注入强资料：${zhikuDiagnostics.强相关资料.join('、') || '无'}`,
        `最终注入弱资料：${zhikuDiagnostics.弱相关资料.join('、') || '无'}`,
        `已注入资料：${zhikuDiagnostics.已注入资料.join('、') || '无'}`,
        zhikuDiagnostics.被门禁过滤.length
          ? `门禁过滤：${zhikuDiagnostics.被门禁过滤.map((item) => `${item.标题}（${item.原因}）`).join('；')}`
          : '门禁过滤：无',
        `检查项：${zhikuDiagnostics.检查项.join('；') || '无'}`,
      ].join('\n')
    : '（无诊断信息）';
  const sections: ContextSection[] = [];
  addSection(sections, {
    id: 'yiting_actual_saved_preview',
    title: '上一回合真实保存的忆庭召回诊断',
    category: '实际',
    content: actualRecallPreview || '（上一条 AI 回复没有保存忆庭召回诊断；请从新增诊断后的新回合开始查看。）',
  });
  addSection(sections, {
    id: 'zhiku_actual_saved_preview',
    title: '上一回合真实保存的召回诊断',
    category: '实际',
    content: actualRecallPreview || '（上一条 AI 回复没有保存召回诊断；请从新增诊断后的新回合开始查看。）',
  });
  addSection(sections, {
    id: 'zhiku_system',
    title: '智库召回提示词（Step0~Step8）',
    category: '系统',
    content: buildZhikuModelSystemPrompt(zhikuDiagnostics?.场景锚点 ?? [], state.deviceSettings.gameSettings.promptModules),
  });
  addSection(sections, {
    id: 'zhiku_user',
    title: '智库召回用户消息',
    category: '用户',
    content: [
      `玩家当前输入：${sourceInput || '（无）'}`,
      '',
      buildZhikuModelUserPrompt(recallQuery, limit, candidateText, {
        keywordRecallTitles: zhikuDiagnostics?.关键词召回资料 ?? [],
        anticipatedNpcNames: anticipatedZhikuNpcNames,
        aiSupplementHints: sceneContext.aiSupplementHints,
      }),
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
