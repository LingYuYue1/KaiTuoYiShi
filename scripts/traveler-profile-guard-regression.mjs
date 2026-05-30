import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableRegistry = fs.readFileSync('utils/variableRegistry.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const systemPromptBuilder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const phoneService = fs.readFileSync('services/ai/phoneService.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableCot = fs.readFileSync('prompts/cot/variableCot.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const promptModules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');
const worldbookConfig = fs.readFileSync('data/builtinWorldbookConfig.ts', 'utf8');
const canonicalCharacters = fs.readFileSync('data/canonicalCharacters.ts', 'utf8');
const settings = fs.readFileSync('models/settings.ts', 'utf8');
const memoryCompression = fs.readFileSync('services/memoryCompression.ts', 'utf8');
const yitingArchive = fs.readFileSync('services/yitingArchive.ts', 'utf8');

const protectedFields = [
  '姓名',
  '别名',
  '性别',
  '年龄',
  '生日',
  '身高',
  '身份',
  '外貌',
  '性格',
  '背景',
  '专长知识',
  '能力',
  '头像',
  '图像档案',
];

assert(variableFacts.includes("if (fact.type === 'traveler_profile')"), '事实层必须显式处理 traveler_profile。');
assert(variableFacts.includes('已静默忽略 traveler_profile'), 'traveler_profile 必须被静默忽略并写入报告。');
assert(!variableFacts.includes("key: '旅人.身份'"), 'traveler_profile 不得再转换为 set 旅人.身份。');
assert(!variableFacts.includes("key: '旅人.外貌'"), 'traveler_profile 不得再转换为 set 旅人.外貌。');
assert(!variableFacts.includes("key: '旅人.性格'"), 'traveler_profile 不得再转换为 set 旅人.性格。');
assert(!variableFacts.includes("key: '旅人.背景'"), 'traveler_profile 不得再转换为 set 旅人.背景。');
assert(!variableFacts.includes("key: '旅人.能力'"), 'traveler_profile 不得再 push 旅人.能力。');
assert(!variableFacts.includes("key: '旅人.专长知识'"), 'traveler_profile 不得再 push 旅人.专长知识。');

assert(variableRegistry.includes('TRAVELER_PLAYER_AUTHORED_FIELDS'), '变量登记表必须有旅人玩家手写字段保护名单。');
for (const field of protectedFields) {
  assert(variableRegistry.includes(`'${field}'`), `保护名单必须包含 旅人.${field}。`);
}
assert(variableRegistry.includes('isTravelerPlayerAuthoredPath'), '变量校验必须识别旅人玩家手写路径。');
assert(variableRegistry.includes('isTravelerPlayerAuthoredVariablePath'), '变量校验必须导出旅人玩家手写路径过滤 helper。');
assert(variableRegistry.includes('变量模型不得 ${cmd.action}'), '变量校验拒绝原因必须阻止旧命令修改玩家档案。');
assert(variableRegistry.includes("path !== '旅人' && !isTravelerPlayerAuthoredPath(path)"), '变量登记表不得暴露旅人根路径和玩家手写字段。');
assert(variableRegistry.includes('旅人根对象包含玩家手写核心档案'), 'set 旅人 整根必须被拒绝，避免绕过字段保护。');
assert(variableRegistry.includes("path: '旅人.背包'"), '旅人背包 schema 仍必须保留，运行时物品不能被误伤。');
assert(variableRegistry.includes("path: '旅人.战技列表'"), '旅人战技 schema 仍必须保留，玩家确认后的战技不能被误伤。');
assert(sendWorkflow.includes('isTravelerPlayerAuthoredVariablePath'), '变量执行前必须过滤旅人核心档案旧命令。');
assert(sendWorkflow.includes('skippedTravelerProfileLegacyCount'), '变量批次报告必须统计被静默忽略的旅人核心档案旧命令。');
assert(sendWorkflow.includes('已静默忽略旅人核心档案旧命令'), '变量批次报告必须说明旧旅人档案命令已静默忽略。');

assert(variableModel.includes('不得输出 traveler_profile'), '变量模型提示词必须禁止 traveler_profile。');
assert(variableModel.includes('旅人核心档案由玩家手写维护'), '变量模型提示词必须说明旅人核心档案由玩家维护。');
assert(variableModel.includes('剧情中获得的新身份称呼、临时伪装、别人对玩家能力的认知'), '变量模型必须给出替代落库方向。');
assert(variableCot.includes('不写 traveler_profile'), '变量 CoT 必须禁止 traveler_profile。');
assert(variableCot.includes('剧情中获得的新身份称呼、临时伪装、别人对玩家能力的认知'), '变量 CoT 必须说明改写方向。');
assert(variableWorldbook.includes('玩家手写核心档案只读'), '变量世界书必须说明玩家手写核心档案只读。');
assert(variableWorldbook.includes('traveler_profile'), '变量世界书禁止清单必须覆盖 traveler_profile。');
assert(promptModules.includes('核心档案由玩家手写维护'), '主剧情变量草稿说明不得继续诱导旅人档案更新。');

assert(variableFacts.includes('isCanonicalNpcPersonalityProtected'), '事实层必须保护原著 NPC 长期性格字段。');
assert(variableFacts.includes('原著角色长期性格由智库人物主体资料校准'), '原著 NPC 性格保护必须写入变量报告说明。');
assert(variableFacts.includes('性格: canonical?.personality ?? fact.personality'), '新建原著 NPC 时必须优先使用原著库性格而不是变量事实临时性格。');
assert(variableModel.includes('原著角色的长期 personality / 性格 不由变量系统改写'), '变量模型提示词必须禁止改写原著角色长期性格。');
assert(variableModel.includes('不要把“本回合沉默/紧张/冷淡”固化成长期性格'), '变量模型必须禁止把单回合状态固化成人格。');
assert(variableWorldbook.includes('原著角色的长期 \\`性格\\` 由智库人物主体资料校准'), '变量世界书必须说明原著 NPC 性格由智库主体资料校准。');
assert(canonicalCharacters.includes('熟悉同伴后会自然吐槽和接梗'), '星的原著兜底性格不能继续固化为长期沉默。');
assert(canonicalCharacters.includes('不应被写成空白沉默工具人'), '穹的原著兜底性格不能继续固化为长期沉默。');
assert(promptModules.includes('星/穹刚苏醒时可短暂观察，但不能连续数回合沉默旁观'), '主提示词必须明确星/穹不能被长期写成沉默旁观。');
assert(promptModules.includes('熟悉同伴后应主动吐槽、接梗、提问或用行动回应'), '主提示词必须给星/穹明确的主动表达方式。');
assert(worldbookConfig.includes('星/穹刚苏醒时可短暂观察,但不能连续数回合沉默旁观'), '默认世界书必须明确星/穹不能被长期写成沉默旁观。');
assert(systemPromptBuilder.includes('智库人物主体人格优先校准长期口吻与行为边界'), '主提示词必须声明原著角色长期人格以智库主体资料为准。');
assert(systemPromptBuilder.includes('临时/旧档案性格参考') && systemPromptBuilder.includes('长期人格以智库人物主体资料为准'), '主提示词中原著 NPC 档案性格必须降级为临时/旧档案参考。');
assert(phoneService.includes('原著角色口吻边界') && phoneService.includes('长期口吻以智库人物主体资料为准'), '手机提示词必须避免旧 NPC 档案性格覆盖智库主体人格。');
assert(settings.includes('单回合沉默、紧张、冷淡、受伤、戒备或少话只能作为当时状态'), '默认记忆系统提示词必须禁止把单回合状态压缩成长期人格。');
assert(settings.includes('长期人格、口吻和 OOC 边界以智库人物主体资料为准'), '默认 NPC 记忆压缩提示词必须以智库主体资料为长期人格来源。');
assert(settings.includes('原著角色的长期人格不要由忆庭精炼改写'), '默认忆庭精炼提示词必须禁止改写原著角色长期人格。');
assert(memoryCompression.includes('不得压缩成长期人格') && memoryCompression.includes('智库人物主体资料为准'), '记忆压缩运行时额外要求必须保护原著角色长期人格。');
assert(yitingArchive.includes('长期人格不要由忆庭精炼改写') && yitingArchive.includes('忆庭只记录共同经历、关系事实、承诺、冲突和后果'), '忆庭精炼运行时额外要求必须保护原著角色长期人格。');

console.log('traveler profile guard regression ok');
