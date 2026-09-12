// 变量模型 service：用独立 API config 把正文交给轻量变量模型。
// 正常协议只要求 <变量事实> JSON；旧 <变量更新> 仅由解析器兼容。

import type { 提示词模块 } from '@/models/prompts';
import type { API配置项 } from '@/models/settings';
import type { 变量处理模式 } from '@/models/variableCommand';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { buildVariablePromptContractSection } from '@/utils/variablePromptContract';
import type { VariableState } from '@/utils/variableRegistry';

export interface VariableHistoryRepairEvidence {
  /** 证据来自哪条历史聊天消息，而不是当前 state。 */
  source: 'chat_history';
  userInput: string;
  body: string;
  variableDraft?: string;
}

export interface VariableModelPromptContext {
  mode?: 变量处理模式;
  sourceEvidenceId?: string;
  targetTurn?: number;
  targetTurnId?: string;
  targetMessageId?: string;
  targetUserMessageId?: string;
  historicalEvidence?: VariableHistoryRepairEvidence;
  protectedCurrentPaths?: string[];
  phoneSeedsEnabled?: boolean;
  maxPhoneSeedsPerTurn?: number;
  recallContextPresent?: boolean;
}

export interface VariableModelRequest {
  /** 主模型刚写完的正文（已抽出 <正文> 块，不带其他标签）。 */
  body: string;
  /** 主剧情模型输出的 <变量草稿>，只作为候选线索，不直接落库。 */
  variableDraft?: string;
  /** 玩家本回合的输入。 */
  userInput: string;
  turnCount: number;
  mode?: 变量处理模式;
  sourceEvidenceId?: string;
  targetTurn?: number;
  targetTurnId?: string;
  targetMessageId?: string;
  targetUserMessageId?: string;
  historicalEvidence?: VariableHistoryRepairEvidence;
  protectedCurrentPaths?: string[];
  state: VariableState;
  phoneSeedsEnabled?: boolean;
  maxPhoneSeedsPerTurn?: number;
  nsfwEnabled?: boolean;
  maleNsfwArchiveEnabled?: boolean;
  /** 历史通讯回忆只用于提取其中已经成立的 agreement。 */
  recallContext?: string;
  signal?: AbortSignal;
  retryCount?: number;
  /** 旧设置兼容字段；P3 起不再把变量世界书/COT/格式模块重复注入正常请求。 */
  promptModules?: 提示词模块[];
}

export interface VariableModelResult {
  /** 模型原始返回；正常协议只要求 <变量事实>，旧标签仍可被兼容解析。 */
  rawText: string;
  mode?: 变量处理模式;
  sourceEvidenceId?: string;
}

interface VariableProtocolCheck {
  ok: boolean;
  issues: string[];
}

