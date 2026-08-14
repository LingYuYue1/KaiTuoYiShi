// 由 docs/plans/chatCompletionClient-deepclean-slim.md S7 拆分生成。
import type { API配置项 } from '@/models/settings';
import { devLog } from '@/utils/devLog';
import type { ChatCompletionRequest, CompatibleStreamTextState, StreamCallbacks } from './chatCompletionTypes';
import { emitUsageFromResponse } from './chatCompletionUsage';

export function parseClaudeTextResponse(json: unknown): string {
  const data = json as { content?: Array<{ type?: string; text?: string } | null> };
  return (data.content ?? [])
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part?.text ?? '')
    .join('');
}

function hasReasoningPayload(value: unknown, depth = 0): boolean {
  if (depth > 8 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasReasoningPayload(item, depth + 1));
  const record = value as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : '';
  if (record.thought === true || /^(thinking|reasoning|thinking_delta|reasoning_delta)$/i.test(type)) return true;
  for (const [key, child] of Object.entries(record)) {
    if (/^(reasoning(?:_content)?|thinking(?:_content)?)$/i.test(key) && child !== null && child !== undefined && child !== '') return true;
    if (hasReasoningPayload(child, depth + 1)) return true;
  }
  return false;
}

function readCompatibleTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => readCompatibleTextContent(part))
      .join('');
  }
  if (!content || typeof content !== 'object') return '';
  const part = content as Record<string, any>;
  const type = typeof part.type === 'string' ? part.type : '';
  if (part.thought === true || /^(thinking|reasoning|thinking_delta|reasoning_delta)$/i.test(type)) {
    return '';
  }
  if (typeof part.text === 'string') return part.text;
  if (typeof part.output_text === 'string') return part.output_text;
  if (typeof part.content === 'string') return part.content;
  if (Array.isArray(part.content)) return readCompatibleTextContent(part.content);
  return '';
}

// 顺序即优先级，与原 a || b || c 链一致，不得调整。
const DELTA_TEXT_EXTRACTORS: Array<(parsed: Record<string, any>) => string> = [
  (p) => readCompatibleTextContent(p.choices?.[0]?.delta?.content),
  (p) => readCompatibleTextContent(p.choices?.[0]?.delta?.text),
  (p) => readCompatibleTextContent(p.choices?.[0]?.text),
  (p) => readCompatibleTextContent(p.delta?.text),
  (p) => readCompatibleTextContent(p.delta?.content),
  (p) => readCompatibleTextContent(p.delta),
  (p) => parseOpenCodeGeminiText(p),
  (p) => readCompatibleTextContent(p.output_text),
  (p) => readCompatibleTextContent(p.text),
  (p) => readCompatibleTextContent(p.content),
];

export function readOpenAICompatibleStreamDelta(parsed: any, state: CompatibleStreamTextState): string {
  // 状态由 runSseStream 持有；别名规避 no-param-reassign 的属性赋值规则。
  const streamState = state;
  if (hasReasoningPayload(parsed)) streamState.sawReasoning = true;
  if (parsed?.type === 'content_block_start') {
    const blockType = parsed.content_block?.type;
    streamState.currentBlockIsThinking = blockType === 'thinking' || blockType === 'reasoning';
    if (streamState.currentBlockIsThinking) return '';
    return readCompatibleTextContent(parsed.content_block?.text ?? parsed.content_block?.content ?? parsed.content_block);
  }
  if (parsed?.type === 'content_block_delta') {
    const deltaType = parsed.delta?.type;
    if (deltaType === 'thinking_delta' || deltaType === 'reasoning_delta' || streamState.currentBlockIsThinking) return '';
    return readCompatibleTextContent(parsed.delta?.text ?? parsed.delta?.content ?? parsed.delta);
  }
  if (parsed?.type === 'content_block_stop') {
    streamState.currentBlockIsThinking = false;
    return '';
  }
  if (
    parsed?.type === 'response.output_text.delta' ||
    parsed?.type === 'response.text.delta' ||
    parsed?.type === 'response.content_part.delta'
  ) {
    return readCompatibleTextContent(parsed.delta?.text ?? parsed.delta ?? parsed.text);
  }

  const choice = parsed?.choices?.[0];
  const delta = choice?.delta;
  if (delta?.type === 'thinking_delta' || delta?.type === 'reasoning_delta' || delta?.thought === true) {
    return '';
  }
  for (const extract of DELTA_TEXT_EXTRACTORS) {
    const text = extract(parsed);
    if (text) return text;
  }
  return '';
}

/** 从 SSE chunk / 非流式 JSON 中提取 finish_reason / stop_reason / finishReason。
 *  不同 provider 字段名不同：
 *  - OpenAI 兼容: choices[0].finish_reason
 *  - Claude: message_delta.delta.stop_reason (SSE) 或顶层 stop_reason (非流式)
 *  - Gemini: candidates[0].finishReason (camelCase)
 *  返回 undefined 表示该 chunk 无 finish_reason 或无法识别。 */
