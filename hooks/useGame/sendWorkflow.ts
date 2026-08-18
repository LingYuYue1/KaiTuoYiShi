import type { UseGameStateReturn } from '@/hooks/useGameState';
import { type 回合快照 } from '@/models/chat';
import { parseResponse } from '@/services/ai/responseParser';
import { appendApiErrorReport } from '@/services/ai/apiErrorReportService';
import { saveSetting } from '@/services/storage/settings';
import { writeLeafNode } from '@/services/storage/saveTree';
import {
  clearWorkflowRecoveryJournal,
  createWorkflowRecoveryJournal,
  persistWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import { devLog, devLogError } from '@/utils/devLog';
import { type VisibilityBufferedPublisher } from '@/utils/visibilityBufferedPublisher';
import { createRafCoalescedSetter } from '@/utils/rafCoalescedSetter';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import { 踏入命途狭间 } from '@/services/pathService';
import { OPENING_TURN_INSTRUCTION, buildAwakeningEnterInstruction } from './mainRequestFinalizer';
import { buildPersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import { restorePreTurnSnapshot } from './turnSnapshot';
import { pushQueueTask } from './workflowTaskRuntime';
import type { TurnContext, TurnDeltas } from './turnTypes';
import { TURN_STATUS_IDLE } from './turnStatus';
import { stage1_turnStart } from './stage1_turnStart';
import { stage2_preModel } from './stage2_preModel';
import { stage3_promptAssembly } from './stage3_promptAssembly';
import { stage4_aiRequest } from './stage4_aiRequest';
import { stage5_replyLanding } from './stage5_replyLanding';
import { 清理叶子补丁, runTurnTail } from './turnTail';
import { ensureHeadLeafWritable } from './saveLoadWorkflow';

export interface SendWorkflowDeps {
  state: UseGameStateReturn;
  getState?: () => UseGameStateReturn;
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
  const turnCountAtStart = state.turnCount;
  const variableBatchesAtStart = state.variableBatches;
  const queueTasksMirror = [...state.queueTasks];
  const rawConfig = deps.getActiveConfig();
  if (!rawConfig) {
    alert('请先在设置中配置API');
    return;
  }
  const config = rawConfig;
  const isOpeningSystemTrigger = turnCountAtStart === 1 && userInput.startsWith('[系统]');
  const openingInstruction = OPENING_TURN_INSTRUCTION;

  // 「踏入命途狭间」触发:玩家点击邀请卡片 → App 调 handleSend('[系统] 踏入命途狭间')。
  // 在快照/作用域/systemPrompt 计算之前先把 世界.待触发狭间 转成 世界.进行中狭间——
  // 否则 currentScope 拿不到 pathAwakening,系统提示词不会切到狭间问答模块,AI 出不了题。
  const isAwakeningEnterTrigger = userInput === '[系统] 踏入命途狭间';
  let effectiveWorld: typeof state.世界 = state.世界;
  if (isAwakeningEnterTrigger && state.世界.待触发狭间) {
    effectiveWorld = 踏入命途狭间(state.世界);
    // 投影点（B2 定性，S01）：踏入狭间即时可见；管线与存档只认 ctx/d，不回读此 state
    state.set世界(effectiveWorld);
  }
  const awakeningPathId = isAwakeningEnterTrigger ? effectiveWorld.进行中狭间 : undefined;
  const awakeningInstruction = awakeningPathId
    ? buildAwakeningEnterInstruction(awakeningPathId)
    : '';

  // Abort previous request
  state.activeWorkflow.abortControllerRef.current?.abort();
  const abortController = new AbortController();
  state.activeWorkflow.abortControllerRef.current = abortController;
  const isCurrentWorkflow = () => state.activeWorkflow.abortControllerRef.current === abortController;
  const assertWorkflowActive = () => {
    if (abortController.signal.aborted || !isCurrentWorkflow()) {
      throw new DOMException('Workflow aborted', 'AbortError');
    }
  };

  devLog('turn', 'workflow-start', {
    role: 'main',
    turn: turnCountAtStart,
    isOpeningSystemTrigger,
    input: userInput.slice(0, 48),
  });
  deps.onBeforeSend();
  state.activeWorkflow.setLoading(true);
  setStreamingMessage('');
  state.activeWorkflow.setTurnStatus({ kind: 'searching', text: '忆庭召回 / 智库检索中' });
  state.activeWorkflow.setLiveRecallSummary('智库召回：检索中\n记忆召回：检索中');
  state.activeWorkflow.setLiveRecallFullContent('');
  pushQueueTask(state, 'main_story', 'pending', { detail: '正在调用主剧情模型。', cancellable: true }, turnCountAtStart, queueTasksMirror);
  let pendingVariableStarted = false;
  let keepTurnStatus = false;
  let rollbackHistoryOnAbort = state.chatHistory;
  let rollbackSnapshotOnAbort: 回合快照 | null = null;
  let visibilityPublisher: VisibilityBufferedPublisher | null = null;
  // Declared outside the stream setup so finally can always cancel a pending rAF commit.
  const streamMessageSetter = createRafCoalescedSetter((value: string) => {
    if (isCurrentWorkflow()) setStreamingMessage(value);
  });
  let recoveryJournal = createWorkflowRecoveryJournal(userInput, turnCountAtStart);

  const startTime = Date.now();

  const d: TurnDeltas = {};
  const ctx: TurnContext = {
    state, userInput,
    deps,
    config, mainStoryConfig: config,
    isOpeningSystemTrigger,
    isAwakeningEnterTrigger,
    awakeningPathId,
    awakeningInstruction,
    openingInstruction,
    effectiveWorld, turnCountAtStart, variableBatchesAtStart, queueTasksMirror,
    worldAtStart: state.世界,
    travelerAtStart: state.旅人,
    zhikuAtStart: state.智库,
    phoneAtStart: state.手机,
    abortController,
    isCurrentWorkflow,
    assertWorkflowActive,
    streamMessageSetter,
    recoveryJournal,
    rollbackHistoryOnAbort,
    rollbackSnapshotOnAbort,
  };

  try {
    await persistWorkflowRecoveryJournal(recoveryJournal);

    // 工作区叶子（newest.headNodeId）：回合开始载入并确保可写（封版/缺失时自动分叉重建）；
    // 阶段边界 writeLeafNode 原地写叶子（L2：只在阶段边界写）。
    const newest = await ensureHeadLeafWritable(state);
    const headNodeId = newest.headNodeId;
    if (!headNodeId) {
      throw new Error('回合写叶子失败：无法建立活跃叶子工作区。');
    }

    // 阶段 1：回合开始（快照 + 用户消息 + 历史清理）
    const s1 = await stage1_turnStart(state, userInput, effectiveWorld, recoveryJournal);
    const preTurnSnapshot = s1.preTurnSnapshot;
    const userMsg = s1.userMsg;
    const purgedHistory = s1.purgedHistory;
    recoveryJournal = s1.recoveryJournal;
    rollbackSnapshotOnAbort = preTurnSnapshot;
    rollbackHistoryOnAbort = purgedHistory;
    const updatedHistory = s1.updatedHistory;

    // 阶段 1 → d
    Object.assign(d, { preTurnSnapshot, userMsg, updatedHistory });

    // 阶段 2：主模型前置
    Object.assign(d, await stage2_preModel(ctx, d));

    // 阶段 3: Prompt 组装
    Object.assign(d, stage3_promptAssembly(ctx, d));
    const apiMessages = d.apiMessages as NonNullable<typeof d.apiMessages>

    // 阶段 4：AI 请求与响应（while 重试循环整块移动）
    const s4 = await stage4_aiRequest(ctx, d, visibilityPublisher);
    Object.assign(d, s4.deltas);
    visibilityPublisher = s4.visibilityPublisher;
    let streamedText = s4.streamedText;
    const { result, streamEventCount, previewChain: s4PreviewChain } = s4;
    d.rawFullText = result.fullText;  // S4 产出，S7 天气解析消费
    const previewChain = s4PreviewChain;

    visibilityPublisher?.flush();

    if (abortController.signal.aborted || !isCurrentWorkflow()) return;

    // 阶段 5：回复落地
    /* 读 d: updatedHistory,userMsg,preTurnSnapshot,systemPrompt,apiMessages,
       deepSeek*,shouldTryTavernV2,tavernV2*,yiting/zhikuPreview,zhikuRecallEnabled,
       npcLedgerSelection,storyWeavingGate/Diagnostics,recallSummary/FullContentForTurn
       写 d: aiMsg,finalHistory,parsedForDisplay,displayText,pendingVariableStarted,recoveryJournal */
    Object.assign(d, await stage5_replyLanding(ctx, d, result, streamedText, streamEventCount, previewChain, startTime));
    if (d.pendingVariableStarted) pendingVariableStarted = true;
    recoveryJournal = d.recoveryJournal ?? recoveryJournal;

    // 阶段边界写叶子（子任务 A：S5 后 —— chatHistory / turnCount / S2 两运行态键 / 开场触发标记）
    {
      assertWorkflowActive();
      await writeLeafNode(headNodeId, 清理叶子补丁({
        chatHistory: d.finalHistory,
        turnCount: turnCountAtStart + 1,
        macroGlobalVars: d.macroGlobalVarsAfterTurn ?? state.macroGlobalVars,
        worldbookTriggerStates: d.worldbookTriggerStatesAfterTurn ?? state.worldbookTriggerStates,
        // 与旧 commitTurn「payload.pendingOpeningTrigger = state.pendingOpeningTrigger ?? null」等价：
        // App 在触发第 0 回合前已清空该标记，此处保持叶子与 state 同步，避免 boot 恢复重复触发开场。
        pendingOpeningTrigger: state.pendingOpeningTrigger ?? null,
      }));
    }

    result.fullText = '';
    result.parsed = parseResponse('');
    result.usage = undefined;
    apiMessages.length = 0;
    streamedText = '';
    await runTurnTail(ctx, d, newest);

  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError' || abortController.signal.aborted) {
      if (!isCurrentWorkflow()) {
        await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);
        return;
      }
      if (recoveryJournal.phase === 'variable_settlement' && recoveryJournal.assistantMessageId) {
        state.activeWorkflow.setInterruptedWorkflow(recoveryJournal);
        // 结算中断的通知由 App 的中断横幅（继续结算 / 放弃）承载，状态条不重复展示
        state.activeWorkflow.setTurnStatus(TURN_STATUS_IDLE);
        devLog('recover', 'abort-keep-settlement', {
          workflowId: recoveryJournal.workflowId,
        });
        keepTurnStatus = true;
        return;
      }
      state.setChatHistory(rollbackHistoryOnAbort);
      if (rollbackSnapshotOnAbort) {
        const rollbackStoryWeaving = restorePreTurnSnapshot(state, rollbackSnapshotOnAbort);
        await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(rollbackStoryWeaving));
      }
      await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);
      state.activeWorkflow.setTurnStatus({ kind: 'stopped', text: '已停止生成，本次输入已回到输入框，可修改后重新发送。' });
      keepTurnStatus = true;
    } else {
      devLogError('turn', 'executeSendWorkflow.catch', err);
      keepTurnStatus = true;
      const detail = err instanceof Error ? err.message : '主流程调用失败。';
      const alreadyReportedByApiLayer = Boolean(
        err && typeof err === 'object' && (err as { alreadyReportedByApiLayer?: boolean }).alreadyReportedByApiLayer,
      );
      if (!alreadyReportedByApiLayer) {
        void appendApiErrorReport({
          source: '主剧情工作流',
          config,
          requestMode: state.deviceSettings.gameSettings.enableStreaming ? 'stream' : 'non-stream',
          error: err,
        });
      }
      const failCount = state.deviceSettings.gameSettings.autoRetryOnError ? Math.max(1, state.deviceSettings.gameSettings.autoRetryCount) : 1;
      state.activeWorkflow.setTurnStatus({ kind: 'failed', text: `主流程失败：${detail}`, failCount });
      pushQueueTask(state, 'main_story', 'failed', {
        detail,
        failCount,
      });
    }
  } finally {
    visibilityPublisher?.dispose();
    streamMessageSetter.cancel();
    if (isCurrentWorkflow()) {
      state.activeWorkflow.setLoading(false);
      setStreamingMessage('');
      if (!keepTurnStatus) {
        state.activeWorkflow.setTurnStatus(TURN_STATUS_IDLE);
      }
      state.activeWorkflow.setPendingVariable(false);
      if (!pendingVariableStarted) {
        pushQueueTask(state, 'memory', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
        pushQueueTask(state, 'variable', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
        pushQueueTask(state, 'news', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
        pushQueueTask(state, 'autosave', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
      }
      state.activeWorkflow.abortControllerRef.current = null;
      deps.onAfterSend();
      devLog('turn', 'workflow-end', {
        role: 'main',
        turn: turnCountAtStart,
        keepTurnStatus,
        pendingVariableStarted,
      });
    }
  }
}
