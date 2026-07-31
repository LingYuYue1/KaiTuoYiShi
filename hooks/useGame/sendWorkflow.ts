import type { UseGameStateReturn } from '@/hooks/useGameState';
import { type 回合快照 } from '@/models/chat';
import { parseResponse } from '@/services/ai/responseParser';
import { appendApiErrorReport } from '@/services/ai/apiErrorReportService';
import { saveSetting } from '@/services/dbService';
import {
  clearWorkflowRecoveryJournal,
  createWorkflowRecoveryJournal,
  persistWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import { devLogError } from '@/utils/devLog';
import { type VisibilityBufferedPublisher } from '@/utils/visibilityBufferedPublisher';
import { createRafCoalescedSetter } from '@/utils/rafCoalescedSetter';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import { 踏入命途狭间 } from '@/services/pathService';
import { buildPersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import { restorePreTurnSnapshot } from './turnSnapshot';
import { pushQueueTask } from './workflowTaskRuntime';
import type { TurnContext, TurnDeltas } from './turnTypes';
import { stage1_turnStart } from './stage1_turnStart';
import { stage2_preModel } from './stage2_preModel';
import { stage3_promptAssembly } from './stage3_promptAssembly';
import { stage4_aiRequest } from './stage4_aiRequest';
import { stage5_replyLanding } from './stage5_replyLanding';
import { stage6_memory } from './stage6_memory';
import { stage7_worldTraveler } from './stage7_worldTraveler';
import { stage8_variable } from './stage8_variable';
import { stage9_npcLedger } from './stage9_npcLedger';
import { stage10_storyZhiku } from './stage10_storyZhiku';
import { stage11_backgroundJobs } from './stage11_backgroundJobs';
import { stage12_save } from './stage12_save';

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
  const openingInstruction =
    '请根据当前角色、当前场景、世界书与内置提示词，直接生成第 0 回合开场叙事。不要等待玩家再次输入。';

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
  pushQueueTask(state, 'main_story', 'pending', { detail: '正在调用主剧情模型。', cancellable: true }, turnCountAtStart, queueTasksMirror);
  let pendingVariableStarted = false;
  let keepWorkflowHint = false;
  let rollbackHistoryOnAbort = state.chatHistory;
  let rollbackSnapshotOnAbort: 回合快照 | null = null;
  let visibilityPublisher: VisibilityBufferedPublisher | null = null;
  // Declared outside the stream setup so finally can always cancel a pending rAF commit.
  const streamMessageSetter = createRafCoalescedSetter(setStreamingMessage);
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

    // 阶段 6：记忆处理
    /* 读 d: parsedForDisplay (S5), displayText (S5)
       写 d: mem,yitingWithCompression */
    Object.assign(d, await stage6_memory(ctx, d));

    // 7 / 7a / 7b. 世界 + 旅人 的本回合修改全部累计到本地变量,最后一次性 set。
    //     这样在 8.5 变量校准里能拿到这些修改作为 snapshot——否则变量模型 commit 时
    //     会用「函数开始那一刻的 state.世界」覆盖,把刚写入的 待触发狭间/进行中狭间 抹掉,
    //     表现就是「狭间邀请卡片在变量校准结束后突然消失」。
    //     worldAfter 用 effectiveWorld 初始化(踏入触发已经把 进行中狭间 写入)。
    //
    // 阶段 7：世界/旅人
    /* 读 d: parsedForDisplay (S5), rawFullText (S4), displayText (S5)
       写 d: worldAfter (S7), travelerAfter (S7) */
    Object.assign(d, stage7_worldTraveler(ctx, d));
    const worldAfter = d.worldAfter as typeof state['世界']
    const travelerAfter = d.travelerAfter as typeof state['旅人']

    result.fullText = '';
    result.parsed = parseResponse('');
    result.usage = undefined;
    apiMessages.length = 0;
    streamedText = '';

    // 一次性 commit
    // 投影点（B2 定性，S09/S10）：顶部世界栏/左侧旅人即时刷新；管线与存档只认 ctx/d，不回读此 state
    if (worldAfter !== ctx.worldAtStart) state.set世界(worldAfter);
    if (travelerAfter !== ctx.travelerAtStart) state.set旅人(travelerAfter);

    // 阶段 8：变量模型校准（切点：variableOverrides 产出后交还 S9+ 读取）
    /* 读 d: parsedForDisplay(S5), displayText(S5), mem(S6), worldAfter(S7, 调用方已桥接),
       travelerAfter(S7), yitingEnabled(S2)
       写 d: variableOverrides (S8) */
    Object.assign(d, await stage8_variable(ctx, d));

    // 阶段 9：NPC 账本
    /* 读 d: variableOverrides(S8), finalHistory(S5), aiMsg(S5)
       写 d: npcAfterCompression(S9), finalHistory (写回 updated) */
    Object.assign(d, stage9_npcLedger(ctx, d));

    // 阶段 10：剧情编织 / 智库
    /* 读 d: variableOverrides(S8), displayText(S5), mem(S6), worldAfter(S7),
       storyWeavingGate(S2), npcAfterCompression(S9)
       写 d: storyWeavingForSave, memoryAfterStoryProgress, zhikuAfterRuntimeUnlock,
       npcAfterCompression (写回) */
    Object.assign(d, await stage10_storyZhiku(ctx, d));

    // 阶段 11：后台任务（新闻/忆庭/手机 Fallback/正文插图）
    /* 读 d: displayText(S5), finalHistory(S5), npcAfterCompression(S9), yitingWithCompression(S6),
       variableOverrides(S8), storyWeavingForSave(S10), aiMsg(S5), parsedForDisplay(S5),
       openingNewsPreprocessed(S2), openingNewsForSave(S2), yitingPreview(S2),
       yitingEnabled(S2), yitingRecallEnabled(S2), storyProgressMemoryLine(S10)
       写 d: newsAfterGeneration, yitingAfterTurnRecall, phoneAfterFallbackSeed, finalHistoryForSave */
    Object.assign(d, await stage11_backgroundJobs(ctx, d));

    const finalHistoryForSave = d.finalHistoryForSave;
    const memoryAfterStoryProgress = d.memoryAfterStoryProgress ?? undefined;
    const yitingAfterTurnRecall = d.yitingAfterTurnRecall;
    const phoneAfterFallbackSeed = d.phoneAfterFallbackSeed;

    // 投影点（B2 定性，S08/S25/S28/S29）：B1 定型的统一回合末投影；管线与存档只认 ctx/d，不回读此 state
    if (memoryAfterStoryProgress) state.set记忆(memoryAfterStoryProgress);
    if (yitingAfterTurnRecall) state.set忆庭(yitingAfterTurnRecall);
    if (phoneAfterFallbackSeed) state.set手机(phoneAfterFallbackSeed);
    if (finalHistoryForSave && finalHistoryForSave !== state.chatHistory) state.setChatHistory(finalHistoryForSave);

    // 阶段 12：保存 / 收尾
    /* 读 d: variableOverrides(S8), finalHistoryForSave(S11),
       memoryAfterStoryProgress(S10), yitingAfterTurnRecall(S11), phoneAfterFallbackSeed(S11),
       npcAfterCompression(S9), newsAfterGeneration(S11), storyWeavingForSave(S10),
       zhikuAfterRuntimeUnlock(S10)
       写 d: 无 */
    Object.assign(d, await stage12_save(ctx, d, {
      finalHistoryForSave,
      memoryAfterStoryProgress,
      yitingAfterTurnRecall,
      phoneAfterFallbackSeed,
    }));

  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError' || abortController.signal.aborted) {
      if (!isCurrentWorkflow()) {
        await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);
        return;
      }
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
      devLogError('turn', 'executeSendWorkflow.catch', err);
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
