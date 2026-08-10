// G1.3.2.5 idb-shim-clear-order regression：P1-3 ——
// - clearStore(store) 必须丢弃该 store 在 clear 之前的全部 put/delete WriteSet，只保留 clear 之后的新操作；
// - 事务内 get/getAll/getAllKeys 与最终提交在以下序列一致：
//   `put -> clear` 为空、`put -> clear -> put` 只剩后写、`clear -> put -> clear` 为空、
//   `put -> delete -> clear` 为空；
// - 提交后重开仍一致；abort 继续丢弃全部 WriteSet；
// - 不得只调整测试期望而保留错误提交顺序。
// 生产模块经 esbuild 执行；shim 提供真实事务语义。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';
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
  const C = coreStore.CORE_STORE;
  const put = (store, key, v) => new Promise((res) => { const r = store.put({ v }, key); r.onsuccess = () => res(); });
  const del = (store, key) => new Promise((res) => { const r = store.delete(key); r.onsuccess = () => res(); });
  const clear = (store) => new Promise((res) => { const r = store.clear(); r.onsuccess = () => res(); });
  const getAll = (store) => new Promise((res) => { const r = store.getAll(); r.onsuccess = () => res(r.result); });
  const getAllKeys = (store) => new Promise((res) => { const r = store.getAllKeys(); r.onsuccess = () => res(r.result); });
  const commit = (tx) => new Promise((res) => { tx.oncomplete = () => res(); tx.onabort = () => res(); tx.onerror = () => res(); });
  const readCommitted = async (db) => {
    const rtx = db.transaction(C, 'readonly');
    const s = rtx.objectStore(C);
    const all = await getAll(s);
    return all.map((x) => x.v).sort((a, b) => a - b);
  };
  const runSequence = async (db, ops) => {
    const tx = db.transaction(C, 'readwrite');
    const s = tx.objectStore(C);
    for (const op of ops) {
      if (op[0] === 'put') await put(s, op[1], op[2]);
      else if (op[0] === 'delete') await del(s, op[1]);
      else if (op[0] === 'clear') await clear(s);
    }
    const inside = (await getAll(s)).map((x) => x.v).sort((a, b) => a - b);
    await commit(tx);
    const committed = await readCommitted(db);
    return { inside, committed };
  };

  // ══ 场景 1：`put -> clear` 为空（clear 前写入被丢弃）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const r = await runSequence(db, [['put', 'k1', 1], ['clear']]);
    assert(r.inside.length === 0, '场景1-put -> clear 事务内为空，实际 ' + JSON.stringify(r.inside));
    assert(r.committed.length === 0, '场景1-put -> clear 提交后为空（clear 前写入不得复活），实际 ' + JSON.stringify(r.committed));
    recordRejected('P1-3-put->clear', 'clear 前写入被丢弃（事务内与提交后都为空）', '为空');
  }

  // ══ 场景 2：`put -> clear -> put` 只剩后写 ══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const r = await runSequence(db, [['put', 'k1', 1], ['clear'], ['put', 'k2', 2]]);
    assert(JSON.stringify(r.inside) === JSON.stringify([2]), '场景2-put -> clear -> put 事务内只剩后写，实际 ' + JSON.stringify(r.inside));
    assert(JSON.stringify(r.committed) === JSON.stringify([2]), '场景2-提交后只剩 clear 之后的新写，实际 ' + JSON.stringify(r.committed));
    recordPositive('P1-3-put->clear->put', '只剩 clear 之后的新写');
  }

  // ══ 场景 3：`clear -> put -> clear` 为空 ══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const r = await runSequence(db, [['clear'], ['put', 'k1', 1], ['clear']]);
    assert(r.inside.length === 0 && r.committed.length === 0, '场景3-clear -> put -> clear 为空（第二次 clear 丢弃中间写），实际 inside ' + JSON.stringify(r.inside) + ' committed ' + JSON.stringify(r.committed));
    recordRejected('P1-3-clear->put->clear', '第二次 clear 丢弃 clear 与 clear 之间的写', '丢弃');
  }

  // ══ 场景 4：`put -> delete -> clear` 为空 ══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const r = await runSequence(db, [['put', 'k1', 1], ['delete', 'k1'], ['clear']]);
    assert(r.inside.length === 0 && r.committed.length === 0, '场景4-put -> delete -> clear 为空，实际 ' + JSON.stringify(r.inside));
    recordRejected('P1-3-put->delete->clear', 'delete 后 clear 仍为空', '为空');
  }

  // ══ 场景 5：getAllKeys overlay 与 getAll 一致 + 重开一致性 ══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    // 预置已提交 k0。
    await new Promise((res) => {
      const tx = db.transaction(C, 'readwrite');
      const r = tx.objectStore(C).put({ v: 0 }, 'k0');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const tx = db.transaction(C, 'readwrite');
    const s = tx.objectStore(C);
    await put(s, 'k1', 1);
    await clear(s);
    await put(s, 'k2', 2);
    const keys = (await getAllKeys(s)).sort();
    const values = (await getAll(s)).map((x) => x.v).sort((a, b) => a - b);
    assert(JSON.stringify(keys) === JSON.stringify(['k2']), '场景5-getAllKeys overlay 只剩 clear 后的 k2，实际 ' + JSON.stringify(keys));
    assert(JSON.stringify(values) === JSON.stringify([2]), '场景5-getAll overlay 一致');
    await commit(tx);
    const committed = await readCommitted(db);
    assert(JSON.stringify(committed) === JSON.stringify([2]), '场景5-提交后只剩 k2（k0 也被 clear 掉）');
    recordPositive('P1-3-getAllKeys/重开一致', 'overlay 与提交后一致（k0/k1 清除，k2 保留）');
  }

  // ══ 场景 6：abort 丢弃全部 WriteSet（含 clear 后新写）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const tx = db.transaction(C, 'readwrite');
    const s = tx.objectStore(C);
    await put(s, 'k1', 1);
    await clear(s);
    await put(s, 'k2', 2);
    tx.abort();
    await new Promise((res) => setTimeout(res, 30));
    const committed = await readCommitted(db);
    assert(committed.length === 0, '场景6-abort 后全部 WriteSet 丢弃（k1/k2 都不存在）');
    recordRejected('P1-3-abort 对照', 'abort 丢弃全部 WriteSet（含 clear 后新写）', '丢弃');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.5-idb-shim-clear-order regression passed.');
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
    console.error('story-runtime-g1.3.2.5-idb-shim-clear-order regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
