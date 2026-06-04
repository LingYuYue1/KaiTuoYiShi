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

assert(historyWindow.includes('MAIN_HISTORY_LIMIT_WITH_MEMORY = 20'), '有短中长期记忆时原始 messages 窗口应接近墨色 10 回合，即约 20 条消息。');
assert(historyWindow.includes('MAIN_HISTORY_LIMIT_WITHOUT_MEMORY = 20'), '无短中长期记忆时原始 messages 窗口也应保留约 10 回合承接。');
assert(historyWindow.includes('MAIN_IMMEDIATE_STORY_REVIEW_LIMIT = 20'), '即时剧情回顾必须覆盖 20 条近期消息。');
assert(historyWindow.includes('maxMessages = MAIN_IMMEDIATE_STORY_REVIEW_LIMIT'), '即时剧情回顾默认必须读取统一常量。');
assert(historyWindow.includes('buildLeanAssistantHistoryContent'), '必须提供主剧情历史 assistant 消息瘦身函数。');
assert(historyWindow.includes('function hasMeaningfulText'), '即时剧情回顾必须过滤“无/暂无”等占位结构化文本。');
assert(historyWindow.includes('【历史正文】'), '瘦身后的 assistant 历史必须保留正文锚点。');
assert(!historyWindow.includes('【历史短期记忆】'), '瘦身后的 assistant 历史不得重复上传短期记忆。');
assert(!historyWindow.includes('【历史变量草稿】'), '瘦身后的 assistant 历史不得重复上传变量草稿。');
assert(!historyWindow.includes('【历史剧情规划】'), '瘦身后的 assistant 历史不得重复上传剧情规划。');
assert(historyWindow.includes('needsBodyFallback = !memory && !events && !storyPlan'), '即时剧情回顾应在缺少结构化摘要时才回退正文摘录。');
assert(historyWindow.includes('正文摘录：'), '即时剧情回顾正文内容只能作为兜底摘录。');
assert(!historyWindow.includes('正文：${compactText(body, 320)}'), '即时剧情回顾不得继续默认重复上传 assistant 正文。');

assert(sendWorkflow.includes('buildImmediateStoryReview(updatedHistory)'), '主剧情真实请求必须使用默认即时剧情回顾窗口。');
assert(!sendWorkflow.includes('buildImmediateStoryReview(updatedHistory, 12)'), '主剧情真实请求不得继续固定 12 条即时剧情回顾。');
assert(sendWorkflow.includes('buildLeanAssistantHistoryContent(msg)'), '主剧情原始 assistant messages 必须先瘦身，避免和即时剧情回顾重复。');
assert(!sendWorkflow.includes("创建聊天消息('assistant', msg.content)"), '主剧情不得继续直接上传 assistant raw content。');
assert(contextSnapshot.includes('buildImmediateStoryReview(state.chatHistory)'), '上下文预览必须使用同一即时剧情回顾窗口。');
assert(!contextSnapshot.includes('buildImmediateStoryReview(state.chatHistory, 12)'), '上下文预览不得继续固定 12 条即时剧情回顾。');

assert(sendWorkflow.includes('getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆)'), '主剧情 messages 必须继续经过统一历史窗口函数。');
assert(systemPromptBuilder.includes('# 即时剧情回顾') || sendWorkflow.includes('# 即时剧情回顾'), '主剧情必须保留即时剧情回顾注入。');
assert(!systemPromptBuilder.includes('记忆｜即时记忆'), '主剧情不得重新注入即时记忆。');

console.log('✓ main injection window regression passed');
