// G1.3.2.1 idempotency regression：P1-6/P0-3 —— projection 幂等必须比较 canonical payload：
// - 文章同 ID 同 payload -> ALREADY_APPLIED 且不增 revision；同 ID 不同 payload -> IDEMPOTENCY_KEY_REUSED 零写入；
// - 游标竞争只有一个成功（CONFLICT）；KnowledgeReceipt 同 ID 不同 payload -> IDEMPOTENCY_KEY_REUSED 零写入；
// - 全部通过真实 readwrite 事务（shim）并断言重开 DB 后写入行数正确（零重复）。
// 生产模块经 esbuild 执行。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';
import { createIdbShim } from './story-runtime-idb-shim.mjs';

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
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  function makeAdapter(shim) {
    return {
      async runTransaction(storeName, fn) {
        const db = await coreStore.openRuntimeDb(shim);
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const completed = new Promise((res, rej) => {
          tx.oncomplete = () => res();
          tx.onerror = () => rej(new Error('tx error'));
          tx.onabort = () => rej(new Error('tx aborted'));
        });
        const result = await fn({
          get: (key) => new Promise((res2, rej2) => { const r = store.get(key); r.onsuccess = () => res2(r.result); r.onerror = () => rej2(new Error('get')); }),
          put: (value, key) => new Promise((res2, rej2) => { const r = store.put(value, key); r.onsuccess = () => res2(); r.onerror = () => rej2(new Error('put')); }),
        });
        await completed;
        return result;
      },
    };
  }
  async function countRows(shim) {
    const db = await coreStore.openRuntimeDb(shim);
    return new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).getAll();
      r.onsuccess = () => res(r.result.length);
    });
  }
  const outboxItem = (id) => ({ outboxId: id, schemaVersion: 3, runtimeBranchId: 'branch_id', sourceRefFingerprint: 's', sourceRevision: 1, kind: 'news', aggregateKey: 'u:x', operation: 'create', sourceLevelIdempotencyKey: 'k_shared', deliveryKey: 'd', payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0 });
  const aggregate = (id) => ({ runtimeBranchId: 'branch_id', articleId: id, currentVersion: 1, versionIds: [], aggregateRevision: 0 });
  const version = (id, vid, vno) => ({ runtimeBranchId: 'branch_id', articleVersionId: vid, articleId: id, articleVersion: vno, sourceRefs: [], sourceFingerprint: 's', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x', title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [] });

  // ══ 场景 1：文章同 ID 同 payload -> ALREADY_APPLIED 不增 revision；同 ID 不同 payload -> IDEMPOTENCY_KEY_REUSED 零写入 ══
  {
    const shim = createIdbShim();
    const adapter = makeAdapter(shim);
    const item = outboxItem('out_id1');
    const agg = aggregate('article_id1');
    const ver1 = version('article_id1', 'v1', 1);
    const r1 = await projection.consumeNewsOutbox(adapter, item, agg, ver1);
    assert(r1.ok, '场景1-首次消费成功');
    // 同 ID 同 payload 重试 -> ALREADY_APPLIED。
    const r2 = await projection.consumeNewsOutbox(adapter, item, agg, ver1);
    assert(!r2.ok && r2.code === 'ALREADY_APPLIED', '场景1-同 ID 同 payload 必须 ALREADY_APPLIED: ' + r2.code);
    // 同 ID 不同 payload -> IDEMPOTENCY_KEY_REUSED 零写入。
    // G1.3.2.9：同源不同 payload = 同版本不同内容（incoming aggregate.currentVersion 与 version.articleVersion 对齐）。
    const r3 = await projection.consumeNewsOutbox(adapter, { ...item, outboxId: 'out_id1b' }, agg, { ...version('article_id1', 'v2', 1), body: 'different-body' });
    assert(!r3.ok && r3.code === 'IDEMPOTENCY_KEY_REUSED', '场景1-同 ID 不同 payload 必须 IDEMPOTENCY_KEY_REUSED: ' + r3.code);
    assert(await countRows(shim) === 2, '场景1-只有聚合+版本两行（零重复），实际 ' + await countRows(shim));
    recordPositive('场景1-文章同ID幂等', '同 payload ALREADY_APPLIED / 不同 payload REUSED + 零写入');
    recordRejected('场景1-文章同ID不同payload', 'IDEMPOTENCY_KEY_REUSED + 零写入', 'IDEMPOTENCY_KEY_REUSED');
  }

  // ══ 场景 2：游标竞争只有一个成功（CONFLICT）══
  {
    const shim = createIdbShim();
    const adapter = makeAdapter(shim);
    const cursor = { runtimeBranchId: 'branch_id', observerId: 'player_ui', channel: 'player_ui' };
    const r1 = await projection.writeObserverCursor(adapter, cursor, 0);
    assert(r1.ok, '场景2-游标首次写入成功');
    const r2 = await projection.writeObserverCursor(adapter, { ...cursor, lastReadArticleVersionId: 'v1' }, 0);
    assert(!r2.ok && r2.code === 'CONFLICT', '场景2-游标 revision 竞争必须 CONFLICT: ' + r2.code);
    const r3 = await projection.writeObserverCursor(adapter, { ...cursor, lastReadArticleVersionId: 'v2' }, 1);
    assert(r3.ok, '场景2-游标 expectedRevision=1 后续写入成功');
    recordPositive('场景2-游标 CAS', 'expectedRevision 竞争 CONFLICT，正确 revision 成功');
    recordRejected('场景2-游标竞争', 'CONFLICT', 'CONFLICT');
  }

  // ══ 场景 3：KnowledgeReceipt 同 ID 同 payload -> ALREADY_APPLIED；不同 payload -> IDEMPOTENCY_KEY_REUSED 零写入 ══
  {
    const shim = createIdbShim();
    const adapter = makeAdapter(shim);
    const receipt = (subjectId, ik) => ({ runtimeBranchId: 'branch_id', receiptId: 'receipt_id1', subjectType: 'npc', subjectId, subjectRef: { kind: 'committed_fact', factId: 'sha256:f', sourceRevision: 1 }, knowledgeKind: 'fact', claimReliability: 'confirmed', channel: 'dialogue', observedAt: { dayOrdinal: 1, minuteOfDay: 0 }, deliveryEvidenceRef: { kind: 'narrative_span', responseId: 'r', bodyFingerprint: 'sha256:b', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:t' }, confidence: 'confirmed', idempotencyKey: ik });
    const r1 = await projection.writeKnowledgeReceipt(adapter, receipt('n1', 'ik1'));
    assert(r1.ok, '场景3-回执首次写入成功');
    const r2 = await projection.writeKnowledgeReceipt(adapter, receipt('n1', 'ik1'));
    assert(!r2.ok && r2.code === 'ALREADY_APPLIED', '场景3-回执同 ID 同 payload 必须 ALREADY_APPLIED: ' + r2.code);
    const r3 = await projection.writeKnowledgeReceipt(adapter, receipt('n2', 'ik2'));
    assert(!r3.ok && r3.code === 'IDEMPOTENCY_KEY_REUSED', '场景3-回执同 ID 不同 payload 必须 IDEMPOTENCY_KEY_REUSED: ' + r3.code);
    assert(await countRows(shim) === 1, '场景3-只有一份回执（零重复），实际 ' + await countRows(shim));
    recordPositive('场景3-回执同ID幂等', '同 payload ALREADY_APPLIED / 不同 payload REUSED + 零写入');
    recordRejected('场景3-回执同ID不同payload', 'IDEMPOTENCY_KEY_REUSED + 零写入', 'IDEMPOTENCY_KEY_REUSED');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.1-idempotency regression passed.');
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
    console.error('story-runtime-g1.3.2.1-idempotency regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
