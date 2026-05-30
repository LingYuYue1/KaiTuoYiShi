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
const inputArea = fs.readFileSync('components/features/Chat/InputArea.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const storyProgressNpcMemoryFunction = sendWorkflow.match(/function applyStoryProgressNpcMemory[\s\S]*?\n}\n\nfunction formatZhikuDiagnosticsPreview/)?.[0] ?? '';

assert(builder.includes('function buildNpcContinuitySection'), '主剧情 prompt 必须构建 NPC 连续性核对表。');
assert(builder.includes('# 本回合人物关系连续性核对'), 'NPC 连续性核对表必须有可定位标题。');
assert(builder.includes('禁止写成初次见面'), 'NPC 连续性核对表必须禁止已认识 NPC 被写回初见。');
assert(builder.includes('最近共同经历'), 'NPC 连续性核对表必须注入 NPC 同行记忆摘要。');
assert(builder.includes('RECENT_EXTRA_NPC_PROMPT_TURN_WINDOW = 15'), '近期 NPC 注入窗口必须覆盖低回合连续互动。');
assert(builder.includes('buildNpcContinuitySection(worldState, npcRecords, _turnCount)'), 'buildSystemPrompt 必须实际注入 NPC 连续性核对表。');
assert(builder.indexOf('buildNpcContinuitySection(worldState, npcRecords, _turnCount)') < builder.indexOf('buildCompanionsSection(npcRecords, _turnCount)'), 'NPC 连续性核对表应早于伙伴档案注入。');
assert(builder.includes('最近遇见的路人'), '近期路人也必须能进入主剧情上下文。');
assert(builder.includes('提取NPC同行记忆文本列表(n).slice(-4)'), '伙伴档案必须注入最近 NPC 同行记忆。');

assert(historyWindow.includes('MAIN_HISTORY_LIMIT_WITH_MEMORY = 20'), '开启记忆注入时仍必须保留足够近期原文历史。');
assert(historyWindow.includes('buildImmediateStoryReview'), '低回合必须有即时剧情回顾，不依赖忆庭阈值。');
assert(historyWindow.includes('# 即时剧情回顾') || sendWorkflow.includes('# 即时剧情回顾'), '真实请求必须注入即时剧情回顾标题。');

assert(variableFacts.includes("if (fact.memory) return 'companion'"), '有 NPC 记忆的新 NPC 必须自动升为 companion。');
assert(variableFacts.includes('key: `${key}.最近回合`'), '已有 NPC 本回合有事实时必须刷新最近回合。');
assert(variableFacts.includes('key: `${key}.同行记忆`'), 'NPC fact memory 必须写入同行记忆。');
assert(variableModel.includes('已建档 NPC 本回合与玩家发生有效互动时，必须审计是否需要写 memory'), '变量模型必须审计已有 NPC 的互动记忆。');
assert(variableModel.includes('新入档时，如果即时剧情回顾/回忆/登记表显示该 NPC 与玩家已有关键前因'), '新入档 NPC 必须补关键前因，避免从中途断层。');

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
