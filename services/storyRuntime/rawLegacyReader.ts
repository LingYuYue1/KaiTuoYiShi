// G1.3.2.2/G1.3.2.4 rawLegacyReader：迁移读取的序列化安全边界。
// - P1-4（G1.3.2.4）：不可信入口只接受 UTF-8 JSON 文本（string）或字节（Uint8Array）——
//   先保存原始 bytes 与 input fingerprint，再用 JSON.parse 产生普通数据（parse 产物只有 data 属性，
//   没有 getter/Proxy/原型行为），最后做 descriptor-walk 深快照、字段路径与 canonical fingerprint；
//   对 object/Proxy/accessor/function 等 live value 在任何 getPrototypeOf/ownKeys/getOwnPropertyDescriptor/
//   结构化克隆/Object.entries 之前直接拒绝——拒绝路径不执行用户 getter/trap（计数必须为 0）；
//   不再接受任意 live object 后探测 Proxy，结构化克隆不作为 accessor/Proxy 安全闸门；
// - P1-4：非法 JSON 文本、过大/过深 payload、字节解码失败均返回稳定只读诊断
//   （raw=null + canonicalFingerprint=null + readonlyReason，不 throw）；
// - P1-4（G1.3.2.1）：返回的 raw 必须是与输入分离的深快照（独立可变引用）；
// - 记录原始 payload、原始字段路径（如 ['剧情编织','currentSegmentId']）、canonical fingerprint 与输入指纹。
import { canonicalJsonStringify } from './normalization';
import { sha256Fingerprint } from './id';

/** 不可信输入大小上限（16 MiB）；超限返回稳定只读诊断。 */
export const MAX_RAW_INPUT_BYTES = 16 * 1024 * 1024;

export interface RawLegacyPayload {
  /** 独立深快照（JSON.parse 后的普通数据；与输入不共享可变引用）。非法输入为 null。 */
  raw: unknown;
  /** 读取到的原始字段路径（相对该存档根）。 */
  fieldPaths: string[];
  /** canonical fingerprint（G1.2.3 canonicalJsonStringify）。非法输入为 null。 */
  canonicalFingerprint: string | null;
  /** 逐字段路径的指纹（用于迁移幂等与重复运行对照）。 */
  fieldFingerprints: Array<{ path: string; fingerprint: string | null }>;
  /** 原始输入字节的 SHA-256（先保存原始 fingerprint，再解析）。非法输入为 null。 */
  inputFingerprint: string | null;
  /** 原始输入大小（字节）。非法输入为 0。 */
  inputBytes: number;
  /** 稳定只读诊断：非法输入/超限/解析失败时说明原因（不 throw）。合法输入为 null。 */
  readonlyReason: string | null;
}

/**
 * P1-4（G1.3.2.4）/P1-2（G1.3.2.5）：把不可信输入转成 UTF-8 字节 + 文本。
 * - string：UTF-8 文本，直接编码；
 * - Uint8Array：字节（拷贝，与输入分离），严格 UTF-8 解码（TextDecoder fatal：任一非法 byte sequence
 *   抛错，返回只读诊断并保留原始 bytes——不进入 JSON.parse 成功路径，不会被替换字符静默改写）；
 * - 其他任何值（object/Proxy/accessor/function/number/boolean 等）直接拒绝——
 *   在拒绝路径上不做任何属性访问、不调用任何元操作，getter/trap 调用 0。
 *   ArrayBuffer.isView 是内部 slot 检查（对 Proxy 返回 false，0 trap）；
 *   只有确认是真实 TypedArray/DataView 后才用 instanceof 收窄到 Uint8Array（无 trap 风险）。
 */
export function toRawBytes(input: unknown): { ok: true; bytes: Uint8Array; text: string } | { ok: false; reason: string; bytes?: Uint8Array } {
  if (typeof input === 'string') {
    const bytes = new TextEncoder().encode(input);
    return { ok: true, bytes, text: input };
  }
  if (ArrayBuffer.isView(input) && input instanceof Uint8Array) {
    const bytes = new Uint8Array(input.byteLength);
    bytes.set(input);
    let text: string;
    try {
      // P1-2（G1.3.2.5）：严格 UTF-8——非法 byte sequence 直接拒绝（fatal），不静默替换。
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, reason: '非法 UTF-8 byte sequence（严格解码拒绝，保留原始 bytes/fingerprint）', bytes };
    }
    return { ok: true, bytes, text };
  }
  return { ok: false, reason: 'raw 入口只接受 UTF-8 JSON 文本（string）或字节（Uint8Array）；live object/Proxy/accessor/function 直接拒绝' };
}

