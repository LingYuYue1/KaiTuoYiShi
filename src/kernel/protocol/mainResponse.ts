import { 创建空解析回复, type 解析后回复 } from '@/models/chat';

interface TagRule {
  tag: string;
  key: keyof 解析后回复;
  aliases: string[];
  isArray?: boolean;
}

type ResponseField = TagRule['key'];

interface ConsumedRange {
  tag: string;
  start: number;
  end: number;
}

const TAG_RULES: TagRule[] = [
  { tag: 'thinking', key: 'thinking', aliases: ['think', '思考', '推理'] },
  { tag: '正文', key: 'body', aliases: ['body', 'content', 'text', '内容'] },
  { tag: '短期记忆', key: 'memory', aliases: ['memory', 'summary', 'recap', '记忆', '回忆'] },
  { tag: '命令', key: 'commands', aliases: ['command', 'commands', 'cmd'] },
  { tag: '动态世界', key: 'worldEvents', aliases: ['world', 'worldevent', '世界', '事件'], isArray: true },
  { tag: '行动选项', key: 'actionOptions', aliases: ['actions', 'options', 'choice', 'choices', '选项'], isArray: true },
  { tag: '变量草稿', key: 'variableDraft', aliases: ['variableDraft', '变量候选', '变量线索', '变量摘要'] },
  { tag: '剧情规划', key: 'storyPlan', aliases: ['storyPlan', 'storyPlanning', '剧情计划', '剧情安排', '后续规划'] },
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

function getResponseFieldTags(key: ResponseField): string[] {
  const rule = TAG_RULES.find((candidate) => candidate.key === key);
  return rule ? [rule.tag, ...rule.aliases] : [];
}

/** True when a complete protocol block exists for the parsed response field. */
export function hasClosedResponseField(rawText: string, key: ResponseField): boolean {
  return getResponseFieldTags(key).some((tag) => {
    const escaped = escapeRegExp(tag);
    return new RegExp(`<\\s*${escaped}\\s*>[\\s\\S]*?<\\s*\\/\\s*${escaped}\\s*>`, 'i').test(rawText);
  });
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
  cleaned = cleaned.replace(
    new RegExp(`\\s*<\\s*(?:${protocolGroup})\\s*>[\\s\\S]*?<\\s*\\/\\s*(?:${protocolGroup})\\s*>`, 'gi'),
    '',
  );
  cleaned = cleaned.replace(
    new RegExp(`\\s*<\\s*(?:${protocolGroup})\\s*>[\\s\\S]*$`, 'gi'),
    '',
  );
  return cleaned
    .replace(new RegExp(`<\\s*\\/\\s*(?:${bodyGroup || protocolGroup})\\s*>`, 'gi'), '')
    .replace(new RegExp(`<\\s*\\/?\\s*(?:${protocolGroup})\\s*>`, 'gi'), '')
    .trim();
}

export function stripStSurfaceNoiseFromBody(body: string): string {
  if (!body) return body;
  let cleaned = body
    .replace(/^\s*#{1,6}\s*(?:正文|故事正文|main\s*text|response)\s*$/gim, '')
    .replace(/^\s*(?:正文|故事正文)\s*[:：]\s*$/gim, '')
    .replace(/^\s*```(?:markdown|md|html|json|text)?\s*$/gim, '')
    .replace(/^\s*```\s*$/gim, '');

  const stHelperTags = [
    'math', 'Q', 'WF', 'Prism', 'Prism_Deep', 'VariableCheck', 'current_event',
    'progress', 'options', 'branches', 'snow', 'Shiosai', 'quote', 'meow_FM',
    'konatan_planning~', 'konatan_chat', 'tucao', 'danmu', 'htmlcontent',
    'guifan', 'disclaimer', 'details',
  ].map(escapeRegExp).join('|');
  cleaned = cleaned.replace(
    new RegExp(`\\s*<\\s*(?:${stHelperTags})\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*(?:${stHelperTags})\\s*>`, 'gi'),
    '',
  );
  cleaned = cleaned.replace(/\s*<!--\s*[\s\S]*?\s*-->/g, '');

  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

/** Repair small, known tag-shape mistakes without touching narrative content. */
export function repairTags(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/[〈＜]/g, '<').replace(/[〉＞]/g, '>')
    .replace(/<\s*\\\s*/g, '</')
    .replace(/<\s*\/\s*([一-龥A-Za-z_][一-龥A-Za-z0-9_]*)\s*>/g, '</$1>')
    .replace(/<([一-龥A-Za-z_][一-龥A-Za-z0-9_]*)>\s*<\1>/g, '<$1>');
}

function buildTagPattern(): RegExp {
  const allTags = TAG_RULES.flatMap((rule) => [rule.tag, ...rule.aliases]);
  const unique = [...new Set(allTags.map(escapeRegExp))];
  return new RegExp(`<(${unique.join('|')})>([\\s\\S]*?)(?=<(?:${unique.join('|')})>|$)`, 'gi');
}

export function cleanActionOptionText(text: string): string {
  let cleaned = text.trim();
  for (let index = 0; index < 3; index++) {
    const next = cleaned
      .replace(/^(?:行动选项|后续选项|可选行动|actions?|options?|choices?)\s*[:：]\s*/i, '')
      .replace(/^[-*•·]\s*/, '')
      .replace(/^[（(]?\d+[）)]\s*/, '')
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
      .replace(/^\d+[\.\)、:：]\s*/, '')
      .replace(/^[A-Za-z][\.\)、:：]\s*/, '')
      .replace(/^(?:选项|选择|行动|方案)\s*[一二三四五六七八九十\dA-Da-d]+\s*[:：.)、-]\s*/, '')
      .replace(/^(?:选项|选择|行动|方案)\s*[:：]\s*/, '')
      .trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned;
}

