import type { TurnContext, TurnDeltas } from './turnTypes';
import type { 新闻条目 } from '@/models/news';
import { 格式化开局档案上下文 } from '@/models/world';
import { getAnticipatedNpcNamesForTurn, getZhikuNpcNamesForTurn } from './npcPresence';
import { buildImmediateStoryReview, buildMainRecallQuery, buildZhikuKeywordRecallQuery, extractRecentStoryPlanSnippets } from './historyWindow';
import { runNewsGenerationStep } from './newsWorkflow';
import { formatOriginalProtagonistForOpening } from './mainResponseProtocol';
import { retrieveYitingContextWithModel } from '@/services/yitingRetrieval';
import { retrieveZhikuContextWithModel } from '@/services/zhikuRetrieval';
import { evaluateStoryWeavingGate, getStoryWeavingInjectionDiagnostics } from '@/services/storyWeaving';
import { selectNpcLedgersForTurn } from '@/models/npc';
import { buildPromptMacroContext } from '@/utils/macroEngine';
import { updateTriggerStatesAfterTurn } from '@/utils/worldbook';
import { buildSystemPrompt, createSystemPromptInput } from './systemPromptBuilder';
import { buildPromptWorldbookContext, type ChatModuleMessage } from './promptAssembly';
import { formatZhikuRecallSummary, formatYitingRecallSummary } from './recallDiagnostics';
import { pushQueueTask } from './workflowTaskRuntime';
import { devLog, devLogError } from '@/utils/devLog';

