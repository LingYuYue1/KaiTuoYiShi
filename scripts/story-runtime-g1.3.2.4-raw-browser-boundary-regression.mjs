// G1.3.2.4 raw-browser-boundary regression：P1-4 ——
// - 浏览器等价路径：raw 入口不再依赖 Node 专属 API（util.types.isProxy / process.getBuiltinModule /
//   structuredClone 安全闸门）——静态红线：rawLegacyReader 源码不得再包含这些能力；
// - 不可信入口只接受 UTF-8 JSON 文本/字节；live accessor/Proxy 在任何属性访问之前直接拒绝，
//   getter/trap 完整计数必须为 0（即使 Node util 存在也不使用）；
// - JSON 文本/字节正向：解析、字段路径、canonical fingerprint、inputFingerprint、深快照、幂等；
// - 非法 JSON / 超限文本负向：稳定只读诊断（raw=null + readonlyReason，不 throw）。
// 生产模块经 esbuild 执行。
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

  // ══ 场景 1：静态红线——源码与 bundle 产物不得依赖 Node 专属探测（浏览器等价）══
  {
    const src = fs.readFileSync(path.join(process.cwd(), 'services/storyRuntime/rawLegacyReader.ts'), 'utf8');
    const banned = ['util.types', 'getBuiltinModule', 'node:util', 'structuredClone'];
    for (const b of banned) {
      assert(!src.includes(b), '场景1-源码不得再包含 Node 专属/不安全探测能力: ' + b);
    }
    safety.push({ name: '场景1-静态红线：无 Node util/structuredClone', detail: 'banned: ' + banned.join(', ') });
  }

  // ══ 场景 2：live accessor/Proxy 直接拒绝，完整 trap 矩阵与 getter 全部 0 调用 ══
  {
    const calls = {
      get: 0, set: 0, has: 0, getPrototypeOf: 0, setPrototypeOf: 0, isExtensible: 0,
      preventExtensions: 0, ownKeys: 0, getOwnPropertyDescriptor: 0, defineProperty: 0,
      deleteProperty: 0, apply: 0, construct: 0,
    };
    const target = { a: 1 };
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
    const s1 = await rawReader.readRawSavePayload(proxy);
    assert(s1.raw === null && s1.canonicalFingerprint === null && s1.readonlyReason !== null, '场景2-Proxy 必须拒绝');
    const fired = Object.entries(calls).filter(([, n]) => n > 0);
    assert(fired.length === 0, '场景2-Proxy 完整 trap 矩阵必须 0 调用，实际 ' + JSON.stringify(fired));
    const getterCalls = { n: 0 };
    const obj = { a: 1 };
    Object.defineProperty(obj, 'leak', { get() { getterCalls.n += 1; return 'x'; }, enumerable: true });
    const s2 = await rawReader.readRawSavePayload(obj);
    assert(s2.raw === null && s2.readonlyReason !== null, '场景2-accessor 必须拒绝');
    assert(getterCalls.n === 0, '场景2-getter 必须 0 调用，实际 ' + getterCalls.n);
    recordRejected('场景2-live accessor/Proxy 零 trap', '13 类 trap + getter 全部 0 调用 + 拒绝', '0 调用');
  }

  // ══ 场景 3：JSON 文本正向（字段路径/canonical/inputFingerprint/深快照/幂等）══
  {
    const text = JSON.stringify({ id: 1, currentSegmentId: 'seg_a', nested: { deep: true }, arr: [1, 2] });
    const s1 = await rawReader.readRawSavePayload(text);
    assert(s1.raw !== null && s1.canonicalFingerprint !== null, '场景3-合法 JSON 文本必须解析成功');
    assert(s1.inputFingerprint !== null && s1.inputBytes === Buffer.byteLength(text, 'utf8'), '场景3-保存原始 bytes 指纹与大小');
    assert(s1.fieldPaths.includes('currentSegmentId') && s1.fieldFingerprints.length > 0, '场景3-字段路径/逐字段指纹');
    const s2 = await rawReader.readRawSavePayload(text);
    assert(JSON.stringify(s2.raw) === JSON.stringify(s1.raw) && s2.canonicalFingerprint === s1.canonicalFingerprint && s2.inputFingerprint === s1.inputFingerprint, '场景3-重复解析幂等');
    recordPositive('场景3-JSON 文本正向', 'parse + 字段路径 + 指纹 + 幂等');
  }

  // ══ 场景 4：UTF-8 字节正向（浏览器 Blob/FileReader 读取路径的等价输入）══
  {
    const text = JSON.stringify({ currentSegmentId: 'seg_b' });
    const bytes = new TextEncoder().encode(text);
    const fromBytes = await rawReader.readRawSavePayload(bytes);
    const fromText = await rawReader.readRawSavePayload(text);
    assert(fromBytes.raw !== null, '场景4-字节输入必须解析成功');
    assert(JSON.stringify(fromBytes.raw) === JSON.stringify(fromText.raw) && fromBytes.inputFingerprint === fromText.inputFingerprint, '场景4-字节与文本等价');
    // 输入字节 mutation 不影响结果（独立拷贝）。
    const bytes2 = new TextEncoder().encode(text);
    const snap = await rawReader.readRawSavePayload(bytes2);
    const before = JSON.stringify(snap.raw);
    bytes2[0] = 0x22;
    assert(JSON.stringify(snap.raw) === before, '场景4-字节 mutation 隔离');
    recordPositive('场景4-UTF-8 字节正向', '与文本等价 + mutation 隔离');
  }

  // ══ 场景 5：非法 JSON / 超限 / live value 负向 -> 稳定只读诊断（不 throw）══
  {
    const bad = await rawReader.readRawSavePayload('{ not json');
    assert(bad.raw === null && bad.canonicalFingerprint === null && bad.readonlyReason !== null, '场景5-非法 JSON 只读诊断');
    const big = JSON.stringify({ a: 'x'.repeat(rawReader.MAX_RAW_INPUT_BYTES + 1) });
    const over = await rawReader.readRawSavePayload(big);
    assert(over.raw === null && over.readonlyReason !== null && over.readonlyReason.includes('超限'), '场景5-超限只读诊断');
    const num = await rawReader.readRawSavePayload(42);
    assert(num.raw === null && num.readonlyReason !== null, '场景5-非文本原始值拒绝');
    recordRejected('场景5-非法/超限/live 负向', '全部稳定只读诊断（不 throw）', '只读诊断');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.4-raw-browser-boundary regression passed.');
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
    console.error('story-runtime-g1.3.2.4-raw-browser-boundary regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
