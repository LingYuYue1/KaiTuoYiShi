import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useGameState, type UseGameStateReturn } from '@/hooks/useGameState';
import { executeSendWorkflow, regenerateNarrativeImagesForMessage, retryQueueTask } from '@/hooks/useGame/sendWorkflow';
import { buildContextSnapshot, type ContextSnapshotKind } from '@/hooks/useGame/contextSnapshot';
import { handleLoadLatest, handleManualSave } from '@/hooks/useGame/saveLoadWorkflow';
import { restorePreTurnSnapshot } from '@/hooks/useGame/turnSnapshot';
import { 创建空记忆系统 } from '@/models/memory';
import { 创建空忆庭系统 } from '@/models/yiting';
import { 创建空手机系统 } from '@/models/phone';
import type { API配置项 } from '@/models/settings';
import type { 队列任务记录 } from '@/models/queueTask';
import { 根据开局档案创建初始NPC记录, 生成开局已成立事实, 归一化开局档案 } from '@/models/world';
import { saveSetting } from '@/services/dbService';
import { clearWorkflowRecoveryJournal } from '@/services/workflowRecovery';
import { alignStoryWeavingToOpeningArchive, buildPersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import { setStreamingMessage } from '@/utils/streamingMessageStore';

export interface UseGameReturn {
  state: UseGameStateReturn;
  actions: {
    handleSend: (text: string) => Promise<void>;
    handleAbort: () => void;
    handleNewGame: () => void;
    handleContinue: () => Promise<boolean>;
    handleGoHome: () => void;
    handleSave: () => Promise<number>;
    handleReroll: () => Promise<string | void>;
    handleRegenerateNarrativeImage: (messageId: string) => Promise<void>;
    handleRetryQueueTask: (task: 队列任务记录, mode?: 'retry' | 'reroll') => Promise<void>;
    handleRestartOpening: () => void;
    getContextSnapshot: (kind?: ContextSnapshotKind) => ReturnType<typeof buildContextSnapshot>;
  };
}

export function useGame(): UseGameReturn {
  const state = useGameState();
  // Keep a live ref so action callbacks stay identity-stable across state ticks.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const rerollContextRef = useRef<{ nonce: string; previousResponse: string } | null>(null);

  const getActiveConfig = useCallback((): API配置项 | null => {
    const s = stateRef.current;
    if (!s.apiSettings.activeConfigId) {
      if (s.apiSettings.configs.length > 0) {
        const first = s.apiSettings.configs[0];
        s.setApiSettings((prev) => ({ ...prev, activeConfigId: first.id }));
        return {
          ...first,
          enableClaudeMode: s.gameSettings.enableClaudeMode === true,
        };
      }
      return null;
    }
    const config = s.apiSettings.configs.find((c) => c.id === s.apiSettings.activeConfigId) ?? null;
    return config ? {
      ...config,
      enableClaudeMode: s.gameSettings.enableClaudeMode === true,
    } : null;
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const s = stateRef.current;
      s.setInterruptedWorkflow(null);
      await executeSendWorkflow(text, {
        state: s,
        getActiveConfig,
        onBeforeSend: () => {},
        onAfterSend: () => {
          rerollContextRef.current = null;
        },
        rerollContext: rerollContextRef.current,
      });
    },
    [getActiveConfig],
  );

  const handleAbort = useCallback(() => {
    stateRef.current.abortControllerRef.current?.abort();
  }, []);

  const handleNewGame = useCallback(() => {
    const s = stateRef.current;
    void clearWorkflowRecoveryJournal(s.interruptedWorkflow?.workflowId);
    s.setInterruptedWorkflow(null);
    s.setView('new_game');
  }, []);

  const handleContinue = useCallback(async (): Promise<boolean> => {
    return handleLoadLatest(stateRef.current);
  }, []);

  const handleGoHome = useCallback(() => {
    const s = stateRef.current;
    s.abortControllerRef.current?.abort();
    s.setView('home');
  }, []);

  const handleSave = useCallback(async (): Promise<number> => {
    return handleManualSave(stateRef.current);
  }, []);

  // 重roll：找到最后一条 user → AI 对，回滚状态，并把 user 输入交还给输入框。
  // 关键：用 aiMsg.preTurnSnapshot 把所有变量切片回滚到「该 user 发送前」的状态，
  // 防止重 roll 后上一次的 NPC / 新闻等副作用与新一次的叠加。
  const handleReroll = useCallback(async (): Promise<string | void> => {
    const s = stateRef.current;
    if (s.loading || s.pendingVariable) {
      s.setWorkflowHint('后台结算尚未完成，稍等完成后再重roll，避免记忆/忆庭/变量写入错位。');
      return;
    }
    s.abortControllerRef.current?.abort();
    s.abortControllerRef.current = null;
    const history = s.chatHistory;

    // 特殊情况：最后一条是 user 且没有对应的 assistant，说明本回合主剧情生成失败了。
    // 此时只回退这条孤立的 user 消息，不应回退到上一回合。
    const lastMsg = history[history.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      // 孤立 user：主剧情生成失败，只砍掉这条 user
      const userInput = lastMsg.content;
      const snapshot = lastMsg.preTurnSnapshot;
      const trimmed = history.slice(0, -1);
      s.setChatHistory(trimmed);
      setStreamingMessage('');
      s.setWorkflowStatus('');
      s.setWorkflowHint(snapshot ? '已回滚到本回合发送前，可修改后重新发送。' : '本回合缺少快照，仅恢复输入文本。');
      if (snapshot) {
        const nextStoryWeaving = restorePreTurnSnapshot(s, snapshot);
        await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(nextStoryWeaving));
      } else {
        s.setTurnCount(Math.max(1, s.turnCount - 1));
      }
      // 生成失败的重 roll 不需要 rerollContext（没有上一版回复可比对）
      rerollContextRef.current = null;
      return userInput;
    }

    // 正常情况：找到最后一条 user → AI 对
    // 找到最后一条 AI 消息
    let lastAiIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') {
        lastAiIdx = i;
        break;
      }
    }
    if (lastAiIdx === -1) return;
    // 它前面紧邻的 user 输入
    let lastUserIdx = -1;
    for (let i = lastAiIdx - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const userInput = history[lastUserIdx].content;
    const snapshot = history[lastAiIdx].preTurnSnapshot;
    const previousResponse = history[lastAiIdx].parsedResponse?.body || history[lastAiIdx].content || '';
    rerollContextRef.current = {
      nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      previousResponse,
    };

    // 砍掉 user + ai；如果有 snapshot，把所有变量切片回滚到 user 发送前
    const trimmed = history.slice(0, lastUserIdx);
    s.setChatHistory(trimmed);
    setStreamingMessage('');
    s.setWorkflowStatus('');
    s.setWorkflowHint(snapshot ? '已回滚到上一回合发送前，可修改后重新发送。' : '旧回复缺少完整快照，仅恢复输入文本。');
    if (snapshot) {
      const nextStoryWeaving = restorePreTurnSnapshot(s, snapshot);
      await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(nextStoryWeaving));
    } else {
      // 老回复没 snapshot（迁移期 / 旧存档），只能粗略 turnCount -1，状态保持不变
      s.setTurnCount(Math.max(1, s.turnCount - 1));
    }

    return userInput;
  }, []);

  const handleRegenerateNarrativeImage = useCallback(async (messageId: string) => {
    await regenerateNarrativeImagesForMessage(stateRef.current, getActiveConfig, messageId);
  }, [getActiveConfig]);

  const handleRetryQueueTask = useCallback(async (task: 队列任务记录, mode: 'retry' | 'reroll' = 'retry') => {
    await retryQueueTask(stateRef.current, getActiveConfig, task, mode);
  }, [getActiveConfig]);

  // 重新开局：清掉所有运行时累积的变量切片，保留创角设定（名字 / 命途 / 世界周期 等）。
  // 不这样做的话，老的 NPC / 新闻 / 剧情节点 / variableBatches / 全局事件
  // 会留在状态里和新开局叠加，下次重开就是双份甚至 N 份数据。
  const handleRestartOpening = useCallback(() => {
    const s = stateRef.current;
    if (s.loading) {
      s.abortControllerRef.current?.abort();
    }
    s.setChatHistory([]);
    s.set记忆(创建空记忆系统());
    s.set忆庭(创建空忆庭系统());
    s.set手机(创建空手机系统());
    s.setTurnCount(1);
    setStreamingMessage('');

    const restartOpeningArchive = 归一化开局档案(s.世界.开局档案, s.世界);

    // 清空所有运行时累积的独立切片，再按开局档案恢复初始关系种子
    s.setNPC(根据开局档案创建初始NPC记录(restartOpeningArchive));
    s.set新闻([]);
    s.set剧情([]);
    s.setVariableBatches([]);
    s.setQueueTasks([]);
    const nextStoryWeaving = alignStoryWeavingToOpeningArchive(s.剧情编织, restartOpeningArchive);
    s.set剧情编织(nextStoryWeaving);
    saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(nextStoryWeaving));

    // worldState：保留创角时的 currentPeriod / difficulty / storyMode / startingScenarioId / customStartPrompt。
    // 重新开局时必须重建开局档案对应的已成立事实，否则非黑塔/自由开局会只剩字段，缺少后续注入锚点。
    s.set世界((prev) => {
      const openingArchive = restartOpeningArchive;
      const openingSummary = openingArchive.整理档案;
      const nextLocation =
        openingSummary?.初始地点参考?.trim()
        || prev.当前地点?.trim()
        || openingArchive.地区名称;
      const nextDate = openingSummary?.初始日期参考?.trim() || prev.当前日期;
      const nextTime = openingSummary?.初始时间参考?.trim() || prev.当前时间 || '06:40';
      return {
        ...prev,
        开局档案: openingArchive,
        起航之地ID: openingArchive.章节锚点ID || prev.起航之地ID,
        自定义开局: openingArchive.玩家介入原文 || prev.自定义开局,
        当前地点: nextLocation,
        已访问时段: [],
        纪年法: prev.纪年法 || '琥珀纪年',
        开拓天数: 1,
        当前日期: nextDate,
        当前时间: nextTime,
        全局事件: 生成开局已成立事实(openingArchive, {
          currentDate: nextDate,
          currentTime: nextTime,
          currentLocation: nextLocation,
          originalProtagonist: prev.原著主角,
        }),
        活跃人物: [],
        氛围变化: '',
      };
    });

    // traveler：保留创角时的所有静态字段，把道具运行时累积重置回开局态
    s.set旅人((prev) => ({
      ...prev,
      背包: [],
    }));

    s.setPendingOpeningTrigger('[系统] 开启第 0 回合');
  }, []);

  const getContextSnapshot = useCallback((kind?: ContextSnapshotKind) => {
    return buildContextSnapshot(stateRef.current, kind);
  }, []);

  const actions = useMemo(() => ({
    handleSend,
    handleAbort,
    handleNewGame,
    handleContinue,
    handleGoHome,
    handleSave,
    handleReroll,
    handleRegenerateNarrativeImage,
    handleRetryQueueTask,
    handleRestartOpening,
    getContextSnapshot,
  }), [
    handleSend,
    handleAbort,
    handleNewGame,
    handleContinue,
    handleGoHome,
    handleSave,
    handleReroll,
    handleRegenerateNarrativeImage,
    handleRetryQueueTask,
    handleRestartOpening,
    getContextSnapshot,
  ]);

  return {
    state,
    actions,
  };
}
