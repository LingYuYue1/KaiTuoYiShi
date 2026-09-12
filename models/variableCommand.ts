// 变量命令协议：AI 通过 <变量更新>...</变量更新> 块输出一组命令，由系统解析后修改 state。
// 设计参考：TavernCommand（添加 sub 动作，去除 add 的「数值相加」歧义）。

export type 变量命令动作 = 'set' | 'add' | 'sub' | 'push' | 'delete';

export type 变量处理模式 = 'normal' | 'retry' | 'repair' | 'history_repair' | 'reroll';

export interface 变量命令 {
  /** 动作：
   * - set: 用 value 覆盖目标路径（对象用深合并）
   * - add: 数字相加（非数字按 0 处理）
   * - sub: 数字相减
   * - push: 把 value 推入数组末尾（目标非数组时初始化为 []）
   * - delete: 删除目标字段或数组元素 */
  action: 变量命令动作;
  /** 变量路径,如 "世界.当前地点" / "NPC[2].好感度"
   *  根路径必须是 VARIABLE_ROOT_KEYS 中的一个 */
  key: string;
  /** JSON 值。delete 时省略；省略非 delete 值会在执行前被诊断为无效命令。 */
  value?: unknown;
  /** 事实证据来源，由调用链注入，不信任模型自行伪造。 */
  factSource?: 变量事实来源;
  /** 外部证据身份，由调用链注入，不能由模型自行生成。 */
  sourceEvidenceId?: string;
  /** 事实组追踪元数据；同一事实生成的多条命令共享该 ID。 */
  factGroupId?: string;
  factIndex?: number;
  entityKey?: string;
  dependsOnFactGroupIds?: string[];
}

export type 变量事实来源 = '正文' | '通讯' | '历史正文';

export interface 变量事实来源元数据 {
  /** 事实证据来源，由代码根据调用上下文归属。 */
  factSource?: 变量事实来源;
  sourceEvidenceId?: string;
  /** 转换前由代码分配的事实组追踪信息。 */
  factGroupId?: string;
  factIndex?: number;
  entityKey?: string;
  dependsOnFactGroupIds?: string[];
}

export type 变量事实类型 =
  | 'traveler_profile'
  | 'time'
  | 'location'
  | 'npc'
  | 'item'
  | 'world_event'
  | 'phone_seed'
  | 'nsfw_archive'
  | 'weather'
  | 'agreement'
  | 'agreement_status';

export interface 旅人档案变量事实 extends 变量事实来源元数据 {
  type: 'traveler_profile';
  identity?: string;
  appearance?: string;
  personality?: string;
  background?: string;
  abilityAdd?: string[];
  knowledgeAdd?: string[];
  evidence?: string;
}

export interface 时间变量事实 extends 变量事实来源元数据 {
  type: 'time';
  /** no_change 表示明确不推进；elapsed 表示推进若干分钟；set_time 表示同日设定目标时刻；overnight / next_day 表示跨日。 */
  mode: 'no_change' | 'elapsed' | 'set_time' | 'overnight' | 'next_day';
  minutes?: number;
  targetTime?: string;
  evidence?: string;
}

export interface 地点变量事实 extends 变量事实来源元数据 {
  type: 'location';
  location: string;
  evidence?: string;
}

export interface 天气变量事实 extends 变量事实来源元数据 {
  type: 'weather';
  /** 天气中文名，如 "暴风雪"、"星海潮汐"。解析器会转成内部 ID。 */
  weather: string;
  evidence?: string;
}

export interface NPC变量事实 extends 变量事实来源元数据 {
  type: 'npc';
  id?: string;
  name: string;
  alias?: string;
  tier?: 'companion' | 'extra';
  /** 职业/身份标签，不能混入姓名。 */
  job?: string;
  gender?: '男' | '女' | '其他';
  affinityDelta?: number;
  affinitySet?: number;
  relation?: string;
  intimateRelationship?: boolean;
  following?: boolean;
  appearance?: string;
  clothing?: string;
  speechStyle?: string;
  personality?: string;
  intro?: string;
  playerAddress?: string;
  memory?: string;
  recentInteraction?: string;
  longTermImpression?: string;
  relationshipStage?: string;
  sharedExperiences?: string[];
  openItems?: string[];
  unresolvedConflicts?: string[];
  mustRemember?: string[];
  doNotForget?: string[];
  evidence?: string;
}

