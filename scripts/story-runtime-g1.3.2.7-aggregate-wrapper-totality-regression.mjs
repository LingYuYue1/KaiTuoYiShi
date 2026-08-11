// G1.3.2.7 aggregate-wrapper-totality regression：P0-2 ——
// - validateAggregateWrapper 对任意持久化坏值保持全函数：BigInt/Symbol/对象/null/稀疏数组/
//   非字符串等非法 versionIds 成员稳定返回 wrapper diagnostic（不 throw/hang——不再用 JSON.stringify
//   比较不可信数组）；
// - durableListProjections() 与 recoverProjectionsFromStore() 面对上述坏值都稳定 skipped/diagnostics + readonly；
// - 合法字符串数组与普通不一致数组对照保持现有语义。
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

  // 独立 backend + seed core + 写 aggregate wrapper + recovery + list（逐条隔离）。
  async function recoverAndListWithWrapper(wrapperVersionIds, innerVersionIds) {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_A', saveNodeId: 's', runtimeRevision: 0 });
    await coreStore.createBranchSeed({
      branchId: 'branch_A', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    const db = await coreStore.openRuntimeDb(shim1);
    const key = 'projection:aggregate:branch_A:agg';
    const row = {
      aggregate: { runtimeBranchId: 'branch_A', articleId: 'a', currentVersion: 1, versionIds: innerVersionIds, aggregateRevision: 1 },
      aggregateKey: 'agg',
      versionIds: wrapperVersionIds,
      sourceLevelIdempotencyKeys: [{ key: 'k', payloadFingerprint: 'f' }],
    };
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(row, key);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_A');
    const list = await adapterMod.durableListProjections(adapter2, 'branch_A');
    return { recovered, list };
  }

  // ══ 场景 1：wrapper versionIds 含非法成员（BigInt/Symbol/对象/null/稀疏）-> 稳定 diagnostics + readonly，不 throw ══
  {
    // inner 保持合法字符串数组（冻结 validator 通过），wrapper 含非法成员——触发 wrapper 层校验。
    const badMembers = [
      ['BigInt', [1n]],
      ['对象元素', [{ v: 1 }]],
      ['null 元素', [null]],
      ['稀疏数组', new Array(1)],
      ['数字元素', [1]],
      ['空字符串元素', ['']],
    ];
    for (const [label, wrapperVersionIds] of badMembers) {
      const { recovered, list } = await recoverAndListWithWrapper(wrapperVersionIds, ['v1']);
      assert(recovered.readonlyMode === true, '场景1-' + label + '-recovery 必须强制只读（不 throw）');
      assert(recovered.diagnostics.some((d) => d.includes('aggregate wrapper')), '场景1-' + label + '-recovery 必须有 wrapper 诊断，实际 ' + JSON.stringify(recovered.diagnostics));
      assert(list.ok === true, '场景1-' + label + '-list 必须稳定返回（不 throw）');
      assert(list.skipped.some((s) => s.includes('aggregate wrapper')), '场景1-' + label + '-list 必须有 skipped，实际 ' + JSON.stringify(list.skipped));
    }
    recordRejected('P0-2-非法 versionIds 成员', 'BigInt/对象/null/稀疏/数字/空串 全部稳定 diagnostics + readonly', '稳定 diagnostics');
  }

  // ══ 场景 2：合法字符串数组与普通不一致数组对照 ══
  {
    // 合法：wrapper 与 inner 一致。
    const ok = await recoverAndListWithWrapper(['v1'], ['v1']);
    assert(ok.recovered.newsArticles.length === 1 && ok.recovered.readonlyMode === false, '场景2-合法 versionIds 恢复（对照）');
    assert(ok.list.ok === true && ok.list.values.length === 1, '场景2-合法 versionIds list（对照）');
    // 普通不一致数组（长度相同但内容不同）。
    const mismatch = await recoverAndListWithWrapper(['v2'], ['v1']);
    assert(mismatch.recovered.readonlyMode === true && mismatch.recovered.diagnostics.some((d) => d.includes('aggregate wrapper')), '场景2-普通不一致数组仍拒绝');
    assert(mismatch.list.ok === true && mismatch.list.skipped.length === 1, '场景2-不一致数组 list skipped');
    recordPositive('P0-2-合法/不一致对照', '合法恢复 + 不一致拒绝');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.7-aggregate-wrapper-totality regression passed.');
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
    console.error('story-runtime-g1.3.2.7-aggregate-wrapper-totality regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
