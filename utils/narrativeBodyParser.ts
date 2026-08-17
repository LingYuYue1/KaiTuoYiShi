import type { 角色数据结构 } from '@/models/character';
import { normalizeInlineSpeakerTags, shouldRenderAsNarrationForPlayerLine } from '@/utils/playerSpeechGuard';

export type ParsedBodySegmentKind = 'narration' | 'dialogue' | 'inner' | 'unparsed' | 'blank';

export interface ParsedBodySegment {
  kind: ParsedBodySegmentKind;
  speaker?: string;
  text: string;
  stability: 'stable' | 'partial';
  sourceLine: number;
}

export interface ParseNarrativeBodyOptions {
  traveler?: 角色数据结构;
  userInput?: string;
  partial?: boolean;
}

const NARR_RE = /^【\s*旁白\s*】\s*(.*)$/;
const DIAG_RE = /^【\s*角色\s*】\s*([^：:]+)[：:]\s*(.*)$/;
const NAMED_DIAG_RE = /^【\s*([^】]+?)\s*】\s*(.*)$/;
const INNER_RE = /^【\s*心声\s*】\s*(.*)$/;

const SOUND_EFFECT_TAGS = new Set([
  '汪', '汪汪', '喵', '喵喵', '呜', '呜呜', '嗷', '嗷呜', '吼', '吼吼', '咆', '咆哮',
  '嘶吼', '吱', '吱呀', '嘶', '嘶嘶', '轰', '轰隆', '轰隆隆', '砰', '砰砰', '咚', '咚咚',
  '咔', '咔哒', '滴', '滴滴', '滴答', '叮', '叮咚', '啪', '啪啪', '哗', '哗啦', '沙',
  '沙沙', '呼', '呼噜', '唰', '嗡', '嗡嗡', '滋', '滋滋', '咻', '咻咻', '哐', '哐当',
  '扑通', '隆', '隆隆',
]);

export function parseNarrativeBody(body: string, options: ParseNarrativeBodyOptions = {}): ParsedBodySegment[] {
  const normalized = normalizeInlineSpeakerTags(body);
  return normalized.split(/\r?\n/).flatMap<ParsedBodySegment>((raw, sourceLine) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [{ kind: 'blank', text: '', stability: 'stable', sourceLine }];
    }

    const stability = getSegmentStability(raw, sourceLine, normalized, options.partial === true);
    let match = trimmed.match(NARR_RE);
    if (match) {
      const text = match[1].trim();
      if (isSoundEffectText(text)) return [{ kind: 'narration', text, stability, sourceLine }];
      const quoted = extractFullQuotedSpeech(text);
      if (quoted && options.traveler && !shouldRenderAsNarrationForPlayerLine(quoted, options.userInput)) {
        return [{ kind: 'dialogue', speaker: getTravelerDisplayName(options.traveler), text: quoted, stability, sourceLine }];
      }
      return [{ kind: 'narration', text, stability, sourceLine }];
    }

    match = trimmed.match(DIAG_RE);
    if (match) return splitDialogueAndTrailingNarration(match[1].trim(), match[2].trim(), options, stability, sourceLine);

    match = trimmed.match(INNER_RE);
    if (match) return [{ kind: 'inner', text: match[1].trim(), stability, sourceLine }];

    match = trimmed.match(NAMED_DIAG_RE);
    if (match && !['旁白', '心声', '角色'].includes(match[1].trim())) {
      const name = match[1].trim();
      const text = match[2].trim();
      if (isSoundEffectSpeakerName(name)) {
        return [{ kind: 'narration', text: combineSoundEffectNarration(name, text), stability, sourceLine }];
      }
      return splitDialogueAndTrailingNarration(name, text, options, stability, sourceLine);
    }

    if (isSoundEffectText(trimmed)) return [{ kind: 'narration', text: trimmed, stability, sourceLine }];
    const quoted = extractFullQuotedSpeech(trimmed);
    if (quoted && options.traveler) {
      return [{ kind: 'dialogue', speaker: getTravelerDisplayName(options.traveler), text: quoted, stability, sourceLine }];
    }
    return [{ kind: 'unparsed', text: trimmed, stability, sourceLine }];
  });
}

