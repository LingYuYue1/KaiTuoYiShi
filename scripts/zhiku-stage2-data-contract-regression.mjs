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
const bundlePath = path.join(os.tmpdir(), `zhiku-v3-contract-${process.pid}-${Date.now()}.mjs`);
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
  const sourceFiles = fs.readdirSync(presetDir).filter((name) => name.endsWith('.json')).sort();
  assert(sourceFiles.length === 23, `expected 23 V3 source JSON files, received ${sourceFiles.length}`);
  for (const fileName of retiredV1CharacterFiles) {
    assert(!fs.existsSync(path.join(presetDir, fileName)), `retired V1 source must stay deleted: ${fileName}`);
  }
  assert(!fs.existsSync(path.join(root, 'data', 'zhikuIdentityRegistry.ts')), 'retired identity registry must stay deleted');
  assert(!fs.existsSync(path.join(root, 'scripts', 'zhiku-stage2-legacy-save-acceptance.mjs')), 'legacy-save acceptance test must stay deleted');

  const rawEntries = sourceFiles.flatMap((name) => {
    const data = JSON.parse(fs.readFileSync(path.join(presetDir, name), 'utf8'));
    assert(Array.isArray(data.entries), `${name} must expose an entries array`);
    return data.entries;
  });
  assert(rawEntries.length === 162, `expected 162 V3 source entries, received ${rawEntries.length}`);
  assert(rawEntries.every((entry) => /^[A-Z]{2}-\d{3}$/u.test(entry.id)), 'every source entry must own an AA-000 machine ID');
  assert(new Set(rawEntries.map((entry) => entry.id)).size === rawEntries.length, 'source machine IDs must be unique');
  assert(rawEntries.every((entry) => !Object.hasOwn(entry, '兼容ID')), 'source entries must not carry compatibility aliases');
  assert(rawEntries.every((entry) => entry.分类 !== 'story'), 'injectable V3 sources must not contain story archives');

  await build({
    stdin: {
      contents: [
        "export * from './data/zhikuCustomGovernance';",
        "export * from './data/zhikuPreset';",
        "export * from './models/zhiku';",
        "export * from './models/zhikuGovernance';",
        "export * from './services/zhikuRetrieval';",
        "export * from './components/features/ZhikuV3/productionAdapter';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-v3-data-contract-entry.ts',
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
  const loaded = await api.loadAllBundledZhikuPresets();
  assert(loaded.条目.length === 162, `V3 loader must return 162 entries, received ${loaded.条目.length}`);
  equalJson([...loaded.条目.map((entry) => entry.id)].sort(), [...rawEntries.map((entry) => entry.id)].sort(), 'loader must preserve source-owned IDs');
  assert(loaded.条目.every((entry) => !Object.hasOwn(entry, '兼容ID')), 'normalized runtime entries must not expose compatibility aliases');
  assert(loaded.条目.every((entry) => entry.来源预设ID && entry.来源文件 && Number.isInteger(entry.来源序号)), 'every V3 entry must retain source traceability');
  assert(loaded.条目.every((entry) => entry.builtin && entry.资料所有者 === 'builtin-json'), 'every loaded source must remain builtin-owned');

  const byCategory = Object.fromEntries(
    Object.keys(api.ZHIKU_CATEGORY_POLICIES).map((category) => [category, loaded.条目.filter((entry) => entry.治理分类 === category).length]),
  );
  equalJson(byCategory, {
    character: 98, story: 0, location: 12, faction: 4, event: 4,
    enemy: 1, aeon: 19, path: 19, term: 5,
  }, 'active category counts changed');

  const theHerta = api.按ID查找智库条目(loaded, 'JS-099');
  assert(theHerta?.标题 === '大黑塔', 'JS-099 must remain bound to The Herta');
  assert(api.按ID查找智库条目(loaded, 'JS-012B') === undefined, 'retired alias JS-012B must not resolve');
  assert(api.按ID查找智库条目(loaded, 'zhiku_character_rebuild_stelle_profile') === undefined, 'retired source IDs must not resolve');
  assert(loaded.条目.some((entry) => entry.id === 'DS-000' && entry.治理分类 === 'enemy' && entry.标题 === '归寂'), 'DS-000 must load directly from its V3 source');

  const firstLocation = loaded.条目.find((entry) => entry.治理分类 === 'location');
  assert(firstLocation, 'location fixture is missing');
  const mergedOverrides = api.mergeZhikuRuntimeUnlockOverrides(loaded.条目, [{
    ...firstLocation,
    运行时解锁状态: '已解锁',
    运行时解锁备注: 'v3-runtime-fixture',
  }]);
  assert(mergedOverrides.find((entry) => entry.id === firstLocation.id)?.运行时解锁备注 === 'v3-runtime-fixture', 'runtime override must merge by exact V3 ID');

  const persistedWithoutOverrides = api.buildPersistedZhikuSystem(loaded);
  assert(persistedWithoutOverrides.条目.length === 0, 'builtin source bodies must not be copied into persistence');
  const persistedOverride = api.buildPersistedZhikuSystem({ 条目: mergedOverrides });
  assert(persistedOverride.条目.length === 1, 'runtime unlock override must remain persistable');
  assert(!persistedOverride.条目[0].原文 && !Object.hasOwn(persistedOverride.条目[0], '兼容ID'), 'persisted override must stay lightweight and alias-free');

  const custom = {
    ...loaded.条目.find((entry) => entry.分类 === 'location'),
    id: 'ZZ-000',
    标题: 'V3 自制地点',
    builtin: false,
    资料所有者: 'custom-user-data',
  };
  const retiredCustom = { ...custom, id: 'zhiku_legacy_custom' };
  const composed = api.composeZhikuSystem(loaded, { 条目: [persistedOverride.条目[0], custom, retiredCustom] });
  assert(composed.条目.some((entry) => entry.id === 'ZZ-000'), 'current ZZ custom data must survive V3 composition');
  assert(!composed.条目.some((entry) => entry.id === retiredCustom.id), 'retired custom IDs must not migrate into V3');
  assert(composed.条目.find((entry) => entry.id === firstLocation.id)?.运行时解锁备注 === 'v3-runtime-fixture', 'V3 composition must restore exact runtime overrides');

  const production = api.buildZhikuProductionData(loaded, { 系列列表: [] });
  assert(production.archiveItems.character.some((item) => item.id === 'JS-000' && item.title === '星'), 'player display names must remain independent from machine IDs');
  assert(production.storyArchivePolicy.viewMode === 'view-only', 'story archive must remain view-only');
  assert(production.storyArchivePolicy.injectionPolicy === 'never', 'story archive must never inject');
  assert(production.storyArchivePolicy.participatesInRecall === false, 'story archive must not enter recall candidates');

  const storyFixture = {
    ...firstLocation,
    id: 'JQ-999',
    治理分类: 'story',
    分类: 'story',
    可否主剧情注入: true,
    可用于联动: true,
  };
  const candidateSystem = api.buildZhikuRecallCandidateSystem({ 条目: [storyFixture, firstLocation] });
  assert(candidateSystem.条目.length === 1 && candidateSystem.条目[0].id === firstLocation.id, 'story archives must be removed before candidate discovery');

  console.log(JSON.stringify({
    sourceFiles: sourceFiles.length,
    sourceEntries: rawEntries.length,
    activeEntries: loaded.条目.length,
    categoryCounts: byCategory,
  }));
  console.log('ZHIKU_STAGE2_DATA_CONTRACT_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
