import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useGameState, type UseGameStateReturn } from '@/hooks/useGameState';
import { executeSendWorkflow } from '@/hooks/useGame/sendWorkflow';
import { executeResumeWorkflow } from '@/hooks/useGame/resumeWorkflow';
import { 初始化新局checkpoint } from '@/hooks/useGame/commitTurn';
import { regenerateNarrativeImagesForMessage } from '@/hooks/useGame/narrativeImageWorkflow';
import { retryQueueTask } from '@/hooks/useGame/workflowRetry';
import { buildContextSnapshot, type ContextSnapshotKind } from '@/hooks/useGame/contextSnapshot';
import { addImmediateMemory, autoCompressMemorySystemWithArchivesAsync, compressNpcMemoryLedger } from '@/hooks/useGame/memoryUtils';
import { analyzeTavernRegexScript, dryRunTavernRegexScript, extractTavernRegexScripts, type TavernRegexDryRunResult, type TavernRegexScriptSafety } from '@/hooks/useGame/tavernRegexProcessor';
import { beginSession, clearActiveSaveTreeMetaIfMatches, delete存档目标, handleLoadLatest, handleManualSave, resolve存档删除目标, type 存档删除目标 } from '@/hooks/useGame/saveLoadWorkflow';
import { restorePreTurnSnapshot } from '@/hooks/useGame/turnSnapshot';
import type { 角色数据结构 } from '@/models/character';
import { 创建空记忆系统 } from '@/models/memory';
import { 创建空忆庭系统 } from '@/models/yiting';
import { 创建空手机系统 } from '@/models/phone';
import type { API设置, API配置项 } from '@/models/settings';
import type { NewestStory字段集 } from '@/models/newestStory';
import type { 队列任务记录 } from '@/models/queueTask';
import { PATH_STAGE_DEFS, 创建命途进度 } from '@/models/path';
import { 归一化战技记录 } from '@/models/skill';
import { 创建空世界状态, 根据开局档案创建初始NPC记录, 根据官方开局预设创建开局档案, 根据起始场景创建开局档案, 根据自由开局整理创建开局档案, 生成开局已成立事实, 归一化开局档案, type 开局整理档案 } from '@/models/world';
import { 提取NPC同行记忆文本列表, type NPC同行记忆条目 } from '@/models/npc';
import type { STRegexScript } from '@/models/stTypes';
import { abilityPresets, factions, getFaction, getOpeningScenarioBundle, getPath, getStartingScenario, getStoryMode, storyModes } from '@/data/journeyPresets';
import { deleteSaveTree, loadSetting, saveSetting, type SaveListItemSummary } from '@/services/dbService';
import { clearWorkflowRecoveryJournal } from '@/services/workflowRecovery';
import { alignStoryWeavingToOpeningArchive, buildPersistedStoryWeavingSystem, loadAllBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import { parseOpeningArchiveWithAI } from '@/services/ai/openingArchive';
import {
  type OpeningPlayerPreset,
  type OpeningPresetDraft,
  OPENING_PLAYER_PRESETS_KEY,
  buildOpeningSummary,
  formatFreeOpeningWorkshopDraft,
  getCanonicalTrailblazer,
  mergeFreeOpeningPrompt,
  normalizeOpeningPresets,
  resolveSelectedScenarioPreset,
} from '@/components/features/NewGame/wizard/wizardData';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import { devLog, devLogError } from '@/utils/devLog';
import { TURN_STATUS_IDLE } from '@/hooks/useGame/turnStatus';
import { buildPhoneApiConfig, generatePhoneReply, type 手机回复上下文 } from '@/services/ai/phoneService';
import { generateSkillDraft, type 战技生成草稿, type 战技生成上下文 } from '@/services/ai/skillGenerator';
import { parseActionOptionsBlock } from '@/services/ai/responseParser';
import type { 剧情编织系统 } from '@/models/storyWeaving';

// 面板用例动作的类型出口（片 panel-p1）：tavernRegex 领域类型经门面再导出，
// 供 PromptModulesTab 以类型形式从门面接收，不再直取 hooks/useGame/ 内部模块。
export type { TavernRegexDryRunResult, TavernRegexScriptSafety } from '@/hooks/useGame/tavernRegexProcessor';

// 开局向导用例动作的类型出口（片 panel-p4）：TravelerTemplate 领域类型经门面再导出，
// 供 NewGameWizard / steps / App 以类型形式从门面接收，不再直取 services/ai/ 内部模块。
export type { TravelerTemplateContext, TravelerTemplateDraft } from '@/services/ai/travelerTemplate';

// 手机系统用例动作的类型出口（片 panel-p5）：手机回复上下文经门面再导出，
// 供 PhoneModal 以类型形式从门面接收，不再直取 services/ai/ 内部模块。
export type { 手机回复上下文 } from '@/services/ai/phoneService';

// 战技 AI 草稿用例动作的类型出口（片 panel-p6）：战技生成草稿/上下文经门面再导出，
// 供 SkillPanel 以类型形式从门面接收，不再直取 services/ai/ 内部模块。
export type { 战技生成草稿, 战技生成上下文 } from '@/services/ai/skillGenerator';

/** 手机记忆即时追加 + 归档压缩 + NPC 台账压缩的入参（PhoneModal 用例动作）。 */
export interface PhoneMemoryCommitInput {
  summary: string;
  npcId?: string | null;
  force?: boolean;
}

export interface UseGameReturn {
  state: UseGameStateReturn;
  actions: {
    handleSend: (text: string) => Promise<void>;
    handleAbort: () => void;
    handleResumeInterruptedWorkflow: () => Promise<boolean>;
    handleAbandonInterruptedWorkflow: () => Promise<void>;
    handleNewGame: () => void;
    handleContinue: () => Promise<boolean>;
    handleGoHome: () => void;
    handleSave: () => Promise<number>;
    handleReroll: () => Promise<string | undefined>;
    handleRegenerateNarrativeImage: (messageId: string) => Promise<void>;
    handleRetryQueueTask: (task: 队列任务记录, mode?: 'retry' | 'reroll') => Promise<void>;
    handleRestartOpening: () => Promise<void>;
    getContextSnapshot: (kind?: ContextSnapshotKind) => ReturnType<typeof buildContextSnapshot>;
    // ── 面板用例动作（片 panel-p1：数据通道收口）──
    // 记忆压缩：PhoneModal 的记忆即时追加与归档压缩，含 NPC 台账压缩。
    handlePhoneMemoryCommit: (input: PhoneMemoryCommitInput) => Promise<void>;
    // 手机 AI 回复（片 panel-p5）：封装 buildPhoneApiConfig + generatePhoneReply，失败时 devLogError 并返回空字符串兜底。
    handleGeneratePhoneReply: (apiConfig: API设置, context: 手机回复上下文) => Promise<string>;
    // 存档删除：resolve→delete 级联删除，SaveLoadModal 与 StorageManager 共用。
    handleDeleteSave: (save: SaveListItemSummary) => Promise<boolean>;
    handleDeleteSaveTree: (rootId: string) => Promise<void>;
    handleClearActiveSaveTreeMeta: (target?: { rootId?: string; nodeId?: string } | null) => void;
    // 提示词模块：承接 tavernRegex 的提取/分析/试运行（纯函数接线）。
    handleExtractTavernRegexScripts: (rawPreset: unknown) => STRegexScript[];
    handleAnalyzeTavernRegexScript: (script: STRegexScript) => TavernRegexScriptSafety;
    handleDryRunTavernRegexScript: (script: STRegexScript, sampleText: string) => TavernRegexDryRunResult;
    // ── 开局向导用例动作（片 panel-p4：NewGameWizard facade 收口）──
    // 开局预设持久化：NewGameWizard 的读取/保存闭环收敛到门面。
    handleLoadOpeningPresets: () => Promise<OpeningPlayerPreset[]>;
    handleSaveOpeningPresets: (presets: OpeningPlayerPreset[]) => Promise<OpeningPlayerPreset[]>;
    // AI 开局整理：把自由/创意工坊开局的文本整理为结构化开局档案，缺配置或失败时返回 null。
    handleParseOpeningArchive: (draft: OpeningPresetDraft) => Promise<开局整理档案 | null>;
    // 新局组装：draft → traveler/worldState/NPC 组装 + 状态初始化 + checkpoint（原 App.handleStartGame + 向导 handleStart）。
    // 返回 false 表示 API 预检失败，未做任何初始化，调用方不应切换视图。
    handlePrepareNewGame: (draft: OpeningPresetDraft) => Promise<boolean>;
    // ── 零散面板 AI + dbService 直连收口（片 panel-p6）──
    // 剧情编织持久化：PlotPanel 的 saveSetting('storyWeavingSystem', ...) 直连收敛到门面。
    handleSaveStoryWeaving: (system: 剧情编织系统) => Promise<void>;
    // 战技 AI 草稿：SkillPanel 的 generateSkillDraft 直连收敛到门面，失败时 devLogError 并向上抛出（面板保留错误提示文案）。
    handleGenerateSkillDraft: (apiConfig: API配置项, context: 战技生成上下文) => Promise<战技生成草稿>;
    // 行动选项解析：InputArea 的 parseActionOptionsBlock 直连收敛到门面（纯函数，无异步）。
    handleParseActionOptionsBlock: (text: string) => string[];
  };
}

/**
 * 开局 draft → 全部派生值（原 NewGameWizard.handleStart 的组装前置 + openingSummaryLines memo）。
 * 纯函数，供 handleParseOpeningArchive 与 handlePrepareNewGame 共用，避免两处重复推导。
 */
function deriveOpeningDraftContext(draft: OpeningPresetDraft) {
  const storyModeDef = getStoryMode(draft.storyMode) ?? storyModes[0];
  const selectedPath = getPath(draft.pathId);
  const selectedPathStage = PATH_STAGE_DEFS.find((item) => item.stage === draft.pathStage) ?? PATH_STAGE_DEFS[0];
  const selectedFaction = getFaction(draft.factionId) ?? factions[0];
  const selectedScenario = getStartingScenario(draft.startingScenarioId);
  const selectedScenarioPreset = resolveSelectedScenarioPreset(draft.startingScenarioId, selectedScenario);
  const scenarioBundle = getOpeningScenarioBundle(draft.startingScenarioId);
  const scenarioPreset = selectedScenarioPreset ?? scenarioBundle.preset;
  const selectedOpeningDate = scenarioPreset?.referenceDate ?? '琥珀纪 2157.03.07';
  const selectedOpeningTime = scenarioPreset?.referenceTime ?? '06:40';
  const selectedOpeningLocation =
    scenarioPreset?.defaultLocationHint
    ?? scenarioBundle.chapter?.defaultLocationHint
    ?? selectedScenario?.name
    ?? '黑塔空间站';
  const selectedOpeningTitle =
    scenarioPreset?.title
    ?? (scenarioBundle.region && scenarioBundle.chapter
      ? `${scenarioBundle.region.name} · ${scenarioBundle.chapter.name}`
      : selectedScenario?.name)
    ?? '未选择';
  const selectedAbilityNames = [
    ...draft.selectedAbilityIds
      .map((id) => abilityPresets.find((ability) => ability.id === id)?.name)
      .filter((text): text is string => Boolean(text)),
    ...draft.customAbilities,
  ];
  const freeOpeningWorkshopText = formatFreeOpeningWorkshopDraft(draft.freeOpeningWorkshop, draft.freeOpeningPlanetSource);
  const effectiveCustomStartPrompt = mergeFreeOpeningPrompt(draft.customStartPrompt, draft.openingSource !== 'official_preset' ? freeOpeningWorkshopText : '');
  const effectiveFreeMainlineEnabled = draft.openingSource === 'official_preset' || draft.freeOpeningMainlineEnabled;
  const canonicalName = getCanonicalTrailblazer(draft.canonicalTrailblazer).worldValue;
  const openingSummaryLines = buildOpeningSummary({
    scenario: selectedScenarioPreset
      ? {
          id: selectedScenarioPreset.chapterId,
          name: selectedScenarioPreset.title,
          description: selectedScenarioPreset.summary,
          openingHighlights: selectedScenarioPreset.openingPressure,
        }
      : scenarioBundle.chapter
        ? {
            id: scenarioBundle.chapter.id,
            name: scenarioBundle.chapter.name,
            description: scenarioBundle.chapter.summary,
            openingHighlights: scenarioBundle.chapter.openingPressure,
          }
        : selectedScenario ?? {
            id: draft.startingScenarioId,
            name: selectedOpeningTitle,
            description: '',
            openingHighlights: [],
          },
    location: selectedOpeningLocation,
    currentDate: selectedOpeningDate,
    currentTime: selectedOpeningTime,
    storyMode: storyModeDef.name,
    path: selectedPath,
    pathStage: draft.pathId !== 'none' ? selectedPathStage : undefined,
    faction: selectedFaction,
    customIdentity: draft.customIdentity,
    customStartPrompt: effectiveCustomStartPrompt,
    canonicalTrailblazer: canonicalName,
    abilities: selectedAbilityNames,
    skills: draft.openingSkills,
  });
  const freeOpeningInput = {
    regionId: scenarioPreset?.regionId ?? scenarioBundle.region?.id ?? 'herta_space_station',
    regionName: scenarioPreset?.regionName ?? scenarioBundle.region?.name ?? '黑塔空间站',
    chapterId: scenarioPreset?.chapterId ?? scenarioBundle.chapter?.id ?? (draft.startingScenarioId || 'herta_station_incident'),
    chapterName: scenarioPreset?.chapterName ?? scenarioBundle.chapter?.name ?? selectedScenario?.name ?? '黑塔空间站 · 主线苏醒前夕',
    chapterSummary: scenarioPreset?.summary ?? scenarioBundle.chapter?.summary ?? selectedScenario?.description ?? '',
    playerText: effectiveCustomStartPrompt,
    defaultLocationHint: selectedOpeningLocation,
    defaultDateHint: selectedOpeningDate,
    defaultTimeHint: selectedOpeningTime,
    officialPresetId: scenarioPreset?.id,
    workshopTemplateId: draft.openingSource === 'workshop' ? draft.selectedWorkshopTemplateId : undefined,
    priorStoryState: scenarioBundle.chapter?.priorStoryState,
    planetSource: draft.freeOpeningPlanetSource,
    mainlineEnabled: effectiveFreeMainlineEnabled,
    keyNpcs: scenarioPreset?.keyNpcs ?? scenarioBundle.preset?.keyNpcs ?? selectedScenario?.openingHighlights ?? [],
  };
  return {
    storyModeDef,
    selectedPath,
    selectedPathStage,
    selectedFaction,
    selectedScenario,
    selectedScenarioPreset,
    scenarioPreset,
    scenarioBundle,
    selectedOpeningDate,
    selectedOpeningTime,
    selectedOpeningLocation,
    selectedOpeningTitle,
    selectedAbilityNames,
    effectiveCustomStartPrompt,
    effectiveFreeMainlineEnabled,
    canonicalName,
    openingSummaryLines,
    freeOpeningInput,
  };
}

export function useGame(): UseGameReturn {
  const state = useGameState();
  // Keep a live ref so action callbacks stay identity-stable across state ticks.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const getActiveConfig = useCallback((): API配置项 | null => {
    const s = stateRef.current;
    if (!s.deviceSettings.apiSettings.activeConfigId) {
      if (s.deviceSettings.apiSettings.configs.length > 0) {
        const first = s.deviceSettings.apiSettings.configs[0];
        s.setDeviceApiSettings((prev) => ({ ...prev, activeConfigId: first.id }));
        return {
          ...first,
          enableClaudeMode: s.deviceSettings.gameSettings.enableClaudeMode,
        };
      }
      return null;
    }
    const config = s.deviceSettings.apiSettings.configs.find((c) => c.id === s.deviceSettings.apiSettings.activeConfigId) ?? null;
    return config ? {
      ...config,
      enableClaudeMode: s.deviceSettings.gameSettings.enableClaudeMode,
    } : null;
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const s = stateRef.current;
      if (s.activeWorkflow.interruptedWorkflow) {
        await clearWorkflowRecoveryJournal(s.activeWorkflow.interruptedWorkflow.workflowId);
      }
      s.activeWorkflow.setInterruptedWorkflow(null);
      await executeSendWorkflow(text, {
        state: s,
        getActiveConfig,
        onBeforeSend: () => {},
        onAfterSend: () => {
          stateRef.current.activeWorkflow.rerollContextRef.current = null;
        },
        rerollContext: stateRef.current.activeWorkflow.rerollContextRef.current,
      });
    },
    [getActiveConfig],
  );

  const handleAbort = useCallback(() => {
    stateRef.current.activeWorkflow.abortControllerRef.current?.abort();
  }, []);

  const handleResumeInterruptedWorkflow = useCallback(async (): Promise<boolean> => {
    const s = stateRef.current;
    if (s.activeWorkflow.loading || s.activeWorkflow.pendingVariable) return false;
    s.activeWorkflow.abortControllerRef.current?.abort();
    return executeResumeWorkflow({
      state: s,
      getState: () => stateRef.current,
      getActiveConfig,
      onBeforeSend: () => {},
      onAfterSend: () => {
        stateRef.current.activeWorkflow.rerollContextRef.current = null;
      },
      rerollContext: null,
    });
  }, [getActiveConfig]);

  const handleAbandonInterruptedWorkflow = useCallback(async (): Promise<void> => {
    const s = stateRef.current;
    const interrupted = s.activeWorkflow.interruptedWorkflow;
    if (interrupted) await clearWorkflowRecoveryJournal(interrupted.workflowId);
    s.activeWorkflow.setInterruptedWorkflow(null);
    s.activeWorkflow.setTurnStatus(TURN_STATUS_IDLE);
  }, []);

  const handleNewGame = useCallback(() => {
    const s = stateRef.current;
    void clearWorkflowRecoveryJournal(s.activeWorkflow.interruptedWorkflow?.workflowId);
    s.activeWorkflow.setInterruptedWorkflow(null);
    s.setView('new_game');
  }, []);

  const handleContinue = useCallback(async (): Promise<boolean> => {
    return handleLoadLatest(stateRef.current);
  }, []);

  const handleGoHome = useCallback(() => {
    const s = stateRef.current;
    s.activeWorkflow.abortControllerRef.current?.abort();
    s.setView('home');
  }, []);

  const handleSave = useCallback(async (): Promise<number> => {
    return handleManualSave(stateRef.current);
  }, []);

  // 重roll：找到最后一条 user → AI 对，回滚状态，并把 user 输入交还给输入框。
  // 关键：用 aiMsg.preTurnSnapshot 把所有变量切片回滚到「该 user 发送前」的状态，
  // 防止重 roll 后上一次的 NPC / 新闻等副作用与新一次的叠加。
  const handleReroll = useCallback(async (): Promise<string | undefined> => {
    const s = stateRef.current;
    if (s.activeWorkflow.loading || s.activeWorkflow.pendingVariable) {
      s.activeWorkflow.setTurnStatus({ kind: 'stopped', text: '后台结算尚未完成，稍等完成后再重roll，避免记忆/忆庭/变量写入错位。' });
      return;
    }
    s.activeWorkflow.abortControllerRef.current?.abort();
    s.activeWorkflow.abortControllerRef.current = null;
    const history = s.chatHistory;

    // 特殊情况：最后一条是 user 且没有对应的 assistant，说明本回合主剧情生成失败了。
    // 此时只回退这条孤立的 user 消息，不应回退到上一回合。
    const lastMsg = history.at(-1);
    if (lastMsg && lastMsg.role === 'user') {
      // 孤立 user：主剧情生成失败，只砍掉这条 user
      const userInput = lastMsg.content;
      const snapshot = lastMsg.preTurnSnapshot;
      const trimmed = history.slice(0, -1);
      s.setChatHistory(trimmed);
      setStreamingMessage('');
      s.activeWorkflow.setTurnStatus({ kind: 'stopped', text: snapshot ? '已回滚到本回合发送前，可修改后重新发送。' : '本回合缺少快照，仅恢复输入文本。' });
      if (snapshot) {
        const nextStoryWeaving = restorePreTurnSnapshot(s, snapshot);
        await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(nextStoryWeaving));
      } else {
        s.setTurnCount(Math.max(1, s.turnCount - 1));
      }
      // 生成失败的重 roll 不需要 rerollContext（没有上一版回复可比对）
      s.activeWorkflow.rerollContextRef.current = null;
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
    s.activeWorkflow.rerollContextRef.current = {
      nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      previousResponse,
    };

    // 砍掉 user + ai；如果有 snapshot，把所有变量切片回滚到 user 发送前
    const trimmed = history.slice(0, lastUserIdx);
    s.setChatHistory(trimmed);
    setStreamingMessage('');
    s.activeWorkflow.setTurnStatus({ kind: 'stopped', text: snapshot ? '已回滚到上一回合发送前，可修改后重新发送。' : '旧回复缺少完整快照，仅恢复输入文本。' });
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
  const handleRestartOpening = useCallback(async () => {
    const s = stateRef.current;
    devLog('save', 'new-game-initialize-start', { entry: 'restart' });
    await beginSession(s);
    const initialChatHistory: NewestStory字段集['chatHistory'] = [];
    const initialMemory = 创建空记忆系统();
    const initialYiting = 创建空忆庭系统();
    const initialPhone = 创建空手机系统();
    const initialNews: NewestStory字段集['新闻'] = [];
    const initialPlot: NewestStory字段集['剧情'] = [];
    const initialVariableBatches: NewestStory字段集['variableBatches'] = [];
    const initialQueueTasks: NewestStory字段集['queueTasks'] = [];
    s.setChatHistory(initialChatHistory);
    s.set记忆(initialMemory);
    s.set忆庭(initialYiting);
    s.set手机(initialPhone);
    s.setTurnCount(1);

    const restartOpeningArchive = 归一化开局档案(s.世界.开局档案, s.世界);
    const nextNPC = 根据开局档案创建初始NPC记录(restartOpeningArchive);

    // 清空所有运行时累积的独立切片，再按开局档案恢复初始关系种子
    s.setNPC(nextNPC);
    s.set新闻(initialNews);
    s.set剧情(initialPlot);
    s.setVariableBatches(initialVariableBatches);
    s.setQueueTasks(initialQueueTasks);
    const nextStoryWeaving = alignStoryWeavingToOpeningArchive(s.剧情编织, restartOpeningArchive);
    s.set剧情编织(nextStoryWeaving);
    void saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(nextStoryWeaving));

    // worldState：保留创角时的 currentPeriod / difficulty / storyMode / startingScenarioId / customStartPrompt。
    // 重新开局时必须重建开局档案对应的已成立事实，否则非黑塔/自由开局会只剩字段，缺少后续注入锚点。
    const nextWorld = (() => {
      const prev = s.世界;
      const openingArchive = restartOpeningArchive;
      const openingSummary = openingArchive.整理档案;
      const nextLocation =
        openingSummary?.初始地点参考?.trim()
        || prev.当前地点.trim()
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
    })();
    s.set世界(nextWorld);

    // traveler：保留创角时的所有静态字段，把道具运行时累积重置回开局态
    const nextTraveler = {
      ...s.旅人,
      背包: [],
    };
    s.set旅人(nextTraveler);

    const pendingOpeningTrigger = '[系统] 开启第 0 回合';
    s.setPendingOpeningTrigger(pendingOpeningTrigger);
    const { macroGlobalVars, worldbookTriggerStates } = s;
    const initialFields: NewestStory字段集 = {
      旅人: nextTraveler,
      世界: nextWorld,
      chatHistory: initialChatHistory,
      记忆: initialMemory,
      忆庭: initialYiting,
      智库: s.智库,
      手机: initialPhone,
      NPC: nextNPC,
      相册: s.相册,
      新闻: initialNews,
      剧情: initialPlot,
      剧情编织: nextStoryWeaving,
      variableBatches: initialVariableBatches,
      queueTasks: initialQueueTasks,
      turnCount: 1,
      macroGlobalVars,
      worldbookTriggerStates,
      pendingOpeningTrigger,
    };
    await 初始化新局checkpoint(initialFields);
    s.activeWorkflow.setSessionEpoch((e) => e + 1);
  }, []);

  const getContextSnapshot = useCallback((kind?: ContextSnapshotKind) => {
    return buildContextSnapshot(stateRef.current, kind);
  }, []);

  // ── 面板用例动作（片 panel-p1：数据通道收口）──────────────────────────
  // 记忆压缩：承接 PhoneModal 的记忆即时追加 + 归档压缩 + NPC 台账压缩。
  // 纯函数实现保留在 memoryUtils，这里只做接线与状态入口，不复制实现。
  const handlePhoneMemoryCommit = useCallback(async (input: PhoneMemoryCommitInput): Promise<void> => {
    const s = stateRef.current;
    const trimmed = input.summary.trim();
    if (!trimmed) return;
    const normalizedSummary = trimmed.startsWith('【手机】') ? trimmed : `【手机】${trimmed}`;
    const alreadyInMemory = s.记忆.即时记忆.some((item) => item.includes(trimmed))
      || s.记忆.短期记忆.some((item) => item.includes(trimmed))
      || s.记忆.中期记忆.some((item) => item.includes(trimmed))
      || s.记忆.长期记忆.some((item) => item.includes(trimmed));
    if (!input.force && alreadyInMemory) return;
    devLog('ui', 'phone-memory-commit-start', { npcId: input.npcId ?? null, force: Boolean(input.force) });
    const mainConfig: API配置项 = s.deviceSettings.apiSettings.configs.find((config) => config.id === s.deviceSettings.apiSettings.activeConfigId)
      ?? s.deviceSettings.apiSettings.configs.at(0)
      ?? { id: '', name: '', provider: 'openai_compatible', baseUrl: '', apiKey: '', model: '', createdAt: 0, updatedAt: 0 };
    const withImmediate = addImmediateMemory(s.记忆, normalizedSummary, s.turnCount);
    const compression = await autoCompressMemorySystemWithArchivesAsync(
      withImmediate,
      s.turnCount,
      s.deviceSettings.gameSettings.记忆系统,
      mainConfig,
    );
    s.set记忆(compression.memory);
    if (compression.archives.length) {
      s.set忆庭((prevYiting) => ({
        ...prevYiting,
        回忆档案: [...prevYiting.回忆档案, ...compression.archives],
      }));
    }
    if (input.npcId) {
      s.setNPC((prev) =>
        prev.map((npc) => {
          if (npc.id !== input.npcId) return npc;
          if (!input.force && 提取NPC同行记忆文本列表(npc).some((item) => item.includes(trimmed))) return npc;
          const nextEntry: NPC同行记忆条目 = {
            id: `npc_mem_phone_${s.turnCount}_${Math.random().toString(36).slice(2, 6)}`,
            回合: s.turnCount,
            摘要: trimmed,
            来源: '手机',
            关联NPCID: [npc.id],
          };
          const ledgerCompression = compressNpcMemoryLedger({
            npcId: npc.id,
            entries: [...(npc.同行记忆 ?? []), nextEntry],
            summaries: npc.总结记忆 ?? [],
            threshold: s.deviceSettings.gameSettings.记忆系统.NPC记忆压缩阈值,
            prompt: s.deviceSettings.gameSettings.记忆系统.NPC记忆压缩提示词,
            turn: s.turnCount,
            source: '手机',
          });
          return {
            ...npc,
            同行记忆: ledgerCompression.memories,
            总结记忆: ledgerCompression.summaries,
            最近互动: trimmed,
            共同经历: [...new Set([...(npc.共同经历 ?? []), trimmed])].slice(-8),
            对玩家长期印象: npc.对玩家长期印象 || '与玩家保持手机联系，已形成可承接的私下互动。',
            最近回合: s.turnCount,
          };
        }),
      );
    }
    devLog('ui', 'phone-memory-commit-done', { npcId: input.npcId ?? null, archives: compression.archives.length });
  }, []);

  // 手机 AI 回复（片 panel-p5）：原 PhoneModal 的 buildPhoneApiConfig + generatePhoneReply 直连收敛到门面。
  // 配置来源：apiConfig 传入 API 设置，手机系统专用配置（手机系统.api 覆盖）与提示词模块取自运行时游戏设置；
  // 成功返回按行拼接的回复文本（每行一条短讯，PhoneModal 按行还原为短讯列表），失败时 devLogError 并返回空字符串兜底。
  const handleGeneratePhoneReply = useCallback(async (
    apiConfig: API设置,
    context: 手机回复上下文,
  ): Promise<string> => {
    const s = stateRef.current;
    try {
      const config = buildPhoneApiConfig(s.deviceSettings.gameSettings, apiConfig);
      if (!config) return '';
      devLog('net', 'phone-reply-generate-start', { chatId: context.chat.id, type: context.chat.type });
      const reply = await generatePhoneReply(
        config,
        context,
        config.retryCount ?? 2,
        s.deviceSettings.gameSettings.promptModules,
      );
      devLog('net', 'phone-reply-generate-done', { chatId: context.chat.id, messages: reply.messages.length });
      return reply.messages.join('\n');
    } catch (err) {
      devLogError('net', 'phone-reply-generate-failed', err, { chatId: context.chat.id });
      return '';
    }
  }, []);

  // 存档删除：resolve→delete 级联删除（5d-1b 语义），SaveLoadModal 与 StorageManager 共用。
  // 确认文案由级联计数生成，删除后由 delete存档目标 负责 newest 祖先重定向与树元信息清理。
  const handleDeleteSave = useCallback(async (save: SaveListItemSummary): Promise<boolean> => {
    let deleteTarget: 存档删除目标;
    try {
      deleteTarget = await resolve存档删除目标(save);
    } catch (err) {
      devLogError('save', 'save-delete-plan-failed', err, { id: save.id });
      throw err;
    }
    const confirmMessage = deleteTarget.cascadeCount !== null && deleteTarget.cascadeCount > 1
      ? `确定删除这个存档及其子节点？将级联删除 ${deleteTarget.cascadeCount} 个存档，此操作不可恢复。`
      : '确定删除这个存档？此操作不可恢复。';
    if (!confirm(confirmMessage)) return false;
    devLog('save', 'save-delete-cascade', { id: save.id, cascadeCount: deleteTarget.cascadeCount });
    await delete存档目标(save.id, deleteTarget);
    return true;
  }, []);

  // 存档整树删除：dbService 树删除 + 活动树元信息清理，两端组件共用。
  const handleDeleteSaveTree = useCallback(async (rootId: string): Promise<void> => {
    await deleteSaveTree(rootId);
    clearActiveSaveTreeMetaIfMatches({ rootId });
    devLog('save', 'save-delete-tree', { rootId });
  }, []);

  // 活动存档树元信息清理（legacy 恢复点批量删除后的逐条收敛入口）。
  const handleClearActiveSaveTreeMeta = useCallback((target?: { rootId?: string; nodeId?: string } | null): void => {
    clearActiveSaveTreeMetaIfMatches(target);
  }, []);

  // 提示词模块：承接 tavernRegex 的提取/分析/试运行（纯函数接线，不复制实现）。
  const handleExtractTavernRegexScripts = useCallback((rawPreset: unknown): STRegexScript[] => {
    return extractTavernRegexScripts(rawPreset);
  }, []);

  const handleAnalyzeTavernRegexScript = useCallback((script: STRegexScript): TavernRegexScriptSafety => {
    return analyzeTavernRegexScript(script);
  }, []);

  const handleDryRunTavernRegexScript = useCallback((script: STRegexScript, sampleText: string): TavernRegexDryRunResult => {
    return dryRunTavernRegexScript(script, sampleText);
  }, []);

  // ── 开局向导用例动作（片 panel-p4：NewGameWizard facade 收口）──────────────────────────
  // 开局预设读取：loadSetting + normalize 收敛到门面，向导只消费归一化结果。
  const handleLoadOpeningPresets = useCallback(async (): Promise<OpeningPlayerPreset[]> => {
    const saved = await loadSetting<OpeningPlayerPreset[]>(OPENING_PLAYER_PRESETS_KEY);
    return normalizeOpeningPresets(saved);
  }, []);

  // 开局预设保存：normalize + saveSetting 收敛到门面，返回归一化结果供向导同步本地状态。
  const handleSaveOpeningPresets = useCallback(async (presets: OpeningPlayerPreset[]): Promise<OpeningPlayerPreset[]> => {
    const normalized = normalizeOpeningPresets(presets);
    await saveSetting(OPENING_PLAYER_PRESETS_KEY, normalized);
    return normalized;
  }, []);

  // AI 开局整理：自由/创意工坊开局由门面驱动 parseOpeningArchiveWithAI（配置缺失直接跳过）。
  // 失败向上抛给调用方（向导负责兜底状态与本地整理回退），成功返回结构化开局档案。
  const handleParseOpeningArchive = useCallback(async (draft: OpeningPresetDraft): Promise<开局整理档案 | null> => {
    if (draft.openingSource === 'official_preset') return null;
    const config = getActiveConfig();
    if (!config) return null;
    const { freeOpeningInput } = deriveOpeningDraftContext(draft);
    devLog('net', 'opening-archive-parse-start', { source: draft.openingSource });
    const parsed = await parseOpeningArchiveWithAI(
      config,
      {
        regionName: freeOpeningInput.regionName,
        chapterName: freeOpeningInput.chapterName,
        chapterSummary: freeOpeningInput.chapterSummary,
        playerText: freeOpeningInput.playerText,
        defaultLocationHint: freeOpeningInput.defaultLocationHint,
        defaultDateHint: freeOpeningInput.defaultDateHint,
        defaultTimeHint: freeOpeningInput.defaultTimeHint,
        priorStoryState: freeOpeningInput.priorStoryState,
        planetSource: freeOpeningInput.planetSource,
        mainlineEnabled: freeOpeningInput.mainlineEnabled,
        keyNpcs: freeOpeningInput.keyNpcs,
        sourceLabel: draft.openingSource === 'workshop' ? '创意工坊开局' : '自由开局',
      },
      config.retryCount ?? 2,
    );
    devLog('net', 'opening-archive-parse-done', { source: draft.openingSource });
    return parsed;
  }, [getActiveConfig]);

  // 新局组装：draft → traveler/worldState/NPC 组装 + 全切片状态初始化 + 开局 checkpoint。
  // 原 NewGameWizard.handleStart 的组装逻辑与 App.handleStartGame 的状态初始化在此合并；
  // 视图切换与启动动画仍由 App 在返回 true 后驱动。返回 false 表示 API 预检失败，未做任何初始化。
  const handlePrepareNewGame = useCallback(async (draft: OpeningPresetDraft): Promise<boolean> => {
    const s = stateRef.current;
    // 预检 API：configs 为空时给出明确提示，不初始化状态，避免玩家被困在空白游戏页。
    if (s.deviceSettings.apiSettings.configs.length === 0) {
      alert('请先在设置中配置至少一个 API 接口，再开始旅途。');
      return false;
    }
    devLog('save', 'new-game-initialize-start', { entry: 'start' });
    const {
      selectedPath,
      selectedPathStage,
      selectedFaction,
      selectedScenario,
      scenarioPreset,
      scenarioBundle,
      selectedOpeningDate,
      selectedOpeningTime,
      selectedOpeningLocation,
      selectedOpeningTitle,
      selectedAbilityNames,
      effectiveCustomStartPrompt,
      canonicalName,
      openingSummaryLines,
      freeOpeningInput,
    } = deriveOpeningDraftContext(draft);

    const startingPaths =
      draft.pathId !== 'none'
        ? [
            {
              ...创建命途进度(
                draft.pathId,
                true,
                selectedOpeningTitle,
                `开局承载 · 初始阶段：${selectedPathStage.name}`,
              ),
              阶段: draft.pathStage,
            },
          ]
        : [];
    const finalIdentity = draft.customIdentity.trim();
    const factionIdentity = selectedFaction.id === 'none' ? '' : selectedFaction.name;
    const displayIdentity = [factionIdentity, finalIdentity].filter(Boolean).join(' · ');

    const traveler: 角色数据结构 = {
      姓名: draft.name.trim() || '无名开拓者',
      别名: draft.alias.trim(),
      性别: draft.gender.trim(),
      年龄: draft.age,
      生日: draft.birthday.trim(),
      身高: '',
      身份: displayIdentity,
      外貌: draft.appearance.trim(),
      性格: draft.personality.trim(),
      背景: draft.background.trim(),
      专长知识: [],
      头像: '',
      图像档案: {},
      属性: {
        力量: 0,
        智慧: 0,
        敏捷: 0,
        体质: 0,
        运气: 0,
      },
      主命途: draft.pathId,
      命途列表: startingPaths,
      能力: selectedAbilityNames,
      背包: [],
      战技列表: draft.openingSkills.map((skill) => 归一化战技记录({ ...skill, 已启用: skill.已启用 !== false })),
    };

    const worldState = 创建空世界状态();
    let resolvedOpeningLocation = selectedOpeningLocation;
    worldState.纪年法 = '琥珀纪年';
    worldState.开拓天数 = 1;
    worldState.当前日期 = selectedOpeningDate;
    worldState.当前时间 = selectedOpeningTime;
    worldState.当前地点 = resolvedOpeningLocation;
    worldState.剧情模式 = draft.storyMode;
    worldState.起航之地ID = scenarioPreset?.chapterId ?? scenarioBundle.chapter?.id ?? (draft.startingScenarioId || 'herta_station_incident');
    worldState.原著主角 = canonicalName;
    worldState.自定义开局 = effectiveCustomStartPrompt;
    if (draft.openingSource === 'official_preset') {
      worldState.开局档案 = scenarioPreset ? 根据官方开局预设创建开局档案(scenarioPreset, {
        ...worldState,
        自定义开局: effectiveCustomStartPrompt,
      }) : 根据起始场景创建开局档案(selectedScenario ?? {
        id: scenarioBundle.chapter?.id ?? draft.startingScenarioId,
        name: selectedOpeningTitle,
        description: scenarioBundle.chapter?.summary ?? '',
        openingHighlights: scenarioBundle.chapter?.openingPressure ?? [],
        officialPresetId: scenarioBundle.preset?.id,
      }, {
        ...worldState,
        自定义开局: effectiveCustomStartPrompt,
      });
    } else {
      worldState.开局档案 = 根据自由开局整理创建开局档案({
        ...freeOpeningInput,
        整理档案: draft.parsedArchive ?? undefined,
      });
      resolvedOpeningLocation =
        worldState.开局档案.整理档案?.自定义起始地点?.trim()
        || worldState.开局档案.整理档案?.初始地点参考?.trim()
        || selectedOpeningLocation;
      worldState.当前地点 = resolvedOpeningLocation;
    }
    worldState.全局事件 = 生成开局已成立事实(worldState.开局档案, {
      currentDate: selectedOpeningDate,
      currentTime: selectedOpeningTime,
      currentLocation: resolvedOpeningLocation,
      originalProtagonist: canonicalName,
      pathSummary: selectedPath
        ? `${selectedPath.name}（${selectedPath.aeon}）｜初始阶段：${selectedPathStage.name}（${selectedPathStage.title}）`
        : undefined,
      extraFacts: [
        ...openingSummaryLines,
        ...(selectedScenario?.openingHighlights ?? []).map((text) => `场景要点：${text}`),
      ],
    });
    const initialNpcRecords = 根据开局档案创建初始NPC记录(worldState.开局档案);

    // 状态初始化（原 App.handleStartGame）：重置全部运行时切片，避免上一局存档残留污染新局。
    const initialChatHistory: NewestStory字段集['chatHistory'] = [];
    const initialMemory = 创建空记忆系统();
    const initialYiting = 创建空忆庭系统();
    const initialPhone = 创建空手机系统();
    const initialNews: NewestStory字段集['新闻'] = [];
    const initialPlot: NewestStory字段集['剧情'] = [];
    const initialVariableBatches: NewestStory字段集['variableBatches'] = [];
    const initialQueueTasks: NewestStory字段集['queueTasks'] = [];
    s.set旅人(traveler);
    s.set世界(worldState);
    s.setChatHistory(initialChatHistory);
    s.setTurnCount(1);
    s.set记忆(initialMemory);
    s.set忆庭(initialYiting);
    s.setNPC(initialNpcRecords);
    s.set手机(initialPhone);
    s.set新闻(initialNews);
    s.set剧情(initialPlot);
    s.setVariableBatches(initialVariableBatches);
    s.setQueueTasks(initialQueueTasks);
    let nextStoryWeaving = s.剧情编织;
    try {
      nextStoryWeaving = alignStoryWeavingToOpeningArchive(
        await loadAllBundledStoryWeavingPresets(),
        worldState.开局档案,
      );
      s.set剧情编织(nextStoryWeaving);
      await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(nextStoryWeaving));
    } catch (err) {
      devLogError('save', 'story-weaving-new-game-fallback', err, { entry: 'start' });
    }
    const pendingOpeningTrigger = '[系统] 开启第 0 回合';
    s.setPendingOpeningTrigger(pendingOpeningTrigger);
    const { macroGlobalVars, worldbookTriggerStates } = s;
    const initialFields: NewestStory字段集 = {
      旅人: traveler,
      世界: worldState,
      chatHistory: initialChatHistory,
      记忆: initialMemory,
      忆庭: initialYiting,
      智库: s.智库,
      手机: initialPhone,
      NPC: initialNpcRecords,
      相册: s.相册,
      新闻: initialNews,
      剧情: initialPlot,
      剧情编织: nextStoryWeaving,
      variableBatches: initialVariableBatches,
      queueTasks: initialQueueTasks,
      turnCount: 1,
      macroGlobalVars,
      worldbookTriggerStates,
      pendingOpeningTrigger,
    };
    await 初始化新局checkpoint(initialFields);
    devLog('save', 'new-game-initialize-done', { entry: 'start' });
    return true;
  }, []);

  // ── 零散面板 AI + dbService 直连收口（片 panel-p6）──────────────────────────
  // 剧情编织持久化：PlotPanel 的 saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem()) 收敛到门面。
  // 归一化由面板负责，这里只做持久化接线与日志。
  const handleSaveStoryWeaving = useCallback(async (system: 剧情编织系统): Promise<void> => {
    await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(system));
    devLog('save', 'story-weaving-saved', { seriesCount: system.系列列表.length });
  }, []);

  // 战技 AI 草稿：SkillPanel 的 generateSkillDraft 直连收敛到门面。
  // 失败时 devLogError 后向上抛出，由面板保留自己的错误提示文案与本地状态回滚。
  const handleGenerateSkillDraft = useCallback(async (
    apiConfig: API配置项,
    context: 战技生成上下文,
  ): Promise<战技生成草稿> => {
    try {
      devLog('net', 'skill-draft-generate-start', { slotKind: context.slotKind, slotIndex: context.slotIndex });
      const draft = await generateSkillDraft(apiConfig, context);
      devLog('net', 'skill-draft-generate-done', { slotKind: context.slotKind, slotIndex: context.slotIndex });
      return draft;
    } catch (err) {
      devLogError('net', 'skill-draft-generate-failed', err, { slotKind: context.slotKind, slotIndex: context.slotIndex });
      throw err;
    }
  }, []);

  // 行动选项解析：InputArea 的 parseActionOptionsBlock 直连收敛到门面（纯函数接线，不复制实现）。
  const handleParseActionOptionsBlock = useCallback((text: string): string[] => {
    return parseActionOptionsBlock(text);
  }, []);

  const actions = useMemo(() => ({
    handleSend,
    handleAbort,
    handleResumeInterruptedWorkflow,
    handleAbandonInterruptedWorkflow,
    handleNewGame,
    handleContinue,
    handleGoHome,
    handleSave,
    handleReroll,
    handleRegenerateNarrativeImage,
    handleRetryQueueTask,
    handleRestartOpening,
    getContextSnapshot,
    handlePhoneMemoryCommit,
    handleGeneratePhoneReply,
    handleDeleteSave,
    handleDeleteSaveTree,
    handleClearActiveSaveTreeMeta,
    handleExtractTavernRegexScripts,
    handleAnalyzeTavernRegexScript,
    handleDryRunTavernRegexScript,
    handleLoadOpeningPresets,
    handleSaveOpeningPresets,
    handleParseOpeningArchive,
    handlePrepareNewGame,
    handleSaveStoryWeaving,
    handleGenerateSkillDraft,
    handleParseActionOptionsBlock,
  }), [
    handleSend,
    handleAbort,
    handleResumeInterruptedWorkflow,
    handleAbandonInterruptedWorkflow,
    handleNewGame,
    handleContinue,
    handleGoHome,
    handleSave,
    handleReroll,
    handleRegenerateNarrativeImage,
    handleRetryQueueTask,
    handleRestartOpening,
    getContextSnapshot,
    handlePhoneMemoryCommit,
    handleGeneratePhoneReply,
    handleDeleteSave,
    handleDeleteSaveTree,
    handleClearActiveSaveTreeMeta,
    handleExtractTavernRegexScripts,
    handleAnalyzeTavernRegexScript,
    handleDryRunTavernRegexScript,
    handleLoadOpeningPresets,
    handleSaveOpeningPresets,
    handleParseOpeningArchive,
    handlePrepareNewGame,
    handleSaveStoryWeaving,
    handleGenerateSkillDraft,
    handleParseActionOptionsBlock,
  ]);

  return {
    state,
    actions,
  };
}
