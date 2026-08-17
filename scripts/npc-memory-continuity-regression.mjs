import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const builder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const historyWindow = fs.readFileSync('hooks/useGame/historyWindow.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const memoryUtils = fs.readFileSync('hooks/useGame/memoryUtils.ts', 'utf8');
const npcMemorySanitizer = fs.readFileSync('utils/npcMemorySanitizer.ts', 'utf8');
const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableOutputFormat = fs.readFileSync('prompts/cot/variableOutputFormat.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const inputArea = fs.readFileSync('components/features/Chat/InputArea.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
// CRLF 环境下 \n}\n\n 匹配不到，先归一化行尾再提取
const storyProgressNpcMemoryFunction = sendWorkflow.replace(/\r\n/g, '\n').match(/function applyStoryProgressNpcMemory[\s\S]*?\n}\n\nfunction formatZhikuDiagnosticsPreview/)?.[0] ?? '';

assert(builder.includes('function buildNpcContinuitySection'), '主剧情 prompt 必须构建 NPC 连续性核对表。');
assert(builder.includes('# 本回合人物关系连续性核对'), 'NPC 连续性核对表必须有可定位标题。');
assert(builder.includes('禁止写成初次见面'), 'NPC 连续性核对表必须禁止已认识 NPC 被写回初见。');
assert(builder.includes('最近共同经历'), 'NPC 连续性核对表必须注入 NPC 同行记忆摘要。');
assert(builder.includes('RECENT_EXTRA_NPC_PROMPT_TURN_WINDOW = 15'), '近期 NPC 注入窗口必须覆盖低回合连续互动。');
assert(builder.includes('buildNpcContinuitySection(worldState, activeNpcRecords, _turnCount, worldbookCtx?.npcNames)'), 'buildSystemPrompt 必须把近期/预期相关人物接入 NPC 连续性核对表。');
assert(builder.indexOf('buildNpcContinuitySection(worldState, activeNpcRecords, _turnCount, worldbookCtx?.npcNames)') < builder.indexOf('buildCompanionsSection(activeNpcRecords, _turnCount, settings)'), 'NPC 连续性核对表应早于伙伴档案注入。');
assert(builder.includes('buildNpcPresenceSection(worldState, activeNpcRecords, _turnCount, worldbookCtx?.recentUserInput, worldbookCtx?.npcNames)'), '角色在场状态必须接入近期/预期相关人物。');
assert(builder.includes('近期正文/玩家输入明确人物或预期相关'), '角色在场状态必须显示近期正文/玩家输入明确人物或预期相关人物。');
assert(builder.includes('档案尚未落库'), 'NPC 连续性核对必须在变量档案未落库时提供兜底行。');
assert(builder.includes('最近正文锚点'), 'NPC 连续性兜底必须要求读取最近正文锚点承接刚发生事实。');
assert(builder.includes('最近遇见的路人'), '近期路人也必须能进入主剧情上下文。');
// 对标参考项目：同行记忆只取非手机来源（避免与手机记忆重复注入），重要角色最近 N 条（默认20）、普通 NPC 最近 5 条；手机记忆单独取最近2条。
assert(builder.includes("item?.来源 !== '手机'"), '阶段1方案E：同行记忆必须过滤手机来源，避免重复注入。');
assert(builder.includes('重要角色关键记忆条数N'), '伙伴档案必须按重要角色关键记忆条数N 注入（对标参考项目）。');
assert(builder.includes('slice(-(n.阶位 === \'companion\' || n.原著角色 ? 重要角色记忆条数 : 5))'), '重要角色保留最近20条、普通NPC最近5条。');
assert(builder.includes('getRecentPhoneMemoryTexts(n).slice(-2)'), '手机记忆必须单独取最近2条。');

assert(!historyWindow.includes('MAIN_HISTORY_LIMIT_WITH_MEMORY'), 'legacy 档原始 history messages（20 条）必须已移除——回顾即历史通道（对标参考项目）。');
assert(historyWindow.includes('MAIN_IMMEDIATE_STORY_REVIEW_TURNS = 9'), '即时剧情回顾必须覆盖最近 9 个 AI 回合，作为主要近期剧情承接通道。');
assert(historyWindow.includes('buildImmediateStoryReview'), '低回合必须有即时剧情回顾，不依赖忆庭阈值。');
assert(historyWindow.includes('# 即时剧情回顾') || sendWorkflow.includes('# 即时剧情回顾'), '真实请求必须注入即时剧情回顾标题。');

assert(variableFacts.includes('function 有NPC互动信号'), 'NPC 互动计数必须由统一互动信号判定。');
assert(variableFacts.includes('累计互动次数'), 'NPC 事实落库必须维护累计互动次数。');
assert(variableFacts.includes('projectedInteractions'), '自动晋升必须使用累计互动次数门槛。');
assert(variableFacts.includes('key: `${key}.最近回合`'), '已有 NPC 本回合有事实时必须刷新最近回合。');
assert(variableFacts.includes('key: `${key}.同行记忆`'), 'NPC fact memory 必须写入同行记忆。');
assert(variableModel.includes('<NPC档案记忆写入法则>') || variableOutputFormat.includes('<NPC档案记忆写入法则>'), '变量模型 NPC 字段说明必须指向完整 NPC 写入法则。');
assert(variableWorldbook.includes('对已建档 NPC：本回合与玩家发生有效互动时，必须审计是否写 \\`memory\\`'), '变量世界书完整法则必须审计已有 NPC 的互动记忆。');
assert(variableWorldbook.includes('新入档时若即时剧情回顾、忆庭回忆或当前登记表已显示此前关键互动'), '新入档 NPC 必须补关键前因，避免从中途断层。');

assert(sendWorkflow.includes('state.setPendingVariable(true)'), '正文落地后变量结算期间必须设置 pendingVariable。');
assert(sendWorkflow.includes('state.setPendingVariable(false)'), '后台结算结束后必须清理 pendingVariable。');
assert(inputArea.includes('disabled={loading || disabled}'), '变量结算 pending 时输入框必须禁用。');
assert(app.includes('disabled={state.pendingVariable}'), 'App 必须把 pendingVariable 传给输入区。');
assert(app.includes('disabled={state.loading || state.pendingVariable}'), '系统触发按钮也必须在变量结算期间禁用。');

assert(sendWorkflow.includes('latestArchive?.角色推进摘要 ?? []'), 'story archive NPC memory must only read role progress summaries.');
assert(sendWorkflow.includes('const matched = roleProgress.find'), 'story archive NPC memory must match summaries by NPC name.');
assert(storyProgressNpcMemoryFunction, 'story progress NPC memory helper must be present.');
assert(!storyProgressNpcMemoryFunction.includes('摘要: _memoryLine'), 'full story progress diagnostics must not be written into NPC companion memories.');
assert(!storyProgressNpcMemoryFunction.includes('storyProgressMemoryLine'), 'story progress NPC memory helper must not read the full progress memory line.');
assert(memoryUtils.includes('NPC_MEMORY_SYSTEM_NOISE_PATTERNS'), 'NPC memory compression must filter story progress/system diagnostic noise.');
assert(memoryUtils.includes('compactNpcMemoryChunk'), 'NPC memory compression must compact a chunk into a concise summary.');
assert(memoryUtils.includes('!isNpcMemorySystemNoise'), 'NPC memory compression must drop system noise before summarizing.');
assert(!memoryUtils.includes("const summary = chunk.join(' / ')"), 'NPC memory compression must not slash-join raw memories.');
assert(npcMemorySanitizer.includes('SYSTEM_MEMORY_PATTERNS'), 'NPC memory sanitizer must filter old story progress diagnostic contamination.');

console.log('npc memory continuity regression ok');
