import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useGameState, type UseGameStateReturn } from '@/hooks/useGameState';
import { executeSendWorkflow, regenerateNarrativeImagesForMessage, retryQueueTask } from '@/hooks/useGame/sendWorkflow';
import { buildContextSnapshot, type ContextSnapshotKind } from '@/hooks/useGame/contextSnapshot';
import {
  buildSavePayload,
  commitActiveSaveTreeMeta,
  handleLoadLatest,
  handleManualSave,
} from '@/hooks/useGame/saveLoadWorkflow';
import { restorePreTurnSnapshotPersisted } from '@/hooks/useGame/turnSnapshot';
import {
  创建空记忆系统,
  serializeMemoryFailureSource,
  type 记忆失败草稿,
  type 记忆系统,
} from '@/models/memory';
import { retryMemoryFailureDraft, computeMemoryFingerprint, autoCompressMemorySystemWithArchivesAsync } from '@/hooks/useGame/memoryUtils';
import { 创建空忆庭系统, type 忆庭系统, type 回忆条目 } from '@/models/yiting';
import {
  runPhoneMemoryCommit,
  type PhoneMemoryCommitIntent,
  type PhoneDualWriteResult,
} from '@/services/phoneMemoryDualWrite';
import { 创建空手机系统 } from '@/models/phone';
import type { API配置项, 记忆系统设置 } from '@/models/settings';
import type { 队列任务记录 } from '@/models/queueTask';
import { 根据开局档案创建初始NPC记录, 生成开局已成立事实, 归一化开局档案 } from '@/models/world';
import { loadSetting, saveGame, saveSetting, updateSetting } from '@/services/dbService';
import { summarizeMemoryBatch } from '@/services/memoryCompression';
import {
  commitMemoryRebuildTask,
  createMemoryRebuildTask,
  runMemoryRebuildTask,
  type MemoryRebuildProgress,
  type MemoryRebuildRange,
  type MemoryRebuildTask,
} from '@/services/memoryRebuild';
import { clearWorkflowRecoveryJournal } from '@/services/workflowRecovery';
import { alignStoryWeavingToOpeningArchive, buildPersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import { callVariableModel } from '@/services/ai/variableModel';
import { analyzeVariableTurn } from '@/services/variableTurnAnalysis';
import { commitVariableState, snapshotVariableState } from '@/utils/variableExecutor';
import { buildVariableRepairPlan, commitVariableRepairPlan, mergeVariableRepairPlans, type VariableRepairPlan } from '@/utils/variableRepair';
import { findLinkedVariableBatchAssistant, findLinkedVariableBatchUser, linkVariableBatchesToChatHistory } from '@/utils/variableBatchIdentity';
import { stableFingerprint } from '@/utils/stableFingerprint';
import { createVariableHistoryRepairDraft, type VariableHistoryRepairDraft, type VariableHistoryRepairProgress } from '@/services/variableHistoryRepair';

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
    buildVariableRepairPlan: (messageId: string) => Promise<VariableRepairPlan>;
    buildVariableRepairBatch: (messageIds: string[], options?: {
      signal?: AbortSignal;
      onProgress?: (progress: VariableHistoryRepairProgress) => void;
    }) => Promise<VariableRepairPlan>;
    commitVariableRepairPlan: (plan: VariableRepairPlan, confirmedItemIds?: string[]) => Promise<ReturnType<typeof commitVariableRepairPlan>>;
    handleRetryMemoryFailureDraft: (draftId: string) => Promise<void>;
    handleIgnoreMemoryFailureDraft: (draftId: string) => Promise<void>;
    handleSilentMemoryCompress: () => Promise<void>;
    commitPhoneMemory: (intent: PhoneMemoryCommitIntent) => Promise<PhoneDualWriteResult | undefined>;
    handleBatchMemoryRebuild: (options: {
      batchSize: number;
      range?: MemoryRebuildRange;
      task?: MemoryRebuildTask;
      onProgress?: (progress: MemoryRebuildProgress) => void;
    }) => Promise<MemoryRebuildTask>;
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
    s.setInputText('');
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
        // 已完成的回合重 Roll：React 与持久化智库运行态一起回到回合前。
        await restorePreTurnSnapshotPersisted(s, snapshot, updateSetting);
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
      await restorePreTurnSnapshotPersisted(s, snapshot, updateSetting);
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

  const buildVariableRepairPlanAction = useCallback(async (messageId: string): Promise<VariableRepairPlan> => {
    const s = stateRef.current;
    const assistant = s.chatHistory.find((message) => message.id === messageId && message.role === 'assistant');
    if (!assistant) throw new Error('未找到对应的 AI 回合。');
    const linkedBatches = linkVariableBatchesToChatHistory(s.variableBatches, s.chatHistory);
    const sourceBatch = linkedBatches.find((batch) => batch.targetMessageId === assistant.id || (batch.turnId && batch.turnId === assistant.turnId));
    const linkedBatch = sourceBatch && sourceBatch.associationStatus !== 'ambiguous' && sourceBatch.associationStatus !== 'unlinked'
      ? sourceBatch
      : undefined;
    const user = linkedBatch
      ? findLinkedVariableBatchUser(s.chatHistory, linkedBatch)
      : s.chatHistory.slice(0, s.chatHistory.indexOf(assistant)).reverse().find((message) => message.role === 'user');
    const body = assistant.parsedResponse?.body?.trim() || assistant.content?.trim();
    if (!body) throw new Error('该回合没有可解析的正文。');
    const config = getActiveConfig();
    if (!config) throw new Error('未配置主 API，无法重新解析变量。');
    const stateSnapshot = snapshotVariableState({
      旅人: s.旅人,
      世界: s.世界,
      记忆: s.记忆,
      忆庭: s.忆庭,
      智库: s.智库,
      手机: s.手机,
      NPC: s.NPC,
      新闻: s.新闻,
      剧情: s.剧情,
    });
    const override = s.gameSettings.variableApi;
    const variableConfig: API配置项 = {
      ...config,
      provider: override.provider || config.provider,
      baseUrl: override.baseUrl.trim() || config.baseUrl,
      apiKey: override.apiKey.trim() || config.apiKey,
      model: override.model.trim() || config.model,
      maxTokens: override.maxTokens ?? Math.max(config.maxTokens ?? 0, 3200),
      temperature: override.temperature ?? config.temperature,
    };
    const modelResult = await callVariableModel(variableConfig, {
      body,
      variableDraft: assistant.parsedResponse?.variableDraft,
      userInput: user?.content ?? '',
      turnCount: Number.isFinite(Number(assistant.gameTime)) ? Number(assistant.gameTime) : Math.max(0, s.turnCount - 1),
      state: stateSnapshot,
      phoneSeedsEnabled: false,
      nsfwEnabled: s.gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: s.gameSettings.enableMaleNsfwArchive,
      retryCount: s.gameSettings.variableApi.retryCount ?? 2,
      promptModules: s.gameSettings.promptModules,
    });
    const analysis = analyzeVariableTurn({
      rawText: modelResult.rawText,
      stateSnapshot,
      turn: Number.isFinite(Number(assistant.gameTime)) ? Number(assistant.gameTime) : Math.max(0, s.turnCount - 1),
      operationSourceId: assistant.turnId ?? assistant.id,
      sourceTurnId: assistant.turnId,
      sourceMessageId: assistant.id,
      phoneSeedsEnabled: false,
      maxPhoneSeedsPerTurn: 0,
      nsfwEnabled: s.gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: s.gameSettings.enableMaleNsfwArchive,
      mode: 'repair',
      coverage: modelResult.coverage,
    });
    return buildVariableRepairPlan({
      analysis,
      baseState: stateSnapshot,
      turn: analysis.facts[0]?.sourceTurn ?? (Number.isFinite(Number(assistant.gameTime)) ? Number(assistant.gameTime) : Math.max(0, s.turnCount - 1)),
      turnId: assistant.turnId,
      targetMessageId: assistant.id,
      targetUserMessageId: user?.id,
      sourceBatchId: linkedBatch?.id,
      existingBatches: linkedBatches,
    });
  }, [getActiveConfig]);

  const commitVariableRepairPlanAction = useCallback(async (plan: VariableRepairPlan, confirmedItemIds: string[] = []) => {
    const s = stateRef.current;
    const currentState = snapshotVariableState({
      旅人: s.旅人,
      世界: s.世界,
      记忆: s.记忆,
      忆庭: s.忆庭,
      智库: s.智库,
      手机: s.手机,
      NPC: s.NPC,
      新闻: s.新闻,
      剧情: s.剧情,
    });
    if (stableFingerprint(currentState) !== plan.baseStateFingerprint) {
      return {
        ok: false,
        receipt: {
          status: 'stale' as const,
          code: 'STALE_PLAN' as const,
          planId: plan.id,
          stateFingerprintBefore: stableFingerprint(currentState),
          stateFingerprintAfter: stableFingerprint(currentState),
          appliedItemIds: [],
          skippedItemIds: [],
          conflictItemIds: plan.conflictItems.map((item) => item.id),
          message: '预览期间变量状态已变化，请重新解析后再提交。',
        },
        results: [],
      };
    }
    const backup = buildSavePayload(s, 'backup');
    await saveGame(backup);
    commitActiveSaveTreeMeta(backup);
    const previousBatches = s.variableBatches;
    const result = commitVariableRepairPlan({
      plan,
      currentState,
      confirmedItemIds,
      existingBatches: previousBatches,
    });
    if (!result.ok || !result.nextState) return result;
    const nextBatches = result.batch ? [...previousBatches, result.batch] : previousBatches;
    try {
      const next = result.nextState;
      const payload = buildSavePayload(s, 'auto', {
        旅人: next.旅人 as never,
        世界: next.世界 as never,
        记忆: next.记忆 as never,
        忆庭: next.忆庭 as never,
        智库: next.智库 as never,
        手机: next.手机 as never,
        NPC: next.NPC as never,
        新闻: next.新闻 as never,
        剧情: next.剧情 as never,
        variableBatches: nextBatches,
      });
      await saveGame(payload);
      commitActiveSaveTreeMeta(payload);
      commitVariableState(next, currentState, {
        set旅人: s.set旅人,
        set世界: s.set世界,
        set记忆: s.set记忆,
        set忆庭: s.set忆庭,
        set智库: s.set智库,
        set手机: s.set手机,
        setNPC: s.setNPC,
        set新闻: s.set新闻,
        set剧情: s.set剧情,
      });
      s.setVariableBatches(nextBatches);
      s.setHasSave(true);
    } catch (error) {
      s.set旅人(currentState.旅人 as never);
      s.set世界(currentState.世界 as never);
      s.set记忆(currentState.记忆 as never);
      s.set忆庭(currentState.忆庭 as never);
      s.set智库(currentState.智库 as never);
      s.set手机(currentState.手机 as never);
      s.setNPC(currentState.NPC as never);
      s.set新闻(currentState.新闻 as never);
      s.set剧情(currentState.剧情 as never);
      s.setVariableBatches(previousBatches);
      s.setWorkflowHint(`变量修复最终存档失败，已恢复提交前状态；保护存档已保留。${error instanceof Error ? error.message : ''}`);
      throw error;
    }
    return result;
  }, []);

  const buildVariableRepairBatchAction = useCallback(async (
    messageIds: string[],
    options: { signal?: AbortSignal; onProgress?: (progress: VariableHistoryRepairProgress) => void } = {},
  ): Promise<VariableRepairPlan> => {
    const uniqueMessageIds = [...new Set(messageIds)];
    if (!uniqueMessageIds.length) throw new Error('没有选择需要修复的历史回合。');
    const snapshot = stateRef.current;
    const baseState = snapshotVariableState({
      旅人: snapshot.旅人,
      世界: snapshot.世界,
      记忆: snapshot.记忆,
      忆庭: snapshot.忆庭,
      智库: snapshot.智库,
      手机: snapshot.手机,
      NPC: snapshot.NPC,
      新闻: snapshot.新闻,
      剧情: snapshot.剧情,
    });
    const baseStateFingerprint = stableFingerprint(baseState);
    const draftId = `variable-repair-${stableFingerprint(uniqueMessageIds)}`;
    const existingDraft = await loadSetting<VariableHistoryRepairDraft>(`variableHistoryRepair:${draftId}`);
    const resumableDraft = existingDraft && existingDraft.stateFingerprint === baseStateFingerprint
      && (existingDraft.status === 'paused' || existingDraft.status === 'running' || existingDraft.status === 'ready')
      ? existingDraft
      : undefined;
    const plans: VariableRepairPlan[] = [...(resumableDraft?.plans ?? [])];
    const completedMessageIds: string[] = [...(resumableDraft?.completedMessageIds ?? [])];
    const completedSet = new Set(completedMessageIds);
    const saveDraft = async (status: VariableHistoryRepairDraft['status'], error?: string) => {
      await saveSetting(`variableHistoryRepair:${draftId}`, createVariableHistoryRepairDraft({
        id: draftId,
        stateFingerprint: baseStateFingerprint,
        messageIds: uniqueMessageIds,
        completedMessageIds,
        plans,
        status,
        error,
      }));
    };
    await saveDraft('running');
    try {
      for (let index = 0; index < uniqueMessageIds.length; index += 1) {
        if (options.signal?.aborted) throw new DOMException('历史变量修复已取消。', 'AbortError');
        const messageId = uniqueMessageIds[index];
        if (completedSet.has(messageId)) {
          options.onProgress?.({ total: uniqueMessageIds.length, completed: completedSet.size });
          continue;
        }
        options.onProgress?.({ total: uniqueMessageIds.length, completed: index, currentMessageId: messageId });
        const plan = await buildVariableRepairPlanAction(messageId);
        if (plan.baseStateFingerprint !== baseStateFingerprint) {
          throw new Error('扫描期间变量状态发生变化，请重新选择历史回合。');
        }
        plans.push(plan);
        completedMessageIds.push(messageId);
        completedSet.add(messageId);
        await saveDraft('running');
        options.onProgress?.({ total: uniqueMessageIds.length, completed: index + 1 });
      }
      const merged = mergeVariableRepairPlans(plans);
      await saveDraft('ready');
      return merged;
    } catch (error) {
      const aborted = options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
      await saveDraft(aborted ? 'paused' : 'failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [buildVariableRepairPlanAction]);

  const persistMemorySnapshot = useCallback(async (memory: 记忆系统, yiting?: 忆庭系统): Promise<void> => {
    const s = stateRef.current;
    // 允许同时覆盖 记忆 与 忆庭：一次 buildSavePayload 持久化两者，不制造互相覆盖的两个 auto save 节点。
    const payload = buildSavePayload(s, 'auto', {
      记忆: memory,
      ...(yiting ? { 忆庭: yiting } : {}),
    });
    await saveGame(payload);
    commitActiveSaveTreeMeta(payload);
    s.setHasSave(true);
  }, []);

  /**
   * 记忆静默压缩（手动入口与失败重试共用）：直接压缩当前记忆，不弹确认窗；
   * AI 总结失败自动回退本地，失败草稿保留并弹重试提示。
   */
  /**
   * 手机记忆提交（上层串行事务入口）：PhoneModal 只提交意图，不携带旧状态快照；
   * 同一时刻的提交按 promise 链串行化，后一笔读取前一笔提交后的最新记忆/忆庭/NPC。
   */
  const phoneCommitChainRef = useRef<Promise<void>>(Promise.resolve());
  const commitPhoneMemory = useCallback(async (intent: PhoneMemoryCommitIntent): Promise<PhoneDualWriteResult | undefined> => {
    let result: PhoneDualWriteResult | undefined;
    const run = async () => {
      const s = stateRef.current;
      result = await runPhoneMemoryCommit({
        ...intent,
        memory: s.记忆,
        yiting: s.忆庭,
        npcs: s.NPC,
        settings: s.gameSettings.记忆系统,
        config: getActiveConfig(),
        gameTime: [s.世界.当前日期, s.世界.当前时间].filter(Boolean).join(' ').trim() || undefined,
      }, {
        getQueueTasks: () => stateRef.current.queueTasks,
        buildSavePayload: (overrides) => buildSavePayload(stateRef.current, 'auto', overrides),
        saveGame,
        publish: (next) => {
          const st = stateRef.current;
          st.set记忆(next.memory);
          st.set忆庭(next.yiting);
          st.setNPC(next.npcs);
          st.setQueueTasks(next.queueTasks);
        },
        onPersistFailure: (error) => stateRef.current.setWorkflowHint(error),
      });
    };
    phoneCommitChainRef.current = phoneCommitChainRef.current
      .then(run)
      .catch((err) => {
        console.warn('[phone-memory] 手机记忆提交失败', err instanceof Error ? err.message : String(err));
      });
    await phoneCommitChainRef.current;
    return result;
  }, [getActiveConfig]);

  const getMemoryCompressionConfig = useCallback((settings: 记忆系统设置): API配置项 | null => {
    const active = getActiveConfig();
    if (active) return active;
    const override = settings.记忆总结API;
    if (!override.baseUrl.trim() || !override.apiKey.trim() || !override.model.trim()) return null;
    const now = Date.now();
    return {
      id: 'memory-compression-only',
      name: '记忆总结 API',
      provider: override.provider || 'openai_compatible',
      baseUrl: override.baseUrl.trim(),
      apiKey: override.apiKey.trim(),
      model: override.model.trim(),
      maxTokens: override.maxTokens,
      temperature: override.temperature,
      retryCount: override.retryCount ?? 2,
      createdAt: now,
      updatedAt: now,
    };
  }, [getActiveConfig]);

  /**
   * 记忆静默压缩（手动入口与失败重试共用）：直接压缩当前记忆，不弹确认窗；
   * AI 总结失败自动回退本地，失败草稿保留并弹重试提示。
   */
  const handleSilentMemoryCompress = useCallback(async (): Promise<void> => {
    const s = stateRef.current;
    const settings = s.gameSettings.记忆系统;
    const config = getMemoryCompressionConfig(settings);
    if (!config) {
      s.setWorkflowHint('请先配置主 API 或记忆总结 API，再执行记忆压缩。');
      return;
    }
    try {
      const compression = await autoCompressMemorySystemWithArchivesAsync(
        s.记忆,
        s.turnCount,
        settings,
        config,
        undefined,
      );
      s.set记忆(compression.memory);
      if (compression.failures.length > 0) {
        s.set记忆压缩失败({ 条数: compression.failures.length });
      }
      s.setWorkflowHint(compression.failures.length > 0
        ? `${compression.failures.length} 条记忆总结失败，原始材料已保留，可在记忆面板失败草稿中重试。`
        : '记忆压缩完成。');
    } catch (error) {
      s.setWorkflowHint(error instanceof Error ? `记忆压缩失败：${error.message}` : '记忆压缩失败。');
    }
  }, [getMemoryCompressionConfig]);

  const handleRetryMemoryFailureDraft = useCallback(async (draftId: string): Promise<void> => {
    const s = stateRef.current;
    const settings = s.gameSettings.记忆系统;
    if (settings.启用中短长期API总结 === false) {
      s.setWorkflowHint('中短长期 API 总结已关闭，开启后才能重新总结失败草稿。');
      return;
    }
    const config = getMemoryCompressionConfig(settings);
    if (!config) {
      s.setWorkflowHint('请先配置主 API 或记忆总结 API，再重新总结失败草稿。');
      return;
    }

    const memory = s.记忆;
    const target = (memory.失败草稿 ?? []).find((draft) => draft.id === draftId);
    if (!target || target.status === 'resolved' || target.status === 'ignored') return;
    const retryingMemory: 记忆系统 = {
      ...memory,
      失败草稿: (memory.失败草稿 ?? []).map((draft) => draft.id === draftId
        ? { ...draft, status: 'retrying', updatedAt: Date.now() }
        : draft),
    };
    s.set记忆(retryingMemory);
    s.setWorkflowHint(`正在重新总结第 ${target.sourceTurns.start}-${target.sourceTurns.end} 回合的失败草稿。`);

    try {
      const result = await retryMemoryFailureDraft(retryingMemory, draftId, settings, config);
      s.set记忆(result.memory);
      try {
        await persistMemorySnapshot(result.memory);
      } catch (persistError) {
        s.setWorkflowHint(`记忆已在当前页面更新，但自动保存失败：${persistError instanceof Error ? persistError.message : String(persistError)}`);
        return;
      }
      s.setWorkflowHint(result.draft.status === 'resolved'
        ? '失败草稿已重新总结并精确替换原本地摘要。'
        : `重新总结仍未成功：${result.draft.failureMessage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '重新总结失败。';
      const failedMemory: 记忆系统 = {
        ...retryingMemory,
        失败草稿: (retryingMemory.失败草稿 ?? []).map((draft) => draft.id === draftId
          ? {
              ...draft,
              status: 'pending',
              failureMessage: message,
              attemptCount: Math.max(0, draft.attemptCount) + 1,
              updatedAt: Date.now(),
            }
          : draft),
      };
      s.set记忆(failedMemory);
      s.setWorkflowHint(message);
    }
  }, [getMemoryCompressionConfig, persistMemorySnapshot]);

  const handleIgnoreMemoryFailureDraft = useCallback(async (draftId: string): Promise<void> => {
    const s = stateRef.current;
    const now = Date.now();
    const memory: 记忆系统 = {
      ...s.记忆,
      失败草稿: (s.记忆.失败草稿 ?? []).map((draft) => draft.id === draftId
        ? {
            ...draft,
            status: 'ignored',
            sourceSnapshot: { ...draft.sourceSnapshot, payload: '' },
            updatedAt: now,
          }
        : draft),
    };
    s.set记忆(memory);
    try {
      await persistMemorySnapshot(memory);
    } catch (error) {
      s.setWorkflowHint(`失败草稿已在当前页面忽略，但自动保存失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    s.setWorkflowHint('失败草稿已忽略，本地 fallback 仍保留在记忆中。');
  }, [persistMemorySnapshot]);

  const handleBatchMemoryRebuild = useCallback(async (options: {
    batchSize: number;
    range?: MemoryRebuildRange;
    task?: MemoryRebuildTask;
    onProgress?: (progress: MemoryRebuildProgress) => void;
  }): Promise<MemoryRebuildTask> => {
    const s = stateRef.current;
    const settings = s.gameSettings.记忆系统;
    const config = getMemoryCompressionConfig(settings);
    const rebuildSettings = {
      apiEnabled: settings.启用中短长期API总结 !== false,
      compressionThreshold: settings.即时转短期阈值,
      prompts: {
        short: settings.即时转短期提示词,
        middle: settings.短期转中期提示词,
        long: settings.中期转长期提示词 || settings.短期转长期提示词,
      },
    };
    const task = options.task ?? createMemoryRebuildTask({
        chatHistory: s.chatHistory,
        batchSize: options.batchSize,
        range: options.range,
        settings: rebuildSettings,
      });
    if (s.loading || s.pendingVariable) {
      task.status = 'blocked';
      task.blockedReason = '正文或变量结算仍在运行，请等待本回合完成后再重建记忆。';
      return task;
    }
    if (task.turns.length === 0) {
      task.status = 'blocked';
      task.blockedReason = '所选范围内没有可配对的玩家输入与正文，原记忆未改动。';
      return task;
    }
    if (!config) {
      task.status = 'blocked';
      task.blockedReason = '请先配置主 API 或记忆总结 API。';
      return task;
    }

    const controller = new AbortController();
    s.abortControllerRef.current?.abort();
    s.abortControllerRef.current = controller;
    s.setWorkflowHint(`正在按每 ${task.batchSize} 回合一批重建记忆。`);

    const completedTask = await runMemoryRebuildTask(task, {
      settings: rebuildSettings,
      signal: controller.signal,
      onProgress: options.onProgress,
      summarizer: (source, context) => summarizeMemoryBatch(
        source,
        settings,
        config,
        context.signal,
        settings.记忆总结API.retryCount ?? 2,
      ),
    });
    if (s.abortControllerRef.current === controller) s.abortControllerRef.current = null;

    if (completedTask.status === 'ready') {
      const committed = commitMemoryRebuildTask(completedTask);
      if (committed) {
        const now = Date.now();
        const memory: 记忆系统 = {
          ...committed,
          失败草稿: (s.记忆.失败草稿 ?? []).map((draft) =>
            draft.origin === 'batch_rebuild'
            && draft.status !== 'resolved'
            && draft.status !== 'ignored'
            && draft.sourceTurns.start >= completedTask.range.start
            && draft.sourceTurns.end <= completedTask.range.end
              ? {
                  ...draft,
                  status: 'resolved',
                  sourceSnapshot: { ...draft.sourceSnapshot, payload: '' },
                  updatedAt: now,
                }
              : draft),
        };
        s.set记忆(memory);
        await persistMemorySnapshot(memory);
        s.setWorkflowHint(`记忆重建完成，已原子替换第 ${completedTask.range.start}-${completedTask.range.end} 回合对应的四层记忆。`);
      }
      return completedTask;
    }

    if (completedTask.status === 'paused_failed' && completedTask.failedBatch) {
      const failed = completedTask.failedBatch;
      const sourceSnapshot = await serializeMemoryFailureSource(failed.items);
      const now = Date.now();
      const duplicate = (s.记忆.失败草稿 ?? []).find((draft) =>
        (draft.status === 'pending' || draft.status === 'retrying')
        && draft.kind === failed.kind
        && draft.sourceSnapshot.checksum === sourceSnapshot.checksum,
      );
      if (!duplicate) {
        const draft: 记忆失败草稿 = {
          id: `memory_rebuild_failure_${now}_${Math.random().toString(36).slice(2, 8)}`,
          origin: 'batch_rebuild',
          kind: failed.kind,
          status: 'pending',
          sourceTurns: failed.sourceTurns,
          sourceSnapshot,
          targetLayer: failed.kind === 'short' ? '短期记忆' : failed.kind === 'middle' ? '中期记忆' : '长期记忆',
          fallbackSummary: failed.fallbackSummary,
          failureCode: failed.code === 'empty_output' || failed.code === 'unconfigured' || failed.code === 'source_changed'
            ? failed.code
            : 'request_failed',
          failureMessage: failed.message,
          attemptCount: failed.attemptCount,
          createdAt: now,
          updatedAt: now,
        };
        const memory: 记忆系统 = {
          ...s.记忆,
          失败草稿: [...(s.记忆.失败草稿 ?? []), draft],
        };
        s.set记忆(memory);
        await persistMemorySnapshot(memory);
      } else {
        const memory: 记忆系统 = {
          ...s.记忆,
          失败草稿: (s.记忆.失败草稿 ?? []).map((draft) => draft.id === duplicate.id
            ? {
                ...draft,
                status: 'pending',
                failureCode: failed.code === 'empty_output' || failed.code === 'unconfigured' || failed.code === 'source_changed'
                  ? failed.code
                  : 'request_failed',
                failureMessage: failed.message,
                attemptCount: Math.max(0, draft.attemptCount) + 1,
                updatedAt: now,
              }
            : draft),
        };
        s.set记忆(memory);
        await persistMemorySnapshot(memory);
      }
      s.setWorkflowHint(`批量重建在第 ${failed.sourceTurns.start}-${failed.sourceTurns.end} 回合暂停，原记忆未改动，失败批次已保留。`);
    } else if (completedTask.status === 'blocked') {
      s.setWorkflowHint(completedTask.blockedReason ?? '批量重建当前不可用。');
    } else if (completedTask.status === 'cancelled') {
      s.setWorkflowHint('批量重建已取消，原记忆未改动。');
    }
    return completedTask;
  }, [getMemoryCompressionConfig, persistMemorySnapshot]);

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
    buildVariableRepairPlan: buildVariableRepairPlanAction,
    buildVariableRepairBatch: buildVariableRepairBatchAction,
    commitVariableRepairPlan: commitVariableRepairPlanAction,
    handleRetryMemoryFailureDraft,
    handleIgnoreMemoryFailureDraft,
    handleSilentMemoryCompress,
    commitPhoneMemory,
    handleBatchMemoryRebuild,
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
    buildVariableRepairPlanAction,
    buildVariableRepairBatchAction,
    commitVariableRepairPlanAction,
    handleRetryMemoryFailureDraft,
    handleIgnoreMemoryFailureDraft,
    handleSilentMemoryCompress,
    commitPhoneMemory,
    handleBatchMemoryRebuild,
    handleRestartOpening,
    getContextSnapshot,
  ]);

  return {
    state,
    actions,
  };
}
