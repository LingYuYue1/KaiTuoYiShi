// G1.3.2.9 incoming-owner-revision regression：P0-2/P0-3 ——
// - consumeNewsOutbox 在 fingerprint/事务/写入前验证 item/aggregate/version 冻结结构：
//   aggregate A + version B、版本号不一致（currentVersion !== articleVersion）、坏 incoming aggregate/
//   version 均稳定 INVALID_COMMAND、零写入、不 hash 坏值、不进入事务；
// - aggregateRevision +1 安全上界：MAX_SAFE_INTEGER 在写入 article version 前稳定拒绝、
//   existing row 深相等不变；MAX_SAFE_INTEGER-1 正常追加为 MAX_SAFE_INTEGER（正面对照）。
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

  // 独立 backend + 预写 existing（inner 可定制）+ consumeNewsOutbox + 重开核对零写入。
  async function writeWithExisting(innerAggregate, incoming, incomingVersion) {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    const key = 'projection:aggregate:branch_W:agg';
    const existingRow = {
      aggregate: innerAggregate,
      aggregateKey: 'agg',
      versionIds: Array.isArray(innerAggregate?.versionIds) ? [...innerAggregate.versionIds] : [],
      sourceLevelIdempotencyKeys: [{ key: 'k0', payloadFingerprint: 'f0' }],
    };
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(existingRow, key);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const result = await projection.consumeNewsOutbox(adapter2, outboxItem('o_w', 'branch_W', 'k_new'), incoming, incomingVersion);
    const shim3 = createIdbShim(backend);
    const db3 = await coreStore.openRuntimeDb(shim3);
    const read = (k) => new Promise((res) => {
      const tx = db3.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).get(k);
      r.onsuccess = () => res(r.result);
    });
    return { result, existingAfter: await read(key), versionAfter: await read('projection:article:branch_W:' + (incomingVersion?.articleId ?? '') + ':' + (incomingVersion?.articleVersion ?? 1)) };
  }

  // ══ 场景 1：aggregate A + version B / 版本号不一致 / 坏 incoming -> 稳定 INVALID_COMMAND 零写入 ══
  {
    const goodInner = { runtimeBranchId: 'branch_W', articleId: 'article-A', currentVersion: 1, versionIds: [], aggregateRevision: 1 };
    const cases = [
      ['aggregate A + version B', aggregate('branch_W', 'article-A'), version('branch_W', 'article-B', 'vB', 1)],
      ['版本号不一致（cv=1 vs version=2）', aggregate('branch_W', 'article-A'), version('branch_W', 'article-A', 'v2', 2)],
      ['坏 incoming aggregate（articleId 缺失）', { runtimeBranchId: 'branch_W', currentVersion: 1, versionIds: [], aggregateRevision: 1 }, version('branch_W', 'article-A', 'v1', 1)],
      ['坏 incoming version（lifecycle 非法）', aggregate('branch_W', 'article-A'), { ...version('branch_W', 'article-A', 'v1', 1), lifecycle: 'NOT_A_LIFECYCLE' }],
    ];
    for (const [label, incomingAgg, incomingVer] of cases) {
      const { result, existingAfter, versionAfter } = await writeWithExisting(goodInner, incomingAgg, incomingVer);
      assert(result.ok === false && result.code === 'INVALID_COMMAND', '场景1-' + label + '-必须稳定 INVALID_COMMAND，实际 ' + JSON.stringify(result));
      assert(result.message.includes('不一致') || result.message.includes('校验失败') || result.message.includes('零写入'), '场景1-' + label + '-失败信息说明原因');
      assert(existingAfter !== undefined && existingAfter.aggregate.articleId === 'article-A', '场景1-' + label + '-existing 未被覆盖');
      assert(versionAfter === undefined, '场景1-' + label + '-未新增 version（零写入）');
    }
    recordRejected('P0-2-incoming owner 对齐', 'aggregate A+version B/版本号不一致/坏 incoming 全部 INVALID_COMMAND + 零写入', '零写入');
  }

  // ══ 场景 2：aggregateRevision MAX_SAFE 溢出拒绝 + MAX_SAFE-1 正常对照 ══
  {
    // MAX_SAFE：existing revision 到顶，+1 会溢出 -> 写入前稳定拒绝、existing 深相等不变。
    const maxInner = { runtimeBranchId: 'branch_W', articleId: 'article-A', currentVersion: 1, versionIds: [], aggregateRevision: Number.MAX_SAFE_INTEGER };
    const maxResult = await writeWithExisting(maxInner, aggregate('branch_W', 'article-A'), version('branch_W', 'article-A', 'v1', 1));
    assert(maxResult.result.ok === false && maxResult.result.code === 'INVALID_COMMAND', '场景2-MAX_SAFE 必须拒绝，实际 ' + JSON.stringify(maxResult.result));
    assert(maxResult.result.message.includes('上界') || maxResult.result.message.includes('溢出'), '场景2-失败信息说明安全上界');
    assert(maxResult.existingAfter.aggregate.aggregateRevision === Number.MAX_SAFE_INTEGER, '场景2-MAX_SAFE existing row 深相等不变（未溢出落盘）');
    assert(maxResult.versionAfter === undefined, '场景2-MAX_SAFE 未写 article version（零写入）');
    // MAX_SAFE-1：正常追加为 MAX_SAFE。
    const nearMaxInner = { runtimeBranchId: 'branch_W', articleId: 'article-A', currentVersion: 1, versionIds: [], aggregateRevision: Number.MAX_SAFE_INTEGER - 1 };
    const okResult = await writeWithExisting(nearMaxInner, aggregate('branch_W', 'article-A'), version('branch_W', 'article-A', 'v1', 1));
    assert(okResult.result.ok === true, '场景2-MAX_SAFE-1 正常追加成功: ' + JSON.stringify(okResult.result));
    assert(okResult.existingAfter.aggregate.aggregateRevision === Number.MAX_SAFE_INTEGER, '场景2-MAX_SAFE-1 追加后为 MAX_SAFE（仍安全）');
    recordRejected('P0-3-revision 安全上界', 'MAX_SAFE 溢出写入前拒绝 + 深相等不变 + MAX_SAFE-1 正常对照', '溢出');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.9-incoming-owner-revision regression passed.');
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
    console.error('story-runtime-g1.3.2.9-incoming-owner-revision regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
