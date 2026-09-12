import assert from 'node:assert/strict';
import fs from 'node:fs';

const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const variableRuntime = fs.readFileSync('services/variableRuntime.ts', 'utf8');
const variableDrawer = fs.readFileSync('components/features/Variable/VariableDrawer.tsx', 'utf8');
const variableManager = fs.readFileSync('components/features/Settings/VariableManager.tsx', 'utf8');

const callStart = variableModel.indexOf('export async function callVariableModel');
const callEnd = variableModel.indexOf('function checkVariableModelProtocol', callStart);
assert(callStart >= 0 && callEnd > callStart, '找不到变量模型单次请求实现。');
const callBody = variableModel.slice(callStart, callEnd);

assert.equal((callBody.match(/\(\) => requestOnce\(\[/g) ?? []).length, 1, '普通变量处理只能发起一次语义请求。');
assert(callBody.includes('ensureVariableProtocolFallback'), '协议不完整时必须在本地安全兜底。');
assert(!callBody.includes('变量模型协议修复'), '不得为协议修复发起第二次变量请求。');
assert(!callBody.includes('变量模型覆盖复审'), '不得发起 coverage follow-up。');

for (const retired of [
  'reviewVariableModelCoverage',
  'buildVariableCoverageReviewPrompt',
  'detectCoverageCandidates',
  'mergeVariableFacts',
  'replaceVariableFactsBlock',
  'TIME_COVERAGE_CUE_RE',
  'LOCATION_COVERAGE_CUE_RE',
  'ITEM_COVERAGE_CUE_RE',
  'NPC_STATE_COVERAGE_CUE_RE',
  'supplementedTypes',
  'unresolvedTypes',
]) {
  assert(!variableModel.includes(retired), `变量模型不得残留 coverage 实现：${retired}`);
}

assert(!sendWorkflow.includes('coverageReport'), '普通工作流不得构造 coverage 回执。');
assert(!sendWorkflow.includes('unresolvedCoverage'), '普通工作流不得根据 coverage 改写任务状态。');
assert(!variableRuntime.includes('coverage?.reviewAttempted'), 'linker 批次报告不得生成 coverage 文案。');
assert(!variableDrawer.includes('coverage?.unresolvedTypes'), '变量抽屉不得用旧 coverage 控制状态。');
assert(!variableManager.includes('coverage?.unresolvedTypes'), '历史修复中心不得用旧 coverage 控制状态。');

console.log('VARIABLE_SINGLE_REQUEST_REGRESSION_OK');
