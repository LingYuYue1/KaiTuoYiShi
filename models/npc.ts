// NPC 档案库:路人和重要伙伴共用同一份 schema,靠 `阶位` 区分。
// AI 注入策略:默认只看 `阶位 === 'companion'` 的,路人再现时由调用方临时拼装。
// 晋升单向:路人 → 伙伴可手动也可由原著角色库自动;v1 不做降级(兜底 UI 提供)。

import { matchCanonical } from '@/data/canonicalCharacters';
import { getDefaultBuiltinAvatar } from '@/data/builtinAvatars';
import { 清理NPC同行记忆摘要 } from '@/utils/npcMemorySanitizer';
export type NPC阶位 = 'companion' | 'extra';

export type NPC性别 = '男' | '女' | '其他';

export type NPC关系类型 =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close'
  | 'rival'
  | 'enemy';

export type NPC同行记忆来源 = '正文' | '手机' | '新闻' | '变量' | '其他';
export type NPC头像槽位 = '档案' | '正文' | '手机';
export type NPC_NSFW年龄确认 = 'adult' | 'unknown' | 'minor_blocked';

export interface NPC同行记忆条目 {
  id: string;
  回合: number;
  摘要: string;
  原文?: string;
  来源?: NPC同行记忆来源;
  关联NPCID?: string[];
}

export interface NPC_NSFW档案 {
  enabled?: boolean;
  年龄确认?: NPC_NSFW年龄确认;
  亲密阶段?: string;
  边界?: string;
  偏好?: string[];
  敏感点?: string[];
  禁忌?: string[];
  女性身体档案?: {
    胸部?: string;
    女性私处?: string;
    后庭?: string;
    体态?: string;
    体味?: string;
  };
  男性身体档案?: {
    男性器?: string;
    后庭?: string;
    体态?: string;
    体味?: string;
  };
  /** @deprecated 旧版男女混合字段，归一化时迁移到 女性身体档案 / 男性身体档案。 */
  身体档案?: {
    胸部?: string;
    私处?: string;
    后庭?: string;
    肉棒?: string;
    体态?: string;
    体味?: string;
  };
  经历?: string[];
  长期事实?: string[];
  标签?: string[];
  部位图片?: Partial<Record<'女性胸部' | '女性私处' | '男性器' | '后庭' | '体态参考', string>>;
  备注?: string;
}

export interface NPC角色锚点档案 {
  id?: string;
  名称?: string;
  是否启用?: boolean;
  生成时默认附加?: boolean;
  场景生图自动注入?: boolean;
  正面提示词?: string;
  负面提示词?: string;
  结构化特征?: {
    外貌标签?: string[];
    身材标签?: string[];
    胸部标签?: string[];
    发型标签?: string[];
    发色标签?: string[];
    眼睛标签?: string[];
    肤色标签?: string[];
    年龄感标签?: string[];
    服装基底标签?: string[];
    特殊特征标签?: string[];
  };
  来源?: 'ai_extract' | 'manual' | 'imported';
  原始提取文本?: string;
  提取模型信息?: string;
  createdAt?: number;
  updatedAt?: number;
}

export const NPC_RELATION_LABELS: Record<NPC关系类型, string> = {
  stranger: '陌生',
  acquaintance: '点头之交',
  friend: '朋友',
  close: '挚友',
  rival: '对头',
  enemy: '敌人',
};

const NPC_NAME_PREFIXES = [
  '负伤的',
  '重伤的',
  '轻伤的',
  '受伤的',
  '濒死的',
  '昏迷的',
  '倒地的',
  '被击倒的',
  '被击败的',
  '受困的',
  '被困的',
  '虚弱的',
  '疲惫的',
  '狼狈的',
  '匆忙的',
  '沉默的',
  '一位',
  '一名',
  '某位',
  '某名',
  '那位',
  '这位',
  '一个',
  '一只',
];

const NPC_GENERIC_SUFFIXES = [
  '铁卫',
  '云骑军',
  '云骑',
  '守卫',
  '卫兵',
  '士兵',
  '军官',
  '士官',
  '护卫',
  '巡逻兵',
  '巡卫',
  '船员',
  '员工',
  '科员',
  '研究员',
  '学者',
  '商人',
  '市民',
  '路人',
  '乘客',
  '旅客',
  '雇佣兵',
  '佣兵',
  '侍从',
  '侍卫',
  '猎手',
  '巡海游侠',
  '机兵',
  '怪物',
  '怪兽',
  '裂界生物',
];

const RELATION_RANK: Record<NPC关系类型, number> = {
  enemy: 5,
  rival: 4,
  close: 3,
  friend: 2,
  acquaintance: 1,
  stranger: 0,
};

