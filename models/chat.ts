import type { NPC账本选择结果 } from './npc';

export type 消息角色 = 'user' | 'assistant' | 'system';

/** 工作包C：主剧情消息模式（finalizer 运行时派生，不写入存档）。
 *  standard / cot_pseudo / deepseek_standard / deepseek_prefix / tavern_v2。 */
export type 主剧情消息模式 =
  | 'standard'
  | 'cot_pseudo'
  | 'deepseek_standard'
  | 'deepseek_prefix'
  | 'tavern_v2';

/** 「本回合 user 发送之前」的变量切片快照。挂在 assistant message 上，用于 reroll 时回滚。
 *  保留方式：只在最近一条 assistant message 上持久化，生成新 assistant 时清掉上一条的 snapshot，
 *  避免存档体积无限膨胀。所有切片都是引用拷贝（浅拷贝顶层数组对象足够，state 内部不可变）。 */
export interface 回合快照 {
  旅人: unknown;
  世界: unknown;
  记忆: unknown;
  忆庭?: unknown;
  智库?: unknown;
  手机?: unknown;
  NPC: unknown[];
  相册?: unknown;
  新闻: unknown[];
  剧情: unknown[];
  剧情编织?: unknown;
  variableBatches: unknown[];
  queueTasks?: unknown[];
  turnCount: number;
  pendingOpeningTrigger?: string | null;
  /**
   * 回合前的 gameSettings 运行时字段（宏全局变量 / 世界书触发状态）。
   * 只保存严格限定字段，不复制 API Key 等无关设置进每条消息快照。
   * 重 Roll / 失败 / 中止恢复时，仅成功提交的回合才消费 cooldown/delay 与宏变量变化。
   */
  gameSettingsTurnState?: {
    macroGlobalVars?: Record<string, string>;
    worldbookTriggerStates?: Record<string, number>;
  };
}

export interface 聊天消息 {
  id: string;
  /** 稳定的 user → assistant 回合身份。旧存档缺少时保持 undefined，由迁移/诊断逻辑处理。 */
  turnId?: string;
  role: 消息角色;
  content: string;
  timestamp: number;
  gameTime?: string;
  parsedResponse?: 解析后回复;
  inputTokens?: number;
  outputTokens?: number;
  tokenUsage?: 回合Token消耗;
  responseDurationSec?: number;
  isStreaming?: boolean;
  debugContext?: {
    systemPrompt: string;
    messages: Array<{ role: 消息角色; content: string }>;
    requestHash?: string;
    requestCapabilities?: {
      transport: string;
      endpoint: string;
      depthInjection: 'messages' | 'system';
      mergesSystemMessages: boolean;
      supportsAssistantPrefill: boolean;
      streaming: boolean;
      mode: 主剧情消息模式;
      prefixRequested: boolean;
      prefixApplied: boolean;
    };
    recallPreview?: string;
    recallSummary?: string;
    recallFullContent?: string;
    deepSeekMainMode?: 'off' | 'standard' | 'lock_format';
    deepSeekCotFakeHistorySkipped?: boolean;
    deepSeekPrefixMode?: boolean;
    deepSeekProtocolIssues?: string[];
    deepSeekMainOriginalModel?: string;
    deepSeekMainAdaptedModel?: string;
    stV2Attempted?: boolean;
    stV2Used?: boolean;
    stV2FallbackReason?: string;
    playerSpeechCorrections?: Array<{
      code: 'inline_tag_split' | 'sound_effect_reassigned' | 'unsupported_player_line_reassigned';
      lineIndex: number;
    }>;
    rerollSimilarity?: number;
    rerollSimilarityRetried?: boolean;
    cachePrefixDiagnostics?: 缓存前缀诊断;
    mainRequestMode?: 'stream' | 'non-stream';
    yitingRecallPreview?: string;
    yitingRecallRawText?: string;
    yitingRecallUsedModel?: boolean;
    zhikuRecallPreview?: string;
    zhikuRecallInjection?: string;
    zhikuRecallRawText?: string;
    zhikuRecallUsedModel?: boolean;
    npcLedgerInjection?: {
      selectedNames: string[];
      skippedNames: Array<{ name: string; reason: string }>;
      injected: Array<{
        name: string;
        reason: string[];
        fields: string[];
        hasRecentInteraction: boolean;
        hasMustRemember: boolean;
        hasUnresolvedItems: boolean;
      }>;
    };
    npcLedgerUpdate?: {
      updatedNames: string[];
      memoryAppended: string[];
      ledgerFieldsUpdated: string[];
      summaryTriggered: string[];
      warnings: string[];
    };
    npcLedgerSelectionRaw?: NPC账本选择结果;
  };
  /** 该 AI 回复对应的「user 发送前」状态快照，用于 reroll 回滚。
   *  生成新 assistant message 时会清掉上一条的 snapshot，保证存档里至多只有最新一条带 snapshot。 */
  preTurnSnapshot?: 回合快照;
  /** 本回合的故事快照（由正文生图后台生成完成后填充） */
  narrativeImages?: 叙事插图[];
}

