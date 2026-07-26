import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`nsfw-archive-completion regression failed: ${message}`);
    process.exit(1);
  }
}

const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');

assert(variableFacts.includes('const experiences = mergeUniqueTexts(current.经历, fact.experiences)'), 'nsfw_archive fact 必须合并经历。');
assert(variableFacts.includes('archive.经历 = experiences'), 'nsfw_archive fact 必须写入经历字段。');
assert(variableFacts.includes('const currentFemale = current.女性身体档案 ?? {}'), 'nsfw_archive fact 必须读取已有女性身体档案。');
assert(variableFacts.includes('const femaleIncoming = fact.femaleBodyArchive ?? {}'), 'nsfw_archive fact 必须读取新增女性身体档案。');
assert(variableFacts.includes('女性私处: mergePreferredText(currentFemale.女性私处, femaleIncoming.女性私处)'), '女性身体档案必须合并女性私处字段。');
assert(variableFacts.includes('后庭: mergePreferredText(currentFemale.后庭, femaleIncoming.后庭)'), '女性身体档案必须合并后庭字段。');
assert(variableFacts.includes('体味: mergePreferredText(currentFemale.体味, femaleIncoming.体味)'), '女性身体档案必须合并体味字段。');
assert(variableFacts.includes('男性器: mergePreferredText(currentMale.男性器, maleIncoming.男性器)'), '男性身体档案必须合并男性器字段。');
assert(variableFacts.includes('if (pruneEmptyObject(femaleArchive)) archive.女性身体档案 = femaleArchive'), '空女性身体档案不得写成空对象。');
assert(variableFacts.includes('if (pruneEmptyObject(maleArchive)) archive.男性身体档案 = maleArchive'), '空男性身体档案不得写成空对象。');

assert(variableModel.includes('身体档案、经历'), 'NSFW 基线补建提示必须要求经历字段。');
assert(variableModel.includes('女性身体档案尽量补齐：胸部、女性私处、后庭、体态、体味'), 'NSFW 基线补建提示必须要求补齐女性身体档案。');
assert(variableModel.includes('没有正文证据时不写经历、边界、偏好、敏感点、标签或占位文案'), 'NSFW 基线不得要求模型编造占位经历。');

console.log('nsfw-archive-completion regression passed.');
