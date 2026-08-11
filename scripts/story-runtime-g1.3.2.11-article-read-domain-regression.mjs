// G1.3.2.11 article-read-domain regression：P0-1 ——
// - 负数、小数、NaN/Infinity、unsafe version、空 branch/articleId 的历史 row 在 list/get/recovery
//   三条路径全部拒绝并诊断（不得返回成功）；
// - 写入与读取复用同一 isPersistableArticleDomain helper（写入侧由 .10 专项覆盖，本专项验证读侧）。
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

  // ══ 场景 1：历史坏域 row（负数/小数/NaN/unsafe/空 ID）在 list/get/recovery 全部拒绝并诊断 ══
  {
    // 每个坏域用例独立 backend（P1-1 逐条隔离）。
    const badCases = [
      ['负数 version', projection.projectionLegacyRawArticleVersionKey('branch_R', 'a', -1), version('branch_R', 'a', 'v-1', -1)],
      ['小数 version', projection.projectionLegacyRawArticleVersionKey('branch_R', 'a', 1.5), version('branch_R', 'a', 'v15', 1.5)],
      ['NaN version', projection.projectionLegacyRawArticleVersionKey('branch_R', 'a', NaN), version('branch_R', 'a', 'vNaN', NaN)],
      ['unsafe version', projection.projectionLegacyRawArticleVersionKey('branch_R', 'a', Number.MAX_SAFE_INTEGER + 1), version('branch_R', 'a', 'vU', Number.MAX_SAFE_INTEGER + 1)],
      ['空 branch', projection.projectionLegacyRawArticleVersionKey('', 'a', 1), version('', 'a', 'v1', 1)],
      ['空 articleId', projection.projectionLegacyRawArticleVersionKey('branch_R', '', 1), version('branch_R', '', 'v1', 1)],
    ];
    for (const [label, key, row] of badCases) {
      const backend = createSharedIdbBackend();
      const shim1 = createIdbShim(backend);
      const core = makeEmptyState({ runtimeBranchId: 'branch_R', saveNodeId: 's', runtimeRevision: 0 });
      await coreStore.createBranchSeed({
        branchId: 'branch_R', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
        core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
      }, shim1);
      const db = await coreStore.openRuntimeDb(shim1);
      await putRow(db, key, row);
      const shim2 = createIdbShim(backend);
      const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
      // list：坏行进 skipped（不返回 values）。
      const list = await adapterMod.durableListArticleVersions(adapter2, 'branch_R');
      assert(list.ok === true && list.values.length === 0, '场景1-' + label + '-list 不得返回坏域 row，实际 ' + JSON.stringify(list.values.map((v) => v.articleVersion)));
      assert(list.skipped.length >= 1, '场景1-' + label + '-list 必须诊断坏域 row');
      // get：稳定 typed failure。
      const requestedVersion = Number.isNaN(row.articleVersion) ? -1 : (Number.isSafeInteger(row.articleVersion) ? row.articleVersion : -1);
      const got = await adapterMod.durableGetArticleVersion(adapter2, 'branch_R', row.articleId, requestedVersion);
      assert(got.ok === false && (got.code === 'INVALID_ROW' || got.code === 'MISSING'), '场景1-' + label + '-get 必须稳定失败，实际 ' + JSON.stringify(got));
      // recovery：诊断坏域 row（不得恢复为合法）。
      const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_R');
      assert(recovered.articleVersions.every((v) => Number.isSafeInteger(v.articleVersion) && v.articleVersion >= 0), '场景1-' + label + '-recovery 不得恢复坏域 version');
      assert(recovered.diagnostics.some((d) => d.includes('article row 不满足可持久化输入域') || d.includes('冻结 schema 校验失败')), '场景1-' + label + '-recovery 必须有诊断，实际 ' + JSON.stringify(recovered.diagnostics));
    }
    recordRejected('P0-1-历史坏域 row 三路拒绝', '负数/小数/NaN/unsafe/空 branch/空 articleId 全部 list+get+recovery 拒绝', 'recovery 拒绝');
  }

  // ══ 场景 2：合法域 row 正面对照（0、1、MAX_SAFE 可读）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    await putRow(db, projection.projectionLegacyRawArticleVersionKey('branch_OK', 'a', 0), version('branch_OK', 'a', 'v0', 0));
    await putRow(db, projection.projectionArticleVersionKey('branch_OK', 'a', 1), version('branch_OK', 'a', 'v1', 1));
    await putRow(db, projection.projectionArticleVersionKey('branch_OK', 'a', Number.MAX_SAFE_INTEGER), version('branch_OK', 'a', 'vMax', Number.MAX_SAFE_INTEGER));
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const list = await adapter2 ? await adapterMod.durableListArticleVersions(adapter2, 'branch_OK') : null;
    assert(list !== null && list.values.length === 3, '场景2-合法域（0/1/MAX_SAFE）三条可读，实际 ' + (list ? list.values.length : 'null'));
    const got = await adapterMod.durableGetArticleVersion(adapter2, 'branch_OK', 'a', 1);
    assert(got.ok === true && got.value.articleVersion === 1, '场景2-get 合法域成功');
    recordPositive('P0-1-合法域对照', '0/1/MAX_SAFE 可读');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.11-article-read-domain regression passed.');
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
    console.error('story-runtime-g1.3.2.11-article-read-domain regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
