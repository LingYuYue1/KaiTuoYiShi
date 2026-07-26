/**
 * 阶段 11：后台任务 —— 新闻生成 / 忆庭入库 / 手机 Fallback 种子 / 正文插图。
 * 四个异步闭包参数化，parallel/sequential 分支不变。含 async API 调用。
 *
 * 读 d 字段:
 *   - displayText (S5)
 *   - finalHistory (S5→S9 写回)
 *   - npcAfterCompression (S9→S10 写回)
 *   - yitingWithCompression (S6)
 *   - variableOverrides (S8)
 *   - storyWeavingForSave (S10)
 *   - aiMsg (S5)
 *   - parsedForDisplay (S5)
 *   - openingNewsPreprocessed (S2)
 *   - openingNewsForSave (S2)
 *   - yitingPreview (S2)
 *   - yitingEnabled (S2)
 *   - yitingRecallEnabled (S2)
 *   - storyProgressMemoryLine (S10)
 *
 * 写 d 字段: newsAfterGeneration, yitingAfterTurnRecall,
 *   phoneAfterFallbackSeed, finalHistoryForSave
 */
import type { TurnContext, TurnDeltas } from './turnTypes';
import type { 新闻条目 } from '@/models/news';
import type { 忆庭系统 } from '@/models/yiting';
import type { 手机系统 } from '@/models/phone';
import { runNewsGenerationStep } from './newsWorkflow';
import { buildYitingArchiveEntry } from '@/services/yitingArchive';
import { buildFallbackPhoneSeed } from './phoneWorkflow';
import { resolveNarrativeImageTokenizerConfig, resolveNarrativeImageGenerationApi, generateNarrativeImagesForMessage } from './narrativeImageWorkflow';
import { buildRecentTurnWindowForNews, mergeYitingSystems, pushQueueTask } from './workflowTaskRuntime';
import { upsertRecallEntry } from './memoryUtils';
import { 创建默认记忆系统设置 } from '@/models/settings';

// ---- 参数/结果类型 ----

interface NewsJobParams {
  newsSettings: any;
  shouldRunNews: boolean;
  newsInterval: number;
  shouldRunOpeningNews: boolean;
  state: TurnContext['state'];
  displayText: string;
  userInput: string;
  finalHistory: any[];
  storyWeavingForSave: any;
  abortController: AbortController;
  isCurrentWorkflow: () => boolean;
  assertWorkflowActive: () => void;
}
interface NewsJobResult { newsAfterGeneration: 新闻条目[] | null; }

interface YitingJobParams {
  turnRecallSource: Record<string, unknown>;
  memorySettings: any;
  config: TurnContext['config'];
  abortController: AbortController;
  state: TurnContext['state'];
  yitingBase: 忆庭系统;
  yitingPreview: any;
  yitingEnabled: boolean;
  yitingRecallEnabled: boolean;
  assertWorkflowActive: () => void;
}
interface YitingJobResult { yitingAfterTurnRecall: 忆庭系统; }

interface PhoneJobParams {
  state: TurnContext['state'];
  phoneAfterFallbackSeed: 手机系统;
  npcAfterCompression: any;
  userInput: string;
  displayText: string;
}
interface PhoneJobResult { phoneAfterFallbackSeed: 手机系统; }

interface NarrativeJobParams {
  state: TurnContext['state'];
  aiMsg: any;
  displayText: string;
  config: TurnContext['config'];
  abortController: AbortController;
  finalHistory: any[];
  assertWorkflowActive: () => void;
}
interface NarrativeJobResult { finalHistoryForSave: any[]; }

// ---- 四个参数化闭包（函数体逻辑一字不改）----

async function runNewsBackgroundJob(p: NewsJobParams): Promise<NewsJobResult> {
  if (!p.newsSettings?.enabled || !p.newsSettings?.autoGenerate) {
    pushQueueTask(p.state, 'news', 'skipped', {
      detail: '星际和平周报未开启，已跳过。',
    });
    return { newsAfterGeneration: null };
  }
  if (!p.shouldRunNews) {
    pushQueueTask(p.state, 'news', 'skipped', {
      detail: `未到新闻触发间隔（每 ${p.newsInterval} 回合一次），已跳过。`,
    });
    return { newsAfterGeneration: null };
  }
  pushQueueTask(p.state, 'news', 'pending', {
    detail: p.shouldRunOpeningNews
      ? '开局首回合正在先处理一次星际和平周报。'
      : `正在调用星际和平周报独立 API（读取最近 ${p.newsInterval} 回合）。`,
    cancellable: true,
  });
  const newsGenerationResult = await runNewsGenerationStep({
    state: p.state,
    mainBody: p.displayText,
    userInput: p.userInput,
    recentTurns: buildRecentTurnWindowForNews(p.finalHistory, p.userInput, p.displayText, p.newsInterval),
    storyWeavingSnapshot: p.storyWeavingForSave,
    signal: p.abortController.signal,
    shouldCommit: p.isCurrentWorkflow,
  });
  p.assertWorkflowActive();
  const newsAfterGeneration = newsGenerationResult?.news ?? p.state.新闻;
  pushQueueTask(p.state, 'news', 'success', {
    detail: newsGenerationResult?.changed
      ? `星际和平周报已更新，当前共 ${newsAfterGeneration.length} 条新闻记录。`
      : newsGenerationResult
        ? '星际和平周报本回合没有可写新闻变化。'
        : '星际和平周报未生成有效结果。',
  });
  return { newsAfterGeneration };
}

