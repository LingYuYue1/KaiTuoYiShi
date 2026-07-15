/**
 * Pure: parse <变量更新> blocks into candidate VariableDomainCommand[].
 *
 * Extracted/adapted from utils/variableExecutor.parseVariableCommands logic
 * without React setters, VariableState, or registry side effects.
 *
 * Output is **candidates only** — formal apply happens in reduceVariables /
 * reduceTurn, then a single SessionRepository CAS.
 */

import type { VariableAction, VariableDomainCommand } from './types';

const VARIABLE_BLOCK_RE = /<变量更新>([\s\S]*?)<\/变量更新>/i;
const ACTIONS = new Set<VariableAction>(['set', 'add', 'sub', 'push', 'delete']);

export type ParseVariableBlockResult = Readonly<{
  commands: readonly VariableDomainCommand[];
  parseErrors: readonly string[];
  /** Raw inner text of the first <变量更新> block, if any. */
  blockText: string | null;
}>;

/**
 * Parse variable commands from full model / narrative text.
 * Sync pure — no I/O.
 */
export function parseVariableBlock(rawText: string): ParseVariableBlockResult {
  if (typeof rawText !== 'string') {
    return { commands: [], parseErrors: ['rawText must be a string'], blockText: null };
  }

  const blockMatch = rawText.match(VARIABLE_BLOCK_RE);
  if (!blockMatch) {
    return { commands: [], parseErrors: [], blockText: null };
  }

  const blockText = blockMatch[1] ?? '';
  const commands: VariableDomainCommand[] = [];
  const parseErrors: string[] = [];
  const lines = splitCommandLines(cleanBlock(blockText));

  for (const line of lines) {
    const parsedLine = parseCommandLine(line);
    if (!parsedLine) {
      parseErrors.push(`无法解析：${line.slice(0, 160)}`);
      continue;
    }

    const { action, key, valueRaw } = parsedLine;
    if (!ACTIONS.has(action)) {
      parseErrors.push(`未知动作：${action}`);
      continue;
    }

    if (action !== 'delete' && valueRaw === undefined) {
      parseErrors.push(`${action} 缺少值：${line}`);
      continue;
    }

    if (isPlaceholderValue(valueRaw)) {
      continue;
    }

    let value: unknown = null;
    if (action !== 'delete' && valueRaw !== undefined) {
      const parsedValue = parseJsonValue(valueRaw);
      if (!parsedValue.ok) {
        parseErrors.push(`${parsedValue.reason}；命令：${line.slice(0, 160)}`);
        continue;
      }
      value = parsedValue.value;
    }

    commands.push({ action, key, value });
  }

  return { commands, parseErrors, blockText };
}

/**
 * Strip the first <变量更新>…</变量更新> block from model text.
 */
export function stripVariableBlock(text: string): string {
  return text.replace(/<变量更新>[\s\S]*?<\/变量更新>/i, '');
}

function cleanBlock(block: string): string {
  return block
    .replace(/```(?:json|JSON)?/g, '')
    .replace(/```/g, '')
    .trim();
}

function splitCommandLines(block: string): string[] {
  const output: string[] = [];
  let current = '';

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    const startsCommand =
      /^(set|add|sub|push|delete)\s+/i.test(line) ||
      /^[\w一-龥.[\]_-]+\s*[=＝]/.test(line);

    if (!current) {
      current = line;
      continue;
    }

    const eqIndex = findAssignmentEquals(current);
    const valuePart = eqIndex >= 0 ? current.slice(eqIndex + 1).trim() : '';
    const currentJsonOpen = Boolean(valuePart) && !jsonBracketsClosed(valuePart);

    if (startsCommand && !currentJsonOpen) {
      output.push(current);
      current = line;
    } else {
      current += `\n${line}`;
    }
  }

  if (current) output.push(current);
  return output;
}

function parseCommandLine(
  line: string,
): { action: VariableAction; key: string; valueRaw?: string } | null {
  const head = line.match(/^(set|add|sub|push|delete)\s+/i);
  const action = (head ? head[1].toLowerCase() : 'set') as VariableAction;
  const rest = (head ? line.slice(head[0].length) : line).trim();
  if (!rest) return null;

  const eqIndex = findAssignmentEquals(rest);
  if (eqIndex < 0) {
    return { action, key: rest.trim() };
  }
  const key = rest.slice(0, eqIndex).trim();
  const valueRaw = rest.slice(eqIndex + 1).trim();
  if (!key) return null;
  return { action, key, valueRaw };
}

function findAssignmentEquals(line: string): number {
  let bracketDepth = 0;
  let braceDepth = 0;
  let parenDepth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (inString) {
      if (ch === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (
      (ch === '=' || ch === '＝') &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      parenDepth === 0
    ) {
      return i;
    }
  }
  return -1;
}

function jsonBracketsClosed(value: string): boolean {
  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (inString) {
      if (ch === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
  }
  return depth <= 0 && !inString;
}

function parseJsonValue(
  raw: string,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json|JSON)?\s*/, '')
    .replace(/```$/, '')
    .trim();
  if (!trimmed) return { ok: false, reason: '空值' };

  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    const repaired = trimmed
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/：/g, ':')
      .replace(/,\s*([}\]])/g, '$1');
    try {
      return { ok: true, value: JSON.parse(repaired) };
    } catch {
      if (/^[A-Za-z_一-龥][\w一-龥\s-]*$/.test(trimmed)) {
        return { ok: true, value: trimmed };
      }
      return { ok: false, reason: `JSON 值无法解析：${trimmed.slice(0, 120)}` };
    }
  }
}

function isPlaceholderValue(raw: string | undefined): boolean {
  if (!raw) return false;
  const text = raw.trim();
  return (
    /\.\.\./.test(text) ||
    /[{,]\s*(id|回合|摘要|名称|描述)\s*[,}]/.test(text) ||
    text === '{id,名称,描述,...}' ||
    text === '{名称,描述,...}'
  );
}