/**
 * P1-4（G1.3.2.4）：descriptor-walk 深克隆（只读 own 描述符，绝不通过属性访问读取值）。
 * 仅用于 JSON.parse 产生的普通数据或模块内部创建的数据（无 Proxy/accessor 可能）；
 * 不可信入口必须先经过 toRawBytes + JSON.parse 才能进入本函数。
 * 共享引用/循环通过 seen map 保留（canonical fingerprint 对循环仍为 null，符合只读路径）。
 * 无法证明为普通 JSON 的容器返回 { ok: false }（调用方走稳定只读诊断）。
 */
export function cloneJsonSafe(value: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  const seen = new Map<object, object>();
  const walk = (v: unknown, path: string): unknown => {
    if (v === null) return null;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      if (t === 'number' && !Number.isFinite(v as number)) throw new Error(path + ': NaN/Infinity 不是合法 JSON 值');
      return v;
    }
    if (t === 'undefined' || t === 'bigint' || t === 'function' || t === 'symbol') {
      throw new Error(path + ': ' + t + ' 不是合法 JSON 值');
    }
    if (seen.has(v as object)) return seen.get(v as object); // 共享引用/循环（保留结构，fingerprint 由 canonical 判定为 null）
    const proto = Object.getPrototypeOf(v as object);
    if (proto !== Object.prototype && proto !== null && !Array.isArray(v)) {
      throw new Error(path + ': 非普通对象 prototype');
    }
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      seen.set(v, out);
      const keys = Reflect.ownKeys(v);
      let numericKeys = 0;
      for (const k of keys) {
        if (k === 'length') continue;
        if (typeof k !== 'string') throw new Error(path + ': symbol 键');
        const desc = Object.getOwnPropertyDescriptor(v, k);
        if (!desc) throw new Error(path + '[' + k + ']: 数组 sparse hole');
        if (typeof desc.get === 'function' || typeof desc.set === 'function') throw new Error(path + '[' + k + ']: 数组不允许 getter/setter');
        if (!desc.enumerable) throw new Error(path + '[' + k + ']: 数组索引不可枚举');
        numericKeys += 1;
        out[Number(k)] = walk(desc.value, path + '[' + k + ']');
      }
      if (numericKeys !== v.length) throw new Error(path + ': 数组 sparse hole（索引数 ' + numericKeys + ' != length ' + v.length + '）');
      return out;
    }
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    seen.set(v as object, out);
    for (const k of Reflect.ownKeys(v as object)) {
      if (typeof k !== 'string') throw new Error(path + ': symbol 键');
      const desc = Object.getOwnPropertyDescriptor(v as object, k);
      if (!desc) throw new Error(path + '.' + k + ': 描述符缺失');
      if (typeof desc.get === 'function' || typeof desc.set === 'function') throw new Error(path + '.' + k + ': 不允许 getter/setter（不读取值）');
      if (!desc.enumerable) throw new Error(path + '.' + k + ': 不允许隐藏字段');
      // P1-2（G1.3.2.5）：输出使用 null prototype 对象——`__proto__`/`constructor`/`prototype`
      // 等合法 JSON own key 作为普通数据属性无损快照，不改变输出 prototype、不污染全局/局部原型；
      // canonical/field traversal 契约允许 null prototype（普通对象校验：prototype 为 Object.prototype 或 null）。
      out[k] = walk(desc.value, path + '.' + k);
    }
    return out;
  };
  try {
    return { ok: true, value: walk(value, '$') };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** 遍历普通对象/数组，收集原始字段路径（祖先链守卫：循环对象不递归，字段路径稳定）。 */
export function collectFieldPaths(value: unknown, prefix = '', out: string[] = [], ancestors: WeakSet<object> = new WeakSet()): string[] {
  if (value === null || typeof value !== 'object') return out;
  if (ancestors.has(value as object)) return out; // 循环：不重复收集
  if (Array.isArray(value)) {
    ancestors.add(value);
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] !== null && typeof value[i] === 'object') collectFieldPaths(value[i], prefix + '[' + i + ']', out, ancestors);
    }
    ancestors.delete(value);
    return out;
  }
  ancestors.add(value as object);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? prefix + '.' + key : key;
    out.push(path);
    if (child !== null && typeof child === 'object') collectFieldPaths(child, path, out, ancestors);
  }
  ancestors.delete(value as object);
  return out;
}

