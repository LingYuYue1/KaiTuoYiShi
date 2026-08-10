// G1.3.2.5 projection-late-failure regression：P0-1 ——
// - runTransaction 回调在第一条 put 成功后跨至少一个 macrotask 再 reject/throw：
//   底层事务不得因无活动请求而提前 complete/发布写集（keep-alive 请求链保持事务活跃），
//   调用方收到失败，重新打开数据库确认全部写入不可见（零写入）；
// - 不得只在事务已 complete 后返回新错误码（那是失败但已写入）；
// - 成功对照：put 后跨 macrotask 返回，事务正常一次性提交，重开可见。
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

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

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

  // ══ 场景 1：put 成功后跨 macrotask（50ms setTimeout）reject -> 调用方失败 + 重开零写入 ══
  {
    const backend = createSharedIdbBackend();
    const shim = createIdbShim(backend);
    await coreStore.openRuntimeDb(shim);
    const adapter = new adapterMod.ProjectionDurableAdapter(shim);
    let threw = null;
    try {
      await adapter.runTransaction(coreStore.PROJECTION_STORE, async (store) => {
        await store.put({ marker: 'should-not-persist-late' }, 'projection:late:k1');
        // 跨 macrotask 晚失败：期间事务没有任何活动请求（keep-alive 链必须保持事务活跃）。
        await sleep(50);
        return Promise.reject(new Error('late callback failure'));
      });
    } catch (error) {
      threw = error;
    }
    assert(threw !== null && String(threw.message).includes('late callback failure'), '场景1-晚失败必须向调用方传播: ' + (threw ? threw.message : '未抛错'));
    // 重开 DB：晚失败后写入必须不可见（abort 在提交前执行）。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const row = await adapter2.readOne(coreStore.PROJECTION_STORE, 'projection:late:k1');
    assert(row === null, '场景1-跨 macrotask 晚失败后写入必须零写入（不可见）');
    recordRejected('P0-1-跨 macrotask 晚 reject', 'put 后 50ms reject -> 失败传播 + 重开零写入', '零写入');
  }

  // ══ 场景 2：put 成功后跨两个 macrotask 再 throw（async）-> 同上 ══
  {
    const backend = createSharedIdbBackend();
    const shim = createIdbShim(backend);
    await coreStore.openRuntimeDb(shim);
    const adapter = new adapterMod.ProjectionDurableAdapter(shim);
    let threw = null;
    try {
      await adapter.runTransaction(coreStore.PROJECTION_STORE, async (store) => {
        await store.put({ marker: 'should-not-persist-late2' }, 'projection:late:k2');
        await sleep(30);
        await sleep(30);
        throw new Error('late callback throw');
      });
    } catch (error) {
      threw = error;
    }
    assert(threw !== null && String(threw.message).includes('late callback throw'), '场景2-晚 throw 必须传播');
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const row = await adapter2.readOne(coreStore.PROJECTION_STORE, 'projection:late:k2');
    assert(row === null, '场景2-双 macrotask 晚 throw 后零写入');
    recordRejected('P0-1-双 macrotask 晚 throw', '60ms 后 throw -> 零写入', '零写入');
  }

  // ══ 场景 3：成功对照——put 后跨 macrotask 返回，事务正常一次性提交 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    const result = await adapter1.runTransaction(coreStore.PROJECTION_STORE, async (store) => {
      await store.put({ marker: 'persisted-ok' }, 'projection:late:ok1');
      await sleep(50); // 跨 macrotask 的成功路径
      return { wrote: true };
    });
    assert(result.wrote === true, '场景3-成功路径返回回调结果');
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const row = await adapter2.readOne(coreStore.PROJECTION_STORE, 'projection:late:ok1');
    assert(row !== null && row.marker === 'persisted-ok', '场景3-成功路径重开 DB 可见（跨 macrotask 后仍一次性提交）');
    recordPositive('P0-1-成功路径对照', '跨 macrotask 成功提交 + 重开可见');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.5-projection-late-failure regression passed.');
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
    console.error('story-runtime-g1.3.2.5-projection-late-failure regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
