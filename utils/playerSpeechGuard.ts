export type PlayerSpeechMode = 'no-control' | 'expansion';

export interface PlayerSpeechGuardOptions {
  body: string;
  playerName: string;
  playerAliases?: string[];
  userInput?: string;
  mode?: PlayerSpeechMode;
}

export interface PlayerSpeechCorrection {
  code: 'inline_tag_split' | 'sound_effect_reassigned' | 'unsupported_player_line_reassigned';
  lineIndex: number;
}

export interface PlayerSpeechNormalizationResult {
  body: string;
  corrections: PlayerSpeechCorrection[];
}

const BODY_TAG_NAMES = ['正文', 'body', 'content', 'text', '内容'];
const PROTOCOL_TAG_NAMES = [
  ...BODY_TAG_NAMES,
  'thinking',
  'think',
  '思考',
  '短期记忆',
  'memory',
  '动态世界',
  'world',
  '变量草稿',
  'variableDraft',
  '剧情规划',
  'storyPlan',
];
const INLINE_SYSTEM_TAG_NAMES = new Set([
  '历史时间',
  '历史正文',
  '历史狭间问答',
  '历史狭间评判',
  '历史短期记忆',
  '历史变量草稿',
  '历史剧情规划',
]);
const INLINE_EXPLICIT_LINE_TAG_NAMES = new Set(['旁白', '角色', '心声']);
const INLINE_SPEAKER_TAG_RE = /【\s*([^】\r\n]{1,16})\s*】/g;

const SOUND_EFFECT_TAGS = new Set([
  '汪',
  '汪汪',
  '喵',
  '喵喵',
  '呜',
  '呜呜',
  '嗷',
  '嗷呜',
  '吼',
  '吼吼',
  '咆',
  '咆哮',
  '嘶吼',
  '嘶',
  '嘶嘶',
  '轰',
  '轰隆',
  '轰隆隆',
  '砰',
  '砰砰',
  '咚',
  '咚咚',
  '咔',
  '咔哒',
  '滴',
  '滴滴',
  '滴答',
  '叮',
  '叮咚',
  '啪',
  '啪啪',
  '哗',
  '哗啦',
  '沙',
  '沙沙',
  '呼',
  '呼噜',
  '唰',
  '嗡',
  '嗡嗡',
  '滋',
  '滋滋',
  '咻',
  '咻咻',
  '哐',
  '哐当',
  '扑通',
  '隆',
  '隆隆',
]);

const PLAYER_SPEECH_VERBS_RE = /(?:我|俺|本旅人|玩家)?\s*(?:说|喊|叫|问|回答|回应|解释|自我介绍|命令|低声|大声|开口|说道|喊道|问道|答道)\s*[：:]/;

/**
 * Normalize player ownership once for both persistence and diagnostics.
 * Expansion mode keeps explicit player-labelled short speech even without a
 * verbatim substring match; no-control mode retains the strict evidence gate.
 */
export function normalizePlayerSpeechBody(options: PlayerSpeechGuardOptions): PlayerSpeechNormalizationResult {
  const inlineSplitLineIndices = options.body
    .split(/\r?\n/)
    .flatMap((line, lineIndex) => splitInlineSpeakerTagsInLine(line).length > 1 ? [lineIndex] : []);
  const body = normalizeInlineSpeakerTags(options.body);
  if (!body.trim()) return { body, corrections: [] };
  const safeName = options.playerName.trim() || '你';
  const playerNames = [safeName, ...(options.playerAliases ?? [])].map((name) => name.trim()).filter(Boolean);
  const evidence = buildPlayerSpeechEvidence(options.userInput ?? '');
  const mode = options.mode ?? 'no-control';
  const quoteOnlyRe = /^([“"「].+?[”"」][。！？!?]?)$/;
  const corrections: PlayerSpeechCorrection[] = [];

  const normalizedBody = body
    .split(/\r?\n/)
    .flatMap((raw, lineIndex) => {
      const line = raw.trim();
      if (!line) return [''];

      const legacyDialogue = line.match(/^【\s*角色\s*】\s*([^：:]+)[：:]\s*(.*)$/);
      if (legacyDialogue) {
        return [`【${legacyDialogue[1].trim()}】${legacyDialogue[2].trim()}`];
      }

      const narrationMatch = line.match(/^【\s*旁白\s*】\s*(.+)$/);
      if (narrationMatch) {
        const text = narrationMatch[1].trim();
        const quoted = text.match(quoteOnlyRe);
        if (
          quoted &&
          isLikelyPlayerSpeech(stripOuterQuote(quoted[1])) &&
          hasPlayerSpeechEvidence(stripOuterQuote(quoted[1]), evidence)
        ) {
          return [`【${safeName}】${stripOuterQuote(quoted[1])}`];
        }
        return [raw];
      }

      const protagonistMatch =
        line.match(/^【\s*角色\s*】\s*([^：:]+)[：:]\s*(.+)$/) ??
        line.match(/^【\s*([^】]+?)\s*】\s*(.+)$/);
      if (!protagonistMatch || !isPlayerSpeakerName(protagonistMatch[1], playerNames)) return [raw];

      const text = protagonistMatch[2].trim();
      const split = text.match(/^([“"「].+?[”"」][。！？!?]?)(\s+.+)$/);
      const speechText = split ? stripOuterQuote(split[1]) : stripOuterQuote(text);
      const allowed = mode === 'expansion'
        ? isAllowedExpandedPlayerSpeech(speechText)
        : isAllowedPlayerSpeech(speechText, evidence);
      if (!allowed) {
        corrections.push({
          code: isSoundEffectLike(speechText) ? 'sound_effect_reassigned' : 'unsupported_player_line_reassigned',
          lineIndex,
        });
        return [`【旁白】${text}`];
      }
      if (!split) return [`【${safeName}】${speechText}`];
      return [
        `【${safeName}】${speechText}`,
        `【旁白】${split[2].trim()}`,
      ];
    })
    .join('\n');

  corrections.unshift(...inlineSplitLineIndices.map((lineIndex) => ({ code: 'inline_tag_split' as const, lineIndex })));
  return { body: normalizedBody, corrections };
}

