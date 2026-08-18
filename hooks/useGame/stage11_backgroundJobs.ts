import type { TurnContext, TurnDeltas } from './turnTypes';
import type { 聊天消息 } from '@/models/chat';
import type { 新闻条目 } from '@/models/news';
import type { 忆庭系统 } from '@/models/yiting';
import type { 手机系统 } from '@/models/phone';
import type { 相册系统 } from '@/models/imageGeneration';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 记忆系统设置, 星际和平周报设置, 文生图系统设置 } from '@/models/settings';
import type { YitingArchiveSource } from '@/services/yitingArchive';
import { runNewsGenerationStep } from './newsWorkflow';
import { buildYitingArchiveEntry } from '@/services/yitingArchive';
import { buildFallbackPhoneSeed } from './phoneWorkflow';
import { resolveNarrativeImageTokenizerConfig, resolveNarrativeImageGenerationApi, generateNarrativeImagesForMessage } from './narrativeImageWorkflow';
import { buildRecentTurnWindowForNews, mergeYitingSystems, pushQueueTask } from './workflowTaskRuntime';
import { upsertRecallEntry } from './memoryUtils';
import { 创建默认记忆系统设置 } from '@/models/settings';
import { devLog } from '@/utils/devLog';

// ---- 参数/结果类型 ----

interface YitingPreviewForBackground {
  entries: unknown[];
  usedModel: boolean;
}

interface VariableOverridesForBackground {
  忆庭?: 忆庭系统;
  手机?: 手机系统;
}

interface NewsJobParams {
  newsSettings: 星际和平周报设置 | undefined;
  shouldRunNews: boolean;
  newsInterval: number;
  shouldRunOpeningNews: boolean;
  state: TurnContext['state'];
  displayText: string;
  userInput: string;
  finalHistory: 聊天消息[];
  storyWeavingForSave: 剧情编织系统;
  abortController: AbortController;
  isCurrentWorkflow: () => boolean;
  assertWorkflowActive: () => void;
  turnCountAtStart: number;
  queueTasksMirror: TurnContext['queueTasksMirror'];
}
interface NewsJobResult { newsAfterGeneration: 新闻条目[] | null; }

interface YitingJobParams {
  turnRecallSource: YitingArchiveSource;
  memorySettings: 记忆系统设置;
  config: TurnContext['config'];
  abortController: AbortController;
  state: TurnContext['state'];
  yitingBase: 忆庭系统;
  yitingPreview: YitingPreviewForBackground | null;
  yitingEnabled: boolean;
  yitingRecallEnabled: boolean;
  assertWorkflowActive: () => void;
  turnCountAtStart: number;
  queueTasksMirror: TurnContext['queueTasksMirror'];
}
interface YitingJobResult { yitingAfterTurnRecall: 忆庭系统; }

interface PhoneJobParams {
  state: TurnContext['state'];
  phoneAfterFallbackSeed: 手机系统;
  npcAfterCompression: NonNullable<TurnDeltas['npcAfterCompression']>;
  userInput: string;
  displayText: string;
  skipPhoneSeeds: boolean;
  turnCountAtStart: number;
  queueTasksMirror: TurnContext['queueTasksMirror'];
}
interface PhoneJobResult { phoneAfterFallbackSeed: 手机系统; }

interface NarrativeJobParams {
  state: TurnContext['state'];
  aiMsg: 聊天消息;
  displayText: string;
  config: TurnContext['config'];
  abortController: AbortController;
  finalHistory: 聊天消息[];
  assertWorkflowActive: () => void;
  turnCountAtStart: number;
  queueTasksMirror: TurnContext['queueTasksMirror'];
}
interface NarrativeJobResult { finalHistoryForSave: 聊天消息[]; 相册After?: 相册系统; }

// ---- 四个参数化闭包（函数体逻辑一字不改）----

