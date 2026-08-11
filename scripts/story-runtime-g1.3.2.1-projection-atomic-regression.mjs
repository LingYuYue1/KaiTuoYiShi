// G1.3.2.1 projection-atomic regression：P0-3/P1-6 —— 文章/阅读游标/KnowledgeReceipt 的
// 读取+比较+写入必须在同一真实 readwrite 事务内（不可分割），且并发由事务队列串行化。
// 生产 projectionStore 的函数接受 adapter.runTransaction(storeName, fn)：一个不可分割的事务原语，
// 回调内所有 get/put 原子。本回归用测试 IDB shim（真实 readwrite 串行 + 一次性发布）实现该 adapter，
// 并用 Promise.all 同时启动两个调用（屏障只放在事务外启动，不把读写拆成两个事务）。
// 正确实现下：两个并发调用一个成功，另一个得到 ALREADY_APPLIED/IDEMPOTENCY_KEY_REUSED/CONFLICT。
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

  const outboxItem = (outboxId) => ({
    outboxId, schemaVersion: 3, runtimeBranchId: 'branch_p', sourceRefFingerprint: 'sha256:src', sourceRevision: 1,
    kind: 'news', aggregateKey: 'unit:x', operation: 'create', sourceLevelIdempotencyKey: 'k_shared', deliveryKey: 'd1',
    payloadFingerprint: 'sha256:p', payloadRef: { kind: 'inline', key: 'sha256:p' }, consumerIds: ['news'],
    consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0,
  });
  const aggregate = (articleId) => ({ runtimeBranchId: 'branch_p', articleId, currentVersion: 1, versionIds: [], aggregateRevision: 0 });
  const version = (articleId, versionId, versionNo) => ({
    runtimeBranchId: 'branch_p', articleVersionId: versionId, articleId, articleVersion: versionNo,
    sourceRefs: [], sourceFingerprint: 'sha256:s', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x',
    title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [],
  });

  /**
   * 基于测试 IDB shim 的 projection adapter：runTransaction 打开真实 readwrite 事务，
   * 先 await fn（回调内 get/put 原子），再 await 事务完成（写一次性发布）；readwrite 事务被 shim
   * 串行化（后一个事务在前一个 complete 后才读），因此并发调用不存在"都读到旧值再写"窗口。
   * 屏障只在事务外（Promise.all 同时启动），不拆事务。
   */
  function makeShimProjectionAdapter(shim) {
    return {
      async runTransaction(storeName, fn) {
        const db = await coreStore.openRuntimeDb(shim);
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        let txError = null;
        const completed = new Promise((res, rej) => {
          tx.oncomplete = () => res();
          tx.onerror = () => { txError = new Error('tx error'); rej(txError); };
          tx.onabort = () => { if (!txError) txError = new Error('tx aborted'); rej(txError); };
        });
        const result = await fn({
          get: (key) => new Promise((res2, rej2) => {
            const req = store.get(key);
            req.onsuccess = () => res2(req.result);
            req.onerror = () => rej2(new Error('get failed'));
          }),
          put: (value, key) => new Promise((res2, rej2) => {
            const req = store.put(value, key);
            req.onsuccess = () => res2();
            req.onerror = () => rej2(new Error('put failed'));
          }),
        });
        await completed;
        return result;
      },
    };
  }

  // ══ 场景 1：文章同源同 payload 并发 -> 一个成功，一个 ALREADY_APPLIED（不产生第二篇）══
  {
    const shim = createIdbShim();
    const adapter = makeShimProjectionAdapter(shim);
    const item = outboxItem('out_shared');
    const agg = aggregate('article_p1');
    const ver = version('article_p1', 'v1', 1);
    const results = await Promise.all([
      projection.consumeNewsOutbox(adapter, item, agg, ver),
      projection.consumeNewsOutbox(adapter, item, agg, ver),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    const appliedCount = results.filter((r) => !r.ok && r.code === 'ALREADY_APPLIED').length;
    assert(okCount === 1 && appliedCount === 1, '场景1-同源同 payload 并发必须一成功一 ALREADY_APPLIED: ' + JSON.stringify(results.map((r) => r.code)));
    const db = await coreStore.openRuntimeDb(shim);
    const all = await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const req = tx.objectStore(coreStore.PROJECTION_STORE).getAll();
      req.onsuccess = () => res(req.result);
    });
    // 聚合 1 行 + 版本 1 行 = 2 行（无重复文章）。
    assert(all.length === 2, '场景1-只写入聚合+版本两行（无重复文章），实际 ' + all.length);
    recordPositive('场景1-文章同源同 payload 并发', '1 success + 1 ALREADY_APPLIED，无重复');
    recordRejected('场景1-文章同源并发失败方', 'ALREADY_APPLIED + 零重复写入', 'ALREADY_APPLIED');
  }

  // ══ 场景 2：文章同源不同 payload 并发 -> 一个成功，一个 IDEMPOTENCY_KEY_REUSED（零写入）══
  {
    const shim = createIdbShim();
    const adapter = makeShimProjectionAdapter(shim);
    const item = outboxItem('out_shared2');
    const agg = aggregate('article_p2');
    const ver1 = version('article_p2', 'v1', 1);
    // G1.3.2.9：同源不同 payload = 同版本不同内容（currentVersion 与 articleVersion 对齐）。
    const ver2 = { ...version('article_p2', 'v2', 1), body: 'different-body' };
    const results = await Promise.all([
      projection.consumeNewsOutbox(adapter, item, agg, ver1),
      projection.consumeNewsOutbox(adapter, { ...item, outboxId: 'out_shared2b' }, agg, ver2),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    const reusedCount = results.filter((r) => !r.ok && r.code === 'IDEMPOTENCY_KEY_REUSED').length;
    assert(okCount === 1 && reusedCount === 1, '场景2-同源不同 payload 并发必须一成功一 IDEMPOTENCY_KEY_REUSED: ' + JSON.stringify(results.map((r) => r.code)));
    const db = await coreStore.openRuntimeDb(shim);
    const all = await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const req = tx.objectStore(coreStore.PROJECTION_STORE).getAll();
      req.onsuccess = () => res(req.result);
    });
    assert(all.length === 2, '场景2-零写入（无第二篇文章版本），实际 ' + all.length);
    recordPositive('场景2-文章同源不同 payload 并发', '1 success + 1 IDEMPOTENCY_KEY_REUSED');
    recordRejected('场景2-文章同源不同 payload', 'IDEMPOTENCY_KEY_REUSED + 零写入', 'IDEMPOTENCY_KEY_REUSED');
  }

  // ══ 场景 3：阅读游标同 expectedRevision 并发 -> 一个成功，一个 CONFLICT ══
  {
    const shim = createIdbShim();
    const adapter = makeShimProjectionAdapter(shim);
    const cursor = { runtimeBranchId: 'branch_p', observerId: 'player_ui', channel: 'player_ui' };
    const cursorB = { ...cursor, lastReadArticleVersionId: 'v1' };
    const results = await Promise.all([
      projection.writeObserverCursor(adapter, cursor, 0),
      projection.writeObserverCursor(adapter, cursorB, 0),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    const conflictCount = results.filter((r) => !r.ok && r.code === 'CONFLICT').length;
    assert(okCount === 1 && conflictCount === 1, '场景3-游标同 revision 并发必须一成功一 CONFLICT: ' + JSON.stringify(results.map((r) => r.code)));
    recordPositive('场景3-游标同 revision 并发', '1 success + 1 CONFLICT');
    recordRejected('场景3-游标并发失败方', 'CONFLICT', 'CONFLICT');
  }

  // ══ 场景 4：KnowledgeReceipt 同 ID 不同 payload 并发 -> 一个成功，一个 IDEMPOTENCY_KEY_REUSED ══
  {
    const shim = createIdbShim();
    const adapter = makeShimProjectionAdapter(shim);
    const receipt = (subjectId, ik) => ({
      runtimeBranchId: 'branch_p', receiptId: 'receipt_p1', subjectType: 'npc', subjectId, subjectRef: { kind: 'committed_fact', factId: 'sha256:f', sourceRevision: 1 }, knowledgeKind: 'fact', claimReliability: 'confirmed', channel: 'dialogue', observedAt: { dayOrdinal: 1, minuteOfDay: 0 }, deliveryEvidenceRef: { kind: 'narrative_span', responseId: 'r', bodyFingerprint: 'sha256:b', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:t' }, confidence: 'confirmed', idempotencyKey: ik,
    });
    const results = await Promise.all([
      projection.writeKnowledgeReceipt(adapter, receipt('n1', 'ik1')),
      projection.writeKnowledgeReceipt(adapter, receipt('n2', 'ik2')),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    const reusedCount = results.filter((r) => !r.ok && r.code === 'IDEMPOTENCY_KEY_REUSED').length;
    assert(okCount === 1 && reusedCount === 1, '场景4-回执同 ID 不同 payload 并发必须一成功一 IDEMPOTENCY_KEY_REUSED: ' + JSON.stringify(results.map((r) => r.code)));
    const db = await coreStore.openRuntimeDb(shim);
    const all = await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const req = tx.objectStore(coreStore.PROJECTION_STORE).getAll();
      req.onsuccess = () => res(req.result);
    });
    assert(all.length === 1, '场景4-零写入（无第二份回执），实际 ' + all.length);
    recordPositive('场景4-回执同 ID 不同 payload 并发', '1 success + 1 IDEMPOTENCY_KEY_REUSED');
    recordRejected('场景4-回执同 ID 不同 payload', 'IDEMPOTENCY_KEY_REUSED + 零写入', 'IDEMPOTENCY_KEY_REUSED');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.1-projection-atomic regression passed.');
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
    console.error('story-runtime-g1.3.2.1-projection-atomic regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
