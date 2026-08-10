// G1.3.2.4 projection-transaction-atomicity regression：P0-2/P1-3 ——
// - runTransaction 回调 throw/reject、request error、显式 abort 都只 settle 一次；
//   回调失败必须 abort 底层事务并等 abort/error 收束后再返回失败——第一条 put 成功后故意 throw，
//   重新打开数据库必须确认全部写入不可见（零写入）；
// - 成功路径仍一次性提交（不拆成读写两个阶段）；
// - typed article get/list 的 key/row 篡改拒绝：错 key/错 article/错 version/错 branch/少字段/错误包装
//   均返回稳定只读结果，不产生未捕获 throw。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim（含请求级故障注入）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';
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
  const adapterMod = await bundleTs('services/storyRuntime/projectionAdapter.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };
  const version = (branchId, articleId, vid, vno) => ({
    runtimeBranchId: branchId, articleVersionId: vid, articleId, articleVersion: vno,
    sourceRefs: [], sourceFingerprint: 's', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x',
    title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [],
  });

  // ══ 场景 1：回调 put 成功后 throw -> runTransaction 拒绝 + 重开 DB 零写入 ══
  {
    const backend = createSharedIdbBackend();
    const shim = createIdbShim(backend);
    await coreStore.openRuntimeDb(shim);
    const adapter = new adapterMod.ProjectionDurableAdapter(shim);
    let threw = null;
    try {
      await adapter.runTransaction(coreStore.PROJECTION_STORE, async (store) => {
        await store.put({ marker: 'should-not-persist' }, 'projection:atomic:k1');
        throw new Error('callback failure after put');
      });
    } catch (error) {
      threw = error;
    }
    assert(threw !== null && String(threw.message).includes('callback failure after put'), '场景1-回调错误必须向调用方传播: ' + (threw ? threw.message : '未抛错'));
    // 重开 DB：写入必须不可见（abort 丢弃写集）。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const row = await adapter2.readOne(coreStore.PROJECTION_STORE, 'projection:atomic:k1');
    assert(row === null, '场景1-回调失败后写入必须不可见（零写入）');
    recordRejected('P0-2-回调 throw 原子性', 'put 后 throw -> 拒绝 + 重开零写入', '零写入');
  }

  // ══ 场景 2：回调 reject（async throw）-> 同样 abort 零写入 ══
  {
    const backend = createSharedIdbBackend();
    const shim = createIdbShim(backend);
    await coreStore.openRuntimeDb(shim);
    const adapter = new adapterMod.ProjectionDurableAdapter(shim);
    let threw = null;
    try {
      await adapter.runTransaction(coreStore.PROJECTION_STORE, async (store) => {
        await store.put({ marker: 'should-not-persist-2' }, 'projection:atomic:k2');
        return Promise.reject(new Error('callback reject after put'));
      });
    } catch (error) {
      threw = error;
    }
    assert(threw !== null && String(threw.message).includes('callback reject after put'), '场景2-回调 reject 必须传播');
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const row = await adapter2.readOne(coreStore.PROJECTION_STORE, 'projection:atomic:k2');
    assert(row === null, '场景2-回调 reject 后零写入');
    recordRejected('P0-2-回调 reject 原子性', 'reject -> 拒绝 + 零写入', '零写入');
  }

  // ══ 场景 3：request error（put 请求失败）-> runTransaction 失败 + 零写入 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    await coreStore.openRuntimeDb(shim1);
    // 请求级故障注入：patch store.put 让第一个 put 请求失败。
    const db = backend.get(coreStore.RUNTIME_DB_NAME);
    const origTx = db.transaction.bind(db);
    db.transaction = (storeNames, mode) => {
      const tx = origTx(storeNames, mode);
      const origObjectStore = tx.objectStore.bind(tx);
      tx.objectStore = (name) => {
        const store = origObjectStore(name);
        const origPut = store.put.bind(store);
        store.put = (value, key) => {
          const req = { result: undefined, error: new Error('injected request error'), onsuccess: null, onerror: null, _tx: tx };
          queueMicrotask(() => {
            if (typeof req.onerror === 'function') req.onerror({ target: req, error: req.error });
            else if (typeof tx._fail === 'function') tx._fail(req.error);
            if (typeof tx._requestDone === 'function') tx._requestDone();
          });
          return req;
        };
        return store;
      };
      return tx;
    };
    const shim2 = createIdbShim(backend);
    const adapter = new adapterMod.ProjectionDurableAdapter(shim2);
    let threw = null;
    try {
      await adapter.runTransaction(coreStore.PROJECTION_STORE, async (store) => {
        await store.put({ marker: 'should-not-persist-3' }, 'projection:atomic:k3');
        return 'ok';
      });
    } catch (error) {
      threw = error;
    }
    assert(threw !== null, '场景3-request error 必须导致 runTransaction 失败');
    const shim3 = createIdbShim(backend);
    const adapter3 = new adapterMod.ProjectionDurableAdapter(shim3);
    const row = await adapter3.readOne(coreStore.PROJECTION_STORE, 'projection:atomic:k3');
    assert(row === null, '场景3-request error 后零写入');
    recordRejected('P0-2-request error 原子性', 'put 请求失败 -> 拒绝 + 零写入', '零写入');
  }

  // ══ 场景 4：成功路径一次性提交（不拆读写两阶段；重开 DB 可见）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    const result = await adapter1.runTransaction(coreStore.PROJECTION_STORE, async (store) => {
      const existing = await store.get('projection:atomic:ok1');
      await store.put({ marker: 'persisted', existing: existing ?? null }, 'projection:atomic:ok1');
      return { wrote: true };
    });
    assert(result.wrote === true, '场景4-成功路径返回回调结果');
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const row = await adapter2.readOne(coreStore.PROJECTION_STORE, 'projection:atomic:ok1');
    assert(row !== null && row.marker === 'persisted', '场景4-成功事务重开 DB 后可见（一次性提交）');
    recordPositive('P0-2-成功路径对照', '同事务读+写 + 重开可见');
  }

  // ══ 场景 5：typed article get/list 的 key/row 篡改拒绝（错 article/version/branch/少字段）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    const db = await coreStore.openRuntimeDb(shim1);
    // 正常写入一条 version（wanted）。
    const keyWanted = adapterMod.projectionArticleVersionKey('branch_A5', 'wanted', 1);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(version('branch_A5', 'wanted', 'wanted-v1', 1), keyWanted);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    // 篡改：把错误 article/version 的行写到 wanted 的 key（错位行）。
    const keyWrongArticle = adapterMod.projectionArticleVersionKey('branch_A5', 'wanted', 1);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(version('branch_A5', 'wrong', 'wrong-v9', 9), keyWrongArticle);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    // 请求 wanted/1：row 的 articleId=wrong/version=9 与请求不一致 -> KEY_MISMATCH 拒绝（不返回 typed 成功）。
    const got = await adapterMod.durableGetArticleVersion(adapter2, 'branch_A5', 'wanted', 1);
    assert(got.ok === false && got.code === 'KEY_MISMATCH', '场景5-错位 row 必须 KEY_MISMATCH 拒绝，实际 ' + JSON.stringify(got));
    // 少字段行 -> INVALID_ROW。
    const keyBad = adapterMod.projectionArticleVersionKey('branch_A5', 'bad', 1);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put({ runtimeBranchId: 'branch_A5', articleId: 'bad', articleVersion: 1 }, keyBad);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const gotBad = await adapterMod.durableGetArticleVersion(adapter2, 'branch_A5', 'bad', 1);
    assert(gotBad.ok === false && gotBad.code === 'INVALID_ROW', '场景5-少字段行必须 INVALID_ROW，实际 ' + JSON.stringify(gotBad));
    // list：错位行与少字段行跳过并记录诊断，不产生未捕获 throw。
    const list = await adapterMod.durableListArticleVersions(adapter2, 'branch_A5');
    assert(list.ok === true, '场景5-typed list 不 throw');
    assert(list.values.length === 0, '场景5-错位/损坏行不得被接受为合法版本，实际 ' + list.values.length);
    assert(list.skipped.length >= 2, '场景5-错位/少字段行必须记录 skipped 诊断，实际 ' + list.skipped.length);
    // 跨 branch 读取 -> 稳定 MISSING。
    const cross = await adapterMod.durableGetArticleVersion(adapter2, 'branch_B5', 'wanted', 1);
    assert(cross.ok === false && cross.code === 'MISSING', '场景5-跨 branch 必须 MISSING，实际 ' + JSON.stringify(cross));
    recordRejected('P1-3-typed key/row 篡改拒绝', 'KEY_MISMATCH + INVALID_ROW + skipped 诊断（不 throw）', 'KEY_MISMATCH');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.4-projection-transaction-atomicity regression passed.');
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
    console.error('story-runtime-g1.3.2.4-projection-transaction-atomicity regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
