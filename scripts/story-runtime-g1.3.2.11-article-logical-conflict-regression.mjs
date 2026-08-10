// G1.3.2.11 article-logical-conflict regression：P0-3 ——
// - 同一逻辑版本（branch, articleId, articleVersion）三种物理表示：
//   多份合法 row canonical payload 完全相同 -> 确定性去重（list/recovery 只返回一份，get 成功）；
//   payload/articleVersionId/正文不同 -> 冲突诊断 + recovery 只读（list skipped、get CONFLICT）；
// - current target key 篡改（合法 other row 占用 current key）-> get 稳定 typed failure，不 fallback legacy 成功；
// - current key 下 schema-invalid row -> get INVALID_ROW（不 fallback legacy）。
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
  const setup = async (rows, seedBranch = 'branch_L') => {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: seedBranch, saveNodeId: 's', runtimeRevision: 0 });
    await coreStore.createBranchSeed({
      branchId: seedBranch, saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    const db = await coreStore.openRuntimeDb(shim1);
    for (const [key, value] of rows) await putRow(db, key, value);
    const shim2 = createIdbShim(backend);
    return new adapterMod.ProjectionDurableAdapter(shim2);
  };

  // ══ 场景 1：raw + encoded 同逻辑版本、canonical payload 完全相同 -> 确定性去重（list/recovery 一份、get 成功）══
  {
    // 含冒号 branch 让 raw 与 encoded 物理 key 不同（否则同构覆盖）；seed 与 target 同 branch。
    const adapter = await setup([
      [projection.projectionLegacyRawArticleVersionKey('branch:L', 'a', 1), version('branch:L', 'a', 'v1', 1)],
      [projection.projectionLegacyEncodedArticleVersionKey('branch:L', 'a', 1), version('branch:L', 'a', 'v1', 1)],
    ], 'branch:L');
    const list = await adapterMod.durableListArticleVersions(adapter, 'branch:L');
    assert(list.values.length === 1, '场景1-list 同 payload 去重只返回一份，实际 ' + list.values.length);
    assert(!list.skipped.some((s) => s.includes('不同 payload')), '场景1-同 payload 不产生冲突诊断');
    const got = await adapterMod.durableGetArticleVersion(adapter, 'branch:L', 'a', 1);
    assert(got.ok === true, '场景1-get 同 payload 去重成功');
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter, 'branch:L');
    assert(recovered.articleVersions.length === 1, '场景1-recovery 同 payload 去重一份');
    assert(recovered.readonlyMode === false, '场景1-同 payload 去重不触发只读');
    recordPositive('P0-3-同 payload 去重', 'raw+encoded 同正文 -> 一份 + 成功');
  }

  // ══ 场景 2：raw + encoded 同逻辑版本、正文不同 -> 冲突诊断 + recovery 只读 + get CONFLICT ══
  {
    const adapter = await setup([
      [projection.projectionLegacyRawArticleVersionKey('branch:L', 'a', 1), version('branch:L', 'a', 'v1', 1)],
      [projection.projectionLegacyEncodedArticleVersionKey('branch:L', 'a', 1), { ...version('branch:L', 'a', 'v1b', 1), body: 'different-body' }],
    ], 'branch:L');
    const list = await adapterMod.durableListArticleVersions(adapter, 'branch:L');
    assert(list.values.length === 0, '场景2-list 不得返回两份冲突正文，实际 ' + list.values.length);
    assert(list.skipped.some((s) => s.includes('不同 payload')), '场景2-list 冲突诊断，实际 ' + JSON.stringify(list.skipped));
    const got = await adapterMod.durableGetArticleVersion(adapter, 'branch:L', 'a', 1);
    assert(got.ok === false && got.code === 'CONFLICT', '场景2-get 必须 CONFLICT（不静默选择），实际 ' + JSON.stringify(got));
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter, 'branch:L');
    assert(recovered.articleVersions.length === 0, '场景2-recovery 不返回冲突正文');
    assert(recovered.readonlyMode === true, '场景2-逻辑版本冲突强制只读');
    recordRejected('P0-3-不同 payload 冲突', 'list skipped + get CONFLICT + recovery 只读', 'CONFLICT');
  }

  // ══ 场景 3：current target key 被合法 other row 占用 -> get 稳定 typed failure（不 fallback legacy 成功）══
  {
    const adapter = await setup([
      // current key 被 other 文章的合法 row 占用（篡改）。
      [projection.projectionArticleVersionKey('branch_L', 'a', 1), version('branch_L', 'other-article', 'vX', 9)],
      // target legacy raw 有合法 row（若 fallback 会成功——必须不 fallback）。
      [projection.projectionLegacyRawArticleVersionKey('branch_L', 'a', 1), version('branch_L', 'a', 'v1', 1)],
    ]);
    const got = await adapterMod.durableGetArticleVersion(adapter, 'branch_L', 'a', 1);
    assert(got.ok === false && (got.code === 'KEY_MISMATCH' || got.code === 'INVALID_ROW'), '场景3-current 篡改必须稳定失败（不 fallback legacy 成功），实际 ' + JSON.stringify(got));
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter, 'branch_L');
    assert(recovered.readonlyMode === true, '场景3-recovery 对 current owner mismatch 强制只读');
    recordRejected('P0-3-current 篡改不 fallback', 'current key 被 other row 占用 -> get 失败 + recovery 只读', 'get 失败');
  }

  // ══ 场景 4：current key 下 schema-invalid row + target legacy 合法 -> get INVALID_ROW（不 fallback）══
  {
    const adapter = await setup([
      [projection.projectionArticleVersionKey('branch_L', 'a', 1), { runtimeBranchId: 'branch_L', articleId: 'a', articleVersion: 1 }],
      [projection.projectionLegacyRawArticleVersionKey('branch_L', 'a', 1), version('branch_L', 'a', 'v1', 1)],
    ]);
    const got = await adapterMod.durableGetArticleVersion(adapter, 'branch_L', 'a', 1);
    assert(got.ok === false && got.code === 'INVALID_ROW', '场景4-current invalid 必须 INVALID_ROW（不 fallback legacy），实际 ' + JSON.stringify(got));
    recordRejected('P0-3-current invalid 不 fallback', 'current schema-invalid -> get INVALID_ROW', 'INVALID_ROW');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.11-article-logical-conflict regression passed.');
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
    console.error('story-runtime-g1.3.2.11-article-logical-conflict regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