export interface 物品变量事实 extends 变量事实来源元数据 {
  type: 'item';
  action: 'gain';
  category: 'food' | 'consumable' | 'lightcone' | 'weapon' | 'clothing' | 'accessory' | 'memento' | 'key';
  name: string;
  description?: string;
  quantity?: number;
  quality?: '蓝' | '紫' | '金';
  stackable?: boolean;
  source?: '剧情掉落' | '任务奖励' | '商店' | '打造' | '其它';
  sourceDescription?: string;
  narrativeEffects?: string[];
  evidence?: string;
}

export interface 世界事件变量事实 extends 变量事实来源元数据 {
  type: 'world_event';
  text: string;
  evidence?: string;
}

export interface 手机来信变量事实 extends 变量事实来源元数据 {
  type: 'phone_seed';
  targetType?: 'private' | 'group';
  targetId?: string;
  targetName?: string;
  title: string;
  context: string;
  triggerType?: 'injury' | 'victory' | 'defeat' | 'location_change' | 'important_item' | 'relationship' | 'news' | 'quest' | 'time' | 'custom';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  relatedNpcIds?: string[];
  evidence?: string;
}

export interface NSFW档案变量事实 extends 变量事实来源元数据 {
  type: 'nsfw_archive';
  npcId?: string;
  npcName: string;
  enabled?: boolean;
  ageConfirm?: 'adult' | 'unknown' | 'minor_blocked';
  intimacyStage?: string;
  boundaries?: string;
  preferences?: string[];
  sensitivePoints?: string[];
  taboos?: string[];
  femaleBodyArchive?: {
    胸部?: string;
    女性私处?: string;
    后庭?: string;
    体态?: string;
    体味?: string;
  };
  maleBodyArchive?: {
    男性器?: string;
    后庭?: string;
    体态?: string;
    体味?: string;
  };
  experiences?: string[];
  longTermFacts?: string[];
  tags?: string[];
  notes?: string;
  evidence?: string;
}

/**
 * 约定变量事实（阶段1新增·写入环）
 * - 由 variableModel 从正文或 recallContext（通讯回忆）提取玩家与NPC建立的约定
 * - 代码层根据是否有 recallContext 判断来源（'正文' | '通讯'）
 * - 新建约定状态默认 '等待中'，由代码层设置
 * - id 由代码层生成（UID），AI 不输出 id
 */
export interface 约定变量事实 extends 变量事实来源元数据 {
  type: 'agreement';
  /** 约定对象的 NPC id（可选，代码层按 name 匹配兜底） */
  npcId?: string;
  /** 约定对象的 NPC 姓名（必填，用于匹配现有NPC） */
  npcName: string;
  /** 约定标题（简短，用于后续匹配和展示） */
  title: string;
  /** 约定具体内容 */
  content: string;
  /** 游戏内时间（时间锚点，可选） */
  约定时间?: string;
  /** 履行/违约后果描述（可选） */
  后果?: string;
  evidence?: string;
}

/**
 * 约定状态变更事实（阶段1新增·清理环）
 * - 由 variableModel 从正文提取约定履行/违约/作废信号
 * - 代码层按 npcId+npcName+title 模糊匹配现有约定，变更状态
 * - 状态变更后不再注入（注入环只注入'等待中'），但保留历史
 */
export interface 约定状态变更事实 extends 变量事实来源元数据 {
  type: 'agreement_status';
  npcId?: string;
  npcName: string;
  /** 优先使用现有约定的稳定 ID；缺失时才允许标题兼容匹配。 */
  agreementId?: string;
  /** 缺少 agreementId 时匹配现有约定的标题（必须唯一） */
  title: string;
  /** 新状态 */
  新状态: '已履行' | '已违约' | '已作废';
  evidence?: string;
}

export type 变量事实 =
  | 旅人档案变量事实
  | 时间变量事实
  | 地点变量事实
  | 天气变量事实
  | NPC变量事实
  | 物品变量事实
  | 世界事件变量事实
  | 手机来信变量事实
  | NSFW档案变量事实
  | 约定变量事实
  | 约定状态变更事实;

export interface 变量事实批次 {
  facts: 变量事实[];
  parseErrors: string[];
}

export type 变量诊断阶段 =
  | 'request'
  | 'parse'
  | 'projection'
  | 'preflight'
  | 'reduce'
  | 'commit'
  | 'migration'
  | 'retention'
  | 'coverage'
  | 'history_repair';

