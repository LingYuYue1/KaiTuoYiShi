import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const queueModel = fs.readFileSync('models/queueTask.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const batchStatus = fs.readFileSync('utils/variableBatchStatus.ts', 'utf8');
const useGame = fs.readFileSync('hooks/useGame.ts', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const drawer = fs.readFileSync('components/features/Variable/VariableDrawer.tsx', 'utf8');

assert(queueModel.includes('targetMessageId?: string'), 'queue task records must store targetMessageId for narrative image retry.');
assert(queueModel.includes('targetBatchId?: string'), 'queue task records must store targetBatchId for variable retry.');
assert(sendWorkflow.includes('export async function retryQueueTask'), 'send workflow must export a queue task retry entry.');
assert(sendWorkflow.includes("task.id === 'narrative_image_parse' || task.id === 'narrative_image_generate'"), 'retry entry must support narrative image parse/generate.');
assert(sendWorkflow.includes('await regenerateNarrativeImagesForMessage(state, getActiveConfig, targetMessageId)'), 'narrative image retry must reuse the existing per-message regeneration path.');
assert(sendWorkflow.includes('async function retryNewsQueueTask'), 'news retry helper must exist.');
assert(sendWorkflow.includes('本次不受回合间隔限制'), 'manual news retry must explicitly bypass interval gating.');
assert(sendWorkflow.includes('async function retryVariableQueueTask'), 'variable retry helper must exist.');
assert(sendWorkflow.includes('findRetryableVariableBatch'), 'variable retry must locate a safe retryable batch.');
assert(batchStatus.includes('!hasSuccessfulResult') && batchStatus.includes("result.kind !== 'warning' && result.kind !== 'rejected'"), 'retry helper must reject mixed-success, warning-only and policy-rejected batches.');
assert(batchStatus.includes('hasErrorDiagnostic') && batchStatus.includes('supersededBatchIds'), 'retry helper must support diagnostic-only failure and superseded batch protection.');
assert(sendWorkflow.includes('targetMessageId: messageId'), 'narrative image queue records must carry message id.');
assert(useGame.includes('handleRetryQueueTask'), 'useGame must expose queue retry action.');
assert(
  app.includes('onRetryTask={actions.handleRetryQueueTask}') || app.includes('onRetryTask={(task, mode)'),
  'App must pass queue retry action to drawer.',
);
assert(drawer.includes('onRetryTask?: (task: 队列任务记录, mode: '), 'VariableDrawer props must accept queue retry callback.');
assert(drawer.includes("id === 'variable' || id === 'news' || id === 'narrative_image_parse' || id === 'narrative_image_generate'"), 'drawer must only show retry controls for supported tasks.');
assert(drawer.includes('重试') && drawer.includes('重生成'), 'drawer must show retry and reroll buttons.');

const root = process.cwd();
const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'variable-queue-retry-'));
const outfile = path.join(tempDir, 'batch-status.mjs');
await esbuild.build({
  entryPoints: [path.join(root, 'utils/variableBatchStatus.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
  plugins: [{
    name: 'workspace-alias',
    setup(build) {
      build.onResolve({ filter: /^@\// }, async (args) => {
        const base = path.join(root, args.path.slice(2));
        for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`]) {
          try {
            await fsp.access(candidate);
            return { path: candidate };
          } catch {
            // keep looking
          }
        }
        return { path: base };
      });
    },
  }],
});

try {
  const { findRetryableVariableBatch } = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const command = (key) => ({ action: 'set', key, value: 'value' });
  const failedResult = (key = '世界.当前天气', kind = 'error') => ({ ok: false, kind, command: command(key) });
  const successResult = (key = '世界.当前时间') => ({ ok: true, kind: 'command', command: command(key) });
  const errorDiagnostic = { code: 'REQUEST_FAILED', severity: 'error', stage: 'request', message: 'request failed' };

  const mixed = { id: 'mixed', turn: 1, timestamp: 1, source: 'calibration', results: [successResult(), failedResult()] };
  assert(findRetryableVariableBatch([mixed], 'mixed') === undefined, '成功+失败混合批次不得整批重试。');

  const diagnosticOnly = { id: 'diagnostic-only', turn: 2, timestamp: 2, source: 'calibration', results: [], diagnostics: [errorDiagnostic] };
  assert(findRetryableVariableBatch([diagnosticOnly], 'diagnostic-only') === diagnosticOnly, '只有 error diagnostic 的批次必须可重试。');

  const warningOnly = { id: 'warning-only', turn: 3, timestamp: 3, source: 'calibration', results: [failedResult('世界.当前天气', 'warning')] };
  const rejectedOnly = { id: 'rejected-only', turn: 4, timestamp: 4, source: 'calibration', results: [failedResult('NPC[id=npc].NSFW档案', 'rejected')] };
  assert(findRetryableVariableBatch([warningOnly], 'warning-only') === undefined, 'warning-only 批次不得重试。');
  assert(findRetryableVariableBatch([rejectedOnly], 'rejected-only') === undefined, 'policy-rejected-only 批次不得重试。');

  const old = { id: 'old', turn: 5, timestamp: 5, source: 'calibration', results: [failedResult()] };
  const replacement = { id: 'replacement', turn: 5, timestamp: 6, source: 'calibration', supersedesBatchId: 'old', results: [failedResult()] };
  assert(findRetryableVariableBatch([old, replacement], 'old') === undefined, '被 supersede 的旧批次不得重试。');
  assert(findRetryableVariableBatch([old, replacement], 'replacement') === replacement, '失败的新 superseding 批次仍可继续重试。');

  const latestEligible = { id: 'latest-eligible', turn: 6, timestamp: 7, source: 'calibration', results: [failedResult()] };
  assert(findRetryableVariableBatch([warningOnly, latestEligible]) === latestEligible, '未指定目标时应选择最近可重试批次。');
} finally {
  await fsp.rm(tempDir, { recursive: true, force: true });
}

console.log('queue task retry regression ok');
