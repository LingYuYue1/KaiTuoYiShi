// G1.3.2.7 aggregate-write-corrupt-wrapper regression：P0-3 ——
// - consumeNewsOutbox() 读取 existing aggregate wrapper 后、访问任何字段前先完整校验；
//   缺 idempotency/versionIds/aggregateKey、非法元素、owner 不一致均稳定 typed failure + 零写入、
//   不 throw、不 hang、不覆盖坏档；
// - 合法 existing wrapper 的幂等/冲突/正常追加行为保持不变（对照）。
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

  // 独立 backend + 预写损坏 existing wrapper + consumeNewsOutbox + 重开核对零写入（逐条隔离）。
  async function writeWithCorruptExisting(existingRow) {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    const key = 'projection:aggregate:branch_W:agg';
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(existingRow, key);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const result = await projection.consumeNewsOutbox(
      adapter2,
      outboxItem('o_w', 'branch_W', 'k1'),
      aggregate('branch_W', 'article-W'),
      version('branch_W', 'article-W', 'v1', 1),
    );
    // 重开 DB 核对零写入（existing 原样保留 + 无 version 行）。
    const shim3 = createIdbShim(backend);
    const db3 = await coreStore.openRuntimeDb(shim3);
    const read = (k) => new Promise((res) => {
      const tx = db3.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).get(k);
      r.onsuccess = () => res(r.result);
    });
    return { result, existingAfter: await read(key), versionAfter: await read('projection:article:branch_W:article-W:1') };
  }

  // ══ 场景 1：损坏 existing wrapper（缺 idempotency/versionIds/aggregateKey/owner 不一致）-> 稳定失败 + 零写入 ══
  {
    const goodInner = { runtimeBranchId: 'branch_W', articleId: 'article-W', currentVersion: 1, versionIds: [], aggregateRevision: 1 };
    const corruptRows = [
      ['缺 sourceLevelIdempotencyKeys', { aggregate: goodInner, aggregateKey: 'agg', versionIds: [] }],
      ['缺 versionIds', { aggregate: goodInner, aggregateKey: 'agg', sourceLevelIdempotencyKeys: [] }],
      ['缺 aggregateKey', { aggregate: goodInner, versionIds: [], sourceLevelIdempotencyKeys: [] }],
      ['idempotency 元素空 key', { aggregate: goodInner, aggregateKey: 'agg', versionIds: [], sourceLevelIdempotencyKeys: [{ key: '', payloadFingerprint: 'f' }] }],
      ['idempotency 元素 BigInt', { aggregate: goodInner, aggregateKey: 'agg', versionIds: [], sourceLevelIdempotencyKeys: [{ key: 1n, payloadFingerprint: 'f' }] }],
      ['owner 不一致（inner branch 其他）', { aggregate: { ...goodInner, runtimeBranchId: 'branch_OTHER' }, aggregateKey: 'agg', versionIds: [], sourceLevelIdempotencyKeys: [] }],
    ];
    for (const [label, row] of corruptRows) {
      const { result, existingAfter, versionAfter } = await writeWithCorruptExisting(row);
      assert(result.ok === false && result.code === 'INVALID_COMMAND', '场景1-' + label + '-必须稳定 typed failure（INVALID_COMMAND），实际 ' + JSON.stringify(result));
      assert(result.message.includes('零写入') || result.message.includes('不一致') || result.message.includes('缺失') || result.message.includes('非法'), '场景1-' + label + '-失败信息必须说明原因');
      assert(existingAfter !== undefined, '场景1-' + label + '-existing wrapper 未被覆盖（原样保留）');
      assert(versionAfter === undefined, '场景1-' + label + '-不得先写 article version（零写入）');
    }
    recordRejected('P0-3-损坏 existing wrapper 写路径', '6 个坏 wrapper 独立 backend 全部稳定失败 + 零写入 + 不覆盖', '零写入');
  }

  // ══ 场景 2：合法 existing wrapper 的幂等/冲突/追加对照 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    // 第一次消费：成功。
    const w1 = await projection.consumeNewsOutbox(adapter1, outboxItem('o_ok', 'branch_W2', 'k1'), aggregate('branch_W2', 'article-W2'), version('branch_W2', 'article-W2', 'v1', 1));
    assert(w1.ok, '场景2-首次消费成功: ' + JSON.stringify(w1));
    // 同源同 payload 第二次：ALREADY_APPLIED（幂等，不产生第二篇）。
    const w2 = await projection.consumeNewsOutbox(adapter1, outboxItem('o_ok2', 'branch_W2', 'k1'), aggregate('branch_W2', 'article-W2'), version('branch_W2', 'article-W2', 'v1', 1));
    assert(!w2.ok && w2.code === 'ALREADY_APPLIED', '场景2-同源同 payload 幂等');
    // 同源不同 payload：IDEMPOTENCY_KEY_REUSED 零写入（G1.3.2.9：incoming aggregate.currentVersion 与 version 对齐）。
    const w3 = await projection.consumeNewsOutbox(adapter1, outboxItem('o_ok3', 'branch_W2', 'k1'), { ...aggregate('branch_W2', 'article-W2'), currentVersion: 9 }, version('branch_W2', 'article-W2', 'v9', 9));
    assert(!w3.ok && w3.code === 'IDEMPOTENCY_KEY_REUSED', '场景2-同源不同 payload 冲突');
    // 新源：正常追加（第二版本）。
    const w4 = await projection.consumeNewsOutbox(adapter1, outboxItem('o_ok4', 'branch_W2', 'k2'), { ...aggregate('branch_W2', 'article-W2'), currentVersion: 2 }, version('branch_W2', 'article-W2', 'v2', 2));
    assert(w4.ok, '场景2-新源正常追加: ' + JSON.stringify(w4));
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_W2');
    assert(recovered.articleVersions.length === 2, '场景2-两个版本正常追加（合法 wrapper 行为不变）');
    recordPositive('P0-3-合法 wrapper 写路径对照', '首次成功 + 幂等 + 冲突 + 新源追加');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.7-aggregate-write-corrupt-wrapper regression passed.');
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
    console.error('story-runtime-g1.3.2.7-aggregate-write-corrupt-wrapper regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
