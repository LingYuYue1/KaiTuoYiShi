import type { STRegexScript } from '@/models/stTypes';

export type TavernRegexScriptKind = 'prompt_preprocess' | 'output_postprocess' | 'display_replace' | 'blocked';

export interface TavernRegexScriptSafety {
  kind: TavernRegexScriptKind;
  disabled: boolean;
  risky: boolean;
  blocksProtocolTags: boolean;
  reason: string;
}

export interface TavernRegexDryRunResult {
  ok: boolean;
  safety: TavernRegexScriptSafety;
  matches: number;
  before: string;
  after: string;
  warnings: string[];
  error?: string;
}

export interface TavernRegexApplyResult {
  text: string;
  applied: string[];
  skipped: string[];
}

const PROJECT_PROTOCOL_TAG_NAMES = [
  'thinking',
  'think',
  '思考',
  '正文',
  'body',
  'content',
  'text',
  '内容',
  '短期记忆',
  'memory',
  'summary',
  'recap',
  '记忆',
  '回忆',
  '命令',
  'command',
  'commands',
  'cmd',
  '动态世界',
  'world',
  'worldevent',
  '世界',
  '事件',
  '行动选项',
  'actions',
  'options',
  'choice',
  'choices',
  '选项',
  '变量草稿',
  'variableDraft',
  '变量候选',
  '变量线索',
  '变量摘要',
  '变量更新',
  '天气',
  '剧情规划',
  'storyPlan',
  'storyPlanning',
  '剧情计划',
  '剧情安排',
  '后续规划',
  '触发狭间',
  '狭间问答',
  '狭间评判',
];

const PROJECT_PROTOCOL_TAG_GROUP = PROJECT_PROTOCOL_TAG_NAMES
  .map((tag) => tag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))
  .join('|');
const PROTOCOL_TAG_RE = new RegExp(`<\\s*(?:${PROJECT_PROTOCOL_TAG_GROUP})\\s*>|<\\/\\s*(?:${PROJECT_PROTOCOL_TAG_GROUP})\\s*>`, 'i');
const SAFE_OUTPUT_CLEANUP_FIND_RE = /<!--|<\s*\/?\s*math\b|<\s*Q\b|<\s*\/\s*WF\b|\^\[[^\]]*(?:\\t|\\\\t|\s)[^\]]*\]\+|\^\\s\+/i;
const UNSAFE_REPLACEMENT_RE = /<\s*(?:style|script|details|summary|div|span|textarea|iframe|object|embed)\b|<\/\s*(?:style|script|details|summary|div|span|textarea|iframe|object|embed)\s*>/i;

function readScriptName(script: STRegexScript): string {
  return String(script.script_name ?? script.scriptName ?? script.name ?? script.id ?? '');
}

function readFindRegex(script: STRegexScript): string {
  return String(script.find_regex ?? script.findRegex ?? script.find ?? '');
}

function readReplaceString(script: STRegexScript): string {
  return String(script.replace_string ?? script.replaceString ?? script.replace ?? '');
}

export function normalizeTavernRegexScripts(raw: unknown): STRegexScript[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is STRegexScript => isRegexScriptLike(item));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([id, item]) => {
        if (!item || typeof item !== 'object') return null;
        const script = item as STRegexScript;
        return script.id ? script : { ...script, id };
      })
      .filter((item): item is STRegexScript => item !== null && isRegexScriptLike(item));
  }
  return [];
}

export function extractTavernRegexScripts(rawPreset: unknown): STRegexScript[] {
  if (!rawPreset || typeof rawPreset !== 'object') return [];
  const preset = rawPreset as Record<string, unknown>;
  const candidates: unknown[] = [];

  const pushPath = (...path: string[]) => {
    const value = readNestedValue(preset, path);
    if (value !== undefined) candidates.push(value);
  };

  // SillyTavern official regex extension stores preset scripts through
  // readPresetExtensionField({ path: 'regex_scripts' }); community exports may
  // preserve that field either at top level or under extension containers.
  pushPath('regex_scripts');
  pushPath('regexScripts');
  pushPath('extensions', 'regex_scripts');
  pushPath('extensions', 'regexScripts');
  pushPath('extensions', 'RegexBinding', 'regexes');
  pushPath('extensions', 'RegexBinding', 'regex_scripts');
  pushPath('extensions', 'RegexBinding', 'scripts');
  pushPath('extensions', 'SPreset', 'RegexBinding', 'regexes');
  pushPath('extensions', 'SPreset', 'RegexBinding', 'regex_scripts');
  pushPath('extensions', 'SPreset', 'RegexBinding', 'scripts');
  pushPath('extensions', 'SPreset', 'regex_scripts');
  pushPath('extensions', 'SPreset', 'regexScripts');
  pushPath('tavern_helper', 'scripts');
  pushPath('extensions', 'tavern_helper', 'scripts');

  return dedupeRegexScripts(candidates.flatMap(normalizeTavernRegexScripts));
}

