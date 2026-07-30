import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const presetRoot = path.join(root, 'public', 'zhiku-presets');

const metadataKeys = new Set([
  'id',
  '标题',
  '分类',
  '来源',
  '关键词',
  '触发关键词',
  '辅助关键词',
  '资料类型',
  '使用范围',
  '关联角色ID',
  '关联形态ID',
  'updatedAt',
]);

const headingRenames = new Map([
  ['## 禁止误写', '## 事实边界'],
  ['## V3 注入内容', '## 人物概要'],
  ['## 注入内容', '## 人物概要'],
  ['## 正式语料原文', '## 官方语音原文'],
  ['## 正式语料', '## 官方语音原文'],
  ['## 语料层', '## 官方语音原文'],
]);

const droppedSections = new Set([
  '## 角色档案包说明',
  '## 档案状态',
]);

function isDroppedHeading(heading) {
  return droppedSections.has(heading)
    || /^#{2,3}\s+(?:本回合注入建议|注入建议|Agent输出约束)$/u.test(heading);
}

function cleanCommon(value) {
  return String(value ?? '')
    .replace(/示例台词不得整句复读，不得原句搬运，不得把示例事件当作当前剧情事实；主剧情必须按当前场景重新组织表达。/gu, '')
    .replace(/示例台词不得整句复读，不得把示例事件当作当前剧情事实；主剧情必须按当前场景重新组织表达。/gu, '')
    .replace(/正式中文语音只作口吻参考，不整句复读，不把语音中的事件自动当作当前剧情事实。/gu, '')
    .replace(/以下为正式角色语音整理，只作口吻参考，?/gu, '以下收录正式角色语音。')
    .replace(/以下均按整理语料处理，只用于学习加拉赫口语化、疲惫、接地气而带少量冷幽默的表达，不照抄原句，也不把语料中的事件和关系当作已确认当前事实。/gu, '加拉赫的语气口语化、略显疲惫，并带有少量冷幽默。')
    .replace(/语料只[^\n]*(?:。|$)/gu, '')
    .replace(/不照抄原句，不把语料事件直接当作当前剧情事实[。]?/gu, '')
    .replace(/以下(?:均摘自|为)[^\n]*正式语料[^\n]*[。；]?/gu, '')
    .replace(/本回合注入建议/gu, '当前场景说明')
    .replace(/当前注入/gu, '当前状态')
    .replace(/当前RP/gu, '当前故事')
    .replace(/玩家主动指定/gu, '主动指定')
    .replace(/玩家选择/gu, '当前选择')
    .replace(/玩家已知/gu, '已知')
    .replace(/面向玩家(?:\/公众)?/gu, '面向读者与公众')
    .replace(/玩家昵称不作为稳定别名[。；]?/gu, '')
    .replace(/账号名与玩家称呼不作为核心别名[。；]?/gu, '')
    .replace(/禁止误写\s*[:：]?/gu, '事实边界：')
    .replace(/本档案/gu, '该资料')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function normalizeNarrativeLanguage(value) {
  return value
    .replace(/当前叙事社群/gu, '社群')
    .replace(/当前叙事昵称/gu, '非官方昵称')
    .replace(/当前叙事戏称/gu, '非官方戏称')
    .replace(/当前叙事外号/gu, '非官方外号')
    .replace(/当前叙事评价/gu, '游戏评价')
    .replace(/当前叙事型角色/gu, '游戏玩家型角色')
    .replace(/当前叙事视角/gu, '游戏玩家视角')
    .replace(/当前叙事式/gu, '游戏玩家式')
    .replace(/当前叙事主角/gu, '开拓者')
    .replace(/当前叙事当前直接输入/gu, '当前作为视角角色')
    .replace(/当前叙事正在扮演/gu, '当前作为视角角色的')
    .replace(/当前叙事输入后的行动结果/gu, '眼前行动带来的结果')
    .replace(/当前叙事输入/gu, '已经发生的行动与选择')
    .replace(/当前叙事正文/gu, '当前剧情')
    .replace(/当前叙事未公开选择/gu, '尚未发生的选择')
    .replace(/当前叙事未触发/gu, '相关剧情尚未揭示')
    .replace(/当前叙事已经到访/gu, '相关人物已经到访')
    .replace(/当前叙事亲历/gu, '相关人物亲历')
    .replace(/当前叙事提供新资料并要求更新/gu, '获得新的可靠资料')
    .replace(/当前叙事主动(?:问|询问|追问)/gu, '当前剧情明确问及')
    .replace(/当前叙事主动提到/gu, '当前剧情明确涉及')
    .replace(/当前叙事明确追问/gu, '当前剧情明确问及')
    .replace(/当前叙事追问/gu, '当前剧情问及')
    .replace(/当前叙事明确提到/gu, '当前剧情明确涉及')
    .replace(/当前叙事明确/gu, '当前剧情明确')
    .replace(/与当前叙事同行/gu, '与开拓者同行')
    .replace(/忘记当前叙事/gu, '忘记既有经历')
    .replace(/抛弃当前叙事/gu, '抛弃既有同伴')
    .replace(/替当前叙事/gu, '替视角角色')
    .replace(/当前叙事/gu, '当前故事')
    .replace(/当前RP|\bRP\b/gu, '当前故事')
    .replace(/主剧情只按当前场景抽取/gu, '人物出场时只需结合当前场景提取')
    .replace(/主剧情/gu, '故事')
    .replace(/写法边界/gu, '表现边界')
    .replace(/写作时/gu, '人物表现中')
    .replace(/写作/gu, '人物表现')
    .replace(/玩家昵称/gu, '非官方昵称')
    .replace(/玩家称呼/gu, '非官方称呼')
    .replace(/玩家社群/gu, '社群')
    .replace(/玩家评价/gu, '游戏评价')
    .replace(/玩家/gu, '视角角色')
    .replace(/游戏视角角色/gu, '游戏玩家')
    .replace(/当前故事当前控制对象/gu, '当前控制对象')
    .replace(/当前故事当前/gu, '当前')
    .replace(/当当前作为视角角色的星/gu, '当星作为视角角色时')
    .replace(/当当前作为视角角色的穹/gu, '当穹作为视角角色时')
    .replace(/当星不是当前作为视角角色的对象时/gu, '当星不是视角角色时')
    .replace(/当穹不是当前作为视角角色的对象时/gu, '当穹不是视角角色时')
    .replace(/当前故事替身/gu, '空白替身')
    .replace(/当前故事型/gu, '游戏化')
    .replace(/游戏当前故事/gu, '游戏化视角')
    .replace(/最像当前故事的人/gu, '最习惯把世界当游戏的人')
    .replace(/当前故事\s*后续自由完成修正/gu, '后续故事可继续完善')
    .replace(/游戏游戏玩家式/gu, '游戏化')
    .replace(/游戏玩家型角色/gu, '游戏化表达鲜明的角色')
    .replace(/游戏玩家视角/gu, '游戏化视角')
    .replace(/游戏玩家式兴趣/gu, '游戏化兴趣')
    .replace(/游戏玩家式口吻/gu, '游戏化口吻')
    .replace(/游戏玩家式价值观/gu, '把世界视作游戏的价值观')
    .replace(/可人物表现/gu, '可表现为')
    .replace(/纳入建议/gu, '表现建议')
    .replace(/单角色档案包/gu, '单角色资料')
    .replace(/档案包/gu, '资料')
    .replace(/命途阶段口吻参考|饮月阶段口吻参考|腾荒阶段口吻参考/gu, '命途阶段语气')
    .replace(/示例台词不得整句重复，不得原句搬运。/gu, '')
    .replace(/### 写法指导/gu, '### 表现边界')
    .replace(/## 写法收束/gu, '## 表现收束')
    .replace(/更适合的写法，是/gu, '更适合表现为')
    .replace(/写法上/gu, '表现上')
    .replace(/推进决策的写法/gu, '推进决策的表现方式')
    .replace(/相关记录可以将此层级的信息作为「游戏内NPC可能知道、可以引述」的公共知识使用。/gu, '这一层级属于寰宇公开知识，可由知情人物自然引述。')
    .replace(/相关记录可以将此信息用于内部推理和因果建模，但不得让游戏内NPC以确定性口吻说出。NPC若涉及此层级信息，必须以推测、传说、不知名来源等形式表达。/gu, '这一层级并非寰宇公共认知；人物提及时只能采用推测、传说或来源不明的说法。')
    .replace(/相关记录应将其视为可能为真、可能为假的元数据，结合其他来源交叉验证后自行判断使用。/gu, '这一层级的可信度存疑，需要结合其他来源交叉判断。')
    .replace(/复读/gu, '重复')
    .replace(/照抄/gu, '直接沿用')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function isMaintenanceLine(line) {
  return /^\s*[-*]\s*(?:角色ID|UI分组|默认可用范围|使用范围|核心触发词|辅助关键词|互斥组ID|资料类型|召回原则|审计日期|审计结论|来源记录)\s*[:：]/u.test(line.trim());
}

function cleanRawArchive(raw) {
  const lines = String(raw ?? '').replace(/\r\n?/gu, '\n').split('\n');
  const output = [];
  let dropped = false;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^##\s+(.+?)\s*$/u)?.[0];
    if (heading && isDroppedHeading(heading)) {
      dropped = true;
      continue;
    }
    if (dropped && /^##\s+/u.test(line)) dropped = false;
    if (dropped || isMaintenanceLine(line)) continue;
    output.push(heading && headingRenames.has(heading) ? headingRenames.get(heading) : line);
  }
  return cleanInjectionValue(output.join('\n'));
}

function cleanInjectionValue(value) {
  return normalizeNarrativeLanguage(cleanCommon(value))
    .split('\n')
    .filter((line) => !isMaintenanceLine(line))
    .join('\n')
    .replace(/^##\s+语料层\s*$/gmu, '## 官方语音原文')
    .replace(/^##\s+正式语料原文\s*$/gmu, '## 官方语音原文')
    .replace(/^##\s+禁止误写\s*$/gmu, '## 事实边界')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/优先召回本档案/gu, '优先使用该资料')
    .replace(/自动召回/gu, '自动使用')
    .replace(/召回整份档案/gu, '使用整份资料')
    .replace(/召回时/gu, '使用时')
    .replace(/召回/gu, '使用')
    .replace(/触发后注入/gu, '相关阶段可见')
    .replace(/注入内容/gu, '资料内容')
    .replace(/注入/gu, '纳入')
    .replace(/存档/gu, '记录')
    .replace(/Agent/gu, '相关记录')
    .replace(/禁止照抄语料[。；]?/gu, '正式语音原文保持独立。')
    .replace(/写作时/gu, '人物表现中')
    .trim();
}

function cleanEntry(entry) {
  let changed = false;
  for (const [key, value] of Object.entries(entry)) {
    if (metadataKeys.has(key) || typeof value !== 'string') continue;
    const next = key === '原文' ? cleanRawArchive(value) : cleanInjectionValue(value);
    if (next !== value) {
      entry[key] = next;
      changed = true;
    }
  }
  if (entry.注入内容 && typeof entry.注入内容 === 'object') {
    for (const [key, value] of Object.entries(entry.注入内容)) {
      if (typeof value !== 'string') continue;
      const next = cleanInjectionValue(value);
      if (next !== value) {
        entry.注入内容[key] = next;
        changed = true;
      }
    }
  }
  return changed;
}

let changedFiles = 0;
let changedEntries = 0;
for (const fileName of fs.readdirSync(presetRoot).filter((name) => name.endsWith('.json')).sort()) {
  const filePath = path.join(presetRoot, fileName);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let fileChanged = false;
  if (typeof payload.description === 'string') {
    const nextDescription = cleanInjectionValue(payload.description);
    if (nextDescription !== payload.description) {
      payload.description = nextDescription;
      fileChanged = true;
    }
  }
  for (const entry of payload.entries ?? []) {
    if (cleanEntry(entry)) {
      fileChanged = true;
      changedEntries += 1;
    }
  }
  if (fileChanged) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    changedFiles += 1;
  }
}

console.log(JSON.stringify({ changedFiles, changedEntries, scope: 'public/zhiku-presets' }));
