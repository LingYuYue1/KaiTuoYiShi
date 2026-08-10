// G1.3.2.3/G1.3.2.4 raw-trap-safety regression：P1-4 ——
// - 不可信入口只接受 UTF-8 JSON 文本/字节；live object 在任何属性访问之前直接拒绝；
// - 拒绝路径不执行任何用户 Proxy trap（get/getPrototypeOf/ownKeys/getOwnPropertyDescriptor/has/set/
//   defineProperty/deleteProperty/preventExtensions/isExtensible/setPrototypeOf/apply/construct
//   完整矩阵全部 0 调用），也不读取 accessor getter；
// - 嵌套 Proxy（普通对象属性里嵌 Proxy）整体拒绝且内层 trap 全部 0 调用；
// - 合法 JSON 文本正向：字段路径、canonical fingerprint、inputFingerprint、深快照；
// - 非法 JSON / 超限文本负向：稳定只读诊断（raw=null + readonlyReason，不 throw）。
// 生产模块经 esbuild 执行；不依赖 Node 专属 API（浏览器等价路径）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';

const FROZEN_HASHES = {
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
  'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
};

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }

// 完整 Proxy trap 矩阵（G1.3.2.3：逐项统计，不能只统计 get）。
function makeTrapProbe(target) {
  const calls = {
    get: 0, set: 0, has: 0, getPrototypeOf: 0, setPrototypeOf: 0, isExtensible: 0,
    preventExtensions: 0, ownKeys: 0, getOwnPropertyDescriptor: 0, defineProperty: 0,
    deleteProperty: 0, apply: 0, construct: 0,
  };
  const proxy = new Proxy(target, {
    get(t, p, r) { calls.get += 1; return Reflect.get(t, p, r); },
    set(t, p, v, r) { calls.set += 1; return Reflect.set(t, p, v, r); },
    has(t, p) { calls.has += 1; return Reflect.has(t, p); },
    getPrototypeOf(t) { calls.getPrototypeOf += 1; return Reflect.getPrototypeOf(t); },
    setPrototypeOf(t, p) { calls.setPrototypeOf += 1; return Reflect.setPrototypeOf(t, p); },
    isExtensible(t) { calls.isExtensible += 1; return Reflect.isExtensible(t); },
    preventExtensions(t) { calls.preventExtensions += 1; return Reflect.preventExtensions(t); },
    ownKeys(t) { calls.ownKeys += 1; return Reflect.ownKeys(t); },
    getOwnPropertyDescriptor(t, p) { calls.getOwnPropertyDescriptor += 1; return Reflect.getOwnPropertyDescriptor(t, p); },
    defineProperty(t, p, d) { calls.defineProperty += 1; return Reflect.defineProperty(t, p, d); },
    deleteProperty(t, p) { calls.deleteProperty += 1; return Reflect.deleteProperty(t, p); },
    apply() { calls.apply += 1; return undefined; },
    construct() { calls.construct += 1; return {}; },
  });
  return { proxy, calls };
}

