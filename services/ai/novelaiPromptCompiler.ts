import type {
  NovelAIAdvancedSettings,
  NovelAITaskOverrides,
  StorySnapshotRenderContext,
} from '@/models/imageGeneration';
import { normalizeStorySnapshotRenderContext } from '@/models/imageGeneration';

export type NovelAIModelFamily = 'v3' | 'v4' | 'v4.5';

export interface NovelAIModelProfile {
  model: string;
  family: NovelAIModelFamily;
  qualityTags: string;
  recommendedSteps: number;
  recommendedCfgScale: number;
  supportsCharacterPrompts: boolean;
  prependNsfwToPreset: boolean;
  ucPresets: ReadonlyArray<{ name: string; text: string }>;
}

export interface NovelAICharacterPrompt {
  name: string;
  prompt: string;
  negativePrompt: string;
  center: { x: number; y: number };
}

export interface CompiledNovelAIPrompt {
  family: NovelAIModelFamily;
  basePrompt: string;
  baseNegativePrompt: string;
  characterPrompts: NovelAICharacterPrompt[];
  qualityTags: string;
  uc: string;
  ucPreset: number;
  positiveBudget: { used: number; limit: number; truncated: boolean };
  negativeBudget: { used: number; limit: number; truncated: boolean };
  truncated: boolean;
  warnings: string[];
}

export interface CompileNovelAIPromptInput {
  model: string;
  prompt: string;
  negativePrompt?: string;
  advanced?: NovelAIAdvancedSettings;
  taskOverrides?: NovelAITaskOverrides;
  storySnapshotContext?: StorySnapshotRenderContext;
  ucPreset?: number;
}

