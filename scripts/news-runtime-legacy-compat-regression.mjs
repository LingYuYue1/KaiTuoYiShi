// G1.2.3 旧新闻兼容回归：previewLegacyNews 经 esbuild 生产执行。
// - 四态（upcoming/ongoing/completed/archived）映射 stable article/version/draft ID；
// - 全部 manual + nonProgressing + migrationTrace.unknown + reliability.manual + sourceTrace=[]；
// - 旧时间戳/回合数不是 GameTime（publishedAt 省略）；零知识/零 outbox/零 fact/schedule/notice ref；
// - 未知状态不得静默改 completed -> 诊断 + 确认；
// - 反向：非法 JSON 容器、旧状态试图生成 fact/时间戳当 GameTime、覆盖同 article 版本等。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build as esbuildBuild } from 'esbuild';

const NEWS_FIXTURE = path.join('scripts', 'fixtures', 'story-v3', 'legacy-compat', 'legacy-news.json');
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
    return {
      id,
      prototype: Object.getPrototypeOf(value) === null ? null : identityId(Object.getPrototypeOf(value)),
      properties: Reflect.ownKeys(value).map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return {
          key: typeof key === 'symbol' ? { symbol: identityId(key) } : { string: key },
          enumerable: descriptor?.enumerable,
          configurable: descriptor?.configurable,
          writable: descriptor?.writable,
          get: descriptor?.get ? identityId(descriptor.get) : null,
          set: descriptor?.set ? identityId(descriptor.set) : null,
          value: descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? visit(descriptor.value) : null,
        };
      }),
    };
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

