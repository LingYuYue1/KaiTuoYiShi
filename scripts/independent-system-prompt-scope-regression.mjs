import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};

const scopeHelper = read('services/promptModuleScopes.ts');
const expectedMatchers = {
  news: "news: [(id) => id.startsWith('builtin_news_')]",
  phoneBuiltin: "(id) => id.startsWith('builtin_phone_')",
  phoneCustom: "(id) => id.startsWith('custom_phone_')",
  phoneImported: "(id) => id.startsWith('st_import_phone_')",
  variablePrefix: "(id) => id.startsWith('builtin_variable_')",
  variableCompanion: "(id) => id === 'builtin_companion_archive_worldbook'",
  zhikuBuiltin: "(id) => id.startsWith('builtin_zhiku_')",
  zhikuCustom: "(id) => id.startsWith('custom_zhiku_')",
  yitingRecall: "yitingRecall: [(id) => id === 'builtin_yiting_recall']",
  yitingArchive: "yitingArchive: [(id) => id.startsWith('builtin_yiting_archive_')]",
  storyWeaving: "storyWeaving: [(id) => id.startsWith('builtin_story_weaving_')]",
};
for (const [name, snippet] of Object.entries(expectedMatchers)) {
  assert(scopeHelper.includes(snippet), `promptModuleScopes missing matcher: ${name}`);
}
assert(scopeHelper.includes("module.scope?.includes('calibration')"), 'independent helper must still require calibration scope');

const files = {
  news: 'services/ai/newsModel.ts',
  phone: 'services/ai/phoneService.ts',
  variable: 'services/ai/variableModel.ts',
  zhiku: 'services/zhikuRetrieval.ts',
  yitingRecall: 'services/yitingRetrieval.ts',
  yitingArchive: 'services/yitingArchive.ts',
  storyWeaving: 'services/storyWeaving.ts',
};

for (const [target, file] of Object.entries(files)) {
  const text = read(file);
  assert(text.includes("@/services/promptModuleScopes"), `${file} must import independent prompt scope helper`);
  const callTarget = target === 'yitingRecall' ? 'yitingRecall' : target;
  // 智库V3 改用 filterIndependentPromptModules 获取数组后自定义拼接，其余系统仍用 buildIndependentPromptModulesSection
  const usesBuild = text.includes(`buildIndependentPromptModulesSection(promptModules, '${callTarget}'`);
  const usesFilter = text.includes(`filterIndependentPromptModules(promptModules, '${callTarget}'`);
  assert(usesBuild || usesFilter, `${file} must use ${callTarget} scoped prompt modules (via build or filter helper)`);
  assert(!text.includes(".filter((m) => m.enabled && m.scope?.includes('calibration'))"), `${file} must not read the whole calibration prompt pool`);
  assert(!text.includes(".filter((m) => m.enabled && m.scope?.includes('calibration') && m.category === 'format')"), `${file} must not read the whole calibration format pool`);
}
assert(read(files.yitingArchive).includes("buildIndependentPromptModulesSection(promptModules, 'yitingArchive', { category: 'format' })"), 'yiting archive must only read archive format modules');

const builtin = read('data/builtinPromptModules.ts');
const moduleBlocks = builtin.split(/makeBuiltin\(\{/).slice(1).map((block) => block.split(/\n\s*\}\),/)[0] ?? block);
const moduleIds = moduleBlocks
  .map((block) => block.match(/id: '([^']+)'/)?.[1])
  .filter(Boolean);
const calibrationIds = moduleBlocks
  .filter((block) => /scope:\s*\['calibration'\]/.test(block))
  .map((block) => block.match(/id: '([^']+)'/)?.[1])
  .filter(Boolean);

const groups = {
  news: calibrationIds.filter((id) => id.startsWith('builtin_news_')),
  phone: calibrationIds.filter((id) => id.startsWith('builtin_phone_')),
  variable: calibrationIds.filter((id) => id.startsWith('builtin_variable_') || id === 'builtin_companion_archive_worldbook'),
  zhiku: calibrationIds.filter((id) => id.startsWith('builtin_zhiku_')),
  yitingRecall: calibrationIds.filter((id) => id === 'builtin_yiting_recall'),
  yitingArchive: calibrationIds.filter((id) => id.startsWith('builtin_yiting_archive_')),
  storyWeaving: calibrationIds.filter((id) => id.startsWith('builtin_story_weaving_')),
};

assert(groups.news.length === 3, `news should have 3 modules, got ${groups.news.length}`);
assert(groups.phone.length === 4, `phone should have 4 modules including the default style, got ${groups.phone.length}`);
assert(groups.variable.length === 4, `variable should have 4 modules including companion archive, got ${groups.variable.length}`);
assert(groups.zhiku.length === 2, `zhiku should have 2 modules, got ${groups.zhiku.length}`);
assert(groups.yitingRecall.length === 1, `yiting recall should have 1 module, got ${groups.yitingRecall.length}`);
assert(groups.yitingArchive.length === 1, `yiting archive should have 1 module, got ${groups.yitingArchive.length}`);
assert(groups.storyWeaving.length === 3, `story weaving should have 3 modules, got ${groups.storyWeaving.length}`);

const knownIndependentIds = new Set(Object.values(groups).flat());
const unassignedCalibrationIds = calibrationIds.filter((id) => !knownIndependentIds.has(id));
assert(unassignedCalibrationIds.length === 0, `unassigned calibration modules: ${unassignedCalibrationIds.join(', ')}`);

assert(moduleIds.includes('builtin_news_cot') && moduleIds.includes('builtin_phone_cot') && moduleIds.includes('builtin_variable_cot'), 'expected core independent builtin modules to remain registered');

console.log('PASS: independent system prompt modules are isolated by system target.');