async function runNewsBackgroundJob(p: NewsJobParams): Promise<NewsJobResult> {
  if (!p.newsSettings?.enabled || !p.newsSettings.autoGenerate) {
    pushQueueTask(p.state, 'news', 'skipped', {
      detail: '星际和平周报未开启，已跳过。',
    }, p.turnCountAtStart, p.queueTasksMirror);
    return { newsAfterGeneration: null };
  }
  if (!p.shouldRunNews) {
    pushQueueTask(p.state, 'news', 'skipped', {
      detail: `未到新闻触发间隔（每 ${p.newsInterval} 回合一次），已跳过。`,
    }, p.turnCountAtStart, p.queueTasksMirror);
    return { newsAfterGeneration: null };
  }
  pushQueueTask(p.state, 'news', 'pending', {
    detail: p.shouldRunOpeningNews
      ? '开局首回合正在先处理一次星际和平周报。'
      : `正在调用星际和平周报独立 API（读取最近 ${p.newsInterval} 回合）。`,
    cancellable: true,
  }, p.turnCountAtStart, p.queueTasksMirror);
  const newsGenerationResult = await runNewsGenerationStep({
    state: p.state,
    traveler: p.state.旅人,
    world: p.state.世界,
    news: p.state.新闻,
    npcRecords: p.state.NPC,
    plotNodes: p.state.剧情,
    storyWeaving: p.state.剧情编织,
    turnCountAtStart: p.turnCountAtStart,
    mainBody: p.displayText,
    userInput: p.userInput,
    recentTurns: buildRecentTurnWindowForNews(p.finalHistory, p.userInput, p.displayText, p.newsInterval),
    storyWeavingSnapshot: p.storyWeavingForSave,
    signal: p.abortController.signal,
    shouldCommit: p.isCurrentWorkflow,
  });
  const generatedNews = newsGenerationResult?.news;
  p.assertWorkflowActive();
  // 投影点（B2-c）：会话身份守卫之后才允许旧 workflow 刷新 UI。
  if (newsGenerationResult?.changed && generatedNews) p.state.set新闻(generatedNews);
  const newsAfterGeneration = generatedNews ?? p.state.新闻;
  pushQueueTask(p.state, 'news', 'success', {
    detail: newsGenerationResult?.changed
      ? `星际和平周报已更新，当前共 ${newsAfterGeneration.length} 条新闻记录。`
      : newsGenerationResult
        ? '星际和平周报本回合没有可写新闻变化。'
        : '星际和平周报未生成有效结果。',
  }, p.turnCountAtStart, p.queueTasksMirror);
  return { newsAfterGeneration };
}

async function runYitingArchiveJob(p: YitingJobParams): Promise<YitingJobResult> {
  // 忆庭入库始终执行；这里的开关只控制"是否召回并注入正文"。
  const turnRecallEntryResult = await buildYitingArchiveEntry(
    p.turnRecallSource,
    p.memorySettings,
    p.config,
    p.abortController.signal,
    p.memorySettings.忆庭召回API.retryCount ?? 2,
    p.state.deviceSettings.gameSettings.promptModules,
  );
  p.assertWorkflowActive();
  const turnRecallEntry = turnRecallEntryResult.entry;
  const yitingAfterTurnRecall = upsertRecallEntry(p.yitingBase, turnRecallEntry);
  pushQueueTask(p.state, 'memory', 'success', {
    detail: turnRecallEntryResult.usedFallback ? '忆庭纪要已使用主回复小总结入库。' : '忆庭纪要已由独立模型压缩并入库。',
  }, p.turnCountAtStart, p.queueTasksMirror);
  if (!p.yitingEnabled) {
    pushQueueTask(p.state, 'yiting', 'skipped', {
      detail: '忆庭召回已关闭，但入库仍已执行。',
    }, p.turnCountAtStart, p.queueTasksMirror);
  } else if (!p.yitingRecallEnabled) {
    pushQueueTask(p.state, 'yiting', 'skipped', {
      detail: `未到第${p.memorySettings.忆庭召回最早触发回合 + 1}回合，忆庭召回已跳过。`,
    }, p.turnCountAtStart, p.queueTasksMirror);
  } else if (p.yitingPreview?.entries.length) {
    pushQueueTask(p.state, 'yiting', 'success', {
      detail: p.yitingPreview.usedModel ? '忆庭召回已由独立模型完成。' : '忆庭召回已由本地摘要检索完成。',
    }, p.turnCountAtStart, p.queueTasksMirror);
  } else {
    pushQueueTask(p.state, 'yiting', 'success', {
      detail: '忆庭已检索，本回合没有命中相关档案。',
    }, p.turnCountAtStart, p.queueTasksMirror);
  }
  return { yitingAfterTurnRecall };
}

function runPhoneFallbackJob(p: PhoneJobParams): Promise<PhoneJobResult> {
  let phone = p.phoneAfterFallbackSeed;
  if (!p.skipPhoneSeeds && p.state.deviceSettings.gameSettings.手机系统.enabled && p.state.deviceSettings.gameSettings.手机系统.autoGenerateSeeds) {
    const fallbackSeed = buildFallbackPhoneSeed({
      phone,
      npcs: p.npcAfterCompression,
      turn: p.turnCountAtStart + 1,
      userInput: p.userInput,
      body: p.displayText,
      maxSeedsPerTurn: p.state.deviceSettings.gameSettings.手机系统.maxSeedsPerTurn,
      contactCooldownTurns: p.state.deviceSettings.gameSettings.手机系统.contactCooldownTurns,
    });
    if (fallbackSeed) {
      phone = {
        ...phone,
        messageSeeds: [...phone.messageSeeds, fallbackSeed],
        unreadTotal: phone.unreadTotal + 1,
      };
      pushQueueTask(p.state, 'phone', 'success', {
        detail: `已补充低频主动来信种子：${fallbackSeed.title}。`,
      }, p.turnCountAtStart, p.queueTasksMirror);
    }
  }
  return Promise.resolve({ phoneAfterFallbackSeed: phone });
}

