import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-production-adapter-${process.pid}-${Date.now()}.mjs`);

try {
  await build({
    stdin: {
      contents: [
        "export * from './components/features/ZhikuV3/productionAdapter';",
        "export { loadAllBundledZhikuPresets } from './data/zhikuPreset';",
        "export { loadAllBundledStoryWeavingPresets } from './data/storyWeavingPreset';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-production-adapter-regression-entry.ts',
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

  const adapter = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const [zhikuSystem, storyWeavingSystem] = await Promise.all([
    adapter.loadAllBundledZhikuPresets(),
    adapter.loadAllBundledStoryWeavingPresets(),
  ]);
  const data = adapter.buildZhikuProductionData(zhikuSystem, storyWeavingSystem);

  assert(data.categories.length === 9, 'production category hub must contain exactly nine confirmed categories');
  assert(data.archiveItems.enemy.length === 0, 'Guiji must not remain in the player-facing enemy archive');
  assert(
    data.archiveItems.character.some((item) => item.id === 'DS-000' && item.title === '归寂'),
    'Guiji must use its current character identity in the character archive',
  );
  assert(data.archiveItems.character.length > 60, 'real character profiles must populate the character archive');
  const expectedAeons = zhikuSystem.条目.filter((entry) => (
    entry.治理分类 === 'aeon' && adapter.isZhikuEntryPlayerVisible(entry)
  )).length;
  const expectedPaths = zhikuSystem.条目.filter((entry) => (
    entry.治理分类 === 'path' && adapter.isZhikuEntryPlayerVisible(entry)
  )).length;
  assert(expectedAeons > 0 && data.archiveItems.aeon.length === expectedAeons, 'Aeon count must follow the current real preset');
  assert(expectedPaths > 0 && data.archiveItems.path.length === expectedPaths, 'Path count must follow the current real preset');
  assert(data.storyVolumes.length === storyWeavingSystem.系列列表.length, 'story volumes must come from story weaving');
  assert(data.storyVolumes.length >= 14, 'all bundled story weaving archives must be available to the reader');
  assert(!zhikuSystem.条目.some((entry) => entry.id === data.storyVolumes[0]?.id), 'story archives must not be copied from Zhiku entries');
  assert(data.storyArchivePolicy.viewMode === 'view-only', 'story archive must expose a view-only production contract');
  assert(data.storyArchivePolicy.injectionPolicy === 'never', 'story archive must expose a never-inject production contract');

  const internalIdLeak = data.archiveItems.character.find((item) => (
    /^[A-Z]{2}-\d{3}$/u.test(item.title) || /^zhiku_[a-z0-9_-]+$/iu.test(item.title)
  ));
  assert(!internalIdLeak, `internal character id leaked into player UI: ${internalIdLeak?.title}`);

  const danHengSourceEntries = zhikuSystem.条目.filter((entry) => entry.关联角色ID === '丹恒');
  assert(danHengSourceEntries.length === 3, 'Dan Heng must expose three independently injectable source entries');
  const danHengRows = data.archiveItems.character.filter((item) => item.title === '丹恒');
  assert(danHengRows.length === 1, 'multi-form characters must remain one row in the player catalog');
  assert(
    danHengRows[0].injectionVariants?.map((variant) => variant.label).join(',') === '常态,饮月,腾荒',
    'Dan Heng read-only injection variants must use the confirmed order',
  );
  const [normalVariant, imbibitorLunaeVariant, souldragonVariant] = danHengRows[0].injectionVariants ?? [];
  assert(
    normalVariant.secondaryKeywordLogic === 'NOT_ANY'
      && normalVariant.secondaryKeywords.includes('饮月')
      && normalVariant.secondaryKeywords.includes('腾荒'),
    'Dan Heng normal-form preview must expose its form-exclusion secondary keywords',
  );
  assert(
    imbibitorLunaeVariant.secondaryKeywordLogic === 'AND_ANY'
      && imbibitorLunaeVariant.secondaryKeywords.includes('饮月')
      && !imbibitorLunaeVariant.secondaryKeywords.includes('腾荒'),
    'Imbibitor Lunae preview must expose only its own positive secondary keywords',
  );
  assert(
    souldragonVariant.secondaryKeywordLogic === 'AND_ANY'
      && souldragonVariant.secondaryKeywords.includes('腾荒')
      && !souldragonVariant.secondaryKeywords.includes('饮月'),
    'Souldragon preview must expose only its own positive secondary keywords',
  );
  const marchSourceEntries = zhikuSystem.条目.filter((entry) => entry.关联角色ID === '三月七');
  assert(marchSourceEntries.length === 3, 'March 7th must expose normal, Hunt, and Evernight source entries');
  const marchRows = data.archiveItems.character.filter((item) => item.title === '三月七');
  assert(marchRows.length === 1, 'March 7th variants must remain one row in the player catalog');
  assert(
    marchRows[0].injectionVariants?.map((variant) => variant.label).join(',') === '常态,巡猎,长夜月',
    'March 7th read-only injection variants must use the confirmed order',
  );
  const [marchNormalVariant, marchHuntVariant, evernightVariant] = marchRows[0].injectionVariants ?? [];
  assert(
    marchNormalVariant.secondaryKeywordLogic === 'NOT_ANY'
      && marchNormalVariant.secondaryKeywords.includes('仙舟三月七')
      && marchNormalVariant.secondaryKeywords.includes('长夜月'),
    'March 7th normal preview must expose both special-form exclusion groups',
  );
  assert(
    marchHuntVariant.secondaryKeywordLogic === 'AND_ANY'
      && marchHuntVariant.secondaryKeywords.includes('演武仪典')
      && !marchHuntVariant.secondaryKeywords.includes('长夜月'),
    'March 7th Hunt preview must expose only Hunt-specific positive keywords',
  );
  assert(
    evernightVariant.secondaryKeywordLogic === 'AND_ANY'
      && evernightVariant.secondaryKeywords.includes('长月夜')
      && evernightVariant.secondaryKeywords.includes('记忆之影')
      && !evernightVariant.secondaryKeywords.includes('演武仪典'),
    'Evernight preview must expose only Evernight-specific positive keywords',
  );
  assert(data.archiveItems.character.length === 89, 'current 89 character subjects, including Guiji and excluding Zandar, must produce 89 player-facing rows');

  const lockedFixture = {
    ...zhikuSystem.条目.find((entry) => entry.分类 === 'location'),
    id: 'zhiku_v2_locked_fixture',
    标题: '隐藏地点',
    分类: 'location',
    运行时解锁状态: '未解锁',
  };
  const lockedResult = adapter.buildZhikuArchiveItems({ 条目: [lockedFixture] });
  assert(lockedResult.location.length === 0, 'locked entries must not leak their count or title into player browsing');

  const customTerm = {
    ...zhikuSystem.条目.find((entry) => entry.分类 === 'term'),
    id: 'custom_term_fixture',
    标题: '测试专有名词',
    分类: 'term',
    来源: '玩家自制资料',
  };
  assert(adapter.resolveZhikuCategory(customTerm) === 'term', 'generic terms must not be guessed into Aeon or Path categories');

  for (const chapter of data.storyVolumes.flatMap((volume) => volume.chapters)) {
    assert(chapter.status !== 'locked' || !chapter.body.trim(), 'readable story text must not receive a fabricated lock');
  }

  const expectedCounts = new Map(data.categories.map((category) => [category.id, category.countLabel]));
  assert(expectedCounts.get('character') === String(data.archiveItems.character.length), 'character count must use visible player entries');
  assert(expectedCounts.get('story') === String(data.storyVolumes.length), 'story count must use story weaving volumes');

  console.log(JSON.stringify({
    categoryCounts: Object.fromEntries(data.categories.map((category) => [category.id, category.countLabel])),
    storyChapters: data.storyVolumes.reduce((total, volume) => total + volume.chapters.length, 0),
  }));
  console.log('ZHIKU_PRODUCTION_DATA_ADAPTER_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
