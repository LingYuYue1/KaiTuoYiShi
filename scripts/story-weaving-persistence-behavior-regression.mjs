import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-story-weaving-persistence-regression');
fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir, { recursive: true });

function transpile(sourcePath) {
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const sourceDir = path.posix.dirname(sourcePath.replaceAll('\\', '/'));
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
    },
  }).outputText
    .replace(/@\/(data|models|services|prompts|utils|hooks)\//g, (_match, folder) => {
      let relative = path.posix.relative(sourceDir, folder);
      if (!relative.startsWith('.')) relative = `./${relative}`;
      return `${relative}/`;
    })
    .replace(/from\s+['"]((?:\.\/|\.\.\/)[^'"]+)['"]/g, (match, specifier) =>
      specifier.endsWith('.mjs') ? match : `from '${specifier}.mjs'`);
  const outputPath = path.join(tempDir, sourcePath.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

function write(relativePath, content) {
  const outputPath = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}

transpile('models/storyWeaving.ts');
transpile('data/storyWeavingPreset.ts');
write('data/zhikuPreset.mjs', 'export const bundledZhikuPresets = []; export async function loadBundledZhikuPreset() { return { 条目: [] }; }\n');

const model = await import(pathToFileURL(path.join(tempDir, 'models/storyWeaving.mjs')).href);
const persistence = await import(pathToFileURL(path.join(tempDir, 'data/storyWeavingPreset.mjs')).href);
const source = JSON.parse(fs.readFileSync(path.join(root, 'data/storyWeavingCanonDecomposed.json'), 'utf8'));
const baseline = model.归一化剧情编织系统(source);
assert.equal(persistence.isSelfContainedStoryWeavingSystem(baseline), true, '完整原著系统应可作为离线回退');

const resourceDir = path.join(root, 'public/data/story-weaving-canon');
let activeFetches = 0;
let maxActiveFetches = 0;
let retryTargetAttempts = 0;
globalThis.fetch = async (input, init = {}) => {
  activeFetches += 1;
  maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
  try {
    await new Promise((resolve) => setTimeout(resolve, 1));
    const id = path.basename(new URL(String(input), 'http://localhost').pathname, '.json');
    if (id === 'story_canon_penacony_farewell_penacony' && retryTargetAttempts++ === 0) {
      return new Response('temporary failure', { status: 503 });
    }
    const filePath = path.join(resourceDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return new Response('missing', { status: 404 });
    return new Response(fs.readFileSync(filePath, 'utf8'), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } finally {
    activeFetches -= 1;
  }
};
const loadedFromResources = await persistence.loadAllBundledStoryWeavingPresets();
assert.equal(loadedFromResources.系列列表.length, 14, '14 个拆分资源必须全部加载');
assert.equal(maxActiveFetches, 1, '拆分资源必须顺序解析，避免并发内存峰值');
assert.equal(retryTargetAttempts, 2, '临时失败的资源必须使用 reload 再试一次');

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const id = path.basename(new URL(String(input), 'http://localhost').pathname, '.json');
  if (id === 'story_canon_side_xianzhou_foxian_tale') return new Response('missing', { status: 404 });
  return originalFetch(input, init);
};
await assert.rejects(
  () => persistence.loadAllBundledStoryWeavingPresets(),
  /内置原著剧情资源不完整/,
  '永久缺少资源时必须拒绝半残系统',
);
const baselineSeries = baseline.系列列表[0];
const baselineSegment = baselineSeries.分段列表[0];
assert(baselineSegment.原文内容.length > 100, '测试基线必须包含原著正文');

const customSeries = model.归一化剧情编织系列({
  ...structuredClone(baselineSeries),
  id: 'story_custom_persistence_test',
  标题: '自定义剧情持久化测试',
  作品名: '自定义剧情持久化测试',
  来源类型: 'custom',
  内置预设ID: undefined,
  原始文本: '玩家自定义原文，必须完整保留。',
  updatedAt: 1900000000000,
});
const modifiedSegment = {
  ...baselineSegment,
  标题: '玩家修改后的原著分段',
  本段概括: '玩家手工保存的阶段概括',
  前段延续事实: ['玩家修改的延续事实'],
  本段结束状态: ['玩家修改的结束条件'],
  给后续参考: ['玩家修改的后续参考'],
  登场角色: ['测试角色'],
  涉及地点: ['测试地点'],
  涉及派系: ['测试派系'],
  处理状态: '已完成',
  运行状态: '当前',
  updatedAt: 1900000000001,
};
const modifiedSeries = model.归一化剧情编织系列({
  ...baselineSeries,
  标题: '玩家重命名的原著轨道',
  当前阶段概括: '玩家保存的当前阶段概括',
  当前分段组号: modifiedSegment.组号,
  分段列表: baselineSeries.分段列表.map((segment) => segment.id === modifiedSegment.id ? modifiedSegment : segment),
  updatedAt: 1900000000002,
});
const modifiedSystem = model.归一化剧情编织系统({
  系列列表: [modifiedSeries, ...baseline.系列列表.slice(1), customSeries],
  当前系列ID: modifiedSeries.id,
  当前进度: {
    当前系列ID: modifiedSeries.id,
    当前分段ID: modifiedSegment.id,
    当前分段组号: modifiedSegment.组号,
    推进状态: '推进中',
    已完成摘要: ['已完成摘要必须保留'],
    当前待解问题: ['待解问题必须保留'],
    切换说明: ['切换说明必须保留'],
    历史归档: [],
    最近门禁结果: 'strong',
    最近判定理由: ['判定理由必须保留'],
    最近一次推进判定回合: 77,
    推进证据: ['推进证据必须保留'],
    连续推进证据回合: 3,
    卡段回合数: 2,
    updatedAt: 1900000000003,
  },
});

const persisted = persistence.buildPersistedStoryWeavingSystem(modifiedSystem);
assert.equal(persisted.persistenceVersion, 3, '新持久化格式版本应为 3');
assert.equal(persistence.isSelfContainedStoryWeavingSystem(persisted), false, '轻量状态不能被误当成完整离线回退');
const persistedCanon = persisted.系列列表.find((series) => series.id === modifiedSeries.id);
const persistedSegment = persistedCanon.分段列表.find((segment) => segment.id === modifiedSegment.id);
assert.equal(persistedCanon.章节列表.length, 0, '内置章节全文不应重复持久化');
assert.equal(persistedCanon.原始文本, undefined, '内置原始全文不应重复持久化');
assert.equal(persistedSegment.原文内容, undefined, '内置分段原文不应重复持久化');
assert.equal(persistedSegment.本段概括, modifiedSegment.本段概括, '玩家修改的分解结果必须进入持久态');

const hydrated = persistence.hydratePersistedStoryWeavingSystem(persisted, baseline);
const hydratedSeries = hydrated.系列列表.find((series) => series.id === modifiedSeries.id);
const hydratedSegment = hydratedSeries.分段列表.find((segment) => segment.id === modifiedSegment.id);
assert.equal(hydratedSeries.标题, modifiedSeries.标题, '原著轨道重命名必须恢复');
assert.equal(hydratedSeries.当前阶段概括, modifiedSeries.当前阶段概括, '当前阶段概括必须恢复');
assert.equal(hydratedSegment.本段概括, modifiedSegment.本段概括, '玩家修改的分解结果必须恢复');
assert.deepEqual(hydratedSegment.本段结束状态, modifiedSegment.本段结束状态, '玩家修改的结束条件必须恢复');
assert.equal(hydratedSegment.原文内容, baselineSegment.原文内容, '静态原著正文必须从资源补全');
assert.deepEqual(hydrated.当前进度.已完成摘要, modifiedSystem.当前进度.已完成摘要, '当前进度摘要必须恢复');
assert.equal(hydrated.当前进度.最近一次推进判定回合, 77, '推进判定回合必须恢复');
const hydratedCustom = hydrated.系列列表.find((series) => series.id === customSeries.id);
assert.equal(hydratedCustom.原始文本, customSeries.原始文本, '自定义剧情原文必须完整保留');
assert.equal(hydratedCustom.分段列表[0].原文内容, customSeries.分段列表[0].原文内容, '自定义剧情分段必须完整保留');

const oldFullHydrated = persistence.hydratePersistedStoryWeavingSystem(modifiedSystem, baseline);
assert.equal(oldFullHydrated.系列列表[0].当前阶段概括, modifiedSeries.当前阶段概括, '旧版完整数据必须兼容');
assert.equal(oldFullHydrated.当前进度.最近一次推进判定回合, 77, '旧版完整数据进度必须兼容');

const v2 = {
  persistenceVersion: 2,
  系列列表: [{
    id: baselineSeries.id,
    标题: baselineSeries.标题,
    作品名: baselineSeries.作品名,
    来源类型: 'canon',
    来源智库条目ID: [],
    内置预设ID: baselineSeries.内置预设ID,
    章节列表: [],
    分段列表: [{
      id: baselineSegment.id,
      组号: baselineSegment.组号,
      启用注入: false,
      处理状态: '已完成',
      运行状态: '当前',
      updatedAt: 1900000000010,
    }],
    每段章数: 1,
    激活注入: true,
    当前分段组号: baselineSegment.组号,
    当前阶段概括: 'v2 阶段概括',
    核心角色摘要: [],
    核心角色: [],
    涉及地点索引: [],
    涉及派系索引: [],
    createdAt: baselineSeries.createdAt,
    updatedAt: 1900000000011,
  }],
  当前系列ID: baselineSeries.id,
  当前进度: modifiedSystem.当前进度,
};
const v2Hydrated = persistence.hydratePersistedStoryWeavingSystem(v2, baseline);
assert.equal(v2Hydrated.系列列表[0].分段列表[0].原文内容, baselineSegment.原文内容, 'v2 极简状态必须补全原著正文');
assert.equal(v2Hydrated.当前进度.最近一次推进判定回合, 77, 'v2 当前进度必须保留');

const fullBytes = Buffer.byteLength(JSON.stringify(modifiedSystem));
const persistedBytes = Buffer.byteLength(JSON.stringify(persisted));
assert(persistedBytes < fullBytes * 0.2, `持久态应显著小于完整状态：${persistedBytes}/${fullBytes}`);
console.log(`story-weaving persistence behavior regression ok: persisted=${persistedBytes}, full=${fullBytes}`);