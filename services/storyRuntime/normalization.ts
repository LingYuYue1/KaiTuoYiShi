// G1.2.3 归一化模块（生产，只读；当前不得被现有运行流程 import）。
// - canonicalJsonStringify：确定性 canonical JSON 序列化，只接受普通 JSON 值；
//   对象键递归排序、数组顺序保留、字符串内容不被 trim；非法容器（symbol/隐藏字段/getter/setter/
//   custom prototype/sparse/extra 数组、undefined/bigint/function/NaN/Infinity/Date/Map/Set/RegExp/循环引用）
//   拒绝并带稳定路径；检查 descriptor 不读取 accessor（getter 调用次数保持 0）。
// - normalizeLegacyText：旧文本字段专用归一化（trim + CRLF->LF + NFC），幂等（连续两次字节相同）。
// - 纯读取：不修改输入，不使用 JSON round-trip 预清洗非法容器。
// ── 内部容器形态检查（不含任何 schema 字段，是通用 plain JSON 规则）──
function isStrictPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkPlainObject(value: unknown, path: string): void {
  if (!isStrictPlainObject(value)) {
    throw new Error(path + ': 必须是普通对象（prototype 只能为 Object.prototype 或 null，拒绝 Date/Map/Set/RegExp/custom class 实例）');
  }
  for (const key of Reflect.ownKeys(value as object)) {
    const d = Object.getOwnPropertyDescriptor(value as object, key);
    if (!d) throw new Error(path + ': 属性描述符缺失 -> ' + String(key));
    if (typeof d.get === 'function' || typeof d.set === 'function') throw new Error(path + ': 不允许 getter/setter 属性 -> ' + String(key));
    if (typeof key === 'symbol') throw new Error(path + ': 不允许 symbol 键 -> ' + String(key));
    if (!d.enumerable) throw new Error(path + ': 不允许不可枚举隐藏字段 -> ' + String(key));
  }
}

function checkArrayShape(value: unknown, path: string): void {
  if (!Array.isArray(value)) throw new Error(path + ': 必须是数组');
  if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error(path + ': 数组 prototype 必须是 Array.prototype');
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error(path + ': 数组不允许 symbol 键');
  for (let i = 0; i < value.length; i += 1) {
    const d = Object.getOwnPropertyDescriptor(value, i);
    if (!d) throw new Error(path + '[' + i + ']: 数组存在 sparse hole（缺少索引 own property）');
    if (!d.enumerable) throw new Error(path + '[' + i + ']: 数组索引不可枚举（隐藏字段）');
    if (typeof d.get === 'function' || typeof d.set === 'function') throw new Error(path + '[' + i + ']: 数组索引不允许 getter/setter');
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'length') continue;
    if (/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) continue;
    throw new Error(path + ': 数组存在索引之外的自有键 -> ' + JSON.stringify(key));
  }
}

// 递归 JSON 值检查：祖先链"进入 add 离开 delete"——真实循环拒绝，共享非循环子对象通过。
function checkJsonValue(value: unknown, path: string, ancestors: WeakSet<object>): void {
  if (value === null) return;
  const t = typeof value;
  if (t === 'undefined') throw new Error(path + ': undefined 不是合法 JSON 值');
  if (t === 'bigint') throw new Error(path + ': bigint 不是合法 JSON 值');
  if (t === 'function' || t === 'symbol') throw new Error(path + ': ' + t + ' 不是合法 JSON 值');
  if (t === 'number' && !Number.isFinite(value)) throw new Error(path + ': NaN/Infinity 不是合法 JSON 值');
  if (t !== 'object') return;
  if (ancestors.has(value as object)) throw new Error(path + ': 循环引用不是合法 JSON 值');
  if (Array.isArray(value)) {
    checkArrayShape(value, path);
    ancestors.add(value);
    for (let i = 0; i < value.length; i += 1) checkJsonValue(value[i], path + '[' + i + ']', ancestors);
    ancestors.delete(value);
    return;
  }
  checkPlainObject(value, path);
  ancestors.add(value as object);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    checkJsonValue(child, path + '.' + key, ancestors);
  }
  ancestors.delete(value as object);
}

/**
 * 校验任意输入是否为合法普通 JSON 值；非法时抛错并带稳定路径。
 * 纯读取：不修改输入；descriptor 检查不读取 accessor。
 */
export function assertPlainJsonValue(value: unknown, path = 'value'): void {
  checkJsonValue(value, path, new WeakSet());
}

/**
 * 确定性 canonical JSON 序列化（对象键递归排序、数组顺序保留、字符串内容不 trim）。
 * 只接受普通 JSON 值；非法容器与循环引用抛错（带路径）；同一输入两次序列化字节相同。
 * 祖先链"进入 add 离开 delete"：真实循环拒绝，共享非循环子对象通过。
 */
export function canonicalJsonStringify(value: unknown): string {
  return canonicalJsonStringifyInner(value, new WeakSet<object>(), '$');
}

function childPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? path + '.' + key : path + '[' + JSON.stringify(key) + ']';
}

function canonicalJsonStringifyInner(value: unknown, ancestors: WeakSet<object>, path: string): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new Error(path + ': NaN/Infinity 不是合法 JSON 值');
    return String(value);
  }
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'undefined' || t === 'bigint' || t === 'function' || t === 'symbol') {
    throw new Error(path + ': ' + t + ' 不是合法 JSON 值');
  }
  if (ancestors.has(value as object)) throw new Error(path + ': 循环引用不是合法 JSON 值');
  if (Array.isArray(value)) {
    checkArrayShape(value, path);
    ancestors.add(value);
    const parts: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      parts.push(canonicalJsonStringifyInner(value[index], ancestors, path + '[' + index + ']'));
    }
    const out = '[' + parts.join(',') + ']';
    ancestors.delete(value);
    return out;
  }
  checkPlainObject(value, path);
  ancestors.add(value as object);
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out = '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalJsonStringifyInner(obj[key], ancestors, childPath(path, key))).join(',') + '}';
  ancestors.delete(value as object);
  return out;
}

/**
 * 旧文本字段专用归一化：trim + CRLF->LF + NFC。幂等：同一输入连续两次执行字节相同。
 */
export function normalizeLegacyText(input: string): string {
  let out = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  out = out.normalize('NFC').trim();
  return out;
}

/**
 * 语义摘要（供 ID 等模块使用）：文本归一化后的稳定摘要。
 */
export function legacyTextDigest(input: string): string {
  return normalizeLegacyText(input);
}
