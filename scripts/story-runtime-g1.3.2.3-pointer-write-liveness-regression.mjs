// G1.3.2.3 pointer-write-liveness regression：P0-3 ——
// - pointer write 是最后一道提交闸门：故障必须在 pointer put request/transaction 尚未 complete 时注入
//   （setTimeout 在 put 调用同步注册，先于空事务完成定时器），不能用事务已完成后才触发的延迟 no-op；
// - commitTurn 与 createBranchSeed 的 pointer write 故障：Promise 在 150ms timeout 内结束，返回稳定失败
//   （DB_UNAVAILABLE，不返回 ok: true），不悬挂；
// - 失败后重新打开数据库核对 pointer/core/outbox bytes、revision 和 side effects 全部不变（零写入）；
// - 保留 pointer read / core write / outbox write / checkpoint put 四个既有故障位置 + 成功对照。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim（注入故障）。
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

  /**
   * 故障注入：patch 共享 backend 中 DB 实例的 transaction。
   * 对指定 store 的 get/put 返回"请求级失败"——在 microtask 中确定性触发 request error -> tx._fail
   * （abort 事务，丢弃写集）。请求错误发生在任何 complete timer 之前（microtask 先于 timers），
   * 即故障发生在 transaction 尚未 complete 时；不能用"事务已完成后才触发的延迟 no-op"。
   */
  function makeFaultyShim(fault, backend) {
    const shim = createIdbShim(backend);
    const db = backend.get(coreStore.RUNTIME_DB_NAME);
    if (db) {
      const origTx = db.transaction.bind(db);
      db.transaction = (storeNames, mode) => {
        const tx = origTx(storeNames, mode);
        if (mode === 'readwrite') {
          const names = Array.isArray(storeNames) ? storeNames : [storeNames];
          if (names.includes(fault.store)) {
            const origObjectStore = tx.objectStore.bind(tx);
            tx.objectStore = (storeName) => {
              const store = origObjectStore(storeName);
              if (storeName === fault.store) {
                const failRequest = (opName) => {
                  const req = { result: undefined, error: new Error('injected ' + opName + ' fault'), onsuccess: null, onerror: null, _tx: tx };
                  queueMicrotask(() => {
                    if (typeof req.onerror === 'function') req.onerror({ target: req, error: req.error });
                    else if (typeof tx._fail === 'function') tx._fail(req.error);
                    if (typeof tx._requestDone === 'function') tx._requestDone();
                  });
                  return req;
                };
                const origGet = store.get.bind(store);
                store.get = (key) => {
                  if (fault.op === 'get' && (fault.onKey === undefined || key === fault.onKey)) return failRequest('get');
                  return origGet(key);
                };
                const origPut = store.put.bind(store);
                store.put = (value, key) => {
                  if (fault.op === 'put' && (fault.onKey === undefined || key === fault.onKey)) return failRequest('put');
                  return origPut(value, key);
                };
              }
              return store;
            };
          }
        }
        return tx;
      };
    }
    return shim;
  }

  // 用 timeout 检查 Promise 是否悬挂（150ms 内必须 settle）。
  async function settledWithin(promise, ms = 150) {
    let settled = false;
    let value = null;
    await Promise.race([
      promise.then((v) => { settled = true; value = v; }),
      new Promise((res) => setTimeout(res, ms)),
    ]);
    return { settled, value };
  }

  // ══ 场景 1：commitTurn pointer write 故障（最后一道提交闸门）-> 稳定失败、不悬挂、零写入 ══
  {
    const backend = createSharedIdbBackend();
    const okShim = createIdbShim(backend);
    const base = makeCore('branch_pw1', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_pw1', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, okShim);
    const shim = makeFaultyShim({ store: coreStore.POINTER_STORE, op: 'put', onKey: 'active' }, backend);
    const beforeCore = JSON.stringify(await coreStore.readCoreState('branch_pw1', okShim));
    const beforePointer = JSON.stringify(await coreStore.readActivePointer(okShim));
    const { settled, value } = await settledWithin(coreStore.commitTurn({ expectedBranchId: 'branch_pw1', expectedRevision: 0, idempotencyKey: 'k1', core: makeCore('branch_pw1', 1, 1), outbox: [], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim));
    assert(settled === true, '场景1-pointer write 故障必须在 150ms 内结束（不悬挂）');
    assert(!value.ok && value.code === 'DB_UNAVAILABLE', '场景1-必须稳定失败（DB_UNAVAILABLE），不返回 ok: true，实际 ' + JSON.stringify(value));
    // 重新打开数据库核对零副作用：core bytes、pointer bytes、revision 全部不变。
    const afterCore = JSON.stringify(await coreStore.readCoreState('branch_pw1', okShim));
    const afterPointer = JSON.stringify(await coreStore.readActivePointer(okShim));
    assert(afterCore === beforeCore, '场景1-失败后 core bytes 不变（零写入）');
    assert(afterPointer === beforePointer, '场景1-失败后 pointer bytes 不变（revision 未推进）');
    const items = await coreStore.readOutboxItems('branch_pw1', okShim);
    assert(items.length === 0, '场景1-失败后 outbox 零写入');
    recordRejected('场景1-commitTurn pointer write 故障', 'timeout 内稳定 DB_UNAVAILABLE + core/pointer/outbox 零写入', 'DB_UNAVAILABLE');
  }

  // ══ 场景 2：createBranchSeed pointer write 故障 -> 稳定失败、不悬挂、零写入 ══
  {
    const backend = createSharedIdbBackend();
    const okShim = createIdbShim(backend);
    const base = makeCore('branch_pw2', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_pw2', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, okShim);
    const shim = makeFaultyShim({ store: coreStore.POINTER_STORE, op: 'put', onKey: 'active' }, backend);
    const beforePointer = JSON.stringify(await coreStore.readActivePointer(okShim));
    const beforeCore = JSON.stringify(await coreStore.readCoreState('branch_pw2', okShim));
    const { settled, value } = await settledWithin(coreStore.createBranchSeed({ branchId: 'branch_pw2b', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: makeCore('branch_pw2b', 0, 0), outbox: [], coreFingerprint: 'fb', projectionFingerprint: 'p', outboxFingerprint: 'o', expectedActiveBranchId: 'branch_pw2', expectedActiveRevision: 0 }, shim));
    assert(settled === true, '场景2-seed pointer write 故障必须不悬挂');
    assert(!value.ok && value.code === 'DB_UNAVAILABLE', '场景2-必须稳定失败，实际 ' + JSON.stringify(value));
    const afterPointer = JSON.stringify(await coreStore.readActivePointer(okShim));
    const afterCore = JSON.stringify(await coreStore.readCoreState('branch_pw2', okShim));
    const orphanCore = await coreStore.readCoreState('branch_pw2b', okShim);
    assert(afterPointer === beforePointer, '场景2-失败后 active pointer 不变');
    assert(afterCore === beforeCore, '场景2-失败后既有 core 不变');
    assert(orphanCore === null, '场景2-失败后不留下孤儿 core（新分支 core 回滚）');
    recordRejected('场景2-createBranchSeed pointer write 故障', '稳定 DB_UNAVAILABLE + pointer/core 零写入 + 无孤儿 core', 'DB_UNAVAILABLE');
  }

  // ══ 场景 3：pointer read 故障对照 ══
  {
    const backend = createSharedIdbBackend();
    const okShim = createIdbShim(backend);
    const base = makeCore('branch_pw3', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_pw3', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, okShim);
    const shim = makeFaultyShim({ store: coreStore.POINTER_STORE, op: 'get', onKey: 'active' }, backend);
    const { settled, value } = await settledWithin(coreStore.commitTurn({ expectedBranchId: 'branch_pw3', expectedRevision: 0, idempotencyKey: 'k3', core: makeCore('branch_pw3', 1, 1), outbox: [], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim));
    assert(settled === true && !value.ok && value.code === 'DB_UNAVAILABLE', '场景3-pointer read 故障对照必须稳定 DB_UNAVAILABLE');
    recordRejected('场景3-pointer read 故障对照', '稳定 DB_UNAVAILABLE', 'DB_UNAVAILABLE');
  }

  // ══ 场景 4：core write 故障对照 ══
  {
    const backend = createSharedIdbBackend();
    const okShim = createIdbShim(backend);
    const base = makeCore('branch_pw4', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_pw4', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, okShim);
    const shim = makeFaultyShim({ store: coreStore.CORE_STORE, op: 'put', onKey: 'branch_pw4' }, backend);
    const before = JSON.stringify(await coreStore.readCoreState('branch_pw4', okShim));
    const { settled, value } = await settledWithin(coreStore.commitTurn({ expectedBranchId: 'branch_pw4', expectedRevision: 0, idempotencyKey: 'k4', core: makeCore('branch_pw4', 1, 1), outbox: [], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim));
    assert(settled === true && !value.ok, '场景4-core write 故障对照必须稳定失败');
    assert(JSON.stringify(await coreStore.readCoreState('branch_pw4', okShim)) === before, '场景4-core bytes 不变');
    recordRejected('场景4-core write 故障对照', '稳定失败 + 零写入', '零写入');
  }

  // ══ 场景 5：outbox write 故障对照 ══
  {
    const backend = createSharedIdbBackend();
    const okShim = createIdbShim(backend);
    const base = makeCore('branch_pw5', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_pw5', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, okShim);
    const shim = makeFaultyShim({ store: coreStore.OUTBOX_STORE, op: 'put' }, backend);
    const outboxItem = { outboxId: 'o_pw5', schemaVersion: 3, runtimeBranchId: 'branch_pw5', sourceRefFingerprint: 's', sourceRevision: 1, kind: 'news', aggregateKey: 'k', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1', payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0 };
    const { settled, value } = await settledWithin(coreStore.commitTurn({ expectedBranchId: 'branch_pw5', expectedRevision: 0, idempotencyKey: 'k5', core: makeCore('branch_pw5', 1, 1), outbox: [outboxItem], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim));
    assert(settled === true && !value.ok, '场景5-outbox write 故障对照必须稳定失败');
    const items = await coreStore.readOutboxItems('branch_pw5', okShim);
    assert(items.length === 0, '场景5-outbox 零写入');
    recordRejected('场景5-outbox write 故障对照', '稳定失败 + outbox 零写入', '零写入');
  }

  // ══ 场景 6：checkpoint put 故障对照 ══
  {
    const backend = createSharedIdbBackend();
    await coreStore.openRuntimeDb(createIdbShim(backend));
    const shim = makeFaultyShim({ store: coreStore.CHECKPOINT_STORE, op: 'put' }, backend);
    const { settled, value } = await settledWithin(coreStore.putCheckpoint({ checkpointId: 'ck_pw6', payload: { a: 1 }, createdAt: 1 }, shim));
    assert(settled === true && !value.ok, '场景6-checkpoint put 故障对照必须稳定失败');
    const got = await coreStore.getCheckpoint('ck_pw6', createIdbShim(backend));
    assert(got === null, '场景6-checkpoint 零写入');
    recordRejected('场景6-checkpoint put 故障对照', '稳定失败 + 零写入', '零写入');
  }

  // ══ 场景 7：成功路径对照（pointer write 无故障 -> ok: true）══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_pw7', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_pw7', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    const { settled, value } = await settledWithin(coreStore.commitTurn({ expectedBranchId: 'branch_pw7', expectedRevision: 0, idempotencyKey: 'k7', core: makeCore('branch_pw7', 1, 1), outbox: [], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim));
    assert(settled === true && value.ok === true, '场景7-成功路径对照必须 ok 且不悬挂');
    const pointer = await coreStore.readActivePointer(shim);
    assert(pointer !== null && pointer.runtimeRevision === 1, '场景7-成功提交 revision 推进到 1');
    recordPositive('场景7-成功路径对照', 'ok + revision 推进');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.3-pointer-write-liveness regression passed.');
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
    console.error('story-runtime-g1.3.2.3-pointer-write-liveness regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
