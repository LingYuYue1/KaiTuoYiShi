import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableRegistry = fs.readFileSync('utils/variableRegistry.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableCot = fs.readFileSync('prompts/cot/variableCot.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const promptModules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');

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

console.log('traveler profile guard regression ok');
