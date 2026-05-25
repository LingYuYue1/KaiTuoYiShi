import type { UseGameStateReturn } from '@/hooks/useGameState';
import { callNewsModel, applyNewsGenerationResult } from '@/services/ai/newsModel';
import type { 新闻条目 } from '@/models/news';
import type { API配置项 } from '@/models/settings';
import { 归一化世界状态 } from '@/models/world';

interface NewsGenerationParams {
  state: UseGameStateReturn;
  mainBody: string;
  userInput: string;
  recentTurns?: string[];
  signal?: AbortSignal;
}

export async function runNewsGenerationStep(params: NewsGenerationParams): Promise<新闻条目[] | null> {
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
    provider: api.provider || mainConfig?.provider || 'openai',
    baseUrl: api.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: api.apiKey.trim() || mainConfig?.apiKey || '',
    model: api.model.trim() || mainConfig?.model || '',
    maxTokens: api.maxTokens ?? mainConfig?.maxTokens,
    temperature: api.temperature ?? mainConfig?.temperature,
    retryCount: api.retryCount ?? mainConfig?.retryCount ?? 2,
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
      storyWeaving: state.剧情编织,
      signal: params.signal,
      retryCount: newsSettings.api.retryCount ?? 2,
    });

    const nextNews = applyNewsGenerationResult(state.新闻, result.parsed);
    if (nextNews !== state.新闻) {
      state.set新闻(nextNews);
    }
    return nextNews;
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.warn('[news-model] 生成失败：', err);
    }
    return null;
  }
}
