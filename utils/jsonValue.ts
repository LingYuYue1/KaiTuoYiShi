/**
 * JSON 边界工具：对象属性中的 undefined 表示省略，数组元素中的 undefined
 * 和其他不可序列化值则必须拒绝。变量运行时不再依赖 JSON.stringify 往返做 clone。
 */

export interface JsonValueIssue {
  path: string;
  code: 'undefined_array_element' | 'undefined_root' | 'non_finite_number' | 'unsupported_type' | 'circular';
  message: string;
}

export class JsonValueError extends Error {
  readonly issues: JsonValueIssue[];

  constructor(issues: JsonValueIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
    this.name = 'JsonValueError';
    this.issues = issues;
  }
}

function formatPath(parent: string, key: string | number): string {
  return typeof key === 'number' ? `${parent}[${key}]` : `${parent}.${key}`;
}

function cloneJsonValueInternal(value: unknown, path: string, ancestors: WeakSet<object>): unknown {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new JsonValueError([{
        path,
        code: 'non_finite_number',
        message: '数字必须是有限数值',
      }]);
    }
    return value;
  }

  if (typeof value !== 'object') {
    throw new JsonValueError([{
      path,
      code: 'unsupported_type',
      message: `不支持的 JSON 类型：${typeof value}`,
    }]);
  }

  if (ancestors.has(value)) {
    throw new JsonValueError([{
      path,
      code: 'circular',
      message: '检测到循环引用',
    }]);
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        if (item === undefined) {
          throw new JsonValueError([{
            path: formatPath(path, index),
            code: 'undefined_array_element',
            message: '数组元素不能是 undefined',
          }]);
        }
        return cloneJsonValueInternal(item, formatPath(path, index), ancestors);
      });
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new JsonValueError([{
        path,
        code: 'unsupported_type',
        message: '只允许普通对象进入 JSON 变量边界',
      }]);
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      result[key] = cloneJsonValueInternal(item, formatPath(path, key), ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

/** 内部变量 clone：允许根值为 undefined，但会省略对象中的 undefined。 */
export function cloneJsonValue<T>(value: T): T {
  return cloneJsonValueInternal(value, '$', new WeakSet<object>()) as T;
}

export interface JsonCanonicalizeResult<T> {
  ok: boolean;
  value?: T;
  issues: JsonValueIssue[];
}

/** 持久化/回执边界 canonicalize：根值为 undefined 也视为非法。 */
export function canonicalizeJsonValue<T>(value: T): JsonCanonicalizeResult<T> {
  if (value === undefined) {
    return {
      ok: false,
      issues: [{ path: '$', code: 'undefined_root', message: '根值不能是 undefined' }],
    };
  }

  try {
    return {
      ok: true,
      value: cloneJsonValue(value),
      issues: [],
    };
  } catch (error) {
    if (error instanceof JsonValueError) {
      return { ok: false, issues: error.issues };
    }
    return {
      ok: false,
      issues: [{ path: '$', code: 'unsupported_type', message: error instanceof Error ? error.message : String(error) }],
    };
  }
}
