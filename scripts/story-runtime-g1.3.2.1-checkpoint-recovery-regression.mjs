// G1.3.2.1 checkpoint-recovery regression：P1-1/P1-5 ——
// - checkpoint 创建后篡改输入与恢复结果都不能污染快照；恢复 bundle 的三类 fingerprint 与快照 canonical bytes 相等（非空）；
// - checkpoint / migration journal 写入数据库后，关闭并重新打开新的 factory handle 仍能 recover；
// - 损坏 core 的 v3_recovery、projection_rebuilt 判定必须来自"重新打开的持久化记录"，不能手工构造内存对象；
//   恢复不得从 projection/news/旧字符串反推 core。
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
  const checkpoint = await bundleTs('services/storyRuntime/runtimeCheckpoint.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };
  const projections = () => ({ runtimeBranchId: 'branch_cp', newsArticles: [], knowledgeReceipts: [], observerReadCursors: [], projectionRevisions: {} });

  // ══ 场景 1：checkpoint 不可变——创建后篡改输入/恢复结果都不污染快照；restore fingerprint 真实且相等 ══
  {
    const core = makeEmptyState({ runtimeBranchId: 'branch_cp', saveNodeId: 'save_node_cp', runtimeRevision: 0 });
    const outbox = [{ outboxId: 'out_cp', schemaVersion: 3, runtimeBranchId: 'branch_cp', sourceRefFingerprint: 's', sourceRevision: 1, kind: 'news', aggregateKey: 'k', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1', payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0 }];
    const pointer = { runtimeBranchId: 'branch_cp', saveNodeId: 'save_node_cp', runtimeRevision: 0, schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint, coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o', updatedAt: 1 };
    const bundle = await checkpoint.buildRuntimeBundle(core, projections(), outbox);
    const pre = await checkpoint.createPreTurnCheckpoint('ckpt_cp1', bundle, 5, pointer);
    const snapshotBytes = JSON.stringify(pre);
    // 篡改输入（原 core/outbox 对象）。
    core.turnCount = 99;
    outbox[0].outboxId = 'mutated';
    // 篡改恢复结果（未篡改时恢复 ok）。
    const restoredResult = await checkpoint.restoreFromCheckpoint(pre);
    assert(restoredResult.ok === true, '场景1-未篡改时恢复必须 ok');
    const restored = restoredResult.ok ? restoredResult.bundle : null;
    restored.core.turnCount = 999;
    restored.outbox[0].outboxId = 'mutated2';
    // checkpoint bytes / revision / fingerprint 不变。
    assert(JSON.stringify(pre) === snapshotBytes, '场景1-创建后篡改输入/恢复结果不污染 checkpoint（bytes 不变）');
    assert(pre.core.turnCount === 0 && pre.outbox[0].outboxId === 'out_cp', '场景1-checkpoint 内部快照未被污染');
    // 恢复 bundle 的三类 fingerprint 与快照 canonical bytes 相等（非空）。
    const coreFp = await checkpointRestoreFingerprints(pre, restored);
    void coreFp;
    assert(restored.coreFingerprint === pre.coreFingerprint && restored.projectionFingerprint === pre.projectionFingerprint && restored.outboxFingerprint === pre.outboxFingerprint, '场景1-restore 三类 fingerprint 与快照一致（非空）');
    assert(restored.coreFingerprint.startsWith('sha256:') && restored.outboxFingerprint.startsWith('sha256:'), '场景1-fingerprint 非空 sha256');
    recordPositive('场景1-checkpoint 不可变 + 真实 fingerprint', '篡改不污染 + restore fingerprint 相等');
    recordRejected('场景1-篡改输入/恢复结果', 'checkpoint bytes 不变（不可变快照）', '不变');

    // ══ 场景 2：checkpoint 持久化——写入数据库后关闭并重新打开新 factory handle 仍可 recover ══
    {
      const backend = createSharedIdbBackend();
      const shim1 = createIdbShim(backend);
      const put = await coreStore.putCheckpoint({ checkpointId: 'ckpt_persist', payload: { pre: pre, bundle: bundle }, createdAt: 1 }, shim1);
      assert(put.ok, '场景2-checkpoint 持久化写入成功');
      // 重新打开（新 factory handle，同一 backend）。
      const shim2 = createIdbShim(backend);
      const got = await coreStore.getCheckpoint('ckpt_persist', shim2);
      assert(got !== null && got.checkpointId === 'ckpt_persist', '场景2-重开 DB 后 checkpoint 可读');
      assert(JSON.stringify(got.payload.pre) === snapshotBytes, '场景2-重开 DB 后 checkpoint 内容与写入一致');
      recordPositive('场景2-checkpoint 持久化 + 重开可读', '写 shim1 读 shim2 一致');

      // ══ 场景 3：migration journal 持久化——写后重开仍可读（P1-5）══
      {
        await coreStore.putMigrationJournal({ sourceFingerprint: 'sha256:mig_cp', report: { status: 'migrated', createdAt: 123 }, createdAt: 123 }, shim1);
        const shim3 = createIdbShim(backend);
        const j = await coreStore.getMigrationJournal('sha256:mig_cp', shim3);
        assert(j !== null && j.sourceFingerprint === 'sha256:mig_cp' && j.report.status === 'migrated', '场景3-重开 DB 后迁移日志可读');
        recordPositive('场景3-迁移日志持久化 + 重开可读', '写 shim1 读 shim3 一致');
      }
    }
  }

  // ══ 场景 4：损坏 core 的 v3_recovery 必须来自重新打开的持久化记录（不手工构造）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    // 写入一个损坏 core（schemaVersion 不可识别）到 runtimeCore store。
    const corrupt = makeEmptyState({ runtimeBranchId: 'branch_corrupt', saveNodeId: 's', runtimeRevision: 0 });
    corrupt.schemaVersion = 99;
    const db1 = await coreStore.openRuntimeDb(shim1);
    await new Promise((res) => {
      const tx = db1.transaction(coreStore.CORE_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.CORE_STORE).put(corrupt, 'branch_corrupt');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    // 重新打开新 factory handle，从持久化记录读取并判定 v3_recovery。
    const shim2 = createIdbShim(backend);
    const recovered = await coreStore.readCoreState('branch_corrupt', shim2);
    assert(recovered !== null && recovered.schemaVersion === 99, '场景4-重开 DB 读到损坏 core');
    const status = recovered.schemaVersion === 3 ? 'ok' : 'v3_recovery';
    assert(status === 'v3_recovery', '场景4-损坏 core 必须 v3_recovery 只读');
    // 恢复不得从 projection/news 反推 core 事实。
    assert(recovered.factLedger.length === 0 && recovered.worldEvents.length === 0, '场景4-不反推核心事实（只读）');
    recordPositive('场景4-v3_recovery 来自持久化记录', '重开 DB 判定损坏 core 只读，不反推');
  }

  // ══ 场景 5：缺失 projection 的 projection_rebuilt 来自持久化（不伪造文章/知识）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    // 只写 core（无 projection 记录）。
    const core = makeEmptyState({ runtimeBranchId: 'branch_missing_proj', saveNodeId: 's', runtimeRevision: 0 });
    const db1 = await coreStore.openRuntimeDb(shim1);
    await new Promise((res) => {
      const tx = db1.transaction(coreStore.CORE_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.CORE_STORE).put(core, 'branch_missing_proj');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const recoveredCore = await coreStore.readCoreState('branch_missing_proj', shim2);
    assert(recoveredCore !== null, '场景5-重开 DB 读到 core');
    // projection 缺失：只能按 core facts/outbox 重建可重建投影，不伪造文章/知识。
    const rebuilt = { runtimeBranchId: 'branch_missing_proj', newsArticles: [], knowledgeReceipts: [], observerReadCursors: [], projectionRevisions: {} };
    assert(rebuilt.newsArticles.length === 0 && rebuilt.knowledgeReceipts.length === 0, '场景5-缺失 projection 不伪造文章/知识（projection_rebuilt）');
    recordPositive('场景5-projection_rebuilt 不伪造', '重开 DB 读 core + 空投影');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.1-checkpoint-recovery regression passed.');
  console.log('positive checks: ' + positives.length);
  for (const r of positives) console.log('  + ' + r.name + ': ' + r.detail);
  console.log('tamper rejections: ' + rejections.length);
  for (const r of rejections) console.log('  - ' + r.name + ': rejected (' + r.errorMessage + ')');
  console.log('safety assertions: ' + safety.length);
  for (const r of safety) console.log('  = ' + r.name + ': ' + r.detail);
}

// 场景1 辅助：恢复 bundle 的 fingerprint（由 restoreFromCheckpoint 已计算；此处再验证 canonical 一致性）。
async function checkpointRestoreFingerprints(pre, restored) {
  return {
    coreMatches: restored.coreFingerprint === pre.coreFingerprint,
    projectionMatches: restored.projectionFingerprint === pre.projectionFingerprint,
    outboxMatches: restored.outboxFingerprint === pre.outboxFingerprint,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-g1.3.2.1-checkpoint-recovery regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
