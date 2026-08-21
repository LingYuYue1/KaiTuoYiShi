// NPC 档案库：路人和重要伙伴共用一份 schema，靠 `阶位` 与 `归档` 区分。
// AI 注入策略：归档记录永不进入运行时选择；活跃路人仅在本回合被点名/出场时临时拼装。

import { matchCanonical } from '@/data/canonicalCharacters';
import { getDefaultBuiltinAvatarForNames } from '@/data/builtinAvatars';
import { 清理NPC同行记忆摘要 } from '@/utils/npcMemorySanitizer';
import { STATIC_ASSET_FALLBACK_AVATAR } from '@/utils/staticAssets';
export type NPC阶位 = 'companion' | 'extra';

export type NPC性别 = '男' | '女' | '其他';

export type NPC关系类型 =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close'
  | 'rival'
  | 'enemy';

export type NPC关系阶段 = '敌对' | '陌生' | '初见' | '熟识' | '知己' | '生死挚友';

export const NPC_AFFINITY_MIN = -50;
export const NPC_AFFINITY_MAX = 150;

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
  /** 剧情事实结构化来源：相同 factId 幂等，重 Roll/重试不生成第二份 */
  关联事实ID?: string;
  /** 对标参考项目：记忆发生时的结构化游戏时间（如「琥珀纪 2157.03.07 06:40」），旧条目缺省。 */
  时间?: string;
}

export interface NPC总结记忆条目 {
  id: string;
  回合范围?: string;
  条数?: number;
  摘要: string;
  保留事实?: string[];
  关系变化?: string[];
  未完成事项?: string[];
  /** 对标参考项目：覆盖的原始记忆索引范围（NPC 记忆压缩时记录）。 */
  开始索引?: number;
  结束索引?: number;
  /** 对标参考项目：总结覆盖的时间范围。 */
  开始时间?: string;
  结束时间?: string;
}

// ===== 阶段1新增：约定结构（玩家承诺结构化载体，挂NPC下，三环联动） =====

/** 约定状态：等待中=未履行也未违约；已履行/已违约/已作废后不再注入但保留历史 */
export type 约定状态 = '等待中' | '已履行' | '已违约' | '已作废';

/**
 * 约定结构（简化版，挂NPC记录下）
 * - 写入环：variableModel 扩展 recallContext，从正文+通讯回忆提取约定
 * - 注入环：等待中的约定在NPC账本强制承接区常驻
 * - 清理环：履行/违约后状态变更，不再注入但保留历史
 */
export interface 约定结构 {
  /** UID */
  id: string;
  /** 约定标题 */
  标题: string;
  /** 约定具体内容 */
  内容: string;
  /** 游戏内时间（时间锚点） */
  约定时间?: string;
  /** 当前状态 */
  当前状态: 约定状态;
  /** 履行/违约后果描述 */
  后果?: string;
  /** 建立回合（溯源） */
  回合: number;
  /** 约定来源（正文提取/通讯提取），用于追溯 */
  来源?: '正文' | '通讯';
}

export interface NPC记忆账本视图 {
  npcId: string;
  姓名: string;
  别名?: string;
  当前关系阶段: string;
  亲密关系: boolean;
  好感度: number;
  同行: boolean;
  初见回合: number;
  最近回合: number;
  对玩家称呼?: string;
  最近互动?: string;
  对玩家长期印象?: string;
  共同经历: string[];
  未完成事项: string[];
  未解决冲突: string[];
  必须记得: string[];
  禁止遗忘: string[];
  总结记忆: NPC总结记忆条目[];
  最近原始记忆: string[];
  /** 阶段1补充·约定展示环：NPC 的全部约定（含等待中/已履行/已违约/已作废） */
  约定: 约定结构[];
  有账本字段: boolean;
}

export interface NPC账本选择条目 {
  npc: NPC记录;
  ledger: NPC记忆账本视图;
  score: number;
  reasons: string[];
  fields: string[];
  presentState: 'current' | 'explicit' | 'recent' | 'background';
}

export interface NPC账本选择结果 {
  selected: NPC账本选择条目[];
  skipped: Array<{ name: string; reason: string }>;
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
  中文摘要?: string;
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

const NPC_SYSTEM_RELATION_STAGE_LABELS = new Set<string>([
  '敌对',
  '陌生',
  '初见',
  '熟识',
  '知己',
  '生死挚友',
  ...Object.keys(NPC_RELATION_LABELS),
  ...Object.values(NPC_RELATION_LABELS),
].map((value) => value.toLowerCase()));

export function 限制NPC好感度(value: unknown): number {
  const affinity = Number(value);
  if (!Number.isFinite(affinity)) return 0;
  return Math.max(NPC_AFFINITY_MIN, Math.min(NPC_AFFINITY_MAX, Math.trunc(affinity)));
}

export function 获取NPC关系阶段(value: unknown): NPC关系阶段 {
  const affinity = 限制NPC好感度(value);
  if (affinity <= -31) return '敌对';
  if (affinity <= -1) return '陌生';
  if (affinity <= 19) return '初见';
  if (affinity <= 49) return '熟识';
  if (affinity <= 100) return '知己';
  return '生死挚友';
}

export function 获取NPC兼容关系(value: unknown): NPC关系类型 {
  const affinity = 限制NPC好感度(value);
  if (affinity <= -31) return 'enemy';
  if (affinity <= 19) return 'stranger';
  if (affinity <= 49) return 'acquaintance';
  if (affinity <= 100) return 'friend';
  return 'close';
}

/**
 * 当前关系阶段允许保存剧情自定义描述，但系统标准/旧制标签必须始终跟随好感度。
 * 例如旧档的「点头之交」不能覆盖 75 好感应派生出的「知己」。
 */
export function 归一化NPC关系阶段(value: unknown, affinity: unknown): string {
  const explicit = readNpcString(value);
  if (!explicit || NPC_SYSTEM_RELATION_STAGE_LABELS.has(explicit.toLowerCase())) {
    return 获取NPC关系阶段(affinity);
  }
  return explicit;
}

export function 格式化NPC关系(value: unknown, intimateRelationship = false): string {
  const stage = 获取NPC关系阶段(value);
  return intimateRelationship ? `${stage} · 亲密关系` : stage;
}

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
  '店员',
  '医生',
  '医师',
  '护士',
  '科研员',
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
  // 年龄/性别泛称：不能作为姓名入档
  '少女',
  '少年',
  '年轻人',
  '青年',
  '男孩',
  '女孩',
  '男人',
  '女人',
  '女士',
  '男子',
  '孩童',
  '孩子',
  '老者',
  '老人',
  '大妈',
  '大叔',
  '姑娘',
  '小伙子',
  // 临时身份称呼：未具名不入档
  '陌生人',
  '黑衣人',
  '神秘人',
];

