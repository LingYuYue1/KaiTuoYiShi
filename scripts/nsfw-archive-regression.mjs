import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const variableCommand = fs.readFileSync('models/variableCommand.ts', 'utf8');
const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const nsfwWorldbook = fs.readFileSync('data/nsfwWorldbook.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');

assert(variableCommand.includes("'nsfw_archive'"), '变量事实类型必须包含 nsfw_archive。');
assert(variableCommand.includes('NSFW档案变量事实'), '必须定义 NSFW 档案变量事实结构。');
assert(variableFacts.includes("NSFW档案: 'nsfw_archive'"), '事实解析必须识别中文 NSFW档案。');
assert(variableFacts.includes("nsfw_archive: 'nsfw_archive'"), '事实解析必须识别 nsfw_archive。');
assert(variableFacts.includes("fact.type === 'nsfw_archive'"), '事实转命令必须处理 nsfw_archive。');
assert(variableFacts.includes('NPC[id=${existing.id}].NSFW档案'), 'nsfw_archive 必须转为 NPC NSFW档案写入。');
assert(variableFacts.includes('isNsfwBlockedNpc'), '事实层必须屏蔽帕姆/非人/怪物等 NSFW 目标。');
assert(variableFacts.includes('NSFW_BLOCKED_CANONICAL_NAMES'), '必须有原著名屏蔽名单。');
assert(variableFacts.includes('帕姆'), '屏蔽名单必须覆盖帕姆。');
assert(variableFacts.includes('男性身体档案'), 'nsfw_archive 必须支持男性身体档案字段。');
assert(variableFacts.includes('女性身体档案'), 'nsfw_archive 必须支持女性身体档案字段。');

assert(variableModel.includes('### NSFW 档案：nsfw_archive'), '变量模型提示词必须说明 nsfw_archive。');
assert(variableModel.includes('帕姆、佩佩、怪物'), '变量模型提示词必须禁止帕姆/非人对象 NSFW 档案。');
assert(variableWorldbook.includes('nsfw_archive'), '变量世界书必须要求优先使用 nsfw_archive。');
assert(variableWorldbook.includes('帕姆、佩佩、怪物'), '变量世界书必须禁止帕姆/非人对象 NSFW 档案。');
assert(nsfwWorldbook.includes('帕姆、佩佩、怪物'), 'NSFW 世界书必须禁止帕姆/非人对象。');

assert(sendWorkflow.includes('getNsfwBlockedCommandReason'), '旧 NSFW 变量命令也必须经过目标屏蔽。');
assert(sendWorkflow.includes('非人/生物形态/怪物/机械'), '旧命令屏蔽原因必须覆盖非人/生物形态/怪物/机械。');

console.log('nsfw archive regression ok');
