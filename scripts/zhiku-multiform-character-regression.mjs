import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-multiform-character-${process.pid}-${Date.now()}.mjs`);
const characterFields = [
  '核心身份与阵营',
  '独立人格与行为',
  '说话方式',
  '台词语料',
  '外貌锚点',
  '当前形态与能力边界',
  '精简角色故事',
  '演绎红线',
];
const makerVoicePattern = /本档案|本资料|主剧情应当|优先注入|写作时|写他时|写她时|提示词|模型需要|只承担|以下为|用于锚定/u;
const formGroups = [
  {
    subject: '姬子',
    normalTitle: '姬子',
    formTitle: '姬子•启行',
    groupId: 'character:himeko:form',
    normalQuery: '姬子正在观景车厢确认下一段航路。',
    formQuery: '姬子•启行驾驶拓星者赶到现场。',
  },
  {
    subject: '刃',
    normalTitle: '刃',
    formTitle: '千冶•刃',
    groupId: 'character:blade:form',
    normalQuery: '星核猎手刃握住支离，沉默地站在队伍前方。',
    formQuery: '千冶•刃以重铸后的残躯迎战。',
  },
  {
    subject: '银狼',
    normalTitle: '银狼',
    formTitle: '银狼LV.999',
    groupId: 'character:silver-wolf:form',
    normalQuery: '银狼正在检查这片区域的系统入口。',
    formQuery: '银狼LV.999以完整权限进入幻月游戏。',
  },
  {
    subject: '停云',
    normalTitle: '停云',
    formTitle: '忘归人',
    groupId: 'character:tingyun:form',
    normalQuery: '停云代表鸣火商团接待来客。',
    formQuery: '忘归人摇开折扇，与恩公再次启程。',
  },
  {
    subject: '白厄',
    normalTitle: '白厄',
    formTitle: '卡厄斯兰那',
    groupId: 'character:phainon:form',
    normalQuery: '白厄在麦田旁重新握紧木剑。',
    formQuery: '卡厄斯兰那背负亿万火种走向烈阳。',
  },
];

try {
  await build({
    stdin: {
      contents: [
        "export { loadAllBundledZhikuPresets } from './data/zhikuPreset';",
        "export { buildZhikuArchiveItems } from './components/features/ZhikuV3/productionAdapter';",
        "export { retrieveZhikuContext } from './services/zhikuRetrieval';",
        "export { buildZhikuAiCandidateIndex, compileZhikuAiSelection } from './services/zhikuAiRetrievalIndex';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-multiform-character-regression-entry.ts',
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
  const system = await api.loadAllBundledZhikuPresets();
  const characters = system.条目.filter((entry) => entry.分类 === 'character');
  assert(characters.length === 99, `expected 99 active character source entries after Zandar removal, got ${characters.length}`);
  assert(!characters.some((entry) => entry.标题 === '赞达尔'), 'intentionally removed Zandar profile must not return');

  const archiveItems = api.buildZhikuArchiveItems(system);
  assert(archiveItems.character.length === 89, `expected 89 active character archive rows after Zandar removal, got ${archiveItems.character.length}`);
  const pairs = [];
  for (const group of formGroups) {
    const entries = characters.filter((entry) => entry.关联角色ID === group.subject);
    const normal = entries.find((entry) => entry.标题 === group.normalTitle);
    const form = entries.find((entry) => entry.标题 === group.formTitle);
    assert(entries.length === 2 && normal && form, `${group.subject} must contain exactly normal and ${group.formTitle} entries`);
    assert(normal.关联形态ID === '常态', `${group.normalTitle} must remain the normal form`);
    assert(normal.互斥组ID === group.groupId && form.互斥组ID === group.groupId, `${group.subject} forms must share ${group.groupId}`);
    assert(normal.辅助关键词逻辑 === 'NOT_ANY', `${group.normalTitle} must exclude special-form terms with NOT_ANY`);
    assert(form.辅助关键词逻辑 === 'AND_ANY', `${group.formTitle} must require a form term with AND_ANY`);

    for (const entry of [normal, form]) {
      assert(entry.注入内容?.类型 === 'character', `${entry.标题} must use character injection content`);
      assert(String(entry.原文 ?? '').trim(), `${entry.标题} must keep a complete archive preview`);
      for (const field of characterFields) {
        assert(String(entry.注入内容[field] ?? '').trim(), `${entry.标题} is missing injection field ${field}`);
      }
    }
    assert(!makerVoicePattern.test(JSON.stringify(form.注入内容)), `${form.标题} injection still contains maker-facing narration`);

    const normalRecall = api.retrieveZhikuContext({ 条目: entries }, group.normalQuery, 8);
    assert(normalRecall.entries.length === 1 && normalRecall.entries[0].id === normal.id, `${group.normalTitle} query must recall only the normal form`);
    const formRecall = api.retrieveZhikuContext({ 条目: entries }, group.formQuery, 8);
    assert(formRecall.entries.length === 1 && formRecall.entries[0].id === form.id, `${group.formTitle} query must recall only the special form`);

    const row = archiveItems.character.find((item) => item.title === group.subject);
    assert(row, `${group.subject} player-facing row is missing`);
    assert(row.injectionVariants?.length === 2, `${group.subject} must expose exactly two read-only injection variants`);
    assert(row.injectionVariants[0].label === '常态', `${group.subject} normal preview must be the first variant`);
    assert(row.injectionVariants.some((variant) => variant.label === form.关联形态ID), `${group.formTitle} preview variant is missing`);

    const index = api.buildZhikuAiCandidateIndex({
      system: { 条目: entries },
      keywordScanText: group.normalQuery,
      keywordEntries: [normal],
      context: {
        currentLocation: '',
        presentCharacters: [group.subject],
        expectedCharacters: [],
        immediateStoryReview: '',
        recentStoryContext: '',
        storyPlan: group.formQuery,
        openingArchiveText: '',
      },
      getBlockReason: () => null,
      maxCandidates: 4,
    });
    assert(index.request.candidates.length === 2, `${group.subject} AI index must expose both forms`);
    const compilation = api.compileZhikuAiSelection(index.request, {
      selections: [{
        entryId: form.id,
        operation: 'FORM_OVERRIDE',
        usage: 'CHARACTER_FORM',
        necessity: 'REQUIRED',
        replaceEntryId: normal.id,
        evidence: ['ACTIVE_FORM'],
        reason: `当前剧情明确使用${form.关联形态ID}形态`,
      }],
      noSelectionReason: '',
    }, 8);
    assert(compilation.accepted.length === 1, `${group.subject} legal same-subject FORM_OVERRIDE was rejected`);
    assert(compilation.finalSelections.length === 1 && compilation.finalSelections[0].entryId === form.id, `${group.subject} FORM_OVERRIDE did not leave only the special form`);
    pairs.push({ normal, form });
  }

  const marchEntries = characters.filter((entry) => entry.关联角色ID === '三月七');
  const marchNormal = marchEntries.find((entry) => entry.标题 === '三月七');
  const marchHunt = marchEntries.find((entry) => entry.标题 === '三月七·巡猎');
  const evernight = marchEntries.find((entry) => entry.标题 === '长夜月');
  assert(
    marchEntries.length === 3 && marchNormal && marchHunt && evernight,
    'March 7th must contain normal, Hunt, and Evernight independently injectable entries',
  );
  assert(marchNormal.关联形态ID === '常态', 'March 7th base profile must remain the normal form');
  assert(marchHunt.关联形态ID === '巡猎', 'March 7th Hunt profile must use the Hunt form label');
  assert(evernight.关联形态ID === '长夜月', 'Evernight profile must keep its independent display label');
  assert(
    marchEntries.every((entry) => entry.互斥组ID === 'character:march-7th:form'),
    'all March 7th forms must share the same exclusivity group',
  );
  assert(marchNormal.辅助关键词逻辑 === 'NOT_ANY', 'plain March 7th must exclude special-form terms');
  assert(marchHunt.辅助关键词逻辑 === 'AND_ANY', 'March 7th Hunt must require Hunt-specific evidence');
  assert(evernight.辅助关键词逻辑 === 'AND_ANY', 'Evernight must require Evernight-specific evidence');
  assert(
    marchNormal.辅助关键词.includes('仙舟三月七') && marchNormal.辅助关键词.includes('长夜月'),
    'plain March 7th must exclude both Hunt and Evernight terms',
  );
  assert(
    marchHunt.辅助关键词.includes('演武仪典') && !marchHunt.辅助关键词.includes('长夜月'),
    'March 7th Hunt must expose only its own positive secondary terms',
  );
  assert(
    evernight.辅助关键词.includes('长月夜')
      && evernight.辅助关键词.includes('记忆之影')
      && !evernight.辅助关键词.includes('演武仪典'),
    'Evernight must expose only its own positive secondary terms',
  );

  for (const entry of marchEntries) {
    assert(entry.注入内容?.类型 === 'character', `${entry.标题} must use character injection content`);
    assert(String(entry.原文 ?? '').trim(), `${entry.标题} must keep a complete archive preview`);
    for (const field of characterFields) {
      assert(String(entry.注入内容[field] ?? '').trim(), `${entry.标题} is missing injection field ${field}`);
    }
    assert(!makerVoicePattern.test(JSON.stringify(entry.注入内容)), `${entry.标题} injection still contains maker-facing narration`);
  }
  assert(
    evernight.注入内容.核心身份与阵营.includes('三月七体内的另一人格')
      && evernight.注入内容.当前形态与能力边界.includes('正式翁法罗斯阶段前')
      && evernight.注入内容.当前形态与能力边界.includes('不能自动使用完整神权')
      && evernight.注入内容.演绎红线.includes('可提前显现'),
    'Evernight must retain the project-specific early inner-persona boundary',
  );
  assert(
    evernight.解锁状态.includes('默认可用（体内人格）')
      && evernight.解锁条件.includes('体内人格显现无需进入翁法罗斯')
      && evernight.剧透等级.includes('翁法罗斯身份、能力与真相为重大'),
    'Evernight early persona and late-story capability gates must stay separated',
  );

  const marchNormalRecall = api.retrieveZhikuContext({ 条目: marchEntries }, '三月七正举起相机招呼大家合影。', 8);
  assert(
    marchNormalRecall.entries.length === 1 && marchNormalRecall.entries[0].id === marchNormal.id,
    'plain March 7th mention must recall only the normal profile',
  );
  const marchHuntRecall = api.retrieveZhikuContext({ 条目: marchEntries }, '仙舟三月七在演武仪典后重新练习双剑。', 8);
  assert(
    marchHuntRecall.entries.length === 1 && marchHuntRecall.entries[0].id === marchHunt.id,
    'Hunt-specific March 7th mention must recall only the Hunt profile',
  );
  const evernightRecall = api.retrieveZhikuContext({ 条目: marchEntries }, '长夜月撑开黑伞，凝视那道记忆之影。', 8);
  assert(
    evernightRecall.entries.length === 1 && evernightRecall.entries[0].id === evernight.id,
    'Evernight-specific mention must recall only the Evernight profile',
  );
  const evernightAliasRecall = api.retrieveZhikuContext({ 条目: marchEntries }, '长月夜在三月七心底轻声回应。', 8);
  assert(
    evernightAliasRecall.entries.length === 1 && evernightAliasRecall.entries[0].id === evernight.id,
    'project alias 长月夜 must recall only the Evernight profile',
  );

  const marchRow = archiveItems.character.find((item) => item.title === '三月七');
  assert(marchRow, 'March 7th player-facing row is missing');
  assert(
    marchRow.injectionVariants?.map((variant) => variant.label).join(',') === '常态,巡猎,长夜月',
    'March 7th must expose the confirmed read-only variant order',
  );

  const marchIndex = api.buildZhikuAiCandidateIndex({
    system: { 条目: marchEntries },
    keywordScanText: '三月七正举起相机。',
    keywordEntries: [marchNormal],
    context: {
      currentLocation: '',
      presentCharacters: ['三月七'],
      expectedCharacters: [],
      immediateStoryReview: '',
      recentStoryContext: '',
      storyPlan: '长夜月将在记忆之影中现身。',
      openingArchiveText: '',
    },
    getBlockReason: () => null,
    maxCandidates: 4,
  });
  assert(marchIndex.request.candidates.length === 3, 'March 7th AI index must expose all three controlled variants');
  const marchCompilation = api.compileZhikuAiSelection(marchIndex.request, {
    selections: [{
      entryId: evernight.id,
      operation: 'FORM_OVERRIDE',
      usage: 'CHARACTER_FORM',
      necessity: 'REQUIRED',
      replaceEntryId: marchNormal.id,
      evidence: ['ACTIVE_FORM'],
      reason: '当前剧情明确进入长夜月相关记忆段落',
    }],
    noSelectionReason: '',
  }, 8);
  assert(marchCompilation.accepted.length === 1, 'legal March 7th to Evernight FORM_OVERRIDE was rejected');
  assert(
    marchCompilation.finalSelections.length === 1 && marchCompilation.finalSelections[0].entryId === evernight.id,
    'March 7th FORM_OVERRIDE did not leave only Evernight',
  );

  const himeko = pairs.find((pair) => pair.normal.关联角色ID === '姬子');
  const blade = pairs.find((pair) => pair.normal.关联角色ID === '刃');
  const crossIndex = api.buildZhikuAiCandidateIndex({
    system: { 条目: [himeko.normal, himeko.form, blade.form] },
    keywordScanText: '姬子与千冶•刃同时在场。',
    keywordEntries: [himeko.normal],
    context: {
      currentLocation: '',
      presentCharacters: ['姬子', '刃'],
      expectedCharacters: [],
      immediateStoryReview: '',
      recentStoryContext: '',
      storyPlan: '',
      openingArchiveText: '',
    },
    getBlockReason: () => null,
    maxCandidates: 4,
  });
  const crossCompilation = api.compileZhikuAiSelection(crossIndex.request, {
    selections: [{
      entryId: blade.form.id,
      operation: 'FORM_OVERRIDE',
      usage: 'CHARACTER_FORM',
      necessity: 'REQUIRED',
      replaceEntryId: himeko.normal.id,
      evidence: ['ACTIVE_FORM'],
      reason: '非法跨人物形态替换测试',
    }],
    noSelectionReason: '',
  }, 8);
  assert(crossCompilation.accepted.length === 0, 'cross-subject FORM_OVERRIDE must never be accepted');
  assert(crossCompilation.rejected.some((item) => item.code === 'SUBJECT_MISMATCH'), 'cross-subject FORM_OVERRIDE must report SUBJECT_MISMATCH');

  const historicalBlade = api.retrieveZhikuContext({ 条目: characters }, '应星正在工造司校验剑胚。', 8);
  assert(
    !historicalBlade.entries.some((entry) => entry.标题 === '刃' || entry.标题 === '千冶•刃'),
    'bare Yingxing history must rely on AI supplemental retrieval instead of forcing a current Blade form',
  );
  const fireflyEntries = characters.filter((entry) => entry.标题 === '流萤' || entry.标题 === '萨姆');
  assert(fireflyEntries.length === 1 && fireflyEntries[0].标题 === '流萤', 'Firefly and SAM must remain one character entry');
  const fireflyRecall = api.retrieveZhikuContext({ 条目: fireflyEntries }, '萨姆展开火萤IV型装甲。', 8);
  assert(fireflyRecall.entries.length === 1 && fireflyRecall.entries[0].标题 === '流萤', 'SAM must recall Firefly instead of a fabricated form entry');
  assert(characters.filter((entry) => entry.标题 === '星').length === 1, 'Stelle path abilities must not be split into form entries');
  assert(characters.filter((entry) => entry.标题 === '穹').length === 1, 'Caelus path abilities must not be split into form entries');

  console.log(`ZHIKU_MULTIFORM_CHARACTER_REGRESSION_OK groups=${formGroups.length + 1} characterSources=${characters.length} playerRows=${archiveItems.character.length}`);
} finally {
  fs.rmSync(bundlePath, { force: true });
}
