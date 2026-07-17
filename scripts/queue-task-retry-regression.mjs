import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const queueModel = fs.readFileSync('models/queueTask.ts', 'utf8');
const sendWorkflow = fs.readFileSync('src/kernel/workflows/sendWorkflow.ts', 'utf8');
const useGame = fs.readFileSync('hooks/useGame.ts', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const drawer = fs.readFileSync('components/features/Variable/VariableDrawer.tsx', 'utf8');
const chatModel = fs.readFileSync('models/chat.ts', 'utf8');

// ── Queue task retry entry (existing contract) ──
assert(queueModel.includes('targetMessageId?: string'), 'queue task records must store targetMessageId for narrative image retry.');
assert(queueModel.includes('targetBatchId?: string'), 'queue task records must store targetBatchId for variable retry.');
assert(sendWorkflow.includes('export async function retryQueueTask'), 'send workflow must export a queue task retry entry.');
assert(sendWorkflow.includes("task.id === 'narrative_image_parse' || task.id === 'narrative_image_generate'"), 'retry entry must support narrative image parse/generate.');
assert(
  sendWorkflow.includes('await regenerateNarrativeImagesForMessage(state, targetMessageId)') ||
    sendWorkflow.includes('await regenerateNarrativeImagesForMessage(state, getActiveConfig, targetMessageId)'),
  'narrative image retry must reuse the existing per-message regeneration path.',
);
assert(sendWorkflow.includes('async function retryNewsQueueTask'), 'news retry helper must exist.');
assert(sendWorkflow.includes('本次不受回合间隔限制'), 'manual news retry must explicitly bypass interval gating.');
assert(sendWorkflow.includes('async function retryVariableQueueTask'), 'variable retry helper must exist.');
assert(sendWorkflow.includes('findRetryableVariableBatch'), 'variable retry must locate a safe retryable batch.');
assert(sendWorkflow.includes('batch.results.every((result) => !result.ok)'), 'variable retry must only rerun fully failed batches to avoid duplicate successful commands.');
assert(sendWorkflow.includes('targetMessageId: messageId'), 'narrative image queue records must carry message id.');
assert(useGame.includes('handleRetryQueueTask'), 'useGame must expose queue retry action.');
assert(
  app.includes('onRetryTask={actions.handleRetryQueueTask}') || app.includes('onRetryTask={(task, mode)'),
  'App must pass queue retry action to drawer.',
);
assert(
  drawer.includes("onRetryTask?: (task: 队列任务记录, mode: 'retry' | 'reroll')") ||
    drawer.includes('onRetryTask?: (task: 队列任务记录, mode: '),
  'VariableDrawer props must accept queue retry callback.',
);
assert(
  drawer.includes("id === 'variable' || id === 'news' || id === 'narrative_image_parse' || id === 'narrative_image_generate'") ||
    drawer.includes("isRetryableQueueTask"),
  'drawer must only show retry controls for supported tasks.',
);
assert(drawer.includes('重试') && drawer.includes('重生成'), 'drawer must show retry and reroll buttons.');

// ── Issue 4: hard / soft protocol split ──
assert(sendWorkflow.includes('function getHardProtocolIssues'), 'must classify hard protocol issues separately.');
assert(sendWorkflow.includes('function getSoftProtocolIssues'), 'must classify soft protocol issues separately.');
assert(sendWorkflow.includes('function getMainProtocolIssues'), 'combined protocol helper may remain for messaging.');

// Hard: body required; thinking hard only when requireStepThinking
assert(
  /function getHardProtocolIssues[\s\S]*?缺少 <正文> 或正文为空[\s\S]*?if \(requireStepThinking\)[\s\S]*?缺少 <thinking>/.test(sendWorkflow),
  'hard issues must require body; thinking hard only under requireStepThinking.',
);
{
  const hardStart = sendWorkflow.indexOf('function getHardProtocolIssues');
  const softStart = sendWorkflow.indexOf('function getSoftProtocolIssues');
  assert(hardStart >= 0 && softStart > hardStart, 'hard classifier must precede soft classifier.');
  const hardBody = sendWorkflow.slice(hardStart, softStart);
  assert(!hardBody.includes('缺少 <短期记忆>'), 'hard classifier must not treat 短期记忆 as hard.');
  assert(!hardBody.includes('缺少 <动态世界>'), 'hard classifier must not treat 动态世界 as hard.');
  assert(!hardBody.includes('缺少 <变量草稿>'), 'hard classifier must not treat 变量草稿 as hard.');
  const softEnd = sendWorkflow.indexOf('function getMainProtocolIssues', softStart);
  const softBody = sendWorkflow.slice(softStart, softEnd > softStart ? softEnd : softStart + 800);
  assert(softBody.includes('缺少 <短期记忆>'), 'soft classifier must flag missing 短期记忆.');
  assert(softBody.includes('缺少 <动态世界>'), 'soft classifier must flag missing 动态世界.');
  assert(softBody.includes('缺少 <变量草稿>'), 'soft classifier must flag missing 变量草稿.');
  assert(softBody.includes('缺少 <thinking>'), 'soft classifier must flag empty thinking when body is valid.');
}

// Soft-accept path: do not retry solely on soft issues when body is valid
assert(sendWorkflow.includes('softProtocolIssuesForTurn'), 'must track soft protocol issues for the turn.');
assert(
  sendWorkflow.includes('协议部分字段缺失，已按正文提交'),
  'soft-accept must surface a short workflow / success detail hint.',
);
assert(
  sendWorkflow.includes('const hardProtocolIssues = getHardProtocolIssues') &&
    sendWorkflow.includes('if (hardProtocolIssues.length)'),
  'main loop must branch on hard protocol issues only for retry.',
);
assert(
  sendWorkflow.includes('softProtocolIssuesForTurn = softProtocolIssues'),
  'soft-only gaps must be recorded and the turn accepted.',
);

// Similarity rewrite is not a user-facing failure
assert(
  sendWorkflow.includes('主剧情与上一版过于相似，正在换写'),
  'similarity path must use rewrite language, not protocol-failure language.',
);
{
  const simIdx = sendWorkflow.indexOf('rerollSimilarity >= 0.86');
  assert(simIdx >= 0, 'similarity gate must remain.');
  const simBlock = sendWorkflow.slice(simIdx, simIdx + 1200);
  assert(simBlock.includes('正在换写'), 'similarity continue path must mention 换写.');
  assert(!simBlock.includes('failCount:'), 'similarity rewrite must not set failCount as a protocol failure.');
  assert(!simBlock.includes('协议不完整'), 'similarity rewrite must not use 协议不完整 fail language.');
}

// Final failed task failCount must not come solely from settings autoRetryCount
assert(
  !/pushQueueTask\(\s*state,\s*'main_story',\s*'failed',\s*\{[\s\S]*?failCount:\s*state\.gameSettings\.autoRetryOnError\s*\?\s*Math\.max\(1,\s*state\.gameSettings\.autoRetryCount\)\s*:\s*1/.test(sendWorkflow),
  'final failed main_story failCount must not use settings-only autoRetryCount formula.',
);
assert(
  sendWorkflow.includes('const finalFailCount = hardFailCount > 0 ? hardFailCount : 1') ||
    sendWorkflow.includes('const finalFailCount = Math.max(1, hardFailCount || mainAttemptCount || 1)'),
  'final failed task must use actual hard-failure / attempt count.',
);
assert(
  sendWorkflow.includes('failCount: finalFailCount') || sendWorkflow.includes('failCount: hardFailCount'),
  'failed queue task must publish actual failCount.',
);

// debugContext records soft issues
assert(chatModel.includes('softProtocolIssues?: string[]'), 'chat debugContext type must allow softProtocolIssues.');
assert(sendWorkflow.includes('softProtocolIssues: softProtocolIssuesForTurn'), 'debugContext must store soft protocol issues.');

console.log('queue task retry regression ok');
