import { 创建空解析回复, type 解析后回复 } from '@/models/chat';

interface TagRule {
  tag: string;
  key: keyof 解析后回复;
  isArray?: boolean;
}

const TAG_RULES: TagRule[] = [
  { tag: 'thinking', key: 'thinking' },
  { tag: '正文', key: 'body' },
  { tag: '短期记忆', key: 'memory' },
  { tag: '命令', key: 'commands' },
  { tag: '动态世界', key: 'worldEvents', isArray: true },
  { tag: '行动选项', key: 'actionOptions', isArray: true },
  { tag: '变量草稿', key: 'variableDraft' },
  { tag: '剧情规划', key: 'storyPlan' },
  { tag: '触发狭间', key: 'awakenInvite' },
  { tag: '狭间问答', key: 'awakenQuestions' },
  { tag: '狭间评判', key: 'awakenJudgement' },
];

function normalizeTag(tag: string): string {
  return tag.replace(/[\/\s]/g, '').toLowerCase();
}

export function cleanActionOptionText(text: string): string {
  return text
    .trim()
    .replace(/^-\s*/, '')
    .replace(/^选项\s*[1-6]\s*[:：]\s*/, '')
    .trim();
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
  const text = (optionsBlock || '').trim();
  if (!text) return [];
  const parsed = text.replace(/\r\n/g, '\n').split('\n').map(cleanActionOptionText).filter(Boolean);
  if (parsed.some(isInvalidActionOption)) throw new Error('Action options contain invalid protocol content');
  if (new Set(parsed).size !== parsed.length) throw new Error('Action options contain duplicates');
  if (parsed.length > 6) throw new Error('Action options exceed the maximum of 6');
  return parsed;
}

export function parseResponse(rawText: string): 解析后回复 {
  const text = rawText;
  const result = 创建空解析回复();
  result.rawText = rawText;

  const allTagNames = TAG_RULES.map((rule) => rule.tag);
  const escapedTags = allTagNames.map((t) => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const uniqueEscaped = [...new Set(escapedTags)];
  const matchedKeys = new Set<keyof 解析后回复>();
  const applyMatch = (rawTagName: string, content: string) => {
    const normalized = normalizeTag(rawTagName);
    const cleaned = content.trim();
    for (const rule of TAG_RULES) {
      const ruleTag = normalizeTag(rule.tag);
      if (normalized === ruleTag) {
        if (matchedKeys.has(rule.key)) throw new Error(`Duplicate response protocol tag: <${rule.tag}>`);
        matchedKeys.add(rule.key);
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
  const closedPattern = new RegExp(
    `<(${uniqueEscaped.join('|')})>([\\s\\S]*?)<\\s*/\\s*\\1\\s*>`,
    'gi',
  );
  let closedMatch: RegExpExecArray | null;
  while ((closedMatch = closedPattern.exec(text)) !== null) {
    applyMatch(closedMatch[1], closedMatch[2]);
  }
  const unmatchedText = text.replace(
    new RegExp(`<(${uniqueEscaped.join('|')})>[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>`, 'gi'),
    '',
  ).trim();
  if (unmatchedText) throw new Error('Response contains text outside canonical protocol tags');

  // 行动选项只接受协议定义的逐行列表。
  if (result.actionOptions.length) {
    result.actionOptions = parseActionOptionsBlock(result.actionOptions.join('\n'));
  }

  result.body = result.body.trim();

  return result;
}

/**
 * 判断解析后的回复是否为"空响应"——body、thinking、所有协议标签全为空。
 * 用于 sendWorkflow 的抗空回检测：
 *  - 完全空（rawText 也空）→ 明显空响应
 *  - 纯标签无正文（rawText 有内容但 body/thinking 都空）→ 模型只输出标签壳没输出实质内容
 * 这两种情况都应触发自动重试。
 */
export function isEmptyResponse(parsed: 解析后回复): boolean {
  const hasBody = Boolean(parsed.body?.trim());
  const hasThinking = Boolean(parsed.thinking?.trim());
  const hasMemory = Boolean(parsed.memory?.trim());
  const hasWorldEvents = Array.isArray(parsed.worldEvents) && parsed.worldEvents.some((e) => e.trim());
  const hasActionOptions = Array.isArray(parsed.actionOptions) && parsed.actionOptions.some((o) => o.trim());
  const hasVariableDraft = Boolean(parsed.variableDraft?.trim());
  const hasStoryPlan = Boolean(parsed.storyPlan?.trim());
  const hasAwakenContent = Boolean(
    parsed.awakenInvite?.trim() || parsed.awakenQuestions?.trim() || parsed.awakenJudgement?.trim(),
  );
  return !hasBody && !hasThinking && !hasMemory && !hasWorldEvents && !hasActionOptions
    && !hasVariableDraft && !hasStoryPlan && !hasAwakenContent;
}