async function runNarrativeImageJob(p: NarrativeJobParams): Promise<NarrativeJobResult> {
  let fh = p.finalHistory;
  const 文生图系统 = p.state.deviceSettings.gameSettings.文生图系统 as 文生图系统设置 | undefined;
  const 正文生图设置 = 文生图系统?.正文生图;
  if (!正文生图设置?.enabled || 正文生图设置.mode !== 'auto') return { finalHistoryForSave: fh };
  const targetMessageId = p.aiMsg.id;
  const tokenizerConfig = resolveNarrativeImageTokenizerConfig(p.state, p.config);
  const imageApiConfig = resolveNarrativeImageGenerationApi(p.state);
  if (!tokenizerConfig) {
    pushQueueTask(p.state, 'narrative_image_parse', 'failed', {
      detail: '正文生图词组转化器未配置，无法解析故事快照提示词。',
      targetMessageId,
    }, p.turnCountAtStart, p.queueTasksMirror);
    return { finalHistoryForSave: fh };
  }
  if (!imageApiConfig) {
    pushQueueTask(p.state, 'narrative_image_generate', 'failed', {
      detail: '正文生图主文生图接口未启用，无法生成故事快照。',
      targetMessageId,
    }, p.turnCountAtStart, p.queueTasksMirror);
    return { finalHistoryForSave: fh };
  }
  const generatedImagesResult = await generateNarrativeImagesForMessage({
    state: p.state,
    messageId: targetMessageId,
    body: p.displayText,
    tokenizerConfig,
    imageApiConfig,
    turn: p.turnCountAtStart,
    signal: p.abortController.signal,
  });
  p.assertWorkflowActive();
  const generatedImages = generatedImagesResult.images;
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
  return { finalHistoryForSave: fh, 相册After: generatedImagesResult.相册 };
}

// ---- 主阶段函数 ----

