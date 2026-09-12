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

/** 返回浅拷贝并省略指定键；用于载荷剥离，不修改入参。 */
export function omitKeys<T extends object, K extends keyof T>(payload: T, keys: readonly K[]): Omit<T, K> {
  const omitted = new Set<PropertyKey>(keys);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!omitted.has(key)) result[key] = value;
  }
  return result as Omit<T, K>;
}
