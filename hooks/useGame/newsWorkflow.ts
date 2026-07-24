import type { UseGameStateReturn } from '@/hooks/useGameState';
import { callNewsModel, applyNewsGenerationResult, hasNewsGenerationChanges } from '@/services/ai/newsModel';
import type { 新闻条目 } from '@/models/news';
import type { API配置项 } from '@/models/settings';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 归一化世界状态 } from '@/models/world';

interface NewsGenerationParams {
  state: UseGameStateReturn;
  mainBody: string;
  userInput: string;
  recentTurns?: string[];
  storyWeavingSnapshot?: 剧情编织系统;
  signal?: AbortSignal;
  shouldCommit?: () => boolean;
}

export interface NewsGenerationStepResult {
  news: 新闻条目[];
  changed: boolean;
  summary?: string;
}

export async function runNewsGenerationStep(params: NewsGenerationParams): Promise<NewsGenerationStepResult | null> {
  const { state } = params;
  const newsSettings = state.gameSettings.新闻系统;
  if (!newsSettings?.enabled || !newsSettings.autoGenerate) return null;

  const api = newsSettings.api;
  const mainConfig = state.apiSettings.configs.find((c) => c.id === state.apiSettings.activeConfigId)
    ?? state.apiSettings.configs[0];
  if (!mainConfig && (!api.baseUrl.trim() || !api.apiKey.trim() || !api.model.trim())) return null;

  const config: API配置项 = {
    id: '__news_system__',
    name: '星际和平周报',
    provider: api.provider || mainConfig?.provider || 'openai_compatible',
    baseUrl: api.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: api.apiKey.trim() || mainConfig?.apiKey || '',
    model: api.model.trim() || mainConfig?.model || '',
    maxTokens: api.maxTokens ?? mainConfig?.maxTokens,
    temperature: api.temperature ?? mainConfig?.temperature,
    retryCount: api.retryCount ?? mainConfig?.retryCount ?? 2,
    enableClaudeMode: state.gameSettings.enableClaudeMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    const result = await callNewsModel({
      config,
      turnCount: state.turnCount + 1,
      userInput: params.userInput,
      body: params.mainBody,
      recentTurns: params.recentTurns,
      traveler: state.旅人,
      world: 归一化世界状态(state.世界),
      news: state.新闻,
      npcRecords: state.NPC,
      plotNodes: state.剧情,
      storyWeaving: params.storyWeavingSnapshot ?? state.剧情编织,
      maxNewEntriesPerTurn: newsSettings.maxNewEntriesPerTurn,
      promptModules: state.gameSettings.promptModules,
      signal: params.signal,
      retryCount: newsSettings.api.retryCount ?? 2,
    });

    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;
    const nextNews = applyNewsGenerationResult(state.新闻, result.parsed);
    const changed = hasNewsGenerationChanges(result.parsed) && !areNewsListsEquivalent(state.新闻, nextNews);
    if (changed && !params.signal?.aborted && params.shouldCommit?.() !== false) {
      state.set新闻(nextNews);
    }
    return {
      news: nextNews,
      changed,
      summary: result.parsed.说明,
    };
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.warn('[news-model] 生成失败：', err);
    }
    return null;
  }
}

function areNewsListsEquivalent(left: 新闻条目[], right: 新闻条目[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => areNewsEntriesEquivalent(item, right[index]));
}

function areNewsEntriesEquivalent(left: 新闻条目, right: 新闻条目 | undefined): boolean {
  if (!right) return false;
  return (
    left.id === right.id &&
    left.类目 === right.类目 &&
    left.状态 === right.状态 &&
    left.回合 === right.回合 &&
    left.标题 === right.标题 &&
    left.正文 === right.正文 &&
    left.重要 === right.重要 &&
    left.关联剧情系列ID === right.关联剧情系列ID &&
    left.关联剧情分段ID === right.关联剧情分段ID &&
    JSON.stringify(left.组织标签 ?? []) === JSON.stringify(right.组织标签 ?? []) &&
    JSON.stringify(left.关联系统 ?? []) === JSON.stringify(right.关联系统 ?? [])
  );
}