const NOVELAI_MODEL_PROFILES: Record<string, NovelAIModelProfile> = {
  'nai-diffusion-4-5-full': {
    model: 'nai-diffusion-4-5-full',
    family: 'v4.5',
    qualityTags: 'very aesthetic, masterpiece, no text',
    recommendedSteps: 23,
    recommendedCfgScale: 5,
    supportsCharacterPrompts: true,
    prependNsfwToPreset: true,
    ucPresets: [
      { name: 'Heavy', text: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page' },
      { name: 'Light', text: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page' },
      { name: 'Furry Focus', text: '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic' },
      { name: 'Human Focus', text: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy' },
      { name: 'None', text: '' },
    ],
  },
  'nai-diffusion-4-5-curated': {
    model: 'nai-diffusion-4-5-curated',
    family: 'v4.5',
    qualityTags: 'very aesthetic, masterpiece, no text, -0.8::feet::, rating:general',
    recommendedSteps: 23,
    recommendedCfgScale: 5,
    supportsCharacterPrompts: true,
    prependNsfwToPreset: false,
    ucPresets: [
      { name: 'Heavy', text: 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page' },
      { name: 'Light', text: 'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page' },
      { name: 'Human Focus', text: 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page' },
      { name: 'None', text: '' },
    ],
  },
  'nai-diffusion-4-full': {
    model: 'nai-diffusion-4-full',
    family: 'v4',
    qualityTags: 'no text, best quality, very aesthetic, absurdres',
    recommendedSteps: 23,
    recommendedCfgScale: 5.5,
    supportsCharacterPrompts: true,
    prependNsfwToPreset: true,
    ucPresets: [
      { name: 'Heavy', text: 'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks, white blank page, blank page' },
      { name: 'Light', text: 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, white blank page, blank page' },
      { name: 'None', text: '' },
    ],
  },
  'nai-diffusion-4-curated-preview': {
    model: 'nai-diffusion-4-curated-preview',
    family: 'v4',
    qualityTags: 'rating:general, best quality, very aesthetic, absurdres',
    recommendedSteps: 23,
    recommendedCfgScale: 5.5,
    supportsCharacterPrompts: true,
    prependNsfwToPreset: false,
    ucPresets: [
      { name: 'Heavy', text: 'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts, white blank page, blank page' },
      { name: 'Light', text: 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature, white blank page, blank page' },
      { name: 'None', text: '' },
    ],
  },
  'nai-diffusion-3': {
    model: 'nai-diffusion-3',
    family: 'v3',
    qualityTags: 'best quality, amazing quality, very aesthetic, absurdres',
    recommendedSteps: 23,
    recommendedCfgScale: 5,
    supportsCharacterPrompts: false,
    prependNsfwToPreset: true,
    ucPresets: [
      { name: 'Heavy', text: 'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]' },
      { name: 'Light', text: 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing' },
      { name: 'Human Focus', text: 'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes' },
      { name: 'None', text: 'lowres' },
    ],
  },
};

export function resolveNovelAIModelProfile(model: string): NovelAIModelProfile {
  return NOVELAI_MODEL_PROFILES[model] ?? NOVELAI_MODEL_PROFILES['nai-diffusion-3'];
}

function joinPromptParts(...parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(', ');
}

const META_PROMPT_PATTERN = /\b(?:novelai|sd\s*webui|stable\s+diffusion|comfyui|openai(?:-compatible)?|workflow|json|payload|api|system\s+prompt)\b/i;
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
const COUNT_TAG_PATTERN = /^\d+\s*(?:girls?|boys?|people)$/i;
const PROMPT_CONTROL_PATTERNS = [
  /^choose composition by final slot\b/i,
  /^avatar:\s*square head and shoulders\b/i,
  /^portrait:\s*full body or knees-up\b/i,
  /^scene:\s*wide cinematic frame\b/i,
  /^phone wallpaper:\s*clean icon-safe negative space\b/i,
  /^(?:output compact image tags|prefer concrete visual tags|remove plot explanation|return a clear positive prompt)\b/i,
  /^(?:but\s+)?(?:still\s+)?keep visual facts dense and unambiguous\b/i,
  /^use plain positive prompt\b/i,
  /^keep the prompt modular\b/i,
  /^do not output\b/i,
  /^target canvas size\s*:/i,
];

function splitPromptSegments(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split(/[\n,;]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function sanitizePrompt(text: string, blocked?: (segment: string) => boolean): string {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const segment of splitPromptSegments(text)) {
    if (
      CJK_PATTERN.test(segment)
      || META_PROMPT_PATTERN.test(segment)
      || PROMPT_CONTROL_PATTERNS.some((pattern) => pattern.test(segment))
      || blocked?.(segment)
    ) continue;
    const ascii = segment.replace(/[^\x20-\x7e]/g, '').trim();
    const key = ascii.toLowerCase();
    if (!ascii || seen.has(key)) continue;
    seen.add(key);
    result.push(ascii);
  }
  return result.join(', ');
}

function buildCharacterCountTag(context: StorySnapshotRenderContext | undefined): string {
  const characters = context?.characters.filter((character) => character.enabled !== false).slice(0, 4) ?? [];
  if (characters.length === 0) return '';
  const girls = characters.filter((character) => character.subjectType === 'girl').length;
  const boys = characters.filter((character) => character.subjectType === 'boy').length;
  const others = characters.length - girls - boys;
  return [
    girls ? `${girls}girl${girls === 1 ? '' : 's'}` : '',
    boys ? `${boys}boy${boys === 1 ? '' : 's'}` : '',
    others ? `${others}people` : '',
  ].filter(Boolean).join(', ');
}

function compileOptionalContent(
  mode: NovelAIAdvancedSettings['qualityMode'] | undefined,
  officialText: string,
  customText: string | undefined,
): string {
  const safeOfficial = sanitizePrompt(officialText);
  const safeCustom = sanitizePrompt(customText ?? '');
  if (mode === 'off') return '';
  if (mode === 'replace') return safeCustom;
  if (mode === 'append') return sanitizePrompt(joinPromptParts(safeOfficial, safeCustom));
  return safeOfficial;
}

const POSITIVE_PROMPT_LIMIT = 1600;
const NEGATIVE_PROMPT_LIMIT = 1200;

function truncatePrompt(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  const segments = splitPromptSegments(text);
  const result: string[] = [];
  let used = 0;
  for (const segment of segments) {
    const separatorLength = result.length ? 2 : 0;
    if (used + separatorLength + segment.length <= limit) {
      result.push(segment);
      used += separatorLength + segment.length;
      continue;
    }
    const remaining = limit - used - separatorLength;
    if (remaining > 0) result.push(segment.slice(0, remaining).trim());
    break;
  }
  return { text: result.filter(Boolean).join(', '), truncated: true };
}

function applyPromptBudget(
  base: string,
  characters: NovelAICharacterPrompt[],
  limit: number,
): { base: string; characters: NovelAICharacterPrompt[]; used: number; truncated: boolean } {
  if (!characters.length) {
    const result = truncatePrompt(base, limit);
    return { base: result.text, characters, used: result.text.length, truncated: result.truncated };
  }
  const baseLimit = Math.min(800, Math.max(480, Math.floor(limit * 0.5)));
  const baseResult = truncatePrompt(base, baseLimit);
  const characterLimit = Math.max(120, Math.floor((limit - baseResult.text.length) / characters.length));
  let truncated = baseResult.truncated;
  const normalizedCharacters = characters.map((character) => {
    const result = truncatePrompt(character.prompt, characterLimit);
    truncated ||= result.truncated;
    return { ...character, prompt: result.text };
  });
  const used = baseResult.text.length + normalizedCharacters.reduce((sum, character) => sum + character.prompt.length, 0);
  return { base: baseResult.text, characters: normalizedCharacters, used, truncated };
}

function applyNegativeBudget(
  base: string,
  characters: NovelAICharacterPrompt[],
  limit: number,
): { base: string; characters: NovelAICharacterPrompt[]; used: number; truncated: boolean } {
  if (!characters.length) {
    const result = truncatePrompt(base, limit);
    return { base: result.text, characters, used: result.text.length, truncated: result.truncated };
  }
  const baseLimit = Math.min(720, Math.max(360, Math.floor(limit * 0.55)));
  const baseResult = truncatePrompt(base, baseLimit);
  const characterLimit = Math.max(80, Math.floor((limit - baseResult.text.length) / characters.length));
  let truncated = baseResult.truncated;
  const normalizedCharacters = characters.map((character) => {
    const result = truncatePrompt(character.negativePrompt, characterLimit);
    truncated ||= result.truncated;
    return { ...character, negativePrompt: result.text };
  });
  const used = baseResult.text.length + normalizedCharacters.reduce((sum, character) => sum + character.negativePrompt.length, 0);
  return { base: baseResult.text, characters: normalizedCharacters, used, truncated };
}

export function compileNovelAIPrompt(input: CompileNovelAIPromptInput): CompiledNovelAIPrompt {
  const profile = resolveNovelAIModelProfile(input.model);
  const advanced: Partial<NovelAIAdvancedSettings> = { ...input.advanced };
  for (const [key, value] of Object.entries(input.taskOverrides ?? {})) {
    if (value !== undefined) (advanced as Record<string, unknown>)[key] = value;
  }
  const context = normalizeStorySnapshotRenderContext(input.storySnapshotContext) ?? input.storySnapshotContext;
  const activeCharacters = context?.characters.filter((character) => character.enabled !== false).slice(0, 4) ?? [];
  const basePromptBody = sanitizePrompt(joinPromptParts(
    advanced.basePromptPrefix,
    context?.scenePrompt || input.prompt,
    context?.stylePrompt,
    advanced.basePromptSuffix,
  ), (segment) => COUNT_TAG_PATTERN.test(segment));
  const characterPrompts = activeCharacters.map((character, index) => ({
    name: character.name,
    prompt: sanitizePrompt(joinPromptParts(
      advanced.characterPromptPrefix,
      character.subjectType === 'other' ? '' : character.subjectType,
      character.visualPrompt,
      advanced.characterPromptSuffix,
    )),
    negativePrompt: sanitizePrompt(character.negativePrompt),
    center: {
      x: activeCharacters.length <= 1 ? 0.5 : (index + 1) / (activeCharacters.length + 1),
      y: 0.5,
    },
  }));
  const qualityTags = compileOptionalContent(
    advanced.qualityMode,
    profile.qualityTags,
    advanced.qualityText,
  );
  const requestedPreset = Number.isInteger(input.ucPreset) ? Number(input.ucPreset) : 0;
  const presetIndex = requestedPreset >= 0 && requestedPreset < profile.ucPresets.length
    ? requestedPreset
    : profile.ucPresets.length - 1;
  const selectedPreset = profile.ucPresets[presetIndex];
  const positivePrompt = joinPromptParts(buildCharacterCountTag(context), basePromptBody, qualityTags);
  const officialUc = sanitizePrompt(joinPromptParts(
    profile.prependNsfwToPreset && selectedPreset.name !== 'None' && !/\bnsfw\b/i.test(positivePrompt)
      ? 'nsfw'
      : '',
    selectedPreset.text,
  ));
  const ucLayer = compileOptionalContent(advanced.ucMode, officialUc, advanced.ucText);
  const baseNegativePrompt = sanitizePrompt(joinPromptParts(
    context?.sceneNegativePrompt || input.negativePrompt,
    context?.styleNegativePrompt,
    advanced.negativePromptAppend,
  ), activeCharacters.length > 1
    ? (segment) => COUNT_TAG_PATTERN.test(segment) || /^(?:multiple people|solo)$/i.test(segment)
    : undefined);
  const uc = sanitizePrompt(joinPromptParts(ucLayer, baseNegativePrompt));
  const positiveBudget = applyPromptBudget(positivePrompt, characterPrompts, POSITIVE_PROMPT_LIMIT);
  const negativeBudget = applyNegativeBudget(uc, characterPrompts, NEGATIVE_PROMPT_LIMIT);
  const budgetWarnings = [
    positiveBudget.truncated ? 'positive_prompt_truncated' : '',
    negativeBudget.truncated ? 'negative_prompt_truncated' : '',
  ].filter(Boolean);

  return {
    family: profile.family,
    basePrompt: positiveBudget.base,
    baseNegativePrompt: negativeBudget.base,
    characterPrompts: positiveBudget.characters.map((character, index) => ({
      ...character,
      negativePrompt: negativeBudget.characters[index]?.negativePrompt ?? '',
    })),
    qualityTags,
    uc,
    ucPreset: advanced.ucMode === 'off' || advanced.ucMode === 'replace'
      ? profile.ucPresets.length - 1
      : presetIndex,
    positiveBudget: {
      used: positiveBudget.used,
      limit: POSITIVE_PROMPT_LIMIT,
      truncated: positiveBudget.truncated,
    },
    negativeBudget: {
      used: negativeBudget.used,
      limit: NEGATIVE_PROMPT_LIMIT,
      truncated: negativeBudget.truncated,
    },
    truncated: positiveBudget.truncated || negativeBudget.truncated,
    warnings: budgetWarnings,
  };
}
