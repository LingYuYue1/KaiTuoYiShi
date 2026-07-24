import type { UseGameStateReturn } from '@/hooks/useGameState';
import { 创建聊天消息, type 聊天消息, type 回合快照, type 回合Token消耗 } from '@/models/chat';
import type { 新闻条目 } from '@/models/news';
import { sendChatMessage } from '@/services/ai/text';
import { isEmptyResponse, parseResponse } from '@/services/ai/responseParser';
import { appendApiErrorReport } from '@/services/ai/apiErrorReportService';
import { isNonRetryableAIError } from '@/services/ai/deepSeekRecovery';
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
  autoCompressMemorySystemWithArchives,
  autoCompressMemorySystemWithArchivesAsync,
  compressNpcMemoryLedger,
  upsertRecallEntry,
} from './memoryUtils';
import { runNewsGenerationStep } from './newsWorkflow';
import { autoAlignCanonStoryProgress } from '@/services/storyProgressService';
import { evaluateStoryWeavingGate, getStoryWeavingInjectionDiagnostics } from '@/services/storyWeaving';
import { 归一化世界状态, 格式化开局档案上下文 } from '@/models/world';
import { saveGame, saveSetting } from '@/services/dbService';
import {
  clearWorkflowRecoveryJournal,
  createWorkflowRecoveryJournal,
  persistWorkflowRecoveryJournal,
  updateWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import { buildSavePayload, commitActiveSaveTreeMeta } from './saveLoadWorkflow';
import { parseVariableCommands, snapshotVariableState, reduceVariableCommands, commitVariableState, unpackVariableState } from '@/utils/variableExecutor';
import { factsToVariableCommands, parseVariableFacts } from '@/utils/variableFacts';
import { isTravelerPlayerAuthoredVariablePath } from '@/utils/variableRegistry';
import {
  createDocumentVisibilitySource,
  createVisibilityBufferedPublisher,
  type VisibilityBufferedPublisher,
} from '@/utils/visibilityBufferedPublisher';
import { createRafCoalescedSetter } from '@/utils/rafCoalescedSetter';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import type { 变量事实, 变量命令, 变量命令批次 } from '@/models/variableCommand';
import { 解析命途ID, 应用狭间结果, 踏入命途狭间, type 狭间评判 } from '@/services/pathService';
import { 创建默认记忆系统设置 } from '@/models/settings';
import type { API配置项, API设置, 文生图API配置 } from '@/models/settings';
import type { 队列任务ID, 队列任务记录, 队列任务状态 } from '@/models/queueTask';
import { retrieveZhikuContext, retrieveZhikuContextWithModel, type 智库召回诊断 } from '@/services/zhikuRetrieval';
import { applyStoryArchiveZhikuRuntimeUnlock } from '@/services/zhikuRuntimeUnlock';
import { buildPersistedZhikuSystem } from '@/data/zhikuPreset';
import { buildPersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import { getBuiltinPresets } from '@/data/builtinPresets';
import { retrieveYitingContextWithModel } from '@/services/yitingRetrieval';
import { buildYitingArchiveEntry } from '@/services/yitingArchive';
import { 创建默认智库系统设置 } from '@/models/settings';
import { selectNpcLedgersForTurn, 提取NPC同行记忆文本列表, type NPC记录, type NPC账本选择结果 } from '@/models/npc';
import type { 手机系统, 主动来信种子 } from '@/models/phone';
import {
  buildImmediateStoryReview,
  buildZhikuKeywordRecallQuery,
  buildLeanAssistantHistoryContent,
  buildMainRecallQuery,
  getMainHistoryWindow,
} from './historyWindow';
import { 归一化剧情编织系统, type 剧情编织系统 } from '@/models/storyWeaving';
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
import { 创建相册图片条目, 添加图片到相册, 创建相册资源引用 } from '@/utils/albumActions';
import { compactPreTurnSnapshot } from '@/utils/saveRuntimeCompactor';
import { compactChatHistoryForLongSession, compactVariableBatchHistory } from '@/utils/longSessionRetention';
import { createMacroContext, type MacroContext, type MacroGameState } from '@/utils/macroEngine';
import { updateTriggerStatesAfterTurn } from '@/utils/worldbook';
import {
  buildDeepSeekProtocolRetryGuard,
  COT_FAKE_HISTORY_ASSISTANT,
  COT_FAKE_HISTORY_USER,
  DEEPSEEK_MAIN_FORMAT_GUARD,
  formatOriginalProtagonistForOpening,
  getDeepSeekMainProtocolIssues,
  isDeepSeekMainConfig,
  stripLeakedHistoryMetaFromBody,
} from './mainResponseProtocol';
import { buildCachePrefixDiagnostics, buildTurnTokenUsage } from './turnDiagnostics';
import { generateNarrativeImagesForMessage, resolveNarrativeImageGenerationApi, resolveNarrativeImageTokenizerConfig } from './narrativeImageWorkflow';
import { buildRerollGenerationGuard, buildRerollSimilarityRetryGuard, calculateRerollSimilarity, compactForRerollInstruction } from './workflowRetry';
import { buildFallbackPhoneSeed } from './phoneWorkflow';
import { runVariableCalibrationStep } from './variableWorkflow';
import { attachNpcLedgerUpdateDebug, buildNpcLedgerDebug, buildNpcLedgerUpdateDebug, formatNpcLedgerPreview, pushUniqueText, type NpcLedgerUpdateDebug } from './npcLedgerWorkflow';
import {
  buildRecentTurnWindowForNews,
  isPageHidden,
  mergeYitingSystems,
  pushQueueTask,
  revealStreamingPreview,
  splitStreamingReveal,
  waitStreamingPreviewDelay,
} from './workflowTaskRuntime';
import {
  applyStoryProgressNpcMemory,
  buildStoryProgressMemoryLine,
  resolveStoryWeavingForBackgroundWrite,
} from './storyWeavingWorkflow';
import {
  formatYitingRecallSummary,
  formatZhikuDiagnosticsPreview,
  formatZhikuRecallSummary,
} from './recallDiagnostics';



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
    const yitingEnabled = state.gameSettings.记忆系统?.忆庭启用;
    const yitingRecallEnabled = yitingEnabled && !isOpeningSystemTrigger && (state.gameSettings.记忆系统?.忆庭召回最早触发回合 ?? 10) < state.turnCount;
    const zhikuRecallEnabled = !isOpeningSystemTrigger && !!(state.gameSettings.智库系统?.enabled && state.智库 && worldbookCtx.recentUserInput);
    const storyWeavingGate = state.gameSettings.剧情编织系统?.enabled && state.gameSettings.剧情编织系统.currentWindow
      ? evaluateStoryWeavingGate(state.剧情编织, worldbookCtx)
      : null;
    const storyWeavingDiagnostics = state.gameSettings.剧情编织系统?.enabled && state.gameSettings.剧情编织系统.currentWindow
      ? getStoryWeavingInjectionDiagnostics(state.剧情编织)
      : null;
    pushQueueTask(state, 'yiting', yitingRecallEnabled ? 'pending' : 'skipped', {
      detail: yitingRecallEnabled ? '正在检索回忆档案。' : '未到忆庭召回回合，已跳过。',
      cancellable: yitingRecallEnabled,
    });
    const [yitingPreview, zhikuPreview] = await Promise.all([
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
          ).catch((err: unknown) => {
            pushQueueTask(state, 'yiting', 'failed', {
              detail: err instanceof Error ? err.message : '忆庭召回失败。',
              failCount: state.gameSettings.记忆系统?.忆庭召回API.retryCount ?? 1,
            });
            return null;
          })
        : Promise.resolve(null),
      zhikuRecallEnabled
        ? retrieveZhikuContextWithModel(
            state.智库,
            zhikuRecallQuery,
            state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries,
            state.gameSettings.智库系统 ?? 创建默认智库系统设置(),
            config,
            abortController.signal,
            state.gameSettings.智库系统?.api.retryCount ?? 2,
            zhikuSceneContext,
            state.gameSettings.promptModules,
          ).catch((err) => {
            console.warn('[zhiku-retrieval] 智库检索失败：', err);
            return null;
          })
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
      : '记忆上下文已跳过';
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
      : '智库已跳过';
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
          zhikuRecallEnabled ? (zhikuPreview?.injection ?? '') : undefined,
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
    const shouldTryTavernV2 =
      state.gameSettings.enableStPreset !== false &&
      Boolean(currentPresetV2?.preset?.prompts?.length) &&
      Boolean(currentPresetV2?.preset?.prompt_order?.length);
    let tavernV2Messages: 聊天消息[] | null = null;
    let tavernV2Error: unknown = null;
    const recentHistory = getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆);
    const tavernHistory = recentHistory.filter((msg) => msg.id !== userMsg.id);
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
          chatHistory: tavernHistory,
          latestUserInput: latestTavernInput,
          playerName: state.旅人.姓名 || state.旅人.别名 || '开拓者',
          playerRole: state.旅人,
          includeNativeContextInWorldbook: false,
          triggerType: currentTriggerType,
          macroCtx,
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

    // Phase 4/7：从当前激活预设读取 assistant prefill
    // DeepSeek lock_format 必须固定从 <thinking>\n 续写；普通请求才允许使用预设 assistantPrefill。
    const currentPresetId = state.gameSettings.currentStPresetId;
    const allPresets = [
      ...getBuiltinPresets(),
      ...(state.gameSettings.stPresets ?? []),
    ];
    const currentPreset = currentPresetId
      ? allPresets.find((p) => p.id === currentPresetId)
      : undefined;
    const presetAssistantPrefill = currentPreset?.assistantPrefill;
    const usePresetPrefill = Boolean(presetAssistantPrefill) && !deepSeekLockFormat;
    const effectivePrefixMode = deepSeekLockFormat || usePresetPrefill;
    const effectivePrefixContent = deepSeekLockFormat ? '<thinking>\n' : presetAssistantPrefill;

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

    // 3c. ST 预设兼容：In-Chat depth 注入。
    //     injectionPosition=1 的模块按 injectionDepth 插入聊天历史。
    //     depth=0 末尾后，depth=1 末尾前，依此类推。
    //     Claude 方案 D：Claude 下 normalizeClaudeMessages 会抽取所有 system 消息到顶层，
    //     所以 Claude 下跳过 depth 注入。user/assistant 角色的 depth 模块追加到 systemPrompt 尾部。
    //     兜底：injectionPosition=0 的 user/assistant 模块（ST 预设很少用）也追加到 systemPrompt，
    //     避免内容丢失。
    //
    // 方案 B + C（v3 计划）：position 分流规则
    //   - position=0 + system role → 进 systemSection（在 injectPromptModules 里处理）
    //   - position=0 + user/assistant role → 追加 systemPrompt 尾部（方案 B，下方分支）
    //     简化处理：ST 语义里 position=0 + depth>0 表示插入 systemPrompt 中段，
    //     但我们的 systemPrompt 是字符串拼接，无法精确插入中段，统一追加到尾部。
    //     ST 预设中 position=0 + user/assistant + depth>0 极罕见，此简化可接受。
    //   - position=1 + user/assistant role（非 Claude）→ depth 注入（方案 C，下方分支）
    //   - position=1 + user/assistant role（Claude）→ 追加 systemPrompt 尾部（Claude 方案 D）
    if (moduleChatMessages.length > 0) {
      // 方案 B：injectionPosition=0 的 user/assistant 消息追加到 systemPrompt 尾部
      const positionZeroMessages = moduleChatMessages
        .filter((m) => m._injectionPosition === 0)
        .sort((a, b) => (a._injectionOrder ?? 0) - (b._injectionOrder ?? 0));
      if (positionZeroMessages.length > 0) {
        const fallbackText = positionZeroMessages.map((m) => m.content).join('\n\n---\n\n');
        systemPrompt = systemPrompt + '\n\n---\n\n' + fallbackText;
      }

      if (mainStoryConfig.provider !== 'claude') {
        // 方案 C：非 Claude 走 depth 注入，按 depth 降序 splice 到 apiMessages
        // 降序是为了避免 splice 时索引偏移（先插后面的再插前面的）
        const depthMessages = moduleChatMessages
          .filter((m) => m._injectionPosition === 1)
          .sort((a, b) => (b._injectionDepth ?? 0) - (a._injectionDepth ?? 0));
        for (const msg of depthMessages) {
          const depth = msg._injectionDepth ?? 0;
          const insertIndex = Math.max(0, apiMessages.length - depth);
          apiMessages.splice(insertIndex, 0, 创建聊天消息(msg.role as 'user' | 'assistant', msg.content));
        }
      } else {
        // Claude 方案 D：depth 模块退回 systemPrompt 拼接
        const fallbackMessages = moduleChatMessages
          .filter((m) => m._injectionPosition === 1)
          .sort((a, b) => (a._injectionOrder ?? 0) - (b._injectionOrder ?? 0));
        if (fallbackMessages.length > 0) {
          const fallbackText = fallbackMessages.map((m) => m.content).join('\n\n---\n\n');
          systemPrompt = systemPrompt + '\n\n---\n\n' + fallbackText;
        }
      }
    }

    const shouldStreamMainRequest = state.gameSettings.enableStreaming && !isPageHidden();
    const mainRequestMode: 'stream' | 'non-stream' = shouldStreamMainRequest ? 'stream' : 'non-stream';

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
        if (deps.rerollContext && rerollSimilarity >= 0.86 && attempt < maxAttempts) {
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
      enabled: state.gameSettings.enableCacheDiagnostics,
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
      gameTime: `${state.turnCount}`,
      parsedResponse: parsedForDisplay,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      tokenUsage,
      responseDurationSec: duration,
      preTurnSnapshot,
      debugContext: {
        systemPrompt,
        messages: apiMessages.map((msg) => ({ role: msg.role, content: msg.content })),
        deepSeekMainMode: deepSeekMainActive ? deepSeekMainMode : 'off',
        deepSeekCotFakeHistorySkipped: deepSeekMainActive && state.gameSettings.enableCotFakeHistory,
        deepSeekPrefixMode: deepSeekLockFormat,
        deepSeekProtocolIssues: deepSeekProtocolIssuesForTurn,
        deepSeekMainOriginalModel: result.deepSeekRecovery?.originalModel,
        deepSeekMainAdaptedModel: result.deepSeekRecovery?.fallbackModel
          ?? (result.deepSeekRecovery?.initialModel !== result.deepSeekRecovery?.originalModel
            ? result.deepSeekRecovery?.initialModel
            : undefined),
        stV2Attempted: shouldTryTavernV2,
        stV2Used: Boolean(tavernV2Messages),
        stV2FallbackReason: tavernV2Error instanceof Error ? tavernV2Error.message : tavernV2Error ? String(tavernV2Error) : undefined,
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
      config,
      abortController.signal,
    );
    assertWorkflowActive();
    mem = compression.memory;
    state.set记忆(mem);
    const yitingWithCompression = state.忆庭;
    pushQueueTask(state, 'memory', 'success', {
      detail: compression.usedModel
        ? '即时/短期/中期/长期记忆已调用记忆总结 API 完成整理。'
        : '即时/短期/中期/长期记忆已使用本地摘要完成整理。',
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

    // 一次性 commit。直接传值不用 functional updater,因为 worldAfter / travelerAfter
    // 已基于 state.世界 / state.旅人 派生,React 批处理后效果等价。
    if (worldAfter !== state.世界) state.set世界(worldAfter);
    if (travelerAfter !== state.旅人) state.set旅人(travelerAfter);

    // 8.5 变量模型校准：主回复完成 → 调用独立的变量模型分析正文，把结构化命令落地。
    //     失败/超时不影响主流程，只在 console 报警。
    pushQueueTask(state, 'variable', state.gameSettings.enableVariableUpdate ? 'pending' : 'skipped', {
      detail: state.gameSettings.enableVariableUpdate ? '正在调用变量模型校准正文。' : '变量更新未启用，已跳过。',
    });
    const variableOverrides = await runVariableCalibrationStep({
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
      signal: abortController.signal,
      allowYiting: yitingEnabled,
      shouldCommit: isCurrentWorkflow,
      });
      assertWorkflowActive();
      if (state.gameSettings.enableVariableUpdate) {
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
      let storyWeavingForSave = storyAlignment.system;
      let storyWeavingConcurrentChange = false;
      if (storyAlignment.changed) {
        assertWorkflowActive();
        const resolvedStory = await resolveStoryWeavingForBackgroundWrite({
          workflowBase: state.剧情编织,
          proposed: storyAlignment.system,
        });
        storyWeavingForSave = resolvedStory.system;
        storyWeavingConcurrentChange = resolvedStory.concurrentChange;
        if (!storyWeavingConcurrentChange) {
          state.set剧情编织(storyWeavingForSave);
          await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(storyWeavingForSave));
        } else {
          pushQueueTask(state, 'zhiku', 'success', {
            detail: '检测到剧情编织面板已有更新，本回合后台未覆盖最新导入/分解结果。',
          });
        }
        assertWorkflowActive();
        if (storyProgressMemoryLine && !storyWeavingConcurrentChange) {
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
      if (storyAlignment.progressed && !storyWeavingConcurrentChange) {
        const zhikuUnlock = applyStoryArchiveZhikuRuntimeUnlock({
          zhiku: state.智库,
          storyWeaving: storyWeavingForSave,
        });
        if (zhikuUnlock.changed) {
          assertWorkflowActive();
          zhikuAfterRuntimeUnlock = zhikuUnlock.system;
          state.set智库(zhikuAfterRuntimeUnlock);
          await saveSetting('zhikuSystem', buildPersistedZhikuSystem(zhikuAfterRuntimeUnlock));
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
          signal: abortController.signal,
          shouldCommit: isCurrentWorkflow,
        });
        assertWorkflowActive();
        newsAfterGeneration = newsGenerationResult?.news ?? state.新闻;
        pushQueueTask(state, 'news', 'success', {
          detail: newsGenerationResult?.changed
            ? `星际和平周报已更新，当前共 ${newsAfterGeneration.length} 条新闻记录。`
            : newsGenerationResult
              ? '星际和平周报本回合没有可写新闻变化。'
              : '星际和平周报未生成有效结果。',
        });
      };

      const runYitingArchiveJob = async (): Promise<void> => {
        // 忆庭入库始终执行；这里的开关只控制“是否召回并注入正文”。
        const turnRecallEntryResult = await buildYitingArchiveEntry(
          turnRecallSource,
          memorySettings,
          config,
          abortController.signal,
          memorySettings.忆庭召回API.retryCount ?? 2,
          state.gameSettings.promptModules,
        );
        assertWorkflowActive();
        const turnRecallEntry = turnRecallEntryResult.entry;
        yitingAfterTurnRecall = upsertRecallEntry(yitingBase, turnRecallEntry);
        state.set忆庭(yitingAfterTurnRecall);
        pushQueueTask(state, 'memory', 'success', {
          detail: turnRecallEntryResult.usedFallback ? '忆庭纪要已使用主回复小总结入库。' : '忆庭纪要已由独立模型压缩并入库。',
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
        if (state.gameSettings.手机系统.enabled && state.gameSettings.手机系统.autoGenerateSeeds) {
          const fallbackSeed = buildFallbackPhoneSeed({
            phone: phoneAfterFallbackSeed,
            npcs: npcAfterCompression,
            turn: state.turnCount + 1,
            userInput,
            body: displayText,
            maxSeedsPerTurn: state.gameSettings.手机系统.maxSeedsPerTurn,
            contactCooldownTurns: state.gameSettings.手机系统.contactCooldownTurns,
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
        if (!tokenizerConfig) {
    pushQueueTask(state, 'narrative_image_parse', 'failed', {
      detail: '正文生图词组转化器未配置，无法解析故事快照提示词。',
      turn: state.turnCount,
      targetMessageId,
    });
          return;
        }
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

      // 10. Auto-save —— 每回合只在后台队列收尾写一次，避免正文/变量阶段重复生成多条自动存档。
      if (state.gameSettings.enableAutoSaveEveryTurn) {
        recoveryJournal = updateWorkflowRecoveryJournal(recoveryJournal, { phase: 'autosave' });
        await persistWorkflowRecoveryJournal(recoveryJournal);
        pushQueueTask(state, 'autosave', 'pending', { detail: '正在写入本回合自动存档。' });
        const variableBatchesForSave = compactVariableBatchHistory(variableOverrides?.batch
          ? [...state.variableBatches, variableOverrides.batch]
          : state.variableBatches);
        const saveData = buildSavePayload(state, 'auto', {
          chatHistory: finalHistoryForSave,
          记忆: memoryAfterStoryProgress,
          忆庭: yitingAfterTurnRecall,
          手机: phoneAfterFallbackSeed,
          旅人: variableOverrides?.旅人,
          世界: variableOverrides?.世界,
          NPC: npcAfterCompression,
          新闻: newsAfterGeneration ?? variableOverrides?.新闻,
          剧情: variableOverrides?.剧情,
          剧情编织: storyWeavingForSave,
          智库: zhikuAfterRuntimeUnlock,
          variableBatches: variableBatchesForSave,
          queueTasks: state.queueTasks,
          turnCount: state.turnCount + 1,
        });
        assertWorkflowActive();
        await saveGame(saveData);
        commitActiveSaveTreeMeta(saveData);
        assertWorkflowActive();
        pushQueueTask(state, 'autosave', 'success', { detail: '本回合自动存档完成。' });
        state.setHasSave(true);
      }

    await saveSetting('theme', state.currentTheme);
    await saveSetting('apiSettings', state.apiSettings);
    await saveSetting('gameSettings', state.gameSettings);
    await saveSetting('worldbooks', state.worldbooks);
    await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError' || abortController.signal.aborted) {
      state.setChatHistory(rollbackHistoryOnAbort);
      if (rollbackSnapshotOnAbort) {
        const rollbackStoryWeaving = restorePreTurnSnapshot(state, rollbackSnapshotOnAbort);
        await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(rollbackStoryWeaving));
      }
      await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);
      state.setWorkflowHint('已停止生成，本次输入已回到输入框，可修改后重新发送。');
      state.setWorkflowStatus('');
      keepWorkflowHint = true;
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


