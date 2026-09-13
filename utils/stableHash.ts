// 稳定哈希工具：确定性序列化 + SHA-256。
// 云备份节点指纹与变量命令回执指纹共用；领域层不依赖服务层。

/** 键排序的确定性序列化：相同内容得到相同字符串；undefined / function 键被忽略。 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) || 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const source = value as Record<string, unknown>;
  const entries = Object.keys(source)
    .sort()
    .filter((key) => typeof source[key] !== 'undefined' && typeof source[key] !== 'function')
    .map((key) => `${JSON.stringify(key)}:${stableStringify(source[key])}`);
  return `{${entries.join(',')}}`;
}

export function toOwnedBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? Uint8Array.from(input) : new Uint8Array(input.slice(0));
}

export async function sha256Hex(input: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = toOwnedBytes(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 任意可序列化值的 SHA-256 指纹（先做键排序序列化，保证内容等价 = 指纹等价）。 */
export async function stableHashHex(value: unknown): Promise<string> {
  return sha256Hex(new TextEncoder().encode(stableStringify(value)));
}
