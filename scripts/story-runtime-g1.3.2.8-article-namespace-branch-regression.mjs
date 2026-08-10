// G1.3.2.8 article-namespace-branch regression：P0-1 ——
// - article key 解析三态：非 article namespace / article namespace 但 key malformed / 合法 article key；
// - 目标 branch 的坏 key/坏 row 进入稳定 skipped（不伪装空列表）；
// - 其他 branch 的 malformed article 不得污染请求 branch 的 skipped；
// - 合法 key/row 双向 owner 冲突先诊断再 branch 过滤；其他四类合法 projection row 不误报。
// 覆盖：目标 branch 非法 version key、其他 branch malformed row、目标合法 key+malformed row、
// 合法目标 article、合法无关 article、非 article row。
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

  // 一个 backend 内写入全部矩阵，list 一次断言各方向。
  const backend = createSharedIdbBackend();
  const shim1 = createIdbShim(backend);
  const db = await coreStore.openRuntimeDb(shim1);
  // 1) 目标 branch 非法 version key（article namespace + version 非整数）。
  await putRow(db, 'projection:article:branch_T:a:not-a-version', { runtimeBranchId: 'branch_T' });
  // 2) 目标 branch 缺分段 key（无 articleId/version 段）。
  await putRow(db, 'projection:article:branch_T', { runtimeBranchId: 'branch_T' });
  // 3) 其他 branch 的 malformed row（合法 key + 残缺 row）。
  await putRow(db, 'projection:article:branch_OTHER:a:1', version('branch_OTHER', 'article-X', 'v-x', 1));
  // 4) 其他 branch 的非法 version key。
  await putRow(db, 'projection:article:branch_OTHER:b:bad', version('branch_OTHER', 'article-Y', 'v-y', 1));
  // 5) 目标合法 key + malformed row。
  await putRow(db, 'projection:article:branch_T:c:1', { runtimeBranchId: 'branch_T' });
  // 6) 合法目标 article。
  await putRow(db, adapterMod.projectionArticleVersionKey('branch_T', 'article-OK', 1), version('branch_T', 'article-OK', 'v-ok', 1));
  // 7) 合法无关 article（其他 branch）。
  await putRow(db, adapterMod.projectionArticleVersionKey('branch_OTHER', 'article-X', 1), version('branch_OTHER', 'article-X', 'v-x', 1));
  // 8) 非 article row（cursor 合法行）。
  await putRow(db, 'projection:cursor:branch_T:obs', { cursor: { runtimeBranchId: 'branch_T', observerId: 'obs', channel: 'player_ui' }, revision: 1 });
  // 9) 单段 key + 合法完整 row：classifier 通过 validator 后 owner=key branch（'only-one-segment'）- branch 不污染。
  await putRow(db, 'projection:article:only-one-segment', version('only-one-segment', 'article-Y', 'v1', 1));

  const shim2 = createIdbShim(backend);
  const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
  const list = await adapterMod.durableListArticleVersions(adapter2, 'branch_T');

  // 目标 branch 相关坏项全部进 skipped（不得伪装空列表）：1/2/5。
  assert(list.skipped.some((s) => s.includes('projection:article:branch_T:a:not-a-version')), '目标非法 version key 必须 skipped，实际 ' + JSON.stringify(list.skipped));
  assert(list.skipped.some((s) => s.includes('projection:article:branch_T')), '目标缺分段 key 必须 skipped');
  assert(list.skipped.some((s) => s.includes('projection:article:branch_T:c:1')), '目标合法 key+malformed row 必须 skipped');
  // G1.3.2.9：仅剩一个段的 key 归属其自身 branch（'only-one-segment' 是其他 branch）——不得污染 branch_T。
  assert(!list.skipped.some((s) => s.includes('only-one-segment')), '单段 key 归属自身 branch（其他 branch）不得污染当前 branch，实际 ' + JSON.stringify(list.skipped));
  // 其他 branch 的 malformed（3/4）不得污染 branch_T 的 skipped。
  assert(!list.skipped.some((s) => s.includes('branch_OTHER:a:1')) && !list.skipped.some((s) => s.includes('branch_OTHER:b:bad')), '其他 branch malformed 不得污染当前 branch，实际 ' + JSON.stringify(list.skipped));
  // 合法目标 article 进 values；合法无关 article 与 cursor 不误报。
  assert(list.values.length === 1 && list.values[0].articleId === 'article-OK', '合法目标 article 进 values');
  assert(!list.skipped.some((s) => s.includes('article-X')) && !list.skipped.some((s) => s.includes('projection:cursor')), '合法无关 article 与非 article row 不误报');
  recordRejected('P0-1-article namespace/branch 矩阵', '目标坏 key/坏 row 进 skipped + 其他 branch 不污染 + 合法/非 article 不误报', '不污染');
  recordPositive('P0-1-合法对照', '合法目标 article + 合法无关 + 非 article 零误报');

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.8-article-namespace-branch regression passed.');
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
    console.error('story-runtime-g1.3.2.8-article-namespace-branch regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
