import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const retiredPaths = [
  'components/features/ZhikuV2',
  'components/features/GameSystems/ZhikuPanel.tsx',
  'components/features/GameSystems/ZhikuManagerModal.tsx',
  'components/features/ZhikuV3/ZhikuDesignLab.tsx',
  'components/features/ZhikuV3/zhiku-design-lab.css',
  'stories/ZhikuDesignLab.stories.tsx',
  'stories/ZhikuIconTrace.stories.tsx',
  'stories/zhiku-icon-trace.css',
  'scripts/zhiku-design-lab-regression.mjs',
  'scripts/zhiku-icon-trace-regression.mjs',
  'services/zhikuAiRetrieval.prototype.ts',
  'scripts/prototypes/zhiku-ai-retrieval-prototype.mjs',
  'data/zhikuIdentityRegistry.ts',
  'scripts/zhiku-stage2-legacy-save-acceptance.mjs',
  'components/features/ZhikuV3/ZhikuMaintenancePanel.tsx',
  'services/zhikuStage6Harness.ts',
  'services/zhikuStage6Runner.ts',
  'services/zhikuRunTrace.ts',
  'scripts/zhiku-stage6-harness-regression.mjs',
  'scripts/zhiku-stage6-preflight.mjs',
  'scripts/zhiku-stage6-real-runner-regression.mjs',
  'scripts/zhiku-stage6-run-trace-regression.mjs',
];

for (const retiredPath of retiredPaths) {
  assert(!fs.existsSync(path.join(root, retiredPath)), `retired Zhiku artifact still exists: ${retiredPath}`);
}

const requiredPaths = [
  'components/features/ZhikuV3/ZhikuManagerModal.tsx',
  'components/features/ZhikuV3/ZhikuExperience.tsx',
  'components/features/ZhikuV3/productionAdapter.ts',
  'components/features/ZhikuV3/zhiku-v3.css',
  'public/assets/zhiku/archive-hall-background.webp',
  'scripts/clean-generated-build-chunks.mjs',
];

for (const requiredPath of requiredPaths) {
  assert(fs.existsSync(path.join(root, requiredPath)), `V3 single-system artifact is missing: ${requiredPath}`);
}

const app = read('App.tsx');
const experience = read('components/features/ZhikuV3/ZhikuExperience.tsx');
const adapter = read('components/features/ZhikuV3/productionAdapter.ts');
const preset = read('data/zhikuPreset.ts');
const packageJson = read('package.json');

assert(app.includes("import('@/components/features/ZhikuV3/ZhikuManagerModal')"), 'App must load the V3 Zhiku entry directly');
assert(adapter.includes('export function resolveZhikuCategory'), 'production adapter must expose the version-neutral category resolver');
assert(!packageJson.includes('prototype:zhiku-ai-retrieval'), 'retired Zhiku prototype command must not remain runnable');
assert(packageJson.includes('node scripts/clean-generated-build-chunks.mjs'), 'production build must clean stale generated chunks before rebuilding');
assert(preset.includes('export function composeZhikuSystem'), 'V3 must expose one catalog/custom composition entry');

for (const retiredContract of [
  'mergeBundledZhikuSystem',
  'hydratePersistedZhikuSystem',
  'shouldRemoveLegacyZhikuCharacterEntry',
  'removeRetiredZhikuEntries',
  'ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY',
  '兼容ID',
]) {
  assert(!preset.includes(retiredContract), `retired Zhiku contract still exists: ${retiredContract}`);
}

