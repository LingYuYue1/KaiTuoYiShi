import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  const source = bundled.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const retention = await loadBundledModule('utils/longSessionRetention.ts');
const deltaStorage = await loadBundledModule('utils/saveDeltaStorage.ts');
const imageCompactor = await loadBundledModule('utils/saveImageCompactor.ts');

const {
  DETAILED_CHAT_TURNS,
  DETAILED_VARIABLE_BATCHES,
  SUMMARY_VARIABLE_BATCHES,
  compactChatHistoryForLongSession,
  compactVariableBatchHistory,
} = retention;
const {
  buildDeltaOnlyStoredSave,
  buildSaveNodeDeltaRecord,
  restoreSaveFromDelta,
} = deltaStorage;
const { compactDuplicatedSaveImages } = imageCompactor;

function makeSnapshot(turn) {
  return {
    旅人: { 姓名: '开拓者', 等级: turn },
    世界: { 当前地点: `地点-${turn}` },
    记忆: { longTermMemories: [{ id: `memory-${turn}`, content: '必须保留' }] },
    NPC: [{ id: 'npc-1', name: '三月七' }],
    新闻: [{ id: `news-${turn}` }],
    剧情: [{ id: `plot-${turn}` }],
    variableBatches: [],
    turnCount: turn,
  };
}

function makeChatHistory(turns) {
  const debugText = 'd'.repeat(4096);
  const history = [];
  for (let turn = 1; turn <= turns; turn += 1) {
    history.push({
      id: `user-${turn}`,
      role: 'user',
      content: `玩家输入-${turn}`,
      timestamp: turn * 2 - 1,
    });
    history.push({
      id: `assistant-${turn}`,
      role: 'assistant',
      content: `正文-${turn}`,
      timestamp: turn * 2,
      parsedResponse: {
        thinking: debugText,
        body: `正文-${turn}`,
        memory: debugText,
        commands: { 世界: { 当前地点: `地点-${turn}` } },
        worldEvents: [`事件-${turn}`],
        actionOptions: [`行动-${turn}`],
        variableDraft: debugText,
        storyPlan: debugText,
        awakenInvite: '',
        awakenQuestions: turn === 1 ? '旧命途题目' : '',
        awakenJudgement: '',
        awakenPathId: turn === 1 ? 'hunt' : '',
        rawText: debugText,
      },
      debugContext: {
        systemPrompt: debugText,
        messages: [{ role: 'user', content: debugText }],
      },
      narrativeImages: [{ id: `image-${turn}`, dataUrl: `asset:image-${turn}` }],
      preTurnSnapshot: makeSnapshot(turn),
      inputTokens: 1000,
      outputTokens: 2000,
      responseDurationSec: 3,
    });
  }
  return history;
}

for (const turns of [170, 500]) {
  const history = makeChatHistory(turns);
  const compacted = compactChatHistoryForLongSession(history);
  const assistants = compacted.filter((message) => message.role === 'assistant');
  assert.equal(assistants.filter((message) => message.debugContext).length, DETAILED_CHAT_TURNS);
  assert.equal(compacted.filter((message) => message.preTurnSnapshot).length, 1);
  assert.equal(compacted.at(-1).preTurnSnapshot.turnCount, turns);
  assert.equal(compacted[0].content, '玩家输入-1');
  assert.equal(compacted[1].content, '正文-1');
  assert.equal(compacted[1].parsedResponse.body, '正文-1');
  assert.equal(compacted[1].narrativeImages[0].dataUrl, 'asset:image-1');
  assert.equal(compacted[1].parsedResponse.awakenQuestions, '旧命途题目');
  assert.equal(compacted[1].parsedResponse.awakenPathId, 'hunt');
  assert.equal(compacted[1].parsedResponse.rawText, '');
  assert.equal(compacted[1].debugContext, undefined);
}

const successfulHistory = compactChatHistoryForLongSession(makeChatHistory(30));
const failedGenerationSnapshot = makeSnapshot(31);
const failedGenerationHistory = compactChatHistoryForLongSession([
  ...successfulHistory,
  {
    id: 'user-31',
    role: 'user',
    content: '生成失败前的玩家输入',
    timestamp: 61,
    preTurnSnapshot: failedGenerationSnapshot,
  },
]);
assert.equal(failedGenerationHistory.filter((message) => message.preTurnSnapshot).length, 1);
assert.equal(failedGenerationHistory.at(-1).preTurnSnapshot, failedGenerationSnapshot);

