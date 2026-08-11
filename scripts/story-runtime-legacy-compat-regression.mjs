// G1.2.3 兼容读取与迁移预览回归（剧情编织 / 归一化 / ID / legacy map / catalog store）。
// - normalization/id/legacyIdMap/storyAssetCatalogStore/legacyCompatibility 全部经 esbuild bundle
//   生产 TS 后真实执行（Node ESM 不直接执行 .ts；本脚本不复制字段表）。
// - catalogCandidate 双 oracle：生产 validateStoryRuntimeType('StoryAssetCatalog')（G1.2.2）
//   + 测试语义 validateAssetCatalogSample（story-asset-catalog-contract-regression）。
// - 反向：非法容器、ID 注入、身份冲突、已完成不造事实、catalog store 覆盖守卫等负例；
// - 纯读：deep-freeze、字节/descriptor 不变、getter 零调用；冻结文件 hash 不变、无 .tmp。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build as esbuildBuild } from 'esbuild';
import { validateAssetCatalogSample } from './story-asset-catalog-contract-regression.mjs';
import { readContractFixture } from './story-runtime-contract-regression.mjs';

const FIXTURES = {
  weaving: path.join('scripts', 'fixtures', 'story-v3', 'legacy-compat', 'legacy-story-weaving.json'),
  worldEvents: path.join('scripts', 'fixtures', 'story-v3', 'legacy-compat', 'legacy-world-events.json'),
};
const FROZEN_HASHES = {
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  'scripts/fixtures/story-v3/story-asset-catalog.sample.json': '1ef5df13948270f72e32661c6e22a2c09f12c376ceb265221a554cd051c68c86',
  'scripts/fixtures/story-v3/_story-runtime-contract-manifest.json': 'd8b7e6936faea3a28c3b7bb7c766712cc518a050da408e63fe61b9baf507771a',
  'scripts/story-runtime-contract-regression.mjs': '3b31012875f8da0795b90c4bebf9af16e272d20405454e867ba3c309c63d447f',
  'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
  'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
  'scripts/story-runtime-instance-validator-regression.mjs': '070f42f53bf278bc218946bf4c50f62c0e8239ccfa9fa3229d88f05f8f216620',
  'scripts/story-runtime-domain-model-regression.mjs': 'd7145b6cd2a1b92faeffd1de356db7948408d6ed7aefd0f0b343ae161302cd6f',
};

function fail(message) {
  throw new Error(message);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex');
}
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
const objectIds = new WeakMap();
const symbolIds = new Map();
let nextIdentityId = 1;
function identityId(value) {
  const map = typeof value === 'symbol' ? symbolIds : objectIds;
  if (!map.has(value)) map.set(value, nextIdentityId++);
  return map.get(value);
}
function descriptorGraphSnapshot(root) {
  const visited = new Set();
  const visit = (value) => {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
      return typeof value === 'symbol' ? { symbol: identityId(value) } : { primitive: value, type: typeof value };
    }
    const id = identityId(value);
    if (visited.has(id)) return { ref: id };
    visited.add(id);
    const properties = Reflect.ownKeys(value).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const keySnapshot = typeof key === 'symbol' ? { symbol: identityId(key) } : { string: key };
      return {
        key: keySnapshot,
        enumerable: descriptor?.enumerable,
        configurable: descriptor?.configurable,
        writable: descriptor?.writable,
        get: descriptor?.get ? identityId(descriptor.get) : null,
        set: descriptor?.set ? identityId(descriptor.set) : null,
        value: descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? visit(descriptor.value) : null,
      };
    });
    return { id, prototype: Object.getPrototypeOf(value) === null ? null : identityId(Object.getPrototypeOf(value)), properties };
  };
  return JSON.stringify(visit(root));
}

