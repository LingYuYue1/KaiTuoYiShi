import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const presetRoot = path.join(root, 'public', 'zhiku-presets');
const bundlePath = path.join(os.tmpdir(), `zhiku-official-backlog-${process.pid}-${Date.now()}.mjs`);
const characterInjectionFields = [
  '核心身份与阵营',
  '独立人格与行为',
  '说话方式',
  '台词语料',
  '外貌锚点',
  '当前形态与能力边界',
  '精简角色故事',
  '演绎红线',
];
const loreInjectionFields = ['核心定义', '关键事实', '叙事用途', '演绎边界'];

const expectedPresets = [
  {
    file: 'xianzhou-alliance-character-expansion.json',
    id: 'zhiku_xianzhou_alliance_character_expansion',
    entries: [
      ['JS-085', '飞霄', ['飞霄', 'Feixiao', '天击将军', '大捷将军', '三无将军', '曜青将军']],
      ['JS-086', '椒丘', ['椒丘', 'Jiaoqiu', '椒大夫', '椒椒', '曜青医士', '飞霄的医士']],
      ['JS-087', '云璃', ['云璃', 'Yunli', '朱明猎剑士', '焰轮八叶', '熔铁剑骸']],
      ['JS-088', '貊泽', ['貊泽', 'Moze', '鸦羽怪人', '曜青影卫', '飞霄的影卫']],
      ['JS-089', '爻光', ['爻光', 'Yao Guang', '戎韬将军', '爻老板', '玉阙将军']],
    ],
  },
  {
    file: 'planarcadia-character-expansion.json',
    id: 'zhiku_planarcadia_character_expansion',
    entries: [
      ['JS-090', '火花', ['二相乐园火花', '火花大会主持人', '火花老师']],
      ['JS-091', '绯英', ['绯英', '绯英舰长', '绯绯狐', '二相乐园绯英']],
      ['JS-092', '不死途', ['不死途', '巡海游侠不死途', '颓废侦探', '头狼']],
      ['JS-093', '虚照', ['虚照', '模糊二维马', '狸狸周刊', '苍天航路绒绒号']],
    ],
  },
  {
    file: 'fate-collaboration-character-expansion.json',
    id: 'zhiku_fate_collaboration_character_expansion',
    entries: [
      ['JS-094', 'Archer', ['红衣弓兵', '英灵Archer', 'Archer英灵', 'EMIYA']],
      ['JS-095', 'Saber', ['Saber', '阿尔托莉雅·潘德拉贡', '骑士王', '亚瑟王']],
      ['JS-096', '远坂凛', ['远坂凛', 'Tohsaka Rin', '远坂家主']],
      ['JS-097', '吉尔伽美什', ['吉尔伽美什', 'Gilgamesh', '英雄王']],
    ],
  },
  {
    file: 'planarcadia-enemy-expansion.json',
    id: 'zhiku_planarcadia_enemy_expansion',
    entries: [
      ['DS-000', '归寂', ['万色返空主', '绝灭大君•归寂', '绝灭大君·归寂', '绝灭大君归寂', '归寂的箴言']],
    ],
  },
];

const positiveFieldErrors = new Map([
  ['绯英', /绯樱/u],
  ['虚照', /模糊二维码/u],
  ['Archer', /师徒兼宿敌/u],
  ['吉尔伽美什', /虚数\s*[\/／]\s*智识|五星智识虚数/u],
  ['归寂', /灭绝大君/u],
]);

function readPreset(fileName) {
  return JSON.parse(fs.readFileSync(path.join(presetRoot, fileName), 'utf8'));
}

function positiveInjectionText(entry) {
  const injection = entry.注入内容 ?? {};
  return Object.entries(injection)
    .filter(([field]) => !['演绎红线', '演绎边界'].includes(field))
    .map(([, value]) => String(value ?? ''))
    .join('\n');
}

