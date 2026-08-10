// G1.3.2.4 idb-shim-ordering regression：P1-5 ——
// - 公平创建顺序：transaction 能否启动同时检查 active 冲突与所有更早创建、尚未完成且 scope 重叠的排队事务；
//   后创建事务不得绕过更早排队事务——`A(readwrite) active -> A+B queued -> B queued` 时 later B 不得插队；
// - 重叠 readwrite 串行、不重叠并行、readonly 并行、readonly/readwrite 重叠互斥（事件顺序 + 活跃数证据）；
// - 空事务、排队中 abort 仍保持正确事件顺序。
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
  const P = coreStore.POINTER_STORE;
  const C = coreStore.CORE_STORE;
  const O = coreStore.OUTBOX_STORE;
  const mk = (db, names, mode, events, tag) => {
    const tx = db.transaction(names, mode);
    tx.oncomplete = () => events.push(tag + '-complete');
    tx.onabort = () => events.push(tag + '-abort');
    tx.onerror = () => events.push(tag + '-error');
    return tx;
  };

  // ══ 场景 1：A active -> A+B queued -> B queued；later B 不得插队（公平创建顺序）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    const A = mk(db, [C], 'readwrite', events, 'A');
    const AB = mk(db, [C, O], 'readwrite', events, 'AB');
    const B = mk(db, [O], 'readwrite', events, 'B');
    // 创建顺序：A active；AB 与 A 重叠 -> queued；B 与 AB（更早排队）重叠 -> queued（不得绕过 AB）。
    assert(db._active.length === 1 && db._queued.length === 2, '场景1-A 活跃、AB 与 B 排队，实际 active ' + db._active.length + ' queued ' + db._queued.length);
    assert(db._queued[0].storeNames.join(',') === [C, O].join(',') && db._queued[1].storeNames.join(',') === O, '场景1-队列顺序必须保持创建顺序（AB 先于 B）');
    assert(db._queued[0]._started === false && db._queued[1]._started === false, '场景1-排队事务（AB 与 B）都未取得开始许可');
    // A 写并完成 -> AB 开始并完成 -> B 最后开始并完成（later B 不插队）。
    await new Promise((res) => { const r = A.objectStore(C).put({ v: 1 }, 'kA'); r.onsuccess = () => res(); });
    await new Promise((res) => setTimeout(res, 80));
    assert(events[0] === 'A-complete', '场景1-A 必须先 complete，实际 ' + JSON.stringify(events));
    assert(events.includes('AB-complete') && events.includes('B-complete'), '场景1-AB 与 B 都必须 complete');
    assert(events.indexOf('A-complete') < events.indexOf('AB-complete') && events.indexOf('AB-complete') < events.indexOf('B-complete'), '场景1-later B 不得绕过更早排队的 AB（A -> AB -> B），实际 ' + JSON.stringify(events));
    assert(db._queued.length === 0, '场景1-最终队列清空');
    recordPositive('场景1-公平创建顺序', 'A -> AB -> B 严格按创建顺序（later B 不插队）');
  }

  // ══ 场景 2：重叠 readwrite 串行（事件顺序）+ 不重叠 readwrite 并行（活跃数）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    const tx1 = mk(db, [C], 'readwrite', events, 'tx1');
    const tx2 = mk(db, [C], 'readwrite', events, 'tx2'); // 与 tx1 重叠 -> 排队
    assert(db._active.length === 1 && db._queued.length === 1, '场景2-重叠 readwrite 一活跃一排队');
    await new Promise((res) => { const r = tx1.objectStore(C).put({ v: 1 }, 'k1'); r.onsuccess = () => res(); });
    await new Promise((res) => setTimeout(res, 60));
    assert(events[0] === 'tx1-complete' && events.indexOf('tx1-complete') < events.indexOf('tx2-complete'), '场景2-tx1 -> tx2 事件顺序');
    // 不重叠并行。
    const events2 = [];
    const a = mk(db, [P], 'readwrite', events2, 'a');
    const b = mk(db, [O], 'readwrite', events2, 'b'); // 与 a 不重叠 -> 立即开始
    assert(db._active.length === 2, '场景2-不重叠 readwrite 必须并行（活跃数 2，实际 ' + db._active.length + '）');
    await new Promise((res) => { const r = a.objectStore(P).put({ v: 1 }, 'kP'); r.onsuccess = () => res(); });
    await new Promise((res) => { const r = b.objectStore(O).put({ v: 1 }, 'kO'); r.onsuccess = () => res(); });
    await new Promise((res) => setTimeout(res, 60));
    assert(events2.includes('a-complete') && events2.includes('b-complete'), '场景2-不重叠事务都 complete');
    recordPositive('场景2-重叠串行/不重叠并行', '重叠一活跃一排队 + 不重叠活跃数 2');
  }

  // ══ 场景 3：readonly 并行 + readonly/readwrite 重叠互斥（双向事件顺序）══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    const ro1 = mk(db, [C], 'readonly', events, 'ro1');
    const ro2 = mk(db, [C], 'readonly', events, 'ro2');
    assert(db._active.length === 2, '场景3-readonly 与 readonly 并行（活跃数 2）');
    const rw = mk(db, [C], 'readwrite', events, 'rw'); // 与活跃 readonly 重叠 -> 排队
    assert(db._queued.length === 1, '场景3-readwrite 与活跃 readonly 重叠必须排队');
    await new Promise((res) => setTimeout(res, 60));
    assert(events.indexOf('ro2-complete') < events.indexOf('rw-complete'), '场景3-rw 在 readonly 完成后才 complete，实际 ' + JSON.stringify(events));
    // 反向：readwrite active -> readonly queued。
    const events3 = [];
    const rw2 = mk(db, [C], 'readwrite', events3, 'rw2');
    const ro3 = mk(db, [C], 'readonly', events3, 'ro3');
    assert(db._queued.length === 1, '场景3-readonly 与活跃 readwrite 重叠必须排队');
    await new Promise((res) => setTimeout(res, 60));
    assert(events3.indexOf('rw2-complete') < events3.indexOf('ro3-complete'), '场景3-rw2 -> ro3 事件顺序');
    recordPositive('场景3-readonly 并行 + 互斥', 'readonly 并行 + readonly/readwrite 双向互斥');
  }

  // ══ 场景 4：排队中 abort 不取得锁、不卡队列 ══
  {
    const shim = createIdbShim();
    const db = await coreStore.openRuntimeDb(shim);
    const events = [];
    const tx1 = mk(db, [C], 'readwrite', events, 'tx1');
    await new Promise((res) => { const r = tx1.objectStore(C).put({ v: 1 }, 'k1'); r.onsuccess = () => res(); });
    const tx2 = db.transaction(C, 'readwrite');
    tx2.onabort = () => events.push('tx2-abort');
    const r2 = tx2.objectStore(C).put({ v: 2 }, 'k2'); // 不等待（排队中写要等开始）
    assert(db._active.length === 1 && db._queued.length === 1, '场景4-tx2 排队中');
    tx2.abort();
    await new Promise((res) => setTimeout(res, 60));
    assert(events.includes('tx2-abort'), '场景4-排队中 abort 触发 onabort');
    assert(events.includes('tx1-complete'), '场景4-tx1 正常完成（队列未被 abort 卡住）');
    assert(db._queued.length === 0, '场景4-队列无残留');
    recordRejected('场景4-排队中 abort', 'onabort + 队列不卡 + 无残留', 'abort');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.4-idb-shim-ordering regression passed.');
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
    console.error('story-runtime-g1.3.2.4-idb-shim-ordering regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