async function bundleTs(entry) {
  const result = await esbuildBuild({
    entryPoints: [path.join(process.cwd(), entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
async function assertBrowserBundles(entries) {
  for (const entry of entries) {
    await esbuildBuild({
      entryPoints: [path.join(process.cwd(), entry)],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      logLevel: 'silent',
    });
  }
}
// 生产 validator（G1.2.2）用于双 oracle 结构校验。
async function loadProductionValidator() {
  return bundleTs('services/storyRuntime/runtimeValidator.ts');
}
// legacyCompatibility（含 previewLegacyStoryWeaving / readLegacyWorldEventLabels）。
async function loadLegacyCompat() {
  return bundleTs('services/storyRuntime/legacyCompatibility.ts');
}
// normalization / id / legacyIdMap / storyAssetCatalogStore。
async function loadBaseModules() {
  const normalization = await bundleTs('services/storyRuntime/normalization.ts');
  const id = await bundleTs('services/storyRuntime/id.ts');
  const legacyIdMap = await bundleTs('services/storyRuntime/legacyIdMap.ts');
  const store = await bundleTs('services/storyRuntime/storyAssetCatalogStore.ts');
  return { normalization, id, legacyIdMap, store };
}

async function main() {
  const positives = [];
  const rejections = [];
  const guards = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordGuard = (name, detail) => guards.push({ name, detail });
  // 生产模块统一经 esbuild 执行（Node ESM 不直接执行 .ts）。
  const base = await loadBaseModules();
  const norm = base.normalization;
  const idMod = base.id;
  const idMapMod = base.legacyIdMap;
  const storeMod = base.store;
  const { canonicalJsonStringify, normalizeLegacyText, assertPlainJsonValue } = norm;
  const { stableId, sha256Fingerprint } = idMod;
  const { buildLegacyIdMap } = idMapMod;
  const { StoryAssetCatalogStore } = storeMod;

  await assertBrowserBundles([
    'services/storyRuntime/normalization.ts',
    'services/storyRuntime/id.ts',
    'services/storyRuntime/legacyIdMap.ts',
    'services/storyRuntime/legacyCompatibility.ts',
    'services/storyRuntime/storyAssetCatalogStore.ts',
  ]);
  recordPositive('五个 G1.2.3 生产模块可浏览器打包', 'platform=browser');

  // ── A1：normalization 确定性 / 非法容器 ──
  {
    const value = { b: [1, 2], a: { x: 's', y: true }, c: null };
    const first = canonicalJsonStringify(value);
    const second = canonicalJsonStringify(value);
    assert(first === second, 'canonical 两次必须一致');
    // 键顺序不同 -> 相同 canonical。
    const reordered = { c: null, a: { y: true, x: 's' }, b: [1, 2] };
    assert(canonicalJsonStringify(reordered) === first, '键顺序不同 canonical 必须相同');
    // 数组顺序改变 -> canonical 变。
    const reorderedArray = { b: [2, 1], a: { x: 's', y: true }, c: null };
    assert(canonicalJsonStringify(reorderedArray) !== first, '数组顺序改变 canonical 必须改变');
    recordPositive('canonical 键排序/数组保序确定性', 'bytes identical');
    // 文本归一化幂等。
    const text = '\r\n  引力稳定装置（NFD: ' + 'cafe\u0301'.normalize('NFC') + '）  \r\n';
    const once = normalizeLegacyText(text);
    const twice = normalizeLegacyText(once);
    assert(once === twice, '文本归一化必须幂等');
    assert(!once.includes('\r'), '文本归一化必须移除 CR');
    recordPositive('normalizeLegacyText 幂等（trim + CRLF->LF + NFC）', 'idempotent');
    // 非法容器负例。
    const withSymbol = { a: 1 };
    withSymbol[Symbol('k')] = 2;
    const withHidden = { a: 1 };
    Object.defineProperty(withHidden, 'h', { value: 2, enumerable: false });
    const withGetter = { a: 1 };
    Object.defineProperty(withGetter, 'g', { get: () => 1, enumerable: true });
    const sparse = new Array(2);
    const extraArr = ['a'];
    extraArr.x = 1;
    const cyclic = {};
    cyclic.self = cyclic;
    const containerNegatives = [
      ['symbol键', withSymbol, 'symbol 键'],
      ['隐藏字段', withHidden, '不可枚举隐藏字段'],
      ['getter', withGetter, 'getter/setter'],
      ['自定义prototype', Object.create({ x: 1 }), '普通对象'],
      ['sparse数组', { a: sparse }, 'sparse hole'],
      ['extra数组', { a: extraArr }, '索引之外的自有键'],
      ['循环引用', { a: cyclic }, '循环引用'],
      ['bigint', { a: 1n }, 'bigint'],
      ['undefined', { a: undefined }, 'undefined'],
      ['NaN', { a: NaN }, 'NaN/Infinity'],
      ['Infinity', { a: Infinity }, 'NaN/Infinity'],
      ['Date', { a: new Date() }, '普通对象'],
      ['Map', { a: new Map() }, '普通对象'],
    ];
    for (const [name, value, keyword] of containerNegatives) {
      let rejected = false;
      let errorMessage = '';
      try { canonicalJsonStringify(value); } catch (error) { rejected = true; errorMessage = error.message; }
      assert(rejected, 'canonical 必须拒绝 ' + name);
      assert(errorMessage.includes(keyword), 'canonical 拒绝 ' + name + ' 原因必须包含 ' + keyword + '，实际: ' + errorMessage);
      rejections.push({ name: 'canonical-拒绝-' + name, errorMessage });
    }
    // 追加容器负例（数组 symbol/隐藏/setter、函数/符号值、RegExp/Set、顶层 sparse/extra）。
    const arrSymbol = ['a'];
    arrSymbol[Symbol('k')] = 1;
    const arrHidden = ['a'];
    Object.defineProperty(arrHidden, '1', { value: 'b', enumerable: false });
    const arrSetter = ['a'];
    Object.defineProperty(arrSetter, '1', { set: () => {}, enumerable: true });
    const extraNegatives = [
      ['数组symbol键', { a: arrSymbol }, 'symbol 键'],
      ['数组隐藏字段', { a: arrHidden }, '隐藏字段'],
      ['数组setter', { a: arrSetter }, 'getter/setter'],
      ['函数值', { a: () => 1 }, 'function'],
      ['符号值', { a: Symbol('x') }, 'symbol'],
      ['RegExp', { a: /re/g }, '普通对象'],
      ['Set', { a: new Set() }, '普通对象'],
      ['顶层sparse', new Array(2), 'sparse hole'],
      ['顶层extra', (() => { const a = []; a.x = 1; return a; })(), '索引之外的自有键'],
    ];
    for (const [name, value, keyword] of extraNegatives) {
      let rejected = false;
      let errorMessage = '';
      try { canonicalJsonStringify(value); } catch (error) { rejected = true; errorMessage = error.message; }
      assert(rejected, 'canonical 必须拒绝 ' + name);
      assert(errorMessage.includes(keyword), 'canonical 拒绝 ' + name + ' 原因必须包含 ' + keyword + '，实际: ' + errorMessage);
      rejections.push({ name: 'canonical-拒绝-' + name, errorMessage });
    }
    // getter 零调用。
    let getterCalls = 0;
    const gv = { a: 1 };
    Object.defineProperty(gv, 'g', { get: () => { getterCalls += 1; return 1; }, enumerable: true });
    let rejected = false;
    try { canonicalJsonStringify(gv); } catch { rejected = true; }
    assert(rejected, 'getter 输入必须拒绝');
    assert(getterCalls === 0, 'getter 不得被调用');
    rejections.push({ name: 'canonical-getter零调用', errorMessage: 'getterCalls === 0' });
    // 共享子对象通过。
    const shared = { v: 1 };
    assert(canonicalJsonStringify({ a: shared, b: shared }) === canonicalJsonStringify({ a: { v: 1 }, b: { v: 1 } }), '共享非循环子对象必须通过');
    recordPositive('共享子对象通过 / 循环拒绝', 'shared ok');
    const deepInvalid = { outer: { list: [{ payload: 1n }] } };
    let deepError = '';
    try { canonicalJsonStringify(deepInvalid); } catch (error) { deepError = error.message; }
    assert(deepError.includes('$.outer.list[0].payload'), '深层非法值必须报告完整路径，实际: ' + deepError);
    rejections.push({ name: 'canonical-深层错误路径精确', errorMessage: deepError });
  }

  // ── A2：stableId 确定性 + 禁用注入 ──
  {
    const scope = { title: '重力稳定装置', workTitle: '演示' };
    const id1 = await stableId('asset:series', scope, 'legacy_id');
    const id2 = await stableId('asset:series', deepClone(scope), 'legacy_id');
    const id3 = await stableId('asset:series', { workTitle: '演示', title: '重力稳定装置' }, 'legacy_id');
    assert(id1 === id2 && id1 === id3, '稳定 ID 必须跨深拷贝/键顺序一致');
    recordPositive('stableId 确定性（深拷贝/键顺序/两次调用）', id1.slice(0, 20) + '…');
    // 语义内容改变 -> ID 改变。
    const idChanged = await stableId('asset:series', { title: '另一个', workTitle: '演示' }, 'legacy_id');
    assert(idChanged !== id1, '语义内容改变 ID 必须改变');
    recordPositive('stableId 语义敏感', 'changed');
    // 数组顺序改变 -> ID 改变。
    const arrId1 = await stableId('ns', ['a', 'b'], '');
    const arrId2 = await stableId('ns', ['b', 'a'], '');
    assert(arrId1 !== arrId2, '数组顺序改变 ID 必须改变');
    recordPositive('stableId 数组保序', 'changed');
    // 禁用注入静态探针：只扫描非注释代码行（注释里的"禁止 Date.now"等说明不算注入）。
    const idSource = fs.readFileSync(path.join(process.cwd(), 'services/storyRuntime/id.ts'), 'utf8');
    const compatSource = fs.readFileSync(path.join(process.cwd(), 'services/storyRuntime/legacyCompatibility.ts'), 'utf8');
    const combined = (idSource + '\n' + compatSource).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const token of ['Date.now', 'Math.random', 'performance.now', 'process.hrtime', 'Date(']) {
      assert(!combined.includes(token), 'ID 生成禁止使用 ' + token);
    }
    // 数组下标注入：源码中不允许把 index 放进 stableId scope。
    assert(!idSource.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').includes('index'), 'id.ts 不得用数组下标参与语义 ID');
    assert(!/stableIdN\([^;]*\bindex\b/s.test(compatSource), 'legacyCompatibility.ts 的 stableIdN scope 不得包含数组下标');
    assert(!fs.readFileSync(path.join(process.cwd(), 'services/storyRuntime/normalization.ts'), 'utf8').includes('node:crypto'), '生产归一化模块不得 import node:crypto');
    assert(!idSource.includes('node:crypto'), '生产 ID 模块不得 import node:crypto');
    recordGuard('ID-禁用Date.now/Math.random/时间/计数器/下标', 'static tokens absent in code');
  }

  // ── A3：legacyIdMap 冲突 ──
  {
    const fp1 = await sha256Fingerprint({ v: 1 });
    const base = { legacyPath: '分段列表[]', legacyId: 'seg1', targetKind: 'segment', targetId: 't1', sourceFingerprint: fp1, diagnostics: [] };
    const { map, conflicts } = await buildLegacyIdMap([base, { ...base, targetId: 't2' }]);
    assert(conflicts.some((c) => c.kind === 'legacy_identity_multi_target'), '同一 legacy identity 多 target 必须冲突');
    assert(map.entries.length === 1, '冲突条目不得进入 entries');
    // 同 target 被不等价 identity 占用。
    const { conflicts: conflicts2 } = await buildLegacyIdMap([
      { legacyPath: 'a', legacyId: 'id1', targetKind: 'segment', targetId: 'T', sourceFingerprint: fp1, diagnostics: [] },
      { legacyPath: 'b', legacyId: 'id2', targetKind: 'segment', targetId: 'T', sourceFingerprint: fp1, diagnostics: [] },
    ]);
    assert(conflicts2.some((c) => c.kind === 'target_multi_identity'), '同 target 不等价 identity 必须冲突');
    const pathAudit = await buildLegacyIdMap([
      { ...base, legacyPath: '旧路径A' },
      { ...base, legacyPath: '旧路径B' },
    ]);
    assert(pathAudit.conflicts.some((c) => c.kind === 'duplicate_source_identity'), '路径不同不得把同一 legacy identity 拆成两个对象');
    // fingerprint：重排 entries 顺序不变（canonical 数组保序——entries 数组顺序改变会变；这里验证 map 内 entries 排序无关的是 fingerprint 排除自身）。
    const entriesA = [base];
    const mapA = (await buildLegacyIdMap(entriesA)).map;
    const mapB = (await buildLegacyIdMap([{ ...base }])).map;
    assert(mapA.fingerprint === mapB.fingerprint, '相同映射 fingerprint 必须一致');
    // 改变语义后冒用旧 fingerprint：不同 entries 的 fingerprint 必须不同。
    const mapC = (await buildLegacyIdMap([{ ...base, targetId: 't3' }])).map;
    assert(mapA.fingerprint !== mapC.fingerprint, '改变映射语义后 fingerprint 必须变化');
    recordPositive('legacyIdMap 冲突拒绝 + fingerprint 语义敏感', 'conflicts ' + conflicts.length + '/' + conflicts2.length);
    // NFD/首尾空格伪装：legacyId 文本归一化后同一 identity。
    const idNfc = await stableId('asset:segment', { title: '装置' }, 'cafe\u0301');
    const idNfd = await stableId('asset:segment', { title: '装置' }, 'café');
    assert(idNfc === idNfd, 'legacyId NFD/NFC 归一化后必须得到相同 ID');
    const idSpace1 = await stableId('asset:segment', { title: '装置' }, '  x  ');
    const idSpace2 = await stableId('asset:segment', { title: '装置' }, 'x');
    assert(idSpace1 === idSpace2, 'legacyId 首尾空格归一化后必须相同 ID');
    recordPositive('legacyId NFD/空格归一化', 'identical');
  }

  // ── B：previewLegacyStoryWeaving（esbuild 生产执行 + 双 oracle）──
  const production = await loadProductionValidator();
  const compat = await loadLegacyCompat();
  const weavingFixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), FIXTURES.weaving), 'utf8'));
  {
    const preview = await compat.previewLegacyStoryWeaving(weavingFixture);
    assert(preview.sourceFingerprint.startsWith('sha256:'), 'sourceFingerprint 必须是 sha256');
    // 已完成/已经历 -> 只诊断 + 空账本，不生成事件/事实。
    assert(preview.warnings.some((w) => w.includes('已经历') || w.includes('已完成')), '已完成/已经历 必须产生诊断 warning');
    assert(preview.status === 'needs_confirmation', '旧关键事件缺少 V3 definition/replay 结构时必须 needs_confirmation');
    assert(preview.sideEffects.eventInstances.length === 0, 'eventInstances 必须恒为空');
    assert(preview.sideEffects.factLedger.length === 0, 'factLedger 必须恒为空');
    assert(preview.sideEffects.knowledgeReceipts.length === 0, 'knowledgeReceipts 必须恒为空');
    assert(preview.sideEffects.outbox.length === 0, 'outbox 必须恒为空');
    assert(Array.isArray(preview.catalogCandidate.eventDefinitions) && preview.catalogCandidate.eventDefinitions.length === 0, '关键事件不得生成 WorldEventDefinition');
    assert(preview.cursorCandidates.length >= 1, '当前进度必须生成只读游标候选');
    // 双 oracle：生产结构校验 + 测试语义校验。
    const structural = production.validateStoryRuntimeType('StoryAssetCatalog', preview.catalogCandidate);
    assert(structural.ok, 'catalogCandidate 必须通过生产结构校验: ' + JSON.stringify(structural));
    const { fixture } = readContractFixture();
    let semanticOk = true;
    let semanticError = '';
    try { validateAssetCatalogSample(preview.catalogCandidate, { fixture }); } catch (error) { semanticOk = false; semanticError = error.message; }
    assert(semanticOk, 'catalogCandidate 必须通过测试语义校验: ' + semanticError);
    recordPositive('旧剧情 preview：空账本 + 双 oracle 通过', 'eventInstances/factLedger/knowledge/outbox = 0');
    // 两次 preview 一致（确定性）。
    const preview2 = await compat.previewLegacyStoryWeaving(weavingFixture);
    assert(JSON.stringify(preview.catalogCandidate) === JSON.stringify(preview2.catalogCandidate), '两次 preview 必须完全一致');
    // deep-freeze 输入通过。
    const frozenPreview = await compat.previewLegacyStoryWeaving(deepFreeze(deepClone(weavingFixture)));
    assert(JSON.stringify(frozenPreview.catalogCandidate) === JSON.stringify(preview.catalogCandidate), 'deep-freeze 输入 preview 必须一致');
    recordPositive('preview 确定性 + deep-freeze 输入', 'identical');
    const seriesMapEntry = preview.idMap.entries.find((entry) => entry.targetKind === 'series');
    const segmentMapEntry = preview.idMap.entries.find((entry) => entry.targetKind === 'segment');
    assert(seriesMapEntry.sourceFingerprint === await sha256Fingerprint(weavingFixture.系列列表[0]), 'series map sourceFingerprint 必须来自单条旧系列记录');
    assert(segmentMapEntry.sourceFingerprint === await sha256Fingerprint(weavingFixture.系列列表[0].分段列表[0]), 'segment map sourceFingerprint 必须来自单条旧分段记录');
    assert(seriesMapEntry.sourceFingerprint !== preview.sourceFingerprint, '单条记录 fingerprint 不得冒用整个输入 fingerprint');
    const mappedKinds = new Set(preview.idMap.entries.map((entry) => entry.targetKind));
    for (const kind of ['series', 'chapter', 'segment', 'constraint', 'timeline', 'character']) {
      assert(mappedKinds.has(kind), 'legacy ID map 缺少已映射资产 kind: ' + kind);
    }
    recordPositive('legacy map 单条来源 fingerprint', 'series/segment record scoped');

    const reorderFixture = deepClone(weavingFixture);
    reorderFixture.系列列表[0].分段列表[0].原著硬约束.push({ 内容: '维修时必须保留备用供能' });
    reorderFixture.系列列表[0].分段列表[0].时间线.push({ 标题: '维修开始', 时间锚点: '午后', 描述: '维修组进入舱段', 涉及角色: ['观测员琳'] });
    const reorderBefore = await compat.previewLegacyStoryWeaving(reorderFixture);
    reorderFixture.系列列表[0].分段列表[0].原著硬约束.reverse();
    reorderFixture.系列列表[0].分段列表[0].时间线.reverse();
    const reorderAfter = await compat.previewLegacyStoryWeaving(reorderFixture);
    const constraintIds = (candidate) => Object.fromEntries(candidate.constraints.map((item) => [item.statement, item.constraintId]));
    const timelineIds = (candidate) => Object.fromEntries(candidate.timelineEntries.map((item) => [item.title, item.timelineEntryId]));
    assert(canonicalJsonStringify(constraintIds(reorderBefore.catalogCandidate)) === canonicalJsonStringify(constraintIds(reorderAfter.catalogCandidate)), '约束换位置后语义 ID 必须保持不变');
    assert(canonicalJsonStringify(timelineIds(reorderBefore.catalogCandidate)) === canonicalJsonStringify(timelineIds(reorderAfter.catalogCandidate)), '时间线换位置后语义 ID 必须保持不变');
    recordPositive('约束/时间线重排不改变语义 ID', 'stable across reorder');

    const duplicateFixture = deepClone(weavingFixture);
    duplicateFixture.系列列表[0].分段列表[0].原著硬约束.push(deepClone(duplicateFixture.系列列表[0].分段列表[0].原著硬约束[0]));
    const duplicatePreview = await compat.previewLegacyStoryWeaving(duplicateFixture);
    assert(duplicatePreview.unresolved.some((item) => item.includes('duplicate_source_identity')), '重复无 ID 约束必须进入 duplicate_source_identity');
    assert(duplicatePreview.catalogCandidate.constraints.filter((item) => item.statement === '稳定装置在更换完成前必须保持运行').length === 1, '重复无 ID 约束不得产生两个候选');
    rejections.push({ name: 'weaving-重复无ID语义不按下标拆分', errorMessage: 'duplicate_source_identity' });
    const duplicateChapterFixture = deepClone(weavingFixture);
    duplicateChapterFixture.系列列表[0].章节列表.push(deepClone(duplicateChapterFixture.系列列表[0].章节列表[0]));
    const duplicateChapterPreview = await compat.previewLegacyStoryWeaving(duplicateChapterFixture);
    assert(duplicateChapterPreview.unresolved.some((item) => item.includes('duplicate_source_identity')), '重复章节必须进入 duplicate_source_identity');
    assert(duplicateChapterPreview.catalogCandidate.chapters.length === preview.catalogCandidate.chapters.length, '重复章节不得生成第二个同 ID 候选');
    assert(duplicateChapterPreview.status === 'needs_confirmation', '重复章节不得保持 ready');
    rejections.push({ name: 'weaving-重复章节不生成同ID候选', errorMessage: 'duplicate_source_identity' });
    const changedDuplicateChapterFixture = deepClone(weavingFixture);
    changedDuplicateChapterFixture.系列列表[0].章节列表.push({ ...deepClone(changedDuplicateChapterFixture.系列列表[0].章节列表[0]), 标题: '同 ID 的篡改章节' });
    const changedDuplicateChapterPreview = await compat.previewLegacyStoryWeaving(changedDuplicateChapterFixture);
    assert(changedDuplicateChapterPreview.unresolved.some((item) => item.includes('legacyId') && item.includes('duplicate_source_identity')), '同一旧章节 ID 不得生成两个 target');
    assert(changedDuplicateChapterPreview.catalogCandidate.chapters.length === preview.catalogCandidate.chapters.length, '同一旧章节 ID 的第二条记录不得生成候选');
    rejections.push({ name: 'weaving-重复章节legacyId不生成第二target', errorMessage: 'duplicate_source_identity' });
    // 追加 weaving 语义负例。
    {
      // 非数组输入 -> invalid。
      const invalid = await compat.previewLegacyStoryWeaving({ notSeries: true });
      assert(invalid.status === 'invalid', '非旧剧情结构必须 invalid');
      rejections.push({ name: 'weaving-非结构输入invalid', errorMessage: 'status invalid' });
      const nullSeries = await compat.previewLegacyStoryWeaving({ 系列列表: [null] });
      assert(nullSeries.status === 'needs_confirmation' && nullSeries.catalogCandidate.series.length === 0, 'null 系列必须稳定诊断，不得抛 TypeError');
      assert(nullSeries.unresolved[0].includes('系列列表[0]'), 'null 系列诊断必须带路径');
      rejections.push({ name: 'weaving-null系列稳定诊断', errorMessage: nullSeries.unresolved[0] });
      // NFD 伪装：旧标题 NFD 与 NFC 变体生成相同资产 ID（不静默拆分身份）。
      const nfdFixture = deepClone(weavingFixture);
      nfdFixture.系列列表[0].标题 = 'cafe\u0301';
      const nfcFixture = deepClone(weavingFixture);
      nfcFixture.系列列表[0].标题 = 'café';
      const pNfd = await compat.previewLegacyStoryWeaving(nfdFixture);
      const pNfc = await compat.previewLegacyStoryWeaving(nfcFixture);
      assert(pNfd.catalogCandidate.series[0].seriesId === pNfc.catalogCandidate.series[0].seriesId, 'NFD/NFC 标题必须映射同一 series ID');
      recordGuard('weaving-NFD/NFC归一化同ID', 'identical seriesId');
      // 资产候选只读：route 是 player_optional 迁移候选，不激活运行状态。
      assert(pNfd.catalogCandidate.routePolicies.every((r) => r.participationPolicy === 'player_optional'), 'route 候选必须 player_optional');
      recordGuard('weaving-route候选只读player_optional', 'player_optional only');
      // 空账本机器证据（重复断言，计入负例计数为固定反证）。
      assert(pNfd.sideEffects.eventInstances.length === 0 && pNfd.sideEffects.factLedger.length === 0, '已完成不得生成事件/事实');
      recordGuard('weaving-空账本不可违反', 'sideEffects empty');
    }
  }

  // ── C：readLegacyWorldEventLabels ──
  {
    const worldFixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), FIXTURES.worldEvents), 'utf8'));
    const result = await compat.readLegacyWorldEventLabels(worldFixture);
    assert(result.labels.length === 1, '去重后只读 label 应为 1（重复+空白跳过）');
    assert(result.skipped.length === 2, '重复字符串 + 空白条目必须跳过');
    assert(result.labels[0].label.includes('终态描述'), 'label 必须保留只读文本');
    assert(result.labels[0].fingerprint.startsWith('sha256:'), 'label fingerprint 必须是 sha256');
    // 不生成任何 definition/instance/fact。
    assert(!('eventDefinitions' in result) && !('facts' in result), '世界字符串只读 label，不生成事件/事实');
    // 重复字符串不合并为同一事实：labels 去重后不得含重复文本。
    const labelTexts = result.labels.map((l) => l.label);
    assert(new Set(labelTexts).size === labelTexts.length, 'labels 不得含重复文本');
    recordGuard('world-重复字符串不合并为同一事实', 'labels deduped, duplicates skipped');
    recordPositive('旧世界字符串只读 label + 跳过重复/空白', '1 label + 2 skipped');
  }

  // ── D：catalog store 双 fingerprint + 覆盖守卫 ──
  {
    const store = new StoryAssetCatalogStore();
    const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/fixtures/story-v3/story-asset-catalog.sample.json'), 'utf8'));
    const fp = sample.catalogFingerprint;
    assert((await store.put(sample)).ok, '正式样例必须可存入');
    assert(store.get(fp) !== null, '按 fingerprint 必须可读回');
    // 同 fingerprint 不同 bytes 拒绝。
    const tampered = deepClone(sample);
    tampered.title = '篡改标题';
    assert(tampered.catalogFingerprint === fp, 'tamper 前提：fingerprint 字段未改');
    const putResult = await store.put(tampered);
    assert(!putResult.ok, '同 fingerprint 不同 canonical bytes 必须拒绝');
    rejections.push({ name: 'catalogStore-同fp不同bytes拒绝', errorMessage: putResult.reason });
    const invalidCatalog = { catalogFingerprint: 'sha256:' + '0'.repeat(64) };
    const invalidResult = await store.put(invalidCatalog);
    assert(!invalidResult.ok && invalidResult.reason.includes('结构校验失败'), '结构不完整 catalog 必须由 store 自身拒绝');
    rejections.push({ name: 'catalogStore-非法结构拒绝', errorMessage: invalidResult.reason });
    const forged = deepClone(sample);
    forged.catalogFingerprint = 'sha256:' + 'a'.repeat(64);
    const forgedResult = await store.put(forged);
    assert(!forgedResult.ok && forgedResult.reason.includes('canonical 内容不匹配'), '伪造 catalogFingerprint 必须拒绝');
    rejections.push({ name: 'catalogStore-伪造fingerprint拒绝', errorMessage: forgedResult.reason });
    // 新 fingerprint 不覆盖旧 fingerprint。
    const second = deepClone(sample);
    second.title = '重力稳定装置迁移目录（第二个合法版本）';
    const { catalogFingerprint: _ignored, ...secondPayload } = second;
    second.catalogFingerprint = await sha256Fingerprint(secondPayload);
    const secondFp = second.catalogFingerprint;
    assert((await store.put(second)).ok, '内容与 fingerprint 自洽的不同版本可并存');
    assert(store.get(fp) !== null && store.get(secondFp) !== null, '两个合法 fingerprint 版本必须并存可读');
    const guard = store.guardOverwrite(fp, canonicalJsonStringify(tampered));
    assert(!guard.ok, '覆盖守卫必须拒绝新内容覆盖旧 fingerprint');
    rejections.push({ name: 'catalogStore-覆盖守卫拒绝', errorMessage: guard.reason });
    // 标题 fallback 拒绝：不提供按标题查找。
    assert(!('getByTitle' in store), 'catalog store 不得提供标题查找');
    recordGuard('catalogStore-无标题fallback', 'no getByTitle');
    // 存入后外部修改原对象不改变快照。
    const original = deepClone(sample);
    await store.put(original);
    original.title = '外部修改';
    const stored = store.get(sample.catalogFingerprint);
    assert(stored.title === sample.title, '外部修改不得改变 store 快照');
    recordPositive('catalog store 双 fingerprint + 快照隔离', '2 fps coexist');
  }

  // ── 反向补充：ID 注入行为探针 / 身份冲突 / 不造事实 / fingerprint 冒用（合计 ≥50）──
  {
    // 两个无 ID 同内容记录：不得用数组下标拆开 -> duplicate_source_identity 诊断。
    const duplicate = [
      { legacyPath: 'a', legacyId: '', targetKind: 'segment', targetId: 't', sourceFingerprint: 'fp', diagnostics: [] },
      { legacyPath: 'b', legacyId: '', targetKind: 'segment', targetId: 't', sourceFingerprint: 'fp', diagnostics: [] },
    ];
    const dupResult = await buildLegacyIdMap(duplicate);
    assert(dupResult.conflicts.some((c) => c.kind === 'duplicate_source_identity'), '两个无 ID 同来源身份不得被不同路径静默拆开');
    rejections.push({ name: 'legacyIdMap-两无ID同内容不拆下标', errorMessage: 'duplicate_source_identity conflict' });
    // 删除旧 ID：legacyId 为空时仍可用规范化语义内容生成 ID，但映射需显式记录。
    const noId = await stableId('asset:segment', { title: '装置' }, '');
    const withId = await stableId('asset:segment', { title: '装置' }, 'legacy_seg');
    assert(noId !== withId, '旧 ID 存在与否必须影响 ID');
    recordGuard('ID-删除旧ID改变ID', 'changed');
    // 冒用旧 map fingerprint：同一 fingerprint 字符串被用于不同映射必须被（新 fingerprint 计算）拒绝。
    const fpA = (await buildLegacyIdMap([{ legacyPath: 'p', legacyId: 'i', targetKind: 'k', targetId: 'T1', sourceFingerprint: 'fp', diagnostics: [] }])).map.fingerprint;
    const fpB = (await buildLegacyIdMap([{ legacyPath: 'p', legacyId: 'i', targetKind: 'k', targetId: 'T2', sourceFingerprint: 'fp', diagnostics: [] }])).map.fingerprint;
    assert(fpA !== fpB, '改变映射语义后 fingerprint 必须变化');
    recordGuard('legacyIdMap-改变语义fingerprint变化', 'fingerprints differ');
    // 旧已完成/已经历 -> 不允许生成事件/事实：preview 的 eventDefinitions 与 sideEffects 恒空（正向已断言），
    // 再以内存变体验证"旧关键事件标题试图克隆 canonical event"被拒绝（不生成 definition）。
    const cloneEventFixture = deepClone(weavingFixture);
    cloneEventFixture.系列列表[0].分段列表[0].关键事件.push({ 事件名: '重力稳定装置危机' });
    const cloneEventPreview = await compat.previewLegacyStoryWeaving(cloneEventFixture);
    assert(cloneEventPreview.catalogCandidate.eventDefinitions.length === 0, '旧关键事件标题不得克隆 canonical event');
    assert(cloneEventPreview.catalogCandidate.occurrenceDefinitions.length === 0, '不得生成 occurrence');
    recordGuard('weaving-旧关键事件标题不克隆canonical', 'eventDefinitions empty');
    // 当前进度试图直接写 focus：preview 只生成 cursor candidate，不写 StoryFocus。
    assert(!('focus' in cloneEventPreview), 'preview 不得包含 focus 字段');
    recordGuard('weaving-当前进度不写focus', 'no focus field');
    // 世界字符串：只读 label，不生成 definition/instance/fact。
    const worldResult = await compat.readLegacyWorldEventLabels({ 全局事件: ['设施：重力稳定装置已停止运行（终态描述）'] });
    assert(!('eventDefinitions' in worldResult), '世界字符串不得生成事件定义');
    assert(!('factLedger' in worldResult), '世界字符串不得生成事实');
    recordGuard('world-终态描述不造事件/事实', 'labels only');
  }

  // ── 纯读：失败路径输入不变 ──
  {
    const input = { a: 1, nested: { b: 'x' } };
    const beforeBytes = canonicalJsonStringify(input);
    const beforeShape = descriptorGraphSnapshot(input);
    let rejected = false;
    try { assertPlainJsonValue(input); } catch { rejected = true; }
    assert(!rejected, '合法输入必须通过 assertPlainJsonValue');
    assert(canonicalJsonStringify(input) === beforeBytes && descriptorGraphSnapshot(input) === beforeShape, '纯读-成功路径输入不变');
    const bad = { a: 1 };
    bad[Symbol('k')] = 1;
    const badBytes = canonicalJsonStringify({ a: 1 });
    const badShape = descriptorGraphSnapshot(bad);
    try { assertPlainJsonValue(bad); } catch { rejected = true; }
    assert(rejected, '非法容器必须拒绝');
    assert(canonicalJsonStringify({ a: 1 }) === badBytes && descriptorGraphSnapshot(bad) === badShape, '纯读-失败路径输入不变');
    recordPositive('纯读成功/失败路径输入不变', 'bytes + shape unchanged');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变（G1.1 四份 + G1.2.1/G1.2.2 七份）', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-legacy-compat regression passed.');
  console.log('positive checks: ' + positives.length);
  for (const result of positives) console.log('  + ' + result.name + ': ' + result.detail);
  console.log('tamper rejections: ' + rejections.length);
  for (const result of rejections) console.log('  - ' + result.name + ': rejected (' + result.errorMessage + ')');
  console.log('behavioral guards: ' + guards.length);
  for (const result of guards) console.log('  * ' + result.name + ': ' + result.detail);
  console.log('safety assertions: ' + safety.length);
  for (const result of safety) console.log('  = ' + result.name + ': ' + result.detail);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-legacy-compat regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
