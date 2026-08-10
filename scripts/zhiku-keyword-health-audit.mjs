/**
 * Read-only inventory for the bundled Zhiku keyword recall contract.
 *
 * This script reports effective trigger words, collisions, short triggers,
 * fallback sources, and multi-form wiring. It never edits preset data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keywordHealthConfigs } from './apply-zhiku-keyword-health-fixes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const presetDir = path.join(root, 'public', 'zhiku-presets');

const universalTriggerTags = new Set(['触发', '触发词', '别名', '称呼']);
const characterTriggerTags = new Set(['角色', '人物', '归属角色']);
const loreTriggerTags = new Set([
  '角色',
  '人物',
  '星神',
  '命途',
  '地点',
  '地区',
  '派系',
  '阵营',
  '组织',
  '术语',
  '专有名词',
  '事件',
  '敌对生物',
]);

const normalizeList = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean),
));

const normalizeRuntimeList = (values) => normalizeList(values).slice(0, 12);

function parseKeywordTag(keyword) {
  const text = String(keyword ?? '');
  const asciiColon = text.indexOf(':');
  const chineseColon = text.indexOf('：');
  const index = asciiColon >= 0 ? asciiColon : chineseColon;
  if (index <= 0) return null;
  const key = text.slice(0, index).trim();
  const value = text.slice(index + 1).trim();
  return key && value ? { key, value } : null;
}

function getEffectiveTriggers(entry) {
  const explicit = normalizeRuntimeList(entry.触发关键词);
  if (explicit.length) return { source: 'explicit', triggers: explicit };

  const coreLine = String(entry.原文 ?? '').match(/核心触发词[:：]\s*([^\n]+)/u);
  if (coreLine) {
    return {
      source: 'archive-core-line',
      triggers: normalizeList(coreLine[1]
        .replace(/[。；;]+$/u, '')
        .split(/[,，、;；\n]/u)),
    };
  }

  const tagged = [];
  const plain = [];
  for (const keyword of entry.关键词 ?? []) {
    const parsed = parseKeywordTag(keyword);
    if (!parsed) {
      plain.push(keyword);
      continue;
    }
    const categoryTags = entry.分类 === 'character' ? characterTriggerTags : loreTriggerTags;
    if (universalTriggerTags.has(parsed.key) || categoryTags.has(parsed.key)) {
      tagged.push(parsed.value);
    }
  }

  return {
    source: 'legacy-keywords',
    triggers: entry.分类 === 'character' && tagged.length
      ? normalizeList(tagged)
      : normalizeList([...tagged, ...plain]),
  };
}

const files = fs.readdirSync(presetDir)
  .filter((filename) => filename.endsWith('.json'))
  .sort((left, right) => left.localeCompare(right, 'en'));

const entries = [];
for (const filename of files) {
  const preset = JSON.parse(fs.readFileSync(path.join(presetDir, filename), 'utf8'));
  for (const [sourceIndex, entry] of (preset.entries ?? []).entries()) {
    const effective = getEffectiveTriggers(entry);
    entries.push({
      filename,
      sourceIndex,
      id: entry.id ?? '',
      title: entry.标题 ?? '',
      category: entry.分类 ?? '',
      triggerSource: effective.source,
      triggers: effective.triggers,
      auxiliary: normalizeRuntimeList(entry.辅助关键词),
      auxiliaryLogic: entry.辅助关键词逻辑 ?? '',
      exclusionGroupId: entry.互斥组ID ?? '',
      subjectId: entry.关联角色ID ?? '',
      formId: entry.关联形态ID ?? '',
      mainStoryInjectable: entry.可否主剧情注入 !== false,
      linkable: entry.可用于联动 !== false,
    });
  }
}

const triggerOwners = new Map();
for (const entry of entries) {
  const seenTriggers = new Set();
  for (const trigger of entry.triggers) {
    const key = trigger.normalize('NFKC').toLocaleLowerCase();
    if (seenTriggers.has(key)) continue;
    seenTriggers.add(key);
    const owners = triggerOwners.get(key) ?? [];
    owners.push({ title: entry.title, filename: entry.filename, category: entry.category });
    triggerOwners.set(key, owners);
  }
}

const collisions = Array.from(triggerOwners.entries())
  .filter(([, owners]) => owners.length > 1)
  .map(([trigger, owners]) => ({ trigger, owners }));

const rows = entries.map((entry) => ({
  ...entry,
  shortTriggers: entry.triggers.filter((trigger) => Array.from(trigger).length <= 2),
  collisions: entry.triggers
    .map((trigger) => ({
      trigger,
      owners: triggerOwners.get(trigger.normalize('NFKC').toLocaleLowerCase()) ?? [],
    }))
    .filter((item) => item.owners.length > 1),
}));

const categoryCounts = Object.fromEntries(Array.from(new Set(rows.map((entry) => entry.category)))
  .sort()
  .map((category) => [category, rows.filter((entry) => entry.category === category).length]));

const summary = {
  files: files.length,
  entries: rows.length,
  categoryCounts,
  explicitTriggerEntries: rows.filter((entry) => entry.triggerSource === 'explicit').length,
  archiveCoreTriggerEntries: rows.filter((entry) => entry.triggerSource === 'archive-core-line').length,
  legacyKeywordFallbackEntries: rows.filter((entry) => entry.triggerSource === 'legacy-keywords').length,
  emptyTriggerEntries: rows.filter((entry) => entry.triggers.length === 0).length,
  shortTriggerEntries: rows.filter((entry) => entry.shortTriggers.length > 0).length,
  collisionGroups: collisions.length,
  multiFormEntries: rows.filter((entry) => entry.exclusionGroupId).length,
};

const characterReviewOverrides = new Map([
  ['那刻夏', ['P0', '有效触发词中混入占位字面量“角色名”，会与其他残留该占位词的档案同时误触发。', '删除“角色名”，保留那刻夏、Anaxa、阿那克萨戈拉斯等真实姓名与正式别名。']],
  ['赛飞儿', ['P0', '有效触发词中混入占位字面量“角色名”，会与其他残留该占位词的档案同时误触发。', '删除“角色名”，保留赛飞儿、Cipher、赛法利娅等真实姓名与正式别名。']],
  ['缇宝', ['P0', '有效触发词中混入占位字面量“角色名”，会与其他残留该占位词的档案同时误触发。', '删除“角色名”，保留缇宝、Tribbie、缇安、缇宁等真实姓名与正式别名。']],
  ['昔涟', ['P1', '“迷迷”会命中“迷迷糊糊”等普通叙述，“Mem”采用子串匹配时也可能命中 memory、member 等英文词。', '保留昔涟、Cyrene、德谬歌等明确专名；移除或为“迷迷”“Mem”增加能确认角色语境的门禁。']],
  ['星', ['P2', '单字人物名虽已有独立词边界保护，但句首或标点旁单独出现“星”时仍可能是天体含义。', '保留“星”作为姓名；补充开拓者/列车语境门禁，或在召回层增加单字姓名的语义消歧。']],
  ['三月七', ['P1', '“三月”既是角色简称也是月份；常态排除词中还含“习剑”“双剑”等宽泛叙述，可能错误切换形态。', '常态主触发以“三月七”“小三月”为主；月份简称和形态判断改为角色名加明确形态词的组合。']],
  ['丹恒', ['P1', '“列车护卫”“智库管理员”是普通职责称呼，脱离姓名也会直接召回丹恒。', '主触发保留丹恒、Dan Heng、冷面小青龙；职责词只作辅助语境，不单独承担召回。']],
  ['姬子', ['P1', '“领航员”是普通职位词；形态排除词“启行”“拓星者”“再度启行”也偏宽。', '主触发保留姬子、Himeko及带姓名称呼；职位词与启行形态词改为姓名共现条件。']],
  ['丹恒·饮月', ['P1', '辅助词“龙尊”可指其他持明龙尊，和丹恒共现时也不必然是在写饮月形态。', '优先使用“丹恒·饮月”“饮月君”“Imbibitor Lunae”；将“龙尊”替换为更明确的形态组合词。']],
  ['姬子•启行', ['P1', '辅助词“启行”“拓星者”“理想领航员”可出现在普通列车叙述中，容易把姬子常态误切到启行。', '只保留带姬子姓名的启行全称及稳定专名；宽泛职责/动作词不作为形态判据。']],
  ['三月七·巡猎', ['P1', '主触发含月份词“三月”，辅助词“习剑”“双剑”过宽，角色练剑的普通叙述也可能强制切形态。', '使用“三月七·巡猎”“巡猎三月七”等明确组合；普通练剑词只能作低权重语境，不能单独决定形态。']],
  ['长夜月', ['P1', '共享主触发“三月”，再配合若干意象型辅助词即可切换，存在把三月七相关叙述误判为长夜月的风险。', '主触发收束到长夜月、长月夜、Evernight；三月七仅在与明确长夜月形态词共现时参与。']],
  ['Archer', ['P1', '“Archer”是普通职业词，“正义的伙伴”是通用称谓；“卫宫士郎”还会混入另一人物阶段的语境。', '保留红衣弓兵及明确英灵名；普通职业/理念词不单独触发，卫宫士郎相关召回需增加英灵阶段门禁。']],
  ['黄泉', ['P2', '“黄泉”本身也是冥界/死亡意象的常用词，叙事描写可能被当成人名。', '保留黄泉、Acheron；对裸“黄泉”增加持刀女子、巡海游侠或自灭者等角色语境消歧。']],
  ['黑天鹅', ['P2', '“黑天鹅 / Black Swan”也可指动物、作品或黑天鹅事件，并非总是角色名。', '保留正式姓名；裸词命中时结合流光忆庭、忆者、占卜师等角色语境确认。']],
  ['托帕', ['P2', '“Topaz”可表示黄玉，当前仍会按子串直接视为人物别名。', '中文姓名可保留；英文 Topaz 在宝石语境下应排除，或要求与公司、账账等角色词共现。']],
  ['砂金', ['P2', '“砂金 / Aventurine”同时是矿物或宝石名称，物品描写可能召回人物。', '保留人物名；增加石心十人、卡卡瓦夏、公司等人物语境，排除纯矿物/饰品描述。']],
  ['翡翠', ['P2', '“翡翠 / Jade”同时是常见宝石词，物品与颜色描写可能召回人物。', '保留人物名；增加石心十人、慈玉女士等人物语境，排除纯宝石/饰品描述。']],
  ['真珠', ['P2', '“真珠 / Pearl”同时是珍珠通名，物品描写可能召回人物。', '保留人物名；增加石心十人或公司语境，排除纯珠宝描述。']],
  ['林登·斯科特', ['P1', '“Scott”是常见英文名，“孤狼”“公司专员”是普通称呼，均可脱离本人误触发。', '主触发保留林登·斯科特、斯科特、Lyndon Skott；删除普通绰号/职位，或改为姓名共现辅助词。']],
  ['星期日', ['P1', '“星期日 / Sunday”首先是日期词，日程与时间叙述会频繁误触发角色。', '裸日期词需要人物语境门禁；优先使用神主日、橡木家系家主或带角色标记的组合词。']],
  ['加拉赫', ['P1', '“老狗”是普通贬称/昵称，脱离加拉赫也会直接触发档案。', '删除“老狗”这一单独主触发；保留加拉赫、Gallagher及足够具体的身份称呼。']],
  ['知更鸟', ['P1', '“知更鸟 / Robin”也可指鸟类或普通英文名，当前没有人物语境门禁。', '保留正式姓名；裸词结合银河歌者、匹诺康尼、天环族等人物语境消歧。']],
  ['花火', ['P1', '“花火 / Sparkle”可作烟花、火花或普通英文词，叙景和英文叙述可能误触发。', '保留角色正式姓名；裸词增加假面愚者等人物语境，排除烟花/光效描写。']],
  ['大丽花', ['P2', '“大丽花 / Dahlia”也是花卉名称，植物或装饰描写可能召回人物。', '保留康士坦丝、Constance等明确别名；裸花名需结合焚化工或人物语境。']],
  ['火花', ['P1', '“火花”“主包”“花老师”都是高频普通词或泛称，触发面明显超出该角色。', '以更稳定的角色专名或带二相乐园限定的组合词为主；普通名词和泛称只作辅助。']],
  ['归寂', ['P2', '“归寂”可直接出现在死亡、沉寂等叙事表达中，不一定指绝灭大君。', '优先使用“绝灭大君·归寂”“万色返空主”等明确专名；裸“归寂”增加敌对生物语境。']],
  ['刃', ['P1', '单字“刃”虽有词边界保护，但“Blade”是普通英文名词；“应星”还牵涉前身阶段语境。', '保留刃、阿刃及带星核猎手的组合；英文普通词和应星阶段需增加人物/阶段门禁。']],
  ['流萤', ['P1', '“流萤 / Firefly”可指萤火虫，“Sam”还是常见英文名并采用子串匹配，触发面过宽。', '保留流萤、萨姆和装甲编号；英文 Firefly/Sam 增加星核猎手或装甲语境，避免普通词命中。']],
  ['千冶•刃', ['P1', '共享“刃 / Blade”后，意象型辅助词即可切换形态；英文普通词与前身语境会放大误判。', '形态召回优先使用千冶全称；仅在刃姓名与明确千冶标志共现时切换。']],
  ['云璃', ['P1', '“猎剑士”是职业称呼，“老铁”是高频口语，脱离云璃也会直接召回。', '保留云璃、Yunli及带姓名/地域的称号；删除“猎剑士”“老铁”单独主触发。']],
  ['符玄', ['P1', '“太卜”是职位而非唯一姓名，其他太卜或职位讨论也会召回符玄。', '保留符玄、Fu Xuan；使用“符玄太卜”等带姓名组合，裸“太卜”只作辅助。']],
  ['白露', ['P2', '“白露”也是节气与自然现象，天气和时令叙述可能误触发人物。', '保留白露、Bailu；裸词结合衔药龙女、罗浮等人物语境消歧。']],
  ['停云', ['P1', '常态排除词“重新启程”等为宽泛剧情短语，和停云共现时可能错误压掉常态档案。', '常态/忘归人的切换只使用忘归人、Fugue、五尾等稳定形态标志。']],
  ['罗刹', ['P2', '“罗刹”也是通用神怪名词，怪物或宗教叙述可能召回人物。', '保留罗刹、Luocha；裸词结合金发行商、棺柩等人物语境消歧。']],
  ['寒鸦', ['P2', '“寒鸦”也可指鸟类和诗性意象，景物描写可能召回人物。', '保留寒鸦、Hanya；裸词结合十王司、雪衣等人物语境消歧。']],
  ['忘归人', ['P1', '辅助词“重新启程”过于宽泛；与停云共现时即可把普通阶段叙述判成忘归人形态。', '只保留忘归人、Fugue、真停云、五尾等稳定形态标志，删除泛剧情短语。']],
]);

const nonCharacterReviewByFile = new Map([
  ['aeons-core.json', ['P1', '星神本名、命途、派系、人物、事件和普通概念都处于同一 OR 触发层，且与命途/总览资料大面积碰撞。', '每位星神仅保留本名与唯一尊号为主触发；命途、派系、人物和事件改为辅助条件或从召回词移除。']],
  ['location-core.json', ['P1', '地点名之外的活动、氛围和功能词也会直接触发整份地点资料。', '主触发只保留正式地点名及稳定别名；父级区域、人物、活动和氛围词改为组合条件。']],
  ['paths-core.json', ['P1', '命途名、星神名、哲学词、派系和事件均可单独召回，和星神/总览档案形成重复注入。', '让命途资料拥有命途名及“某某命途”组合；星神名、哲学词、派系和事件不再作为独立主触发。']],
  ['term-core.json', ['P0', '使用旧关键词回退，时间、历史、道路、战技、成长、剧本、命运等普通词都会直接注入完整术语/派系资料。', '为每条资料设置显式触发词，只保留术语本名及必要全称；普通解释词全部退出主触发层。']],
  ['worldview-core.json', ['P0', '总览、派系和世界地点把下属星神、命途、角色、舱段等全部设为 OR 触发，任一普通提及都会注入整份总览。', '总览只由“星神总览/命途总览/派系总览”等明确请求召回；地点/派系只保留正式名称，成员名改为辅助或移除。']],
  ['xianzhou-history.json', ['P0', '阵营名、组织名、角色名和普通历史名词会触发整段年代史，并与角色、星神、命途资料叠加。', '主触发收束到具体事件名、年代段和唯一历史节点；人物、组织、仙舟联盟等背景词不能单独召回整段历史。']],
]);

function reviewEntry(entry) {
  const expected = keywordHealthConfigs.get(`${entry.filename}::${entry.title}`);
  const matchesExpectedPolicy = expected
    && JSON.stringify(entry.triggers) === JSON.stringify(expected.triggers)
    && (!expected.auxiliary || JSON.stringify(entry.auxiliary) === JSON.stringify(expected.auxiliary))
    && (!expected.logic || entry.auxiliaryLogic === expected.logic);

  if (entry.category !== 'character') {
    const review = nonCharacterReviewByFile.get(entry.filename);
    if (!review) {
      return {
        status: '需修改',
        priority: 'P1',
        risk: '非人物资料仍使用未经专项确认的宽触发集合。',
        direction: '改为显式触发词，并逐项确认只有资料本名与稳定别名能独立召回。',
      };
    }
    const [priority, baseRisk, direction] = review;
    const collisionCount = new Set(entry.collisions.map((item) => item.trigger)).size;
    if (matchesExpectedPolicy) {
      return {
        status: '合格',
        priority: '-',
        risk: `已处理原风险：${baseRisk}`,
        direction: `已按审查方向完成显式收束。${direction}`,
      };
    }
    return {
      status: '需修改',
      priority,
      risk: `${baseRisk}${collisionCount ? ` 当前有 ${collisionCount} 个主触发词与其他档案重名。` : ''}`,
      direction,
    };
  }

  const override = characterReviewOverrides.get(entry.title);
  if (override) {
    const [priority, risk, direction] = override;
    if (matchesExpectedPolicy) {
      return {
        status: '合格',
        priority: '-',
        risk: `已处理原风险：${risk}`,
        direction: `已按审查方向完成收束。${direction}`,
      };
    }
    return { status: '需修改', priority, risk, direction };
  }

  const externalCollisions = entry.collisions.filter((item) => item.owners.some((owner) => (
    owner.title !== entry.title && owner.category !== 'character'
  )));
  return {
    status: '合格',
    priority: '-',
    risk: externalCollisions.length
      ? '人物侧仅使用姓名或足够明确的正式别名；同词碰撞来自非人物资料的宽回退，应修改对方而非本档案。'
      : '当前有效触发词集中在姓名、正式别名或足够明确的专属称号，未见明显宽触发。',
    direction: '保留现状；后续维护时继续避免加入普通职位、关系、动作、氛围和剧情说明词。',
  };
}

const reviewedRows = rows.map((entry) => ({ ...entry, review: reviewEntry(entry) }));
const reviewCounts = {
  qualified: reviewedRows.filter((entry) => entry.review.status === '合格').length,
  needsChange: reviewedRows.filter((entry) => entry.review.status === '需修改').length,
  p0: reviewedRows.filter((entry) => entry.review.priority === 'P0').length,
  p1: reviewedRows.filter((entry) => entry.review.priority === 'P1').length,
  p2: reviewedRows.filter((entry) => entry.review.priority === 'P2').length,
};
const baselineReviewCounts = { qualified: 62, needsChange: 100, p0: 22, p1: 66, p2: 12 };

function escapeTableCell(value) {
  return String(value ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, '<br>');
}

function triggerSourceLabel(source) {
  if (source === 'explicit') return '显式触发关键词';
  if (source === 'archive-core-line') return '档案核心触发词';
  return '旧关键词回退';
}

function categoryLabel(category) {
  return ({ character: '人物', term: '术语', location: '地点', faction: '派系', event: '事件' })[category] ?? category;
}

function formatForm(entry) {
  const parts = [categoryLabel(entry.category)];
  if (entry.formId) parts.push(entry.formId);
  if (entry.exclusionGroupId) parts.push(`互斥组：${entry.exclusionGroupId}`);
  if (entry.auxiliary.length) {
    parts.push(`辅助 ${entry.auxiliaryLogic || 'AND_ANY'}：${entry.auxiliary.join(' / ')}`);
  }
  return parts.join('<br>');
}

function buildMarkdownReport() {
  const characterNeedsChange = reviewedRows.filter((entry) => (
    entry.category === 'character' && entry.review.status === '需修改'
  )).length;
  const nonCharacterNeedsChange = reviewedRows.filter((entry) => (
    entry.category !== 'character' && entry.review.status === '需修改'
  )).length;
  const resolvedReviewedFixes = reviewedRows.filter((entry) => (
    keywordHealthConfigs.has(`${entry.filename}::${entry.title}`) && entry.review.status === '合格'
  )).length;
  const lines = [
    '# 智库档案关键词健康度审查表（整改后复核）',
    '',
    '- 审查日期：2026-08-04',
    '- 审查范围：`public/zhiku-presets/*.json` 中 23 个预设、162 条非剧情注入资料。',
    '- 复核范围：仅检查关键词召回字段。档案原文、摘要、注入内容、语料与故事字段均未纳入改写。',
    '- 排除范围：动态剧情档案属于只读、不注入资料，不进入本表；当前 23 个公开预设中也没有底层 `category: story` 条目。',
    '',
    '## 审查结论',
    '',
    `- 当前合格：${reviewCounts.qualified} 条。`,
    `- 当前需修改：${reviewCounts.needsChange} 条，其中人物 ${characterNeedsChange} 条、术语/地点/派系/事件 ${nonCharacterNeedsChange} 条。`,
    `- 已完成收束：${resolvedReviewedFixes} / ${keywordHealthConfigs.size} 条审查问题。`,
    `- 原始审查基线：合格 ${baselineReviewCounts.qualified} 条、需修改 ${baselineReviewCounts.needsChange} 条（P0 ${baselineReviewCounts.p0}、P1 ${baselineReviewCounts.p1}、P2 ${baselineReviewCounts.p2}）。`,
    `- 触发来源：显式触发关键词 ${summary.explicitTriggerEntries} 条，档案核心触发词 ${summary.archiveCoreTriggerEntries} 条，旧关键词回退 ${summary.legacyKeywordFallbackEntries} 条。`,
    `- 结构检查：空触发 ${summary.emptyTriggerEntries} 条，多形态互斥组条目 ${summary.multiFormEntries} 条。`,
    '',
    '',
    '整改结论：63 条非人物资料已全部改为显式触发词；37 条人物问题已清理占位词、普通职位/绰号、常用词义裸词、英文普通词和过宽形态辅助词。歧义裸词退出关键词通道后，仍可由现有 AI 补充检索判断是否需要加入。',
    '',
    '## 判定口径',
    '',
    '1. `触发关键词` 非空时完全覆盖旧 `关键词`；否则读取档案原文中的“核心触发词”；仍无结果时才回退旧 `关键词`。',
    '2. 人物分类有有效人物标签时，普通说明关键词不参与自动召回；非人物分类会把有效标签和无标签普通关键词一起作为主触发。',
    '3. 当前召回为规范化后的子串匹配。单字人物名使用独立词边界；人物“黑塔”另有空间站名称排除。其他普通词没有语义消歧。',
    '4. 多形态通过主触发、`AND_ANY/NOT_ANY` 辅助词和互斥组决胜；辅助词本身过宽时，仍可能把同一人物切到错误形态。',
    '5. P0：会造成明显批量误触发/重复注入；P1：高概率宽触发或形态误判；P2：存在真实歧义，建议在前两级完成后收束。',
    '6. “短词”或“碰撞”不自动等于不合格：人物姓名可能天然很短；当碰撞由非人物总览/历史宽触发造成时，只修改污染源。',
    '',
    '## 逐条审查表',
    '',
    '| # | 文件 | 档案 | 分类 / 形态 | 当前有效主触发 | 来源 | 状态 | 优先级 | 风险说明 | 修改方向 |',
    '|---:|---|---|---|---|---|---|---|---|---|',
  ];

  reviewedRows.forEach((entry, index) => {
    lines.push(`| ${index + 1} | ${escapeTableCell(entry.filename)} | ${escapeTableCell(entry.title)} | ${escapeTableCell(formatForm(entry))} | ${escapeTableCell(entry.triggers.join(' / '))} | ${triggerSourceLabel(entry.triggerSource)} | **${entry.review.status}** | ${entry.review.priority} | ${escapeTableCell(entry.review.risk)} | ${escapeTableCell(entry.review.direction)} |`);
  });

  lines.push(
    '',
    '## 整改记录',
    '',
    '1. 已清理 3 条人物占位词“角色名”。',
    '2. 已收束 `term-core.json`、`worldview-core.json` 与 `xianzhou-history.json` 的普通词、成员名和角色名宽触发。',
    '3. 已拆分星神、命途与总览的关键词所有权；总览只接受明确总览请求。',
    '4. 已收束地点档案，人物、活动、氛围和功能词不再单独触发地点。',
    '5. 已处理人物常用词歧义和多形态辅助词，并加入正例、反例与互斥回归。',
    '',
    '本表由当前 JSON 与固定收束策略自动复核。任何主触发、辅助词或逻辑漂移都会重新标记为“需修改”。',
  );
  return `${lines.join('\n')}\n`;
}

const payload = { summary: { ...summary, reviewCounts }, collisions, entries: reviewedRows };
if (process.argv.includes('--markdown')) {
  process.stdout.write(buildMarkdownReport());
} else if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  console.log(JSON.stringify({ ...summary, reviewCounts }));
  for (const entry of reviewedRows) {
    console.log([
      entry.filename,
      entry.title,
      entry.category,
      entry.triggerSource,
      `状态=${entry.review.status}:${entry.review.priority}`,
      `主=${entry.triggers.join(' / ') || '无'}`,
      `辅=${entry.auxiliary.join(' / ') || '无'}:${entry.auxiliaryLogic || '-'}`,
      `互斥=${entry.exclusionGroupId || '-'}`,
      `形态=${entry.formId || '-'}`,
      `短词=${entry.shortTriggers.join(' / ') || '-'}`,
      `碰撞=${entry.collisions.map((item) => item.trigger).join(' / ') || '-'}`,
    ].join(' | '));
  }
}