/** Serialize the shared body representation back to the canonical line format. */
export function serializeNarrativeBody(segments: ParsedBodySegment[]): string {
  return segments.map((segment) => {
    if (segment.kind === 'blank') return '';
    if (segment.kind === 'dialogue') return `【${segment.speaker ?? '未知角色'}】${segment.text}`;
    if (segment.kind === 'inner') return `【心声】${segment.text}`;
    if (segment.kind === 'narration') return `【旁白】${segment.text}`;
    return segment.text;
  }).join('\n').trim();
}

function splitDialogueAndTrailingNarration(
  name: string,
  text: string,
  options: ParseNarrativeBodyOptions,
  stability: 'stable' | 'partial',
  sourceLine: number,
): ParsedBodySegment[] {
  if (!options.traveler || !isProtagonist(name, options.traveler)) {
    return [{ kind: 'dialogue', speaker: name, text, stability, sourceLine }];
  }
  if (isSoundEffectText(text)) {
    return [{ kind: 'narration', text, stability, sourceLine }];
  }
  // Explicit speaker labels are protocol facts here. PlayerSpeechGuard has
  // already applied the mode-specific ownership decision before persistence.
  const quoteMatch = text.match(/^([“"「].+?[”"」][。！？!?]?)(\s+.+)$/);
  if (!quoteMatch) return [{ kind: 'dialogue', speaker: name, text, stability, sourceLine }];
  const quoted = extractFullQuotedSpeech(quoteMatch[1].trim());
  if (!quoted) return [{ kind: 'dialogue', speaker: name, text, stability, sourceLine }];
  return [
    { kind: 'dialogue', speaker: name, text: quoted, stability, sourceLine },
    { kind: 'narration', text: quoteMatch[2].trim(), stability, sourceLine },
  ];
}

function getSegmentStability(raw: string, sourceLine: number, normalized: string, partial: boolean): 'stable' | 'partial' {
  if (!partial || sourceLine !== normalized.split(/\r?\n/).length - 1) return 'stable';
  const trimmed = raw.trim();
  if (!trimmed) return 'stable';
  // 已闭合的显式标签即使没有换行也可以立即渲染；只有未闭合引号/标签才保留 partial。
  if (/^【[^】]+】/.test(trimmed) && !/^【[^】]+】\s*$/.test(trimmed)) return 'stable';
  if (/[“"「][^”"」]*$/.test(trimmed) || /<[^>]*$/.test(trimmed)) return 'partial';
  return 'stable';
}

function getTravelerDisplayName(traveler: 角色数据结构): string {
  return traveler.姓名?.trim() || traveler.别名?.trim() || '你';
}

function extractFullQuotedSpeech(text: string): string | null {
  const match = text.match(/^[“"「](.+?)[”"」]([。！？!?])?$/);
  if (!match) return null;
  const inner = match[1].trim();
  if (inner.length < 2) return null;
  if (!/[我你您吗呢吧呀啊？！!?。]/.test(inner)) return null;
  return inner;
}

function isProtagonist(name: string, traveler: 角色数据结构): boolean {
  const normalized = name.trim();
  return normalized === '你'
    || normalized === '我'
    || normalized === traveler.姓名?.trim()
    || normalized === traveler.别名?.trim();
}

function normalizeSoundEffectTag(name: string): string {
  return name.trim().replace(/\s+/g, '').replace(/[~～…\.。！？!?、，,：:；;“”"‘’'（）()【】[\]《》<>·\-—]/g, '');
}

function isSoundEffectSpeakerName(name: string): boolean {
  return isNormalizedSoundEffect(normalizeSoundEffectTag(name));
}

function isSoundEffectText(text: string): boolean {
  return isNormalizedSoundEffect(normalizeSoundEffectTag(text));
}

function isNormalizedSoundEffect(clean: string): boolean {
  if (!clean || clean.length > 18) return false;
  if (SOUND_EFFECT_TAGS.has(clean)) return true;
  if (clean.length <= 8 && [...clean].every((char) => char === clean[0]) && SOUND_EFFECT_TAGS.has(clean[0])) return true;
  return /^(轰隆隆|轰隆|隆隆|轰|隆|砰|咚|咔哒|咔|吼|嗷|嘶|呜|滴滴|滴|嗡|滋|哐当|哐|啪|唰|咻){1,5}$/.test(clean);
}

function combineSoundEffectNarration(name: string, text: string): string {
  const sound = name.trim();
  const rest = text.trim();
  if (!rest) return sound;
  if (/[。！？!?…]$/.test(sound) || /^[。！？!?…、，,：:；;]/.test(rest)) return `${sound}${rest}`;
  return `${sound}，${rest}`;
}
