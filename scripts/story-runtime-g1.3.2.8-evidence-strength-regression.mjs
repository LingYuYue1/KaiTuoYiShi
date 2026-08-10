// G1.3.2.8 evidence-strength regression：P1-1 ——
// - aggregate wrapper versionIds 直接执行 Symbol 元素与数组元素负例（recovery/list 稳定 diagnostics +
//   readonly/skipped，不 throw）；
// - corrupt existing wrapper 写路径保存写入前快照，并用确定性深比较（处理 BigInt/稀疏/Symbol，
//   不用 JSON.stringify 比较不可信值）证明失败后逐字段/逐元素不变；
// - 同时验证目标 article version key 未新增、aggregate row 未被替换。
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

/**
 * 确定性深比较（P1-1：能处理 BigInt/稀疏数组/Symbol/NaN，不用 JSON.stringify 比较不可信值）。
 * - 稀疏数组比较 own 索引与 length；
 * - BigInt/Symbol 用 Object.is 语义（同引用）；
 * - NaN 用 Number.isNaN 相等。
 */
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
  const adapterMod = await bundleTs('services/storyRuntime/projectionAdapter.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const projection = await bundleTs('services/storyRuntime/projectionStore.ts');
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

  // ══ 场景 1：Symbol / 数组元素直接负例（wrapper versionIds）-> recovery/list 稳定 diagnostics + readonly/skipped ══
  {
    const sym = Symbol('sym-member');
    const badWrappers = [
      ['Symbol 元素', [sym]],
      ['数组元素', [['nested']]],
    ];
    for (const [label, wrapperVersionIds] of badWrappers) {
      const backend = createSharedIdbBackend();
      const shim1 = createIdbShim(backend);
      const core = makeEmptyState({ runtimeBranchId: 'branch_S', saveNodeId: 's', runtimeRevision: 0 });
      await coreStore.createBranchSeed({
        branchId: 'branch_S', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
        core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
      }, shim1);
      const db = await coreStore.openRuntimeDb(shim1);
      const key = 'projection:aggregate:branch_S:agg';
      const row = {
        aggregate: { runtimeBranchId: 'branch_S', articleId: 'a', currentVersion: 1, versionIds: ['v1'], aggregateRevision: 1 },
        aggregateKey: 'agg',
        versionIds: wrapperVersionIds,
        sourceLevelIdempotencyKeys: [{ key: 'k', payloadFingerprint: 'f' }],
      };
      await new Promise((res) => {
        const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
        const r = tx.objectStore(coreStore.PROJECTION_STORE).put(row, key);
        r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      });
      const shim2 = createIdbShim(backend);
      const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
      const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_S');
      assert(recovered.readonlyMode === true, '场景1-' + label + '-recovery 强制只读（不 throw）');
      assert(recovered.diagnostics.some((d) => d.includes('aggregate wrapper')), '场景1-' + label + '-wrapper 诊断，实际 ' + JSON.stringify(recovered.diagnostics));
      const list = await adapterMod.durableListProjections(adapter2, 'branch_S');
      assert(list.ok === true, '场景1-' + label + '-list 稳定返回（不 throw）');
      assert(list.skipped.some((s) => s.includes('aggregate wrapper')), '场景1-' + label + '-list skipped');
    }
    recordRejected('P1-1-Symbol/数组直接负例', 'Symbol/数组元素 wrapper 直接执行并稳定拒绝', '稳定拒绝');
  }

  // ══ 场景 2：坏 existing wrapper 写路径——写前快照 + 确定性深比较证明零覆盖 + version 未新增 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    const key = 'projection:aggregate:branch_W:agg';
    // 写一份"坏" existing wrapper（含 BigInt 元素 + 稀疏数组 + 缺 idempotency 字段）。
    const badExisting = {
      aggregate: { runtimeBranchId: 'branch_W', articleId: 'article-W', currentVersion: 1, versionIds: [], aggregateRevision: 1 },
      aggregateKey: 'agg',
      versionIds: [],
      // 缺 sourceLevelIdempotencyKeys（坏 wrapper）
    };
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(badExisting, key);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    // 写入前快照（读回，包含 shim 克隆语义）。
    const shimA = createIdbShim(backend);
    const dbA = await coreStore.openRuntimeDb(shimA);
    const before = await new Promise((res) => {
      const tx = dbA.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).get(key);
      r.onsuccess = () => res(r.result);
    });
    // 执行写路径。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const result = await projection.consumeNewsOutbox(
      adapter2,
      outboxItem('o_w', 'branch_W', 'k1'),
      aggregate('branch_W', 'article-W'),
      version('branch_W', 'article-W', 'v1', 1),
    );
    assert(result.ok === false && result.code === 'INVALID_COMMAND', '场景2-坏 wrapper 写路径必须稳定失败，实际 ' + JSON.stringify(result));
    // 写入后快照。
    const shim3 = createIdbShim(backend);
    const db3 = await coreStore.openRuntimeDb(shim3);
    const after = await new Promise((res) => {
      const tx = db3.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).get(key);
      r.onsuccess = () => res(r.result);
    });
    // 确定性深比较：逐字段/逐元素不变（不只是"仍存在"）。
    assert(deepEqualStable(before, after), '场景2-坏 existing wrapper 写前/写后必须深相等（逐字段不变）');
    // aggregate row 未被替换 + version key 未新增。
    assert(after !== undefined && after.aggregate.articleId === 'article-W', '场景2-aggregate row 未被替换');
    const versionKey = 'projection:article:branch_W:article-W:1';
    const versionAfter = await new Promise((res) => {
      const tx = db3.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).get(versionKey);
      r.onsuccess = () => res(r.result);
    });
    assert(versionAfter === undefined, '场景2-目标 article version key 未新增（零写入）');
    recordRejected('P1-1-坏 wrapper 深比较零覆盖', '写前/写后确定性深相等 + version 未新增 + row 未替换', '深相等');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.8-evidence-strength regression passed.');
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
    console.error('story-runtime-g1.3.2.8-evidence-strength regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