async function runYitingArchiveJob(p: YitingJobParams): Promise<YitingJobResult> {
  // 忆庭入库始终执行；这里的开关只控制"是否召回并注入正文"。
  const turnRecallEntryResult = await buildYitingArchiveEntry(
    p.turnRecallSource as any,
    p.memorySettings,
    p.config,
    p.abortController.signal,
    p.memorySettings.忆庭召回API.retryCount ?? 2,
    p.state.gameSettings.promptModules,
  );
  p.assertWorkflowActive();
  const turnRecallEntry = turnRecallEntryResult.entry;
  const yitingAfterTurnRecall = upsertRecallEntry(p.yitingBase, turnRecallEntry);
  pushQueueTask(p.state, 'memory', 'success', {
    detail: turnRecallEntryResult.usedFallback ? '忆庭纪要已使用主回复小总结入库。' : '忆庭纪要已由独立模型压缩并入库。',
  });
  if (!p.yitingEnabled) {
    pushQueueTask(p.state, 'yiting', 'skipped', {
      detail: '忆庭召回已关闭，但入库仍已执行。',
    });
  } else if (!p.yitingRecallEnabled) {
    pushQueueTask(p.state, 'yiting', 'skipped', {
      detail: `未到第${(p.memorySettings.忆庭召回最早触发回合 ?? 10) + 1}回合，忆庭召回已跳过。`,
    });
  } else if (p.yitingPreview?.entries.length) {
    pushQueueTask(p.state, 'yiting', 'success', {
      detail: p.yitingPreview.usedModel ? '忆庭召回已由独立模型完成。' : '忆庭召回已由本地摘要检索完成。',
    });
  } else {
    pushQueueTask(p.state, 'yiting', 'success', {
      detail: '忆庭已检索，本回合没有命中相关档案。',
    });
  }
  return { yitingAfterTurnRecall };
}

async function runPhoneFallbackJob(p: PhoneJobParams): Promise<PhoneJobResult> {
  let phone = p.phoneAfterFallbackSeed;
  if (p.state.gameSettings.手机系统.enabled && p.state.gameSettings.手机系统.autoGenerateSeeds) {
    const fallbackSeed = buildFallbackPhoneSeed({
      phone,
      npcs: p.npcAfterCompression,
      turn: p.state.turnCount + 1,
      userInput: p.userInput,
      body: p.displayText,
      maxSeedsPerTurn: p.state.gameSettings.手机系统.maxSeedsPerTurn,
      contactCooldownTurns: p.state.gameSettings.手机系统.contactCooldownTurns,
    });
    if (fallbackSeed) {
      phone = {
        ...phone,
        messageSeeds: [...phone.messageSeeds, fallbackSeed],
        unreadTotal: phone.unreadTotal + 1,
      };
      pushQueueTask(p.state, 'phone', 'success', {
        detail: `已补充低频主动来信种子：${fallbackSeed.title}。`,
      });
    }
  }
  return { phoneAfterFallbackSeed: phone };
}

async function runNarrativeImageJob(p: NarrativeJobParams): Promise<NarrativeJobResult> {
  let fh = p.finalHistory;
  const 正文生图设置 = p.state.gameSettings.文生图系统?.正文生图;
  if (!正文生图设置?.enabled || 正文生图设置.mode !== 'auto') return { finalHistoryForSave: fh };
  const targetMessageId = p.aiMsg.id;
  const tokenizerConfig = resolveNarrativeImageTokenizerConfig(p.state, p.config);
  const imageApiConfig = resolveNarrativeImageGenerationApi(p.state);
  if (!tokenizerConfig) {
    pushQueueTask(p.state, 'narrative_image_parse', 'failed', {
      detail: '正文生图词组转化器未配置，无法解析故事快照提示词。',
      turn: p.state.turnCount,
      targetMessageId,
    });
    return { finalHistoryForSave: fh };
  }
  if (!imageApiConfig) {
    pushQueueTask(p.state, 'narrative_image_generate', 'failed', {
      detail: '正文生图主文生图接口未启用，无法生成故事快照。',
      turn: p.state.turnCount,
      targetMessageId,
    });
    return { finalHistoryForSave: fh };
  }
  const generatedImages = await generateNarrativeImagesForMessage({
    state: p.state,
    messageId: targetMessageId,
    body: p.displayText,
    tokenizerConfig,
    imageApiConfig,
    turn: p.state.turnCount,
    signal: p.abortController.signal,
  });
  p.assertWorkflowActive();
  if (generatedImages?.length) {
    fh = p.finalHistory.map((msg) =>
      msg.id === targetMessageId && msg.role === 'assistant'
        ? {
            ...msg,
            narrativeImages: [...(msg.narrativeImages ?? []), ...generatedImages],
          }
        : msg,
    );
  }
  return { finalHistoryForSave: fh };
}

