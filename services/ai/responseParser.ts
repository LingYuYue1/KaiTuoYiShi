import { 创建空解析回复, type 解析后回复 } from '@/models/chat';

interface TagRule {
  tag: string;
  key: keyof 解析后回复;
  aliases: string[];
  isArray?: boolean;
}

const TAG_RULES: TagRule[] = [
  { tag: 'thinking', key: 'thinking', aliases: ['think', '思考', '推理'] },
  { tag: '正文', key: 'body', aliases: ['body', 'content', 'text', '内容'] },
  { tag: '短期记忆', key: 'memory', aliases: ['memory', 'summary', 'recap', '记忆', '回忆'] },
  { tag: '命令', key: 'commands', aliases: ['command', 'commands', 'cmd'] },
  { tag: '动态世界', key: 'worldEvents', aliases: ['world', 'worldevent', '世界', '事件'], isArray: true },
  { tag: '行动选项', key: 'actionOptions', aliases: ['actions', 'options', 'choice', 'choices', '选项'], isArray: true },
  { tag: '触发狭间', key: 'awakenInvite', aliases: ['awakeninvite', '狭间邀请', '命途狭间触发'] },
  { tag: '狭间问答', key: 'awakenQuestions', aliases: ['awakenquestions', '命途狭间问答'] },
  { tag: '狭间评判', key: 'awakenJudgement', aliases: ['awakenjudgement', '命途狭间评判'] },
];

const LEGACY_STRIP_ONLY_TAGS = ['战斗', 'battle', 'combat', '战斗记录'];

