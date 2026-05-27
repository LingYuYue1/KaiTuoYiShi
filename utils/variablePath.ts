// 路径解析与按路径修改 state 的工具。
// 设计参考：墨色项目 utils/stateHelpers.ts 的 应用路径命令 / 解析路径片段。
// 关键不同：我们不区分 "gameState." 前缀（前端协议直接用根名），路径使用当前中文 schema 根名。
//
// 支持的路径语法：
//   foo                       根字段
//   foo.bar                   对象字段
//   foo.bar.baz               嵌套对象
//   foo[0]                    数组索引
//   foo[0].bar                数组元素的字段
//   foo[id=abc].bar           按 id 字段匹配数组元素的字段（语法糖；解析时转成具体 index）

import type { 变量命令动作 } from '@/models/variableCommand';

export type PathToken = string | number;

const 深拷贝 = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const 是对象 = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const 深合并对象 = (left: unknown, right: unknown): unknown => {
  if (Array.isArray(right)) return 深拷贝(right);
  if (!是对象(right)) return 深拷贝(right);
  const seed: Record<string, unknown> = 是对象(left) ? 深拷贝(left as Record<string, unknown>) : {};
  Object.entries(right).forEach(([k, v]) => {
    seed[k] = 深合并对象(seed[k], v);
  });
  return seed;
};

/** 把路径字符串拆成片段。`foo.bar[0].baz` → ['foo','bar',0,'baz'] */
export function 解析路径片段(rawPath: string): PathToken[] {
  const tokens: PathToken[] = [];
  // 匹配三种：纯字段名、[数字]、[key=value] 语法糖（保留原样为字符串）
  const regex = /([^.\[\]]+)|\[(\d+)\]|\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawPath || ''))) {
    if (match[1]) tokens.push(match[1]);
    else if (match[2] !== undefined) tokens.push(Number(match[2]));
    else if (match[3] !== undefined) tokens.push(`[${match[3]}]`); // 包一层 [] 留给后续 resolveByMatcher
  }
  return tokens;
}

/** 把 `[id=abc]` 这种匹配语法糖在 rootValue 上转成具体 index。失败返回 null。 */
function 解析数组匹配语法糖(tokens: PathToken[], rootValue: unknown): PathToken[] | null {
  if (rootValue == null) return tokens; // 没有数据，原样返回，让后续报路径未登记
  const result: PathToken[] = [];
  let cursor: unknown = rootValue;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (typeof t === 'string' && t.startsWith('[') && t.endsWith(']')) {
      if (!Array.isArray(cursor)) return null;
      const inner = t.slice(1, -1); // 形如 "id=abc"
      const eq = inner.indexOf('=');
      if (eq < 0) return null;
      const field = inner.slice(0, eq).trim();
      const expected = inner.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      const idx = (cursor as Array<Record<string, unknown>>).findIndex((item) =>
        item ? matchArrayItem(item, field, expected) : false,
      );
      if (idx < 0) return null;
      result.push(idx);
      cursor = (cursor as unknown[])[idx];
      continue;
    }
    result.push(t);
    if (cursor == null) return result.concat(tokens.slice(i + 1));
    if (typeof t === 'number') {
      cursor = Array.isArray(cursor) ? cursor[t] : undefined;
    } else {
      cursor = 是对象(cursor) ? cursor[t] : undefined;
    }
  }
  return result;
}

function matchArrayItem(item: Record<string, unknown>, field: string, expected: string): boolean {
  const normalizedExpected = expected.trim();
  if (!normalizedExpected) return false;
  const expectedLower = normalizedExpected.toLowerCase();
  const value = item[field];
  if (typeof value === 'string') {
    const normalizedValue = value.trim();
    if (normalizedValue === normalizedExpected || normalizedValue.toLowerCase() === expectedLower) return true;
  }

  if (field === 'id') {
    const aliases = [item.id, item.姓名, item.name, item.名称, item.名字, item.别名];
    return aliases.some((alias) => {
      if (typeof alias !== 'string') return false;
      const normalizedAlias = alias.trim();
      return normalizedAlias === normalizedExpected || normalizedAlias.toLowerCase() === expectedLower;
    });
  }

  return false;
}

export interface 应用结果 {
  ok: boolean;
  nextRootValue: unknown;
  reason?: string;
}

/** 在 rootValue 上按 path 应用 action+value，返回新 root（不修改原对象）。
 *  rootValue 可以是 object / array / undefined。tokens 为空时直接对 rootValue 做整段操作。 */