export const NPC_GENERIC_NAME_TERMS = NPC_GENERIC_SUFFIXES;

export interface NPC记录 {
  id: string;
  姓名: string;
  别名?: string;
  阶位: NPC阶位;                     // companion=进 AI prompt;extra=只存档
  /** AI/玩家写入的职业或身份标签，不再混进姓名。 */
  职务?: string;
  /** 归档记录保留数据，但不参与展示、关系规划或 AI 注入。 */
  归档?: boolean;
  归档回合?: number;
  /** 与玩家发生过可计数互动的回合数，用于长期互动晋升门槛。 */
  累计互动次数?: number;
  /** 玩家明确指定的阶位，读档整理和 AI 自动晋升不得覆盖。 */
  手动阶位覆盖?: NPC阶位;
  阶位来源?: 'ai' | 'manual' | 'canonical' | 'auto';
  /** 确定性重复合并时保留被合并记录的来源 ID，便于追溯而非静默吞掉源记录。 */
  合并来源ID?: string[];
  好感度: number;                    // -50..150
  关系: NPC关系类型;                 // 兼容字段，由好感度确定性派生
  亲密关系?: boolean;                // 普通关系状态，不受 NSFW 开关控制
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
  最近互动?: string;                 // NPC 账本：最近一次会影响后续态度的互动
  对玩家长期印象?: string;           // NPC 账本：该 NPC 如何稳定看待玩家
  当前关系阶段?: string;             // NPC 账本：比关系枚举更具体的阶段描述
  共同经历?: string[];               // NPC 账本：稳定共同经历
  未完成事项?: string[];             // NPC 账本：承诺、约定、待办
  未解决冲突?: string[];             // NPC 账本：尚未化解的冲突/误会
  必须记得?: string[];               // NPC 账本：主剧情不得遗忘的事实
  禁止遗忘?: string[];               // NPC 账本：强保护事实，解决前不得删除
  总结记忆?: NPC总结记忆条目[];      // NPC 账本：压缩后的长期关系记忆
  /** 阶段1新增：与该NPC的约定列表（玩家承诺结构化载体，三环联动） */
  约定?: 约定结构[];
  备注: string[];
  原著角色?: boolean;                // 来自原著角色库的标记
  /** 身份来源与阶位分离：canonical=原著角色，custom=玩家/剧情明确创建，unknown=旧数据无法确定。 */
  NPC来源?: 'canonical' | 'custom' | 'unknown';
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
  职务?: string;
  原著角色?: boolean;
  NPC来源?: NPC记录['NPC来源'];
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
    职务: input.职务,
    阶位来源: input.阶位 ? 'ai' : 'auto',
    好感度: 0,
    关系: 获取NPC兼容关系(0),
    亲密关系: false,
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
    NPC来源: input.NPC来源 ?? (input.原著角色 === true ? 'canonical' : input.原著角色 === false ? 'custom' : 'unknown'),
  };
}

export function 归一化NPC记录列表(raw: unknown, currentTurn?: number): NPC记录[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, NPC记录>();
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const record = 归一化单个NPC记录(item as Partial<NPC记录> & Record<string, unknown>, index);
    const key = 查找可合并NPC身份键(record, merged) ?? 计算NPC身份键(record);
    const current = merged.get(key);
    merged.set(key, current ? 合并NPC记录(current, record) : record);
  });
  return 整理NPC记录列表([...merged.values()], currentTurn);
}