function normalizeTag(tag: string): string {
  return tag.replace(/[\/\s]/g, '').toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function stripProtocolBlocksFromBody(body: string): string {
  if (!body) return body;
  const nonBodyTags = TAG_RULES
    .filter((rule) => rule.key !== 'body')
    .flatMap((rule) => [rule.tag, ...rule.aliases])
    .concat(LEGACY_STRIP_ONLY_TAGS)
    .map(escapeRegExp);
  const bodyTags = TAG_RULES
    .filter((rule) => rule.key === 'body')
    .flatMap((rule) => [rule.tag, ...rule.aliases])
    .map(escapeRegExp);
  const protocolGroup = [...new Set(nonBodyTags)].join('|');
  const bodyGroup = [...new Set(bodyTags)].join('|');
  if (!protocolGroup) return body.trim();

  let cleaned = body;
  // 已闭合的非正文协议块：<行动选项>...</行动选项>
  cleaned = cleaned.replace(
    new RegExp(`\\s*<\\s*(?:${protocolGroup})\\s*>[\\s\\S]*?<\\s*\\/\\s*(?:${protocolGroup})\\s*>`, 'gi'),
    '',
  );
  // 未闭合且通常位于正文末尾的协议块：<行动选项>...
  cleaned = cleaned.replace(
    new RegExp(`\\s*<\\s*(?:${protocolGroup})\\s*>[\\s\\S]*$`, 'gi'),
    '',
  );
  // 清掉意外残留的正文闭合标签或孤立协议标签。
  cleaned = cleaned
    .replace(new RegExp(`<\\s*\\/\\s*(?:${bodyGroup || protocolGroup})\\s*>`, 'gi'), '')
    .replace(new RegExp(`<\\s*\\/?\\s*(?:${protocolGroup})\\s*>`, 'gi'), '');
  return cleaned.trim();
}

/** 在 parseResponse 之前先跑一遍，修补常见的标签错误：
 *  - 同一标签开头被连写两次（`<正文><正文>` → `<正文>`）。
 *  - 段落末尾缺失闭合标签时，下一个开标签前补一个闭合标签。
 *  - 用 `<\xxx>`、`</ xxx >` 之类异形闭标签统一成 `</xxx>`。
 *  - 半角全角尖括号统一（`〈正文〉` → `<正文>`）。
 *  本函数只做保守的字符串级修复，不动正文。失败回退原文。
 */
export function repairTags(raw: string): string {
  if (!raw) return raw;
  let text = raw;

  // 全角尖括号 → 半角
  text = text.replace(/[〈＜]/g, '<').replace(/[〉＞]/g, '>');

  // 反斜杠闭标签 `<\xxx>` → `</xxx>`
  text = text.replace(/<\s*\\\s*/g, '</');

  // `</ xxx >` → `</xxx>`
  text = text.replace(/<\s*\/\s*([一-龥A-Za-z_][一-龥A-Za-z0-9_]*)\s*>/g, '</$1>');

  // 同名开标签紧邻：`<正文><正文>` → `<正文>`
  text = text.replace(/<([一-龥A-Za-z_][一-龥A-Za-z0-9_]*)>\s*<\1>/g, '<$1>');

  return text;
}

function buildTagPattern(): RegExp {
  const allTags = TAG_RULES.flatMap((r) => [r.tag, ...r.aliases]);
  const escaped = allTags.map((t) => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const unique = [...new Set(escaped)];
  return new RegExp(`<(${unique.join('|')})>([\\s\\S]*?)(?=<(?:${unique.join('|')})>|$)`, 'gi');
}

export function parseResponse(rawText: string, options?: { repair?: boolean }): 解析后回复 {
  const text = options?.repair ? repairTags(rawText) : rawText;
  const result = 创建空解析回复();
  result.rawText = rawText;

  const allTagNames = TAG_RULES.flatMap((r) => [r.tag, ...r.aliases]);
  const escapedTags = allTagNames.map((t) => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const uniqueEscaped = [...new Set(escapedTags)];
  // AI 偶发会写闭合标签 `</正文>`，提取段内容时把粘在末尾的闭合标签剥掉。
  const trailingCloseTagRe = new RegExp(`\\s*<\\s*/\\s*(?:${uniqueEscaped.join('|')})\\s*>\\s*$`, 'i');

  const applyMatch = (rawTagName: string, content: string) => {
    const normalized = normalizeTag(rawTagName);
    const cleaned = content.replace(trailingCloseTagRe, '').trim();
    for (const rule of TAG_RULES) {
      const ruleTag = normalizeTag(rule.tag);
      const aliases = rule.aliases.map(normalizeTag);
      if (normalized === ruleTag || aliases.includes(normalized)) {
        if (rule.isArray) {
          const arr = result[rule.key];
          if (Array.isArray(arr) && cleaned) {
            arr.push(cleaned);
          }
        } else {
          (result as unknown as Record<string, unknown>)[rule.key] = cleaned;
        }
        return true;
      }
    }
    return false;
  };

  // 第一遍：优先按显式闭合标签 `<tag>...</tag>` 匹配。
  // 这样即使 thinking 正文里出现字面 `<短期记忆>` / `<动态世界>`（AI 模仿 CoT 提示词写出来），
  // 也不会被 lookahead 误判为下一段的开始。
  // 用 \\1 反向引用确保只配对相同标签名的开/闭对。
  const consumedRanges: Array<[number, number]> = [];
  const closedPattern = new RegExp(
    `<(${uniqueEscaped.join('|')})>([\\s\\S]*?)<\\s*/\\s*\\1\\s*>`,
    'gi',
  );
  let closedMatch: RegExpExecArray | null;
  while ((closedMatch = closedPattern.exec(text)) !== null) {
    applyMatch(closedMatch[1], closedMatch[2]);
    consumedRanges.push([closedMatch.index, closedMatch.index + closedMatch[0].length]);
  }

  const isInsideConsumed = (idx: number) =>
    consumedRanges.some(([start, end]) => idx >= start && idx < end);

  // 第二遍：用原先的 lookahead 模式兜底未闭合的段（AI 偶发漏写 `</xxx>`）。
  const pattern = buildTagPattern();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (isInsideConsumed(match.index)) continue;
    applyMatch(match[1], match[2]);
    consumedRanges.push([match.index, match.index + match[0].length]);
  }

  // Body 兜底：没有显式 <正文> 标签时，用「所有已消费 tag 块外」的剩余文本当 body。
  // 这样 AI 漏写 <正文> 但仍输出了 <行动选项>/<短期记忆>/<动态世界> 时，叙事段不会被吞。
  if (!result.body) {
    const sorted = [...consumedRanges].sort((a, b) => a[0] - b[0]);
    const pieces: string[] = [];
    let cursor = 0;
    for (const [start, end] of sorted) {
      if (start > cursor) pieces.push(text.slice(cursor, start));
      cursor = Math.max(cursor, end);
    }
    if (cursor < text.length) pieces.push(text.slice(cursor));
    // 把残留的孤立闭合标签 / 半截标签清掉
    const leftover = pieces
      .join('\n')
      .replace(/<\s*\/?\s*[一-龥A-Za-z_][一-龥A-Za-z0-9_]*\s*>/g, '')
      .trim();
    if (leftover) result.body = leftover;
  }

  // 把 <行动选项> 块进一步按行拆成单独选项；每行去掉前缀 `- `/`* `/`• `/数字`.`/`、`。
  // 同时去重、限制最多 6 条，避免 AI 失控生成 20 条。
  if (result.actionOptions.length) {
    const expanded: string[] = [];
    for (const block of result.actionOptions) {
      for (const rawLine of block.split(/\r?\n/)) {
        const cleaned = rawLine
          .trim()
          .replace(/^[-*•·]\s*/, '')
          .replace(/^\d+[\.\)、]\s*/, '')
          .replace(/^选项\s*\d*[:：]?\s*/, '')
          .trim();
        if (cleaned && !expanded.includes(cleaned)) expanded.push(cleaned);
        if (expanded.length >= 6) break;
      }
      if (expanded.length >= 6) break;
    }
    result.actionOptions = expanded;
  }

  result.body = stripProtocolBlocksFromBody(result.body);

  return result;
}
