import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-stage5-runtime-${process.pid}-${Date.now()}.mjs`);

try {
  await build({
    stdin: {
      contents: [
        "export * from './services/zhikuRuntimeCompiler';",
        "export * from './services/zhikuRetrieval';",
        "export * from './services/zhikuRuntimeUnlock';",
        "export * from './hooks/useGame/npcPresence';",
        "export * from './data/zhikuCatalogRepository';",
        "export { buildZhikuCustomSystem, buildPersistedZhikuSystem, composeZhikuSystem, loadAllBundledZhikuPresets } from './data/zhikuPreset';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage5-runtime-regression-entry.ts',
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

  const runtime = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const system = await runtime.loadAllBundledZhikuPresets();

  const cachedFallback = await runtime.resolveBundledZhikuCatalog({
    loadFresh: async () => { throw new Error('single preset failed'); },
    loadCached: async () => system,
    saveCache: async () => { throw new Error('cache write must not run during fallback'); },
  });
  assert(cachedFallback.source === 'cache' && cachedFallback.system.条目.length === system.条目.length, 'failed fresh catalog must fall back to the last complete catalog');
  let rejectedIncompleteCache = false;
  try {
    await runtime.resolveBundledZhikuCatalog({
      loadFresh: async () => { throw new Error('single preset failed'); },
      loadCached: async () => ({ 目录版本: 'broken', 条目: [] }),
      saveCache: async () => {},
    });
  } catch {
    rejectedIncompleteCache = true;
  }
  assert(rejectedIncompleteCache, 'incomplete cached catalog must never enter runtime');
  let rejectedWrongBinding = false;
  try {
    const wrongBinding = {
      ...system,
      条目: system.条目.map((entry) => entry.id === 'JS-099' ? { ...entry, 来源序号: 1 } : entry),
    };
    await runtime.resolveBundledZhikuCatalog({
      loadFresh: async () => wrongBinding,
      loadCached: async () => null,
      saveCache: async () => {},
    });
  } catch {
    rejectedWrongBinding = true;
  }
  assert(rejectedWrongBinding, 'catalog with a drifted stable identity binding must never enter runtime');

  assert(system.条目.some((entry) => entry.id === 'JS-099' && entry.标题 === '大黑塔'), 'The Herta source must own JS-099 directly');

  const participation = runtime.getZhikuCharacterParticipationForTurn({
    world: {
      当前地点: '星穹列车·观景车厢',
      当前时段: { 名称: '清晨', 人物: [] },
      原著主角: '星',
    },
    npcs: [
      { 姓名: '三月七', 同行: true, 最近回合: 1 },
      { 姓名: '姬子', 同行: false, 最近回合: 1 },
      { 姓名: '瓦尔特·杨', 同行: false, 最近回合: 18 },
    ],
    history: [],
    userInput: '姬子提到丹恒正在列车资料室整理旧档案。',
    turnCount: 20,
  });
  assert(participation.present.includes('三月七'), 'companion must be classified as present');
  assert(participation.anticipated.includes('丹恒'), 'expected train character must be classified as anticipated');
  assert(participation.mentioned.includes('姬子'), 'text-only NPC reference must be classified as mentioned');
  assert(participation.background.includes('瓦尔特·杨'), 'recent inactive NPC must be classified as background');
  assert(!participation.present.includes('丹恒') && !participation.present.includes('姬子'), 'anticipated or mentioned characters must not become present');

  const sundayParticipation = runtime.getZhikuCharacterParticipationForTurn({
    world: {
      当前地点: '匹诺康尼',
      当前时段: { 名称: '会谈', 人物: [{ 姓名: '星期日' }] },
      原著主角: '穹',
    },
    npcs: [{ 姓名: '星期日', 同行: false, 最近回合: 20 }],
    history: [],
    userInput: '会谈继续。',
    turnCount: 20,
  });
  assert(sundayParticipation.present.includes('星期日'), 'Sunday must not be mistaken for Stelle and filtered when Caelus is the protagonist');
  assert(!sundayParticipation.present.includes('星'), 'single-character protagonist names must not collide with longer character names');

  const sundayCompilation = runtime.compileZhikuTurn({
    system,
    query: '会谈继续。',
    limit: 8,
    scope: 'main',
    participation: sundayParticipation,
    sceneContext: {
      presentNpcNamesForFallback: sundayParticipation.present,
      originalProtagonist: '穹',
    },
  });
  assert((sundayCompilation.characterEntries ?? []).some((entry) => entry.标题 === '星期日'), 'Sunday present fallback must survive the Stelle/Caelus protagonist gate');
  assert(!(sundayCompilation.characterEntries ?? []).some((entry) => entry.标题 === '星'), 'Sunday present fallback must not pull Stelle through substring matching');

  for (const [query, presentName, groupId, expectedTitle] of [
    ['丹恒显露饮月之姿。', '丹恒', 'character:danheng:form', '丹恒·饮月'],
    ['三月七·巡猎以双剑迎敌。', '三月七', 'character:march-7th:form', '三月七·巡猎'],
  ]) {
    const compilation = runtime.compileZhikuTurn({
      system,
      query,
      limit: 8,
      scope: 'main',
      participation: { present: [presentName], anticipated: [], mentioned: [], background: [] },
      sceneContext: { presentNpcNamesForFallback: [presentName] },
    });
    const forms = compilation.characterEntries.filter((entry) => entry.互斥组ID === groupId);
    assert(forms.length === 1, `${groupId} must collapse keyword and present-fallback forms to one entry`);
    assert(forms[0].标题 === expectedTitle, `${groupId} must keep the explicit form ${expectedTitle}`);
  }

  const relatedOnly = runtime.compileZhikuTurn({
    system,
    query: '丹恒在远处的通讯中被提到。',
    limit: 8,
    scope: 'main',
    participation: { present: [], anticipated: [], mentioned: ['丹恒'], background: [] },
    sceneContext: { presentNpcNamesForFallback: [] },
  });
  assert(relatedOnly.mainStoryInjection.includes('尚未到场的人物档案（只作参考）'), 'mentioned character must remain reference-only');
  assert(!relatedOnly.characterEnforcementBrief.includes('丹恒'), 'mentioned character must not enter mandatory character enforcement');

  const compilerOwnedPresence = runtime.compileZhikuTurn({
    system,
    query: '丹恒正在查看列车档案。',
    limit: 8,
    scope: 'main',
    participation: { present: ['丹恒'], anticipated: [], mentioned: [], background: [] },
  });
  assert(compilerOwnedPresence.mainStoryInjection.includes('正在镜头里的角色档案（必须承接）'), 'compiler must derive present fallback from participation without a duplicate scene-context list');
  assert(compilerOwnedPresence.participationEvidence.some((item) => item.name === '丹恒' && item.level === 'present'), 'compilation must retain participation evidence');

  for (const scope of ['opening', 'pathAwakeningQuestion', 'pathAwakeningJudgement']) {
    const special = runtime.compileZhikuTurn({
      system,
      query: '丹恒与三月七都在这里。',
      limit: 8,
      scope,
      participation: { present: ['丹恒', '三月七'], anticipated: [], mentioned: [], background: [] },
      sceneContext: { presentNpcNamesForFallback: ['丹恒', '三月七'] },
    });
    if (scope === 'opening') {
      assert(special.entries.length > 0 && special.mainStoryInjection !== '', 'opening must retain necessary Zhiku context');
    } else {
      assert(special.entries.length === 0 && special.mainStoryInjection === '', `${scope} must not inject main-story Zhiku content`);
    }
  }

  const phone = runtime.compileZhikuPhoneView(system, ['大黑塔', '丹恒']);
  assert(!phone.phonePersonaView.includes('大黑塔'), 'entry with 可否手机使用=false must not enter phone persona view');
  assert(phone.phonePersonaView.includes('丹恒'), 'phone-enabled character must enter phone persona view');
  assert(phone.mainStoryInjection === '', 'phone compilation must not expose main-story injection');
  const spoilerPhoneFixture = {
    ...system.条目.find((entry) => entry.分类 === 'character' && entry.注入内容?.类型 === 'character'),
    id: 'ZZ-PHONE-SPOILER',
    标题: '手机剧透测试人物',
    关联角色ID: '手机剧透测试人物',
    关联形态ID: '未解锁形态',
    解锁状态: '可预热',
    剧透等级: '重大',
    可否手机使用: true,
    使用范围: ['手机'],
    builtin: false,
  };
  const spoilerPhone = runtime.compileZhikuPhoneView({ 条目: [spoilerPhoneFixture] }, ['手机剧透测试人物']);
  assert(spoilerPhone.phonePersonaView === '', 'major-spoiler prewarm form must not enter the phone persona view before unlock');

  const firstCompile = runtime.compileZhikuTurn({
    system,
    query: '丹恒。',
    limit: 8,
    scope: 'main',
    participation: { present: ['丹恒'], anticipated: [], mentioned: [], background: [] },
    sceneContext: { presentNpcNamesForFallback: ['丹恒'] },
  });
  const secondCompile = runtime.compileZhikuTurn({
    system,
    query: '丹恒。',
    limit: 8,
    scope: 'main',
    participation: { present: ['丹恒'], anticipated: [], mentioned: [], background: [] },
    sceneContext: { presentNpcNamesForFallback: ['丹恒'] },
  });
  assert(firstCompile.compileId === secondCompile.compileId, 'compile ID must be reproducible for the same catalog and scope');

  const oldCatalog = { ...system, 目录版本: 'catalog:old', 目录修订: 4 };
  const unlockEntry = oldCatalog.条目.find((entry) => entry.分类 === 'character');
  const newCustomEntry = {
    ...oldCatalog.条目.find((entry) => entry.分类 !== 'story'),
    id: 'ZZ-999',
    标题: '并发自制资料',
    builtin: false,
  };
  const newerCatalog = { ...system, 目录版本: 'catalog:new', 目录修订: 9, 条目: [...system.条目, newCustomEntry] };
  const patchedCatalog = runtime.mergeZhikuRuntimeUnlockPatch(newerCatalog, [{
    id: unlockEntry.id,
    title: unlockEntry.标题,
    status: '已解锁',
    reason: 'regression patch',
  }]);
  assert(patchedCatalog.目录版本 === 'catalog:new', 'runtime unlock patch must preserve the newer catalog version');
  assert(patchedCatalog.条目.some((entry) => entry.id === 'ZZ-999'), 'runtime unlock patch must preserve concurrently added custom entries');
  assert(patchedCatalog.条目.find((entry) => entry.id === unlockEntry.id)?.运行时解锁状态 === '已解锁', 'runtime unlock patch must merge by stable ID');

  const snapshotCustom = {
    ...newCustomEntry,
    标题: '快照中的自制资料',
  };
  const currentCustom = {
    ...newCustomEntry,
    标题: '当前运行态的同 ID 资料',
  };
  const hydrated = runtime.composeZhikuSystem(
    { ...system, 目录修订: 10, 条目: [...system.条目, currentCustom] },
    { 目录版本: system.目录版本, 目录修订: 3, 条目: [snapshotCustom] },
  );
  const hydratedCustom = hydrated.条目.filter((entry) => entry.id === 'ZZ-999');
  assert(hydratedCustom.length === 1, 'lightweight snapshot restore must not duplicate custom entries');
  assert(hydratedCustom[0].标题 === '快照中的自制资料', 'reroll restore must use the custom entry saved in the snapshot');
  assert(hydrated.目录修订 === 10, 'snapshot restore must preserve the newer runtime catalog revision');

  const persisted = runtime.buildPersistedZhikuSystem({
    ...system,
    条目: [
      { ...system.条目[0], 运行时解锁状态: '已解锁' },
      snapshotCustom,
    ],
  });
  const customOnlyFallback = runtime.buildZhikuCustomSystem(persisted);
  assert(customOnlyFallback.条目.length === 1 && customOnlyFallback.条目[0].id === 'ZZ-999', 'total catalog failure must restore only custom entries');
  assert(!customOnlyFallback.条目.some((entry) => entry.builtin), 'incomplete builtin override placeholders must never enter runtime');

  console.log('ZHIKU_STAGE5_RUNTIME_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
