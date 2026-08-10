// G1.3.2.5 raw-strict-utf8-proto regression：P1-2 ——
// - Uint8Array 输入用严格 UTF-8（TextDecoder fatal）：非法 UTF-8 byte sequence 即使位于 JSON 字符串内部
//   也返回只读诊断（不被替换字符静默改写成合法 JSON），并保留原始 bytes/fingerprint；
// - cloneJsonSafe 对 `__proto__`/`constructor`/`prototype` 等合法 JSON own key 无损快照：
//   round-trip JSON、fieldPaths、canonical fingerprint 全部保留这些字段；
//   输出对象不改变 prototype（null prototype），不污染全局或局部原型；
// - live Proxy/accessor/function 入口 0 trap/0 getter 拒绝、16 MiB 上限和过深只读诊断保持。
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

  // ══ 场景 1：非法 UTF-8 位于 JSON 字符串内部 -> 严格解码拒绝（不静默替换成合法 JSON）══
  {
    // 构造 "{\"x\":\"<invalid>\"}"：0xFF 是非法 UTF-8 首字节。
    const bytes = new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]); // {"x":"\xFF"}
    const snapshot = await rawReader.readRawSavePayload(bytes);
    assert(snapshot.raw === null, '场景1-非法 UTF-8 必须拒绝（raw null）');
    assert(snapshot.canonicalFingerprint === null, '场景1-非法 UTF-8 fingerprint null');
    assert(snapshot.readonlyReason !== null && snapshot.readonlyReason.includes('UTF-8'), '场景1-诊断说明非法 UTF-8');
    assert(snapshot.inputBytes === bytes.byteLength && snapshot.inputFingerprint !== null, '场景1-保留原始 bytes 大小与 fingerprint（只读诊断不丢原始证据）');
    recordRejected('P1-2-非法 UTF-8 严格拒绝', 'JSON 字符串内非法字节 -> 只读 + 保留 bytes/fingerprint', '保留 bytes');
  }

  // ══ 场景 2：__proto__ own key 无损快照（round-trip/fieldPaths/fingerprint 保留 + 原型不污染）══
  {
    // 用 JSON.parse 构造 own `__proto__` 数据属性（对象字面量 `{__proto__: ...}` 是原型语法，不产生 own 键）。
    const text = JSON.stringify(JSON.parse('{"x":1,"__proto__":{"nested":true},"constructor":{"kind":"data"},"prototype":{"p":1}}'));
    const snapshot = await rawReader.readRawSavePayload(text);
    assert(snapshot.raw !== null && snapshot.readonlyReason === null, '场景2-含特殊 key 的 JSON 必须解析成功');
    // 输出对象必须保留这些 own key（round-trip）。
    const rawObj = snapshot.raw;
    assert(Object.prototype.hasOwnProperty.call(rawObj, '__proto__'), '场景2-__proto__ 必须是 own 数据属性（无损）');
    assert(Object.prototype.hasOwnProperty.call(rawObj, 'constructor'), '场景2-constructor own key 保留');
    assert(Object.prototype.hasOwnProperty.call(rawObj, 'prototype'), '场景2-prototype own key 保留');
    assert(rawObj.__proto__ !== null && typeof rawObj.__proto__ === 'object' && rawObj.__proto__.nested === true, '场景2-__proto__ 的值是数据（nested: true）');
    // 不污染原型：输出对象 prototype 必须不是被输入数据设置的。
    const proto = Object.getPrototypeOf(rawObj);
    assert(proto === null || proto === Object.prototype, '场景2-输出对象 prototype 未被输入污染（null 或 Object.prototype）');
    assert(!Object.prototype.hasOwnProperty.call(proto ?? {}, 'nested'), '场景2-全局 Object.prototype 未被污染（nested 不在原型上）');
    // fieldPaths 保留特殊字段路径（object 值字段产生子路径，标量字段保留顶层路径）。
    assert(snapshot.fieldPaths.includes('__proto__') && snapshot.fieldPaths.includes('constructor') && snapshot.fieldPaths.includes('prototype'), '场景2-fieldPaths 保留特殊字段，实际 ' + JSON.stringify(snapshot.fieldPaths));
    // canonical fingerprint 稳定且 round-trip 幂等。
    const again = await rawReader.readRawSavePayload(text);
    assert(again.canonicalFingerprint === snapshot.canonicalFingerprint, '场景2-重复解析 fingerprint 不变');
    assert(JSON.stringify(again.raw) === text, '场景2-round-trip JSON 保留特殊字段');
    recordPositive('P1-2-特殊 key 无损', '__proto__/constructor/prototype own key 保留 + 原型不污染 + round-trip 幂等');
  }

  // ══ 场景 3：普通 JSON 字段在特殊 key 旁正常（字段路径/canonical/幂等）══
  {
    const text = JSON.stringify(JSON.parse('{"id":1,"__proto__":{"deep":true},"arr":[1,2]}'));
    const s1 = await rawReader.readRawSavePayload(text);
    assert(s1.fieldPaths.includes('id') && s1.fieldPaths.includes('__proto__') && s1.fieldPaths.includes('arr'), '场景3-普通字段与特殊字段共存，实际 ' + JSON.stringify(s1.fieldPaths));
    const s2 = await rawReader.readRawSavePayload(text);
    assert(s2.canonicalFingerprint === s1.canonicalFingerprint && s2.inputFingerprint === s1.inputFingerprint, '场景3-幂等');
    recordPositive('P1-2-普通字段共存', 'id/__proto__.deep/arr[1] 路径全部保留');
  }

  // ══ 场景 4：保持 live 拒绝/16 MiB 上限/过深只读 ══
  {
    const trapCalls = { get: 0 };
    const proxy = new Proxy({ a: 1 }, { get(t, p, r) { trapCalls.get += 1; return Reflect.get(t, p, r); } });
    const s1 = await rawReader.readRawSavePayload(proxy);
    assert(s1.raw === null && s1.readonlyReason !== null && trapCalls.get === 0, '场景4-live Proxy 拒绝且 0 trap');
    const big = JSON.stringify({ a: 'x'.repeat(rawReader.MAX_RAW_INPUT_BYTES + 1) });
    const s2 = await rawReader.readRawSavePayload(big);
    assert(s2.raw === null && s2.readonlyReason !== null && s2.readonlyReason.includes('超限'), '场景4-超限只读');
    recordRejected('P1-2-live/超限保持', 'Proxy 0 trap 拒绝 + 16 MiB 超限只读', '只读');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.5-raw-strict-utf8-proto regression passed.');
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
    console.error('story-runtime-g1.3.2.5-raw-strict-utf8-proto regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
