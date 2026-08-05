import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getCoreTriggerTerms(entry) {
  const match = String(entry?.['原文'] ?? '').match(/核心触发词[:：]\s*([^\n]+)/u);
  if (!match) return [];
  return Array.from(new Set(
    match[1]
      .replace(/[。；;]+$/u, '')
      .split(/[,，、;；\n]/u)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function assertCoreTriggers(entry, expected, label) {
  const actual = getCoreTriggerTerms(entry);
  assert(actual.join('、') === expected.join('、'), `${label} core triggers changed: ${actual.join('、')}`);
}

function assertNoBareKeywords(entry, forbidden, label) {
  for (const keyword of forbidden) {
    assert(!entry['关键词']?.includes(keyword), `${label} keywords must not expose broad or relation trigger: ${keyword}`);
  }
}

const rebuildPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/character-rebuild-core.json', 'utf8'));
const stellaronHuntersPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/stellaron-hunters-character-rebuild.json', 'utf8'));
const hertaStationPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/herta-station-character-rebuild.json', 'utf8'));
const geniusSocietyPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/genius-society-character-rebuild.json', 'utf8'));
const intelligentsiaGuildPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/intelligentsia-guild-character-rebuild.json', 'utf8'));
const belobogPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/belobog-character-rebuild.json', 'utf8'));
const xianzhouLuofuPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/xianzhou-luofu-character-rebuild.json', 'utf8'));
const ipcPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/interastral-peace-corporation-character-rebuild.json', 'utf8'));

const currentGuinaifen = (xianzhouLuofuPreset.entries ?? [])
  .find((entry) => entry.id === 'JS-043');
if (currentGuinaifen?.注入内容?.类型 === 'character') {
  const requiredInjectionFields = [
    '核心身份与阵营',
    '独立人格与行为',
    '说话方式',
    '台词语料',
    '外貌锚点',
    '当前形态与能力边界',
    '精简角色故事',
    '演绎红线',
  ];
  assert(xianzhouLuofuPreset.id === 'zhiku_xianzhou_luofu_character_rebuild', 'Guinaifen must remain in the Xianzhou Luofu character preset.');
  assert(currentGuinaifen.标题 === '桂乃芬' && currentGuinaifen.分类 === 'character', 'Guinaifen current profile identity drifted.');
  assert(Array.isArray(currentGuinaifen.关键词) && currentGuinaifen.关键词.length > 0, 'Guinaifen current profile must keep explicit retrieval keywords.');
  assert(requiredInjectionFields.every((field) => String(currentGuinaifen.注入内容[field] ?? '').trim()), 'Guinaifen current profile must keep the complete structured injection contract.');
  console.log('zhiku guinaifen regression ok (current structured profile)');
  process.exit(0);
}

const profileById = new Map((rebuildPreset.entries ?? []).map((entry) => [entry.id, entry]));
const isAstralExpressCharacterProfileSet =
  rebuildPreset.id === 'zhiku_character_rebuild_core' &&
  rebuildPreset.title === '人物重建·星穹列车角色档案' &&
  Array.isArray(rebuildPreset.entries) &&
  profileById.has('JS-000') &&
  profileById.has('JS-001') &&
  profileById.has('JS-002') &&
  profileById.has('JS-003') &&
  profileById.has('JS-004') &&
  profileById.has('JS-005') &&
  profileById.has('JS-006');

const hertaStationProfileById = new Map((hertaStationPreset.entries ?? []).map((entry) => [entry.id, entry]));
const stellaronHuntersProfileById = new Map((stellaronHuntersPreset.entries ?? []).map((entry) => [entry.id, entry]));
const geniusSocietyProfileById = new Map((geniusSocietyPreset.entries ?? []).map((entry) => [entry.id, entry]));
const intelligentsiaGuildProfileById = new Map((intelligentsiaGuildPreset.entries ?? []).map((entry) => [entry.id, entry]));
const belobogProfileById = new Map((belobogPreset.entries ?? []).map((entry) => [entry.id, entry]));
const xianzhouLuofuProfileById = new Map((xianzhouLuofuPreset.entries ?? []).map((entry) => [entry.id, entry]));
const stellaronHuntersProfiles = [
  stellaronHuntersProfileById.get('JS-007'),
  stellaronHuntersProfileById.get('JS-008'),
  stellaronHuntersProfileById.get('JS-009'),
  stellaronHuntersProfileById.get('JS-010'),
  stellaronHuntersProfileById.get('JS-011'),
];
assert(
  stellaronHuntersPreset.id === 'zhiku_stellaron_hunters_character_rebuild' &&
    stellaronHuntersPreset.updatedAt === '2026-06-09-stellaron-hunters-character-profiles-11' &&
    stellaronHuntersProfiles.every(Boolean),
  'Stellaron Hunters rebuilt character preset must exist with Kafka, Blade, Silver Wolf, Firefly, and Elio.',
);
assert(
  stellaronHuntersProfiles.every((entry) =>
    entry['关键词']?.includes('资料大区:星核猎手') &&
    entry['关键词']?.includes('节点:单角色档案') &&
    entry['关键词']?.includes('核心触发词收窄') &&
    (
      String(entry['原文'] ?? '').includes('语料只用于学习') ||
      String(entry['原文'] ?? '').includes('艾利欧暂不提供语料')
    ) &&
    (
      String(entry['原文'] ?? '').includes('不能照着写') ||
      String(entry['原文'] ?? '').includes('不能写成艾利欧当场开口')
    ),
  ),
  'Stellaron Hunters rebuilt profiles must keep grouping and corpus rules.',
);
const geniusSocietyRuanMei = geniusSocietyProfileById.get('JS-015');
const geniusSocietyScrewllum = geniusSocietyProfileById.get('JS-016');
const geniusSocietyStephen = geniusSocietyProfileById.get('JS-017');
const geniusSocietyZandar = geniusSocietyProfileById.get('zhiku_character_rebuild_zandar_profile');
assert(
  geniusSocietyPreset.id === 'zhiku_genius_society_character_rebuild' &&
    geniusSocietyPreset.updatedAt === '2026-06-10-genius-society-character-profiles-8' &&
    geniusSocietyPreset.entries?.length === 4 &&
    geniusSocietyRuanMei &&
    geniusSocietyScrewllum &&
    geniusSocietyStephen &&
    geniusSocietyZandar &&
    !geniusSocietyProfileById.has('JS-012'),
  'Genius Society rebuilt character preset must exist with Ruan Mei, Screwllum, Stephen, and Zandar.',
);
assert(
  String(geniusSocietyRuanMei?.['原文'] ?? '').includes('天才俱乐部#81') &&
    String(geniusSocietyRuanMei?.['原文'] ?? '').includes('生命科学') &&
    String(geniusSocietyRuanMei?.['原文'] ?? '').includes('繁育令使复制实验') &&
    String(geniusSocietyRuanMei?.['原文'] ?? '').includes('糕点、冰川与爱的气味') &&
    String(geniusSocietyRuanMei?.['原文'] ?? '').includes('唯有科学不会辜负') &&
    String(geniusSocietyRuanMei?.['原文'] ?? '').includes('那只被戏称为“电饭煲”的装置') &&
    String(geniusSocietyRuanMei?.['原文'] ?? '').includes('我叫阮·梅，念我名字时') &&
    String(geniusSocietyRuanMei?.['原文'] ?? '').includes('科学出自狂热，这是种天赋') &&
    String(geniusSocietyRuanMei?.['原文'] ?? '').includes('### 关于大黑塔') &&
    !String(geniusSocietyRuanMei?.['原文'] ?? '').includes('解锁条件') &&
    !String(geniusSocietyRuanMei?.['原文'] ?? '').includes('角色等级') &&
    String(geniusSocietyRuanMei?.['原文'] ?? '').includes('不能写成纯恶') &&
    geniusSocietyRuanMei?.['关键词']?.includes('阮·梅天才俱乐部#81') &&
    geniusSocietyRuanMei?.['关键词']?.includes('阮·梅冰川科考') &&
    geniusSocietyRuanMei?.['关键词']?.includes('阮·梅听戏语料') &&
    geniusSocietyRuanMei?.['关键词']?.includes('阮·梅关于大黑塔') &&
    !geniusSocietyRuanMei?.['关键词']?.includes('天才俱乐部') &&
    !geniusSocietyRuanMei?.['关键词']?.includes('模拟宇宙'),
  'Ruan Mei rebuilt profile must keep core anchors and avoid broad bare keywords.',
);
assert(
  String(geniusSocietyStephen?.['原文'] ?? '').includes('天才俱乐部#84') &&
    String(geniusSocietyStephen?.['原文'] ?? '').includes('养父的水果店') &&
    String(geniusSocietyStephen?.['原文'] ?? '').includes('## 人物底色') &&
    String(geniusSocietyStephen?.['原文'] ?? '').includes('## 写法收束') &&
    !String(geniusSocietyStephen?.['原文'] ?? '').includes('当前信息基') &&
    !String(geniusSocietyStephen?.['原文'] ?? '').includes('## 本回合注入建议') &&
    geniusSocietyStephen?.['关键词']?.includes('史蒂芬西瓜冻糕') &&
    !geniusSocietyStephen?.['关键词']?.includes('游戏') &&
    String(geniusSocietyZandar?.['原文'] ?? '').includes('天才俱乐部#1') &&
    String(geniusSocietyZandar?.['原文'] ?? '').includes('思想碎片') &&
    String(geniusSocietyZandar?.['原文'] ?? '').includes('## 人物底色') &&
    String(geniusSocietyZandar?.['原文'] ?? '').includes('## 写法收束') &&
    !String(geniusSocietyZandar?.['原文'] ?? '').includes('当前信息基') &&
    !String(geniusSocietyZandar?.['原文'] ?? '').includes('## 本回合注入建议') &&
    geniusSocietyZandar?.['关键词']?.includes('赞达尔来古士边界') &&
    !geniusSocietyZandar?.['关键词']?.includes('博识尊'),
  'Genius Society lightweight NPC profiles must keep strict triggers and compact anchors.',
);
assert(
  String(geniusSocietyScrewllum?.['原文'] ?? '').includes('天才俱乐部#76') &&
    String(geniusSocietyScrewllum?.['原文'] ?? '').includes('螺丝星的君王') &&
    String(geniusSocietyScrewllum?.['原文'] ?? '').includes('机械贵族') &&
    String(geniusSocietyScrewllum?.['原文'] ?? '').includes('银狼黑客交锋与朋克洛德精神事件') &&
    String(geniusSocietyScrewllum?.['原文'] ?? '').includes('机械帝皇战争后的布谷鸟钟') &&
    String(geniusSocietyScrewllum?.['原文'] ?? '').includes('七十六个被冻结的账号') &&
    String(geniusSocietyScrewllum?.['原文'] ?? '').includes('协助把意识带离梦境系统') &&
    !String(geniusSocietyScrewllum?.['原文'] ?? '').includes('官方可直接展开') &&
    !String(geniusSocietyScrewllum?.['原文'] ?? '').includes('可核验身份锚点') &&
    String(geniusSocietyScrewllum?.['原文'] ?? '').includes('“提问：我们当前最需要确认的') &&
    String(geniusSocietyScrewllum?.['原文'] ?? '').includes('“风险：您再向前一步') &&
    String(geniusSocietyScrewllum?.['说话方式'] ?? '').includes('提问、前提、逻辑、校验、风险、结论、建议') &&
    geniusSocietyScrewllum?.['关键词']?.includes('螺丝咕姆天才俱乐部#76') &&
    geniusSocietyScrewllum?.['关键词']?.includes('螺丝咕姆提问逻辑结论语料') &&
    geniusSocietyScrewllum?.['关键词']?.includes('螺丝咕姆机械布谷鸟钟') &&
    geniusSocietyScrewllum?.['关键词']?.includes('螺丝咕姆查德威克意识归还') &&
    !geniusSocietyScrewllum?.['关键词']?.includes('螺丝星') &&
    !geniusSocietyScrewllum?.['关键词']?.includes('机械生命'),
  'Screwllum rebuilt profile must keep core anchors and avoid broad bare keywords.',
);
const intelligentsiaGuildRatio = intelligentsiaGuildProfileById.get('JS-019');
assert(
  intelligentsiaGuildPreset.id === 'zhiku_intelligentsia_guild_character_rebuild' &&
    intelligentsiaGuildPreset.updatedAt === '2026-06-10-intelligentsia-guild-character-profiles-3' &&
    intelligentsiaGuildPreset.entries?.length === 1 &&
    intelligentsiaGuildRatio &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('石膏头雕') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('荣德教授') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('第八个博士') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('星际和平公司的正式邀请') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('庸众院') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('医治宇宙') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('### 关于自己•头套') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('### 关于自己•真容') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('### 闲谈•博识学会') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('### 关于阮·梅') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('### 关于砂金') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('### 关于星期日') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('我离不开书籍和浴缸') &&
    String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('愚者自以为聪明') &&
    !String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('角色等级') &&
    !String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('解锁条件') &&
    !String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('## 角色档案包说明') &&
    !String(intelligentsiaGuildRatio?.['原文'] ?? '').includes('## 本回合注入建议') &&
    intelligentsiaGuildRatio?.['关键词']?.includes('真理医生石膏头雕') &&
    intelligentsiaGuildRatio?.['关键词']?.includes('真理医生关于砂金') &&
    intelligentsiaGuildRatio?.['关键词']?.includes('真理医生荣德推荐信') &&
    intelligentsiaGuildRatio?.['关键词']?.includes('真理医生第八个博士') &&
    intelligentsiaGuildRatio?.['关键词']?.includes('真理医生庸众院') &&
    intelligentsiaGuildRatio?.['关键词']?.includes('真理医生头套语料') &&
    intelligentsiaGuildRatio?.['关键词']?.includes('真理医生真容语料') &&
    intelligentsiaGuildRatio?.['关键词']?.includes('真理医生关于星期日') &&
    !intelligentsiaGuildRatio?.['关键词']?.includes('博识学会') &&
    !intelligentsiaGuildRatio?.['关键词']?.includes('智识') &&
    !intelligentsiaGuildRatio?.['关键词']?.includes('学者') &&
    !intelligentsiaGuildRatio?.['关键词']?.includes('医生') &&
    !intelligentsiaGuildRatio?.['关键词']?.includes('天才'),
  'Intelligentsia Guild Dr. Ratio profile must exist with strict triggers and compact academic anchors.',
);
assert(
  belobogPreset.id === 'zhiku_belobog_character_rebuild' &&
    belobogPreset.updatedAt === '2026-06-10-belobog-character-profiles-15' &&
    belobogPreset.entries?.length === 13 &&
    belobogProfileById.has('JS-020') &&
    belobogProfileById.has('JS-021') &&
    belobogProfileById.has('JS-022') &&
    belobogProfileById.has('JS-028') &&
    belobogProfileById.has('JS-032') &&
    belobogPreset.id !== 'zhiku_belogog_character_rebuild',
  'Belobog rebuilt character preset must exist with corrected id and first-pass profiles.',
);
assert(
  xianzhouLuofuPreset.id === 'zhiku_xianzhou_luofu_character_rebuild' &&
    xianzhouLuofuPreset.updatedAt === '2026-06-18-xianzhou-luofu-story-layer-full-rewrite' &&
    xianzhouLuofuPreset.entries?.length === 15 &&
    [
      'JS-033',
      'JS-034',
      'JS-035',
      'JS-036',
      'JS-037',
      'JS-038',
      'JS-039',
      'JS-040',
      'JS-041',
      'JS-042',
      'JS-043',
      'JS-044',
      'JS-045',
      'JS-046',
      'JS-047',
    ].every((id) => xianzhouLuofuProfileById.has(id)) &&
    !xianzhouLuofuPreset.entries?.some((e) => e.标题 === '云璃' || e.关联角色ID === '云璃') &&
    String(xianzhouLuofuProfileById.get('JS-038')?.原文 ?? '').includes('丹鼎司丹士长') &&
    String(xianzhouLuofuProfileById.get('JS-038')?.原文 ?? '').includes('浮元') &&
    !xianzhouLuofuPreset.entries?.some((e) => e.标题 === '飞霄' || e.关联角色ID === '飞霄') &&
    !xianzhouLuofuPreset.entries?.some((e) => e.标题 === '椒丘' || e.关联角色ID === '椒丘') &&
    !xianzhouLuofuPreset.entries?.some((e) => e.标题 === '貊泽' || e.关联角色ID === '貊泽') &&
    !xianzhouLuofuPreset.entries?.some((e) => e.标题 === '怀炎' || e.关联角色ID === '怀炎'),
  'Xianzhou Luofu rebuilt character preset must exist with Luofu roster and exclude other-ship characters.',
);
const xianzhouLuofuBailu = xianzhouLuofuProfileById.get('JS-036');
assert(
  String(xianzhouLuofuBailu?.原文 ?? '').includes('### 丹鼎司医案：狐人巧克力中毒') &&
    String(xianzhouLuofuBailu?.原文 ?? '').includes('### 龙师诊察：无梦、龙心与尺木缚锁') &&
    String(xianzhouLuofuBailu?.原文 ?? '').includes('多喝热水') &&
    String(xianzhouLuofuBailu?.原文 ?? '').includes('治病时常闭着眼睛') &&
    String(xianzhouLuofuBailu?.原文 ?? '').includes('尺木缚锁') &&
    !String(xianzhouLuofuBailu?.原文 ?? '').includes('角色等级') &&
    !String(xianzhouLuofuBailu?.原文 ?? '').includes('解锁条件') &&
    xianzhouLuofuBailu?.关键词?.includes('白露丹鼎司医案') &&
    xianzhouLuofuBailu?.关键词?.includes('白露尺木缚锁') &&
    !xianzhouLuofuBailu?.关键词?.includes('丹鼎司') &&
    !xianzhouLuofuBailu?.关键词?.includes('持明族') &&
    !xianzhouLuofuBailu?.关键词?.includes('医生'),
  'Xianzhou Luofu Bailu profile must keep refined story anchors and strict triggers.',
);
for (const entry of xianzhouLuofuPreset.entries ?? []) {
  const source = String(entry.原文 ?? '');
  const storyLayer = source.match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 语料层)/)?.[1] ?? '';
  assert(
    source.includes('## 角色详情') &&
      source.includes('## 角色故事层') &&
      source.includes('## 语料层') &&
      storyLayer.length >= 600 &&
      (storyLayer.match(/^### /gm) ?? []).length === 5 &&
      storyLayer.includes('### 写法指导') &&
      !source.includes('角色等级') &&
      !source.includes('解锁条件'),
    `Xianzhou Luofu ${entry.标题} profile must keep expanded refined story and corpus layers with 写法指导 section.`,
  );
  assert(
    typeof entry.出身 === 'string' &&
      entry.出身.length >= 20 &&
      typeof entry.外貌锚点 === 'string' &&
      entry.外貌锚点.length >= 60 &&
      source.includes('- 出身：') &&
      source.includes('- 外貌锚点：') &&
      source.includes('- 出身锚点：') &&
      source.includes('- 视觉锚点：') &&
      source.includes(`- 外貌：${entry.外貌锚点}`) &&
      entry.关键词?.includes(`${entry.标题}出身`) &&
      entry.关键词?.includes(`${entry.标题}外貌锚点`) &&
      !source.includes('官方未公开') &&
      !source.includes('官方资料'),
    `Xianzhou Luofu ${entry.标题} profile must keep profiles-8 refined origin and appearance anchors.`,
  );
}
// IPC preset basic assertions
{
  assert(ipcPreset.id === 'zhiku_interastral_peace_corporation_character_rebuild', 'IPC preset id changed.');
  assert(ipcPreset.updatedAt === '2026-06-18-ipc-character-profiles-1', 'IPC preset updatedAt changed.');
  assert(ipcPreset.entries?.length === 3, `IPC preset must have 3 entries, got ${ipcPreset.entries?.length}.`);
  const ipcNames = ipcPreset.entries.map(e => e.标题);
  assert(ipcNames.includes('托帕'), 'IPC preset must include 托帕.');
  assert(ipcNames.includes('砂金'), 'IPC preset must include 砂金.');
  assert(ipcNames.includes('翡翠'), 'IPC preset must include 翡翠.');
  const jade = ipcPreset.entries.find(e => e.标题 === '翡翠');
  assert(jade?.资料类型 === '剧情门禁', '翡翠 must be 剧情门禁.');
  assert(jade?.解锁状态 === '未解锁', '翡翠 must be 未解锁.');
}
assert(
  String(xianzhouLuofuProfileById.get('JS-033')?.出身 ?? '').includes('地衡司') &&
    String(xianzhouLuofuProfileById.get('JS-034')?.出身 ?? '').includes('未明') &&
    String(xianzhouLuofuProfileById.get('JS-035')?.出身 ?? '').includes('玉阙仙舟') &&
    String(xianzhouLuofuProfileById.get('JS-042')?.出身 ?? '').includes('苍城仙舟幸存者') &&
    String(xianzhouLuofuProfileById.get('JS-043')?.出身 ?? '').includes('卡美洛') &&
    String(xianzhouLuofuProfileById.get('JS-044')?.出身 ?? '').includes('曜青出身') &&
    String(xianzhouLuofuProfileById.get('JS-046')?.出身 ?? '').includes('旧身出身未明') &&
    String(xianzhouLuofuProfileById.get('JS-047')?.出身 ?? '').includes('旧身出身未明') &&
    String(xianzhouLuofuProfileById.get('JS-044')?.外貌锚点 ?? '').includes('棕色长发') &&
    String(xianzhouLuofuProfileById.get('JS-040')?.外貌锚点 ?? '').includes('灰茶短发') &&
    String(xianzhouLuofuProfileById.get('JS-038')?.外貌锚点 ?? '').includes('深棕长发') &&
    !JSON.stringify(xianzhouLuofuPreset.entries ?? []).includes('素裳粉发') &&
    !JSON.stringify(xianzhouLuofuPreset.entries ?? []).includes('青雀绿发') &&
    !JSON.stringify(xianzhouLuofuPreset.entries ?? []).includes('灵砂粉发'),
  'Xianzhou Luofu profiles-8 must keep representative origin and corrected appearance anchors.',
);
for (const [id, keyword, anchor] of [
  ['JS-033', '景元完整档案', '景元长线谋局'],
  ['JS-034', '彦卿完整档案', '彦卿过刚易折'],
  ['JS-035', '符玄完整档案', '卜算不能写成绝对正确'],
  ['JS-036', '白露完整档案', '治疗能力不能无代价复活'],
  ['JS-037', '停云完整档案', '真停云'],
  ['JS-038', '灵砂完整档案', '丹朱过往'],
  ['JS-039', '驭空完整档案', '最后奋飞阶段'],
  ['JS-040', '青雀完整档案', '青雀职场哲学'],
  ['JS-041', '罗刹完整档案', '罗刹誓言边界'],
  ['JS-042', '镜流完整档案', '镜流斩神执念'],
  ['JS-043', '桂乃芬完整档案', '桂乃芬失国流亡'],
  ['JS-044', '素裳完整档案', '素裳独当一面'],
  ['JS-045', '藿藿完整档案', '藿藿怕鬼捉鬼'],
  ['JS-046', '寒鸦完整档案', '寒鸦问字判官'],
  ['JS-047', '雪衣完整档案', '雪衣拘字判官'],
]) {
  const entry = xianzhouLuofuProfileById.get(id);
  const source = String(entry?.原文 ?? '');
  assert(
    source.includes('## 常驻事实层') &&
      source.includes('## 表现锚点层') &&
      source.includes('## 能力与职责模块') &&
      source.includes('## 历史故事与阶段边界层') &&
      entry?.关键词?.includes(keyword) &&
      `${source}\n${(entry?.关键词 ?? []).join('\n')}`.includes(anchor),
    `Xianzhou Luofu ${entry?.标题 ?? id} must keep profiles-8 full-profile skeleton.`,
  );
}
assert(
  String(xianzhouLuofuProfileById.get('JS-033')?.原文 ?? '').includes('星阵棋与符卿') &&
    xianzhouLuofuProfileById.get('JS-035')?.关键词?.includes('符玄第三眼') &&
    xianzhouLuofuProfileById.get('JS-043')?.关键词?.includes('桂乃芬卡美洛') &&
    xianzhouLuofuProfileById.get('JS-046')?.关键词?.includes('寒鸦忘川酒') &&
    xianzhouLuofuProfileById.get('JS-047')?.关键词?.includes('雪衣同情心打碎'),
  'Xianzhou Luofu profiles-3 must keep representative refined story anchors.',
);
assert(
  !JSON.stringify(belobogPreset).includes('官方未公开具体年龄') &&
    !JSON.stringify(belobogPreset).includes('具体制造年代未公开') &&
    !JSON.stringify(belobogPreset).includes('官方'),
  'Belobog preset must use neutral archive wording instead of official-source display wording.',
);
assert(
  !JSON.stringify(belobogPreset).includes('角色等级20/40/60/80') &&
    !JSON.stringify(belobogPreset).includes('历史材料和异常线索'),
  'Belobog preset must not retain official-card or source-label-like wording in profile prose.',
);
assert(
  belobogPreset.id !== 'zhiku_belogog_character_rebuild' &&
    String(belobogProfileById.get('JS-020')?.['原文'] ?? '').includes('现任大守护者') &&
    String(belobogProfileById.get('JS-021')?.['原文'] ?? '').includes('不要把她和布洛妮娅关系固定成单一恋爱解释') &&
    belobogProfileById.get('JS-028')?.['性别'] === '男' &&
    belobogProfileById.get('JS-028')?.['年龄状态'] === '未知，外貌与社会互动表现为成年男性。' &&
    String(belobogProfileById.get('JS-028')?.['原文'] ?? '').includes('性别 / 性别表达：男；男性。') &&
    String(belobogProfileById.get('JS-028')?.['原文'] ?? '').includes('年龄状态：未知，外貌与社会互动表现为成年男性。') &&
    String(belobogProfileById.get('JS-028')?.['原文'] ?? '').includes('### 门禁一：贝洛伯格可疑商人（默认常驻）') &&
    String(belobogProfileById.get('JS-028')?.['原文'] ?? '').includes('### 门禁二：假面愚者 / 欢愉 / 酒馆 / 面具（深层阶段）') &&
    String(belobogProfileById.get('JS-028')?.['原文'] ?? '').includes('展开条件：匹诺康尼后续、玩家正文明确追问桑博深层身份 / 面具 / 酒馆 / 假面愚者') &&
    String(belobogProfileById.get('JS-028')?.['原文'] ?? '').includes('回落规则：深层信息完成一次提示或交锋后') &&
    belobogProfileById.get('JS-028')?.['关键词']?.includes('桑博性别男') &&
    belobogProfileById.get('JS-028')?.['关键词']?.includes('桑博年龄状态') &&
    belobogProfileById.get('JS-028')?.['关键词']?.includes('桑博门禁层') &&
    String(belobogProfileById.get('JS-032')?.['原文'] ?? '').includes('不要写成纯粹恶人') &&
    !belobogProfileById.get('JS-020')?.['关键词']?.includes('贝洛伯格') &&
    !belobogProfileById.get('JS-021')?.['关键词']?.includes('下层区'),
  'Belobog first-pass details must keep boundaries and avoid broad bare triggers.',
);
assert(
  String(belobogProfileById.get('JS-020')?.['原文'] ?? '').includes('完整天空') &&
    String(belobogProfileById.get('JS-022')?.['原文'] ?? '').includes('最坚固的盾牌') &&
    String(belobogProfileById.get('JS-023')?.['原文'] ?? '').includes('「永动」机械屋') &&
    String(belobogProfileById.get('JS-025')?.['原文'] ?? '').includes('地火的核心 / 首领级人物之一') &&
    String(belobogProfileById.get('JS-026')?.['原文'] ?? '').includes('垃圾填埋场') &&
    String(belobogProfileById.get('JS-030')?.['原文'] ?? '').includes('自由格斗家') &&
    String(belobogProfileById.get('JS-031')?.['关键词'] ?? '').includes('玲可首屈一指极地探险家') &&
    String(belobogProfileById.get('JS-032')?.['关键词'] ?? '').includes('可可利亚封锁令'),
  'Belobog profiles-3 refined anchors must stay present.',
);
assert(
  String(belobogProfileById.get('JS-020')?.['原文'] ?? '').includes('让世界变得美好') &&
    String(belobogProfileById.get('JS-029')?.['原文'] ?? '').includes('费斯曼老爹') &&
    String(belobogProfileById.get('JS-024')?.['原文'] ?? '').includes('佩拉格娅•谢尔盖耶夫娜') &&
    String(belobogProfileById.get('JS-021')?.['原文'] ?? '').includes('她们终会相遇') &&
    String(belobogProfileById.get('JS-023')?.['原文'] ?? '').includes('从来都不是任何人的附属品') &&
    !String(belobogProfileById.get('JS-020')?.['原文'] ?? '').includes('解锁条件') &&
    String(belobogProfileById.get('JS-027')?.['原文'] ?? '').includes('相关背景文本整理') &&
    String(belobogProfileById.get('JS-027')?.['原文'] ?? '').includes('非可玩角色故事本体') &&
    String(belobogProfileById.get('JS-027')?.['原文'] ?? '').includes('不可替换') &&
    String(belobogProfileById.get('JS-032')?.['原文'] ?? '').includes('纪念画像叙事') &&
    String(belobogProfileById.get('JS-032')?.['原文'] ?? '').includes('旧照片、希露瓦与被切断的过去') &&
    !String(belobogProfileById.get('JS-032')?.['原文'] ?? '').includes('魔法少女可可利亚'),
  'Belobog profiles-3 provided story bodies must stay present with unlock conditions removed.',
);
assert(
  String(belobogProfileById.get('JS-020')?.['原文'] ?? '').includes('昨天做噩梦了') &&
    String(belobogProfileById.get('JS-026')?.['原文'] ?? '').includes('机械聚落清晨') &&
    String(belobogProfileById.get('JS-029')?.['原文'] ?? '').includes('鼹鼠党集合') &&
    String(belobogProfileById.get('JS-030')?.['原文'] ?? '').includes('打击恶棍，守护镇民') &&
    String(belobogProfileById.get('JS-028')?.['原文'] ?? '').includes('行商、向导、解闷的聊天对象') &&
    belobogProfileById.get('JS-028')?.['关键词']?.includes('桑博关于花火') &&
    belobogProfileById.get('JS-020')?.['关键词']?.includes('布洛妮娅日常场景参考'),
  'Belobog profiles-4 corpus and daily-scene references must stay present.',
);
assert(
  String(belobogProfileById.get('JS-020')?.['外貌锚点'] ?? '').includes('三束螺旋') &&
    String(belobogProfileById.get('JS-021')?.['外貌锚点'] ?? '').includes('深靛紫长发') &&
    String(belobogProfileById.get('JS-024')?.['外貌锚点'] ?? '').includes('圆框眼镜') &&
    String(belobogProfileById.get('JS-029')?.['外貌锚点'] ?? '').includes('乌莎卡帽') &&
    String(belobogProfileById.get('JS-031')?.['外貌锚点'] ?? '').includes('猞猁耳形轮廓'),
  'Belobog profiles-5 appearance anchors must stay detailed.',
);
assert(
  [
    'JS-020',
    'JS-021',
    'JS-022',
    'JS-023',
    'JS-024',
    'JS-025',
    'JS-026',
    'JS-027',
    'JS-029',
    'JS-030',
    'JS-031',
    'JS-032',
  ].every((id) => belobogProfileById.get(id)?.['出身'] === '贝洛伯格') &&
    belobogProfileById.get('JS-028')?.['出身']?.includes('未明') &&
    belobogProfileById.get('JS-028')?.['出身']?.includes('不按贝洛伯格本地人固定'),
  'Belobog profiles-6 origins must keep Sampo as the exception.',
);
assert(
  !String(belobogProfileById.get('JS-020')?.['原文'] ?? '').includes('### 基础语料') &&
    !String(belobogProfileById.get('JS-020')?.['原文'] ?? '').includes('### 对他人的看法') &&
    String(belobogProfileById.get('JS-020')?.['原文'] ?? '').includes('### 初次见面') &&
    String(belobogProfileById.get('JS-020')?.['原文'] ?? '').includes('### 关于杰帕德') &&
    String(belobogProfileById.get('JS-028')?.['原文'] ?? '').includes('### 关于花火'),
  'Belobog profiles-7 corpus headings must use per-item UI cards.',
);
assert(
  [
    'JS-020',
    'JS-021',
    'JS-022',
    'JS-023',
    'JS-024',
    'JS-025',
    'JS-026',
    'JS-027',
    'JS-028',
    'JS-029',
    'JS-030',
    'JS-031',
    'JS-032',
  ].every((id) => {
    const abilityLayer = String(belobogProfileById.get(id)?.['原文'] ?? '').match(/## 能力与职责模块\n\n([\s\S]*?)(?=\n\n## 历史故事与|\n\n## 本回合注入建议)/)?.[1] ?? '';
    return (
      abilityLayer.includes('能力性质：') &&
      abilityLayer.includes('可写表现：') &&
      abilityLayer.includes('非战斗用法：') &&
      abilityLayer.includes('不写成游戏资料卡式命途 / 属性说明') &&
      abilityLayer.length > 300
    );
  }) &&
    String(belobogProfileById.get('JS-026')?.['外貌锚点'] ?? '').includes('宽大的红色外套') &&
    !String(belobogProfileById.get('JS-026')?.['原文'] ?? '').includes('oversized') &&
    String(belobogProfileById.get('JS-032')?.['原文'] ?? '').includes('主线后主要以回忆、记录、梦境、政治遗留或特殊剧情出现'),
  'Belobog profiles-11 ability layers must be expanded and Clara oversized wording must be localized.',
);
assert(
  String(belobogProfileById.get('JS-027')?.['原文'] ?? '').includes('### 关于螺丝咕姆') &&
    String(belobogProfileById.get('JS-027')?.['原文'] ?? '').includes('本机正在持续修正该词条的定义') &&
    String(belobogProfileById.get('JS-027')?.['原文'] ?? '').includes('保护并不等同于关闭所有大门') &&
    belobogProfileById.get('JS-027')?.['关键词']?.includes('史瓦罗日常场景参考') &&
    String(belobogProfileById.get('JS-032')?.['原文'] ?? '').includes('### 星核低语阶段') &&
    String(belobogProfileById.get('JS-032')?.['原文'] ?? '').includes('### 主线后回忆口吻') &&
    String(belobogProfileById.get('JS-032')?.['原文'] ?? '').includes('旧友相关') &&
    belobogProfileById.get('JS-032')?.['关键词']?.includes('可可利亚星核低语语料') &&
    belobogProfileById.get('JS-032')?.['关键词']?.includes('可可利亚日常场景参考') &&
    !String(belobogProfileById.get('JS-032')?.['原文'] ?? '').includes('魔法少女可可利亚'),
  'Belobog profiles-10 Svarog and Cocolia corpus anchors must stay present without magic-girl material.',
);
assert(
    String(stellaronHuntersProfileById.get('JS-007')?.['原文'] ?? '').includes('温柔外壳下的控制') &&
    String(stellaronHuntersProfileById.get('JS-007')?.['原文'] ?? '').includes('言语控制不能无理由夺走玩家选择权') &&
    String(stellaronHuntersProfileById.get('JS-007')?.['原文'] ?? '').includes('卡芙卡角色详情') &&
    String(stellaronHuntersProfileById.get('JS-007')?.['原文'] ?? '').includes('星际和平公司通缉令') &&
    String(stellaronHuntersProfileById.get('JS-007')?.['原文'] ?? '').includes('天衣五：新巴比伦') &&
    String(stellaronHuntersProfileById.get('JS-007')?.['原文'] ?? '').includes('擅长制造「恐惧」') &&
    String(stellaronHuntersProfileById.get('JS-007')?.['原文'] ?? '').includes('我喜欢和银狼聊天') &&
    String(stellaronHuntersProfileById.get('JS-007')?.['原文'] ?? '').includes('### 关于萨姆') &&
    String(stellaronHuntersProfileById.get('JS-007')?.['原文'] ?? '').includes('### 关于流萤') &&
    String(stellaronHuntersProfileById.get('JS-007')?.['原文'] ?? '').includes('每到夏天，我都会去那里看海') &&
    stellaronHuntersProfileById.get('JS-007')?.['关键词']?.includes('卡芙卡关于流萤') &&
    stellaronHuntersProfileById.get('JS-007')?.['关键词']?.includes('卡芙卡看海') &&
    String(stellaronHuntersProfileById.get('JS-008')?.['原文'] ?? '').includes('丹枫是丹恒的前世，丹恒不是丹枫当前人格') &&
    String(stellaronHuntersProfileById.get('JS-008')?.['原文'] ?? '').includes('不要让所有人随口叫他应星') &&
    String(stellaronHuntersProfileById.get('JS-008')?.['原文'] ?? '').includes('刃角色详情') &&
    String(stellaronHuntersProfileById.get('JS-008')?.['原文'] ?? '').includes('记住死亡的感觉') &&
    String(stellaronHuntersProfileById.get('JS-008')?.['原文'] ?? '').includes('从今往后，那具躯壳，将是唯一的「刃」') &&
    String(stellaronHuntersProfileById.get('JS-008')?.['原文'] ?? '').includes('又来了？…被我记住的人') &&
    String(stellaronHuntersProfileById.get('JS-008')?.['原文'] ?? '').includes('人有五名，代价有三个') &&
    String(stellaronHuntersProfileById.get('JS-008')?.['原文'] ?? '').includes('缚住魔阴的绳子在她手中') &&
    String(stellaronHuntersProfileById.get('JS-008')?.['原文'] ?? '').includes('我渴望终结，而她渴望生存') &&
    stellaronHuntersProfileById.get('JS-008')?.['关键词']?.includes('刃关于流萤') &&
    stellaronHuntersProfileById.get('JS-008')?.['关键词']?.includes('刃日常语料') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('银狼角色故事一：地下室的游戏结束') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('银狼LV.999角色详情') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('最高保密等级藏品，「银狼LV.999」以太卡带遭窃') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('【成就】「GAME NOT OVER」') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('「ID：银狼LV.999」登入「幻月游戏」') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('以太卡带形态 / 能力边界') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('银狼知道这张卡带和LV.999能力存在') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('卡带被艾利欧没收') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('不要写成银狼完全不知道这个能力') &&
    !String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('活动 / 游戏化阶段称呼') &&
    stellaronHuntersProfileById.get('JS-009')?.['关键词']?.includes('银狼LV999知情但受限') &&
    stellaronHuntersProfileById.get('JS-009')?.['关键词']?.includes('银狼卡带被没收') &&
    stellaronHuntersProfileById.get('JS-009')?.['关键词']?.includes('银狼LV999角色故事') &&
    stellaronHuntersProfileById.get('JS-009')?.['关键词']?.includes('LV999卡带权限') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('今天也上线啦') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('普罗米修斯搭载了四个模块') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('不能开小号，艾利欧也不行') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('LV.999形态语料（按卡带权限 / 剧情阶段启用）') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('关于火花') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('关于千冶•刃') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['禁止误写'] ?? '').includes('不要把LV.999形态语料当作普通常态全量口吻') &&
    stellaronHuntersProfileById.get('JS-009')?.['关键词']?.includes('银狼普罗米修斯') &&
    stellaronHuntersProfileById.get('JS-009')?.['关键词']?.includes('银狼不能开小号') &&
    stellaronHuntersProfileById.get('JS-009')?.['关键词']?.includes('银狼LV999形态语料') &&
    stellaronHuntersProfileById.get('JS-009')?.['关键词']?.includes('银狼LV999关于火花') &&
    stellaronHuntersProfileById.get('JS-009')?.['关键词']?.includes('银狼LV999关于千冶刃') &&
    String(stellaronHuntersProfileById.get('JS-009')?.['原文'] ?? '').includes('不要把她变成万能解法') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('流萤与萨姆是同一个人') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('萨姆是名为火萤Ⅳ型的战略强袭机甲') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('AR-26710 是她作为格拉默铁骑 / 基因改造兵器时期的编号') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('不要把萨姆写成独立角色') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['禁止误写'] ?? '').includes('不要把AR-26710写成萨姆机甲型号') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('不能被写成绝对无法治愈或永远无解') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['禁止误写'] ?? '').includes('不要把失熵写成绝对无法治愈、永远无解或已经被彻底治愈') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('透明的培养仓中，她浸没在冰冷的人工羊水里') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('AR-26702——那是什么') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('AR-4077') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('它们虽然是渺小的生命，却比星星更耀眼') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('这就是…梦？') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('嗨，又见面啦…我的意思，很高兴见到你') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('我希望以「流萤」的身份认识这个世界') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('我没有做梦的机能') &&
    String(stellaronHuntersProfileById.get('JS-010')?.['原文'] ?? '').includes('关于大丽花') &&
    stellaronHuntersProfileById.get('JS-010')?.['关键词']?.includes('流萤萨姆同一人') &&
    stellaronHuntersProfileById.get('JS-010')?.['关键词']?.includes('萨姆不是独立角色') &&
    stellaronHuntersProfileById.get('JS-010')?.['关键词']?.includes('火萤Ⅳ型') &&
    stellaronHuntersProfileById.get('JS-010')?.['关键词']?.includes('流萤AR26710') &&
    stellaronHuntersProfileById.get('JS-010')?.['关键词']?.includes('萨姆身份揭露') &&
    stellaronHuntersProfileById.get('JS-010')?.['关键词']?.includes('流萤关于自己萨姆') &&
    stellaronHuntersProfileById.get('JS-010')?.['关键词']?.includes('流萤烦恼睡眠') &&
    stellaronHuntersProfileById.get('JS-010')?.['关键词']?.includes('流萤关于大丽花') &&
    String(stellaronHuntersProfileById.get('JS-011')?.['原文'] ?? '').includes('艾利欧暂不提供语料') &&
    String(stellaronHuntersProfileById.get('JS-011')?.['原文'] ?? '').includes('本档案不提供“艾利欧亲口说”的示例台词') &&
    String(stellaronHuntersProfileById.get('JS-011')?.['原文'] ?? '').includes('也不提供拟造句式让模型模仿') &&
    String(stellaronHuntersProfileById.get('JS-011')?.['原文'] ?? '').includes('不编造艾利欧直接台词') &&
    String(stellaronHuntersProfileById.get('JS-011')?.['外貌锚点'] ?? '').includes('不得编造人形外貌') &&
    stellaronHuntersProfileById.get('JS-011')?.['关键词']?.includes('暂无语料') &&
    !stellaronHuntersProfileById.get('JS-011')?.['关键词']?.includes('语料只作参考') &&
    !String(stellaronHuntersProfileById.get('JS-011')?.['原文'] ?? '').includes('### 剧本文本参考') &&
    !String(stellaronHuntersProfileById.get('JS-011')?.['原文'] ?? '').includes('### 初见与'),
  'Stellaron Hunters profile details must keep role-specific stage and Elio no-speech boundaries.',
);
const hertaStationProfiles = [
  hertaStationProfileById.get('JS-012'),
  hertaStationProfileById.get('JS-013'),
  hertaStationProfileById.get('JS-014'),
];
assert(
  hertaStationPreset.id === 'zhiku_herta_station_character_rebuild' &&
    hertaStationPreset.updatedAt === '2026-06-08-herta-station-character-profiles-12' &&
    hertaStationProfiles.every(Boolean),
  'Herta Space Station rebuilt character preset must exist with Herta, Asta, and Arlan.',
);
assert(
  hertaStationProfiles.every((entry) =>
    entry['关键词']?.includes('资料大区:黑塔空间站') &&
    entry['关键词']?.includes('节点:单角色档案') &&
    entry['关键词']?.includes('核心触发词收窄') &&
    String(entry['原文'] ?? '').includes('语料只用于学习') &&
    String(entry['原文'] ?? '').includes('不能照着写'),
  ),
  'Herta Space Station rebuilt profiles must keep grouping and corpus rules.',
);
assert(
  String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('不要因地点出现“黑塔空间站”、系统出现“模拟宇宙”或资料出现“奇物收藏”就自动让黑塔本人出场') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('空间站中存在多个黑塔人偶') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('阶段边界：大黑塔 / 本体成年形态') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('大黑塔角色故事一：天才的童年万华镜') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('大黑塔角色故事四：模拟宇宙运行记录') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('大黑塔仍是同一个黑塔，不拆成新角色') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('常驻人偶共有249个、备用人偶共32个') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('多数黑塔人偶只是空壳，没有自主意识') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('奇物用于烹饪') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('私人密室常年封锁') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('传闻称空间站「黑塔」就是为了隐藏私人密室而建造') &&
    String(hertaStationProfileById.get('JS-012')?.['禁止误写'] ?? '').includes('不要让多数人偶拥有自主意识') &&
    String(hertaStationProfileById.get('JS-012')?.['禁止误写'] ?? '').includes('不要把私人密室传闻写成公开事实') &&
    String(hertaStationProfileById.get('JS-012')?.['说话方式'] ?? '').includes('远程人偶 / 自动应答式') &&
    String(hertaStationProfileById.get('JS-012')?.['说话方式'] ?? '').includes('黑塔编号') &&
    String(hertaStationProfileById.get('JS-012')?.['说话方式'] ?? '').includes('显然可得 / 显然可见 / 显然可知') &&
    String(hertaStationProfileById.get('JS-012')?.['说话方式'] ?? '').includes('不能写成极端冷血') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('### 大黑塔本体语料') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('### 大黑塔对他人的看法') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('关于星/穹') &&
    !String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('#### 关于开拓者') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('关于螺丝咕姆') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('求你了，来测') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('姬子一较高下') &&
    String(hertaStationProfileById.get('JS-013')?.['身份'] ?? '').includes('首席研究员') &&
    String(hertaStationProfileById.get('JS-014')?.['外貌锚点'] ?? '').includes('白色短发与黑色发梢'),
  'Herta Space Station profile details must keep tightened recall and corrected identity/appearance anchors.',
);
assert(
  String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('湛蓝星智商最高的人类') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('高高在上但并非冷血的善意') &&
    String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('藏在资源 / 权限 / 实验支持里的善意') &&
    String(hertaStationProfileById.get('JS-013')?.['原文'] ?? '').includes('好奇心与精力都很旺盛的少女') &&
    String(hertaStationProfileById.get('JS-014')?.['原文'] ?? '').includes('把负伤视作履行职责后留下的勋章'),
  'Herta Space Station resident facts must keep character-color wording instead of official profile prose.',
);
assert(
  String(hertaStationProfileById.get('JS-012')?.['原文'] ?? '').includes('写完了，但是找不到了') &&
    String(hertaStationProfileById.get('JS-013')?.['原文'] ?? '').includes('阿兰的那顿饭钱，在他说出要还钱的那个时刻，就已经结清了') &&
    String(hertaStationProfileById.get('JS-014')?.['原文'] ?? '').includes('他用大剑支撑着自己的身体，缓慢地、坚定地站起身') &&
    !hertaStationProfiles.some((entry) => {
      const storyLayer = String(entry['原文'] ?? '').match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 表现锚点层)/)?.[1] ?? '';
      return storyLayer.includes('解锁条件');
    }),
  'Herta Space Station story layers must use provided story bodies without unlock-condition titles.',
);
assert(
  String(hertaStationProfileById.get('JS-013')?.['原文'] ?? '').includes('### 背景边界：家族压力与自我轨迹') &&
    !String(hertaStationProfileById.get('JS-013')?.['原文'] ?? '').includes('阶段边界：家族压力与自我轨迹') &&
    String(hertaStationProfileById.get('JS-014')?.['原文'] ?? '').includes('### 危机场景边界：反物质军团危机与重伤承接') &&
    !String(hertaStationProfileById.get('JS-014')?.['原文'] ?? '').includes('阶段边界：反物质军团危机与重伤承接'),
  'Asta and Arlan Herta Station boundaries must stay as writing boundaries instead of gate cards.',
);

