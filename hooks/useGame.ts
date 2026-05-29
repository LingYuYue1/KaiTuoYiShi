import { useCallback, useRef } from 'react';
import { useGameState, type UseGameStateReturn } from '@/hooks/useGameState';
import { executeSendWorkflow } from '@/hooks/useGame/sendWorkflow';
import { buildContextSnapshot, type ContextSnapshotKind } from '@/hooks/useGame/contextSnapshot';
import { handleLoadLatest, handleManualSave } from '@/hooks/useGame/saveLoadWorkflow';
import { restorePreTurnSnapshot } from '@/hooks/useGame/turnSnapshot';
import { 创建空记忆系统 } from '@/models/memory';
import { 创建空忆庭系统 } from '@/models/yiting';
import { 创建空手机系统 } from '@/models/phone';
import type { API配置项 } from '@/models/settings';
import { saveSetting } from '@/services/dbService';

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
    handleRestartOpening: () => void;
    getContextSnapshot: (kind?: ContextSnapshotKind) => ReturnType<typeof buildContextSnapshot>;
  };
}

export function useGame(): UseGameReturn {
  const state = useGameState();
  const rerollContextRef = useRef<{ nonce: string; previousResponse: string } | null>(null);

  const getActiveConfig = useCallback((): API配置项 | null => {
    if (!state.apiSettings.activeConfigId) {
      if (state.apiSettings.configs.length > 0) {
        const first = state.apiSettings.configs[0];
        state.setApiSettings((prev) => ({ ...prev, activeConfigId: first.id }));
        return first;
      }
      return null;
    }
    return (
      state.apiSettings.configs.find(
        (c) => c.id === state.apiSettings.activeConfigId,
      ) ?? null
    );
  }, [state.apiSettings.activeConfigId, state.apiSettings.configs, state.setApiSettings]);

  const handleSend = useCallback(
    async (text: string) => {
      await executeSendWorkflow(text, {
        state,
        getActiveConfig,
        onBeforeSend: () => {},
        onAfterSend: () => {
          rerollContextRef.current = null;
        },
        rerollContext: rerollContextRef.current,
      });
    },
    [state, getActiveConfig],
  );

  const handleAbort = useCallback(() => {
    state.abortControllerRef.current?.abort();
  }, [state.abortControllerRef]);

  const handleNewGame = useCallback(() => {
    state.setView('new_game');
  }, [state.setView]);

  const handleContinue = useCallback(async (): Promise<boolean> => {
    return handleLoadLatest(state);
  }, [state]);

  const handleGoHome = useCallback(() => {
    state.abortControllerRef.current?.abort();
    state.setView('home');
  }, [state]);

  const handleSave = useCallback(async (): Promise<number> => {
    return handleManualSave(state);
  }, [state]);

  // 重roll：找到最后一条 user → AI 对，回滚状态，并把 user 输入交还给输入框。
  // 关键：用 aiMsg.preTurnSnapshot 把所有变量切片回滚到「该 user 发送前」的状态，
  // 防止重 roll 后上一次的 NPC / 新闻等副作用与新一次的叠加。
  const handleReroll = useCallback(async (): Promise<string | void> => {
    if (state.loading || state.pendingVariable) {
      state.setWorkflowHint('后台结算尚未完成，稍等完成后再重roll，避免记忆/忆庭/变量写入错位。');
      return;
    }
    state.abortControllerRef.current?.abort();
    state.abortControllerRef.current = null;
    const history = state.chatHistory;
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
    state.setChatHistory(trimmed);
    state.setStreamingMessage('');
    state.setWorkflowStatus('');
    state.setWorkflowHint(snapshot ? '已回滚到上一回合发送前，可修改后重新发送。' : '旧回复缺少完整快照，仅恢复输入文本。');
    if (snapshot) {
      const nextStoryWeaving = restorePreTurnSnapshot(state, snapshot);
      await saveSetting('storyWeavingSystem', nextStoryWeaving);
    } else {
      // 老回复没 snapshot（迁移期 / 旧存档），只能粗略 turnCount -1，状态保持不变
      state.setTurnCount(Math.max(1, state.turnCount - 1));
    }

    return userInput;
  }, [state]);

  // 重新开局：清掉所有运行时累积的变量切片，保留创角设定（名字 / 命途 / 世界周期 等）。
  // 不这样做的话，老的 NPC / 新闻 / 剧情节点 / variableBatches / 全局事件
  // 会留在状态里和新开局叠加，下次重开就是双份甚至 N 份数据。
  const handleRestartOpening = useCallback(() => {
    if (state.loading) {
      state.abortControllerRef.current?.abort();
    }
    state.setChatHistory([]);
    state.set记忆(创建空记忆系统());
    state.set忆庭(创建空忆庭系统());
    state.set手机(创建空手机系统());
    state.setTurnCount(1);
    state.setStreamingMessage('');

    // 清空所有运行时累积的独立切片
    state.setNPC([]);
    state.set新闻([]);
    state.set剧情([]);
    state.setVariableBatches([]);
    state.setQueueTasks([]);

    // worldState：保留创角时的 currentPeriod / difficulty / storyMode / startingScenarioId / customStartPrompt
    //（这些是世界书 + 向导设的），清掉运行时累积的事件链 / 时间 / 活跃 NPC / 氛围
    state.set世界((prev) => ({
      ...prev,
      已访问时段: [],
      纪年法: prev.纪年法 || '琥珀纪年',
      开拓天数: 1,
      当前时间: '06:40',
      全局事件: [],
      活跃人物: [],
      氛围变化: '',
    }));

    // traveler：保留创角时的所有静态字段，把道具 / 装备运行时累积重置回开局态
    state.set旅人((prev) => ({
      ...prev,
      背包: [],
      装备: {},
    }));

    state.setPendingOpeningTrigger('[系统] 开启第 0 回合');
  }, [state]);

  const getContextSnapshot = useCallback((kind?: ContextSnapshotKind) => buildContextSnapshot(state, kind), [state]);

  return {
    state,
    actions: {
      handleSend,
      handleAbort,
      handleNewGame,
      handleContinue,
      handleGoHome,
      handleSave,
      handleReroll,
      handleRestartOpening,
      getContextSnapshot,
    },
  };
}
