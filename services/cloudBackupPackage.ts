export const CLOUD_BACKUP_VERSION = 2;
export const CLOUD_BACKUP_PART_TARGET_BYTES = 8 * 1024 * 1024;
export const CLOUD_BACKUP_PART_HARD_BYTES = 90 * 1024 * 1024;

const CLOUD_PART_MAGIC = new TextEncoder().encode('KTYCLD2\n');
const CLOUD_PART_PREFIX_BYTES = CLOUD_PART_MAGIC.byteLength + 4;
const DEFAULT_MAX_ENTRIES = 4096;
const DEFAULT_MAX_ENTRY_BYTES = 96 * 1024 * 1024;
const DEFAULT_MAX_UNPACKED_BYTES = 128 * 1024 * 1024;

// 统一 SHA-256：相册 / 云备份 / 剧情运行时共用同一实现，无 crypto.subtle 时本地回退。
// 显式 .ts 扩展名：node 原生 TS 加载（如 cloud-backup-package-regression）可直接解析。
import { sha256BytesHex } from './storyRuntime/id.ts';

export type CloudBackupCompression = 'gzip' | 'none';

export interface CloudBackupPartMeta {
  path: string;
  index: number;
  sizeBytes: number;
  sha256: string;
  compression: CloudBackupCompression;
}

export interface CloudBackupNodeMeta {
  sourceSaveId: number;
  type: string;
  timestamp: number;
  turnCount: number;
  rootId?: string;
  nodeId?: string;
  parentNodeId?: string;
  fingerprint: string;
  entryPath: string;
  partIndex: number;
}

export interface CloudBackupAssetMeta {
  originalId: string;
  contentHash: string;
  mimeType: string;
  sizeBytes: number;
  entryPath: string;
  partIndex: number;
}

export interface CloudBackupPointerV2 {
  app: 'KaiTuoYiShi';
  kind: 'github-cloud-backup';
  version: 2;
  snapshotId: string;
  createdAt: string;
  nodeCount: number;
  treeCount: number;
  legacyBackupCount: number;
  assetCount: number;
  totalBytes: number;
  parts: CloudBackupPartMeta[];
  nodes: CloudBackupNodeMeta[];
  assets: CloudBackupAssetMeta[];
}

export interface CloudBackupMergeResult {
  addedNodes: number;
  skippedDuplicateNodes: number;
  remappedConflictTrees: number;
  addedAssets: number;
  reusedAssets: number;
}

export interface CloudBackupPartEntry {
  name: string;
  bytes: Uint8Array;
}

interface PackedEntryHeader {
  name: string;
  offset: number;
  length: number;
  sha256: string;
}

interface PackedPartHeader {
  kind: 'kaituoyishi-cloud-backup-part';
  version: 2;
  entries: PackedEntryHeader[];
}