if (isAstralExpressCharacterProfileSet) {
  const stelle = profileById.get('JS-000');
  const caelus = profileById.get('JS-001');
  const profile = profileById.get('JS-002');
  const welt = profileById.get('JS-003');
  const danheng = profileById.get('JS-004');
  const himeko = profileById.get('JS-005');
  const pompom = profileById.get('JS-006');
  const stelleSource = String(stelle['原文'] ?? '');
  const caelusSource = String(caelus['原文'] ?? '');
  const source = String(profile['原文'] ?? '');
  const weltSource = String(welt['原文'] ?? '');
  const danhengSource = String(danheng['原文'] ?? '');
  const danhengBaseIdentity = danhengSource.match(/## 基础识别\n\n([\s\S]*?)(?=\n\n## )/)?.[1] ?? '';
  const danhengStoryLayer = danhengSource.match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 表现锚点层)/)?.[1] ?? '';
  const danhengGateLayer = danhengSource.match(/## 历史故事与阶段边界层\n\n([\s\S]*?)(?=\n\n## 本回合注入建议)/)?.[1] ?? '';
  const himekoSource = String(himeko['原文'] ?? '');
  assert(stelle['标题'] === '星', 'Astral Express profile set must include the Stelle profile.');
  assert(caelus['标题'] === '穹', 'Astral Express profile set must include the Caelus profile.');
  assert(profile['标题'] === '三月七', 'Astral Express profile set must keep the March 7th display title.');
  assert(welt['标题'] === '瓦尔特·杨', 'Astral Express profile set must include the Welt Yang profile.');
  assert(danheng['标题'] === '丹恒', 'Astral Express profile set must include the Dan Heng profile.');
  assert(himeko['标题'] === '姬子', 'Astral Express profile set must include the Himeko profile.');
  assert(pompom['标题'] === '帕姆', 'Astral Express profile set must include the Pom-Pom profile.');
  assertCoreTriggers(stelle, ['星', 'Stelle', '女性开拓者', '灰发开拓者', '银河球棒侠'], 'Stelle profile');
  assertCoreTriggers(caelus, ['穹', 'Caelus', '男性开拓者', '灰发开拓者'], 'Caelus profile');
  assertCoreTriggers(profile, ['三月七', '三月', '小三月', 'March 7th', '六相冰', '拍照', '相机', '失忆', '恒冰', '长夜月', '长月夜'], 'March profile');
  assertCoreTriggers(welt, ['瓦尔特', '瓦尔特·杨', '杨叔', '老杨', 'Welt', 'Welt Yang', '约阿希姆', '约阿希姆·诺基安维塔宁', '手杖', '眼镜', '重力', '黑洞', '动画师', '阿拉哈托'], 'Welt profile');
  assert(!getCoreTriggerTerms(welt).includes('前逆熵盟主'), 'Welt profile must not use past-world titles as default core triggers.');
  assertCoreTriggers(danheng, ['丹恒', 'Dan Heng', '冷面小青龙', '列车护卫', '智库管理员', '长枪', '击云', '持明族', '仙舟罗浮', '丹恒·饮月', '饮月君', '龙尊', '丹枫', '丹恒·腾荒', '腾荒'], 'Dan Heng profile');
  assertCoreTriggers(himeko, ['姬子', 'Himeko', '姬子姐姐', '领航员', '冒险科学家', '咖啡', '手提箱', '列车修复', '修复列车', '航路', '群星', '轨道炮', '卫星火力', '姬子·启行'], 'Himeko profile');
  assertCoreTriggers(pompom, ['帕姆', 'Pom-Pom', '列车长', '帕姆列车长', '本帕', '星穹列车列车长', '观景车厢', '列车规则', '跃迁', '列车广播', '乘客安全', '车厢打扫', '列车长的馈赠', '常回家看看'], 'Pom-Pom profile');
  assertNoBareKeywords(stelle, ['开拓者', '星核载体', '毁灭开拓者', '存护开拓者', '同谐开拓者', '记忆开拓者', '欢愉开拓者'], 'Stelle profile');
  assertNoBareKeywords(caelus, ['开拓者', '星核载体', '毁灭开拓者', '存护开拓者', '同谐开拓者', '记忆开拓者', '欢愉开拓者'], 'Caelus profile');
  assertNoBareKeywords(profile, ['星穹列车', '无名客', '列车组', '开拓者', '杨叔', '丹恒', '姬子咖啡', '咖啡语料', '咖啡吐槽', '列车组咖啡反应'], 'March profile');
  assertNoBareKeywords(welt, ['星穹列车', '无名客', '开拓者', '三月七', '丹恒', '姬子', '帕姆', '姬子咖啡', '咖啡语料', '咖啡吐槽', '列车组咖啡反应'], 'Welt profile');
  assertNoBareKeywords(danheng, ['星穹列车', '无名客', '开拓者', '三月七', '瓦尔特', '杨叔', '姬子', '帕姆', '姬子咖啡', '咖啡语料', '咖啡吐槽', '列车组咖啡反应'], 'Dan Heng profile');
  assertNoBareKeywords(himeko, ['星穹列车', '无名客', '开拓者', '三月七', '丹恒', '瓦尔特', '杨叔', '帕姆', '姬子咖啡', '咖啡语料', '咖啡吐槽', '列车组咖啡反应'], 'Himeko profile');
  assertNoBareKeywords(pompom, ['开拓者', '三月七', '丹恒', '瓦尔特', '杨叔', '姬子', '丹恒睡资料室', '三月七拍照', '姬子咖啡', '瓦尔特动画'], 'Pom-Pom profile');
  for (const [entry, entrySource, name, opposite] of [
    [stelle, stelleSource, '星', '穹'],
    [caelus, caelusSource, '穹', '星'],
  ]) {
    assert(entry['关联角色ID'] === name, `${name} profile must use a direct related role id.`);
    assert(entry['关键词']?.includes(`角色:${name}`), `${name} profile must keep its direct character trigger.`);
    assert(entry['关键词']?.includes('节点:单角色档案'), `${name} profile must stay a single character profile package.`);
    assert(entry['关键词']?.includes('玩家主导权'), `${name} profile must expose player-agency keyword.`);
    assert(entry['关键词']?.includes('命途阶段边界'), `${name} profile must expose path-stage boundary keyword.`);
    assert(entry['关键词']?.includes('语料只作参考'), `${name} profile must expose corpus reference-only keyword.`);
    assert(entry['关键词']?.includes('禁止照抄语料'), `${name} profile must expose corpus anti-copy keyword.`);
    assert(entry['关键词']?.includes('角色故事'), `${name} profile must expose unlocked stage-story keyword.`);
    assert(entry['关键词']?.includes('日常同行'), `${name} profile must expose daily-corpus keyword.`);
    assert(entry['关键词']?.includes('列车组关系'), `${name} profile must expose Astral Express relationship corpus keyword.`);
    assert(entry['关键词']?.includes('阶段角色故事'), `${name} profile must expose renamed stage-story keyword.`);
    assert(entry['关键词']?.includes('主动接话'), `${name} profile must expose active-reply keyword.`);
    assert(entry['关键词']?.includes('防沉默'), `${name} profile must expose anti-silence keyword.`);
    assert(
      entrySource.includes('只作口吻参考，不能照着写') &&
        entrySource.includes('不得原句搬运') &&
        entrySource.includes(`${name}是在黑塔空间站醒来的开拓者`) &&
        entrySource.includes('不是带着完整答案登上列车的人') &&
        entrySource.includes('主剧情必须优先承接玩家输入') &&
        entrySource.includes('不能替玩家决定态度、路线、承诺、亲密边界或重大行动') &&
        entrySource.includes('### 日常同行') &&
        entrySource.includes('### 主动接话与抽象联想') &&
        entrySource.includes('不能长期失语') &&
        entrySource.includes('别等我沉默。我还在，能行动，也能回答。') &&
        entrySource.includes('### 列车组关系') &&
        entrySource.includes('### 角色故事阶段层说明') &&
        entrySource.includes('### 角色故事一：旅途正在继续') &&
        entrySource.includes('完成开拓任务「旅途正在继续」') &&
        entrySource.includes('——以你自己的意志。') &&
        entrySource.includes('### 角色故事二：静静的星河') &&
        entrySource.includes('存护之城') &&
        entrySource.includes('### 角色故事三：然后，在第八天…') &&
        entrySource.includes('永恒的美梦消散于一瞬') &&
        entrySource.includes('### 角色故事四：落英啊，残芳纷飞留归躅') &&
        entrySource.includes('银河已知晓「翁法罗斯」的姓名') &&
        entrySource.includes('## 历史故事与命途阶段边界层') &&
        entrySource.includes('新增的“角色故事”按剧情阶段使用') &&
        entrySource.includes('命途形态是开拓者在旅途中获得的能力阶段，不是不同人格，也不是多条独立角色') &&
        entrySource.includes('默认以球棒近战、星核反应、正面破局和危机承担为基础') &&
        entrySource.includes('不写成原作游戏资料卡式的命途 / 属性说明') &&
        entrySource.includes('具体表现必须匹配当前剧情阶段') &&
        entrySource.includes('不得把未解锁故事当作当前事实') &&
        entrySource.includes(`不要与${opposite}`) &&
        !entrySource.includes(`${name}是原著开拓者之一`) &&
        !entrySource.includes('官方介绍中') &&
        !entrySource.includes('官方语音') &&
        !entrySource.includes('项目自制转写') &&
        !entrySource.includes('你的故事'),
      `${name} profile must keep player agency, corpus rule, and path-stage boundary.`,
    );
    assert(!/当前战斗表现中是|属性角色|默认可承接开局毁灭|根据已解锁命途切换到/.test(entrySource), `${name} ability wording should stay narrative instead of game-card style.`);
  }
  assert(
    source.includes('## 语料层') &&
      source.includes('只作口吻参考，不能照着写') &&
      source.includes('不得整句复读') &&
      source.includes('不得原句搬运') &&
      source.includes('### 关于姬子的咖啡') &&
      source.includes('远离姬子姐姐的咖啡') &&
      source.includes('不敢当着她的面说'),
    'March profile must keep corpus anti-copy rules.',
  );
  assert(
    !source.includes('官方介绍中') &&
      !source.includes('官方语音') &&
      !source.includes('项目自制转写') &&
      !source.includes('官方进度'),
    'March profile must not expose source-trace wording in Astral Express profile mode.',
  );
  assert(
    source.includes('三月七·巡猎') &&
      source.includes('可提前显现：长夜月 / Evernight（体内另一人格 / 记忆之影）') &&
      source.includes('同源并寄居于她体内') &&
      source.includes('正式名称为“长夜月”，“长月夜”作为本作兼容别名') &&
      source.includes('无需进入翁法罗斯') &&
      source.includes('不要求三月七先陷入致命危险或玩家先明确点名') &&
      source.includes('主动开口和回应') &&
      source.includes('不因人格提前出现而一并解锁') &&
      source.includes('玩家切换注入预览形态不会触发长夜月') &&
      source.includes('### 长夜月语料说明') &&
      source.includes('提前显现时她可以主动回应') &&
      source.includes('禁止每句都加') &&
      source.includes('记忆之影') &&
      source.includes('### 长夜月 / 危险中的内心回响') &&
      source.includes('不能因此直接拥有稳定外部实体、完整神权、全部记忆或自由接管身体的能力') &&
      source.includes('不得自动公开翁法罗斯完整经历与后期真相'),
    'March profile must keep form gates and associated-persona gates distinct.',
  );
  assert(
    weltSource.includes('## 历史故事与过往边界层') &&
      weltSource.includes('瓦尔特目前没有多个形态需要解锁') &&
      weltSource.includes('默认底色：故乡、动画师与冒险热血（可轻度使用）') &&
      weltSource.includes('过往门禁：逆熵 / 理之律者 / 崩坏旧世界（按需展开）') &&
      weltSource.includes('不得在旁白里称他为“前逆熵盟主”“理之律者”') &&
      weltSource.includes('默认处理：不主动展开') &&
      weltSource.includes('不能覆盖当前叙事中的虚数压制与重力牵制表现'),
    'Welt profile must keep past-world boundaries separate from current Star Rail expression.',
  );
  assert(!/当前战斗表现中是|属性角色|虚无命途的虚数属性角色/.test(weltSource), 'Welt ability wording should stay narrative instead of game-card style.');
  assert(
    weltSource.includes('## 角色故事层') &&
      weltSource.includes('### 瓦尔特角色故事一：世界之名、分镜与新旅途') &&
      weltSource.includes('由「伊甸之星」改造的手杖') &&
      weltSource.includes('「瓦尔特的日志 ████年██月██日。') &&
      weltSource.includes('注：如果能回到家乡，考虑把这段经历拍成动画吧。」') &&
      weltSource.includes('故事四保留为日志体锚点') &&
      !weltSource.includes('这段不要润色'),
    'Welt profile must keep his role story layer and unpolished log body.',
  );
  assert(
    weltSource.includes('完整外貌以基础身份层为准') &&
      weltSource.includes('长期承担“世界”之名后的责任感') &&
      weltSource.includes('主动选择新的开场') &&
      weltSource.includes('只说当前需要知道的部分') &&
      weltSource.includes('伊甸之星相关意象') &&
      weltSource.includes('希望她保持想象力但不被错误压垮') &&
      weltSource.includes('不要把他的动画兴趣写成唯一人格'),
    'Welt profile must keep refined performance anchors based on the story layer.',
  );
  assert(
    weltSource.includes('### 关于姬子的咖啡') &&
      weltSource.includes('味道确实很有冲击力') &&
      weltSource.includes('有活着的实感'),
    'Welt profile must keep the Himeko coffee corpus reference.',
  );
  assert(!weltSource.includes('## 状态 / 形态 / 过往门禁层'), 'Welt profile should not expose a form-gate section.');
  assert(
    weltSource.includes('长期承担守护责任') &&
      weltSource.includes('相对平静的生活') &&
      weltSource.includes('迫使他去往星门另一侧') &&
      !weltSource.includes('官方介绍中') &&
      !weltSource.includes('官方语音') &&
      !weltSource.includes('项目自制转写'),
    'Welt profile must use character-file wording rather than source-trace wording.',
  );
  assert(
      danhengSource.includes('## 语料层') &&
      danhengSource.includes('只作口吻参考，不能照着写') &&
      danhengSource.includes('不得原句搬运') &&
      danhengSource.includes('### 关于姬子的咖啡') &&
      danhengSource.includes('姬子的咖啡效果显著') &&
      danhengSource.includes('有助于磨炼意志') &&
      danhengSource.includes('### 丹恒角色故事一：离开故乡与第一次看向未来') &&
      danhengSource.includes('这副身躯属于他自己，属于当下这个名字') &&
      danhengSource.includes('### 丹恒角色故事二：远离过去与无法摆脱的追杀') &&
      danhengSource.includes('有着野兽般眼睛的男人') &&
      danhengSource.includes('### 丹恒角色故事三：巨兽、红发女子与列车邀请') &&
      danhengSource.includes('我们需要一个护卫…和记录员') &&
      danhengSource.includes('### 丹恒角色故事四：资料室、早餐与列车上的早晨') &&
      danhengSource.includes('他们甚至捕获了一块漂浮的巨型陨冰') &&
      danhengSource.includes('体内被封印着一颗星核时，并不算太惊讶') &&
      danhengSource.includes('不要把列车邀请写成强迫收留') &&
      danhengSource.includes('资料室晨光和列车护卫气质') &&
      danhengSource.includes('长期逃离和被追杀的经历') &&
      danhengSource.includes('关心常写成提醒、纠正、确认路线或让人退后') &&
      danhengSource.includes('睡在资料室、被帕姆叫去吃早餐') &&
      danhengSource.includes('记录员和可靠同伴') &&
      danhengSource.includes('被列车瞬间治愈的逃亡者') &&
      danhengSource.includes('把丹恒等同于丹枫') &&
      danhengSource.includes('不要让追杀、刃、持明旧事或饮月形态抢走普通列车日常') &&
      danhengSource.includes('## 历史故事与阶段边界层') &&
      danhengSource.includes('作为常态视觉锚点') &&
      danhengSource.includes('饮月和腾荒外貌不写在基础身份层') &&
      danhengSource.includes('门禁不是单纯锁 / 解锁，而是按预热信号、局部承接和完整展开分级调用') &&
      danhengSource.includes('阶段边界：丹恒·饮月 / 持明旧事（已有力量，剧情触发）') &&
      danhengSource.includes('核心差异：饮月不是未来才产生的形态') &&
      danhengSource.includes('丹恒已经携带这份力量和因果') &&
      danhengSource.includes('局部承接：玩家明确追问丹恒过往') &&
      danhengSource.includes('回落规则：饮月力量显露后') &&
      danhengSource.includes('阶段边界：丹恒·腾荒 / 翁法罗斯守护（相关剧情解锁后可跨场景承接）') &&
      danhengSource.includes('核心差异：腾荒不是丹恒已有但隐藏的力量') &&
      danhengSource.includes('一旦当前分支已经完成相关剧情解锁，离开翁法罗斯后也可作为丹恒已获得的阶段能力按需承接') &&
      danhengSource.includes('解锁前预热：相关剧情解锁前不主动预热腾荒') &&
      danhengSource.includes('不要在相关剧情解锁前把玩家提前提到的“腾荒”直接兑现为完整形态') &&
      danhengSource.includes('不要在解锁后错误限制为只能在翁法罗斯使用') &&
      danhengSource.includes('丹恒与仙舟罗浮、持明族和前世丹枫有深层关联：丹枫是他的前世') &&
      danhengSource.includes('两人并不是同一个当前人格') &&
      danhengSource.includes('主体边界：饮月是丹恒面对前世丹枫遗留力量和因果后的阶段') &&
      danhengSource.includes('不要把他人称呼“丹枫”当作旁白事实') &&
      danhengSource.includes('误认、迁怒、旧事压迫或明确知情语境') &&
      danhengSource.includes('保留丹恒作为“丹恒”的回应空间') &&
      danhengSource.includes('### 丹恒·饮月角色详情') &&
      danhengSource.includes('但从始至终，他都不是他。') &&
      danhengSource.includes('### 丹恒·饮月角色故事一：龙尊面具与鳞渊境') &&
      danhengSource.includes('无光的幽暗中，他仿佛回到持明卵中') &&
      danhengSource.includes('鳞渊境将再续数百年的平静') &&
      danhengSource.includes('### 丹恒·饮月角色故事二：龙心、人心与战场代价') &&
      danhengSource.includes('龙心告诉他，那不过是世上又拂去了些许微尘') &&
      danhengSource.includes('但人心悸痛着') &&
      danhengSource.includes('### 丹恒·饮月角色故事三：故友、建木与无法挽回的牺牲') &&
      danhengSource.includes('持明有自己的解救之道。我可以试试') &&
      danhengSource.includes('证明她存在过的痕迹，只剩这些了') &&
      danhengSource.includes('### 丹恒·饮月角色故事四：幽囚、轮回与放逐') &&
      danhengSource.includes('锁龙针钉入身躯') &&
      danhengSource.includes('他看见自己被放逐，他看见自己登上一辆列车') &&
      danhengSource.includes('### 饮月故事使用规则') &&
      danhengSource.includes('不拆成新的丹枫或饮月角色档案') &&
      danhengSource.includes('必须保留“但从始至终，他都不是他”的主体边界') &&
      danhengSource.includes('丹枫是丹恒的前世，丹恒接受遗留力量与因果') &&
      danhengSource.includes('不得把丹恒写成丹枫本人') &&
      danhengSource.includes('故事边界：饮月详情与四段角色故事在角色故事层展示') &&
      danhengSource.includes('不要把丹恒·腾荒写成与丹恒常态无关的另一个人') &&
      danhengSource.includes('### 丹恒·腾荒角色详情') &&
      danhengSource.includes('吉奥里亚的胸膛，伏龙的身躯支撑破碎的大地') &&
      danhengSource.includes('百川归海，群山合鸣，不朽的道途将绵延万里') &&
      danhengSource.includes('### 丹恒·腾荒角色故事一：坠毁车厢、噩梦与一起回家') &&
      danhengSource.includes('他未曾想过这一天，开拓仿佛就要在此戛然而止') &&
      danhengSource.includes('「我们…一起回家。」') &&
      danhengSource.includes('### 丹恒·腾荒角色故事二：探索、记录与逐火之路') &&
      danhengSource.includes('他相信开拓者会义无反顾地前进') &&
      danhengSource.includes('### 丹恒·腾荒角色故事三：再创世、忆潮与护卫开拓前路') &&
      danhengSource.includes('「我是…护卫『开拓』前路之人！」') &&
      danhengSource.includes('### 丹恒·腾荒角色故事四：巨龙道途、列车梦与未来誓言') &&
      danhengSource.includes('那时吹过的风，仿佛裹着列车早餐的香气') &&
      danhengSource.includes('### 腾荒故事使用规则') &&
      danhengSource.includes('不拆成新的腾荒、伏龙或黄金裔角色档案') &&
      danhengSource.includes('故事边界：腾荒详情与四段角色故事在角色故事层展示') &&
      danhengSource.includes('星穹列车护卫；智库管理员') &&
      danhengSource.includes('丹恒常态能力应围绕长枪“击云”、风势破空') &&
      !danhengSource.includes('官方介绍中') &&
      !danhengSource.includes('官方语音') &&
      !danhengSource.includes('项目自制转写'),
    'Dan Heng profile must keep the new formal profile, corpus rule, and stage boundaries.',
  );
  assert(
    danhengStoryLayer.includes('### 丹恒·饮月角色详情') &&
      danhengStoryLayer.includes('### 丹恒·饮月角色故事一：龙尊面具与鳞渊境') &&
      danhengStoryLayer.includes('### 丹恒·饮月角色故事二：龙心、人心与战场代价') &&
      danhengStoryLayer.includes('### 丹恒·饮月角色故事三：故友、建木与无法挽回的牺牲') &&
      danhengStoryLayer.includes('### 丹恒·饮月角色故事四：幽囚、轮回与放逐') &&
      danhengStoryLayer.includes('### 饮月故事使用规则') &&
      danhengStoryLayer.includes('但从始至终，他都不是他。'),
    'Dan Heng Yinyue story cards must be visible in the role story layer.',
  );
  assert(
    danhengGateLayer.includes('故事边界：饮月详情与四段角色故事在角色故事层展示') &&
      danhengGateLayer.includes('阶段边界：丹恒·饮月 / 持明旧事（已有力量，剧情触发）') &&
      danhengGateLayer.includes('核心差异：饮月不是未来才产生的形态') &&
      danhengGateLayer.includes('局部承接：玩家明确追问丹恒过往') &&
      danhengGateLayer.includes('回落规则：饮月力量显露后') &&
      !/####\s+丹恒·饮月/.test(danhengGateLayer) &&
      !danhengGateLayer.includes('无光的幽暗中，他仿佛回到持明卵中'),
    'Dan Heng Yinyue gate must keep hidden-existing-power tiers and must not hide story body.',
  );
  assert(
    danhengStoryLayer.includes('### 丹恒·腾荒角色详情') &&
      danhengStoryLayer.includes('### 丹恒·腾荒角色故事一：坠毁车厢、噩梦与一起回家') &&
      danhengStoryLayer.includes('### 丹恒·腾荒角色故事二：探索、记录与逐火之路') &&
      danhengStoryLayer.includes('### 丹恒·腾荒角色故事三：再创世、忆潮与护卫开拓前路') &&
      danhengStoryLayer.includes('### 丹恒·腾荒角色故事四：巨龙道途、列车梦与未来誓言') &&
      danhengStoryLayer.includes('### 腾荒故事使用规则') &&
      danhengStoryLayer.includes('吉奥里亚的胸膛，伏龙的身躯支撑破碎的大地') &&
      danhengStoryLayer.includes('「我是…护卫『开拓』前路之人！」'),
    'Dan Heng Tenghuang story cards must be visible in the role story layer.',
  );
  assert(
    danhengGateLayer.includes('故事边界：腾荒详情与四段角色故事在角色故事层展示') &&
      danhengGateLayer.includes('阶段边界：丹恒·腾荒 / 翁法罗斯守护（相关剧情解锁后可跨场景承接）') &&
      danhengGateLayer.includes('核心差异：腾荒不是丹恒已有但隐藏的力量') &&
      danhengGateLayer.includes('解锁前预热：相关剧情解锁前不主动预热腾荒') &&
      danhengGateLayer.includes('即使丹恒离开翁法罗斯，也可以在后续危机、同行守护、剧情承接或玩家明确调用时按需使用') &&
      danhengGateLayer.includes('不把完整形态写成当前事实') &&
      danhengGateLayer.includes('不要在相关剧情解锁前把玩家提前提到的“腾荒”直接兑现为完整形态') &&
      danhengGateLayer.includes('不要在解锁后错误限制为只能在翁法罗斯使用') &&
      !/####\s+丹恒·腾荒/.test(danhengGateLayer) &&
      !danhengGateLayer.includes('他未曾想过这一天，开拓仿佛就要在此戛然而止'),
    'Dan Heng Tenghuang gate must require story unlock first, allow cross-scene carryover after unlock, and must not hide story body.',
  );
  assert(!danhengSource.includes('### 丹恒角色故事一：护卫、智库与列车上的位置') && !danhengSource.includes('### 丹恒角色故事四：腾荒、守护与向未来承担'), 'Dan Heng story layer must use the provided story body instead of the old summary cards.');
  assert(!danhengSource.includes('丹枫复活') && !danhengSource.includes('丹恒不是丹枫') && !danhengSource.includes('不等于丹枫复活') && !danhengSource.includes('不要让其他角色无理由称呼他为丹枫'), 'Dan Heng / Dan Feng boundary must use previous-life context instead of old resurrection or blanket-calling wording.');
  assert(danhengBaseIdentity.includes('饮月和腾荒外貌不写在基础身份层'), 'Dan Heng base identity must explicitly keep alternate-form appearances out of the identity group.');
  assert(!danhengBaseIdentity.includes('饮月形态可出现') && !danhengBaseIdentity.includes('腾荒形态可出现') && !danhengBaseIdentity.includes('龙角') && !danhengBaseIdentity.includes('水龙意象') && !danhengBaseIdentity.includes('龙形守护'), 'Dan Heng base identity must not mix alternate-form appearance cues into normal appearance.');
  assert(!/当前战斗表现中是|属性角色|巡猎命途 \/ 风属性|风属性巡猎/.test(danhengSource), 'Dan Heng ability wording should stay narrative instead of game-card style.');
  assert(
    himekoSource.includes('## 语料层') &&
      himekoSource.includes('只作口吻参考，不能照着写') &&
      himekoSource.includes('不得原句搬运') &&
      himekoSource.includes('## 历史故事与阶段边界层') &&
      himekoSource.includes('阶段边界：姬子·启行 / 新阶段航路（按需展开）') &&
      himekoSource.includes('默认处理：不主动展开') &&
      himekoSource.includes('不要把姬子·启行写成与姬子常态无关的另一个人') &&
      himekoSource.includes('姬子是星穹列车的领航员') &&
      himekoSource.includes('咖啡是姬子的稳定日常符号') &&
      himekoSource.includes('航图、维修工具和群星舷窗作为场景视觉锚点') &&
      himekoSource.includes('战斗火力意象留给能力模块按需使用') &&
      himekoSource.includes('### 姬子角色故事一：迷路少女、搁浅列车与行至起点') &&
      himekoSource.includes('星际航行动力学') &&
      himekoSource.includes('### 姬子角色故事二：手提箱、工具与孤独旅程') &&
      himekoSource.includes('一把单分子锯、一颗逃逸的卫星') &&
      himekoSource.includes('### 姬子角色故事三：记性、同伴与归于起点的海') &&
      himekoSource.includes('记得开朗的三月七如何从陨冰中苏醒') &&
      himekoSource.includes('### 姬子角色故事四：一如既往') &&
      himekoSource.includes('有多少双脚就有多少条旅路') &&
      himekoSource.includes('「一如既往。」') &&
      himekoSource.includes('不要提前解释 ████ 的身份') &&
      himekoSource.includes('外貌锚点只负责镜头识别') &&
      himekoSource.includes('探索欲、好奇心和对群星航路的长期热爱') &&
      himekoSource.includes('不让火力描写盖过领航判断') &&
      himekoSource.includes('对瓦尔特有深度信任和成熟默契') &&
      !himekoSource.includes('官方介绍中') &&
      !himekoSource.includes('官方语音') &&
      !himekoSource.includes('项目自制转写') &&
      !himekoSource.includes('不要修改'),
    'Himeko profile must keep the new formal profile, corpus rule, and stage boundary.',
  );
  assert(!himekoSource.includes('轨道炮 / 卫星火力意象作为场景视觉锚点'), 'Himeko base appearance should not use firepower as a default visual anchor.');
  assert(!/当前战斗表现中是|属性角色|智识命途 \/ 火属性角色|火属性智识/.test(himekoSource), 'Himeko ability wording should stay narrative instead of game-card style.');
  const pompomSource = String(pompom['原文'] ?? '');
  assert(
    pompom['关键词']?.includes('角色:帕姆') &&
      pompom['关键词']?.includes('默认常驻可用') &&
      pompom['关键词']?.includes('嘴硬关心') &&
      pompom['关键词']?.includes('柔和性格') &&
      pompom['关键词']?.includes('关心每位乘客') &&
      pompom['关键词']?.includes('列车历史边界') &&
      pompom['解锁状态'] === '默认常驻可用；列车旧旅途与活动装扮按边界启用' &&
      pompomSource.includes('这份严厉不是冷酷') &&
      pompomSource.includes('希望每位乘客能平安回来') &&
      pompomSource.includes('### 帕姆角色故事二：安静车厢与平安归来') &&
      pompomSource.includes('### 默认常驻可用：列车长职责与车厢管理') &&
      pompomSource.includes('### 列车组关系') &&
      pompomSource.includes('不要每句话都硬塞“帕”') &&
      pompomSource.includes('不要让帕姆主动剧透阿基维利真相') &&
      !pompomSource.includes('这一层适合用于') &&
      !pompomSource.includes('官方介绍中') &&
      !pompomSource.includes('官方语音') &&
      !pompomSource.includes('项目自制转写'),
    'Pom-Pom profile must keep conductor warmth, corpus rules, and history boundaries.',
  );
  console.log('zhiku guinaifen regression skipped for Astral Express character profile set');
  process.exit(0);
}

