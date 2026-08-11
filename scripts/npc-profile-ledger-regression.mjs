import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const npcModel = fs.readFileSync('models/npc.ts', 'utf8');
const variableCommand = fs.readFileSync('models/variableCommand.ts', 'utf8');
const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableOutputFormat = fs.readFileSync('prompts/cot/variableOutputFormat.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const builtinPromptModules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');
const promptModel = fs.readFileSync('models/prompts.ts', 'utf8');
const variableRegistry = fs.readFileSync('utils/variableRegistry.ts', 'utf8');
const systemPromptBuilder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const memoryUtils = fs.readFileSync('hooks/useGame/memoryUtils.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const chatModel = fs.readFileSync('models/chat.ts', 'utf8');
const turnItem = fs.readFileSync('components/features/Chat/TurnItem.tsx', 'utf8');
const contextSnapshot = fs.readFileSync('hooks/useGame/contextSnapshot.ts', 'utf8');
const phoneModal = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');
// 全项目修复：手机双写编排提升为独立纯事务模块（services/phoneMemoryDualWrite.ts），
// 账本压缩 / 总结记忆 / 最近互动同步等行为要求不变，仅实现位置迁移。
const phoneDualWrite = fs.readFileSync('services/phoneMemoryDualWrite.ts', 'utf8');
const companionPanel = fs.readFileSync('components/features/GameSystems/CompanionPanel.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const packageJson = fs.readFileSync('package.json', 'utf8');
const behaviorRegression = fs.readFileSync('scripts/npc-ledger-variable-facts-behavior.mjs', 'utf8');

for (const text of [
  'export const NPC_MEMORY_WRITE_RULE_PROMPT',
  '<NPC档案记忆写入法则>',
  'NPC 档案记忆写入法则',
  '## 2. 数据定位',
  '目标 NPC 必须用 \\`id/name/alias\\` 与当前登记表',
  '智库只负责原著事实校准',
  '不能把智库召回或剧情编织滑窗里的参考内容直接写成新经历',
  'recentInteraction',
  'longTermImpression',
  'relationshipStage',
  'sharedExperiences',
  'openItems',
  'unresolvedConflicts',
  'mustRemember',
  'doNotForget',
  'NPC 账本审计触发词',
  '保护事项在解决前不要删除或改写为空',
  '记忆归属必须严格到人',
  '是否在场不是 NPC 长期字段',
  '原著角色的长期 \\`personality/性格\\` 由智库人物主体资料校准',
  '补档优先当前出场或刚建档的 1-2 名',
]) {
  assert(variableWorldbook.includes(text), `variable worldbook must include NPC ledger rule text: ${text}`);
}

assert(variableWorldbook.includes('${NPC_MEMORY_WRITE_RULE_PROMPT}'), '变量世界书必须引用完整 NPC 档案记忆写入法则块。');

assert(npcModel.includes('export interface NPC总结记忆条目'), 'NPC 模型必须定义独立的总结记忆条目。');
assert(npcModel.includes('export interface NPC记忆账本视图'), 'NPC 模型必须定义标准账本视图。');
assert(npcModel.includes('最近互动?: string'), 'NPC 档案必须允许最近互动字段。');
assert(npcModel.includes('对玩家长期印象?: string'), 'NPC 档案必须允许对玩家长期印象字段。');
assert(npcModel.includes('未完成事项?: string[]'), 'NPC 档案必须允许未完成事项字段。');
assert(npcModel.includes('必须记得?: string[]'), 'NPC 档案必须允许必须记得字段。');
assert(npcModel.includes('禁止遗忘?: string[]'), 'NPC 档案必须允许禁止遗忘字段。');
assert(npcModel.includes('export function buildNpcMemoryLedgerView'), '必须提供旧档案到 NPC 账本视图的兼容读取层。');
assert(npcModel.includes('export function selectNpcLedgersForTurn'), '必须提供本回合 NPC 账本选择器。');
assert(npcModel.includes('export function formatNpcLedgerForPrompt'), '必须提供 NPC 账本 prompt 格式化函数。');
assert(npcModel.includes("item.startsWith('[压缩]')"), '旧 [压缩] 同行记忆必须被账本视图识别为总结记忆候选。');
assert(npcModel.includes('function npcLedgerHasProtectedItems'), 'NPC 账本选择器必须识别未完成事项/必须记得等保护事项。');
assert(npcModel.includes('保护事项保底'), 'NPC 账本选择器必须为保护事项提供保底注入原因。');

for (const field of [
  'recentInteraction?: string',
  'longTermImpression?: string',
  'relationshipStage?: string',
  'sharedExperiences?: string[]',
  'openItems?: string[]',
  'unresolvedConflicts?: string[]',
  'mustRemember?: string[]',
  'doNotForget?: string[]',
]) {
  assert(variableCommand.includes(field), `NPC 变量事实必须包含 ${field}。`);
}

assert(variableModel.includes('VARIABLE_SYSTEM_WORLDBOOK_PROMPT'), '变量模型系统提示词必须注入变量世界书。');
assert(variableModel.includes('<NPC档案记忆写入法则>') || variableOutputFormat.includes('<NPC档案记忆写入法则>'), '变量模型 NPC 字段说明必须指向完整 NPC 写入法则块。');
assert(variableModel.includes('三月七给过玩家备用通讯码') || variableOutputFormat.includes('三月七给过玩家备用通讯码'), '变量模型必须包含承诺/联系方式进入 mustRemember 的示例。');
assert(variableModel.includes('丹恒已经察觉玩家隐瞒星核线索') || variableOutputFormat.includes('丹恒已经察觉玩家隐瞒星核线索'), '变量模型必须包含冲突保护进入 doNotForget 的示例。');

assert(variableFacts.includes('recentInteraction: 读字符串(raw.recentInteraction || raw.最近互动)'), '变量事实解析必须读取 recentInteraction/最近互动。');
assert(variableFacts.includes('openItems: 字符串数组(raw.openItems ?? raw.未完成事项 ?? raw.未完成承诺)'), '变量事实解析必须读取未完成事项。');
assert(variableFacts.includes('pushNpcLedgerListCommands'), '变量事实落库必须通过 helper 去重追加账本数组字段。');
assert(variableFacts.includes('key: `${key}.最近互动`'), '已有 NPC 更新必须写入最近互动。');
assert(variableFacts.includes("pushNpcLedgerListCommands(push, key, '必须记得'"), '已有 NPC 更新必须能追加必须记得。');
assert(variableFacts.includes("pushNpcLedgerListCommands(push, key, '禁止遗忘'"), '已有 NPC 更新必须能追加禁止遗忘。');
assert(packageJson.includes('"test:npc-ledger-facts"'), 'package.json 必须提供 NPC 账本事实行为回归入口。');
assert(behaviorRegression.includes('factsToVariableCommands(parsed.facts'), 'NPC 账本行为回归必须真实调用 factsToVariableCommands。');
assert(behaviorRegression.includes('selectNpcLedgersForTurn'), 'NPC 账本行为回归必须真实调用账本选择器。');
assert(behaviorRegression.includes('NPC[id=npc_march7th].未完成事项'), 'NPC 账本行为回归必须验证未完成事项命令。');
assert(behaviorRegression.includes('NPC[id=npc_danheng].禁止遗忘'), 'NPC 账本行为回归必须验证禁止遗忘命令。');
assert(behaviorRegression.includes('保护事项保底'), 'NPC 账本行为回归必须验证保护事项保底原因。');

for (const field of ['最近互动', '对玩家长期印象', '当前关系阶段', '共同经历', '未完成事项', '未解决冲突', '必须记得', '禁止遗忘', '总结记忆']) {
  assert(variableRegistry.includes(`'${field}'`), `变量登记表必须允许 NPC.${field}。`);
}

assert(systemPromptBuilder.includes('# 本回合 NPC 关系与记忆强制承接'), '主剧情 prompt 必须包含 NPC 账本强制承接区。');
assert(systemPromptBuilder.includes('npcLedgerSelectionOverride?: NPC账本选择结果'), 'buildSystemPrompt 必须允许复用外部 NPC 账本选择结果。');
assert(systemPromptBuilder.includes('selectNpcLedgersForTurn({'), '主剧情 prompt 必须使用 NPC 账本选择器。');
assert(systemPromptBuilder.includes('formatNpcLedgerForPrompt'), '主剧情 prompt 必须使用统一账本格式化函数。');
assert(systemPromptBuilder.indexOf('buildNpcLedgerContinuitySection') < systemPromptBuilder.indexOf('buildNpcContinuitySection'), 'NPC 账本强制承接区必须早于旧人物连续性核对。');

assert(promptModel.includes("'builtin_npc_ledger_continuity'"), '内置提示词模块白名单必须包含 NPC 账本承接法则。');
assert(builtinPromptModules.includes('const NPC_LEDGER_CONTINUITY_CONTENT'), '内置提示词模块必须定义主剧情侧 NPC 账本承接法则正文。');
assert(builtinPromptModules.includes("id: 'builtin_npc_ledger_continuity'"), '内置提示词模块必须注册 NPC 账本承接法则。');
assert(builtinPromptModules.includes("title: 'NPC 账本承接法则'"), 'NPC 账本承接法则必须在提示词模块列表中可见。');
assert(builtinPromptModules.includes('NPC 账本是当前存档里的私有关系事实'), 'NPC 账本承接法则必须说明账本是当前存档事实。');
assert(builtinPromptModules.includes('账本相关不等于自动在场'), 'NPC 账本承接法则必须保留不自动在场边界。');
assert(builtinPromptModules.includes('智库校准原著人格'), 'NPC 账本承接法则必须说明与智库的分工。');
assert(builtinPromptModules.includes('禁止把已认识、已同行、已承诺、已冲突或已有私有记忆的 NPC 写成初识'), 'NPC 账本承接法则必须禁止熟人失忆。');
assert(builtinPromptModules.includes("scope: ['main']"), 'NPC 账本承接法则必须只作为主剧情侧提示词模块注入。');

assert(memoryUtils.includes('export function compressNpcMemoryLedger'), '必须提供独立的 NPC 账本压缩工具。');
assert(memoryUtils.includes('summaries: NPC总结记忆条目[]'), 'NPC 账本压缩结果必须返回总结记忆。');
assert(memoryUtils.includes("cleaned.startsWith('[压缩]')"), 'NPC 账本压缩必须迁移旧 [压缩] 同行记忆。');
assert(memoryUtils.includes('总结记忆') || memoryUtils.includes('NPC总结记忆条目'), 'NPC 账本压缩必须使用独立总结记忆结构。');

assert(chatModel.includes('npcLedgerInjection?:'), 'debugContext 必须保存 NPC 账本注入诊断。');
assert(chatModel.includes('npcLedgerUpdate?:'), 'debugContext 必须预留 NPC 账本更新诊断。');
assert(sendWorkflow.includes('const npcLedgerSelection = !isOpeningSystemTrigger'), '真实请求必须构建 NPC 账本选择结果。');
assert(sendWorkflow.includes('npcLedgerInjection: buildNpcLedgerDebug(npcLedgerSelection)'), 'AI 回复落库必须保存 NPC 账本注入诊断。');
assert(sendWorkflow.includes('formatNpcLedgerPreview(npcLedgerSelection)'), '请求上下文预览摘要必须包含 NPC 账本诊断。');
assert(sendWorkflow.includes('compressNpcMemoryLedger({'), '主剧情 NPC 记忆压缩必须使用账本压缩工具。');
assert(sendWorkflow.includes('总结记忆: ledgerCompression.summaries'), '主剧情 NPC 压缩必须写入独立总结记忆。');
assert(!sendWorkflow.includes('compressNpcMemories('), '主剧情不应再把 compressNpcMemories 结果直接写回同行记忆。');
assert(sendWorkflow.includes('function buildNpcLedgerUpdateDebug'), '主流程必须构建 NPC 账本更新诊断。');
assert(sendWorkflow.includes('const npcNameById = new Map<string, string>()'), 'NPC 账本更新诊断必须把内部 NPC id 映射回中文姓名。');
assert(sendWorkflow.includes('npcNameById.get(commandName) ?? commandName'), 'NPC 账本更新诊断命令侧必须优先显示中文姓名。');
assert(sendWorkflow.includes('attachNpcLedgerUpdateDebug(finalHistory, aiMsg.id, npcLedgerUpdateDebug)'), '主流程必须把 NPC 账本更新诊断回写到当前 assistant 消息。');
assert(sendWorkflow.includes('summaryTriggered: ['), 'NPC 总结记忆压缩触发必须进入更新诊断。');
assert(sendWorkflow.includes('chatHistory: finalHistory'), '自动存档必须使用带 NPC 账本更新诊断的 finalHistory。');
assert(sendWorkflow.includes("key !== 'batch' && key !== 'npcLedgerUpdate'"), 'NPC 账本更新诊断不能被误判为变量命令已落地。');
assert(turnItem.includes('【NPC账本注入诊断】'), 'TurnItem 请求上下文必须显示 NPC 账本诊断。');
assert(turnItem.includes('【NPC账本更新诊断】'), 'TurnItem 请求上下文必须显示 NPC 账本更新诊断。');
assert(contextSnapshot.includes('上一回合真实保存的 NPC 账本诊断'), '上下文页必须显示上一回合真实 NPC 账本诊断。');
assert(contextSnapshot.includes('【NPC账本更新诊断】'), '上下文页必须显示上一回合 NPC 账本更新诊断。');
assert(contextSnapshot.includes('本回合 NPC 账本预期注入'), '上下文页必须显示本回合 NPC 账本预期注入。');
assert(contextSnapshot.includes('NPC_MEMORY_WRITE_RULE_PROMPT'), '上下文页必须单独引用完整 NPC 写入法则，方便玩家核对。');
assert(contextSnapshot.includes('variable_npc_memory_rule'), '变量模型上下文必须有 NPC 写入法则独立区块。');
assert(contextSnapshot.includes('NPC档案记忆写入法则（完整）'), '变量模型上下文必须显示完整 NPC 写入法则标题。');
assert((phoneModal + phoneDualWrite).includes('compressNpcMemoryLedger({'), '手机 NPC 记忆写入必须使用账本压缩工具。');
assert((phoneModal + phoneDualWrite).includes('总结记忆: ledgerCompression.summaries'), '手机 NPC 记忆写入必须保存总结记忆。');
assert((phoneModal + phoneDualWrite).includes('最近互动: packagedSummary'), '阶段1方案E：手机 NPC 记忆写入必须同步最近互动（packagedSummary，含【通讯记录】标记）。');
assert(companionPanel.includes('buildNpcMemoryLedgerView'), '与你同行面板必须读取 NPC 记忆账本视图。');
assert(companionPanel.includes("devMode ? '记忆账本' : '同行记忆'"), '与你同行面板普通模式必须显示同行记忆，开发者模式才显示记忆账本。');
assert(companionPanel.includes('<MemoryPanel npc={npc} devMode={devMode} />'), '与你同行面板必须把开发者模式传给记忆页。');
assert(app.includes('devMode={ctx.gameSettings.devMode}'), 'App 必须把游戏设置里的开发者模式传入与你同行面板。');
assert(companionPanel.includes('function LedgerListCard'), '记忆账本 UI 必须使用固定高度的账本列表卡，避免保护事项累积后撑爆布局。');
assert(companionPanel.includes('h-[214px]'), 'NPC 账本保护事项卡片必须有稳定高度。');
assert(companionPanel.includes('overflow-y-auto overflow-x-hidden'), 'NPC 账本保护事项卡片必须内部滚动。');
assert(companionPanel.includes('长期保护事项 {protectedCount} 条'), '必须承接区必须显示保护事项总数。');
assert(companionPanel.includes("<LedgerListCard title=\"禁止遗忘\" items={ledger.禁止遗忘} tone=\"danger\" />"), '禁止遗忘必须使用高风险账本卡样式。');
assert(companionPanel.includes("function MemoryPanel({ npc, devMode = false }"), '记忆页必须显式接收开发者模式开关。');
assert(companionPanel.includes("<DetailBlock title={devMode ? '原始同行记忆' : '同行记忆'}>"), '普通玩家只能看到同行记忆标题，开发者模式才显示原始同行记忆。');
for (const text of ['总结记忆', '同行记忆']) {
  assert(companionPanel.includes(text), `普通玩家记忆页必须保留 ${text}。`);
}
for (const fragment of [
  '<DetailBlock title="账本状态">',
  '<DetailBlock title="必须承接">',
  '<DetailBlock title="共同经历">',
  '<LedgerListCard title="必须记得"',
  '<LedgerListCard title="未完成事项"',
  '<LedgerListCard title="禁止遗忘"',
  '<LedgerListCard title="未解决冲突"',
]) {
  const fragmentIndex = companionPanel.indexOf(fragment);
  assert(fragmentIndex !== -1, `开发者记忆账本 UI 必须保留 ${fragment}。`);
  assert(companionPanel.lastIndexOf('{devMode && (', fragmentIndex) !== -1, `${fragment} 必须只在开发者模式下渲染。`);
}

console.log('npc profile ledger regression ok');
