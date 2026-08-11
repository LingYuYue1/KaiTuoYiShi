export const MEMORY_LAYER_COMPRESSION_THRESHOLD = 15;

export type 记忆压缩层级 = 'short' | 'middle' | 'long' | 'npc';
export type 失败草稿状态 = 'pending' | 'retrying' | 'resolved' | 'ignored';
export type 记忆失败代码 = 'unconfigured' | 'request_failed' | 'empty_output' | 'source_changed';

export interface 记忆来源范围 {
  start: number;
  end: number;
}

export interface 记忆失败来源快照 {
  encoding: 'gzip-base64' | 'plain-json';
  payload: string;
  checksum: string;
  itemCount: number;
  uncompressedBytes: number;
}

export interface 记忆失败草稿 {
  id: string;
  /** 批量重建草稿不能按普通 fallback 替换逻辑重试。旧存档缺失时按 automatic 处理。 */
  origin?: 'automatic' | 'batch_rebuild';
  kind: 记忆压缩层级;
  status: 失败草稿状态;
  sourceTurns: 记忆来源范围;
  sourceSnapshot: 记忆失败来源快照;
  targetLayer: '短期记忆' | '中期记忆' | '长期记忆';
  fallbackSummary: string;
  failureCode: 记忆失败代码;
  failureMessage: string;
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface 记忆系统 {
  即时记忆: string[];
  短期记忆: string[];
  /** 中期记忆：由多条短期记忆再压缩，承接阶段性剧情链。 */
  中期记忆: string[];
  /** 长期记忆：由多条中期记忆再压缩，保留稳定事实。 */
  长期记忆: string[];
  /** 自动总结失败时保留的不可变原始批次，旧存档缺失时按空数组处理。 */
  失败草稿?: 记忆失败草稿[];
}

export function 创建空记忆系统(): 记忆系统 {
  return {
    即时记忆: [],
    短期记忆: [],
    中期记忆: [],
    长期记忆: [],
    失败草稿: [],
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function fallbackChecksum(bytes: Uint8Array): string {
  // FNV-1a keeps the browser-only model layer usable in environments without SubtleCrypto.
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function checksumBytes(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackChecksum(bytes);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** 将失败请求实际使用的完整 source.items 固定为可存档快照，不截断内容。 */
export async function serializeMemoryFailureSource(items: string[]): Promise<记忆失败来源快照> {
  const rawBytes = encoder.encode(JSON.stringify(items));
  const checksum = await checksumBytes(rawBytes);
  const compressed = await gzipBytes(rawBytes);
  return {
    encoding: compressed ? 'gzip-base64' : 'plain-json',
    payload: compressed ? bytesToBase64(compressed) : decoder.decode(rawBytes),
    checksum,
    itemCount: items.length,
    uncompressedBytes: rawBytes.byteLength,
  };
}

/** 解码失败草稿快照并校验数量与校验和，防止云存档/导入损坏后静默重试错误材料。 */
export async function deserializeMemoryFailureSource(snapshot: 记忆失败来源快照): Promise<string[]> {
  const bytes = snapshot.encoding === 'gzip-base64'
    ? await gunzipBytes(base64ToBytes(snapshot.payload))
    : encoder.encode(snapshot.payload);
  if (!bytes) throw new Error('失败草稿快照无法解压。');
  const checksum = await checksumBytes(bytes);
  if (checksum !== snapshot.checksum) throw new Error('失败草稿快照校验失败。');
  const parsed = JSON.parse(decoder.decode(bytes));
  if (!Array.isArray(parsed) || parsed.length !== snapshot.itemCount || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('失败草稿快照内容无效。');
  }
  return parsed;
}

export function normalizeMemorySystem(raw?: Partial<记忆系统> | null): 记忆系统 {
  return {
    即时记忆: Array.isArray(raw?.即时记忆) ? raw!.即时记忆 : [],
    短期记忆: Array.isArray(raw?.短期记忆) ? raw!.短期记忆 : [],
    中期记忆: Array.isArray(raw?.中期记忆) ? raw!.中期记忆 : [],
    长期记忆: Array.isArray(raw?.长期记忆) ? raw!.长期记忆 : [],
    失败草稿: Array.isArray(raw?.失败草稿) ? raw!.失败草稿 : [],
  };
}
