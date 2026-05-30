import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const preset = fs.readFileSync('data/zhikuPreset.ts', 'utf8');
const model = fs.readFileSync('models/zhiku.ts', 'utf8');
const chatModel = fs.readFileSync('models/chat.ts', 'utf8');
const panel = fs.readFileSync('components/features/GameSystems/ZhikuPanel.tsx', 'utf8');
const turnItem = fs.readFileSync('components/features/Chat/TurnItem.tsx', 'utf8');
const state = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const saveLoad = fs.readFileSync('hooks/useGame/saveLoadWorkflow.ts', 'utf8');
const retrieval = fs.readFileSync('services/zhikuRetrieval.ts', 'utf8');
const storyProgress = fs.readFileSync('services/storyProgressService.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const settingsModel = fs.readFileSync('models/settings.ts', 'utf8');
const runtimeUnlock = fs.readFileSync('services/zhikuRuntimeUnlock.ts', 'utf8');
const contextSnapshot = fs.readFileSync('hooks/useGame/contextSnapshot.ts', 'utf8');
const phoneService = fs.readFileSync('services/ai/phoneService.ts', 'utf8');
const newsModel = fs.readFileSync('services/ai/newsModel.ts', 'utf8');
const rebuildPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/character-rebuild-core.json', 'utf8'));
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
    preset.includes('updatedAt') &&
    preset.includes('encodeURIComponent(preset.updatedAt ?? preset.id)') &&
    preset.includes('ZHIKU_CHARACTER_REBUILD_ENTRY_ID_PREFIX') &&
    preset.includes('isRebuiltZhikuCharacterEntry') &&
    preset.includes("entry.分类 !== 'character' || isRebuiltZhikuCharacterEntry(entry)"),
  'rebuilt character preset must be explicitly allowed while legacy character presets stay filtered.',
);
assert(
  model.includes('export interface 智库软结构标签') &&
    model.includes('解析智库软结构标签') &&
    model.includes('获取智库人物名') &&
    model.includes('获取智库人物名列表') &&
    model.includes('获取智库人物节点标题') &&
    model.includes('比较智库人物节点') &&
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
  state.includes('removeLegacyZhikuCharacterEntries(') &&
    state.includes('ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY'),
  'startup zhiku merge must remove legacy character entries from saved local data.',
);
assert(
  saveLoad.includes('removeLegacyZhikuCharacterEntries(') &&
    saveLoad.includes("await saveSetting('zhikuSystem', buildPersistedZhikuSystem(nextZhiku))"),
  'loading an old save must not restore legacy character entries into active zhiku.',
);
assert(
    saveLoad.includes('loadAllBundledZhikuPresets') &&
    saveLoad.includes('mergeZhikuRuntimeUnlockOverrides') &&
    saveLoad.includes('isBundledZhikuDuplicate') &&
    saveLoad.includes('mergeZhikuRuntimeUnlockOverrides((await loadAllBundledZhikuPresets()).条目, save.智库?.条目)') &&
    saveLoad.includes('!entry.builtin && !isBundledZhikuDuplicate(entry)'),
  'loading a save must merge current bundled zhiku presets, including rebuilt character personas, with save custom entries.',
);
assert(
  preset.includes('mergeZhikuRuntimeUnlockOverrides') &&
    preset.includes('运行时解锁状态') &&
    preset.includes('运行时解锁备注'),
  'bundled zhiku merge must preserve runtime unlock overrides from local saves.',
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
    state.includes("await saveSetting('zhikuSystem', buildPersistedZhikuSystem(mergedZhiku))") &&
    saveLoad.includes('buildPersistedZhikuSystem') &&
    saveLoad.includes('智库: buildPersistedZhikuSystem(overrides?.智库 ?? state.智库)') &&
    saveLoad.includes("await saveSetting('zhikuSystem', buildPersistedZhikuSystem(nextZhiku))") &&
    sendWorkflow.includes("await saveSetting('zhikuSystem', buildPersistedZhikuSystem(zhikuAfterRuntimeUnlock))") &&
    panel.includes("await saveSetting('zhikuSystem', buildPersistedZhikuSystem(next))"),
  'all zhiku save paths must persist a slim zhiku payload instead of the full bundled library.',
);
assert(
  retrieval.includes('解析智库软结构标签') &&
    retrieval.includes('获取智库人物名') &&
    retrieval.includes('获取智库人物名列表') &&
    retrieval.includes('flatMap((entry) => 获取智库人物名列表(entry))') &&
    retrieval.includes('比较智库人物节点') &&
    retrieval.includes('buildCharacterAnchorEntries') &&
    retrieval.includes('isMainStoryAllowedZhikuMeta'),
  'zhiku retrieval must understand rebuilt character soft-structure nodes.',
);
assert(
  retrieval.includes('sceneContext?.npcNames') &&
    retrieval.includes('ZHIKU_SCENE_CHARACTER_HINTS') &&
    retrieval.includes('主体|OOC|风险') &&
    retrieval.includes('人物主体人格用于校准口吻与行为边界') &&
    retrieval.includes('外貌、性格、说话方式、行为习惯、关系边界与禁止误写字段是角色表现的优先锚点') &&
    retrieval.includes('getZhikuPerformanceText(entry)') &&
    retrieval.includes('formatZhikuPerformanceBrief(entry') &&
    retrieval.includes('performance.includes(q)') &&
    retrieval.includes('performance.includes(term)') &&
    retrieval.includes('性格锚点：') &&
    retrieval.includes('说话方式：') &&
    ['外貌：', '性格：', '口吻：', '行为：', '关系边界：', '禁止误写：'].every((label) => retrieval.includes(label)),
  'zhiku retrieval must prioritize in-scene character persona anchors.',
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
    retrieval.includes('人物锚点') &&
    retrieval.includes('角色相关资料') &&
    retrieval.includes('强相关资料') &&
    retrieval.includes('弱相关资料') &&
    retrieval.includes('未加入人物锚点'),
  'zhiku retrieval must expose diagnostics for character anchors and gate filtering.',
);
assert(
  /maxRelatedEntries:\s*8/.test(settingsModel),
  'default zhiku recall count should be 8.',
);
assert(
  retrieval.includes('characterEntries?: 智库条目[]') &&
    retrieval.includes('strongEntries?: 智库条目[]') &&
    retrieval.includes('weakEntries?: 智库条目[]') &&
    retrieval.includes('interface 智库召回分组') &&
    retrieval.includes('function isNormalRecallEntry') &&
    retrieval.includes("entry.分类 !== 'character' && entry.分类 !== 'story'") &&
    retrieval.includes('角色相关资料：【编号】|【编号】') &&
    retrieval.includes('输出格式必须严格为三行') &&
    retrieval.includes('角色相关资料只挑') &&
    retrieval.includes('不要把 character 条目放进强/弱相关') &&
    retrieval.includes('characterEntries: characterAnchors') &&
    retrieval.includes('strongEntries: primaryEntries') &&
    retrieval.includes('weakEntries: weakSource.slice(0, Math.max(0, limit - primaryEntries.length))') &&
    retrieval.includes('fallback.characterEntries ?? []') &&
    retrieval.includes('buildZhikuInjection(groups') &&
    retrieval.includes("formatGroup('角色相关资料', groups.characterEntries)") &&
    retrieval.includes("formatGroup('强相关资料', groups.strongEntries)") &&
    retrieval.includes("formatGroup('弱相关资料', groups.weakEntries)"),
  'zhiku recall must keep character persona entries in separate slots from strong/weak normal references.',
);
assert(
    contextSnapshot.includes('本地召回诊断') &&
    contextSnapshot.includes('上一回合真实保存的召回诊断') &&
    contextSnapshot.includes('latestAssistantZhikuDebugRecall') &&
    contextSnapshot.includes('zhikuRecallPreview') &&
    contextSnapshot.includes('historyThroughLatestUser') &&
    contextSnapshot.includes('主流程增强召回查询') &&
    contextSnapshot.includes('buildMainRecallQuery({') &&
    contextSnapshot.includes('zhikuDiagnostics.被门禁过滤') &&
    contextSnapshot.includes('npcNames: state.NPC') &&
    contextSnapshot.includes('相关角色') &&
    contextSnapshot.includes('人物锚点') &&
    contextSnapshot.includes('zhikuDiagnostics.角色相关资料') &&
    contextSnapshot.includes('zhikuDiagnostics.强相关资料') &&
    contextSnapshot.includes('zhikuDiagnostics.弱相关资料') &&
    contextSnapshot.includes('输出格式必须严格为三行') &&
    contextSnapshot.includes('角色相关资料：【编号】|【编号】'),
  'zhiku request context must show local retrieval diagnostics for OOC/gate debugging.',
);
assert(
  panel.includes("activeCategory === 'character'") &&
    panel.includes('<CharacterWorkspace') &&
    panel.includes('md:grid-cols-[170px_160px_220px_minmax(0,1fr)]') &&
    panel.includes('lg:grid-cols-[190px_180px_260px_minmax(0,1fr)]') &&
    panel.includes('truncate whitespace-nowrap font-serif') &&
    panel.includes('角色列表') &&
    panel.includes('形态 / 节点') &&
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

const enemyUnitNames = ['虚卒', '末日兽', '践踏者', '死龙', '敌方指挥官', '机械守卫', '召唤型敌群', '异常构造体', '精英敌人', '终局首领'];
for (const name of enemyUnitNames) {
  const entry = allBundledEntries.find((item) => item.标题 === name);
  assert(entry, `enemy unit entry must exist: ${name}`);
  assert(entry.分类 !== 'character', `enemy unit must not use character category because rebuilt-character filtering would hide it: ${name}`);
  assert(entry.分类 === 'npc', `enemy unit should live in npc category for normal zhiku retrieval: ${name}`);
  assert(entry.可用于联动 !== false, `enemy unit must remain linkable for zhiku retrieval: ${name}`);
}

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
  'Evernight must be a locked March 7th form gate, not a separate active persona.',
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

function nodeTitle(entry) {
  return tagValues(entry, '节点')[0] || tagValues(entry, '资料类型')[0] || entry.标题;
}

function buildUiProfilesLikePanel(sourceEntries) {
  const map = new Map();
  for (const entry of sourceEntries) {
    const roles = rolesOf(entry);
    for (const role of roles.length ? roles : [entry.标题.split(/[｜|]/u)[0]]) {
      if (!map.has(role)) map.set(role, []);
      const list = map.get(role);
      if (!list.some((item) => item.id === entry.id)) list.push(entry);
    }
  }
  return map;
}

const uiProfiles = buildUiProfilesLikePanel(activeBundledCharacters);
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
    sendWorkflow.includes('智库召回诊断：'),
  'saved per-turn request context must include zhiku retrieval diagnostics.',
);
assert(
  turnItem.includes('回忆、剧情编织与智库预览'),
  'turn request context heading must mention zhiku because recallPreview now includes zhiku diagnostics.',
);
assert(
  chatModel.includes('zhikuRecallPreview?: string') &&
    sendWorkflow.includes('zhikuRecallPreview: formatZhikuDiagnosticsPreview(zhikuPreview?.diagnostics)') &&
    contextSnapshot.includes('msg.debugContext?.zhikuRecallPreview') &&
    !contextSnapshot.includes('msg.debugContext?.recallPreview?.trim()'),
  'zhiku context tab must read the saved zhiku-only diagnostics instead of the combined memory/story/zhiku preview.',
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
    sendWorkflow.includes("import { buildPersistedZhikuSystem }") &&
    sendWorkflow.includes('storyAlignment.progressed') &&
    sendWorkflow.includes('applyStoryArchiveZhikuRuntimeUnlock({') &&
    sendWorkflow.includes("await saveSetting('zhikuSystem', buildPersistedZhikuSystem(zhikuAfterRuntimeUnlock))") &&
    sendWorkflow.includes('剧情归档已更新智库门禁') &&
    sendWorkflow.includes('智库: zhikuAfterRuntimeUnlock'),
  'main workflow must update zhiku runtime unlocks after story weaving progresses and include them in autosave.',
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