/** 五段式 system prompt：身份、结构、当前对象、联动纪律、唯一输出协议。 */
export function buildVariableModelPrompt(
  state: VariableState,
  nsfwPolicy?: { enabled?: boolean; maleArchiveEnabled?: boolean },
  legacyPromptModules?: 提示词模块[],
  context?: VariableModelPromptContext,
): string {
  const nsfwEnabled = Boolean(nsfwPolicy?.enabled);
  const maleArchiveEnabled = Boolean(nsfwPolicy?.maleArchiveEnabled);

  // 内置变量世界书、COT、格式和伙伴档案模块继续留在旧设置中，但不再形成第二份模型规则。
  void legacyPromptModules;
  const contractSection = buildVariablePromptContractSection(state, {
    mode: context?.mode,
    phoneSeedsEnabled: context?.phoneSeedsEnabled,
    maxPhoneSeedsPerTurn: context?.maxPhoneSeedsPerTurn,
    nsfwEnabled,
    maleNsfwArchiveEnabled: maleArchiveEnabled,
  });
  const modePrompt = buildVariableModePrompt(context);

  return [
    '[1 身份]',
    '你是变量事实提取器，不续写剧情，不裁定剧情是否应该发生。',
    '主模型回复正文是事实权威；变量草稿只提供候选线索，当前状态只用于对象匹配和去重。',
    '只提取正文中已经发生、能够落入下方结构的事实。正文明确发生的合法事实不能因为措辞不同或缺少固定关键词而省略；正文未发生的内容不得猜测。',
    '',
    contractSection,
    '',
    '[4 联动纪律]',
    '- 可选字段省略表示不变或不适用；不要用 undefined、NaN、Infinity、函数、循环结构、空占位对象或通用 null 补位。',
    '- 同一对象的多个变化合并为一个 fact；数组只写本回合新增内容，代码负责去重、深合并和事实级原子提交。',
    '- 优先复用当前写入上下文中的 NPC、物品、联系人、会话和约定 ID；新对象 ID、来源、回合、时间戳、状态和派生字段由代码生成。',
    '- 不写底层路径命令，不写记忆、忆庭、智库、新闻、剧情编织、图片资源或手机完整消息。',
    '- evidence 是可选调试摘要，不是提交前置条件；sourceEvidenceId 和事实来源由代码注入。',
    modePrompt,
    ...(context?.recallContextPresent ? [
      '- 本次包含历史通讯回忆：它只能证明回忆中已经成立的 agreement，不能单独证明本回合的新约定、约定状态、时间、地点、天气或 NPC 变化。',
    ] : []),
    '',
    '[5 输出协议]',
    '只输出一个合法 JSON 的 <变量事实> 块，不要输出 Markdown 围栏、解释、thinking 或其他标签：',
    'facts 数组中的每个元素必须带同层的 "type" 字段，所有业务字段与 type 同层；不要使用 factType、fact_type、类型、payload 或 data 作为替代结构。',
    '<变量事实>',
    '{"facts":[]}',
    '</变量事实>',
  ].filter(Boolean).join('\n');
}

function buildVariableModePrompt(context?: VariableModelPromptContext): string {
  const mode = context?.mode ?? 'normal';
  const lines = [`- mode: ${mode}`];
  if (mode !== 'history_repair') return lines.join('\n');

  lines.push(
    '- history_repair 只从指定旧回合证据提取当时已发生的事实；当前 state 仅用于对象匹配、重复判断和冲突预览，不能反过来证明历史事实。',
    '- history_repair 不输出 time、location、weather、phone_seed，也不回拨 NPC 最近回合、互动次数、归档状态或联系人。',
    '- 历史修复结果仍由外部预览确认；模型只负责提取事实。',
  );
  if (context?.sourceEvidenceId) lines.push(`- 历史证据 ID：${context.sourceEvidenceId}`);
  if (context?.targetTurn !== undefined) lines.push(`- 目标旧回合：${context.targetTurn}`);
  if (context?.targetTurnId) lines.push(`- 目标回合身份：${context.targetTurnId}`);
  if (context?.targetMessageId) lines.push(`- 目标 AI 消息：${context.targetMessageId}`);
  if (context?.targetUserMessageId) lines.push(`- 目标玩家消息：${context.targetUserMessageId}`);
  if (context?.protectedCurrentPaths?.length) {
    lines.push(`- 当前状态保护路径：${context.protectedCurrentPaths.join('、')}`);
  }
  if (context?.historicalEvidence) {
    lines.push('- 历史证据正文、玩家输入和变量草稿已放在 user message；不得从当前 state 反推证据。');
  }
  return lines.join('\n');
}

