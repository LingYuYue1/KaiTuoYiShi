import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`nsfw-archive-completion regression failed: ${message}`);
    process.exit(1);
  }
}

const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variablePath = fs.readFileSync('utils/variablePath.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variablePromptContract = fs.readFileSync('utils/variablePromptContract.ts', 'utf8');

assert(variableFacts.includes('const experiences = mergeUniqueTexts(current.经历, fact.experiences)'), 'nsfw_archive fact 必须合并经历。');
assert(variableFacts.includes('archive.经历 = experiences'), 'nsfw_archive fact 必须写入经历字段。');
assert(variableFacts.includes('const current = existing.NSFW档案 ?? {}'), 'nsfw_archive fact 必须读取已有 NSFW 档案。');
assert(variableFacts.includes('const femaleIncoming = fact.femaleBodyArchive ?? {}'), 'nsfw_archive fact 必须读取新增女性身体档案。');
assert(variableFacts.includes('if (Object.keys(femaleIncoming).length) archive.女性身体档案 = femaleIncoming'), '女性身体档案必须只生成有内容的局部 patch。');
assert(variableFacts.includes('if (Object.keys(maleIncoming).length) archive.男性身体档案 = maleIncoming'), '男性身体档案必须只生成有内容的局部 patch。');
assert(variableFacts.includes('NSFW 档案路径的 set 会深合并'), 'NSFW 档案局部 patch 必须交由路径层深合并。');
assert(variablePath.includes('深合并对象') && variablePath.includes('obj[last], nextValue'), '变量路径层必须深合并已有 NSFW 身体档案。');

assert(variableModel.includes('buildVariablePromptContractSection'), '变量模型必须通过唯一 contract 注入 nsfw_archive 协议。');
assert(variablePromptContract.includes("factType: 'nsfw_archive'") && variablePromptContract.includes("landing: 'NPC[id].NSFW档案'"), '唯一 contract 必须保留明确事实驱动的 nsfw_archive 协议。');
assert(variablePromptContract.includes('只写正文明确形成、可供后续承接的档案事实；不创建普通档案基线或空壳'), 'NSFW 档案只能依据明确事实写入。');
assert(!variableModel.includes('NSFW 基线档案补建') && !variableModel.includes('baselineCandidates'), '变量模型不得接收或提示 NSFW 基线补建。');

console.log('nsfw-archive-completion regression passed.');
