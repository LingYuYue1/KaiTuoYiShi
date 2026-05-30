import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const executor = fs.readFileSync('utils/variableExecutor.ts', 'utf8');
const registry = fs.readFileSync('utils/variableRegistry.ts', 'utf8');
const facts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const promptModules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');
const variableCot = fs.readFileSync('prompts/cot/variableCot.ts', 'utf8');

assert(executor.includes('解析背包数量扣减目标'), '变量执行器必须识别背包数量扣减兼容命令。');
assert(executor.includes("tokens[0] !== '背包'") && executor.includes("tokens[2] !== '数量'"), '背包扣减兼容命令必须限定在 旅人.背包[...].数量。');
assert(executor.includes("cmd.action !== 'sub'"), '背包扣减兼容命令必须只处理 sub，避免误吞普通 set/push。');
assert(executor.includes('应用背包数量扣减命令(effectiveState.旅人') && executor.indexOf('应用背包数量扣减命令(effectiveState.旅人') < executor.indexOf('const validation = validateCommand(cmd, effectiveState)'), '单条变量执行必须在校验前处理背包扣减，避免缺物品时报找不到 id。');
assert(executor.includes('应用背包数量扣减命令(cursor.旅人') && executor.indexOf('应用背包数量扣减命令(cursor.旅人') < executor.indexOf('const validation = validateCommand(cmd, cursor)'), '批量变量执行必须在校验前处理背包扣减，避免缺物品时报找不到 id。');
assert(executor.includes('已忽略背包消耗：背包中没有'), '背包缺失消耗必须静默忽略并写入可读原因。');
assert(executor.includes('item.id, item.名称'), '背包 id 选择器必须兼容同名物品。');
assert(executor.includes('(item as unknown as Record<string, unknown>)[field]'), '背包扣减必须支持 名称 等字段选择器。');
assert(registry.includes("path: '旅人.背包'"), '背包 schema 必须继续保留。');
assert(facts.includes('是非背包信息物品'), '变量事实层必须过滤坐标/权限/线索等纯信息物品。');
assert(facts.includes('坐标/权限/线索/情报等信息，不是可放入背包的实体物品'), '纯信息 item 必须被转为可读 warning 而不是进入背包。');
assert(registry.includes('isInformationOnlyBackpackValue'), '旧变量命令 push 背包也必须过滤纯信息物品。');
assert(registry.includes('坐标、位置、权限信息、线索、情报或消息不是实体背包物品'), '旧变量命令过滤原因必须说明坐标/线索不是物品。');
for (const source of [variableModel, variableWorldbook, promptModules, variableCot]) {
  assert(source.includes('坐标') && source.includes('信息') && source.includes('实体'), '提示词必须明确坐标/权限/线索等信息不是实体背包物品。');
}

console.log('inventory variable regression ok');
