/**
 * Applies the reviewed Zhiku keyword contractions with minimal JSON text edits.
 *
 * Dry-run by default. Pass --write to update only recall-related entry fields.
 * Every target file is parsed before and after, and all non-recall data must be
 * byte-equivalent after structural normalization or the write is rejected.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const presetDir = path.join(root, 'public', 'zhiku-presets');
const shouldWrite = process.argv.includes('--write');
export const keywordHealthConfigs = new Map();
const configs = keywordHealthConfigs;

function define(file, title, triggers, options = {}) {
  const key = `${file}::${title}`;
  if (configs.has(key)) throw new Error(`duplicate keyword policy: ${key}`);
  const auxiliary = options.auxiliary;
  if (!Array.isArray(triggers) || !triggers.length || triggers.length > 12) {
    throw new Error(`${key} must define 1-12 primary triggers`);
  }
  if (auxiliary && (!Array.isArray(auxiliary) || auxiliary.length > 12)) {
    throw new Error(`${key} must define at most 12 auxiliary triggers`);
  }
  configs.set(key, {
    file,
    title,
    triggers,
    auxiliary,
    logic: options.logic,
  });
}

const aeonTriggers = {
  '岚｜巡猎': ['帝弓司命', '巡猎星神岚'],
  '纳努克｜毁灭': ['纳努克', '毁灭星神纳努克'],
  '克里珀｜存护': ['克里珀', '琥珀王', '存护星神克里珀'],
  '博识尊｜智识': ['博识尊', '智识星神博识尊'],
  '希佩｜同谐': ['希佩', '同谐星神希佩'],
  'IX｜虚无': ['星神IX', '虚无星神IX'],
  '药师｜丰饶': ['丰饶星神药师', '药师星神', '寿瘟祸祖'],
  '阿哈｜欢愉': ['阿哈', '欢愉星神阿哈'],
  '浮黎｜记忆': ['浮黎', '记忆星神浮黎'],
  '阿基维利｜开拓': ['阿基维利', '开拓星神阿基维利'],
  '塔伊兹育罗斯｜繁育': ['塔伊兹育罗斯', '繁育星神塔伊兹育罗斯'],
  '奥博洛斯｜贪饕': ['奥博洛斯', '贪饕星神奥博洛斯'],
  '迷思｜神秘': ['神秘星神迷思', '迷思星神'],
  '互｜均衡': ['均衡星神互', '星神「互」'],
  '太一｜秩序': ['秩序星神太一', '太一星神'],
  '末王｜终末': ['末王', '终末星神末王'],
  '伊德莉拉｜纯美': ['伊德莉拉', '纯美星神伊德莉拉'],
  '龙｜不朽': ['不朽星神龙', '星神「龙」'],
  星神概念: ['星神概念', '星神本质', '星神设定'],
};
for (const [title, triggers] of Object.entries(aeonTriggers)) {
  define('aeons-core.json', title, triggers);
}

const pathTitles = [
  '巡猎', '毁灭', '存护', '智识', '同谐', '虚无', '丰饶', '欢愉', '记忆',
  '开拓', '繁育', '贪饕', '神秘', '均衡', '秩序', '终末', '纯美', '不朽',
];
for (const title of pathTitles) {
  define('paths-core.json', title, [`${title}命途`, `命途·${title}`, `命途「${title}」`]);
}
define('paths-core.json', '命途概念', ['命途概念', '命途原理', '命途行者']);

define('location-core.json', '主控舱段', ['主控舱段', '黑塔空间站主控舱段']);
define('location-core.json', '收容舱段', ['收容舱段', '黑塔空间站收容舱段']);
define('location-core.json', '观景车厢', ['观景车厢', '星穹列车观景车厢']);
define('location-core.json', '贝洛伯格', ['贝洛伯格', '筑城者之城贝洛伯格']);
define('location-core.json', '长乐天', ['长乐天', '罗浮长乐天']);
define('location-core.json', '黄金的时刻', ['黄金的时刻', '匹诺康尼黄金的时刻']);

define('term-core.json', '琥珀纪', ['琥珀纪', '琥珀纪年']);
define('term-core.json', '星神', ['星神体系', '星神体系总称']);
define('term-core.json', '命途', ['命途体系', '命途体系总称']);
define('term-core.json', '派系', ['派系概念', '阵营体系', '宇宙组织体系']);
define('term-core.json', '星核猎手', ['星核猎手']);

define('worldview-core.json', '星神总览', ['星神总览', '星神一览']);
define('worldview-core.json', '命途总览', ['命途总览', '命途一览']);
define('worldview-core.json', '派系总览', ['派系总览', '宇宙派系总览']);
define('worldview-core.json', '星穹列车', ['星穹列车', '列车组', '无名客列车']);
define('worldview-core.json', '空间站「黑塔」', ['黑塔空间站', '空间站「黑塔」', '空间站黑塔']);
define('worldview-core.json', '雅利洛-Ⅵ', ['雅利洛-Ⅵ', '雅利洛VI', '雅利洛六号']);
define('worldview-core.json', '仙舟「罗浮」', ['仙舟罗浮', '仙舟「罗浮」', '罗浮仙舟']);
define('worldview-core.json', '梦想之地匹诺康尼', ['匹诺康尼', '梦想之地匹诺康尼', '盛会之星匹诺康尼']);
define('worldview-core.json', '二相乐园', ['二相乐园', '诸世界重建计划']);
define('worldview-core.json', '翁法罗斯', ['翁法罗斯', '永恒之地翁法罗斯']);

define('xianzhou-history.json', '仙舟历史·启航与孤航（星历0–2600）', [
  '仙舟启航与孤航', '星历0-2600', '星历0至2600', '古国启航', '仙舟孤航',
]);
define('xianzhou-history.json', '仙舟历史·长生与三劫（星历2600–3600）', [
  '仙舟长生与三劫', '星历2600-3600', '星历2600至3600', '仙舟三劫', '生劫火劫空劫',
]);
define('xianzhou-history.json', '仙舟历史·联盟成立与帝弓显现（星历3600–5700）', [
  '仙舟联盟成立与帝弓显现', '星历3600-5700', '星历3600至5700', '联盟宣言', '帝弓显现',
]);
define('xianzhou-history.json', '仙舟历史·丰饶战争与近代（星历5700–8100）', [
  '仙舟丰饶战争与近代', '星历5700-8100', '星历5700至8100', '第二次丰饶战争',
  '第三次丰饶战争', '饮月之乱', '云上五骁历史',
]);

define('amphoreus-character-rebuild.json', '那刻夏', [
  '那刻夏', 'Anaxa', '阿那克萨戈拉斯', 'Anaxagoras', '神悟树庭七贤人那刻夏',
  '智种学派创立者那刻夏', '黄金裔那刻夏',
]);
define('amphoreus-character-rebuild.json', '赛飞儿', [
  '赛飞儿', 'Cipher', '赛法利娅', '多洛斯的赛飞儿', '猫咪怪盗赛飞儿',
  '诡计黄金裔赛飞儿', '翻飞之币持有者赛飞儿',
]);
define('amphoreus-character-rebuild.json', '缇宝', [
  '缇宝', 'Tribbie', '缇安', '缇宁', '缇里西庇俄丝', 'Tribios',
  '命运的三子缇宝', '雅努萨波利斯圣女缇宝', '门径黄金裔缇宝',
]);
define('amphoreus-character-rebuild.json', '昔涟', [
  '昔涟', 'Cyrene', '德谬歌', 'PhiLia093', '哀丽秘榭的女儿', '往昔的涟漪', '哺育真我的黄金裔昔涟',
]);

define('character-rebuild-core.json', '星', ['星', '开拓者星', '星开拓者', '星女士', '星姑娘']);
define('character-rebuild-core.json', '三月七', ['三月七', '小三月', 'March 7th'], {
  auxiliary: [
    '三月七·巡猎', '三月七（巡猎）', '巡猎三月七', '仙舟三月七', 'March 7th The Hunt',
    '演武仪典', '长夜月', '长月夜', 'Evernight', '记忆之影', '岁月火种', '永夜之帷',
  ],
  logic: 'NOT_ANY',
});
define('character-rebuild-core.json', '丹恒', ['丹恒', 'Dan Heng', '冷面小青龙'], {
  auxiliary: [
    '饮月', '丹恒·饮月', '饮月君', 'Imbibitor Lunae',
    '腾荒', '丹恒·腾荒', 'Souldragon', '荒龙',
  ],
  logic: 'NOT_ANY',
});
define('character-rebuild-core.json', '姬子', ['姬子', 'Himeko', '姬子姐姐', '星穹列车姬子'], {
  auxiliary: ['姬子•启行', '姬子·启行', '姬子启行', 'Himeko Qixing'],
  logic: 'NOT_ANY',
});
define('character-rebuild-core.json', '丹恒·饮月', [
  '丹恒', 'Dan Heng', '饮月', '丹恒·饮月', '饮月君', 'Imbibitor Lunae',
], {
  auxiliary: ['饮月', '丹恒·饮月', '饮月君', '持明本相', 'Imbibitor Lunae'],
  logic: 'AND_ANY',
});
define('character-rebuild-core.json', '姬子•启行', [
  '姬子', 'Himeko', '姬子•启行', '姬子·启行', '姬子启行', 'Himeko Qixing',
], {
  auxiliary: ['姬子•启行', '姬子·启行', '姬子启行', 'Himeko Qixing'],
  logic: 'AND_ANY',
});
define('character-rebuild-core.json', '三月七·巡猎', [
  '三月七', '小三月', 'March 7th', '三月七·巡猎', '三月七（巡猎）',
  '巡猎三月七', '仙舟三月七', 'March 7th The Hunt',
], {
  auxiliary: [
    '三月七·巡猎', '三月七（巡猎）', '巡猎三月七', '仙舟三月七',
    'March 7th The Hunt', '演武仪典',
  ],
  logic: 'AND_ANY',
});
define('character-rebuild-core.json', '长夜月', [
  '长夜月', '长月夜', 'Evernight',
], {
  auxiliary: ['长夜月', '长月夜', 'Evernight', '记忆之影', '岁月火种', '永夜之帷', '感官之雨'],
  logic: 'AND_ANY',
});

define('fate-collaboration-character-expansion.json', 'Archer', [
  '红衣弓兵', '英灵Archer', 'Archer英灵', 'EMIYA',
]);
define('galactic-travelers-character-rebuild.json', '黄泉', [
  'Acheron', '雷电·忘川守·芽衣', '自灭者黄泉', '虚无令使黄泉', '巡海游侠黄泉', '持刀女子黄泉',
]);
define('garden-of-recollection-character-rebuild.json', '黑天鹅', [
  '流光忆庭黑天鹅', '忆者黑天鹅', '黑天鹅女士', '占卜师黑天鹅',
]);

define('interastral-peace-corporation-character-rebuild.json', '托帕', [
  '公司高管托帕', '石心十人托帕', '托帕总监', '账账的搭档托帕',
]);
define('interastral-peace-corporation-character-rebuild.json', '砂金', [
  '卡卡瓦夏', '诡弈砂金', '石心十人砂金', '砂金总监', '小孔雀',
]);
define('interastral-peace-corporation-character-rebuild.json', '翡翠', [
  '石心十人翡翠', '慈玉女士', '典贷翡翠', '翡翠女士',
]);
define('interastral-peace-corporation-character-rebuild.json', '真珠', [
  '石心十人真珠', '真珠女士', '公司高管真珠',
]);
define('interastral-peace-corporation-character-rebuild.json', '林登·斯科特', [
  '林登·斯科特', '斯科特', 'Lyndon Skott',
]);

define('penacony-character-rebuild.json', '星期日', [
  '神主日', '橡木家系家主', '天环族铎音', '齐响诗班', '匹诺康尼星期日', '星期日先生',
]);
define('penacony-character-rebuild.json', '加拉赫', [
  '加拉赫', 'Gallagher', '猎犬家系治安官', '美梦调饮师',
]);
define('penacony-character-rebuild.json', '知更鸟', [
  '银河歌者知更鸟', '天环族歌者知更鸟', '匹诺康尼歌者知更鸟', '知更鸟小姐',
]);
define('penacony-character-rebuild.json', '花火', [
  '假面愚者花火', '花火小姐', '危险戏剧大师花火',
]);
define('penacony-character-rebuild.json', '大丽花', [
  '康士坦丝', 'Constance', '焚化工·大丽花', '焚化工大丽花',
]);

define('planarcadia-character-expansion.json', '火花', [
  '二相乐园火花', '火花大会主持人', '火花老师',
]);
define('planarcadia-enemy-expansion.json', '归寂', [
  '万色返空主', '绝灭大君•归寂', '绝灭大君·归寂', '绝灭大君归寂', '归寂的箴言',
]);

define('stellaron-hunters-character-rebuild.json', '刃', [
  '刃', '星核猎手刃', '阿刃',
], {
  auxiliary: ['千冶•刃', '千冶·刃', '千冶刃', '千冶'],
  logic: 'NOT_ANY',
});
define('stellaron-hunters-character-rebuild.json', '流萤', [
  '星核猎手流萤', '萨姆机甲', 'AR-26710', 'AR26710', '火萤Ⅳ型', '火萤Ⅳ型战略强袭装甲',
]);
define('stellaron-hunters-character-rebuild.json', '千冶•刃', [
  '千冶•刃', '千冶·刃', '千冶刃', '千冶',
], {
  auxiliary: ['千冶•刃', '千冶·刃', '千冶刃', '千冶'],
  logic: 'AND_ANY',
});

define('xianzhou-alliance-character-expansion.json', '云璃', [
  '云璃', 'Yunli', '朱明猎剑士', '焰轮八叶', '熔铁剑骸',
]);

define('xianzhou-luofu-character-rebuild.json', '符玄', [
  '符玄', 'Fu Xuan', '符玄太卜', '太卜符玄',
]);
define('xianzhou-luofu-character-rebuild.json', '白露', [
  'Bailu', '衔药龙女', '罗浮龙尊白露', '龙女白露',
]);
define('xianzhou-luofu-character-rebuild.json', '停云', [
  '停云', 'Tingyun', '鸣火商团接渡使', '狐人接渡使',
], {
  auxiliary: ['忘归人', 'Fugue', '真停云', '五尾停云', '五尾狐人', '毁灭烙印', '阮•梅救治'],
  logic: 'NOT_ANY',
});
define('xianzhou-luofu-character-rebuild.json', '罗刹', [
  'Luocha', '金发行商罗刹', '棺柩行商罗刹', '罗刹先生',
]);
define('xianzhou-luofu-character-rebuild.json', '寒鸦', [
  'Hanya', '十王司寒鸦', '判官寒鸦', '雪衣的妹妹寒鸦',
]);
define('xianzhou-luofu-character-rebuild.json', '忘归人', [
  '停云', 'Tingyun', '忘归人', 'Fugue', '真停云',
], {
  auxiliary: ['忘归人', 'Fugue', '真停云', '五尾停云', '五尾狐人', '毁灭烙印', '阮•梅救治'],
  logic: 'AND_ANY',
});

if (configs.size !== 100) {
  throw new Error(`expected 100 reviewed fixes, received ${configs.size}`);
}

function findMatchingBracket(text, openIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === openChar) depth += 1;
    else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`unclosed ${openChar} at ${openIndex}`);
}

function collectObjectRanges(text) {
  const stack = [];
  const ranges = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') stack.push(index);
    else if (char === '}') {
      const start = stack.pop();
      if (start === undefined) throw new Error(`unexpected } at ${index}`);
      ranges.push({ start, end: index });
    }
  }
  if (stack.length) throw new Error('unclosed JSON object');
  return ranges;
}

function findEntryRange(text, identity) {
  const needle = `${JSON.stringify(identity.property)}: ${JSON.stringify(identity.value)}`;
  const identityIndex = text.indexOf(needle);
  if (identityIndex < 0) throw new Error(`cannot locate entry ${needle}`);
  const candidates = collectObjectRanges(text)
    .filter((range) => range.start < identityIndex && range.end > identityIndex)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start));
  if (!candidates.length) throw new Error(`cannot locate object for ${needle}`);
  return candidates[0];
}

function findArrayProperty(text, range, property) {
  const slice = text.slice(range.start, range.end + 1);
  const expression = new RegExp(`\\n(\\s*)${JSON.stringify(property)}\\s*:\\s*\\[`, 'u');
  const match = expression.exec(slice);
  if (!match) return null;
  const keyIndex = range.start + match.index + 1 + match[1].length;
  const openIndex = text.indexOf('[', keyIndex);
  const closeIndex = findMatchingBracket(text, openIndex, '[', ']');
  return { keyIndex, openIndex, closeIndex, indent: match[1] };
}

function formatArray(values, indent) {
  return [
    '[',
    ...values.map((value, index) => `${indent}  ${JSON.stringify(value)}${index < values.length - 1 ? ',' : ''}`),
    `${indent}]`,
  ].join('\n');
}

function setArrayProperty(text, identity, property, values, insertAfterProperty) {
  let range = findEntryRange(text, identity);
  const existing = findArrayProperty(text, range, property);
  if (existing) {
    return `${text.slice(0, existing.openIndex)}${formatArray(values, existing.indent)}${text.slice(existing.closeIndex + 1)}`;
  }

  const anchor = findArrayProperty(text, range, insertAfterProperty);
  if (!anchor) throw new Error(`${identity.value} is missing insertion anchor ${insertAfterProperty}`);
  let commaIndex = anchor.closeIndex + 1;
  while (/\s/u.test(text[commaIndex] ?? '')) commaIndex += 1;
  if (text[commaIndex] !== ',') throw new Error(`${identity.value}.${insertAfterProperty} is missing a trailing comma`);
  const insertion = `\n${anchor.indent}${JSON.stringify(property)}: ${formatArray(values, anchor.indent)},`;
  return `${text.slice(0, commaIndex + 1)}${insertion}${text.slice(commaIndex + 1)}`;
}

function setStringProperty(text, identity, property, value, insertAfterProperty) {
  let range = findEntryRange(text, identity);
  const slice = text.slice(range.start, range.end + 1);
  const expression = new RegExp(`\\n(\\s*)${JSON.stringify(property)}\\s*:\\s*"(?:\\\\.|[^"\\\\])*"`, 'u');
  const match = expression.exec(slice);
  if (match) {
    const lineStart = range.start + match.index + 1;
    const colonIndex = text.indexOf(':', lineStart);
    const valueStart = text.indexOf('"', colonIndex);
    let index = valueStart + 1;
    let escaped = false;
    for (; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') break;
    }
    return `${text.slice(0, valueStart)}${JSON.stringify(value)}${text.slice(index + 1)}`;
  }

  range = findEntryRange(text, identity);
  const anchor = findArrayProperty(text, range, insertAfterProperty);
  if (!anchor) throw new Error(`${identity.value} is missing insertion anchor ${insertAfterProperty}`);
  let commaIndex = anchor.closeIndex + 1;
  while (/\s/u.test(text[commaIndex] ?? '')) commaIndex += 1;
  if (text[commaIndex] !== ',') throw new Error(`${identity.value}.${insertAfterProperty} is missing a trailing comma`);
  const insertion = `\n${anchor.indent}${JSON.stringify(property)}: ${JSON.stringify(value)},`;
  return `${text.slice(0, commaIndex + 1)}${insertion}${text.slice(commaIndex + 1)}`;
}

function withoutRecallFields(value) {
  const clone = structuredClone(value);
  for (const entry of clone.entries ?? []) {
    delete entry.触发关键词;
    delete entry.辅助关键词;
    delete entry.辅助关键词逻辑;
  }
  return clone;
}

export function runKeywordHealthFixes(write = shouldWrite) {
  const grouped = Map.groupBy(configs.values(), (config) => config.file);
  let changedEntries = 0;
  const changedFiles = [];

  for (const [file, fileConfigs] of grouped) {
    const filePath = path.join(presetDir, file);
    const beforeText = fs.readFileSync(filePath, 'utf8');
    const beforeData = JSON.parse(beforeText);
    let afterText = beforeText;

    for (const config of fileConfigs) {
      const entry = beforeData.entries.find((item) => item.标题 === config.title);
      if (!entry) throw new Error(`${file} is missing ${config.title}`);
      const identity = entry.id
        ? { property: 'id', value: entry.id }
        : { property: '标题', value: entry.标题 };
      afterText = setArrayProperty(afterText, identity, '触发关键词', config.triggers, '关键词');
      if (config.auxiliary) {
        afterText = setArrayProperty(afterText, identity, '辅助关键词', config.auxiliary, '触发关键词');
      }
      if (config.logic) {
        afterText = setStringProperty(afterText, identity, '辅助关键词逻辑', config.logic, '辅助关键词');
      }
      changedEntries += 1;
    }

    const afterData = JSON.parse(afterText);
    if (JSON.stringify(withoutRecallFields(beforeData)) !== JSON.stringify(withoutRecallFields(afterData))) {
      throw new Error(`${file} changed outside recall fields`);
    }
    for (const config of fileConfigs) {
      const entry = afterData.entries.find((item) => item.标题 === config.title);
      if (JSON.stringify(entry?.触发关键词) !== JSON.stringify(config.triggers)) {
        throw new Error(`${file} / ${config.title} primary triggers did not apply exactly`);
      }
      if (config.auxiliary && JSON.stringify(entry?.辅助关键词) !== JSON.stringify(config.auxiliary)) {
        throw new Error(`${file} / ${config.title} auxiliary triggers did not apply exactly`);
      }
      if (config.logic && entry?.辅助关键词逻辑 !== config.logic) {
        throw new Error(`${file} / ${config.title} auxiliary logic did not apply exactly`);
      }
    }

    if (afterText !== beforeText) {
      changedFiles.push(file);
      if (write) fs.writeFileSync(filePath, afterText, 'utf8');
    }
  }

  const result = {
    mode: write ? 'write' : 'dry-run',
    reviewedFixes: configs.size,
    changedEntries,
    changedFiles,
  };
  console.log(JSON.stringify(result, null, 2));
  console.log(write ? 'ZHIKU_KEYWORD_HEALTH_FIXES_WRITTEN' : 'ZHIKU_KEYWORD_HEALTH_FIXES_DRY_RUN_OK');
  return result;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  runKeywordHealthFixes();
}
