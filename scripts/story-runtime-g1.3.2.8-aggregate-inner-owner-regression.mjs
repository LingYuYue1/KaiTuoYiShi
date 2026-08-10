// G1.3.2.8 aggregate-inner-owner regression：P0-2/P0-3 ——
// - existing inner aggregate 必须通过冻结 NewsArticleAggregate 完整校验（currentVersion/aggregateRevision/
//   versionIds 及全部必填字段）——string revision、BigInt revision、负数/非安全整数、非法 currentVersion、
//   缺字段均稳定 INVALID_COMMAND + 明确原因，零写入、不 throw、不覆盖、验证失败不得 +1、不得先写 version；
// - 同一 aggregateKey 的 articleId owner 一致：A -> B 接管拒绝（零写入、不覆盖、不新增 version），
//   A -> A 正常追加对照（最终 versionIds 不串入另一 article）。
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

  // 独立 backend + 预写 existing wrapper（inner 可定制）+ consumeNewsOutbox + 重开核对零写入。
  async function writeWithExisting(innerAggregate, incomingArticleId, incomingVersionNo = 1) {
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
    const result = await projection.consumeNewsOutbox(
      adapter2,
      outboxItem('o_w', 'branch_W', 'k_new'),
      // G1.3.2.9：incoming aggregate 的 currentVersion 必须与 version.articleVersion 对齐（owner 校验）。
      { ...aggregate('branch_W', incomingArticleId), currentVersion: incomingVersionNo },
      version('branch_W', incomingArticleId, 'v' + incomingVersionNo, incomingVersionNo),
    );
    const shim3 = createIdbShim(backend);
    const db3 = await coreStore.openRuntimeDb(shim3);
    const read = (k) => new Promise((res) => {
      const tx = db3.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).get(k);
      r.onsuccess = () => res(r.result);
    });
    return { result, existingAfter: await read(key), versionAfter: await read('projection:article:branch_W:' + incomingArticleId + ':' + incomingVersionNo) };
  }

  // ══ 场景 1：inner aggregate 坏值（string/BigInt/负 revision、非法 currentVersion、缺字段）-> 稳定 INVALID_COMMAND 零写入 ══
  {
    const goodBase = { runtimeBranchId: 'branch_W', articleId: 'article-A', currentVersion: 1, versionIds: [], aggregateRevision: 1 };
    const badInners = [
      ['string revision', { ...goodBase, aggregateRevision: 'bad' }],
      ['BigInt revision', { ...goodBase, aggregateRevision: 1n }],
      ['负数 revision', { ...goodBase, aggregateRevision: -1 }],
      ['NaN revision', { ...goodBase, aggregateRevision: NaN }],
      ['非法 currentVersion', { ...goodBase, currentVersion: 'x' }],
      ['缺 currentVersion', (() => { const o = { ...goodBase }; delete o.currentVersion; return o; })()],
      ['缺 aggregateRevision', (() => { const o = { ...goodBase }; delete o.aggregateRevision; return o; })()],
      ['缺 versionIds', (() => { const o = { ...goodBase }; delete o.versionIds; return o; })()],
    ];
    for (const [label, inner] of badInners) {
      const { result, existingAfter, versionAfter } = await writeWithExisting(inner, 'article-A', 1);
      assert(result.ok === false && result.code === 'INVALID_COMMAND', '场景1-' + label + '-必须稳定 INVALID_COMMAND，实际 ' + JSON.stringify(result));
      assert(result.message.includes('冻结校验失败') || result.message.includes('零写入'), '场景1-' + label + '-失败信息必须说明原因');
      assert(existingAfter !== undefined && Object.is(existingAfter.aggregate.aggregateRevision, inner.aggregateRevision), '场景1-' + label + '-existing 未被覆盖（原 revision 保留，未 +1）');
      assert(versionAfter === undefined, '场景1-' + label + '-不得先写 article version（零写入）');
    }
    recordRejected('P0-2-inner aggregate 完整冻结校验', '8 个坏 inner 独立 backend 全部 INVALID_COMMAND + 零写入 + 不覆盖', 'INVALID_COMMAND');
  }

  // ══ 场景 2：A -> B 接管拒绝（相同 branch、相同 aggregateKey、不同 articleId）══
  {
    const goodInner = { runtimeBranchId: 'branch_W', articleId: 'article-A', currentVersion: 1, versionIds: ['v1'], aggregateRevision: 1 };
    const { result, existingAfter, versionAfter } = await writeWithExisting(goodInner, 'article-B', 2);
    assert(result.ok === false && result.code === 'INVALID_COMMAND', '场景2-A->B 接管必须拒绝，实际 ' + JSON.stringify(result));
    assert(result.message.includes('articleId') && result.message.includes('接管'), '场景2-失败信息说明 articleId owner 不一致');
    // 旧记录逐字段不变（articleId 仍是 A、versionIds 未串入 B）。
    assert(existingAfter.aggregate.articleId === 'article-A', '场景2-existing articleId 仍为 A（未被接管）');
    assert(JSON.stringify(existingAfter.aggregate.versionIds) === JSON.stringify(['v1']), '场景2-versionIds 未串入另一 article');
    assert(versionAfter === undefined, '场景2-未新增 B 的 version（零写入）');
    recordRejected('P0-3-A->B 接管拒绝', 'INVALID_COMMAND + articleId 保留 + versionIds 不串入 + 零写入', '零写入');
  }

  // ══ 场景 3：A -> A 正常追加对照（versionIds 追加到同一 article）══
  {
    const goodInner = { runtimeBranchId: 'branch_W', articleId: 'article-A', currentVersion: 1, versionIds: [], aggregateRevision: 1 };
    const { result, existingAfter } = await writeWithExisting(goodInner, 'article-A', 1);
    assert(result.ok === true, '场景3-A->A 正常追加成功: ' + JSON.stringify(result));
    assert(existingAfter.aggregate.articleId === 'article-A', '场景3-articleId 保持 A');
    assert(existingAfter.aggregate.aggregateRevision === 2, '场景3-revision 正常 +1（合法路径）');
    assert(Array.isArray(existingAfter.aggregate.versionIds) && existingAfter.aggregate.versionIds.length === 1, '场景3-versionIds 追加到同一 article');
    recordPositive('P0-3-A->A 正常追加对照', '成功 + revision +1 + versionIds 同 article');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.8-aggregate-inner-owner regression passed.');
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
    console.error('story-runtime-g1.3.2.8-aggregate-inner-owner regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
