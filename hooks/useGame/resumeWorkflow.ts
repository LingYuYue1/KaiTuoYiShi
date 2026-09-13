import { 格式化开局档案上下文 } from '@/models/world';
import type { 聊天消息, 解析后回复 } from '@/models/chat';
import { isSettledRecoveryCoherent } from '@/models/turnRecovery';
import { loadActiveLeaf, loadNewestStory } from '@/services/storage/saveTree';
import { evaluateStoryWeavingGate } from '@/services/storyWeaving';
import { 踏入命途狭间 } from '@/services/pathService';
import { clearRecoveryProjection, writeClearedRecovery } from './recoveryActions';
import { createRafCoalescedSetter } from '@/utils/rafCoalescedSetter';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import { devLog, devLogError } from '@/utils/devLog';
import { getZhikuNpcNamesForTurn } from './npcPresence';
import { hydrate, prepareHydration, resetWorkflowProjection } from './saveLoadWorkflow';
import { runTurnTail } from './turnTail';
import type { SendWorkflowDeps } from './sendWorkflow';
import type { TurnContext, TurnDeltas } from './turnTypes';
import { createTurnReceiptFromMessages } from './turnReceipt';
import { TURN_STATUS_IDLE } from './turnStatus';

function rawTextFromParsed(parsed: 解析后回复): string | undefined {
  const rawText = Reflect.get(parsed, 'rawText');
  return typeof rawText === 'string' ? rawText : undefined;
}

/** 恢复现场失效时写回清除叶子恢复态并复位投影（不静默保留陈旧相位）。 */
async function disarmLeafRecovery(state: TurnContext['state'], headNodeId: string | null): Promise<void> {
  await writeClearedRecovery(headNodeId);
  clearRecoveryProjection(state);
}

export async function executeResumeWorkflow(deps: SendWorkflowDeps): Promise<boolean> {
  let { state } = deps;
  resetWorkflowProjection(state);
  const recovery = state.activeWorkflow.recovery;
  const phase = state.turnPhase;
  const config = deps.getActiveConfig();

  // 工作区数据源 = 活跃叶子载荷（子任务 A：不再读 newest.story 覆盖集）。
  // 崩溃窗口（commitTurn 封版后写指针前崩溃）采纳子叶子时按 newest 内部身份恢复，不猜线性链。
  // 无工作区 / head 指向已封版检查点且无法采纳子叶（sealed-conflict）时按无恢复现场处理。
  const active = await loadActiveLeaf();
  const leaf = active.status === 'ok' ? active.leaf : null;
  const leafChatHistory = leaf?.chatHistory ?? [];
  const leafId = active.newest.headNodeId;

  // 恢复入口只处理已落地回合：settling 相位 + 落地事实一致（判定见 models/turnRecovery）。
  if (
    !recovery || !leaf || !leafId
    || phase !== 'settling' || !isSettledRecoveryCoherent(recovery, leafChatHistory)
  ) {
    await disarmLeafRecovery(state, leafId);
    state.activeWorkflow.setTurnStatus({ kind: 'stopped', text: '中断回合现场已失效，请重新发送。' });
    devLog('recover', 'resume-guard-fail', { reason: 'recovery-invalid', phase: phase ?? null });
    return false;
  }
  if (!config) {
    alert('请先在设置中配置API');
    await disarmLeafRecovery(state, leafId);
    state.activeWorkflow.setTurnStatus({ kind: 'stopped', text: '中断回合现场已失效，请重新发送。' });
    devLog('recover', 'resume-guard-fail', { reason: 'config-missing' });
    return false;
  }

  const finalHistory = leafChatHistory;
  const aiMsg = finalHistory.at(-1) as 聊天消息;
  const parsedForDisplay = aiMsg.parsedResponse as 解析后回复;
  const displayText = typeof aiMsg.content === 'string' && aiMsg.content.trim()
    ? aiMsg.content
    : parsedForDisplay.body;
  const rawFullText = rawTextFromParsed(parsedForDisplay) ?? aiMsg.content;
  const userInput = recovery.userInput;
  const userMessage = finalHistory.find((message) => message.id === recovery.userMessageId && message.role === 'user');
  if (!userMessage) {
    await disarmLeafRecovery(state, leafId);
    state.activeWorkflow.setTurnStatus({ kind: 'stopped', text: '中断回合现场已失效，请重新发送。' });
    devLog('recover', 'resume-guard-fail', { reason: 'user-message-missing' });
    return false;
  }
  const turnCountAtStart = recovery.turnAtStart;
  const isOpeningSystemTrigger = turnCountAtStart === 1 && userInput.startsWith('[系统]');

  // queueTasks 以叶子（工作区）持久化数据为唯一恢复入口。
  // 恢复前的内存态可能来自旧会话，不能覆盖叶子已持久化的后台任务。
  hydrate(await prepareHydration(leaf), state);
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
  const receipt = createTurnReceiptFromMessages({
    sessionEpoch: state.activeWorkflow.sessionEpoch,
    turn: turnCountAtStart,
    leafId,
    userMessage,
    assistantMessage: aiMsg,
  });
  const d: TurnDeltas = {
    finalHistory,
    aiMsg,
    receipt,
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
    rollbackSnapshotOnAbort: null,
  };

  deps.onBeforeSend?.();
  state.activeWorkflow.setLoading(true);
  setStreamingMessage('');
  state.activeWorkflow.setTurnStatus({ kind: 'settling', text: '正在继续结算中断回合的变量与后台任务' });
  state.activeWorkflow.setPendingVariable(true);
  devLog('recover', 'resume-start', { phase, turn: turnCountAtStart });

  let keepTurnStatus = false;
  try {
    const newest = await loadNewestStory();
    await runTurnTail(ctx, d, newest);
    clearRecoveryProjection(state);
    devLog('recover', 'resume-complete', { turn: turnCountAtStart });
    return true;
  } catch (error) {
    if ((error as Error).name === 'AbortError' || abortController.signal.aborted) {
      if (!isCurrentWorkflow()) {
        devLog('recover', 'resume-superseded', { turn: turnCountAtStart });
        return false;
      }
      // 停止续跑：叶子仍为 settling，恢复投影仍在，由 App 恢复横幅承载「继续结算」入口。
      setStreamingMessage('');
      state.activeWorkflow.setTurnStatus(TURN_STATUS_IDLE);
      return false;
    }
    devLogError('recover', 'resume-failed', error, { turn: turnCountAtStart });
    state.activeWorkflow.setTurnStatus({ kind: 'failed', text: '继续结算失败，可再次重试。', failCount: 1 });
    keepTurnStatus = true;
    return false;
  } finally {
    streamMessageSetter.cancel();
    if (isCurrentWorkflow()) {
      resetWorkflowProjection(state, { keepTurnStatus });
      state.activeWorkflow.abortControllerRef.current = null;
      deps.onAfterSend?.();
    }
  }
}
