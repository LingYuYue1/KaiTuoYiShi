import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`news-update regression failed: ${message}`);
    process.exit(1);
  }
}

const newsModel = fs.readFileSync('services/ai/newsModel.ts', 'utf8');
const newsWorkflow = fs.readFileSync('hooks/useGame/newsWorkflow.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const newsPanel = fs.readFileSync('components/features/GameSystems/NewsPanel.tsx', 'utf8');
const newsTypes = fs.readFileSync('models/news.ts', 'utf8');

assert(newsTypes.includes('export function getNewsIssueNumber'), '新闻期号应有公共计算函数。');
assert(newsModel.includes('getNewsIssueNumber(request.turnCount)'), '新闻模型提示词必须使用公共期号函数。');
assert(newsPanel.includes('getNewsIssueNumber(turnCount)'), '新闻面板必须使用公共期号函数。');
assert(!newsModel.includes('Math.floor(request.turnCount / 10)'), '新闻模型不得使用旧的 floor(turn/10) 期号。');

assert(newsModel.includes('maxNewEntriesPerTurn?: number'), '新闻模型请求必须接收最大新增条数。');
assert(newsWorkflow.includes('maxNewEntriesPerTurn: newsSettings.maxNewEntriesPerTurn'), '新闻工作流必须把设置里的最大新增条数传给模型。');
assert(newsModel.includes('最多新增 ${maxNewEntries} 条新闻') || newsModel.includes('最多新增 ${normalizeMaxNewEntries(request.maxNewEntriesPerTurn)} 条'), '新闻提示词不得继续写死最多新增 3 条。');

assert(newsWorkflow.includes('hasNewsGenerationChanges(result.parsed) && !areNewsListsEquivalent(state.新闻, nextNews)'), '新闻工作流必须区分模型空补丁和真实内容变更。');
assert(newsWorkflow.includes('if (changed && !params.signal?.aborted'), '新闻未发生真实变更时不得写回旧数组。');
assert(sendWorkflow.includes('星际和平周报本回合没有可写新闻变化'), '队列提示必须明确空更新，而不是伪装成检查完成。');
assert(!sendWorkflow.includes("detail: '星际和平周报检查完成。'"), '新闻空更新不得继续显示泛化成功文案。');

assert(sendWorkflow.includes('let openingNewsForSave: 新闻条目[] | null = null'), '开局新闻预处理结果必须参与本回合保存。');
assert(sendWorkflow.includes('let newsAfterGeneration: 新闻条目[] | null = openingNewsForSave'), '常规新闻跳过时应保留开局预处理新闻用于保存。');

console.log('news-update regression passed.');
