// G1.3.2.4 idb-shim-transaction-semantics regression：P1-5 ——
// - readonly transaction 的 put/delete/clear 按 IDB 语义同步抛出 ReadOnlyError（不返回成功 request）；
// - readwrite transaction 内 get/getAll 读取"已提交快照 + 本事务 WriteSet overlay"
//   （read-your-writes：put 后 get 读到新值；delete 后 get 为 undefined；clear 后 getAll 为空；
//   getAll 叠加 put 新增/覆盖与 delete 移除）；getAllKeys 与 getAll overlay 一致；
// - abort 丢弃全部 WriteSet（已提交 bytes 不变）；成功事务一次性发布（重开可见）。
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
  const P = coreStore.POINTER_STORE;

  // ══ 场景 1：readonly 事务 put/delete/clear 同步 ReadOnlyError ══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const ro = db.transaction(C, 'readonly');
    const store = ro.objectStore(C);
    const errors = [];
    try { store.put({ v: 1 }, 'k1'); errors.push('put:no-throw'); } catch (e) { errors.push('put:' + e.name); }
    try { store.delete('k1'); errors.push('delete:no-throw'); } catch (e) { errors.push('delete:' + e.name); }
    try { store.clear(); errors.push('clear:no-throw'); } catch (e) { errors.push('clear:' + e.name); }
    assert(errors.join(',') === 'put:ReadOnlyError,delete:ReadOnlyError,clear:ReadOnlyError', '场景1-readonly 写必须同步 ReadOnlyError，实际 ' + errors.join(','));
    // 提交后 store 无写入。
    await new Promise((res) => setTimeout(res, 30));
    const rtx = db.transaction(C, 'readonly');
    const got = await new Promise((res) => { const r = rtx.objectStore(C).get('k1'); r.onsuccess = () => res(r.result); });
    assert(got === undefined, '场景1-readonly 拒绝写入后无副作用');
    recordRejected('场景1-readonly 写拒绝', 'put/delete/clear 同步 ReadOnlyError', 'ReadOnlyError');
  }

  // ══ 场景 2：read-your-writes——put 后同事务 get 读到新值 ══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    // 预置已提交值 k1=v0。
    await new Promise((res) => {
      const tx = db.transaction(C, 'readwrite');
      const r = tx.objectStore(C).put({ v: 0 }, 'k1');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const tx = db.transaction(C, 'readwrite');
    const store = tx.objectStore(C);
    await new Promise((res) => { const r = store.put({ v: 1 }, 'k1'); r.onsuccess = () => res(); });
    const got = await new Promise((res) => { const r = store.get('k1'); r.onsuccess = () => res(r.result); });
    assert(got !== undefined && got.v === 1, '场景2-同事务 put 后 get 必须读到新值（read-your-writes），实际 ' + JSON.stringify(got));
    await new Promise((res) => setTimeout(res, 30));
    // 提交后全局可见。
    const rtx = db.transaction(C, 'readonly');
    const committed = await new Promise((res) => { const r = rtx.objectStore(C).get('k1'); r.onsuccess = () => res(r.result); });
    assert(committed !== undefined && committed.v === 1, '场景2-提交后已提交状态为 v1');
    recordPositive('场景2-put/get read-your-writes', '同事务读到自己写入 + 提交后可见');
  }

  // ══ 场景 3：delete/getAll overlay（delete 后 get undefined；getAll 叠加 put/delete）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    // 预置 k1/v0、k2/v0。
    await new Promise((res) => {
      const tx = db.transaction(C, 'readwrite');
      const s = tx.objectStore(C);
      const r1 = s.put({ v: 0 }, 'k1');
      r1.onsuccess = () => {
        const r2 = s.put({ v: 0 }, 'k2');
        r2.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      };
    });
    const tx = db.transaction(C, 'readwrite');
    const store = tx.objectStore(C);
    // delete k1、put k3 新值。
    await new Promise((res) => { const r = store.delete('k1'); r.onsuccess = () => res(); });
    await new Promise((res) => { const r = store.put({ v: 3 }, 'k3'); r.onsuccess = () => res(); });
    // get k1 -> undefined（delete overlay）。
    const gotDel = await new Promise((res) => { const r = store.get('k1'); r.onsuccess = () => res(r.result); });
    assert(gotDel === undefined, '场景3-delete 后同事务 get 必须 undefined（overlay）');
    // getAll -> [k2(v0), k3(v3)]（已提交 k1 移除、k3 新增）。
    const all = await new Promise((res) => { const r = store.getAll(); r.onsuccess = () => res(r.result); });
    const keys = all.map((x) => (x.v === 0 ? 'k2' : x.v === 3 ? 'k3' : '?')).sort();
    assert(JSON.stringify(keys) === JSON.stringify(['k2', 'k3']), '场景3-getAll overlay 必须叠加本事务写集，实际 ' + JSON.stringify(keys));
    // getAllKeys 与 getAll 一致。
    const allKeys = await new Promise((res) => { const r = store.getAllKeys(); r.onsuccess = () => res(r.result); });
    assert(JSON.stringify([...allKeys].sort()) === JSON.stringify(['k2', 'k3']), '场景3-getAllKeys overlay 与 getAll 一致，实际 ' + JSON.stringify(allKeys));
    await new Promise((res) => setTimeout(res, 30));
    // 提交后已提交状态：k1 删除、k3 存在。
    const rtx = db.transaction(C, 'readonly');
    const s2 = rtx.objectStore(C);
    const committedK1 = await new Promise((res) => { const r = s2.get('k1'); r.onsuccess = () => res(r.result); });
    const committedK3 = await new Promise((res) => { const r = s2.get('k3'); r.onsuccess = () => res(r.result); });
    assert(committedK1 === undefined && committedK3 !== undefined && committedK3.v === 3, '场景3-提交后 delete/put 生效');
    recordPositive('场景3-delete/getAll/getAllKeys overlay', '同事务可见 + 提交后生效');
  }

  // ══ 场景 4：clear overlay + 提交后 store 清空 ══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    await new Promise((res) => {
      const tx = db.transaction(C, 'readwrite');
      const s = tx.objectStore(C);
      const r1 = s.put({ v: 0 }, 'k1');
      r1.onsuccess = () => {
        const r2 = s.put({ v: 0 }, 'k2');
        r2.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      };
    });
    const tx = db.transaction(C, 'readwrite');
    const store = tx.objectStore(C);
    await new Promise((res) => { const r = store.clear(); r.onsuccess = () => res(); });
    await new Promise((res) => { const r = store.put({ v: 9 }, 'k9'); r.onsuccess = () => res(); });
    // clear 后 getAll 只剩本事务新写 k9。
    const all = await new Promise((res) => { const r = store.getAll(); r.onsuccess = () => res(r.result); });
    assert(all.length === 1 && all[0].v === 9, '场景4-clear overlay 后 getAll 只剩新写，实际 ' + JSON.stringify(all));
    await new Promise((res) => setTimeout(res, 30));
    const rtx = db.transaction(C, 'readonly');
    const committed = await new Promise((res) => { const r = rtx.objectStore(C).getAll(); r.onsuccess = () => res(r.result); });
    assert(committed.length === 1 && committed[0].v === 9, '场景4-提交后 store 清空并只有 k9');
    recordPositive('场景4-clear overlay', 'clear + 后续 put 覆盖，提交后生效');
  }

  // ══ 场景 5：abort 丢弃全部 WriteSet（已提交 bytes 不变）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    await new Promise((res) => {
      const tx = db.transaction(C, 'readwrite');
      const r = tx.objectStore(C).put({ v: 0 }, 'k1');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const tx = db.transaction(C, 'readwrite');
    const store = tx.objectStore(C);
    await new Promise((res) => { const r = store.put({ v: 999 }, 'k1'); r.onsuccess = () => res(); });
    await new Promise((res) => { const r = store.put({ v: 888 }, 'k2'); r.onsuccess = () => res(); });
    tx.abort();
    await new Promise((res) => setTimeout(res, 40));
    const rtx = db.transaction(C, 'readonly');
    const s2 = rtx.objectStore(C);
    const k1 = await new Promise((res) => { const r = s2.get('k1'); r.onsuccess = () => res(r.result); });
    const k2 = await new Promise((res) => { const r = s2.get('k2'); r.onsuccess = () => res(r.result); });
    assert(k1 !== undefined && k1.v === 0, '场景5-abort 后 k1 回滚到已提交值（v0）');
    assert(k2 === undefined, '场景5-abort 后 k2 不存在（写集丢弃）');
    recordRejected('场景5-abort 全量回滚', 'k1 回滚 + k2 不存在', '回滚');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.4-idb-shim-transaction-semantics regression passed.');
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
    console.error('story-runtime-g1.3.2.4-idb-shim-transaction-semantics regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
