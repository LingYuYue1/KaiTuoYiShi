// 由 docs/plans/chatCompletionClient-deepclean-slim.md S7 拆分生成。
import { normalizeGeminiBaseUrl } from './geminiEndpointPolicy';
import type { API配置项 } from '@/models/settings';
import { applySamplingParams, errorText, fetchWithApiErrorReport, throwApiError } from './chatCompletionOpenAICompat';
import { readOpenAICompatibleStreamDelta, runSseStream } from './chatCompletionStream';
import type { ChatCompletionRequest, StreamCallbacks } from './chatCompletionTypes';

export function buildGeminiRequestBody(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
): Record<string, unknown> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system' && m.content.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: '请开始本轮回应。' }] });
  }

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: request.maxTokens ?? config.maxTokens ?? 2048,
    temperature: request.temperature ?? config.temperature ?? 0.8,
  };
  // Gemini 原生支持 top_p / top_k / repetition_penalty / frequency_penalty / presence_penalty
  applySamplingParams(generationConfig, {
    topP: 'topP',
    topK: 'topK',
    repetitionPenalty: 'repetitionPenalty',
    frequencyPenalty: 'frequencyPenalty',
    presencePenalty: 'presencePenalty',
  }, request, config);

  const bodyObj: Record<string, unknown> = {
    contents,
    generationConfig,
  };
  if (systemMsg?.content.trim()) {
    bodyObj.systemInstruction = {
      parts: [{ text: systemMsg.content }],
    };
  }
  return bodyObj;
}

export // ── Gemini streaming ──
async function streamGemini(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const url = `${normalizeGeminiBaseUrl(config.baseUrl)}/models/${config.model}:streamGenerateContent?alt=sse`;

  const response = await fetchWithApiErrorReport(config, 'Gemini 聊天补全', url, 'stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify(buildGeminiRequestBody(config, messages, request)),
    signal: request.signal,
  });

  if (!response.ok) {
    await throwApiError(config, 'Gemini 聊天补全', url, 'stream', response.status, await errorText(response),
      (status, responseText) => new Error(`Gemini API Error ${status}: ${responseText}`));
  }

  return runSseStream(response, {
    provider: 'gemini',
    config,
    request,
    callbacks,
    extractText: readOpenAICompatibleStreamDelta,
  });
}