export interface NPC记录 {
  id: string;
  姓名: string;
  别名?: string;
  阶位: NPC阶位;                     // companion=进 AI prompt;extra=只存档
  好感度: number;                    // -100..100
  关系: NPC关系类型;
  同行: boolean;
  初见回合: number;
  最近回合: number;
  性别?: NPC性别;
  对玩家称呼?: string;               // NPC 平时如何称呼旅人,如「旅人」「开拓者」「小家伙」
  外貌?: string;
  穿着?: string;
  说话方式?: string;
  性格?: string;
  介绍?: string;                     // 人物介绍 / 背景
  装备摘要?: string;                 // 自由文本描述其装备/武器,后续接 NPC装备 schema 再扩
  同行记忆?: NPC同行记忆条目[];      // 与玩家共同经历的关键节点,AI 推进剧情时填充
  备注: string[];
  原著角色?: boolean;                // 来自原著角色库的标记
  NSFW档案?: NPC_NSFW档案;
  图像档案?: {
    头像?: string;
    立绘?: string;
    头像槽位?: Partial<Record<NPC头像槽位, string>>;
    头像提示词?: string;
    立绘提示词?: string;
    角色锚点?: NPC角色锚点档案;
    状态?: 'none' | 'pending' | 'done' | 'failed';
    来源?: '手动' | '原著' | '文生图' | '占位';
  };
  头像?: string;                     // 圆形渲染;后续接入生图功能后由生图模块写入
}

export function 创建NPC记录(input: {
  姓名: string;
  阶位?: NPC阶位;
  初见回合: number;
  别名?: string;
  原著角色?: boolean;
  性别?: NPC性别;
  外貌?: string;
  穿着?: string;
  说话方式?: string;
  性格?: string;
  介绍?: string;
  头像?: string;
  图像档案?: NPC记录['图像档案'];
  NSFW档案?: NPC记录['NSFW档案'];
}): NPC记录 {
  return {
    id: `npc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    姓名: input.姓名,
    别名: input.别名,
    阶位: input.阶位 ?? 'extra',
    好感度: 0,
    关系: 'stranger',
    同行: false,
    初见回合: input.初见回合,
    最近回合: input.初见回合,
    性别: input.性别,
    外貌: input.外貌,
    穿着: input.穿着,
    说话方式: input.说话方式,
    性格: input.性格,
    介绍: input.介绍,
    头像: input.头像,
    图像档案: input.图像档案,
    NSFW档案: input.NSFW档案,
    备注: [],
    原著角色: input.原著角色,
  };
}

export function 归一化NPC记录列表(raw: unknown): NPC记录[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, NPC记录>();
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const record = 归一化单个NPC记录(item as Partial<NPC记录> & Record<string, unknown>, index);
    if (shouldIgnoreNpcRecord(record)) return;
    const key = 查找可合并NPC身份键(record, merged) ?? 计算NPC身份键(record);
    const current = merged.get(key);
    merged.set(key, current ? 合并NPC记录(current, record) : record);
  });
  return [...merged.values()];
}

function 归一化单个NPC记录(source: Partial<NPC记录> & Record<string, unknown>, index: number): NPC记录 {
  const rawName = source.姓名 ?? source.name ?? source.名称 ?? source.名字;
  const rawTier = source.阶位 ?? source.tier ?? source.类型 ?? source.category;
  const rawRelation = source.关系 ?? source.relation;
  const rawAffinity = source.好感度 ?? source.affinity ?? source.favor ?? source.亲密度;
  const rawFirstTurn = source.初见回合 ?? source.firstSeenTurn ?? source.firstTurn;
  const rawRecentTurn = source.最近回合 ?? source.lastSeenTurn ?? source.recentTurn;

  const name = typeof rawName === 'string' && rawName.trim()
    ? rawName.trim()
    : `未命名 NPC ${index + 1}`;
  const normalizedTierText = typeof rawTier === 'string' ? rawTier.trim().toLowerCase() : '';
  const tier: NPC阶位 =
    normalizedTierText === 'companion' || normalizedTierText === '伙伴' || normalizedTierText === '重要伙伴'
      ? 'companion'
      : 'extra';
  const relation: NPC关系类型 =
    typeof rawRelation === 'string' && rawRelation in NPC_RELATION_LABELS
      ? rawRelation as NPC关系类型
      : 'stranger';
  const affinity = Number(rawAffinity);
  const firstTurn = Number(rawFirstTurn);
  const recentTurn = Number(rawRecentTurn);
  const rawAlias = source.别名 ?? source.alias;
  const rawGender = source.性别 ?? source.gender;
  const rawPlayerName = source.对玩家称呼 ?? source.称呼 ?? source.playerCallName;
  const rawAppearance = source.外貌 ?? source.appearance;
  const rawClothing = source.穿着 ?? source.服饰 ?? source.clothing ?? source.outfit;
  const rawSpeech = source.说话方式 ?? source.说话习惯 ?? source.speakingStyle ?? source.tone;
  const rawPersonality = source.性格 ?? source.personality;
  const rawIntro = source.介绍 ?? source.简介 ?? source.description;
  const rawEquipment = source.装备摘要 ?? source.装备 ?? source.equipment;
  const rawMemories = source.同行记忆 ?? source.memories ?? source.memory;
  const rawNotes = source.备注 ?? source.notes;
  const rawAvatar = source.头像 ?? source.avatar ?? source.avatarUrl;
  const rawNSFW = source.NSFW档案 ?? source.nsfw ?? source.NSFW;
  const rawImage = source.图像档案 ?? source.image ?? source.images;
  const canonical = 匹配NPC原著角色(name, typeof rawAlias === 'string' ? rawAlias : undefined);
  const shouldForceCompanion = Boolean(canonical || source.原著角色 || source.canonical);

  return {
    id: typeof source.id === 'string' && source.id.trim()
      ? source.id
      : `npc-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    姓名: name,
    别名: typeof rawAlias === 'string' ? rawAlias : undefined,
    阶位: shouldForceCompanion ? 'companion' : tier,
    好感度: Number.isFinite(affinity) ? Math.max(-100, Math.min(100, affinity)) : 0,
    关系: relation,
    同行: Boolean(source.同行 ?? source.isTraveling ?? source.在场) && (shouldForceCompanion || tier === 'companion'),
    初见回合: Number.isFinite(firstTurn) ? firstTurn : 1,
    最近回合: Number.isFinite(recentTurn)
      ? recentTurn
      : (Number.isFinite(firstTurn) ? firstTurn : 1),
    性别: rawGender === '男' || rawGender === '女' || rawGender === '其他' ? rawGender : undefined,
    对玩家称呼: typeof rawPlayerName === 'string' ? rawPlayerName : undefined,
    外貌: typeof rawAppearance === 'string' ? rawAppearance : undefined,
    穿着: typeof rawClothing === 'string' ? rawClothing : undefined,
    说话方式: typeof rawSpeech === 'string' ? rawSpeech : undefined,
    性格: typeof rawPersonality === 'string' ? rawPersonality : undefined,
    介绍: typeof rawIntro === 'string' ? rawIntro : undefined,
    装备摘要: typeof rawEquipment === 'string' ? rawEquipment : undefined,
    同行记忆: 归一化同行记忆列表(rawMemories),
    备注: Array.isArray(rawNotes)
      ? rawNotes.filter((note): note is string => typeof note === 'string')
      : [],
    原著角色: shouldForceCompanion,
    NSFW档案: 归一化NSFW档案(rawNSFW),
    图像档案: 归一化图像档案(rawImage, rawAvatar),
    头像: typeof rawAvatar === 'string' ? rawAvatar : undefined,
  };
}