const TITLE = '\u6807\u9898';
const SOURCE = '\u539f\u6587';
const PERSONALITY = '\u6027\u683c\u951a\u70b9';
const VOICE = '\u8bf4\u8bdd\u65b9\u5f0f';
const BEHAVIOR = '\u884c\u4e3a\u4e60\u60ef';
const RELATION_BOUNDARY = '\u5173\u7cfb\u8fb9\u754c';
const FORBIDDEN_WRITING = '\u7981\u6b62\u8bef\u5199';
const guinevere = '\u683c\u59ae\u8587\u513f';
const outworlder = '\u5316\u5916\u6c11';
const streetPerformer = '\u8857\u5934\u884c\u4e3a\u8868\u6f14\u827a\u672f\u5bb6';
const sushang = '\u7d20\u88f3';
const liveStream = '\u76f4\u64ad';
const family = '\u5bb6\u4eba';
const phone = '\u624b\u673a';
const boulderSmashing = '\u80f8\u53e3\u788e\u5927\u77f3';
const hookId = 'zhiku_character_rebuild_hook_persona';
const childRoleText = '\u864e\u514b\u662f\u513f\u7ae5\u89d2\u8272';
const hookRelationshipAnchor = '\u9f39\u9f20\u515a';
const gallagherId = 'zhiku_character_rebuild_gallagher_persona_gate';
const APPEARANCE = '\u5916\u8c8c\u951a\u70b9';
const femaleText = '\u5973\u6027';
const matureMaleText = '\u6210\u719f\u7537\u6027';
const bartenderText = '\u8c03\u996e\u5e08';
const bloodhoundText = '\u730e\u72ac\u5bb6\u7cfb';
const saberId = 'zhiku_character_rebuild_fate_saber_persona';
const archerId = 'zhiku_character_rebuild_fate_archer_persona';
const genericCrossoverAppearance = '\u8be5\u8282\u70b9\u662f\u8054\u52a8\u89d2\u8272\u4e3b\u4f53\u8d44\u6599';
const genericCrossoverVoice = '\u6309\u6761\u76ee\u89d2\u8272\u6216\u7fa4\u50cf\u5404\u81ea\u53e3\u543b\u8868\u73b0';
const saberAppearanceAnchor = '\u91d1\u53d1\u78a7\u773c';
const saberVoiceAnchor = '\u8a93\u7ea6';
const archerAppearanceAnchor = '\u767d\u53d1\u8910\u80a4';
const archerVoiceAnchor = '\u8bbd\u523a';