function readNestedValue(source: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isRegexScriptLike(raw: unknown): raw is STRegexScript {
  if (!raw || typeof raw !== 'object') return false;
  const script = raw as STRegexScript;
  return readFindRegex(script).trim().length > 0;
}

function dedupeRegexScripts(scripts: STRegexScript[]): STRegexScript[] {
  const seen = new Set<string>();
  const result: STRegexScript[] = [];
  scripts.forEach((script, index) => {
    const key = [
      script.id ?? '',
      readScriptName(script),
      readFindRegex(script),
      readReplaceString(script),
    ].join('\u0000') || `index_${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(script);
  });
  return result;
}

export function analyzeTavernRegexScript(script: STRegexScript): TavernRegexScriptSafety {
  const disabled = isScriptDisabled(script);
  const combined = [
    script.id,
    readScriptName(script),
    readFindRegex(script),
    readReplaceString(script),
    JSON.stringify(script.placement ?? ''),
  ].map((item) => String(item ?? '')).join('\n');
  const blocksProtocolTags = PROTOCOL_TAG_RE.test(combined);
  const displayLike = /display|html|css|dom|style|界面|显示|渲染|全局/i.test(combined);
  const outputLike = /output|response|reply|assistant|post/i.test(combined);
  const promptLike = /prompt|input|request|system|user/i.test(combined);
  const safeCleanupLike = isSafeOutputCleanupCandidate(script);

  if (safeCleanupLike) {
    return {
      kind: 'output_postprocess',
      disabled,
      risky: false,
      blocksProtocolTags,
      reason: '安全输出清理脚本：仅允许删除注释、抗截断/抗空回占位或缩进噪声',
    };
  }

  if (displayLike) {
    return {
      kind: 'display_replace',
      disabled,
      risky: true,
      blocksProtocolTags,
      reason: '显示层/CSS/DOM/全局替换类脚本默认不执行',
    };
  }

  if (blocksProtocolTags) {
    return {
      kind: 'blocked',
      disabled,
      risky: true,
      blocksProtocolTags,
      reason: '可能改写项目协议标签，默认阻止执行',
    };
  }

  if (outputLike) {
    return {
      kind: 'output_postprocess',
      disabled,
      risky: false,
      blocksProtocolTags,
      reason: '输出后处理脚本仅允许未来显式开启后作用于临时文本',
    };
  }

  if (promptLike) {
    return {
      kind: 'prompt_preprocess',
      disabled,
      risky: false,
      blocksProtocolTags,
      reason: '提示词预处理脚本仅允许未来显式开启后作用于预设文本副本',
    };
  }

  return {
    kind: 'blocked',
    disabled,
    risky: true,
    blocksProtocolTags,
    reason: '无法确认作用域的正则脚本默认不执行',
  };
}

export function applyTavernOutputRegexScripts(rawText: string, rawPreset: unknown): TavernRegexApplyResult {
  let text = String(rawText ?? '');
  const scripts = extractTavernRegexScripts(rawPreset);
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const script of scripts) {
    const name = readScriptName(script) || String(script.id ?? 'regex_script');
    const safety = analyzeTavernRegexScript(script);
    if (safety.disabled) {
      skipped.push(`${name}: disabled`);
      continue;
    }
    if (!isSafeOutputCleanupCandidate(script) || safety.kind !== 'output_postprocess' || safety.risky) {
      skipped.push(`${name}: ${safety.reason}`);
      continue;
    }

    try {
      const source = readFindRegex(script);
      const replace = readReplaceString(script);
      if (!source.trim()) {
        skipped.push(`${name}: empty find_regex`);
        continue;
      }
      if (UNSAFE_REPLACEMENT_RE.test(replace)) {
        skipped.push(`${name}: unsafe replacement markup`);
        continue;
      }
      const { pattern, flags } = parseRegexSourceAndFlags(source, readRegexFlags(script));
      const regex = new RegExp(pattern, flags);
      const before = text;
      const after = text.replace(regex, (...args) =>
        replace.replace(/\$(\d+)/g, (_m, index) => String(args[Number(index)] ?? '')),
      );
      if (after === before) continue;
      if (wouldRemoveProtocolTags(before, after)) {
        skipped.push(`${name}: would remove project protocol tags`);
        continue;
      }
      text = after;
      applied.push(name);
    } catch (error) {
      skipped.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { text, applied, skipped };
}

function isSafeOutputCleanupCandidate(script: STRegexScript): boolean {
  const find = readFindRegex(script);
  const replace = readReplaceString(script);
  if (UNSAFE_REPLACEMENT_RE.test(replace)) return false;
  if (PROTOCOL_TAG_RE.test(`${find}\n${replace}`)) return false;
  return SAFE_OUTPUT_CLEANUP_FIND_RE.test(find);
}

export function dryRunTavernRegexScript(script: STRegexScript, sampleText: string): TavernRegexDryRunResult {
  const safety = analyzeTavernRegexScript(script);
  const warnings: string[] = [];
  const before = String(sampleText ?? '');
  if (safety.kind === 'blocked' || safety.kind === 'display_replace') {
    warnings.push(safety.reason);
  }
  if (safety.blocksProtocolTags) {
    warnings.push('检测到项目协议标签风险：正文/短期记忆/动态世界/行动选项/变量草稿/变量更新/天气/剧情规划。');
  }

  try {
    const source = readFindRegex(script);
    if (!source.trim()) {
      return { ok: false, safety, matches: 0, before, after: before, warnings, error: 'find_regex 为空' };
    }

    const { pattern, flags } = parseRegexSourceAndFlags(source, readRegexFlags(script));
    const regex = new RegExp(pattern, flags);
    let matches = 0;
    const after = before.replace(regex, (...args) => {
      matches += 1;
      const replace = readReplaceString(script);
      return replace.replace(/\$(\d+)/g, (_m, index) => String(args[Number(index)] ?? ''));
    });

    if (wouldRemoveProtocolTags(before, after)) {
      warnings.push('替换结果会删除或改写项目协议标签，真实运行时必须阻止。');
      return { ok: false, safety: { ...safety, risky: true, blocksProtocolTags: true }, matches, before, after, warnings };
    }

    return { ok: !safety.risky, safety, matches, before, after, warnings };
  } catch (error) {
    return {
      ok: false,
      safety,
      matches: 0,
      before,
      after: before,
      warnings,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isScriptDisabled(script: STRegexScript): boolean {
  const disabled = (script as { disabled?: unknown }).disabled;
  return disabled === true || disabled === 1 || disabled === 'true';
}

function readRegexFlags(script: STRegexScript): string {
  const raw = String((script as { flags?: unknown }).flags ?? '');
  const flags = new Set(['g']);
  for (const flag of raw) {
    if ('gimsuy'.includes(flag)) flags.add(flag);
  }
  return [...flags].join('');
}

function parseRegexSourceAndFlags(source: string, fallbackFlags: string): { pattern: string; flags: string } {
  const trimmed = source.trim();
  if (!trimmed.startsWith('/')) return { pattern: source, flags: fallbackFlags };
  let escaped = false;
  for (let i = trimmed.length - 1; i > 0; i -= 1) {
    const char = trimmed[i];
    if (char === '/' && !escaped) {
      const pattern = trimmed.slice(1, i);
      const suffix = trimmed.slice(i + 1);
      if (/^[gimsuy]*$/.test(suffix)) {
        const flags = new Set(fallbackFlags.split('').filter(Boolean));
        for (const flag of suffix) flags.add(flag);
        return { pattern, flags: [...flags].join('') };
      }
      return { pattern: source, flags: fallbackFlags };
    }
    escaped = char === '\\' ? !escaped : false;
  }
  return { pattern: source, flags: fallbackFlags };
}

function wouldRemoveProtocolTags(before: string, after: string): boolean {
  const beforeTags = before.match(new RegExp(PROTOCOL_TAG_RE.source, 'gi')) ?? [];
  if (beforeTags.length === 0) return false;
  const afterTags = after.match(new RegExp(PROTOCOL_TAG_RE.source, 'gi')) ?? [];
  return afterTags.length < beforeTags.length;
}