export function 应用路径命令(
  rootValue: unknown,
  rawPath: string,
  action: 变量命令动作,
  nextValue: unknown,
): 应用结果 {
  const rawTokens = 解析路径片段(rawPath);
  const tokens = 解析数组匹配语法糖(rawTokens, rootValue);
  if (tokens === null) {
    return { ok: false, nextRootValue: rootValue, reason: '数组匹配语法 [id=xxx] 未找到对应元素' };
  }

  // 空路径：直接对根做整段操作
  if (tokens.length === 0) {
    if (action === 'delete') return { ok: true, nextRootValue: undefined };
    if (action === 'push') {
      const base = Array.isArray(rootValue) ? 深拷贝(rootValue) : [];
      base.push(深拷贝(nextValue));
      return { ok: true, nextRootValue: base };
    }
    if (action === 'add') return { ok: true, nextRootValue: (Number(rootValue) || 0) + (Number(nextValue) || 0) };
    if (action === 'sub') return { ok: true, nextRootValue: (Number(rootValue) || 0) - (Number(nextValue) || 0) };
    if (是对象(rootValue) && 是对象(nextValue)) {
      return { ok: true, nextRootValue: 深合并对象(rootValue, nextValue) };
    }
    return { ok: true, nextRootValue: 深拷贝(nextValue) };
  }

  // 有路径：克隆根，定位到倒数第二级，再操作最后一级
  const draft: unknown =
    rootValue === undefined
      ? typeof tokens[0] === 'number'
        ? []
        : {}
      : 深拷贝(rootValue);

  let cursor: unknown = draft;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (typeof t === 'number') {
      if (!Array.isArray(cursor)) return { ok: false, nextRootValue: rootValue, reason: `路径 ${rawPath} 在 [${t}] 处不是数组` };
      if (cursor[t] === undefined || cursor[t] === null) cursor[t] = typeof next === 'number' ? [] : {};
      cursor = cursor[t];
    } else {
      if (!是对象(cursor)) return { ok: false, nextRootValue: rootValue, reason: `路径 ${rawPath} 在 .${t} 处不是对象` };
      const c = cursor as Record<string, unknown>;
      if (c[t] === undefined || c[t] === null || typeof c[t] !== 'object') {
        c[t] = typeof next === 'number' ? [] : {};
      }
      cursor = c[t];
    }
  }

  const last = tokens[tokens.length - 1];

  // 处理 number last（数组索引）
  if (typeof last === 'number') {
    if (!Array.isArray(cursor)) return { ok: false, nextRootValue: rootValue, reason: `路径 ${rawPath} 末端 [${last}] 不是数组` };
    if (action === 'delete') {
      if (last >= 0 && last < cursor.length) cursor.splice(last, 1);
      return { ok: true, nextRootValue: draft };
    }
    if (action === 'push') {
      const current = Array.isArray(cursor[last]) ? (cursor[last] as unknown[]) : [];
      current.push(深拷贝(nextValue));
      cursor[last] = current;
      return { ok: true, nextRootValue: draft };
    }
    if (action === 'add') {
      cursor[last] = (Number(cursor[last]) || 0) + (Number(nextValue) || 0);
      return { ok: true, nextRootValue: draft };
    }
    if (action === 'sub') {
      cursor[last] = (Number(cursor[last]) || 0) - (Number(nextValue) || 0);
      return { ok: true, nextRootValue: draft };
    }
    cursor[last] = 深拷贝(nextValue);
    return { ok: true, nextRootValue: draft };
  }

  // 处理 string last（对象字段）
  if (!是对象(cursor)) return { ok: false, nextRootValue: rootValue, reason: `路径 ${rawPath} 末端父节点不是对象` };
  const obj = cursor as Record<string, unknown>;
  if (action === 'delete') {
    delete obj[last];
    return { ok: true, nextRootValue: draft };
  }
  if (action === 'push') {
    const current = Array.isArray(obj[last]) ? (obj[last] as unknown[]) : [];
    current.push(深拷贝(nextValue));
    obj[last] = current;
    return { ok: true, nextRootValue: draft };
  }
  if (action === 'add') {
    obj[last] = (Number(obj[last]) || 0) + (Number(nextValue) || 0);
    return { ok: true, nextRootValue: draft };
  }
  if (action === 'sub') {
    obj[last] = (Number(obj[last]) || 0) - (Number(nextValue) || 0);
    return { ok: true, nextRootValue: draft };
  }
  if (是对象(obj[last]) && 是对象(nextValue)) {
    obj[last] = 深合并对象(obj[last], nextValue);
    return { ok: true, nextRootValue: draft };
  }
  obj[last] = 深拷贝(nextValue);
  return { ok: true, nextRootValue: draft };
}

/** 只读取路径上的值（用于校验路径是否存在）。 */
export function 读取路径值(rootValue: unknown, rawPath: string): { exists: boolean; value: unknown } {
  const rawTokens = 解析路径片段(rawPath);
  const tokens = 解析数组匹配语法糖(rawTokens, rootValue);
  if (tokens === null) return { exists: false, value: undefined };

  let cursor: unknown = rootValue;
  for (const t of tokens) {
    if (cursor == null) return { exists: false, value: undefined };
    if (typeof t === 'number') {
      if (!Array.isArray(cursor) || t < 0 || t >= cursor.length) return { exists: false, value: undefined };
      cursor = cursor[t];
    } else {
      if (!是对象(cursor) || !(t in cursor)) return { exists: false, value: undefined };
      cursor = cursor[t];
    }
  }
  return { exists: true, value: cursor };
}
