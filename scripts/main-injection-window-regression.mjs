import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`);
    process.exit(1);
  }
}

const historyWindow = read('hooks/useGame/historyWindow.ts');
const sendWorkflow = read('hooks/useGame/sendWorkflow.ts');
const contextSnapshot = read('hooks/useGame/contextSnapshot.ts');
const systemPromptBuilder = read('hooks/useGame/systemPromptBuilder.ts');

assert(!historyWindow.includes('MAIN_HISTORY_LIMIT_WITH_MEMORY'), 'legacy 档（20 条原始历史）必须已移除——历史 messages 含标签会污染上下文，对标参考项目无历史消息块。');
assert(historyWindow.includes('MAIN_HISTORY_LIMIT_CONSERVATIVE = 4'), '保守式：原始历史保留最近 2 回合（4 条消息）。');
assert(historyWindow.includes('MAIN_HISTORY_LIMIT_MINIMAL = 0'), '精简式：原始历史保留 0 条（只留即时剧情回顾+当前输入）。');
assert(historyWindow.includes("mode === 'minimal'"), '主剧情历史窗口必须按两档模式分档。');
assert(historyWindow.includes("主剧情历史模式 ?? 'minimal'"), '旧存档缺主剧情历史模式时必须回退精简式（即时剧情回顾已承载最近上下文）。');
assert(historyWindow.includes('anchorIndex < 0 ? meaningful'), '即时剧情回顾必须支持「AI 回合数 ≤ 窗口时返回全部历史」边界（对标参考项目）。');
assert(historyWindow.includes("msg.parsedResponse?.body?.trim()"), '即时剧情回顾的 assistant 有效性判定必须以正文 body 为准（content 占位/为空时不丢回合）。');
assert(historyWindow.includes('MAIN_IMMEDIATE_STORY_REVIEW_TURNS = 9'), '即时剧情回顾必须覆盖最近 9 个已完成 AI 回合（对标既定方案）。');
assert(historyWindow.includes('maxTurns = MAIN_IMMEDIATE_STORY_REVIEW_TURNS'), '即时剧情回顾默认必须读取统一常量。');
assert(historyWindow.includes('buildLeanAssistantHistoryContent'), '必须提供主剧情历史 assistant 消息瘦身函数。');
assert(historyWindow.includes('function hasMeaningfulText'), '即时剧情回顾必须过滤“无/暂无”等占位结构化文本。');
assert(historyWindow.includes('# 历史 assistant 压缩摘要'), '瘦身后的 assistant 历史必须使用中性历史摘要标题，避免伪装成本回合 thinking。');
assert(historyWindow.includes('<正文>'), '瘦身后的 assistant 历史必须用标准 <正文> 协议保留正文锚点。');
assert(historyWindow.includes('normalizeHistoryBodyForPrompt'), '瘦身后的 assistant 历史正文必须补齐旁白前缀，避免污染后续格式。');
assert(historyWindow.includes('禁止把历史回合号、历史压缩说明或历史标签照抄进新正文'), '瘦身后的 assistant 历史必须明确禁止照抄历史元标签。');
assert(!historyWindow.includes('Step0: 历史回合瘦身'), '瘦身后的 assistant 历史不得再伪造 Step0 thinking，避免污染本回合思维链。');
assert(!historyWindow.includes('【历史时间】'), '瘦身后的 assistant 历史不得使用会被正文渲染成角色的【历史时间】标签。');
assert(!historyWindow.includes('【历史正文】'), '瘦身后的 assistant 历史不得使用会被正文渲染成角色的【历史正文】标签。');
assert(!historyWindow.includes('【历史短期记忆】'), '瘦身后的 assistant 历史不得重复上传短期记忆。');
assert(!historyWindow.includes('【历史变量草稿】'), '瘦身后的 assistant 历史不得重复上传变量草稿。');
assert(!historyWindow.includes('【历史剧情规划】'), '瘦身后的 assistant 历史不得重复上传剧情规划。');
assert(historyWindow.includes('玩家：'), '即时剧情回顾必须保留玩家输入原文行（剧本化回顾）。');
assert(historyWindow.includes('normalizeHistoryBodyForPrompt'), '即时剧情回顾必须按行规范化 AI 正文（裸行补【旁白】）。');
assert(historyWindow.includes('【上回合AI剧情规划】'), '即时剧情回顾必须在最后一条 AI 回合后追加剧情规划。');
assert(historyWindow.includes('lastPlannableIndex'), '即时剧情回顾必须只保留最后一条 AI 回合的规划。');
// 回顾函数体必须提取 storyPlan（仅最后一条 AI 回合，供【上回合AI剧情规划】使用）
const reviewFn = historyWindow.slice(historyWindow.indexOf('export function buildImmediateStoryReview'), historyWindow.indexOf('export function extractRecentStoryPlanSnippets'));
assert(reviewFn.includes('parsed?.storyPlan'), '即时回顾函数体必须提取最后一条 AI 回合的剧情规划（对标参考项目 formatHistoryToScript）。');
assert(!reviewFn.includes('AI｜小结') && !reviewFn.includes('正文锚点：') && !reviewFn.includes('动态世界：'), '即时剧情回顾不得再使用小结/动态世界/正文锚点三段式。');

assert(sendWorkflow.includes('buildImmediateStoryReview(updatedHistory, Math.max(1, (state.gameSettings.记忆系统?.即时转短期阈值 ?? 10) - 1))'), '主剧情真实请求必须使用配置推导的即时剧情回顾窗口（N-1）。');
assert(!sendWorkflow.includes('buildImmediateStoryReview(updatedHistory, 12)'), '主剧情真实请求不得继续固定 12 条即时剧情回顾。');
assert(sendWorkflow.includes('buildLeanAssistantHistoryContent(msg)'), '主剧情原始 assistant messages 必须先瘦身，避免和即时剧情回顾重复。');
assert(!sendWorkflow.includes("创建聊天消息('assistant', msg.content)"), '主剧情不得继续直接上传 assistant raw content。');
assert(sendWorkflow.includes('stripLeakedHistoryMetaFromBody'), '主剧情落库前必须清理模型照抄的历史元标签。');
assert(sendWorkflow.includes("tag === '历史时间'"), '模型照抄【历史时间】时必须从正文中移除。');
assert(contextSnapshot.includes('buildImmediateStoryReview(state.chatHistory, Math.max(1, (state.gameSettings.记忆系统?.即时转短期阈值 ?? 10) - 1))'), '上下文预览必须使用同一即时剧情回顾窗口。');
assert(!contextSnapshot.includes('buildImmediateStoryReview(state.chatHistory, 12)'), '上下文预览不得继续固定 12 条即时剧情回顾。');

assert(sendWorkflow.includes('getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆)'), '主剧情 messages 必须继续经过统一历史窗口函数。');
assert(systemPromptBuilder.includes('# 即时剧情回顾') || sendWorkflow.includes('# 即时剧情回顾'), '主剧情必须保留即时剧情回顾注入。');
assert(!systemPromptBuilder.includes('记忆｜即时记忆'), '主剧情不得重新注入即时记忆。');

console.log('✓ main injection window regression passed');
