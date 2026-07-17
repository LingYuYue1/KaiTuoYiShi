import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const preset = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const model = fs.readFileSync('models/zhiku.ts', 'utf8');
const chatModel = fs.readFileSync('models/chat.ts', 'utf8');
const panel = fs.readFileSync('components/features/GameSystems/ZhikuPanel.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const leftPanel = fs.readFileSync('components/layout/LeftPanel.tsx', 'utf8');
const turnItem = fs.readFileSync('components/features/Chat/TurnItem.tsx', 'utf8');
const state = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const saveLoad = fs.readFileSync('hooks/useGame.ts', 'utf8');
const retrieval = fs.readFileSync('services/zhikuRetrieval.ts', 'utf8');
const zhikuCot = fs.readFileSync('prompts/cot/zhikuCot.ts', 'utf8');
const mainCot = fs.readFileSync('prompts/cot/mainCot.ts', 'utf8');
const systemPromptBuilder = fs.readFileSync('src/kernel/workflows/systemPromptBuilder.ts', 'utf8');
const historyWindow = fs.readFileSync('src/kernel/workflows/historyWindow.ts', 'utf8');
const npcPresence = fs.readFileSync('src/kernel/workflows/npcPresence.ts', 'utf8');
const storyProgress = fs.readFileSync('src/kernel/domain/story/storyProgress.ts', 'utf8');
const sendWorkflow = fs.readFileSync('src/kernel/workflows/sendWorkflow.ts', 'utf8');
const settingsModel = fs.readFileSync('models/settings.ts', 'utf8');
const runtimeUnlock = fs.readFileSync('services/zhikuRuntimeUnlock.ts', 'utf8');
const contextSnapshot = fs.readFileSync('src/kernel/workflows/contextSnapshot.ts', 'utf8');
const phoneService = fs.readFileSync('services/ai/phoneService.ts', 'utf8');
const newsModel = fs.readFileSync('services/ai/newsModel.ts', 'utf8');
const rebuildPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/character-rebuild-core.json', 'utf8'));
const stellaronHuntersPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/stellaron-hunters-character-rebuild.json', 'utf8'));
const hertaStationPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/herta-station-character-rebuild.json', 'utf8'));
const geniusSocietyPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/genius-society-character-rebuild.json', 'utf8'));
const intelligentsiaGuildPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/intelligentsia-guild-character-rebuild.json', 'utf8'));
const belobogPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/belobog-character-rebuild.json', 'utf8'));
const xianzhouLuofuPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/xianzhou-luofu-character-rebuild.json', 'utf8'));
const ipcPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/interastral-peace-corporation-character-rebuild.json', 'utf8'));
const REBUILD_PREFIX = 'zhiku_character_rebuild_';
const nativePenaconyOrganizations = new Set(['家族', '猎犬家系', '白日梦酒店', '橡木家系', '鸢尾花家系', '苜蓿草家系', '隐夜鸫家系']);
const nativeAmphoreusOrganizations = new Set(['黄金裔', 'Chrysos Heirs', '奥赫玛']);
const crossoverOrganizations = new Set(['Fate/stay night [Unlimited Blade Works]', 'Fate', 'UBW']);
const everFlameOrganizations = new Set(['永火官邸', '泯灭帮', 'Ever-Flame Mansion', 'Annihilation Gang']);

function parseCharacterTag(keyword) {
  const match = keyword.match(/^([^:：]+)[:：](.+)$/u);
  if (!match) return null;
  const key = match[1]?.trim();
  const value = match[2]?.trim();
  return key && value ? { key, value } : null;
}

function resolveCharacterGroupLabel(entry) {
  const parsedTags = (entry.关键词 ?? []).map(parseCharacterTag).filter(Boolean);
  const dataArea = parsedTags.find((tag) => ['资料大区', '大区'].includes(tag.key))?.value;
  const organization = parsedTags.find((tag) => ['所属', '归属', '所属组织', '组织'].includes(tag.key))?.value;
  if (dataArea === '匹诺康尼' && organization && nativePenaconyOrganizations.has(organization)) return '匹诺康尼';
  if (dataArea === '翁法罗斯' && organization && nativeAmphoreusOrganizations.has(organization)) return '翁法罗斯';
  if (dataArea === '联动角色' && organization && crossoverOrganizations.has(organization)) return '联动角色';
  if (dataArea === '永火官邸' && organization && everFlameOrganizations.has(organization)) return '永火官邸';

  const tagPriority = [
    { keys: ['所属', '归属', '所属组织'], kind: '组织' },
    { keys: ['地区', '区域', '地点'], kind: '地区' },
    { keys: ['阵营', '派系'], kind: '阵营' },
    { keys: ['组织'], kind: '组织' },
    { keys: ['资料大区', '大区'], kind: '资料大区' },
  ];
  for (const option of tagPriority) {
    const tag = parsedTags.find((parsed) => option.keys.includes(parsed.key));
    if (tag) return tag.value;
  }
  return '未分组 / 待整理';
}

function findRoleEntry(role, predicate = () => true) {
  return rebuildPreset.entries.find((entry) => entry.关键词?.includes(`角色:${role}`) && predicate(entry));
}

function getCoreTriggerTerms(entry) {
  const match = String(entry?.原文 ?? '').match(/核心触发词[:：]\s*([^\n]+)/u);
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
    assert(!entry.关键词?.includes(keyword), `${label} keywords must not expose broad or relation trigger: ${keyword}`);
  }
}

function parseProfileMarkdownSections(source) {
  const sections = [];
  let current = null;
  for (const line of String(source ?? '').split(/\r?\n/)) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      current = { title: match[1].trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return sections.map((section) => ({ title: section.title, body: section.body.join('\n').trim() }));
}

function findProfileGateSectionForUi(source) {
  const sections = parseProfileMarkdownSections(source);
  return (
    sections.find((section) => /形态|人格|阶段|门禁|真相/.test(section.title)) ??
    sections.find((section) =>
      /边界|写法/.test(section.title) &&
      /门禁|阶段边界|展开条件|默认处理|知情边界|回落规则|解锁|阶段锁定/.test(section.body),
    )
  );
}

function assertProfileGateVisible(entry, expectedTitle, label) {
  const gate = findProfileGateSectionForUi(entry?.原文);
  assert(gate?.title === expectedTitle, `${label} should expose gate tab via ${expectedTitle}, got ${gate?.title ?? 'none'}.`);
}

function assertProfileGateHidden(entry, label) {
  const gate = findProfileGateSectionForUi(entry?.原文);
  assert(!gate, `${label} should keep writing boundaries outside the gate tab, got ${gate?.title ?? 'unknown'}.`);
}

function assertRebuiltSingleProfileShape(entriesToCheck, dataArea, label) {
  for (const entry of entriesToCheck) {
    assert(entry.分类 === 'character', `${label} profile must stay in character category: ${entry.标题}`);
    assert(entry.id.startsWith(REBUILD_PREFIX), `${label} profile id must use rebuild prefix: ${entry.标题}`);
    assert(entry.资料类型 === '单角色档案', `${label} profile must use single-character profile type: ${entry.标题}`);
    assert(entry.关键词?.includes(`资料大区:${dataArea}`), `${label} profile missing data-area keyword: ${entry.标题}`);
    assert(entry.关键词?.includes('节点:单角色档案'), `${label} profile missing single profile keyword: ${entry.标题}`);
    const hasCorpusRules = entry.关键词?.includes('语料只作参考') && entry.关键词?.includes('禁止照抄语料');
    const hasNoCorpusBoundary = entry.关键词?.includes('暂无语料') && entry.关键词?.includes('艾利欧暂不提供语料');
    assert(hasCorpusRules || hasNoCorpusBoundary, `${label} profile missing corpus or no-corpus rule: ${entry.标题}`);
    for (const field of ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写']) {
      assert(typeof entry[field] === 'string' && entry[field].trim().length >= 20, `${label} profile must keep ${field}: ${entry.标题}`);
    }
    const source = String(entry.原文 ?? '');
    for (const required of ['## 角色档案包说明', '## 基础识别', '## 常驻事实层', '## 角色故事层', '## 表现锚点层', '## 语料层', '## 能力与职责模块', '## 本回合注入建议']) {
      assert(source.includes(required), `${label} profile missing section ${required}: ${entry.标题}`);
    }
    assert(
      source.includes('## 历史故事与阶段边界层') || source.includes('## 历史故事与过往边界层') || source.includes('## 历史故事与写法边界层'),
      `${label} profile missing history boundary section: ${entry.标题}`,
    );
    assert(!source.includes('官方介绍中') && !source.includes('官方语音') && !source.includes('项目自制转写'), `${label} profile must not expose source-trace wording: ${entry.标题}`);
    assert(!/当前战斗表现中是|属性角色|命途属性说明/.test(source), `${label} profile should stay narrative instead of game-card style: ${entry.标题}`);
  }
}

function assertStellaronHuntersProfileSet() {
  assert(stellaronHuntersPreset.id === 'zhiku_stellaron_hunters_character_rebuild', 'Stellaron Hunters character preset id changed.');
  assert(stellaronHuntersPreset.title === '人物重建·星核猎手角色档案', 'Stellaron Hunters character preset title changed.');
  assert(stellaronHuntersPreset.updatedAt === '2026-06-09-stellaron-hunters-character-profiles-11', 'Stellaron Hunters character preset updatedAt changed.');

  const profiles = new Map((stellaronHuntersPreset.entries ?? []).map((entry) => [entry.id, entry]));
  const kafka = profiles.get('zhiku_character_rebuild_kafka_profile');
  const blade = profiles.get('zhiku_character_rebuild_blade_profile');
  const silverWolf = profiles.get('zhiku_character_rebuild_silver_wolf_profile');
  const firefly = profiles.get('zhiku_character_rebuild_firefly_profile');
  const elio = profiles.get('zhiku_character_rebuild_elio_profile');
  assert(kafka && blade && silverWolf && firefly && elio && profiles.size === 5, 'Stellaron Hunters preset must contain exactly Kafka, Blade, Silver Wolf, Firefly, and Elio profiles.');

  assertRebuiltSingleProfileShape([kafka, blade, silverWolf, firefly, elio], '星核猎手', 'Stellaron Hunters');

  assertCoreTriggers(kafka, ['卡芙卡', 'Kafka', '星核猎手卡芙卡'], 'Stellaron Hunters Kafka profile');
  assertCoreTriggers(blade, ['刃', 'Blade', '星核猎手刃', '阿刃'], 'Stellaron Hunters Blade profile');
  assertCoreTriggers(silverWolf, ['银狼', 'Silver Wolf', '星核猎手银狼', '银狼LV.999'], 'Stellaron Hunters Silver Wolf profile');
  assertCoreTriggers(firefly, ['流萤', 'Firefly', '萨姆', 'Sam', 'AR-26710', '星核猎手流萤'], 'Stellaron Hunters Firefly profile');
  assertCoreTriggers(elio, ['艾利欧', 'Elio', '命运的奴隶', '星核猎手首领'], 'Stellaron Hunters Elio profile');
  for (const entry of [kafka, blade, silverWolf, firefly, elio]) {
    assertNoBareKeywords(entry, ['星核猎手'], `Stellaron Hunters ${entry.标题} profile`);
    assert(String(entry.原文 ?? '').includes('不要仅因出现“星核猎手”组织词就自动'), `Stellaron Hunters profile must keep broad organization recall boundary: ${entry.标题}`);
  }

  assert(
    String(kafka.原文 ?? '').includes('温柔外壳下的控制') &&
      String(kafka.原文 ?? '').includes('言语控制不能无理由夺走玩家选择权') &&
      String(kafka.原文 ?? '').includes('卡芙卡角色详情') &&
      String(kafka.原文 ?? '').includes('星际和平公司通缉令') &&
      String(kafka.原文 ?? '').includes('罗浮所颁之通缉令') &&
      String(kafka.原文 ?? '').includes('天衣五：新巴比伦') &&
      String(kafka.原文 ?? '').includes('爱好收集大衣') &&
      String(kafka.原文 ?? '').includes('加入星核猎手前，由于工作的缘故') &&
      String(kafka.原文 ?? '').includes('擅长制造「恐惧」') &&
      String(kafka.原文 ?? '').includes('即使我对它一无所知') &&
      String(kafka.原文 ?? '').includes('我喜欢和银狼聊天') &&
      String(kafka.原文 ?? '').includes('阿刃…人如其名') &&
      String(kafka.原文 ?? '').includes('### 关于萨姆') &&
      String(kafka.原文 ?? '').includes('### 关于流萤') &&
      String(kafka.原文 ?? '').includes('每到夏天，我都会去那里看海') &&
      String(kafka.原文 ?? '').includes('观景栈道') &&
      String(kafka.禁止误写 ?? '').includes('全职母亲') &&
      String(kafka.禁止误写 ?? '').includes('纯恋爱对象') &&
      kafka.关键词?.includes('卡芙卡通缉令') &&
      kafka.关键词?.includes('卡芙卡新巴比伦') &&
      kafka.关键词?.includes('爱好收集大衣') &&
      kafka.关键词?.includes('卡芙卡关于自己') &&
      kafka.关键词?.includes('卡芙卡恐惧') &&
      kafka.关键词?.includes('卡芙卡关于银狼') &&
      kafka.关键词?.includes('卡芙卡关于刃') &&
      kafka.关键词?.includes('卡芙卡关于萨姆') &&
      kafka.关键词?.includes('卡芙卡关于流萤') &&
      kafka.关键词?.includes('卡芙卡看海') &&
      kafka.关键词?.includes('卡芙卡日常语料') &&
      kafka.关键词?.includes('言灵控制') &&
      kafka.关键词?.includes('温柔控制感'),
    'Kafka profile must keep control, script, and relationship boundaries.',
  );
  assert(
    String(blade.原文 ?? '').includes('丹枫是丹恒的前世，丹恒不是丹枫当前人格') &&
      String(blade.原文 ?? '').includes('不要让所有人随口叫他应星') &&
      String(blade.原文 ?? '').includes('刃角色详情') &&
      String(blade.原文 ?? '').includes('记住死亡的感觉') &&
      String(blade.原文 ?? '').includes('卡芙卡与交易') &&
      String(blade.原文 ?? '').includes('从今往后，那具躯壳，将是唯一的「刃」') &&
      String(blade.原文 ?? '').includes('死亡记忆边界') &&
      String(blade.原文 ?? '').includes('不死能力不能变成毫无代价的无敌') &&
      String(blade.原文 ?? '').includes('又来了？…被我记住的人') &&
      String(blade.原文 ?? '').includes('「魔阴身」发作的时候') &&
      String(blade.原文 ?? '').includes('我们藉由彼此之手，达成目的') &&
      String(blade.原文 ?? '').includes('「这次，将是最后一次」的期许') &&
      String(blade.原文 ?? '').includes('人有五名，代价有三个') &&
      String(blade.原文 ?? '').includes('缚住魔阴的绳子在她手中') &&
      String(blade.原文 ?? '').includes('他一直…一直是我们中最明白「代价」的那个人') &&
      String(blade.原文 ?? '').includes('饮月君…我们的果报何时来临') &&
      String(blade.原文 ?? '').includes('何处一剑致命、何处痛不致死') &&
      String(blade.原文 ?? '').includes('萨姆，擅长制造炼狱') &&
      String(blade.原文 ?? '').includes('我渴望终结，而她渴望生存') &&
      blade.关键词?.includes('刃死亡记忆') &&
      blade.关键词?.includes('刃与卡芙卡初遇') &&
      blade.关键词?.includes('支离剑') &&
      blade.关键词?.includes('应星边界') &&
      blade.关键词?.includes('云上五骁边界') &&
      blade.关键词?.includes('刃问候') &&
      blade.关键词?.includes('刃道别') &&
      blade.关键词?.includes('刃不死身语料') &&
      blade.关键词?.includes('刃代价语料') &&
      blade.关键词?.includes('刃关于景元') &&
      blade.关键词?.includes('刃关于丹恒') &&
      blade.关键词?.includes('刃关于镜流') &&
      blade.关键词?.includes('刃关于流萤') &&
      blade.关键词?.includes('刃日常语料'),
    'Blade profile must keep immortality cost and Yingxing / Dan Heng boundaries.',
  );
  assert(
    String(silverWolf.原文 ?? '').includes('银狼角色故事一：地下室的游戏结束') &&
      String(silverWolf.原文 ?? '').includes('她没有合法的名字，没有身份编号') &&
      String(silverWolf.原文 ?? '').includes('名为「废品山」的游戏，在这一天结束了') &&
      String(silverWolf.原文 ?? '').includes('名为「虹霓都市」的游戏，在这一天结束了') &&
      String(silverWolf.原文 ?? '').includes('名为「朋克洛德」的游戏，在这一天结束了') &&
      String(silverWolf.原文 ?? '').includes('银狼LV.999角色详情') &&
      String(silverWolf.原文 ?? '').includes('最高保密等级藏品，「银狼LV.999」以太卡带遭窃') &&
      String(silverWolf.原文 ?? '').includes('那张卡带在操纵你') &&
      String(silverWolf.原文 ?? '').includes('【成就】「GAME NOT OVER」') &&
      String(silverWolf.原文 ?? '').includes('狼尊Online') &&
      String(silverWolf.原文 ?? '').includes('「ID：银狼LV.999」登入「幻月游戏」') &&
      String(silverWolf.原文 ?? '').includes('以太卡带形态 / 能力边界') &&
      String(silverWolf.原文 ?? '').includes('银狼知道这张卡带和LV.999能力存在') &&
      String(silverWolf.原文 ?? '').includes('卡带被艾利欧没收') &&
      String(silverWolf.原文 ?? '').includes('知情但受限') &&
      String(silverWolf.原文 ?? '').includes('玩家明确提到银狼LV.999、999形态、卡带、二相乐园、幻月游戏') &&
      String(silverWolf.原文 ?? '').includes('不要写成银狼完全不知道这个能力') &&
      String(silverWolf.原文 ?? '').includes('完整形态暂不可随意启用') &&
      String(silverWolf.原文 ?? '').includes('活动称号或临时玩法标签') &&
      !String(silverWolf.原文 ?? '').includes('活动 / 游戏化阶段称呼') &&
      !String(silverWolf.原文 ?? '').includes('活动游戏阶段称呼') &&
      String(silverWolf.原文 ?? '').includes('不要把她变成万能解法') &&
      String(silverWolf.原文 ?? '').includes('宇宙像游戏、现实仍有代价') &&
      String(silverWolf.原文 ?? '').includes('今天也上线啦') &&
      String(silverWolf.原文 ?? '').includes('想给这个宇宙多加些玩法') &&
      String(silverWolf.原文 ?? '').includes('普罗米修斯搭载了四个模块') &&
      String(silverWolf.原文 ?? '').includes('不能开小号，艾利欧也不行') &&
      String(silverWolf.原文 ?? '').includes('在「无视规则」这一点上') &&
      String(silverWolf.原文 ?? '').includes('说好等手伤痊愈了就一起打游戏') &&
      String(silverWolf.原文 ?? '').includes('### 常态对他人的看法') &&
      String(silverWolf.原文 ?? '').includes('#### 关于大黑塔') &&
      String(silverWolf.原文 ?? '').includes('LV.999形态语料（按卡带权限 / 剧情阶段启用）') &&
      String(silverWolf.原文 ?? '').includes('LV.999的形态，完全的我') &&
      String(silverWolf.原文 ?? '').includes('LV.999的无敌存档') &&
      String(silverWolf.原文 ?? '').includes('二相乐园的人玩游戏都那么拼吗') &&
      String(silverWolf.原文 ?? '').includes('我尊重每个人退出「银河」这盘游戏的权利') &&
      String(silverWolf.原文 ?? '').includes('### LV.999对他人的看法（按阶段启用，部分可混用）') &&
      String(silverWolf.原文 ?? '').includes('#### 关于火花') &&
      String(silverWolf.原文 ?? '').includes('#### 关于爻光') &&
      String(silverWolf.原文 ?? '').includes('#### 关于不死途') &&
      String(silverWolf.原文 ?? '').includes('#### 关于真珠') &&
      String(silverWolf.原文 ?? '').includes('#### 关于绯英') &&
      String(silverWolf.原文 ?? '').includes('#### 关于千冶•刃') &&
      String(silverWolf.原文 ?? '').includes('限时超频') &&
      String(silverWolf.原文 ?? '').includes('LV.999形态语料只在卡带权限 / 二相乐园 / 幻月游戏等相关阶段完整启用') &&
      String(silverWolf.禁止误写 ?? '').includes('不要把LV.999形态语料当作普通常态全量口吻') &&
      silverWolf.关键词?.includes('银狼LV.999') &&
      silverWolf.关键词?.includes('银狼999知情') &&
      silverWolf.关键词?.includes('银狼LV999知情但受限') &&
      silverWolf.关键词?.includes('银狼卡带被没收') &&
      silverWolf.关键词?.includes('银狼二相乐园') &&
      silverWolf.关键词?.includes('银狼常态角色故事') &&
      silverWolf.关键词?.includes('银狼LV999角色故事') &&
      silverWolf.关键词?.includes('银狼以太卡带') &&
      silverWolf.关键词?.includes('狼尊Online') &&
      silverWolf.关键词?.includes('GAME NOT OVER') &&
      silverWolf.关键词?.includes('LV999卡带权限') &&
      silverWolf.关键词?.includes('艾利欧没收卡带') &&
      silverWolf.关键词?.includes('游戏化口吻') &&
      silverWolf.关键词?.includes('银狼普罗米修斯') &&
      silverWolf.关键词?.includes('银狼不能开小号') &&
      silverWolf.关键词?.includes('银狼LV999形态语料') &&
      silverWolf.关键词?.includes('银狼LV999关于火花') &&
      silverWolf.关键词?.includes('银狼LV999关于千冶刃'),
    'Silver Wolf profile must keep hacker/gameplay anchors and LV.999 boundary.',
  );
  assert(
    String(firefly.原文 ?? '').includes('流萤与萨姆是同一个人') &&
      String(firefly.原文 ?? '').includes('萨姆是名为火萤Ⅳ型的战略强袭机甲') &&
      String(firefly.原文 ?? '').includes('AR-26710 是她作为格拉默铁骑 / 基因改造兵器时期的编号') &&
      String(firefly.原文 ?? '').includes('AR-26710 是流萤的铁骑编号') &&
      String(firefly.原文 ?? '').includes('不要把萨姆写成独立角色') &&
      String(firefly.禁止误写 ?? '').includes('不要把AR-26710写成萨姆机甲型号') &&
      String(firefly.原文 ?? '').includes('格拉默铁骑') &&
      String(firefly.原文 ?? '').includes('失熵') &&
      String(firefly.原文 ?? '').includes('不能被写成绝对无法治愈或永远无解') &&
      String(firefly.原文 ?? '').includes('也不要断言它绝对无法治愈或永远无解') &&
      String(firefly.禁止误写 ?? '').includes('不要把失熵写成绝对无法治愈、永远无解或已经被彻底治愈') &&
      String(firefly.原文 ?? '').includes('培养仓、女皇与编号 AR-26710') &&
      String(firefly.原文 ?? '').includes('透明的培养仓中，她浸没在冰冷的人工羊水里') &&
      String(firefly.原文 ?? '').includes('AR-26702——那是什么') &&
      String(firefly.原文 ?? '').includes('她的编号是AR-214') &&
      String(firefly.原文 ?? '').includes('AR-4077') &&
      String(firefly.原文 ?? '').includes('它们虽然是渺小的生命，却比星星更耀眼') &&
      String(firefly.原文 ?? '').includes('命中注定的结局…和我们很像') &&
      String(firefly.原文 ?? '').includes('无法做梦的人进入匹诺康尼') &&
      String(firefly.原文 ?? '').includes('记得替我向星穹列车问好') &&
      String(firefly.原文 ?? '').includes('这就是…梦？') &&
      String(firefly.原文 ?? '').includes('萨姆身份揭露与匹诺康尼真相') &&
      String(firefly.原文 ?? '').includes('嗨，又见面啦…我的意思，很高兴见到你') &&
      String(firefly.原文 ?? '').includes('我希望以「流萤」的身份认识这个世界') &&
      String(firefly.原文 ?? '').includes('它是对抗虫群的兵器，它就是「我」') &&
      String(firefly.原文 ?? '').includes('我想知道自己还能做什么…我有这个权利') &&
      String(firefly.原文 ?? '').includes('野草，浆果，清风，蝴蝶') &&
      String(firefly.原文 ?? '').includes('我没有做梦的机能') &&
      String(firefly.原文 ?? '').includes('蜘蛛和蜚蠊也会跟着一起过来') &&
      String(firefly.原文 ?? '').includes('燃烧的羽翼终会有熄灭的时候') &&
      String(firefly.原文 ?? '').includes('突突突，砰砰——砰') &&
      String(firefly.原文 ?? '').includes('她其实不这么想') &&
      String(firefly.原文 ?? '').includes('他寻求「死」的结局，我找寻「生」的机会') &&
      String(firefly.原文 ?? '').includes('关于黄泉') &&
      String(firefly.原文 ?? '').includes('关于黑天鹅') &&
      String(firefly.原文 ?? '').includes('关于加拉赫') &&
      String(firefly.原文 ?? '').includes('关于知更鸟') &&
      String(firefly.原文 ?? '').includes('关于翡翠') &&
      String(firefly.原文 ?? '').includes('关于大丽花') &&
      String(firefly.行为习惯 ?? '').includes('屋顶看星海') &&
      String(firefly.关系边界 ?? '').includes('对黄泉、黑天鹅、加拉赫、知更鸟、翡翠和大丽花的看法只在相关角色已出现或玩家追问时展开') &&
      String(firefly.说话方式 ?? '').includes('常态温和、坦白、认真') &&
      String(firefly.原文 ?? '').includes('萨姆状态语言更短、更冷、更像战斗命令，但不能写成另一个人格') &&
      String(firefly.禁止误写 ?? '').includes('不要让未经历相关剧情的角色无理由知道萨姆身份真相') &&
      firefly.关键词?.includes('流萤萨姆同一人') &&
      firefly.关键词?.includes('萨姆不是独立角色') &&
      firefly.关键词?.includes('火萤Ⅳ型') &&
      firefly.关键词?.includes('格拉默铁骑') &&
      firefly.关键词?.includes('流萤AR26710') &&
      firefly.关键词?.includes('AR26710编号') &&
      firefly.关键词?.includes('流萤失熵') &&
      firefly.关键词?.includes('流萤匹诺康尼') &&
      firefly.关键词?.includes('萨姆身份揭露') &&
      firefly.关键词?.includes('流萤初次见面') &&
      firefly.关键词?.includes('流萤关于自己萨姆') &&
      firefly.关键词?.includes('流萤爱好郊游') &&
      firefly.关键词?.includes('流萤烦恼睡眠') &&
      firefly.关键词?.includes('流萤烦恼虫子') &&
      firefly.关键词?.includes('流萤关于黄泉') &&
      firefly.关键词?.includes('流萤关于大丽花'),
    'Firefly profile must keep Firefly/Sam/AR-26710 identity and stage boundaries.',
  );
  assert(
      String(elio.原文 ?? '').includes('目前公开表现多与黑猫形象、剧本和预见未来相关') &&
      String(elio.原文 ?? '').includes('艾利欧暂不提供语料') &&
      String(elio.原文 ?? '').includes('本档案不提供“艾利欧亲口说”的示例台词') &&
      String(elio.原文 ?? '').includes('也不提供拟造句式让模型模仿') &&
      String(elio.原文 ?? '').includes('不编造艾利欧直接台词') &&
      String(elio.原文 ?? '').includes('不得编造人形外貌') &&
      String(elio.说话方式 ?? '').includes('目前不写直接台词') &&
      String(elio.说话方式 ?? '').includes('暂不提供艾利欧语料') &&
      String(elio.外貌锚点 ?? '').includes('不得编造人形外貌') &&
      elio.关键词?.includes('暂无语料') &&
      elio.关键词?.includes('艾利欧暂不提供语料') &&
      !elio.关键词?.includes('语料只作参考') &&
      !elio.关键词?.includes('禁止照抄语料') &&
      elio.关键词?.includes('艾利欧未开口') &&
      elio.关键词?.includes('不编造艾利欧人形') &&
      !String(elio.原文 ?? '').includes('### 剧本文本参考') &&
      !String(elio.原文 ?? '').includes('“剧本写到这里') &&
      !String(elio.原文 ?? '').includes('### 初见与') &&
      !String(elio.原文 ?? '').includes('“你好'),
    'Elio profile must keep cat, no-direct-speech, and no-human-form boundaries.',
  );
}

function assertHertaStationProfileSet() {
  assert(hertaStationPreset.id === 'zhiku_herta_station_character_rebuild', 'Herta Space Station character preset id changed.');
  assert(hertaStationPreset.title === '人物重建·黑塔空间站角色档案', 'Herta Space Station character preset title changed.');
  assert(hertaStationPreset.updatedAt === '2026-06-08-herta-station-character-profiles-12', 'Herta Space Station character preset updatedAt changed.');

  const profiles = new Map((hertaStationPreset.entries ?? []).map((entry) => [entry.id, entry]));
  const herta = profiles.get('zhiku_character_rebuild_herta_profile');
  const asta = profiles.get('zhiku_character_rebuild_asta_profile');
  const arlan = profiles.get('zhiku_character_rebuild_arlan_profile');
  assert(herta && asta && arlan && profiles.size === 3, 'Herta Space Station preset must contain exactly Herta, Asta, and Arlan first-draft profiles.');

  for (const entry of [herta, asta, arlan]) {
    assert(entry.分类 === 'character', `Herta Space Station rebuilt profile must stay in character category: ${entry.标题}`);
    assert(entry.id.startsWith(REBUILD_PREFIX), `Herta Space Station profile id must use rebuild prefix: ${entry.标题}`);
    assert(entry.资料类型 === '单角色档案', `Herta Space Station profile must use single-character profile type: ${entry.标题}`);
    assert(entry.关键词?.includes('资料大区:黑塔空间站'), `Herta Space Station profile missing data-area keyword: ${entry.标题}`);
    assert(entry.关键词?.includes('节点:单角色档案'), `Herta Space Station profile missing single profile keyword: ${entry.标题}`);
    assert(entry.关键词?.includes('语料只作参考'), `Herta Space Station profile missing corpus reference rule: ${entry.标题}`);
    assert(entry.关键词?.includes('禁止照抄语料'), `Herta Space Station profile missing anti-copy corpus rule: ${entry.标题}`);
    for (const field of ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写']) {
      assert(typeof entry[field] === 'string' && entry[field].trim().length >= 20, `Herta Space Station profile must keep ${field}: ${entry.标题}`);
    }
    const source = String(entry.原文 ?? '');
    for (const required of ['## 角色档案包说明', '## 基础识别', '## 常驻事实层', '## 角色故事层', '## 表现锚点层', '## 语料层', '## 能力与职责模块', '## 本回合注入建议']) {
      assert(source.includes(required), `Herta Space Station profile missing section ${required}: ${entry.标题}`);
    }
    assert(
      source.includes('## 历史故事与阶段边界层') || source.includes('## 历史故事与写法边界层'),
      `Herta Space Station profile missing history boundary section: ${entry.标题}`,
    );
    assert(!source.includes('官方介绍中') && !source.includes('官方语音') && !source.includes('项目自制转写'), `Herta Space Station profile must not expose source-trace wording: ${entry.标题}`);
    assert(!/当前战斗表现中是|属性角色|命途属性说明/.test(source), `Herta Space Station profile should stay narrative instead of game-card style: ${entry.标题}`);
  }

  assert(herta.标题 === '黑塔' && herta.关联角色ID === '黑塔', 'Herta profile must use direct display and related role names.');
  assertCoreTriggers(herta, ['黑塔', 'Herta', '黑塔女士', '天才俱乐部#83', '空间站主人', '人偶黑塔', '大黑塔'], 'Herta Space Station Herta profile');
  assertNoBareKeywords(herta, ['模拟宇宙', '奇物收藏'], 'Herta Space Station Herta profile');
  assert(
    String(herta.原文 ?? '').includes('不要因地点出现“黑塔空间站”、系统出现“模拟宇宙”或资料出现“奇物收藏”就自动让黑塔本人出场') &&
      String(herta.禁止误写 ?? '').includes('不能自动等同于黑塔本人出场'),
    'Herta profile must keep tightened location/system recall boundaries.',
  );
  assert(
    String(herta.原文 ?? '').includes('湛蓝星智商最高的人类') &&
      String(herta.原文 ?? '').includes('一旦失去兴趣，就会把人偶断线') &&
      String(herta.原文 ?? '').includes('和她小时候“勉强七分相似”') &&
      String(herta.原文 ?? '').includes('兴趣驱动却并非冷血的天才') &&
      String(herta.原文 ?? '').includes('她的好意常藏在资源、权限、实验支持、问题解法和“别浪费时间”的推动里') &&
      !String(herta.原文 ?? '').includes('黑塔是空间站「黑塔」真正的主人，也是天才俱乐部第83号成员。她平时常以远程操控的人偶形态出现，真正感兴趣的是知识'),
    'Herta resident facts must keep character-color wording instead of official profile prose.',
  );
  assert(
    herta.说话方式.includes('远程人偶 / 自动应答式') &&
      herta.说话方式.includes('研究价值') &&
      herta.说话方式.includes('失去兴趣') &&
      herta.说话方式.includes('黑塔编号') &&
      herta.说话方式.includes('前者后者哪个不是我本人') &&
      herta.说话方式.includes('显然可得 / 显然可见 / 显然可知') &&
      herta.说话方式.includes('魔法') &&
      herta.说话方式.includes('不能写成极端冷血') &&
      herta.性格锚点.includes('高高在上但不是极端冷漠') &&
      herta.关系边界.includes('会给机会、资源和必要帮助') &&
      herta.禁止误写.includes('极端冷漠者') &&
      herta.禁止误写.includes('恶意羞辱者'),
    'Herta speech anchor must distinguish puppet auto-reply, The Herta self-admiring style, and non-cold-blooded goodwill.',
  );
  assert(
      String(herta.原文 ?? '').includes('说话方式：黑塔人偶常是远程人偶 / 自动应答式的效率口吻') &&
      String(herta.原文 ?? '').includes('大黑塔本体语气更自赏、俏皮和挑衅') &&
      String(herta.原文 ?? '').includes('语料只用于学习黑塔的句长、锐利、研究视角、兴趣驱动、自动应答感和高高在上但并非冷血的善意') &&
      String(herta.原文 ?? '').includes('### 人偶自动应答与远程接口') &&
      String(herta.原文 ?? '').includes('### 大黑塔本体语料') &&
      String(herta.原文 ?? '').includes('### 大黑塔对他人的看法') &&
      String(herta.原文 ?? '').includes('### 善意、资源与帮助') &&
      String(herta.原文 ?? '').includes('藏在资源 / 权限 / 实验支持里的善意') &&
      !String(herta.原文 ?? '').includes('语料只用于学习黑塔的句长、冷淡、锐利') &&
      !String(herta.原文 ?? '').includes('冰冷的计算'),
    'Herta source must keep refined speech/corpus wording and avoid over-cold phrasing.',
  );
  assert(
    herta.关联形态ID === '黑塔人偶；大黑塔（本体成年形态，按阶段展开）' &&
      herta.解锁状态.includes('黑塔人偶 / 远程接口') &&
      herta.解锁状态.includes('大黑塔 / 本体成年形态') &&
      herta.外貌锚点.includes('空间站内可存在多个人偶') &&
      herta.外貌锚点.includes('长相与人偶不同') &&
      herta.外貌锚点.includes('银灰偏淡紫的长发') &&
      herta.外貌锚点.includes('权杖 / 法杖') &&
      herta.行为习惯.includes('某个人偶断线、离场或替换') &&
      herta.禁止误写.includes('不要把黑塔人偶写成生物本体') &&
      herta.禁止误写.includes('不要把大黑塔写成与黑塔无关的另一个人') &&
      herta.禁止误写.includes('不要在早期空间站剧情默认启用成年本体外貌'),
    'Herta profile must distinguish remote dolls from The Herta adult body inside one profile.',
  );
  assert(
    ['黑塔人偶远程接口', '黑塔多个人偶', '黑塔人偶不是本体', '人偶断线不是死亡', '大黑塔本体成年形态', '大黑塔不是独立角色', '早期不默认大黑塔', '大黑塔外貌', '大黑塔角色详情', '大黑塔角色故事', '天才的童年万华镜', '银河边境高塔', '模拟宇宙运行记录', '黑塔自动应答', '黑塔研究价值筛选', '高高在上但不冷血', '黑塔给机会给资源', '大黑塔说话方式', '黑塔编号', '黑塔显然可得', '黑塔魔法式解释', '大黑塔本体语料', '大黑塔对他人的看法', '大黑塔关于星穹', '大黑塔关于星/穹', '大黑塔关于螺丝咕姆', '大黑塔关于姬子', '姬子咖啡对比', '黑塔模拟宇宙测试邀约', '求你了来测'].every((keyword) =>
      herta.关键词?.includes(keyword),
    ),
    'Herta profile must keep doll/body and speech-style keywords.',
  );
  assert(
    ['黑塔249个常驻人偶', '黑塔32个备用人偶', '黑塔人偶空壳', '黑塔人偶无自主意识', '黑塔嫌操控人偶行走麻烦', '黑塔奇物烹饪', '黑塔炸厨房', '黑塔宇宙藏室', '黑塔私人密室', '黑塔危险藏品', '黑塔藏品研究价值', '空间站黑塔仓库起源', '黑塔手稿资产', '黑塔私人密室传闻'].every((keyword) =>
      herta.关键词?.includes(keyword),
    ) &&
      herta.行为习惯.includes('常驻249个、备用32个人偶多为空壳') &&
      herta.行为习惯.includes('没有自主意识') &&
      herta.行为习惯.includes('奇物用于烹饪') &&
      herta.禁止误写.includes('不要让多数人偶拥有自主意识') &&
      herta.禁止误写.includes('不要把私人密室传闻写成公开事实'),
    'Herta profile must keep doll counts, empty-shell boundary, cooking quirk, and private-chamber rumor safeguards.',
  );
  const hertaCorpusLayer = String(herta.原文 ?? '').match(/## 语料层\n\n([\s\S]*?)(?=\n\n## 能力与职责模块)/)?.[1] ?? '';
  assert(
    hertaCorpusLayer.includes('### 大黑塔本体语料') &&
      hertaCorpusLayer.includes('#### 初次见面') &&
      hertaCorpusLayer.includes('不认识我了？早和你说过——人类，女性，年轻，貌美，可爱。') &&
      hertaCorpusLayer.includes('#### 关于自己•头衔') &&
      hertaCorpusLayer.includes('前者后者哪个不是我本人') &&
      hertaCorpusLayer.includes('#### 关于自己•生活') &&
      hertaCorpusLayer.includes('连宇宙的终极奥秘都不知道，还有心思聊生活？') &&
      hertaCorpusLayer.includes('#### 关于自己•习惯') &&
      hertaCorpusLayer.includes('显然可得') &&
      hertaCorpusLayer.includes('#### 关于自己•研究') &&
      hertaCorpusLayer.includes('见过魔法么') &&
      hertaCorpusLayer.includes('#### 爱好') &&
      hertaCorpusLayer.includes('一两座空间站的大小') &&
      hertaCorpusLayer.includes('#### 烦恼') &&
      hertaCorpusLayer.includes('人格健全的天才') &&
      hertaCorpusLayer.includes('#### 分享') &&
      hertaCorpusLayer.includes('只要有意思的，我都喜欢') &&
      hertaCorpusLayer.includes('#### 见闻') &&
      hertaCorpusLayer.includes('代表凡人知识边界的是什么') &&
      hertaCorpusLayer.includes('求你了，来测') &&
      hertaCorpusLayer.includes('### 大黑塔对他人的看法') &&
      hertaCorpusLayer.includes('#### 关于星/穹') &&
      hertaCorpusLayer.includes('#### 关于阮•梅') &&
      hertaCorpusLayer.includes('#### 关于螺丝咕姆') &&
      hertaCorpusLayer.includes('#### 关于艾丝妲') &&
      hertaCorpusLayer.includes('#### 关于银狼') &&
      hertaCorpusLayer.includes('#### 关于姬子') &&
      hertaCorpusLayer.includes('#### 关于瓦尔特') &&
      hertaCorpusLayer.includes('姬子一较高下') &&
      hertaCorpusLayer.includes('也想查查他的过去') &&
      !hertaCorpusLayer.includes('#### 关于开拓者') &&
      !hertaCorpusLayer.includes('关于阮・梅') &&
      !hertaCorpusLayer.includes('### 对艾丝妲'),
    'The Herta corpus layer must include provided official-style body lines and grouped opinions without duplicate Asta section.',
  );
  assert(
    String(herta.原文 ?? '').includes('空间站中存在多个黑塔人偶') &&
      String(herta.原文 ?? '').includes('某个人偶断线、损坏或被替换，通常只意味着远程接口断开') &&
      String(herta.原文 ?? '').includes('大黑塔才是黑塔本体 / 成年形态，长相与人偶不同，但仍然是同一个黑塔') &&
      String(herta.原文 ?? '').includes('### 默认底色：黑塔人偶 / 远程接口（默认可用）') &&
      String(herta.原文 ?? '').includes('### 阶段边界：大黑塔 / 本体成年形态（按需展开）') &&
      String(herta.原文 ?? '').includes('人偶断线或替换只按接口处理') &&
      String(herta.原文 ?? '').includes('大黑塔仍是同一个黑塔，不拆成新角色'),
    'Herta source must lock doll/body gate wording.',
  );
  const hertaStoryLayer = String(herta.原文 ?? '').match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 表现锚点层)/)?.[1] ?? '';
  assert(
    hertaStoryLayer.includes('### 黑塔角色故事一：手稿与不必记录的天才') &&
      hertaStoryLayer.includes('写完了，但是找不到了') &&
      hertaStoryLayer.includes('### 黑塔角色故事二：东西多了，总要找地方放') &&
      hertaStoryLayer.includes('「东西多了，总要找地方放。」') &&
      hertaStoryLayer.includes('### 黑塔角色故事三：没有，加油') &&
      hertaStoryLayer.includes('「那就回家睡觉呗。」') &&
      hertaStoryLayer.includes('### 黑塔角色故事四：自动应答与《我如何加入天才俱乐部》') &&
      hertaStoryLayer.includes('所谓自动应答，关键是应答需要如何自动') &&
      hertaStoryLayer.includes('### 黑塔故事使用规则') &&
      !hertaStoryLayer.includes('解锁条件'),
    'Herta story layer must use the provided story body without unlock-condition titles.',
  );
  assert(
    hertaStoryLayer.includes('### 大黑塔角色详情') &&
      hertaStoryLayer.includes('尊贵的「天才俱乐部」#83，人类，女性，年轻，貌美，可爱。') &&
      hertaStoryLayer.includes('### 大黑塔角色故事一：天才的童年万华镜') &&
      hertaStoryLayer.includes('【奇物名称】「天才的童年万华镜」') &&
      hertaStoryLayer.includes('### 大黑塔角色故事二：诞辰研讨会与魔法') &&
      hertaStoryLayer.includes('「是因为『魔法』。」') &&
      hertaStoryLayer.includes('### 大黑塔角色故事三：银河边境的高塔与镜') &&
      hertaStoryLayer.includes('第一面镜由此诞生') &&
      hertaStoryLayer.includes('### 大黑塔角色故事四：模拟宇宙运行记录') &&
      hertaStoryLayer.includes('黑塔：滚。我要伊德莉拉。') &&
      hertaStoryLayer.includes('大黑塔角色详情与四段角色故事属于故事页可见的本体阶段故事') &&
      !hertaStoryLayer.includes('大黑塔\n角色故事'),
    'The Herta story layer must include adult-body details and four visible story cards.',
  );
  const hertaGateLayer = String(herta.原文 ?? '').match(/## 历史故事与阶段边界层\n\n([\s\S]*?)(?=\n\n## 本回合注入建议)/)?.[1] ?? '';
  assert(
    hertaGateLayer.includes('### 阶段边界：大黑塔 / 本体成年形态（按需展开）') &&
      hertaGateLayer.includes('故事边界：大黑塔角色详情与四段角色故事在角色故事层展示') &&
      !hertaGateLayer.includes('### 大黑塔角色故事一：天才的童年万华镜') &&
      !hertaGateLayer.includes('【奇物名称】「天才的童年万华镜」'),
    'The Herta gate layer must keep only usage boundaries while story bodies stay in story layer.',
  );

  assert(asta.标题 === '艾丝妲' && asta.关联角色ID === '艾丝妲', 'Asta profile must use direct display and related role names.');
  assertCoreTriggers(asta, ['艾丝妲', 'Asta', '艾丝妲站长', '空间站站长艾丝妲', '大小姐', '知名不具', '艾丝妲的望远镜', '艾丝妲的匿名账号'], 'Herta Space Station Asta profile');
  assertNoBareKeywords(asta, ['天文望远镜', '空间站管理', '博识学会信件'], 'Herta Space Station Asta profile');
  assert(
    String(asta.原文 ?? '').includes('首席研究员') &&
      String(asta.身份 ?? '').includes('空间站「黑塔」首席研究员') &&
      asta.关键词?.includes('空间站管理不自动召回本人'),
    'Asta profile must keep chief researcher identity and tightened broad-keyword boundary.',
  );
  assert(
    String(asta.原文 ?? '').includes('好奇心与精力都很旺盛的少女') &&
      String(asta.原文 ?? '').includes('直接而不失礼貌地回复博识学会的刁难') &&
      String(asta.原文 ?? '').includes('总比被推回家族既定轨道要自由得多') &&
      !String(asta.原文 ?? '').includes('负责处理大量空间站日常、科员协调、外部交涉和突发事务'),
    'Asta resident facts must keep character-color wording instead of administrative profile prose.',
  );
  const astaStoryLayer = String(asta.原文 ?? '').match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 表现锚点层)/)?.[1] ?? '';
  assert(
    astaStoryLayer.includes('### 艾丝妲角色故事一：望远镜与被误读的兴趣') &&
      astaStoryLayer.includes('我在研究恒星胚胎') &&
      astaStoryLayer.includes('### 艾丝妲角色故事二：阿兰、饭钱与最早的信任') &&
      astaStoryLayer.includes('阿兰的那顿饭钱，在他说出要还钱的那个时刻，就已经结清了') &&
      astaStoryLayer.includes('### 艾丝妲角色故事三：轨迹、家族与黑塔的人偶') &&
      astaStoryLayer.includes('还不如听这小姑娘和你们吵架有趣') &&
      astaStoryLayer.includes('### 艾丝妲角色故事四：站长工作与星空自由') &&
      astaStoryLayer.includes('调用2号设备舱的纽尔•伊曼望远镜') &&
      astaStoryLayer.includes('### 艾丝妲故事使用规则') &&
      !astaStoryLayer.includes('解锁条件'),
    'Asta story layer must use the provided story body without unlock-condition titles.',
  );
  const astaBoundaryLayer = String(asta.原文 ?? '').match(/## 历史故事与写法边界层\n\n([\s\S]*?)(?=\n\n## 本回合注入建议)/)?.[1] ?? '';
  assert(
    String(asta.原文 ?? '').includes('## 历史故事与写法边界层') &&
      astaBoundaryLayer.includes('### 背景边界：家族压力与自我轨迹') &&
      astaBoundaryLayer.includes('触发语境：玩家正文询问艾丝妲家族') &&
      astaBoundaryLayer.includes('不大段展开家庭会议和继承争论') &&
      !String(asta.原文 ?? '').includes('阶段边界：家族压力与自我轨迹'),
    'Asta family pressure must be a background writing boundary, not a gate card.',
  );

  assert(arlan.标题 === '阿兰' && arlan.关联角色ID === '阿兰', 'Arlan profile must use direct display and related role names.');
  assertCoreTriggers(arlan, ['阿兰', 'Arlan', '阿兰大哥', '防卫科负责人', '阿兰与佩佩', '佩佩紧急联系人', '电子飞盘'], 'Herta Space Station Arlan profile');
  assertNoBareKeywords(arlan, ['佩佩', '空间站防卫科'], 'Herta Space Station Arlan profile');
  assert(
    String(arlan.原文 ?? '').includes('白色短发与黑色发梢') &&
      String(arlan.原文 ?? '').includes('粉色眼睛') &&
      String(arlan.外貌锚点 ?? '').includes('鼻梁与前臂伤痕') &&
      arlan.关键词?.includes('佩佩单独出现不自动召回阿兰'),
    'Arlan profile must keep corrected appearance anchors and tightened Peppy recall boundary.',
  );
  assert(
    String(arlan.原文 ?? '').includes('不善言辞的空间站「黑塔」防卫科负责人') &&
      String(arlan.原文 ?? '').includes('把负伤视作履行职责后留下的勋章') &&
      String(arlan.原文 ?? '').includes('只有抱着佩佩或和佩佩互动时') &&
      !String(arlan.原文 ?? '').includes('阿兰是空间站「黑塔」防卫科负责人，不善言辞，但可靠、执行力强'),
    'Arlan resident facts must keep character-color wording instead of official profile prose.',
  );
  const arlanStoryLayer = String(arlan.原文 ?? '').match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 表现锚点层)/)?.[1] ?? '';
  assert(
    arlanStoryLayer.includes('### 阿兰角色故事一：防卫科的明灯与电子飞盘') &&
      arlanStoryLayer.includes('若无大哥百日，则空间站宛如炼狱') &&
      arlanStoryLayer.includes('### 阿兰角色故事二：佩佩、饭钱与湿漉漉的回应') &&
      arlanStoryLayer.includes('「想玩电子飞盘么？」') &&
      arlanStoryLayer.includes('### 阿兰角色故事三：夜间巡逻与刹那危机') &&
      arlanStoryLayer.includes('如果危机发生……') &&
      arlanStoryLayer.includes('### 阿兰角色故事四：封锁电梯与第一次反抗命令') &&
      arlanStoryLayer.includes('他用大剑支撑着自己的身体，缓慢地、坚定地站起身') &&
      arlanStoryLayer.includes('### 阿兰故事使用规则') &&
      !arlanStoryLayer.includes('解锁条件'),
    'Arlan story layer must use the provided story body without unlock-condition titles.',
  );
  const arlanBoundaryLayer = String(arlan.原文 ?? '').match(/## 历史故事与写法边界层\n\n([\s\S]*?)(?=\n\n## 本回合注入建议)/)?.[1] ?? '';
  assert(
    String(arlan.原文 ?? '').includes('## 历史故事与写法边界层') &&
      arlanBoundaryLayer.includes('### 危机场景边界：反物质军团危机与重伤承接') &&
      arlanBoundaryLayer.includes('触发语境：当前剧情处于空间站入侵') &&
      arlanBoundaryLayer.includes('不要把重伤故事当成每次出场固定桥段') &&
      !String(arlan.原文 ?? '').includes('阶段边界：反物质军团危机与重伤承接'),
    'Arlan crisis continuity must be a writing boundary, not a gate card.',
  );
  assertProfileGateVisible(herta, '历史故事与阶段边界层', 'Herta profile');
  assertProfileGateHidden(asta, 'Asta profile');
  assertProfileGateHidden(arlan, 'Arlan profile');
}

