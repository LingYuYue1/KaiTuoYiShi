import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';

async function loadBundledModule(entryPoint) {
  const bundled = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
}

const {
  createMemoryRebuildTask,
  extractMemoryRebuildTurns,
  runMemoryRebuildTask,
  commitMemoryRebuildTask,
} = await loadBundledModule('services/memoryRebuild.ts');

function makeHistory(turns) {
  return Array.from({ length: turns }, (_, index) => {
    const turn = index + 1;
    return [
      { id: `user-${turn}`, role: 'user', content: `玩家输入-${turn}`, gameTime: String(turn), timestamp: turn * 2 - 1 },
      {
        id: `assistant-${turn}`,
        role: 'assistant',
        content: `正文-${turn}`,
        gameTime: String(turn),
        timestamp: turn * 2,
        parsedResponse: { body: `解析正文-${turn}` },
      },
    ];
  }).flat();
}

const history = makeHistory(31);
const extracted = extractMemoryRebuildTurns(history);
assert.equal(extracted.turns.length, 31, '必须按 gameTime 将 user/assistant 配成完整回合。');
assert.equal(extracted.turns[0].body, '解析正文-1', '重建材料优先使用 parsedResponse.body。');
assert.equal(extracted.turns.at(-1).turn, 31);

const rerollHistory = [
  { id: 'user-reroll', role: 'user', content: '玩家输入', gameTime: '1', timestamp: 1 },
  { id: 'assistant-old', role: 'assistant', content: '旧正文', gameTime: '1', timestamp: 2 },
  { id: 'assistant-new', role: 'assistant', content: '新正文', gameTime: '1', timestamp: 3 },
];
const rerollTurns = extractMemoryRebuildTurns(rerollHistory);
assert.equal(rerollTurns.turns.length, 1, '重roll重复回合只能生成一个重建回合。');
assert.equal(rerollTurns.turns[0].assistantId, 'assistant-new', '重roll应采用同回合最新 AI 正文。');

const disabled = createMemoryRebuildTask({ chatHistory: history, batchSize: 15 });
let disabledCalls = 0;
await runMemoryRebuildTask(disabled, {
  settings: { apiEnabled: false },
  summarizer: async () => {
    disabledCalls += 1;
    return { ok: true, summary: '不应调用' };
  },
});
assert.equal(disabled.status, 'blocked', 'API 总结关闭时批量重建必须明确阻断。');
assert.equal(disabledCalls, 0, 'API 总结关闭时不得调用 summarizer。');

const task = createMemoryRebuildTask({ chatHistory: history, batchSize: 3, range: { start: 4, end: 22 } });
assert.equal(task.turns.length, 19, '回合范围必须按回合号过滤。');
assert.equal(task.batches.length, 7, '批次应按 batchSize 切分，尾批也保留。');

let calls = 0;
const failing = async (source) => {
  calls += 1;
  if (calls === 2) return { ok: false, code: 'request_failed', message: '模拟失败', fallback: '本地兜底' };
  return { ok: true, summary: `${source.kind}:${source.items.join('|')}` };
};
await runMemoryRebuildTask(task, { settings: { apiEnabled: true }, summarizer: failing });
assert.equal(task.status, 'paused_failed', '任意批次失败后必须暂停。');
assert.equal(task.progress.completedBatches, 1, '失败批次不得计入已完成批次。');
assert.equal(task.failedBatch.items.length, 3, '失败快照必须保存该批次真正发送的全部材料。');
assert.match(task.failedBatch.items[0], /第 7 回合/);
assert.equal(task.staging.短期记忆.length, 1, '失败时已完成的 staging 必须保留。');

let retryCalls = 0;
await runMemoryRebuildTask(task, {
  settings: { apiEnabled: true, compressionThreshold: 15 },
  summarizer: async (source) => {
    retryCalls += 1;
    return { ok: true, summary: `${source.kind}:recovered:${retryCalls}` };
  },
});
assert.equal(task.status, 'ready', '失败批次修复后应继续直到 ready。');
assert.equal(task.progress.completedBatches, task.progress.totalBatches);
assert.equal(task.failedBatch, undefined);

const committed = commitMemoryRebuildTask(task);
assert.ok(committed, 'ready 任务才能提交 staging。');
assert.equal(task.status, 'committed');
assert.equal(committed.短期记忆.length, task.staging.短期记忆.length);
assert.equal(commitMemoryRebuildTask(task), null, '提交必须幂等保护，不能二次覆盖。');

const tierTask = createMemoryRebuildTask({ chatHistory: history, batchSize: 1 });
await runMemoryRebuildTask(tierTask, {
  settings: { apiEnabled: true, compressionThreshold: 3 },
  summarizer: async (source) => ({ ok: true, summary: `${source.kind}:summary` }),
});
assert.equal(tierTask.status, 'ready', '短期、中期、长期 staging 均应能顺序完成。');
assert.equal(tierTask.staging.短期记忆.length, 1, '31 个短期摘要按 3 条阈值应保留 1 条尾部摘要。');
assert.equal(tierTask.staging.中期记忆.length, 1, '中期 staging 应保留不足阈值的尾部摘要。');
assert.equal(tierTask.staging.长期记忆.length, 3, '中期达到阈值的批次应继续压入长期 staging。');

console.log('memory rebuild regression ok');
