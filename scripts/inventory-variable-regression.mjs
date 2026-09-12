import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const executor = fs.readFileSync('utils/variableExecutor.ts', 'utf8');
const registry = fs.readFileSync('utils/variableRegistry.ts', 'utf8');
const facts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variablePromptContract = fs.readFileSync('utils/variablePromptContract.ts', 'utf8');
const promptModules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');
const variableOutputFormat = fs.readFileSync('prompts/cot/variableOutputFormat.ts', 'utf8');

assert(executor.includes('解析背包数量扣减目标'), '变量执行器必须识别背包数量扣减兼容命令。');
assert(executor.includes("tokens[0] !== '背包'") && executor.includes("tokens[2] !== '数量'"), '背包扣减兼容命令必须限定在 旅人.背包[...].数量。');
assert(executor.includes("cmd.action !== 'sub'"), '背包扣减兼容命令必须只处理 sub，避免误吞普通 set/push。');
assert(executor.includes('const reduced = reduceVariableCommands([cmd], state)'), '单条变量兼容入口必须统一复用 reducer，不能再直接绕过 preflight 写 setter。');
assert(executor.includes('const reduced = reduceVariableCommands(commands, state)'), '批量变量兼容入口必须统一复用 reducer，不能逐条用旧 state 直接写 setter。');
assert(executor.includes('const backpackQuantityChange = parsedRoot?.root === \'旅人\''), '背包数量扣减必须在 reducer 内保留兼容识别，但不能成为通用 setter 旁路。');
assert(executor.includes('已忽略背包消耗：背包中没有'), '背包缺失消耗必须静默忽略并写入可读原因。');
assert(executor.includes('item.id, item.名称'), '背包 id 选择器必须兼容同名物品。');
assert(executor.includes('(item as unknown as Record<string, unknown>)[field]'), '背包扣减必须支持 名称 等字段选择器。');
assert(registry.includes("path: '旅人.背包'"), '背包 schema 必须继续保留。');
assert(facts.includes('是非背包信息物品'), '变量事实层必须过滤坐标/权限/线索等纯信息物品。');
assert(facts.includes('坐标/权限/线索/情报等信息，不是可放入背包的实体物品'), '纯信息 item 必须被转为可读 warning 而不是进入背包。');
assert(registry.includes('isInformationOnlyBackpackValue'), '旧变量命令 push 背包也必须过滤纯信息物品。');
assert(registry.includes('坐标、位置、权限信息、线索、情报或消息不是实体背包物品'), '旧变量命令过滤原因必须说明坐标/线索不是物品。');
assert(promptModules.includes('VARIABLE_SYSTEM_WORLDBOOK_APPENDIX'), '内置变量提示词模块必须注册新的变量附加边界。');
assert(variablePromptContract.includes("factType: 'item'") && variablePromptContract.includes("landing: '旅人.背包'"), '唯一变量 contract 必须登记 item 的正式落点。');
assert(variablePromptContract.includes('必须是正文实际获得的实体物品'), '唯一变量 contract 必须要求 item 是正文实际获得的实体物品。');
assert(variablePromptContract.includes('坐标、路线、权限、口令、情报、消息和地址等信息本身不是背包物品'), '唯一变量 contract 必须明确纯信息不是实体背包物品。');
assert(variableOutputFormat.includes('item') && variableOutputFormat.includes('事实协议已经覆盖'), '变量输出格式必须把 item 纳入事实协议并禁止重复旧命令。');

console.log('inventory variable regression ok');
