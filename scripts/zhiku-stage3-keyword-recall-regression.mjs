import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-stage3-keyword-recall-${process.pid}-${Date.now()}.mjs`);

try {
  await build({
    stdin: {
      contents: [
        "export * from './models/zhiku';",
        "export * from './services/zhikuRetrieval';",
        "export * from './services/zhikuRuntimeCompiler';",
        "export * from './hooks/useGame/historyWindow';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage3-keyword-recall-entry.ts',
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

  const api = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  let sequence = 0;
  const makeInjectionContent = (category, title) => category === 'story' ? undefined : category === 'character'
    ? {
        类型: 'character',
        核心身份与阵营: `${title}测试身份与阵营`,
        独立人格与行为: `${title}测试人格与行为`,
        说话方式: `${title}测试说话方式`,
        台词语料: `${title}测试台词语料`,
        外貌锚点: `${title}测试外貌锚点`,
        当前形态与能力边界: `${title}测试形态与能力边界`,
        精简角色故事: `${title}测试精简故事`,
        演绎红线: `不得误写${title}`,
      }
    : {
        类型: 'lore',
        核心定义: `${title}测试核心定义`,
        关键事实: `${title}测试关键事实`,
        叙事用途: `${title}测试叙事用途`,
        演绎边界: `不得误用${title}`,
      };
  const makeEntry = (title, patch = {}) => {
    const category = patch.分类 ?? 'character';
    const entry = api.创建智库条目({
      标题: title,
      分类: category,
      摘要: `${title}摘要`,
      原文: `${title}原文`,
      关键词: [`资料标签-${title}`],
      可用于联动: true,
      注入内容: makeInjectionContent(category, title),
      ...patch,
    });
    entry.id = `TEST-${String(++sequence).padStart(3, '0')}`;
    entry.updatedAt = sequence;
    return entry;
  };

  const browseOnly = makeEntry('摘要命中资料', {
    分类: 'location',
    摘要: '这里含有仅浏览命中词',
    触发关键词: ['真正触发词'],
  });
  assert(api.搜索智库条目({ 条目: [browseOnly] }, '仅浏览命中词', 5).length === 1, 'player-facing full-text search must still search summaries');
  assert(api.retrieveZhikuContext({ 条目: [browseOnly] }, '仅浏览命中词', 5).entries.length === 0, 'summary text must not trigger automatic recall');
  assert(api.retrieveZhikuContext({ 条目: [browseOnly] }, '真正触发词', 5).entries[0]?.id === browseOnly.id, 'explicit trigger keyword did not recall the entry');

  const override = makeEntry('显式词覆盖兼容关键词', {
    分类: 'location',
    关键词: ['过宽旧关键词'],
    触发关键词: ['收窄新关键词'],
  });
  assert(api.匹配智库关键词(override, '过宽旧关键词') === null, 'explicit trigger list must override broad legacy keywords');
  assert(api.匹配智库关键词(override, '收窄新关键词')?.entry.id === override.id, 'explicit trigger list was not honored');

  const ordinaryDanHeng = makeEntry('普通丹恒', {
    触发关键词: ['丹恒'],
    辅助关键词: ['饮月', '龙尊'],
    辅助关键词逻辑: 'NOT_ANY',
    互斥组ID: 'character-danheng-form',
    重要度: 3,
  });
  const imbibitorLunae = makeEntry('饮月形态', {
    触发关键词: ['丹恒', '饮月'],
    辅助关键词: ['饮月', '龙尊'],
    辅助关键词逻辑: 'AND_ANY',
    互斥组ID: 'character-danheng-form',
    重要度: 4,
  });
  const forms = { 条目: [ordinaryDanHeng, imbibitorLunae] };
  assert(api.retrieveZhikuContext(forms, '丹恒站在门边。', 5).entries.map((entry) => entry.id).join(',') === ordinaryDanHeng.id, 'plain Dan Heng mention must recall only the ordinary form');
  assert(api.retrieveZhikuContext(forms, '饮月抬起长枪。', 5).entries.map((entry) => entry.id).join(',') === imbibitorLunae.id, 'Imbibitor Lunae mention must recall only the special form');
  assert(api.retrieveZhikuContext(forms, '丹恒化身饮月。', 5).entries.map((entry) => entry.id).join(',') === imbibitorLunae.id, 'form keyword must switch Dan Heng to the special form');

  const logicCases = [
    ['AND_ANY', '主键甲形', true],
    ['AND_ANY', '主键', false],
    ['AND_ALL', '主键甲形乙形', true],
    ['AND_ALL', '主键甲形', false],
    ['NOT_ANY', '主键', true],
    ['NOT_ANY', '主键甲形', false],
    ['NOT_ALL', '主键甲形', true],
    ['NOT_ALL', '主键甲形乙形', false],
  ];
  for (const [logic, text, expected] of logicCases) {
    const entry = makeEntry(`${logic}-${text}`, {
      触发关键词: ['主键'],
      辅助关键词: ['甲形', '乙形'],
      辅助关键词逻辑: logic,
    });
    assert(Boolean(api.匹配智库关键词(entry, text)) === expected, `${logic} returned the wrong result for ${text}`);
  }

  const genericForm = makeEntry('通用形态', {
    触发关键词: ['代号'],
    互斥组ID: 'specificity-test',
    重要度: 5,
  });
  const specificForm = makeEntry('特殊形态', {
    触发关键词: ['代号', '特殊'],
    辅助关键词: ['特殊'],
    辅助关键词逻辑: 'AND_ANY',
    互斥组ID: 'specificity-test',
    重要度: 1,
  });
  const specificityResult = api.召回智库关键词匹配({ 条目: [genericForm, specificForm] }, '代号进入特殊形态');
  assert(specificityResult.length === 1 && specificityResult[0].entry.id === specificForm.id, 'inclusion group must deterministically prefer the more specific form');

  const unrelatedA = makeEntry('不同人物甲', { 触发关键词: ['甲角色'] });
  const unrelatedB = makeEntry('不同人物乙', { 触发关键词: ['乙角色'] });
  const unrelatedResult = api.retrieveZhikuContext({ 条目: [unrelatedA, unrelatedB] }, '甲角色与乙角色同时出现', 5).entries;
  assert(unrelatedResult.length === 2, 'different characters must not be collapsed by form exclusivity');

  const legacyCharacter = makeEntry('白厄', {
    原文: '核心触发词：白厄、Phainon。',
    关键词: ['角色:白厄', '资料大区:翁法罗斯'],
  });
  assert(api.获取智库显式触发词(legacyCharacter).includes('Phainon'), 'legacy character core triggers were not preserved');
  assert(api.匹配智库关键词(legacyCharacter, 'Phainon')?.entry.id === legacyCharacter.id, 'legacy character alias did not trigger');
  assert(api.匹配智库关键词(legacyCharacter, '翁法罗斯') === null, 'legacy character metadata tag must not become a trigger');

  const stelle = makeEntry('星', { 触发关键词: ['星'] });
  assert(api.匹配智库关键词(stelle, '星穹列车正在跃迁') === null, 'single-character protagonist name must not match inside a longer word');
  assert(api.匹配智库关键词(stelle, '星，准备出发。')?.entry.id === stelle.id, 'single-character protagonist name did not match as a standalone mention');

  const herta = makeEntry('黑塔', { 触发关键词: ['黑塔'] });
  assert(api.匹配智库关键词(herta, '我们抵达黑塔空间站') === null, 'Herta character must not be triggered by the station name alone');
  assert(api.匹配智库关键词(herta, '黑塔女士正在等你')?.entry.id === herta.id, 'explicit Herta character mention did not trigger');

  const legacyAeon = makeEntry('岚｜巡猎', {
    分类: 'term',
    关键词: ['星神:岚', '命途:巡猎', '资料类型:迁移设定资料'],
  });
  assert(api.匹配智库关键词(legacyAeon, '岚')?.entry.id === legacyAeon.id, 'supported legacy identity tag did not trigger');
  assert(api.匹配智库关键词(legacyAeon, '迁移设定资料') === null, 'legacy metadata tag must not trigger');

  const loadBundledEntry = (filename, title) => {
    const preset = JSON.parse(fs.readFileSync(path.join(root, 'public', 'zhiku-presets', filename), 'utf8'));
    const entry = preset.entries.find((item) => item.标题 === title);
    assert(entry, `missing bundled character entry: ${title}`);
    return entry;
  };
  const bundledStelle = loadBundledEntry('character-rebuild-core.json', '星');
  const bundledHerta = loadBundledEntry('herta-station-character-rebuild.json', '黑塔');
  const bundledPhainon = loadBundledEntry('amphoreus-character-rebuild.json', '白厄');
  assert(api.匹配智库关键词(bundledStelle, '星穹列车正在跃迁') === null, 'bundled Stelle profile was triggered by Astral Express');
  assert(api.匹配智库关键词(bundledHerta, '我们抵达黑塔空间站') === null, 'bundled Herta profile was triggered by Herta Space Station');
  assert(api.匹配智库关键词(bundledPhainon, '白厄向前走了一步')?.entry.id === bundledPhainon.id, 'bundled Phainon Chinese trigger was not preserved');
  assert(api.匹配智库关键词(bundledPhainon, 'Phainon raised his weapon')?.entry.id === bundledPhainon.id, 'bundled Phainon alias trigger was not preserved');

  const danHengFormsPreset = JSON.parse(fs.readFileSync(path.join(root, 'public', 'zhiku-presets', 'character-rebuild-core.json'), 'utf8'));
  const danHengForms = danHengFormsPreset.entries.filter((entry) => entry.关联角色ID === '丹恒');
  assert(danHengForms.length === 3, 'formal Dan Heng data must contain ordinary, Imbibitor Lunae, and Souldragon forms');
  assert(
    api.retrieveZhikuContext({ 条目: danHengForms }, '丹恒站在资料室门边。', 5).entries[0]?.关联形态ID === '常态',
    'formal plain Dan Heng mention must recall the ordinary form',
  );
  assert(
    api.retrieveZhikuContext({ 条目: danHengForms }, '饮月抬起手，云水随之汇聚。', 5).entries[0]?.关联形态ID === '饮月',
    'formal Imbibitor Lunae mention must recall only the Imbibitor Lunae form',
  );
  assert(
    api.retrieveZhikuContext({ 条目: danHengForms }, '丹恒化身饮月迎向来敌。', 5).entries[0]?.关联形态ID === '饮月',
    'formal Dan Heng transformation mention must override the ordinary form',
  );
  assert(
    api.retrieveZhikuContext({ 条目: danHengForms }, '丹恒·腾荒稳住破碎的大地。', 5).entries[0]?.关联形态ID === '腾荒',
    'formal Souldragon mention must recall only the Souldragon form',
  );

  const marchForms = danHengFormsPreset.entries.filter((entry) => entry.关联角色ID === '三月七');
  assert(marchForms.length === 3, 'formal March 7th data must contain normal, Hunt, and Evernight variants');
  assert(
    api.retrieveZhikuContext({ 条目: marchForms }, '三月七举起相机，催大家靠近一点。', 5).entries[0]?.关联形态ID === '常态',
    'formal plain March 7th mention must recall only the normal profile',
  );
  assert(
    api.retrieveZhikuContext({ 条目: marchForms }, '仙舟三月七在演武仪典后继续练习双剑。', 5).entries[0]?.关联形态ID === '巡猎',
    'formal Hunt-specific March 7th mention must recall only the Hunt profile',
  );
  assert(
    api.retrieveZhikuContext({ 条目: marchForms }, '长夜月从记忆之影中撑伞走来。', 5).entries[0]?.关联形态ID === '长夜月',
    'formal Evernight mention must recall only the Evernight profile',
  );
  assert(
    api.retrieveZhikuContext({ 条目: marchForms }, '长月夜在三月七的意识里开口。', 5).entries[0]?.关联形态ID === '长夜月',
    'project alias 长月夜 must recall the Evernight profile before the Amphoreus stage',
  );
  assert(
    api.retrieveZhikuContext({ 条目: marchForms }, '三月七举起相机。', 5).entries.length === 1,
    'plain March 7th mention must not inject Hunt and Evernight together',
  );

  const history = Array.from({ length: 7 }, (_, offset) => {
    const index = offset + 1;
    return [
      {
        id: `user-${index}`,
        role: 'user',
        content: `第${index}回合玩家行动`,
        timestamp: index * 2 - 1,
      },
      {
        id: `assistant-${index}`,
        role: 'assistant',
        content: `<正文>第${index}层剧情</正文>`,
        timestamp: index * 2,
      },
    ];
  }).flat();
  const recallWindow = api.buildZhikuKeywordRecallQuery({
    userInput: '本轮玩家发言',
    history,
    immediateStoryReview: '旧回合人物：旧人物',
  });
  assert(recallWindow.includes('本轮玩家发言'), 'current player input is missing from keyword scan window');
  assert(recallWindow.includes('第7回合玩家行动') && recallWindow.includes('第6回合玩家行动'), 'keyword scan window must keep recent player inputs');
  assert(!recallWindow.includes('第1层剧情') && !recallWindow.includes('第2层剧情'), 'keyword scan window retained assistant bodies older than five layers');
  assert(recallWindow.includes('第3层剧情') && recallWindow.includes('第4层剧情') && recallWindow.includes('第5层剧情') && recallWindow.includes('第6层剧情') && recallWindow.includes('第7层剧情'), 'keyword scan window did not keep the latest five assistant bodies');
  assert(!recallWindow.includes('旧回合人物：旧人物'), 'immediate story review must not expand the automatic keyword window');
  assert(api.ZHIKU_KEYWORD_RECALL_ASSISTANT_BODY_WINDOW === 5, 'Zhiku keyword scan depth must be five assistant bodies');
  assert(api.MAIN_RECALL_ASSISTANT_BODY_WINDOW === 5, 'other recall windows must retain their existing depth');

  const staleCharacter = makeEntry('旧人物', { 触发关键词: ['旧人物'] });
  const staleParticipation = {
    present: [],
    anticipated: [],
    mentioned: ['旧人物'],
    background: ['旧人物'],
  };
  const staleCompilation = api.compileZhikuTurn({
    system: { 条目: [staleCharacter] },
    query: '继续前进',
    limit: 5,
    scope: 'main',
    participation: staleParticipation,
    sceneContext: {
      presentNpcNamesForFallback: [],
      recallFallbackNames: ['旧人物'],
    },
  });
  assert(!staleCompilation.entries.some((entry) => entry.id === staleCharacter.id), 'mentioned/background characters must not become direct fallback recalls');
  const presentCompilation = api.compileZhikuTurn({
    system: { 条目: [staleCharacter] },
    query: '继续前进',
    limit: 5,
    scope: 'main',
    participation: { ...staleParticipation, present: ['旧人物'] },
    sceneContext: { presentNpcNamesForFallback: [] },
  });
  assert(presentCompilation.entries.some((entry) => entry.id === staleCharacter.id), 'present characters must remain fallback recalls without a keyword hit');

  const aiRequest = api.buildZhikuAiRequestForTurn(
    { 条目: [staleCharacter] },
    recallWindow,
    [],
    {
      aiSupplementHints: { immediateStoryReview: '旧回合人物：旧人物', storyPlan: '下一段继续前进。' },
      mentionedNpcNames: ['旧人物'],
    },
  );
  assert(!aiRequest.request.turnContext.keywordScanText.includes('旧回合人物：旧人物'), 'AI keyword evidence must stay on the short keyword window');
  assert(aiRequest.request.turnContext.immediateStoryReview?.includes('旧回合人物：旧人物'), 'AI supplement must retain the long story review as context');

  const retrievalSource = fs.readFileSync(path.join(root, 'services/zhikuRetrieval.ts'), 'utf8');
  const zhikuCotSource = fs.readFileSync(path.join(root, 'prompts/cot/zhikuCot.ts'), 'utf8');
  assert(retrievalSource.includes('匹配智库关键词(entry, query)') && !retrievalSource.includes('const searchQuery = augmentZhikuQuery(query, sceneHints)'), 'automatic recall must use explicit keyword matching without scene-hint query expansion');
  assert(
    retrievalSource.includes('keywordScanText 是唯一用来判断“关键词有没有命中”的正文窗口'),
    'AI supplement user prompt must identify keywordScanText as the only keyword evidence window',
  );
  assert(zhikuCotSource.includes('最近 5 条玩家输入') && zhikuCotSource.includes('最近 5 条 assistant 正文') && !zhikuCotSource.includes('最近 3 条 assistant 正文'), 'Zhiku CoT prompt must use the implemented five-body keyword window');

  console.log(JSON.stringify({
    danHeng: api.retrieveZhikuContext(forms, '丹恒', 5).entries.map((entry) => entry.标题),
    imbibitorLunae: api.retrieveZhikuContext(forms, '饮月', 5).entries.map((entry) => entry.标题),
    recallWindow,
  }));
  console.log('ZHIKU_STAGE3_KEYWORD_RECALL_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