export type 变量诊断严重性 = 'info' | 'warning' | 'error';

/** 不依附于某一条可执行命令的批次级诊断。 */
export interface 变量批次诊断 {
  code: string;
  severity: 变量诊断严重性;
  stage: 变量诊断阶段;
  message: string;
  factGroupId?: string;
  factIndex?: number;
  commandIndex?: number;
  entityKey?: string;
  root?: string;
  factSource?: 变量事实来源;
  sourceEvidenceId?: string;
}

/** 可审计的变量事实记录。事实本体与来源身份分开保存，供历史修复和幂等去重使用。 */
export interface 变量事实记录 {
  id: string;
  fingerprint: string;
  semanticFingerprint: string;
  type: 变量事实类型;
  fact: 变量事实;
  sourceTurn: number;
  sourceTurnId?: string;
  sourceMessageId?: string;
  factSource?: 变量事实来源;
  sourceEvidenceId?: string;
  factGroupId?: string;
  factIndex?: number;
  entityKey?: string;
  dependsOnFactGroupIds?: string[];
  evidence: Array<{
    text: string;
    textFingerprint?: string;
    startOffset?: number;
    endOffset?: number;
  }>;
  producedBy: 'normal' | 'coverage_review' | 'history_repair' | 'reroll';
}

/** 变量命令应用结果；没有对应命令的错误必须放入批次 diagnostics，而不是伪造命令。 */
export interface 变量命令结果 {
  command?: 变量命令;
  ok: boolean;
  kind?: 'command' | 'warning' | 'error' | 'rejected';
  stage?: 'preflight' | 'projection' | 'reduce' | 'commit';
  factGroupId?: string;
  factIndex?: number;
  entityKey?: string;
  /** 失败原因：路径未登记 / 类型不匹配 / 解析错误等 */
  reason?: string;
}

/** 一回合的变量命令批次（一次 AI 调用产出的所有命令 + 结果），存入命令历史。 */
export interface 变量命令批次 {
  id: string;
  /** v2 为历史存档输入；所有新建批次必须写 v3。 */
  schemaVersion?: 2 | 3;
  turn: number;
  /** 稳定回合身份；旧批次可能缺失，迁移时不得回退到最新 assistant。 */
  turnId?: string;
  targetMessageId?: string;
  targetUserMessageId?: string;
  associationStatus?: 'linked' | 'ambiguous' | 'unlinked';
  mode?: 变量处理模式;
  supersedesBatchId?: string;
  /** 修复/重 roll 批次的计划身份；同一计划只允许提交一次。 */
  repairPlanId?: string;
  /** 修复提交前的 state 指纹，用于并发修改检测。 */
  baseStateFingerprint?: string;
  /** 批次提交后 state 指纹，供回执与审计展示。 */
  stateFingerprint?: string;
  timestamp: number;
  /** 触发来源：'main' 主模型直接输出，'calibration' 变量模型二次校准 */
  source: 'main' | 'calibration';
  /** 单回合历史修复的证据身份；合并修复计划时使用 sourceEvidenceIds。 */
  sourceEvidenceId?: string;
  sourceEvidenceIds?: string[];
  /** 是否调用了变量模型（false = 主模型直接出，true = 走了二次校准） */
  modelName?: string;
  /** 本批次解析出的事实记录，保留来源与稳定指纹。 */
  facts?: 变量事实记录[];
  results: 变量命令结果[];
  /** 解析、投影、批次提交和旧数据迁移等不依附于单条命令的诊断。 */
  diagnostics?: 变量批次诊断[];
  /** 变量模型的额外报告（可选，用于调试展示） */
  report?: string;
  /** 正文覆盖审计：候选类别、初次事实类别、定向补写结果和仍未确认类别。 */
  coverage?: {
    candidateTypes: 变量事实类型[];
    initialTypes: 变量事实类型[];
    missingTypes: 变量事实类型[];
    reviewAttempted: boolean;
    supplementedTypes: 变量事实类型[];
    unresolvedTypes: 变量事实类型[];
  };
  /** 变量模型返回的原始文本，供「查看原始信息」面板展示。失败回执时为空。 */
  rawText?: string;
  /** 长期会话中的旧批次轻量摘要标记；用于避免每回合重复压缩同一批历史。 */
  retentionSummary?: {
    totalResults: number;
    succeededResults: number;
    diagnosticResults: number;
    omittedDiagnosticResults: number;
  };
}
