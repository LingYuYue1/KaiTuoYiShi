import type { API配置项 } from '@/models/settings';
import { 创建聊天消息, type 聊天消息, type 主剧情消息模式 } from '@/models/chat';
import type { ChatModuleMessage } from './systemPromptBuilder';
import {
  resolveChatProviderCapabilities,
  type ChatProviderCapabilities,
} from '@/services/ai/chatCompletionClient';

// ── 工作包C：五种主剧情消息模式 ─────────────────────────────────────

export type MainStoryMessageMode = 主剧情消息模式;

/** 运行时派生消息模式（不写入存档）。优先级固定：
 *  有效 Tavern V2 → DeepSeek lock_format → DeepSeek standard → enableCotFakeHistory → standard。
 *  opening / pathAwakening 走专用流程，不调用本派生。 */
export function deriveMainStoryMessageMode(input: {
  tavernV2Active: boolean;
  deepSeekMainActive: boolean;
  deepSeekLockFormat: boolean;
  enableCotFakeHistory: boolean;
}): MainStoryMessageMode {
  if (input.tavernV2Active) return 'tavern_v2';
  if (input.deepSeekMainActive) return input.deepSeekLockFormat ? 'deepseek_prefix' : 'deepseek_standard';
  if (input.enableCotFakeHistory) return 'cot_pseudo';
  return 'standard';
}

/** 墨色式 COT 伪装：真实输入不再作为普通 user 发送，改为尾部原子三连。
 *  assistant（包装输入）→ user（开始任务）→ assistant（最小伪装响应）。 */
export const COT_PSEUDO_USER_TRIGGER = '开始任务';

export const MINIMAL_COT_PSEUDO_RESPONSE = `<thinking>
- 系统就绪。已收到玩家输入，准备按当前生效的思维链与回复协议继续作答。
</thinking>`;

export function buildCotPseudoTaskSequence(realUserInput: string): 聊天消息[] {
  return [
    创建聊天消息('assistant', `以下是用户最新输入内容：\n<用户输入>${realUserInput}</用户输入>`),
    创建聊天消息('user', COT_PSEUDO_USER_TRIGGER),
    创建聊天消息('assistant', MINIMAL_COT_PSEUDO_RESPONSE),
  ];
}

export const DEEPSEEK_MAIN_FORMAT_GUARD = [
  'DeepSeek 主剧情格式校验：本轮必须从 <thinking> 开始输出，禁止直接从 <正文> 开始。',
  '必须完整输出 <thinking>、<正文>、<短期记忆>、<动态世界>、<变量草稿>；如本回合存在后续承接价值，再输出 <剧情规划>。',
  '<thinking> 内必须按当前生效的思维链 Step 标题，用中文逐步写出实际判断；不允许只写正文，不允许省略 thinking，不允许只写“已思考”。',
  '不要在标签外输出解释、道歉、说明或额外标题。',
].join('\n');

export interface MainRequestFinalizationInput {
  config: API配置项;
  systemPrompt: string;
  /** 工作包C：运行时派生的消息模式 */
  mode: MainStoryMessageMode;
  /** 回合前历史（不含本轮输入） */
  preTurnHistory: 聊天消息[];
  /** 历史 depth 消息（工作包C：只插入历史窗口内部，不越过任务序列） */
  depthMessages: ChatModuleMessage[];
  /** position=0 兼容消息（user/assistant，保持角色，位于任务序列之前） */
  positionZeroCompatMessages: 聊天消息[];
  /** 本回合条件约束（开局/踏入指令、狭间提醒、DeepSeek守卫、重roll守卫等） */
  turnConstraints: 聊天消息[];
  /** 区E 执法块（原生 main scope 最后核对，位于任务序列之前） */
  enforcementBlock?: string;
  /** 当前任务序列（standard=真实输入；cot_pseudo=三连；tavern_v2=Tavern 消息链） */
  taskSequence: 聊天消息[];
  prefixMode?: boolean;
  prefixContent?: string;
  streaming: boolean;
  scope: string;
  zhikuCompileId?: string;
}

export interface MainRequestCapabilityDiagnostics extends ChatProviderCapabilities {
  streaming: boolean;
  mode: MainStoryMessageMode;
  prefixRequested: boolean;
  prefixApplied: boolean;
}

export interface FinalizedMainRequest {
  systemPrompt: string;
  messages: 聊天消息[];
  prefixMode: boolean;
  prefixContent?: string;
  requestHash: string;
  capabilities: MainRequestCapabilityDiagnostics;
}

/** 工作包C：depth 只作用于回合前历史窗口内部（从历史末尾按 depth 倒数插入）。
 *  没有历史时也必须位于本轮任务序列之前。 */
