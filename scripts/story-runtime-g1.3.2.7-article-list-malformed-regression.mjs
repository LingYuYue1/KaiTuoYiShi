// G1.3.2.7 article-list-malformed regression：P0-1 ——
// - durableListArticleVersions() 必须先解析物理 key 是否属于 article namespace：
//   article 物理 key 下的任何 malformed/unknown row 都进入稳定 skipped（不得静默空列表）；
// - 完整 article row 仍执行冻结 validator + 物理 key/row 双向校验 + branch 过滤；
// - 其他四类合法 projection row 不得被 article typed list 误报为坏 article；
// - 合法空列表、合法 article、目标 malformed article、无关其他类型/其他 branch 对照。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';
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

  // ══ 场景 1：目标 branch article 物理 key 下 malformed row -> skipped（不得静默空列表）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    // 残缺行（只含 runtimeBranchId）位于目标 article key。
    await putRow(db, 'projection:article:branch_T:a:1', { runtimeBranchId: 'branch_T' });
    // 完全未知值（数字）位于目标 article key。
    await putRow(db, 'projection:article:branch_T:b:1', 42);
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const list = await adapterMod.durableListArticleVersions(adapter2, 'branch_T');
    assert(list.ok === true && list.values.length === 0, '场景1-坏行不得进入 values');
    assert(list.skipped.length === 2, '场景1-目标 article key 下两个 malformed 行都必须进 skipped，实际 ' + JSON.stringify(list.skipped));
    // G1.3.2.11：classifier 对 legacy invalid row 产生 unknown 诊断（含 key 前缀可定位）。
    assert(list.skipped.some((s) => s.includes('projection:article:branch_T:a:1')), '场景1-残缺行 skipped 含 key 前缀，实际 ' + JSON.stringify(list.skipped));
    assert(list.skipped.some((s) => s.includes('projection:article:branch_T:b:1')), '场景1-数字行 skipped 含 key 前缀');
    recordRejected('P0-1-目标 malformed article', '残缺行/数字行都进 skipped（不静默空列表）', 'skipped');
  }

  // ══ 场景 2：合法 article row -> values；合法空列表对照 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    // 合法 article。
    await putRow(db, adapterMod.projectionArticleVersionKey('branch_T', 'article-OK', 1), version('branch_T', 'article-OK', 'v-ok', 1));
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const list = await adapterMod.durableListArticleVersions(adapter2, 'branch_T');
    assert(list.ok === true && list.values.length === 1 && list.values[0].articleId === 'article-OK', '场景2-合法 article 进入 values');
    assert(list.skipped.length === 0, '场景2-合法行无 skipped');
    // 合法空列表（另一 branch 无任何行）。
    const empty = await adapterMod.durableListArticleVersions(adapter2, 'branch_EMPTY');
    assert(empty.ok === true && empty.values.length === 0 && empty.skipped.length === 0, '场景2-合法空列表 values/skipped 都为空');
    recordPositive('P0-1-合法对照', '合法 article + 合法空列表');
  }

  // ══ 场景 3：其他四类合法 projection row 不误报为坏 article；无关 branch 合法 article 不误报 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    // 其他类型合法行（cursor/receipt 等）。
    await putRow(db, 'projection:cursor:branch_T:obs', { cursor: { runtimeBranchId: 'branch_T', observerId: 'obs', channel: 'player_ui' }, revision: 1 });
    await putRow(db, 'projection:aggregate:branch_T:agg', { aggregate: { runtimeBranchId: 'branch_T', articleId: 'a', currentVersion: 1, versionIds: [], aggregateRevision: 0 }, aggregateKey: 'agg', versionIds: [], sourceLevelIdempotencyKeys: [] });
    // 其他 branch 的合法 article。
    await putRow(db, adapterMod.projectionArticleVersionKey('branch_OTHER', 'article-X', 1), version('branch_OTHER', 'article-X', 'v-x', 1));
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const list = await adapterMod.durableListArticleVersions(adapter2, 'branch_T');
    assert(list.ok === true && list.values.length === 0, '场景3-其他类型/其他 branch 不进入 values');
    assert(list.skipped.length === 0, '场景3-其他四类合法行与无关 branch article 不得误报为坏 article，实际 ' + JSON.stringify(list.skipped));
    recordPositive('P0-1-不误报对照', 'cursor/aggregate 合法行 + 其他 branch article 零 skipped');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.7-article-list-malformed regression passed.');
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
    console.error('story-runtime-g1.3.2.7-article-list-malformed regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
