import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equalJson(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
}

const root = process.cwd();
const presetDir = path.join(root, 'public', 'zhiku-presets');
const bundlePath = path.join(os.tmpdir(), `zhiku-stage2-contract-${process.pid}-${Date.now()}.mjs`);
const retiredV1CharacterFiles = [
  'amphoreus-characters.json',
  'express-characters.json',
  'express-support-characters.json',
  'faction-characters.json',
  'genius-society-characters.json',
  'herta-station-characters.json',
  'jarilo-vi-characters.json',
  'penacony-characters.json',
  'xianzhou-alliance-characters.json',
  'xianzhou-luofu-characters.json',
];

try {
  const allSourceFiles = fs.readdirSync(presetDir).filter((name) => name.endsWith('.json')).sort();
  assert(allSourceFiles.length === 23, `expected 23 formal source JSON files, received ${allSourceFiles.length}`);
  for (const fileName of retiredV1CharacterFiles) {
    assert(!fs.existsSync(path.join(presetDir, fileName)), `retired V1 character source must stay deleted: ${fileName}`);
  }
  const allSourceEntries = allSourceFiles.flatMap((name) => {
    const data = JSON.parse(fs.readFileSync(path.join(presetDir, name), 'utf8'));
    assert(Array.isArray(data.entries), `${name} must expose an entries array`);
    return data.entries;
  });
  assert(allSourceEntries.length === 162, `expected current 162 formal source entries, received ${allSourceEntries.length}`);

  await build({
    stdin: {
      contents: [
        "export * from './data/zhikuIdentityRegistry';",
        "export * from './data/zhikuCustomGovernance';",
        "export * from './data/zhikuPreset';",
        "export * from './models/zhiku';",
        "export * from './models/zhikuGovernance';",
        "export * from './services/zhikuRetrieval';",
        "export * from './components/features/ZhikuV3/productionAdapter';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage2-data-contract-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outfile: bundlePath,
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
  });

  globalThis.fetch = async (input) => {
    const requestPath = String(input).split('?')[0].replace(/^\//u, '');
    const filePath = path.join(root, 'public', requestPath);
    if (!fs.existsSync(filePath)) return new Response('', { status: 404 });
    return new Response(fs.readFileSync(filePath), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const api = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const registry = api.ZHIKU_BUNDLED_IDENTITY_REGISTRY;
  assert(registry.length === 162, `identity registry must cover 162 active entries, received ${registry.length}`);

  const ids = registry.map((entry) => entry.id);
  const legacyIds = registry.map((entry) => entry.legacyId);
  assert(new Set(ids).size === ids.length, 'short machine ids must be unique');
  assert(new Set(legacyIds).size === legacyIds.length, 'legacy ids must be unique');
  assert(registry.every((entry) => api.ZHIKU_MACHINE_ID_PATTERN.test(entry.id)), 'all machine ids must use AA-000 format');
  assert(api.ZHIKU_CUSTOM_ID_PREFIX === 'ZZ', 'custom data machine id prefix must remain ZZ');
  assert(!registry.some((entry) => entry.id.startsWith(`${api.ZHIKU_CUSTOM_ID_PREFIX}-`)), 'builtin identity registry must not consume custom ZZ ids');
  assert(registry.some((entry) => entry.id === 'JS-000' && entry.sourceTitle === '星'), 'JS-000 must remain bound to the first registered character');
  assert(
    api.resolveBundledZhikuIdentity('zhiku_character_rebuild_core', 0, 'zhiku_character_rebuild_stelle_profile', '错误标题') === undefined,
    'source title drift must not silently bind a short id to another entry',
  );

  const expectedPrefixes = {
    character: 'JS', story: 'JQ', location: 'DD', faction: 'PX', event: 'SJ',
    enemy: 'DS', aeon: 'XS', path: 'MT', term: 'MY',
  };
  equalJson(
    Object.fromEntries(Object.entries(api.ZHIKU_CATEGORY_POLICIES).map(([key, value]) => [key, value.machineIdPrefix])),
    expectedPrefixes,
    'category prefixes changed',
  );

  for (const item of registry) {
    const source = JSON.parse(fs.readFileSync(path.join(presetDir, item.sourceFile), 'utf8'));
    const entry = source.entries[item.sourceIndex];
    assert(entry, `${item.id} source entry is missing`);
    assert(entry['标题'] === item.sourceTitle, `${item.id} source title drifted: ${entry['标题']} !== ${item.sourceTitle}`);
    const sourceLegacyId = entry.id || `${item.presetId}_${item.sourceIndex + 1}`;
    assert(sourceLegacyId === item.legacyId, `${item.id} legacy binding drifted`);
    assert(!api.ZHIKU_MACHINE_ID_PATTERN.test(entry.id ?? ''), `${item.sourceFile} was overwritten with runtime machine ids`);
  }

  const loaded = await api.loadAllBundledZhikuPresets();
  assert(loaded.条目.length === 162, `active loader must return 162 entries, received ${loaded.条目.length}`);
  assert(loaded.条目.every((entry) => api.ZHIKU_MACHINE_ID_PATTERN.test(entry.id)), 'every active bundled entry must receive a short machine id');
  assert(loaded.条目.every((entry) => entry.兼容ID?.length >= 1), 'every active bundled entry must retain its legacy id');
  const theHerta = loaded.条目.find((entry) => entry.id === 'JS-099');
  assert(theHerta?.标题 === '大黑塔', 'JS-099 must remain bound to The Herta');
  assert(theHerta.兼容ID.includes('JS-012B'), 'The Herta must retain JS-012B as a compatibility id');
  assert(api.按ID查找智库条目(loaded, 'JS-012B') === theHerta, 'legacy JS-012B must resolve to JS-099');
  assert(loaded.条目.every((entry) => entry.来源预设ID && entry.来源文件 && Number.isInteger(entry.来源序号)), 'every migrated entry must retain source traceability');
  assert(
    loaded.条目.some((entry) => entry.id === 'DS-000' && entry.治理分类 === 'enemy' && entry.标题 === '归寂'),
    'the first audited enemy archive must load through its stable identity',
  );
  assert(api.按ID查找智库条目(loaded, 'JS-098')?.id === 'DS-000', 'legacy Guiji character id must resolve to DS-000');

  const byCategory = Object.fromEntries(
    Object.keys(expectedPrefixes).map((category) => [category, loaded.条目.filter((entry) => entry.治理分类 === category).length]),
  );
  equalJson(byCategory, {
    character: 98, story: 0, location: 12, faction: 4, event: 4,
    enemy: 1, aeon: 19, path: 19, term: 5,
  }, 'active category counts changed');

  for (const item of registry) {
    const byShortId = api.按ID查找智库条目(loaded, item.id);
    const byLegacyId = api.按ID查找智库条目(loaded, item.legacyId);
    assert(byShortId && byShortId === byLegacyId, `${item.id} cannot be resolved through both short and legacy ids`);
  }

  const firstLocation = loaded.条目.find((entry) => entry.治理分类 === 'location');
  assert(firstLocation, 'location fixture is missing');
  const legacyLocationId = firstLocation.兼容ID[0];
  const savedLegacyOverride = {
    ...firstLocation,
    id: legacyLocationId,
    兼容ID: [],
    运行时解锁状态: '已解锁',
    运行时解锁备注: 'legacy-save-fixture',
  };
  const mergedOverrides = api.mergeZhikuRuntimeUnlockOverrides(loaded.条目, [savedLegacyOverride]);
  const restoredLocation = mergedOverrides.find((entry) => entry.id === firstLocation.id);
  assert(restoredLocation?.运行时解锁备注 === 'legacy-save-fixture', 'legacy save override did not migrate to the short id entry');

  const persistedWithoutOverrides = api.buildPersistedZhikuSystem(loaded);
  assert(persistedWithoutOverrides.条目.length === 0, 'bundled source content must not be copied into persistence');
  const persistedOverride = api.buildPersistedZhikuSystem({ 条目: [restoredLocation] });
  assert(persistedOverride.条目.length === 1, 'runtime unlock override must remain persistable');
  assert(!persistedOverride.条目[0].原文 && persistedOverride.条目[0].兼容ID.includes(legacyLocationId), 'persisted override must stay lightweight and reversible');

  const production = api.buildZhikuProductionData(loaded, { 系列列表: [] });
  const stelle = production.archiveItems.character.find((item) => item.id === 'JS-000');
  assert(stelle?.title === '星', `player display name changed with machine id: ${stelle?.title}`);
  assert(production.storyArchivePolicy.viewMode === 'view-only', 'story archive must be view-only');
  assert(Object.isFrozen(api.ZHIKU_CATEGORY_POLICIES) && Object.isFrozen(production.storyArchivePolicy), 'story archive policy must be immutable at runtime');
  assert(production.storyArchivePolicy.editable === false && production.storyArchivePolicy.writable === false, 'story archive must reject edits and writeback');
  assert(production.storyArchivePolicy.injectionPolicy === 'never', 'story archive must never inject');
  assert(production.storyArchivePolicy.participatesInRecall === false, 'story archive must not enter recall candidates');

  const legacyRuntime = {
    条目: loaded.条目.map((entry) => ({
      ...entry,
      id: entry.兼容ID?.[0] ?? entry.id,
      兼容ID: [],
      治理分类: undefined,
      资料所有者: undefined,
      来源预设ID: undefined,
      来源文件: undefined,
      来源序号: undefined,
    })),
  };
  const query = `${firstLocation.标题} ${loaded.条目.find((entry) => entry.治理分类 === 'event')?.标题 ?? ''}`;
  const beforeMigration = api.retrieveZhikuContext(legacyRuntime, query, 6);
  const afterMigration = api.retrieveZhikuContext(loaded, query, 6);
  equalJson(afterMigration.entries.map((entry) => entry.标题), beforeMigration.entries.map((entry) => entry.标题), 'ordinary recall titles changed during id migration');
  assert(afterMigration.injection === beforeMigration.injection, 'ordinary injection output changed during id migration');

  const storyFixture = {
    ...firstLocation,
    id: 'JQ-999',
    兼容ID: ['legacy-story-fixture'],
    治理分类: 'story',
    分类: 'story',
    标题: firstLocation.标题,
    可否主剧情注入: true,
    可用于联动: true,
  };
  const candidateSystem = api.buildZhikuRecallCandidateSystem({ 条目: [storyFixture, firstLocation] });
  assert(candidateSystem.条目.length === 1 && candidateSystem.条目[0].id === firstLocation.id, 'story archive was not removed before candidate discovery');
  const withStoryFixture = api.retrieveZhikuContext({ 条目: [storyFixture, ...loaded.条目] }, query, 6);
  equalJson(withStoryFixture.entries.map((entry) => entry.标题), afterMigration.entries.map((entry) => entry.标题), 'story archive changed ordinary candidate results');
  assert(withStoryFixture.injection === afterMigration.injection, 'story archive leaked into injection output');

  console.log(JSON.stringify({
    sourceFiles: allSourceFiles.length,
    sourceEntries: allSourceEntries.length,
    activeEntries: loaded.条目.length,
    categoryCounts: byCategory,
  }));
  console.log('ZHIKU_STAGE2_DATA_CONTRACT_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