/** Backward-compatible string API for callers outside the main workflow. */
export function normalizePlayerSpeechInBody(options: PlayerSpeechGuardOptions): string {
  return normalizePlayerSpeechBody(options).body;
}

export function normalizeInlineSpeakerTags(text: string): string {
  if (!text || !text.includes('【')) return text;
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap(splitInlineSpeakerTagsInLine)
    .join('\n');
}

function splitInlineSpeakerTagsInLine(line: string): string[] {
  if (!line.includes('【')) return [line];
  const ranges: number[] = [];
  INLINE_SPEAKER_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_SPEAKER_TAG_RE.exec(line)) !== null) {
    const label = match[1].trim();
    if (!shouldSplitInlineSpeakerTag(line, match.index, label)) continue;
    ranges.push(match.index);
  }
  if (ranges.length === 0) return [line];
  const result: string[] = [];
  for (let i = 0; i < ranges.length; i += 1) {
    const start = ranges[i];
    const end = ranges[i + 1] ?? line.length;
    const segment = line.slice(start, end).trim();
    if (segment) result.push(segment);
  }
  const prefix = line.slice(0, ranges[0]).trim();
  return prefix ? [prefix, ...result] : result;
}

function isAllowedExpandedPlayerSpeech(text: string): boolean {
  const cleaned = text.trim();
  if (!cleaned || cleaned.length > 180) return false;
  if (isSoundEffectLike(cleaned)) return false;
  // Expansion permits short naturalized lines, but still rejects obvious
  // system/meta payloads that must never become a player avatar bubble.
  if (/^(系统|系统提示|系统消息|旁白|环境|广播)\s*[:：]/.test(cleaned)) return false;
  return true;
}

function shouldSplitInlineSpeakerTag(line: string, index: number, label: string): boolean {
  const normalized = label.replace(/\s+/g, '');
  if (!normalized || INLINE_SYSTEM_TAG_NAMES.has(normalized)) return false;
  if (INLINE_EXPLICIT_LINE_TAG_NAMES.has(normalized)) return true;
  if (normalized.length > 12 || /[，,。！？!?；;：:、"'“”‘’<>《》（）()[\]\s]/.test(normalized)) return false;
  if (index <= 0) return true;
  const before = line.slice(0, index).replace(/\s+$/g, '');
  if (!before) return true;
  const prev = before.at(-1) ?? '';
  return /[。！？!?；;：:，,、」”》）)\]}]/.test(prev);
}

export function shouldRenderAsNarrationForPlayerLine(text: string, userInput?: string): boolean {
  const speech = stripOuterQuote(text);
  const evidence = buildPlayerSpeechEvidence(userInput ?? '');
  return !isAllowedPlayerSpeech(speech, evidence);
}

export function replaceBodyInRawResponse(rawText: string, sanitizedBody: string): string {
  const body = sanitizedBody.trim();
  const raw = rawText.trim();
  if (!body) return rawText;
  if (!raw) return body;

  const tagGroup = BODY_TAG_NAMES.map(escapeRegExp).join('|');
  const closedBlock = new RegExp(`(<\\s*(${tagGroup})\\s*>)[\\s\\S]*?(<\\s*\\/\\s*\\2\\s*>)`, 'i');
  if (closedBlock.test(rawText)) {
    return rawText.replace(closedBlock, (_match, open: string, _tag: string, close: string) => {
      return `${open}\n${body}\n${close}`;
    });
  }

  const openBlock = new RegExp(`(<\\s*(?:${tagGroup})\\s*>)[\\s\\S]*$`, 'i');
  if (openBlock.test(rawText)) {
    return rawText.replace(openBlock, (_match, open: string) => `${open}\n${body}`);
  }

  const protocolTagGroup = PROTOCOL_TAG_NAMES.map(escapeRegExp).join('|');
  const hasAnyProtocolTag = new RegExp(`<\\s*\\/?\\s*(?:${protocolTagGroup})\\s*>`, 'i').test(rawText);
  if (hasAnyProtocolTag) return rawText;

  return body;
}