function similarity(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (!left || !right) return 0;
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  let longest = 0;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      if (left[i - 1] !== right[j - 1]) continue;
      dp[i][j] = dp[i - 1][j - 1] + 1;
      longest = Math.max(longest, dp[i][j]);
    }
  }
  return (longest * 2) / (left.length + right.length);
}

const guinaifen = rebuildPreset.entries.find((entry) => entry.id === 'zhiku_character_rebuild_guinaifen_persona');
assert(guinaifen, 'Guinaifen rebuilt persona entry must exist.');

const personaFields = [guinaifen[PERSONALITY], guinaifen[VOICE], guinaifen[BEHAVIOR]].map((value) => String(value ?? '').trim());
assert(personaFields.every(Boolean), 'Guinaifen persona performance fields must not be empty.');
assert(new Set(personaFields).size === personaFields.length, 'Guinaifen personality / voice / behavior fields must not be duplicated.');

assert(
  guinaifen[SOURCE].includes(guinevere) &&
    guinaifen[SOURCE].includes(outworlder) &&
    guinaifen[SOURCE].includes(streetPerformer) &&
    guinaifen[SOURCE].includes(sushang),
  'Guinaifen source brief must preserve checked anchors: Guinevere, outworlder, street performer, and Sushang.',
);
assert(guinaifen[VOICE].includes(liveStream) && guinaifen[VOICE].includes(family), 'Guinaifen voice should keep streamer-like audience interaction anchors.');
assert(guinaifen[BEHAVIOR].includes(phone) && guinaifen[BEHAVIOR].includes(boulderSmashing) && guinaifen[BEHAVIOR].includes(sushang), 'Guinaifen behavior should keep recording, street stunt, and Sushang anchors.');