function isInvalidActionOption(option: string): boolean {
  const normalized = option.trim();
  if (!normalized) return true;
  if (/^<\/?[A-Za-z0-9_\-\u3400-\u9fff]+\s*>$/i.test(normalized)) return true;
  if (/<\/?\s*(?:disclaimer|免责声明|正文|短期记忆|剧情规划|变量草稿|变量候选|变量线索|变量摘要|命令|行动选项|动态世界|thinking|think|狭间问答|狭间评判)\s*>/i.test(normalized)) return true;
  if (/^(?:行动选项|后续选项|可选行动|选项|actions?|options?|choices?)\s*[:：]?$/i.test(normalized)) return true;
  if (/本(?:段|故事|内容|作品).*虚构|纯属虚构|免责声明|disclaimer/i.test(normalized)) return true;
  return normalized.length > 120;
}

export function parseActionOptionsBlock(optionsBlock: string): string[] {
  const text = optionsBlock.trim();
  if (!text) return [];

  const splitCandidateLine = (line: string): string[] => {
    const normalized = line.trim();
    if (!normalized) return [];
    const enumerated = Array.from(
      normalized.matchAll(/(?:^|\s)((?:\d+[\.)、:：]|[A-Za-z][\.)、:：]|[(（]\d+[)）]|[①②③④⑤⑥⑦⑧⑨⑩])\s*[\s\S]*?)(?=\s+(?:\d+[\.)、:：]|[A-Za-z][\.)、:：]|[(（]\d+[)）]|[①②③④⑤⑥⑦⑧⑨⑩])\s*|$)/g),
    ).map((match) => (match[1] || '').trim()).filter(Boolean);
    if (enumerated.length >= 2) return enumerated.map(cleanActionOptionText);

    const quoted = Array.from(normalized.matchAll(/[“"]([^“”"]{1,120})[”"]/g))
      .map((match) => (match[1] || '').trim()).filter(Boolean);
    if (quoted.length >= 2) return quoted;

    if (/[；;]/.test(normalized)) {
      const parts = normalized.split(/[；;]/).map(cleanActionOptionText).filter(Boolean);
      if (parts.length >= 2) return parts;
    }
    return [cleanActionOptionText(normalized)].filter(Boolean);
  };

  const parsed = text
    .replace(/<\s*disclaimer\s*>[\s\S]*?(?:<\s*\/\s*disclaimer\s*>|$)/gi, '\n')
    .replace(/<\s*免责声明\s*>[\s\S]*?(?:<\s*\/\s*免责声明\s*>|$)/gi, '\n')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap(splitCandidateLine)
    .filter((option) => !isInvalidActionOption(option));

  return Array.from(new Set(parsed)).slice(0, 6);
}

/**
 * Parse canonical blocks while tolerating vendor/ST wrappers and common tag
 * shape mistakes. A valid <正文> must never be discarded just because Gemini
 * adds a sentence before or after the protocol envelope.
 */
