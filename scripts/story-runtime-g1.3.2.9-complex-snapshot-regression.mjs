// G1.3.2.9 complex-snapshot regression：P1-1 ——
// - 分别用含 BigInt、稀疏数组、Symbol、NaN 的测试专用坏 existing wrapper 执行写路径拒绝；
// - 写入前后快照直接经过确定性 deep comparator（处理 BigInt/稀疏索引/Symbol/NaN，不用 JSON.stringify），
//   证明逐 key、数组稀疏索引、Symbol key/value 与 NaN 语义不变；
// - 每个复杂值场景同时验证 version 未新增、aggregate row 未替换；
// - 报告区分 shim 可持久化防御输入与真实浏览器 structured clone 语义（shim cloneJson 对稀疏数组塌缩，
//   真实 IDB structured clone 保留稀疏——专项在写路径快照间比较 shim 可持久化形态，并单独用内存引用
//   证明 deep comparator 的稀疏索引比较能力）。
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

/** 确定性深比较（BigInt/稀疏索引/Symbol/NaN——不用 JSON.stringify 比较不可信值）。 */
function deepEqualStable(a, b, pathStr = '$') {
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;
  if (aIsArr) {
    if (a.length !== b.length) return false;
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (JSON.stringify(aKeys) !== JSON.stringify(bKeys)) return false; // 稀疏索引集合（key 是字符串索引，安全）
    for (const k of aKeys) {
      if (!deepEqualStable(a[k], b[k], pathStr + '[' + k + ']')) return false;
    }
    return true;
  }
  const aKeys = Reflect.ownKeys(a).sort((x, y) => String(x).localeCompare(String(y)));
  const bKeys = Reflect.ownKeys(b).sort((x, y) => String(x).localeCompare(String(y)));
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (!deepEqualStable(a[aKeys[i]], b[bKeys[i]], pathStr + '.' + String(aKeys[i]))) return false;
  }
  return true;
}