export async function packCloudBackupPart(entries: CloudBackupPartEntry[]): Promise<{
  bytes: Uint8Array;
  sha256: string;
  compression: CloudBackupCompression;
}> {
  if (!entries.length) throw new Error('云备份分卷不能为空。');
  if (entries.length > DEFAULT_MAX_ENTRIES) throw new Error('云备份分卷条目数量超过安全上限。');

  const seen = new Set<string>();
  const headers: PackedEntryHeader[] = [];
  let payloadBytes = 0;
  for (const entry of entries) {
    assertSafeEntryName(entry.name);
    if (seen.has(entry.name)) throw new Error(`云备份分卷存在重复条目：${entry.name}`);
    seen.add(entry.name);
    if (entry.bytes.byteLength > DEFAULT_MAX_ENTRY_BYTES) {
      throw new Error(`云备份条目超过安全大小：${entry.name}`);
    }
    headers.push({
      name: entry.name,
      offset: payloadBytes,
      length: entry.bytes.byteLength,
      sha256: await sha256Hex(entry.bytes),
    });
    payloadBytes += entry.bytes.byteLength;
  }
  if (payloadBytes > DEFAULT_MAX_UNPACKED_BYTES) throw new Error('云备份分卷解压后大小超过安全上限。');

  const header: PackedPartHeader = {
    kind: 'kaituoyishi-cloud-backup-part',
    version: CLOUD_BACKUP_VERSION,
    entries: headers,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const raw = new Uint8Array(CLOUD_PART_PREFIX_BYTES + headerBytes.byteLength + payloadBytes);
  raw.set(CLOUD_PART_MAGIC, 0);
  new DataView(raw.buffer).setUint32(CLOUD_PART_MAGIC.byteLength, headerBytes.byteLength, true);
  raw.set(headerBytes, CLOUD_PART_PREFIX_BYTES);
  let cursor = CLOUD_PART_PREFIX_BYTES + headerBytes.byteLength;
  for (const entry of entries) {
    raw.set(entry.bytes, cursor);
    cursor += entry.bytes.byteLength;
  }

  const compression: CloudBackupCompression = typeof CompressionStream === 'function' ? 'gzip' : 'none';
  const bytes = compression === 'gzip' ? await gzipBytes(raw) : raw;
  if (bytes.byteLength > CLOUD_BACKUP_PART_HARD_BYTES) throw new Error('云备份分卷压缩后仍超过 GitHub 安全大小。');
  return { bytes, sha256: await sha256Hex(bytes), compression };
}

export async function unpackCloudBackupPart(
  input: ArrayBuffer | Uint8Array,
  compression: CloudBackupCompression,
  limits: { maxEntries?: number; maxEntryBytes?: number; maxUnpackedBytes?: number } = {},
): Promise<Map<string, Uint8Array>> {
  const compressed = toOwnedBytes(input);
  const maxEntries = limits.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxEntryBytes = limits.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxUnpackedBytes = limits.maxUnpackedBytes ?? DEFAULT_MAX_UNPACKED_BYTES;
  // gzip 解压过程中限流：实际输出超过上限时立即取消流，不得先拼出完整超大 Uint8Array。
  const raw = compression === 'gzip'
    ? await gunzipBytes(compressed, maxUnpackedBytes)
    : compressed;
  if (raw.byteLength > maxUnpackedBytes) throw new Error('云备份分卷解压后大小超过安全上限。');
  if (raw.byteLength < CLOUD_PART_PREFIX_BYTES) throw new Error('云备份分卷头部不完整。');
  for (let index = 0; index < CLOUD_PART_MAGIC.byteLength; index += 1) {
    if (raw[index] !== CLOUD_PART_MAGIC[index]) throw new Error('云备份分卷标识无效。');
  }
  const headerLength = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    .getUint32(CLOUD_PART_MAGIC.byteLength, true);
  const headerEnd = CLOUD_PART_PREFIX_BYTES + headerLength;
  if (headerLength <= 0 || headerEnd > raw.byteLength) throw new Error('云备份分卷清单长度无效。');
  const header = JSON.parse(new TextDecoder().decode(raw.subarray(CLOUD_PART_PREFIX_BYTES, headerEnd))) as PackedPartHeader;
  if (header.kind !== 'kaituoyishi-cloud-backup-part' || header.version !== CLOUD_BACKUP_VERSION || !Array.isArray(header.entries)) {
    throw new Error('云备份分卷清单格式无效。');
  }
  if (header.entries.length > maxEntries) throw new Error('云备份分卷条目数量超过安全上限。');

  const payloadStart = headerEnd;
  const result = new Map<string, Uint8Array>();
  for (const entry of header.entries) {
    assertSafeEntryName(entry.name);
    if (result.has(entry.name)) throw new Error(`云备份分卷存在重复条目：${entry.name}`);
    if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.offset < 0 || entry.length < 0) {
      throw new Error(`云备份条目范围无效：${entry.name}`);
    }
    if (entry.length > maxEntryBytes || payloadStart + entry.offset + entry.length > raw.byteLength) {
      throw new Error(`云备份条目越界或过大：${entry.name}`);
    }
    const bytes = raw.slice(payloadStart + entry.offset, payloadStart + entry.offset + entry.length);
    if (await sha256Hex(bytes) !== entry.sha256) throw new Error(`云备份条目校验失败：${entry.name}`);
    result.set(entry.name, bytes);
  }
  return result;
}

export async function fingerprintCloudBackupNode(value: unknown): Promise<string> {
  const normalized = normalizeFingerprintValue(value);
  return sha256Hex(new TextEncoder().encode(stableStringify(normalized)));
}

export async function sha256Hex(input: ArrayBuffer | Uint8Array): Promise<string> {
  // 统一走 storyRuntime/id 的共享字节 SHA-256：LAN HTTP 无 crypto.subtle 时本地回退，字节输出一致。
  return sha256BytesHex(input);
}

export function createCloudSnapshotId(now = Date.now()): string {
  const random = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `snapshot-${now}-${random}`;
}

function assertSafeEntryName(name: string): void {
  const normalized = name.replace(/\\/g, '/').trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) throw new Error(`云备份条目路径无效：${name}`);
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`云备份条目路径无效：${name}`);
  }
}

function normalizeFingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeFingerprintValue);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (key === 'id' || key === 'debugContext' || key === 'saveRuntime' || key === 'exportedAt' || key === 'uploadedAt' || key === 'mirroredAt') continue;
    const current = source[key];
    if (typeof current === 'undefined' || typeof current === 'function') continue;
    result[key] = normalizeFingerprintValue(current);
  }
  return result;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const source = value as Record<string, unknown>;
  const entries = Object.keys(source)
    .sort()
    .filter((key) => typeof source[key] !== 'undefined' && typeof source[key] !== 'function')
    .map((key) => `${JSON.stringify(key)}:${stableStringify(source[key])}`);
  return `{${entries.join(',')}}`;
}

async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'function') return bytes;
  const stream = new Blob([toOwnedBytes(bytes)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * gzip 解压（限流）：带累计字节计数读取输出流，实际输出超过 maxUnpackedBytes 时
 * 立即取消 reader，不得先拼出完整超大 Uint8Array 再检查。
 */
async function gunzipBytes(bytes: Uint8Array, maxUnpackedBytes: number): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') throw new Error('当前环境不支持解压云备份分卷。');
  const stream = new Blob([toOwnedBytes(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxUnpackedBytes) {
        await reader.cancel();
        throw new Error('云备份分卷解压输出超过安全上限，已中止。');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof Error && err.message === '云备份分卷解压输出超过安全上限，已中止。') throw err;
    await reader.cancel().catch(() => {});
    throw err;
  }
  return concatChunks(chunks);
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toOwnedBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? Uint8Array.from(input) : new Uint8Array(input.slice(0));
}
