import type { 聊天消息, 回合Token消耗 } from '@/models/chat';
import { estimateTextTokens } from '@/utils/tokenEstimate';
import { sendChatMessage } from '@/services/ai/text';

type ApiTokenUsage = Awaited<ReturnType<typeof sendChatMessage>>['usage'];

export function buildTurnTokenUsage(input: {
  apiUsage?: ApiTokenUsage;
  systemPrompt: string;
  messages: 聊天消息[];
  outputText: string;
  provider: string;
  model: string;
}): 回合Token消耗 {
  const promptText = [
    input.systemPrompt,
    ...input.messages.map((msg) => `${msg.role}\n${msg.content}`),
  ].filter(Boolean).join('\n\n');
  const estimatedInput = estimateTextTokens(promptText);
  const estimatedOutput = estimateTextTokens(input.outputText);
  const inputTokens = Math.round(input.apiUsage?.inputTokens ?? estimatedInput);
  const outputTokens = Math.round(input.apiUsage?.outputTokens ?? estimatedOutput);
  const totalTokens = Math.round(input.apiUsage?.totalTokens ?? inputTokens + outputTokens);
  const apiHasCoreUsage =
    typeof input.apiUsage?.inputTokens === 'number' ||
    typeof input.apiUsage?.outputTokens === 'number' ||
    typeof input.apiUsage?.totalTokens === 'number';
  const cachedTokens = typeof input.apiUsage?.cachedTokens === 'number'
    ? Math.round(input.apiUsage.cachedTokens)
    : undefined;
  const uncachedTokens = typeof input.apiUsage?.uncachedTokens === 'number'
    ? Math.round(input.apiUsage.uncachedTokens)
    : undefined;
  const apiHasAnyUsage = apiHasCoreUsage || typeof cachedTokens === 'number' || typeof uncachedTokens === 'number';
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens,
    uncachedTokens,
    cacheHitRate: typeof input.apiUsage?.cacheHitRate === 'number'
      ? input.apiUsage.cacheHitRate
      : apiHasCoreUsage && typeof cachedTokens === 'number' && inputTokens > 0
        ? cachedTokens / inputTokens
        : undefined,
    source: apiHasCoreUsage ? 'api' : apiHasAnyUsage ? 'mixed' : 'estimate',
    provider: input.apiUsage?.provider ?? input.provider,
    model: input.apiUsage?.model ?? input.model,
    usageFormat: input.apiUsage?.usageFormat,
    usagePath: input.apiUsage?.usagePath,
    rawUsageKeys: input.apiUsage?.rawUsageKeys,
    cacheDiagnostic: input.apiUsage?.cacheDiagnostic,
    rawUsage: input.apiUsage?.rawUsage,
  };
}

type CacheDiagnosticsMessage = {
  role: 聊天消息['role'];
  content: string;
};

type CacheDiagnosticsSection = {
  label: string;
  text: string;
  start: number;
  end: number;
};

function splitSystemPromptForCacheDiagnostics(systemPrompt: string): Array<{ label: string; text: string }> {
  const lines = systemPrompt.split(/\r?\n/);
  const sections: Array<{ label: string; text: string }> = [];
  let label = 'System Prompt / 开头';
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) sections.push({ label, text });
    buffer = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    const heading =
      trimmed.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim() ||
      trimmed.match(/^【([^】]{2,40})】/)?.[1]?.trim();
    if (heading) {
      flush();
      label = `System Prompt / ${heading}`;
    }
    buffer.push(line);
  }
  flush();
  return sections.length ? sections : [{ label, text: systemPrompt }];
}

function buildCacheDiagnosticsSections(systemPrompt: string, messages: CacheDiagnosticsMessage[]): CacheDiagnosticsSection[] {
  const rawSections = [
    ...splitSystemPromptForCacheDiagnostics(systemPrompt),
    ...messages.map((message, index) => ({
      label: `Messages / #${index + 1} ${message.role}`,
      text: message.content || '（空）',
    })),
  ];
  const sections: CacheDiagnosticsSection[] = [];
  let cursor = 0;
  for (const section of rawSections) {
    const start = cursor;
    const text = `<<<${section.label}>>>\n${section.text}`;
    const end = start + text.length;
    sections.push({ ...section, text, start, end });
    cursor = end + 2;
  }
  return sections;
}

function serializeCacheDiagnosticsSections(sections: CacheDiagnosticsSection[]): string {
  return sections.map((section) => section.text).join('\n\n');
}

function getCommonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left.charCodeAt(index) === right.charCodeAt(index)) index++;
  return index;
}

function findCacheDiagnosticsSection(sections: CacheDiagnosticsSection[], index: number): CacheDiagnosticsSection | undefined {
  return sections.find((section) => index >= section.start && index <= section.end)
    ?? sections.at(-1);
}

function excerptCacheDiagnosticsText(text: string, index: number): string {
  if (!text) return '（空）';
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 160);
  return text
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260) || '（空）';
}

export function buildCachePrefixDiagnostics(input: {
  enabled: boolean;
  systemPrompt: string;
  messages: CacheDiagnosticsMessage[];
  previous?: {
    systemPrompt: string;
    messages: CacheDiagnosticsMessage[];
  };
}): NonNullable<聊天消息['debugContext']>['cachePrefixDiagnostics'] | undefined {
  if (!input.enabled || !input.previous) return undefined;
  const currentSections = buildCacheDiagnosticsSections(input.systemPrompt, input.messages);
  const previousSections = buildCacheDiagnosticsSections(input.previous.systemPrompt, input.previous.messages);
  const currentText = serializeCacheDiagnosticsSections(currentSections);
  const previousText = serializeCacheDiagnosticsSections(previousSections);
  const commonPrefixChars = getCommonPrefixLength(currentText, previousText);
  const currentPromptTokens = estimateTextTokens(currentText);
  const previousPromptTokens = estimateTextTokens(previousText);
  const commonPrefixTokens = estimateTextTokens(currentText.slice(0, commonPrefixChars));
  const firstCurrent = findCacheDiagnosticsSection(currentSections, commonPrefixChars);
  const firstPrevious = findCacheDiagnosticsSection(previousSections, commonPrefixChars);
  const changedTailTokens = estimateTextTokens(currentText.slice(commonPrefixChars));
  const largestChangedSections = currentSections
    .filter((section) => section.end >= commonPrefixChars)
    .map((section) => ({
      label: section.label,
      tokens: estimateTextTokens(section.text),
    }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 6);
  return {
    currentPromptTokens,
    previousPromptTokens,
    commonPrefixChars,
    commonPrefixTokens,
    commonPrefixRate: currentText.length ? commonPrefixChars / currentText.length : 0,
    firstDiffCurrentSection: firstCurrent?.label ?? '未知',
    firstDiffPreviousSection: firstPrevious?.label,
    firstDiffCurrentExcerpt: excerptCacheDiagnosticsText(currentText, commonPrefixChars),
    firstDiffPreviousExcerpt: excerptCacheDiagnosticsText(previousText, commonPrefixChars),
    changedTailTokens,
    largestChangedSections,
  };
}