const noisyFields = [PERSONALITY, VOICE, BEHAVIOR];
const strongDuplications = [];
for (const entry of rebuildPreset.entries) {
  if (!String(entry.id ?? '').startsWith('zhiku_character_rebuild_')) continue;
  const values = noisyFields.map((field) => String(entry[field] ?? '').trim());
  for (let leftIndex = 0; leftIndex < values.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
      const left = values[leftIndex];
      const right = values[rightIndex];
      if (!left || !right) continue;
      const exact = left === right;
      const longContains = (left.length > 40 && right.includes(left)) || (right.length > 40 && left.includes(right));
      const tooSimilar = similarity(left, right) >= 0.78;
      if (exact || longContains || tooSimilar) {
        strongDuplications.push(`${entry.id} ${entry[TITLE] ?? ''}`);
      }
    }
  }
}
assert(strongDuplications.length === 0, `Rebuilt character personality / voice / behavior fields must not be copied: ${strongDuplications.join(', ')}`);

const duplicatedBoundaryFields = rebuildPreset.entries
  .filter((entry) => String(entry.id ?? '').startsWith('zhiku_character_rebuild_'))
  .filter((entry) => {
    const relationBoundary = String(entry[RELATION_BOUNDARY] ?? '').trim();
    const forbiddenWriting = String(entry[FORBIDDEN_WRITING] ?? '').trim();
    return relationBoundary && forbiddenWriting && relationBoundary === forbiddenWriting;
  })
  .map((entry) => `${entry.id} ${entry[TITLE] ?? ''}`);