try {
  await build({
    stdin: {
      contents: [
        "export { loadAllBundledZhikuPresets } from './data/zhikuPreset';",
        "export { retrieveZhikuContext, buildZhikuAiRequestForTurn } from './services/zhikuRetrieval';",
        "export { buildZhikuProductionData, resolveZhikuCategory } from './components/features/ZhikuV3/productionAdapter';",
        "export { loadAllBundledStoryWeavingPresets } from './data/storyWeavingPreset';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-official-backlog-regression-entry.ts',
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
  const [zhikuSystem, storySystem] = await Promise.all([
    api.loadAllBundledZhikuPresets(),
    api.loadAllBundledStoryWeavingPresets(),
  ]);
  const productionData = api.buildZhikuProductionData(zhikuSystem, storySystem);

  const expectedEntries = [];
  for (const presetSpec of expectedPresets) {
    const preset = readPreset(presetSpec.file);
    assert(preset.id === presetSpec.id, `${presetSpec.file} preset id drifted`);
    assert(preset.entries.length === presetSpec.entries.length, `${presetSpec.file} entry count drifted`);

    for (const [machineId, title, triggers] of presetSpec.entries) {
      const rawEntry = preset.entries.find((entry) => entry.标题 === title);
      assert(rawEntry, `${presetSpec.file} is missing ${title}`);
      const expectedCategory = 'character';
      assert(rawEntry.分类 === expectedCategory, `${title} category must be ${expectedCategory}`);
      assert(
        JSON.stringify(rawEntry.触发关键词) === JSON.stringify(triggers),
        `${title} trigger keywords drifted`,
      );
      if (title === '归寂') {
        assert(!/铁墓|Iron Tomb|Irontomb/iu.test(rawEntry.id), 'Irontomb must not be used as Guiji compatibility identity');
        assert(!rawEntry.触发关键词.some((keyword) => /铁墓|Iron Tomb|Irontomb/iu.test(keyword)), 'Irontomb must not recall Guiji');
      }
      assert(String(rawEntry.原文 ?? '').length > 1000, `${title} archive preview is unexpectedly short`);
      assert(String(rawEntry.来源 ?? '').includes('官方一手资料'), `${title} lost its official audit provenance`);

      const injection = rawEntry.注入内容;
      const expectedInjectionType = 'character';
      assert(injection?.类型 === expectedInjectionType, `${title} injection type drifted`);
      const requiredFields = characterInjectionFields;
      for (const field of requiredFields) {
        assert(String(injection?.[field] ?? '').trim(), `${title} is missing injection field ${field}`);
      }
      assert(/^语料参考[:：]\s*$/mu.test(rawEntry.原文), `${title} preview lost its separately maintained voice/source corpus`);
      assert(String(injection.台词语料).length > 80, `${title} official voice/source corpus is unexpectedly short`);

      const forbidden = positiveFieldErrors.get(title);
      if (forbidden) {
        const positiveText = [rawEntry.标题, ...(rawEntry.触发关键词 ?? []), positiveInjectionText(rawEntry)].join('\n');
        assert(!forbidden.test(positiveText), `${title} reintroduced a rejected claim into positive archive fields`);
      }
      expectedEntries.push({ machineId, title, category: expectedCategory, triggers });
    }
  }

  for (const expected of expectedEntries) {
    const entry = zhikuSystem.条目.find((item) => item.id === expected.machineId);
    assert(entry?.标题 === expected.title, `${expected.machineId} no longer resolves to ${expected.title}`);
    assert(entry.分类 === expected.category, `${expected.machineId} normalized category drifted`);
    const retrievalSystem = expected.machineId === 'DS-000'
      ? {
          条目: zhikuSystem.条目.map((item) => item.id === expected.machineId
            ? { ...item, 解锁状态: '默认可用', 运行时解锁状态: '默认可用' }
            : item),
        }
      : zhikuSystem;
    if (expected.machineId === 'DS-000') {
      const lockedResult = api.retrieveZhikuContext(zhikuSystem, expected.triggers[0], 12);
      assert(
        !lockedResult.entries.some((item) => item.id === expected.machineId),
        'Guiji must stay out of main-story injection while its major-spoiler archive is locked',
      );
    }
    const keywordResult = api.retrieveZhikuContext(retrievalSystem, expected.triggers[0], 12);
    assert(
      keywordResult.entries.some((item) => item.id === expected.machineId),
      `${expected.title} cannot be recalled through its primary keyword`,
    );
    const retrievalEntry = retrievalSystem.条目.find((item) => item.id === expected.machineId);
    assert(retrievalEntry, `${expected.title} is missing from its retrieval test system`);
    const candidateIndex = api.buildZhikuAiRequestForTurn(
      retrievalSystem,
      expected.title,
      [retrievalEntry],
      { anticipatedNpcNames: expected.category === 'character' ? [expected.title] : [] },
    );
    const candidate = candidateIndex.request.candidates.find((item) => item.entryId === expected.machineId);
    assert(candidate?.category === expected.category, `${expected.title} AI candidate category drifted`);
    assert(candidate.categoryLabel === (expected.category === 'enemy' ? '敌对生物' : '人物'), `${expected.title} AI candidate category label drifted`);
  }

  const gilgamesh = zhikuSystem.条目.find((entry) => entry.id === 'JS-097');
  const gilgameshPositiveText = gilgamesh ? positiveInjectionText(gilgamesh) : '';
  assert(
    /雷属性/u.test(gilgameshPositiveText) && /毁灭命途/u.test(gilgameshPositiveText),
    'Gilgamesh must retain the official Thunder / Destruction correction',
  );
  const xuzhao = zhikuSystem.条目.find((entry) => entry.id === 'JS-093');
  assert(xuzhao?.触发关键词?.includes('模糊二维马'), 'Xuzhao must retain the official pen name 模糊二维马');
  const guiji = zhikuSystem.条目.find((entry) => entry.id === 'DS-000');
  assert(guiji?.分类 === 'character', 'Guiji must keep its current character archive identity');
  assert(guiji?.id === 'DS-000', 'Guiji must use the formal DS-000 source ID directly');
  assert(api.resolveZhikuCategory(guiji) === 'character', 'Guiji must render in the character archive');
  assert(
    !api.retrieveZhikuContext(zhikuSystem, '铁墓正在翁法罗斯推进毁灭计划。', 12).entries.some((entry) => entry.id === 'DS-000'),
    'mentioning Irontomb must not keyword-recall Guiji',
  );
  assert(productionData.archiveItems.enemy.length === 0, 'Guiji must not remain in the player-facing enemy archive');
  assert(
    productionData.archiveItems.character.some((entry) => entry.id === 'DS-000' && entry.title === '归寂'),
    'Guiji must be available in the player-facing character archive',
  );
  assert(productionData.archiveItems.character.length === 89, 'current character archive must contain 89 rows after Zandar removal');

  console.log(JSON.stringify({
    auditedEntries: expectedEntries.length,
    characterSources: zhikuSystem.条目.filter((entry) => entry.分类 === 'character').length,
    characterRows: productionData.archiveItems.character.length,
    guijiArchive: productionData.archiveItems.character.find((entry) => entry.id === 'DS-000')?.title,
    enemyArchiveRows: productionData.archiveItems.enemy.length,
  }));
  console.log('ZHIKU_OFFICIAL_BACKLOG_EXPANSION_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
