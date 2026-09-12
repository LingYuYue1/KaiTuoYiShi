import { 天气列表, 天气名映射 } from '@/data/weatherRules';
import type { 背包物品 } from '@/models/inventory';
import type { NPC记录, 约定结构 } from '@/models/npc';
import type { 手机会话, 手机联系人, 手机系统, 主动来信种子 } from '@/models/phone';
import type { 变量事实类型, 变量处理模式 } from '@/models/variableCommand';
import type { 世界状态 } from '@/models/world';
import type { VariableState } from '@/utils/variableRegistry';

export type VariablePromptOwner =
  | 'variable'
  | 'player'
  | 'memory'
  | 'yiting'
  | 'zhiku'
  | 'news'
  | 'story'
  | 'service';

export type VariablePromptWriteMode =
  | 'create_required'
  | 'patch_optional'
  | 'append'
  | 'delta'
  | 'readonly'
  | 'deprecated';

export type VariablePromptValueShape = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object';
export type VariablePromptOmission = 'no_change' | 'not_applicable' | 'forbidden';
export type VariablePromptMerge = 'replace' | 'deep_merge' | 'append_dedup' | 'delta' | 'delete' | 'none';
export type VariablePromptEvidence = 'required' | 'recommended' | 'not_applicable';
export type VariablePromptRisk = 'low' | 'medium' | 'high';
export type VariablePromptGate = 'always' | 'phone_seeds' | 'nsfw' | 'male_nsfw' | 'history_repair';
export type VariablePromptIdentity =
  | 'none'
  | 'stable_id'
  | 'canonical_name'
  | 'display_name_with_confirmation'
  | 'custom_handler';
export type VariablePromptRequirement = 'required' | 'optional' | 'forbidden';
export type VariablePromptModelAccess = 'write' | 'readonly' | 'legacy';
export type VariablePromptModelMode = Extract<变量处理模式, 'normal' | 'retry' | 'reroll' | 'history_repair'>;

export interface VariablePromptFieldContract {
  factType: 变量事实类型;
  field: string;
  statePath: string;
  handler: string;
  owner: VariablePromptOwner;
  writeMode: VariablePromptWriteMode;
  valueShape: VariablePromptValueShape;
  requirement: VariablePromptRequirement;
  omission: VariablePromptOmission;
  merge: VariablePromptMerge;
  evidence: VariablePromptEvidence;
  risk: VariablePromptRisk;
  featureGate: VariablePromptGate;
  identity: VariablePromptIdentity;
  modes: readonly VariablePromptModelMode[];
  modelAccess: VariablePromptModelAccess;
  enumValues?: readonly string[];
  compatibility?: 'current' | 'read_legacy' | 'write_legacy' | 'deprecated';
  promptHint?: string;
}

export interface VariablePromptFactContract {
  factType: 变量事实类型;
  landing: string;
  handler: string;
  modes: readonly VariablePromptModelMode[];
  modelAccess: 'write' | 'readonly';
  featureGate: VariablePromptGate;
  codeGenerated: readonly string[];
  rules: readonly string[];
}

export interface VariablePromptContractOptions {
  mode?: 变量处理模式;
  phoneSeedsEnabled?: boolean;
  maxPhoneSeedsPerTurn?: number;
  nsfwEnabled?: boolean;
  maleNsfwArchiveEnabled?: boolean;
}

const NORMAL_MODES = ['normal', 'retry', 'reroll'] as const satisfies readonly VariablePromptModelMode[];
const ALL_MODEL_MODES = [...NORMAL_MODES, 'history_repair'] as const satisfies readonly VariablePromptModelMode[];

const field = (
  factType: 变量事实类型,
  fieldName: string,
  options: Omit<VariablePromptFieldContract, 'factType' | 'field'>,
): VariablePromptFieldContract => ({ factType, field: fieldName, ...options });

const OPTIONAL_FIELD = {
  owner: 'variable' as const,
  writeMode: 'patch_optional' as const,
  valueShape: 'string' as const,
  requirement: 'optional' as const,
  omission: 'no_change' as const,
  merge: 'replace' as const,
  evidence: 'recommended' as const,
  risk: 'medium' as const,
  featureGate: 'always' as const,
  identity: 'none' as const,
  modes: ALL_MODEL_MODES,
  modelAccess: 'write' as const,
  handler: 'factsToVariableCommands' as const,
};

const REQUIRED_FIELD = {
  ...OPTIONAL_FIELD,
  writeMode: 'create_required' as const,
  requirement: 'required' as const,
};

const EVIDENCE_FIELD = {
  ...OPTIONAL_FIELD,
  statePath: '变量事实记录.evidence',
  evidence: 'not_applicable' as const,
  risk: 'low' as const,
  promptHint: '可选调试摘要，不是提交门槛。',
};

const READONLY_FIELD = {
  ...OPTIONAL_FIELD,
  owner: 'player' as const,
  writeMode: 'readonly' as const,
  requirement: 'forbidden' as const,
  omission: 'forbidden' as const,
  merge: 'none' as const,
  evidence: 'not_applicable' as const,
  risk: 'high' as const,
  modelAccess: 'readonly' as const,
  compatibility: 'deprecated' as const,
  handler: 'legacy-readonly' as const,
};