export function parseResponse(rawText: string, options?: { repair?: boolean }): 解析后回复 {
  const text = options?.repair === false ? rawText : repairTags(rawText);
  const result = 创建空解析回复();
  result.rawText = rawText;

  const allTagNames = TAG_RULES.flatMap((rule) => [rule.tag, ...rule.aliases]);
  const uniqueEscaped = [...new Set(allTagNames.map(escapeRegExp))];
  const trailingCloseTag = new RegExp(`\\s*<\\s*/\\s*(?:${uniqueEscaped.join('|')})\\s*>\\s*$`, 'i');
  const consumedRanges: ConsumedRange[] = [];

  const applyMatch = (rawTagName: string, content: string) => {
    const normalized = normalizeTag(rawTagName);
    const cleaned = content.replace(trailingCloseTag, '').trim();
    const rule = TAG_RULES.find((candidate) =>
      normalizeTag(candidate.tag) === normalized || candidate.aliases.map(normalizeTag).includes(normalized),
    );
    if (!rule) return;
    if (rule.isArray) {
      const target = result[rule.key];
      if (Array.isArray(target) && cleaned) target.push(cleaned);
      return;
    }
    (result as unknown as Record<string, unknown>)[rule.key] = cleaned;
  };

  const closedPattern = new RegExp(
    `<(${uniqueEscaped.join('|')})>([\\s\\S]*?)<\\s*/\\s*\\1\\s*>`,
    'gi',
  );
  let closedMatch: RegExpExecArray | null;
  while ((closedMatch = closedPattern.exec(text)) !== null) {
    applyMatch(closedMatch[1], closedMatch[2]);
    consumedRanges.push({
      tag: normalizeTag(closedMatch[1]),
      start: closedMatch.index,
      end: closedMatch.index + closedMatch[0].length,
    });
  }

  const isInsideConsumed = (index: number) =>
    consumedRanges.some((range) => index >= range.start && index < range.end);
  const fallbackPattern = buildTagPattern();
  let fallbackMatch: RegExpExecArray | null;
  while ((fallbackMatch = fallbackPattern.exec(text)) !== null) {
    if (isInsideConsumed(fallbackMatch.index)) continue;
    applyMatch(fallbackMatch[1], fallbackMatch[2]);
    consumedRanges.push({
      tag: normalizeTag(fallbackMatch[1]),
      start: fallbackMatch.index,
      end: fallbackMatch.index + fallbackMatch[0].length,
    });
  }

  // A missing <正文> is a model-format defect. Recover only the unlabelled
  // span immediately after a parsed thinking block and before the next
  // protocol block; never turn arbitrary prefixes, suffixes, or transport
  // errors into narrative body text.
  if (!result.body) {
    const sorted = [...consumedRanges].sort((a, b) => a.start - b.start);
    const thinking = sorted.find((range) => range.tag === normalizeTag('thinking'));
    const nextBlock = thinking && sorted.find((range) => range.start >= thinking.end);
    const unlabeledNarrative = thinking && nextBlock
      ? text.slice(thinking.end, nextBlock.start)
      : '';
    if (unlabeledNarrative.trim()) result.body = unlabeledNarrative.trim();
  }

  if (result.actionOptions.length) {
    result.actionOptions = parseActionOptionsBlock(result.actionOptions.join('\n'));
  }
  result.body = stripStSurfaceNoiseFromBody(stripProtocolBlocksFromBody(result.body));
  return result;
}

export function isEmptyResponse(parsed: 解析后回复): boolean {
  const hasBody = Boolean(parsed.body?.trim());
  const hasThinking = Boolean(parsed.thinking?.trim());
  const hasMemory = Boolean(parsed.memory?.trim());
  const hasWorldEvents = Array.isArray(parsed.worldEvents) && parsed.worldEvents.some((event) => event.trim());
  const hasActionOptions = Array.isArray(parsed.actionOptions) && parsed.actionOptions.some((option) => option.trim());
  const hasVariableDraft = Boolean(parsed.variableDraft?.trim());
  const hasStoryPlan = Boolean(parsed.storyPlan?.trim());
  const hasAwakenContent = Boolean(
    parsed.awakenInvite?.trim() || parsed.awakenQuestions?.trim() || parsed.awakenJudgement?.trim(),
  );
  return !hasBody && !hasThinking && !hasMemory && !hasWorldEvents && !hasActionOptions
    && !hasVariableDraft && !hasStoryPlan && !hasAwakenContent;
}
