// G1.3.2.11 article-owner-isolation regression：P0-2 ——
// - other branch 的 invalid legacy collision 不得阻止 target 合法 raw row（list 能读 target、get 能成功、
//   recovery 恢复 target 且不因 other collision 强制只读）；
// - other branch 的 invalid current row 不得污染 target recovery（不强制只读）；
// - legacy schema-invalid row 无法完整验证 owner -> unknown（不能用单个 string 字段定向报警）——
//   歧义 legacy key 的 invalid row 产生 unknown 诊断（target 可见），不按 row 自报 branch 定向分配。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs, makeEmptyState } from './story-runtime-core-test-helpers.mjs';
import { createIdbShim, createSharedIdbBackend } from './story-runtime-idb-shim.mjs';

const FROZEN_HASHES = {
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
  'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
};

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }

async function main() {
  const adapterMod = await bundleTs('services/storyRuntime/projectionAdapter.ts');
  const projection = await bundleTs('services/storyRuntime/projectionStore.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };
  const version = (branchId, articleId, vid, vno) => ({
    runtimeBranchId: branchId, articleVersionId: vid, articleId, articleVersion: vno,
    sourceRefs: [], sourceFingerprint: 's', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x',
    title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [],
  });
  const putRow = (db, key, value) => new Promise((res) => {
    const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
    const r = tx.objectStore(coreStore.PROJECTION_STORE).put(value, key);
    r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
  });
  const setup = async (rows, targetBranch = 'branch_T') => {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: targetBranch, saveNodeId: 's', runtimeRevision: 0 });
    await coreStore.createBranchSeed({
      branchId: targetBranch, saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    const db = await coreStore.openRuntimeDb(shim1);
    for (const [key, value] of rows) await putRow(db, key, value);
    const shim2 = createIdbShim(backend);
    return new adapterMod.ProjectionDurableAdapter(shim2);
  };

  // ══ 场景 1：真实 raw/encoded 等值碰撞不污染 target ══
  {
    // other raw owner branch%3A 与 target encoded owner branch: 的物理 key 完全相同。
    const collisionKey = projection.projectionLegacyRawArticleVersionKey('branch%3A', 'a', 1);
    assert(collisionKey === projection.projectionLegacyEncodedArticleVersionKey('branch:', 'a', 1), '场景1-必须构造真实 raw/encoded 等值碰撞');
    const adapter = await setup([
      [collisionKey, { ...version('branch%3A', 'a', 'other-invalid', 1), lifecycle: 'NOT_A_LIFECYCLE' }],
      [projection.projectionLegacyRawArticleVersionKey('branch:', 'a', 1), version('branch:', 'a', 'target-valid', 1)],
    ], 'branch:');
    const list = await adapterMod.durableListArticleVersions(adapter, 'branch:');
    assert(list.values.length === 1 && list.values[0].articleId === 'a', '场景1-list 必须能读到 target 合法 raw row，实际 ' + JSON.stringify(list.values.map((v) => v.articleId)));
    assert(list.skipped.length === 0, '场景1-other raw owner 不得成为 target skipped，实际 ' + JSON.stringify(list.skipped));
    const got = await adapterMod.durableGetArticleVersion(adapter, 'branch:', 'a', 1);
    assert(got.ok === true && got.value.runtimeBranchId === 'branch:', '场景1-get 必须成功（other invalid legacy collision 不阻止），实际 ' + JSON.stringify(got));
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter, 'branch:');
    assert(recovered.articleVersions.length === 1 && recovered.articleVersions[0].runtimeBranchId === 'branch:', '场景1-recovery 恢复 target');
    assert(recovered.readonlyMode === false, '场景1-other branch invalid legacy 不得把 target 强制只读，实际 readonlyMode=' + recovered.readonlyMode);
    recordPositive('P0-2-真实 raw/encoded collision 隔离', 'list/get/recovery 全部读 target + 不只读');
  }

  // ══ 场景 2：other branch 的 invalid current row 不得污染 target recovery ══
  {
    // other current key：projection:article-v2:branch_OTHER:a:1（invalid row）。
    const adapter = await setup([
      [projection.projectionArticleVersionKey('branch_OTHER', 'a', 1), { runtimeBranchId: 'branch_OTHER', articleId: 'a', articleVersion: 1 }],
      [projection.projectionArticleVersionKey('branch_T', 'ok', 1), version('branch_T', 'ok', 'v1', 1)],
    ]);
    const list = await adapterMod.durableListArticleVersions(adapter, 'branch_T');
    assert(list.values.length === 1 && list.values[0].articleId === 'ok', '场景2-list 只含 target 合法 row');
    assert(!list.skipped.some((s) => s.includes('branch_OTHER')), '场景2-other branch invalid current 不污染 target list，实际 ' + JSON.stringify(list.skipped));
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter, 'branch_T');
    assert(recovered.readonlyMode === false, '场景2-other branch invalid current 不得把 target 强制只读');
    assert(recovered.articleVersions.length === 1, '场景2-recovery 只恢复 target');
    recordRejected('P0-2-other invalid current 不污染', 'other branch invalid current 零污染 target list/recovery', '零污染');
  }

  // ══ 场景 3：完整 owner envelope 可归属歧义 raw key；不完整 envelope 保持 unknown ══
  {
    const adapter = await setup([
      ['projection:article:branch:sub:article:X:2', { runtimeBranchId: 'branch:sub', articleId: 'article:X', articleVersion: 2, lifecycle: 'NOT_A_LIFECYCLE' }],
    ]);
    const list = await adapterMod.durableListArticleVersions(adapter, 'branch_T');
    assert(list.skipped.length === 0, '场景3-完整 owner envelope 的 other raw row 不污染 target，实际 ' + JSON.stringify(list.skipped));
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter, 'branch_T');
    assert(recovered.readonlyMode === false, '场景3-完整 owner envelope 的 other raw row 不得强制 target 只读');

    const unknownAdapter = await setup([
      ['projection:article:branch:sub:article:X:2', { runtimeBranchId: 'branch:sub' }],
    ]);
    const unknownList = await adapterMod.durableListArticleVersions(unknownAdapter, 'branch_T');
    assert(unknownList.skipped.some((s) => s.includes('unknown')), '场景3-不完整 envelope 必须保持 unknown，实际 ' + JSON.stringify(unknownList.skipped));
    const unknownRecovered = await adapterMod.recoverProjectionsFromStore(unknownAdapter, 'branch_T');
    assert(unknownRecovered.readonlyMode === true, '场景3-不完整 envelope 的 unknown 坏行必须强制只读');
    recordRejected('P0-2-legacy incomplete envelope -> unknown', '不完整 owner envelope 保持 unknown 诊断', 'unknown');
  }

  // ══ 场景 4：article-shaped row 放在非 article key 下，list/recovery 裁决一致 ══
  {
    const wrongKey = 'projection:wrong-cabinet:branch_T:a:1';
    const adapter = await setup([[wrongKey, version('branch_T', 'a', 'wrong-cabinet', 1)]]);
    const list = await adapterMod.durableListArticleVersions(adapter, 'branch_T');
    assert(list.values.length === 0 && list.skipped.some((s) => s.includes('错柜')), '场景4-list 必须诊断错柜，实际 ' + JSON.stringify(list));
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter, 'branch_T');
    assert(recovered.readonlyMode === true, '场景4-recovery 必须因错柜强制只读');
    assert(recovered.diagnostics.some((s) => s.includes(wrongKey) && s.includes('错柜')), '场景4-recovery 必须给出错柜诊断，实际 ' + JSON.stringify(recovered.diagnostics));
    recordRejected('P0-2-wrong cabinet list/recovery 一致', 'article 形状行错柜后 list 诊断且 recovery 强制只读', '错柜');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.11-article-owner-isolation regression passed.');
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
    console.error('story-runtime-g1.3.2.11-article-owner-isolation regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
