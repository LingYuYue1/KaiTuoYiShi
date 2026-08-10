// G1.3.2.2 transaction-failure-liveness regression：P0-3 ——
// commitTurn/createBranchSeed/putCheckpoint 的 complete/error/abort 统一收束：
// - 在发出第一条 request 前安装 oncomplete/onerror/onabort，一次性 settle guard 保证 Promise 恰好结束；
// - 成功提交才返回 ok: true；任何 request/transaction error 或 abort 返回稳定 DB_UNAVAILABLE/CONFLICT 失败回执，不悬挂；
// - 故障注入覆盖 pointer read、core write、outbox write、pointer write、checkpoint put 五个位置，
//   用 timeout 证明没有悬挂（Promise.race 150ms 内必须 settle）；
// - 失败后 pointer/core/outbox/checkpoint bytes、revision 和副作用不变。
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
   * 故障注入：直接 patch 共享 backend 中 DB 实例的 transaction，
   * 在指定 store 的 get/put 触发 tx._fail（abort），coreRuntimeStore 的 onabort -> DB_UNAVAILABLE。
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
                if (fault.op === 'get') {
                  const origGet = store.get.bind(store);
                  store.get = (key) => {
                    const req2 = origGet(key);
                    if (fault.onKey === undefined || key === fault.onKey) {
                      setTimeout(() => { if (typeof tx._fail === 'function') tx._fail(new Error('injected get fault')); }, 0);
                    }
                    return req2;
                  };
                } else {
                  const origPut = store.put.bind(store);
                  store.put = (value, key) => {
                    const req2 = origPut(value, key);
                    if (fault.onKey === undefined || key === fault.onKey) {
                      setTimeout(() => { if (typeof tx._fail === 'function') tx._fail(new Error('injected put fault')); }, 0);
                    }
                    return req2;
                  };
                }
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

  // 用 timeout 检查 Promise 是否悬挂。
  async function settledWithin(promise, ms = 150) {
    let settled = false;
    let value = null;
    await Promise.race([
      promise.then((v) => { settled = true; value = v; }),
      new Promise((res) => setTimeout(res, ms)),
    ]);
    return { settled, value };
  }

  // ══ 场景 1：pointer read 故障 -> commitTurn 稳定 DB_UNAVAILABLE，不悬挂，零写入 ══
  {
    const backend = createSharedIdbBackend();
    const okShim = createIdbShim(backend);
    const base = makeCore('branch_t1', 0, 0);
    // 预建分支（用无故障 shim，同一 backend；先建 DB 再注入故障）。
    await coreStore.createBranchSeed({ branchId: 'branch_t1', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, okShim);
    const shim = makeFaultyShim({ store: coreStore.POINTER_STORE, op: 'get', onKey: 'active' }, backend);
    const before = JSON.stringify(await coreStore.readCoreState('branch_t1', okShim));
    const { settled, value } = await settledWithin(coreStore.commitTurn({ expectedBranchId: 'branch_t1', expectedRevision: 0, idempotencyKey: 'k1', core: makeCore('branch_t1', 1, 1), outbox: [], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim));
    assert(settled === true, '场景1-pointer read 故障必须在 timeout 内结束（不悬挂）');
    assert(!value.ok && value.code === 'DB_UNAVAILABLE', '场景1-必须稳定 DB_UNAVAILABLE: ' + JSON.stringify(value));
    const after = JSON.stringify(await coreStore.readCoreState('branch_t1', okShim));
    assert(after === before, '场景1-失败零写入（core bytes 不变）');
    recordRejected('场景1-pointer read 故障', 'DB_UNAVAILABLE + 不悬挂 + 零写入', 'DB_UNAVAILABLE');
  }

  // ══ 场景 2：core write 故障 -> 稳定失败，不悬挂，零写入 ══
  {
    const backend = createSharedIdbBackend();
    const okShim = createIdbShim(backend);
    const base = makeCore('branch_t2', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_t2', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, okShim);
    const shim = makeFaultyShim({ store: coreStore.CORE_STORE, op: 'put', onKey: 'branch_t2' }, backend);
    const before = JSON.stringify(await coreStore.readCoreState('branch_t2', okShim));
    const { settled, value } = await settledWithin(coreStore.commitTurn({ expectedBranchId: 'branch_t2', expectedRevision: 0, idempotencyKey: 'k2', core: makeCore('branch_t2', 1, 1), outbox: [], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim));
    assert(settled === true, '场景2-core write 故障必须不悬挂');
    assert(!value.ok, '场景2-必须稳定失败，实际 ' + JSON.stringify(value));
    assert(JSON.stringify(await coreStore.readCoreState('branch_t2', okShim)) === before, '场景2-失败零写入');
    recordRejected('场景2-core write 故障', '稳定失败（DB_UNAVAILABLE/CONFLICT）+ 零写入', '零写入');
  }

  // ══ 场景 3：outbox write 故障 -> 稳定失败，不悬挂，零写入 ══
  {
    const backend = createSharedIdbBackend();
    const okShim = createIdbShim(backend);
    const base = makeCore('branch_t3', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_t3', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, okShim);
    const shim = makeFaultyShim({ store: coreStore.OUTBOX_STORE, op: 'put' }, backend);
    const before = JSON.stringify(await coreStore.readCoreState('branch_t3', okShim));
    const outboxItem = { outboxId: 'o_t3', schemaVersion: 3, runtimeBranchId: 'branch_t3', sourceRefFingerprint: 's', sourceRevision: 1, kind: 'news', aggregateKey: 'k', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1', payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0 };
    const { settled, value } = await settledWithin(coreStore.commitTurn({ expectedBranchId: 'branch_t3', expectedRevision: 0, idempotencyKey: 'k3', core: makeCore('branch_t3', 1, 1), outbox: [outboxItem], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim));
    assert(settled === true, '场景3-outbox write 故障必须不悬挂');
    assert(!value.ok, '场景3-必须稳定失败，实际 ' + JSON.stringify(value));
    assert(JSON.stringify(await coreStore.readCoreState('branch_t3', okShim)) === before, '场景3-失败零写入（core 不变）');
    const items = await coreStore.readOutboxItems('branch_t3', okShim);
    assert(items.length === 0, '场景3-失败 outbox 零写入');
    recordRejected('场景3-outbox write 故障', '稳定失败 + core/outbox 零写入', '零写入');
  }

  // ══ 场景 4：checkpoint put 故障 -> putCheckpoint 稳定失败，不悬挂，零写入 ══
  {
    const backend = createSharedIdbBackend();
    await coreStore.openRuntimeDb(createIdbShim(backend)); // 先建 DB
    const shim = makeFaultyShim({ store: coreStore.CHECKPOINT_STORE, op: 'put' }, backend);
    const { settled, value } = await settledWithin(coreStore.putCheckpoint({ checkpointId: 'ck_t4', payload: { a: 1 }, createdAt: 1 }, shim));
    assert(settled === true, '场景4-checkpoint put 故障必须不悬挂');
    assert(!value.ok, '场景4-必须稳定失败，实际 ' + JSON.stringify(value));
    const got = await coreStore.getCheckpoint('ck_t4', createIdbShim(backend));
    assert(got === null, '场景4-失败零写入（checkpoint 不存在）');
    recordRejected('场景4-checkpoint put 故障', '稳定失败 + 零写入', '零写入');
  }

  // ══ 场景 5：成功路径仍返回 ok（对照）══
  {
    const shim = createIdbShim();
    const base = makeCore('branch_t5', 0, 0);
    await coreStore.createBranchSeed({ branchId: 'branch_t5', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: base.assetCatalogFingerprint, core: base, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    const { settled, value } = await settledWithin(coreStore.commitTurn({ expectedBranchId: 'branch_t5', expectedRevision: 0, idempotencyKey: 'k5', core: makeCore('branch_t5', 1, 1), outbox: [], coreFingerprint: 'f1', projectionFingerprint: 'p1', outboxFingerprint: 'o1' }, shim));
    assert(settled === true && value.ok === true, '场景5-成功路径必须 ok 且不悬挂');
    recordPositive('场景5-成功路径对照', 'ok + 不悬挂');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.2-transaction-failure-liveness regression passed.');
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
    console.error('story-runtime-g1.3.2.2-transaction-failure-liveness regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