async function main() {
  const compat = await bundleTs('services/storyRuntime/legacyCompatibility.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });

  const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), NEWS_FIXTURE), 'utf8'));

  // ── 正向：四态映射 + manual/nonProgressing + 稳定 ID + 零副作用 ──
  {
    const preview = await compat.previewLegacyNews(fixture);
    const candidates = preview.articleCandidates;
    assert(candidates.length === 5, '四态 + 无 ID 条目应生成 5 个文章候选，实际 ' + candidates.length);
    const byId = Object.fromEntries(candidates.map((c) => [c.audit.legacyId, c]));
    // 生命周期映射。
    assert(byId.legacy_news_1.version.lifecycle === 'published', 'upcoming -> published');
    assert(byId.legacy_news_2.version.lifecycle === 'published', 'ongoing -> published');
    assert(byId.legacy_news_3.version.lifecycle === 'published', 'completed -> published');
    assert(byId.legacy_news_4.version.lifecycle === 'archived', 'archived -> archived');
    assert(byId.legacy_news_1.version.storyPhase === 'upcoming', 'upcoming -> upcoming storyPhase');
    assert(byId.legacy_news_2.version.storyPhase === 'ongoing', 'ongoing -> ongoing storyPhase');
    assert(byId.legacy_news_3.version.storyPhase === 'completed', 'completed -> completed storyPhase');
    assert(byId.legacy_news_4.version.storyPhase === 'completed', 'archived -> completed storyPhase');
    // 无 ID 条目 -> 可复现稳定 ID。
    assert(byId[''].aggregate.articleId.startsWith('sha256:'), '无 ID 条目必须得到稳定 article ID');
    // manual + nonProgressing + migrationTrace + reliability。
    for (const candidate of candidates) {
      const refs = candidate.version.sourceRefs;
      assert(refs.length === 1 && refs[0].kind === 'manual' && refs[0].nonProgressing === true, 'sourceRef 必须 manual + nonProgressing');
      assert(candidate.version.migrationTrace.status === 'unknown', 'migrationTrace.status 必须 unknown');
      assert(candidate.version.reliability === 'manual', 'reliability 必须 manual');
      assert(candidate.version.sourceTrace.length === 0, 'sourceTrace 必须为空');
      assert(candidate.version.publishedAt === undefined, 'publishedAt 必须省略（旧时间戳不是 GameTime）');
      assert(candidate.version.migrationTrace.rawFieldPaths.length === 1 && candidate.version.migrationTrace.rawFieldPaths[0].startsWith('条目['), 'migrationTrace 必须保留旧条目审计路径');
      assert(candidate.version.migrationTrace.rawPayloadFingerprint === candidate.version.sourceFingerprint && candidate.version.sourceFingerprint.startsWith('sha256:'), '旧条目 source fingerprint 必须可追溯');
      assert(candidate.draftId.startsWith('sha256:'), 'draftId 必须是稳定 ID');
      assert(candidate.aggregate.currentVersion === 1 && candidate.aggregate.versionIds.length === 1, 'aggregate 必须单版本不可变');
    }
    // 零副作用。
    assert(preview.sideEffects.factLedger.length === 0, '不得生成 fact');
    assert(preview.sideEffects.knowledgeReceipts.length === 0, '不得生成知识回执');
    assert(preview.sideEffects.outbox.length === 0, '不得生成 outbox');
    assert(preview.sideEffects.committedFactRefs.length === 0 && preview.sideEffects.scheduleRefs.length === 0 && preview.sideEffects.noticeRefs.length === 0, '不得生成 committed_fact/schedule/notice source ref');
    assert(preview.idMap.entries.length === candidates.length, '每篇候选新闻必须进入统一 legacy ID map');
    assert(preview.idMap.entries.every((entry) => entry.targetKind === 'news_article' && entry.sourceFingerprint.startsWith('sha256:')), '新闻 ID map 必须保留 target kind 与单条来源 fingerprint');
    // 确定性 + deep-freeze。
    const preview2 = await compat.previewLegacyNews(fixture);
    assert(JSON.stringify(preview) === JSON.stringify(preview2), '两次 preview 必须一致');
    const frozen = await compat.previewLegacyNews(deepFreeze(deepClone(fixture)));
    assert(JSON.stringify(frozen) === JSON.stringify(preview), 'deep-freeze 输入 preview 必须一致');
    recordPositive('旧新闻四态映射 + manual/nonProgressing + 稳定 ID + 零副作用', '5 articles / 0 facts / 0 knowledge / 0 outbox');
    const reorderedFixture = deepClone(fixture);
    reorderedFixture.条目.reverse();
    const reorderedPreview = await compat.previewLegacyNews(reorderedFixture);
    const articleIds = (previewValue) => Object.fromEntries(previewValue.articleCandidates.map((candidate) => [candidate.version.title, candidate.aggregate.articleId]));
    const canonicalObject = (value) => Object.keys(value).sort().map((key) => [key, value[key]]);
    assert(JSON.stringify(canonicalObject(articleIds(preview))) === JSON.stringify(canonicalObject(articleIds(reorderedPreview))), '新闻重排后语义 article ID 必须保持不变');
    recordPositive('新闻重排不改变语义 ID', 'stable across reorder');
    const duplicateFixture = deepClone(fixture);
    duplicateFixture.条目.push(deepClone(duplicateFixture.条目[4]));
    const duplicatePreview = await compat.previewLegacyNews(duplicateFixture);
    assert(duplicatePreview.unresolved.some((item) => item.includes('duplicate_source_identity')), '重复无 ID 新闻必须进入 duplicate_source_identity');
    assert(duplicatePreview.articleCandidates.length === candidates.length, '重复无 ID 新闻不得按数组下标拆成新文章');
    rejections.push({ name: 'news-重复无ID语义不按下标拆分', errorMessage: 'duplicate_source_identity' });
    const duplicateLegacyIdFixture = deepClone(fixture);
    duplicateLegacyIdFixture.条目.push({ ...deepClone(duplicateLegacyIdFixture.条目[0]), 标题: '同 ID 的篡改标题' });
    const duplicateLegacyIdPreview = await compat.previewLegacyNews(duplicateLegacyIdFixture);
    assert(duplicateLegacyIdPreview.unresolved.some((item) => item.includes('legacyId') && item.includes('duplicate_source_identity')), '相同旧新闻 ID 不得映射两个 article target');
    assert(duplicateLegacyIdPreview.articleCandidates.length === candidates.length, '相同旧新闻 ID 的第二条记录不得生成候选');
    rejections.push({ name: 'news-重复legacyId不生成第二target', errorMessage: 'duplicate_source_identity' });
    const timestampChanged = deepClone(fixture);
    timestampChanged.条目[0].时间戳 += 1;
    const timestampPreview = await compat.previewLegacyNews(timestampChanged);
    assert(timestampPreview.articleCandidates[0].aggregate.articleId === preview.articleCandidates[0].aggregate.articleId, '新闻 ID 不应由旧时间戳改变');
    assert(timestampPreview.articleCandidates[0].version.sourceFingerprint !== preview.articleCandidates[0].version.sourceFingerprint, '新闻 source fingerprint 必须覆盖旧条目 payload');
  }

  // ── 正向：旧阵营标签只读审计 ──
  {
    const preview = await compat.previewLegacyNews(fixture);
    assert(preview.confirmations.some((c) => c.includes('旧阵营标签')), '旧阵营标签必须产生只读审计确认');
    recordPositive('旧阵营标签只读审计', 'confirmation emitted');
  }

  // ── 反向：非法输入 / 语义越界 ──
  {
    // 非法容器。
    const badCases = [
      ['symbol键', (input) => { input[Symbol('k')] = 1; }, 'symbol 键'],
      ['隐藏字段', (input) => { Object.defineProperty(input, 'h', { value: 1, enumerable: false }); }, '不可枚举隐藏字段'],
      ['getter', (input) => { Object.defineProperty(input, 'g', { get: () => 1, enumerable: true }); }, 'getter/setter'],
      ['自定义prototype', (input) => { Object.setPrototypeOf(input, { x: 1 }); }, '普通对象'],
      ['sparse数组', (input) => { input.条目 = new Array(2); }, 'sparse hole'],
      ['extra数组', (input) => { input.条目 = ['a']; input.条目.x = 1; }, '索引之外的自有键'],
      ['undefined', (input) => { input.undefined = undefined; }, 'undefined'],
      ['bigint', (input) => { input.big = 1n; }, 'bigint'],
      ['NaN', (input) => { input.nan = NaN; }, 'NaN/Infinity'],
      ['循环引用', (input) => { const p = {}; p.self = p; input.cyc = p; }, '循环引用'],
    ];
    for (const [name, mutate, keyword] of badCases) {
      const clone = deepClone(fixture);
      mutate(clone);
      let rejected = false;
      let errorMessage = '';
      try { await compat.previewLegacyNews(clone); } catch (error) { rejected = true; errorMessage = error.message; }
      assert(rejected, 'previewLegacyNews 必须拒绝 ' + name);
      assert(errorMessage.includes(keyword), '拒绝 ' + name + ' 原因必须包含 ' + keyword + '，实际: ' + errorMessage);
      rejections.push({ name: 'news-拒绝-' + name, errorMessage });
    }
    const nullEntryPreview = await compat.previewLegacyNews({ 条目: [null] });
    assert(nullEntryPreview.status === 'needs_confirmation' && nullEntryPreview.articleCandidates.length === 0, 'null 新闻条目必须稳定诊断，不得抛 TypeError');
    assert(nullEntryPreview.unresolved[0].includes('条目[0]'), 'null 新闻条目诊断必须带路径');
    rejections.push({ name: 'news-null条目稳定诊断', errorMessage: nullEntryPreview.unresolved[0] });
    // 未知状态不得静默改 completed。
    {
      const clone = deepClone(fixture);
      clone.条目[0].状态 = 'mystery';
      const preview = await compat.previewLegacyNews(clone);
      assert(preview.unresolved.length >= 1, '未知状态必须进 unresolved');
      assert(preview.status === 'needs_confirmation', '未知状态必须 needs_confirmation');
      rejections.push({ name: 'news-未知状态不静默改completed', errorMessage: 'unresolved: ' + preview.unresolved[0] });
    }
    // 未知类目不得静默改默认类目。
    {
      const clone = deepClone(fixture);
      clone.条目[0].类目 = 'mystery_category';
      const preview = await compat.previewLegacyNews(clone);
      assert(preview.unresolved.some((u) => u.includes('类目')), '未知类目必须进 unresolved');
      assert(preview.status === 'needs_confirmation', '未知类目必须 needs_confirmation');
      rejections.push({ name: 'news-未知类目不静默改默认', errorMessage: 'unresolved: ' + preview.unresolved[0] });
    }
    // 输入对象失败后字节/descriptor 不变（纯读）。
    {
      const input = deepClone(fixture);
      const beforeBytes = JSON.stringify(input);
    const beforeShape = descriptorGraphSnapshot(input);
      await compat.previewLegacyNews(input);
      assert(JSON.stringify(input) === beforeBytes, '成功路径输入字节不变');
      assert(descriptorGraphSnapshot(input) === beforeShape, '成功路径输入 shape 不变');
      const bad = deepClone(fixture);
      bad[Symbol('k')] = 1;
      const badBytes = JSON.stringify(bad);
      const badShape = descriptorGraphSnapshot(bad);
      let rejected = false;
      try { await compat.previewLegacyNews(bad); } catch { rejected = true; }
      assert(rejected, '非法输入必须拒绝');
      assert(JSON.stringify(bad) === badBytes && descriptorGraphSnapshot(bad) === badShape, '失败路径输入字节与 shape 不变');
      recordPositive('news 纯读成功/失败路径输入不变', 'bytes + shape unchanged');
    }
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('news-runtime-legacy-compat regression passed.');
  console.log('positive checks: ' + positives.length);
  for (const result of positives) console.log('  + ' + result.name + ': ' + result.detail);
  console.log('tamper rejections: ' + rejections.length);
  for (const result of rejections) console.log('  - ' + result.name + ': rejected (' + result.errorMessage + ')');
  console.log('safety assertions: ' + safety.length);
  for (const result of safety) console.log('  = ' + result.name + ': ' + result.detail);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('news-runtime-legacy-compat regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
