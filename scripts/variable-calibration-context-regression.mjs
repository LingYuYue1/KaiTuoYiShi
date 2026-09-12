import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = await fs.readFile(path.join(root, 'hooks/useGame/sendWorkflow.ts'), 'utf8');
const runtimeSource = await fs.readFile(path.join(root, 'services/variableRuntime.ts'), 'utf8');
const requestStart = source.indexOf('const { rawText } = await callVariableModel');
const requestEnd = source.indexOf("failureStage = 'parse'", requestStart);
assert(requestStart >= 0 && requestEnd > requestStart, '找不到普通变量模型请求构造边界');
const requestBlock = source.slice(requestStart, requestEnd);

for (const fragment of [
  'mode: params.mode',
  'sourceEvidenceId,',
  'targetTurn: params.turnAfter - 1',
  'targetTurnId: params.turnId',
  'targetMessageId: params.targetMessageId',
  'targetUserMessageId: params.targetUserMessageId',
  'maxPhoneSeedsPerTurn: state.gameSettings.手机系统.maxSeedsPerTurn',
]) {
  assert(requestBlock.includes(fragment), `普通校准请求缺少上下文字段：${fragment}`);
}

const analysisStart = source.indexOf('const projection = linkVariableTurn({', requestEnd);
const analysisEnd = source.indexOf("failureStage = 'commit'", analysisStart);
assert(analysisStart >= 0 && analysisEnd > analysisStart, '找不到变量 linker 构造边界');
const analysisBlock = source.slice(analysisStart, analysisEnd);
for (const fragment of ['sourceEvidenceId,', 'mode: params.mode', 'maxPhoneSeedsPerTurn: state.gameSettings.手机系统.maxSeedsPerTurn']) {
  assert(analysisBlock.includes(fragment), `变量 linker 缺少上下文字段：${fragment}`);
}

const successBatchStart = source.indexOf('const batch = buildVariableBatchFromProjection(', analysisEnd);
const successBatchEnd = source.indexOf('const roots =', successBatchStart);
assert(successBatchStart >= 0 && successBatchEnd > successBatchStart, '找不到成功批次构造边界');
assert(runtimeSource.includes('sourceEvidenceId: analysis.sourceEvidenceId'), '成功批次必须继承 linker 的 sourceEvidenceId');

const failureBatchStart = source.lastIndexOf('const batch: 变量命令批次 = {');
assert(failureBatchStart > successBatchStart, '找不到失败批次构造边界');
assert(source.slice(failureBatchStart).includes('sourceEvidenceId,'), '失败批次必须保留 sourceEvidenceId');

console.log('VARIABLE_CALIBRATION_CONTEXT_REGRESSION_OK');
