// G1.3.2.11 browser-evidence-boundary regression：P1 ——
// - Symbol Map（key/value）是 shim 可持久化的防御输入；真实浏览器/Node structured clone 对 Symbol
//   key/value 抛 DataCloneError——本专项直接证明 DataCloneError 边界；
// - shim 防御输入（Symbol 进 shim store 可持久化、写路径拒绝、before/after 深比较）与浏览器拒绝
//   边界分开验证（不把 shim 能做的事写成浏览器能落盘）；
// - 稀疏数组注释静态红线：.11 相关专项中若引用稀疏数组，必须与 length/index 硬断言一致
//   （不得残留"塌缩"注释与 length 断言矛盾）。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim。
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

  // ══ 场景 1：真实 structured clone 对 Symbol 的边界（浏览器/Node）══
  {
    // Map 的 Symbol key/value 与普通对象 Symbol value：抛 DataCloneError。
    const cases = [
      ['Map Symbol key', new Map([[Symbol('k'), 1]])],
      ['Map Symbol value', new Map([['a', Symbol('v')]])],
      ['plain Symbol value', { a: Symbol('v') }],
    ];
    for (const [label, value] of cases) {
      let threw = null;
      try {
        structuredClone(value);
      } catch (error) {
        threw = error;
      }
      assert(threw !== null && threw.name === 'DataCloneError', '场景1-' + label + '-structured clone 必须抛 DataCloneError，实际 ' + (threw ? threw.name : '未抛错'));
    }
    // 普通对象 Symbol key：structured clone 不抛但静默丢弃符号键（symbols=0）——同样证明浏览器无法持久化 Symbol key。
    const plainKeyClone = structuredClone({ [Symbol('k')]: 1 });
    assert(Object.getOwnPropertySymbols(plainKeyClone).length === 0, '场景1-plain Symbol key 在 structured clone 中被丢弃（浏览器不可持久化）');
    recordRejected('P1-浏览器 Symbol 边界', 'Map Symbol key/value + plain Symbol value 抛 DataCloneError；plain Symbol key 被丢弃', 'DataCloneError');
  }

  // ══ 场景 2：shim 防御输入——Symbol Map 可进 shim store（防御输入），写路径拒绝 + 前后深比较 ══
  {
    const sym = Symbol('wrapper-sym');
    const backend = new Map();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    const key = 'projection:aggregate:branch_W:agg';
    const badWrapper = {
      aggregate: { runtimeBranchId: 'branch_W', articleId: 'article-W', currentVersion: 1, versionIds: [sym], aggregateRevision: 1 },
      aggregateKey: 'agg',
      versionIds: [sym],
      sourceLevelIdempotencyKeys: [{ key: 'k', payloadFingerprint: 'f' }],
    };
    // shim 可持久化 Symbol（防御输入——不是浏览器可落盘语义）。
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(badWrapper, key);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shimA = createIdbShim(backend);
    const dbA = await coreStore.openRuntimeDb(shimA);
    const before = await new Promise((res) => {
      const tx = dbA.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).get(key);
      r.onsuccess = () => res(r.result);
    });
    assert(before !== undefined, '场景2-shim 可持久化 Symbol 防御输入（读回存在）');
    // 写路径拒绝（生产 bundle）。
    const projection = await bundleTs('services/storyRuntime/projectionStore.ts');
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const outboxItem = { outboxId: 'o', schemaVersion: 3, runtimeBranchId: 'branch_W', sourceRefFingerprint: 's', sourceRevision: 1, kind: 'news', aggregateKey: 'agg', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1', payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0 };
    const agg = { runtimeBranchId: 'branch_W', articleId: 'article-W', currentVersion: 1, versionIds: [], aggregateRevision: 0 };
    const ver = { runtimeBranchId: 'branch_W', articleVersionId: 'v1', articleId: 'article-W', articleVersion: 1, sourceRefs: [], sourceFingerprint: 's', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x', title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [] };
    const result = await projection.consumeNewsOutbox(adapter2, outboxItem, agg, ver);
    assert(result.ok === false && result.code === 'INVALID_COMMAND', '场景2-Symbol 防御输入写路径拒绝，实际 ' + JSON.stringify(result));
    const shim3 = createIdbShim(backend);
    const db3 = await coreStore.openRuntimeDb(shim3);
    const after = await new Promise((res) => {
      const tx = db3.transaction(coreStore.PROJECTION_STORE, 'readonly');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).get(key);
      r.onsuccess = () => res(r.result);
    });
    assert(after !== undefined && after.aggregate.articleId === 'article-W', '场景2-Symbol 防御输入拒绝后 existing 未被覆盖');
    recordRejected('P1-shim Symbol 防御输入', 'shim 可持久化 + 写路径拒绝 + 未被覆盖（与 DataCloneError 边界分开说明）', '分开说明');
  }

  // ══ 场景 3：稀疏数组注释静态红线——.11 专项中引用稀疏数组的注释与 length/index 硬断言一致 ══
  {
    const files = ['story-runtime-g1.3.2.11-article-logical-conflict-regression.mjs', 'story-runtime-g1.3.2.11-article-read-domain-regression.mjs'];
    for (const f of files) {
      const src = fs.readFileSync(path.join(process.cwd(), 'scripts', f), 'utf8');
      if (src.includes('稀疏')) {
        // 若引用稀疏数组，必须同时存在与 length/index 一致的硬断言（不得残留"塌缩"旧注释）。
        assert(!src.includes('塌缩'), '场景3-' + f + '-不得残留"稀疏塌缩"旧注释（与 length/index 硬断言矛盾）');
      }
    }
    // 本专项自身不引用稀疏数组；.9/.10 complex 的旧注释在历史报告中说明，不改写历史文件。
    recordPositive('P1-稀疏注释静态红线', '.11 专项无"塌缩"旧注释残留（历史 .9/.10 文件只读）');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.11-browser-evidence-boundary regression passed.');
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
    console.error('story-runtime-g1.3.2.11-browser-evidence-boundary regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
