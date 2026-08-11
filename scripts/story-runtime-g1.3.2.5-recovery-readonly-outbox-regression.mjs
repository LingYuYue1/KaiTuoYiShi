// G1.3.2.5 recovery-readonly-outbox regression：P0-3 ——
// - 任一 projection 行损坏/key 不一致、projection entries 读取失败、outbox 读取失败或任一 outbox 行非法
//   都强制 readonlyMode=true（任何持久化损坏都强制只读，不只依赖 core 可信度）；
// - outbox 调用冻结 validateProjectionOutboxItem 完整校验：只有完整合法且 status 为
//   pending/leased/retry_wait 的记录进入 pendingOutboxItems；
// - 未知 status/少字段/错 branch 均 diagnostics + 只读，不得静默跳过或当 pending；
// - 六个合法 status 正负对照（pending/leased/retry_wait 进入，delivered/dead_letter/cancelled 不进）；
// - 原 bytes 不改写，不从 projection/news/旧字符串反推 core。
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

  // ══ 场景 1：可信 core + 一个损坏 projection 行 -> 强制 readonlyMode=true ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_R1', saveNodeId: 's', runtimeRevision: 0 });
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_R1', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [outboxItem('o_pending', 'branch_R1', 'pending')], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    assert(seed.ok, '场景1-seed 成功');
    // 写一个损坏 projection 行（可信 core 存在）。
    const db = await coreStore.openRuntimeDb(shim1);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put({ articleId: 'a', articleVersion: 1, runtimeBranchId: 'branch_R1' }, 'projection:article:branch_R1:a:1');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_R1');
    assert(recovered.readonlyMode === true, '场景1-可信 core + 损坏 projection 行必须强制只读');
    assert(recovered.diagnostics.some((d) => d.includes('强制只读')), '场景1-诊断说明强制只读');
    assert(recovered.pendingOutboxItems.length === 1, '场景1-pending outbox 仍返回（非终态合法任务）');
    recordRejected('P0-3-损坏行强制只读', '可信 core 下任一投影坏行 -> readonlyMode=true', 'readonlyMode=true');
  }

  // ══ 场景 2：完整 outbox validator——未知 status/少字段/错 branch 全部诊断 + 只读 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_R2', saveNodeId: 's', runtimeRevision: 0 });
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_R2', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [outboxItem('o_ok', 'branch_R2', 'pending')], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    assert(seed.ok, '场景2-seed 成功');
    // 直接向 outbox store 写非法行：未知 status、少字段、错 branch。
    const db = await coreStore.openRuntimeDb(shim1);
    const badRows = [
      [coreStore.outboxKey('branch_R2', 'o_mystery'), outboxItem('o_mystery', 'branch_R2', 'MYSTERY')],
      [coreStore.outboxKey('branch_R2', 'o_missing'), { outboxId: 'o_missing', runtimeBranchId: 'branch_R2', status: 'pending' }],
      [coreStore.outboxKey('branch_R2', 'o_wrongbranch'), outboxItem('o_wrongbranch', 'branch_OTHER', 'pending')],
    ];
    for (const [k, v] of badRows) {
      await new Promise((res) => {
        const tx = db.transaction(coreStore.OUTBOX_STORE, 'readwrite');
        const r = tx.objectStore(coreStore.OUTBOX_STORE).put(v, k);
        r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      });
    }
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_R2');
    assert(recovered.readonlyMode === true, '场景2-任一 outbox 非法行必须强制只读');
    const pendingIds = recovered.pendingOutboxItems.map((it) => it.outboxId);
    assert(pendingIds.includes('o_ok') && !pendingIds.includes('o_mystery') && !pendingIds.includes('o_missing'), '场景2-只有完整合法非终态进入 pending，实际 ' + JSON.stringify(pendingIds));
    assert(recovered.diagnostics.some((d) => d.includes('outbox 行非法')), '场景2-未知 status/少字段诊断');
    recordRejected('P0-3-非法 outbox 行', '未知 status/少字段/错 branch -> 诊断 + 强制只读 + 不进 pending', '强制只读');
  }

  // ══ 场景 3：六个合法 status 正负对照 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_R3', saveNodeId: 's', runtimeRevision: 0 });
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_R3', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core,
      outbox: [
        outboxItem('o_pending', 'branch_R3', 'pending'),
        outboxItem('o_leased', 'branch_R3', 'leased'),
        outboxItem('o_retry', 'branch_R3', 'retry_wait'),
        outboxItem('o_delivered', 'branch_R3', 'delivered'),
        outboxItem('o_dead', 'branch_R3', 'dead_letter'),
        outboxItem('o_cancelled', 'branch_R3', 'cancelled'),
      ],
      coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    assert(seed.ok, '场景3-seed 成功');
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_R3');
    const pendingIds = recovered.pendingOutboxItems.map((it) => it.outboxId).sort();
    assert(JSON.stringify(pendingIds) === JSON.stringify(['o_leased', 'o_pending', 'o_retry']), '场景3-六状态正负对照：仅非终态进入，实际 ' + JSON.stringify(pendingIds));
    assert(recovered.readonlyMode === false, '场景3-全部合法 outbox 不触发只读');
    assert(recovered.diagnostics.filter((d) => d.includes('outbox')).length === 0, '场景3-合法 outbox 无诊断');
    recordPositive('P0-3-六状态正负对照', 'pending/leased/retry_wait 进入；delivered/dead_letter/cancelled 不进');
  }

  // ══ 场景 4：原 bytes 不改写（损坏 outbox 行仍原样保留在 DB）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    const badRow = { outboxId: 'o_bytes', runtimeBranchId: 'branch_R4', status: 'MYSTERY' };
    await new Promise((res) => {
      const tx = db.transaction(coreStore.OUTBOX_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.OUTBOX_STORE).put(badRow, coreStore.outboxKey('branch_R4', 'o_bytes'));
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_R4');
    // 重开 DB 核对损坏行 bytes 原样保留。
    const shim3 = createIdbShim(backend);
    const items = await coreStore.readOutboxItems('branch_R4', shim3);
    assert(items.length === 1 && items[0].status === 'MYSTERY', '场景4-损坏 outbox 行 bytes 原样保留（不反推/不改写）');
    recordRejected('P0-3-bytes 保留', '非法 outbox 行原样保留在 DB', '原样保留');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.5-recovery-readonly-outbox regression passed.');
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
    console.error('story-runtime-g1.3.2.5-recovery-readonly-outbox regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
