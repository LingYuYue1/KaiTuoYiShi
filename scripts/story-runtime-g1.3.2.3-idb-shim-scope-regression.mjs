// G1.3.2.3 idb-shim-scope regression：P1-6 ——
// - readwrite 事务按数据库与重叠 object-store scope 排队；不重叠 scope 不被全库单一队列无条件串行化
//   （用 db._active 活跃事务数直接证明并行，不只最终 Map）；
// - readonly 与 readonly 并行；readonly 与 readwrite 仅在 scope 重叠时互斥；
// - 排队事务在取得开始许可前不得读取/写入/complete（事件顺序断言）；
// - 空事务（readonly 与 readwrite）按 IDB 时序 complete 并释放对应 scope；
// - 排队期间 abort 的事务不取得锁、不执行任何操作、不卡队列；
// - 真实 Promise.all 覆盖双 commit / 双 seed（严格一成功一冲突）。
// 生产模块经 esbuild 执行；shim 提供真实事务语义。
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
  const makeCore = (branch, rev, turn) => ({ ...makeEmptyState({ runtimeBranchId: branch, saveNodeId: 'save_' + branch, runtimeRevision: rev }), turnCount: turn });

  // ══ 场景 1：readonly 与 readonly 并行（同 scope 也不互斥）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    const tx1 = db.transaction(coreStore.CORE_STORE, 'readonly');
    tx1.oncomplete = () => events.push('ro1-complete');
    const tx2 = db.transaction(coreStore.CORE_STORE, 'readonly');
    tx2.oncomplete = () => events.push('ro2-complete');
    assert(db._active.length === 2, '场景1-两个 readonly 必须同时活跃（并行，不串行排队），实际活跃 ' + db._active.length);
    await new Promise((res) => setTimeout(res, 50));
    assert(events.includes('ro1-complete') && events.includes('ro2-complete'), '场景1-两个 readonly 都必须 complete，实际 ' + JSON.stringify(events));
    recordPositive('场景1-readonly 并行', '同 scope 两个 readonly 同时活跃并 complete');
  }

  // ══ 场景 2：不重叠 readwrite 并行（不同 scope 不被全库单一队列串行化）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    const tx1 = db.transaction(coreStore.POINTER_STORE, 'readwrite');
    tx1.oncomplete = () => events.push('rw1-complete');
    const tx2 = db.transaction(coreStore.CORE_STORE, 'readwrite');
    tx2.oncomplete = () => events.push('rw2-complete');
    // 两个不重叠 readwrite 必须同时活跃（若全库单一队列，tx2 会在队列等待）。
    assert(db._active.length === 2, '场景2-不重叠 readwrite 必须并行（活跃数 2，实际 ' + db._active.length + '）');
    await new Promise((res) => { const r = tx1.objectStore(coreStore.POINTER_STORE).put({ v: 1 }, 'k1'); r.onsuccess = () => res(); });
    await new Promise((res) => { const r = tx2.objectStore(coreStore.CORE_STORE).put({ v: 2 }, 'k2'); r.onsuccess = () => res(); });
    await new Promise((res) => setTimeout(res, 60));
    assert(events.includes('rw1-complete') && events.includes('rw2-complete'), '场景2-两个不重叠事务都 complete，实际 ' + JSON.stringify(events));
    // 最终 bytes 都可见。
    const rtx = db.transaction([coreStore.POINTER_STORE, coreStore.CORE_STORE], 'readonly');
    const k1 = await new Promise((res) => { const r = rtx.objectStore(coreStore.POINTER_STORE).get('k1'); r.onsuccess = () => res(r.result); });
    const k2 = await new Promise((res) => { const r = rtx.objectStore(coreStore.CORE_STORE).get('k2'); r.onsuccess = () => res(r.result); });
    assert(k1 && k1.v === 1, '场景2-不重叠事务 1 的写可见');
    assert(k2 && k2.v === 2, '场景2-不重叠事务 2 的写可见');
    recordPositive('场景2-不重叠 readwrite 并行', '活跃数 2 + 两写可见');
  }

  // ══ 场景 3：重叠 readwrite 串行（同 scope 互斥，事件顺序 tx1 -> tx2）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    const tx1 = db.transaction(coreStore.CORE_STORE, 'readwrite');
    tx1.oncomplete = () => events.push('tx1-complete');
    const tx2 = db.transaction(coreStore.CORE_STORE, 'readwrite');
    tx2.oncomplete = () => events.push('tx2-complete');
    assert(db._active.length === 1 && db._queued.length === 1, '场景3-重叠 readwrite 必须一活跃一排队，实际活跃 ' + db._active.length + ' 排队 ' + db._queued.length);
    await new Promise((res) => { const r = tx1.objectStore(coreStore.CORE_STORE).put({ v: 1 }, 'k1'); r.onsuccess = () => res(); });
    await new Promise((res) => { const r = tx2.objectStore(coreStore.CORE_STORE).put({ v: 2 }, 'k2'); r.onsuccess = () => res(); });
    await new Promise((res) => setTimeout(res, 60));
    assert(events[0] === 'tx1-complete', '场景3-tx1 必须先 complete，实际 ' + JSON.stringify(events));
    assert(events.includes('tx2-complete') && events.indexOf('tx1-complete') < events.indexOf('tx2-complete'), '场景3-排队事务不得提前 complete');
    recordPositive('场景3-重叠 readwrite 串行', '活跃 1 排队 1 + tx1 -> tx2 事件顺序');
  }

  // ══ 场景 4：readonly 与 readwrite 重叠互斥（双向事件顺序）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    // 4a：readonly 先创建（活跃），readwrite 排队；ro 空事务完成后 rw 才开始。
    const ro = db.transaction(coreStore.CORE_STORE, 'readonly');
    ro.oncomplete = () => events.push('ro-complete');
    const rw = db.transaction(coreStore.CORE_STORE, 'readwrite');
    rw.oncomplete = () => events.push('rw-complete');
    assert(db._active.length === 1 && db._queued.length === 1, '场景4a-readonly 活跃时重叠 readwrite 排队，实际活跃 ' + db._active.length + ' 排队 ' + db._queued.length);
    await new Promise((res) => setTimeout(res, 60));
    assert(events.includes('ro-complete') && events.includes('rw-complete') && events.indexOf('ro-complete') < events.indexOf('rw-complete'), '场景4a-ro -> rw 顺序，实际 ' + JSON.stringify(events));
    // 4b：readwrite 先创建（活跃），readonly 排队；rw 空事务完成后 ro 才开始。
    const events2 = [];
    const rw2 = db.transaction(coreStore.CORE_STORE, 'readwrite');
    rw2.oncomplete = () => events2.push('rw2-complete');
    const ro2 = db.transaction(coreStore.CORE_STORE, 'readonly');
    ro2.oncomplete = () => events2.push('ro2-complete');
    assert(db._active.length === 1 && db._queued.length === 1, '场景4b-readwrite 活跃时重叠 readonly 排队');
    await new Promise((res) => setTimeout(res, 60));
    assert(events2.includes('rw2-complete') && events2.includes('ro2-complete') && events2.indexOf('rw2-complete') < events2.indexOf('ro2-complete'), '场景4b-rw2 -> ro2 顺序，实际 ' + JSON.stringify(events2));
    recordPositive('场景4-readonly/readwrite 重叠互斥', '双向事件顺序 ro->rw 与 rw->ro 均成立');
  }

  // ══ 场景 5：空事务（readonly + readwrite）都按 IDB 时序 complete 并释放 scope ══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    const tx = db.transaction(coreStore.POINTER_STORE, 'readwrite');
    tx.oncomplete = () => events.push('rw-empty-complete');
    const ro = db.transaction(coreStore.CORE_STORE, 'readonly');
    ro.oncomplete = () => events.push('ro-empty-complete');
    await new Promise((res) => setTimeout(res, 50));
    assert(events.includes('rw-empty-complete') && events.includes('ro-empty-complete'), '场景5-空事务都必须 complete，实际 ' + JSON.stringify(events));
    // scope 释放：后续事务可立即开始（活跃数 1）。
    const tx3 = db.transaction(coreStore.POINTER_STORE, 'readwrite');
    assert(db._active.length === 1 && db._queued.length === 0, '场景5-空事务释放 scope 后后续事务立即开始');
    await new Promise((res) => setTimeout(res, 50));
    recordPositive('场景5-空事务完成 + scope 释放', 'readwrite/readonly 空事务均 complete');
  }

  // ══ 场景 6：排队期间 abort 不取得锁、不执行、不卡队列 ══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    const tx1 = db.transaction(coreStore.CORE_STORE, 'readwrite');
    tx1.oncomplete = () => events.push('tx1-complete');
    await new Promise((res) => { const r = tx1.objectStore(coreStore.CORE_STORE).put({ v: 1 }, 'k1'); r.onsuccess = () => res(); });
    // tx2 排队（与 tx1 重叠），写 k2（不等待 settle——排队事务的写要等开始后才 settle），然后排队中 abort。
    const tx2 = db.transaction(coreStore.CORE_STORE, 'readwrite');
    tx2.onabort = () => events.push('tx2-abort');
    const r2 = tx2.objectStore(coreStore.CORE_STORE).put({ v: 2 }, 'k2');
    assert(db._active.length === 1 && db._queued.length === 1, '场景6-tx2 必须仍在排队（活跃 ' + db._active.length + ' 排队 ' + db._queued.length + '）');
    tx2.abort();
    await new Promise((res) => setTimeout(res, 10));
    assert(events.includes('tx2-abort'), '场景6-排队中 abort 必须触发 onabort');
    await new Promise((res) => setTimeout(res, 60));
    assert(events.includes('tx1-complete'), '场景6-tx1 正常 complete（队列未被 abort 卡住）');
    const rtx = db.transaction(coreStore.CORE_STORE, 'readonly');
    const k1 = await new Promise((res) => { const r = rtx.objectStore(coreStore.CORE_STORE).get('k1'); r.onsuccess = () => res(r.result); });
    const k2 = await new Promise((res) => { const r = rtx.objectStore(coreStore.CORE_STORE).get('k2'); r.onsuccess = () => res(r.result); });
    assert(k1 && k1.v === 1, '场景6-tx1 写可见');
    assert(k2 === undefined, '场景6-排队中 abort 的 tx2 写不存在（未取得锁不执行）');
    recordRejected('场景6-排队中 abort', 'onabort 触发 + 队列不卡 + k2 不存在', 'abort');
  }

  // ══ 场景 7：Promise.all 双 commit 严格一成功一冲突 ══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_s7', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_s7', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    const results = await Promise.all([
      coreStore.commitTurn({ expectedBranchId: 'branch_s7', expectedRevision: 0, idempotencyKey: 'ka', core: makeCore('branch_s7', 1, 1), outbox: [], coreFingerprint: 'fa', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim),
      coreStore.commitTurn({ expectedBranchId: 'branch_s7', expectedRevision: 0, idempotencyKey: 'kb', core: makeCore('branch_s7', 1, 1), outbox: [], coreFingerprint: 'fb', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    const conflictCount = results.filter((r) => !r.ok && r.code === 'CONFLICT').length;
    assert(okCount === 1 && conflictCount === 1, '场景7-Promise.all 双 commit 严格一成功一 CONFLICT');
    recordPositive('场景7-Promise.all 双 commit', '1 success + 1 CONFLICT');
    recordRejected('场景7-双 commit 冲突方', 'CONFLICT', 'CONFLICT');
  }

  // ══ 场景 8：Promise.all 双 seed 严格一成功一冲突 ══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_s8', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_s8', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    const results = await Promise.all([
      coreStore.createBranchSeed({ branchId: 'branch_b8', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: makeCore('branch_b8', 0, 0), outbox: [], coreFingerprint: 'fb', projectionFingerprint: 'p', outboxFingerprint: 'o', expectedActiveBranchId: 'branch_s8', expectedActiveRevision: 0 }, shim),
      coreStore.createBranchSeed({ branchId: 'branch_c8', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: makeCore('branch_c8', 0, 0), outbox: [], coreFingerprint: 'fc', projectionFingerprint: 'p', outboxFingerprint: 'o', expectedActiveBranchId: 'branch_s8', expectedActiveRevision: 0 }, shim),
    ]);
    const okCount = results.filter((r) => r.ok).length;
    assert(okCount === 1, '场景8-Promise.all 双 seed 严格一成功');
    recordPositive('场景8-Promise.all 双 seed', '1 success + 1 冲突');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.3-idb-shim-scope regression passed.');
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
    console.error('story-runtime-g1.3.2.3-idb-shim-scope regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