/**
 * P1-4（G1.3.2.4）：读取旧存档原始 payload（不可信入口）。
 * 只接受 UTF-8 JSON 文本（string）或字节（Uint8Array）：
 * 1) 先保存原始 bytes 与 input fingerprint（对原始字节哈希）；
 * 2) JSON.parse 产生普通数据（无 Proxy/accessor/原型行为）；
 * 3) descriptor-walk 深快照 + 字段路径 + canonical fingerprint + 逐字段指纹。
 * 非法 JSON、过大/过深 payload、live object 输入均返回稳定只读诊断
 * （raw=null、canonicalFingerprint=null、readonlyReason 说明原因，不 throw）；
 * 拒绝路径不执行用户 getter/trap（完整 trap 矩阵 0 调用）。
 * 在任何旧 normalizer / align 调用前调用；调用方据此走 v3_recovery 只读。
 */
/**
 * P1-4（G1.3.2.4）：对原始输入字节做 SHA-256 指纹（Web Crypto，浏览器与 Node 等价；
 * 不经过 canonical JSON，避免 typed array 被普通对象校验拒绝）。无 Web Crypto 环境返回 null（不阻塞解析）。
 */
async function sha256BytesFingerprint(bytes: Uint8Array): Promise<string | null> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest('SHA-256', bytes);
    return 'sha256:' + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export async function readRawSavePayload(input: unknown): Promise<RawLegacyPayload> {
  // 1) 序列化边界：live value 直接拒绝（不做任何属性访问，0 trap/getter）。
  const converted = toRawBytes(input);
  if (!converted.ok) {
    // P1-2（G1.3.2.5）：非法 UTF-8 等失败路径仍保留原始 bytes 与 input fingerprint（只读诊断）。
    const inputBytes = converted.bytes?.byteLength ?? 0;
    const inputFingerprint = converted.bytes ? await sha256BytesFingerprint(converted.bytes) : null;
    return { raw: null, fieldPaths: [], canonicalFingerprint: null, fieldFingerprints: [], inputFingerprint, inputBytes, readonlyReason: converted.reason };
  }
  if (converted.bytes.byteLength > MAX_RAW_INPUT_BYTES) {
    return { raw: null, fieldPaths: [], canonicalFingerprint: null, fieldFingerprints: [], inputFingerprint: null, inputBytes: converted.bytes.byteLength, readonlyReason: 'raw 输入超限（> ' + MAX_RAW_INPUT_BYTES + ' bytes）' };
  }
  // 2) 先保存原始 bytes 指纹（迁移幂等与原始证据；对原始字节哈希，不是 canonical JSON）。
  const inputFingerprint = await sha256BytesFingerprint(converted.bytes);
  // 3) JSON.parse 产生普通数据；非法 JSON 返回稳定只读诊断。
  let parsed: unknown;
  try {
    parsed = JSON.parse(converted.text);
  } catch (error) {
    return { raw: null, fieldPaths: [], canonicalFingerprint: null, fieldFingerprints: [], inputFingerprint, inputBytes: converted.bytes.byteLength, readonlyReason: 'JSON 解析失败（非法文本）: ' + (error instanceof Error ? error.message : String(error)) };
  }
  // 4) descriptor-walk 深快照（parse 产物为普通数据；过深嵌套由栈溢出捕获为只读诊断）。
  const cloned = cloneJsonSafe(parsed);
  if (!cloned.ok) {
    return { raw: null, fieldPaths: [], canonicalFingerprint: null, fieldFingerprints: [], inputFingerprint, inputBytes: converted.bytes.byteLength, readonlyReason: '深快照失败（过深/非法容器）: ' + cloned.reason };
  }
  const snapshot = cloned.value;
  const fieldPaths = collectFieldPaths(snapshot);
  const canonicalFingerprint = await safeCanonicalFingerprint(snapshot);
  const fieldFingerprints: Array<{ path: string; fingerprint: string | null }> = [];
  for (const path of fieldPaths.slice(0, 500)) {
    const value = readPath(snapshot, path);
    fieldFingerprints.push({ path, fingerprint: await safeCanonicalFingerprint(value) });
  }
  return { raw: snapshot, fieldPaths, canonicalFingerprint, fieldFingerprints, inputFingerprint, inputBytes: converted.bytes.byteLength, readonlyReason: null };
}

function readPath(root: unknown, path: string): unknown {
  let current = root;
  for (const part of path.split(/[.[\]]+/).filter((p) => p.length > 0)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

async function safeCanonicalFingerprint(value: unknown): Promise<string | null> {
  try {
    return await sha256Fingerprint(value);
  } catch {
    return null;
  }
}

export { canonicalJsonStringify };