function 合并NPC记录(base: NPC记录, incoming: NPC记录): NPC记录 {
  const preferred = 选择更完整的NPC记录(base, incoming);
  return {
    ...preferred,
    姓名: 选择NPC显示姓名(base, incoming, preferred),
    别名: 选择NPC别名(base, incoming, preferred),
    阶位: base.阶位 === 'companion' || incoming.阶位 === 'companion' ? 'companion' : preferred.阶位,
    关系: 关系优先级更高(base.关系, incoming.关系),
    // 阶位代表重要程度，同行代表当前是否在场；原著角色/伙伴不能自动等于同行中。
    同行: Boolean(base.同行 || incoming.同行),
    初见回合: Math.min(base.初见回合 ?? incoming.初见回合, incoming.初见回合 ?? base.初见回合),
    最近回合: Math.max(base.最近回合 ?? 0, incoming.最近回合 ?? 0),
    好感度: 选择更可信的好感度(base, incoming, preferred),
    同行记忆: 合并同行记忆(base.同行记忆 ?? [], incoming.同行记忆 ?? []),
    备注: 去重文本列表([...(base.备注 ?? []), ...(incoming.备注 ?? [])]),
    原著角色: Boolean(base.原著角色 || incoming.原著角色),
    头像: preferred.头像 ?? base.头像 ?? incoming.头像,
    外貌: preferred.外貌 ?? base.外貌 ?? incoming.外貌,
    穿着: preferred.穿着 ?? base.穿着 ?? incoming.穿着,
    说话方式: preferred.说话方式 ?? base.说话方式 ?? incoming.说话方式,
    性格: preferred.性格 ?? base.性格 ?? incoming.性格,
    介绍: preferred.介绍 ?? base.介绍 ?? incoming.介绍,
    对玩家称呼: preferred.对玩家称呼 ?? base.对玩家称呼 ?? incoming.对玩家称呼,
    性别: preferred.性别 ?? base.性别 ?? incoming.性别,
    装备摘要: preferred.装备摘要 ?? base.装备摘要 ?? incoming.装备摘要,
    NSFW档案: preferred.NSFW档案 ?? base.NSFW档案 ?? incoming.NSFW档案,
    图像档案: preferred.图像档案 ?? base.图像档案 ?? incoming.图像档案,
  };
}

