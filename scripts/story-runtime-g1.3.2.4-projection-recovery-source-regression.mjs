// G1.3.2.4 projection-recovery-source regression：P1-1/P1-2 ——
// - 默认全局 IndexedDB 路径与注入 factory 路径等价：new ProjectionDurableAdapter()（浏览器全局 indexedDB）
//   与注入 shim factory 必须读到同一数据库中的 core/outbox/projection；
// - 无公开通用 factory/DB handle 泄露：adapter 不暴露 getFactory/DB；createRecoverySource 只返回窄能力
//   （readCore/readOutbox/listProjectionEntries），调用方不能借它访问 pointer/checkpoint/migration；
// - core 信任调用冻结 validateStoryRuntimeState：schemaVersion=3 但结构损坏（narrativePublications={} 等）
//   的 core 不得 throw，返回 readonlyMode=true + 稳定诊断，不反推、不改写 bytes；
// - outbox 区分终态/非终态：delivered/dead_letter/cancelled 不进入 pendingOutboxItems；
// - 未消费 outbox 恢复不依赖 projection 是否为空：已有部分 projection 时仍返回真实非终态任务。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim（含全局路径模拟）。
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
  const outboxItem = (outboxId, branchId, status) => ({
    outboxId, schemaVersion: 3, runtimeBranchId: branchId, sourceRefFingerprint: 's', sourceRevision: 1,
    kind: 'news', aggregateKey: 'unit:x', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1',
    payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status, attemptCount: 0,
  });
  const aggregate = (branchId, articleId) => ({ runtimeBranchId: branchId, articleId, currentVersion: 1, versionIds: [], aggregateRevision: 0 });
  const version = (branchId, articleId, vid, vno) => ({
    runtimeBranchId: branchId, articleVersionId: vid, articleId, articleVersion: vno,
    sourceRefs: [], sourceFingerprint: 's', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x',
    title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [],
  });

  // ══ 场景 1：默认全局 IndexedDB 与注入 factory 等价（同一数据库读到同一份 core/outbox/projection）══
  {
    const backend = createSharedIdbBackend();
    // 用注入 factory 写入数据（模拟浏览器存档落库）。
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    const pubRecord = { publicationId: 'pub_G', runtimeBranchId: 'branch_G', turnId: 't1', sourceRuntimeRevision: 0, commitReceiptId: 'rc', body: 'b', bodyFingerprint: 'sha256:bf', status: 'revealed', revealAttemptCount: 0, createdAt: { dayOrdinal: 1, minuteOfDay: 0 } };
    const core = makeEmptyState({ runtimeBranchId: 'branch_G', saveNodeId: 's', runtimeRevision: 0, narrativePublications: [pubRecord] });
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_G', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [outboxItem('o_G', 'branch_G', 'pending')], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    assert(seed.ok, '场景1-注入路径写入 core+outbox 成功');
    // 默认全局路径：设置 globalThis.indexedDB 为同一 backend 的 shim（模拟浏览器全局 IndexedDB）。
    const globalShim = createIdbShim(backend);
    globalThis.indexedDB = globalShim;
    try {
      const defaultAdapter = new adapterMod.ProjectionDurableAdapter(); // 无 factory -> 默认全局
      const defaultSource = adapterMod.createDefaultRecoverySource();
      const recovered = await adapterMod.recoverProjectionsFromStore(defaultAdapter, 'branch_G', defaultSource);
      assert(recovered.readonlyMode === false, '场景1-默认全局路径必须读到可信 core（等价注入路径）');
      assert(recovered.rebuilt === true, '场景1-默认全局路径重建缺失 projection');
      assert(recovered.publications.length === 1 && recovered.publications[0].publicationId === 'pub_G', '场景1-默认全局路径从 core 恢复 publication');
      assert(recovered.pendingOutboxItems.some((it) => it.outboxId === 'o_G'), '场景1-默认全局路径恢复非终态 outbox');
      // 注入路径等价对照（同一数据库）。
      const injectedSource = adapterMod.createIdbRecoverySource(shim1);
      const injected = await adapterMod.recoverProjectionsFromStore(adapter1, 'branch_G', injectedSource);
      assert(JSON.stringify({ ...injected, diagnostics: [] }) === JSON.stringify({ ...recovered, diagnostics: [] }), '场景1-默认全局与注入路径恢复结果等价（除诊断顺序）');
    } finally {
      delete globalThis.indexedDB;
    }
    recordPositive('P1-1-默认全局与注入路径等价', '同一数据库 core/outbox/projection 恢复结果一致');
  }

  // ══ 场景 2：无公开通用 factory 泄露；窄能力 source 不能访问 pointer/checkpoint/migration ══
  {
    const shim = createIdbShim();
    const adapter = new adapterMod.ProjectionDurableAdapter(shim);
    assert(adapter.getFactory === undefined, '场景2-不得暴露公开 getFactory');
    assert(typeof adapter.createRecoverySource === 'function', '场景2-只暴露窄能力 createRecoverySource');
    const source = adapter.createRecoverySource();
    const keys = Object.keys(source).sort();
    assert(JSON.stringify(keys) === JSON.stringify(['listProjectionEntries', 'readCore', 'readOutboxEntries']), '场景2-窄能力 source 只暴露 readCore/readOutboxEntries/listProjectionEntries，实际 ' + JSON.stringify(keys));
    assert(!('factory' in source) && !('db' in source) && !('transaction' in source), '场景2-窄能力 source 不暴露 factory/DB/transaction');
    recordPositive('P1-1-无 factory 泄露', 'getFactory 删除 + 窄能力 source 三方法');
  }

  // ══ 场景 3：schemaVersion=3 但结构损坏的 core -> 不 throw，readonlyMode=true + 稳定诊断 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    // narrativePublications={}（应为数组）：schemaVersion 仍是 3，但完整结构校验必须拒绝。
    const badCore = makeEmptyState({ runtimeBranchId: 'branch_C3', saveNodeId: 's', runtimeRevision: 0, narrativePublications: {} });
    const db = await coreStore.openRuntimeDb(shim1);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.CORE_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.CORE_STORE).put(badCore, 'branch_C3');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_C3');
    assert(recovered.readonlyMode === true, '场景3-结构损坏 core 必须 readonlyMode=true（不 throw）');
    assert(recovered.diagnostics.some((d) => d.includes('core 结构校验失败')), '场景3-必须有稳定 core 校验诊断');
    assert(recovered.newsArticles.length === 0 && recovered.articleVersions.length === 0 && recovered.knowledgeReceipts.length === 0, '场景3-不反推/不伪造');
    // 原 bytes 不改写。
    const stored = await coreStore.readCoreState('branch_C3', shim2);
    assert(stored !== null && JSON.stringify(stored.narrativePublications) === '{}', '场景3-损坏 core bytes 原样保留（不改写）');
    recordRejected('P1-2-结构损坏 core', 'readonlyMode=true + 诊断 + 不反推 + bytes 保留', 'readonlyMode=true');
  }

  // ══ 场景 4：outbox 终态/非终态过滤（delivered 不进入 pendingOutboxItems）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_T', saveNodeId: 's', runtimeRevision: 0 });
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_T', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core,
      outbox: [
        outboxItem('o_pending', 'branch_T', 'pending'),
        outboxItem('o_leased', 'branch_T', 'leased'),
        outboxItem('o_retry', 'branch_T', 'retry_wait'),
        outboxItem('o_delivered', 'branch_T', 'delivered'),
        outboxItem('o_dead', 'branch_T', 'dead_letter'),
        outboxItem('o_cancelled', 'branch_T', 'cancelled'),
      ],
      coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    assert(seed.ok, '场景4-seed 成功');
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_T');
    const pendingIds = recovered.pendingOutboxItems.map((it) => it.outboxId).sort();
    assert(JSON.stringify(pendingIds) === JSON.stringify(['o_leased', 'o_pending', 'o_retry']), '场景4-只有非终态进入 pending，实际 ' + JSON.stringify(pendingIds));
    recordRejected('P1-2-终态 outbox 过滤', 'delivered/dead_letter/cancelled 不进入 pendingOutboxItems', 'pendingOutboxItems');
  }

  // ══ 场景 5：已有部分 projection + 仍有 pending outbox -> 两者都恢复（不互相掩盖）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    // 写一篇文章 projection（部分投影存在）。
    const w = await projection.consumeNewsOutbox(adapter1, outboxItem('o_part', 'branch_P', 'pending'), aggregate('branch_P', 'article-P'), version('branch_P', 'article-P', 'v1', 1));
    assert(w.ok, '场景5-写部分 projection 成功');
    // 再写一个 pending outbox item（未消费任务）。
    const core = makeEmptyState({ runtimeBranchId: 'branch_P', saveNodeId: 's', runtimeRevision: 0 });
    const db = await coreStore.openRuntimeDb(shim1);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.OUTBOX_STORE, 'readwrite');
      const key = coreStore.outboxKey('branch_P', 'o_pending_part');
      const r = tx.objectStore(coreStore.OUTBOX_STORE).put(outboxItem('o_pending_part', 'branch_P', 'pending'), key);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    // 重开 + recovery：有 projection 时 pending outbox 仍必须返回。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_P');
    assert(recovered.rebuilt === false, '场景5-有部分 projection rebuilt=false');
    assert(recovered.newsArticles.length === 1, '场景5-部分 projection 恢复');
    assert(recovered.pendingOutboxItems.length === 1 && recovered.pendingOutboxItems[0].outboxId === 'o_pending_part', '场景5-pending outbox 不因已有投影而消失，实际 ' + JSON.stringify(recovered.pendingOutboxItems.map((it) => it.outboxId)));
    recordPositive('P1-2-部分投影 + pending outbox', 'rebuilt=false 且未消费任务仍返回');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.4-projection-recovery-source regression passed.');
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
    console.error('story-runtime-g1.3.2.4-projection-recovery-source regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
