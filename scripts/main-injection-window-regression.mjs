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

assert(historyWindow.includes('MAIN_HISTORY_LIMIT_WITH_MEMORY = 20'), '有短中长期记忆时原始 messages 窗口应接近基准 10 回合，即约 20 条消息。');
assert(historyWindow.includes('MAIN_HISTORY_LIMIT_WITHOUT_MEMORY = 20'), '无短中长期记忆时原始 messages 窗口也应保留约 10 回合承接。');
assert(historyWindow.includes('MAIN_IMMEDIATE_STORY_REVIEW_LIMIT = 20'), '即时剧情回顾必须覆盖 20 条近期消息。');
assert(historyWindow.includes('maxMessages = MAIN_IMMEDIATE_STORY_REVIEW_LIMIT'), '即时剧情回顾默认必须读取统一常量。');
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
assert(historyWindow.includes('needsBodyFallback = !memory && !events'), '即时剧情回顾应识别缺少结构化摘要的兜底场景（剧情规划字段已移除）。');
// 即时回顾函数体内不得有 storyPlan 提取（buildMainRecallQuery 的"剧情规划："属于召回 query，不受此约束）
const reviewFn = historyWindow.slice(historyWindow.indexOf('export function buildImmediateStoryReview'), historyWindow.indexOf('export function extractRecentStoryPlanSnippets'));
assert(!reviewFn.includes('parsed?.storyPlan') && !reviewFn.includes('剧情规划：'), '即时回顾函数体不得再提取剧情规划字段。');
assert(historyWindow.includes('正文锚点：'), '即时剧情回顾必须保留短正文锚点，避免摘要遗漏导致 NPC 近回合失忆。');
assert(historyWindow.includes('needsBodyFallback ? 260 : 180'), '即时剧情回顾有结构化摘要时也应保留更短正文锚点。');
assert(!historyWindow.includes('const body = needsBodyFallback ?'), '即时剧情回顾不得只在兜底时才读取正文。');
assert(!historyWindow.includes('正文：${compactText(body, 320)}'), '即时剧情回顾不得继续默认重复上传 assistant 正文。');

assert(sendWorkflow.includes('buildImmediateStoryReview(updatedHistory)'), '主剧情真实请求必须使用默认即时剧情回顾窗口。');
assert(!sendWorkflow.includes('buildImmediateStoryReview(updatedHistory, 12)'), '主剧情真实请求不得继续固定 12 条即时剧情回顾。');
assert(sendWorkflow.includes('buildLeanAssistantHistoryContent(msg)'), '主剧情原始 assistant messages 必须先瘦身，避免和即时剧情回顾重复。');
assert(!sendWorkflow.includes("创建聊天消息('assistant', msg.content)"), '主剧情不得继续直接上传 assistant raw content。');
assert(sendWorkflow.includes('stripLeakedHistoryMetaFromBody'), '主剧情落库前必须清理模型照抄的历史元标签。');
assert(sendWorkflow.includes("tag === '历史时间'"), '模型照抄【历史时间】时必须从正文中移除。');
assert(contextSnapshot.includes('buildImmediateStoryReview(state.chatHistory)'), '上下文预览必须使用同一即时剧情回顾窗口。');
assert(!contextSnapshot.includes('buildImmediateStoryReview(state.chatHistory, 12)'), '上下文预览不得继续固定 12 条即时剧情回顾。');

assert(sendWorkflow.includes('getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆)'), '主剧情 messages 必须继续经过统一历史窗口函数。');
assert(systemPromptBuilder.includes('# 即时剧情回顾') || sendWorkflow.includes('# 即时剧情回顾'), '主剧情必须保留即时剧情回顾注入。');
assert(!systemPromptBuilder.includes('记忆｜即时记忆'), '主剧情不得重新注入即时记忆。');

console.log('✓ main injection window regression passed');
