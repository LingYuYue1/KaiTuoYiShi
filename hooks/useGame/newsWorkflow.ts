import type { UseGameStateReturn } from '@/hooks/useGameState';
import { callNewsModel, applyNewsGenerationResult, hasNewsGenerationChanges, type NewsModelRequest, type NewsModelResult } from '@/services/ai/newsModel';
import type { 新闻条目 } from '@/models/news';
import type { API配置项 } from '@/models/settings';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { StoryFactConsumerView } from '@/services/storyRuntime/storyFactConsumerView';
import { formatFactBrief } from '@/services/storyRuntime/storyFactConsumerView';
import { 归一化世界状态 } from '@/models/world';

interface NewsGenerationParams {
  state: UseGameStateReturn;
  mainBody: string;
  userInput: string;
  recentTurns?: string[];
  storyWeavingSnapshot?: 剧情编织系统;
  /** R3：统一事实视图——新闻只能根据已提交的 public/broadcast 事实生成已发生新闻；scheduled 事件最多作为预告。 */
  factView?: StoryFactConsumerView | null;
  signal?: AbortSignal;
  shouldCommit?: () => boolean;
  /** 测试注入：替代真实新闻模型调用（返回 NewsModelResult；抛错模拟 API 失败）。 */
  callModelOverride?: (request: NewsModelRequest) => Promise<NewsModelResult>;
}

export interface NewsGenerationStepResult {
  news: 新闻条目[];
  changed: boolean;
  summary?: string;
}

/** R3：把统一事实视图格式化为新闻窗口素材——已提交公共事实 + scheduled 预告（不得写成已完成）。 */
export function buildFactViewNewsBrief(factView: StoryFactConsumerView | null | undefined): string {
  if (!factView) return '';
  const reportable = factView.reportableFacts.slice(-6).map((fact) => `- [已发生] ${formatFactBrief(fact)}`);
  const previews = factView.scheduledEventPreviews.slice(0, 4).map((event) => `- [预告] ${event.eventInstanceId}（尚未发生，只能作为预告，不能写成已完成）`);
  if (!reportable.length && !previews.length) return '';
  return [
    '## 已提交公共事实（唯一事实来源）',
    '以下才是已提交的公共/广播事实，新闻报道必须基于它们；世界.全局事件 只是兼容显示标签，不是事实。',
    ...reportable,
    ...previews,
  ].join('\n');
}

export async function runNewsGenerationStep(params: NewsGenerationParams): Promise<NewsGenerationStepResult | null> {
  const { state } = params;
  const newsSettings = state.gameSettings.新闻系统;
  if (!newsSettings?.enabled || !newsSettings.autoGenerate) return null;

  const factConstrained = params.factView !== undefined && params.factView !== null;
  const factBrief = buildFactViewNewsBrief(params.factView);
  if (factConstrained && !factBrief) {
    return { news: state.新闻, changed: false, summary: '本回合没有新的公共事实或可预告事件。' };
  }

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
    enableClaudeMode: state.gameSettings.enableClaudeMode === true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    const request: NewsModelRequest = {
      config,
      turnCount: state.turnCount + 1,
      userInput: factConstrained ? '' : params.userInput,
      body: factConstrained ? '' : params.mainBody,
      recentTurns: factConstrained ? undefined : params.recentTurns,
      factSourceBrief: factConstrained ? factBrief : undefined,
      traveler: state.旅人,
      world: 归一化世界状态(state.世界),
      news: state.新闻,
      npcRecords: factConstrained ? [] : state.NPC,
      plotNodes: factConstrained ? [] : state.剧情,
      storyWeaving: factConstrained ? undefined : (params.storyWeavingSnapshot ?? state.剧情编织),
      maxNewEntriesPerTurn: newsSettings.maxNewEntriesPerTurn,
      promptModules: state.gameSettings.promptModules,
      signal: params.signal,
      retryCount: newsSettings.api.retryCount ?? 2,
    };
    const result = params.callModelOverride
      ? await params.callModelOverride(request)
      : await callNewsModel(request);

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
    // R3 失败边界：新闻生成失败在新闻任务内部隔离——已提交剧情/世界事实不回滚，新闻保持旧可信状态。
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
