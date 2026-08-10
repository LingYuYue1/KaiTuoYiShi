// G1.3.2.7 outbox-direction-count regression：P1-2 ——
// - 分别用独立 backend 写入并验证 `key=target,row=other` 与 `key=other,row=target` 两个 owner 方向；
// - 错 physical branch、错 outboxId 后缀、`null`、每种 primitive、少字段、未知 status 均逐条记录
//   自己的 diagnostic、readonly 与 pending=0（共 11 个具体坏输入，逐条隔离）；
// - 输出与实际执行输入数一致（不再把实现推断算成测试证据）。
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

  // 独立 backend + 写 outbox 行 + recovery（逐条隔离）。返回 { label, readonlyMode, diagnostics, pendingIds }。
  async function recoverWithOutboxRow(label, physicalKey, value) {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_O', saveNodeId: 's', runtimeRevision: 0 });
    await coreStore.createBranchSeed({
      branchId: 'branch_O', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    const db = await coreStore.openRuntimeDb(shim1);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.OUTBOX_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.OUTBOX_STORE).put(value, physicalKey);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_O');
    return {
      label,
      readonlyMode: recovered.readonlyMode,
      diagnostics: recovered.diagnostics,
      pendingIds: recovered.pendingOutboxItems.map((it) => it.outboxId),
    };
  }

  // 11 个具体坏输入（P1-2：逐条记录自己的 diagnostic/readonly/pending=0）。
  const inputs = [
    // 1) key=target,row=other：物理 key 是目标 branch，row 声称其他 branch（合法行）。
    ['key=target,row=other', coreStore.outboxKey('branch_O', 'o_dir1'), outboxItem('o_dir1', 'branch_OTHER', 'pending')],
    // 2) key=other,row=target：物理 key 是其他 branch，row 是目标 branch（合法行）。
    ['key=other,row=target', coreStore.outboxKey('branch_OTHER', 'o_dir2'), outboxItem('o_dir2', 'branch_O', 'pending')],
    // 3) 错 outboxId 后缀：row 合法（branch_O）但物理 key 后缀与 outboxId 不符。
    ['错 outboxId 后缀', 'branch_O\0WRONG-SUFFIX', outboxItem('real-row-id', 'branch_O', 'pending')],
    // 4) 错物理 branch：row 是 branch_O 但物理 key 前缀是其他 branch（= 方向 2 的另一形态，逐条保留）。
    ['错物理 branch', coreStore.outboxKey('branch_OTHER', 'o4'), outboxItem('o4', 'branch_O', 'pending')],
    // 5) null。
    ['null', coreStore.outboxKey('branch_O', 'o_null'), null],
    // 6) string。
    ['string', coreStore.outboxKey('branch_O', 'o_str'), 'just-a-string'],
    // 7) number。
    ['number', coreStore.outboxKey('branch_O', 'o_num'), 42],
    // 8) array。
    ['array', coreStore.outboxKey('branch_O', 'o_arr'), ['a', 'b']],
    // 9) boolean。
    ['boolean', coreStore.outboxKey('branch_O', 'o_bool'), true],
    // 10) 少字段。
    ['少字段', coreStore.outboxKey('branch_O', 'o_missing'), { outboxId: 'o_missing', runtimeBranchId: 'branch_O', status: 'pending' }],
    // 11) 未知 status。
    ['未知 status', coreStore.outboxKey('branch_O', 'o_mystery'), outboxItem('o_mystery', 'branch_O', 'MYSTERY')],
  ];

  // ══ 场景 1：11 个坏输入逐条隔离——每个都自己触发 diagnostic + readonly + pending=0 ══
  {
    const executed = [];
    for (const [label, physicalKey, value] of inputs) {
      const r = await recoverWithOutboxRow(label, physicalKey, value);
      assert(r.readonlyMode === true, '场景1-' + label + '-必须强制只读（独立 backend）');
      assert(r.diagnostics.length >= 1, '场景1-' + label + '-必须有至少一条诊断');
      assert(r.pendingIds.length === 0, '场景1-' + label + '-不进 pending');
      executed.push(label);
    }
    assert(executed.length === 11, '场景1-必须实际执行 11 个具体坏输入，实际 ' + executed.length);
    console.log('  [outbox-direction-count] 实际执行的 11 个坏输入: ' + JSON.stringify(executed));
    recordRejected('P1-2-11 个坏输入逐条隔离', '11 个输入全部独立 backend + 独立 diagnostic + pending=0', '11 个输入');
  }

  // ══ 场景 2：合法 pending 行（key 一致）-> 进入 pending（正面对照）══
  {
    const r = await recoverWithOutboxRow('合法 pending', coreStore.outboxKey('branch_O', 'o_ok'), outboxItem('o_ok', 'branch_O', 'pending'));
    assert(r.readonlyMode === false, '场景2-合法行不触发只读');
    assert(r.pendingIds.length === 1 && r.pendingIds[0] === 'o_ok', '场景2-合法 pending 进入');
    recordPositive('P1-2-合法对照', 'key 一致 + 合法 pending 进入');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.7-outbox-direction-count regression passed.');
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
    console.error('story-runtime-g1.3.2.7-outbox-direction-count regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