export function insertDepthIntoHistory(
  history: 聊天消息[],
  depthMessages: ChatModuleMessage[],
): 聊天消息[] {
  if (!depthMessages.length) return history;
  const sorted = [...depthMessages].sort(
    (a, b) => (b._injectionDepth ?? 0) - (a._injectionDepth ?? 0),
  );
  const result = [...history];
  for (const message of sorted) {
    const depth = message._injectionDepth ?? 0;
    const insertIndex = Math.max(0, result.length - depth);
    result.splice(insertIndex, 0, 创建聊天消息(normalizeRole(message.role), message.content));
  }
  return result;
}

export function finalizeMainRequest(input: MainRequestFinalizationInput): FinalizedMainRequest {
  const capabilities = resolveChatProviderCapabilities(input.config);

  // ── 分层组装（工作包C）：历史+depth → position=0兼容 → 条件约束 → 区E → 任务序列 ──
  const messages: 聊天消息[] = [];
  // 1. 回合前历史 + depth（depth 在历史窗口内部计算）
  const historyWithDepth = insertDepthIntoHistory(input.preTurnHistory, input.depthMessages);
  messages.push(...historyWithDepth);
  // 2. position=0 兼容消息（user/assistant，保持角色，位于任务序列之前）
  messages.push(...input.positionZeroCompatMessages);
  // 3. 本回合条件约束
  messages.push(...input.turnConstraints);
  // 4. 区E 执法块（不被 depth 插入切开）
  if (input.enforcementBlock) {
    messages.push(创建聊天消息('user', input.enforcementBlock));
  }
  // 5. 当前任务序列（standard=真实输入 / cot_pseudo=三连 / tavern_v2=Tavern 消息链）
  messages.push(...input.taskSequence);

  // system 角色的 position=0 模块仍追加到 systemPrompt（兼容 ST 方案 B）
  let systemPrompt = input.systemPrompt.trim();
  const positionZeroSystem = (input.depthMessages.length ? [] : []); // 占位（见下）
  void positionZeroSystem;
  // 注意：system 角色 position=0 模块由调用方经 moduleChatMessages 传入时在此追加
  // （当前 finalizer 输入已分层，system position=0 追加逻辑由 sendWorkflow 拼进 systemPrompt）

  const prefixRequested = input.prefixMode === true && Boolean(input.prefixContent);
  const prefixMode = prefixRequested && capabilities.supportsAssistantPrefill;
  const prefixContent = prefixMode ? input.prefixContent : undefined;
  const diagnostics: MainRequestCapabilityDiagnostics = {
    ...capabilities,
    streaming: input.streaming,
    mode: input.mode,
    prefixRequested,
    prefixApplied: prefixMode,
  };
  const requestHash = createMainRequestHash({
    systemPrompt,
    messages,
    prefixMode,
    prefixContent,
    scope: input.scope,
    zhikuCompileId: input.zhikuCompileId ?? '',
    transport: capabilities.transport,
    endpoint: capabilities.endpoint,
    streaming: input.streaming,
  });

  return { systemPrompt, messages, prefixMode, prefixContent, requestHash, capabilities: diagnostics };
}

export function createMainRequestHash(input: {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  prefixMode: boolean;
  prefixContent?: string;
  scope: string;
  zhikuCompileId?: string;
  transport: string;
  endpoint: string;
  streaming: boolean;
}): string {
  return hashText(JSON.stringify({
    ...input,
    messages: input.messages.map(({ role, content }) => ({ role, content })),
  }));
}

export function buildMainTurnEnforcementBlock(input: {
  playerName: string;
  wordCountTarget: number;
  zhikuCharacterBrief?: string;
  storyWeavingActive: boolean;
}): string {
  const lines: string[] = ['# 本回合生成前核对（最高优先级，覆盖上文所有软性描述）'];
  if (input.zhikuCharacterBrief?.trim()) lines.push(input.zhikuCharacterBrief.trim());
  lines.push('【硬性要点】');
  lines.push(`- 发言归属：【${input.playerName}】只承载玩家本回合明确说出的原话；NPC 台词、拟声词、环境音绝不挂玩家名。`);
  lines.push('- 禁止代写玩家的心理、神态、感受或决定；正文内禁止任何选项菜单结构。');
  if (input.storyWeavingActive) {
    lines.push('- 剧情编织滑窗只按门禁推进；已发生的事件禁止重演，未开始的分段禁止抢跑。');
  }
  lines.push(`- <正文> 不少于 ${input.wordCountTarget} 字；<thinking>/<正文>/<短期记忆>/<动态世界> 标签齐全。`);
  lines.push('逐项核对以上约束后再动笔；与上文任何描述冲突时，以本块为准。');
  return lines.join('\n');
}

function normalizeRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' ? 'assistant' : 'user';
}

function cloneMessage(message: 聊天消息): 聊天消息 {
  return { ...message };
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