function 选择NPC显示姓名(base: NPC记录, incoming: NPC记录, preferred: NPC记录): string {
  const canonical = 匹配NPC原著角色(base.姓名, base.别名) ?? 匹配NPC原著角色(incoming.姓名, incoming.别名);
  if (canonical) return canonical.name;
  const baseTemp = Boolean(解析临时称呼(base.姓名));
  const incomingTemp = Boolean(解析临时称呼(incoming.姓名));
  if (baseTemp && !incomingTemp) return incoming.姓名;
  if (!baseTemp && incomingTemp) return base.姓名;
  return preferred.姓名;
}

function 选择NPC别名(base: NPC记录, incoming: NPC记录, preferred: NPC记录): string | undefined {
  const candidates = [preferred.别名, base.别名, incoming.别名];
  const tempNames = [base.姓名, incoming.姓名].filter((name) => 解析临时称呼(name));
  return 去重文本列表([...candidates, ...tempNames].filter((item): item is string => typeof item === 'string')).join(' / ') || undefined;
}

function 选择更完整的NPC记录(a: NPC记录, b: NPC记录): NPC记录 {
  return 计算NPC记录分数(b) > 计算NPC记录分数(a) ? b : a;
}

function 计算NPC记录分数(record: NPC记录): number {
  let value = 0;
  if (匹配NPC原著角色(record.姓名, record.别名)) value += 120;
  if (record.阶位 === 'companion') value += 35;
  if (record.同行) value += 20;
  if (record.原著角色) value += 18;
  value += 选择更可信的字段数量(record) * 3;
  value += Math.min(20, Math.max(0, Number(record.最近回合) || 0));
  value += Math.min(10, Math.abs(Number(record.好感度) || 0) / 10);
  value += Math.min(8, 去除NPC修饰前缀(record.姓名).length);
  return value;
}

function 选择更可信的字段数量(record: NPC记录): number {
  return [
    record.别名,
    record.性别,
    record.对玩家称呼,
    record.外貌,
    record.穿着,
    record.说话方式,
    record.性格,
    record.介绍,
    record.装备摘要,
    record.头像,
  ].filter((value) => typeof value === 'string' && value.trim()).length
    + (record.NSFW档案 ? 1 : 0)
    + (record.图像档案 ? 1 : 0)
    + (record.备注?.length ?? 0);
}

function 选择更可信的好感度(a: NPC记录, b: NPC记录, preferred: NPC记录): number {
  if (preferred === a) return a.好感度;
  if (preferred === b) return b.好感度;
  return Math.abs(b.好感度) > Math.abs(a.好感度) ? b.好感度 : a.好感度;
}

function 关系优先级更高(a: NPC关系类型, b: NPC关系类型): NPC关系类型 {
  return RELATION_RANK[b] > RELATION_RANK[a] ? b : a;
}

function 计算NPC身份键(record: NPC记录): string {
  const normalized = 规范化NPC身份文本(record.姓名);
  const canonical = 匹配NPC原著角色(record.姓名, record.别名);
  if (canonical) return `canon:${canonical.name}`;
  const genericSuffix = NPC_GENERIC_SUFFIXES.find((suffix) => normalized.endsWith(suffix));
  if (genericSuffix) return `generic:${genericSuffix}`;
  return `name:${normalized.toLowerCase()}`;
}

function 查找可合并NPC身份键(record: NPC记录, merged: Map<string, NPC记录>): string | null {
  const keys = 生成NPC身份候选键(record);
  for (const key of keys) {
    if (merged.has(key)) return key;
  }
  for (const [key, existing] of merged) {
    const existingKeys = 生成NPC身份候选键(existing);
    if (keys.some((candidate) => existingKeys.includes(candidate))) return key;
    if (应按临时称呼合并NPC(existing, record)) return key;
  }
  return null;
}

