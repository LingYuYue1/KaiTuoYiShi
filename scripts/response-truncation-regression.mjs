import fs from 'node:fs';

const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  !fs.readFileSync('services/ai/responseParser.ts', 'utf8').includes('isTruncatedResponse'),
  'responseParser 不应再导出抗截断判断函数。',
);

assert(
  !sendWorkflow.includes('isTruncatedResponse') &&
    !sendWorkflow.includes('主剧情工作流·抗截断') &&
    !sendWorkflow.includes('上一段输出被截断，请从中断处直接续写'),
  '主剧情必须停用截断续写自动重试，避免误判后污染历史。',
);

assert(
  !sendWorkflow.includes("|| result.finishReason === 'length' || result.finishReason === 'max_tokens'"),
  '主剧情抗截断禁止仅凭供应商 finishReason=length/max_tokens 触发续写。',
);

assert(
  sendWorkflow.includes('主剧情不再执行“截断续写”自动重试') &&
    sendWorkflow.includes('缺失标签统一交给 parseResponse/repairTags/sanitizeParsedResponse 兜底处理'),
  'sendWorkflow 必须记录停用抗截断续写的原因和兜底方式。',
);

console.log('response truncation regression ok');
