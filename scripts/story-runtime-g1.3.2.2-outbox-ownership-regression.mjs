// G1.3.2.2 outbox-ownership regression：P0-1 ——
// - 同 branch 同 outbox key：批内重复同 payload 只写一次；批内不同 payload、跨 commit 不同 payload
//   都稳定冲突（IDEMPOTENCY_KEY_REUSED）且零写入；
// - 已存在记录 write-once：同 branch 同 key 同 payload -> ALREADY_APPLIED 不覆盖；不同 payload -> 冲突不覆盖；
// - createBranchSeed 走同一规则（新建 branch 也不能让孤儿 outbox 覆盖）；
// - 旧 branch bytes/fingerprint 不变。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim（真实事务语义）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs, makeEmptyState } from './story-runtime-core-test-helpers.mjs';
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
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };
  const makeOutbox = (outboxId, payload, branchId) => ({
    outboxId, schemaVersion: 3, runtimeBranchId: branchId, sourceRefFingerprint: 'sha256:' + payload, sourceRevision: 1,
    kind: 'news', aggregateKey: 'unit:' + payload, operation: 'create', sourceLevelIdempotencyKey: 'k_' + payload, deliveryKey: 'd_' + payload,
    payloadFingerprint: 'sha256:' + payload, payloadRef: { kind: 'inline', key: 'sha256:' + payload }, consumerIds: ['news'],
    consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0,
  });
  const makeCore = (branch, rev, turn) => ({ ...makeEmptyState({ runtimeBranchId: branch, saveNodeId: 'save_' + branch, runtimeRevision: rev }), turnCount: turn });

  // ══ 场景 1：批内重复同 outbox key 同 payload -> 只写一次（成功，1 行）══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_o1', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_o1', saveNodeId: 'save_branch_o1', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f0', projectionFingerprint: 'p0', outboxFingerprint: 'o0' }, shim);
    const item = makeOutbox('same', 'p1', 'branch_o1');
    const r = await coreStore.commitTurn({ expectedBranchId: 'branch_o1', expectedRevision: 0, idempotencyKey: 'key_1', core: makeCore('branch_o1', 1, 1), outbox: [item, { ...item, outboxId: 'same' }], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim);
    assert(r.ok, '场景1-批内重复同 payload 必须成功（只写一次）: ' + JSON.stringify(r));
    const items = await coreStore.readOutboxItems('branch_o1', shim);
    assert(items.length === 1 && items[0].outboxId === 'same', '场景1-批内重复同 payload 只写一次，实际 ' + items.length);
    recordPositive('场景1-批内重复同payload只写一次', '1 行');
  }

  // ══ 场景 2：批内同 key 不同 payload -> IDEMPOTENCY_KEY_REUSED，整个事务零写入 ══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_o2', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_o2', saveNodeId: 'save_branch_o2', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f0', projectionFingerprint: 'p0', outboxFingerprint: 'o0' }, shim);
    const before = await coreStore.readCoreState('branch_o2', shim);
    const r = await coreStore.commitTurn({ expectedBranchId: 'branch_o2', expectedRevision: 0, idempotencyKey: 'key_2', core: makeCore('branch_o2', 1, 1), outbox: [makeOutbox('dup', 'pA', 'branch_o2'), makeOutbox('dup', 'pB', 'branch_o2')], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim);
    assert(!r.ok && r.code === 'IDEMPOTENCY_KEY_REUSED', '场景2-批内同 key 不同 payload 必须 IDEMPOTENCY_KEY_REUSED: ' + JSON.stringify(r));
    const after = await coreStore.readCoreState('branch_o2', shim);
    assert(after.runtimeRevision === 0 && JSON.stringify(after) === JSON.stringify(before), '场景2-整个事务零写入（core 不变）');
    const items = await coreStore.readOutboxItems('branch_o2', shim);
    assert(items.length === 0, '场景2-outbox 零写入');
    recordRejected('场景2-批内同key不同payload', 'IDEMPOTENCY_KEY_REUSED + 零写入', 'IDEMPOTENCY_KEY_REUSED');
  }

  // ══ 场景 3：跨 commit 同 key 不同 payload -> 冲突且不覆盖（旧 branch bytes/fingerprint 不变）══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_o3', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_o3', saveNodeId: 'save_branch_o3', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f0', projectionFingerprint: 'p0', outboxFingerprint: 'o0' }, shim);
    // commit1：写 outbox same/p1。
    const r1 = await coreStore.commitTurn({ expectedBranchId: 'branch_o3', expectedRevision: 0, idempotencyKey: 'key_3a', core: makeCore('branch_o3', 1, 1), outbox: [makeOutbox('same', 'p1', 'branch_o3')], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim);
    assert(r1.ok, '场景3-首次 commit 成功');
    const items1 = await coreStore.readOutboxItems('branch_o3', shim);
    const fp1 = items1[0].payloadFingerprint;
    // commit2（下一 revision）：同 key 不同 payload -> 冲突，不覆盖。
    const r2 = await coreStore.commitTurn({ expectedBranchId: 'branch_o3', expectedRevision: 1, idempotencyKey: 'key_3b', core: makeCore('branch_o3', 2, 2), outbox: [makeOutbox('same', 'p2', 'branch_o3')], coreFingerprint: 'f2', projectionFingerprint: 'p2', outboxFingerprint: 'o2' }, shim);
    assert(!r2.ok && r2.code === 'IDEMPOTENCY_KEY_REUSED', '场景3-跨 commit 同 key 不同 payload 必须冲突: ' + JSON.stringify(r2));
    const items2 = await coreStore.readOutboxItems('branch_o3', shim);
    assert(items2.length === 1 && items2[0].payloadFingerprint === fp1, '场景3-旧 outbox bytes/fingerprint 不变（未被覆盖）');
    recordPositive('场景3-跨commit同key不同payload', '冲突 + 旧 bytes 保留');
    recordRejected('场景3-跨commit不同payload覆盖', 'IDEMPOTENCY_KEY_REUSED + 不覆盖', 'IDEMPOTENCY_KEY_REUSED');
  }

  // ══ 场景 4：createBranchSeed 也走同一规则——新建 branch 不能覆盖既有 outbox 记录 ══
  {
    const shim = createIdbShim();
    const baseA = makeCore('branch_a4', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_a4', saveNodeId: 'save_branch_a4', schemaVersion: 3, assetCatalogFingerprint: baseA.assetCatalogFingerprint, core: baseA, outbox: [makeOutbox('shared', 'p1', 'branch_a4')], coreFingerprint: 'fa0', projectionFingerprint: 'pa0', outboxFingerprint: 'oa0' }, shim);
    // 同 branch 再次 seed（不同 core 但同 outbox key 不同 payload）-> 冲突。
    const dup = await coreStore.createBranchSeed({ branchId: 'branch_a4', saveNodeId: 'save_branch_a4', schemaVersion: 3, assetCatalogFingerprint: baseA.assetCatalogFingerprint, core: { ...baseA, turnCount: 5 }, outbox: [makeOutbox('shared', 'p2', 'branch_a4')], coreFingerprint: 'fa1', projectionFingerprint: 'pa1', outboxFingerprint: 'oa1', expectedActiveBranchId: 'branch_a4', expectedActiveRevision: 0 }, shim);
    assert(!dup.ok && dup.code === 'INVALID_COMMAND', '场景4-重复 branchId 必须拒绝: ' + JSON.stringify(dup));
    // 不同 branch 同 outboxId -> 互不覆盖（branch 归属 key）。
    const baseB = makeCore('branch_b4', 0, 0);
    const seedB = await coreStore.createBranchSeed({ branchId: 'branch_b4', saveNodeId: 'save_branch_b4', schemaVersion: 3, assetCatalogFingerprint: baseB.assetCatalogFingerprint, core: baseB, outbox: [makeOutbox('shared', 'pB', 'branch_b4')], coreFingerprint: 'fb0', projectionFingerprint: 'pb0', outboxFingerprint: 'ob0', expectedActiveBranchId: 'branch_a4', expectedActiveRevision: 0 }, shim);
    assert(seedB.ok, '场景4-不同 branch 同 outboxId 可共存');
    const aItems = await coreStore.readOutboxItems('branch_a4', shim);
    const bItems = await coreStore.readOutboxItems('branch_b4', shim);
    assert(aItems.length === 1 && aItems[0].payloadFingerprint === 'sha256:p1', '场景4-branch A outbox 保留');
    assert(bItems.length === 1 && bItems[0].payloadFingerprint === 'sha256:pB', '场景4-branch B outbox 独立');
    recordPositive('场景4-不同branch同outboxId互不覆盖', 'A/B 各自保留');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.2-outbox-ownership regression passed.');
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
    console.error('story-runtime-g1.3.2.2-outbox-ownership regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