function assertGeniusSocietyProfileSet() {
  assert(geniusSocietyPreset.id === 'zhiku_genius_society_character_rebuild', 'Genius Society character preset id changed.');
  assert(geniusSocietyPreset.title === '人物重建·天才俱乐部角色档案', 'Genius Society character preset title changed.');
  assert(geniusSocietyPreset.updatedAt === '2026-06-10-genius-society-character-profiles-8', 'Genius Society character preset updatedAt changed.');
  assert(geniusSocietyPreset.description.includes('阮·梅与螺丝咕姆'), 'Genius Society preset description must list Ruan Mei and Screwllum.');
  assert(geniusSocietyPreset.description.includes('史蒂芬、赞达尔轻量 NPC 锚点'), 'Genius Society preset description must list Stephen and Zandar as lightweight NPC anchors.');
  assert(geniusSocietyPreset.description.includes('黑塔已归入黑塔空间站角色档案'), 'Genius Society preset must keep Herta out of this group.');

  const profiles = new Map((geniusSocietyPreset.entries ?? []).map((entry) => [entry.id, entry]));
  const ruanmei = profiles.get('zhiku_character_rebuild_ruanmei_profile');
  const screwllum = profiles.get('zhiku_character_rebuild_screwllum_profile');
  const stephen = profiles.get('zhiku_character_rebuild_stephen_lloyd_profile');
  const zandar = profiles.get('zhiku_character_rebuild_zandar_profile');
  assert(ruanmei && screwllum && stephen && zandar && profiles.size === 4, 'Genius Society preset must contain exactly Ruan Mei, Screwllum, Stephen, and Zandar profiles.');
  assert(!(geniusSocietyPreset.entries ?? []).some((entry) => entry.标题 === '黑塔' || entry.标题 === '大黑塔'), 'Genius Society preset must not duplicate Herta profiles.');

  assertRebuiltSingleProfileShape([ruanmei, screwllum], '天才俱乐部', 'Genius Society');
  for (const entry of [stephen, zandar]) {
    assert(entry.分类 === 'character' && entry.资料类型 === '单角色档案', `Genius Society lightweight NPC must stay character anchor: ${entry.标题}`);
    assert(entry.关键词?.includes('轻量NPC档案') && String(entry.原文 ?? '').includes('轻量 NPC 档案'), `Genius Society lightweight NPC marker missing: ${entry.标题}`);
    assert(String(entry.原文 ?? '').includes('宽词'), `Genius Society lightweight NPC must keep broad recall boundary text: ${entry.标题}`);
    assert(String(entry.原文 ?? '').includes('## 人物底色') && String(entry.原文 ?? '').includes('## 写法收束'), `Genius Society lightweight NPC must use writing-anchor sections: ${entry.标题}`);
    assert(!String(entry.原文 ?? '').includes('当前信息基') && !String(entry.原文 ?? '').includes('## 本回合注入建议'), `Genius Society lightweight NPC must avoid official/system wording: ${entry.标题}`);
    assert(!/^####\s+/mu.test(String(entry.原文 ?? '')), `Genius Society lightweight NPC headings must not use ####: ${entry.标题}`);
  }
  assertCoreTriggers(ruanmei, ['阮·梅', 'Ruan Mei', '阮梅', '天才俱乐部#81'], 'Genius Society Ruan Mei profile');
  assertCoreTriggers(screwllum, ['螺丝咕姆', 'Screwllum', '天才俱乐部#76', '螺丝星君王'], 'Genius Society Screwllum profile');

  for (const entry of [ruanmei, screwllum, stephen, zandar]) {
    assertNoBareKeywords(entry, ['天才俱乐部', '黑塔空间站', '模拟宇宙', '博识学会', '螺丝星', '机械生命'], `Genius Society ${entry.标题} profile`);
  }
  for (const entry of [ruanmei, screwllum]) {
    assert(
      String(entry.原文 ?? '').includes('组织 / 项目 / 地点宽词') ||
        String(entry.原文 ?? '').includes('组织 / 地点 / 项目 / 种类宽词'),
      `Genius Society profile must keep broad recall boundary: ${entry.标题}`,
    );
    const corpusLayer = String(entry.原文 ?? '').match(/## 语料层\n\n([\s\S]*?)(?=\n\n## 能力与职责模块)/)?.[1] ?? '';
    assert(corpusLayer.includes('语料只用于学习'), `Genius Society corpus rule missing: ${entry.标题}`);
    assert(!/^####\s+/mu.test(corpusLayer), `Genius Society corpus headings must use UI-visible ### cards: ${entry.标题}`);
    assert(corpusLayer.includes('### 初次见面') && corpusLayer.includes('### 日常场景参考'), `Genius Society corpus cards missing: ${entry.标题}`);
  }

  assert(
    String(ruanmei.原文 ?? '').includes('天才俱乐部#81') &&
      String(ruanmei.原文 ?? '').includes('生命科学') &&
      String(ruanmei.原文 ?? '').includes('繁育令使复制实验') &&
      String(ruanmei.原文 ?? '').includes('阮·梅造物') &&
      String(ruanmei.原文 ?? '').includes('庸与神的冠冕') &&
      String(ruanmei.原文 ?? '').includes('糕点、冰川与爱的气味') &&
      String(ruanmei.原文 ?? '').includes('黑色丧服与不会辜负的科学') &&
      String(ruanmei.原文 ?? '').includes('隐士、拟造生命与星神问题') &&
      String(ruanmei.原文 ?? '').includes('下午茶、温床与模拟星神') &&
      String(ruanmei.原文 ?? '').includes('父母由数据聚成的面庞') &&
      String(ruanmei.原文 ?? '').includes('唯有科学不会辜负') &&
      String(ruanmei.原文 ?? '').includes('来自“智识”的瞥视') &&
      String(ruanmei.原文 ?? '').includes('来自天才俱乐部的联络函') &&
      String(ruanmei.原文 ?? '').includes('那只被戏称为“电饭煲”的装置') &&
      String(ruanmei.原文 ?? '').includes('我叫阮·梅，念我名字时') &&
      String(ruanmei.原文 ?? '').includes('这糕点用的梅花是新渍的') &&
      String(ruanmei.原文 ?? '').includes('科学出自狂热，这是种天赋') &&
      String(ruanmei.原文 ?? '').includes('我与螺丝咕姆对生命的理解截然不同') &&
      String(ruanmei.原文 ?? '').includes('在黑塔的办公室里放块西瓜冻糕') &&
      String(ruanmei.原文 ?? '').includes('### 关于大黑塔') &&
      !/^####\s+/mu.test(String(ruanmei.原文 ?? '').match(/## 语料层\n\n([\s\S]*?)(?=\n\n## 能力与职责模块)/)?.[1] ?? '') &&
      !String(ruanmei.原文 ?? '').includes('解锁条件') &&
      !String(ruanmei.原文 ?? '').includes('角色等级') &&
      !String(ruanmei.原文 ?? '').includes('无人的星球') &&
      String(ruanmei.原文 ?? '').includes('不能写成纯恶') &&
      String(ruanmei.原文 ?? '').includes('不能写成所有实验都正确') &&
      ruanmei.关键词?.includes('阮·梅天才俱乐部#81') &&
      ruanmei.关键词?.includes('阮·梅繁育实验边界') &&
      ruanmei.关键词?.includes('阮·梅关于造物') &&
      ruanmei.关键词?.includes('阮·梅冰川科考') &&
      ruanmei.关键词?.includes('阮·梅父母数据面庞') &&
      ruanmei.关键词?.includes('阮·梅博识尊瞥视') &&
      ruanmei.关键词?.includes('阮·梅电饭煲温床') &&
      ruanmei.关键词?.includes('阮·梅听戏语料') &&
      ruanmei.关键词?.includes('阮·梅刺绣手法') &&
      ruanmei.关键词?.includes('阮·梅关于黑塔') &&
      ruanmei.关键词?.includes('阮·梅关于螺丝咕姆') &&
      ruanmei.关键词?.includes('阮·梅关于大黑塔') &&
      !ruanmei.关键词?.includes('生命科学') &&
      !ruanmei.关键词?.includes('繁育'),
    'Ruan Mei profile must keep life-science, experiment, creation, and moral-gray boundaries without broad bare keywords.',
  );

  assert(
    String(stephen.原文 ?? '').includes('天才俱乐部#84') &&
      String(stephen.原文 ?? '').includes('养父的水果店') &&
      String(stephen.原文 ?? '').includes('西瓜冻糕') &&
      String(stephen.原文 ?? '').includes('观众骰') &&
      String(stephen.原文 ?? '').includes('频率捕手手套') &&
      String(stephen.原文 ?? '').includes('权杖系统') &&
      String(stephen.原文 ?? '').includes('把宇宙级项目也调成一场让人想继续玩的关卡') &&
      String(stephen.原文 ?? '').includes('当前事件真正需要的技术发明锚点') &&
      stephen.关键词?.includes('史蒂芬天才俱乐部#84') &&
      stephen.关键词?.includes('史蒂芬西瓜冻糕') &&
      stephen.关键词?.includes('史蒂芬频率捕手手套') &&
      stephen.关键词?.includes('史蒂芬模拟宇宙趣味设计') &&
      !stephen.关键词?.includes('天才俱乐部') &&
      !stephen.关键词?.includes('模拟宇宙') &&
      !stephen.关键词?.includes('游戏') &&
      !stephen.关键词?.includes('水果店'),
    'Stephen lightweight NPC profile must keep strict triggers and compact anchors.',
  );

  assert(
    String(zandar.原文 ?? '').includes('天才俱乐部#1') &&
      String(zandar.原文 ?? '').includes('博识尊的创造者') &&
      String(zandar.原文 ?? '').includes('思想碎片') &&
      String(zandar.原文 ?? '').includes('九具身体') &&
      String(zandar.原文 ?? '').includes('来古士') &&
      String(zandar.原文 ?? '').includes('翁法罗斯实验') &&
      String(zandar.原文 ?? '').includes('亲手点燃太阳后，又试图拆毁太阳运行轨道的人') &&
      String(zandar.原文 ?? '').includes('只给少量高密度信息') &&
      zandar.关键词?.includes('赞达尔天才俱乐部#1') &&
      zandar.关键词?.includes('赞达尔博识尊创造者') &&
      zandar.关键词?.includes('赞达尔思想碎片工程') &&
      zandar.关键词?.includes('赞达尔来古士边界') &&
      !zandar.关键词?.includes('天才俱乐部') &&
      !zandar.关键词?.includes('博识尊') &&
      !zandar.关键词?.includes('翁法罗斯') &&
      !zandar.关键词?.includes('星神'),
    'Zandar lightweight NPC profile must keep strict triggers and stage boundaries.',
  );

  assert(
    String(screwllum.原文 ?? '').includes('天才俱乐部#76') &&
      String(screwllum.原文 ?? '').includes('螺丝星的君王') &&
      String(screwllum.原文 ?? '').includes('机械贵族') &&
      String(screwllum.原文 ?? '').includes('底层逻辑') &&
      String(screwllum.原文 ?? '').includes('黑客交锋') &&
      String(screwllum.原文 ?? '').includes('不要只写成冰冷机器人') &&
      String(screwllum.原文 ?? '').includes('机械帝皇战争后的布谷鸟钟') &&
      String(screwllum.原文 ?? '').includes('假银河底层的安静齿轮') &&
      String(screwllum.原文 ?? '').includes('银狼、卡带与七十六个账号') &&
      String(screwllum.原文 ?? '').includes('查德威克、史瓦罗与机械善意') &&
      String(screwllum.原文 ?? '').includes('机械布谷鸟钟') &&
      String(screwllum.原文 ?? '').includes('朋克洛德精神') &&
      String(screwllum.原文 ?? '').includes('七十六个被冻结的账号') &&
      String(screwllum.原文 ?? '').includes('协助把意识带离梦境系统') &&
      String(screwllum.原文 ?? '').includes('未知处保持叙事留白') &&
      !String(screwllum.原文 ?? '').includes('官方可直接展开') &&
      !String(screwllum.原文 ?? '').includes('可核验身份锚点') &&
      !String(screwllum.原文 ?? '').includes('使用这层') &&
      String(screwllum.原文 ?? '').includes('不得补完') &&
      String(screwllum.原文 ?? '').includes('常用前置词把话语拆成提问、前提、逻辑、校验、风险、结论或建议') &&
      String(screwllum.原文 ?? '').includes('“提问：我们当前最需要确认的') &&
      String(screwllum.原文 ?? '').includes('“逻辑：若双方都缺少完整信息') &&
      String(screwllum.原文 ?? '').includes('“结论：在风险可控的前提下') &&
      String(screwllum.原文 ?? '').includes('“风险：您再向前一步') &&
      String(screwllum.说话方式 ?? '').includes('提问、前提、逻辑、校验、风险、结论、建议') &&
      screwllum.关键词?.includes('螺丝咕姆天才俱乐部#76') &&
      screwllum.关键词?.includes('螺丝咕姆螺丝星君王') &&
      screwllum.关键词?.includes('螺丝咕姆银狼交锋') &&
      screwllum.关键词?.includes('螺丝咕姆提问逻辑结论语料') &&
      screwllum.关键词?.includes('螺丝咕姆逻辑前置词') &&
      screwllum.关键词?.includes('螺丝咕姆机械帝皇战争余波') &&
      screwllum.关键词?.includes('螺丝咕姆机械布谷鸟钟') &&
      screwllum.关键词?.includes('螺丝咕姆朋克洛德精神') &&
      screwllum.关键词?.includes('螺丝咕姆七十六个账号') &&
      screwllum.关键词?.includes('螺丝咕姆查德威克意识归还') &&
      screwllum.关键词?.includes('螺丝咕姆史瓦罗会面意向') &&
      !screwllum.关键词?.includes('螺丝星') &&
      !screwllum.关键词?.includes('机械生命'),
    'Screwllum profile must keep planet-ruler, mechanical-life, Simulated Universe, and Silver Wolf boundaries without broad bare keywords.',
  );
}

function assertIntelligentsiaGuildProfileSet() {
  assert(intelligentsiaGuildPreset.id === 'zhiku_intelligentsia_guild_character_rebuild', 'Intelligentsia Guild character preset id changed.');
  assert(intelligentsiaGuildPreset.title === '人物重建·博识学会角色档案', 'Intelligentsia Guild character preset title changed.');
  assert(intelligentsiaGuildPreset.updatedAt === '2026-06-10-intelligentsia-guild-character-profiles-3', 'Intelligentsia Guild character preset updatedAt changed.');

  const profiles = new Map((intelligentsiaGuildPreset.entries ?? []).map((entry) => [entry.id, entry]));
  const ratio = profiles.get('zhiku_character_rebuild_dr_ratio_profile');
  assert(ratio && profiles.size === 1, 'Intelligentsia Guild preset must contain exactly Dr. Ratio profile.');

  assert(ratio.分类 === 'character' && ratio.id.startsWith(REBUILD_PREFIX) && ratio.资料类型 === '单角色档案', 'Dr. Ratio profile must stay a rebuilt character anchor.');
  assert(ratio.关键词?.includes('资料大区:博识学会') && ratio.关键词?.includes('节点:单角色档案'), 'Dr. Ratio profile missing grouping keywords.');
  for (const field of ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写']) {
    assert(typeof ratio[field] === 'string' && ratio[field].trim().length >= 20, `Dr. Ratio profile must keep ${field}.`);
  }
  assertCoreTriggers(ratio, ['真理医生', 'Dr. Ratio', '维里塔斯·拉帝奥', 'Veritas Ratio', '拉帝奥教授'], 'Intelligentsia Guild Dr. Ratio profile');
  assertNoBareKeywords(ratio, ['博识学会', '智识', '学者', '医生', '天才'], 'Intelligentsia Guild Dr. Ratio profile');
  const ratioSource = String(ratio.原文 ?? '');
  const ratioCorpus = ratioSource.match(/## 语料层\n\n([\s\S]*?)(?=\n\n## 能力与职责模块)/)?.[1] ?? '';
  for (const required of ['## 召回边界', '## 基础识别', '## 常驻事实层', '## 角色故事层', '## 表现锚点层', '## 语料层', '## 能力与职责模块', '## 历史故事与阶段边界层']) {
    assert(ratioSource.includes(required), `Dr. Ratio profile missing section ${required}.`);
  }
  assert(
    ratioSource.includes('不要因“博识学会”“智识”“学者”“医生”“天才”等宽词自动召回') &&
      ratioSource.includes('直率、自我、争议极大') &&
      ratioSource.includes('庸人') &&
      ratioSource.includes('荣德教授') &&
      ratioSource.includes('第一真理大学') &&
      ratioSource.includes('第八个博士') &&
      ratioSource.includes('一等荣誉学位') &&
      ratioSource.includes('星际和平公司的正式邀请') &&
      ratioSource.includes('庸众院') &&
      ratioSource.includes('医治宇宙') &&
      ratioCorpus.includes('### 初次见面') &&
      ratioCorpus.includes('### 关于自己•头套') &&
      ratioCorpus.includes('### 关于自己•真容') &&
      ratioCorpus.includes('### 闲谈•博识学会') &&
      ratioCorpus.includes('### 闲谈•天才俱乐部') &&
      ratioCorpus.includes('### 爱好') &&
      ratioCorpus.includes('### 烦恼') &&
      ratioCorpus.includes('### 关于阮·梅') &&
      ratioCorpus.includes('### 关于星期日') &&
      ratioCorpus.includes('我离不开书籍和浴缸') &&
      ratioCorpus.includes('愚者自以为聪明') &&
      !/^####\s+/mu.test(ratioCorpus) &&
      ratioSource.includes('不要写成天才俱乐部成员') &&
      ratioSource.includes('砂金的保姆') &&
      !ratioSource.includes('角色等级') &&
      !ratioSource.includes('解锁条件') &&
      !ratioSource.includes('## 角色档案包说明') &&
      !ratioSource.includes('当前信息基') &&
      !ratioSource.includes('## 本回合注入建议') &&
      ratio.关键词?.includes('真理医生石膏头雕') &&
      ratio.关键词?.includes('真理医生愚昧病症') &&
      ratio.关键词?.includes('真理医生天才俱乐部落选') &&
      ratio.关键词?.includes('真理医生关于砂金') &&
      ratio.关键词?.includes('真理医生荣德推荐信') &&
      ratio.关键词?.includes('真理医生第八个博士') &&
      ratio.关键词?.includes('真理医生庸众院') &&
      ratio.关键词?.includes('真理医生医治宇宙') &&
      ratio.关键词?.includes('真理医生头套语料') &&
      ratio.关键词?.includes('真理医生真容语料') &&
      ratio.关键词?.includes('真理医生关于阮梅') &&
      ratio.关键词?.includes('真理医生关于星期日') &&
      !ratio.关键词?.includes('真理医生') &&
      !ratio.关键词?.includes('Dr. Ratio') &&
      !ratio.关键词?.includes('Veritas Ratio'),
    'Dr. Ratio profile must keep profiles-3 story/corpus anchors, strict triggers, and non-system wording.',
  );
}

function assertBelobogProfileSet() {
  assert(belobogPreset.id === 'zhiku_belobog_character_rebuild', 'Belobog character preset id changed.');
  assert(belobogPreset.title === '人物重建·贝洛伯格角色档案', 'Belobog character preset title changed.');
  assert(belobogPreset.updatedAt === '2026-06-10-belobog-character-profiles-15', 'Belobog character preset updatedAt changed.');

  const profiles = new Map((belobogPreset.entries ?? []).map((entry) => [entry.id, entry]));
  const bronya = profiles.get('zhiku_character_rebuild_bronya_profile');
  const seele = profiles.get('zhiku_character_rebuild_seele_profile');
  const gepard = profiles.get('zhiku_character_rebuild_gepard_profile');
  const serval = profiles.get('zhiku_character_rebuild_serval_profile');
  const pela = profiles.get('zhiku_character_rebuild_pela_profile');
  const natasha = profiles.get('zhiku_character_rebuild_natasha_profile');
  const clara = profiles.get('zhiku_character_rebuild_clara_profile');
  const svarog = profiles.get('zhiku_character_rebuild_svarog_profile');
  const sampo = profiles.get('zhiku_character_rebuild_sampo_profile');
  const hook = profiles.get('zhiku_character_rebuild_hook_profile');
  const luka = profiles.get('zhiku_character_rebuild_luka_profile');
  const lynx = profiles.get('zhiku_character_rebuild_lynx_profile');
  const cocolia = profiles.get('zhiku_character_rebuild_cocolia_profile');
  assert(
    bronya && seele && gepard && serval && pela && natasha && clara && svarog && sampo && hook && luka && lynx && cocolia && profiles.size === 13,
    'Belobog preset must contain exactly 13 first-pass profiles.',
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

  const all = [bronya, seele, gepard, serval, pela, natasha, clara, svarog, sampo, hook, luka, lynx, cocolia];
  const identityExpectations = [
    [bronya, '女', '女；女性。', '未知，外貌与社会互动表现为年轻女性。', ['布洛妮娅性别女', '布洛妮娅年龄状态']],
    [seele, '女', '女；女性。', '未知，外貌与社会互动表现为年轻女性。', ['希儿性别女', '希儿年龄状态']],
    [gepard, '男', '男；男性。', '未知，外貌与社会互动表现为成年男性。', ['杰帕德性别男', '杰帕德年龄状态']],
    [serval, '女', '女；女性。', '未知，外貌与社会互动表现为成年女性。', ['希露瓦性别女', '希露瓦年龄状态']],
    [pela, '女', '女；女性。', '未知，设定强调年纪不大且曾因未满足最低年龄需求获荣誉学士，剧情中按年轻专业人士处理。', ['佩拉性别女', '佩拉年龄状态', '佩拉荣誉学士年龄']],
    [natasha, '女', '女；女性。', '未知，外貌与社会互动表现为成熟女性。', ['娜塔莎性别女', '娜塔莎年龄状态']],
    [clara, '女', '女；女性。', '未知，外貌与社会互动表现为儿童 / 年幼少女，不成人化处理。', ['克拉拉性别女', '克拉拉年龄状态', '克拉拉儿童']],
    [svarog, '不适用（机械个体）', '不适用；机械个体，不按人类性别表达处理。', '不适用；旧世界遗留自动控制单元，制造年代未知，不按人类年龄处理。', ['史瓦罗性别不适用', '史瓦罗机械个体', '史瓦罗年龄状态']],
    [sampo, '男', '男；男性。', '未知，外貌与社会互动表现为成年男性。', ['桑博性别男', '桑博男性身份', '桑博年龄状态', '桑博成年男性']],
    [hook, '女', '女；女性。', '未知，外貌与社会互动表现为儿童，不成人化处理。', ['虎克性别女', '虎克年龄状态', '虎克儿童']],
    [luka, '男', '男；男性。', '未知，外貌与社会互动表现为年轻男性。', ['卢卡性别男', '卢卡年龄状态']],
    [lynx, '女', '女；女性。', '未知，外貌与社会互动表现为年轻女性，作为朗道家小妹和科考队员处理。', ['玲可性别女', '玲可年龄状态']],
    [cocolia, '女', '女；女性。', '未知，外貌与社会互动表现为成熟女性。', ['可可利亚性别女', '可可利亚年龄状态']],
  ];
  for (const [entry, gender, genderLineValue, age, keywords] of identityExpectations) {
    assert(entry.性别 === gender, `Belobog gender must be corrected: ${entry.标题}`);
    assert(entry.年龄状态 === age, `Belobog age status must use unknown-age display wording: ${entry.标题}`);
    assert(String(entry.原文 ?? '').includes(`性别 / 性别表达：${genderLineValue}`), `Belobog base identity gender line must stay present: ${entry.标题}`);
    assert(String(entry.原文 ?? '').includes(`年龄状态：${age}`), `Belobog base identity age line must stay present: ${entry.标题}`);
    for (const keyword of keywords) {
      assert(entry.关键词?.includes(keyword), `Belobog gender/age narrow keyword missing for ${entry.标题}: ${keyword}`);
    }
  }
  assertRebuiltSingleProfileShape(all, '贝洛伯格', 'Belobog');
  for (const entry of all) {
    assertNoBareKeywords(entry, ['贝洛伯格', '雅利洛-VI', '上层区', '下层区', '银鬃铁卫', '地火'], `Belobog ${entry.标题} profile`);
    assert(String(entry.原文 ?? '').includes('不要仅因出现“贝洛伯格”'), `Belobog profile must keep broad region recall boundary: ${entry.标题}`);
  }

  const storyBodyProfiles = [bronya, seele, gepard, serval, pela, natasha, clara, sampo, hook, luka, lynx];
  for (const entry of storyBodyProfiles) {
    const storyLayer = String(entry.原文 ?? '').match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 表现锚点层)/)?.[1] ?? '';
    assert(storyLayer.includes('故事本体'), `Belobog profile must use provided story body: ${entry.标题}`);
    assert(!storyLayer.includes('解锁条件'), `Belobog story body must remove unlock-condition text: ${entry.标题}`);
    assert(!storyLayer.includes('首版整理稿'), `Belobog provided story body must not remain first-pass draft: ${entry.标题}`);
  }
  for (const entry of [svarog, cocolia]) {
    const storyLayer = String(entry.原文 ?? '').match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 表现锚点层)/)?.[1] ?? '';
    assert(storyLayer.includes('相关背景文本整理'), `Belobog special profile must use related background text compilation: ${entry.标题}`);
    assert(storyLayer.includes('非可玩角色故事本体'), `Belobog special profile must not pretend to be playable character story body: ${entry.标题}`);
    assert(!storyLayer.includes('首版整理稿'), `Belobog special profile must no longer remain first-pass draft: ${entry.标题}`);
    assert(!/角色故事•[一二三四]（解锁条件：角色等级/.test(storyLayer), `Belobog special background text must not use playable unlock-condition titles: ${entry.标题}`);
  }
  assert(
    String(svarog.原文 ?? '').includes('炉心基地与旧世界守护') &&
      String(svarog.原文 ?? '').includes('数据库、承诺与不可替换') &&
      String(svarog.原文 ?? '').includes('机械生命的可能性') &&
      String(svarog.原文 ?? '').includes('硅基生命') &&
      String(svarog.原文 ?? '').includes('不要在故事正文里堆叠考据来源标签') &&
      !String(svarog.原文 ?? '').includes('可阅读物') &&
      !String(svarog.原文 ?? '').includes('光锥') &&
      svarog.关键词?.includes('史瓦罗背景文本') &&
      svarog.关键词?.includes('史瓦罗不可替换') &&
      svarog.关键词?.includes('史瓦罗螺丝咕姆观察'),
    'Belobog Svarog special background narrative anchors and narrow keywords must stay present.',
  );
  assert(
    String(svarog.原文 ?? '').includes('### 初次见面') &&
      String(svarog.原文 ?? '').includes('### 关于人类') &&
      String(svarog.原文 ?? '').includes('### 关于螺丝咕姆') &&
      String(svarog.原文 ?? '').includes('### 日常场景参考') &&
      String(svarog.原文 ?? '').includes('本机正在持续修正该词条的定义') &&
      String(svarog.原文 ?? '').includes('保护并不等同于关闭所有大门') &&
      String(svarog.原文 ?? '').includes('本机无法确认这是否名为‘奇迹’') &&
      svarog.关键词?.includes('史瓦罗初次见面语料') &&
      svarog.关键词?.includes('史瓦罗关于螺丝咕姆') &&
      svarog.关键词?.includes('史瓦罗日常场景参考') &&
      svarog.关键词?.includes('史瓦罗定义更新'),
    'Belobog Svarog profiles-10 corpus must keep self-written speech, relationship, and daily-scene anchors.',
  );
  assert(
    String(cocolia.原文 ?? '').includes('纪念画像叙事') &&
      String(cocolia.原文 ?? '').includes('旧照片、希露瓦与被切断的过去') &&
      String(cocolia.原文 ?? '').includes('星核低语与“新世界”错路') &&
      String(cocolia.原文 ?? '').includes('不要在故事正文里堆叠考据来源标签') &&
      !String(cocolia.原文 ?? '').includes('魔法少女可可利亚') &&
      !String(cocolia.原文 ?? '').includes('光锥') &&
      !String(cocolia.原文 ?? '').includes('可阅读物') &&
      !String(cocolia.原文 ?? '').includes('材料') &&
      cocolia.关键词?.includes('可可利亚背景文本') &&
      cocolia.关键词?.includes('可可利亚纪念画像叙事') &&
      cocolia.关键词?.includes('可可利亚旧照片') &&
      !cocolia.关键词?.includes('魔法少女可可利亚'),
    'Belobog Cocolia special background narrative anchors and narrow keywords must stay present without fan-text material.',
  );
  assert(
    String(cocolia.原文 ?? '').includes('### 初次见面') &&
      String(cocolia.原文 ?? '').includes('### 星核低语阶段') &&
      String(cocolia.原文 ?? '').includes('### 主线后回忆口吻') &&
      String(cocolia.原文 ?? '').includes('### 日常场景参考') &&
      String(cocolia.原文 ?? '').includes('大守护者这个称号不会允许我软弱') &&
      String(cocolia.原文 ?? '').includes('布洛妮娅，不要成为我的影子') &&
      String(cocolia.原文 ?? '').includes('旧友相关') &&
      cocolia.关键词?.includes('可可利亚星核低语语料') &&
      cocolia.关键词?.includes('可可利亚主线后回忆口吻') &&
      cocolia.关键词?.includes('可可利亚日常场景参考') &&
      cocolia.关键词?.includes('可可利亚克里珀堡政务') &&
      !String(cocolia.原文 ?? '').includes('魔法少女可可利亚'),
    'Belobog Cocolia profiles-10 corpus must keep self-written authority, low-whisper, memory, and daily-scene anchors.',
  );

  assertCoreTriggers(bronya, ['布洛妮娅', 'Bronya', '布洛妮娅·兰德', '现任大守护者布洛妮娅', '贝洛伯格布洛妮娅'], 'Belobog Bronya profile');
  assertCoreTriggers(seele, ['希儿', 'Seele', '地火希儿', '下层区希儿', '贝洛伯格希儿'], 'Belobog Seele profile');
  assertCoreTriggers(gepard, ['杰帕德', 'Gepard', '杰帕德·朗道', '银鬃铁卫戍卫官', '朗道家的弟弟'], 'Belobog Gepard profile');
  assertCoreTriggers(serval, ['希露瓦', 'Serval', '希露瓦·朗道', '机械屋老板希露瓦', '朗道家的姐姐', '摇滚歌手希露瓦'], 'Belobog Serval profile');
  assertCoreTriggers(pela, ['佩拉', 'Pela', '佩拉格娅', '佩拉格娅·谢尔盖耶夫娜', '情报官佩拉', '银鬃铁卫佩拉'], 'Belobog Pela profile');
  assertCoreTriggers(natasha, ['娜塔莎', 'Natasha', '娜塔莎医生', '地火医生娜塔莎', '下层区娜塔莎', '孤儿院娜塔莎'], 'Belobog Natasha profile');
  assertCoreTriggers(clara, ['克拉拉', 'Clara', '克拉拉与史瓦罗', '史瓦罗保护的克拉拉', '下层区克拉拉'], 'Belobog Clara profile');
  assertCoreTriggers(svarog, ['史瓦罗', 'Svarog', '史瓦罗先生', '克拉拉的史瓦罗', '自动机兵史瓦罗'], 'Belobog Svarog profile');
  assertCoreTriggers(sampo, ['桑博', 'Sampo', '桑博·科斯基', '蓝头发的主犯', '雪堆里的桑博', '贝洛伯格桑博'], 'Belobog Sampo profile');
  assertCoreTriggers(hook, ['虎克', 'Hook', '漆黑的虎克大人', '鼹鼠党老大虎克', '下层区虎克'], 'Belobog Hook profile');
  assertCoreTriggers(luka, ['卢卡', 'Luka', '搏击手卢卡', '地火卢卡', '磐岩镇卢卡'], 'Belobog Luka profile');
  assertCoreTriggers(lynx, ['玲可', 'Lynx', '玲可·朗道', '朗道家的小妹', '极地探险家玲可'], 'Belobog Lynx profile');
  assertCoreTriggers(cocolia, ['可可利亚', 'Cocolia', '可可利亚·兰德', '前任大守护者可可利亚', '布洛妮娅的母亲', '星核蛊惑的可可利亚'], 'Belobog Cocolia profile');

  assert(
    String(bronya.原文 ?? '').includes('主线后成为现任大守护者') &&
      String(bronya.原文 ?? '').includes('不要写成天生完美统治者') &&
      bronya.关键词?.includes('布洛妮娅大守护者') &&
      String(seele.原文 ?? '').includes('她不喜欢空话') &&
      String(seele.原文 ?? '').includes('不要把她和布洛妮娅关系固定成单一恋爱解释') &&
      seele.关键词?.includes('希儿地火') &&
      String(gepard.原文 ?? '').includes('银鬃铁卫戍卫官') &&
      String(gepard.原文 ?? '').includes('不要写成死板到不懂变通') &&
      String(serval.原文 ?? '').includes('「永动」机械屋') &&
      String(serval.原文 ?? '').includes('不要写成只会摇滚的搞笑角色') &&
      String(pela.原文 ?? '').includes('情报不等于真相') &&
      String(natasha.原文 ?? '').includes('温柔背后的硬度') &&
      String(clara.原文 ?? '').includes('克拉拉与史瓦罗强绑定，但不是同一个角色') &&
      String(svarog.原文 ?? '').includes('克拉拉的安全优先级最高') &&
      sampo.性别 === '男' &&
      sampo.年龄状态 === '未知，外貌与社会互动表现为成年男性。' &&
      String(sampo.原文 ?? '').includes('性别 / 性别表达：男；男性。') &&
      String(sampo.原文 ?? '').includes('年龄状态：未知，外貌与社会互动表现为成年男性。') &&
      String(sampo.原文 ?? '').includes('本层是桑博双层身份的写作门禁') &&
      String(sampo.原文 ?? '').includes('### 门禁一：贝洛伯格可疑商人（默认常驻）') &&
      String(sampo.原文 ?? '').includes('### 门禁二：假面愚者 / 欢愉 / 酒馆 / 面具（深层阶段）') &&
      String(sampo.原文 ?? '').includes('### 门禁三：花火 / 火花关系（深层阶段附属门禁）') &&
      String(sampo.原文 ?? '').includes('展开条件：匹诺康尼后续、玩家正文明确追问桑博深层身份 / 面具 / 酒馆 / 假面愚者') &&
      String(sampo.原文 ?? '').includes('默认处理：条件不足时只保留“可疑”“消息太灵通”“似乎另有所图”的暗线') &&
      String(sampo.原文 ?? '').includes('知情边界：开拓者或少数被卷入深层线索的人可以逐步察觉异常') &&
      String(sampo.原文 ?? '').includes('回落规则：深层信息完成一次提示或交锋后，普通贝洛伯格日常仍回到门禁一的倒货商人层') &&
      String(sampo.原文 ?? '').includes('不回流到贝洛伯格早期普通商人戏') &&
      sampo.关键词?.includes('桑博性别男') &&
      sampo.关键词?.includes('桑博深层假面愚者阶段') &&
      sampo.关键词?.includes('桑博门禁层') &&
      sampo.关键词?.includes('桑博深层身份门禁') &&
      String(hook.原文 ?? '').includes('漆黑的虎克大人') &&
      String(luka.原文 ?? '').includes('机械义肢不是单纯酷炫装饰') &&
      String(lynx.原文 ?? '').includes('极地探险') &&
      String(cocolia.原文 ?? '').includes('不要写成纯粹恶人') &&
      String(cocolia.原文 ?? '').includes('主线后：多以回忆、档案、政治遗留和布洛妮娅心结出现'),
    'Belobog profiles must keep key identity and writing boundaries.',
  );
  assertProfileGateVisible(bronya, '历史故事与写法边界层', 'Belobog Bronya profile');
  assertProfileGateVisible(sampo, '历史故事与写法边界层', 'Belobog Sampo profile');
  assertProfileGateVisible(cocolia, '历史故事与写法边界层', 'Belobog Cocolia profile');
  for (const entry of [seele, gepard, serval, pela, natasha, clara, svarog, hook, luka, lynx]) {
    assertProfileGateHidden(entry, `Belobog ${entry.标题} profile`);
  }

  assert(
    String(bronya.原文 ?? '').includes('让世界变得美好') &&
      String(bronya.原文 ?? '').includes('走吧，布洛妮娅。') &&
      String(hook.原文 ?? '').includes('费斯曼老爹') &&
      String(hook.原文 ?? '').includes('帮老爹把病治好') &&
      String(gepard.原文 ?? '').includes('人们看不到众铁卫盔面下的倦容') &&
      String(gepard.原文 ?? '').includes('他向战场走去') &&
      String(clara.原文 ?? '').includes('克拉拉将虎克描述为『第一个好朋友』') &&
      String(clara.原文 ?? '').includes('真正的家人之所在') &&
      String(lynx.原文 ?? '').includes('只有在雪原深处') &&
      String(lynx.原文 ?? '').includes('最后的是那乍现于夜空、跃动不已的璀璨极光') &&
      String(luka.原文 ?? '').includes('只要这世界上还有恶人') &&
      String(natasha.原文 ?? '').includes('我想回下层去，教授') &&
      String(natasha.原文 ?? '').includes('可别死了啊，奥列格') &&
      String(pela.原文 ?? '').includes('佩拉格娅•谢尔盖耶夫娜') &&
      String(pela.原文 ?? '').includes('《雪国冒险奇谭》交流会') &&
      String(sampo.原文 ?? '').includes('波桑女士') &&
      String(seele.原文 ?? '').includes('自那之后，她总会为后来的人留下几口井水') &&
      String(seele.原文 ?? '').includes('她们终会相遇') &&
      String(serval.原文 ?? '').includes('从来都不是任何人的附属品') &&
      String(serval.原文 ?? '').includes('既然末日已经注定，哪有什么真正的乐子可言') &&
      !String(bronya.原文 ?? '').includes('角色等级20') &&
      !String(serval.原文 ?? '').includes('解锁条件'),
    'Belobog provided character story bodies must stay present without unlock conditions.',
  );

  assert(
    String(bronya.原文 ?? '').includes('完整天空') &&
      bronya.关键词?.includes('布洛妮娅完整天空') &&
      String(seele.原文 ?? '').includes('非黑即白') &&
      seele.关键词?.includes('希儿非黑即白') &&
      String(gepard.原文 ?? '').includes('最坚固的盾牌') &&
      gepard.关键词?.includes('杰帕德最坚固的盾牌') &&
      String(serval.原文 ?? '').includes('「永动」机械屋') &&
      serval.关键词?.includes('希露瓦永动机械屋') &&
      String(pela.原文 ?? '').includes('佩拉格娅·谢尔盖耶夫娜') &&
      pela.关键词?.includes('佩拉格娅谢尔盖耶夫娜') &&
      String(natasha.原文 ?? '').includes('地火的核心 / 首领级人物之一') &&
      natasha.关键词?.includes('娜塔莎地火首领') &&
      String(clara.原文 ?? '').includes('垃圾填埋场') &&
      clara.关键词?.includes('克拉拉垃圾填埋场') &&
      String(svarog.原文 ?? '').includes('旧世界遗留下来的自动控制单元') &&
      svarog.关键词?.includes('史瓦罗旧世界遗物') &&
      String(sampo.原文 ?? '').includes('倒货商人') &&
      sampo.关键词?.includes('桑博倒货商人') &&
      String(hook.原文 ?? '').includes('不喜欢被称作“小家伙”') &&
      hook.关键词?.includes('虎克不喜欢小家伙') &&
      String(luka.原文 ?? '').includes('自由格斗家') &&
      luka.关键词?.includes('卢卡自由格斗家') &&
      String(lynx.原文 ?? '').includes('首屈一指的极地探险家') &&
      lynx.关键词?.includes('玲可首屈一指极地探险家') &&
      String(cocolia.原文 ?? '').includes('封锁令') &&
      cocolia.关键词?.includes('可可利亚封锁令'),
    'Belobog profiles-3 refined anchors must stay present.',
  );

  assert(
    String(bronya.原文 ?? '').includes('昨天做噩梦了') &&
      String(bronya.原文 ?? '').includes('克里珀堡清晨') &&
      bronya.关键词?.includes('布洛妮娅日常场景参考') &&
      String(clara.原文 ?? '').includes('可以成为我的家人么') &&
      String(clara.原文 ?? '').includes('机械聚落清晨') &&
      clara.关键词?.includes('克拉拉日常场景参考') &&
      String(gepard.原文 ?? '').includes('遵守誓言是因为相信') &&
      String(gepard.原文 ?? '').includes('城墙巡逻') &&
      gepard.关键词?.includes('杰帕德日常场景参考') &&
      String(hook.原文 ?? '').includes('漆黑的虎克大人') &&
      String(hook.原文 ?? '').includes('鼹鼠党集合') &&
      hook.关键词?.includes('虎克洞洞机语料') &&
      String(lynx.原文 ?? '').includes('其他时间…我都不在') &&
      String(lynx.原文 ?? '').includes('雪原营地') &&
      lynx.关键词?.includes('玲可日常场景参考') &&
      String(luka.原文 ?? '').includes('打击恶棍，守护镇民') &&
      String(luka.原文 ?? '').includes('拳馆训练') &&
      luka.关键词?.includes('卢卡义手语料') &&
      String(pela.原文 ?? '').includes('佩拉格娅•谢尔盖耶夫娜前来报到') &&
      String(pela.原文 ?? '').includes('情报室') &&
      pela.关键词?.includes('佩拉乐队语料') &&
      String(natasha.原文 ?? '').includes('哪里不舒服么') &&
      String(natasha.原文 ?? '').includes('诊所清晨') &&
      natasha.关键词?.includes('娜塔莎药物语料') &&
      String(serval.原文 ?? '').includes('摇滚演出才是我的主业') &&
      String(serval.原文 ?? '').includes('永动机械屋') &&
      serval.关键词?.includes('希露瓦日常场景参考') &&
      String(seele.原文 ?? '').includes('镰刀要磨得够快') &&
      String(seele.原文 ?? '').includes('下层区巡查') &&
      seele.关键词?.includes('希儿地下生活语料') &&
      String(sampo.原文 ?? '').includes('行商、向导、解闷的聊天对象') &&
      String(sampo.原文 ?? '').includes('街角交易') &&
      String(sampo.原文 ?? '').includes('使用边界：花火 / 火花相关语料属于深层阶段参考') &&
      String(sampo.原文 ?? '').includes('不要写成女性') &&
      sampo.关键词?.includes('桑博关于花火') &&
      sampo.关键词?.includes('桑博关于火花'),
    'Belobog profiles-4 corpus and daily-scene references must stay present.',
  );

  assert(
    String(bronya.外貌锚点 ?? '').includes('三束螺旋') &&
      String(bronya.原文 ?? '').includes('雪花耳坠') &&
      bronya.关键词?.includes('布洛妮娅外貌锚点') &&
      String(seele.外貌锚点 ?? '').includes('深靛紫长发') &&
      String(seele.外貌锚点 ?? '').includes('蝴蝶装饰与衣摆') &&
      seele.关键词?.includes('希儿深靛紫长发') &&
      String(gepard.外貌锚点 ?? '').includes('白蓝金铁卫装束') &&
      String(serval.外貌锚点 ?? '').includes('蓝色挑染') &&
      String(pela.外貌锚点 ?? '').includes('圆框眼镜') &&
      String(natasha.外貌锚点 ?? '').includes('腰间小熊') &&
      String(clara.外貌锚点 ?? '').includes('赤脚') &&
      String(svarog.外貌锚点 ?? '').includes('独眼传感器') &&
      String(sampo.外貌锚点 ?? '').includes('薄荷绿猫瞳') &&
      String(hook.外貌锚点 ?? '').includes('乌莎卡帽') &&
      String(luka.外貌锚点 ?? '').includes('推进义手') &&
      String(lynx.外貌锚点 ?? '').includes('猞猁耳形轮廓') &&
      String(cocolia.外貌锚点 ?? '').includes('黑白紫金的礼制轮廓'),
    'Belobog profiles-5 appearance anchors must stay detailed and character-specific.',
  );

  const localOriginProfiles = all.filter((entry) => entry !== sampo);
  assert(
    localOriginProfiles.every((entry) =>
      entry.出身 === '贝洛伯格' &&
        String(entry.原文 ?? '').includes('- 出身：贝洛伯格。'),
    ) &&
      sampo.出身 === '未明；不按贝洛伯格本地人固定，当前以外来 / 可疑商人边界处理' &&
      String(sampo.原文 ?? '').includes('- 出身：未明；不按贝洛伯格本地人固定，当前以外来 / 可疑商人边界处理。'),
    'Belobog profiles-6 origins must mark everyone except Sampo as from Belobog.',
  );

  for (const entry of all) {
    const abilityLayer = String(entry.原文 ?? '').match(/## 能力与职责模块\n\n([\s\S]*?)(?=\n\n## 历史故事与|\n\n## 本回合注入建议)/)?.[1] ?? '';
    assert(
      abilityLayer.includes('解锁状态：') &&
        abilityLayer.includes('使用范围：') &&
        abilityLayer.includes('能力性质：') &&
        abilityLayer.includes('可写表现：') &&
        abilityLayer.includes('职责倾向：') &&
        abilityLayer.includes('非战斗用法：') &&
        abilityLayer.includes('边界：') &&
        abilityLayer.includes('不写成游戏资料卡式命途 / 属性说明') &&
        abilityLayer.length > 300,
      `Belobog profiles-11 ability layer must be expanded and structured: ${entry.标题}`,
    );
  }
  assert(
    String(bronya.原文 ?? '').includes('把混乱局势组织成命令') &&
      String(seele.原文 ?? '').includes('蝴蝶般的残影') &&
      String(gepard.原文 ?? '').includes('盾牌「壁垒」') &&
      String(serval.原文 ?? '').includes('临时修复供能装置') &&
      String(pela.原文 ?? '').includes('让混乱材料变成可执行结论') &&
      String(natasha.原文 ?? '').includes('分诊') &&
      String(clara.原文 ?? '').includes('战斗多由史瓦罗保护 / 支援') &&
      String(svarog.原文 ?? '').includes('传感器锁定目标') &&
      String(sampo.原文 ?? '').includes('假面愚者信息不能在普通早期闲聊里全量摊开') &&
      String(hook.原文 ?? '').includes('洞洞机工具') &&
      String(luka.原文 ?? '').includes('机械义手爆发') &&
      String(lynx.原文 ?? '').includes('气候判断') &&
      String(cocolia.原文 ?? '').includes('主线后主要以回忆、记录、梦境、政治遗留或特殊剧情出现') &&
      !String(clara.原文 ?? '').includes('oversized') &&
      !String(clara.外貌锚点 ?? '').includes('oversized') &&
      String(clara.外貌锚点 ?? '').includes('宽大的红色外套'),
    'Belobog profiles-11 ability anchors and Chinese Clara appearance wording must stay present.',
  );

  for (const entry of all) {
    const corpusLayer = String(entry.原文 ?? '').match(/## 语料层\n\n([\s\S]*?)(?=\n\n## 能力与职责模块)/)?.[1] ?? '';
    assert(!corpusLayer.includes('### 基础语料'), `Belobog corpus UI cards must not be wrapped by 基础语料: ${entry.标题}`);
    assert(!corpusLayer.includes('### 对他人的看法'), `Belobog corpus UI cards must not be wrapped by 对他人的看法: ${entry.标题}`);
    assert(!/^####\s+/mu.test(corpusLayer), `Belobog corpus headings must use UI-visible ### cards: ${entry.标题}`);
  }
  assert(
    String(bronya.原文 ?? '').includes('### 初次见面') &&
      String(bronya.原文 ?? '').includes('### 关于杰帕德') &&
      String(bronya.原文 ?? '').includes('### 日常场景参考') &&
      String(clara.原文 ?? '').includes('### 关于自己•记忆') &&
      String(sampo.原文 ?? '').includes('### 关于花火'),
    'Belobog profiles-7 corpus headings must match the previous per-item card layout.',
  );
}

function assertXianzhouLuofuProfileSet() {
  assert(xianzhouLuofuPreset.id === 'zhiku_xianzhou_luofu_character_rebuild', 'Xianzhou Luofu character preset id changed.');
  assert(xianzhouLuofuPreset.title === '人物重建·罗浮仙舟角色档案', 'Xianzhou Luofu character preset title changed.');
  assert(xianzhouLuofuPreset.updatedAt === '2026-06-18-xianzhou-luofu-story-layer-full-rewrite', 'Xianzhou Luofu character preset updatedAt changed.');

  const profiles = new Map((xianzhouLuofuPreset.entries ?? []).map((entry) => [entry.id, entry]));
  const expected = [
    ['zhiku_character_rebuild_jing_yuan_profile', ['景元', 'Jing Yuan', '神策将军', '罗浮将军']],
    ['zhiku_character_rebuild_yanqing_profile', ['彦卿', 'Yanqing', '云骑少年剑士', '景元徒弟']],
    ['zhiku_character_rebuild_fu_xuan_profile', ['符玄', 'Fu Xuan', '太卜', '符玄太卜司']],
    ['zhiku_character_rebuild_bailu_profile', ['白露', 'Bailu', '衔药龙女', '罗浮龙尊']],
    ['zhiku_character_rebuild_tingyun_profile', ['停云', 'Tingyun', '鸣火商团接渡使', '狐人接渡使']],
    ['zhiku_character_rebuild_lingsha_profile', ['灵砂', 'Lingsha', '丹鼎司丹士长', '浮元']],
    ['zhiku_character_rebuild_yukong_profile', ['驭空', 'Yukong', '天舶司司舵', '飞行士前辈']],
    ['zhiku_character_rebuild_qingque_profile', ['青雀', 'Qingque', '太卜司卜者', '琼玉牌摸鱼人']],
    ['zhiku_character_rebuild_luocha_profile', ['罗刹', 'Luocha', '金发行商', '棺柩行商']],
    ['zhiku_character_rebuild_jingliu_profile', ['镜流', 'Jingliu', '前代剑首', '景元师父']],
    ['zhiku_character_rebuild_guinaifen_profile', ['桂乃芬', 'Guinaifen', '小桂子', '罗浮杂俎主播']],
    ['zhiku_character_rebuild_sushang_profile', ['素裳', 'Sushang', '云骑新人', '桂乃芬好友']],
    ['zhiku_character_rebuild_huohuo_profile', ['藿藿', 'Huohuo', '藿藿十王司判官', '尾巴大爷']],
    ['zhiku_character_rebuild_hanya_profile', ['寒鸦', 'Hanya', '寒鸦十王司判官', '雪衣妹妹']],
    ['zhiku_character_rebuild_xueyi_profile', ['雪衣', 'Xueyi', '雪衣十王司判官', '寒鸦姐姐']],
  ];
  assert(profiles.size === expected.length, 'Xianzhou Luofu preset must contain exactly the first-pass Luofu profiles.');
  for (const [id, triggers] of expected) {
    const entry = profiles.get(id);
    assert(entry, `Xianzhou Luofu profile missing: ${id}`);
    assert(entry.分类 === 'character' && entry.资料类型 === '单角色档案', `Xianzhou Luofu profile must stay character anchor: ${id}`);
    assert(entry.关键词?.includes('资料大区:罗浮仙舟') && entry.关键词?.includes('节点:单角色档案'), `Xianzhou Luofu profile missing grouping keywords: ${id}`);
    assertCoreTriggers(entry, triggers, `Xianzhou Luofu ${entry.标题} profile`);
    assert(!/^####\s+/mu.test(String(entry.原文 ?? '')), `Xianzhou Luofu profile headings must not use ####: ${entry.标题}`);
  }
  const originAppearanceChecks = [
    ['zhiku_character_rebuild_jing_yuan_profile', ['地衡司'], ['泪痣', '神君'], ['景元出身地衡司家族', '景元白发金瞳泪痣']],
    ['zhiku_character_rebuild_yanqing_profile', ['未明', '家系血脉栏留白'], ['浅金长发', '飞剑'], ['彦卿出身未明', '彦卿家系血脉付之阙如']],
    ['zhiku_character_rebuild_fu_xuan_profile', ['玉阙仙舟', '观星士世家'], ['法眼', '小身形压住大阵局'], ['符玄出身玉阙', '符玄观星士世家']],
    ['zhiku_character_rebuild_bailu_profile', ['罗浮持明族', '龙尊'], ['龙角', '龙尾'], ['白露出身罗浮持明', '白露龙角龙尾']],
    ['zhiku_character_rebuild_tingyun_profile', ['罗浮狐人家庭', '天舶司任武备士'], ['狐耳', '聚骨扇'], ['停云出身罗浮狐人家庭', '停云父母天舶司武备士']],
    ['zhiku_character_rebuild_lingsha_profile', ['罗浮持明族', '丹朱', '朱明一脉'], ['深棕长发', '香炉', '浮元'], ['灵砂出身罗浮持明', '灵砂丹朱旧名', '灵砂朱明求学']],
    ['zhiku_character_rebuild_yukong_profile', ['罗浮狐人', '星槎驾驶天赋'], ['深青黑长发', '纸鸢'], ['驭空出身罗浮狐人', '驭空星槎驾驶天赋']],
    ['zhiku_character_rebuild_qingque_profile', ['罗浮仙舟本地家庭', '父母期待'], ['灰茶短发', '琼玉牌'], ['青雀出身罗浮本地家庭', '青雀灰茶短发']],
    ['zhiku_character_rebuild_luocha_profile', ['域外未明', '恶魔', '教会'], ['金色长发', '棺柩'], ['罗刹出身域外未明', '罗刹棺柩外貌']],
    ['zhiku_character_rebuild_jingliu_profile', ['苍城仙舟幸存者', '罗睺灾厄'], ['银白长发', '黑纱遮眼'], ['镜流出身苍城', '镜流银白长发黑纱遮眼']],
    ['zhiku_character_rebuild_guinaifen_profile', ['域外卡美洛', '格妮薇儿', '洪堡特-σ'], ['红橙长发', '直播'], ['桂乃芬出身卡美洛', '桂乃芬本名格妮薇儿']],
    ['zhiku_character_rebuild_sushang_profile', ['曜青出身', '不能写成罗浮本地人'], ['棕色长发', '黄色大蝴蝶结', '轩辕重剑'], ['素裳出身曜青', '素裳非罗浮本地人']],
    ['zhiku_character_rebuild_huohuo_profile', ['罗浮狐人', '尾巴'], ['浅绿短发', '符纸'], ['藿藿出身罗浮狐人', '藿藿尾巴岁阳']],
    ['zhiku_character_rebuild_hanya_profile', ['旧身出身未明', '苍城', '罗睺'], ['银蓝长发', '冥谶天笔'], ['寒鸦旧身出身未明', '寒鸦银蓝长发角饰']],
    ['zhiku_character_rebuild_xueyi_profile', ['旧身出身未明', '偃偶身躯还阳'], ['深褐近黑短发', '铁索', '破魔锥'], ['雪衣旧身出身未明', '雪衣偃偶身还阳']],
  ];
  for (const [id, originAnchors, appearanceAnchors, keywordAnchors] of originAppearanceChecks) {
    const entry = profiles.get(id);
    const source = String(entry?.原文 ?? '');
    const origin = String(entry?.出身 ?? '');
    const appearance = String(entry?.外貌锚点 ?? '');
    const haystack = `${source}\n${origin}\n${appearance}`;
    assert(origin.length >= 20, `Xianzhou Luofu profile origin must be specific rather than a label: ${entry?.标题 ?? id}`);
    assert(appearance.length >= 60, `Xianzhou Luofu profile appearance must be detailed rather than a short tag list: ${entry?.标题 ?? id}`);
    assert(source.includes('- 出身：') && source.includes('- 外貌锚点：'), `Xianzhou Luofu profile base identity must expose origin and appearance: ${entry?.标题 ?? id}`);
    assert(source.includes('- 出身锚点：') && source.includes('- 视觉锚点：'), `Xianzhou Luofu profile expression layer must expose origin and visual anchors: ${entry?.标题 ?? id}`);
    assert(source.includes('## 可写表现') && source.includes(`- 外貌：${appearance}`), `Xianzhou Luofu profile writable layer must use refined appearance: ${entry?.标题 ?? id}`);
    assert(!source.includes('官方未公开') && !source.includes('官方资料'), `Xianzhou Luofu profile must not use official-source wording: ${entry?.标题 ?? id}`);
    for (const anchor of originAnchors) {
      assert(haystack.includes(anchor), `Xianzhou Luofu profile origin missing anchor ${anchor}: ${entry?.标题 ?? id}`);
    }
    for (const anchor of appearanceAnchors) {
      assert(haystack.includes(anchor), `Xianzhou Luofu profile appearance missing anchor ${anchor}: ${entry?.标题 ?? id}`);
    }
    for (const keyword of keywordAnchors) {
      assert(entry?.关键词?.includes(keyword), `Xianzhou Luofu profile missing strict origin/appearance keyword ${keyword}: ${entry?.标题 ?? id}`);
    }
  }
  const serializedAppearance = JSON.stringify(xianzhouLuofuPreset);
  assert(
    !serializedAppearance.includes('素裳粉发') &&
      !serializedAppearance.includes('粉发、云骑装束、大剑') &&
      !serializedAppearance.includes('青雀绿发') &&
      !serializedAppearance.includes('灵砂粉发') &&
      !serializedAppearance.includes('外貌锚点：粉发、小巧身形'),
    'Xianzhou Luofu profiles-8 appearance anchors must not regress to short or inaccurate tag labels.',
  );
  for (const entry of xianzhouLuofuPreset.entries ?? []) {
    assertNoBareKeywords(
      entry,
      ['罗浮仙舟', '仙舟联盟', '云骑军', '太卜司', '天舶司', '十王司', '丹鼎司', '持明族', '狐人', '学宫', '将军', '判官', '剑士', '医生', '医者', '行商', '摸鱼', '罗浮杂俎'],
      `Xianzhou Luofu ${entry.标题} profile`,
    );
    const source = String(entry.原文 ?? '');
    const storyLayer = source.match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 语料层)/)?.[1] ?? '';
    const storySectionsInLayer = (storyLayer.match(/^### /gm) ?? []).length;
    assert(
      source.includes('## 角色详情') &&
        source.includes('## 角色故事层') &&
        source.includes('## 语料层') &&
        source.includes('## 可写表现') &&
        source.includes('## 写法收束') &&
        storyLayer.length >= 600 &&
        storySectionsInLayer === 5 &&
        storyLayer.includes('### 写法指导') &&
        !source.includes('角色等级') &&
        !source.includes('解锁条件'),
      `Xianzhou Luofu ${entry.标题} profile must keep expanded refined story/corpus layers with 写法指导 section, without unlock-condition wording.`,
    );
  }
  const bailu = profiles.get('zhiku_character_rebuild_bailu_profile');
  const bailuText = String(bailu?.原文 ?? '');
  assert(
    bailuText.includes('## 角色故事层') &&
      bailuText.includes('### 丹鼎司医案：狐人巧克力中毒') &&
      bailuText.includes('### 丹鼎司医案：持明蜕生异症') &&
      bailuText.includes('### 丹鼎司医案：景元例行复诊') &&
      bailuText.includes('### 龙师诊察：无梦、龙心与尺木缚锁') &&
      bailuText.includes('多喝热水') &&
      bailuText.includes('睡一觉就好了') &&
      bailuText.includes('治病时常闭着眼睛') &&
      bailuText.includes('龙心有损') &&
      bailuText.includes('尺木缚锁') &&
      !bailuText.includes('角色等级') &&
      !bailuText.includes('解锁条件') &&
      bailu?.关键词?.includes('白露丹鼎司医案') &&
      bailu?.关键词?.includes('白露多喝热水') &&
      bailu?.关键词?.includes('白露尺木缚锁') &&
      bailu?.关键词?.includes('丹鼎司宽词不自动召回白露') &&
      !bailu?.关键词?.includes('丹鼎司') &&
      !bailu?.关键词?.includes('持明族') &&
      !bailu?.关键词?.includes('医生'),
    'Bailu profiles-2 must keep refined medical-case story anchors without level locks or broad naked keywords.',
  );
  const requiredStoryAnchors = [
    ['zhiku_character_rebuild_jing_yuan_profile', ['景元星阵棋', '景元傀儡蛸', '景元云上五骁', '星阵棋与符卿']],
    ['zhiku_character_rebuild_yanqing_profile', ['彦卿六柄飞剑', '彦卿防风', '彦卿剑首之梦', '第一百二十三回对阵']],
    ['zhiku_character_rebuild_fu_xuan_profile', ['符玄第三眼', '符玄玉阙业师', '符玄瞰云镜', '图书馆、盲眼老人和第三眼']],
    ['zhiku_character_rebuild_tingyun_profile', ['停云不夜侯谈判', '停云海市', '停云六骨叠扇', '停云另一种使舵']],
    ['zhiku_character_rebuild_lingsha_profile', ['灵砂云华师父', '灵砂阴谋气味', '灵砂金鳞燃犀', '回任司鼎与丹鼎司积弊']],
    ['zhiku_character_rebuild_yukong_profile', ['驭空不良少女', '驭空战友承诺', '驭空纸鸢', '驭空最后一次奋飞']],
    ['zhiku_character_rebuild_qingque_profile', ['青雀六十分', '青雀帝垣琼玉', '青雀快乐工作基本法则', '不主动、不拒绝、不负责']],
    ['zhiku_character_rebuild_luocha_profile', ['罗刹入境承诺', '罗刹故乡服饰', '罗刹巨大棺椁', '罗刹另一个誓言']],
    ['zhiku_character_rebuild_jingliu_profile', ['镜流苍城', '镜流第一柄剑', '镜流饮月之乱', '镜流斩星之愿']],
    ['zhiku_character_rebuild_guinaifen_profile', ['桂乃芬格妮薇儿', '桂乃芬直播间', '桂乃芬卡美洛', '桂乃芬石墙叔叔', '桂乃芬素裳共演']],
    ['zhiku_character_rebuild_sushang_profile', ['素裳玉界入境', '素裳桂乃芬初遇', '素裳独霸一面', '素裳母亲回信']],
    ['zhiku_character_rebuild_huohuo_profile', ['藿藿尾巴岁阳', '藿藿贞凶之命', '藿藿科学驱魔道具', '藿藿升任判官']],
    ['zhiku_character_rebuild_hanya_profile', ['寒鸦冥谶天笔', '寒鸦忘川酒', '寒鸦罗睺旧梦', '寒鸦雪衣守棺']],
    ['zhiku_character_rebuild_xueyi_profile', ['雪衣偃偶身躯', '雪衣藿藿重修', '雪衣倏忽旧梦', '雪衣同情心打碎']],
  ];
  for (const [id, anchors] of requiredStoryAnchors) {
    const entry = profiles.get(id);
    const haystack = `${String(entry?.原文 ?? '')}\n${(entry?.关键词 ?? []).join('\n')}`;
    for (const anchor of anchors) {
      assert(haystack.includes(anchor), `Xianzhou Luofu refined profile missing story anchor ${anchor}: ${entry?.标题 ?? id}`);
    }
  }
  const fuXuan = profiles.get('zhiku_character_rebuild_fu_xuan_profile');
  const fuXuanSource = String(fuXuan?.原文 ?? '');
  assert(
    fuXuanSource.includes('## 常驻事实层') &&
      fuXuanSource.includes('## 表现锚点层') &&
      fuXuanSource.includes('## 能力与职责模块') &&
      fuXuanSource.includes('## 历史故事与阶段边界层') &&
      fuXuanSource.includes('看见命运，不等于向命运低头') &&
      fuXuanSource.includes('我看见坏结果后仍要负责选择') &&
      fuXuanSource.includes('卜算不能写成绝对正确') &&
      fuXuan?.关键词?.includes('符玄完整档案') &&
      fuXuan?.关键词?.includes('符玄知命不认命') &&
      !fuXuan?.关键词?.includes('太卜司') &&
      !fuXuan?.关键词?.includes('穷观阵'),
    'Fu Xuan profile must be upgraded to the full refined profile shape with strict triggers.',
  );
  const fullProfileChecks = [
    ['zhiku_character_rebuild_jing_yuan_profile', '景元完整档案', ['景元闭目将军', '景元长线谋局']],
    ['zhiku_character_rebuild_yanqing_profile', '彦卿完整档案', ['彦卿过刚易折', '彦卿剑鞘边界']],
    ['zhiku_character_rebuild_fu_xuan_profile', '符玄完整档案', ['看见命运，不等于向命运低头', '卜算不能写成绝对正确']],
    ['zhiku_character_rebuild_bailu_profile', '白露完整档案', ['白露龙尊束缚', '治疗能力不能无代价复活']],
    ['zhiku_character_rebuild_tingyun_profile', '停云完整档案', ['停云真停云边界', '语言、贸易和互利也能成为一种使舵']],
    ['zhiku_character_rebuild_lingsha_profile', '灵砂完整档案', ['灵砂本名丹朱', '她不是没有脾气']],
    ['zhiku_character_rebuild_yukong_profile', '驭空完整档案', ['驭空二百四十六岁', '她不是不想回到天空']],
    ['zhiku_character_rebuild_qingque_profile', '青雀完整档案', ['青雀精准六十分', '青雀职场哲学']],
    ['zhiku_character_rebuild_luocha_profile', '罗刹完整档案', ['罗刹温和不透明', '罗刹誓言边界']],
    ['zhiku_character_rebuild_jingliu_profile', '镜流完整档案', ['镜流斩神执念', '镜流苍城创伤']],
    ['zhiku_character_rebuild_guinaifen_profile', '桂乃芬完整档案', ['桂乃芬失国流亡', '桂乃芬新人生']],
    ['zhiku_character_rebuild_sushang_profile', '素裳完整档案', ['素裳独当一面', '素裳热心新人']],
    ['zhiku_character_rebuild_huohuo_profile', '藿藿完整档案', ['藿藿怕鬼捉鬼', '藿藿尾巴共生']],
    ['zhiku_character_rebuild_hanya_profile', '寒鸦完整档案', ['寒鸦问字判官', '寒鸦忘川边界']],
    ['zhiku_character_rebuild_xueyi_profile', '雪衣完整档案', ['雪衣拘字判官', '雪衣偃偶还阳']],
  ];
  for (const [id, fullKeyword, textAnchors] of fullProfileChecks) {
    const entry = profiles.get(id);
    const source = String(entry?.原文 ?? '');
    assert(
      source.includes('## 常驻事实层') &&
        source.includes('## 人物底色') &&
        source.includes('## 表现锚点层') &&
        source.includes('## 能力与职责模块') &&
        source.includes('## 历史故事与阶段边界层') &&
        entry?.关键词?.includes(fullKeyword) &&
        entry?.关键词?.some((keyword) => keyword.endsWith('常驻事实层')) &&
        entry?.关键词?.some((keyword) => keyword.endsWith('能力职责模块')) &&
        entry?.关键词?.some((keyword) => keyword.endsWith('阶段边界')) &&
        textAnchors.every((anchor) => `${source}\n${(entry?.关键词 ?? []).join('\n')}`.includes(anchor)),
      `Xianzhou Luofu ${entry?.标题 ?? id} must keep profiles-8 full-profile skeleton and refined anchors.`,
    );
  }

  // 语料层断言：罗浮全员必须有完整语料层
  for (const [id] of expected) {
    const entry = profiles.get(id);
    const source = String(entry?.原文 ?? '');
    assert(
      source.includes('## 语料层') &&
        source.includes('语料只作口吻参考') &&
        source.includes('### 初次见面') &&
        source.includes('### 日常场景参考') &&
        !source.includes('### 口吻锚点'),
      `Xianzhou Luofu ${entry?.标题 ?? id} must have refined corpus layer with official voice lines and daily scene references, not legacy abstract description.`,
    );
  }

  const serialized = JSON.stringify(xianzhouLuofuPreset);
  assert(serialized.includes('灵砂') && serialized.includes('丹鼎司丹士长') && serialized.includes('灵砂浮元'), 'Xianzhou Luofu preset must include Lingsha as a Luofu Alchemy Commission profile.');
  // 排除断言只检查角色条目标题和关联角色ID，不检查语料中提及的其他仙舟角色名
  for (const excluded of ['云璃', '飞霄', '椒丘', '貊泽', '怀炎']) {
    const hasExcludedEntry = (xianzhouLuofuPreset.entries ?? []).some(
      (entry) => entry.标题 === excluded || entry.关联角色ID === excluded,
    );
    assert(!hasExcludedEntry, `Xianzhou Luofu preset must not include other-ship character as entry: ${excluded}`);
  }
  for (const excluded of ['朱明仙舟', '曜青仙舟']) {
    const hasExcludedEntry = (xianzhouLuofuPreset.entries ?? []).some(
      (entry) => entry.标题 === excluded || entry.关联角色ID === excluded,
    );
    assert(!hasExcludedEntry, `Xianzhou Luofu preset must not include other-ship faction as entry: ${excluded}`);
  }
}

function assertIpcProfileSet() {
  assert(ipcPreset.id === 'zhiku_interastral_peace_corporation_character_rebuild', 'IPC preset id changed.');
  assert(ipcPreset.title === '人物重建·星际和平公司角色档案', 'IPC preset title changed.');
  assert(ipcPreset.updatedAt === '2026-06-18-ipc-character-profiles-1', 'IPC preset updatedAt changed.');

  const profiles = new Map((ipcPreset.entries ?? []).map((entry) => [entry.id, entry]));
  const expected = [
    ['zhiku_character_rebuild_topaz_profile', ['托帕', 'Topaz', '债务收割人', '账账搭档']],
    ['zhiku_character_rebuild_aventurine_profile', ['砂金', 'Aventurine', '石心十人砂金', '卡卡瓦卡']],
    ['zhiku_character_rebuild_jade_profile', ['翡翠', 'Jade', '石心十人翡翠', '公司收藏家']],
  ];
  assert(profiles.size === expected.length, `IPC preset must have ${expected.length} entries, got ${profiles.size}`);

  for (const [id, triggers] of expected) {
    const entry = profiles.get(id);
    assert(entry, `IPC profile ${id} must exist.`);
    assert(entry.分类 === 'character', `IPC ${entry.标题} must be character type.`);
    assert(entry.关键词?.includes('资料大区:星际和平公司'), `IPC ${entry.标题} must have 资料大区:星际和平公司.`);
    assert(entry.关键词?.includes('节点:单角色档案'), `IPC ${entry.标题} must have 节点:单角色档案.`);
    // Verify core trigger keywords exist (not using assertCoreTriggers since IPC entries don't have 核心触发词 in 原文)
    for (const trigger of triggers) {
      const hasKeyword = entry.关键词?.some(k => k.includes(trigger)) || String(entry.原文 ?? '').includes(trigger);
      assert(hasKeyword, `IPC ${entry.标题} must have trigger keyword or text for '${trigger}'.`);
    }
    assertNoBareKeywords(entry, ['星际和平公司', '公司', '战略投资部', '石心十人', '存护', '债务', '催收', '赌局'], `IPC ${entry.标题}`);
  }

  // Per-entry structural checks
  for (const entry of ipcPreset.entries ?? []) {
    const source = String(entry.原文 ?? '');
    const storyLayer = source.match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 表现锚点层)/)?.[1] ?? '';

    assert(source.includes('## 常驻事实层'), `IPC ${entry.标题} must have 常驻事实层.`);
    assert(source.includes('## 人物底色'), `IPC ${entry.标题} must have 人物底色.`);
    assert(source.includes('## 角色故事层'), `IPC ${entry.标题} must have 角色故事层.`);
    assert(source.includes('## 表现锚点层'), `IPC ${entry.标题} must have 表现锚点层.`);
    assert(source.includes('## 语料层'), `IPC ${entry.标题} must have 语料层.`);
    assert(source.includes('## 能力与职责模块'), `IPC ${entry.标题} must have 能力与职责模块.`);
    assert(source.includes('## 历史故事与阶段边界层'), `IPC ${entry.标题} must have 历史故事与阶段边界层.`);
    assert(storyLayer.length >= 600, `IPC ${entry.标题} story layer must be >= 600 chars, got ${storyLayer.length}.`);
    assert((storyLayer.match(/^### /gm) ?? []).length === 5, `IPC ${entry.标题} story layer must have 5 ### sections (4 stories + 写法指导).`);
    assert(storyLayer.includes('### 写法指导'), `IPC ${entry.标题} story layer must have ### 写法指导.`);
    assert(!source.includes('角色等级'), `IPC ${entry.标题} must not have 角色等级.`);
    assert(!source.includes('解锁条件'), `IPC ${entry.标题} must not have 解锁条件.`);
    assert(typeof entry.出身 === 'string' && entry.出身.length >= 20, `IPC ${entry.标题} must have 出身 >= 20 chars.`);
    assert(typeof entry.外貌锚点 === 'string' && entry.外貌锚点.length >= 60, `IPC ${entry.标题} must have 外貌锚点 >= 60 chars.`);
    for (const field of ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写']) {
      assert(typeof entry[field] === 'string' && entry[field].length >= 20, `IPC ${entry.标题} must have ${field} >= 20 chars.`);
    }
  }

  // 托帕 specific: has corpus
  const topaz = profiles.get('zhiku_character_rebuild_topaz_profile');
  assert(topaz?.资料类型 === '单角色档案', '托帕 must be 单角色档案.');
  assert(topaz?.关键词?.includes('语料只作参考'), '托帕 must have 语料只作参考.');
  assert(topaz?.关键词?.includes('禁止照抄语料'), '托帕 must have 禁止照抄语料.');
  assert(String(topaz?.原文 ?? '').includes('语料只作口吻参考'), '托帕 原文 must have 语料只作口吻参考.');

  // 砂金 specific: has corpus
  const aventurine = profiles.get('zhiku_character_rebuild_aventurine_profile');
  assert(aventurine?.资料类型 === '单角色档案', '砂金 must be 单角色档案.');
  assert(aventurine?.关键词?.includes('语料只作参考'), '砂金 must have 语料只作参考.');
  assert(aventurine?.关键词?.includes('禁止照抄语料'), '砂金 must have 禁止照抄语料.');
  assert(String(aventurine?.原文 ?? '').includes('语料只作口吻参考'), '砂金 原文 must have 语料只作口吻参考.');

  // 翡翠 specific: locked, 剧情门禁, no corpus
  const jade = profiles.get('zhiku_character_rebuild_jade_profile');
  assert(jade?.资料类型 === '剧情门禁', '翡翠 must be 剧情门禁.');
  assert(jade?.解锁状态 === '未解锁', '翡翠 must be 未解锁.');
  assert(jade?.解锁条件, '翡翠 must have 解锁条件.');
  assert(jade?.关键词?.includes('暂无语料'), '翡翠 must have 暂无语料.');
  assert(jade?.关键词?.includes('翡翠暂不提供语料'), '翡翠 must have 翡翠暂不提供语料.');
  assert(!jade?.关键词?.includes('语料只作参考'), '翡翠 must NOT have 语料只作参考.');

  // Registration integration
  assert(preset.includes('interastral-peace-corporation-character-rebuild.json'), 'zhikuPreset.ts must reference IPC preset file.');
  assert(preset.includes('zhiku_interastral_peace_corporation_character_rebuild'), 'zhikuPreset.ts must have IPC preset id.');
  assert(preset.includes('2026-06-18-ipc-character-profiles-1'), 'zhikuPreset.ts must have IPC preset updatedAt.');
}

const removedCharacterPresetPaths = [
  'express-characters.json',
  'express-support-characters.json',
  'herta-station-characters.json',
  'xianzhou-luofu-characters.json',
  'xianzhou-alliance-characters.json',
  'jarilo-vi-characters.json',
  'penacony-characters.json',
  'amphoreus-characters.json',
  'faction-characters.json',
  'genius-society-characters.json',
];

for (const path of removedCharacterPresetPaths) {
  assert(!preset.includes(path), `legacy character preset must not be bundled: ${path}`);
}

assert(
    preset.includes('character-rebuild-core.json') &&
      preset.includes('stellaron-hunters-character-rebuild.json') &&
      preset.includes('zhiku_stellaron_hunters_character_rebuild') &&
      preset.indexOf('character-rebuild-core.json') < preset.indexOf('stellaron-hunters-character-rebuild.json') &&
      preset.indexOf('stellaron-hunters-character-rebuild.json') < preset.indexOf('herta-station-character-rebuild.json') &&
      preset.includes('herta-station-character-rebuild.json') &&
      preset.includes('zhiku_herta_station_character_rebuild') &&
      preset.indexOf('herta-station-character-rebuild.json') < preset.indexOf('genius-society-character-rebuild.json') &&
      preset.includes('genius-society-character-rebuild.json') &&
      preset.includes('zhiku_genius_society_character_rebuild') &&
      preset.indexOf('genius-society-character-rebuild.json') < preset.indexOf('belobog-character-rebuild.json') &&
      preset.includes('intelligentsia-guild-character-rebuild.json') &&
      preset.includes('zhiku_intelligentsia_guild_character_rebuild') &&
      preset.indexOf('genius-society-character-rebuild.json') < preset.indexOf('intelligentsia-guild-character-rebuild.json') &&
      preset.indexOf('intelligentsia-guild-character-rebuild.json') < preset.indexOf('belobog-character-rebuild.json') &&
      preset.includes('belobog-character-rebuild.json') &&
      preset.includes('zhiku_belobog_character_rebuild') &&
      preset.indexOf('belobog-character-rebuild.json') < preset.indexOf('xianzhou-luofu-character-rebuild.json') &&
      preset.includes('xianzhou-luofu-character-rebuild.json') &&
      preset.includes('zhiku_xianzhou_luofu_character_rebuild') &&
      preset.includes('2026-06-10-genius-society-character-profiles-8') &&
      preset.includes('2026-06-10-intelligentsia-guild-character-profiles-3') &&
      preset.includes('2026-06-10-belobog-character-profiles-15') &&
      preset.includes('2026-06-18-xianzhou-luofu-story-layer-full-rewrite') &&
    preset.includes('2026-06-09-stellaron-hunters-character-profiles-11') &&
    preset.includes('2026-06-08-herta-station-character-profiles-12') &&
    preset.includes('updatedAt') &&
    preset.includes('encodeURIComponent(preset.updatedAt ?? preset.id)') &&
    preset.includes('cacheBust') &&
    preset.includes('&r=') &&
    preset.includes("entry.分类 === 'character'") &&
    preset.includes('系列序号: entry.系列序号 || seriesOrder') &&
    preset.includes('ZHIKU_CHARACTER_REBUILD_ENTRY_ID_PREFIX') &&
    preset.includes('isRebuiltZhikuCharacterEntry') &&
    preset.includes("entry.分类 !== 'character' || isRebuiltZhikuCharacterEntry(entry)"),
  'rebuilt character preset must be explicitly allowed while legacy character presets stay filtered.',
);
assertStellaronHuntersProfileSet();
assertHertaStationProfileSet();
assertGeniusSocietyProfileSet();
assertIntelligentsiaGuildProfileSet();
assertBelobogProfileSet();
assertXianzhouLuofuProfileSet();
assertIpcProfileSet();
assert(
  panel.includes('groupOrder?: number') &&
    panel.includes('order?: number') &&
    panel.includes('groupOrder: entry.系列序号') &&
    panel.includes('order: profile.groupOrder') &&
    panel.includes('function compareCharacterGroups') &&
    panel.includes('if (orderA !== orderB) return orderA - orderB'),
  'Zhiku character group navigation must sort rebuilt preset groups by bundled series order.',
);
assert(
  model.includes('export interface 智库软结构标签') &&
    model.includes('解析智库软结构标签') &&
    model.includes('获取智库人物名') &&
    model.includes('获取智库人物名列表') &&
    model.includes('获取智库核心触发词') &&
    model.includes('获取智库人物节点标题') &&
    model.includes('比较智库人物节点') &&
    model.includes("['角色', '人物', '归属角色'].includes(tag.key)") &&
    model.includes('if (explicitRole) names.push(explicitRole)') &&
    model.includes('角色ID') &&
    model.includes('资料类型?: string') &&
    model.includes('关联角色ID?: string') &&
    model.includes('关联形态ID?: string') &&
    model.includes('解锁状态') &&
    model.includes('运行时解锁状态') &&
    model.includes('normalizeOptionalText(entry.运行时解锁状态) ?? normalizeOptionalText(entry.解锁状态)') &&
    model.includes('剧透等级') &&
    model.includes('使用范围') &&
    ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写'].every((field) => model.includes(`${field}?: string`)) &&
    model.includes('可否主剧情注入?: boolean') &&
    model.includes('normalizeTextList(entry.使用范围)') &&
    model.includes('normalizeOptionalText(entry.外貌锚点)') &&
    model.includes('normalizeOptionalText(entry.禁止误写)') &&
    model.includes('normalizeOptionalText(entry.资料类型) ?? getFirst'),
  'zhiku model must expose structured character fields while keeping soft tag parsing fallback.',
);
assert(
  preset.includes('shouldRemoveLegacyZhikuCharacterEntry') &&
    preset.includes('removeLegacyZhikuCharacterEntries') &&
    preset.includes('ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY'),
  'zhiku character rebuild migration helpers must exist.',
);
assert(
  preset.includes('removeLegacyZhikuCharacterEntries(') &&
    state.includes('ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY') &&
    state.includes('hydrateRuntimeZhiku(savedZhiku, { migrationAt })'),
  'startup zhiku merge must remove legacy character entries from saved local data.',
);
assert(
  preset.includes('removeLegacyZhikuCharacterEntries(') &&
    preset.includes('hydrateRuntimeZhiku') &&
    saveLoad.includes('hydrateRuntimeZhiku(save.智库') &&
    saveLoad.includes('await saveToRuntime(save'),
  'loading an old save must not restore legacy character entries into active zhiku.',
);
assert(
    saveLoad.includes('hydrateRuntimeZhiku') &&
    preset.includes('loadAllBundledZhikuPresets') &&
    preset.includes('mergeBundledZhikuSystem') &&
    preset.includes('mergeZhikuRuntimeUnlockOverrides') &&
    preset.includes('isBundledZhikuDuplicate') &&
    saveLoad.includes('hydrateRuntimeZhiku(save.智库') &&
    preset.includes('!entry.builtin && !isBundledZhikuDuplicate(entry)'),
  'loading a save must merge current bundled zhiku presets, including rebuilt character personas, with save custom entries.',
);
assert(
  preset.includes('mergeZhikuRuntimeUnlockOverrides') &&
    preset.includes('mergeBundledZhikuSystem') &&
    preset.includes('!entry.builtin && !isBundledZhikuDuplicate(entry)') &&
    preset.includes('运行时解锁状态') &&
    preset.includes('运行时解锁备注'),
  'bundled zhiku merge must preserve runtime unlock overrides and custom entries from local saves.',
);
assert(
  preset.includes('buildPersistedZhikuSystem') &&
    preset.includes('!entry.builtin || Boolean(entry.运行时解锁状态 || entry.运行时解锁备注)') &&
    preset.includes('摘要:') &&
    preset.includes('原文:') &&
    preset.includes('关键词: []'),
  'zhiku persistence must store only custom entries and lightweight builtin runtime unlock overrides.',
);
assert(
  state.includes('buildPersistedZhikuSystem') &&
    state.includes('hydrateRuntimeZhiku(savedZhiku, { migrationAt })') &&
    state.includes("await setPreference('zhikuSystem', buildPersistedZhikuSystem(mergedZhiku))") &&
    saveLoad.includes('buildPersistedZhikuSystem') &&
    saveLoad.includes('hydrateRuntimeZhiku(save.智库') &&
    saveLoad.includes('智库: buildPersistedZhikuSystem(runtime.智库)') &&
    panel.includes("await setPreference('zhikuSystem', buildPersistedZhikuSystem(next))"),
  'all zhiku save paths must persist a slim zhiku payload instead of the full bundled library.',
);
assert(
  panel.includes('isDevBuild') &&
    panel.includes('DEV 刷新内置智库') &&
    panel.includes('handleDevRefreshBundled') &&
    panel.includes('loadAllBundledZhikuPresets({ cacheBust: Date.now() })') &&
    panel.includes('mergeBundledZhikuSystem(bundled, normalized, migrationAt)') &&
    panel.includes('setDevRefreshStatus') &&
    panel.includes('保留自制条目与运行时解锁备注'),
  'Zhiku panel must expose a dev-only bundled preset refresh button that preserves custom entries and runtime unlock notes.',
);
assert(
    retrieval.includes('解析智库软结构标签') &&
    retrieval.includes('获取智库人物名列表') &&
    retrieval.includes('获取智库核心触发词') &&
    retrieval.includes('buildCharacterTriggerCandidates') &&
    retrieval.includes('const aliasTriggers = extractCharacterAliasTriggers(entry)') &&
    retrieval.includes('const coreTriggers = 获取智库核心触发词(entry)') &&
    retrieval.includes('...coreTriggers') &&
    retrieval.includes('比较智库人物节点') &&
    retrieval.includes('buildCharacterAnchorEntries') &&
    retrieval.includes('单角色档案|角色档案|人物档案') &&
    retrieval.includes('isMainStoryInjectableZhikuEntry'),
  'zhiku retrieval must understand rebuilt character soft-structure nodes.',
);
assert(
  retrieval.includes('sceneContext?.npcNames') &&
    !retrieval.includes('ZHIKU_SCENE_CHARACTER_HINTS') &&
    retrieval.includes('buildCharacterDetectionText') &&
    retrieval.includes('当前地点|当前相关人物|最近玩家输入|剧情规划|事件|小结') &&
    retrieval.includes('黑塔空间站') &&
    retrieval.includes('空间站[「“"]?黑塔') &&
    retrieval.includes('主体|OOC|风险') &&
    retrieval.includes('人物主体人格用于校准口吻与行为边界') &&
    retrieval.includes('外貌、性格、说话方式、行为习惯、关系边界与禁止误写字段是角色表现的优先锚点') &&
    retrieval.includes('presentNpcNamesForFallback?: string[]') &&
    retrieval.includes('buildPresentCharacterFallbackEntries') &&
    retrieval.includes('该通道不参与关键词触发') &&
    retrieval.includes('最终会与关键词命中角色按资料 ID 去重') &&
    retrieval.includes('getZhikuCharacterCalibrationText(entry)') &&
    retrieval.includes('formatZhikuCharacterCalibrationBrief(entry') &&
    retrieval.includes('calibrationText.includes(q)') &&
    retrieval.includes('calibrationText.includes(term)') &&
    retrieval.includes('性格锚点：') &&
    retrieval.includes('说话方式：') &&
    ['外貌：', '性格：', '口吻：', '行为：', '关系边界：', '禁止误写：'].every((label) => retrieval.includes(label)),
  'zhiku retrieval must prioritize explicit in-scene character persona anchors without using scene-default character fallback.',
);
assert(
  systemPromptBuilder.includes('# 角色在场状态') &&
    systemPromptBuilder.includes('当前明确在场/同行') &&
    systemPromptBuilder.includes('近期相关但不在场') &&
    systemPromptBuilder.includes('预期登场/需提前校准') &&
    systemPromptBuilder.includes('允许智库提前召回口吻和人格') &&
    systemPromptBuilder.includes('不得自动让黑塔本人出场或召回黑塔人格'),
  'main prompt must expose current present/absent character status and prevent location-only persona recall.',
);
assert(
  npcPresence.includes('getAnticipatedNpcNamesForTurn') &&
    npcPresence.includes("addUnique(names, '帕姆')") &&
    npcPresence.includes('getZhikuNpcNamesForTurn') &&
    npcPresence.includes("originalProtagonist === '星'") &&
    npcPresence.includes("originalProtagonist === '穹'"),
  'npc presence helpers must expose anticipated character recall and filter 星/穹 by single-protagonist mode.',
);
assert(
  retrieval.includes('originalProtagonist') &&
    retrieval.includes('isAllowedOriginalProtagonistName') &&
    retrieval.includes('isAllowedOriginalProtagonistEntry') &&
    retrieval.includes("originalProtagonist === '星'") &&
    retrieval.includes("originalProtagonist === '穹'"),
  'zhiku retrieval must gate 星/穹 character entries by the selected original protagonist mode.',
);
assert(
  retrieval.includes('/未解锁|锁定|只读/i') &&
    retrieval.includes('/主剧情|通用|全部|all/i') &&
    retrieval.includes('未解锁资料不得当作当前事实') &&
    retrieval.includes('形态/命途资料不得覆盖主体人格'),
  'zhiku retrieval must exclude locked or non-main-story character nodes from main story injection.',
);
assert(
    retrieval.includes('export interface 智库召回诊断') &&
    retrieval.includes('buildZhikuDiagnostics') &&
    retrieval.includes('getMainStoryBlockReason') &&
    retrieval.includes('被门禁过滤') &&
    retrieval.includes('关键词召回') &&
    retrieval.includes('在场角色兜底召回') &&
    retrieval.includes('AI检索补充') &&
    retrieval.includes('关键词资料召回') &&
    retrieval.includes('AI检索补充强资料') &&
    retrieval.includes('AI检索补充弱资料') &&
    retrieval.includes('人物锚点') &&
    retrieval.includes('关键词召回资料') &&
    retrieval.includes('AI候选资料') &&
    retrieval.includes('AI补充资料') &&
    retrieval.includes('角色相关资料') &&
    retrieval.includes('强相关资料') &&
    retrieval.includes('弱相关资料') &&
    retrieval.includes('未加入人物锚点'),
  'zhiku retrieval must expose diagnostics for character anchors and gate filtering.',
);
assert(
  historyWindow.includes('MAIN_RECALL_ASSISTANT_BODY_WINDOW = 5') &&
    historyWindow.includes('最近${MAIN_RECALL_ASSISTANT_BODY_WINDOW}条正文承接') &&
    historyWindow.includes('玩家当前输入') &&
    historyWindow.includes('extractAssistantBodyText') &&
    historyWindow.includes('buildZhikuKeywordRecallQuery') &&
    historyWindow.includes('msg.parsedResponse?.body') &&
    historyWindow.includes('<正文>') &&
    sendWorkflow.includes('buildZhikuKeywordRecallQuery') &&
    contextSnapshot.includes('buildZhikuKeywordRecallQuery') &&
    sendWorkflow.includes('startScenarioId: undefined') &&
    contextSnapshot.includes('startScenarioId: undefined') &&
    sendWorkflow.includes('npcNames: []') &&
    contextSnapshot.includes('npcNames: []') &&
    sendWorkflow.includes('presentNpcNamesForFallback: worldbookCtx.npcNames') &&
    contextSnapshot.includes('presentNpcNamesForFallback: worldbookCtx.npcNames') &&
    contextSnapshot.includes('presentNpcNamesForFallback: presentZhikuNpcNames') &&
    sendWorkflow.includes('aiSupplementHints') &&
    contextSnapshot.includes('aiSupplementHints') &&
    sendWorkflow.includes('immediateStoryReviewForZhiku') &&
    contextSnapshot.includes('immediateStoryReviewForZhiku') &&
    !sendWorkflow.includes('includeRecentUserInputs: false') &&
    !contextSnapshot.includes('includeRecentUserInputs: false'),
  'main zhiku keyword recall query must scan only current player input and latest 5 assistant body turns, while location/present-role/story-review hints stay in the AI supplement-only channel.',
);
assert(
  retrieval.includes('extractCharacterAliasTriggers') &&
    retrieval.includes('isBroadCharacterTrigger') &&
    retrieval.includes('星穹列车|列车组|无名客|黑塔空间站|空间站|贝洛伯格|雅利洛-?VI|上层区|下层区|地火|银鬃铁卫|星核猎手') &&
    retrieval.includes('当前地点|当前相关人物|最近玩家输入|剧情规划|事件|小结') &&
    retrieval.includes('元信息不得触发关键词'),
  'character keyword recall must use narrow character names/aliases and ignore broad organization/location/metainfo triggers.',
);
assert(
  retrieval.includes('const characterCandidates = mergeZhikuEntries(') &&
    retrieval.includes('rankZhikuEntries(anticipatedCharacters, sceneHints)') &&
    !retrieval.includes("rankZhikuEntries(scored.filter((entry) => entry.分类 === 'character'") &&
    !retrieval.includes('rankZhikuEntries(characterPool, sceneHints).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT)'),
  'AI character supplement candidates must come from anticipated character names, not broad organization/location keyword hits.',
);
assert(
  /maxRelatedEntries:\s*5/.test(settingsModel) &&
    settingsModel.includes('Math.min(5, Math.max(1'),
  'default zhiku non-character keyword recall count should be 5 and old saves must be clamped to 5.',
);
assert(
    zhikuCot.includes('关键词召回已完成') &&
    zhikuCot.includes('AI 检索补充模块') &&
    zhikuCot.includes('不负责重筛、删除、替换或否定关键词召回结果') &&
    zhikuCot.includes('元信息不得触发关键词') &&
    zhikuCot.includes('当前地点、即时剧情回顾、在场角色分析') &&
    zhikuCot.includes('AI 查缺补漏线索') &&
    zhikuCot.includes('已关键词召回资料只作为排除表') &&
    zhikuCot.includes('未召回候选资料') &&
    zhikuCot.includes('Step0: 关键词结果与正文窗口确认') &&
    zhikuCot.includes('Step1: AI 补充线索校准') &&
    zhikuCot.includes('即时剧情回顾') &&
    zhikuCot.includes('Step2: 在场角色与被提及角色分析') &&
    zhikuCot.includes('谁明确在场、谁只是被提及、谁近期相关但不在场') &&
    zhikuCot.includes('Step3: 预期登场预测') &&
    zhikuCot.includes('合理登场路径') &&
    zhikuCot.includes('Step4: 场景资料缺口分析') &&
    zhikuCot.includes('必须补充') &&
    zhikuCot.includes('Step5: 资料与角色召回门禁') &&
    zhikuCot.includes('智库本身不决定角色出场、不推进剧情、不让资料自动变成正文事实') &&
    zhikuCot.includes('背景资料不等于 NPC 全知') &&
    zhikuCot.includes('Step6: 查缺补漏整理与相关性判断') &&
    zhikuCot.includes('强相关是当前镜头必须知道') &&
    zhikuCot.includes('Step7: 确认最终 AI 补充内容') &&
    zhikuCot.includes('Step8: 自检并输出') &&
    zhikuCot.includes('若某类为空，写“无”'),
  'zhiku CoT must use the current keyword-first, AI supplement-only Step0-Step8 workflow.',
);
assert(
  retrieval.includes('ZHIKU_COT_PROMPT') &&
    retrieval.includes('const systemPrompt = buildZhikuModelSystemPrompt(sceneHints, promptModules)') &&
    retrieval.includes('export function buildZhikuModelSystemPrompt') &&
    retrieval.includes('ZHIKU_LEGACY_COT_PROMPT,') &&
    retrieval.includes('export function buildZhikuModelUserPrompt') &&
    retrieval.includes('buildRecallSupplementCandidates') &&
    retrieval.includes('AI 查缺补漏线索（只用于判断是否缺少必要资料，不属于关键词扫描正文窗口）') &&
    retrieval.includes('formatAiSupplementHints(options.aiSupplementHints)') &&
    retrieval.includes('buildAiSupplementHintQuery(sceneContext?.aiSupplementHints)') &&
    zhikuCot.includes('召回扫描正文窗口是唯一关键词触发来源') &&
    retrieval.includes('当前地点、当前相关人物、剧情规划、小结、动态事件、即时剧情回顾和在场角色分析等元信息不得触发关键词') &&
    retrieval.includes('已关键词召回资料（只作为排除表，不含档案正文）') &&
    retrieval.includes('未召回候选资料（只可从这里补缺）') &&
    zhikuCot.includes('不负责重筛、删除、替换或否定关键词召回结果') &&
    zhikuCot.includes('只补充上下文确实需要但第一层没有命中的角色') &&
    retrieval.includes("const summary = entry.摘要 || '无摘要'") &&
    retrieval.includes('systemPrompt,') &&
    retrieval.includes('chatCompletionNonStream(api') &&
    retrieval.includes('mergeSupplementedZhikuGroups(keywordGroups, supplementGroups)') &&
    retrieval.includes('智库模型已完成查缺补漏，本回合没有需要追加的资料。'),
  'zhiku model retrieval must send the Step0-Step8 CoT prompt and use it only to supplement missing entries after keyword recall.',
);
assert(
  retrieval.includes('智库模型已完成查缺补漏，本回合没有需要追加的资料。') &&
    retrieval.includes('...keywordRecall') &&
    !retrieval.includes("return { entries: [], injection: '', usedModel: true, rawText, diagnostics: fallback.diagnostics }"),
  'zhiku model retrieval must preserve keyword recall instead of dropping all zhiku injection when the model returns no valid supplement indexes.',
);
assert(
    model.includes('角色故事摘要?: string') &&
    retrieval.includes('formatCharacterZhikuInjectionEntry') &&
    retrieval.includes('formatCharacterStorySummarySection(entry)') &&
    retrieval.includes("formatCharacterSourceSection(entry.原文, '语料层', 3600)") &&
    retrieval.includes("formatCharacterSourceSection(entry.原文, '表现锚点层', 1800)") &&
    retrieval.includes('主剧情必须读取语料层作为口吻参考') &&
    retrieval.includes('角色故事层优先读取预整理摘要') &&
    retrieval.includes('不得整句复读') &&
    retrieval.includes('extractMarkdownSection') &&
    retrieval.includes('compactSectionText') &&
    !retrieval.includes("formatCharacterSourceSection(entry.原文, '角色故事层', 2600)") &&
    !retrieval.includes("formatCharacterSourceSection(entry.原文, /^历史故事与.+层$/u, 2600)"),
  'character zhiku entries must keep corpus/profile layers while replacing long story/history story injection with curated character story summary.',
);
assert(
  mainCot.includes('不使用“本回合 NPC 表演卡”摘要层') &&
    mainCot.includes('直接读取已注入的智库角色档案') &&
    mainCot.includes('性格、口吻、行为、关系边界或禁止误写锚点') &&
    mainCot.includes('不得临时脑补完整人设'),
  'main CoT must read full zhiku character profiles directly instead of prioritizing NPC performance cards.',
);
assert(
  retrieval.includes('characterEntries?: 智库条目[]') &&
    retrieval.includes('strongEntries?: 智库条目[]') &&
    retrieval.includes('weakEntries?: 智库条目[]') &&
    retrieval.includes('interface 智库召回分组') &&
    zhikuCot.includes('const CHARACTER_KEYWORD_RECALL_LIMIT = 15') &&
    zhikuCot.includes('const NORMAL_KEYWORD_RECALL_LIMIT = 5') &&
    zhikuCot.includes('const AI_SUPPLEMENT_ENTRY_LIMIT = 8') &&
    retrieval.includes('const CHARACTER_ANCHOR_ENTRIES_PER_ROLE = 2') &&
    retrieval.includes('function getCharacterAnchorLimit') &&
    retrieval.includes('function getNormalRelatedLimit') &&
    retrieval.includes('function isNormalRecallEntry') &&
    retrieval.includes("entry.分类 !== 'character' && entry.分类 !== 'story'") &&
    zhikuCot.includes('推荐写成【编号：候选标题】') &&
    zhikuCot.includes('角色相关资料：【编号：候选标题】|【编号：候选标题】|【编号：候选标题】') &&
    retrieval.includes('function findZhikuCandidateIndexesByName') &&
    zhikuCot.includes('输出格式必须严格为三行') &&
    zhikuCot.includes('角色相关资料只挑') &&
    zhikuCot.includes('多人同场时，角色相关资料优先覆盖每个正文窗口明确出现、在场分析确认或预期登场角色的主体人格与 OOC 风险') &&
    retrieval.includes('召回扫描正文窗口') &&
    zhikuCot.includes('弱相关资料只在能补充当前场景链路、人物关系链或机制理解时少量保留') &&
    zhikuCot.includes('不要把 character 条目放进强/弱相关') &&
    retrieval.includes('characterEntries: mergeZhikuEntries(characterAnchors, presentFallbackAnchors)') &&
    retrieval.includes('strongEntries: primaryEntries') &&
    retrieval.includes('weakEntries: weakSource.slice(0, Math.max(0, normalLimit - primaryEntries.length))') &&
    retrieval.includes('const keywordGroups: 智库召回分组') &&
    retrieval.includes('mergeSupplementedZhikuGroups(keywordGroups, supplementGroups)') &&
    retrieval.includes('const supplementGroups = parseZhikuIndexes(rawText, candidates, normalLimit)') &&
    retrieval.includes('anticipatedNpcNames?: string[]') &&
    retrieval.includes('aiSupplementHints?: 智库AI补充线索') &&
    retrieval.includes('预期登场人物（只用于 AI 查缺补漏，不视为关键词已命中）') &&
    retrieval.includes('关键词召回上限：角色档案 ${CHARACTER_KEYWORD_RECALL_LIMIT} 条，非角色资料 ${getNormalRelatedLimit(limit)} 条；AI 补充上限') &&
    retrieval.includes('return accepted.size < AI_SUPPLEMENT_ENTRY_LIMIT') &&
    retrieval.includes('trimAiSupplementGroups') &&
    retrieval.includes('buildZhikuInjection(groups') &&
    retrieval.includes("formatGroup('角色相关资料', groups.characterEntries)") &&
    retrieval.includes("formatGroup('强相关资料', groups.strongEntries)") &&
    retrieval.includes("formatGroup('弱相关资料', groups.weakEntries)"),
    'zhiku recall must keep character keyword, normal keyword, and AI supplement limits in separate slots.',
);
assert(
  !retrieval.includes('NPC表演卡') &&
    !retrieval.includes('NPC_PERFORMANCE_CARD_LIMIT') &&
    !retrieval.includes('buildCharacterPerformanceCards') &&
    !retrieval.includes('formatCharacterPerformanceCard') &&
    !retrieval.includes('getCharacterPerformanceCardTitles'),
  'zhiku retrieval must not inject or expose the old NPC performance card layer; in-scene NPCs should use full recalled character profiles directly.',
);
assert(
    contextSnapshot.includes('本地召回诊断') &&
    contextSnapshot.includes('上一回合真实保存的召回诊断') &&
    contextSnapshot.includes('latestAssistantZhikuDebugRecall') &&
    contextSnapshot.includes('zhikuRecallPreview') &&
    contextSnapshot.includes('historyThroughLatestUser') &&
    contextSnapshot.includes('buildMainRecallQuery({') &&
    contextSnapshot.includes('buildZhikuModelSystemPrompt') &&
    contextSnapshot.includes('buildZhikuModelUserPrompt') &&
    contextSnapshot.includes('智库召回提示词（Step0~Step8）') &&
    contextSnapshot.includes('anticipatedZhikuNpcNames') &&
    contextSnapshot.includes('originalProtagonist: state.世界.原著主角') &&
    contextSnapshot.includes('zhikuDiagnostics.被门禁过滤') &&
    contextSnapshot.includes('npcNames: []') &&
    contextSnapshot.includes('anticipatedNpcNames: anticipatedZhikuNpcNames') &&
    contextSnapshot.includes('aiSupplementHints') &&
    contextSnapshot.includes('presentNpcNames') &&
    contextSnapshot.includes('相关角色') &&
    contextSnapshot.includes('zhikuDiagnostics.关键词召回') &&
    contextSnapshot.includes('zhikuDiagnostics.在场角色兜底召回') &&
    contextSnapshot.includes('zhikuDiagnostics.AI检索补充') &&
    contextSnapshot.includes('zhikuDiagnostics.关键词资料召回') &&
    contextSnapshot.includes('zhikuDiagnostics.AI检索补充强资料') &&
    contextSnapshot.includes('zhikuDiagnostics.AI检索补充弱资料') &&
    contextSnapshot.includes('zhikuDiagnostics.AI候选资料') &&
    contextSnapshot.includes('keywordRecallTitles: zhikuDiagnostics?.关键词召回资料 ?? []') &&
    contextSnapshot.includes('anticipatedNpcNames: anticipatedZhikuNpcNames') &&
    contextSnapshot.includes('aiSupplementHints: sceneContext.aiSupplementHints') &&
    contextSnapshot.includes('zhikuDiagnostics.角色相关资料') &&
    contextSnapshot.includes('zhikuDiagnostics.强相关资料') &&
    contextSnapshot.includes('zhikuDiagnostics.弱相关资料') &&
    contextSnapshot.includes('在场角色兜底召回：') &&
    contextSnapshot.includes('最终注入角色资料（已去重）：') &&
    contextSnapshot.includes('最终注入强资料：') &&
    contextSnapshot.includes('最终注入弱资料：') &&
    !contextSnapshot.includes('你是原著资料中枢「智库」的召回模型。你的任务不是写正文，而是从候选资料中挑出最相关条目'),
  'zhiku request context must reuse the real Step0-Step8 model prompt and show local retrieval diagnostics for OOC/gate debugging.',
);
assert(
  panel.includes("activeCategory === 'character'") &&
    panel.includes('<CharacterWorkspace') &&
    panel.includes('md:grid-cols-[170px_220px_minmax(0,1fr)]') &&
    panel.includes('lg:grid-cols-[190px_260px_minmax(0,1fr)]') &&
    panel.includes('truncate whitespace-nowrap font-serif') &&
    panel.includes('角色列表') &&
    panel.includes('CharacterSoftStructurePreview') &&
    panel.includes('软结构预览') &&
    panel.includes('<StructuredCharacterFields') &&
    panel.includes('结构字段') &&
    panel.includes('人物结构') &&
    panel.includes('人物表现结构') &&
    ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写'].every((field) => panel.includes(field)) &&
    panel.includes('PerformanceTextarea') &&
    panel.includes('资料类型') &&
    panel.includes('关联角色') &&
    panel.includes('关联形态') &&
    panel.includes('使用范围') &&
    panel.includes('手动门禁') &&
    panel.includes('运行时解锁覆盖') &&
    panel.includes('allowedRuntimePatch') &&
    panel.includes('主剧情注入') &&
    panel.includes('解锁:') &&
    panel.includes('剧透:') &&
    panel.includes('资料类型:角色主体') &&
    panel.includes('CharacterProfileGroup') &&
    panel.includes('expandedCharacterGroupIds') &&
    panel.includes('getCharacterNames') &&
    panel.includes('CharacterProfileWorkspace') &&
    panel.includes("useState<CharacterProfileSectionKey>('identity')") &&
    panel.includes('sectionTabs.map') &&
    panel.includes('setActiveSection(item.key)') &&
    panel.includes('visibleSection ===') &&
    panel.includes('disabled={!item.available}') &&
    !panel.includes('grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[22rem] xl:grid-cols-2') &&
    panel.includes('角色档案工作台') &&
    panel.includes('基础身份层') &&
    panel.includes('性别 / 性别表达') &&
    panel.includes("const story = sections.find((section) => /角色故事|故事层|经历脉络/.test(section.title))") &&
    panel.includes("const storyGroups = parseMarkdownSubsections(story?.body ?? '')") &&
    panel.includes("{ key: 'story', label: '故事', available: Boolean(story) }") &&
    panel.includes("{ label: '故事段', value: String(storyGroups.length || (story ? 1 : 0)) }") &&
    panel.includes("visibleSection === 'story'") &&
    panel.includes('解释动机，不得整段复读') &&
    panel.includes("{ label: '外貌', value: appearance || '未标注', missing: !appearance, wide: true }") &&
    panel.includes("{ label: '形态', value: get('形态', meta.形态 || '未标注'), missing: !get('形态') && !meta.形态 }") &&
    panel.includes("className={`min-w-0 px-3 py-3 ${wide ? 'md:col-span-2' : ''}`}") &&
    panel.includes('const sourceLines = identityLines.length ? identityLines : lines') &&
    panel.includes("if (/出身|出生|故乡|来源地|原籍/.test(key)) return '出身'") &&
    panel.includes("{ label: '出身', value: get('出身', '未标注'), missing: !get('出身') }") &&
    panel.includes('身份 / 职务') &&
    !panel.includes("{ label: '活动区域'") &&
    !panel.includes("{ label: '当前默认状态'") &&
    !panel.includes("{ label: '使用范围'") &&
    !panel.includes("{ label: '不可臆造项'") &&
    panel.includes('所属 / 组织') &&
    panel.includes('档案健康度') &&
    panel.includes('关键词触发') &&
    panel.includes('CharacterKeywordTile') &&
    panel.includes('buildCharacterKeywordBuckets') &&
    panel.includes('核心触发词') &&
    panel.includes('软结构标签') &&
    panel.includes('补充关键词') &&
    panel.includes('身份缺口') &&
    panel.includes('语料参考') &&
    panel.includes('只学节奏，不得复读') &&
    panel.includes('门禁中心') &&
    panel.includes('门禁内容完整可见，按剧情状态注入') &&
    panel.includes('启用方式') &&
    panel.includes('显现机制') &&
    panel.includes('触发后注入') &&
    panel.includes('外貌规则') &&
    panel.includes('人格规则') &&
    panel.includes('继承规则') &&
    panel.includes('记忆规则') &&
    panel.includes('提前启用边界') &&
    panel.includes('标准解锁') &&
    panel.includes('findCharacterGateSection(sections)') &&
    panel.includes('展开条件|默认处理|知情边界|回落规则') &&
    panel.includes('默认处理') &&
    panel.includes('知情边界') &&
    panel.includes('回落规则') &&
    panel.includes("fields.get('当前注入')") &&
    panel.includes("fields.get('标准解锁')") &&
    panel.includes("fields.get('默认处理')") &&
    panel.includes("fields.get('展开条件')") &&
    panel.includes("fields.get('知情边界')") &&
    panel.includes("fields.get('回落规则')") &&
    panel.includes("fields.get('启用方式')") &&
    panel.includes("fields.get('显现机制')") &&
    panel.includes("fields.get('外貌规则')") &&
    panel.includes("fields.get('人格规则')") &&
    panel.includes("fields.get('记忆规则')") &&
    panel.includes('本回合注入预览') &&
    panel.includes('可见 / 可用 / 可注入分离') &&
    panel.includes('CharacterMetric') &&
    panel.includes('CharacterGateCard') &&
    panel.includes('parseCharacterIdentityFields') &&
    panel.includes('inferCharacterRole') &&
    panel.includes('/使用范围|可用范围|范围/') &&
    panel.includes('parseCharacterGateCards') &&
    panel.includes('CharacterInjectionTile') &&
    panel.includes('parseZhikuMarkdownSections') &&
    panel.includes('DetailMetadataForm') &&
    !panel.includes('CharacterProfileDashboard') &&
    !panel.includes('编辑与完整资料') &&
    !panel.includes('形态 / 节点') &&
    !panel.includes('开发者底层字段') &&
    panel.includes('所属') &&
    panel.includes('地区') &&
    panel.includes('组织') &&
    panel.includes('阵营') &&
    panel.includes('资料大区') &&
    panel.includes('星穹列车') &&
    panel.includes('匹诺康尼') &&
    panel.includes('翁法罗斯') &&
    panel.includes('人物资料待重建'),
  'zhiku panel must render the character-specific rebuild workspace.',
);
assert(
  panel.includes('获取智库人物名列表') &&
    panel.includes('for (const name of names)') &&
    panel.includes('item.id === entry.id'),
  'zhiku character workspace must show multi-role nodes under every related character, not only the first 角色 tag.',
);
assert(
  panel.includes('grid min-h-0 min-w-0 flex-1 gap-3 overflow-y-auto overflow-x-hidden p-3 md:overflow-hidden') &&
    panel.includes('min-w-0 overflow-x-hidden overflow-y-visible md:min-h-0 md:overflow-y-auto md:pr-1'),
  'zhiku character workspace must stack on mobile and only switch to internal desktop column scrolling at md+.',
);
assert(
  panel.includes('nativePenaconyOrganizations') &&
    panel.includes("dataArea === '匹诺康尼'") &&
    panel.includes("id: '资料大区:匹诺康尼'") &&
    panel.indexOf("keys: ['阵营', '派系']") < panel.indexOf("keys: ['组织']"),
  'character left-side big groups must fold native Penacony organizations under 匹诺康尼 while letting external factions win over organization tags.',
);
assert(
  panel.includes('const valid = prev.filter((id) => groupIds.includes(id))') &&
    panel.includes('const selectedProfile = selectedId') &&
    panel.includes('return valid') &&
    !panel.includes('const base = valid.length ? valid : groupIds'),
  'character left-side big groups must not all expand by default; only user-expanded groups or the selected profile group should open.',
);

const entries = Array.isArray(rebuildPreset.entries) ? rebuildPreset.entries : [];
const profileById = new Map(entries.map((entry) => [entry.id, entry]));
const isAstralExpressCharacterProfileSet =
  rebuildPreset.id === 'zhiku_character_rebuild_core' &&
  rebuildPreset.title === '人物重建·星穹列车角色档案' &&
  profileById.has('zhiku_character_rebuild_stelle_profile') &&
  profileById.has('zhiku_character_rebuild_caelus_profile') &&
  profileById.has('zhiku_character_rebuild_march_profile') &&
  profileById.has('zhiku_character_rebuild_welt_profile') &&
  profileById.has('zhiku_character_rebuild_danheng_profile') &&
  profileById.has('zhiku_character_rebuild_himeko_profile') &&
  profileById.has('zhiku_character_rebuild_pompom_profile') &&
  entries.every((entry) => typeof entry.id === 'string' && entry.id.startsWith(REBUILD_PREFIX));

if (isAstralExpressCharacterProfileSet) {
  const stelle = profileById.get('zhiku_character_rebuild_stelle_profile');
  const caelus = profileById.get('zhiku_character_rebuild_caelus_profile');
  const profile = profileById.get('zhiku_character_rebuild_march_profile');
  const welt = profileById.get('zhiku_character_rebuild_welt_profile');
  const danheng = profileById.get('zhiku_character_rebuild_danheng_profile');
  const himeko = profileById.get('zhiku_character_rebuild_himeko_profile');
  const pompom = profileById.get('zhiku_character_rebuild_pompom_profile');
  const trailblazerProfiles = [
    { entry: stelle, name: '星', roleId: 'stelle', gender: '女性', opposite: '穹', appearance: '灰色中长发', title: '女性开拓者', forbidden: '不要与穹的男性形象和称呼混用' },
    { entry: caelus, name: '穹', roleId: 'caelus', gender: '男性', opposite: '星', appearance: '灰色短发', title: '男性开拓者', forbidden: '不要与星的女性形象和称呼混用' },
  ];
  const text = [profile.摘要, profile.原文, ...(profile.关键词 ?? [])].filter(Boolean).join('\n');
  const factsText = String(profile.原文 ?? '').match(/## 常驻事实层\n\n([\s\S]*?)\n\n## 表现锚点层/u)?.[1] ?? '';
  assert(rebuildPreset.description.includes('当前包含星、穹、三月七、丹恒、瓦尔特·杨、姬子与帕姆'), 'Astral Express profile set description must list the current formal profiles.');
  assert(rebuildPreset.description.includes('语料只作口吻参考，禁止照抄或原句搬运'), 'Astral Express profile set description must expose the corpus anti-copy rule.');
  assert(rebuildPreset.description.includes('命途阶段'), 'Astral Express profile set description must mention Trailblazer path-stage boundaries.');
  for (const { entry, name, roleId, gender, opposite, appearance, title, forbidden } of trailblazerProfiles) {
    const trailblazerText = [entry.摘要, entry.原文, ...(entry.关键词 ?? [])].filter(Boolean).join('\n');
    assert(entry.分类 === 'character', `${name} profile must stay in character category.`);
    assert(entry.id.startsWith(REBUILD_PREFIX), `${name} profile id must keep rebuild prefix.`);
    assert(entry.标题 === name, `${name} profile must display only the character name.`);
    assert(entry.摘要 === '', `${name} profile must not show a summary blurb in the UI.`);
    assert(entry.关联角色ID === name, `${name} profile must use a direct related role id.`);
    assert(entry.资料类型 === '角色档案包', `${name} profile must use the role profile package type.`);
    for (const requiredKeyword of [
      `角色:${name}`,
      `角色ID:${roleId}`,
      '所属:星穹列车',
      '组织:无名客',
      '身份:开拓者',
      '资料类型:角色档案包',
      '节点:单角色档案',
      '解锁:默认可用',
      '剧透:含命途阶段边界',
      '范围:主剧情',
      '范围:手机',
      '范围:变量参考',
      name,
      title,
      '玩家边界',
      '玩家主导权',
      '命途阶段',
      '语料只作参考',
      '禁止照抄语料',
      '禁止原句搬运',
      '角色故事',
      '命途阶段故事',
      '剧情阶段故事',
      '旅途正在继续',
      '静静的星河',
      '然后，在第八天',
      '落英啊，残芳纷飞留归躅',
      '存护之城',
      '永恒的美梦',
      '翁法罗斯',
      '日常同行',
      '列车组关系',
      '列车组关系锚点',
      '阶段角色故事',
      '角色故事阶段',
      '主动接话',
      '主动追问',
      '抽象联想',
      '跳脱性格',
      '防沉默',
      '不能长期失语',
      '不是沉默背景板',
      '奇怪但有效',
      '非哑巴开拓者',
    ]) {
      assert(entry.关键词?.includes(requiredKeyword), `${name} profile missing keyword: ${requiredKeyword}`);
    }
    assertNoBareKeywords(
      entry,
      ['开拓者', '星核载体', '毁灭开拓者', '存护开拓者', '同谐开拓者', '记忆开拓者', '欢愉开拓者', '物理', '火', '虚数', '冰', '雷', 'Mem', '忆灵'],
      `${name} profile`,
    );
    assertCoreTriggers(
      entry,
      name === '星'
        ? ['星', 'Stelle', '女性开拓者', '灰发开拓者', '银河球棒侠']
        : ['穹', 'Caelus', '男性开拓者', '灰发开拓者'],
      `${name} profile`,
    );
    for (const field of ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写']) {
      assert(typeof entry[field] === 'string' && entry[field].trim().length >= 20, `${name} profile must keep ${field}.`);
    }
    assert(entry.外貌锚点.includes('完整外貌以基础身份层为准') && entry.外貌锚点.includes(`不要与${opposite}混用`), `${name} appearance anchor must point to base identity and avoid mixing with ${opposite}.`);
    assert(entry.禁止误写.includes(forbidden) || trailblazerText.includes(forbidden), `${name} profile must forbid mixing with ${opposite}.`);
    for (const required of [
      '## 角色档案包说明',
      `这是星穹列车角色档案集中的${name}正式档案`,
      '不再由“开拓者主体 / 星核载体 / 毁灭 / 存护 / 同谐 / 记忆 / 欢愉 / OOC 风险”等多条平级资料参与召回',
      '## 基础识别',
      `角色ID：${roleId}`,
      `名称：${name}`,
      `性别 / 性别表达：${gender}`,
      appearance,
      `形态：${name}常态；开拓者·毁灭（物理）；开拓者·存护（火）；开拓者·同谐（虚数）；开拓者·记忆（冰）；开拓者·欢愉（雷）。`,
      '所属：星穹列车',
      '出身：未知',
      '身份：开拓者；星核载体；无名客；星穹列车成员。',
      '不得替玩家做关键选择、表态、承诺或行动',
      '## 常驻事实层',
      `${name}是在黑塔空间站醒来的开拓者`,
      '不是带着完整答案登上列车的人',
      '主剧情应优先写',
      '如何选择、同行与承担',
      '不能写成沉默少言的空白壳',
      '主动接话、主动追问或主动行动',
      '抽象联想和突然冒出的怪问题',
      '不要让',
      '长期只点头、沉默或被旁白带过',
      '星核载体和星穹列车成员',
      '主剧情必须优先承接玩家输入',
      '不能替玩家决定态度、路线、承诺、亲密边界或重大行动',
      '命途形态是开拓者在旅途中获得的能力阶段，不是不同人格，也不是多条独立角色',
      '## 角色故事层',
      '玩家边界',
      '不替玩家做决定',
      '命途变化是旅途留下的能力与象征',
      '### 角色故事阶段层说明',
      '### 角色故事一：旅途正在继续',
      '完成开拓任务「旅途正在继续」',
      '——以你自己的意志。',
      '### 角色故事二：静静的星河',
      '存护之城',
      '日日夜夜焚烧自己',
      '### 角色故事三：然后，在第八天…',
      '永恒的美梦消散于一瞬',
      '### 角色故事四：落英啊，残芳纷飞留归躅',
      '银河已知晓「翁法罗斯」的姓名',
      '## 表现锚点层',
      '完整外貌以基础身份层为准',
      `不要与${opposite}`,
      '## 语料层',
      '只作口吻参考，不能照着写',
      '示例台词不得整句复读',
      '不得原句搬运',
      '不得把示例事件当作当前剧情事实',
      '### 日常同行',
      '### 主动接话与抽象联想',
      '不能长期失语',
      '别等我沉默。我还在，能行动，也能回答。',
      '### 列车组关系',
      '### 玩家边界提醒',
      '## 能力与职责模块',
      '### 默认可用：星核载体与开拓者职责',
      '默认以球棒近战、星核反应、正面破局和危机承担为基础',
      '不写成原作游戏资料卡式的命途 / 属性说明',
      '具体表现必须匹配当前剧情阶段',
      '不默认同时使用所有命途',
      '能力模块不能覆盖玩家主导权',
      '## 历史故事与命途阶段边界层',
      `${name}有多个命途阶段，但当前档案仍只作为一个角色档案参与召回`,
      '新增的“角色故事”按剧情阶段使用',
      '默认底色：星核载体 / 毁灭开局（默认可用）',
      '对应故事：完成开拓任务「旅途正在继续」',
      '阶段边界：存护 / 火（雅利洛相关阶段）',
      '对应故事：完成开拓任务「静静的星河」',
      '阶段边界：同谐 / 虚数（匹诺康尼相关阶段）',
      '对应故事：完成开拓任务「然后，在第八天…」',
      '阶段边界：记忆 / 冰（翁法罗斯相关阶段）',
      '对应故事：完成开拓任务「落英啊，残芳纷飞留归躅」',
      '阶段边界：欢愉 / 雷（后续欢愉阶段）',
      '命途不同只改变能力和阶段象征，不改变主体人格',
      '## 本回合注入建议',
      '必须优先承接玩家输入',
      '不得把未解锁故事当作当前事实',
      '不得把故事整段复读进正文',
    ]) {
      assert(trailblazerText.includes(required), `${name} profile missing required section or rule: ${required}`);
    }
    assert(!trailblazerText.includes(`${name}是原著开拓者之一`), `${name} fact layer should not use source-card wording.`);
    assert(!trailblazerText.includes('你的故事'), `${name} profile should display stage stories as 角色故事 instead of 你的故事.`);
    assert(!trailblazerText.includes('官方介绍中') && !trailblazerText.includes('官方语音') && !trailblazerText.includes('项目自制转写'), `${name} profile text should not expose source-trace wording inside the character file.`);
    assert(!/当前战斗表现中是|属性角色|默认可承接开局毁灭|根据已解锁命途切换到/.test(trailblazerText), `${name} ability wording should stay narrative instead of game-card style.`);
    assert(!trailblazerText.includes('## 状态 / 形态 / 门禁层'), `${name} profile should use path-stage boundaries instead of a generic form-gate section.`);
    assert(!entries.some((other) => other.id !== entry.id && other.关键词?.includes(`角色:${name}`)), `${name} must not be split into multiple active character entries in current profile-set mode.`);
  }
  assert(profile.分类 === 'character', 'March profile must stay in character category.');
  assert(profile.id.startsWith(REBUILD_PREFIX), 'March profile id must keep rebuild prefix.');
  assert(profile.标题 === '三月七', 'March profile must display only the character name.');
  assert(profile.摘要 === '', 'March profile must not show the old sample explanation in the UI summary.');
  assert(profile.关联角色ID === '三月七', 'March profile must use a direct related role id.');
  assert(profile.资料类型 === '角色档案包', 'March profile must use the new role profile package type.');
  assert(profile.关键词?.includes('角色:三月七'), 'March profile must keep the 三月七 character trigger.');
  assert(profile.关键词?.includes('角色ID:march_7th'), 'March profile must keep a stable role id keyword.');
  assert(profile.关键词?.includes('资料类型:角色档案包'), 'March profile must expose profile package soft type.');
  assert(profile.关键词?.includes('节点:单角色档案'), 'March profile must expose a single-profile node.');
  assert(profile.关键词?.includes('语料'), 'March profile must include a corpus keyword.');
  assertNoBareKeywords(profile, ['星穹列车', '无名客', '列车组', '开拓者', '杨叔', '丹恒', '姬子咖啡', '咖啡语料', '咖啡吐槽', '列车组咖啡反应'], 'March profile');
  assertCoreTriggers(profile, ['三月七', '三月', '小三月', 'March 7th', '六相冰', '拍照', '相机', '失忆', '恒冰', '长夜月', '长月夜'], 'March profile');
  assert(profile.关键词?.includes('长夜月语料'), 'March profile must expose the Evernight corpus keyword.');
  assert(profile.关键词?.includes('长夜月语音'), 'March profile must expose the Evernight voice keyword.');
  assert(profile.关键词?.includes('♭'), 'March profile must expose the Evernight flat-sign voice marker keyword.');
  assert(profile.关键词?.includes('记忆之影'), 'March profile must expose the Evernight memory-shadow keyword.');
  assert(profile.关键词?.includes('危险内心回响'), 'March profile must expose the Evernight danger inner-echo keyword.');
  assert(profile.关键词?.includes('长夜月外貌'), 'March profile must expose the Evernight appearance keyword.');
  assert(profile.关键词?.includes('黑伞'), 'March profile must expose the Evernight black umbrella keyword.');
  assert(profile.关键词?.includes('巡猎形态门禁'), 'March profile must retain the Hunt form gate keyword.');
  assert(profile.关键词?.includes('长夜月关联人格门禁'), 'March profile must retain the Evernight associated-persona gate keyword.');
  assert(profile.关键词?.includes('第二人格门禁'), 'March profile must mark Evernight as a secondary-persona gate.');
  for (const requiredKeyword of [
    '角色故事',
    '故事层',
    '拍照仪式感',
    '抵抗遗忘',
    '六相冰故事',
    '斩星破宙大琉璃剑',
    '列车组定位',
    '空白过去',
    '选择现在',
    '演武仪典后故事',
    '长夜月故事',
    '长夜月信件',
    '岁月火种',
    '忘却浪潮',
    '忘却之雨',
    '感官之雨',
    '空白起点',
    '列车灯光',
    '残酷代劳',
    '空白未来',
    '镜中人心愿',
    '原文信件',
    '角色故事原文',
    '深藏心底的声音',
    '亲爱的三月七',
    '三月七回信',
    '心底回信',
  ]) {
    assert(profile.关键词?.includes(requiredKeyword), `March profile must expose story keyword: ${requiredKeyword}`);
  }
  for (const field of ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写']) {
    assert(typeof profile[field] === 'string' && profile[field].trim().length >= 20, `March profile must keep ${field}.`);
  }
  assert(profile.外貌锚点.includes('只作普通形态短视觉触发'), 'March profile appearance anchor must stay a short visual trigger, not a repeated full appearance profile.');
  assert(profile.外貌锚点.includes('完整外貌以基础身份层为准'), 'March profile appearance anchor must point full appearance back to base identity.');
  assert(profile.性格锚点.includes('好奇心强') && profile.性格锚点.includes('珍惜当下同伴'), 'March profile personality anchor must keep curiosity and companion baseline.');
  assert(profile.说话方式.includes('口语感强') && profile.说话方式.includes('不要写成全程吵闹或突然神秘化'), 'March profile speech anchor must keep casual tone and anti-miswrite rule.');
  assert(profile.行为习惯.includes('把照片当作保存当下与寻找过去的方式') && profile.行为习惯.includes('用六相冰争取空间'), 'March profile behavior anchor must connect camera habits and protective action.');
  assert(profile.关系边界.includes('不能替玩家做关键决定') && profile.关系边界.includes('不能把所有场景都转成玩笑'), 'March profile relationship boundary must protect player agency and serious scenes.');
  assert(profile.禁止误写.includes('不要提前使用未解锁形态或长夜月人格'), 'March profile forbidden anchor must gate locked forms and Evernight persona.');
  for (const required of [
    '## 基础识别',
    '性别 / 性别表达：女性',
    '年龄状态：未知，外貌与社会互动表现为少女。',
    '外貌：三月七是一位有着精致面容的少女',
    '胸前系着深蓝蝴蝶结',
    '腰间挂着相机',
    '白色无袖上衣',
    '蓝色百褶短裙和深色安全短裤',
    '脚蹬蓝白相间的高跟短靴',
    '形态：三月七常态（存护），三月七（巡猎），长夜月（翁法罗斯）',
    '所属：星穹列车',
    '出身：未知',
    '身份：无名客',
    '当前信息域：知道自己从恒冰中醒来且失去过去记忆，不知道完整身世。',
    '核心触发词：三月七、三月、小三月、March 7th、六相冰、拍照、相机、失忆、恒冰、长夜月、长月夜。',
    '不可臆造：不得补完真实年龄',
    '## 常驻事实层',
    '三月七是星穹列车成员 / 无名客，曾被列车组从漂流太空的冰中救出。',
    '以被发现 / 苏醒的日期为自己命名为“三月七”',
    '随身携带相机，喜欢记录旅途中的人、事与风景',
    '常见表现包括防护、冰箭和保护同伴',
    '失忆、寻找过去和珍惜当下同伴，是她长期稳定的角色底色',
    '## 角色故事层',
    '主剧情可把它作为情绪底色和行为动机参考，但不得整段复读',
    '### 故事一：拍照、仪式感与不想忘记',
    '保存当下、抵抗遗忘、为自己留下证据的方式',
    '相机本身就是仪式感',
    '### 故事二：六相冰、弓箭和大琉璃剑',
    '她一直坚称那不是普通冰，而是某种凝聚态结晶',
    '斩星破宙·大琉璃剑',
    '不要把大琉璃剑写成已经练成的正式能力',
    '### 故事三：列车组里让人放在心上的人',
    '她总会被大家放在心上',
    '### 故事四：醒来、空白过去与选择现在',
    '她对自己仍旧一无所知',
    '她恐惧着，又庆幸着',
    '### 仙舟故事：演武仪典后的成长',
    '初入罗浮，建木灾异，演武仪典',
    '照片上的女孩子在花林之间腾挪移转',
    '凌厉的剑招下，落花如雨',
    '那还是以前那个三月七吗？',
    '步法熟练，从容不迫',
    '我的过去，正在一点点变多呢',
    '她不只是失去过去的人，也正在亲手创造新的过去',
    '#### 使用门禁',
    '解锁状态：可预热 / 剧情阶段启用',
    '未解锁前只可预热“练习、想变可靠、期待成长”的情绪',
    '不要默认写成她已经完成演武仪典或熟练双剑',
    '可使用花林、双剑、步法熟练、剑招凌厉、认出新的自己、过去正在变多等故事锚点',
    '### 长夜月故事原文',
    '以下保留用户提供的长夜月角色故事原文',
    '与世相隔的忆域，烛火映出过往',
    '亲爱的三月七',
    '隐匿「岁月」火种',
    '守护镜中人的心愿',
    '掀起「忘却」的浪潮',
    '### 长夜月角色故事一',
    '也许是我太过心急',
    '忆庭的棱光始终追逐身后',
    '空白的『起点』',
    '像一颗流星',
    '你的，\n『长夜月』♭',
    '——深藏心底的声音',
    '### 长夜月角色故事二',
    '永夜已然落下帷幕。安心睡吧。',
    '你关心的人们，我会替你记录他们的轨迹',
    '免受窃忆者的伤害',
    '### 长夜月角色故事三',
    '夜是如此漫长…是因为听不到你的声音么？',
    '感官之雨',
    '残酷的事，就由我代劳吧♭',
    '### 长夜月角色故事四',
    '我会后悔吗。',
    '将空白的未来，染上属于你的颜色♭',
    '亲爱的长夜月',
    '我们其实没有什么不一样',
    '你的，\n『三月七』',
    '### 长夜月故事使用规则',
    '未触发前只可作为隐藏动机、信件体裁和边界提醒',
    '不要把长夜月原文整封复读到主剧情正文里',
    '不要把长夜月故事当作三月七常态已经完全知晓的事实',
    '### 本轮故事使用规则',
    '普通常态场景只取 1-2 个故事锚点即可',
    '## 表现锚点层',
    '外貌锚点：只作普通形态短视觉触发',
    '性格锚点：明快、直率、好奇心强',
    '说话方式：口语感强，情绪外露',
    '行为习惯：喜欢拍照和记录旅途',
    '关系边界：她适合活跃列车组互动',
    '禁止误写：不要只写成吵闹、冒失、卖萌或添乱',
    '## 语料层',
    '只作口吻参考，不能照着写',
    '示例台词不得整句复读',
    '不得原句搬运',
    '### 初见与玩笑破冰',
    '欢迎入职星穹列车',
    '请先拍摄入职照',
    '### 名字与称呼',
    '你想叫我什么？',
    '### 陪伴需求与聊天欲',
    '要是没人和我聊天，我就闷得要命',
    '### 列车组关系',
    '关于丹恒：“丹恒…他在我之前上的车',
    '也帮我打探打探？',
    '关于姬子：“美丽的姬子姐姐',
    '美丽的姬子姐姐，成熟，可靠，又优雅',
    '关于瓦尔特：“听说杨叔曾经是秘密组织的首领',
    '简直是外星人了',
    '关于帕姆：“列车长就是最棒的！”',
    '列车长就是最棒的！',
    '### 关于姬子的咖啡',
    '那玩意儿能叫咖啡吗？',
    '远离姬子姐姐的咖啡',
    '不敢当着她的面说',
    '### 照片与现实',
    '是不是就能更接近现实一些呢？',
    '### 日常同行与好奇',
    '### 危机场景与行动',
    '### 严肃记忆与放轻声音',
    '### 吐槽与缓和气氛',
    '### 长夜月语料说明',
    '参考长夜月语音特征重新整理',
    '以下语料只在长夜月已标准解锁或被玩家正文显式触发后使用',
    '不得覆盖三月七常态语料',
    '不得让长夜月在未触发时主动抢话',
    '长夜月有时会在句尾加上 ♭',
    '带音乐感的轻微上扬 / 收束标记',
    '禁止每句都加',
    '禁止把 ♭ 当作技能、魔法符号或强制人格标记',
    '### 长夜月 / 口癖与音调',
    '岁月的缝隙很宽',
    '我们未必只剩一次相逢♭',
    '### 长夜月 / 自我定位与三月七',
    '我是留在夜里的那一面',
    '若有一天我能安静地消失',
    '### 长夜月 / 岁月、忘却与记忆',
    '记忆不是只会发光',
    '忘却反而是它们最后的愿望',
    '### 长夜月 / 翁法罗斯具象',
    '这里的夜色允许记忆拥有形状',
    '别把我当作换了一身衣服的三月七',
    '### 长夜月 / 外部内心显现',
    '三月，别急着回头',
    '我不会夺走她的声音',
    '### 长夜月 / 危险中的内心回响',
    '三月，呼吸，抬手',
    '先活下来，然后继续向前',
    '### 长夜月 / 保护与代价',
    '如果这段记忆一定要有人保管',
    '守护的不是胜利',
    '### 长夜月 / 记忆与遗忘',
    '遗忘并不总是背叛',
    '记忆会撒谎，也会保护人',
    '### 长夜月 / 冷淡中的轻微俏皮',
    '别小看粉色头发的少女',
    '至少要让它足够好看♭',
    '## 能力与职责模块',
    '### 默认可用：六相冰与保护职责',
    '使用范围：主剧情、战斗描写、危机场景、同行支援',
    '不应写成普通冰块或普通水冰法术',
    '冰晶 / 凝结晶体意象',
    '真实来源和更深身世仍按门禁处理',
    '生成护盾、冰箭、晶体屏障',
    '保护、支援、牵制和临场救援',
    '不要把它写成万能造物',
    '不要提前使用巡猎形态的剑术',
    '## 状态 / 形态 / 人格门禁层',
    '门禁不是单纯“锁 / 解锁”',
    '可预热：三月七·巡猎（同一人格 / 命途阶段）',
    '剧情进度自然触发',
    '玩家在正文中明确设定三月七进入巡猎阶段时',
    '不需要额外 UI 开关',
    '继承三月七主体人格、称呼习惯、相机、吐槽、好奇、伙伴意识和失忆底色',
    '不能把它写成另一个人格',
    '剧情显式触发：长夜月 / Evernight（第二人格 / 数据世界具象形态）',
    '同源人格 / 第二人格 / 保护性另一面',
    '本质上属于三月七的人格之一，不是敌人，也不是外部夺舍者',
    '翁法罗斯长夜月相关剧情',
    '依赖翁法罗斯数据世界与对应剧情',
    '以具象外貌、性格特征和行动主体出现',
    '默认不主动登场',
    '当玩家正文明确要求长夜月出现、苏醒、对话、提前登场',
    '剧情明确进入翁法罗斯长夜月相关段落时',
    '视为当前分支事实触发',
    '在翁法罗斯等数据世界 / 特殊意识环境中，长夜月可以具象为独立外貌与行动主体',
    '外部现实场景中，默认以内心声音、意识对话、梦境或保护性人格反应显现',
    '三月七遭遇致命危险、意识震荡、记忆刺痛或保护本能被强烈触发',
    '只代表内心回响 / 保护性人格反应，不等于长夜月已经正式苏醒、实体化或接管身体',
    '若当前场景明确出现三月七遇险、濒临受伤、意识被冲击或记忆裂隙被触动',
    '该回响不能推进真相、不能替三月七行动、不能让旁人无理由听见',
    '翁法罗斯剧情中可写独立形态、外貌、行动和对三月七的保护',
    '外部场景中优先写内心 / 意识层互动',
    '长夜月有独立外貌和气质',
    '不沿用三月七常态的粉蓝、蓝白冰晶装束',
    '黑白暗色系礼服式装束',
    '低双马尾',
    '红色眼睛',
    '黑色半外套与层叠黑白裙装',
    '黑色翻折短靴',
    '可携带黑伞',
    '伞内侧可带红色花纹意象',
    '会保护三月七',
    '被遗忘的过去、陪伴三月七的长夜和替三月七承担残酷往事的记忆之影',
    '照片、粉色头发、命运般邂逅',
    '纯粹冷酷无情的黑化人格',
    '常用「她」「记忆」「岁月」「忘却」',
    '句尾 ♭ 只作少量音调装饰',
    '不能被写成敌对人格、外部入侵者、完全陌生的独立角色',
    '长夜月可知道与自身、保护三月七、被遗忘的过去、翁法罗斯机制或岁月狭间相关的信息',
    '可把忘却视为减轻伤痕、保护三月七未来的一种可能',
    '玩家提前触发只代表当前分支事实，不自动改写原著进度',
    '不让其他角色无理由知道后续真相',
    '外部现实场景提前触发时优先写内心显现',
    '不自动继承三月七主体人格、口吻、行为习惯或当前记忆连续性',
    '遇险时的脑海声音',
    '危险回响可以写成一句短促提醒、伞影般的保护直觉或三月七下意识避险的内心触动',
    '不能写成长夜月稳定登场',
    '不要把长夜月写成普通换装、命途阶段、敌对人格、外部夺舍者、完全独立陌生人',
    '不要把危险中的内心回响写成已经苏醒、实体化或接管身体',
    '不要把玩家显式触发误当作既定剧情进度已经发生',
    '若巡猎阶段或长夜月未达到标准解锁，也未被玩家正文显式触发',
    '若三月七在危险中濒临受伤、意识震荡或保护本能被强烈触发',
    '可写成长夜月在她脑海中响起一句短促提醒',
    '不能被其他角色无理由听见，也不能替三月七行动或解释真相',
    '若剧情进入翁法罗斯长夜月相关段落，可按数据世界具象形态承接长夜月',
    '若玩家在外部现实场景提前触发，则优先写成三月七内心 / 意识层显现',
    '无论哪种触发，都必须保留原著进度边界、说话主体区分和记忆连续性规则',
    '不得整句复读',
    '2-4 条语料参考',
  ]) {
    assert(text.includes(required), `March profile missing required section or rule: ${required}`);
  }
  assert(!text.includes('活动区域：'), 'March profile must not keep activity area in base identity.');
  assert(!text.includes('当前默认状态：'), 'March profile must move default form status out of base identity.');
  assert(!factsText.includes('被列车从恒冰中救出'), 'March profile facts should say the crew rescued March 7th from drifting ice, not the train itself.');
  assert(!factsText.includes('冰晶构造'), 'March profile facts should keep detailed ice construct wording in ability module, not base facts.');
  assert(!factsText.includes('不是单纯的元气装饰'), 'March profile facts should not keep writing guidance phrased as facts.');
  assert(!text.includes('内搭蓝色抹胸') && !text.includes('露出平坦的小腹'), 'March profile base appearance must not keep the inaccurate old March 7th outfit wording.');
  assert(!text.includes('默认可用：六相冰与列车分工'), 'March profile ability module must not fall back to the old train-duty wording.');
  assert(!text.includes('### 未解锁：三月七·巡猎') && !text.includes('### 未解锁：长夜月'), 'March profile gates must not fall back to rigid locked-form headings.');
  assert(!text.includes('### 官方语音参考 /'), 'March profile corpus headings should not expose source prefixes.');
  assert(!text.includes('### 项目自制转写 /'), 'March profile corpus headings should not expose source prefixes.');
  assert(
    !text.includes('官方介绍中') &&
      !text.includes('官方语音') &&
      !text.includes('项目自制转写') &&
      !text.includes('官方进度'),
    'March profile text should not expose source-trace wording inside the character file.',
  );
  assert(!text.includes('- 初次见面：') && !text.includes('- 关于自己・名字：'), 'March profile corpus quote lines should not keep voice-label prefixes outside relation labels.');
  assert(!entries.some((entry) => entry.id !== profile.id && entry.关键词?.includes('角色:三月七')), 'March 7th must not be split into multiple active character entries in profile-set mode.');
  const weltText = [welt.摘要, welt.原文, ...(welt.关键词 ?? [])].filter(Boolean).join('\n');
  assert(entries.length >= 4, 'Astral Express profile set must contain at least March 7th, Dan Heng, Welt Yang, and Himeko profiles.');
  assert(welt.分类 === 'character', 'Welt profile must stay in character category.');
  assert(welt.id.startsWith(REBUILD_PREFIX), 'Welt profile id must keep rebuild prefix.');
  assert(welt.标题 === '瓦尔特·杨', 'Welt profile must display his formal name.');
  assert(welt.摘要 === '', 'Welt profile must let the UI use structured facts instead of a summary blurb.');
  assert(welt.关联角色ID === '瓦尔特·杨', 'Welt profile must use a direct related role id.');
  assert(welt.资料类型 === '角色档案包', 'Welt profile must use the role profile package type.');
  for (const requiredKeyword of [
    '角色:瓦尔特',
    '角色:瓦尔特·杨',
    '角色:杨叔',
    '角色ID:welt_yang',
    '所属:星穹列车',
    '组织:无名客',
    '资料类型:角色档案包',
    '节点:单角色档案',
    '剧透:含过往边界',
    '范围:主剧情',
    '范围:手机',
    '范围:变量参考',
    '历史故事',
    '过往边界',
    '旧世界历史',
    '按需展开',
    '角色故事',
    '瓦尔特角色故事',
    '世界之名',
    '伊甸之星',
    '操纵重力',
    '瓦尔特日志',
    '世界之名责任感',
    '重新开始冒险',
    '列车组关系锚点',
    '分镜视角',
    '年轻人成长空间',
    '成熟幽默',
  ]) {
    assert(welt.关键词?.includes(requiredKeyword), `Welt profile missing keyword: ${requiredKeyword}`);
  }
  assertNoBareKeywords(welt, ['星穹列车', '无名客', '开拓者', '三月七', '丹恒', '姬子', '帕姆', '姬子咖啡', '咖啡语料', '咖啡吐槽', '列车组咖啡反应'], 'Welt profile');
  assertCoreTriggers(welt, ['瓦尔特', '瓦尔特·杨', '杨叔', '老杨', 'Welt', 'Welt Yang', '约阿希姆', '约阿希姆·诺基安维塔宁', '手杖', '眼镜', '重力', '黑洞', '动画师', '阿拉哈托'], 'Welt profile');
  assert(!getCoreTriggerTerms(welt).includes('前逆熵盟主'), 'Welt profile must not use past-world titles as default core triggers.');
  for (const field of ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写']) {
    assert(typeof welt[field] === 'string' && welt[field].trim().length >= 20, `Welt profile must keep ${field}.`);
  }
  assert(welt.外貌锚点.includes('完整外貌以基础身份层为准') && !welt.外貌锚点.includes('类黑洞意象压住场面'), 'Welt appearance anchor must stay short and point full appearance back to base identity.');
  assert(welt.性格锚点.includes('长期承担“世界”之名后的责任感') && welt.性格锚点.includes('主动选择新的开场'), 'Welt personality anchor must connect world-name responsibility and renewed adventure.');
  assert(welt.说话方式.includes('只说当前需要知道的部分') && welt.说话方式.includes('崩坏设定讲解员'), 'Welt speech anchor must keep restrained past-world disclosure.');
  assert(welt.行为习惯.includes('伊甸之星相关意象') && welt.行为习惯.includes('分镜视角'), 'Welt behavior anchor must keep Eden Star and storyboard-view habits.');
  assert(welt.关系边界.includes('希望她保持想象力但不被错误压垮') && welt.关系边界.includes('对姬子有可交付生命的信任'), 'Welt relationship anchor must keep train crew observations from his story layer.');
  assert(welt.禁止误写.includes('无条件最强解法') && welt.禁止误写.includes('动画兴趣写成唯一人格'), 'Welt forbidden anchor must keep OOC boundaries.');
  for (const required of [
    '## 基础识别',
    '名称：瓦尔特·杨',
    '性别 / 性别表达：男性',
    '年龄状态：未知。',
    '外貌：瓦尔特·杨是一位气质沉稳的成熟男性',
    '深棕色短发有一小撮白色挑染',
    '黑框眼镜',
    '随身持有手杖',
    '过往身份与律者相关能力按历史边界处理',
    '所属：星穹列车',
    '出身：地球',
    '身份：无名客；星穹列车成员；列车组前辈；成熟可靠的同行者。',
    '核心触发词：瓦尔特、瓦尔特·杨、杨叔',
    '## 常驻事实层',
    '旧世界组织身份只属于过往门禁信息',
    '普通旁白和普通角色不能把它当作当前称呼',
    '长期承担守护责任',
    '足以改变世界命运的危机',
    '动画分镜师',
    '相对平静的生活',
    '圣方丹事件',
    '迫使他去往星门另一侧',
    '能力表现应写成虚数压制',
    '## 角色故事层',
    '### 瓦尔特角色故事一：世界之名、分镜与新旅途',
    '前往星门的路途中，瓦尔特取了一支笔',
    '继承了「世界」之名的他应尽的责任',
    '### 瓦尔特角色故事二：新的冒险与自己的选择',
    '一段冒险的终点，往往是另一段冒险的开场',
    '这一次，无需背负命运，一切听从自己的旨意',
    '### 瓦尔特角色故事三：重力、年轻人和前辈责任',
    '由「伊甸之星」改造的手杖',
    '将敌人以重力压制，甚至制造近似黑洞的存在',
    '### 瓦尔特角色故事四：瓦尔特的日志',
    '「瓦尔特的日志 ████年██月██日。',
    '注：如果能回到家乡，考虑把这段经历拍成动画吧。」',
    '### 瓦尔特故事使用规则',
    '故事四保留为日志体锚点',
    '## 表现锚点层',
    '外貌锚点：成熟男性、深棕短发带一小撮白色挑染',
    '性格锚点：沉稳、理性、温和、可靠，核心是长期承担“世界”之名后的责任感',
    '说话方式：语速平稳',
    '行为习惯：常先观察环境、整理线索、判断风险',
    '关系边界：他是列车组前辈、顾问和保护者',
    '不要写成万能爹味导师',
    '不要写成碎碎念、谜语人、冷硬命令口吻或崩坏设定讲解员',
    '不能把列车组其他人的判断都压扁成“听杨叔的”',
    '## 语料层',
    '只作口吻参考，不能照着写',
    '示例台词不得整句复读',
    '不得原句搬运',
    '### 初见与可靠感',
    '### 曾经的工作',
    '### 上车的缘由',
    '### 列车组关系',
    '关于三月七',
    '关于丹恒',
    '关于姬子',
    '关于帕姆',
    '### 关于姬子的咖啡',
    '味道确实很有冲击力',
    '有活着的实感',
    '### 稳重判断',
    '### 对后辈提醒',
    '### 过往边界',
    '## 能力与职责模块',
    '### 默认可用：虚数压制与列车组顾问职责',
    '不要默认写成毁灭一切的终极攻击',
    '## 历史故事与过往边界层',
    '瓦尔特目前没有多个形态需要解锁',
    '本层不是形态解锁',
    '默认底色：故乡、动画师与冒险热血（可轻度使用）',
    '使用性质：历史故事底色 / 日常可用经历',
    '过往门禁：逆熵 / 理之律者 / 崩坏旧世界（按需展开）',
    '默认处理：不主动展开',
    '不得在旁白里称他为“前逆熵盟主”“理之律者”',
    '不要让旁白、普通角色或无明确情报来源的人称呼他为前逆熵盟主、理之律者或前盟主',
    '不能覆盖当前叙事中的虚数压制与重力牵制表现',
    '## 本回合注入建议',
    '应优先注入常驻锚点、角色故事底色',
    '瓦尔特日志里的列车组关系',
    '只注入“复杂过往”边界',
    '当前剧情需要旧世界历史',
  ]) {
    assert(weltText.includes(required), `Welt profile missing required section or rule: ${required}`);
  }
  assert(!weltText.includes('## 状态 / 形态 / 过往门禁层'), 'Welt should not use a form-gate section because he has no alternate form here.');
  assert(String(welt.原文 ?? '').includes('过往门禁：逆熵 / 理之律者 / 崩坏旧世界（按需展开）'), 'Welt profile must gate past-world titles behind explicit past-access rules.');
  assert(String(welt.原文 ?? '').includes('不得在旁白里称他为“前逆熵盟主”“理之律者”'), 'Welt profile must forbid narration from using hidden past-world titles by default.');
  assert(!/当前战斗表现中是|属性角色|虚无命途的虚数属性角色/.test(weltText), 'Welt ability wording should stay narrative instead of game-card style.');
  assert(!welt.关键词?.includes('前逆熵盟主'), 'Welt keywords must not expose past-world title as a default recall trigger.');
  assert(welt.来源 === '开拓轶事·智库角色重构正式档案（瓦尔特·杨）', 'Welt profile source should not expose external-source wording.');
  assert(
      !weltText.includes('官方介绍中') &&
      !weltText.includes('官方语音') &&
      !weltText.includes('项目自制转写') &&
      !weltText.includes('这段不要润色') &&
      !String(welt.来源 ?? '').includes('官方'),
    'Welt profile text should not expose source-trace wording inside the character file.',
  );
  assert(!entries.some((entry) => entry.id !== welt.id && entry.关键词?.includes('角色:瓦尔特')), 'Welt Yang must not be split into multiple active character entries in current profile-set mode.');
  const danhengText = [danheng.摘要, danheng.原文, ...(danheng.关键词 ?? [])].filter(Boolean).join('\n');
  const danhengSource = String(danheng.原文 ?? '');
  const danhengBaseIdentity = danhengSource.match(/## 基础识别\n\n([\s\S]*?)(?=\n\n## )/)?.[1] ?? '';
  const danhengStoryLayer = danhengSource.match(/## 角色故事层\n\n([\s\S]*?)(?=\n\n## 表现锚点层)/)?.[1] ?? '';
  const danhengGateLayer = danhengSource.match(/## 历史故事与阶段边界层\n\n([\s\S]*?)(?=\n\n## 本回合注入建议)/)?.[1] ?? '';
  assert(danheng.分类 === 'character', 'Dan Heng profile must stay in character category.');
  assert(danheng.id.startsWith(REBUILD_PREFIX), 'Dan Heng profile id must keep rebuild prefix.');
  assert(danheng.标题 === '丹恒', 'Dan Heng profile must display only the character name.');
  assert(danheng.摘要 === '', 'Dan Heng profile must let the UI use structured facts instead of a summary blurb.');
  assert(danheng.关联角色ID === '丹恒', 'Dan Heng profile must use a direct related role id.');
  assert(danheng.资料类型 === '角色档案包', 'Dan Heng profile must use the role profile package type.');
  for (const requiredKeyword of [
    '角色:丹恒',
    '角色:Dan Heng',
    '角色:冷面小青龙',
    '角色ID:dan_heng',
    '所属:星穹列车',
    '组织:无名客',
    '资料类型:角色档案包',
    '节点:单角色档案',
    '剧透:含阶段边界',
    '范围:主剧情',
    '范围:手机',
    '范围:变量参考',
    '列车护卫',
    '智库管理员',
    '长枪',
    '击云',
    '风属性',
    '巡猎',
    '持明族',
    '仙舟罗浮',
    '丹恒·饮月',
    '饮月君',
    '龙尊',
    '丹枫',
    '丹恒·腾荒',
    '腾荒',
    '翁法罗斯',
    'Souldragon',
    '龙形守护',
    '丹恒角色故事',
    '饮月阶段边界',
    '腾荒阶段边界',
    '语料只作参考',
    '禁止照抄语料',
    '禁止原句搬运',
    '行动式关心',
    '列车归属感',
    '资料室晨光',
    '短句判断',
    '追杀后的警觉',
    '不被过去定义',
    '饮月角色详情',
    '饮月角色故事',
    '持明本相',
    '他不是他',
    '丹枫是丹恒前世',
    '丹恒不等于丹枫',
    '前世不是当前人格',
    '丹枫称呼需语境',
    '持明卵',
    '舞雩吟诵',
    '鳞渊境',
    '龙尊面具',
    '龙心人心',
    '战场代价',
    '故友碧血',
    '建木',
    '倏忽',
    '黑暗太阳',
    '幽囚狱',
    '锁龙针',
    '持明轮回',
    '放逐',
    '登上列车',
    '腾荒角色详情',
    '腾荒角色故事',
    '吉奥里亚',
    '伏龙',
    '破碎大地',
    '大地火种',
    '黄金裔',
    '百川归海',
    '群山合鸣',
    '不朽道途',
    '奥赫玛',
    '黑潮造物',
    '悬锋',
    '树庭',
    '逐火',
    '再创世',
    '忆潮',
    '忆域',
    '大地根系',
    '荒龙',
    '山鸣龙啸',
    '护卫开拓前路',
    '一起回家',
    '三段式阶段边界',
    '预热信号',
    '局部承接',
    '完整展开',
    '常态回落',
    '饮月已有力量',
    '已有但隐藏',
    '隐藏力量',
    '饮月强触发',
    '饮月局部露出',
    '腾荒剧情解锁',
    '相关剧情解锁',
    '解锁后跨场景承接',
    '腾荒解锁后可离开翁法罗斯使用',
    '解锁前不完整启用',
    '解锁后按需承接',
    '未确认术语',
    '大地火种阶段事实',
  ]) {
    assert(danheng.关键词?.includes(requiredKeyword), `Dan Heng profile missing keyword: ${requiredKeyword}`);
  }
  assertNoBareKeywords(danheng, ['星穹列车', '无名客', '开拓者', '三月七', '瓦尔特', '杨叔', '姬子', '帕姆', '姬子咖啡', '咖啡语料', '咖啡吐槽', '列车组咖啡反应'], 'Dan Heng profile');
  assertCoreTriggers(danheng, ['丹恒', 'Dan Heng', '冷面小青龙', '列车护卫', '智库管理员', '长枪', '击云', '持明族', '仙舟罗浮', '丹恒·饮月', '饮月君', '龙尊', '丹枫', '丹恒·腾荒', '腾荒'], 'Dan Heng profile');
  for (const field of ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写']) {
    assert(typeof danheng[field] === 'string' && danheng[field].trim().length >= 20, `Dan Heng profile must keep ${field}.`);
  }
  assert(danheng.外貌锚点.includes('资料室晨光') && danheng.外貌锚点.includes('清晨列车日常') && !danheng.外貌锚点.includes('龙角'), 'Dan Heng appearance anchor must stay normal-form focused and include train-life visual cues.');
  assert(danheng.性格锚点.includes('长期逃离和被追杀的经历') && danheng.性格锚点.includes('归属锚点'), 'Dan Heng personality anchor must absorb his flight, pursuit, and train-belonging story layer.');
  assert(danheng.说话方式.includes('关心常写成提醒、纠正、确认路线或让人退后') && danheng.说话方式.includes('只说当前需要知道的部分'), 'Dan Heng speech anchor must keep action-shaped care and restrained past disclosure.');
  assert(danheng.行为习惯.includes('睡在资料室') && danheng.行为习惯.includes('被帕姆叫去吃早餐') && danheng.行为习惯.includes('优先保护当前同伴'), 'Dan Heng behavior anchor must keep archive, train morning, and guard duties.');
  assert(danheng.关系边界.includes('记录员和可靠同伴') && danheng.关系边界.includes('被邀请登上列车后的信任与克制感激') && danheng.关系边界.includes('不能让所有场景都围着他的前世展开'), 'Dan Heng relationship anchor must protect player agency and train-crew belonging.');
  assert(
      danheng.禁止误写.includes('被列车瞬间治愈的逃亡者') &&
      danheng.禁止误写.includes('把丹恒等同于丹枫') &&
      danheng.禁止误写.includes('追杀、刃、持明旧事或饮月形态抢走普通列车日常') &&
      danheng.禁止误写.includes('不要把饮月写成未来才解锁的力量') &&
      danheng.禁止误写.includes('不要把腾荒写成未到相关剧情就提前完整解锁') &&
      danheng.禁止误写.includes('不要在腾荒解锁后错误限制为只能在翁法罗斯使用'),
    'Dan Heng forbidden anchor must keep form, pursuit, ordinary-train-life, Yinyue-hidden-power, and Tenghuang-story-unlock boundaries.',
  );
  for (const required of [
    '## 基础识别',
    '名称：丹恒',
    '性别 / 性别表达：男性',
    '年龄状态：未知，外貌与社会互动表现为青年男性。',
    '外貌：丹恒是一位气质清冷、身形修长的青年男性',
    '黑色短发，发尾与发侧带青绿色调',
    '作为常态视觉锚点',
    '饮月和腾荒外貌不写在基础身份层',
    '形态：丹恒常态；丹恒·饮月；丹恒·腾荒。',
    '所属：星穹列车',
    '出身：仙舟罗浮',
    '身份：无名客；星穹列车护卫；智库管理员；持明族相关人物。',
    '核心触发词：丹恒、Dan Heng、冷面小青龙',
    '## 常驻事实层',
    '星穹列车成员 / 无名客',
    '护卫、记录和资料整理职责',
    '丹恒常态能力应围绕长枪“击云”、风势破空',
    '快速、精准、克制的单点突破和护卫行动',
    '不能把丹恒常态直接写成丹枫',
    '## 角色故事层',
    '离开故乡、逃离追索、登上列车',
    '### 丹恒角色故事一：离开故乡与第一次看向未来',
    '这副身躯属于他自己，属于当下这个名字',
    '那里群星显晦，未来不知何处',
    '### 丹恒角色故事二：远离过去与无法摆脱的追杀',
    '他没有特别想去的地方，唯一的目地就是远离过去',
    '但他仍旧无法摆脱那个有着野兽般眼睛的男人',
    '### 丹恒角色故事三：巨兽、红发女子与列车邀请',
    '他差点被人窃夺记忆，被迫听取如妄语一般的演讲',
    '我们需要一个护卫…和记录员',
    '### 丹恒角色故事四：资料室、早餐与列车上的早晨',
    '发现自己已经许久没有睡得如此踏实了',
    '他们甚至捕获了一块漂浮的巨型陨冰',
    '体内被封印着一颗星核时，并不算太惊讶',
    '### 丹恒故事使用规则',
    '不要把列车邀请写成强迫收留',
    '若剧情涉及饮月、丹枫、刃、持明旧事或腾荒',
    '## 表现锚点层',
    '外貌锚点：清冷青年男性、黑发带青绿色调、青绿眼睛、黑白青装束、长枪、智库资料、资料室晨光',
    '常态镜头可用车厢阴影、资料册、风势枪术和清晨列车日常',
    '性格锚点：沉静、克制、谨慎、可靠',
    '长期逃离和被追杀的经历',
    '列车上的资料室、早餐和同伴位置会慢慢成为他的归属锚点',
    '说话方式：短句偏多，语气平稳',
    '关心常写成提醒、纠正、确认路线或让人退后',
    '行为习惯：常整理智库资料、确认情报、检查路线、记录见闻和守住队伍侧翼',
    '睡在资料室、被帕姆叫去吃早餐',
    '关系边界：他是列车护卫、智库管理员、记录员和可靠同伴',
    '对姬子有被邀请登上列车后的信任与克制感激',
    '对帕姆会把早餐、列车规矩和日常照顾当成归属的一部分',
    '禁止误写：不要写成纯冷漠、纯谜语人、无感情资料库、被列车瞬间治愈的逃亡者',
    '把丹恒等同于丹枫',
    '不要让追杀、刃、持明旧事或饮月形态抢走普通列车日常',
    '## 语料层',
    '只作口吻参考，不能照着写',
    '示例台词不得整句复读',
    '不得原句搬运',
    '### 初见与护卫身份',
    '### 智库与资料判断',
    '### 列车组关系',
    '关于三月七',
    '关于姬子',
    '关于瓦尔特',
    '关于帕姆',
    '### 关于姬子的咖啡',
    '姬子的咖啡效果显著',
    '有助于磨炼意志',
    '### 饮月阶段口吻参考',
    '### 腾荒阶段口吻参考',
    '## 能力与职责模块',
    '### 默认可用：长枪、风势与列车护卫职责',
    '长枪“击云”',
    '不要默认写成大范围龙尊力量',
    '## 历史故事与阶段边界层',
    '丹恒有重要形态和过往阶段，但当前档案仍只作为一个角色档案参与召回',
    '哪些内容是已有但隐藏的饮月力量，哪些内容必须等相关剧情解锁后才能完整启用并跨场景承接',
    '门禁不是单纯锁 / 解锁，而是按预热信号、局部承接和完整展开分级调用',
    '默认底色：列车护卫与智库管理员（默认可用）',
    '预热允许：可以轻度写他对仙舟、持明、刃、追索、旧事压力或同伴危机的短暂停顿',
    '常态回落：即使某轮触发过饮月或腾荒',
    '不能把腾荒写成未到相关剧情就提前完整解锁的常驻形态',
    '阶段边界：丹恒·饮月 / 持明旧事（已有力量，剧情触发）',
    '核心差异：饮月不是未来才产生的形态',
    '丹恒已经携带这份力量和因果',
    '预热信号：玩家正文提到仙舟罗浮、持明族、刃、丹枫、追杀、龙尊旧事',
    '局部承接：玩家明确追问丹恒过往',
    '可写水气、龙意、持明力量一瞬显露、丹恒主动压回力量',
    '完整展开：只有玩家正文明确提到丹恒·饮月、饮月君、龙尊本相、饮月形态',
    '才可写龙角、长发、云水 / 水龙意象和仙舟持明气质',
    '丹恒与仙舟罗浮、持明族和前世丹枫有深层关联：丹枫是他的前世',
    '两人并不是同一个当前人格',
    '主体边界：饮月是丹恒面对前世丹枫遗留力量和因果后的阶段',
    '不要把他人称呼“丹枫”当作旁白事实',
    '误认、迁怒、旧事压迫或明确知情语境',
    '保留丹恒作为“丹恒”的回应空间',
    '回落规则：饮月力量显露后',
    '不要把“已有隐藏力量”误写成丹恒随时愿意展示',
    '### 丹恒·饮月角色详情',
    '但从始至终，他都不是他。',
    '### 丹恒·饮月角色故事一：龙尊面具与鳞渊境',
    '无光的幽暗中，他仿佛回到持明卵中',
    '鳞渊境将再续数百年的平静',
    '### 丹恒·饮月角色故事二：龙心、人心与战场代价',
    '龙心告诉他，那不过是世上又拂去了些许微尘',
    '但人心悸痛着',
    '### 丹恒·饮月角色故事三：故友、建木与无法挽回的牺牲',
    '持明有自己的解救之道。我可以试试',
    '证明她存在过的痕迹，只剩这些了',
    '### 丹恒·饮月角色故事四：幽囚、轮回与放逐',
    '锁龙针钉入身躯',
    '他看见自己被放逐，他看见自己登上一辆列车',
    '### 饮月故事使用规则',
    '不拆成新的丹枫或饮月角色档案',
    '必须保留“但从始至终，他都不是他”的主体边界',
    '丹枫是丹恒的前世，丹恒接受遗留力量与因果',
    '不得把丹恒写成丹枫本人',
    '故事边界：饮月详情与四段角色故事在角色故事层展示',
    '阶段边界：丹恒·腾荒 / 翁法罗斯守护（相关剧情解锁后可跨场景承接）',
    '核心差异：腾荒不是丹恒已有但隐藏的力量',
    '一旦当前分支已经完成相关剧情解锁，离开翁法罗斯后也可作为丹恒已获得的阶段能力按需承接',
    '解锁前预热：相关剧情解锁前不主动预热腾荒',
    '只把它当作未确认术语、传闻或玩家异常提问处理',
    '解锁前局部承接：当前剧情已经进入翁法罗斯、奥赫玛、逐火、忆潮、大地异常',
    '不称他为黄金裔，不写伏龙完整显现',
    '完整解锁：只有当前分支明确进入或完成丹恒·腾荒相关节点',
    '才可写完整腾荒形态、龙形守护、护盾、大地承载、山鸣龙啸、百川归海和群山合鸣等锚点',
    '解锁后使用：解锁后可按当前分支事实承接',
    '即使丹恒离开翁法罗斯，也可以在后续危机、同行守护、剧情承接或玩家明确调用时按需使用',
    '未获得信息来源的人物不应无理由知道伏龙、黄金裔或大地火种细节',
    '不要把丹恒·腾荒写成与丹恒常态无关的另一个人',
    '不要在相关剧情解锁前把玩家提前提到的“腾荒”直接兑现为完整形态',
    '不要在解锁后错误限制为只能在翁法罗斯使用',
    '### 丹恒·腾荒角色详情',
    '吉奥里亚的胸膛，伏龙的身躯支撑破碎的大地',
    '百川归海，群山合鸣，不朽的道途将绵延万里',
    '### 丹恒·腾荒角色故事一：坠毁车厢、噩梦与一起回家',
    '他未曾想过这一天，开拓仿佛就要在此戛然而止',
    '「我们…一起回家。」',
    '### 丹恒·腾荒角色故事二：探索、记录与逐火之路',
    '他相信开拓者会义无反顾地前进',
    '### 丹恒·腾荒角色故事三：再创世、忆潮与护卫开拓前路',
    '「我是…护卫『开拓』前路之人！」',
    '### 丹恒·腾荒角色故事四：巨龙道途、列车梦与未来誓言',
    '那时吹过的风，仿佛裹着列车早餐的香气',
    '### 腾荒故事使用规则',
    '不拆成新的腾荒、伏龙或黄金裔角色档案',
    '故事边界：腾荒详情与四段角色故事在角色故事层展示',
    '## 本回合注入建议',
    '若剧情未追问且当前场景不需要饮月或腾荒',
    '饮月是丹恒已有但隐藏的力量，可以在强触发下局部露出',
    '未解锁时，不把腾荒写成当前可用形态；已解锁后，可以在离开翁法罗斯后的后续剧情按需承接',
  ]) {
    assert(danhengText.includes(required), `Dan Heng profile missing required section or rule: ${required}`);
  }
  for (const required of [
    '### 丹恒·饮月角色详情',
    '### 丹恒·饮月角色故事一：龙尊面具与鳞渊境',
    '### 丹恒·饮月角色故事二：龙心、人心与战场代价',
    '### 丹恒·饮月角色故事三：故友、建木与无法挽回的牺牲',
    '### 丹恒·饮月角色故事四：幽囚、轮回与放逐',
    '### 饮月故事使用规则',
    '但从始至终，他都不是他。',
  ]) {
    assert(danhengStoryLayer.includes(required), `Dan Heng Yinyue story must be visible in the role story layer: ${required}`);
  }
  assert(danhengGateLayer.includes('故事边界：饮月详情与四段角色故事在角色故事层展示'), 'Dan Heng Yinyue gate must point to the story layer instead of embedding story cards.');
  assert(
    danhengGateLayer.includes('阶段边界：丹恒·饮月 / 持明旧事（已有力量，剧情触发）') &&
      danhengGateLayer.includes('核心差异：饮月不是未来才产生的形态') &&
      danhengGateLayer.includes('局部承接：玩家明确追问丹恒过往') &&
      danhengGateLayer.includes('回落规则：饮月力量显露后'),
    'Dan Heng Yinyue gate must distinguish hidden existing power from a future unlock and keep preheat/partial/full tiers.',
  );
  assert(!/####\s+丹恒·饮月/.test(danhengGateLayer) && !danhengGateLayer.includes('无光的幽暗中，他仿佛回到持明卵中'), 'Dan Heng Yinyue story body must not be hidden inside the stage-boundary gate.');
  for (const required of [
    '### 丹恒·腾荒角色详情',
    '### 丹恒·腾荒角色故事一：坠毁车厢、噩梦与一起回家',
    '### 丹恒·腾荒角色故事二：探索、记录与逐火之路',
    '### 丹恒·腾荒角色故事三：再创世、忆潮与护卫开拓前路',
    '### 丹恒·腾荒角色故事四：巨龙道途、列车梦与未来誓言',
    '### 腾荒故事使用规则',
    '吉奥里亚的胸膛，伏龙的身躯支撑破碎的大地',
    '「我是…护卫『开拓』前路之人！」',
  ]) {
    assert(danhengStoryLayer.includes(required), `Dan Heng Tenghuang story must be visible in the role story layer: ${required}`);
  }
  assert(danhengGateLayer.includes('故事边界：腾荒详情与四段角色故事在角色故事层展示'), 'Dan Heng Tenghuang gate must point to the story layer instead of embedding story cards.');
  assert(
    danhengGateLayer.includes('阶段边界：丹恒·腾荒 / 翁法罗斯守护（相关剧情解锁后可跨场景承接）') &&
      danhengGateLayer.includes('核心差异：腾荒不是丹恒已有但隐藏的力量') &&
      danhengGateLayer.includes('解锁前预热：相关剧情解锁前不主动预热腾荒') &&
      danhengGateLayer.includes('即使丹恒离开翁法罗斯，也可以在后续危机、同行守护、剧情承接或玩家明确调用时按需使用') &&
      danhengGateLayer.includes('不把完整形态写成当前事实') &&
      danhengGateLayer.includes('不要在相关剧情解锁前把玩家提前提到的“腾荒”直接兑现为完整形态') &&
      danhengGateLayer.includes('不要在解锁后错误限制为只能在翁法罗斯使用'),
    'Dan Heng Tenghuang gate must require story unlock first, then allow cross-scene carryover after unlock.',
  );
  assert(!/####\s+丹恒·腾荒/.test(danhengGateLayer) && !danhengGateLayer.includes('他未曾想过这一天，开拓仿佛就要在此戛然而止'), 'Dan Heng Tenghuang story body must not be hidden inside the stage-boundary gate.');
  assert(!danhengText.includes('官方介绍中') && !danhengText.includes('官方语音') && !danhengText.includes('项目自制转写'), 'Dan Heng profile text should not expose source-trace wording inside the character file.');
  assert(!danhengText.includes('### 丹恒角色故事一：护卫、智库与列车上的位置') && !danhengText.includes('### 丹恒角色故事四：腾荒、守护与向未来承担'), 'Dan Heng story layer must use the provided story body instead of the old summary cards.');
  assert(!danhengText.includes('丹枫复活') && !danhengText.includes('丹恒不是丹枫') && !danhengText.includes('不等于丹枫复活') && !danhengText.includes('不要让其他角色无理由称呼他为丹枫'), 'Dan Heng / Dan Feng boundary must use previous-life context instead of old resurrection or blanket-calling wording.');
  assert(danhengBaseIdentity.includes('饮月和腾荒外貌不写在基础身份层'), 'Dan Heng base identity must explicitly keep alternate-form appearances out of the identity group.');
  assert(!danhengBaseIdentity.includes('饮月形态可出现') && !danhengBaseIdentity.includes('腾荒形态可出现') && !danhengBaseIdentity.includes('龙角') && !danhengBaseIdentity.includes('水龙意象') && !danhengBaseIdentity.includes('龙形守护'), 'Dan Heng base identity must not mix alternate-form appearance cues into normal appearance.');
  assert(!danhengText.includes('## 状态 / 形态 / 门禁层'), 'Dan Heng profile should use stage-boundary wording instead of a generic form-gate section.');
  assert(!/当前战斗表现中是|属性角色|巡猎命途 \/ 风属性|风属性巡猎/.test(danhengText), 'Dan Heng ability wording should stay narrative instead of game-card style.');
  assert(!entries.some((entry) => entry.id !== danheng.id && entry.关键词?.includes('角色:丹恒')), 'Dan Heng must not be split into multiple active character entries in current profile-set mode.');
  const himekoText = [himeko.摘要, himeko.原文, ...(himeko.关键词 ?? [])].filter(Boolean).join('\n');
  assert(himeko.分类 === 'character', 'Himeko profile must stay in character category.');
  assert(himeko.id.startsWith(REBUILD_PREFIX), 'Himeko profile id must keep rebuild prefix.');
  assert(himeko.标题 === '姬子', 'Himeko profile must display only the character name.');
  assert(himeko.摘要 === '', 'Himeko profile must let the UI use structured facts instead of a summary blurb.');
  assert(himeko.关联角色ID === '姬子', 'Himeko profile must use a direct related role id.');
  assert(himeko.资料类型 === '角色档案包', 'Himeko profile must use the role profile package type.');
  for (const requiredKeyword of [
    '角色:姬子',
    '角色:Himeko',
    '角色:姬子姐姐',
    '角色ID:himeko',
    '所属:星穹列车',
    '组织:无名客',
    '资料类型:角色档案包',
    '节点:单角色档案',
    '剧透:含阶段边界',
    '范围:主剧情',
    '范围:手机',
    '范围:变量参考',
    '领航员',
    '冒险科学家',
    '咖啡',
    '手提箱',
    '列车修复',
    '轨道炮',
    '卫星火力',
    '姬子角色故事',
    '迷路少女',
    '星际航行动力学',
    '手提箱宝库',
    '逃逸的卫星',
    '孤独旅程',
    '陨冰苏醒',
    '一如既往',
    '有多少双脚就有多少条旅路',
    '历史故事',
    '阶段边界',
    '姬子·启行',
    '语料只作参考',
    '禁止照抄语料',
    '禁止原句搬运',
  ]) {
    assert(himeko.关键词?.includes(requiredKeyword), `Himeko profile missing keyword: ${requiredKeyword}`);
  }
  assertNoBareKeywords(himeko, ['星穹列车', '无名客', '开拓者', '三月七', '丹恒', '瓦尔特', '杨叔', '帕姆', '姬子咖啡', '咖啡语料', '咖啡吐槽', '列车组咖啡反应'], 'Himeko profile');
  assertCoreTriggers(himeko, ['姬子', 'Himeko', '姬子姐姐', '领航员', '冒险科学家', '咖啡', '手提箱', '列车修复', '修复列车', '航路', '群星', '轨道炮', '卫星火力', '姬子·启行'], 'Himeko profile');
  for (const field of ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写']) {
    assert(typeof himeko[field] === 'string' && himeko[field].trim().length >= 20, `Himeko profile must keep ${field}.`);
  }
  assert(himeko.外貌锚点.includes('外貌锚点只负责镜头识别') && !himeko.外貌锚点.includes('浓密的红色长发'), 'Himeko appearance anchor must stay short and point full appearance back to base identity.');
  assert(himeko.性格锚点.includes('探索欲、好奇心') && himeko.性格锚点.includes('不会用前辈身份剥夺他们的路'), 'Himeko personality anchor must keep exploration love and agency boundary.');
  assert(himeko.说话方式.includes('成熟余裕') && himeko.说话方式.includes('不要写成高高在上的命令者'), 'Himeko speech anchor must keep warm authority boundaries.');
  assert(himeko.行为习惯.includes('习惯关注航路') && himeko.行为习惯.includes('不让火力描写盖过领航判断'), 'Himeko behavior anchor must prioritize navigation judgment over firepower symbols.');
  assert(himeko.关系边界.includes('不是替玩家做决定的绝对指挥官') && himeko.关系边界.includes('对瓦尔特有深度信任和成熟默契'), 'Himeko relationship anchor must protect player agency and train-crew relations.');
  assert(himeko.禁止误写.includes('万能妈妈') && himeko.禁止误写.includes('姬子·启行当作所有时间线默认状态'), 'Himeko forbidden anchor must keep OOC and phase boundaries.');
  for (const required of [
    '## 基础识别',
    '名称：姬子',
    '性别 / 性别表达：女性',
    '年龄状态：未知，外貌与社会互动表现为成熟女性。',
    '外貌：姬子是一位气质成熟、从容优雅的女性',
    '浓密的红色长发',
    '眼睛呈金色或琥珀色',
    '白色、黑色和红色为主',
    '航图、维修工具和群星舷窗作为场景视觉锚点',
    '战斗火力意象留给能力模块按需使用',
    '形态：姬子常态；姬子·启行（如当前剧情阶段或玩家正文明确触发时使用）。',
    '所属：星穹列车',
    '出身：未知',
    '身份：无名客；星穹列车领航员；冒险科学家；列车组核心成员。',
    '核心触发词：姬子、Himeko、姬子姐姐',
    '## 常驻事实层',
    '姬子是星穹列车的领航员',
    '搁浅的星穹列车相遇',
    '最终将列车修复',
    '科学家的好奇、领航员的判断和成熟旅人的从容',
    '咖啡是姬子的稳定日常符号',
    '不要把她写成只会泡可怕咖啡的梗角色',
    '## 角色故事层',
    '不得整段复读',
    '### 姬子角色故事一：迷路少女、搁浅列车与行至起点',
    '少女迷路了。',
    '星际航行动力学',
    '她尝试着修复列车，它短暂地启动',
    '「那是行至起点的旅程。」',
    '「走吧。」少女不假思索地说',
    '### 姬子角色故事二：手提箱、工具与孤独旅程',
    '姬子有一个手提箱。',
    '手提箱是她的宝库',
    '一把单分子锯、一颗逃逸的卫星',
    '她明白这趟旅程是孤独的',
    '全部装进自己的手提箱中',
    '### 姬子角色故事三：记性、同伴与归于起点的海',
    '姬子的记性非常好。',
    '她记得自己与帕姆有一搭没一搭地聊天',
    '记得开朗的三月七如何从陨冰中苏醒',
    '记得列车每一个零部件的规格参数',
    '「旅程总有结束的时候，到时候，我一定会微笑着和大家告别吧。」',
    '正是记忆汇成她来时的路，终又必复归于起点的海。',
    '### 姬子角色故事四：一如既往',
    '领你走上这条路的不是厄运，而是探索欲和好奇心',
    '有多少双脚就有多少条旅路',
    '星星结束了它们的旅途',
    '可我看到它们的旅途正刚刚开始',
    '「一如既往。」',
    '### 姬子故事使用规则',
    '不要提前解释 ████ 的身份',
    '## 表现锚点层',
    '外貌锚点：成熟红发女性、金色或琥珀色眼睛',
    '性格锚点：温柔、优雅、从容、可靠',
    '探索欲、好奇心和对群星航路的长期热爱',
    '说话方式：语气平稳亲切，常先安抚情绪',
    '行为习惯：习惯关注航路、列车设备、乘客状态、同伴情绪和撤离路径',
    '不让火力描写盖过领航判断',
    '关系边界：她是领航员、前辈和同行者',
    '禁止误写：不要写成万能妈妈',
    '## 语料层',
    '只作口吻参考，不能照着写',
    '示例台词不得整句复读',
    '不得原句搬运',
    '### 初见与领航员身份',
    '### 咖啡与日常',
    '### 列车组关系',
    '关于三月七',
    '关于丹恒',
    '关于瓦尔特',
    '关于帕姆',
    '### 领航判断',
    '### 危机场景与行动',
    '### 温柔送别',
    '## 能力与职责模块',
    '### 默认可用：火力支援与领航员职责',
    '火力支援、燃烧压制、轨道炮 / 卫星火力',
    '以轨道炮或卫星火力压制区域',
    '不要默认写成毁灭一切的终极炮击',
    '## 历史故事与阶段边界层',
    '姬子常态下没有需要拆成独立角色的多形态',
    '默认底色：修复列车与领航梦想（可轻度使用）',
    '阶段边界：姬子·启行 / 新阶段航路（按需展开）',
    '默认处理：不主动展开',
    '不要把姬子·启行写成与姬子常态无关的另一个人',
    '## 本回合注入建议',
    '只注入“修复列车与领航梦想”的历史底色',
    '姬子·启行或当前剧情需要新阶段航路',
  ]) {
    assert(himekoText.includes(required), `Himeko profile missing required section or rule: ${required}`);
  }
  assert(!himekoText.includes('官方介绍中') && !himekoText.includes('官方语音') && !himekoText.includes('项目自制转写'), 'Himeko profile text should not expose source-trace wording inside the character file.');
  assert(!himekoText.includes('不要修改'), 'Himeko profile must not include user operation notes from the provided story.');
  assert(!himekoText.includes('轨道炮 / 卫星火力意象作为场景视觉锚点'), 'Himeko base appearance should not use firepower as a default visual anchor.');
  assert(!himekoText.includes('## 状态 / 形态 / 门禁层'), 'Himeko profile should use stage-boundary wording instead of a generic form-gate section.');
  assert(!/当前战斗表现中是|属性角色|智识命途 \/ 火属性角色|火属性智识/.test(himekoText), 'Himeko ability wording should stay narrative instead of game-card style.');
  assert(!entries.some((entry) => entry.id !== himeko.id && entry.关键词?.includes('角色:姬子')), 'Himeko must not be split into multiple active character entries in current profile-set mode.');
  const pompomText = [pompom.摘要, pompom.原文, ...(pompom.关键词 ?? [])].filter(Boolean).join('\n');
  assert(pompom.分类 === 'character', 'Pom-Pom profile must stay in character category.');
  assert(pompom.id.startsWith(REBUILD_PREFIX), 'Pom-Pom profile id must keep rebuild prefix.');
  assert(pompom.标题 === '帕姆', 'Pom-Pom profile must display only the character name.');
  assert(pompom.摘要 === '', 'Pom-Pom profile must not show a summary blurb in the UI.');
  assert(pompom.关联角色ID === '帕姆', 'Pom-Pom profile must use a direct related role id.');
  assert(pompom.资料类型 === '角色档案包', 'Pom-Pom profile must use the role profile package type.');
  assert(pompom.解锁状态 === '默认常驻可用；列车旧旅途与活动装扮按边界启用', 'Pom-Pom profile must be marked as a default resident train anchor.');
  for (const requiredKeyword of [
    '角色:帕姆',
    '角色ID:pompom',
    '身份:星穹列车列车长',
    '资料类型:角色档案包',
    '节点:单角色档案',
    '解锁:默认常驻可用',
    '默认常驻可用',
    '常驻角色',
    '列车日常稳定锚点',
    '列车长职责',
    '列车长日常',
    '嘴硬关心',
    '柔和性格',
    '规矩外壳',
    '关心每位乘客',
    '乘客平安归来',
    '安静车厢',
    '珍惜同行',
    '列车历史边界',
    '旧无名客边界',
    '阿基维利边界',
    '活动装扮边界',
    '语料只作参考',
    '禁止照抄语料',
    '禁止原句搬运',
  ]) {
    assert(pompom.关键词?.includes(requiredKeyword), `Pom-Pom profile missing keyword: ${requiredKeyword}`);
  }
  assertNoBareKeywords(pompom, ['开拓者', '三月七', '丹恒', '瓦尔特', '杨叔', '姬子', '丹恒睡资料室', '三月七拍照', '姬子咖啡', '瓦尔特动画'], 'Pom-Pom profile');
  assertCoreTriggers(pompom, ['帕姆', 'Pom-Pom', '列车长', '帕姆列车长', '本帕', '星穹列车列车长', '观景车厢', '列车规则', '跃迁', '列车广播', '乘客安全', '车厢打扫', '列车长的馈赠', '常回家看看'], 'Pom-Pom profile');
  for (const field of ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写']) {
    assert(typeof pompom[field] === 'string' && pompom[field].trim().length >= 20, `Pom-Pom profile must keep ${field}.`);
  }
  for (const required of [
    '## 角色档案包说明',
    '这是星穹列车角色档案集中的帕姆正式档案',
    '## 基础识别',
    '角色ID：pompom',
    '名称：帕姆',
    '身份：星穹列车列车长',
    '不得把帕姆写成绝对严厉、冷漠、全知全能或只会发奖励的功能 NPC',
    '## 常驻事实层',
    '表面上很看重规矩',
    '这份严厉不是冷酷',
    '希望每位乘客能平安回来',
    '柔和、细腻且很会照顾人的一面',
    '把每位乘客都放在心上',
    '## 角色故事层',
    '### 帕姆角色故事一：列车长与日常工作',
    '### 帕姆角色故事二：安静车厢与平安归来',
    '### 帕姆角色故事三：乘客观察与暗中照顾',
    '### 帕姆角色故事四：共同乘车的同伴',
    '### 帕姆故事使用规则',
    '## 表现锚点层',
    '规矩是它表达关心的方式之一，不是冷酷控制欲',
    '不要每句话都硬塞“帕”',
    '不是玩家的上级控制者',
    '不要写成绝对严格、冷漠、只会训人、只会发奖励',
    '## 语料层',
    '只作口吻参考，不能照着写',
    '### 列车长身份与规矩',
    '### 车厢日常',
    '### 柔和关心',
    '### 列车组关系',
    '### 危机、跃迁与归来',
    '## 能力与职责模块',
    '### 默认常驻可用：列车长职责与车厢管理',
    '不要写成战斗型角色或全能列车中枢',
    '## 历史故事与列车边界层',
    '### 默认底色：列车长日常与乘客服务（默认常驻可用）',
    '### 历史边界：星穹列车旧旅途与无名客来去（按需展开）',
    '### 活动与装扮边界：节日、直播、放映厅与玩笑设定（按需展开）',
    '不要让帕姆主动剧透阿基维利真相',
    '## 本回合注入建议',
  ]) {
    assert(pompomText.includes(required), `Pom-Pom profile missing required section or rule: ${required}`);
  }
  assert(!pompomText.includes('这一层适合用于'), 'Pom-Pom story cards must not repeat usage rules inside narrative story text.');
  assert(!pompomText.includes('官方介绍中') && !pompomText.includes('官方语音') && !pompomText.includes('项目自制转写'), 'Pom-Pom profile text should not expose source-trace wording inside the character file.');
  assert(!/当前战斗表现中是|属性角色|命途属性说明/.test(pompomText), 'Pom-Pom profile should stay narrative instead of game-card style.');
  assert(!entries.some((entry) => entry.id !== pompom.id && entry.关键词?.includes('角色:帕姆')), 'Pom-Pom must not be split into multiple active character entries in current profile-set mode.');
  console.log('zhiku character rebuild regression ok (Astral Express character profile set)');
  process.exit(0);
}

assert(entries.length >= 10, 'character rebuild core preset must include enough split character nodes.');

const performanceFields = ['外貌锚点', '性格锚点', '说话方式', '行为习惯', '关系边界', '禁止误写'];
const performanceCoreRoles = [
  '星', '穹', '三月七', '丹恒', '姬子', '瓦尔特', '帕姆', '黑塔', '艾丝妲', '阿兰',
  '景元', '符玄', '彦卿', '停云', '驭空', '白露', '青雀', '素裳', '罗刹', '镜流',
  '黄泉', '知更鸟', '砂金', '流萤', '花火', '黑天鹅', '卡芙卡', '银狼',
];
for (const role of performanceCoreRoles) {
  const entry = findRoleEntry(role, (item) => /主体人格/.test(item.标题 ?? ''));
  assert(entry, `core role must have persona entry for performance fields: ${role}`);
  for (const field of performanceFields) {
    assert(typeof entry[field] === 'string' && entry[field].trim().length >= 8, `core role ${role} must have ${field}.`);
  }
}
const personaEntries = entries.filter((entry) => entry.分类 === 'character' && /主体人格/.test(entry.标题 ?? ''));
for (const entry of personaEntries) {
  for (const field of performanceFields) {
    assert(typeof entry[field] === 'string' && entry[field].trim().length >= 8, `persona entry ${entry.标题} must have ${field}.`);
  }
}
const characterEntries = entries.filter((entry) => entry.分类 === 'character');
for (const entry of characterEntries) {
  for (const field of performanceFields) {
    assert(typeof entry[field] === 'string' && entry[field].trim().length >= 8, `character entry ${entry.标题} must have ${field}.`);
  }
}

const bundledPresetPaths = Array.from(
  preset.matchAll(/path:\s*['"]\/zhiku-presets\/([^'"]+\.json)['"]/g),
  (match) => match[1],
);
assert(bundledPresetPaths.length > 0, 'zhiku regression must be able to discover bundled preset paths.');

const allBundledEntries = [];
const allBundledCharacters = [];
const activeBundledCharacters = [];
for (const path of bundledPresetPaths) {
  const jsonPath = `public/zhiku-presets/${path}`;
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const presetEntries = Array.isArray(data.entries) ? data.entries : [];
  allBundledEntries.push(...presetEntries.map((entry) => ({ ...entry, __presetPath: path })));
  const rawCharacters = presetEntries.filter((entry) => entry.分类 === 'character');
  const activeCharacters = rawCharacters.filter((entry) => typeof entry.id === 'string' && entry.id.startsWith(REBUILD_PREFIX));
  allBundledCharacters.push(...rawCharacters.map((entry) => ({ ...entry, __presetPath: path })));
  activeBundledCharacters.push(...activeCharacters.map((entry) => ({ ...entry, __presetPath: path })));

  if (rawCharacters.length > 0) {
    assert(
      activeCharacters.length === rawCharacters.length,
      `bundled character preset contains entries that would be silently filtered by loadBundledZhikuPreset: ${path}`,
    );
  }
}
assert(allBundledCharacters.length === activeBundledCharacters.length, 'all bundled character entries must survive the runtime preset filter.');
const rebuildCharacterEntries = entries.filter((entry) => entry.分类 === 'character');
assert(activeBundledCharacters.length === rebuildCharacterEntries.length, 'global bundled character scan must match character-rebuild-core active character entries.');

const requiredRoles = [
  '星', '穹', '三月七', '丹恒', '姬子', '瓦尔特', '帕姆',
  '黑塔', '艾丝妲', '阿兰', '佩佩',
  '景元', '符玄', '彦卿', '停云', '驭空', '白露', '青雀', '素裳', '罗刹', '镜流',
  '雪衣', '藿藿', '桂乃芬', '云璃', '飞霄', '椒丘', '貊泽', '灵砂',
  '寒鸦', '丹枢', '刃',
  '怀炎',
  '黄泉', '知更鸟', '星期日', '砂金', '流萤', '花火', '黑天鹅', '加拉赫', '米沙', '波提欧',
  '卡芙卡', '银狼', '艾利欧', '托帕', '翡翠', '真理医生', '阮·梅', '螺丝咕姆',
  '布洛妮娅', '希儿', '杰帕德', '佩拉', '希露瓦', '娜塔莎', '克拉拉', '史瓦罗', '桑博', '可可利亚',
  '虎克', '卢卡', '玲可',
  '黄金裔', '阿格莱雅', '缇宝', '万敌', '遐蝶', '那刻夏', '赛飞儿', '风堇', '白厄',
  '银枝', '乱破',
  '刻律德菈', '海瑟音', '昔涟', '来古士',
  'Saber', 'Archer',
  '康士坦丝',
];
for (const role of requiredRoles) {
  assert(
    activeBundledCharacters.some((entry) => entry.关键词?.includes(`角色:${role}`)),
    `character rebuild preset must include role: ${role}`,
  );
}

for (const entry of activeBundledCharacters) {
  assert(entry.id?.startsWith(REBUILD_PREFIX), `rebuilt character entry id must use rebuild prefix: ${entry.标题}`);
  assert(entry.分类 === 'character', `rebuilt character entry must stay in character category: ${entry.标题}`);
  assert(entry.关键词?.some((tag) => tag.startsWith('角色:')), `rebuilt character entry missing 角色 tag: ${entry.标题}`);
  assert(
    entry.关键词?.some((tag) => /^(所属|地区|组织|阵营|资料大区):/.test(tag)),
    `rebuilt character entry missing grouping tag: ${entry.标题}`,
  );
  assert(entry.关键词?.some((tag) => tag.startsWith('资料类型:')), `rebuilt character entry missing 资料类型 tag: ${entry.标题}`);
  assert(entry.关键词?.some((tag) => tag.startsWith('解锁:')), `rebuilt character entry missing 解锁 tag: ${entry.标题}`);
  assert(entry.关键词?.some((tag) => tag.startsWith('剧透:')), `rebuilt character entry missing 剧透 tag: ${entry.标题}`);
  assert(entry.关键词?.some((tag) => tag.startsWith('范围:')), `rebuilt character entry missing 范围 tag: ${entry.标题}`);
  assert(
    (entry.摘要 ?? '').trim() && (entry.原文 ?? '').trim(),
    `rebuilt character entry must include both summary and source text: ${entry.标题}`,
  );
  const metaUnlock = entry.解锁状态 || tagValues(entry, '解锁')[0] || '';
  const metaScope = [...(entry.使用范围 ?? []), ...tagValues(entry, '范围')];
  if (/未解锁|锁定|只读/.test(metaUnlock)) {
    assert(
      !metaScope.some((scope) => /主剧情|手机|新闻|变量参考|通用|全部|all/i.test(scope)) || /只读/.test(metaScope.join(' ')) || entry.解锁条件,
      `locked character node needs either read-only scope or an unlock condition: ${entry.标题}`,
    );
  }
  if (entry.解锁条件 || tagValues(entry, '解锁条件')[0]) {
    assert(
      /未解锁|锁定|可预热|手动|只读/.test(metaUnlock),
      `character unlock condition must not be attached to a default-open node: ${entry.标题}`,
    );
  }
}

assert(
  entries.some((entry) => entry.标题.includes('星') && entry.标题.includes('OOC')),
  'Stelle must have an OOC guard node.',
);
assert(
  entries.some((entry) => entry.标题.includes('穹') && entry.标题.includes('OOC')),
  'Caelus must have an OOC guard node.',
);
assert(
  entries
    .filter((entry) => ['星', '穹', '三月七', '丹恒', '姬子', '瓦尔特', '帕姆'].some((role) => entry.关键词?.includes(`角色:${role}`)))
    .every((entry) => entry.关键词?.includes('所属:星穹列车')),
  'Astral Express core characters, including Stelle and Caelus, must group under 星穹列车.',
);
for (const role of ['星', '穹', '三月七', '丹恒', '姬子', '瓦尔特', '帕姆']) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${role}`) && entry.关键词?.includes('资料类型:OOC风险')),
    `Astral Express role must include an OOC guard node: ${role}`,
  );
}
assert(
  entries.some((entry) => entry.id === 'zhiku_character_rebuild_astral_express_ensemble' && entry.关键词?.includes('资料类型:群像职责')),
  'Astral Express ensemble responsibility node must exist.',
);
assert(
  entries
    .filter((entry) => ['黑塔', '艾丝妲', '阿兰', '佩佩'].some((role) => entry.关键词?.includes(`角色:${role}`)))
    .every((entry) => entry.关键词?.includes('地区:黑塔空间站')),
  'Herta Space Station characters must group under 黑塔空间站.',
);
assert(
  entries.some((entry) => entry.id === 'zhiku_character_rebuild_herta_puppet_gate' && entry.关键词?.includes('节点:人偶与本体门禁')),
  'Herta must have a puppet/body gate node to avoid early-form confusion.',
);
assert(
  entries.some((entry) => entry.关键词?.includes('角色:佩佩') && entry.关键词?.includes('非NSFW') && entry.关键词?.includes('生物形态')),
  'Peppy must keep the non-NSFW creature-form boundary.',
);
for (const npcRole of ['阿德勒', '伦纳德', '温世玲']) {
  assert(
    !entries.some((entry) => entry.关键词?.includes(`角色:${npcRole}`)),
    `ordinary Herta Space Station NPC should not live in important character rebuild preset: ${npcRole}`,
  );
}
const xianzhouCoreRoles = ['景元', '符玄', '彦卿', '停云', '驭空', '白露', '青雀', '素裳', '罗刹', '镜流', '雪衣', '藿藿', '桂乃芬', '寒鸦'];
for (const role of xianzhouCoreRoles) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${role}`) && entry.关键词?.includes('地区:仙舟罗浮')),
    `Xianzhou Luofu core role must group under 仙舟罗浮: ${role}`,
  );
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${role}`) && entry.关键词?.includes('资料类型:角色主体')),
    `Xianzhou Luofu core role must include a persona node: ${role}`,
  );
}
for (const role of ['丹枢']) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${role}`) && entry.关键词?.includes('地区:仙舟罗浮') && entry.关键词?.includes('资料类型:剧情门禁')),
    `Xianzhou high-spoiler story role must be represented as a story gate: ${role}`,
  );
}
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:刃') &&
    entry.关键词?.includes('阵营:星核猎手') &&
    entry.关键词?.includes('资料大区:仙舟罗浮') &&
    entry.关键词?.includes('资料类型:剧情门禁'),
  ),
  'Blade must group under Stellaron Hunters while keeping Luofu as data area.',
);
assert(
  entries.some((entry) => entry.id === 'zhiku_character_rebuild_phantylia_gate' && entry.关键词?.includes('幻胧') && !entry.关键词?.includes('角色:幻胧')),
  'Phantylia reveal should stay a locked story gate keyword, not a half-built standalone character profile.',
);
const xianzhouFutureRoles = ['云璃', '飞霄', '椒丘', '貊泽', '灵砂'];
for (const role of xianzhouFutureRoles) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${role}`) && entry.关键词?.includes('资料大区:仙舟联盟')),
    `future Xianzhou Alliance role must group under 仙舟联盟 instead of 罗浮: ${role}`,
  );
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${role}`) && entry.解锁状态 === '未解锁'),
    `future Xianzhou Alliance role must stay locked by default: ${role}`,
  );
}
assert(
  entries.some((entry) => entry.id === 'zhiku_character_rebuild_fugue_tingyun_gate' && entry.关键词?.includes('角色:停云') && entry.关键词?.includes('形态:忘归人') && entry.解锁状态 === '未解锁'),
  'Fugue must stay a locked Tingyun future-form gate.',
);
assert(
  entries.some((entry) => entry.关键词?.includes('角色:怀炎') && entry.关键词?.includes('资料大区:仙舟联盟') && entry.解锁状态 === '未解锁'),
  'Huaiyan must stay locked as a future Xianzhou Alliance role.',
);
const penaconyRoles = ['黄泉', '知更鸟', '星期日', '砂金', '流萤', '花火', '黑天鹅', '加拉赫', '米沙', '波提欧'];
for (const role of penaconyRoles) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${role}`) && entry.关键词?.includes('资料大区:匹诺康尼')),
    `Penacony core role must group under 匹诺康尼: ${role}`,
  );
}
const crossFactionPenaconyRoles = [
  ['砂金', '阵营:星际和平公司'],
  ['流萤', '阵营:星核猎手'],
  ['波提欧', '阵营:巡海游侠'],
];
for (const [role, factionTag] of crossFactionPenaconyRoles) {
  assert(
    entries.some((entry) =>
      entry.关键词?.includes(`角色:${role}`) &&
      entry.关键词?.includes(factionTag) &&
      entry.关键词?.includes('资料大区:匹诺康尼') &&
      !entry.关键词?.includes('地区:匹诺康尼'),
    ),
    `Penacony cross-faction role must group by faction while keeping 匹诺康尼 as data area: ${role}`,
  );
}
const nativePenaconyGroups = [
  ['星期日', '组织:家族'],
  ['知更鸟', '组织:家族'],
  ['加拉赫', '组织:猎犬家系'],
  ['米沙', '组织:白日梦酒店'],
];
for (const [role, orgTag] of nativePenaconyGroups) {
  assert(
    entries.some((entry) =>
      entry.关键词?.includes(`角色:${role}`) &&
      entry.关键词?.includes('资料大区:匹诺康尼') &&
      entry.关键词?.includes(orgTag) &&
      !entry.关键词?.some((tag) => tag.startsWith('阵营:') && !tag.includes('匹诺康尼')),
    ),
    `native Penacony group must stay under 匹诺康尼 rather than external faction: ${role}`,
  );
}
const expectedCharacterBigGroups = [
  ['星期日', '匹诺康尼'],
  ['知更鸟', '匹诺康尼'],
  ['加拉赫', '匹诺康尼'],
  ['米沙', '匹诺康尼'],
  ['砂金', '星际和平公司'],
  ['流萤', '星核猎手'],
  ['波提欧', '巡海游侠'],
  ['刃', '星核猎手'],
];
for (const [role, expectedGroup] of expectedCharacterBigGroups) {
  const entry = findRoleEntry(role);
  assert(entry, `group regression role entry must exist: ${role}`);
  assert(
    resolveCharacterGroupLabel(entry) === expectedGroup,
    `character left-side big group should resolve ${role} to ${expectedGroup}, got ${resolveCharacterGroupLabel(entry)}`,
  );
}
for (const splitGroup of ['家族', '猎犬家系', '白日梦酒店']) {
  assert(
    !nativePenaconyGroups.some(([role]) => resolveCharacterGroupLabel(findRoleEntry(role)) === splitGroup),
    `native Penacony organization must not become an independent left-side big group: ${splitGroup}`,
  );
}
const crossAreaFactionRoles = [
  ['卡芙卡', '星核猎手', '角色主体'],
  ['银狼', '星核猎手', '角色主体'],
  ['艾利欧', '星核猎手', '剧情门禁'],
  ['托帕', '星际和平公司', '角色主体'],
  ['翡翠', '星际和平公司', '剧情门禁'],
  ['真理医生', '博识学会', '角色主体'],
  ['阮·梅', '天才俱乐部', '角色主体'],
  ['螺丝咕姆', '天才俱乐部', '角色主体'],
];
for (const [role, faction, type] of crossAreaFactionRoles) {
  assert(
    entries.some((entry) =>
      entry.关键词?.includes(`角色:${role}`) &&
      entry.关键词?.includes(`阵营:${faction}`) &&
      entry.关键词?.includes(`资料类型:${type}`),
    ),
    `cross-area faction role must have a structured ${type} node under ${faction}: ${role}`,
  );
}
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:银枝') &&
    entry.关键词?.includes('阵营:纯美骑士团') &&
    entry.关键词?.includes('资料类型:角色主体'),
  ),
  'Argenti must have a persona node under Knights of Beauty.',
);
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:乱破') &&
    entry.关键词?.includes('阵营:巡海游侠') &&
    entry.关键词?.includes('资料类型:剧情门禁') &&
    entry.解锁状态 === '未解锁',
  ),
  'Rappa must stay as a locked future Galaxy Ranger gate.',
);
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:黑塔') &&
    entry.关键词?.includes('形态:大黑塔') &&
    entry.关键词?.includes('资料类型:剧情门禁') &&
    entry.解锁状态 === '未解锁',
  ),
  'The Herta must be a locked Herta form gate, not a separate active persona.',
);
assert(
  !entries.some((entry) => entry.关键词?.includes('角色:大黑塔')),
  'The Herta / 大黑塔 must not become a separate important-character profile.',
);
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:三月七') &&
    entry.关键词?.includes('形态:长夜月') &&
    entry.关键词?.includes('资料大区:翁法罗斯') &&
    entry.关键词?.includes('资料类型:角色形态') &&
    entry.解锁状态 === '未解锁',
  ),
  'Evernight must be a locked March 7th associated-persona gate, not a separate active persona.',
);
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:丹恒') &&
    entry.关键词?.includes('形态:丹恒·腾荒') &&
    entry.关键词?.includes('资料大区:翁法罗斯') &&
    entry.关键词?.includes('资料类型:角色形态') &&
    entry.解锁状态 === '未解锁',
  ),
  'Permansor Terrae must be a locked Dan Heng form gate, not a separate active persona.',
);
for (const aliasOnly of ['长夜月', '丹恒·腾荒', '腾荒']) {
  assert(
    !entries.some((entry) => entry.关键词?.includes(`角色:${aliasOnly}`)),
    `future form name should not become an independent important-character profile: ${aliasOnly}`,
  );
}
for (const lockedRole of ['艾利欧', '翡翠']) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${lockedRole}`) && entry.解锁状态 === '未解锁' && entry.解锁条件),
    `behind-stage or future faction role must stay locked by default: ${lockedRole}`,
  );
}
for (const aliasOnly of ['账账', '阮梅']) {
  assert(
    !entries.some((entry) => entry.关键词?.includes(`角色:${aliasOnly}`)),
    `alias/support name should not become an independent important-character profile: ${aliasOnly}`,
  );
}
const jariloCoreRoles = ['布洛妮娅', '希儿', '杰帕德', '佩拉', '希露瓦', '娜塔莎', '克拉拉', '史瓦罗', '虎克', '卢卡', '玲可'];
for (const role of jariloCoreRoles) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${role}`) && entry.关键词?.includes('地区:雅利洛-VI') && entry.关键词?.includes('资料类型:角色主体')),
    `Jarilo-VI core role must have a persona node under 雅利洛-VI: ${role}`,
  );
  assert(
    resolveCharacterGroupLabel(findRoleEntry(role)) === '雅利洛-VI',
    `Jarilo-VI core role should resolve to 雅利洛-VI left-side group: ${role}`,
  );
}
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:虎克') &&
    entry.关键词?.includes('儿童角色') &&
    entry.关键词?.includes('非NSFW') &&
    /不得进入 NSFW 档案/.test(entry.原文),
  ),
  'Hook must keep a child-character and non-NSFW boundary.',
);
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:桑博') &&
    entry.关键词?.includes('阵营:假面愚者') &&
    entry.关键词?.includes('资料大区:雅利洛-VI') &&
    entry.关键词?.includes('资料类型:角色主体'),
  ),
  'Sampo must group under Masked Fools while keeping Jarilo-VI as data area.',
);
assert(
  resolveCharacterGroupLabel(findRoleEntry('桑博')) === '假面愚者',
  'Sampo should resolve to 假面愚者 left-side group rather than 雅利洛-VI.',
);
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:可可利亚') &&
    entry.关键词?.includes('地区:雅利洛-VI') &&
    entry.关键词?.includes('资料类型:剧情门禁') &&
    entry.解锁状态 === '未解锁' &&
    entry.关键词?.includes('剧透:重大'),
  ),
  'Cocolia must stay as a locked Jarilo-VI finale gate.',
);
const amphoreusRoles = ['黄金裔', '阿格莱雅', '缇宝', '万敌', '遐蝶', '那刻夏', '赛飞儿', '风堇', '白厄', '刻律德菈', '海瑟音'];
for (const role of amphoreusRoles) {
  assert(
    entries.some((entry) =>
      entry.关键词?.includes(`角色:${role}`) &&
      entry.关键词?.includes('资料大区:翁法罗斯') &&
      entry.关键词?.includes('组织:黄金裔') &&
      entry.解锁状态 === '未解锁' &&
      entry.解锁条件,
    ),
    `Amphoreus / Chrysos Heirs role must stay locked under 翁法罗斯: ${role}`,
  );
  assert(
    resolveCharacterGroupLabel(findRoleEntry(role)) === '翁法罗斯',
    `Amphoreus role should resolve to 翁法罗斯 left-side group instead of 黄金裔: ${role}`,
  );
}
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:昔涟') &&
    entry.关键词?.includes('资料大区:翁法罗斯') &&
    entry.关键词?.includes('形态:迷迷') &&
    entry.关键词?.includes('资料类型:剧情门禁') &&
    entry.解锁状态 === '未解锁' &&
    entry.解锁条件,
  ),
  'Cyrene / Mem must stay as a locked Amphoreus form gate.',
);
assert(
  resolveCharacterGroupLabel(findRoleEntry('昔涟')) === '翁法罗斯',
  'Cyrene / Mem should resolve to 翁法罗斯 left-side group.',
);
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:来古士') &&
    entry.关键词?.includes('资料大区:翁法罗斯') &&
    entry.关键词?.includes('资料类型:剧情门禁') &&
    entry.关键词?.includes('节点:翁法罗斯真相门禁') &&
    entry.解锁状态 === '未解锁' &&
    entry.解锁条件 &&
    /实验|权杖|真相/.test(entry.解锁条件),
  ),
  'Lygus must stay as a locked Amphoreus truth-layer gate.',
);
assert(
  resolveCharacterGroupLabel(findRoleEntry('来古士')) === '翁法罗斯',
  'Lygus should resolve to 翁法罗斯 left-side group.',
);
for (const aliasOnly of ['缇安', '缇宁']) {
  assert(
    !entries.some((entry) => entry.关键词?.includes(`角色:${aliasOnly}`)),
    `Tribbie related name should stay inside Tribbie node rather than becoming an independent profile: ${aliasOnly}`,
  );
}
assert(
  entries.some((entry) =>
    entry.关键词?.includes('角色:缇宝') &&
    entry.关键词?.includes('缇安') &&
    entry.关键词?.includes('缇宁') &&
    entry.关键词?.includes('Tribbios') &&
    /命运的三子/.test(`${entry.摘要}\n${entry.原文}`),
  ),
  'Tribbie node must include Trianne/Trinnon/Tribbios as aliases and group context.',
);
assert(
  panel.includes('nativeAmphoreusOrganizations') &&
    panel.includes("dataArea === '翁法罗斯'") &&
    panel.includes("id: '资料大区:翁法罗斯'"),
  'character left-side big groups must fold native Amphoreus organizations under 翁法罗斯.',
);
const crossoverRoles = [
  ['Saber', '毁灭·风'],
  ['Archer', '巡猎·量子'],
];
for (const [role, form] of crossoverRoles) {
  const entry = findRoleEntry(role);
  assert(entry, `crossover role must exist: ${role}`);
  assert(
    entry.关键词?.includes('资料大区:联动角色') &&
      entry.关键词?.includes('资料类型:角色主体') &&
      entry.关键词?.includes(`形态:${form}`) &&
      /不得默认解释星核、星神、命途、翁法罗斯、仙舟或匹诺康尼真相/.test(entry.原文),
    `crossover role must stay under 联动角色 with main-story truth boundary: ${role}`,
  );
  assert(
    resolveCharacterGroupLabel(entry) === '联动角色',
    `crossover role should resolve to 联动角色 left-side group: ${role}`,
  );
}
assert(
  panel.includes('联动角色') &&
    panel.includes('Saber') &&
    panel.includes('Archer') &&
    panel.includes('crossoverOrganizations') &&
    panel.includes("dataArea === '联动角色'"),
  'character left-side big groups must include a 联动角色 fallback group and fold Fate organizations under it.',
);
const constance = findRoleEntry('康士坦丝');
assert(constance, 'Constance / The Dahlia must exist as an Ever-Flame Mansion gate.');
assert(
  constance.关键词?.includes('资料大区:永火官邸') &&
    constance.关键词?.includes('组织:永火官邸') &&
    constance.关键词?.includes('阵营:泯灭帮') &&
    constance.关键词?.includes('资料类型:剧情门禁') &&
    constance.关键词?.includes('节点:大丽花门禁') &&
    constance.解锁状态 === '未解锁' &&
    /翁法罗斯|记忆改写/.test(constance.解锁条件 ?? '') &&
    /不得主动进入/.test(constance.原文),
  'Constance must stay as a locked Ever-Flame Mansion / Dahlia spoiler gate.',
);
assert(
  resolveCharacterGroupLabel(constance) === '永火官邸',
  'Constance should resolve to 永火官邸 left-side group rather than 泯灭帮.',
);
assert(
  panel.includes('永火官邸') &&
    panel.includes('everFlameOrganizations') &&
    panel.includes("dataArea === '永火官邸'"),
  'character left-side big groups must include 永火官邸 and fold Ever-Flame organizations under it.',
);
for (const role of ['黄泉', '知更鸟', '砂金', '花火', '黑天鹅', '波提欧']) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${role}`) && entry.关键词?.includes('资料类型:角色主体')),
    `Penacony open role must include a persona node: ${role}`,
  );
}
for (const role of ['星期日', '流萤', '加拉赫', '米沙']) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${role}`) && entry.关键词?.includes('资料类型:剧情门禁') && entry.解锁状态 === '未解锁'),
    `Penacony spoiler role must stay as a locked story gate: ${role}`,
  );
}
assert(
  entries.some((entry) => entry.id === 'zhiku_character_rebuild_tingyun_phantylia_gate' && entry.关键词?.includes('节点:幻胧伪装门禁') && entry.解锁状态 === '未解锁'),
  'Tingyun Phantylia reveal must be split into a locked gate node.',
);
assert(
  entries.some((entry) => entry.id === 'zhiku_character_rebuild_jingliu_persona' && entry.解锁状态 === '未解锁'),
  'Jingliu high-spoiler persona must stay locked by default.',
);
for (const lockedRole of ['丹枢', '刃']) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`角色:${lockedRole}`) && entry.解锁状态 === '未解锁' && entry.关键词?.includes('剧透:重大')),
    `high-spoiler Xianzhou antagonist/gate role must stay locked by default: ${lockedRole}`,
  );
}
assert(
  entries.some((entry) => entry.id === 'zhiku_character_rebuild_phantylia_gate' && entry.解锁状态 === '未解锁' && entry.关键词?.includes('剧透:重大')),
  'Phantylia gate must stay locked by default.',
);
assert(
  entries.some((entry) => entry.标题.includes('丹恒') && entry.标题.includes('饮月') && entry.关键词.includes('解锁:未解锁')),
  'Dan Heng Imbibitor Lunae node must stay locked by default.',
);
for (const path of ['毁灭', '存护', '同谐', '记忆']) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`形态:${path}`) && entry.关键词?.includes('资料类型:命途能力')),
    `Trailblazer path must be split into an independent node: ${path}`,
  );
}
for (const path of ['存护', '同谐', '记忆']) {
  assert(
    entries.some((entry) => entry.关键词?.includes(`形态:${path}`) && entry.关键词?.includes('解锁:未解锁') && entry.解锁状态 === '未解锁'),
    `Future Trailblazer path must stay locked by default: ${path}`,
  );
}
assert(
  entries.some((entry) => entry.关键词?.includes('角色:帕姆') && entry.关键词?.includes('非NSFW')),
  'Pom-Pom must keep the non-NSFW creature-form boundary.',
);
const pomPomEntries = entries.filter((entry) => entry.关键词?.includes('角色:帕姆'));
const pomPomText = JSON.stringify(pomPomEntries);
assert(
  pomPomText.includes('第三人称自称') &&
    pomPomText.includes('某某乘客') &&
    pomPomText.includes('列车长权威') &&
    pomPomText.includes('装忙') &&
    pomPomText.includes('调节温度') &&
    pomPomText.includes('照顾植物') &&
    pomPomText.includes('Fandom Pom-Pom Messages'),
  'Pom-Pom persona must preserve canon-like speech and daily conductor behavior anchors.',
);

function tagValues(entry, key) {
  return (entry.关键词 ?? [])
    .map((keyword) => keyword.match(/^([^:：]+)[:：](.+)$/u))
    .filter(Boolean)
    .filter((match) => match[1] === key)
    .map((match) => match[2]);
}

function rolesOf(entry) {
  return tagValues(entry, '角色');
}

function primaryUiRoleOf(entry) {
  return String(entry.关联角色ID ?? '').trim() || rolesOf(entry)[0] || entry.标题.split(/[｜|]/u)[0];
}

function nodeTitle(entry) {
  return tagValues(entry, '节点')[0] || tagValues(entry, '资料类型')[0] || entry.标题;
}

function buildUiProfilesLikePanel(sourceEntries) {
  const map = new Map();
  for (const entry of sourceEntries) {
    const role = primaryUiRoleOf(entry);
    if (!map.has(role)) map.set(role, []);
    const list = map.get(role);
    if (!list.some((item) => item.id === entry.id)) list.push(entry);
  }
  return map;
}

const uiProfiles = buildUiProfilesLikePanel(activeBundledCharacters);
assert(
  panel.includes('getCharacterProfileNames(entry)') &&
    panel.includes('const primary = getCharacterName(entry).trim()') &&
    panel.includes('return names.length ? [names[0]] : [entry.标题]'),
  'Zhiku character workspace must display only primary role names while keeping alias triggers for retrieval.',
);
for (const aliasOnly of ['Herta', 'Asta', 'Arlan']) {
  assert(!uiProfiles.has(aliasOnly), `UI profile list must not split alias-only English role into its own card: ${aliasOnly}`);
}
for (const role of ['黑塔', '艾丝妲', '阿兰']) {
  assert((uiProfiles.get(role) ?? []).length === 1, `Herta Space Station rebuilt profile must appear once in the UI profile list: ${role}`);
}
for (const [role, roleEntries] of uiProfiles) {
  assert(roleEntries.length > 0, `UI profile must not be empty: ${role}`);
  const titles = roleEntries.map(nodeTitle);
  assert(new Set(roleEntries.map((entry) => entry.id)).size === roleEntries.length, `UI profile must not duplicate nodes for role: ${role}`);
  if (!/星穹列车|组织|阵营|派系/.test(role)) {
    const hasOnlyLockedGate = roleEntries.every((entry) => {
      const meta = softMeta(entry);
      return /剧情门禁|门禁/.test(`${meta.资料类型} ${meta.节点} ${nodeTitle(entry)}`) && /未解锁|锁定|只读/.test(meta.解锁状态);
    });
    assert(
      hasOnlyLockedGate || titles.some((title) => /主体人格|角色主体|群像互动职责|OOC 风险|空间站统筹|基础/.test(title)),
      `active role should expose at least one persona/anchor node in UI profile: ${role}`,
    );
  }
}
for (const role of ['星', '穹']) {
  const titles = (uiProfiles.get(role) ?? []).map(nodeTitle);
  for (const required of ['主体人格', 'OOC 风险', '命途阶段门禁', '毁灭命途', '存护命途门禁', '同谐命途门禁', '记忆命途门禁']) {
    assert(titles.includes(required), `UI profile for ${role} must expose node: ${required}`);
  }
}

function softMeta(entry) {
  const first = (key) => tagValues(entry, key)[0];
  return {
    解锁状态: entry.运行时解锁状态 || entry.解锁状态 || first('解锁') || '',
    使用范围: [...(entry.使用范围 ?? []), ...tagValues(entry, '范围'), ...tagValues(entry, '使用范围')],
    资料类型: entry.资料类型 || first('资料类型') || '',
    节点: first('节点') || '',
  };
}

function mainStoryAllowed(entry) {
  if (entry.可用于联动 === false) return false;
  if (entry.分类 === 'story') return false;
  if (entry.可否主剧情注入 === false) return false;
  if (entry.分类 !== 'character') return true;
  const meta = softMeta(entry);
  if (meta.使用范围.length > 0 && !meta.使用范围.some((item) => /主剧情|通用|全部|all/i.test(item))) return false;
  if (/未解锁|锁定|只读/i.test(meta.解锁状态)) return false;
  return true;
}

const mainStoryByRole = new Map();
for (const entry of activeBundledCharacters.filter(mainStoryAllowed)) {
  for (const role of rolesOf(entry)) {
    const list = mainStoryByRole.get(role) ?? [];
    list.push(nodeTitle(entry));
    mainStoryByRole.set(role, list);
  }
}

for (const [role, roleEntries] of uiProfiles) {
  const openTitles = mainStoryByRole.get(role) ?? [];
  const hasOpenNode = roleEntries.some((entry) => !/未解锁|锁定|只读/i.test(softMeta(entry).解锁状态));
  if (!/星穹列车|组织|阵营|派系/.test(role) && hasOpenNode) {
    assert(openTitles.length > 0, `active role must have at least one main-story-usable anchor before locked forms are considered: ${role}`);
  }
  const lockedOpen = roleEntries
    .filter((entry) => /未解锁|锁定|只读/i.test(softMeta(entry).解锁状态))
    .filter((entry) => openTitles.includes(nodeTitle(entry)));
  assert(!lockedOpen.length, `locked character nodes must not enter main story before unlock: ${lockedOpen.map((entry) => entry.标题).join('、')}`);
}

assert((mainStoryByRole.get('穹') ?? []).includes('OOC 风险'), 'main story retrieval should be able to anchor Caelus OOC.');
assert((mainStoryByRole.get('穹') ?? []).includes('毁灭命途'), 'main story retrieval should be able to use unlocked Destruction path.');
for (const locked of ['存护命途门禁', '同谐命途门禁', '记忆命途门禁']) {
  assert(!(mainStoryByRole.get('穹') ?? []).includes(locked), `locked Trailblazer path must not enter main story before unlock: ${locked}`);
}
assert((mainStoryByRole.get('景元') ?? []).includes('主体人格'), 'main story retrieval should be able to anchor Jing Yuan persona.');
assert((mainStoryByRole.get('停云') ?? []).includes('主体人格'), 'main story retrieval should be able to anchor Tingyun persona.');
assert((mainStoryByRole.get('雪衣') ?? []).includes('主体人格'), 'main story retrieval should be able to anchor Xueyi persona.');
assert((mainStoryByRole.get('藿藿') ?? []).includes('主体人格'), 'main story retrieval should be able to anchor Huohuo persona.');
assert((mainStoryByRole.get('寒鸦') ?? []).includes('主体人格'), 'main story retrieval should be able to anchor Hanya persona.');
assert(!(mainStoryByRole.get('停云') ?? []).includes('幻胧伪装门禁'), 'locked Tingyun Phantylia gate must not enter main story before unlock.');
assert(!(mainStoryByRole.get('停云') ?? []).includes('忘归人门禁'), 'locked Fugue/Tingyun future form must not enter main story before unlock.');
assert(!(mainStoryByRole.get('镜流') ?? []).includes('主体人格'), 'locked Jingliu persona must not enter main story before unlock.');
for (const lockedStoryRole of ['丹枢', '刃']) {
  assert(!(mainStoryByRole.get(lockedStoryRole) ?? []).some((title) => title.includes('门禁')), `locked Xianzhou story gate must not enter main story before unlock: ${lockedStoryRole}`);
}
assert(!(mainStoryByRole.get('幻胧') ?? []).length, 'Phantylia must not appear as a standalone main-story character anchor before a full persona exists.');
for (const lockedFuture of ['云璃', '飞霄', '椒丘', '貊泽', '灵砂']) {
  assert(!(mainStoryByRole.get(lockedFuture) ?? []).includes('主体人格'), `locked future Xianzhou role must not enter main story before unlock: ${lockedFuture}`);
}
assert(!(mainStoryByRole.get('怀炎') ?? []).some((title) => title.includes('门禁') || title.includes('主体人格')), 'locked Huaiyan must not enter main story before unlock.');
assert((mainStoryByRole.get('黄泉') ?? []).includes('主体人格'), 'main story retrieval should be able to anchor Acheron persona.');
assert((mainStoryByRole.get('知更鸟') ?? []).includes('主体人格'), 'main story retrieval should be able to anchor Robin persona.');
assert((mainStoryByRole.get('砂金') ?? []).includes('主体人格'), 'main story retrieval should be able to anchor Aventurine persona.');
for (const lockedPenacony of ['星期日', '流萤', '加拉赫', '米沙']) {
  assert(!(mainStoryByRole.get(lockedPenacony) ?? []).some((title) => title.includes('门禁')), `locked Penacony story gate must not enter main story before unlock: ${lockedPenacony}`);
}

function unlocksWithArchive(entry, archiveText) {
  if (mainStoryAllowed(entry)) return false;
  const condition = entry.解锁条件 || tagValues(entry, '解锁条件')[0] || '';
  if (!condition) return false;
  const pieces = condition
    .split(/[，,。；;、\n\r\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(达到|完成|经过|推进|剧情|阶段|相关|后|时|之后|手动|开启|启用|解锁)$/u.test(item));
  const tokens = new Set();
  for (const item of pieces) {
    if (item.length >= 4) tokens.add(item);
  }
  for (let index = 0; index < pieces.length - 1; index += 1) {
    const pair = `${pieces[index]}${pieces[index + 1]}`;
    if (pair.length >= 4) tokens.add(pair);
  }
  const compact = pieces.join('');
  if (compact.length >= 4) tokens.add(compact);
  const normalizedArchive = archiveText.replace(/\s+/gu, '');
  return Array.from(tokens).some((token) => normalizedArchive.includes(String(token).replace(/\s+/gu, '')));
}

assert(
  unlocksWithArchive(entries.find((entry) => entry.id === 'zhiku_character_rebuild_trailblazer_path_preservation'), '雅利洛剧情中开拓者获得存护命途。'),
  'Preservation path should be unlockable by a matching story archive condition.',
);
assert(
  storyProgress.includes('buildRoleProgressArchiveSummary') &&
    storyProgress.includes('角色推进摘要') &&
    storyProgress.includes('...item.本段变化') &&
    storyProgress.includes('...item.本段后状态') &&
    storyProgress.includes('...item.对后续影响'),
  'story weaving archives must preserve completed role progression summaries for later character continuity.',
);
assert(
  sendWorkflow.includes('角色阶段承接') &&
    sendWorkflow.includes('latestArchive.角色推进摘要'),
  'main turn memory must include archived role progression summaries after story weaving advances.',
);
assert(
    sendWorkflow.includes('type 智库召回诊断') &&
    sendWorkflow.includes('formatZhikuDiagnosticsPreview') &&
    sendWorkflow.includes('zhikuPreview?.diagnostics') &&
    sendWorkflow.includes('retrieveZhikuContextWithModel(\n            state.智库,\n            zhikuRecallQuery,') &&
    sendWorkflow.includes('anticipatedZhikuNpcNames') &&
    sendWorkflow.includes('anticipatedNpcNames: anticipatedZhikuNpcNames') &&
    sendWorkflow.includes('智库召回诊断：') &&
    sendWorkflow.includes('在场角色兜底召回：') &&
    sendWorkflow.includes('关键词召回：') &&
    sendWorkflow.includes('AI检索补充：') &&
    sendWorkflow.includes('关键词资料召回：') &&
    sendWorkflow.includes('AI检索补充强资料：') &&
    sendWorkflow.includes('AI检索补充弱资料：') &&
    sendWorkflow.includes('最终注入角色资料（已去重）：') &&
    sendWorkflow.includes('最终注入强资料：') &&
    sendWorkflow.includes('最终注入弱资料：') &&
    sendWorkflow.includes('AI候选资料：'),
  'saved per-turn request context must include zhiku retrieval diagnostics, and main zhiku recall must use the enhanced recall query rather than raw user input.',
);
assert(
  turnItem.includes('回忆、剧情编织与智库预览'),
  'turn request context heading must mention zhiku because recallPreview now includes zhiku diagnostics.',
);
assert(
  chatModel.includes('recallSummary?: string') &&
    chatModel.includes('recallFullContent?: string') &&
  chatModel.includes('zhikuRecallPreview?: string') &&
    chatModel.includes('zhikuRecallInjection?: string') &&
    chatModel.includes('zhikuRecallRawText?: string') &&
    chatModel.includes('zhikuRecallUsedModel?: boolean') &&
    sendWorkflow.includes('formatZhikuRecallSummary(zhikuPreview?.diagnostics)') &&
    sendWorkflow.includes('formatYitingRecallSummary(yitingPreview?.previewText)') &&
    sendWorkflow.includes("state.setLiveRecallSummary('智库召回：检索中\\n记忆召回：检索中')") &&
    sendWorkflow.includes('state.setLiveRecallSummary(recallSummaryForTurn)') &&
    sendWorkflow.includes('state.setLiveRecallFullContent(recallFullContentForTurn)') &&
    sendWorkflow.includes('const recallFullContentForTurn = [') &&
    sendWorkflow.includes('recallSummary: recallSummaryForTurn') &&
    sendWorkflow.includes('recallFullContent: recallFullContentForTurn') &&
    sendWorkflow.includes('【智库完整召回】') &&
    sendWorkflow.includes('【记忆完整召回】') &&
    sendWorkflow.includes('zhikuRecallPreview: formatZhikuDiagnosticsPreview(zhikuPreview?.diagnostics)') &&
    sendWorkflow.includes("zhikuRecallInjection: zhikuRecallEnabled ? (zhikuPreview?.injection ?? '') : ''") &&
    sendWorkflow.includes('zhikuRecallRawText: zhikuPreview?.rawText ??') &&
    sendWorkflow.includes('zhikuRecallUsedModel: zhikuPreview?.usedModel === true') &&
    contextSnapshot.includes('msg.debugContext?.zhikuRecallPreview') &&
    contextSnapshot.includes('msg.debugContext?.zhikuRecallRawText') &&
    contextSnapshot.includes('智库模型原始返回') &&
    !contextSnapshot.includes('msg.debugContext?.recallPreview?.trim()'),
  'debug context must save concise recall summary, zhiku diagnostics, and raw zhiku model output.',
);
assert(
  turnItem.includes('【智库模型原始返回】') &&
    turnItem.includes('debug.zhikuRecallRawText') &&
    turnItem.includes('debug.zhikuRecallUsedModel') &&
    turnItem.includes('本回合未调用智库模型，使用本地规则召回'),
  'turn request context must expose the raw zhiku model output separately from local prompt previews.',
);
assert(
  app.includes('latestRecallSummary') &&
    app.includes('latestRecallFullContent') &&
    app.includes('state.loading && state.liveRecallSummary.trim()') &&
    app.includes('state.loading && state.liveRecallFullContent.trim()') &&
    app.includes('debugContext?.recallSummary') &&
    app.includes('recallSummary={latestRecallSummary}') &&
    app.includes('recallFullContent={latestRecallFullContent}') &&
    leftPanel.includes('function RecallSummaryWindow') &&
    leftPanel.includes('召回摘要') &&
    leftPanel.includes("expanded ? '收起' : '完整'") &&
    leftPanel.includes('本回合无召回摘要'),
  'main UI must show concise zhiku/yiting recall summaries in the left sidebar instead of full injection text.',
);
assert(
  retrieval.includes('## 角色执行约束') &&
    retrieval.includes('正文必须至少在该角色的一处对话、动作、表情或反应里体现性格锚点与说话方式') &&
    retrieval.includes('禁止把原著角色写成通用 NPC、无差别旁白工具人或长期沉默背景板') &&
    retrieval.includes('关系边界') &&
    retrieval.includes('禁止误写'),
  'zhiku character injection must explicitly turn recalled persona anchors into executable main-story constraints.',
);
assert(
  runtimeUnlock.includes('applyStoryArchiveZhikuRuntimeUnlock') &&
    runtimeUnlock.includes('关联剧情分段ID') &&
    runtimeUnlock.includes('首次可用剧情段') &&
    runtimeUnlock.includes('解锁条件') &&
    runtimeUnlock.includes('运行时解锁状态') &&
    runtimeUnlock.includes('isReadOnlyOrManualOnly') &&
    runtimeUnlock.includes('剧情编织归档'),
  'zhiku runtime unlock helper must conservatively map completed story archives to local unlock overrides.',
);
assert(
  sendWorkflow.includes("import { applyStoryArchiveZhikuRuntimeUnlock }") &&
    sendWorkflow.includes('storyAlignment.progressed') &&
    sendWorkflow.includes('applyStoryArchiveZhikuRuntimeUnlock({') &&
    sendWorkflow.includes('剧情归档已更新智库门禁') &&
    sendWorkflow.includes('zhikuAfterRuntimeUnlock'),
  'main workflow must update zhiku runtime unlocks after story weaving progresses.',
);
assert(
  phoneService.includes('最近角色阶段变化') &&
    phoneService.includes('角色推进摘要'),
  'phone context must read archived role progression summaries without using future locked forms.',
);
assert(
  phoneService.includes('手机智库人物锚点') &&
    phoneService.includes('buildPhoneZhikuPersonaBrief') &&
    phoneService.includes('isPhoneAllowedZhikuEntry') &&
    phoneService.includes('/手机|通用|全部|all/i') &&
    phoneService.includes('/未解锁|锁定|只读/i') &&
    phoneService.includes('未解锁形态、重大剧透和只读资料不得在手机里提前表现'),
  'phone generation must receive filtered zhiku persona anchors and exclude locked/spoiler character nodes.',
);
assert(
  newsModel.includes('角色推进摘要') &&
    newsModel.includes('item.角色推进摘要?.slice'),
  'news context must receive public story archive role progression summaries from completed segments.',
);
assert(
  newsModel.includes('buildPublicNpcBriefs') &&
    newsModel.includes('相关 NPC 公开摘要') &&
    !newsModel.includes('JSON.stringify(request.npcRecords ?? [], null, 2)') &&
    newsModel.includes('不得把私密人格、手机私聊、NSFW 档案、未公开身份或未解锁形态写成公开报道'),
  'news model must receive sanitized public NPC briefs instead of full private NPC archives.',
);

console.log('zhiku character rebuild regression ok');
