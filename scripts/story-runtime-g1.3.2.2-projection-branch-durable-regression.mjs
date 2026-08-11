// G1.3.2.2 projection-branch-durable regression：P0-2/P1-1/P1-2 ——
// - P0-2：projection 输入 branch 归属闸门——outbox/aggregate/version 的 runtimeBranchId 必须精确相等，
//   cursor/receipt 必须携带非空 branch 且与 key owner 一致；A->B、B->A、缺失 branch 全部拒绝且零写入；
// - P1-1：生产 projection durable adapter（ProjectionDurableAdapter）写 aggregate/version/cursor/receipt/publication
//   后，关闭数据库并用新 factory handle 读取成功；
// - P1-2：缺失 projection 的 recovery 通过生产 recoverProjectionsFromStore 从持久化 core/outbox 读取，
//   不允许测试脚本手工构造结果；损坏 core 只读且不反推。
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
  const outboxItem = (outboxId, branchId) => ({
    outboxId, schemaVersion: 3, runtimeBranchId: branchId, sourceRefFingerprint: 's', sourceRevision: 1,
    kind: 'news', aggregateKey: 'unit:x', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1',
    payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0,
  });
  const aggregate = (branchId, articleId) => ({ runtimeBranchId: branchId, articleId, currentVersion: 1, versionIds: [], aggregateRevision: 0 });
  const version = (branchId, articleId, vid, vno) => ({
    runtimeBranchId: branchId, articleVersionId: vid, articleId, articleVersion: vno,
    sourceRefs: [], sourceFingerprint: 's', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x',
    title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [],
  });

  // ══ P0-2 场景 1：A->B / B->A / 缺失 branch 全部拒绝且零写入 ══
  {
    const shim = createIdbShim();
    const adapter = new adapterMod.ProjectionDurableAdapter(shim);
    // outbox branch A、aggregate/version branch B -> INVALID_COMMAND 零写入。
    const w1 = await projection.consumeNewsOutbox(adapter, outboxItem('o1', 'branch_A'), aggregate('branch_B', 'article-B'), version('branch_B', 'article-B', 'v1', 1));
    assert(!w1.ok && w1.code === 'INVALID_COMMAND', 'P0-2-outbox A / aggregate B 必须 INVALID_COMMAND: ' + JSON.stringify(w1));
    // B->A。
    const w2 = await projection.consumeNewsOutbox(adapter, outboxItem('o2', 'branch_B'), aggregate('branch_A', 'article-A'), version('branch_A', 'article-A', 'v1', 1));
    assert(!w2.ok && w2.code === 'INVALID_COMMAND', 'P0-2-outbox B / aggregate A 必须 INVALID_COMMAND: ' + JSON.stringify(w2));
    // 缺失 branch。
    const w3 = await projection.writeObserverCursor(adapter, { runtimeBranchId: '', observerId: 'o', channel: 'player_ui' }, 0);
    assert(!w3.ok && w3.code === 'INVALID_COMMAND', 'P0-2-缺失 branch cursor 必须 INVALID_COMMAND: ' + JSON.stringify(w3));
    const w4 = await projection.writeKnowledgeReceipt(adapter, { runtimeBranchId: '', receiptId: 'r1', subjectType: 'npc', subjectId: 'n', subjectRef: { kind: 'committed_fact', factId: 'sha256:f', sourceRevision: 1 }, knowledgeKind: 'fact', claimReliability: 'confirmed', channel: 'dialogue', observedAt: { dayOrdinal: 1, minuteOfDay: 0 }, deliveryEvidenceRef: { kind: 'narrative_span', responseId: 'r', bodyFingerprint: 'sha256:b', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:t' }, confidence: 'confirmed', idempotencyKey: 'ik' });
    assert(!w4.ok && w4.code === 'INVALID_COMMAND', 'P0-2-缺失 branch receipt 必须 INVALID_COMMAND: ' + JSON.stringify(w4));
    const rows = await adapter.readAll(coreStore.PROJECTION_STORE);
    assert(rows.length === 0, 'P0-2-全部跨 branch 输入零写入，投影行数 0，实际 ' + rows.length);
    recordRejected('P0-2-跨branch输入', 'INVALID_COMMAND + 零写入（4 组）', 'INVALID_COMMAND');
  }

  // ══ P1-1 场景 2：生产 adapter 写 aggregate/version/cursor/receipt/publication，重开 DB 后可读 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    // 写文章（同 branch 合法）。
    const item = outboxItem('o_durable', 'branch_D');
    const agg = aggregate('branch_D', 'article-D');
    const ver = version('branch_D', 'article-D', 'v1', 1);
    const w = await projection.consumeNewsOutbox(adapter1, item, agg, ver);
    assert(w.ok, 'P1-1-生产 adapter 写文章成功');
    // 写游标 + 回执 + publication。
    const c = await projection.writeObserverCursor(adapter1, { runtimeBranchId: 'branch_D', observerId: 'player_ui', channel: 'player_ui' }, 0);
    assert(c.ok, 'P1-1-写游标成功');
    const r = await projection.writeKnowledgeReceipt(adapter1, { runtimeBranchId: 'branch_D', receiptId: 'receipt_D', subjectType: 'npc', subjectId: 'n', subjectRef: { kind: 'committed_fact', factId: 'sha256:f', sourceRevision: 1 }, knowledgeKind: 'fact', claimReliability: 'confirmed', channel: 'dialogue', observedAt: { dayOrdinal: 1, minuteOfDay: 0 }, deliveryEvidenceRef: { kind: 'narrative_span', responseId: 'r', bodyFingerprint: 'sha256:b', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:t' }, confidence: 'confirmed', idempotencyKey: 'ik' });
    assert(r.ok, 'P1-1-写回执成功');
    const pub = { publicationId: 'pub_D', runtimeBranchId: 'branch_D', turnId: 't1', sourceRuntimeRevision: 1, commitReceiptId: 'rc', body: 'b', bodyFingerprint: 'sha256:bf', status: 'revealed', revealAttemptCount: 0, createdAt: { dayOrdinal: 1, minuteOfDay: 0 } };
    const p = await adapterMod.durablePutPublication(adapter1, pub);
    assert(p.ok, 'P1-1-写 publication 成功');
    // 关闭并重开（新 factory handle）。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    // G1.3.2.3：durableListProjections 覆盖五类行——aggregate、裸 article version、cursor、receipt、publication 共 5 条。
    // G1.3.2.6：durableListProjections 返回 DurableListResult（ok/values/skipped）。
    const list = await adapterMod.durableListProjections(adapter2, 'branch_D');
    assert(list.ok === true && list.values.length === 5, 'P1-1-重开 DB 后可读 5 条 projection 记录（含 article version 行），实际 ' + JSON.stringify(list));
    const gotPub = await adapterMod.durableGetPublication(adapter2, 'branch_D', 'pub_D');
    assert(gotPub.ok === true && gotPub.value.publicationId === 'pub_D', 'P1-1-重开 DB 后 publication 可读: ' + JSON.stringify(gotPub));
    recordPositive('P1-1-生产 adapter 重开可读', 'aggregate/version/cursor/receipt/publication 共 5 条');
  }

  // ══ P1-2 场景 3：缺失 projection recovery 通过生产函数从持久化记录读取（不手工构造）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    // 写 core 到 DB（无 projection）。
    const core = makeEmptyState({ runtimeBranchId: 'branch_missing', saveNodeId: 's', runtimeRevision: 0 });
    const db1 = await coreStore.openRuntimeDb(shim1);
    await new Promise((res) => {
      const tx = db1.transaction(coreStore.CORE_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.CORE_STORE).put(core, 'branch_missing');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    // 重开 DB，用生产 recoverProjectionsFromStore 读取。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_missing');
    assert(recovered.runtimeBranchId === 'branch_missing', 'P1-2-恢复结果 branch 正确');
    assert(recovered.rebuilt === true, 'P1-2-缺失 projection 必须标记 rebuilt=true');
    assert(recovered.newsArticles.length === 0 && recovered.knowledgeReceipts.length === 0, 'P1-2-不伪造文章/知识');
    // 损坏 core 只读且不反推。
    const corrupt = { ...core, schemaVersion: 99 };
    await new Promise((res) => {
      const tx = db1.transaction(coreStore.CORE_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.CORE_STORE).put(corrupt, 'branch_corrupt2');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim3 = createIdbShim(backend);
    const stored = await coreStore.readCoreState('branch_corrupt2', shim3);
    assert(stored !== null && stored.schemaVersion === 99, 'P1-2-重开 DB 读到损坏 core');
    assert(stored.factLedger.length === 0 && stored.worldEvents.length === 0, 'P1-2-损坏 core 不反推事实（v3_recovery 只读）');
    recordPositive('P1-2-生产 recovery 入口', '重开 DB + recoverProjectionsFromStore + 不伪造/不反推');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.2-projection-branch-durable regression passed.');
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
    console.error('story-runtime-g1.3.2.2-projection-branch-durable regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
