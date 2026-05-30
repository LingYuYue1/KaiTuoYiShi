export type 消息角色 = 'user' | 'assistant' | 'system';

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
}

export interface 聊天消息 {
  id: string;
  role: 消息角色;
  content: string;
  timestamp: number;
  gameTime?: string;
  parsedResponse?: 解析后回复;
  inputTokens?: number;
  outputTokens?: number;
  responseDurationSec?: number;
  isStreaming?: boolean;
  debugContext?: {
    systemPrompt: string;
    messages: Array<{ role: 消息角色; content: string }>;
    recallPreview?: string;
    zhikuRecallPreview?: string;
  };
  /** 该 AI 回复对应的「user 发送前」状态快照，用于 reroll 回滚。
   *  生成新 assistant message 时会清掉上一条的 snapshot，保证存档里至多只有最新一条带 snapshot。 */
  preTurnSnapshot?: 回合快照;
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