const largeObjectValue = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`field-${index}`, 'x'.repeat(100)]));
const variableBatches = Array.from({ length: 140 }, (_, index) => ({
  id: `batch-${index}`,
  turn: index + 1,
  timestamp: index + 1,
  source: 'calibration',
  modelName: 'test-model',
  results: [
    { command: { action: 'set', key: '世界.当前地点', value: largeObjectValue }, ok: true },
    { command: { action: 'push', key: '记忆.longTermMemories', value: largeObjectValue }, ok: false, kind: 'error', reason: 'r'.repeat(1000) },
  ],
  report: 'p'.repeat(4000),
  rawText: 'raw'.repeat(4000),
}));
const compactedBatches = compactVariableBatchHistory(variableBatches);
assert.equal(compactedBatches.length, DETAILED_VARIABLE_BATCHES + SUMMARY_VARIABLE_BATCHES);
assert.equal(compactedBatches[0].id, 'batch-40');
for (const batch of compactedBatches.slice(0, SUMMARY_VARIABLE_BATCHES)) {
  assert.equal('rawText' in batch, false);
  assert.equal(batch.results.length, 1);
  assert.equal(batch.results[0].ok, false);
  assert.match(batch.results[0].command.value, /旧对象值已省略/);
  assert(batch.results[0].reason.length < 1000);
  assert.match(batch.report, /旧批次摘要/);
  assert.equal(batch.retentionSummary.totalResults, 2);
}
assert.equal(compactedBatches.at(-1), variableBatches.at(-1));
assert.equal(compactedBatches.at(-DETAILED_VARIABLE_BATCHES), variableBatches.at(-DETAILED_VARIABLE_BATCHES));
const compactedBatchesAgain = compactVariableBatchHistory(compactedBatches);
assert(compactedBatchesAgain.every((batch, index) => batch === compactedBatches[index]), '变量批次归一化必须幂等');

const baseHistory = compactChatHistoryForLongSession(makeChatHistory(500));
const baseSave = {
  id: 10,
  type: 'auto',
  timestamp: 1000,
  turnCount: 500,
  旅人: { 姓名: '开拓者', 背包: [{ id: 'item-1' }], 战技列表: [{ id: 'skill-1' }] },
  世界: { 当前地点: '旧地点' },
  记忆: { longTermMemories: [{ id: 'memory-1', content: '保留' }] },
  NPC: [{ id: 'npc-1', name: '三月七' }],
  相册: { assets: [], entries: [], tasks: [] },
  新闻: [],
  剧情: [],
  variableBatches: compactedBatches,
  queueTasks: [],
  gameSettings: { autoSave: true },
  apiSettings: { configs: [] },
  theme: 'light',
  chatHistory: baseHistory,
  saveTree: { rootId: 'root-1', nodeId: 'node-base', createdAt: 1000 },
};
const currentSave = {
  ...baseSave,
  id: 11,
  timestamp: 1001,
  turnCount: 501,
  世界: { 当前地点: '新地点' },
  chatHistory: [...baseHistory, { id: 'user-501', role: 'user', content: '继续', timestamp: 1001 }],
  saveTree: { rootId: 'root-1', nodeId: 'node-current', parentNodeId: 'node-base', createdAt: 1001 },
};
const deltaRecord = buildSaveNodeDeltaRecord(currentSave, 11, {
  baseSave,
  baseSaveId: 10,
  storageMode: 'delta',
});
assert(deltaRecord?.deltaPayload);
assert.equal(deltaRecord.deltaPayload.chatHistoryMode, 'append');
assert.equal(deltaRecord.deltaPayload.chatHistory.length, 1);
assert.deepEqual(deltaRecord.deltaPayload.fields.世界, currentSave.世界);
const placeholder = buildDeltaOnlyStoredSave(currentSave, 10);
assert.equal(placeholder.chatHistory.length, 0);
assert.equal(placeholder.旅人.背包.length, 0);
assert.equal(placeholder.旅人.战技列表.length, 0);
const restored = restoreSaveFromDelta(baseSave, placeholder, deltaRecord);
assert.equal(restored.chatHistory.length, currentSave.chatHistory.length);
assert.equal(restored.chatHistory.at(-1).content, '继续');
assert.equal(restored.世界.当前地点, '新地点');
assert.deepEqual(restored.旅人.背包, baseSave.旅人.背包);
assert.deepEqual(restored.记忆, baseSave.记忆);

const albumData = `data:image/png;base64,${'a'.repeat(1024 * 1024)}`;
const sharedImageHolder = { wallpaper: albumData };
const imageSave = {
  ...baseSave,
  手机: sharedImageHolder,
  智库: sharedImageHolder,
  相册: {
    assets: [{ id: 'asset-1', dataUrl: albumData }],
    entries: [{ id: 'entry-1', assetId: 'asset-1' }],
    tasks: [],
  },
};
const imageCompacted = compactDuplicatedSaveImages(imageSave);
assert.notEqual(imageCompacted, imageSave);
assert.equal(imageCompacted.相册, imageSave.相册);
assert.equal(imageCompacted.手机, imageCompacted.智库);
assert.equal(imageCompacted.手机.wallpaper, 'asset:asset-1');
assert.equal(imageSave.手机.wallpaper, albumData);

const dbSource = fs.readFileSync('services/dbService.ts', 'utf8');
const deltaSource = fs.readFileSync('utils/saveDeltaStorage.ts', 'utf8');
const imageSource = fs.readFileSync('utils/saveImageCompactor.ts', 'utf8');
assert(!dbSource.includes('loadAllDeltaRecords'));
assert(!dbSource.includes('SAVE_NODE_DELTAS_STORE).getAll'));
assert(dbSource.includes('const initialStoredData = deltaBase'));
assert(dbSource.includes('scanIndexedDeltaRecords'));
assert(!deltaSource.includes('JSON.stringify(a)') && !deltaSource.includes('JSON.stringify(b)'));
assert(!imageSource.includes('JSON.parse(JSON.stringify(save))'));
assert(imageSource.includes('new WeakMap()'));

console.log('[long-session-oom-regression] ok');
