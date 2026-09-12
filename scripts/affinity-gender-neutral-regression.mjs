import fs from 'node:fs';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

const variableWorldbook = read('data/variableWorldbook.ts');
const variablePromptContract = read('utils/variablePromptContract.ts');
const builtinWorldbook = read('data/builtinWorldbookConfig.ts');

assert(variableWorldbook.includes('不看玩家性别、NPC 性别、同性/异性线路或 NSFW 开关'), '变量世界书应明确好感审计性别中性。');
assert(variableWorldbook.includes('男性 NPC 的感谢、信任、并肩作战、兑现承诺、主动袒露等正向证据'), '变量世界书应补充男性 NPC 正向好感同权重。');
assert(
  variablePromptContract.includes('相同强度的互动对不同性别 NPC 使用同一好感标准'),
  '唯一变量 contract 应明确好感审计不受性别影响。',
);
assert(variablePromptContract.includes("field('npc', 'affinityDelta'") && variablePromptContract.includes("field('npc', 'affinitySet'"), '唯一变量 contract 必须登记好感增量与绝对值字段。');
assert(!builtinWorldbook.includes('女主规划'), '内置世界书不应再出现女主规划。');
assert(builtinWorldbook.includes('角色关系规划'), '内置世界书应改为角色关系规划。');

console.log('affinity-gender-neutral regression passed');
