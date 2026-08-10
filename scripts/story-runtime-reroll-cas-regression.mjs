// G1.3.2 reroll-cas regression：commit 后 reroll 从 pre-turn save node 创建新 branch，
// 恢复完整 checkpoint 与对应 projection/outbox 快照；旧 branch 的事实、receipt、article version 和 save node 不得改写；
// reroll 后原 branch 的迟到异步 worker 只能返回 STALE_BRANCH，不得在新 branch 产生副作用。
// 生产模块经 esbuild 执行；IndexedDB 用测试专用内存 shim（真实事务语义：readwrite 原子 + abort 回滚）。
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
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const checkpoint = await bundleTs('services/storyRuntime/runtimeCheckpoint.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };
  const outboxItem = (outboxId, branchId) => ({
    outboxId, schemaVersion: 3, runtimeBranchId: branchId, sourceRefFingerprint: 'sha256:src', sourceRevision: 1,
    kind: 'news', aggregateKey: 'unit:x', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1',
    payloadFingerprint: 'sha256:p', payloadRef: { kind: 'inline', key: 'sha256:p' }, consumerIds: ['news'],
    consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0,
  });

  // ══ 场景 1：commit 后 reroll 创建新分支，旧分支事实/outbox/save node 不可变 ══
  {
    const shim = createIdbShim();
    const baseCore = makeEmptyState({ runtimeBranchId: 'branch_a', saveNodeId: 'save_node_a1', runtimeRevision: 0 });
    await coreStore.createBranchSeed({ branchId: 'branch_a', saveNodeId: 'save_node_a1', schemaVersion: 3, assetCatalogFingerprint: baseCore.assetCatalogFingerprint, core: baseCore, outbox: [outboxItem('out_a0', 'branch_a')], coreFingerprint: 'f0', projectionFingerprint: 'p0', outboxFingerprint: 'o0' }, shim);
    // pre-turn checkpoint（发送前）。
    const pointer0 = await coreStore.readActivePointer(shim);
    const preBundle = await checkpoint.buildRuntimeBundle(baseCore, { runtimeBranchId: 'branch_a', newsArticles: [], knowledgeReceipts: [], observerReadCursors: [], projectionRevisions: {} }, [outboxItem('out_a0', 'branch_a')]);
    const pre = await checkpoint.createPreTurnCheckpoint('ckpt_pre_a', preBundle, 3, pointer0);
    // 提交：rev0 -> rev1，写入事实 + outbox。
    const core1 = { ...baseCore, runtimeRevision: 1, turnCount: 1, factLedger: [{ factId: 'fact_a1', eventInstanceId: 'e1', sourceRevision: 1, factType: 't', payload: {}, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' }] };
    const c1 = await coreStore.commitTurn({ expectedBranchId: 'branch_a', expectedRevision: 0, idempotencyKey: 'key_a1', core: core1, outbox: [outboxItem('out_a1', 'branch_a')], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim);
    assert(c1.ok, '场景1-commit 必须成功');
    // 旧 branch 事实与 save node 指纹快照。
    const oldFacts = (await coreStore.readCoreState('branch_a', shim)).factLedger.map((f) => f.factId);
    assert(oldFacts.length === 1 && oldFacts[0] === 'fact_a1', '场景1-旧 branch 事实写入');

    // reroll：从 pre-turn checkpoint 派生新 branch（branch_b），恢复完整 checkpoint（异步；返回 {ok, bundle}）。
    const restoredResult = await checkpoint.restoreFromCheckpoint(pre);
    assert(restoredResult.ok === true, 'reroll-恢复 pre-turn checkpoint 必须 ok');
    const restored = restoredResult.ok ? restoredResult.bundle : null;
    const branchB = { ...restored.core, runtimeBranchId: 'branch_b', saveNodeId: 'save_node_b1', runtimeRevision: 0 };
    // P1-2：reroll 必须显式重绑定 pre-turn outbox 到新 branch（旧 branch item 不原样写入新 branch）。
    const rebindOutbox = restored.outbox.map((o) => ({ ...o, runtimeBranchId: 'branch_b' }));
    const seedB = await coreStore.createBranchSeed({
      branchId: 'branch_b', saveNodeId: 'save_node_b1', schemaVersion: 3, assetCatalogFingerprint: branchB.assetCatalogFingerprint, core: branchB, outbox: rebindOutbox, coreFingerprint: 'fB0', projectionFingerprint: 'pB0', outboxFingerprint: 'oB0',
      expectedActiveBranchId: 'branch_a', expectedActiveRevision: 1,
    }, shim);
    assert(seedB.ok, '场景1-reroll 新分支种子化必须成功');
    const pointerB = await coreStore.readActivePointer(shim);
    assert(pointerB && pointerB.runtimeBranchId === 'branch_b' && pointerB.runtimeRevision === 0, '场景1-新分支成为 active');

    // 旧 branch 不可变：branch_a 的 core 仍保留 fact_a1 且 revision=1；新分支 branch_b 无该事实。
    const oldCore = await coreStore.readCoreState('branch_a', shim);
    assert(oldCore && oldCore.runtimeRevision === 1 && oldCore.factLedger.some((f) => f.factId === 'fact_a1'), '场景1-旧 branch 事实/节点不可改写');
    const newCore = await coreStore.readCoreState('branch_b', shim);
    assert(newCore && newCore.runtimeRevision === 0 && newCore.factLedger.length === 0, '场景1-新分支从 pre-turn 恢复（无旧事实）');
    const oldOutbox = await coreStore.readOutboxItems('branch_a', shim);
    const newOutbox = await coreStore.readOutboxItems('branch_b', shim);
    assert(oldOutbox.some((o) => o.outboxId === 'out_a1') && !newOutbox.some((o) => o.outboxId === 'out_a1'), '场景1-旧 branch outbox 保留，新 branch 无旧 outbox');
    recordPositive('场景1-commit后reroll新分支', '旧分支事实/outbox 不可变，新分支从 pre-turn 恢复');

    // 旧 branch 迟到 worker -> STALE_BRANCH，不污染新分支。
    const late = await coreStore.commitTurn({ expectedBranchId: 'branch_a', expectedRevision: 1, idempotencyKey: 'key_late', core: { ...core1, runtimeRevision: 2 }, outbox: [], coreFingerprint: 'fL', projectionFingerprint: 'pL', outboxFingerprint: 'oL' }, shim);
    assert(!late.ok && late.code === 'STALE_BRANCH', '场景1-旧 branch 迟到 worker 必须 STALE_BRANCH: ' + JSON.stringify(late));
    const afterLate = await coreStore.readCoreState('branch_b', shim);
    assert(afterLate.runtimeRevision === 0 && afterLate.factLedger.length === 0, '场景1-迟到 worker 不污染新分支');
    recordRejected('场景1-旧branch迟到worker', 'STALE_BRANCH + 新分支不变', 'STALE_BRANCH');
  }

  // ══ 场景 2：双标签页共享同一 IndexedDB —— 同 revision 只允许一个成功 ══
  {
    const backend = createSharedIdbBackend();
    const tabA = createIdbShim(backend);
    const tabB = createIdbShim(backend);
    const baseCore = makeEmptyState({ runtimeBranchId: 'branch_x', saveNodeId: 'save_node_x', runtimeRevision: 0 });
    await coreStore.createBranchSeed({ branchId: 'branch_x', saveNodeId: 'save_node_x', schemaVersion: 3, assetCatalogFingerprint: baseCore.assetCatalogFingerprint, core: baseCore, outbox: [], coreFingerprint: 'fx', projectionFingerprint: 'px', outboxFingerprint: 'ox' }, tabA);
    // 两个标签页都以 expectedRevision=0 提交不同 payload。
    const coreXA = { ...baseCore, runtimeRevision: 1, turnCount: 1, factLedger: [{ factId: 'fact_xa', eventInstanceId: 'e', sourceRevision: 1, factType: 't', payload: {}, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' }] };
    const coreXB = { ...baseCore, runtimeRevision: 1, turnCount: 1, factLedger: [{ factId: 'fact_xb', eventInstanceId: 'e', sourceRevision: 1, factType: 't', payload: {}, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' }] };
    const ra = await coreStore.commitTurn({ expectedBranchId: 'branch_x', expectedRevision: 0, idempotencyKey: 'key_xa', core: coreXA, outbox: [], coreFingerprint: 'fxa', projectionFingerprint: 'px', outboxFingerprint: 'ox' }, tabA);
    const rb = await coreStore.commitTurn({ expectedBranchId: 'branch_x', expectedRevision: 0, idempotencyKey: 'key_xb', core: coreXB, outbox: [], coreFingerprint: 'fxb', projectionFingerprint: 'px', outboxFingerprint: 'ox' }, tabB);
    assert(ra.ok && !rb.ok && rb.code === 'CONFLICT', '场景2-双标签页同 revision 必须一个成功一个 CONFLICT: ' + JSON.stringify(ra) + ' / ' + JSON.stringify(rb));
    const final = await coreStore.readCoreState('branch_x', tabB); // tab B 读同一 DB
    assert(final && final.factLedger.length === 1 && final.factLedger[0].factId === 'fact_xa', '场景2-成功方（A）写入保留，失败方（B）零写入');
    assert(final.runtimeRevision === 1, '场景2-revision 只增一次');
    recordPositive('场景2-双标签页共享IDB CAS', 'A 成功 / B CONFLICT / B 零写入');
    recordRejected('场景2-双标签页冲突方', 'CONFLICT + 零写入', 'CONFLICT');
  }

  // ══ 场景 3：同一 idempotencyKey 同 payload 在共享 DB 重试 -> ALREADY_APPLIED（revision 不增）══
  {
    const backend = createSharedIdbBackend();
    const tabA = createIdbShim(backend);
    const tabB = createIdbShim(backend);
    const baseCore = makeEmptyState({ runtimeBranchId: 'branch_y', saveNodeId: 'save_node_y', runtimeRevision: 0 });
    await coreStore.createBranchSeed({ branchId: 'branch_y', saveNodeId: 'save_node_y', schemaVersion: 3, assetCatalogFingerprint: baseCore.assetCatalogFingerprint, core: baseCore, outbox: [], coreFingerprint: 'fy', projectionFingerprint: 'py', outboxFingerprint: 'oy' }, tabA);
    const coreY = { ...baseCore, runtimeRevision: 1, turnCount: 1, commandIdempotencyIndex: { key_y: { commandFingerprint: 'cfY', resultRevision: 1, resultCode: 'ok', receiptId: 'r', resultHash: 'h', resultRef: { saveNodeId: 's', stateFingerprint: 'sf' } } } };
    const r1 = await coreStore.commitTurn({ expectedBranchId: 'branch_y', expectedRevision: 0, idempotencyKey: 'key_y', core: coreY, outbox: [], coreFingerprint: 'fy1', projectionFingerprint: 'py', outboxFingerprint: 'oy' }, tabA);
    assert(r1.ok, '场景3-首次提交成功');
    // tab B 重试同一 payload。
    const r2 = await coreStore.commitTurn({ expectedBranchId: 'branch_y', expectedRevision: 1, idempotencyKey: 'key_y', core: { ...baseCore, runtimeRevision: 2, turnCount: 2, commandIdempotencyIndex: { key_y: { commandFingerprint: 'cfY', resultRevision: 1, resultCode: 'ok', receiptId: 'r', resultHash: 'h', resultRef: { saveNodeId: 's', stateFingerprint: 'sf' } } } }, outbox: [], coreFingerprint: 'fy2', projectionFingerprint: 'py', outboxFingerprint: 'oy' }, tabB);
    assert(!r2.ok && r2.code === 'ALREADY_APPLIED', '场景3-跨标签页同 key 同 payload 必须 ALREADY_APPLIED: ' + JSON.stringify(r2));
    const after = await coreStore.readCoreState('branch_y', tabB);
    assert(after.runtimeRevision === 1, '场景3-ALREADY_APPLIED revision 不增');
    recordRejected('场景3-跨标签页幂等重试', 'ALREADY_APPLIED + revision 不增', 'ALREADY_APPLIED');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-reroll-cas regression passed.');
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
    console.error('story-runtime-reroll-cas regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
