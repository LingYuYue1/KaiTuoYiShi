// G1.3.2 save-delta-storage regression：真实运行 utils/saveDeltaStorage.ts 的增量构建/恢复往返，
// 并校验 G1.3.2 边界——delta 记录不得内嵌完整 catalog 原文或完整 V3 core；同 node 重建可复用 delta 基底。
// 生产模块经 esbuild 执行；save 结构与 G1.3.2 领域模型一致。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';

const FROZEN_HASHES = {
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
  'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
};

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }

async function main() {
  const delta = await bundleTs('utils/saveDeltaStorage.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  const baseSave = {
    id: 1,
    type: 'manual',
    timestamp: 100,
    turnCount: 5,
    旅人: { name: '开拓者', 别名: [] },
    世界: { 当前地点: '黑塔空间站' },
    chatHistory: [{ id: 'm1', role: 'user', content: '你好' }, { id: 'm2', role: 'assistant', content: '正文A' }],
    记忆: {},
    gameSettings: { 剧情节奏: '自由' },
    apiSettings: {},
    theme: 'deepspace',
    saveTree: { rootId: 'root_1', nodeId: 'node_1', parentNodeId: undefined, createdAt: 1 },
    // G1.3.2 可选的 runtime 元数据（存档只保存引用，不复制 catalog 原文）。
    saveRuntime: { runtimeBranchId: 'branch_b1', saveNodeId: 'save_node_1', runtimeRevision: 0, assetCatalogFingerprint: 'sha256:catalog_fp', coreFingerprint: 'sha256:core_fp', projectionFingerprint: 'sha256:proj_fp', outboxFingerprint: 'sha256:out_fp' },
  };
  const nextSave = {
    ...baseSave,
    id: 2,
    turnCount: 6,
    chatHistory: [...baseSave.chatHistory, { id: 'm3', role: 'user', content: '继续' }],
    世界: { 当前地点: '雅利洛-VI' },
    saveTree: { rootId: 'root_1', nodeId: 'node_2', parentNodeId: 'node_1', createdAt: 2 },
  };

  // ══ 场景 1：checkpoint 基底构建 delta 记录 + 恢复往返（真实运行） ══
  {
    const record = delta.buildSaveNodeDeltaRecord(nextSave, 2, { baseMode: 'checkpoint', baseSave, baseSaveId: 1, timestamp: 2 });
    assert(record.baseMode === 'checkpoint' && record.saveId === 2 && record.turnCount === 6, '场景1-delta 记录 checkpoint 模式');
    assert(record.parentNodeId === 'node_1', '场景1-delta 记录保留父节点');
    assert(typeof record.contentHash === 'string', '场景1-delta 记录含 contentHash');
    const restored = delta.restoreSaveFromDelta(baseSave, nextSave, record);
    assert(restored.世界.当前地点 === '雅利洛-VI' && restored.turnCount === 6, '场景1-恢复往返保留下一节点状态');
    recordPositive('场景1-checkpoint delta 往返', 'build/restore 一致');
  }

  // ══ 场景 2：delta-only 存储占位 + 识别 ══
  {
    const stored = delta.buildDeltaOnlyStoredSave(nextSave, 1);
    assert(delta.isDeltaOnlyStoredSave(stored) === true, '场景2-delta-only 占位可识别');
    assert(stored.saveStorage.mode === 'delta' && stored.saveStorage.baseSaveId === 1, '场景2-占位记录基底');
    recordPositive('场景2-delta-only 占位', 'mode=delta + baseSaveId=1');
  }

  // ══ 场景 3：G1.3.2 边界 —— delta 记录与占位存档不得内嵌完整 catalog 原文或完整 V3 core ══
  {
    const makeCatalogDefinition = () => ({ eventDefinitionId: 'e1', origin: 'catalog', title: 'x'.repeat(4000), actorEntityIds: [], targetEntityIds: [], dependencyDefinitionIds: [], completionPredicate: { predicateId: 'p', targetEntityIds: [], requiredFactTypes: [], requiredEvidenceKinds: [], payloadMatchers: [], minimumEvidenceCount: 1, deterministicKey: 'k', allowedOutcomes: [], failureOutcomes: [] }, scheduling: {}, allowedResolutionModes: [], replayPolicy: 'once', publicScope: { kind: 'private' }, consequenceDefinitionIds: [], definitionFingerprint: 'sha256:d' });
    // delta 记录只保存变化字段，绝不包含 eventDefinitions / 完整 catalog 载荷。
    const record = delta.buildSaveNodeDeltaRecord(nextSave, 2, { baseMode: 'checkpoint', baseSave, baseSaveId: 1, timestamp: 2 });
    const serialized = JSON.stringify(record);
    const catalogText = JSON.stringify({ eventDefinitions: [makeCatalogDefinition()] });
    assert(!serialized.includes('eventDefinitions'), '场景3-delta 记录不得内嵌 eventDefinitions（完整 catalog 原文）');
    assert(!serialized.includes('factLedger') && !serialized.includes('commandIdempotencyIndex'), '场景3-delta 记录不得内嵌完整 V3 core（事实账本/幂等索引）');
    assert(serialized.length < catalogText.length, '场景3-delta 记录体积必须小于完整 catalog 原文（只存指纹引用）');
    recordPositive('场景3-delta 不内嵌完整 catalog/core', 'delta 字节 < catalog 原文字节');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('save-delta-storage regression passed.');
  console.log('positive checks: ' + positives.length);
  for (const r of positives) console.log('  + ' + r.name + ': ' + r.detail);
  console.log('tamper rejections: ' + rejections.length);
  for (const r of rejections) console.log('  - ' + r.name + ': rejected (' + r.errorMessage + ')');
  console.log('safety assertions: ' + safety.length);
  for (const r of safety) console.log('  = ' + r.name + ': ' + r.detail);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('save-delta-storage regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