/** 调用变量模型，返回原始文本（待 parseVariableFacts / parseVariableCommands 解析）。 */
export async function callVariableModel(
  config: API配置项,
  request: VariableModelRequest,
): Promise<VariableModelResult> {
  const systemPrompt = buildVariableModelPrompt(request.state, {
    enabled: request.nsfwEnabled,
    maleArchiveEnabled: request.maleNsfwArchiveEnabled,
  }, request.promptModules, {
    mode: request.mode,
    sourceEvidenceId: request.sourceEvidenceId,
    targetTurn: request.targetTurn,
    targetTurnId: request.targetTurnId,
    targetMessageId: request.targetMessageId,
    targetUserMessageId: request.targetUserMessageId,
    historicalEvidence: request.historicalEvidence,
    protectedCurrentPaths: request.protectedCurrentPaths,
    phoneSeedsEnabled: request.phoneSeedsEnabled,
    maxPhoneSeedsPerTurn: request.maxPhoneSeedsPerTurn,
    recallContextPresent: Boolean(request.recallContext?.trim()),
  });

  const isHistoryRepair = request.mode === 'history_repair';
  const targetTurn = request.targetTurn ?? request.turnCount;
  const userMessage = [
    isHistoryRepair ? `历史修复目标：第 ${targetTurn} 回合` : `第 ${request.turnCount} 回合`,
    ...(isHistoryRepair ? [
      '这是指定旧回合证据的重解析。当前对象视图只用于匹配，不能作为历史事实证据。',
      `历史证据 ID：${request.sourceEvidenceId ?? '未提供'}`,
      `目标 AI 消息：${request.targetMessageId ?? '未提供'}`,
    ] : []),
    '',
    '玩家输入：',
    request.userInput || '（无）',
    '',
    '变量草稿（候选线索，不是命令）：',
    request.variableDraft?.trim() || '（无）',
    '',
    '主模型回复正文：',
    request.body,
    '',
    '只按主模型回复正文中已经发生的事实输出 <变量事实> JSON。变量草稿可以补充检索线索，但不覆盖正文。',
    request.phoneSeedsEnabled === false
      ? '本次 phone_seed 已关闭。'
      : `本次 phone_seed 上限 ${Math.max(0, Math.trunc(request.maxPhoneSeedsPerTurn ?? 2))} 条；没有明确通讯入口就写 0 条。`,
    '没有任何可落库事实时输出 <变量事实>{"facts":[]}</变量事实>。',
    ...(isHistoryRepair ? [
      '历史修复只输出该旧回合证据支持的 facts；不要输出 time、location、weather、phone_seed，也不要从当前 state 补写猜测。',
    ] : []),
  ].join('\n');

  const recallContextText = request.recallContext?.trim();
  const finalUserMessage = recallContextText
    ? `${userMessage}\n\n历史通讯回忆（只用于提取其中已经成立的 agreement，不代表本回合发生）：\n${recallContextText}`
    : userMessage;

  const requestOnce = (messages: Array<{ role: string; content: string }>) =>
    chatCompletionNonStream(config, {
      messages,
      systemPrompt,
      signal: request.signal,
      maxTokens: config.maxTokens ?? 3200,
      temperature: config.temperature ?? 0.25,
    });

  let rawText = await withRetries(
    () => requestOnce([{ role: 'user', content: finalUserMessage }]),
    { retries: request.retryCount ?? 0, signal: request.signal, label: '变量模型' },
  );

  const protocol = checkVariableModelProtocol(rawText);
  if (!protocol.ok) rawText = ensureVariableProtocolFallback(rawText);

  return { rawText, mode: request.mode, sourceEvidenceId: request.sourceEvidenceId };
}

function checkVariableModelProtocol(rawText: string): VariableProtocolCheck {
  const issues: string[] = [];
  if (!/<变量事实>[\s\S]*?<\/变量事实>/i.test(rawText)) issues.push('缺少 <变量事实>');
  return { ok: issues.length === 0, issues };
}

function ensureVariableProtocolFallback(rawText: string): string {
  if (/<变量事实>[\s\S]*?<\/变量事实>/i.test(rawText)) return rawText;
  const prefix = rawText.trim();
  return [
    prefix,
    '<变量事实>',
    '{"facts":[]}',
    '</变量事实>',
  ].filter(Boolean).join('\n');
}