function escapeRegExp(text: string): string {
  return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function stripOuterQuote(text: string): string {
  return text
    .trim()
    .replace(/^[“"「]/, '')
    .replace(/[”"」]([。！？!?])?$/, '$1')
    .trim();
}

function isPlayerSpeakerName(name: string, playerNames: string[]): boolean {
  const normalized = name.trim();
  return playerNames.includes(normalized) || normalized === '你' || normalized === '我';
}

function isLikelyPlayerSpeech(text: string): boolean {
  const cleaned = text.trim();
  return cleaned.length >= 2 && /[我你您吗呢吧呀啊？！!?。]/.test(cleaned);
}

interface PlayerSpeechEvidence {
  userInput: string;
  normalizedInput: string;
  quoted: string[];
  explicitSpeechFragments: string[];
  hasExplicitSpeechInput: boolean;
  wholeInputCanBeSpeech: boolean;
}

function buildPlayerSpeechEvidence(userInput: string): PlayerSpeechEvidence {
  const trimmed = userInput.trim();
  const quoted = extractQuotedFragments(trimmed);
  const explicitSpeechFragments = extractExplicitSpeechFragments(trimmed);
  const hasExplicitSpeechInput =
    quoted.length > 0 ||
    explicitSpeechFragments.length > 0 ||
    PLAYER_SPEECH_VERBS_RE.test(trimmed);
  const wholeInputCanBeSpeech =
    !hasExplicitSpeechInput &&
    trimmed.length > 0 &&
    trimmed.length <= 80 &&
    !isSoundEffectLike(trimmed) &&
    !looksLikeActionNarration(trimmed);
  return {
    userInput: trimmed,
    normalizedInput: normalizeForCompare(trimmed),
    quoted,
    explicitSpeechFragments,
    hasExplicitSpeechInput,
    wholeInputCanBeSpeech,
  };
}

function extractQuotedFragments(text: string): string[] {
  const result: string[] = [];
  const re = /[“"「]([^”"」]{1,120})[”"」]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const fragment = match[1].trim();
    if (fragment) result.push(fragment);
  }
  return result;
}

function extractExplicitSpeechFragments(text: string): string[] {
  const result: string[] = [];
  const re = /(?:我|俺|本旅人|玩家)?\s*(?:说|喊|叫|问|回答|回应|解释|自我介绍|命令|低声|大声|开口|说道|喊道|问道|答道)\s*[：:]\s*([^。！？!?\n]{1,120}[。！？!?]?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const fragment = match[1].trim();
    if (fragment) result.push(fragment);
  }
  return result;
}

function isAllowedPlayerSpeech(text: string, evidence: PlayerSpeechEvidence): boolean {
  const cleaned = text.trim();
  if (!cleaned) return false;
  if (isSoundEffectLike(cleaned)) return false;
  if (!isLikelyPlayerSpeech(cleaned) && cleaned.length <= 8) return false;
  return hasPlayerSpeechEvidence(cleaned, evidence);
}

function hasPlayerSpeechEvidence(text: string, evidence: PlayerSpeechEvidence): boolean {
  const normalized = normalizeForCompare(text);
  if (!normalized) return false;
  const pools = [...evidence.quoted, ...evidence.explicitSpeechFragments].map(normalizeForCompare).filter(Boolean);
  if (pools.some((item) => item.includes(normalized) || normalized.includes(item))) return true;
  if (evidence.wholeInputCanBeSpeech && evidence.normalizedInput) {
    return evidence.normalizedInput.includes(normalized) || normalized.includes(evidence.normalizedInput);
  }
  return false;
}

function normalizeForCompare(text: string): string {
  return stripOuterQuote(text)
    .replace(/\s+/g, '')
    .replace(/[，,。！？!?；;：:“”"「」『』‘’'（）()【】[\]《》<>、…·~～—\-]/g, '')
    .trim();
}

function isSoundEffectLike(text: string): boolean {
  const clean = normalizeSoundEffectText(text);
  if (!clean || clean.length > 18) return false;
  if (SOUND_EFFECT_TAGS.has(clean)) return true;
  if (clean.length <= 8 && [...clean].every((char) => char === clean[0]) && SOUND_EFFECT_TAGS.has(clean[0])) return true;
  if (/^(轰隆隆|轰隆|隆隆|轰|隆|砰|咚|咔哒|咔|吼|嗷|嘶|呜|滴滴|滴|嗡|滋|哐当|哐|啪|唰|咻){1,5}$/.test(clean)) return true;
  return false;
}

function normalizeSoundEffectText(text: string): string {
  return stripOuterQuote(text)
    .replace(/\s+/g, '')
    .replace(/[~～…\.。！？!?、，,：:；;“”"‘’'（）()【】[\]《》<>·\-—]/g, '')
    .trim();
}

function looksLikeActionNarration(text: string): boolean {
  return /^(我|你|他|她)?\s*(走|跑|看|望|抬|伸|拿|挥|躲|闪|靠|进入|离开|检查|观察|攻击|拔|握|转身|点头|摇头|沉默|笑|皱眉|叹气)/.test(text);
}
