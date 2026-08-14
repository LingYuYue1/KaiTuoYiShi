// 由 docs/plans/chatCompletionClient-deepclean-slim.md S7 拆分生成。
import type { DeepSeekAttemptDiagnostics, DeepSeekRecoverySummary } from './deepSeekRecovery';
import type { 回合Token消耗 } from '@/models/chat';

export interface StreamCallbacks {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  /** 可选：stream 解析到 finish_reason / stop_reason / finishReason 时回调。
   *  用于抗截断检测（finishReason === 'length' / 'max_tokens' 表示被 max_tokens 截断）。 */
  onFinishReason?: (reason: string) => void;
}

export /** 丢弃模型的 reasoning_content / extended thinking / Gemini thought parts。
 *  这类「reasoning summary」是厂商内置格式（英文 **Header** 段），不受 system prompt 控制，
 *  会跳过我们设计的 Step0-Step10 CoT。统一只接收正式 content 流。 */
type ChatMessagePayload = { role: string; content: string; prefix?: boolean };


export interface ChatCompletionRequest {
  messages: ChatMessagePayload[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** 核采样概率阈值（0-1）。 */
  topP?: number;
  /** 保留概率最高的前 K 个候选词。仅 Gemini 原生消费。 */
  topK?: number;
  /** 动态阈值采样。当前预留，无 provider 实际消费。 */
  topA?: number;
  /** 丢弃概率低于「最高概率 × min_p」的词（0-1）。当前预留。 */
  minP?: number;
  /** 重复惩罚系数（1=不生效，>1 惩罚）。 */
  repetitionPenalty?: number;
  /** 按 token 出现次数线性惩罚（-2 到 2）。 */
  frequencyPenalty?: number;
  /** 只要出现过就惩罚（-2 到 2）。 */
  presencePenalty?: number;
  /** 最大上下文窗口（tokens）。 */
  maxContext?: number;
  signal?: AbortSignal;
  onUsage?: (usage: ChatCompletionUsage) => void;
  /** DeepSeek beta prefix completion. Only the DeepSeek branch reads this flag. */
  prefixMode?: boolean;
  /** Assistant prefill used when prefixMode is true. */
  prefixContent?: string;
  /** Connection diagnostics can disable cross-model recovery. */
  deepSeekRecovery?: 'auto' | 'disabled';
  onDeepSeekRecovery?: (summary: DeepSeekRecoverySummary) => void;
  /** Internal transport diagnostics consumed by the recovery coordinator. */
  onResponseDiagnostics?: (diagnostics: DeepSeekAttemptDiagnostics) => void;
}

export type ChatCompletionUsage = Partial<Omit<回合Token消耗, 'source'>> & {
  source: 'api';
};

export type CompatibleStreamTextState = {
  currentBlockIsThinking: boolean;
  sawReasoning: boolean;
};

export type UsageLike = Record<string, any>;