assert(duplicatedBoundaryFields.length === 0, `Rebuilt character relation boundary and forbidden-writing fields must not be copied: ${duplicatedBoundaryFields.join(', ')}`);

const hook = rebuildPreset.entries.find((entry) => entry.id === hookId);
assert(hook, 'Hook rebuilt persona entry must exist.');
assert(
  hook[RELATION_BOUNDARY].includes(hookRelationshipAnchor) &&
    hook[RELATION_BOUNDARY] !== hook[FORBIDDEN_WRITING] &&
    !hook[RELATION_BOUNDARY].startsWith(childRoleText) &&
    !hook[RELATION_BOUNDARY].includes('\u963f\u864e\u514b'),
  'Hook relation boundary must describe story relationship scope instead of repeating the child-safety forbidden-writing text.',
);

const gallagher = rebuildPreset.entries.find((entry) => entry.id === gallagherId);
assert(gallagher, 'Gallagher rebuilt persona entry must exist.');
assert(
  gallagher[APPEARANCE].includes(matureMaleText) &&
    gallagher[APPEARANCE].includes(bartenderText) &&
    gallagher[APPEARANCE].includes(bloodhoundText) &&
    !gallagher[APPEARANCE].includes(femaleText),
  'Gallagher appearance anchor must describe his male bartender / Bloodhound Family persona and must not mark him as female.',
);