function 归一化单个NPC记录(source: Partial<NPC记录> & Record<string, unknown>, index: number): NPC记录 {
  const rawName = source.姓名 ?? source.name ?? source.名称 ?? source.名字;
  const rawTier = source.阶位 ?? source.tier ?? source.类型 ?? source.category;
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
  const affinity = 限制NPC好感度(rawAffinity);
  const intimateRelationship = readNpcBoolean(source.亲密关系 ?? source.intimateRelationship) ?? false;
  const firstTurn = Number(rawFirstTurn);
  const recentTurn = Number(rawRecentTurn);
  const rawAlias = source.别名 ?? source.alias;
  const rawJob = source.职务 ?? source.job ?? source.职业 ?? source.role ?? source.occupation;
  const rawGender = source.性别 ?? source.gender;
  const rawPlayerName = source.对玩家称呼 ?? source.称呼 ?? source.playerCallName;
  const rawAppearance = source.外貌 ?? source.appearance;
  const rawClothing = source.穿着 ?? source.服饰 ?? source.clothing ?? source.outfit;
  const rawSpeech = source.说话方式 ?? source.说话习惯 ?? source.speakingStyle ?? source.tone;
  const rawPersonality = source.性格 ?? source.personality;
  const rawIntro = source.介绍 ?? source.简介 ?? source.description;
  const rawEquipment = source.装备摘要 ?? source.装备 ?? source.equipment;
  const rawMemories = source.同行记忆 ?? source.memories ?? source.memory;
  const rawSummaryMemories = source.总结记忆 ?? source.summaryMemories ?? source.memorySummaries;
  const rawNotes = source.备注 ?? source.notes;
  const rawAvatar = source.头像 ?? source.avatar ?? source.avatarUrl;
  const rawNSFW = source.NSFW档案 ?? source.nsfw ?? source.NSFW;
  const rawImage = source.图像档案 ?? source.image ?? source.images;
  const rawNpcSource = source.NPC来源 ?? source.npcSource ?? source.source;
  const sourceHint = rawNpcSource === 'canonical' || rawNpcSource === 'custom' || rawNpcSource === 'unknown'
    ? rawNpcSource
    : undefined;
  const canonicalMatch = 匹配NPC原著角色(name, typeof rawAlias === 'string' ? rawAlias : undefined);
  const exactCanonicalIdentity = Boolean(
    canonicalMatch && (name === canonicalMatch.name || rawAlias === canonicalMatch.name),
  );
  // 明确标记为 custom 的记录不能因 canonical alias（如“三月”）被改造成原著角色；
  // 规范名本身仍可从旧存档缺失标记中恢复为 canonical。
  const customIdentity = sourceHint === 'custom'
    || (sourceHint !== 'canonical' && source.原著角色 === false && !exactCanonicalIdentity);
  const canonicalIdentity = !customIdentity && Boolean(
    canonicalMatch && (exactCanonicalIdentity || source.原著角色 === true || source.canonical || sourceHint === 'canonical'),
  );
  const canonical = canonicalIdentity ? canonicalMatch : null;
  const shouldForceCompanion = Boolean(canonical || source.原著角色 === true || source.canonical || sourceHint === 'canonical');
  const npcSource = sourceHint ?? (shouldForceCompanion ? 'canonical' : source.原著角色 === false ? 'custom' : 'unknown');
  const manualTier = source.手动阶位覆盖 === 'companion' || source.手动阶位覆盖 === 'extra'
    ? source.手动阶位覆盖
    : undefined;
  const normalizedArchived = readNpcBoolean(source.归档 ?? source.archived) ?? false;

  return {
    id: typeof source.id === 'string' && source.id.trim()
      ? source.id
      : `npc-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    姓名: name,
    别名: typeof rawAlias === 'string' ? rawAlias : undefined,
    阶位: manualTier ?? (shouldForceCompanion ? 'companion' : tier),
    职务: readNpcString(rawJob),
    归档: normalizedArchived,
    归档回合: Number.isFinite(Number(source.归档回合 ?? source.archivedTurn)) ? Number(source.归档回合 ?? source.archivedTurn) : undefined,
    累计互动次数: Math.max(0, Math.trunc(Number(source.累计互动次数 ?? source.interactionCount) || 0)),
    手动阶位覆盖: manualTier,
    NPC来源: npcSource,
    阶位来源: manualTier
      ? 'manual'
      : (source.阶位来源 === 'manual' || source.阶位来源 === 'canonical' || source.阶位来源 === 'auto' || source.阶位来源 === 'ai'
          ? source.阶位来源
          : (shouldForceCompanion ? 'canonical' : 'ai')),
    合并来源ID: normalizeStringList(source.合并来源ID ?? source.mergedFromIds),
    好感度: affinity,
    关系: 获取NPC兼容关系(affinity),
    亲密关系: intimateRelationship,
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
    最近互动: readNpcString(source.最近互动 ?? source.recentInteraction),
    对玩家长期印象: readNpcString(source.对玩家长期印象 ?? source.longTermImpression),
    当前关系阶段: 归一化NPC关系阶段(source.当前关系阶段 ?? source.relationshipStage ?? source.关系阶段, affinity),
    共同经历: normalizeNpcTextList(source.共同经历 ?? source.sharedExperiences),
    未完成事项: normalizeNpcTextList(source.未完成事项 ?? source.openItems),
    未解决冲突: normalizeNpcTextList(source.未解决冲突 ?? source.unresolvedConflicts),
    必须记得: normalizeNpcTextList(source.必须记得 ?? source.mustRemember),
    禁止遗忘: normalizeNpcTextList(source.禁止遗忘 ?? source.doNotForget),
    总结记忆: 归一化NPC总结记忆列表(rawSummaryMemories),
    约定: 归一化约定列表(source.约定 ?? source.agreements),
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
  const affinity = 限制NPC好感度(选择更可信的好感度(base, incoming, preferred));
  const intimateRelationship = 选择较新的亲密关系(base, incoming, preferred);
  const mergedSourceIds = 去重文本列表([
    ...(base.合并来源ID ?? []),
    ...(incoming.合并来源ID ?? []),
    ...(base.id !== incoming.id ? [incoming.id] : []),
  ]).filter((id) => id !== base.id);
  return {
    ...preferred,
    id: base.id,
    姓名: 选择NPC显示姓名(base, incoming, preferred),
    别名: 选择NPC别名(base, incoming, preferred),
    阶位: base.手动阶位覆盖 ?? incoming.手动阶位覆盖 ?? (base.阶位 === 'companion' || incoming.阶位 === 'companion' ? 'companion' : preferred.阶位),
    职务: preferred.职务 ?? base.职务 ?? incoming.职务,
    归档: Boolean(base.归档 && incoming.归档),
    归档回合: Math.max(base.归档回合 ?? 0, incoming.归档回合 ?? 0) || undefined,
    累计互动次数: Math.max(base.累计互动次数 ?? 0, incoming.累计互动次数 ?? 0),
    手动阶位覆盖: base.手动阶位覆盖 ?? incoming.手动阶位覆盖,
    阶位来源: base.手动阶位覆盖 ?? incoming.手动阶位覆盖 ? 'manual' : (preferred.阶位来源 ?? base.阶位来源 ?? incoming.阶位来源),
    合并来源ID: mergedSourceIds.length ? mergedSourceIds : undefined,
    关系: 获取NPC兼容关系(affinity),
    亲密关系: intimateRelationship,
    // 阶位代表重要程度，同行代表当前是否在场；原著角色/伙伴不能自动等于同行中。
    同行: Boolean(base.同行 || incoming.同行),
    初见回合: Math.min(base.初见回合 ?? incoming.初见回合, incoming.初见回合 ?? base.初见回合),
    最近回合: Math.max(base.最近回合 ?? 0, incoming.最近回合 ?? 0),
    好感度: affinity,
    同行记忆: 合并同行记忆(base.同行记忆 ?? [], incoming.同行记忆 ?? []),
    最近互动: preferred.最近互动 ?? base.最近互动 ?? incoming.最近互动,
    对玩家长期印象: preferred.对玩家长期印象 ?? base.对玩家长期印象 ?? incoming.对玩家长期印象,
    当前关系阶段: 选择NPC关系阶段(base, incoming, preferred, affinity),
    共同经历: 去重文本列表([...(base.共同经历 ?? []), ...(incoming.共同经历 ?? [])]),
    未完成事项: 去重文本列表([...(base.未完成事项 ?? []), ...(incoming.未完成事项 ?? [])]),
    未解决冲突: 去重文本列表([...(base.未解决冲突 ?? []), ...(incoming.未解决冲突 ?? [])]),
    必须记得: 去重文本列表([...(base.必须记得 ?? []), ...(incoming.必须记得 ?? [])]),
    禁止遗忘: 去重文本列表([...(base.禁止遗忘 ?? []), ...(incoming.禁止遗忘 ?? [])]),
    总结记忆: 合并NPC总结记忆(base.总结记忆 ?? [], incoming.总结记忆 ?? []),
    约定: 合并约定列表(base.约定 ?? [], incoming.约定 ?? []),
    备注: 去重文本列表([...(base.备注 ?? []), ...(incoming.备注 ?? [])]),
    原著角色: Boolean(base.原著角色 || incoming.原著角色),
    NPC来源: base.NPC来源 === 'canonical' || incoming.NPC来源 === 'canonical'
      ? 'canonical'
      : base.NPC来源 === 'custom' || incoming.NPC来源 === 'custom'
        ? 'custom'
        : preferred.NPC来源 ?? 'unknown',
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

function 选择NPC关系阶段(base: NPC记录, incoming: NPC记录, preferred: NPC记录, affinity: number): string {
  const explicit = [incoming, base, preferred]
    .filter((record) => {
      const stage = record.当前关系阶段?.trim();
      return Boolean(stage && !NPC_SYSTEM_RELATION_STAGE_LABELS.has(stage.toLowerCase()));
    })
    .sort((a, b) => (Number(b.最近回合) || 0) - (Number(a.最近回合) || 0))[0]
    ?.当前关系阶段?.trim();
  return explicit || 获取NPC关系阶段(affinity);
}

function 选择NPC显示姓名(base: NPC记录, incoming: NPC记录, preferred: NPC记录): string {
  const canonical = 匹配记录NPC原著角色(base) ?? 匹配记录NPC原著角色(incoming);
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
  if (匹配记录NPC原著角色(record)) value += 120;
  if (record.阶位 === 'companion') value += 35;
  if (record.同行) value += 20;
  if (record.原著角色) value += 18;
  if (record.职务) value += 2;
  if (record.累计互动次数) value += Math.min(10, record.累计互动次数);
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

function 选择较新的亲密关系(base: NPC记录, incoming: NPC记录, preferred: NPC记录): boolean {
  if (incoming.最近回合 > base.最近回合 && typeof incoming.亲密关系 === 'boolean') return incoming.亲密关系;
  if (base.最近回合 > incoming.最近回合 && typeof base.亲密关系 === 'boolean') return base.亲密关系;
  if (typeof preferred.亲密关系 === 'boolean') return preferred.亲密关系;
  return Boolean(base.亲密关系 || incoming.亲密关系);
}

function 计算NPC身份键(record: NPC记录): string {
  const normalized = 规范化NPC身份文本(record.姓名);
  const canonical = 匹配记录NPC原著角色(record);
  // canonical 合并键只对明确 canonical 来源或规范名精确匹配生效；
  // custom 记录永远不参与 canonical 合并。
  if (canonical && (record.NPC来源 === 'canonical' || record.姓名 === canonical.name || record.别名 === canonical.name)) {
    return `canon:${canonical.name}`;
  }
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
  const canonical = 匹配记录NPC原著角色(record);
  const canonicalIdentity = Boolean(
    canonical && (record.NPC来源 === 'canonical' || record.姓名 === canonical.name || record.别名 === canonical.name),
  );
  if (canonical && canonicalIdentity) keys.add(`canon:${canonical.name}`);
  for (const text of [record.姓名, record.别名]) {
    const normalized = text ? 规范化NPC身份文本(text) : '';
    if (!normalized) continue;
    const aliasCanonical = record.NPC来源 === 'custom' ? null : matchCanonical(normalized);
    if (aliasCanonical && (record.NPC来源 === 'canonical' || normalized === aliasCanonical.name)) {
      keys.add(`canon:${aliasCanonical.name}`);
    }
    if (!canonicalIdentity) keys.add(`name:${normalized.toLowerCase()}`);
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

function 匹配记录NPC原著角色(record: Pick<NPC记录, '姓名' | '别名' | 'NPC来源'>): ReturnType<typeof matchCanonical> {
  if (record.NPC来源 === 'custom') return null;
  const canonical = 匹配NPC原著角色(record.姓名, record.别名);
  if (record.NPC来源 !== 'canonical' && canonical && record.姓名 !== canonical.name && record.别名 !== canonical.name) {
    return null;
  }
  return canonical;
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
  if (匹配记录NPC原著角色(a) || 匹配记录NPC原著角色(b)) return false;
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

function readNpcString(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function readNpcBoolean(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true' || raw === '是' || raw === '已建立') return true;
  if (raw === 'false' || raw === '否' || raw === '已解除') return false;
  return undefined;
}

function normalizeNpcTextList(raw: unknown): string[] | undefined {
  if (typeof raw === 'string') {
    const text = raw.trim();
    return text ? [text] : undefined;
  }
  return normalizeStringList(raw);
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

function 合并NPC总结记忆(a: NPC总结记忆条目[], b: NPC总结记忆条目[]): NPC总结记忆条目[] {
  const seen = new Set<string>();
  const output: NPC总结记忆条目[] = [];
  for (const item of [...a, ...b]) {
    const key = `${item.回合范围 ?? ''}:${item.摘要.replace(/\s+/g, '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function 归一化同行记忆列表(raw: unknown): NPC同行记忆条目[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index): NPC同行记忆条目 | null => {
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
      const normalized: NPC同行记忆条目 = {
        id: typeof obj.id === 'string' && obj.id.trim()
          ? obj.id.trim()
          : `npc_mem_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
        回合: Number.isFinite(turn) ? turn : 0,
        摘要: summary,
      };
      const original = typeof obj.原文 === 'string' ? obj.原文.trim() : '';
      const source = normalizeMemorySource(obj.来源);
      const factId = typeof obj.关联事实ID === 'string' ? obj.关联事实ID.trim() : '';
      if (original) normalized.原文 = original;
      if (source) normalized.来源 = source;
      if (related.length) normalized.关联NPCID = related;
      if (factId) normalized.关联事实ID = factId;
      return normalized;
    })
    .filter((item): item is NPC同行记忆条目 => Boolean(item))
    .reduce<NPC同行记忆条目[]>((acc, item) => {
      if (acc.some((existing) => existing.摘要 === item.摘要 && existing.回合 === item.回合)) return acc;
      acc.push(item);
      return acc;
    }, []);
}

function 归一化NPC总结记忆列表(raw: unknown): NPC总结记忆条目[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index): NPC总结记忆条目 | null => {
      if (typeof item === 'string') {
        const summary = 清理NPC同行记忆摘要(item);
        if (!summary) return null;
        return {
          id: `npc_summary_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
          摘要: summary,
        };
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const obj = item as Partial<NPC总结记忆条目> & Record<string, unknown>;
      const summary = readNpcString(obj.摘要 ?? obj.summary ?? obj.内容);
      if (!summary) return null;
      const count = Number(obj.条数 ?? obj.count);
      return {
        id: readNpcString(obj.id) ?? `npc_summary_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
        回合范围: readNpcString(obj.回合范围 ?? obj.turnRange),
        条数: Number.isFinite(count) ? count : undefined,
        摘要: 清理NPC同行记忆摘要(summary),
        保留事实: normalizeNpcTextList(obj.保留事实 ?? obj.facts),
        关系变化: normalizeNpcTextList(obj.关系变化 ?? obj.relationshipChanges),
        未完成事项: normalizeNpcTextList(obj.未完成事项 ?? obj.openItems),
      };
    })
    .filter((item): item is NPC总结记忆条目 => Boolean(item));
}

// ===== 约定：归一化 / 合并 / 确定性兼容 ID =====

const NPC_AGREEMENT_VALID_STATUSES = new Set(['等待中', '已履行', '已违约', '已作废']);

/** 无 ID 的旧约定条目使用确定性兼容 ID（基于内容指纹），不能每次读档生成不同随机 ID。 */
function 生成约定兼容ID(标题: string, 内容: string, index: number): string {
  let hash = 2166136261;
  for (const char of `${标题}|${内容}`.replace(/\s+/g, '')) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `npc_agreement_legacy_${index}_${hash.toString(36)}`;
}

/** 读取旧存档中的约定列表：过滤无效项，保留合法 ID，缺失核心字段的条目被剔除。 */
function 归一化约定列表(raw: unknown): 约定结构[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const output: 约定结构[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const obj = item as Partial<约定结构> & Record<string, unknown>;
    const 标题 = typeof obj.标题 === 'string' ? obj.标题.trim() : '';
    const 内容 = typeof obj.内容 === 'string' ? obj.内容.trim() : '';
    const status = typeof obj.当前状态 === 'string' ? obj.当前状态 : '';
    if (!标题 || !内容 || !NPC_AGREEMENT_VALID_STATUSES.has(status)) return;
    const turn = Number(obj.回合 ?? obj.turn);
    const 回合 = Number.isFinite(turn) && turn >= 0 ? turn : 0;
    const id = typeof obj.id === 'string' && obj.id.trim()
      ? obj.id.trim()
      : 生成约定兼容ID(标题, 内容, index);
    if (seen.has(id)) return;
    seen.add(id);
    output.push({
      id,
      标题,
      内容,
      约定时间: typeof obj.约定时间 === 'string' ? obj.约定时间 : undefined,
      当前状态: status as 约定状态,
      后果: typeof obj.后果 === 'string' ? obj.后果 : undefined,
      回合,
      来源: obj.来源 === '正文' || obj.来源 === '通讯' ? obj.来源 : undefined,
    });
  });
  return output;
}

/** 同一约定取较新、字段更完整的状态，不整条 NPC 记录互相覆盖。 */
function 合并单条约定(a: 约定结构, b: 约定结构): 约定结构 {
  const aNewer = (a.回合 ?? 0) > (b.回合 ?? 0);
  const bNewer = (b.回合 ?? 0) > (a.回合 ?? 0);
  const base = aNewer ? a : b;
  const other = aNewer ? b : a;
  const 取较新值 = <T>(left: T | undefined, right: T | undefined): T | undefined =>
    left !== undefined && left !== '' ? left : right;
  const 当前状态: 约定状态 =
    (base.回合 ?? 0) === (other.回合 ?? 0)
      ? base.当前状态 === '等待中' && other.当前状态 !== '等待中' ? other.当前状态 : base.当前状态
      : base.当前状态;
  return {
    id: base.id,
    标题: base.标题 || other.标题,
    内容: base.内容 || other.内容,
    约定时间: 取较新值(base.约定时间, other.约定时间),
    当前状态,
    后果: 取较新值(base.后果, other.后果),
    回合: Math.max(a.回合 ?? 0, b.回合 ?? 0),
    来源: 取较新值(base.来源, other.来源),
  };
}

/** 按稳定 ID 合并约定；无 ID 命中时用内容指纹兜底。等待中约定不因合并被丢弃。 */
function 合并约定列表(a: 约定结构[], b: 约定结构[]): 约定结构[] {
  const byId = new Map<string, 约定结构>();
  const byFingerprint = new Map<string, 约定结构>();
  const put = (item: 约定结构) => {
    const existing = byId.get(item.id);
    if (existing) {
      byId.set(item.id, 合并单条约定(existing, item));
      return;
    }
    const fingerprint = `${item.标题}|${item.内容}`.replace(/\s+/g, '');
    const matched = byFingerprint.get(fingerprint);
    if (matched) {
      // 内容指纹命中但 ID 不同（旧存档无 ID 场景的兜底）：并入先入条目，不再新增键。
      const merged = { ...合并单条约定(matched, item), id: matched.id };
      byId.set(matched.id, merged);
      byFingerprint.set(fingerprint, merged);
      return;
    }
    byId.set(item.id, item);
    byFingerprint.set(fingerprint, item);
  };
  for (const item of a) put(item);
  for (const item of b) put(item);
  return [...byId.values()];
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
    中文摘要: readString('中文摘要', 'chineseSummary'),
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
    anchor.中文摘要 ||
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

export function buildNpcMemoryLedgerView(record: NPC记录, recentMemoryLimit = 4): NPC记忆账本视图 {
  const memories = 提取NPC同行记忆文本列表(record);
  const legacySummaryMemories: NPC总结记忆条目[] = memories
    .filter((item) => item.startsWith('[压缩]'))
    .map((item, index) => ({
      id: `legacy_summary_${record.id}_${index}`,
      摘要: item.replace(/^\[压缩\]\s*/, '').trim(),
    }))
    .filter((item) => Boolean(item.摘要));
  const rawMemories = memories.filter((item) => !item.startsWith('[压缩]'));
  const summaries = 合并NPC总结记忆(record.总结记忆 ?? [], legacySummaryMemories);
  const hasLedgerFields = Boolean(
    record.最近互动 ||
    record.对玩家长期印象 ||
    record.当前关系阶段 ||
    record.亲密关系 ||
    record.共同经历?.length ||
    record.未完成事项?.length ||
    record.未解决冲突?.length ||
    record.必须记得?.length ||
    record.禁止遗忘?.length ||
    record.总结记忆?.length ||
    record.约定?.length,
  );

  return {
    npcId: record.id,
    姓名: record.姓名,
    别名: record.别名,
    当前关系阶段: 归一化NPC关系阶段(record.当前关系阶段, record.好感度),
    亲密关系: Boolean(record.亲密关系),
    好感度: 限制NPC好感度(record.好感度),
    同行: Boolean(record.同行),
    初见回合: Math.max(1, Number(record.初见回合 || 1)),
    最近回合: Math.max(1, Number(record.最近回合 || record.初见回合 || 1)),
    对玩家称呼: record.对玩家称呼,
    最近互动: record.最近互动 || rawMemories.slice(-1)[0],
    对玩家长期印象: record.对玩家长期印象,
    共同经历: record.共同经历 ?? [],
    未完成事项: record.未完成事项 ?? [],
    未解决冲突: record.未解决冲突 ?? [],
    必须记得: record.必须记得 ?? [],
    禁止遗忘: record.禁止遗忘 ?? [],
    总结记忆: summaries,
    最近原始记忆: rawMemories.slice(-Math.max(1, recentMemoryLimit)),
    约定: record.约定 ?? [],
    有账本字段: hasLedgerFields,
  };
}

export function formatNpcLedgerForPrompt(item: NPC账本选择条目): string {
  const { ledger, reasons } = item;
  // 阶段1约定系统·注入环：等待中的约定每回合在NPC账本强制承接区常驻
  const pendingAgreements = (item.npc.约定 ?? []).filter((a) => a.当前状态 === '等待中');
  const lines = [
    `${ledger.姓名}${ledger.别名 ? `（${ledger.别名}）` : ''}：`,
    `- 选中原因：${reasons.join('；') || '相关 NPC'}`,
    `- 当前关系阶段：${ledger.当前关系阶段}；好感${ledger.好感度 > 0 ? '+' : ''}${ledger.好感度}；${ledger.同行 ? '当前同行' : '未标记同行'}；初见第${ledger.初见回合}回合，最近第${ledger.最近回合}回合`,
    ledger.对玩家称呼 ? `- 对玩家称呼：${ledger.对玩家称呼}` : '',
    ledger.对玩家长期印象 ? `- 对玩家长期印象：${ledger.对玩家长期印象}` : '',
    ledger.最近互动 ? `- 最近互动：${ledger.最近互动}` : '',
    ledger.必须记得.length ? `- 必须记得：${ledger.必须记得.slice(0, 4).join('；')}` : '',
    ledger.禁止遗忘.length ? `- 禁止遗忘：${ledger.禁止遗忘.slice(0, 4).join('；')}` : '',
    ledger.共同经历.length ? `- 共同经历：${ledger.共同经历.slice(-4).join('；')}` : '',
    ledger.未完成事项.length ? `- 未完成事项：${ledger.未完成事项.slice(0, 4).join('；')}` : '',
    ledger.未解决冲突.length ? `- 未解决冲突：${ledger.未解决冲突.slice(0, 4).join('；')}` : '',
    ledger.总结记忆.length ? `- 总结记忆：${ledger.总结记忆.slice(-2).map((summary) => summary.摘要).join('；')}` : '',
    ledger.最近原始记忆.length ? `- 最近原始记忆：${ledger.最近原始记忆.slice(-3).join('；')}` : '',
    pendingAgreements.length
      ? `- 等待中的约定（常驻承接，履行/违约/作废后由代码变更状态，不再注入但保留历史）：\n${pendingAgreements.slice(0, 5).map((a) => `  · [${a.标题}] ${a.内容}${a.约定时间 ? `（约定时间：${a.约定时间}）` : ''}${a.后果 ? `；后果：${a.后果}` : ''}${a.来源 ? `（来源：${a.来源}）` : ''}`).join('\n')}`
      : '',
    '- 承接要求：若该 NPC 本回合出场、通讯、被玩家点名或被当前镜头自然牵引，必须沿用以上关系、记忆、承诺和冲突；禁止写成初识、陌生或忘记共同经历，除非正文明确给出失忆、伪装、时间线重置或信息隔离原因。',
  ].filter(Boolean);
  return lines.join('\n');
}

function npcLedgerHasProtectedItems(ledger: NPC记忆账本视图): boolean {
  return (
    ledger.未完成事项.length > 0 ||
    ledger.未解决冲突.length > 0 ||
    ledger.必须记得.length > 0 ||
    ledger.禁止遗忘.length > 0
  );
}

export function selectNpcLedgersForTurn(params: {
  records?: NPC记录[];
  turnCount?: number;
  explicitNames?: string[];
  sceneNames?: string[];
  recalledNames?: string[];
  limit?: number;
  recentWindow?: number;
}): NPC账本选择结果 {
  const records = 筛选活跃NPC(params.records);
  const turnCount = Math.max(1, Number(params.turnCount || 1));
  const limit = Math.max(1, Math.trunc(params.limit ?? 6));
  const recentWindow = Math.max(1, Math.trunc(params.recentWindow ?? 15));
  const explicitNames = normalizeNpcNameSet(params.explicitNames ?? []);
  const sceneNames = normalizeNpcNameSet(params.sceneNames ?? []);
  const recalledNames = normalizeNpcNameSet(params.recalledNames ?? []);
  const recentCutoff = Math.max(1, turnCount - recentWindow);

  const candidates = records
    .map((npc) => {
      const ledger = buildNpcMemoryLedgerView(npc);
      const isExplicit = npcNameInSet(npc, explicitNames);
      const isScene = npcNameInSet(npc, sceneNames);
      const isRecalled = npcNameInSet(npc, recalledNames);
      const isRecent = Number(npc.最近回合 || 0) >= recentCutoff;
      const hasProtectedItems = npcLedgerHasProtectedItems(ledger);
      const hasMemory = ledger.最近原始记忆.length > 0 || ledger.总结记忆.length > 0 || Boolean(ledger.最近互动);
      const hasRelation = npc.关系 !== 'stranger' || npc.亲密关系 || Math.abs(Number(npc.好感度 || 0)) > 0;
      const shouldConsider = isExplicit || isScene || isRecalled || npc.同行 || isRecent || hasProtectedItems || hasMemory || hasRelation || npc.阶位 === 'companion';
      if (!shouldConsider) return null;
      const reasons = [
        isExplicit ? '玩家本回合/近期明确点名' : '',
        isScene ? '当前场景明确人物' : '',
        npc.同行 ? '当前同行' : '',
        isRecent ? '最近回合出现过' : '',
        isRecalled ? '智库/世界书/近期上下文命中' : '',
        hasProtectedItems ? '存在未完成事项/必须记得' : '',
        hasMemory ? '已有 NPC 私有记忆' : '',
        hasRelation ? '已有非陌生关系或好感变化' : '',
        npc.原著角色 ? '原著角色档案' : '',
      ].filter(Boolean);
      const fields = [
        ledger.最近互动 ? '最近互动' : '',
        ledger.对玩家长期印象 ? '对玩家长期印象' : '',
        ledger.必须记得.length ? '必须记得' : '',
        ledger.禁止遗忘.length ? '禁止遗忘' : '',
        ledger.未完成事项.length ? '未完成事项' : '',
        ledger.未解决冲突.length ? '未解决冲突' : '',
        ledger.共同经历.length ? '共同经历' : '',
        ledger.总结记忆.length ? '总结记忆' : '',
        ledger.最近原始记忆.length ? '最近原始记忆' : '',
      ].filter(Boolean);
      const score =
        (isExplicit ? 160 : 0) +
        (isScene ? 120 : 0) +
        (npc.同行 ? 110 : 0) +
        (hasProtectedItems ? 90 : 0) +
        (isRecent ? 55 : 0) +
        (isRecalled ? 45 : 0) +
        (ledger.有账本字段 ? 35 : 0) +
        (hasMemory ? 28 : 0) +
        (npc.阶位 === 'companion' ? 18 : 0) +
        (hasRelation ? 16 : 0) +
        Math.min(24, Math.abs(Number(npc.好感度 || 0)));
      const presentState: NPC账本选择条目['presentState'] = isScene || npc.同行
        ? 'current'
        : isExplicit
          ? 'explicit'
          : isRecent
            ? 'recent'
            : 'background';
      return { npc, ledger, score, reasons, fields, presentState };
    })
    .filter((item): item is NPC账本选择条目 => Boolean(item))
    .sort((a, b) => b.score - a.score || b.ledger.最近回合 - a.ledger.最近回合);

  const selected: NPC账本选择条目[] = [];
  const selectedIds = new Set(selected.map((item) => item.npc.id));
  const addCandidate = (item: NPC账本选择条目, extraReason?: string) => {
    if (selected.length >= limit || selectedIds.has(item.npc.id)) return;
    selectedIds.add(item.npc.id);
    selected.push(extraReason && !item.reasons.includes(extraReason)
      ? { ...item, reasons: [...item.reasons, extraReason] }
      : item);
  };

  for (const item of candidates) {
    if (item.presentState === 'current' || item.presentState === 'explicit') addCandidate(item);
  }

  const protectedReserve = Math.min(3, Math.max(1, Math.floor(limit / 2)));
  let protectedAdded = 0;
  for (const item of candidates) {
    if (selected.length >= limit || protectedAdded >= protectedReserve) break;
    if (!npcLedgerHasProtectedItems(item.ledger) || selectedIds.has(item.npc.id)) continue;
    addCandidate(item, '保护事项保底');
    protectedAdded += 1;
  }

  for (const item of candidates) {
    addCandidate(item);
  }

  const skipped = candidates
    .filter((item) => !selectedIds.has(item.npc.id))
    .map((item) => ({ name: item.npc.姓名, reason: `超过 Top ${limit}，得分 ${item.score}，原因：${item.reasons.join('；') || '低相关'}` }));

  for (const npc of records) {
    if (selectedIds.has(npc.id)) continue;
    if (candidates.some((item) => item.npc.id === npc.id)) continue;
    if (npc.阶位 === 'companion' || npc.同行 || npc.关系 !== 'stranger' || npc.亲密关系 || 提取NPC同行记忆文本列表(npc).length > 0) {
      skipped.push({ name: npc.姓名, reason: '本回合没有点名、在场、近期出现、未完成事项或召回命中' });
    }
  }

  return { selected, skipped };
}

function normalizeNpcNameSet(names: string[]): Set<string> {
  return new Set(names.map((name) => 规范化NPC身份文本(name)).filter(Boolean));
}

function npcNameInSet(npc: NPC记录, names: Set<string>): boolean {
  if (!names.size) return false;
  return [npc.姓名, npc.别名]
    .filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
    .some((name) => names.has(规范化NPC身份文本(name)));
}

function isGenericAvatarPlaceholder(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, '/').split(/[?#]/, 1)[0].toLowerCase();
  return normalized.endsWith(STATIC_ASSET_FALLBACK_AVATAR.toLowerCase());
}

export function 读取NPC内置头像(record: Pick<NPC记录, '姓名' | '别名' | 'NPC来源'> | undefined): string | undefined {
  if (!record) return undefined;
  const canonical = 匹配记录NPC原著角色(record);
  return getDefaultBuiltinAvatarForNames(canonical?.name, record.姓名, record.别名);
}

export function 读取NPC头像(record: Pick<NPC记录, '姓名' | '别名' | '头像' | '图像档案'> | undefined, slot: NPC头像槽位 = '档案'): string | undefined {
  if (!record) return undefined;
  const builtinAvatar = 读取NPC内置头像(record);
  const savedCandidates = [
    record.图像档案?.头像槽位?.[slot]?.trim(),
    record.图像档案?.头像?.trim(),
    record.头像?.trim(),
  ].filter((value): value is string => Boolean(value));
  const preferredSavedAvatar = savedCandidates.find((value) => !builtinAvatar || !isGenericAvatarPlaceholder(value));
  return preferredSavedAvatar || builtinAvatar || savedCandidates[0];
}

/** 判断记录是否已经积累了需要保留的剧情内容。 */
export function NPC记录有内容(record: Pick<NPC记录, '同行记忆' | '最近互动' | '对玩家长期印象' | '共同经历' | '未完成事项' | '未解决冲突' | '必须记得' | '禁止遗忘' | '约定' | '好感度' | '关系' | '亲密关系'>): boolean {
  return Boolean(
    (record.同行记忆?.length ?? 0) > 0 ||
    Boolean(record.最近互动?.trim()) ||
    Boolean(record.对玩家长期印象?.trim()) ||
    (record.共同经历?.length ?? 0) > 0 ||
    (record.未完成事项?.length ?? 0) > 0 ||
    (record.未解决冲突?.length ?? 0) > 0 ||
    (record.必须记得?.length ?? 0) > 0 ||
    (record.禁止遗忘?.length ?? 0) > 0 ||
    (record.约定?.length ?? 0) > 0 ||
    Math.abs(Number(record.好感度 ?? 0)) > 5 ||
    record.关系 !== 'stranger' ||
    record.亲密关系 === true
  );
}

/** 统一判定姓名是否只是职业/身份泛称，供变量写入、读档整理和 UI 共用。 */
export function 是NPC泛称姓名(name: unknown): boolean {
  if (typeof name !== 'string' || !name.trim()) return false;
  const normalized = 规范化NPC身份文本(name);
  return NPC_GENERIC_SUFFIXES.some((suffix) => normalized === suffix || normalized.endsWith(suffix)) ||
    /^(?:敌人|杂兵|无名守卫|机兵|虚卒|傀儡|精英怪)/.test(normalized);
}

/** 归档 NPC 不得进入任何运行时注入/关系规划选择。 */
export function 筛选活跃NPC(records: NPC记录[] | undefined): NPC记录[] {
  return (records ?? []).filter((npc) => !npc.归档);
}

/** 读档及每回合结算共用的轻量整理：纠正泛称伙伴，并归档长期无内容的旧路人。 */
export function 整理NPC记录列表(records: NPC记录[], currentTurn?: number): NPC记录[] {
  const turn = Math.max(0, Math.trunc(Number(currentTurn) || 0));
  return records.map((record) => {
    let next = record;
    if (是NPC泛称姓名(record.姓名) && record.阶位 === 'companion' && !record.手动阶位覆盖 && !record.原著角色) {
      next = { ...next, 阶位: 'extra', 同行: false, 阶位来源: 'auto' };
    }
    const stale = turn > 0 && turn - (Number(next.最近回合) || 0) > 30;
    if (stale && next.阶位 === 'extra' && !NPC记录有内容(next) && !next.归档) {
      next = { ...next, 归档: true, 归档回合: turn, 同行: false };
    }
    return next;
  });
}