export interface 叙事插图 {
  /** 唯一 ID */
  id: string;
  /** 图片数据 URL */
  dataUrl: string;
  /** 底层图片槽位：场景 / 角色。正文生图固定作为故事快照展示。 */
  type: 'scene' | 'character';
  /** 语义类型：用于把正文生图从普通场景图中区分出来。 */
  kind?: 'snapshot' | 'scene' | 'character';
  /** 生成用的提示词 */
  prompt: string;
  /** 负面提示词 */
  negativePrompt?: string;
  /** 中文描述（用于卡片标题） */
  description?: string;
  /** 生成状态 */
  status: 'generating' | 'done' | 'failed';
  /** 错误信息 */
  error?: string;
  /** 关联的相册资源 ID */
  assetId?: string;
}

export interface 缓存前缀诊断 {
  currentPromptTokens: number;
  previousPromptTokens?: number;
  commonPrefixChars: number;
  commonPrefixTokens: number;
  commonPrefixRate: number;
  firstDiffCurrentSection: string;
  firstDiffPreviousSection?: string;
  firstDiffCurrentExcerpt: string;
  firstDiffPreviousExcerpt?: string;
  changedTailTokens: number;
  largestChangedSections: Array<{
    label: string;
    tokens: number;
  }>;
}

export interface 回合Token消耗 {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  uncachedTokens?: number;
  cacheHitRate?: number;
  source: 'api' | 'estimate' | 'mixed';
  provider?: string;
  model?: string;
  usageFormat?: string;
  usagePath?: string;
  rawUsageKeys?: string[];
  cacheDiagnostic?: string;
  rawUsage?: unknown;
}

export interface 解析后回复 {
  thinking: string;
  body: string;
  memory: string;
  commands: Record<string, unknown>;
  worldEvents: string[];
  /** 由 <行动选项> 标签生成的可点选行动列表，最多 4 条。空数组表示本回合 AI 没给行动选项。 */
  actionOptions: string[];
  /** 主剧情模型输出的低风险变量候选事实。不是最终命令，只给变量模型作为线索。 */
  variableDraft: string;
  /** 主剧情模型输出的后续承接备忘。用于下一回合接续伏笔、强制承接、延后/受阻项和镜头余波。 */
  storyPlan: string;
  /** 剧情推进申报（《剧情规划》内 <剧情推进> 子块）：AI 主动声明本分段完成情况与目标分段。 */
  storyAdvance?: {
    completed: boolean;
    targetSegment?: string;
    basis?: string;
  };
  /** AI 在主流程中发出的「命途狭间」邀请。内容为命途 ID(hunt/destruction/...)。
   *  非空时 sendWorkflow 会写入 世界状态.待触发狭间,并在聊天区渲染一张邀请卡片。 */
  awakenInvite: string;
  /** 进行中狭间回合 AI 出的三道题。内容为整段 raw 文本(多行 命途:/题1:/题2:/题3:),由 UI 渲染。 */
  awakenQuestions: string;
  /** 玩家答完狭间问题后,下一回合 AI 给出的升阶回应。当前版本只解析升阶；兼容旧历史消息时仍保留字符串。 */
  awakenJudgement: string;
  /** 出题/评判回合对应的命途 ID。由 sendWorkflow 在 aiMsg 落库前根据 effectiveWorld.进行中狭间 写入,
   *  让 TurnItem 即便在 进行中狭间 已被清空后(评判落地后会清空)也能拿到命途名做美化。 */
  awakenPathId: string;
  rawText: string;
}

export function 创建空解析回复(): 解析后回复 {
  return {
    thinking: '',
    body: '',
    memory: '',
    commands: {},
    worldEvents: [],
    actionOptions: [],
    variableDraft: '',
    storyPlan: '',
    awakenInvite: '',
    awakenQuestions: '',
    awakenJudgement: '',
    awakenPathId: '',
    rawText: '',
  };
}

let messageCounter = 0;

export function 创建聊天消息(
  role: 消息角色,
  content: string,
  extra?: Partial<聊天消息>,
): 聊天消息 {
  return {
    id: `msg_${Date.now()}_${++messageCounter}`,
    role,
    content,
    timestamp: Date.now(),
    ...extra,
  };
}