export async function stage2_preModel(
  ctx: TurnContext,
  d: TurnDeltas,
): Promise<Partial<TurnDeltas>> {
  const { state, userInput, effectiveWorld, isOpeningSystemTrigger, isAwakeningEnterTrigger, turnCountAtStart,
    queueTasksMirror, abortController, isCurrentWorkflow, assertWorkflowActive, config, mainStoryConfig, deps } = ctx;
  devLog('stage', 'stage2_preModel.enter', { turn: turnCountAtStart });
  if (!d.updatedHistory) throw new Error('stage2_preModel: d.updatedHistory must be set by stage1');
  const updatedHistory = d.updatedHistory;
  const newsSettings = state.deviceSettings.gameSettings.新闻系统 as typeof state.deviceSettings.gameSettings.新闻系统 | undefined;
  const memorySettings = state.deviceSettings.gameSettings.记忆系统 as typeof state.deviceSettings.gameSettings.记忆系统 | undefined;
  const zhikuSettings = state.deviceSettings.gameSettings.智库系统 as typeof state.deviceSettings.gameSettings.智库系统 | undefined;
  const storyWeavingSettings = state.deviceSettings.gameSettings.剧情编织系统 as typeof state.deviceSettings.gameSettings.剧情编织系统 | undefined;
  const yiting = state.忆庭 as typeof state.忆庭 | undefined;
  const zhiku = state.智库 as typeof state.智库 | undefined;
  const currentPeriod = effectiveWorld.当前时段 as typeof effectiveWorld.当前时段 | undefined;
  const currentLocation = effectiveWorld.当前地点 as typeof effectiveWorld.当前地点 | undefined;
  const startScenarioId = effectiveWorld.起航之地ID;
  const midTermMemories = state.记忆.中期记忆 as typeof state.记忆.中期记忆 | undefined;
  const currentPeriodNpcNames = currentPeriod?.人物.map((npc) => npc.姓名);
  const yitingArchiveCount = yiting?.回忆档案.length ?? 0;

  const currentScope: 'opening' | 'main' | 'pathAwakening' = effectiveWorld.进行中狭间
    ? 'pathAwakening' : state.turnCount === 1 ? 'opening' : 'main';
  const isPathAwakeningTurn = currentScope === 'pathAwakening';
  const awakeningPhase: 'question' | 'judgement' | undefined = effectiveWorld.进行中狭间
    ? (isAwakeningEnterTrigger ? 'question' : 'judgement') : undefined;

  const openingArchiveText = 格式化开局档案上下文(effectiveWorld.开局档案);
  const worldbookCtx = buildPromptWorldbookContext({
    userInput,
    history: updatedHistory,
    world: effectiveWorld,
    travelerName: state.旅人.姓名,
    turnCount: state.turnCount,
    npcNames: getZhikuNpcNamesForTurn({ world: effectiveWorld, npcs: state.NPC, history: updatedHistory, userInput, turnCount: state.turnCount }),
    scope: currentScope,
    openingArchiveText,
    worldbookTriggerStates: state.worldbookTriggerStates,
  });

  const anticipatedZhikuNpcNames = getAnticipatedNpcNamesForTurn({ world: effectiveWorld, history: updatedHistory, userInput });
  const immediateStoryReviewForZhiku = !isOpeningSystemTrigger ? buildImmediateStoryReview(updatedHistory) : '';
  const zhikuSceneContext = {
    ...worldbookCtx, startScenarioId: undefined, startSceneName: undefined, currentLocation: undefined, npcNames: [],
    presentNpcNamesForFallback: worldbookCtx.npcNames, anticipatedNpcNames: anticipatedZhikuNpcNames,
    aiSupplementHints: { currentLocation: effectiveWorld.当前地点, presentNpcNames: worldbookCtx.npcNames, immediateStoryReview: immediateStoryReviewForZhiku, openingArchiveText },
  };

  const recallQuery = buildMainRecallQuery({ userInput, history: updatedHistory, currentLocation: effectiveWorld.当前地点, npcNames: worldbookCtx.npcNames });
  const zhikuRecallQuery = buildZhikuKeywordRecallQuery({ userInput, history: updatedHistory });

  let newsForPrompt = state.新闻;
  let openingNewsForSave: 新闻条目[] | null = null;
  let openingNewsPreprocessed = false;
  if (isOpeningSystemTrigger && newsSettings?.enabled && newsSettings.autoGenerate) {
    pushQueueTask(state, 'news', 'pending', { detail: '开局前正在先处理一次星际和平周报，用作首回合世界背景。', cancellable: true }, turnCountAtStart, queueTasksMirror);
    try {
      const openingProtagonist = formatOriginalProtagonistForOpening(effectiveWorld.原著主角);
      const openingArchive = effectiveWorld.开局档案;
      const openingPressure = openingArchive?.整理档案?.特别要求?.length
        ? openingArchive.整理档案.特别要求.join('；')
        : openingArchive?.章节参考说明 || effectiveWorld.当前地点 || '当前开局地区';
      const openingNewsBody = [
        `开局初始化：当前开局为${openingArchive?.地区名称 ?? currentLocation ?? '未知地区'}「${openingArchive?.章节锚点名称 ?? startScenarioId ?? '未命名章节'}」。`,
        `章节参考：${openingArchive?.章节参考说明 ?? '按当前开局档案和世界状态生成首回合世界事件苗头。'}`,
        `开局压力：${openingPressure}`,
        openingArchive?.玩家介入原文 ? `玩家介入：${openingArchive.玩家介入原文}` : '',
        `原著主角配置：${openingProtagonist}`,
      ].filter(Boolean).join('\n');
      const preNews = await runNewsGenerationStep({
        state, traveler: state.旅人, world: state.世界, news: state.新闻, npcRecords: state.NPC,
        plotNodes: state.剧情, storyWeaving: state.剧情编织, turnCountAtStart, mainBody: openingNewsBody, userInput,
        recentTurns: [`- 系统：开局初始化\n  正文：${openingArchive?.地区名称 ?? currentLocation ?? '当前地区'}「${openingArchive?.章节锚点名称 ?? '当前开局'}」即将开始，新闻系统先生成可供首回合参考的世界事件苗头。`],
        signal: abortController.signal, shouldCommit: isCurrentWorkflow,
      });
      // 投影点（B2-c）：原 newsWorkflow 内部 setter 的等价复刻
      if (preNews?.changed) state.set新闻(preNews.news);
      assertWorkflowActive();
      openingNewsPreprocessed = true;
      newsForPrompt = preNews?.news ?? state.新闻;
      openingNewsForSave = preNews?.news ?? null;
      pushQueueTask(state, 'news', 'success', { detail: preNews?.changed ? `开局新闻预处理完成，当前 ${preNews.news.length} 条新闻记录。` : preNews ? '开局新闻预处理完成，但本轮没有可写新闻变化。' : '开局新闻预处理未生成可用结果。' }, turnCountAtStart, queueTasksMirror);
    } catch (err) {
      // 取消必须立即冒泡到工作流级 abort 处理，不得吞掉后继续跑后续阶段
      if ((err as Error).name === 'AbortError') throw err;
      devLogError('stage', 'stage2_preModel.openingNews.catch', err, { turn: turnCountAtStart });
      pushQueueTask(state, 'news', 'failed', { detail: err instanceof Error ? err.message : '开局新闻预处理失败。', failCount: newsSettings.api.retryCount }, turnCountAtStart, queueTasksMirror);
    }
  }

  const yitingEnabled = memorySettings?.忆庭启用;
  const yitingRecallEnabled = yitingEnabled && !isOpeningSystemTrigger && memorySettings.忆庭召回最早触发回合 < state.turnCount;
  const zhikuRecallEnabled = (currentScope === 'main' || currentScope === 'opening')
    && !!(zhikuSettings?.enabled && zhiku && worldbookCtx.recentUserInput);
  const storyWeavingGate = storyWeavingSettings?.enabled && storyWeavingSettings.currentWindow
    ? evaluateStoryWeavingGate(state.剧情编织, worldbookCtx) : null;
  const storyWeavingDiagnostics = storyWeavingSettings?.enabled && storyWeavingSettings.currentWindow
    ? getStoryWeavingInjectionDiagnostics(state.剧情编织) : null;
  pushQueueTask(state, 'yiting', yitingRecallEnabled ? 'pending' : 'skipped', { detail: yitingRecallEnabled ? '正在检索回忆档案。' : '未到忆庭召回回合，已跳过。', cancellable: yitingRecallEnabled }, turnCountAtStart, queueTasksMirror);

  const [yitingPreview, zhikuPreview] = await Promise.all([
    yitingRecallEnabled && yiting && recallQuery
      ? retrieveYitingContextWithModel(yiting, recallQuery, memorySettings.忆庭召回条数, memorySettings, config, abortController.signal, memorySettings.忆庭召回API.retryCount, state.deviceSettings.gameSettings.promptModules)
          .catch((err: unknown) => {
            devLogError('net', 'stage2_preModel.yitingRecall.catch', err, { turn: turnCountAtStart });
            pushQueueTask(state, 'yiting', 'failed', { detail: err instanceof Error ? err.message : '忆庭召回失败。', failCount: memorySettings.忆庭召回API.retryCount }, turnCountAtStart, queueTasksMirror);
            return null;
          })
      : Promise.resolve(null),
    zhikuRecallEnabled
      ? retrieveZhikuContextWithModel(zhiku, zhikuRecallQuery, zhikuSettings.maxRelatedEntries, zhikuSettings, config, abortController.signal, zhikuSettings.api.retryCount, zhikuSceneContext, state.deviceSettings.gameSettings.promptModules)
          .catch((err: unknown) => {
            devLogError('net', 'stage2_preModel.zhikuRecall.catch', err, { turn: turnCountAtStart });
            return null;
          })
      : Promise.resolve(null),
  ]);
  assertWorkflowActive();

  const recallSummaryForTurn = [formatZhikuRecallSummary(zhikuPreview?.diagnostics), formatYitingRecallSummary(yitingPreview?.previewText)].join('\n');
  const recallFullContentForTurn = [zhikuPreview?.injection ? ['【智库完整召回】', zhikuPreview.injection].join('\n') : '', yitingPreview?.injection ? ['【记忆完整召回】', yitingPreview.injection].join('\n') : ''].filter(Boolean).join('\n\n');
  state.activeWorkflow.setLiveRecallSummary(recallSummaryForTurn);
  state.activeWorkflow.setLiveRecallFullContent(recallFullContentForTurn);

  const memoryHint = isOpeningSystemTrigger
    ? '开局专用上下文已注入：角色 / 场景 / 切入说明 / 开局世界书 / 开局 CoT'
    : yitingPreview?.injection ? `剧情回忆已命中，已暂停普通短中长期记忆注入：强 ${yitingPreview.strongEntries?.length ?? 0} 条 / 弱 ${yitingPreview.weakEntries?.length ?? 0} 条`
    : state.deviceSettings.gameSettings.enableMemoryInjection ? `记忆上下文已注入：短期 ${state.记忆.短期记忆.length} 条 / 中期 ${(midTermMemories ?? []).length} 条 / 长期 ${state.记忆.长期记忆.length} 条；即时缓存 ${state.记忆.即时记忆.length} 条仅用于后续压缩`
    : '记忆上下文已跳过';
  const yitingHint = !yitingEnabled ? '忆庭召回已关闭'
    : yitingPreview?.entries.length ? `剧情回忆已召回：强 ${yitingPreview.strongEntries?.length ?? 0} 条 / 弱 ${yitingPreview.weakEntries?.length ?? 0} 条`
    : yitingRecallEnabled ? `忆庭已召回：${yitingArchiveCount ? '无相关档案' : '当前还没有可召回档案'}` : `忆庭已召回：未到第${memorySettings.忆庭召回最早触发回合 + 1}回合`;
  const zhikuHint = zhikuSettings?.enabled ? `智库内容已注入：${zhikuPreview?.entries.length ? zhikuPreview.entries.slice(0, 2).map((entry: { 标题: string }) => entry.标题).join('、') : '无相关条目'}` : '智库已跳过';
  // 投影点（B2 定性）：预模型召回完成、主模型开始生成 —— 置 generating，不置 done。
  // 旧实现在此置 'done'，导致整个生成期间状态条误显 ✓；真正的完成态在 finally 清空。
  state.activeWorkflow.setTurnStatus({ kind: 'generating', text: isOpeningSystemTrigger ? memoryHint : `${memoryHint} · ${yitingHint} · ${zhikuHint}` });

  const immediateStoryReview = !isOpeningSystemTrigger ? buildImmediateStoryReview(updatedHistory) : '';
  const storyRecallInjection = [immediateStoryReview ? ['# 即时剧情回顾', '', '【即时剧情回顾】', immediateStoryReview].join('\n') : '', yitingPreview?.injection ?? ''].filter((item) => item.trim()).join('\n\n');

  const npcLedgerSelection = !isOpeningSystemTrigger
    ? selectNpcLedgersForTurn({ records: state.NPC, turnCount: state.turnCount, explicitNames: worldbookCtx.npcNames, sceneNames: currentPeriodNpcNames, recalledNames: worldbookCtx.npcNames })
    : undefined;

  const currentTriggerType = deps.rerollContext ? 'swipe' : isOpeningSystemTrigger ? 'opening' : 'normal';

  const prevGlobalSnapshot = state.macroGlobalVars;
  const playerName = state.旅人.姓名 || state.旅人.别名 || '开拓者';
  const macroCtx = buildPromptMacroContext({
    history: updatedHistory,
    playerName,
    turnCount: state.turnCount,
    modelName: mainStoryConfig.model,
    maxContext: mainStoryConfig.maxContext,
    globals: prevGlobalSnapshot,
  });
  const storyPlanSnippets = extractRecentStoryPlanSnippets(updatedHistory);

  const promptInput = createSystemPromptInput({
    scope: isOpeningSystemTrigger ? 'opening' : currentScope,
    traveler: state.旅人,
    world: effectiveWorld,
    settings: state.deviceSettings.gameSettings,
    turnCount: state.turnCount,
    worldbooks: state.deviceSettings.worldbooks,
    worldbookCtx,
    memory: state.记忆,
    npcRecords: state.NPC,
    news: newsForPrompt,
    plotNodes: state.剧情,
    storyWeaving: state.剧情编织,
    zhiku: state.智库,
    yiting: state.忆庭,
    phone: state.手机,
    awakeningPhase,
    yitingInjectionOverride: storyRecallInjection || (yitingRecallEnabled ? '' : undefined),
    zhikuInjectionOverride: zhikuRecallEnabled ? (zhikuPreview?.injection ?? '') : undefined,
    suppressMemoryInjection: Boolean(yitingPreview?.injection),
    npcLedgerSelection,
    triggerType: currentTriggerType,
    macroCtx,
    storyPlanSnippets,
  });
  const builtPrompt = buildSystemPrompt(promptInput);

  const macroGlobalVarsChanged = Object.keys(macroCtx.global).length !== Object.keys(prevGlobalSnapshot).length || Object.entries(macroCtx.global).some(([k, v]) => prevGlobalSnapshot[k] !== v);
  if (macroGlobalVarsChanged) {
    // 投影点（B2 定性）：刷新订阅 gameSettings 的 UI；存档组装只认 d，不回读此 state
    state.setMacroGlobalVars({ ...macroCtx.global });
  }

  const nextTriggerStates = updateTriggerStatesAfterTurn(
    state.deviceSettings.worldbooks,
    worldbookCtx,
    promptInput.worldbookPlan ?? undefined,
  );
  if (nextTriggerStates !== state.worldbookTriggerStates) {
    // 投影点（B2 定性）：刷新订阅 gameSettings 的 UI；存档组装只认 d，不回读此 state
    state.setWorldbookTriggerStates(nextTriggerStates);
  }

  const chatModuleMessages: ChatModuleMessage[] = builtPrompt.chatModuleMessages;
  const systemPrompt = builtPrompt.systemPrompt;

  devLog('stage', 'stage2_preModel.exit', {
    turn: turnCountAtStart,
    outputs: ['awakeningPhase', 'isPathAwakeningTurn', 'currentTriggerType', 'macroCtx', 'macroGlobalVarsAfterTurn', 'worldbookTriggerStatesAfterTurn', 'openingNewsPreprocessed', 'openingNewsForSave', 'yitingPreview', 'zhikuPreview', 'yitingEnabled', 'yitingRecallEnabled', 'zhikuRecallEnabled', 'storyWeavingGate', 'storyWeavingDiagnostics', 'npcLedgerSelection', 'systemPrompt', 'chatModuleMessages', 'recallSummaryForTurn', 'recallFullContentForTurn'],
  });
  return {
    awakeningPhase, isPathAwakeningTurn, currentTriggerType, macroCtx,
    macroGlobalVarsAfterTurn: macroGlobalVarsChanged ? { ...macroCtx.global } : undefined,
    worldbookTriggerStatesAfterTurn: nextTriggerStates,
    openingNewsPreprocessed, openingNewsForSave,
    yitingPreview,
    zhikuPreview,
    yitingEnabled, yitingRecallEnabled, zhikuRecallEnabled,
    storyWeavingGate,
    storyWeavingDiagnostics,
    npcLedgerSelection, systemPrompt, chatModuleMessages,
    recallSummaryForTurn, recallFullContentForTurn,
  };
}