/**
 * 变量模型的唯一字段目录。内部 handler、owner、risk 等供测试和维护使用，
 * buildVariablePromptContractSection 只渲染模型真正需要的字段、落点和写入语义。
 */
export const VARIABLE_PROMPT_FIELD_CONTRACT: readonly VariablePromptFieldContract[] = [
  field('traveler_profile', 'identity', { ...READONLY_FIELD, statePath: '旅人.身份' }),
  field('traveler_profile', 'appearance', { ...READONLY_FIELD, statePath: '旅人.外貌' }),
  field('traveler_profile', 'personality', { ...READONLY_FIELD, statePath: '旅人.性格' }),
  field('traveler_profile', 'background', { ...READONLY_FIELD, statePath: '旅人.背景' }),
  field('traveler_profile', 'abilityAdd', { ...READONLY_FIELD, statePath: '旅人.能力', valueShape: 'array' }),
  field('traveler_profile', 'knowledgeAdd', { ...READONLY_FIELD, statePath: '旅人.专长知识', valueShape: 'array' }),
  field('traveler_profile', 'evidence', { ...READONLY_FIELD, statePath: '变量事实记录.evidence' }),

  field('time', 'mode', {
    ...REQUIRED_FIELD,
    statePath: '世界.当前日期 / 世界.当前时间 / 世界.开拓天数',
    valueShape: 'enum',
    enumValues: ['no_change', 'elapsed', 'set_time', 'overnight', 'next_day'],
    modes: NORMAL_MODES,
  }),
  field('time', 'minutes', {
    ...OPTIONAL_FIELD,
    statePath: '世界.当前日期 / 世界.当前时间 / 世界.开拓天数',
    valueShape: 'number',
    modes: NORMAL_MODES,
    promptHint: '仅 elapsed 使用，写正文明确经过的正整数分钟。',
  }),
  field('time', 'targetTime', {
    ...OPTIONAL_FIELD,
    statePath: '世界.当前时间',
    modes: NORMAL_MODES,
    promptHint: '仅 set_time / overnight / next_day 使用，格式 HH:mm。',
  }),
  field('time', 'evidence', { ...EVIDENCE_FIELD, modes: NORMAL_MODES }),

  field('location', 'location', {
    ...REQUIRED_FIELD,
    statePath: '世界.当前地点 / 世界.当前区域ID',
    modes: NORMAL_MODES,
  }),
  field('location', 'evidence', { ...EVIDENCE_FIELD, modes: NORMAL_MODES }),

  field('weather', 'weather', {
    ...REQUIRED_FIELD,
    statePath: '世界.当前天气',
    valueShape: 'enum',
    enumValues: 天气列表.flatMap((item) => [item.id, item.name]),
    modes: NORMAL_MODES,
  }),
  field('weather', 'evidence', { ...EVIDENCE_FIELD, modes: NORMAL_MODES }),

  field('npc', 'id', { ...OPTIONAL_FIELD, statePath: 'NPC[id].id', identity: 'stable_id' }),
  field('npc', 'name', { ...REQUIRED_FIELD, statePath: 'NPC[id].姓名', identity: 'canonical_name' }),
  field('npc', 'alias', { ...OPTIONAL_FIELD, statePath: 'NPC[id].别名' }),
  field('npc', 'tier', {
    ...OPTIONAL_FIELD,
    statePath: 'NPC[id].阶位',
    valueShape: 'enum',
    enumValues: ['companion', 'extra'],
    risk: 'high',
    promptHint: '只在正文明确改变角色档案层级时写。',
  }),
  field('npc', 'job', { ...OPTIONAL_FIELD, statePath: 'NPC[id].职务' }),
  field('npc', 'gender', {
    ...OPTIONAL_FIELD,
    statePath: 'NPC[id].性别',
    valueShape: 'enum',
    enumValues: ['男', '女', '其他'],
  }),
  field('npc', 'affinityDelta', { ...OPTIONAL_FIELD, statePath: 'NPC[id].好感度', valueShape: 'number', writeMode: 'delta', merge: 'delta' }),
  field('npc', 'affinitySet', { ...OPTIONAL_FIELD, statePath: 'NPC[id].好感度', valueShape: 'number', risk: 'high' }),
  field('npc', 'relation', {
    ...OPTIONAL_FIELD,
    statePath: 'NPC[id].关系',
    valueShape: 'enum',
    enumValues: ['stranger', 'acquaintance', 'friend', 'close', 'rival', 'enemy'],
    modelAccess: 'legacy',
    compatibility: 'read_legacy',
    promptHint: '旧事实兼容字段；新输出通常省略，由代码按好感度派生。',
  }),
  field('npc', 'intimateRelationship', { ...OPTIONAL_FIELD, statePath: 'NPC[id].亲密关系', valueShape: 'boolean', risk: 'high' }),
  field('npc', 'following', { ...OPTIONAL_FIELD, statePath: 'NPC[id].同行', valueShape: 'boolean', risk: 'high' }),
  field('npc', 'appearance', { ...OPTIONAL_FIELD, statePath: 'NPC[id].外貌' }),
  field('npc', 'clothing', { ...OPTIONAL_FIELD, statePath: 'NPC[id].穿着' }),
  field('npc', 'speechStyle', { ...OPTIONAL_FIELD, statePath: 'NPC[id].说话方式' }),
  field('npc', 'personality', { ...OPTIONAL_FIELD, statePath: 'NPC[id].性格' }),
  field('npc', 'intro', { ...OPTIONAL_FIELD, statePath: 'NPC[id].介绍' }),
  field('npc', 'playerAddress', { ...OPTIONAL_FIELD, statePath: 'NPC[id].对玩家称呼' }),
  field('npc', 'memory', { ...OPTIONAL_FIELD, statePath: 'NPC[id].同行记忆[]', writeMode: 'append', merge: 'append_dedup' }),
  field('npc', 'recentInteraction', { ...OPTIONAL_FIELD, statePath: 'NPC[id].最近互动' }),
  field('npc', 'longTermImpression', { ...OPTIONAL_FIELD, statePath: 'NPC[id].对玩家长期印象' }),
  field('npc', 'relationshipStage', {
    ...OPTIONAL_FIELD,
    statePath: 'NPC[id].当前关系阶段',
    promptHint: '只写正文明确给出的非标准剧情阶段，不替代好感派生关系。',
  }),
  field('npc', 'sharedExperiences', { ...OPTIONAL_FIELD, statePath: 'NPC[id].共同经历[]', valueShape: 'array', writeMode: 'append', merge: 'append_dedup' }),
  field('npc', 'openItems', { ...OPTIONAL_FIELD, statePath: 'NPC[id].未完成事项[]', valueShape: 'array', writeMode: 'append', merge: 'append_dedup' }),
  field('npc', 'unresolvedConflicts', { ...OPTIONAL_FIELD, statePath: 'NPC[id].未解决冲突[]', valueShape: 'array', writeMode: 'append', merge: 'append_dedup' }),
  field('npc', 'mustRemember', { ...OPTIONAL_FIELD, statePath: 'NPC[id].必须记得[]', valueShape: 'array', writeMode: 'append', merge: 'append_dedup' }),
  field('npc', 'doNotForget', { ...OPTIONAL_FIELD, statePath: 'NPC[id].禁止遗忘[]', valueShape: 'array', writeMode: 'append', merge: 'append_dedup' }),
  field('npc', 'evidence', { ...EVIDENCE_FIELD }),

  field('item', 'action', { ...REQUIRED_FIELD, statePath: '旅人.背包', valueShape: 'enum', enumValues: ['gain'] }),
  field('item', 'category', {
    ...REQUIRED_FIELD,
    statePath: '旅人.背包[].类别',
    valueShape: 'enum',
    enumValues: ['food', 'consumable', 'lightcone', 'weapon', 'clothing', 'accessory', 'memento', 'key'],
  }),
  field('item', 'name', { ...REQUIRED_FIELD, statePath: '旅人.背包[].名称', identity: 'display_name_with_confirmation' }),
  field('item', 'description', { ...OPTIONAL_FIELD, statePath: '旅人.背包[].描述' }),
  field('item', 'quantity', { ...OPTIONAL_FIELD, statePath: '旅人.背包[].数量', valueShape: 'number', merge: 'delta' }),
  field('item', 'quality', { ...OPTIONAL_FIELD, statePath: '旅人.背包[].品质', valueShape: 'enum', enumValues: ['蓝', '紫', '金'] }),
  field('item', 'stackable', { ...OPTIONAL_FIELD, statePath: '旅人.背包[].可堆叠', valueShape: 'boolean' }),
  field('item', 'source', { ...OPTIONAL_FIELD, statePath: '旅人.背包[].来源', valueShape: 'enum', enumValues: ['剧情掉落', '任务奖励', '商店', '打造', '其它'] }),
  field('item', 'sourceDescription', { ...OPTIONAL_FIELD, statePath: '旅人.背包[].来源描述' }),
  field('item', 'narrativeEffects', { ...OPTIONAL_FIELD, statePath: '旅人.背包[].叙事效果[]', valueShape: 'array', merge: 'append_dedup' }),
  field('item', 'evidence', { ...EVIDENCE_FIELD }),

  field('world_event', 'text', { ...REQUIRED_FIELD, statePath: '世界.全局事件[]', writeMode: 'append', merge: 'append_dedup' }),
  field('world_event', 'evidence', { ...EVIDENCE_FIELD }),

  field('phone_seed', 'targetType', {
    ...OPTIONAL_FIELD,
    statePath: '手机.messageSeeds[].targetType',
    valueShape: 'enum',
    enumValues: ['private', 'group'],
    featureGate: 'phone_seeds',
    modes: NORMAL_MODES,
  }),
  field('phone_seed', 'targetId', { ...OPTIONAL_FIELD, statePath: '手机.messageSeeds[].targetId', featureGate: 'phone_seeds', identity: 'stable_id', modes: NORMAL_MODES }),
  field('phone_seed', 'targetName', { ...OPTIONAL_FIELD, statePath: '手机.messageSeeds[].targetId', featureGate: 'phone_seeds', identity: 'canonical_name', modes: NORMAL_MODES, promptHint: '缺少稳定 ID 时用于匹配已有 NPC 或联系人。' }),
  field('phone_seed', 'title', { ...REQUIRED_FIELD, statePath: '手机.messageSeeds[].title', featureGate: 'phone_seeds', modes: NORMAL_MODES }),
  field('phone_seed', 'context', { ...REQUIRED_FIELD, statePath: '手机.messageSeeds[].context', featureGate: 'phone_seeds', modes: NORMAL_MODES }),
  field('phone_seed', 'triggerType', {
    ...OPTIONAL_FIELD,
    statePath: '手机.messageSeeds[].triggerType',
    valueShape: 'enum',
    enumValues: ['injury', 'victory', 'defeat', 'location_change', 'important_item', 'relationship', 'news', 'quest', 'time', 'custom'],
    featureGate: 'phone_seeds',
    modes: NORMAL_MODES,
  }),
  field('phone_seed', 'priority', {
    ...OPTIONAL_FIELD,
    statePath: '手机.messageSeeds[].priority',
    valueShape: 'enum',
    enumValues: ['low', 'normal', 'high', 'urgent'],
    featureGate: 'phone_seeds',
    modes: NORMAL_MODES,
  }),
  field('phone_seed', 'relatedNpcIds', { ...OPTIONAL_FIELD, statePath: '手机.messageSeeds[].relatedNpcIds[]', valueShape: 'array', merge: 'append_dedup', featureGate: 'phone_seeds', identity: 'stable_id', modes: NORMAL_MODES }),
  field('phone_seed', 'evidence', { ...EVIDENCE_FIELD, featureGate: 'phone_seeds', modes: NORMAL_MODES }),

  field('nsfw_archive', 'npcId', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案', featureGate: 'nsfw', identity: 'stable_id', risk: 'high' }),
  field('nsfw_archive', 'npcName', { ...REQUIRED_FIELD, statePath: 'NPC[id].NSFW档案', featureGate: 'nsfw', identity: 'canonical_name', risk: 'high' }),
  field('nsfw_archive', 'enabled', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.enabled', valueShape: 'boolean', featureGate: 'nsfw', risk: 'high' }),
  field('nsfw_archive', 'ageConfirm', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.年龄确认', valueShape: 'enum', enumValues: ['adult', 'unknown', 'minor_blocked'], featureGate: 'nsfw', risk: 'high', promptHint: '展示分类，不作为其他字段的自动推断依据。' }),
  field('nsfw_archive', 'intimacyStage', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.亲密阶段', featureGate: 'nsfw', risk: 'high' }),
  field('nsfw_archive', 'boundaries', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.边界', featureGate: 'nsfw', risk: 'high' }),
  field('nsfw_archive', 'preferences', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.偏好[]', valueShape: 'array', merge: 'append_dedup', featureGate: 'nsfw', risk: 'high' }),
  field('nsfw_archive', 'sensitivePoints', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.敏感点[]', valueShape: 'array', merge: 'append_dedup', featureGate: 'nsfw', risk: 'high' }),
  field('nsfw_archive', 'taboos', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.禁忌[]', valueShape: 'array', merge: 'append_dedup', featureGate: 'nsfw', risk: 'high' }),
  field('nsfw_archive', 'femaleBodyArchive', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.女性身体档案', valueShape: 'object', merge: 'deep_merge', featureGate: 'nsfw', risk: 'high', promptHint: '允许 key：胸部、女性私处、后庭、体态、体味。' }),
  field('nsfw_archive', 'maleBodyArchive', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.男性身体档案', valueShape: 'object', merge: 'deep_merge', featureGate: 'male_nsfw', risk: 'high', promptHint: '允许 key：男性器、后庭、体态、体味。' }),
  field('nsfw_archive', 'experiences', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.经历[]', valueShape: 'array', merge: 'append_dedup', featureGate: 'nsfw', risk: 'high' }),
  field('nsfw_archive', 'longTermFacts', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.长期事实[]', valueShape: 'array', merge: 'append_dedup', featureGate: 'nsfw', risk: 'high' }),
  field('nsfw_archive', 'tags', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.标签[]', valueShape: 'array', merge: 'append_dedup', featureGate: 'nsfw', risk: 'high' }),
  field('nsfw_archive', 'notes', { ...OPTIONAL_FIELD, statePath: 'NPC[id].NSFW档案.备注', featureGate: 'nsfw', risk: 'high' }),
  field('nsfw_archive', 'evidence', { ...EVIDENCE_FIELD, featureGate: 'nsfw', risk: 'high' }),

  field('agreement', 'npcId', { ...OPTIONAL_FIELD, statePath: 'NPC[id].约定[]', identity: 'stable_id', risk: 'high' }),
  field('agreement', 'npcName', { ...REQUIRED_FIELD, statePath: 'NPC[id].约定[]', identity: 'canonical_name', risk: 'high' }),
  field('agreement', 'title', { ...REQUIRED_FIELD, statePath: 'NPC[id].约定[].标题', identity: 'custom_handler', risk: 'high' }),
  field('agreement', 'content', { ...REQUIRED_FIELD, statePath: 'NPC[id].约定[].内容', risk: 'high' }),
  field('agreement', '约定时间', { ...OPTIONAL_FIELD, statePath: 'NPC[id].约定[].约定时间', risk: 'high' }),
  field('agreement', '后果', { ...OPTIONAL_FIELD, statePath: 'NPC[id].约定[].后果', risk: 'high' }),
  field('agreement', 'evidence', { ...EVIDENCE_FIELD, risk: 'high' }),

  field('agreement_status', 'npcId', { ...OPTIONAL_FIELD, statePath: 'NPC[id].约定[]', identity: 'stable_id', risk: 'high' }),
  field('agreement_status', 'npcName', { ...REQUIRED_FIELD, statePath: 'NPC[id].约定[]', identity: 'canonical_name', risk: 'high' }),
  field('agreement_status', 'agreementId', { ...OPTIONAL_FIELD, statePath: 'NPC[id].约定[id].id', identity: 'stable_id', risk: 'high', promptHint: '优先使用当前对象视图中的稳定约定 ID。' }),
  field('agreement_status', 'title', { ...REQUIRED_FIELD, statePath: 'NPC[id].约定[id].标题', identity: 'custom_handler', risk: 'high', promptHint: '缺少稳定 ID 时只作唯一匹配兜底。' }),
  field('agreement_status', '新状态', { ...REQUIRED_FIELD, statePath: 'NPC[id].约定[id].当前状态', valueShape: 'enum', enumValues: ['已履行', '已违约', '已作废'], risk: 'high' }),
  field('agreement_status', 'evidence', { ...EVIDENCE_FIELD, risk: 'high' }),
];

export const VARIABLE_PROMPT_FACT_CONTRACT: readonly VariablePromptFactContract[] = [
  {
    factType: 'traveler_profile',
    landing: '旅人核心档案',
    handler: 'legacy-readonly',
    modes: ALL_MODEL_MODES,
    modelAccess: 'readonly',
    featureGate: 'always',
    codeGenerated: [],
    rules: [
      '旅人核心档案由玩家编辑，变量模型不得输出 traveler_profile。',
      '剧情中新获得的身份称呼、临时伪装或他人对玩家能力的认知，改写为 npc 账本、world_event、item 或正文承接，不修改旅人档案本体。',
    ],
  },
  {
    factType: 'time',
    landing: '世界.当前日期 / 当前时间 / 开拓天数',
    handler: 'world-time',
    modes: NORMAL_MODES,
    modelAccess: 'write',
    featureGate: 'always',
    codeGenerated: ['日期与开拓天数对齐', 'elapsed 的跨午夜和跨多日换算'],
    rules: [
      'elapsed 写正文明确经过的分钟，不设固定分钟上限。',
      'set_time 直接写正文明确的 HH:mm；不要因钟点变小自行猜跨日。',
      'overnight / next_day 只在正文明确跨日时使用。',
    ],
  },
  {
    factType: 'location',
    landing: '世界.当前地点 / 当前区域ID',
    handler: 'world-location',
    modes: NORMAL_MODES,
    modelAccess: 'write',
    featureGate: 'always',
    codeGenerated: ['可确定时同步当前区域ID'],
    rules: ['正文明确到达、进入或离开后直接写新地点；不等待跨区域确认。'],
  },
  {
    factType: 'weather',
    landing: '世界.当前天气',
    handler: 'world-weather',
    modes: NORMAL_MODES,
    modelAccess: 'write',
    featureGate: 'always',
    codeGenerated: ['中文天气名或 ID 归一化为内部天气 ID'],
    rules: [
      '只依据正文明确写出的天气或天气变化；地点、氛围和常识不能代替正文证据。',
      '天气使用字段枚举中的中文名或 ID；不按旧地点白名单拒绝同批新地点天气。',
    ],
  },
  {
    factType: 'npc',
    landing: 'NPC[id]',
    handler: 'npc-ledger',
    modes: ALL_MODEL_MODES,
    modelAccess: 'write',
    featureGate: 'always',
    codeGenerated: ['新 NPC 稳定 ID', '初见回合与最近回合', '互动次数', '关系派生', '同行记忆 ID/回合/游戏时间'],
    rules: [
      '已有 NPC 优先使用当前对象视图中的稳定 id；同一 NPC 的字段合并到一个 fact。',
      '新 NPC 必须有真实姓名或稳定专名；店员、士兵、研究员等泛称写 job，不单独建档。',
      '只写本回合明确形成的状态；单回合情绪不固化为长期 personality。',
      '原著角色的长期 personality 不由变量系统改写；正文只体现本回合状态时写账本字段。',
      '具体共同日常可以写 memory / recentInteraction / sharedExperiences，不因没有任务或冲突而漏掉。',
      'affinity、following、intimateRelationship、tier 只按正文明确变化写；代码负责派生关系与整理档案。',
      '相同强度的互动对不同性别 NPC 使用同一好感标准。',
    ],
  },
  {
    factType: 'item',
    landing: '旅人.背包',
    handler: 'inventory',
    modes: ALL_MODEL_MODES,
    modelAccess: 'write',
    featureGate: 'always',
    codeGenerated: ['物品稳定 ID', '获得回合与游戏时间', '同名可堆叠物品合并'],
    rules: [
      '当前协议只表达 gain；必须是正文实际获得的实体物品。',
      '坐标、路线、权限、口令、情报、消息和地址等信息本身不是背包物品。',
      '物品事实不写装备槽位、穿戴状态或旧数值属性加成。',
    ],
  },
  {
    factType: 'world_event',
    landing: '世界.全局事件',
    handler: 'world-event',
    modes: ALL_MODEL_MODES,
    modelAccess: 'write',
    featureGate: 'always',
    codeGenerated: ['重复事件去重'],
    rules: ['只写本回合已经发生且会影响后续的客观结果，不写未来计划或纯氛围。'],
  },
  {
    factType: 'phone_seed',
    landing: '手机.messageSeeds',
    handler: 'phone-seed',
    modes: NORMAL_MODES,
    modelAccess: 'write',
    featureGate: 'phone_seeds',
    codeGenerated: ['种子稳定 ID', '回合', '来源', 'pending 状态', '联系人入口'],
    rules: [
      '只写稍后可能触发通讯的入口，不写完整短信或聊天消息。',
      'phone_seed 是可选事实，不为保持活跃而强行补写；优先使用当前 NPC、联系人或群聊 ID。',
    ],
  },
  {
    factType: 'nsfw_archive',
    landing: 'NPC[id].NSFW档案',
    handler: 'npc-nsfw',
    modes: ALL_MODEL_MODES,
    modelAccess: 'write',
    featureGate: 'nsfw',
    codeGenerated: ['命中现有 NPC', '字段级 feature gate 与增量合并'],
    rules: [
      '只写正文明确形成、可供后续承接的档案事实；不创建普通档案基线或空壳。',
      'ageConfirm 是可选展示分类，不凭它推断其他字段。',
      '帕姆、佩佩、史瓦罗等机械、智械、非人形、怪物和投影对象不写；黑塔 / 大黑塔 / Herta / The Herta 按运行时同一身份规则处理。',
    ],
  },
  {
    factType: 'agreement',
    landing: 'NPC[id].约定[]',
    handler: 'npc-agreement',
    modes: ALL_MODEL_MODES,
    modelAccess: 'write',
    featureGate: 'always',
    codeGenerated: ['约定稳定 ID', '等待中状态', '回合', '正文/通讯/历史正文来源'],
    rules: ['只写双方已经明确形成的承诺或约定；普通意向、猜测和未来打算不算。'],
  },
  {
    factType: 'agreement_status',
    landing: 'NPC[id].约定[id].当前状态',
    handler: 'npc-agreement-status',
    modes: ALL_MODEL_MODES,
    modelAccess: 'write',
    featureGate: 'always',
    codeGenerated: ['按稳定 agreementId 定位现有约定'],
    rules: ['只更新已经存在的约定；优先使用稳定 agreementId，标题仅作唯一匹配兜底。'],
  },
];

const VARIABLE_FACT_OUTPUT_EXAMPLES: Record<变量事实类型, string> = {
  traveler_profile: '{"type":"traveler_profile","identity":"巡海游侠"}',
  time: '{"type":"time","mode":"elapsed","minutes":15,"evidence":"正文明确经过十五分钟"}',
  location: '{"type":"location","location":"黑塔空间站·主控舱段","evidence":"正文明确抵达主控舱段"}',
  weather: '{"type":"weather","weather":"blizzard","evidence":"正文明确写出暴风雪"}',
  npc: '{"type":"npc","id":"npc_march7th","name":"三月七","memory":"三月七与玩家共同完成一件事","sharedExperiences":["与玩家共同完成一件事"]}',
  item: '{"type":"item","action":"gain","category":"key","name":"临时权限卡","quantity":1}',
  world_event: '{"type":"world_event","text":"空间站防线已经收缩","evidence":"正文明确写出防线收缩"}',
  phone_seed: '{"type":"phone_seed","targetType":"private","targetId":"npc_march7th","title":"确认路线","context":"稍后确认撤离路线"}',
  nsfw_archive: '{"type":"nsfw_archive","npcId":"npc_march7th","npcName":"三月七","intimacyStage":"已建立"}',
  agreement: '{"type":"agreement","npcId":"npc_march7th","npcName":"三月七","title":"确认路线","content":"双方约定在月台汇合"}',
  agreement_status: '{"type":"agreement_status","npcId":"npc_march7th","agreementId":"agreement_route","npcName":"三月七","title":"确认路线","新状态":"已履行"}',
};

export function getVariablePromptContractFactTypes(): 变量事实类型[] {
  return VARIABLE_PROMPT_FACT_CONTRACT.map((item) => item.factType);
}

function normalizeModelMode(mode: 变量处理模式 | undefined): VariablePromptModelMode {
  if (mode === 'history_repair') return mode;
  if (mode === 'retry' || mode === 'reroll') return mode;
  return 'normal';
}

function isFactVisible(contract: VariablePromptFactContract, options: VariablePromptContractOptions): boolean {
  const mode = normalizeModelMode(options.mode);
  if (!contract.modes.includes(mode)) return false;
  if (contract.featureGate === 'phone_seeds') return options.phoneSeedsEnabled !== false;
  if (contract.featureGate === 'nsfw') return options.nsfwEnabled === true;
  return true;
}

function isFieldVisible(contract: VariablePromptFieldContract, options: VariablePromptContractOptions): boolean {
  const mode = normalizeModelMode(options.mode);
  if (!contract.modes.includes(mode)) return false;
  if (contract.featureGate === 'phone_seeds') return options.phoneSeedsEnabled !== false;
  if (contract.featureGate === 'nsfw') return options.nsfwEnabled === true;
  if (contract.featureGate === 'male_nsfw') {
    return options.nsfwEnabled === true && options.maleNsfwArchiveEnabled === true;
  }
  return true;
}

const SHAPE_LABELS: Record<VariablePromptValueShape, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  enum: 'enum',
  array: 'string[]',
  object: 'object',
};

const MERGE_LABELS: Record<VariablePromptMerge, string> = {
  replace: '替换该字段',
  deep_merge: '对象增量合并',
  append_dedup: '去重追加',
  delta: '增量合并',
  delete: '删除',
  none: '不写入',
};

function formatModelField(item: VariablePromptFieldContract): string {
  const requirement = item.requirement === 'required' ? '必填' : item.requirement === 'forbidden' ? '禁止' : '可选';
  const enumText = item.enumValues?.length ? `(${item.enumValues.join(' | ')})` : '';
  const legacy = item.modelAccess === 'legacy' ? '；旧兼容，正常输出通常省略' : '';
  const hint = item.promptHint ? `；${item.promptHint}` : '';
  return `- ${item.field}: ${requirement} ${SHAPE_LABELS[item.valueShape]}${enumText} -> ${item.statePath}；${MERGE_LABELS[item.merge]}${legacy}${hint}`;
}

function buildVariableCatalogSection(options: VariablePromptContractOptions): string {
  const lines = [
    '[2 可写结构]',
    'facts 数组的每一项必须是一个对象，并使用统一的同层形状：{"type":"事实类型", ...该类型字段}。',
    '每一项都必须带同层 type 判别字段；所有业务字段必须与 type 同层。',
    'type 只能取：' + VARIABLE_PROMPT_FACT_CONTRACT.map((item) => item.factType).join(' | ') + '。',
    '禁止用 factType、fact_type、类型 替代 type；禁止把业务字段包在 payload、data 或 value 内。',
  ];
  for (const fact of VARIABLE_PROMPT_FACT_CONTRACT) {
    if (!isFactVisible(fact, options)) continue;
    const fields = VARIABLE_PROMPT_FIELD_CONTRACT.filter((item) => item.factType === fact.factType && isFieldVisible(item, options));
    lines.push('', `${fact.factType} -> ${fact.landing}${fact.modelAccess === 'readonly' ? '（只读，禁止输出）' : ''}`);
    lines.push(...fields.map(formatModelField));
    lines.push('- JSON 输出示例（仅展示形状，字段按正文增量填写）：' + VARIABLE_FACT_OUTPUT_EXAMPLES[fact.factType]);
    if (fact.codeGenerated.length) lines.push(`- 代码生成/派生：${fact.codeGenerated.join('；')}。模型不要伪造这些字段。`);
    lines.push(...fact.rules.map((rule) => `- 规则：${rule}`));
  }

  const disabled: string[] = [];
  if (normalizeModelMode(options.mode) === 'history_repair') disabled.push('time、location、weather、phone_seed');
  if (options.phoneSeedsEnabled === false) disabled.push('phone_seed');
  if (options.nsfwEnabled !== true) disabled.push('nsfw_archive');
  else if (options.maleNsfwArchiveEnabled !== true) disabled.push('nsfw_archive.maleBodyArchive');
  if (disabled.length) lines.push('', `本次关闭：${[...new Set(disabled)].join('；')}。`);
  if (options.phoneSeedsEnabled !== false && normalizeModelMode(options.mode) !== 'history_repair') {
    lines.push(`phone_seed 本回合最多 ${Math.max(0, Math.trunc(options.maxPhoneSeedsPerTurn ?? 2))} 条；没有明确通讯入口就输出 0 条。`);
  }
  return lines.join('\n');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function textValue(value: unknown, maxLength = 160): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function numberValue(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function compactObject(entries: Array<[string, unknown]>): Record<string, unknown> {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

function limitView<T>(items: T[], limit: number, label: string): Array<T | Record<string, string>> {
  if (items.length <= limit) return items;
  return [...items.slice(0, limit), { 截断: `${label} 共 ${items.length} 条，仅展示前 ${limit} 条身份信息` }];
}

function compactAgreement(agreement: 约定结构): Record<string, unknown> {
  return compactObject([
    ['id', textValue(agreement.id)],
    ['标题', textValue(agreement.标题, 100)],
    ['状态', textValue(agreement.当前状态)],
  ]);
}

function compactNpc(npc: NPC记录): Record<string, unknown> {
  const agreements = asArray<约定结构>(npc.约定).map(compactAgreement);
  return compactObject([
    ['id', textValue(npc.id)],
    ['姓名', textValue(npc.姓名)],
    ['别名', textValue(npc.别名)],
    ['阶位', textValue(npc.阶位)],
    ['好感度', numberValue(npc.好感度)],
    ['关系', textValue(npc.关系)],
    ['亲密关系', typeof npc.亲密关系 === 'boolean' ? npc.亲密关系 : undefined],
    ['同行', typeof npc.同行 === 'boolean' ? npc.同行 : undefined],
    ['当前关系阶段', textValue(npc.当前关系阶段, 100)],
    ['归档', npc.归档 === true ? true : undefined],
    ['约定', agreements.length ? limitView(agreements, 40, `${npc.姓名}的约定`) : undefined],
  ]);
}

function compactItem(item: 背包物品): Record<string, unknown> {
  return compactObject([
    ['id', textValue(item.id)],
    ['名称', textValue(item.名称)],
    ['数量', numberValue(item.数量)],
  ]);
}

function compactContact(contact: 手机联系人): Record<string, unknown> {
  return compactObject([
    ['id', textValue(contact.id)],
    ['npcId', textValue(contact.npcId)],
    ['姓名', textValue(contact.name)],
    ['可用', typeof contact.available === 'boolean' ? contact.available : undefined],
    ['状态', textValue(contact.status)],
  ]);
}

function compactChat(chat: 手机会话): Record<string, unknown> {
  return compactObject([
    ['id', textValue(chat.id)],
    ['类型', textValue(chat.type)],
    ['标题', textValue(chat.title, 100)],
    ['参与者ID', asArray<string>(chat.participantIds).map((id) => textValue(id)).filter(Boolean)],
  ]);
}

function compactSeed(seed: 主动来信种子): Record<string, unknown> {
  return compactObject([
    ['id', textValue(seed.id)],
    ['目标类型', textValue(seed.targetType)],
    ['目标ID', textValue(seed.targetId)],
    ['标题', textValue(seed.title, 100)],
    ['状态', textValue(seed.status)],
  ]);
}

function buildVariableWriteContextSection(state: VariableState, options: VariablePromptContractOptions): string {
  const world = asRecord(state.世界) as Partial<世界状态>;
  const traveler = asRecord(state.旅人);
  const phone = asRecord(state.手机) as Partial<手机系统>;
  const currentWeather = textValue(world.当前天气);
  const context = {
    世界: compactObject([
      ['日期', textValue(world.当前日期)],
      ['时间', textValue(world.当前时间)],
      ['开拓天数', numberValue(world.开拓天数)],
      ['地点', textValue(world.当前地点)],
      ['区域ID', textValue(world.当前区域ID)],
      ['天气', currentWeather ? compactObject([['id', currentWeather], ['名称', 天气名映射[currentWeather] ?? currentWeather]]) : undefined],
    ]),
    背包: limitView(asArray<背包物品>(traveler.背包).map(compactItem), 200, '背包物品'),
    NPC: limitView(asArray<NPC记录>(state.NPC).map(compactNpc), 200, 'NPC'),
    手机: {
      联系人: limitView(asArray<手机联系人>(phone.contacts).map(compactContact), 160, '联系人'),
      会话: limitView(asArray<手机会话>(phone.chats).map(compactChat), 120, '会话'),
      待处理种子: limitView(
        asArray<主动来信种子>(phone.messageSeeds).filter((seed) => seed?.status === 'pending').map(compactSeed),
        80,
        '待处理种子',
      ),
    },
    功能开关: {
      mode: normalizeModelMode(options.mode),
      phone_seed: options.phoneSeedsEnabled !== false,
      phone_seed_每回合上限: Math.max(0, Math.trunc(options.maxPhoneSeedsPerTurn ?? 2)),
      nsfw_archive: options.nsfwEnabled === true,
      maleBodyArchive: options.nsfwEnabled === true && options.maleNsfwArchiveEnabled === true,
    },
  };

  return [
    '[3 当前写入上下文]',
    '这是对象匹配与去重视图，不是剧情证据；只包含变量写入需要的身份和关键状态。',
    JSON.stringify(context),
  ].join('\n');
}

/** 生成变量模型唯一的结构目录与紧凑当前对象视图。 */
export function buildVariablePromptContractSection(
  state: VariableState,
  options: VariablePromptContractOptions = {},
): string {
  return [
    buildVariableCatalogSection(options),
    buildVariableWriteContextSection(state, options),
  ].join('\n\n');
}