const saber = rebuildPreset.entries.find((entry) => entry.id === saberId);
const archer = rebuildPreset.entries.find((entry) => entry.id === archerId);
assert(saber && archer, 'Fate crossover Saber and Archer persona entries must exist.');
assert(
  saber[APPEARANCE].includes(saberAppearanceAnchor) &&
    saber[VOICE].includes(saberVoiceAnchor) &&
    !saber[APPEARANCE].includes(genericCrossoverAppearance) &&
    !saber[VOICE].includes(genericCrossoverVoice),
  'Saber crossover persona must have concrete appearance and voice anchors instead of generic placeholders.',
);
assert(
  archer[APPEARANCE].includes(archerAppearanceAnchor) &&
    archer[VOICE].includes(archerVoiceAnchor) &&
    !archer[APPEARANCE].includes(genericCrossoverAppearance) &&
    !archer[VOICE].includes(genericCrossoverVoice),
  'Archer crossover persona must have concrete appearance and voice anchors instead of generic placeholders.',
);

const corruptedTextFields = [];
for (const entry of rebuildPreset.entries) {
  if (!String(entry.id ?? '').startsWith('zhiku_character_rebuild_')) continue;
  for (const field of [PERSONALITY, VOICE, BEHAVIOR, RELATION_BOUNDARY, FORBIDDEN_WRITING]) {
    const value = String(entry[field] ?? '');
    if (value.includes('???') || (value.match(/\?/g) ?? []).length >= 5) {
      corruptedTextFields.push(`${entry.id} ${entry[TITLE] ?? ''} ${field}`);
    }
  }
}
assert(corruptedTextFields.length === 0, `Rebuilt character text fields must not contain mojibake question marks: ${corruptedTextFields.join(', ')}`);

console.log('zhiku guinaifen regression ok');
