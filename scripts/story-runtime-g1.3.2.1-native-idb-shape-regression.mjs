// G1.3.2.1 native-idb-shape regression：P0-1 —— 真实浏览器 DOMStringList 形状下首次建库必须成功且建齐六个 store。
// 生产模块经 esbuild 执行；探针 objectStoreNames 只提供 length/item/contains（DOMStringList 标准形状，无 includes）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';

const FROZEN_HASHES = {
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
  'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
  'services/storyRuntime/storyAssetCatalogStore.ts': '0a33d63dac6cbe8bb5c49813c68e3f91cab4bb88fce1fc0e6d2083ba2ecc0819',
};

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }

/** 真实 DOMStringList 形状：只提供 length/item/contains，没有 includes。 */
function makeDomStringListShape(initial = []) {
  const items = [...initial];
  return {
    get length() { return items.length; },
    item(index) { return items[index] ?? null; },
    contains(name) { return items.includes(name); },
  };
}

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

  // ══ 场景 1：DOMStringList 形状（只有 contains）首次建库 -> 建齐六个 store，不抛异常 ══
  {
    const created = [];
    const db = {
      objectStoreNames: makeDomStringListShape([]),
      createObjectStore(name) { created.push(name); return { name }; },
    };
    coreStore.createRuntimeStores(db);
    assert(created.length === 6, '场景1-DOMStringList 形状必须建齐六个 store，实际 ' + created.length);
    for (const store of [coreStore.POINTER_STORE, coreStore.CORE_STORE, coreStore.OUTBOX_STORE, coreStore.CHECKPOINT_STORE, coreStore.PROJECTION_STORE, coreStore.MIGRATION_STORE]) {
      assert(created.includes(store), '场景1-缺少 store: ' + store);
    }
    recordPositive('场景1-DOMStringList 首次建库', '6 stores: ' + created.join(','));
  }

  // ══ 场景 2：DOMStringList 已含部分 store 时幂等（不重复创建）══
  {
    const created = [];
    const db = {
      objectStoreNames: makeDomStringListShape([coreStore.POINTER_STORE, coreStore.CORE_STORE]),
      createObjectStore(name) { created.push(name); return { name }; },
    };
    coreStore.createRuntimeStores(db);
    assert(created.length === 4, '场景2-已存在 2 个 store 时只创建其余 4 个，实际 ' + created.length);
    assert(!created.includes(coreStore.POINTER_STORE) && !created.includes(coreStore.CORE_STORE), '场景2-不重复创建已存在 store');
    recordPositive('场景2-DOMStringList 幂等', '仅补建 4 个');
  }

  // ══ 场景 3：数组形状（只有 includes，无 contains）兼容回归仍保留 ══
  {
    const created = [];
    const db = {
      objectStoreNames: [],
      createObjectStore(name) { created.push(name); return { name }; },
    };
    coreStore.createRuntimeStores(db);
    assert(created.length === 6, '场景3-数组形状必须建齐六个 store，实际 ' + created.length);
    recordPositive('场景3-数组形状兼容回归', '6 stores');
  }

  // ══ 场景 4：DOMStringList 形状通过 openRuntimeDb 升级钩子真实建库（shim 使用 DOMStringList-like objectStoreNames）══
  {
    // 用带 DOMStringList 形状的 shim 打开 DB，确认升级钩子真实执行。
    const { createIdbShim } = await import('./story-runtime-idb-shim.mjs');
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    assert(db.objectStoreNames.length === 6, '场景4-打开 DB 后 objectStoreNames 长度 6，实际 ' + db.objectStoreNames.length);
    for (const store of [coreStore.POINTER_STORE, coreStore.CORE_STORE, coreStore.OUTBOX_STORE, coreStore.CHECKPOINT_STORE, coreStore.PROJECTION_STORE, coreStore.MIGRATION_STORE]) {
      assert(db.objectStoreNames.includes(store), '场景4-缺 store: ' + store);
    }
    recordPositive('场景4-openRuntimeDb 真实建库', '6 stores 可见');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.1-native-idb-shape regression passed.');
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
    console.error('story-runtime-g1.3.2.1-native-idb-shape regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
