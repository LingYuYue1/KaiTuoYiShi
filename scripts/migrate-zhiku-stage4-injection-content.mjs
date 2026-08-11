import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const PRESET_DIR = path.join(ROOT, 'public', 'zhiku-presets');
const WRITE = process.argv.includes('--write');
const REFRESH = process.argv.includes('--refresh');

const CHARACTER_FIELDS = [
  '核心身份与阵营',
  '独立人格与行为',
  '说话方式',
  '台词语料',
  '外貌锚点',
  '当前形态与能力边界',
  '精简角色故事',
  '演绎红线',
];
const LORE_FIELDS = ['核心定义', '关键事实', '叙事用途', '演绎边界'];

function parseSections(source) {
  const text = String(source ?? '');
  const matches = [...text.matchAll(/^##\s+(.+?)\s*$/gmu)];
  const result = new Map();
  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    result.set(match[1].trim(), text.slice(start, end).trim());
  });
  return result;
}

function compactText(value, limit) {
  const text = String(value ?? '')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const candidates = ['\n', '。', '！', '？', '；'].map((marker) => head.lastIndexOf(marker));
  const boundary = Math.max(...candidates);
  return `${head.slice(0, boundary >= Math.floor(limit * 0.62) ? boundary + 1 : limit).trim()}…`;
}

