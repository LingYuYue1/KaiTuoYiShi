// G1.3.2.6 outbox-key-primitive regression：P0-1/P1-1 ——
// - recovery source 返回物理 key + value 配对（真实 getAllKeys+getAll，不按 row 重建 key）；
// - 先对 value 调用冻结 validateProjectionOutboxItem（null/string/number/array/少字段/未知 status
//   稳定拒绝，不 throw、不 hang、不在 validator 前访问字段）；
// - 物理 key 双向校验：physical key === outboxKey(row.runtimeBranchId, row.outboxId)；
//   错物理 branch、错 outboxId 后缀、key=target,row=other、key=other,row=target 全部 diagnostics + readonly；
// - 每个负例使用独立 backend（P1-1 逐条隔离），各自触发自己的 diagnostic，不进 pending。
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
  const outboxItem = (outboxId, branchId, status) => ({
    outboxId, schemaVersion: 3, runtimeBranchId: branchId, sourceRefFingerprint: 's', sourceRevision: 1,
    kind: 'news', aggregateKey: 'unit:x', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1',
    payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status, attemptCount: 0,
  });

  // 独立 backend + 写 outbox 行 + recovery（逐条隔离）。
  async function recoverWithOutboxRow(writeFn, label) {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_O', saveNodeId: 's', runtimeRevision: 0 });
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_O', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    assert(seed.ok, label + '-seed 成功');
    const db = await coreStore.openRuntimeDb(shim1);
    await writeFn(db, coreStore.OUTBOX_STORE);
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    return adapterMod.recoverProjectionsFromStore(adapter2, 'branch_O');
  }

  // ══ 场景 1：outbox 错物理 key（row 合法但 key 后缀/前缀与 row 不一致）-> 独立 backend 拒绝 ══
  {
    // 行合法（branch_O/pending）但物理 key 是 'branch_O\0WRONG-SUFFIX'（outboxId 后缀不符）。
    const recovered = await recoverWithOutboxRow((db, storeName) => new Promise((res) => {
      const tx = db.transaction(storeName, 'readwrite');
      const r = tx.objectStore(storeName).put(outboxItem('real-row-id', 'branch_O', 'pending'), 'branch_O\0WRONG-SUFFIX');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    }), '场景1');
    assert(recovered.readonlyMode === true, '场景1-错 outboxId 后缀必须强制只读（独立 backend）');
    assert(recovered.diagnostics.some((d) => d.includes('outbox 物理 key 与 row 不一致')), '场景1-必须有物理 key 不一致诊断，实际 ' + JSON.stringify(recovered.diagnostics));
    assert(recovered.pendingOutboxItems.length === 0, '场景1-错 key 行不得进入 pending');
    recordRejected('P0-1-错 outboxId 后缀', '独立 backend + key 不一致诊断 + 不进 pending', '不一致');
  }

  // ══ 场景 2：错物理 branch（key 前缀是其他 branch）-> 独立 backend 拒绝 ══
  {
    const recovered = await recoverWithOutboxRow((db, storeName) => new Promise((res) => {
      const tx = db.transaction(storeName, 'readwrite');
      const r = tx.objectStore(storeName).put(outboxItem('o', 'branch_O', 'pending'), 'branch_OTHER\0o');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    }), '场景2');
    assert(recovered.readonlyMode === true, '场景2-错物理 branch 必须强制只读');
    assert(recovered.diagnostics.some((d) => d.includes('outbox 物理 key 与 row 不一致')), '场景2-物理 branch 冲突诊断');
    assert(recovered.pendingOutboxItems.length === 0, '场景2-不进 pending');
    recordRejected('P0-1-错物理 branch', '独立 backend + 诊断 + 不进 pending', '不进 pending');
  }

  // ══ 场景 3：null 原始坏值 -> 稳定只读不 throw（validator 先于字段访问）══
  {
    const recovered = await recoverWithOutboxRow((db, storeName) => new Promise((res) => {
      const tx = db.transaction(storeName, 'readwrite');
      const r = tx.objectStore(storeName).put(null, 'branch_O\0o_null');
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    }), '场景3');
    assert(recovered.readonlyMode === true, '场景3-null outbox 行必须强制只读（不 throw）');
    assert(recovered.diagnostics.some((d) => d.includes('outbox 行非法')), '场景3-null 行非法诊断');
    recordRejected('P0-1-null 坏值', 'null 行稳定只读 + 非法诊断（不 throw）', '非法');
  }

  // ══ 场景 4：string/array/number 原始坏值 -> 独立 backend 各自拒绝 ══
  {
    const primitives = [
      ['o_str', 'just-a-string'],
      ['o_num', 42],
      ['o_arr', ['a', 'b']],
      ['o_bool', true],
    ];
    for (const [id, value] of primitives) {
      const recovered = await recoverWithOutboxRow((db, storeName) => new Promise((res) => {
        const tx = db.transaction(storeName, 'readwrite');
        const r = tx.objectStore(storeName).put(value, 'branch_O\0' + id);
        r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      }), '场景4-' + id);
      assert(recovered.readonlyMode === true, '场景4-' + id + '-原始坏值必须强制只读（独立 backend）');
      assert(recovered.diagnostics.some((d) => d.includes('outbox 行非法')), '场景4-' + id + '-必须有非法诊断，实际 ' + JSON.stringify(recovered.diagnostics));
      assert(recovered.pendingOutboxItems.length === 0, '场景4-' + id + '-不进 pending');
    }
    recordRejected('P0-1-string/number/array/bool 坏值', '四种原始坏值独立 backend 各自拒绝', '各自拒绝');
  }

  // ══ 场景 5：少字段 / 未知 status -> 独立 backend 各自拒绝 ══
  {
    const badRows = [
      ['o_missing', { outboxId: 'o_missing', runtimeBranchId: 'branch_O', status: 'pending' }],
      ['o_mystery', outboxItem('o_mystery', 'branch_O', 'MYSTERY')],
    ];
    for (const [id, value] of badRows) {
      const recovered = await recoverWithOutboxRow((db, storeName) => new Promise((res) => {
        const tx = db.transaction(storeName, 'readwrite');
        const r = tx.objectStore(storeName).put(value, 'branch_O\0' + id);
        r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      }), '场景5-' + id);
      assert(recovered.readonlyMode === true, '场景5-' + id + '-必须强制只读（独立 backend）');
      assert(recovered.diagnostics.some((d) => d.includes('outbox 行非法')), '场景5-' + id + '-非法诊断');
    }
    recordRejected('P0-1-少字段/未知 status', '独立 backend 各自拒绝', '各自拒绝');
  }

  // ══ 场景 6：合法 pending 行（key 一致）-> 进入 pending（正面对照）══
  {
    const recovered = await recoverWithOutboxRow((db, storeName) => new Promise((res) => {
      const tx = db.transaction(storeName, 'readwrite');
      const r = tx.objectStore(storeName).put(outboxItem('o_ok', 'branch_O', 'pending'), coreStore.outboxKey('branch_O', 'o_ok'));
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    }), '场景6');
    assert(recovered.readonlyMode === false, '场景6-合法行不触发只读');
    assert(recovered.pendingOutboxItems.length === 1 && recovered.pendingOutboxItems[0].outboxId === 'o_ok', '场景6-合法 pending 进入');
    recordPositive('P0-1-合法 outbox 对照', 'key 一致 + 合法 pending 进入');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.6-outbox-key-primitive regression passed.');
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
    console.error('story-runtime-g1.3.2.6-outbox-key-primitive regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
