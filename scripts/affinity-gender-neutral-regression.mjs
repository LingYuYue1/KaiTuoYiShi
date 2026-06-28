import fs from 'node:fs';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

const variableWorldbook = read('data/variableWorldbook.ts');
const variableCot = read('prompts/cot/variableCot.ts');
const variableModel = read('services/ai/variableModel.ts');
const variableOutputFormat = read('prompts/cot/variableOutputFormat.ts');
const builtinWorldbook = read('data/builtinWorldbookConfig.ts');

assert(variableWorldbook.includes('不看玩家性别、NPC 性别、同性/异性线路或 NSFW 开关'), '变量世界书应明确好感审计性别中性。');
assert(variableWorldbook.includes('男性 NPC 的感谢、信任、并肩作战、兑现承诺、主动袒露等正向证据'), '变量世界书应补充男性 NPC 正向好感同权重。');
assert(variableCot.includes('不因 NPC 是男性/女性、玩家是男性/女性、同性/异性线或是否走成人向而改变好感度门槛或权重'), 'COT 应明确好感审计不受性别影响。');
assert(variableModel.includes('affinityDelta / affinitySet 的审计一视同仁') || variableOutputFormat.includes('affinityDelta / affinitySet 的审计一视同仁'), '变量模型应包含性别中性的好感审计提醒。');
assert((variableModel.includes('"npc_danheng"') || variableOutputFormat.includes('"npc_danheng"')) && (variableModel.includes('"affinityDelta":2') || variableOutputFormat.includes('"affinityDelta":2')) && (variableModel.includes('丹恒在玩家按约带回星核调查线索后') || variableOutputFormat.includes('丹恒在玩家按约带回星核调查线索后')), '变量模型应包含男性 NPC 好感示例。');
assert(!builtinWorldbook.includes('女主规划'), '内置世界书不应再出现女主规划。');
assert(builtinWorldbook.includes('角色关系规划'), '内置世界书应改为角色关系规划。');

console.log('affinity-gender-neutral regression passed');
