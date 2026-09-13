import type { API配置项, 记忆系统设置, 忆庭API覆盖 } from '@/models/settings';
import { mergeApiOverride } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';

export type MemoryCompressionKind = 'short' | 'middle' | 'long';

export interface MemoryCompressionSource {
  kind: MemoryCompressionKind;
  turn: number;
  items: string[];
  prompt: string;
}

export type MemoryCompressionFailureCode = 'request_failed' | 'empty_output';

export interface MemoryCompressionFailure {
  code: MemoryCompressionFailureCode;
  message: string;
}

export interface MemoryCompressionResult {
  summary: string;
  /** 因失败而回退本地摘要（区别于玩家关闭 API 总结或未配置接口）。 */
  usedFallback: boolean;
  /** 玩家关闭「启用中短长期 API 总结」时的本地摘要。 */
  usedLocal: boolean;
  failure?: MemoryCompressionFailure;
}

export function resolveMemoryCompressionConfig(mainConfig: API配置项, override: 忆庭API覆盖): API配置项 {
  return mergeApiOverride(mainConfig, override);
}

export async function summarizeMemoryBatch(
  source: MemoryCompressionSource,
  settings: 记忆系统设置,
  mainConfig: API配置项,
  signal?: AbortSignal,
  retryCount = 2,
): Promise<MemoryCompressionResult> {
  const fallback = buildFallbackSummary(source.items, source.turn, source.kind);

  // 玩家主动选择的本地模式：在解析 API 配置前短路，不产生失败草稿。
  if (!settings.启用中短长期API总结) {
    return { summary: fallback, usedFallback: false, usedLocal: true };
  }

  const api = resolveMemoryCompressionConfig(mainConfig, settings.记忆总结API);

  if (!api.baseUrl || !api.apiKey || !api.model) {
    return { summary: fallback, usedFallback: true, usedLocal: false };
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
        label: source.kind === 'short' ? '即时记忆压缩' : source.kind === 'middle' ? '中期记忆压缩' : '长期记忆压缩',
      },
    );
    const summary = normalizeSummaryOutput(raw);
    if (!summary) {
      return {
        summary: fallback,
        usedFallback: true,
        usedLocal: false,
        failure: { code: 'empty_output', message: '记忆总结 API 返回了空内容。' },
      };
    }
    return { summary, usedFallback: false, usedLocal: false };
  } catch (error) {
    // 取消属于控制流，不是失败：原样抛出，避免中止的回合留下草稿。
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    return {
      summary: fallback,
      usedFallback: true,
      usedLocal: false,
      failure: {
        code: 'request_failed',
        message: error instanceof Error ? error.message : '记忆总结请求失败。',
      },
    };
  }
}

function buildFallbackSummary(items: string[], turn: number, kind: MemoryCompressionKind): string {
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
  return '中期 -> 长期';
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
  const cleaned = (text || '')
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