export async function stage11_backgroundJobs(
  ctx: TurnContext,
  d: TurnDeltas,
): Promise<Partial<TurnDeltas>> {
  const { state, userInput, effectiveWorld, config, abortController, assertWorkflowActive, isCurrentWorkflow, turnCountAtStart, queueTasksMirror, phoneAtStart } = ctx;
  devLog('stage', 'stage11_backgroundJobs.enter', { turn: turnCountAtStart });
  const displayText = d.displayText as string;
  const finalHistory = d.finalHistory as 聊天消息[];
  const npcAfterCompression = d.npcAfterCompression as NonNullable<TurnDeltas['npcAfterCompression']>;
  const yitingWithCompression = d.yitingWithCompression as 忆庭系统;
  const variableOverrides = d.variableOverrides as VariableOverridesForBackground | null | undefined;
  const storyWeavingForSave = d.storyWeavingForSave ?? state.剧情编织;
  const aiMsg = d.aiMsg as 聊天消息;
  const parsedForDisplay = d.parsedForDisplay as NonNullable<TurnDeltas['parsedForDisplay']>;
  const openingNewsPreprocessed = d.openingNewsPreprocessed ?? false;
  const openingNewsForSave = d.openingNewsForSave ?? null;
  const yitingPreview = d.yitingPreview as YitingPreviewForBackground | null | undefined;
  const yitingEnabled = d.yitingEnabled ?? false;
  const yitingRecallEnabled = d.yitingRecallEnabled ?? false;
  const storyProgressMemoryLine = d.storyProgressMemoryLine ?? '';
  const isOpeningSystemTrigger = turnCountAtStart === 1 && userInput.startsWith('[系统]');
  const memorySettings = (state.deviceSettings.gameSettings.记忆系统 as 记忆系统设置 | undefined) ?? 创建默认记忆系统设置();

  // 阶段 11 前置计算
  const newsSettings = state.deviceSettings.gameSettings.新闻系统 as 星际和平周报设置 | undefined;
  const newsEnabled = Boolean(newsSettings?.enabled && newsSettings.autoGenerate);
  const newsInterval = Math.max(5, Math.min(10, Math.trunc(newsSettings?.generateIntervalTurns ?? 5) || 5));
  const newsTurn = turnCountAtStart + 1;
  const shouldRunOpeningNews = isOpeningSystemTrigger && newsEnabled;
  const shouldRunNews = newsEnabled && d.isPathAwakeningTurn !== true && ((shouldRunOpeningNews && !openingNewsPreprocessed) || (newsTurn > 0 && newsTurn % newsInterval === 0));
  const yitingBase = mergeYitingSystems(yitingWithCompression, variableOverrides?.忆庭);
  const turnRecallSource = {
    turn: turnCountAtStart,
    userInput,
    body: displayText,
    memory: parsedForDisplay.memory,
    worldEvents: storyProgressMemoryLine
      ? [...parsedForDisplay.worldEvents, storyProgressMemoryLine]
      : parsedForDisplay.worldEvents,
    actionOptions: parsedForDisplay.actionOptions,
    gameTime: effectiveWorld.当前日期 || undefined,
    gameClock: effectiveWorld.当前时间 || undefined,
    location: effectiveWorld.当前地点 || undefined,
  };

  const phoneAfterFallbackSeedBase = variableOverrides?.手机 ?? phoneAtStart;

  // 四个参数化任务
  const newsParams: NewsJobParams = {
    newsSettings, shouldRunNews, newsInterval, shouldRunOpeningNews,
    state, displayText, userInput, finalHistory,
    storyWeavingForSave, abortController, isCurrentWorkflow, assertWorkflowActive, turnCountAtStart, queueTasksMirror,
  };
  const yitingParams: YitingJobParams = {
    turnRecallSource, memorySettings, config, abortController, state,
    yitingBase, yitingPreview: yitingPreview ?? null, yitingEnabled,
    yitingRecallEnabled, assertWorkflowActive, turnCountAtStart, queueTasksMirror,
  };
  const phoneParams: PhoneJobParams = {
    state, phoneAfterFallbackSeed: phoneAfterFallbackSeedBase, npcAfterCompression, userInput, displayText,
    skipPhoneSeeds: d.isPathAwakeningTurn === true, turnCountAtStart, queueTasksMirror,
  };
  const narrativeParams: NarrativeJobParams = {
    state, aiMsg, displayText, config, abortController, finalHistory,
    assertWorkflowActive, turnCountAtStart, queueTasksMirror,
  };

  const backgroundTaskMode = state.deviceSettings.gameSettings.backgroundTaskMode as TurnContext['state']['deviceSettings']['gameSettings']['backgroundTaskMode'] | undefined;
  let newsAfterGeneration: 新闻条目[] | null;
  let yitingAfterTurnRecall: 忆庭系统;
  let phoneAfterFallbackSeed: 手机系统;
  let finalHistoryForSave: 聊天消息[];
  let 相册After: 相册系统 | undefined;
  if ((backgroundTaskMode ?? 'sequential') === 'parallel') {
    const [newsRes, yitingRes, phoneRes, narrativeRes] = await Promise.all([
      runNewsBackgroundJob(newsParams),
      runYitingArchiveJob(yitingParams),
      runPhoneFallbackJob(phoneParams),
      runNarrativeImageJob(narrativeParams),
    ]);
    newsAfterGeneration = newsRes.newsAfterGeneration ?? openingNewsForSave;
    yitingAfterTurnRecall = yitingRes.yitingAfterTurnRecall;
    phoneAfterFallbackSeed = phoneRes.phoneAfterFallbackSeed;
    finalHistoryForSave = narrativeRes.finalHistoryForSave;
    相册After = narrativeRes.相册After;
  } else {
    const newsRes = await runNewsBackgroundJob(newsParams);
    newsAfterGeneration = newsRes.newsAfterGeneration ?? openingNewsForSave;
    const yitingRes = await runYitingArchiveJob(yitingParams);
    yitingAfterTurnRecall = yitingRes.yitingAfterTurnRecall;
    const phoneRes = await runPhoneFallbackJob(phoneParams);
    phoneAfterFallbackSeed = phoneRes.phoneAfterFallbackSeed;
    const narrativeRes = await runNarrativeImageJob(narrativeParams);
    finalHistoryForSave = narrativeRes.finalHistoryForSave;
    相册After = narrativeRes.相册After;
  }

  devLog('stage', 'stage11_backgroundJobs.exit', {
    turn: turnCountAtStart,
    outputs: ['newsAfterGeneration', 'yitingAfterTurnRecall', 'phoneAfterFallbackSeed', 'finalHistoryForSave', '相册After'],
  });
  return {
    newsAfterGeneration,
    yitingAfterTurnRecall,
    phoneAfterFallbackSeed,
    finalHistoryForSave,
    相册After,
  };
}