function selectBaseLines(section, labels, fallbackLimit = 900, fallbackToAll = true) {
  const lines = String(section ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const normalizedLabels = labels.map((label) => label.replace(/^[-*]\s*/u, '').trim());
  const selected = lines.filter((line) => {
    const content = line.replace(/^[-*]\s*/u, '').trim();
    return normalizedLabels.some((label) => content.startsWith(label));
  });
  return compactText((selected.length ? selected : fallbackToAll ? lines : []).join('\n'), fallbackLimit);
}

function findSection(sections, matcher) {
  for (const [title, body] of sections) {
    if (typeof matcher === 'string' ? title === matcher : matcher.test(title)) return body;
  }
  return '';
}

function stripInjectionMetadataLines(section) {
  return String(section ?? '')
    .split('\n')
    .filter((line) => !/^\s*[-*]?\s*(?:解锁状态|使用范围|默认可用范围|首次可用剧情段|关联剧情分段ID|资料类型|核心触发词|辅助关键词|互斥组ID)[:：]/u.test(line))
    .join('\n')
    .trim();
}

function buildCharacterInjection(entry) {
  const sections = parseSections(entry.原文);
  const basic = findSection(sections, '基础识别');
  const identity = selectBaseLines(
    basic,
    ['名称', '本名', '别名', '称号', '所属', '阵营', '身份', '出身', '位置', '种族', '性别', '年龄状态', '当前信息域'],
    1100,
  );
  const abilityIdentity = selectBaseLines(
    basic,
    ['形态', '武器', '装备', '能力', '当前信息域'],
    520,
    false,
  );
  const abilitySection = stripInjectionMetadataLines(
    findSection(sections, '能力与职责模块') || findSection(sections, /使用边界|可写表现/u),
  );
  const voiceCorpus = findSection(sections, '语料层');
  const specialStory = [
    findSection(sections, '人物底色'),
    findSection(sections, '可写表现'),
  ].filter(Boolean).join('\n\n');
  const story = entry.角色故事摘要
    || findSection(sections, '角色故事层')
    || findSection(sections, /^历史故事与.+层$/u)
    || specialStory;

  const injection = {
    类型: 'character',
    核心身份与阵营: identity,
    独立人格与行为: compactText(
      [entry.性格锚点, entry.行为习惯].filter(Boolean).join('\n'),
      1200,
    ),
    说话方式: compactText(entry.说话方式, 900),
    台词语料: voiceCorpus
      ? voiceCorpus.trim()
      : '当前档案未收录可核验的正式台词语料；仅按“说话方式”控制语气，不得生成、仿写或伪装成官方原句。',
    外貌锚点: compactText(entry.外貌锚点, 900),
    当前形态与能力边界: compactText(
      [abilityIdentity, abilitySection].filter(Boolean).join('\n\n'),
      1500,
    ),
    精简角色故事: compactText(story, 1200),
    演绎红线: compactText(
      [
        entry.关系边界 ? `关系边界：${entry.关系边界}` : '',
        entry.禁止误写 ? `禁止误写：${entry.禁止误写}` : '',
      ].filter(Boolean).join('\n'),
      1600,
    ),
  };
  assertInjection(entry, injection, CHARACTER_FIELDS);
  return injection;
}

function buildLoreFacts(source, category) {
  const sections = parseSections(source);
  const perSectionLimit = category === 'event' ? 240 : 170;
  const totalLimit = category === 'event' ? 1000 : 720;
  const facts = [];
  for (const [title, body] of sections) {
    if (/Agent输出约束|文档信息分层规则/u.test(title)) continue;
    const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
    const preferred = lines.filter((line) => /^[-*\d]|^[^：]{1,18}[:：]/u.test(line));
    const excerpt = compactText((preferred.length ? preferred : lines).slice(0, 3).join('\n'), perSectionLimit);
    if (excerpt) facts.push(`${title}：${excerpt.replace(/^[-*]\s*/u, '')}`);
    if (facts.length >= (category === 'event' ? 5 : 4)) break;
  }
  return compactText(facts.join('\n'), totalLimit);
}

function buildLorePolicies(entry) {
  const category = entry.分类;
  const title = entry.标题;
  if (category === 'location') {
    return {
      use: `在当前剧情确实进入或讨论「${title}」时，用于确定空间功能、可见氛围、合理活动与可出现人员，让地点成为行动环境而不是空白背景。`,
      boundary: `不得凭空补造「${title}」档案未记录的设施、人员或历史；地点资料不是玩家已经到访或经历相关事件的证明。`,
    };
  }
  if (category === 'faction') {
    return {
      use: `在「${title}」确实参与当前剧情时，用于校准其公开立场、职责、资源与行动逻辑；具体成员仍保留独立人格和选择。`,
      boundary: `不得把「${title}」的组织立场机械套给每名成员，也不得把传闻、宣传或外部评价写成组织全员一致认可的事实。`,
    };
  }
  if (category === 'event') {
    return {
      use: `将「${title}」作为原著历史背景与因果参照，只在当前剧情确实涉及该历史节点时校准年代、参与方和结果。`,
      boundary: `「${title}」不代表事件正在重演或玩家亲历；学者考据、传闻、推断与明确记载必须保持原有可信度层级，不能混写成确定事实。`,
    };
  }
  if (category === 'term') {
    return {
      use: `在正文确实涉及「${title}」时，用于统一该概念的世界规则、表现方式与叙事语义。`,
      boundary: `不得把「${title}」的概念资料直接写成角色已知、玩家已知或当前已发生事实，也不得用抽象概念强行替代具体人物动机与剧情因果。`,
    };
  }
  return {
    use: `在当前剧情明确需要「${title}」时，用于补充相关公开设定与关键事实。`,
    boundary: `不得把「${title}」的背景资料写成玩家已经历事实，不得补完档案没有确认的细节。`,
  };
}

function buildLoreInjection(entry) {
  const policies = buildLorePolicies(entry);
  const injection = {
    类型: 'lore',
    核心定义: compactText(entry.摘要, 520),
    关键事实: buildLoreFacts(entry.原文, entry.分类),
    叙事用途: policies.use,
    演绎边界: policies.boundary,
  };
  assertInjection(entry, injection, LORE_FIELDS);
  return injection;
}

function assertInjection(entry, injection, fields) {
  const missing = fields.filter((field) => !String(injection[field] ?? '').trim());
  if (missing.length) {
    throw new Error(`${entry.标题} 缺少注入字段：${missing.join('、')}`);
  }
}

function formatProperty(indent, injection) {
  const serialized = JSON.stringify(injection, null, 2)
    .split('\n')
    .map((line, index) => index === 0 ? line : `${indent}${line}`)
    .join('\n');
  return `${indent}"注入内容": ${serialized},\n`;
}

function buildInjection(entry) {
  return entry.分类 === 'character' ? buildCharacterInjection(entry) : buildLoreInjection(entry);
}

function refreshInjectionProperties(source, entries, fileName) {
  const matches = [...source.matchAll(/^(\s*)"注入内容": \{[\s\S]*?^\1\},\r?\n(?=\1"来源":)/gmu)];
  if (matches.length !== entries.length) {
    throw new Error(`${fileName} 的注入内容字段数 ${matches.length} 与条目数 ${entries.length} 不一致。`);
  }
  let next = source;
  const replacements = matches.map((match, index) => ({
    index: match.index,
    length: match[0].length,
    text: formatProperty(match[1], buildInjection(entries[index])),
  }));
  for (const replacement of replacements.reverse()) {
    next = next.slice(0, replacement.index) + replacement.text + next.slice(replacement.index + replacement.length);
  }
  return next;
}

function migrateFile(fileName) {
  const filePath = path.join(PRESET_DIR, fileName);
  const source = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(source);
  const entries = Array.isArray(data.entries) ? data.entries : [];
  if (!entries.length) return { fileName, count: 0, changed: false };

  const existingCount = entries.filter((entry) => entry.注入内容).length;
  if (existingCount) {
    if (existingCount !== entries.length) throw new Error(`${fileName} 只有部分条目带注入内容。`);
    for (const entry of entries) {
      const expectedType = entry.分类 === 'character' ? 'character' : 'lore';
      if (entry.注入内容?.类型 !== expectedType) throw new Error(`${fileName} / ${entry.标题} 注入类型错误。`);
      assertInjection(entry, entry.注入内容, expectedType === 'character' ? CHARACTER_FIELDS : LORE_FIELDS);
    }
    if (!REFRESH) return { fileName, count: entries.length, changed: false };
    const next = refreshInjectionProperties(source, entries, fileName);
    const changed = next !== source;
    if (WRITE && changed) fs.writeFileSync(filePath, next, 'utf8');
    return { fileName, count: entries.length, changed };
  }

  const sourceMatches = [...source.matchAll(/^(\s*)"来源":/gmu)];
  if (sourceMatches.length !== entries.length) {
    throw new Error(`${fileName} 的来源字段数 ${sourceMatches.length} 与条目数 ${entries.length} 不一致。`);
  }
  const insertions = entries.map((entry, index) => ({
    index: sourceMatches[index].index,
    text: formatProperty(sourceMatches[index][1], buildInjection(entry)),
  }));
  let next = source;
  for (const insertion of insertions.reverse()) {
    next = next.slice(0, insertion.index) + insertion.text + next.slice(insertion.index);
  }
  const parsed = JSON.parse(next);
  if (parsed.entries.length !== entries.length) throw new Error(`${fileName} 写入后条目数变化。`);
  if (WRITE) fs.writeFileSync(filePath, next, 'utf8');
  return { fileName, count: entries.length, changed: true };
}

const files = fs.readdirSync(PRESET_DIR).filter((name) => name.endsWith('.json')).sort();
const results = files.map(migrateFile);
const total = results.reduce((sum, item) => sum + item.count, 0);
const changed = results.filter((item) => item.changed);
console.log(`ZHIKU_STAGE4_MIGRATION_OK files=${results.length} entries=${total} changed=${changed.length} mode=${WRITE ? 'write' : 'check'} refresh=${REFRESH}`);
if (!WRITE && changed.length) {
  console.log('需要写入：', changed.map((item) => item.fileName).join('、'));
}
