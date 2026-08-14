import { 格式化开局档案上下文 } from '@/models/world';
import type { 聊天消息, 解析后回复 } from '@/models/chat';
import { loadActiveLeaf, loadNewestStory } from '@/services/dbService';
import { evaluateStoryWeavingGate } from '@/services/storyWeaving';
import { clearWorkflowRecoveryJournal, isResumableWorkspace } from '@/services/workflowRecovery';
import { 踏入命途狭间 } from '@/services/pathService';
import { createRafCoalescedSetter } from '@/utils/rafCoalescedSetter';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import { devLog, devLogError } from '@/utils/devLog';
import { getZhikuNpcNamesForTurn } from './npcPresence';
import { hydrate, prepareHydration, resetWorkflowProjection } from './saveLoadWorkflow';
import { stage12_save } from './stage12_save';
import { runTurnTail } from './turnTail';
import type { SendWorkflowDeps } from './sendWorkflow';
import type { TurnContext, TurnDeltas } from './turnTypes';
import { TURN_STATUS_IDLE } from './turnStatus';

function rawTextFromParsed(parsed: 解析后回复): string | undefined {
  const rawText = Reflect.get(parsed, 'rawText');
  return typeof rawText === 'string' ? rawText : undefined;
}

export async function executeResumeWorkflow(deps: SendWorkflowDeps): Promise<boolean> {
  let { state } = deps;
  resetWorkflowProjection(state);
  const journal = state.activeWorkflow.interruptedWorkflow;
  const config = deps.getActiveConfig();

  // 工作区数据源 = 活跃叶子载荷（子任务 A：不再读 newest.story 覆盖集）。
  // 崩溃窗口（commitTurn 封版后写指针前崩溃）采纳子叶子时按恢复日志身份恢复，不猜线性链。
  // 无工作区 / head 指向已封版检查点且无法采纳子叶（sealed-conflict）时按无工作区处理。
  const active = await loadActiveLeaf(journal?.pendingChildNodeId ?? null);
  const leaf = active.status === 'ok' ? active.leaf : null;
  const leafChatHistory = active.status === 'ok' ? active.leaf.chatHistory : [];

  if (!journal || !leaf || !isResumableWorkspace(journal, leafChatHistory)) {
    if (journal) {
      await clearWorkflowRecoveryJournal(journal.workflowId);
      devLog('recover', 'resume-guard-fail', { workflowId: journal.workflowId, reason: 'workspace-invalid' });
    }
    state.activeWorkflow.setInterruptedWorkflow(null);
    state.activeWorkflow.setTurnStatus({ kind: 'stopped', text: '中断回合现场已失效，请重新发送。' });
    return false;
  }
  if (!config) {
    alert('请先在设置中配置API');
    await clearWorkflowRecoveryJournal(journal.workflowId);
    state.activeWorkflow.setInterruptedWorkflow(null);
    state.activeWorkflow.setTurnStatus({ kind: 'stopped', text: '中断回合现场已失效，请重新发送。' });
    devLog('recover', 'resume-guard-fail', { workflowId: journal.workflowId, reason: 'config-missing' });
    return false;
  }

  const finalHistory = leafChatHistory;
  const aiMsg = finalHistory.at(-1) as 聊天消息;
  const parsedForDisplay = aiMsg.parsedResponse as 解析后回复;
  const displayText = typeof aiMsg.content === 'string' && aiMsg.content.trim()
    ? aiMsg.content
    : parsedForDisplay.body;
  const rawFullText = rawTextFromParsed(parsedForDisplay) ?? aiMsg.content;
  const userInput = journal.input;
  const turnCountAtStart = journal.turnAtStart;
  const isOpeningSystemTrigger = turnCountAtStart === 1 && userInput.startsWith('[系统]');

  // queueTasks 以叶子（工作区）持久化数据为唯一恢复入口。
  // 恢复前的内存态可能来自旧会话，不能覆盖叶子已持久化的后台任务。
  hydrate(await prepareHydration(leaf), state, { restorePendingOpeningTrigger: false });
  state.setChatHistory(finalHistory);
  state.setTurnCount(turnCountAtStart + 1);
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
  state = deps.getState?.() ?? state;

  let effectiveWorld = state.世界;
  const isAwakeningEnterTrigger = userInput === '[系统] 踏入命途狭间';
  if (isAwakeningEnterTrigger && state.世界.待触发狭间) {
    effectiveWorld = 踏入命途狭间(state.世界);
    state.set世界(effectiveWorld);
  }

  const currentPeriod = effectiveWorld.当前时段;
  const openingArchive = effectiveWorld.开局档案;
  const currentScope: 'opening' | 'main' | 'pathAwakening' = effectiveWorld.进行中狭间
    ? 'pathAwakening'
    : turnCountAtStart === 1 ? 'opening' : 'main';
  const worldbookCtx = {
    recentUserInput: userInput,
    recentAIResponse: '',
    worldName: currentPeriod.名称,
    travelerName: state.旅人.姓名,
    turnCount: turnCountAtStart,
    startScenarioId: effectiveWorld.起航之地ID,
    startSceneName: openingArchive?.章节锚点名称 || effectiveWorld.当前地点,
    currentLocation: effectiveWorld.当前地点,
    openingRegionName: openingArchive?.地区名称,
    openingChapterName: openingArchive?.章节锚点名称,
    openingEntryText: openingArchive?.玩家介入原文,
    openingSource: openingArchive?.来源,
    openingArchiveText: 格式化开局档案上下文(openingArchive),
    npcNames: getZhikuNpcNamesForTurn({
      world: effectiveWorld,
      npcs: state.NPC,
      history: finalHistory,
      userInput,
      turnCount: turnCountAtStart,
    }),
    originalProtagonist: effectiveWorld.原著主角,
    currentScope,
    storyMode: effectiveWorld.剧情模式,
    recentMessages: finalHistory.map((message) => message.content).filter(Boolean).slice(-100),
    messageCount: turnCountAtStart,
    worldbookTriggerStates: leaf.worldbookTriggerStates,
  };

  const memorySettings = state.deviceSettings.gameSettings.记忆系统;
  const yitingEnabled = memorySettings.忆庭启用;
  const d: TurnDeltas = {
    finalHistory,
    aiMsg,
    parsedForDisplay,
    displayText,
    rawFullText,
    yitingEnabled,
    yitingRecallEnabled: yitingEnabled && !isOpeningSystemTrigger
      && memorySettings.忆庭召回最早触发回合 < turnCountAtStart,
    storyWeavingGate: state.deviceSettings.gameSettings.剧情编织系统.enabled
      && state.deviceSettings.gameSettings.剧情编织系统.currentWindow
      ? evaluateStoryWeavingGate(state.剧情编织, worldbookCtx)
      : null,
    openingNewsPreprocessed: false,
    openingNewsForSave: null,
    yitingPreview: null,
    zhikuPreview: null,
  };

  state.activeWorkflow.abortControllerRef.current?.abort();
  const abortController = new AbortController();
  state.activeWorkflow.abortControllerRef.current = abortController;
  const isCurrentWorkflow = () => state.activeWorkflow.abortControllerRef.current === abortController;
  const assertWorkflowActive = () => {
    if (abortController.signal.aborted || !isCurrentWorkflow()) {
      throw new DOMException('Workflow aborted', 'AbortError');
    }
  };
  const streamMessageSetter = createRafCoalescedSetter((value: string) => {
    if (isCurrentWorkflow()) setStreamingMessage(value);
  });
  const ctx: TurnContext = {
    state,
    userInput,
    deps,
    config,
    mainStoryConfig: config,
    isOpeningSystemTrigger,
    isAwakeningEnterTrigger,
    awakeningPathId: undefined,
    awakeningInstruction: '',
    openingInstruction: '',
    effectiveWorld,
    worldAtStart: state.世界,
    travelerAtStart: state.旅人,
    zhikuAtStart: state.智库,
    phoneAtStart: state.手机,
    turnCountAtStart,
    variableBatchesAtStart: [...state.variableBatches],
    queueTasksMirror: [...state.queueTasks],
    abortController,
    isCurrentWorkflow,
    assertWorkflowActive,
    streamMessageSetter,
    recoveryJournal: journal,
    rollbackHistoryOnAbort: finalHistory,
    rollbackSnapshotOnAbort: null,
  };

  deps.onBeforeSend();
  state.activeWorkflow.setLoading(true);
  setStreamingMessage('');
  state.activeWorkflow.setTurnStatus({ kind: 'settling', text: '正在继续结算中断回合的变量与后台任务' });
  state.activeWorkflow.setPendingVariable(true);
  devLog('recover', 'resume-start', { workflowId: journal.workflowId, phase: journal.phase, turn: turnCountAtStart });

  let keepTurnStatus = false;
  try {
    const newest = await loadNewestStory();
    if (journal.phase === 'autosave') {
      await stage12_save(ctx, d, {
        finalHistoryForSave: undefined,
        memoryAfterStoryProgress: undefined,
        yitingAfterTurnRecall: undefined,
        phoneAfterFallbackSeed: undefined,
        newest,
      });
    } else {
      await runTurnTail(ctx, d, newest);
    }
    state.activeWorkflow.setInterruptedWorkflow(null);
    devLog('recover', 'resume-complete', { workflowId: journal.workflowId, turn: turnCountAtStart });
    return true;
  } catch (error) {
    if ((error as Error).name === 'AbortError' || abortController.signal.aborted) {
      if (!isCurrentWorkflow()) {
        devLog('recover', 'resume-superseded', { workflowId: journal.workflowId });
        return false;
      }
      // 停止续跑：interruptedWorkflow 仍在，由 App 的中断横幅承载「继续结算」入口，状态条回到 idle
      setStreamingMessage('');
      state.activeWorkflow.setTurnStatus(TURN_STATUS_IDLE);
      return false;
    }
    devLogError('recover', 'resume-failed', error, { workflowId: journal.workflowId });
    state.activeWorkflow.setTurnStatus({ kind: 'failed', text: '继续结算失败，可再次重试。', failCount: 1 });
    keepTurnStatus = true;
    return false;
  } finally {
    streamMessageSetter.cancel();
    if (isCurrentWorkflow()) {
      state.activeWorkflow.setLoading(false);
      setStreamingMessage('');
      if (!keepTurnStatus) {
        state.activeWorkflow.setTurnStatus(TURN_STATUS_IDLE);
      }
      state.activeWorkflow.setPendingVariable(false);
      state.activeWorkflow.abortControllerRef.current = null;
      deps.onAfterSend();
    }
  }
}
