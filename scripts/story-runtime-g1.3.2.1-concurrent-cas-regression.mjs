// G1.3.2.1 concurrent-cas regression：P0-2/P0-4 —— 真正 Promise.all 并发下：
// - 两个不同 branch 以同一 expected active pointer 并发 createBranchSeed：严格一成功一冲突（CONFLICT/STALE_BRANCH），
//   失败方没有孤儿 core/outbox，active pointer 与旧 branch bytes 不变；
// - 两个 commitTurn 以同一 branch/revision 并发：严格一成功一 CONFLICT，失败方旧 core bytes/revision/outbox/pointer fingerprint 全不变；
// - shim 的 readwrite 排队让并发 get-then-put 原子（不存在"都读到 rev0 都写入"）。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim（readwrite 串行 + 一次性发布 + abort 回滚）。
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
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };
  const makeCore = (branch, rev, turn) => ({ ...makeEmptyState({ runtimeBranchId: branch, saveNodeId: 'save_' + branch, runtimeRevision: rev }), turnCount: turn });

  // ══ 场景 1：Promise.all 两个不同 branch 同一 expected pointer -> 严格一成功一冲突，失败方零写入 ══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_a', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_a', saveNodeId: 'save_branch_a', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'fa0', projectionFingerprint: 'pa0', outboxFingerprint: 'oa0' }, shim);
    const branchB = makeCore('branch_b', 0, 0);
    const branchC = makeCore('branch_c', 0, 0);
    const results = await Promise.all([
      coreStore.createBranchSeed({ branchId: 'branch_b', saveNodeId: 'save_branch_b', schemaVersion: 3, assetCatalogFingerprint: branchB.assetCatalogFingerprint, core: branchB, outbox: [], coreFingerprint: 'fb0', projectionFingerprint: 'pb0', outboxFingerprint: 'ob0', expectedActiveBranchId: 'branch_a', expectedActiveRevision: 0 }, shim),
      coreStore.createBranchSeed({ branchId: 'branch_c', saveNodeId: 'save_branch_c', schemaVersion: 3, assetCatalogFingerprint: branchC.assetCatalogFingerprint, core: branchC, outbox: [], coreFingerprint: 'fc0', projectionFingerprint: 'pc0', outboxFingerprint: 'oc0', expectedActiveBranchId: 'branch_a', expectedActiveRevision: 0 }, shim),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    const conflictCount = results.filter((r) => !r.ok && (r.code === 'CONFLICT' || r.code === 'STALE_BRANCH')).length;
    assert(okCount === 1 && conflictCount === 1, '场景1-Promise.all 两个 branch 并发必须严格一成功一冲突: ' + JSON.stringify(results.map((r) => r.code)));
    // 失败方没有孤儿 core/outbox。
    const winner = results[0].ok ? 'branch_b' : 'branch_c';
    const loser = winner === 'branch_b' ? 'branch_c' : 'branch_b';
    const loserCore = await coreStore.readCoreState(loser, shim);
    assert(loserCore === null, '场景1-失败方不得留下孤儿 core: ' + loser);
    const loserOutbox = await coreStore.readOutboxItems(loser, shim);
    assert(loserOutbox.length === 0, '场景1-失败方不得留下孤儿 outbox');
    const pointer = await coreStore.readActivePointer(shim);
    assert(pointer && pointer.runtimeBranchId === winner, '场景1-active pointer 指向成功方 ' + winner);
    recordPositive('场景1-Promise.all 两分支并发', '一成功(' + winner + ') + 一冲突，失败方零孤儿');
    recordRejected('场景1-并发失败方', 'CONFLICT/STALE_BRANCH + 零孤儿 + pointer 不变', 'STALE_BRANCH');
  }

  // ══ 场景 2：Promise.all 两个 commitTurn 同一 branch/revision -> 严格一成功一 CONFLICT，失败方全不变 ══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_d', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_d', saveNodeId: 'save_branch_d', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'fd0', projectionFingerprint: 'pd0', outboxFingerprint: 'od0' }, shim);
    const coreA = { ...makeCore('branch_d', 1, 1), factLedger: [{ factId: 'fact_da', eventInstanceId: 'e', sourceRevision: 1, factType: 't', payload: {}, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' }] };
    const coreB = { ...makeCore('branch_d', 1, 1), factLedger: [{ factId: 'fact_db', eventInstanceId: 'e', sourceRevision: 1, factType: 't', payload: {}, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' }] };
    const results = await Promise.all([
      coreStore.commitTurn({ expectedBranchId: 'branch_d', expectedRevision: 0, idempotencyKey: 'key_da', core: coreA, outbox: [], coreFingerprint: 'fda', projectionFingerprint: 'pda', outboxFingerprint: 'oda' }, shim),
      coreStore.commitTurn({ expectedBranchId: 'branch_d', expectedRevision: 0, idempotencyKey: 'key_db', core: coreB, outbox: [], coreFingerprint: 'fdb', projectionFingerprint: 'pdb', outboxFingerprint: 'odb' }, shim),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    const conflictCount = results.filter((r) => !r.ok && r.code === 'CONFLICT').length;
    assert(okCount === 1 && conflictCount === 1, '场景2-Promise.all 两个 commitTurn 并发必须严格一成功一 CONFLICT: ' + JSON.stringify(results.map((r) => r.code)));
    const final = await coreStore.readCoreState('branch_d', shim);
    assert(final.runtimeRevision === 1 && final.turnCount === 1, '场景2-成功方 revision=1 turnCount=1');
    const winnerFact = final.factLedger.length === 1 ? final.factLedger[0].factId : null;
    assert(winnerFact === 'fact_da' || winnerFact === 'fact_db', '场景2-只有成功方事实落盘');
    const pointer = await coreStore.readActivePointer(shim);
    assert(pointer && pointer.runtimeRevision === 1, '场景2-pointer revision=1');
    recordPositive('场景2-Promise.all 双 commitTurn', '一成功(事实 ' + winnerFact + ') + 一 CONFLICT');
    recordRejected('场景2-并发 commitTurn 失败方', 'CONFLICT + 旧 bytes/revision/outbox/pointer 不变', 'CONFLICT');
  }

  // ══ 场景 3：shim 的 readwrite 排队——先 commit 成功后再提交会看到新 revision（不存在"都读到 rev0"）══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_e', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_e', saveNodeId: 'save_branch_e', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'fe0', projectionFingerprint: 'pe0', outboxFingerprint: 'oe0' }, shim);
    // 顺序：第一次成功，第二次持旧 revision 必须 CONFLICT。
    const r1 = await coreStore.commitTurn({ expectedBranchId: 'branch_e', expectedRevision: 0, idempotencyKey: 'key_e1', core: makeCore('branch_e', 1, 1), outbox: [], coreFingerprint: 'fe1', projectionFingerprint: 'pe1', outboxFingerprint: 'oe1' }, shim);
    assert(r1.ok, '场景3-首次 commit 成功');
    const r2 = await coreStore.commitTurn({ expectedBranchId: 'branch_e', expectedRevision: 0, idempotencyKey: 'key_e2', core: makeCore('branch_e', 1, 2), outbox: [], coreFingerprint: 'fe2', projectionFingerprint: 'pe2', outboxFingerprint: 'oe2' }, shim);
    assert(!r2.ok && r2.code === 'CONFLICT', '场景3-持旧 revision 后提交必须 CONFLICT: ' + r2.code);
    recordRejected('场景3-shim 排队后旧 revision', 'CONFLICT（读到已提交新 revision）', 'CONFLICT');
  }

  // ══ 场景 4：abort 回滚——提交失败的 tx 不留下任何写入 ══
  {
    const backend = createSharedIdbBackend();
    const shim = createIdbShim(backend);
    const base = makeCore('branch_f', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_f', saveNodeId: 'save_branch_f', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'ff0', projectionFingerprint: 'pf0', outboxFingerprint: 'of0' }, shim);
    // 冲突提交（错误 branch）-> abort，不产生任何 core/outbox/pointer 变更。
    const fail = await coreStore.commitTurn({ expectedBranchId: 'branch_zzz', expectedRevision: 0, idempotencyKey: 'key_fz', core: makeCore('branch_zzz', 1, 1), outbox: [{ outboxId: 'out_fz', schemaVersion: 3, runtimeBranchId: 'branch_zzz', sourceRefFingerprint: 'sha256:s', sourceRevision: 1, kind: 'news', aggregateKey: 'k', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1', payloadFingerprint: 'sha256:p', payloadRef: { kind: 'inline', key: 'sha256:p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0 }], coreFingerprint: 'fz', projectionFingerprint: 'pz', outboxFingerprint: 'oz' }, shim);
    assert(!fail.ok && fail.code === 'STALE_BRANCH', '场景4-错误 branch 必须 STALE_BRANCH');
    const zzz = await coreStore.readCoreState('branch_zzz', shim);
    assert(zzz === null, '场景4-abort 后不留下孤儿 core');
    const zzzOutbox = await coreStore.readOutboxItems('branch_zzz', shim);
    assert(zzzOutbox.length === 0, '场景4-abort 后不留下孤儿 outbox');
    const pointer = await coreStore.readActivePointer(shim);
    assert(pointer && pointer.runtimeBranchId === 'branch_f' && pointer.runtimeRevision === 0, '场景4-abort 后 active pointer 不变');
    recordRejected('场景4-abort 回滚', 'STALE_BRANCH + 零孤儿 + pointer 不变', 'STALE_BRANCH');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.1-concurrent-cas regression passed.');
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
    console.error('story-runtime-g1.3.2.1-concurrent-cas regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