function 生成NPC身份候选键(record: NPC记录): string[] {
  const keys = new Set<string>([计算NPC身份键(record)]);
  const canonical = 匹配NPC原著角色(record.姓名, record.别名);
  if (canonical) keys.add(`canon:${canonical.name}`);
  for (const text of [record.姓名, record.别名]) {
    const normalized = text ? 规范化NPC身份文本(text) : '';
    if (!normalized) continue;
    const aliasCanonical = matchCanonical(normalized);
    if (aliasCanonical) keys.add(`canon:${aliasCanonical.name}`);
    keys.add(`name:${normalized.toLowerCase()}`);
  }
  return [...keys];
}

function 匹配NPC原著角色(name: string, alias?: string): ReturnType<typeof matchCanonical> {
  for (const text of [name, alias]) {
    if (!text) continue;
    const canonical = matchCanonical(规范化NPC身份文本(text));
    if (canonical) return canonical;
  }
  return null;
}

function 规范化NPC身份文本(name: string): string {
  return 去除NPC修饰前缀(name)
    .replace(/\s+/g, '')
    .replace(/[“”"'\-·•]/g, '')
    .trim();
}

const NPC_TEMP_NAME_PREFIXES = ['未知', '神秘', '陌生', '无名', '灰发', '黑发', '白发', '银发', '粉发', '红发', '金发', '蓝发', '紫发'];
const NPC_TEMP_NAME_SUFFIXES = ['少女', '少年', '女孩', '男孩', '青年', '女人', '男人', '女士', '男子', '角色'];

function 应按临时称呼合并NPC(a: NPC记录, b: NPC记录): boolean {
  if (匹配NPC原著角色(a.姓名, a.别名) || 匹配NPC原著角色(b.姓名, b.别名)) return false;
  if (a.关系 === 'enemy' || b.关系 === 'enemy') return false;
  const aTemp = 解析临时称呼(a.姓名);
  const bTemp = 解析临时称呼(b.姓名);
  if (!aTemp || !bTemp || aTemp.kind !== bTemp.kind) return false;
  const aTokens = 提取NPC身份线索(a);
  const bTokens = 提取NPC身份线索(b);
  if (!aTokens.length || !bTokens.length) return false;
  const overlap = aTokens.filter((token) => bTokens.includes(token));
  return overlap.length >= 2 || (overlap.length >= 1 && (aTemp.unknown || bTemp.unknown));
}

function 解析临时称呼(name: string): { kind: string; unknown: boolean } | null {
  const normalized = 规范化NPC身份文本(name);
  const kind = NPC_TEMP_NAME_SUFFIXES.find((suffix) => normalized.endsWith(suffix));
  if (!kind) return null;
  const prefix = normalized.slice(0, -kind.length);
  if (!prefix || !NPC_TEMP_NAME_PREFIXES.some((item) => prefix.includes(item))) return null;
  return { kind, unknown: prefix.includes('未知') || prefix.includes('神秘') || prefix.includes('陌生') || prefix.includes('无名') };
}

function 提取NPC身份线索(record: NPC记录): string[] {
  const text = [
    record.别名,
    record.外貌,
    record.穿着,
    record.说话方式,
    record.性格,
    record.介绍,
  ].filter(Boolean).join('，');
  const tokens = [
    '灰发', '黑发', '白发', '银发', '粉发', '红发', '金发', '蓝发', '紫发',
    '金色眼眸', '金眼', '蓝眼', '红眼', '紫眼',
    '星核', '空间站', '列车', '相机', '弓', '长枪', '眼镜', '人偶',
    '稳定性', '容器', '失忆', '刚苏醒',
  ];
  return tokens.filter((token) => text.includes(token));
}

function 去除NPC修饰前缀(name: string): string {
  let text = name.trim();
  if (!text) return text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of NPC_NAME_PREFIXES) {
      if (text.startsWith(prefix)) {
        text = text.slice(prefix.length).trim();
        changed = true;
      }
    }
  }
  return text.replace(/^[（(【\[]+|[）)】\]]+$/g, '').trim();
}

