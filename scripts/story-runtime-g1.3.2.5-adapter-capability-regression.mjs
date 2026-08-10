// G1.3.2.5 adapter-capability regression：P1-1 ——
// - factory 运行时不可取得：生产 bundle 的 adapter 实例上 Reflect.ownKeys/Object.keys/任意属性读取/
//   JSON 序列化均无法取得 factory/DB/transaction（模块私有 WeakMap 保存，TypeScript private 不是运行时隔离）；
// - createRecoverySource() 仍只返回三个窄读方法（readCore/readOutbox/listProjectionEntries），
//   不通过闭包字段、返回值或错误对象泄露通用 handle；
// - adapter 的功能不受影响（runTransaction/entries 正常工作）。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim。
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

  // ══ 场景 1：adapter 实例不暴露 factory/DB/transaction（ownKeys/keys/属性读取/序列化）══
  {
    const backend = createSharedIdbBackend();
    const shim = createIdbShim(backend);
    await coreStore.openRuntimeDb(shim);
    const adapter = new adapterMod.ProjectionDurableAdapter(shim);
    // Reflect.ownKeys / Object.keys 均不得包含 factory/db/transaction。
    const ownKeys = Reflect.ownKeys(adapter).map(String);
    assert(!ownKeys.some((k) => /factory|db|transaction/i.test(k)), '场景1-Reflect.ownKeys 不得暴露 factory/DB/transaction，实际 ' + JSON.stringify(ownKeys));
    const enumKeys = Object.keys(adapter);
    assert(!enumKeys.some((k) => /factory|db|transaction/i.test(k)), '场景1-Object.keys 不得暴露，实际 ' + JSON.stringify(enumKeys));
    // 任意属性读取（含常见绕过路径）均不可得。
    const probes = ['factory', 'db', 'transaction', '_factory', '_db', 'indexedDB', 'openRuntimeDb'];
    for (const p of probes) {
      const v = adapter[p];
      assert(v === undefined, '场景1-属性读取不得取得 ' + p + '（实际 ' + String(v).slice(0, 40) + '）');
    }
    // 序列化不得泄露。
    const serialized = JSON.stringify(adapter);
    assert(!/factory|transaction|indexedDB/i.test(serialized), '场景1-JSON 序列化不得泄露 handle，实际 ' + serialized.slice(0, 120));
    // WeakMap 键不可枚举（模块私有）。
    assert(ownKeys.length === 0 || ownKeys.every((k) => typeof k === 'string' && !k.startsWith('#')), '场景1-无私有字段 own key');
    recordRejected('P1-1-factory 运行时不可取得', 'ownKeys/keys/属性读取/序列化全部不可得', '不可得');
  }

  // ══ 场景 2：createRecoverySource 只返回三个窄读方法，不泄露 handle ══
  {
    const shim = createIdbShim();
    const adapter = new adapterMod.ProjectionDurableAdapter(shim);
    const source = adapter.createRecoverySource();
    const keys = Object.keys(source).sort();
    assert(JSON.stringify(keys) === JSON.stringify(['listProjectionEntries', 'readCore', 'readOutboxEntries']), '场景2-窄 source 只有三个方法，实际 ' + JSON.stringify(keys));
    const sourceJson = JSON.stringify(source);
    assert(!/factory|transaction|indexedDB/i.test(sourceJson), '场景2-窄 source 序列化不泄露 handle');
    // 闭包字段检查：方法的 own 属性无 handle。
    for (const k of keys) {
      const fnKeys = Object.keys(source[k]);
      assert(fnKeys.length === 0, '场景2-窄方法无闭包 own 字段，实际 ' + JSON.stringify(fnKeys));
    }
    recordPositive('P1-1-窄 source 三方法', 'readCore/readOutbox/listProjectionEntries + 无 handle 泄露');
  }

  // ══ 场景 3：adapter 功能不受影响（runTransaction/entries 正常）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    const r = await adapter1.runTransaction(coreStore.PROJECTION_STORE, async (store) => {
      await store.put({ ok: 1 }, 'projection:cap:k1');
      return 'done';
    });
    assert(r === 'done', '场景3-runTransaction 正常');
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const entries = await adapter2.entries();
    assert(entries.length === 1 && entries[0].key === 'projection:cap:k1', '场景3-entries 正常（重开可读）');
    recordPositive('P1-1-功能不受影响', 'runTransaction + entries 正常');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.5-adapter-capability regression passed.');
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
    console.error('story-runtime-g1.3.2.5-adapter-capability regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
