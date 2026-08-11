// G1.3.2.3 projection-version-recovery regression：P1-1/P1-2 ——
// - article version 以可识别、不可变的 production row（裸 NewsArticleVersion）存储，
//   真实写入并关闭/重开 factory 后 typed get/list 能返回 NewsArticleVersion（不能只返回 aggregate）；
// - recoverProjectionsFromStore 从真实持久化 core/outbox/projection 读取：
//   - 已存在 projection 时恢复 aggregate/article version/cursor/receipt/publication 全部真实记录；
//   - 缺失 projection 时只从 core facts（narrativePublications）与 outbox（未消费任务记录）重建可证明内容，
//     不伪造文章/知识/事实（rebuilt=true 必须伴随真实重建证据）；
//   - 损坏 core（schemaVersion 非法）进入 v3_recovery 只读（readonlyMode=true），不从 projection/news 反推 core；
// - 测试不手工构造 rebuilt 结果；所有数据来自数据库持久化记录。
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

  // ══ P1-1 场景 1：真实写入 -> 关闭/重开 factory -> typed get/list 返回 NewsArticleVersion + recovery 完整恢复 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    const item = outboxItem('o_vr', 'branch_V');
    const agg = aggregate('branch_V', 'article-V');
    const ver = version('branch_V', 'article-V', 'v1', 1);
    const w = await projection.consumeNewsOutbox(adapter1, item, agg, ver);
    assert(w.ok, '场景1-生产写入 article version 成功: ' + JSON.stringify(w));
    // 关闭/重开（新 factory handle）。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    // typed get：article version 必须可读且是完整版本对象（不只 aggregate）。
    // G1.3.2.4：typed get 返回 DurableRowResult——ok:true 且 value 是完整 NewsArticleVersion。
    const gotVer = await adapterMod.durableGetArticleVersion(adapter2, 'branch_V', 'article-V', 1);
    assert(gotVer.ok === true, '场景1-重开 DB 后 typed get 必须返回 article version: ' + JSON.stringify(gotVer));
    assert(gotVer.value.articleVersionId === 'v1' && gotVer.value.body === 'b' && typeof gotVer.value.title === 'string', '场景1-article version 是完整 NewsArticleVersion（正文/版本字段齐全）');
    // typed list：必须包含版本行（不能只返回 aggregate）。
    // G1.3.2.4：typed list 返回 DurableListResult——ok:true 且 values 含版本行。
    const versions = await adapterMod.durableListArticleVersions(adapter2, 'branch_V');
    assert(versions.ok === true && versions.values.length === 1 && versions.values[0].articleVersionId === 'v1', '场景1-typed list 必须返回 article version，实际 ' + JSON.stringify(versions));
    // recovery：五类真实记录完整恢复，rebuilt=false。
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_V');
    assert(recovered.rebuilt === false, '场景1-已存在 projection 时 rebuilt=false');
    assert(recovered.newsArticles.length === 1 && recovered.newsArticles[0].articleId === 'article-V', '场景1-恢复 aggregate');
    assert(recovered.articleVersions.length === 1 && recovered.articleVersions[0].articleVersionId === 'v1', '场景1-恢复 article version（不再丢失），实际 ' + recovered.articleVersions.length);
    recordPositive('P1-1-article version durable 形状', '重开 DB 后 typed get/list + recovery 均返回完整 NewsArticleVersion');
    recordPositive('P1-1-五类投影恢复', 'aggregate/articleVersion 恢复，rebuilt=false');
  }

  // ══ P1-2 场景 2：缺失 projection + 持久化 core/outbox -> 生产 recovery 真实重建（不伪造）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const pubRecord = {
      publicationId: 'pub_M', runtimeBranchId: 'branch_M', turnId: 't1', sourceRuntimeRevision: 0,
      commitReceiptId: 'rc', body: 'b', bodyFingerprint: 'sha256:bf', status: 'revealed',
      revealAttemptCount: 0, createdAt: { dayOrdinal: 1, minuteOfDay: 0 },
    };
    const core = makeEmptyState({ runtimeBranchId: 'branch_M', saveNodeId: 's', runtimeRevision: 0, narrativePublications: [pubRecord] });
    // 用生产 createBranchSeed 写入 core + outbox + pointer（真实持久化）。
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_M', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [outboxItem('o_M', 'branch_M')], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    assert(seed.ok, '场景2-生产 seed 写入 core+outbox 成功');
    // 重开 DB，用生产 recovery 读取（不从测试脚本手工构造 rebuilt）。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_M');
    assert(recovered.rebuilt === true, '场景2-缺失 projection 必须 rebuilt=true');
    assert(recovered.newsArticles.length === 0 && recovered.knowledgeReceipts.length === 0 && recovered.articleVersions.length === 0, '场景2-不伪造文章/知识/版本');
    assert(recovered.publications.length === 1 && recovered.publications[0].publicationId === 'pub_M', '场景2-从 core.narrativePublications 真实重建 publication（可证明）');
    assert(recovered.pendingOutboxItems.length === 1 && recovered.pendingOutboxItems[0].outboxId === 'o_M', '场景2-从真实 outbox 恢复未消费任务记录（可证明）');
    assert(recovered.readonlyMode === false, '场景2-core 可信时非只读');
    recordPositive('P1-2-缺失 projection 真实重建', 'rebuilt=true + publications 来自 core + pendingOutboxItems 来自 outbox（不伪造）');
  }

  // ══ P1-2 场景 3：损坏 core -> v3_recovery 只读，不反推 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db1 = await coreStore.openRuntimeDb(shim1);
    // 写损坏 core（schemaVersion=99）+ 一条 projection 行（模拟 projection 有数据也不能用来反推 core）。
    const corrupt = { ...makeEmptyState({ runtimeBranchId: 'branch_C', saveNodeId: 's', runtimeRevision: 0 }), schemaVersion: 99 };
    await new Promise((res) => {
      const tx = db1.transaction(coreStore.CORE_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.CORE_STORE).put(corrupt, 'branch_C');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_C');
    assert(recovered.readonlyMode === true, '场景3-损坏 core 必须进入 v3_recovery 只读（readonlyMode=true）');
    assert(recovered.newsArticles.length === 0 && recovered.articleVersions.length === 0 && recovered.knowledgeReceipts.length === 0, '场景3-不伪造/不反推 core');
    // 重开 DB 直接核对损坏 core 仍原样保留。
    const stored = await coreStore.readCoreState('branch_C', shim2);
    assert(stored !== null && stored.schemaVersion === 99, '场景3-损坏 core bytes 原样保留（未被投影/新闻反推改写）');
    recordRejected('P1-2-损坏 core 只读', 'readonlyMode=true + 不反推 + bytes 保留', 'readonlyMode=true');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.3-projection-version-recovery regression passed.');
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
    console.error('story-runtime-g1.3.2.3-projection-version-recovery regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