function readFinishReason(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const data = parsed as {
    choices?: Array<{ finish_reason?: unknown }>;
    type?: string;
    delta?: { stop_reason?: unknown };
    stop_reason?: unknown;
    candidates?: Array<{ finishReason?: unknown }>;
  };
  // OpenAI 兼容：choices[0].finish_reason
  const choice = data.choices?.at(0);
  if (choice && typeof choice.finish_reason === 'string' && choice.finish_reason) {
    return choice.finish_reason;
  }
  // Claude SSE: message_delta.delta.stop_reason
  if (data.type === 'message_delta') {
    const stopReason = data.delta?.stop_reason;
    if (typeof stopReason === 'string' && stopReason) return stopReason;
  }
  // Claude 非流式: stop_reason
  if (typeof data.stop_reason === 'string' && data.stop_reason) {
    return data.stop_reason;
  }
  // Gemini: candidates[0].finishReason
  const candidate = data.candidates?.at(0);
  if (candidate && typeof candidate.finishReason === 'string' && candidate.finishReason) {
    return candidate.finishReason;
  }
  return undefined;
}

export function parseOpenAICompatibleTextResponse(json: unknown): string {
  const data = json as {
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
    message?: { content?: unknown };
    output_text?: unknown;
    text?: unknown;
    content?: unknown;
  };
  const choice = data.choices?.at(0);
  return (
    readCompatibleTextContent(choice?.message?.content) ||
    readCompatibleTextContent(choice?.text) ||
    readCompatibleTextContent(data.message?.content) ||
    parseClaudeTextResponse(json) ||
    parseOpenCodeResponsesText(json) ||
    parseOpenCodeGeminiText(json) ||
    readCompatibleTextContent(data.output_text) ||
    readCompatibleTextContent(data.text) ||
    readCompatibleTextContent(data.content)
  );
}

export function reportOpenAICompatibleDiagnostics(
  json: unknown,
  text: string,
  config: API配置项,
  request: ChatCompletionRequest,
): void {
  request.onResponseDiagnostics?.({
    sawReasoning: hasReasoningPayload(json),
    sawVisibleContent: text.trim().length > 0,
    finishReason: readFinishReason(json),
    selectedModel: config.model,
  });
}

// ── 通用 SSE 流式读取骨架（7 个流式函数共用） ──
/** 7 个流式函数的公共 SSE 解析骨架：切行、data: 过滤、[DONE] 跳过、畸形行计数、usage/delta/finishReason 采集。
 *  供应商差异只保留 extractText（delta 提取）与 provider（devLog 标签）两个点。 */
async function readSseTextStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: {
    provider: string;
    config: API配置项;
    request: ChatCompletionRequest;
    extractText: (parsed: unknown) => string;
    onDelta: (text: string) => void;
    onFinishReason?: (reason: string) => void;
  },
): Promise<string> {
  const { provider, config, request, extractText, onDelta, onFinishReason } = options;
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let skippedMalformedLines = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        let parsed: ReturnType<JSON['parse']>;
        try {
          parsed = JSON.parse(data);
        } catch {
          // 仅跳过畸形 JSON 行；后续处理逻辑的异常必须上抛暴露。
          skippedMalformedLines += 1;
          continue;
        }
        emitUsageFromResponse(parsed, config, request);
        const text = extractText(parsed);
        if (text) {
          fullText += text;
          onDelta(text);
        }
        const fr = readFinishReason(parsed);
        if (fr) onFinishReason?.(fr);
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (skippedMalformedLines > 0) {
    devLog('net', 'sse-skip-malformed-lines', { provider, count: skippedMalformedLines });
  }
  return fullText;
}

export /** 流式尾部统一执行器：读 reader、跨 chunk 状态、统一诊断上报（D1）、onDone。 */
async function runSseStream(
  response: Response,
  options: {
    provider: string;
    config: API配置项;
    request: ChatCompletionRequest;
    callbacks: StreamCallbacks;
    extractText: (parsed: any, state: CompatibleStreamTextState) => string;
  },
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  const state: CompatibleStreamTextState = { currentBlockIsThinking: false, sawReasoning: false };
  let finishReason: string | undefined;
  const fullText = await readSseTextStream(reader, {
    provider: options.provider,
    config: options.config,
    request: options.request,
    extractText: (parsed) => options.extractText(parsed, state),
    onDelta: (text) => options.callbacks.onDelta(text),
    onFinishReason: (fr) => {
      finishReason = fr;
      options.callbacks.onFinishReason?.(fr);
    },
  });
  options.request.onResponseDiagnostics?.({
    sawReasoning: state.sawReasoning,
    sawVisibleContent: fullText.trim().length > 0,
    finishReason,
    selectedModel: options.config.model,
  });
  options.callbacks.onDone();
  return fullText;
}

export function parseOpenCodeResponsesText(json: unknown): string {
  const data = json as {
    output_text?: string;
    text?: string;
    choices?: Array<{ message?: { content?: string } }>;
    output?: Array<{
      content?: Array<{ type?: string; text?: string; content?: string } | null>;
    }>;
  };
  if (typeof data.output_text === 'string') return data.output_text;
  if (typeof data.text === 'string') return data.text;
  const fromOutput = (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part?.type === 'output_text' || part?.type === 'text' || typeof part?.text === 'string')
    .map((part) => part?.text ?? part?.content ?? '')
    .join('');
  if (fromOutput) return fromOutput;
  return readCompatibleTextContent(data.choices?.[0]?.message?.content);
}

export function parseOpenCodeGeminiText(json: unknown): string {
  const data = json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
  return (data.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('');
}
