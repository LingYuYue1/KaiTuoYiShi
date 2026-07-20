import type { TurnExecutionState } from '@/src/kernel/application/turn/turnExecutionState';
import type { PreparedTurnScope } from '@/src/kernel/application/turn/stages/prepareTurnScope';
import type { 新闻条目 } from '@/models/news';
import { pushQueueTask, formatOriginalProtagonistForOpening } from '@/src/kernel/workflows/turnHelpers';
import { runNewsGenerationStep } from '@/src/kernel/workflows/newsWorkflow';

export type OpeningNewsResult = Readonly<{
  newsForPrompt: 新闻条目[];
  openingNewsForSave: 新闻条目[] | null;
  preprocessed: boolean;
}>;

/** Must be called inside the try block that owns state mutable view and abort checks. */
export async function resolveOpeningNews(
  state: any,
  scope: PreparedTurnScope,
  userInput: string,
  signal: AbortSignal,
  isCurrentWorkflow: () => boolean,
  assertWorkflowActive: () => void,
): Promise<OpeningNewsResult> {
  if (!scope.isOpeningSystemTrigger) return { newsForPrompt: state.新闻, openingNewsForSave: null, preprocessed: false };
  if (!state.gameSettings.新闻系统?.enabled || !state.gameSettings.新闻系统?.autoGenerate) {
    return { newsForPrompt: state.新闻, openingNewsForSave: null, preprocessed: false };
  }
  pushQueueTask(state, 'news', 'pending', {
    detail: '开局前正在先处理一次星际和平周报，用作首回合世界背景。',
    cancellable: true,
  });
  const effectiveWorld = scope.effectiveWorld;
  const openingProtagonist = formatOriginalProtagonistForOpening(effectiveWorld.原著主角);
  const openingArchive = effectiveWorld.开局档案;
  const openingPressure = openingArchive?.整理档案?.特别要求?.length
    ? openingArchive.整理档案.特别要求.join('；')
    : openingArchive?.章节参考说明 || effectiveWorld.当前地点 || '当前开局地区';
  const openingNewsBody = [
    `开局初始化：当前开局为${openingArchive?.地区名称 ?? effectiveWorld.当前地点 ?? '未知地区'}「${openingArchive?.章节锚点名称 ?? effectiveWorld.起航之地ID ?? '未命名章节'}」。`,
    `章节参考：${openingArchive?.章节参考说明 ?? '按当前开局档案和世界状态生成首回合世界事件苗头。'}`,
    `开局压力：${openingPressure}`,
    openingArchive?.玩家介入原文 ? `玩家介入：${openingArchive.玩家介入原文}` : '',
    `原著主角配置：${openingProtagonist}`,
  ].filter(Boolean).join('\n');
  const preNews = await runNewsGenerationStep({
    gameSettings: scope.gameSettings,
    state,
    mainBody: openingNewsBody,
    userInput,
    recentTurns: [`- 系统：开局初始化\n  正文：${openingArchive?.地区名称 ?? effectiveWorld.当前地点 ?? '当前地区'}「${openingArchive?.章节锚点名称 ?? '当前开局'}」即将开始，新闻系统先生成可供首回合参考的世界事件苗头。`],
    signal,
    shouldCommit: isCurrentWorkflow,
  });
  if (!preNews) throw new Error('Opening news generation was enabled but did not execute');
  assertWorkflowActive();
  pushQueueTask(state, 'news', 'success', {
    detail: preNews.changed
      ? `开局新闻预处理完成，当前 ${preNews.news.length} 条新闻记录。`
      : '开局新闻预处理完成，但本轮没有可写新闻变化。',
  });
  return { newsForPrompt: preNews.news, openingNewsForSave: preNews.news, preprocessed: true };
}
