import type { API配置项, 记忆系统设置, 忆庭API覆盖 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';

export type MemoryCompressionKind = 'short' | 'middle' | 'long' | 'npc';

export interface MemoryCompressionSource {
  kind: MemoryCompressionKind;
  turn: number;
  items: string[];
  prompt: string;
  sourceTurns?: { start: number; end: number };
}

export type MemoryCompressionFailureCode = 'unconfigured' | 'request_failed' | 'empty_output' | 'source_changed';

export interface MemoryCompressionResult {
  summary: string;
  usedFallback: boolean;
  usedModel: boolean;
  usedLocal: boolean;
  failureCode?: MemoryCompressionFailureCode;
  failureMessage?: string;
}

export function resolveMemoryCompressionConfig(mainConfig: API配置项, override: 忆庭API覆盖): API配置项 {
  return {
    ...mainConfig,
    provider: override.provider || mainConfig.provider,
    baseUrl: override.baseUrl.trim() || mainConfig.baseUrl,
    apiKey: override.apiKey.trim() || mainConfig.apiKey,
    model: override.model.trim() || mainConfig.model,
    maxTokens: override.maxTokens ?? mainConfig.maxTokens,
    temperature: override.temperature ?? mainConfig.temperature,
    retryCount: override.retryCount ?? mainConfig.retryCount ?? 2,
  };
}

export async function summarizeMemoryBatch(
  source: MemoryCompressionSource,
  settings: 记忆系统设置,
  mainConfig: API配置项,
  signal?: AbortSignal,
  retryCount = 2,
): Promise<MemoryCompressionResult> {
  const fallback = buildFallbackSummary(source.items, source.turn, source.kind);

  // 这是玩家主动选择的本地模式，必须在解析 API 配置前短路，避免任何回退主 API 或重试器调用。
  if (settings.启用中短长期API总结 === false) {
    return { summary: fallback, usedFallback: false, usedModel: false, usedLocal: true };
  }

  const api = resolveMemoryCompressionConfig(mainConfig, settings.记忆总结API);

  if (!api.baseUrl || !api.apiKey || !api.model) {
    return {
      summary: fallback,
      usedFallback: true,
      usedModel: false,
      usedLocal: false,
      failureCode: 'unconfigured',
      failureMessage: '记忆总结 API 未配置完整。',
    };
  }

  const systemPrompt = [
    source.prompt.trim(),
    '',
    '额外要求：',
    '- 你是在整理记忆，不是在写新剧情。',
    '- 只输出 3-6 条要点，每条一行，以 - 开头。',
    '- 保留人物、地点、行动、结果、关系变化、承诺、冲突、未结事项与后续影响。',
    '- 原著角色的单回合沉默、紧张、冷淡、受伤、戒备或少话只能作为当时状态记录，不得压缩成长期人格；长期口吻与行为边界以智库人物主体资料为准。',
    '- 若要记录关系变化，只写共同经历、明确承诺、冲突原因和当前关系事实，不要给原著角色新增长期性格标签。',
    '- 不要输出解释、标题、推理过程、编号列表或原文长段复制。',
  ].join('\n');

  const userPrompt = [
    `回合：${source.turn}`,
    `压缩类型：${getCompressionLabel(source.kind)}`,
    '本批材料如下：',
    source.items.map((item, index) => `${index + 1}. ${item}`).join('\n'),
  ].join('\n');

  try {
    const raw = await withRetries(
      () =>
        chatCompletionNonStream(api, {
          messages: [{ role: 'user', content: userPrompt }],
          systemPrompt,
          signal,
          maxTokens: api.maxTokens ?? 1024,
          temperature: api.temperature ?? 0.2,
        }),
      {
        retries: retryCount,
        signal,
        label: source.kind === 'short' ? '即时记忆压缩' : source.kind === 'middle' ? '中期记忆压缩' : source.kind === 'long' ? '长期记忆压缩' : 'NPC记忆压缩',
      },
    );
    const summary = normalizeSummaryOutput(raw);
    if (!summary) {
      return {
        summary: fallback,
        usedFallback: true,
        usedModel: false,
        usedLocal: false,
        failureCode: 'empty_output',
        failureMessage: '记忆总结 API 返回了空内容。',
      };
    }
    return {
      summary,
      usedFallback: false,
      usedModel: true,
      usedLocal: false,
    };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error;
    return {
      summary: fallback,
      usedFallback: true,
      usedModel: false,
      usedLocal: false,
      failureCode: 'request_failed',
      failureMessage: sanitizeFailureMessage(error, [api.apiKey, settings.记忆总结API.apiKey, mainConfig.apiKey]),
    };
  }
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

function sanitizeFailureMessage(error: unknown, secrets: string[]): string {
  let message = error instanceof Error ? error.message : String(error || '未知错误');
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  message = message.replace(/authorization\s*:\s*[^,\s]+/gi, 'authorization: [redacted]');
  return message.slice(0, 240) || '记忆总结请求失败。';
}

function buildFallbackSummary(items: string[], turn: number, kind: MemoryCompressionKind): string {
  // 阶段1·NPC压缩失败兜底：前3条去重记忆各截28字+省略号
  if (kind === 'npc') {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const item of items) {
      const cleaned = String(item || '').replace(/\s+/g, ' ').trim();
      if (!cleaned) continue;
      const truncated = cleaned.length > 28 ? cleaned.slice(0, 28) + '…' : cleaned;
      if (seen.has(truncated)) continue;
      seen.add(truncated);
      lines.push(`- ${truncated}`);
      if (lines.length >= 3) break;
    }
    if (!lines.length) return `【NPC记忆·回合${turn}】\n- 空白`;
    return [`【NPC记忆·回合${turn}】`, ...lines].join('\n');
  }
  const title = kind === 'short' ? '即时转短期' : kind === 'middle' ? '短期转中期' : '中期转长期';
  const maxLines = kind === 'short' ? 6 : 8;
  const lines = dedupeLines(
    items
      .map((item) => normalizeLine(item, kind === 'short' ? 96 : 120))
      .filter(Boolean),
  ).slice(0, maxLines);

  if (!lines.length) {
    return `【${title}·回合${turn}】\n- 空白`;
  }

  return [`【${title}·回合${turn}】`, ...lines.map((line) => (line.startsWith('- ') ? line : `- ${line}`))].join('\n');
}

function getCompressionLabel(kind: MemoryCompressionKind): string {
  if (kind === 'short') return '即时 -> 短期';
  if (kind === 'middle') return '短期 -> 中期';
  if (kind === 'long') return '中期 -> 长期';
  return 'NPC同行记忆压缩';
}

function normalizeSummaryOutput(raw: string): string {
  const lines = (raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[\d一二三四五六七八九十]+\s*[.、)]\s*/, '- '))
    .map((line) => line.replace(/^[*-•‣·\s]+/, '- '))
    .map((line) => (line.startsWith('- ') ? line : `- ${line}`));

  return dedupeLines(lines).slice(0, 8).join('\n');
}

function normalizeLine(text: string, limit: number): string {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\d一二三四五六七八九十]+\s*[.、)]\s*/, '')
    .trim();
  if (!cleaned) return '';
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const key = line.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}
