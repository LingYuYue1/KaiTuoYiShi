// G1.3.2.4 projection-row-recovery regression：P0-1 ——
// - 五类 durable row 全部真实写入、关闭/重开、生产 recovery：
//   aggregate `{ aggregate, versionIds, sourceLevelIdempotencyKeys }`、article version 裸行、
//   cursor `{ cursor, revision }`、receipt `{ receipt, payloadFingerprint }`、
//   publication `{ publication, payloadFingerprint }`（单层包装，recovery 不得再嵌套访问崩溃）；
// - 任一合法行不得 throw；损坏/错包装行返回稳定只读诊断（diagnostics），不静默跳过、不部分接受；
// - recovery 结果必须来自真实持久化记录（不手工构造），article version 不再丢失。
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
  const receipt = (branchId, receiptId) => ({
    runtimeBranchId: branchId, receiptId, subjectType: 'npc', subjectId: 'n',
    subjectRef: { kind: 'committed_fact', factId: 'sha256:f', sourceRevision: 1 }, knowledgeKind: 'fact',
    claimReliability: 'confirmed', channel: 'dialogue', observedAt: { dayOrdinal: 1, minuteOfDay: 0 },
    deliveryEvidenceRef: { kind: 'narrative_span', responseId: 'r', bodyFingerprint: 'sha256:b', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:t' },
    confidence: 'confirmed', idempotencyKey: 'ik',
  });
  const publication = (branchId, pubId) => ({
    publicationId: pubId, runtimeBranchId: branchId, turnId: 't1', sourceRuntimeRevision: 1, commitReceiptId: 'rc',
    body: 'b', bodyFingerprint: 'sha256:bf', status: 'revealed', revealAttemptCount: 0, createdAt: { dayOrdinal: 1, minuteOfDay: 0 },
  });

  // ══ 场景 1：五类真实 row 全部写入 -> 关闭/重开 -> 生产 recovery 全部恢复（单层包装，不崩溃）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    // aggregate + article version（生产 consumeNewsOutbox）。
    const w = await projection.consumeNewsOutbox(adapter1, outboxItem('o_r1', 'branch_R'), aggregate('branch_R', 'article-R'), version('branch_R', 'article-R', 'v1', 1));
    assert(w.ok, '场景1-写 aggregate+version 成功');
    // cursor（单层 `{ cursor, revision }`）。
    const c = await projection.writeObserverCursor(adapter1, { runtimeBranchId: 'branch_R', observerId: 'player_ui', channel: 'player_ui' }, 0);
    assert(c.ok, '场景1-写 cursor 成功');
    // receipt（单层 `{ receipt, payloadFingerprint }`）。
    const r = await projection.writeKnowledgeReceipt(adapter1, receipt('branch_R', 'receipt_R'));
    assert(r.ok, '场景1-写 receipt 成功');
    // publication（单层 `{ publication, payloadFingerprint }`）。
    const p = await adapterMod.durablePutPublication(adapter1, publication('branch_R', 'pub_R'));
    assert(p.ok, '场景1-写 publication 成功');
    // 关闭/重开 + 生产 recovery（不手工构造结果）。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_R');
    assert(recovered.rebuilt === false, '场景1-五类行存在时 rebuilt=false');
    assert(recovered.newsArticles.length === 1 && recovered.newsArticles[0].articleId === 'article-R', '场景1-恢复 aggregate（真实行）');
    assert(recovered.articleVersions.length === 1 && recovered.articleVersions[0].articleVersionId === 'v1', '场景1-恢复 article version（真实行，不再丢失）');
    assert(recovered.observerReadCursors.length === 1 && recovered.observerReadCursors[0].observerId === 'player_ui', '场景1-恢复 cursor（单层包装不崩溃）');
    assert(recovered.knowledgeReceipts.length === 1 && recovered.knowledgeReceipts[0].receiptId === 'receipt_R', '场景1-恢复 receipt（单层包装不崩溃）');
    assert(recovered.publications.length === 1 && recovered.publications[0].publicationId === 'pub_R', '场景1-恢复 publication（单层包装不崩溃）');
    // 行级诊断必须为 0（五类合法行不得报损坏；core 缺失诊断是合法只读标记，允许存在）。
    const rowDiags = recovered.diagnostics.filter((d) => !d.includes('core 缺失') && !d.includes('读取 core 失败'));
    assert(rowDiags.length === 0, '场景1-五类合法行不得产生行级损坏诊断: ' + JSON.stringify(recovered.diagnostics));
    recordPositive('P0-1-五类真实 row 全量恢复', 'aggregate/version/cursor/receipt/publication 单层解析 + 0 诊断');
  }

  // ══ 场景 2：错包装/少字段损坏行 -> 稳定只读诊断，不 throw、不部分接受 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    // 直接向 runtimeProjections 写损坏行（绕过生产写入口，模拟数据库被篡改/旧版本错位）。
    const db = await coreStore.openRuntimeDb(shim1);
    const corrupted = [
      { cursor: { cursor: { runtimeBranchId: 'branch_R2', observerId: 'x', channel: 'player_ui' }, revision: 1 } }, // 双层错误包装
      { receipt: { receipt: { runtimeBranchId: 'branch_R2', receiptId: 'bad' }, payloadFingerprint: 'f' } },       // 双层错误包装
      { publication: { publication: { runtimeBranchId: 'branch_R2', publicationId: 'bad' }, payloadFingerprint: 'f' } }, // 双层错误包装
      { articleId: 'a', articleVersion: 1, runtimeBranchId: 'branch_R2' },                                        // 少字段版本行
      { nonsense: true },                                                                                          // 未知形状
    ];
    for (let i = 0; i < corrupted.length; i += 1) {
      const key = 'projection:corrupt:' + i;
      await new Promise((res) => {
        const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
        const rq = tx.objectStore(coreStore.PROJECTION_STORE).put(corrupted[i], key);
        rq.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      });
    }
    // 重开 + 生产 recovery：不得 throw；损坏行进 diagnostics，合法恢复不部分接受。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_R2');
    assert(recovered.observerReadCursors.length === 0 && recovered.knowledgeReceipts.length === 0 && recovered.publications.length === 0 && recovered.articleVersions.length === 0, '场景2-损坏行不得被部分接受为合法恢复');
    assert(recovered.diagnostics.length >= corrupted.length, '场景2-每个损坏行都必须有只读诊断，实际 ' + recovered.diagnostics.length + ' 条');
    for (const d of recovered.diagnostics) assert(typeof d === 'string' && d.length > 0, '场景2-诊断必须是可读文本');
    recordRejected('P0-1-损坏/错包装行', '5 个损坏行全部进入只读诊断（不 throw、不部分接受）', '只读诊断');
  }

  // ══ 场景 3：无任何行 + core/outbox 持久化 -> 缺失 projection 只重建可证明内容 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const pubRecord = publication('branch_R3', 'pub_R3');
    const core = makeEmptyState({ runtimeBranchId: 'branch_R3', saveNodeId: 's', runtimeRevision: 0, narrativePublications: [pubRecord] });
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_R3', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [outboxItem('o_R3', 'branch_R3')], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    assert(seed.ok, '场景3-生产 seed 成功');
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_R3');
    assert(recovered.rebuilt === true, '场景3-缺失 projection rebuilt=true');
    assert(recovered.newsArticles.length === 0 && recovered.articleVersions.length === 0 && recovered.knowledgeReceipts.length === 0, '场景3-不伪造文章/版本/知识');
    assert(recovered.publications.length === 1 && recovered.publications[0].publicationId === 'pub_R3', '场景3-从 core 真实重建 publication');
    assert(recovered.pendingOutboxItems.length === 1 && recovered.pendingOutboxItems[0].outboxId === 'o_R3', '场景3-从 outbox 恢复非终态任务');
    recordPositive('P0-1-缺失 projection 重建', 'rebuilt=true + 只重建可证明内容（publication/pending）');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.4-projection-row-recovery regression passed.');
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
    console.error('story-runtime-g1.3.2.4-projection-row-recovery regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
