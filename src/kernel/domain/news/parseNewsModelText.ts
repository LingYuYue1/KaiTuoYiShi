/**
 * Parse model JSON text into KernelNewsGenerationPatch (Stage 5.3).
 *
 * Accepts either English formal field names or legacy Chinese keys
 * (新增/更新/删除). Malformed JSON or illegal shapes → throw.
 */

import type {
  KernelNewsEntry,
  KernelNewsGenerationPatch,
  KernelNewsUpdate,
} from './types';

/**
 * Parse a news-model JSON payload into a formal generation patch.
 * Does not apply the patch — caller passes the result to applyNewsPatch.
 */
export function parseNewsModelText(rawText: string): KernelNewsGenerationPatch {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error('parseNewsModelText: rawText must be a non-empty string');
  }

  const candidate = extractJsonCandidate(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`parseNewsModelText: malformed JSON: ${message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('parseNewsModelText: root must be a JSON object');
  }

  const root = parsed as Record<string, unknown>;
  const addRaw = pickArray(root, 'add', '新增');
  const updateRaw = pickArray(root, 'update', '更新');
  const removeRaw = pickArray(root, 'removeIds', '删除');

  const add = addRaw.map((item, index) => parseAddEntry(item, index));
  const update = updateRaw.map((item, index) => parseUpdate(item, index));
  const removeIds = removeRaw.map((item, index) => parseRemoveId(item, index));

  return { add, update, removeIds };
}

function pickArray(
  root: Record<string, unknown>,
  formalKey: string,
  legacyKey: string,
): unknown[] {
  const hasFormal = formalKey in root;
  const hasLegacy = legacyKey in root;
  if (hasFormal && hasLegacy) {
    throw new Error(
      `parseNewsModelText: cannot provide both ${formalKey} and ${legacyKey}`,
    );
  }
  if (!hasFormal && !hasLegacy) {
    return [];
  }
  const key = hasFormal ? formalKey : legacyKey;
  const value = root[key];
  if (!Array.isArray(value)) {
    throw new Error(`parseNewsModelText: ${key} must be an array`);
  }
  return value;
}

function parseAddEntry(item: unknown, index: number): KernelNewsEntry {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`parseNewsModelText: add[${index}] must be an object`);
  }
  const row = item as Record<string, unknown>;
  const id = requireStringField(row, 'id', `add[${index}].id`);
  const title = requireStringField(row, 'title', `add[${index}].title`, '标题');
  const body = requireStringField(row, 'body', `add[${index}].body`, '正文', true);
  const issueNumber = requireNumberField(
    row,
    'issueNumber',
    `add[${index}].issueNumber`,
  );
  const createdAtTurn = requireNumberField(
    row,
    'createdAtTurn',
    `add[${index}].createdAtTurn`,
    '回合',
  );
  return { id, title, body, issueNumber, createdAtTurn };
}

function parseUpdate(item: unknown, index: number): KernelNewsUpdate {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`parseNewsModelText: update[${index}] must be an object`);
  }
  const row = item as Record<string, unknown>;
  const id = requireStringField(row, 'id', `update[${index}].id`);
  const title = requireStringField(row, 'title', `update[${index}].title`, '标题');
  const body = requireStringField(row, 'body', `update[${index}].body`, '正文', true);
  return { id, title, body };
}

function parseRemoveId(item: unknown, index: number): string {
  if (typeof item !== 'string' || item.trim().length === 0) {
    throw new Error(`parseNewsModelText: removeIds[${index}] must be a non-empty string`);
  }
  return item.trim();
}

function requireStringField(
  row: Record<string, unknown>,
  formalKey: string,
  label: string,
  legacyKey?: string,
  allowEmpty = false,
): string {
  const value = formalKey in row
    ? row[formalKey]
    : legacyKey && legacyKey in row
      ? row[legacyKey]
      : undefined;
  if (typeof value !== 'string') {
    throw new Error(`parseNewsModelText: ${label} must be a string`);
  }
  if (!allowEmpty && value.trim().length === 0) {
    throw new Error(`parseNewsModelText: ${label} must be a non-empty string`);
  }
  return value;
}

function requireNumberField(
  row: Record<string, unknown>,
  formalKey: string,
  label: string,
  legacyKey?: string,
): number {
  const value = formalKey in row
    ? row[formalKey]
    : legacyKey && legacyKey in row
      ? row[legacyKey]
      : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`parseNewsModelText: ${label} must be a finite number`);
  }
  return value;
}

function extractJsonCandidate(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const inner = fenced[1].trim();
    if (inner.startsWith('{') && inner.endsWith('}')) {
      return inner;
    }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error('parseNewsModelText: no JSON object found in rawText');
}
