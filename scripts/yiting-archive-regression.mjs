import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const archive = fs.readFileSync('services/yitingArchive.ts', 'utf8');
const retrieval = fs.readFileSync('services/yitingRetrieval.ts', 'utf8');
const workflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

assert(archive.includes('gameClock?: string'), '忆庭纪要来源必须包含小时分钟字段。');
assert(archive.includes('formatSourceTime(source)'), '忆庭纪要必须组合年月日与小时分钟。');
assert(archive.includes('prefixLineWithTime'), '忆庭概要每条要点必须带发生时间前缀。');
assert(archive.includes('SUMMARY 必须使用规整格式'), '忆庭精炼提示词必须要求规整摘要格式。');
assert(archive.includes('不要抄写正文'), '忆庭精炼提示词必须禁止复制正文。');
assert(archive.includes('BODY 是备用详细纪要，不是原文层'), '忆庭精炼必须区分 BODY 与真实原文层。');
assert(archive.includes('isArchiveNoiseLine'), '忆庭纪要必须过滤动态世界、行动选项等系统噪音。');
assert(archive.includes('禁止把“动态世界”“行动选项”“后续选项”'), '忆庭精炼提示词必须禁止系统噪音进入纪要。');
assert(!archive.includes('source.worldEvents?.length ? `动态世界'), '忆庭纪要原文层不得拼入动态世界系统材料。');
assert(!archive.includes('source.actionOptions?.length ? `行动选项'), '忆庭纪要原文层不得拼入行动选项系统材料。');
assert(!archive.includes('source.actionOptions?.length ? `后续选项'), '忆庭纪要兜底摘要不得拼入后续选项系统材料。');
assert(workflow.includes('gameClock: effectiveWorld?.当前时间'), '忆庭入库必须传入当前小时分钟。');

assert(retrieval.includes('这里注入的是概要层纪要，不是正文原文'), '忆庭召回注入必须说明只注入概要层。');
assert(retrieval.includes('buildBriefFromRaw'), '忆庭召回必须有旧档原文摘要兜底。');
assert(!retrieval.includes('entry.原文 || entry.摘要 ||'), '忆庭召回不得优先把原文注入主剧情。');
assert(!retrieval.includes('强回忆用于恢复原文细节'), '忆庭召回口径不得再鼓励恢复正文原文。');
assert(pkg.includes('test:yiting-archive'), 'package.json 必须提供忆庭纪要回归脚本。');

console.log('yiting archive regression ok');
