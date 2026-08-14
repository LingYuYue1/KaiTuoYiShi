export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeSaveId(value: unknown): number | null {
  const id = Math.floor(Number(value));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeNodeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function toError(error: unknown, fallback = '存档数据库操作失败。'): Error {
  return error instanceof Error ? error : new Error(fallback);
}
