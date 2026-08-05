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
];

for (const retiredPath of retiredPaths) {
  assert(!fs.existsSync(path.join(root, retiredPath)), `retired Zhiku artifact still exists: ${retiredPath}`);
}

const requiredPaths = [
  'components/features/ZhikuV3/ZhikuManagerModal.tsx',
  'components/features/ZhikuV3/ZhikuExperience.tsx',
  'components/features/ZhikuV3/ZhikuMaintenancePanel.tsx',
  'components/features/ZhikuV3/productionAdapter.ts',
  'components/features/ZhikuV3/zhiku-v3.css',
  'public/assets/zhiku/archive-hall-background.webp',
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
assert(experience.includes("from '@/components/features/ZhikuV3/ZhikuMaintenancePanel'"), 'V3 maintenance must use the unified V3 component');
assert(adapter.includes('export function resolveZhikuCategory'), 'production adapter must expose the version-neutral category resolver');
assert(!packageJson.includes('prototype:zhiku-ai-retrieval'), 'retired Zhiku prototype command must not remain runnable');

for (const migrationContract of [
  'mergeBundledZhikuSystem',
  'hydratePersistedZhikuSystem',
  'shouldRemoveLegacyZhikuCharacterEntry',
  'removeRetiredZhikuEntries',
]) {
  assert(preset.includes(migrationContract), `legacy save migration contract was removed: ${migrationContract}`);
}

const scanRoots = ['App.tsx', 'components/features/ZhikuV3', 'stories'];
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
];

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of forbiddenTokens) {
    assert(!source.includes(token), `${path.relative(root, file)} still references retired Zhiku token: ${token}`);
  }
}

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