async function main() {
  const rawReader = await bundleTs('services/storyRuntime/rawLegacyReader.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  // ══ 场景 1：顶层 Proxy 完整 trap 矩阵全部 0 调用，稳定 raw=null/fingerprint=null ══
  {
    const { proxy, calls } = makeTrapProbe({ a: 1, nested: { b: 2 } });
    const snapshot = await rawReader.readRawSavePayload(proxy);
    assert(snapshot.canonicalFingerprint === null && snapshot.raw === null, '场景1-Proxy 必须 raw=null + fingerprint=null');
    assert(snapshot.readonlyReason !== null, '场景1-拒绝路径必须有稳定只读诊断');
    const fired = Object.entries(calls).filter(([, n]) => n > 0);
    assert(fired.length === 0, '场景1-完整 trap 矩阵必须全部 0 调用，实际调用: ' + JSON.stringify(fired));
    recordRejected('场景1-顶层 Proxy 完整 trap 矩阵', '13 类 trap 全部 0 调用 + raw/fingerprint null', 'null');
  }

  // ══ 场景 2：嵌套 Proxy（普通对象属性里嵌 Proxy）-> 整体拒绝且内层 trap 全部 0 调用 ══
  {
    const { proxy: inner, calls } = makeTrapProbe({ b: 2 });
    const outer = { a: 1, inner };
    const snapshot = await rawReader.readRawSavePayload(outer);
    assert(snapshot.canonicalFingerprint === null && snapshot.raw === null, '场景2-嵌套 Proxy live object 必须整体拒绝');
    const fired = Object.entries(calls).filter(([, n]) => n > 0);
    assert(fired.length === 0, '场景2-嵌套 Proxy trap 必须全部 0 调用，实际: ' + JSON.stringify(fired));
    recordRejected('场景2-嵌套 Proxy', '内层完整 trap 0 调用 + 整体拒绝', '整体拒绝');
  }

  // ══ 场景 3：accessor getter -> 拒绝且 getter 0 调用 ══
  {
    const getterCalls = { n: 0 };
    const obj = { a: 1 };
    Object.defineProperty(obj, 'leak', { get() { getterCalls.n += 1; return 'x'; }, enumerable: true });
    const snapshot = await rawReader.readRawSavePayload(obj);
    assert(snapshot.canonicalFingerprint === null && snapshot.raw === null, '场景3-accessor 必须拒绝');
    assert(getterCalls.n === 0, '场景3-getter 调用必须 0，实际 ' + getterCalls.n);
    recordRejected('场景3-accessor getter', 'getter 0 调用 + 拒绝', '0 调用');
  }

  // ══ 场景 4：合法 JSON 文本正向（字段路径/canonical/inputFingerprint/深快照）══
  {
    const text = JSON.stringify({ id: 1, currentSegmentId: 'seg_a', nested: { deep: true }, arr: [1, 2] });
    const snapshot = await rawReader.readRawSavePayload(text);
    assert(snapshot.raw !== null, '场景4-合法 JSON 文本必须解析成功');
    const beforeBytes = JSON.stringify(snapshot.raw);
    const beforeFp = snapshot.canonicalFingerprint;
    const beforeInputFp = snapshot.inputFingerprint;
    assert(snapshot.fieldPaths.includes('currentSegmentId') && snapshot.fieldFingerprints.length > 0, '场景4-字段路径与逐字段指纹收集正常');
    assert(beforeInputFp !== null && beforeInputFp.startsWith('sha256:'), '场景4-inputFingerprint 是原始输入字节的 sha256');
    // 重复解析幂等。
    const snapshot2 = await rawReader.readRawSavePayload(text);
    assert(JSON.stringify(snapshot2.raw) === beforeBytes && snapshot2.canonicalFingerprint === beforeFp && snapshot2.inputFingerprint === beforeInputFp, '场景4-重复解析幂等');
    recordPositive('场景4-合法 JSON 文本正向', 'parse + 字段路径 + canonical/inputFingerprint + 幂等');
  }

  // ══ 场景 5：非法 JSON / 超限文本负向 -> 稳定只读诊断，不 throw ══
  {
    const bad = await rawReader.readRawSavePayload('{ not json');
    assert(bad.raw === null && bad.canonicalFingerprint === null && bad.readonlyReason !== null, '场景5-非法 JSON 必须只读诊断');
    const big = JSON.stringify({ a: 'x'.repeat(rawReader.MAX_RAW_INPUT_BYTES + 1) });
    const over = await rawReader.readRawSavePayload(big);
    assert(over.raw === null && over.canonicalFingerprint === null && over.readonlyReason !== null, '场景5-超限文本必须只读诊断');
    recordRejected('场景5-非法/超限文本', 'raw/fingerprint null + readonlyReason（不 throw）', 'null');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.3-raw-trap-safety regression passed.');
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
    console.error('story-runtime-g1.3.2.3-raw-trap-safety regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
