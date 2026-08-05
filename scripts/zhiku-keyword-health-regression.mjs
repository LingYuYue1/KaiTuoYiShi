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
const bundlePath = path.join(os.tmpdir(), `zhiku-keyword-health-${process.pid}-${Date.now()}.mjs`);

try {
  await build({
    stdin: {
      contents: [
        "export { bundledZhikuPresets, loadAllBundledZhikuPresets } from './data/zhikuPreset';",
        "export { 召回智库关键词匹配, 搜索智库条目, 获取智库注入内容缺失字段 } from './models/zhiku';",
        "export { buildZhikuAiRequestForTurn } from './services/zhikuRetrieval';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-keyword-health-regression-entry.ts',
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
  const recallTitles = (text) => api.召回智库关键词匹配(system, text).map((match) => match.entry.标题);
  const requireRecall = (text, title) => {
    const titles = recallTitles(text);
    assert(titles.includes(title), `${JSON.stringify(text)} must recall ${title}; received ${titles.join(' / ') || 'none'}`);
  };
  const forbidRecall = (text, forbiddenTitles) => {
    const titles = recallTitles(text);
    for (const title of forbiddenTitles) {
      assert(!titles.includes(title), `${JSON.stringify(text)} must not recall ${title}; received ${titles.join(' / ')}`);
    }
  };
  const requireExactForms = (text, expectedTitles) => {
    const actual = recallTitles(text).filter((title) => expectedTitles.includes(title) || [
      '三月七', '三月七·巡猎', '长夜月',
      '丹恒', '丹恒·饮月', '丹恒·腾荒',
      '姬子', '姬子•启行',
      '刃', '千冶•刃',
      '停云', '忘归人',
    ].includes(title));
    assert(
      JSON.stringify(actual) === JSON.stringify(expectedTitles),
      `${JSON.stringify(text)} form recall drifted: expected ${expectedTitles.join(' / ')}, received ${actual.join(' / ') || 'none'}`,
    );
  };

  assert(system.条目.length === 162, `expected 162 injectable archive entries, received ${system.条目.length}`);
  const nonCharacterEntries = system.条目.filter((entry) => entry.分类 !== 'character' && entry.分类 !== 'story');
  assert(nonCharacterEntries.length === 63, `expected 63 non-character entries, received ${nonCharacterEntries.length}`);
  assert(
    nonCharacterEntries.every((entry) => (entry.触发关键词 ?? []).length > 0),
    'every non-character archive must use explicit trigger keywords after contraction',
  );

  const contractedPresetPaths = new Set([
    '/zhiku-presets/aeons-core.json',
    '/zhiku-presets/amphoreus-character-rebuild.json',
    '/zhiku-presets/character-rebuild-core.json',
    '/zhiku-presets/fate-collaboration-character-expansion.json',
    '/zhiku-presets/galactic-travelers-character-rebuild.json',
    '/zhiku-presets/garden-of-recollection-character-rebuild.json',
    '/zhiku-presets/interastral-peace-corporation-character-rebuild.json',
    '/zhiku-presets/location-core.json',
    '/zhiku-presets/paths-core.json',
    '/zhiku-presets/penacony-character-rebuild.json',
    '/zhiku-presets/planarcadia-character-expansion.json',
    '/zhiku-presets/planarcadia-enemy-expansion.json',
    '/zhiku-presets/stellaron-hunters-character-rebuild.json',
    '/zhiku-presets/term-core.json',
    '/zhiku-presets/worldview-core.json',
    '/zhiku-presets/xianzhou-alliance-character-expansion.json',
    '/zhiku-presets/xianzhou-history.json',
    '/zhiku-presets/xianzhou-luofu-character-rebuild.json',
  ]);
  assert(contractedPresetPaths.size === 18, 'keyword contraction must cover exactly 18 changed presets');
  for (const preset of api.bundledZhikuPresets) {
    if (!contractedPresetPaths.has(preset.path)) continue;
    assert(
      preset.updatedAt === '2026-08-04-keyword-health-contraction-1',
      `${preset.path} did not receive the keyword contraction cache version`,
    );
  }

  const presetFiles = fs.readdirSync(presetRoot).filter((file) => file.endsWith('.json'));
  const rawEntries = presetFiles.flatMap((file) => {
    const preset = JSON.parse(fs.readFileSync(path.join(presetRoot, file), 'utf8'));
    return (preset.entries ?? []).map((entry) => ({ ...entry, __file: file }));
  });
  const explicitEntries = rawEntries.filter((entry) => (entry.触发关键词 ?? []).length > 0);
  assert(explicitEntries.length === 117, `expected 117 explicit-trigger entries, received ${explicitEntries.length}`);

  const triggerOwners = new Map();
  for (const entry of rawEntries) {
    const perEntry = new Set((entry.触发关键词 ?? []).map((trigger) => trigger.normalize('NFKC').toLocaleLowerCase()));
    for (const trigger of perEntry) {
      const owners = triggerOwners.get(trigger) ?? [];
      owners.push(entry);
      triggerOwners.set(trigger, owners);
    }
  }
  const collisionGroups = Array.from(triggerOwners.entries()).filter(([, owners]) => owners.length > 1);
  assert(collisionGroups.length === 13, `expected 13 intentional form collisions, received ${collisionGroups.length}`);
  for (const [trigger, owners] of collisionGroups) {
    const groupIds = new Set(owners.map((entry) => entry.互斥组ID).filter(Boolean));
    const subjectIds = new Set(owners.map((entry) => entry.关联角色ID).filter(Boolean));
    assert(
      owners.every((entry) => entry.分类 === 'character') && groupIds.size === 1 && subjectIds.size === 1,
      `trigger ${trigger} collides outside one character form group: ${owners.map((entry) => entry.标题).join(' / ')}`,
    );
  }

  const entriesByTitle = new Map(rawEntries.map((entry) => [entry.标题, entry]));
  const bannedPrimary = new Map([
    ['那刻夏', ['角色名']],
    ['赛飞儿', ['角色名']],
    ['缇宝', ['角色名']],
    ['昔涟', ['迷迷', 'Mem']],
    ['三月七', ['三月']],
    ['丹恒', ['列车护卫', '智库管理员']],
    ['姬子', ['领航员', '列车领航员', '红发领航员']],
    ['Archer', ['Archer', '卫宫士郎', '正义的伙伴']],
    ['黄泉', ['黄泉']],
    ['黑天鹅', ['黑天鹅', 'Black Swan']],
    ['托帕', ['托帕', 'Topaz']],
    ['砂金', ['砂金', 'Aventurine']],
    ['翡翠', ['翡翠', 'Jade']],
    ['真珠', ['真珠', 'Pearl']],
    ['林登·斯科特', ['Scott', '孤狼', '公司专员']],
    ['星期日', ['星期日', 'Sunday']],
    ['加拉赫', ['老狗']],
    ['知更鸟', ['知更鸟', 'Robin']],
    ['花火', ['花火', 'Sparkle']],
    ['大丽花', ['大丽花', 'The Dahlia']],
    ['火花', ['火花', '火花花', '花老师', '主包', '火花大会']],
    ['归寂', ['归寂']],
    ['刃', ['Blade', '应星']],
    ['流萤', ['流萤', 'Firefly', '萨姆', 'Sam']],
    ['千冶•刃', ['刃', 'Blade']],
    ['云璃', ['猎剑士', '老铁']],
    ['符玄', ['太卜']],
    ['白露', ['白露']],
    ['罗刹', ['罗刹']],
    ['寒鸦', ['寒鸦']],
  ]);
  for (const [title, banned] of bannedPrimary) {
    const triggers = entriesByTitle.get(title)?.触发关键词 ?? [];
    for (const keyword of banned) {
      assert(!triggers.includes(keyword), `${title} still exposes broad primary trigger ${keyword}`);
    }
  }
  for (const title of ['三月七', '三月七·巡猎']) {
    const auxiliary = entriesByTitle.get(title)?.辅助关键词 ?? [];
    assert(!auxiliary.includes('习剑') && !auxiliary.includes('双剑'), `${title} still uses broad training auxiliaries`);
  }
  assert(!entriesByTitle.get('丹恒·饮月')?.辅助关键词?.includes('龙尊'), 'Imbibitor Lunae still uses broad 龙尊 auxiliary');
  for (const title of ['停云', '忘归人']) {
    assert(!entriesByTitle.get(title)?.辅助关键词?.includes('重新启程'), `${title} still uses broad 重新启程 auxiliary`);
  }

  requireRecall('巡猎星神岚放出光矢。', '岚｜巡猎');
  requireRecall('巡猎命途强调定向行动。', '巡猎');
  requireRecall('请说明星神体系。', '星神');
  requireRecall('打开星神总览。', '星神总览');
  requireRecall('我们抵达主控舱段。', '主控舱段');
  requireRecall('回顾仙舟丰饶战争与近代。', '仙舟历史·丰饶战争与近代（星历5700–8100）');
  requireRecall('星期日先生站在橡木家系的长廊里。', '星期日');
  requireRecall('Acheron拔刀看向远处。', '黄泉');
  requireRecall('萨姆机甲从火光中落地。', '流萤');
  requireRecall('绝灭大君·归寂降临二相乐园。', '归寂');

  forbidRecall('时间悄然流逝，这段历史无人记录。', ['琥珀纪']);
  forbidRecall('他沿着道路成长，战技也有提升。', ['命途']);
  forbidRecall('宾客在宴会中展开调查。', ['黄金的时刻']);
  forbidRecall('公司专员正在潜伏，剧本仍然隐秘。', ['星核猎手', '林登·斯科特']);
  forbidRecall('布洛妮娅和希儿正在讨论星核。', ['雅利洛-Ⅵ']);
  forbidRecall('景元、丹恒、白露和符玄走进房间。', [
    '仙舟历史·启航与孤航（星历0–2600）',
    '仙舟历史·长生与三劫（星历2600–3600）',
    '仙舟历史·联盟成立与帝弓显现（星历3600–5700）',
    '仙舟历史·丰饶战争与近代（星历5700–8100）',
  ]);
  forbidRecall('星期日我们再去看知更鸟和大丽花。', ['星期日', '知更鸟', '大丽花']);
  forbidRecall('柜台摆着砂金、翡翠、真珠与黄玉。', ['砂金', '翡翠', '真珠']);
  forbidRecall('memory member迷迷糊糊地走过。', ['昔涟']);
  forbidRecall('角色名只是表格里的占位文字。', ['那刻夏', '赛飞儿', '缇宝']);
  forbidRecall('火花落在刀刃上，流萤从草间飞过，寒鸦掠过白露。', ['火花', '流萤', '刃', '寒鸦', '白露']);

  const aiFallbackTitles = [
    'Archer', '黄泉', '黑天鹅', '托帕', '砂金', '翡翠', '真珠',
    '星期日', '知更鸟', '花火', '大丽花', '火花', '归寂', '流萤',
    '白露', '罗刹', '寒鸦',
  ];
  const missingAiFallbackTitles = [];
  for (const title of aiFallbackTitles) {
    const candidateSystem = title === '归寂'
      ? {
          条目: system.条目.map((entry) => entry.标题 === title
            ? { ...entry, 解锁状态: '默认可用', 运行时解锁状态: '默认可用' }
            : entry),
        }
      : system;
    const keywordEntries = api.召回智库关键词匹配(candidateSystem, title).map((match) => match.entry);
    assert(!keywordEntries.some((entry) => entry.标题 === title), `${title} bare ambiguous name must stay out of keyword recall`);
    const aiIndex = api.buildZhikuAiRequestForTurn(candidateSystem, title, keywordEntries, {});
    const target = candidateSystem.条目.find((entry) => entry.标题 === title);
    assert(target, `missing AI fallback target ${title}`);
    if (!aiIndex.request.candidates.some((candidate) => candidate.entryId === target.id)) {
      const searchTitles = api.搜索智库条目(system, title, 5).map((entry) => entry.标题).join(',') || 'none';
      const missingFields = api.获取智库注入内容缺失字段(target).join(',') || 'none';
      missingAiFallbackTitles.push(`${title}=>candidates:${aiIndex.request.candidates.map((candidate) => candidate.title).join(',') || 'none'};search:${searchTitles};missing:${missingFields}`);
    }
  }
  assert(
    missingAiFallbackTitles.length === 0,
    `bare ambiguous names missing from AI supplemental retrieval: ${missingAiFallbackTitles.join(' / ')}`,
  );

  requireExactForms('三月七还在整理照片。', ['三月七']);
  requireExactForms('三月七正在演武仪典上登场。', ['三月七·巡猎']);
  requireExactForms('长夜月撑伞走进雨幕。', ['长夜月']);
  requireExactForms('丹恒守在队伍前方。', ['丹恒']);
  requireExactForms('丹恒·饮月显露持明本相。', ['丹恒·饮月']);
  requireExactForms('姬子端起咖啡。', ['姬子']);
  requireExactForms('姬子·启行再次踏上旅途。', ['姬子•启行']);
  requireExactForms('星核猎手刃站在门边。', ['刃']);
  requireExactForms('千冶·刃从熔火中抬头。', ['千冶•刃']);
  requireExactForms('停云笑着招呼客人。', ['停云']);
  requireExactForms('忘归人展开五尾。', ['忘归人']);

  console.log(JSON.stringify({
    entries: system.条目.length,
    nonCharacterExplicit: nonCharacterEntries.length,
    explicitEntries: explicitEntries.length,
    intentionalFormCollisionGroups: collisionGroups.length,
    aiFallbackTitles: aiFallbackTitles.length,
  }));
  console.log('ZHIKU_KEYWORD_HEALTH_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
