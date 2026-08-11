import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const source = JSON.parse(read('data/storyWeavingCanonDecomposed.json'));
const seriesList = Array.isArray(source.系列列表) ? source.系列列表 : [];
const resourceDir = path.join(root, 'public/data/story-weaving-canon');
const resourceFiles = fs.readdirSync(resourceDir).filter((name) => name.endsWith('.json')).sort();

assert.equal(seriesList.length, 28, '原著剧情应包含 28 个系列（完整主线资产替换后）');
assert.equal(resourceFiles.length, seriesList.length, '拆分资源数量必须与原著系列一致');

let largestResourceBytes = 0;
for (const series of seriesList) {
  const fileName = `${series.id}.json`;
  assert(resourceFiles.includes(fileName), `缺少拆分资源：${fileName}`);
  const raw = read(`public/data/story-weaving-canon/${fileName}`);
  largestResourceBytes = Math.max(largestResourceBytes, Buffer.byteLength(raw));
  assert.deepEqual(JSON.parse(raw), series, `${fileName} 必须与原始系列完全一致`);
}
assert(largestResourceBytes < 1_500_000, `单个剧情资源过大：${largestResourceBytes} bytes`);

const presetSource = read('data/storyWeavingPreset.ts');
assert(!presetSource.includes("import('@/data/storyWeavingCanonDecomposed.json')"), '运行时不得再导入 7MB 总 JSON');
assert(presetSource.includes('fetch(getCanonResourceUrl(presetId)'), '剧情资源必须按系列 fetch');
assert(presetSource.includes('for (const preset of bundledStoryWeavingPresets)'), '剧情资源必须顺序加载');
assert(!presetSource.includes('Promise.all(bundledStoryWeavingPresets.map'), '剧情资源不得并行解析');
assert(presetSource.includes('buildPersistedStoryWeavingSystem'), '必须提供轻量持久化构建器');
assert(presetSource.includes('hydratePersistedStoryWeavingSystem'), '必须提供旧数据/轻量数据补全器');
assert(presetSource.includes('persistenceVersion: 3'), '持久化格式必须保存可编辑分解结果');
assert(presetSource.includes('当前进度: normalizedSaved.当前进度 ?? bundled.当前进度'), '补全时必须保留当前进度');
assert(presetSource.includes('内置原著剧情资源不完整'), '缺失任意原著资源时必须阻止半残状态落库');
assert(presetSource.includes("['force-cache', 'reload']"), '原著资源失败后必须重试一次');

const writeFiles = [
  'App.tsx',
  'hooks/useGame.ts',
  'hooks/useGameState.ts',
  'hooks/useGame/saveLoadWorkflow.ts',
  'hooks/useGame/sendWorkflow.ts',
  'components/features/GameSystems/PlotPanel.tsx',
];
for (const file of writeFiles) {
  const sourceText = read(file);
  const writes = [...sourceText.matchAll(/saveSetting\('storyWeavingSystem',\s*([^\n;]+)\)/g)];
  for (const write of writes) {
    assert(write[1].includes('buildPersistedStoryWeavingSystem'), `${file} 仍在全量保存剧情编织：${write[0]}`);
  }
}

const sendSource = read('hooks/useGame/sendWorkflow.ts');
assert(!sendSource.includes('cloneForSnapshot(state.剧情编织)'), '每回合不得深拷贝完整剧情编织');
assert(!sendSource.includes('cloneForSnapshot(state.相册)'), '每回合不得先深拷贝完整相册再压缩');
assert(sendSource.includes('const preTurnSnapshot = compactPreTurnSnapshot({'), '快照必须直接从运行态构造压缩版本');
assert(sendSource.includes('rollbackSnapshotOnAbort = preTurnSnapshot'), '中止回滚应复用轻量快照');

const compactorSource = read('utils/saveRuntimeCompactor.ts');
assert(compactorSource.includes('buildPersistedStoryWeavingSystem'), '回合快照必须轻量化剧情编织');
const restoreSource = read('hooks/useGame/turnSnapshot.ts');
assert(restoreSource.includes('hydratePersistedStoryWeavingSystem'), '回滚轻量快照时必须补全原著数据');

const persistedOverlay = {
  persistenceVersion: 3,
  系列列表: seriesList.map((series) => ({
    ...series,
    来源智库条目ID: [],
    原始文本: undefined,
    章节列表: [],
    分段列表: (series.分段列表 ?? []).map((segment) => {
      const { 原文内容: _originalContent, ...persistedSegment } = segment;
      return persistedSegment;
    }),
  })),
  当前系列ID: source.当前系列ID,
  当前进度: source.当前进度,
};
const fullBytes = Buffer.byteLength(JSON.stringify(source));
const overlayBytes = Buffer.byteLength(JSON.stringify(persistedOverlay));
assert(overlayBytes < fullBytes * 0.30, `轻量状态仍过大：${overlayBytes}/${fullBytes} bytes`);

console.log(`story-weaving memory regression ok: ${seriesList.length} resources, largest=${largestResourceBytes}, overlay=${overlayBytes}, full=${fullBytes}`);