// ---- 主阶段函数 ----

export async function stage11_backgroundJobs(
  ctx: TurnContext,
  d: TurnDeltas,
): Promise<Partial<TurnDeltas>> {
  const { state, userInput, effectiveWorld, config, abortController, assertWorkflowActive, isCurrentWorkflow } = ctx;
  const displayText = d.displayText!;
  const finalHistory = d.finalHistory!;
  const npcAfterCompression = (d as any).npcAfterCompression as typeof state.NPC;
  const yitingWithCompression = d.yitingWithCompression!;
  const variableOverrides = d.variableOverrides as Record<string, any> | null | undefined;
  const storyWeavingForSave = (d as any).storyWeavingForSave as typeof state.剧情编织;
  const aiMsg = d.aiMsg!;
  const parsedForDisplay = d.parsedForDisplay!;
  const openingNewsPreprocessed = d.openingNewsPreprocessed!;
  const openingNewsForSave = d.openingNewsForSave!;
  const yitingPreview = d.yitingPreview as any;
  const yitingEnabled = d.yitingEnabled!;
  const yitingRecallEnabled = d.yitingRecallEnabled!;
  const storyProgressMemoryLine = (d as any).storyProgressMemoryLine as string;
  const isOpeningSystemTrigger = state.turnCount === 1 && userInput.startsWith('[系统]');
  const memorySettings = state.gameSettings.记忆系统 ?? 创建默认记忆系统设置();

  // 阶段 11 前置计算
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

  // 初始值
  let newsAfterGeneration: 新闻条目[] | null = openingNewsForSave as 新闻条目[] | null;
  let yitingAfterTurnRecall = yitingBase;
  let phoneAfterFallbackSeed = variableOverrides?.手机 ?? state.手机;
  let finalHistoryForSave = finalHistory;

  // 四个参数化任务
  const newsParams: NewsJobParams = {
    newsSettings, shouldRunNews, newsInterval, shouldRunOpeningNews,
    state, displayText: displayText!, userInput, finalHistory,
    storyWeavingForSave, abortController, isCurrentWorkflow, assertWorkflowActive,
  };
  const yitingParams: YitingJobParams = {
    turnRecallSource, memorySettings, config, abortController, state,
    yitingBase, yitingPreview, yitingEnabled: Boolean(yitingEnabled),
    yitingRecallEnabled: Boolean(yitingRecallEnabled), assertWorkflowActive,
  };
  const phoneParams: PhoneJobParams = {
    state, phoneAfterFallbackSeed, npcAfterCompression, userInput, displayText: displayText!,
  };
  const narrativeParams: NarrativeJobParams = {
    state, aiMsg, displayText: displayText!, config, abortController, finalHistory,
    assertWorkflowActive,
  };

  if ((state.gameSettings.backgroundTaskMode ?? 'sequential') === 'parallel') {
    const [newsRes, yitingRes, phoneRes, narrativeRes] = await Promise.all([
      runNewsBackgroundJob(newsParams),
      runYitingArchiveJob(yitingParams),
      runPhoneFallbackJob(phoneParams),
      runNarrativeImageJob(narrativeParams),
    ]);
    newsAfterGeneration = newsRes.newsAfterGeneration ?? newsAfterGeneration;
    yitingAfterTurnRecall = yitingRes.yitingAfterTurnRecall;
    phoneAfterFallbackSeed = phoneRes.phoneAfterFallbackSeed;
    finalHistoryForSave = narrativeRes.finalHistoryForSave;
  } else {
    const newsRes = await runNewsBackgroundJob(newsParams);
    newsAfterGeneration = newsRes.newsAfterGeneration ?? newsAfterGeneration;
    const yitingRes = await runYitingArchiveJob(yitingParams);
    yitingAfterTurnRecall = yitingRes.yitingAfterTurnRecall;
    const phoneRes = await runPhoneFallbackJob(phoneParams);
    phoneAfterFallbackSeed = phoneRes.phoneAfterFallbackSeed;
    const narrativeRes = await runNarrativeImageJob(narrativeParams);
    finalHistoryForSave = narrativeRes.finalHistoryForSave;
  }

  return {
    newsAfterGeneration,
    yitingAfterTurnRecall,
    phoneAfterFallbackSeed,
    finalHistoryForSave,
  };
}
