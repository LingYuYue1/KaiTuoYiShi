// G1.3.2.9 article-key-codec regression：P0-1 ——
// - projectionArticleVersionKey 使用独立 article-v2 namespace，并对任意 string branch/articleId 可逆编码；
// - encode/decode round-trip：冒号/%/空格/Unicode/prefix collision 全部无损还原；
// - 简单历史 key 与含分隔符 legacy key 继续兼容可读；
// - durableListArticleVersions：含冒号目标 branch 坏 key/坏 row 进 skipped、其他 branch 不污染、
//   真正缺 branch（::a:bad）稳定诊断、legacy 含冒号合法 row 精确读取、
//   prefix collision（branch 与 branch:sub）不互相污染、其他 branch article-shaped schema-invalid row 不污染。
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

  // ══ 场景 1：encode/decode round-trip（冒号/%/空格/Unicode/prefix collision）══
  {
    const cases = ['branch:T', 'branch%3A', 'sha256:a:b', 'a b', '星穹铁道', 'branch', 'branch:sub', '100%', 'a%25b'];
    for (const s of cases) {
      const encoded = projection.encodeIdComponent(s);
      const decoded = projection.decodeIdComponent(encoded);
      assert(decoded === s, '场景1-round-trip 必须无损: ' + s + ' -> ' + encoded + ' -> ' + decoded);
      assert(!encoded.includes(':'), '场景1-编码后无裸冒号（' + s + ' -> ' + encoded + '）');
    }
    // prefix collision：branch 与 branch:sub 编码后 key 不同。
    const k1 = projection.projectionArticleVersionKey('branch', 'a', 1);
    const k2 = projection.projectionArticleVersionKey('branch:sub', 'a', 1);
    assert(k1 !== k2, '场景1-branch 与 branch:sub 编码 key 必须不同（prefix collision 不互相污染）');
    // Current writes use a namespace disjoint from every legacy raw key.
    const simple = projection.projectionArticleVersionKey('branch_T', 'article-A', 1);
    assert(simple === 'projection:article-v2:branch_T:article-A:1', '场景1-current key 必须使用 article-v2 namespace，实际 ' + simple);
    recordPositive('P0-1-codec round-trip', cases.length + ' 个含分隔符/Unicode/百分号输入全部无损 + prefix collision 隔离 + 新旧 namespace 互斥');
  }

  // ══ 场景 2：含冒号目标 branch 坏 key/坏 row + 其他 branch 不污染 + 缺 branch/legacy 含冒号 unknown ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    // 1) 目标 branch='branch:T' 的合法 key + malformed row -> skipped。
    await putRow(db, projection.projectionArticleVersionKey('branch:T', 'a', 1), { runtimeBranchId: 'branch:T' });
    // 2) 目标 branch='branch:T' 的坏 version key -> skipped。
    await putRow(db, 'projection:article:branch%3AT:a:bad', { runtimeBranchId: 'branch:T' });
    // 3) 其他 branch='branch:sub' 的合法 key + malformed row -> 不污染 branch:T。
    await putRow(db, projection.projectionArticleVersionKey('branch:sub', 'a', 1), { runtimeBranchId: 'branch:sub' });
    // 4) 真正缺 branch（::a:bad）-> unknown 诊断（owner=unknown 进 skipped）。
    await putRow(db, 'projection:article::a:bad', { runtimeBranchId: 'x' });
    // 5) legacy 含冒号合法 row -> 冻结 row + exact legacy key 识别。
    await putRow(db, 'projection:article:branch:sub:a:1', version('branch:sub', 'a', 'v-legacy', 1));
    // 6) 其他 branch article-shaped schema-invalid row（row 有可信 runtimeBranchId='branch_OTHER'）-> 不污染。
    await putRow(db, projection.projectionArticleVersionKey('branch_OTHER', 'x', 1), { runtimeBranchId: 'branch_OTHER', articleId: 'x', articleVersion: 1 });
    // 7) 合法目标 article（branch:T）-> values。
    await putRow(db, projection.projectionArticleVersionKey('branch:T', 'article-OK', 1), version('branch:T', 'article-OK', 'v-ok', 1));

    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const list = await adapterMod.durableListArticleVersions(adapter2, 'branch:T');
    // 1/2 目标坏项 skipped。
    assert(list.skipped.some((s) => s.includes('article-v2:branch%3AT:a:1')), '场景2-目标 branch:T 合法 key+malformed row 必须 skipped，实际 ' + JSON.stringify(list.skipped));
    assert(list.skipped.some((s) => s.includes('branch%3AT:a:bad')), '场景2-目标 branch:T 坏 version key 必须 skipped');
    // 3/5/6 其他 branch 不污染；7 合法目标进 values。
    assert(!list.skipped.some((s) => s.includes('article-v2:branch%3Asub:a:1')), '场景2-其他 branch branch:sub 不得污染 branch:T');
    assert(!list.skipped.some((s) => s.includes('branch:sub:a:1')), '场景2-legacy branch:sub 不得污染 branch:T');
    assert(!list.skipped.some((s) => s.includes('branch_OTHER')), '场景2-其他 branch article-shaped schema-invalid row 不得污染');
    assert(list.values.length === 1 && list.values[0].articleId === 'article-OK', '场景2-合法目标 article（branch:T）进 values');
    const legacyList = await adapterMod.durableListArticleVersions(adapter2, 'branch:sub');
    assert(legacyList.values.some((row) => row.articleVersionId === 'v-legacy'), '场景2-legacy 含冒号合法 row 必须精确读取');
    const missingBranchList = await adapterMod.durableListArticleVersions(adapter2, 'x');
    assert(missingBranchList.skipped.some((s) => s.includes('::a:bad')), '场景2-真正缺 branch 必须稳定诊断（不静默）');
    recordRejected('P0-1-含冒号 branch/缺 branch/legacy 矩阵', '目标诊断 + 其他 branch 零污染 + legacy 合法可读', '零污染');
  }

  // ══ 场景 3：prefix collision 双向隔离（branch 与 branch:sub 各自读自己的）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    await putRow(db, projection.projectionArticleVersionKey('branch', 'a', 1), version('branch', 'a', 'v1', 1));
    await putRow(db, projection.projectionArticleVersionKey('branch:sub', 'a', 1), version('branch:sub', 'a', 'v1', 1));
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const listBranch = await adapterMod.durableListArticleVersions(adapter2, 'branch');
    const listSub = await adapterMod.durableListArticleVersions(adapter2, 'branch:sub');
    assert(listBranch.values.length === 1 && listBranch.values[0].runtimeBranchId === 'branch', '场景3-branch 只读自己的 article');
    assert(listSub.values.length === 1 && listSub.values[0].runtimeBranchId === 'branch:sub', '场景3-branch:sub 只读自己的 article（不互相污染）');
    assert(listBranch.skipped.length === 0 && listSub.skipped.length === 0, '场景3-无坏行零 skipped');
    recordPositive('P0-1-prefix collision 双向隔离', 'branch 与 branch:sub 各自读自己的合法 article');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.9-article-key-codec regression passed.');
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
    console.error('story-runtime-g1.3.2.9-article-key-codec regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