function 去重文本列表(lines: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const line of lines) {
    const text = line.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function 合并同行记忆(a: NPC同行记忆条目[], b: NPC同行记忆条目[]): NPC同行记忆条目[] {
  const seen = new Set<string>();
  const output: NPC同行记忆条目[] = [];
  for (const item of [...a, ...b]) {
    const key = `${item.回合 || 0}:${item.摘要.replace(/\s+/g, '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output.sort((left, right) => (left.回合 || 0) - (right.回合 || 0));
}

function 归一化同行记忆列表(raw: unknown): NPC同行记忆条目[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        return {
          id: `npc_mem_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
          回合: 0,
          摘要: text,
          来源: '变量' as const,
        };
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const obj = item as Partial<NPC同行记忆条目> & Record<string, unknown>;
      const summary = typeof obj.摘要 === 'string'
        ? obj.摘要.trim()
        : typeof obj.原文 === 'string'
          ? obj.原文.trim()
          : '';
      if (!summary) return null;
      const turn = Number(obj.回合);
      const related = Array.isArray(obj.关联NPCID)
        ? obj.关联NPCID
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.trim())
            .filter((id): id is string => Boolean(id))
        : [];
      return {
        id: typeof obj.id === 'string' && obj.id.trim()
          ? obj.id.trim()
          : `npc_mem_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
        回合: Number.isFinite(turn) ? turn : 0,
        摘要: summary,
        原文: typeof obj.原文 === 'string' ? obj.原文.trim() : undefined,
        来源: normalizeMemorySource(obj.来源),
        关联NPCID: related.length ? related : undefined,
      };
    })
    .filter((item): item is NPC同行记忆条目 => Boolean(item))
    .reduce<NPC同行记忆条目[]>((acc, item) => {
      if (acc.some((existing) => existing.摘要 === item.摘要 && existing.回合 === item.回合)) return acc;
      acc.push(item);
      return acc;
    }, []);
}

function 归一化NSFW档案(raw: unknown): NPC记录['NSFW档案'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const tags = normalizeStringList(obj.标签);
  const preferences = normalizeStringList(obj.偏好);
  const sensitivePoints = normalizeStringList(obj.敏感点);
  const taboos = normalizeStringList(obj.禁忌);
  const experiences = normalizeStringList(obj.经历);
  const facts = normalizeStringList(obj.长期事实);
  const note = typeof obj.备注 === 'string' ? obj.备注.trim() : undefined;
  const enabled = Boolean(obj.enabled);
  const age = normalizeNsfwAge(obj.年龄确认);
  const stage = typeof obj.亲密阶段 === 'string' ? obj.亲密阶段.trim() : undefined;
  const boundary = typeof obj.边界 === 'string' ? obj.边界.trim() : undefined;
  const legacyBodyArchive = normalizeLegacyNsfwBodyArchive(obj.身体档案);
  const femaleBodyArchive = normalizeFemaleNsfwBodyArchive(obj.女性身体档案, legacyBodyArchive);
  const maleBodyArchive = normalizeMaleNsfwBodyArchive(obj.男性身体档案, legacyBodyArchive);
  const partImages = normalizeNsfwPartImages(obj.部位图片 ?? obj.partImages ?? obj.images);
  if (
    !enabled &&
    !age &&
    !stage &&
    !boundary &&
    !preferences?.length &&
    !sensitivePoints?.length &&
    !taboos?.length &&
    !femaleBodyArchive &&
    !maleBodyArchive &&
    !experiences?.length &&
    !facts?.length &&
    !tags?.length &&
    !partImages &&
    !note
  ) {
    return undefined;
  }
  return {
    enabled,
    年龄确认: age,
    亲密阶段: stage,
    边界: boundary,
    偏好: preferences,
    敏感点: sensitivePoints,
    禁忌: taboos,
    女性身体档案: femaleBodyArchive,
    男性身体档案: maleBodyArchive,
    经历: experiences,
    长期事实: facts,
    标签: tags,
    部位图片: partImages,
    备注: note,
  };
}

function normalizeNsfwPartImages(raw: unknown): NPC_NSFW档案['部位图片'] {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const output: NonNullable<NPC_NSFW档案['部位图片']> = {};
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  };
  output.女性胸部 = read('女性胸部', '胸部', 'femaleChest');
  output.女性私处 = read('女性私处', '私处', 'femaleGenital');
  output.男性器 = read('男性器', '肉棒', 'maleGenital');
  output.后庭 = read('后庭', 'rear');
  output.体态参考 = read('体态参考', '体态', 'bodyReference');
  return Object.values(output).some(Boolean) ? output : undefined;
}

function normalizeStringList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? [...new Set(list)] : undefined;
}

function normalizeNsfwAge(raw: unknown): NPC_NSFW年龄确认 | undefined {
  if (raw === 'adult' || raw === 'unknown' || raw === 'minor_blocked') return raw;
  if (raw === '成年' || raw === '成人' || raw === '18+') return 'adult';
  if (raw === '未确认' || raw === '未知') return 'unknown';
  if (raw === '未成年' || raw === '禁止') return 'minor_blocked';
  return undefined;
}

function normalizeLegacyNsfwBodyArchive(raw: unknown): NPC_NSFW档案['身体档案'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const output: NonNullable<NPC_NSFW档案['身体档案']> = {};
  const read = (key: keyof NonNullable<NPC_NSFW档案['身体档案']>) => {
    const value = obj[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  output.胸部 = read('胸部');
  output.私处 = read('私处');
  output.后庭 = read('后庭');
  output.肉棒 = read('肉棒');
  output.体态 = read('体态');
  output.体味 = read('体味');
  return Object.values(output).some(Boolean) ? output : undefined;
}

function normalizeFemaleNsfwBodyArchive(
  raw: unknown,
  legacy?: NPC_NSFW档案['身体档案'],
): NPC_NSFW档案['女性身体档案'] {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const output: NonNullable<NPC_NSFW档案['女性身体档案']> = {};
  const read = (key: keyof NonNullable<NPC_NSFW档案['女性身体档案']>) => {
    const value = obj[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  output.胸部 = read('胸部') ?? legacy?.胸部;
  output.女性私处 = read('女性私处') ?? legacy?.私处;
  output.后庭 = read('后庭') ?? legacy?.后庭;
  output.体态 = read('体态') ?? legacy?.体态;
  output.体味 = read('体味') ?? legacy?.体味;
  return Object.values(output).some(Boolean) ? output : undefined;
}

function normalizeMaleNsfwBodyArchive(
  raw: unknown,
  legacy?: NPC_NSFW档案['身体档案'],
): NPC_NSFW档案['男性身体档案'] {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const output: NonNullable<NPC_NSFW档案['男性身体档案']> = {};
  const read = (key: keyof NonNullable<NPC_NSFW档案['男性身体档案']>) => {
    const value = obj[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  output.男性器 = read('男性器') ?? legacy?.肉棒;
  output.后庭 = read('后庭');
  output.体态 = read('体态');
  output.体味 = read('体味');
  return Object.values(output).some(Boolean) ? output : undefined;
}

function 归一化图像档案(raw: unknown, avatar: unknown): NPC记录['图像档案'] {
  const candidate = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const avatarText = typeof avatar === 'string' ? avatar.trim() : '';
  const imageAvatar = typeof candidate.头像 === 'string' ? candidate.头像.trim() : avatarText || undefined;
  const portrait = typeof candidate.立绘 === 'string' ? candidate.立绘.trim() : undefined;
  const avatarSlots = 归一化头像槽位(candidate.头像槽位 ?? candidate.avatarSlots, imageAvatar);
  const avatarPrompt = typeof candidate.头像提示词 === 'string' ? candidate.头像提示词.trim() : undefined;
  const portraitPrompt = typeof candidate.立绘提示词 === 'string' ? candidate.立绘提示词.trim() : undefined;
  const characterAnchor = 归一化NPC角色锚点(candidate.角色锚点 ?? candidate.characterAnchor ?? candidate.anchor);
  const status = normalizeImageStatus(candidate.状态);
  const source = normalizeImageSource(candidate.来源);
  if (!imageAvatar && !portrait && !avatarSlots && !avatarPrompt && !portraitPrompt && !characterAnchor && !status && !source) return undefined;
  return {
    头像: imageAvatar,
    立绘: portrait,
    头像槽位: avatarSlots,
    头像提示词: avatarPrompt,
    立绘提示词: portraitPrompt,
    角色锚点: characterAnchor,
    状态: status,
    来源: source,
  };
}

function 归一化NPC角色锚点(raw: unknown): NPC角色锚点档案 | undefined {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  if (!source) return undefined;
  const readString = (...keys: string[]) => {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  };
  const readBool = (...keys: string[]) => {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'boolean') return value;
    }
    return undefined;
  };
  const anchor: NPC角色锚点档案 = {
    id: readString('id'),
    名称: readString('名称', 'name'),
    是否启用: readBool('是否启用', 'enabled') ?? true,
    生成时默认附加: readBool('生成时默认附加', 'defaultApply') ?? true,
    场景生图自动注入: readBool('场景生图自动注入', 'sceneAutoInject') ?? true,
    正面提示词: readString('正面提示词', 'positivePrompt'),
    负面提示词: readString('负面提示词', 'negativePrompt'),
    来源: normalizeAnchorSource(source.来源 ?? source.source),
    原始提取文本: readString('原始提取文本', 'rawText'),
    提取模型信息: readString('提取模型信息', 'modelInfo'),
    createdAt: Number(source.createdAt) || undefined,
    updatedAt: Number(source.updatedAt) || undefined,
  };
  const features = normalizeAnchorFeatures(source.结构化特征 ?? source.features);
  if (features) anchor.结构化特征 = features;
  return 角色锚点有内容(anchor) ? anchor : undefined;
}

function normalizeAnchorSource(value: unknown): NPC角色锚点档案['来源'] {
  if (value === 'ai_extract' || value === 'manual' || value === 'imported') return value;
  return 'manual';
}

function normalizeAnchorFeatures(raw: unknown): NPC角色锚点档案['结构化特征'] {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const readList = (key: string) => Array.isArray(source[key])
    ? (source[key] as unknown[]).map((item) => String(item ?? '').trim()).filter(Boolean)
    : undefined;
  const output: NonNullable<NPC角色锚点档案['结构化特征']> = {
    外貌标签: readList('外貌标签'),
    身材标签: readList('身材标签'),
    胸部标签: readList('胸部标签'),
    发型标签: readList('发型标签'),
    发色标签: readList('发色标签'),
    眼睛标签: readList('眼睛标签'),
    肤色标签: readList('肤色标签'),
    年龄感标签: readList('年龄感标签'),
    服装基底标签: readList('服装基底标签'),
    特殊特征标签: readList('特殊特征标签'),
  };
  return Object.values(output).some((list) => list?.length) ? output : undefined;
}

function 角色锚点有内容(anchor: NPC角色锚点档案): boolean {
  return Boolean(
    anchor.名称 ||
    anchor.正面提示词 ||
    anchor.负面提示词 ||
    Object.values(anchor.结构化特征 ?? {}).some((list) => list?.length),
  );
}

function 归一化头像槽位(raw: unknown, fallbackAvatar?: string): Partial<Record<NPC头像槽位, string>> | undefined {
  const output: Partial<Record<NPC头像槽位, string>> = {};
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  };
  output.档案 = read('档案', 'archive', 'profile') ?? fallbackAvatar;
  output.正文 = read('正文', 'story', 'main', 'body');
  output.手机 = read('手机', '小手机', 'phone', 'mobile');
  return Object.values(output).some(Boolean) ? output : undefined;
}

function normalizeMemorySource(raw: unknown): NPC同行记忆来源 | undefined {
  return raw === '正文' || raw === '手机' || raw === '新闻' || raw === '变量' || raw === '其他' ? raw : undefined;
}

function normalizeImageStatus(raw: unknown): NonNullable<NonNullable<NPC记录['图像档案']>['状态']> | undefined {
  if (raw === 'none') return 'none';
  if (raw === 'pending') return 'pending';
  if (raw === 'done') return 'done';
  if (raw === 'failed') return 'failed';
  return undefined;
}

function normalizeImageSource(raw: unknown): NonNullable<NonNullable<NPC记录['图像档案']>['来源']> | undefined {
  if (raw === '手动') return '手动';
  if (raw === '原著') return '原著';
  if (raw === '文生图') return '文生图';
  if (raw === '占位') return '占位';
  return undefined;
}

export function 提取NPC同行记忆文本列表(record: Pick<NPC记录, '同行记忆'> | undefined): string[] {
  const memories = (record?.同行记忆 ?? []) as Array<NPC同行记忆条目 | string>;
  return memories
    .map((item) => (typeof item === 'string' ? item : item?.摘要 ?? ''))
    .map((text) => 清理NPC同行记忆摘要(text))
    .filter((text) => Boolean(text));
}

export function 读取NPC头像(record: Pick<NPC记录, '姓名' | '别名' | '头像' | '图像档案'> | undefined, slot: NPC头像槽位 = '档案'): string | undefined {
  if (!record) return undefined;
  const canonical = 匹配NPC原著角色(record.姓名, record.别名);
  return (
    record.图像档案?.头像槽位?.[slot]?.trim() ||
    record.图像档案?.头像?.trim() ||
    record.头像?.trim() ||
    getDefaultBuiltinAvatar(canonical?.name) ||
    undefined
  );
}

function shouldIgnoreNpcRecord(record: NPC记录): boolean {
  const normalizedName = 去除NPC修饰前缀(record.姓名);
  const hasUniqueFields = Boolean(
    record.别名?.trim() ||
    record.性别 ||
    record.对玩家称呼?.trim() ||
    record.外貌?.trim() ||
    record.穿着?.trim() ||
    record.说话方式?.trim() ||
    record.性格?.trim() ||
    record.介绍?.trim() ||
    record.装备摘要?.trim() ||
    record.头像?.trim() ||
    record.NSFW档案 ||
    record.图像档案 ||
    (record.备注?.length ?? 0) > 0,
  );
  const genericOnly = Boolean(
    NPC_GENERIC_SUFFIXES.some((suffix) => normalizedName.endsWith(suffix)) ||
    NPC_NAME_PREFIXES.some((prefix) => record.姓名.startsWith(prefix)) ||
    /^(?:怪物|怪兽|裂界生物|敌人|杂兵|无名守卫|机兵|虚卒|傀儡|精英怪)/.test(normalizedName),
  );
  const likelyDisposable =
    !record.原著角色 &&
    record.阶位 !== 'companion' &&
    !hasUniqueFields &&
    (genericOnly || record.关系 === 'enemy' || record.关系 === 'stranger');
  return likelyDisposable;
}
