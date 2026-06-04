import fs from 'node:fs';

const builder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const contextSnapshot = fs.readFileSync('hooks/useGame/contextSnapshot.ts', 'utf8');
const mainCot = fs.readFileSync('prompts/cot/mainCot.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const variableExecutor = fs.readFileSync('utils/variableExecutor.ts', 'utf8');
const worldEvents = fs.readFileSync('utils/worldEvents.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(builder.includes('function buildResponseLengthSection'), 'systemPromptBuilder 必须有不可关闭的正文字数硬约束段。');
assert(builder.includes('# 正文字数硬约束'), '正文字数硬约束必须有独立标题，方便上下文预览定位。');
assert(builder.includes('settings.wordCountTarget'), '正文字数硬约束必须读取 settings.wordCountTarget。');
assert(builder.includes('当前游戏设置的正文字数目标：不少于'), '硬约束必须明确不少于当前设置字数。');
assert(builder.includes('优先于可编辑提示词模块'), '硬约束必须覆盖旧模块/自定义模块的冲突字数描述。');
assert(builder.includes('const sceneFromWorldbook = buildSceneSection(worldState);'), '主剧情必须显式构建当前场景区块。');
assert(builder.indexOf('const timeAnchor = buildCurrentTimeAnchorSection(worldState);') < builder.indexOf('const sceneFromWorldbook = buildSceneSection(worldState);'), '当前场景必须紧跟时间锚点之后注入。');
assert(builder.includes('RECENT_WORLD_EVENT_PROMPT_LIMIT = 12'), '近期事件必须有注入上限，避免世界全局事件无限膨胀。');
assert(builder.includes('function buildRecentWorldEventsSection'), '近期事件必须通过统一瘦身函数注入。');
assert(builder.includes('normalizeWorldEventFingerprint'), '近期事件必须做文本指纹去重。');
assert(!builder.includes('worldState.全局事件.map((e) => `- ${e}`).join'), '近期事件不得继续全量注入世界全局事件。');
assert(worldEvents.includes('WORLD_EVENT_STORAGE_LIMIT = 30'), '世界全局事件存档层必须默认只保留最近 30 条。');
assert(worldEvents.includes('function compactWorldEvents'), '世界全局事件必须有统一压缩/去重函数。');
assert(sendWorkflow.includes('appendWorldEvents(worldAfter.全局事件, parsedForDisplay.worldEvents)'), '正文动态世界事件追加必须走 30 条存档上限。');
assert(variableExecutor.includes("root === '世界' && rest === '全局事件' && cmd.action === 'push'"), '变量命令 push 世界.全局事件 也必须走 30 条存档上限。');
assert(!sendWorkflow.includes('全局事件: [...worldAfter.全局事件, ...parsedForDisplay.worldEvents]'), '正文动态世界事件不得继续无限追加进存档。');

const calls = [...builder.matchAll(/buildResponseLengthSection\(settings\)/g)];
assert(calls.length >= 2, '主剧情和开局 prompt 都必须注入正文字数硬约束。');
assert(contextSnapshot.includes('splitPromptSections(systemPrompt)'), '上下文查看必须展示 system prompt 分段，才能看到字数硬约束。');
assert(contextSnapshot.includes('uploadEstimatedTokens'), '上下文查看必须单独统计真实上传 token。');
assert(contextSnapshot.includes('diagnosticEstimatedTokens'), '上下文查看必须单独统计诊断参考 token。');
assert(contextSnapshot.includes('buildLeanAssistantHistoryContent(msg)'), '上下文预览的历史 assistant 消息必须与真实发送链路一样瘦身。');
assert(contextSnapshot.includes("category: '诊断'"), '主剧情本地辅助分析块必须标记为诊断类。');
assert(contextSnapshot.includes('upload: false') && contextSnapshot.includes('diagnostic: true'), '本地诊断块不得计入真实上传顺序。');
assert(contextSnapshot.includes('formatMainRequestOrderOverview'), '上下文查看必须提供主剧情真实请求顺序总览。');
assert(contextSnapshot.includes('main_request_order_overview'), '主剧情真实请求顺序总览必须作为独立区块展示。');
assert(contextSnapshot.includes('System Prompt 分段') && contextSnapshot.includes('API Messages'), '真实请求顺序总览必须同时列出 system 分段和 API messages。');

assert(mainCot.includes('每个 Step 必须产出会影响本回合正文、短期记忆、动态世界、变量草稿或剧情规划的判断'), '主剧情 COT 必须要求每步产出有用判断。');
assert(mainCot.includes('无触发及原因'), '主剧情 COT 必须允许无关步骤短路并说明原因。');
assert(mainCot.includes('禁止为了凑步骤重复同一句安全口号'), '主剧情 COT 必须禁止空泛凑步骤。');

console.log('prompt context regression ok');
