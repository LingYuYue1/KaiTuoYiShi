import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const archive = fs.readFileSync('services/yitingArchive.ts', 'utf8');
const retrieval = fs.readFileSync('services/yitingRetrieval.ts', 'utf8');
const yitingCot = fs.readFileSync('prompts/cot/yitingCot.ts', 'utf8');
const chatModel = fs.readFileSync('models/chat.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const turnItem = fs.readFileSync('components/features/Chat/TurnItem.tsx', 'utf8');
const contextSnapshot = fs.readFileSync('hooks/useGame/contextSnapshot.ts', 'utf8');
const workflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

assert(archive.includes('gameClock?: string'), '忆庭纪要来源必须包含小时分钟字段。');
assert(archive.includes('formatSourceTime(source)'), '忆庭纪要必须组合年月日与小时分钟。');
assert(archive.includes('prefixLineWithTime'), '忆庭概要每条要点必须带发生时间前缀。');
assert(yitingCot.includes('SUMMARY 必须使用规整格式'), '忆庭精炼提示词必须要求规整摘要格式。');
assert(yitingCot.includes('不要抄写正文'), '忆庭精炼提示词必须禁止复制正文。');
assert(yitingCot.includes('BODY 是备用详细纪要，不是原文层'), '忆庭精炼必须区分 BODY 与真实原文层。');
assert(archive.includes('isArchiveNoiseLine'), '忆庭纪要必须过滤动态世界、行动选项等系统噪音。');
assert(yitingCot.includes('禁止把"动态世界""行动选项""后续选项"'), '忆庭精炼提示词必须禁止系统噪音进入纪要。');
assert(!archive.includes('source.worldEvents?.length ? `动态世界'), '忆庭纪要原文层不得拼入动态世界系统材料。');
assert(!archive.includes('source.actionOptions?.length ? `行动选项'), '忆庭纪要原文层不得拼入行动选项系统材料。');
assert(!archive.includes('source.actionOptions?.length ? `后续选项'), '忆庭纪要兜底摘要不得拼入后续选项系统材料。');
assert(workflow.includes('构建即时记忆条目'), '回合记忆写入必须使用对标参考项目的即时条目构建（时间+玩家输入+正文）。');
assert(workflow.includes('写入四段记忆'), '回合记忆写入必须使用对标参考项目的四段写入（合体存储+回忆档案推导+滑动窗口）。');
assert(workflow.includes('pendingRecallEntry'), '本回合回忆条目必须由写入四段记忆生成并汇入忆庭档案。');

// 对标既定方案：强回忆给原文、弱回忆给摘要，不做条数限制。
assert(retrieval.includes('强回忆原文注入 + 弱回忆摘要注入'), '对标既定方案：忆庭召回注入必须支持强回忆原文/弱回忆摘要分档策略。');
assert(!retrieval.includes('Top5原文+其余摘要注入'), '对标既定方案：忆庭召回不得保留Top5数量限制。');
assert(retrieval.includes('buildBriefFromRaw'), '忆庭召回必须有旧档原文摘要兜底。');
assert(!retrieval.includes('entry.原文 || entry.摘要 ||'), '忆庭召回不得优先把原文注入主剧情。');
assert(!retrieval.includes('强回忆用于恢复原文细节'), '忆庭召回口径不得再鼓励恢复正文原文。');
assert(chatModel.includes('yitingRecallRawText?: string'), '聊天 debugContext 必须保存忆庭模型原始返回。');
assert(chatModel.includes('yitingRecallUsedModel?: boolean'), '聊天 debugContext 必须保存忆庭是否调用模型。');
assert(sendWorkflow.includes('yitingRecallPreview: yitingPreview?.previewText ??'), '主流程必须保存忆庭召回预览。');
assert(sendWorkflow.includes('yitingRecallRawText: yitingPreview?.rawText ??'), '主流程必须保存忆庭模型 rawText。');
assert(sendWorkflow.includes('yitingRecallUsedModel: yitingPreview?.usedModel === true'), '主流程必须保存忆庭模型是否被调用。');
assert(turnItem.includes('【忆庭模型原始返回】'), '聊天请求上下文必须单独显示忆庭模型原始返回。');
assert(turnItem.includes('本回合未调用忆庭模型，使用本地摘要检索'), '聊天请求上下文必须说明忆庭未调用模型时走本地摘要检索或未触发。');
assert(contextSnapshot.includes('latestAssistantYitingDebugRecall'), '上下文页必须读取上一回合保存的忆庭 rawText。');
assert(contextSnapshot.includes('上一回合真实保存的忆庭召回诊断'), '忆庭上下文页必须显示上一回合真实保存的召回诊断。');
assert(pkg.includes('test:yiting-archive'), 'package.json 必须提供忆庭纪要回归脚本。');

console.log('yiting archive regression ok');
