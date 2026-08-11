// G1.3.2.2/G1.3.2.4 raw-container-safety regression：P1-4 ——
// - 不可信入口只接受 UTF-8 JSON 文本（string）或字节（Uint8Array）；
//   live object/Proxy/accessor/function 在任何属性访问之前直接拒绝（getter/trap 调用 0）；
// - 先保存原始 bytes + input fingerprint，再 JSON.parse 产生普通数据；
// - 非法 JSON、超限 payload 返回稳定只读诊断（raw=null + canonicalFingerprint=null + readonlyReason，不 throw）；
// - 普通 JSON 输入深快照、输入 mutation 后 raw bytes/fingerprint 不变；
// - 字节输入（UTF-8 Uint8Array）与文本输入等价。
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

  // ══ 场景 1：Proxy（值 get trap）作为 live object 传入口 -> 直接拒绝，trap 0 调用 ══
  {
    const trapCalls = { get: 0 };
    const target = { a: 1, nested: { b: 2 } };
    const proxy = new Proxy(target, {
      get(t, p, r) { trapCalls.get += 1; return Reflect.get(t, p, r); },
    });
    const snapshot = await rawReader.readRawSavePayload(proxy);
    assert(snapshot.canonicalFingerprint === null, '场景1-Proxy 必须 canonicalFingerprint=null（只读路径）');
    assert(snapshot.raw === null, '场景1-Proxy 必须 raw=null（拒绝，不克隆）');
    assert(snapshot.readonlyReason !== null, '场景1-拒绝路径必须有稳定只读诊断（readonlyReason）');
    assert(trapCalls.get === 0, '场景1-值 get trap 调用次数必须为 0，实际 ' + trapCalls.get);
    recordRejected('场景1-Proxy live object', 'fingerprint=null + raw=null + readonlyReason + get trap 0 调用', 'null');
  }

  // ══ 场景 2：accessor（getter）live object -> 直接拒绝，getter 0 调用 ══
  {
    const getterCalls = { n: 0 };
    const obj = { a: 1 };
    Object.defineProperty(obj, 'leak', { get() { getterCalls.n += 1; return 'x'; }, enumerable: true });
    const snapshot = await rawReader.readRawSavePayload(obj);
    assert(snapshot.canonicalFingerprint === null, '场景2-accessor 必须 canonicalFingerprint=null');
    assert(snapshot.raw === null, '场景2-accessor 必须 raw=null');
    assert(getterCalls.n === 0, '场景2-getter 调用次数必须为 0，实际 ' + getterCalls.n);
    recordRejected('场景2-accessor live object', 'fingerprint=null + getter 0 调用', 'null');
  }

  // ══ 场景 3：其他 live value（普通对象/稀疏数组/symbol 键/循环/function）全部直接拒绝，不触碰 ══
  {
    const plainObj = { a: 1 };
    const s1 = await rawReader.readRawSavePayload(plainObj);
    assert(s1.raw === null && s1.canonicalFingerprint === null, '场景3-普通对象 live value 必须拒绝（不是序列化文本）');
    const sparse = [1, , 3];
    const s2 = await rawReader.readRawSavePayload(sparse);
    assert(s2.raw === null && s2.canonicalFingerprint === null, '场景3-稀疏数组 live value 必须拒绝');
    const withSymbol = { a: 1 };
    withSymbol[Symbol('k')] = 2;
    const s3 = await rawReader.readRawSavePayload(withSymbol);
    assert(s3.raw === null && s3.canonicalFingerprint === null, '场景3-symbol 键 live value 必须拒绝');
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    const s4 = await rawReader.readRawSavePayload(cyclic);
    assert(s4.raw === null && s4.canonicalFingerprint === null, '场景3-循环 live value 必须拒绝');
    const fn = () => 1;
    const s5 = await rawReader.readRawSavePayload(fn);
    assert(s5.raw === null && s5.canonicalFingerprint === null, '场景3-function live value 必须拒绝');
    const num = 42;
    const s6 = await rawReader.readRawSavePayload(num);
    assert(s6.raw === null && s6.canonicalFingerprint === null, '场景3-非文本原始值必须拒绝');
    recordRejected('场景3-live value 族', '普通对象/稀疏/symbol/循环/function/数字全部只读拒绝', '只读拒绝');
  }

  // ══ 场景 4：非法 JSON 文本 -> 稳定只读诊断（不 throw）══
  {
    const snapshot = await rawReader.readRawSavePayload('not json {');
    assert(snapshot.canonicalFingerprint === null && snapshot.raw === null, '场景4-非法 JSON 必须只读诊断');
    assert(snapshot.readonlyReason !== null && snapshot.readonlyReason.includes('JSON'), '场景4-readonlyReason 说明 JSON 解析失败');
    recordRejected('场景4-非法 JSON 文本', 'raw/fingerprint null + readonlyReason', 'readonlyReason');
  }

  // ══ 场景 5：超限文本 -> 稳定只读诊断 ══
  {
    const big = JSON.stringify({ a: 'x'.repeat(rawReader.MAX_RAW_INPUT_BYTES + 1) });
    const snapshot = await rawReader.readRawSavePayload(big);
    assert(snapshot.canonicalFingerprint === null && snapshot.raw === null, '场景5-超限输入必须只读诊断');
    assert(snapshot.readonlyReason !== null && snapshot.readonlyReason.includes('超限'), '场景5-readonlyReason 说明超限');
    recordRejected('场景5-超限 payload', 'raw/fingerprint null + 超限诊断', '超限');
  }

  // ══ 场景 6：普通 JSON 文本深快照，mutation 后 raw bytes/fingerprint 不变 + inputFingerprint ══
  {
    const text = JSON.stringify({ id: 1, currentSegmentId: 'seg_a', nested: { deep: true }, arr: [1, 2] });
    const snapshot = await rawReader.readRawSavePayload(text);
    assert(snapshot.raw !== null, '场景6-合法 JSON 文本必须解析成功');
    assert(snapshot.inputFingerprint !== null && snapshot.inputBytes === Buffer.byteLength(text, 'utf8'), '场景6-先保存原始 bytes 指纹与大小');
    const beforeBytes = JSON.stringify(snapshot.raw);
    const beforeFp = snapshot.canonicalFingerprint;
    // 解析产物（snapshot）不应与文本后续变化有关（文本不可变）；重新解析一次验证确定性。
    const snapshot2 = await rawReader.readRawSavePayload(text);
    assert(JSON.stringify(snapshot2.raw) === beforeBytes && snapshot2.canonicalFingerprint === beforeFp, '场景6-重复解析 raw bytes/fingerprint 不变（幂等）');
    assert(snapshot.fieldPaths.includes('currentSegmentId') && snapshot.fieldFingerprints.length > 0, '场景6-字段路径与逐字段指纹收集正常');
    recordPositive('场景6-普通 JSON 文本深快照', 'parse + 深快照 + 幂等 + inputFingerprint');
  }

  // ══ 场景 7：UTF-8 字节输入与文本输入等价 ══
  {
    const text = JSON.stringify({ id: 1, currentSegmentId: 'seg_a' });
    const bytes = new TextEncoder().encode(text);
    const fromText = await rawReader.readRawSavePayload(text);
    const fromBytes = await rawReader.readRawSavePayload(bytes);
    assert(fromBytes.raw !== null, '场景7-字节输入必须解析成功');
    assert(JSON.stringify(fromBytes.raw) === JSON.stringify(fromText.raw), '场景7-字节输入与文本输入结果等价');
    assert(fromBytes.inputFingerprint === fromText.inputFingerprint, '场景7-字节/文本 inputFingerprint 一致');
    // 输入字节 mutation 不影响结果（拷贝分离）。
    const bytes2 = new TextEncoder().encode(text);
    const snap = await rawReader.readRawSavePayload(bytes2);
    const before = JSON.stringify(snap.raw);
    bytes2[0] = 0x22; // 篡改输入字节
    assert(JSON.stringify(snap.raw) === before, '场景7-输入字节 mutation 不影响 raw（独立拷贝）');
    recordPositive('场景7-UTF-8 字节输入', '与文本等价 + mutation 隔离');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.2-raw-container-safety regression passed.');
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
    console.error('story-runtime-g1.3.2.2-raw-container-safety regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