async function main() {
  const projection = await bundleTs('services/storyRuntime/projectionStore.ts');
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
  const outboxItem = (outboxId, branchId, sourceKey) => ({
    outboxId, schemaVersion: 3, runtimeBranchId: branchId, sourceRefFingerprint: 's', sourceRevision: 1,
    kind: 'news', aggregateKey: 'agg', operation: 'create', sourceLevelIdempotencyKey: sourceKey, deliveryKey: 'd1',
    payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0,
  });
  const aggregate = (branchId, articleId) => ({ runtimeBranchId: branchId, articleId, currentVersion: 1, versionIds: [], aggregateRevision: 0 });
  const version = (branchId, articleId, vid, vno) => ({
    runtimeBranchId: branchId, articleVersionId: vid, articleId, articleVersion: vno,
    sourceRefs: [], sourceFingerprint: 's', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x',
    title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [],
  });

  // ══ 场景 1：deep comparator 能力证明（内存引用直接比较——稀疏索引/Symbol key/NaN/BigInt 语义）══
  {
    const symKey = Symbol('k');
    const sparseA = [1, , 3]; // 稀疏（length 3，索引 0/2）
    const sparseB = [1, , 3];
    assert(deepEqualStable(sparseA, sparseB), '场景1-稀疏数组深比较相等（同 shape）');
    assert(!deepEqualStable([1, , 3], [1, 2, 3]), '场景1-稀疏与稠密不相等（索引集合不同）');
    const symObj = { [symKey]: 1 };
    const symObj2 = { [symKey]: 1 };
    assert(deepEqualStable(symObj, symObj2), '场景1-Symbol key 深比较相等（同引用 key）');
    assert(deepEqualStable(NaN, NaN), '场景1-NaN 深比较相等');
    assert(deepEqualStable(1n, 1n), '场景1-BigInt 深比较相等');
    assert(!deepEqualStable(1n, 2n), '场景1-BigInt 不同值不相等');
    recordPositive('P1-1-deep comparator 能力', '稀疏索引/Symbol key/NaN/BigInt 语义直接验证');
  }

  // ══ 场景 2：四种复杂坏 wrapper 分别执行写路径拒绝 + before/after 深比较 + version 未新增 + row 未替换 ══
  {
    const sym = Symbol('wrapper-sym');
    const complexBadWrappers = [
      ['BigInt', { aggregate: { runtimeBranchId: 'branch_W', articleId: 'article-W', currentVersion: 1, versionIds: [1n], aggregateRevision: 1 }, aggregateKey: 'agg', versionIds: [1n], sourceLevelIdempotencyKeys: [{ key: 'k', payloadFingerprint: 'f' }] }],
      ['稀疏数组', { aggregate: { runtimeBranchId: 'branch_W', articleId: 'article-W', currentVersion: 1, versionIds: ['v1'], aggregateRevision: 1 }, aggregateKey: 'agg', versionIds: (() => { const s = ['v1']; s.length = 3; return s; })(), sourceLevelIdempotencyKeys: [{ key: 'k', payloadFingerprint: 'f' }] }],
      ['Symbol', { aggregate: { runtimeBranchId: 'branch_W', articleId: 'article-W', currentVersion: 1, versionIds: [sym], aggregateRevision: 1 }, aggregateKey: 'agg', versionIds: [sym], sourceLevelIdempotencyKeys: [{ key: 'k', payloadFingerprint: 'f' }] }],
      ['NaN', { aggregate: { runtimeBranchId: 'branch_W', articleId: 'article-W', currentVersion: 1, versionIds: [], aggregateRevision: NaN }, aggregateKey: 'agg', versionIds: [], sourceLevelIdempotencyKeys: [{ key: 'k', payloadFingerprint: 'f' }] }],
    ];
    for (const [label, badWrapper] of complexBadWrappers) {
      const backend = createSharedIdbBackend();
      const shim1 = createIdbShim(backend);
      const db = await coreStore.openRuntimeDb(shim1);
      const key = 'projection:aggregate:branch_W:agg';
      await new Promise((res) => {
        const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
        const r = tx.objectStore(coreStore.PROJECTION_STORE).put(badWrapper, key);
        r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      });
      // 写入前快照（shim 可持久化形态——cloneJson 读回）。
      const shimA = createIdbShim(backend);
      const dbA = await coreStore.openRuntimeDb(shimA);
      const before = await new Promise((res) => {
        const tx = dbA.transaction(coreStore.PROJECTION_STORE, 'readonly');
        const r = tx.objectStore(coreStore.PROJECTION_STORE).get(key);
        r.onsuccess = () => res(r.result);
      });
      // 写路径拒绝。
      const shim2 = createIdbShim(backend);
      const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
      const result = await projection.consumeNewsOutbox(adapter2, outboxItem('o_w', 'branch_W', 'k1'), aggregate('branch_W', 'article-W'), version('branch_W', 'article-W', 'v1', 1));
      assert(result.ok === false && result.code === 'INVALID_COMMAND', '场景2-' + label + '-写路径必须稳定拒绝，实际 ' + JSON.stringify(result));
      // 写入后快照 + 确定性深比较（逐 key/数组稀疏索引/Symbol/NaN 语义不变）。
      const shim3 = createIdbShim(backend);
      const db3 = await coreStore.openRuntimeDb(shim3);
      const after = await new Promise((res) => {
        const tx = db3.transaction(coreStore.PROJECTION_STORE, 'readonly');
        const r = tx.objectStore(coreStore.PROJECTION_STORE).get(key);
        r.onsuccess = () => res(r.result);
      });
      assert(deepEqualStable(before, after), '场景2-' + label + '-写前/写后必须确定性深相等');
      // version 未新增 + aggregate row 未替换。
      const versionKey = projection.projectionArticleVersionKey('branch_W', 'article-W', 1);
      const versionAfter = await new Promise((res) => {
        const tx = db3.transaction(coreStore.PROJECTION_STORE, 'readonly');
        const r = tx.objectStore(coreStore.PROJECTION_STORE).get(versionKey);
        r.onsuccess = () => res(r.result);
      });
      assert(versionAfter === undefined, '场景2-' + label + '-version 未新增（零写入）');
      assert(after !== undefined && after.aggregate.articleId === 'article-W', '场景2-' + label + '-aggregate row 未被替换');
      console.log('  [complex-snapshot] ' + label + ': before/after 深相等（shim 可持久化形态）');
    }
    recordRejected('P1-1-复杂坏 wrapper 直接深比较', 'BigInt/稀疏/Symbol/NaN 各自写路径拒绝 + before/after 深相等 + version 未新增', '深相等');
  }

  // ══ 场景 3：shim cloneJson 与 structured clone 均保留稀疏 length/index shape ══
  {
    // Array.prototype.map preserves length and holes. Assert both instead of
    // relying on a descriptive console line.
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const sparse = ['v1'];
    sparse.length = 3;
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(sparse, 'projection:article:x:a:1');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const read = await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).get('projection:article:x:a:1');
      r.onsuccess = () => res(r.result);
    });
    assert(Array.isArray(read) && read.length === 3, '场景3-shim 必须保留稀疏数组 length=3，实际 ' + read?.length);
    assert(0 in read && !(1 in read) && !(2 in read), '场景3-shim 必须保留稀疏索引集合，实际 ' + Object.keys(read));
    console.log('  [complex-snapshot] shim cloneJson 保留稀疏 length=3 与 hole');
    recordPositive('P1-1-稀疏语义断言', 'shim cloneJson 保留 length 与稀疏索引集合');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.9-complex-snapshot regression passed.');
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
    console.error('story-runtime-g1.3.2.9-complex-snapshot regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
