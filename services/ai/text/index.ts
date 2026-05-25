import type { API配置项 } from '@/models/settings';
import type { 聊天消息 } from '@/models/chat';
import { chatCompletion, chatCompletionNonStream, type StreamCallbacks } from '@/services/ai/chatCompletionClient';
import { parseResponse } from '@/services/ai/responseParser';
import type { 解析后回复 } from '@/models/chat';

export interface ChatRequest {
  messages: 聊天消息[];
  systemPrompt: string;
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
  streaming?: boolean;
  /** 是否启用标签修复（解析前先 repairTags）。默认 false。 */
  repairTags?: boolean;
}

export interface ChatResult {
  fullText: string;
  parsed: 解析后回复;
}

export async function sendChatMessage(
  config: API配置项,
  request: ChatRequest,
): Promise<ChatResult> {
  const useStream = request.streaming !== false;
  const apiMessages = request.messages.map((m) => ({ role: m.role, content: m.content }));

  let fullText: string;
  if (useStream) {
    const callbacks: StreamCallbacks = {
      onDelta: request.onDelta,
      onDone: () => {},
      onError: (err) => { throw err; },
    };
    fullText = await chatCompletion(
      config,
      {
        messages: apiMessages,
        systemPrompt: request.systemPrompt,
        signal: request.signal,
      },
      callbacks,
    );
  } else {
    fullText = await chatCompletionNonStream(config, {
      messages: apiMessages,
      systemPrompt: request.systemPrompt,
      signal: request.signal,
    });
  }

  const parsed = parseResponse(fullText, { repair: request.repairTags === true });
  return { fullText, parsed };
}
