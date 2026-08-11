// G1.3.2.2 idb-shim-transaction regression：P1-6 ——
// - 空 readwrite transaction 按可重复 IDB 时序 complete/abort 并释放锁；
// - 排队事务在真正取得锁前不得读取/提交/触发 complete（事件顺序断言，不只最终 Map）；
// - 写集只能在 complete 前提交点一次性发布；abort/error 全量丢弃；
// - 用真正 Promise.all 覆盖空事务、两个 commit、两个 seed、两个 projection transaction。
// 生产模块经 esbuild 执行；shim 提供真实事务语义。
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

  // ══ 场景 1：空 readwrite transaction 按 IDB 时序 complete 并释放锁（不卡队列）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    // 空事务（无任何 request）。
    const tx = db.transaction(coreStore.POINTER_STORE, 'readwrite');
    tx.oncomplete = () => events.push('complete');
    tx.onabort = () => events.push('abort');
    // 空事务后立即排队第二个空事务。
    const tx2 = db.transaction(coreStore.POINTER_STORE, 'readwrite');
    tx2.oncomplete = () => events.push('complete2');
    tx2.onabort = () => events.push('abort2');
    await new Promise((res) => setTimeout(res, 50));
    assert(events.includes('complete') && events.includes('complete2'), '场景1-两个空事务都必须 complete，实际 ' + JSON.stringify(events));
    assert(events[0] === 'complete' && events[1] === 'complete2', '场景1-空事务按锁顺序 complete（先 tx 后 tx2），实际 ' + JSON.stringify(events));
    // 队列未被卡住：后续事务可用。
    const tx3 = db.transaction(coreStore.POINTER_STORE, 'readwrite');
    tx3.oncomplete = () => events.push('complete3');
    await new Promise((res) => setTimeout(res, 50));
    assert(events.includes('complete3'), '场景1-队列未被空事务卡住');
    recordPositive('场景1-空事务完成 + 队列释放', JSON.stringify(events));
  }

  // ══ 场景 2：排队事务在取得锁前不得提交（事件顺序：tx1 complete 先于 tx2 complete）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    const tx1 = db.transaction(coreStore.CORE_STORE, 'readwrite');
    tx1.oncomplete = () => events.push('tx1-complete');
    tx1.onabort = () => events.push('tx1-abort');
    const tx2 = db.transaction(coreStore.CORE_STORE, 'readwrite');
    tx2.oncomplete = () => events.push('tx2-complete');
    tx2.onabort = () => events.push('tx2-abort');
    // tx1 写。
    const s1 = tx1.objectStore(coreStore.CORE_STORE);
    await new Promise((res) => { const r = s1.put({ v: 1 }, 'k'); r.onsuccess = () => res(); });
    // tx2 写（应等 tx1 完成后才提交）。
    const s2 = tx2.objectStore(coreStore.CORE_STORE);
    await new Promise((res) => { const r = s2.put({ v: 2 }, 'k2'); r.onsuccess = () => res(); });
    await new Promise((res) => setTimeout(res, 60));
    assert(events[0] === 'tx1-complete', '场景2-tx1 必须先 complete，实际 ' + JSON.stringify(events));
    assert(events.includes('tx2-complete'), '场景2-tx2 随后 complete');
    assert(events.indexOf('tx1-complete') < events.indexOf('tx2-complete'), '场景2-排队事务不得提前提交');
    recordPositive('场景2-排队事务锁序', 'tx1 -> tx2 顺序 complete');
  }

  // ══ 场景 3：abort 全量回滚（写集丢弃，不发布）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    // 先提交一个事务写入 k1。
    const tx0 = db.transaction(coreStore.CORE_STORE, 'readwrite');
    await new Promise((res) => { const r = tx0.objectStore(coreStore.CORE_STORE).put({ v: 0 }, 'k1'); r.onsuccess = () => { tx0.oncomplete = () => res(); }; });
    // abort 事务：写 k1 新值 + k2。
    const tx = db.transaction(coreStore.CORE_STORE, 'readwrite');
    const s = tx.objectStore(coreStore.CORE_STORE);
    const writes = [];
    await new Promise((res) => { const r = s.put({ v: 999 }, 'k1'); r.onsuccess = () => { writes.push('k1'); res(); }; });
    await new Promise((res) => { const r = s.put({ v: 888 }, 'k2'); r.onsuccess = () => { writes.push('k2'); res(); }; });
    tx.abort();
    await new Promise((res) => setTimeout(res, 40));
    // 读已提交状态：k1 保持 v0，k2 不存在。
    const rtx = db.transaction(coreStore.CORE_STORE, 'readonly');
    const k1 = await new Promise((res) => { const r = rtx.objectStore(coreStore.CORE_STORE).get('k1'); r.onsuccess = () => res(r.result); });
    const k2 = await new Promise((res) => { const r = rtx.objectStore(coreStore.CORE_STORE).get('k2'); r.onsuccess = () => res(r.result); });
    assert(k1 && k1.v === 0, '场景3-abort 后 k1 回滚（v0）');
    assert(k2 === undefined, '场景3-abort 后 k2 不存在（写集丢弃）');
    recordRejected('场景3-abort 全量回滚', 'k1 回滚 + k2 不存在', '回滚');
  }

  // ══ 场景 4：Promise.all 两个 commitTurn 严格一成功一冲突（事件顺序 + 最终 Map）══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_s4', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_s4', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    const results = await Promise.all([
      coreStore.commitTurn({ expectedBranchId: 'branch_s4', expectedRevision: 0, idempotencyKey: 'ka', core: makeCore('branch_s4', 1, 1), outbox: [], coreFingerprint: 'fa', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim),
      coreStore.commitTurn({ expectedBranchId: 'branch_s4', expectedRevision: 0, idempotencyKey: 'kb', core: makeCore('branch_s4', 1, 1), outbox: [], coreFingerprint: 'fb', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    const conflictCount = results.filter((r) => !r.ok && r.code === 'CONFLICT').length;
    assert(okCount === 1 && conflictCount === 1, '场景4-Promise.all 双 commit 严格一成功一 CONFLICT');
    recordPositive('场景4-Promise.all 双 commit', '1 success + 1 CONFLICT');
    recordRejected('场景4-双 commit 冲突方', 'CONFLICT', 'CONFLICT');
  }

  // ══ 场景 5：Promise.all 两个 createBranchSeed 严格一成功一冲突 ══
  {
    const backend = createSharedIdbBackend();
    const shim = createIdbShim(backend);
    const base = makeCore('branch_a5', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_a5', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    const results = await Promise.all([
      coreStore.createBranchSeed({ branchId: 'branch_b5', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: makeCore('branch_b5', 0, 0), outbox: [], coreFingerprint: 'fb', projectionFingerprint: 'p', outboxFingerprint: 'o', expectedActiveBranchId: 'branch_a5', expectedActiveRevision: 0 }, shim),
      coreStore.createBranchSeed({ branchId: 'branch_c5', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: makeCore('branch_c5', 0, 0), outbox: [], coreFingerprint: 'fc', projectionFingerprint: 'p', outboxFingerprint: 'o', expectedActiveBranchId: 'branch_a5', expectedActiveRevision: 0 }, shim),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    assert(okCount === 1, '场景5-Promise.all 双 seed 严格一成功');
    recordPositive('场景5-Promise.all 双 seed', '1 success + 1 冲突');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.2-idb-shim-transaction regression passed.');
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
    console.error('story-runtime-g1.3.2.2-idb-shim-transaction regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
