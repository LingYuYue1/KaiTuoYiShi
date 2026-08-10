// G1.3.2.7 paired-read-mismatch regression：P1-1 ——
// - 真实 fault injection：patch 测试专用 wrapper 让同一 readonly transaction 的 getAllKeys() 与 getAll()
//   返回不同长度（不是正常 Map 条目、不是静态源码断言、不是"实现里有 length check"）；
// - projection entries 与 outbox entries 两条读取路径分别独立测试；
// - 两条路径都稳定拒绝并形成对应 typed error/diagnostic + readonly，不把 undefined/null key 字符串化配对；
// - fault injection 只放在新专项，不修改冻结 IDB shim 的生产语义。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim。
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

  /**
   * 真实 fault injection：patch 共享 backend 中 DB 实例的 transaction——对指定 store 的 getAllKeys
   * 先取真实结果再 pop 掉最后一个 key（与 getAll 长度不一致），通过自定义 request 返回。
   * 不修改 shim 源码（生产语义不变）。
   */
  function makeMismatchedShim(backend, storeName) {
    const shim = createIdbShim(backend);
    const db = backend.get(coreStore.RUNTIME_DB_NAME);
    if (db) {
      const origTx = db.transaction.bind(db);
      db.transaction = (names, mode) => {
        const tx = origTx(names, mode);
        const namesArr = Array.isArray(names) ? names : [names];
        if (namesArr.includes(storeName)) {
          const origOS = tx.objectStore.bind(tx);
          tx.objectStore = (name) => {
            const store = origOS(name);
            if (name === storeName) {
              const origGetAllKeys = store.getAllKeys.bind(store);
              store.getAllKeys = () => {
                // 自定义 request：真实 getAllKeys 结果去掉最后一个 key 后返回（长度不一致）。
                const req = { result: undefined, error: null, onsuccess: null, onerror: null, _tx: null };
                const realReq = origGetAllKeys();
                realReq.onsuccess = () => {
                  const arr = Array.isArray(realReq.result) ? [...realReq.result] : [];
                  arr.pop(); // 真实制造 keys/values 长度不一致
                  req.result = arr;
                  if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
                };
                return req;
              };
            }
            return store;
          };
        }
        return tx;
      };
    }
    return shim;
  }

  // ══ 场景 1：projection entries keys/values 数量不一致 -> adapter.entries() 稳定拒绝 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    // 写两条正常记录（让 keys/values 都有 2 条）。
    for (const k of ['projection:article:branch_P:a:1', 'projection:article:branch_P:b:1']) {
      await new Promise((res) => {
        const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
        const r = tx.objectStore(coreStore.PROJECTION_STORE).put({ x: 1 }, k);
        r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      });
    }
    const mismatchedShim = makeMismatchedShim(backend, coreStore.PROJECTION_STORE);
    const adapter = new adapterMod.ProjectionDurableAdapter(mismatchedShim);
    let threw = null;
    try {
      await adapter.entries();
    } catch (error) {
      threw = error;
    }
    assert(threw !== null && String(threw.message).includes('keys/values 数量不一致'), '场景1-projection entries 数量不一致必须稳定拒绝，实际 ' + (threw ? threw.message : '未抛错'));
    // recovery 也走 listProjectionEntries：稳定 diagnostics + readonly。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const source = adapterMod.createIdbRecoverySource(mismatchedShim);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_P', source);
    assert(recovered.readonlyMode === true, '场景1-recovery 数量不一致必须强制只读');
    assert(recovered.diagnostics.some((d) => d.includes('读取 projection entries 失败')), '场景1-recovery 诊断，实际 ' + JSON.stringify(recovered.diagnostics));
    recordRejected('P1-1-projection 数量不一致 fault injection', '真实 pop key + entries/recovery 稳定拒绝', '稳定拒绝');
  }

  // ══ 场景 2：outbox entries keys/values 数量不一致 -> recovery 稳定拒绝 + readonly ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_O', saveNodeId: 's', runtimeRevision: 0 });
    await coreStore.createBranchSeed({
      branchId: 'branch_O', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    const db = await coreStore.openRuntimeDb(shim1);
    // 写两条正常 outbox 记录。
    for (const id of ['o1', 'o2']) {
      await new Promise((res) => {
        const tx = db.transaction(coreStore.OUTBOX_STORE, 'readwrite');
        const r = tx.objectStore(coreStore.OUTBOX_STORE).put({ outboxId: id, runtimeBranchId: 'branch_O' }, coreStore.outboxKey('branch_O', id));
        r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      });
    }
    const mismatchedShim = makeMismatchedShim(backend, coreStore.OUTBOX_STORE);
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const source = adapterMod.createIdbRecoverySource(mismatchedShim);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_O', source);
    assert(recovered.readonlyMode === true, '场景2-outbox 数量不一致必须强制只读');
    assert(recovered.diagnostics.some((d) => d.includes('读取 outbox 失败')), '场景2-outbox 诊断，实际 ' + JSON.stringify(recovered.diagnostics));
    assert(recovered.pendingOutboxItems.length === 0, '场景2-数量不一致时不得把部分配对当 pending');
    recordRejected('P1-1-outbox 数量不一致 fault injection', '真实 pop key + recovery 稳定拒绝 + 只读', '稳定拒绝');
  }

  // ══ 场景 3：未注入时正常配对仍可用（对照，fault injection 只影响注入路径）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put({ x: 1 }, 'projection:article:branch_P:a:1');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const entries = await adapter2.entries();
    assert(entries.length === 1, '场景3-未注入正常配对可用');
    recordPositive('P1-1-正常配对对照', '未注入 entries 正常');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.7-paired-read-mismatch regression passed.');
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
    console.error('story-runtime-g1.3.2.7-paired-read-mismatch regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