const scanRoots = [
  'App.tsx',
  'components/features/ZhikuV3',
  'data/zhikuPreset.ts',
  'data/zhikuCatalogRepository.ts',
  'data/zhikuCustomGovernance.ts',
  'data/builtinWorldbookConfig.ts',
  'hooks/useGameState.ts',
  'hooks/useGame/saveLoadWorkflow.ts',
  'hooks/useGame/contextSnapshot.ts',
  'hooks/useGame/sendWorkflow.ts',
  'hooks/useGame/turnSnapshot.ts',
  'models/chat.ts',
  'models/zhiku.ts',
  'models/zhikuGovernance.ts',
  'models/settings.ts',
  'services/zhikuAiRetrievalIndex.ts',
  'services/zhikuRetrieval.ts',
  'services/zhikuRuntimeCompiler.ts',
  'services/zhikuRuntimeUnlock.ts',
  'components/features/Settings/ContextViewer.tsx',
  'components/features/Settings/SettingsModal.tsx',
  'components/features/Settings/ZhikuSettingsTab.tsx',
  'stories',
];
const sourceFiles = scanRoots.flatMap((scanRoot) => {
  const absolute = path.join(root, scanRoot);
  if (fs.statSync(absolute).isFile()) return [absolute];
  return walk(absolute).filter((file) => /\.(?:css|ts|tsx)$/u.test(file));
});
const forbiddenTokens = [
  'components/features/ZhikuV2',
  'zhiku-v2',
  '智库 V2',
  'resolveZhikuV2Category',
  'GameSystems/ZhikuPanel',
  'ZhikuDesignLab',
  '/assets/zhiku/icon-trace/',
  'zhiku-archive-hall-background-concept-v',
  'zhikuIdentityRegistry',
  '兼容ID',
  'ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY',
  'mergeBundledZhikuSystem',
  'hydratePersistedZhikuSystem',
  'buildCustomOnlyZhikuFallback',
  'zhiku_aeons_core_',
  'zhiku_paths_core_',
  'zhiku_character_rebuild_march_profile',
  '旧智库',
  '旧版人物资料',
  'ZhikuMaintenancePanel',
  'onOpenMaintenance',
  'showMaintenance',
  '维护智库',
  '智库维护工作台',
  'zhikuStage6Harness',
  'zhikuStage6Runner',
  'zhikuRunTrace',
  'ZhikuRunTrace',
  '本回合发送前预测',
  '智库本回合结构化预演',
  '智库上一回合结构化实发',
  '上一回合真实请求回执',
  '本回合预演（结构化）',
  '上一回合实发（结构化）',
  '阶段六 A/B',
  'A/B 预检',
];

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of forbiddenTokens) {
    assert(!source.includes(token), `${path.relative(root, file)} still references retired Zhiku token: ${token}`);
  }
}

const presetFiles = fs.readdirSync(path.join(root, 'public/zhiku-presets')).filter((file) => file.endsWith('.json'));
const rawEntries = presetFiles.flatMap((file) => JSON.parse(read(`public/zhiku-presets/${file}`)).entries ?? []);
assert(rawEntries.length === 162, `V3 source catalog must contain 162 entries, received ${rawEntries.length}`);
assert(rawEntries.every((entry) => /^[A-Z]{2}-\d{3}$/u.test(entry.id)), 'every V3 source entry must own its formal machine ID');
assert(new Set(rawEntries.map((entry) => entry.id)).size === rawEntries.length, 'V3 source IDs must be unique');
assert(rawEntries.every((entry) => !Object.hasOwn(entry, '兼容ID')), 'V3 source entries must not carry compatibility aliases');
assert(rawEntries.every((entry) => entry.分类 !== 'story'), 'story archives must remain outside the injectable Zhiku catalog');
const sourceIds = new Set(rawEntries.map((entry) => entry.id));
const danglingRelatedIds = rawEntries.flatMap((entry) => (
  (entry.关联条目ID ?? [])
    .filter((relatedId) => !sourceIds.has(relatedId))
    .map((relatedId) => `${entry.id}->${relatedId}`)
));
assert(danglingRelatedIds.length === 0, `V3 source catalog contains dangling related IDs: ${danglingRelatedIds.join(', ')}`);

const expectedEmblems = [
  'aeon-emblem-precision-c.svg',
  'enemy-emblem-precision-h.svg',
  'event-emblem-concept-a.svg',
  'faction-emblem-precision-a.svg',
  'gold-emblem-trace.svg',
  'location-emblem-concept-a.svg',
  'path-emblem-precision-c.svg',
  'story-archive-emblem-concept-a.svg',
  'term-emblem-precision-a.svg',
].sort();
const actualEmblems = fs.readdirSync(path.join(root, 'public/assets/zhiku/emblems')).sort();
assert(JSON.stringify(actualEmblems) === JSON.stringify(expectedEmblems), `V3 emblem set contains retired or missing assets: ${actualEmblems.join(', ')}`);

console.log('ZHIKU_V3_SINGLE_SYSTEM_REGRESSION_OK');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}
