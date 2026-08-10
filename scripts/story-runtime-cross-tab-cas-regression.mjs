// G1.3.2 cross-tab-cas regression：两个标签页（两个 shim 工厂共享同一底层 IndexedDB）并发提交，
// 只允许一个成功；旧 branch worker / 旧 revision worker 只能得到 STALE_BRANCH / CONFLICT，零写入。
// 生产模块经 esbuild 执行；IndexedDB 用测试专用内存 shim（共享 backend 模拟多标签页）。
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
  const makeCore = (branch, rev, turn, extra = {}) => ({ ...makeEmptyState({ runtimeBranchId: branch, saveNodeId: 'save_' + branch, runtimeRevision: rev }), turnCount: turn, ...extra });

  // ══ 场景 1：A 提交 rev0->1 成功后，B 持旧 rev0 payload 提交 -> CONFLICT，零写入 ══
  {
    const backend = createSharedIdbBackend();
    const tabA = createIdbShim(backend);
    const tabB = createIdbShim(backend);
    await coreStore.createBranchSeed({ branchId: 'branch_c', saveNodeId: 'save_branch_c', schemaVersion: 3, assetCatalogFingerprint: 'sha256:cat', core: makeCore('branch_c', 0, 0), outbox: [], coreFingerprint: 'fc0', projectionFingerprint: 'pc0', outboxFingerprint: 'oc0' }, tabA);
    const c1 = await coreStore.commitTurn({ expectedBranchId: 'branch_c', expectedRevision: 0, idempotencyKey: 'key_c1', core: makeCore('branch_c', 1, 1), outbox: [], coreFingerprint: 'fc1', projectionFingerprint: 'pc1', outboxFingerprint: 'oc1' }, tabA);
    assert(c1.ok, '场景1-标签页 A 提交成功');
    // 标签页 B 仍持 rev0（未刷新）-> CONFLICT。
    const bStale = await coreStore.commitTurn({ expectedBranchId: 'branch_c', expectedRevision: 0, idempotencyKey: 'key_c2', core: makeCore('branch_c', 1, 1, { factLedger: [{ factId: 'fact_cb', eventInstanceId: 'e', sourceRevision: 1, factType: 't', payload: {}, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' }] }), outbox: [], coreFingerprint: 'fcb', projectionFingerprint: 'pcb', outboxFingerprint: 'ocb' }, tabB);
    assert(!bStale.ok && bStale.code === 'CONFLICT', '场景1-标签页 B 持旧 rev 必须 CONFLICT: ' + JSON.stringify(bStale));
    const final = await coreStore.readCoreState('branch_c', tabB);
    assert(final && final.runtimeRevision === 1 && final.factLedger.length === 0, '场景1-冲突方零写入（B 的事实未落盘）');
    recordPositive('场景1-跨标签页旧revision冲突', 'A 成功 / B CONFLICT / B 零写入');
    recordRejected('场景1-跨标签页CONFLICT', 'CONFLICT + 零写入', 'CONFLICT');
  }

  // ══ 场景 2：旧 branch worker 从另一标签页尝试写当前 branch -> STALE_BRANCH，core 不变 ══
  {
    const backend = createSharedIdbBackend();
    const tabA = createIdbShim(backend);
    const tabB = createIdbShim(backend);
    await coreStore.createBranchSeed({ branchId: 'branch_d', saveNodeId: 'save_branch_d', schemaVersion: 3, assetCatalogFingerprint: 'sha256:cat', core: makeCore('branch_d', 0, 0), outbox: [], coreFingerprint: 'fd0', projectionFingerprint: 'pd0', outboxFingerprint: 'od0' }, tabA);
    await coreStore.commitTurn({ expectedBranchId: 'branch_d', expectedRevision: 0, idempotencyKey: 'key_d1', core: makeCore('branch_d', 1, 1), outbox: [], coreFingerprint: 'fd1', projectionFingerprint: 'pd1', outboxFingerprint: 'od1' }, tabA);
    // 标签页 B 的 worker 持有 branch_old payload 想写当前 branch_d。
    const late = await coreStore.commitTurn({ expectedBranchId: 'branch_old', expectedRevision: 1, idempotencyKey: 'key_late', core: makeCore('branch_old', 2, 2), outbox: [], coreFingerprint: 'fL', projectionFingerprint: 'pL', outboxFingerprint: 'oL' }, tabB);
    assert(!late.ok && late.code === 'STALE_BRANCH', '场景2-跨标签页旧 branch worker 必须 STALE_BRANCH: ' + JSON.stringify(late));
    const d = await coreStore.readCoreState('branch_d', tabB);
    assert(d && d.runtimeRevision === 1, '场景2-当前 branch core 不变');
    const old = await coreStore.readCoreState('branch_old', tabB);
    assert(old === null, '场景2-旧 branch 不产生新 core');
    recordRejected('场景2-跨标签页旧branch worker', 'STALE_BRANCH + 当前/旧 branch 均不变', 'STALE_BRANCH');
  }

  // ══ 场景 3：分支指针切换 CAS —— 另一标签页不能覆盖 pointer（旧 revision 提交被拒）══
  {
    const backend = createSharedIdbBackend();
    const tabA = createIdbShim(backend);
    const tabB = createIdbShim(backend);
    await coreStore.createBranchSeed({ branchId: 'branch_e', saveNodeId: 'save_branch_e', schemaVersion: 3, assetCatalogFingerprint: 'sha256:cat', core: makeCore('branch_e', 0, 0), outbox: [], coreFingerprint: 'fe0', projectionFingerprint: 'pe0', outboxFingerprint: 'oe0' }, tabA);
    // 切换到 branch_e2（新分支种子化）后，tab B 持 branch_e 旧 pointer 提交 -> STALE_BRANCH。
    const seedE2 = await coreStore.createBranchSeed({ branchId: 'branch_e2', saveNodeId: 'save_branch_e2', schemaVersion: 3, assetCatalogFingerprint: 'sha256:cat', core: makeCore('branch_e2', 0, 0), outbox: [], coreFingerprint: 'fe20', projectionFingerprint: 'pe20', outboxFingerprint: 'oe20', expectedActiveBranchId: 'branch_e', expectedActiveRevision: 0 }, tabA);
    assert(seedE2.ok, '场景3-分支切换种子化（带 expected pointer CAS）必须成功');
    const oldBranchCommit = await coreStore.commitTurn({ expectedBranchId: 'branch_e', expectedRevision: 0, idempotencyKey: 'key_old_e', core: makeCore('branch_e', 1, 1), outbox: [], coreFingerprint: 'fe1', projectionFingerprint: 'pe1', outboxFingerprint: 'oe1' }, tabB);
    assert(!oldBranchCommit.ok && oldBranchCommit.code === 'STALE_BRANCH', '场景3-指针切换后旧 branch 提交必须 STALE_BRANCH: ' + JSON.stringify(oldBranchCommit));
    const pointer = await coreStore.readActivePointer(tabB);
    assert(pointer && pointer.runtimeBranchId === 'branch_e2' && pointer.runtimeRevision === 0, '场景3-active pointer 未被旧分支覆盖');
    recordRejected('场景3-指针切换CAS', 'STALE_BRANCH + active pointer 不被覆盖', 'STALE_BRANCH');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-cross-tab-cas regression passed.');
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
    console.error('story-runtime-cross-tab-cas regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
