import { 读取图片参考目标, 归一化相册系统 } from '@/models/imageGeneration';
import type { 图片槽位, 图片资源, 图片生成任务, 相册条目, 相册系统 } from '@/models/imageGeneration';
import type { AlbumImportTarget } from './foundation';
import {
  assetContentKey,
  bytesToDataUrl,
  dataUrlToBytes,
  deduplicateAlbumContent,
  mergeAlbumEntryMetadata,
  normalizeContentHash,
  sha256Bytes,
} from './albumContent';
import { getAlbumAssetBlob, materializeAlbumRuntimePayload } from '@/utils/albumObjectUrl';

export { materializeAlbumRuntimePayload } from '@/utils/albumObjectUrl';

export const ARCHIVE_FORMAT = 'kaituo-album-backup';
export const ARCHIVE_VERSION = 2;
const MAX_ZIP_FILES = 5000;
const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 512 * 1024 * 1024;

export type AlbumImportMode = 'merge' | 'replace';

export interface AlbumImportStats {
  addedAssets: number;
  reusedAssets: number;
  addedEntries: number;
  mergedEntries: number;
  skippedEntries: number;
  warnings: number;
}

export interface AlbumImportResult {
  album: 相册系统;
  stats: AlbumImportStats;
}

export interface AlbumExportResult {
  assetCount: number;
  entryCount: number;
  warningCount: number;
}

export type ArchiveAsset = Omit<图片资源, 'dataUrl'> & {
  file?: string;
};

export type AlbumArchiveManifestV2 = {
  format: typeof ARCHIVE_FORMAT;
  version: typeof ARCHIVE_VERSION;
  exportedAt: string;
  assets: ArchiveAsset[];
  entries: 相册条目[];
  tasks: 图片生成任务[];
  warnings: string[];
};

export type ParsedAlbum = {
  album: 相册系统;
  warnings: number;
  skippedEntries: number;
};

export async function exportAlbum(album: 相册系统): Promise<AlbumExportResult> {
  const prepared = await deduplicateAlbumContent(album);
  const files: Array<{ name: string; data: Uint8Array }> = [];
  const manifestAssets: ArchiveAsset[] = [];
  const warnings: string[] = [];
  const usedNames = new Set<string>();

  for (const asset of prepared.assets) {
    const loaded = await loadAlbumAssetBytes(asset);
    const { dataUrl: _dataUrl, ...metadata } = asset;
    if (!loaded) {
      manifestAssets.push(metadata);
      warnings.push(`资源 ${asset.id} 无法打包为本地图片文件。`);
      continue;
    }
    const contentHash = await sha256Bytes(loaded.bytes);
    const fileName = uniqueZipName(usedNames, `assets/${contentHash}.${extensionFromMime(loaded.mimeType)}`);
    files.push({ name: fileName, data: loaded.bytes });
    manifestAssets.push({ ...metadata, contentHash, mimeType: loaded.mimeType, file: fileName });
  }

  const manifest: AlbumArchiveManifestV2 = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    assets: manifestAssets,
    entries: prepared.entries,
    tasks: prepared.tasks,
    warnings,
  };
  files.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });

  const blob = createZipBlob(files);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `kaituo-album-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { assetCount: prepared.assets.length, entryCount: prepared.entries.length, warningCount: warnings.length };
}

export async function importAlbum(params: {
  file: File | null;
  currentAlbum: 相册系统;
  mode: AlbumImportMode;
  target?: AlbumImportTarget;
}): Promise<AlbumImportResult | null> {
  if (!params.file) return null;
  const parsed = await parseAlbumFile(params.file);
  return completeAlbumImport({ ...params, parsed });
}

export async function completeAlbumImport(params: {
  parsed: ParsedAlbum;
  currentAlbum: 相册系统;
  mode: AlbumImportMode;
  target?: AlbumImportTarget;
}): Promise<AlbumImportResult> {
  const parsed = params.parsed;
  if (params.mode === 'replace') {
    const album = materializeAlbumRuntimePayload(await deduplicateAlbumContent(parsed.album));
    return {
      album,
      stats: {
        addedAssets: album.assets.length,
        reusedAssets: 0,
        addedEntries: album.entries.length,
        mergedEntries: 0,
        skippedEntries: parsed.skippedEntries,
        warnings: parsed.warnings,
      },
    };
  }

  const targeted = params.target ? applyImportTarget(parsed.album, params.target) : parsed.album;
  const merged = await mergeAlbumsByContent(params.currentAlbum, targeted, parsed.warnings, parsed.skippedEntries);
  return {
    ...merged,
    album: materializeAlbumRuntimePayload(merged.album),
  };
}

export async function parseAlbumFile(file: File): Promise<ParsedAlbum> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return parseAlbumBytes(bytes);
}

export async function parseAlbumBytes(bytes: Uint8Array): Promise<ParsedAlbum> {
  if (bytes.length >= 4 && readU32(bytes, 0) === 0x04034b50) return parseAlbumZip(bytes);
  try {
    const text = new TextDecoder().decode(bytes);
    const data = JSON.parse(text) as Partial<相册系统>;
    if (!data || (!Array.isArray(data.assets) && !Array.isArray(data.entries))) throw new Error('缺少相册资源或条目。');
    return { album: await deduplicateAlbumContent(归一化相册系统(data)), warnings: 0, skippedEntries: 0 };
  } catch (error) {
    throw new Error(`无法读取相册文件：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function parseAlbumZip(bytes: Uint8Array): Promise<ParsedAlbum> {
  const files = readStoredZip(bytes);
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) throw new Error('ZIP 中缺少 manifest.json。');
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error('manifest.json 超过 5 MiB 限制。');

  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error('manifest.json 不是有效 JSON。');
  }
  if (isArchiveManifestV2(manifest)) return parseArchiveManifestV2(manifest, files);
  return parseLegacyArchiveManifest(manifest, files);
}

async function parseArchiveManifestV2(manifest: AlbumArchiveManifestV2, files: Map<string, Uint8Array>): Promise<ParsedAlbum> {
  const assets: 图片资源[] = [];
  const assetIds = new Set<string>();
  for (const record of manifest.assets) {
    const id = String(record.id || '').trim();
    if (!id || assetIds.has(id)) throw new Error(`备份中存在缺失或重复的资源 ID：${id || '空值'}。`);
    assetIds.add(id);
    const { file, ...metadata } = record;
    let dataUrl: string | undefined;
    let contentHash = normalizeContentHash(record.contentHash);
    if (file) {
      const safeFile = assertSafeZipPath(file);
      const imageBytes = files.get(safeFile);
      if (!imageBytes) throw new Error(`备份缺少图片文件：${safeFile}`);
      const actualHash = await sha256Bytes(imageBytes);
      if (contentHash && actualHash !== contentHash) throw new Error(`图片 SHA-256 校验失败：${safeFile}`);
      contentHash = actualHash;
      // Import results may run inside a Worker; keep dataUrl here and materialize
      // into the main-thread Blob cache when the album is committed to runtime state.
      dataUrl = bytesToDataUrl(imageBytes, record.mimeType || mimeFromFileName(safeFile));
    }
    assets.push({
      ...metadata,
      id,
      dataUrl,
      contentHash,
      source: record.source || 'upload',
      nsfw: record.nsfw === true,
      createdAt: Number(record.createdAt) || Date.now(),
      status: record.status || 'ready',
    });
  }

  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  for (const entry of entries) {
    if (!assetIds.has(String(entry.assetId || ''))) throw new Error(`条目引用了不存在的资源：${entry.assetId || '空值'}`);
  }
  const album = await deduplicateAlbumContent(归一化相册系统({
    assets,
    entries,
    tasks: Array.isArray(manifest.tasks) ? manifest.tasks : [],
  }));
  return { album, warnings: Array.isArray(manifest.warnings) ? manifest.warnings.length : 0, skippedEntries: 0 };
}

async function parseLegacyArchiveManifest(manifest: unknown, files: Map<string, Uint8Array>): Promise<ParsedAlbum> {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray((manifest as { entries?: unknown }).entries)) {
    throw new Error('无法识别相册 ZIP 清单格式。');
  }
  const records = (manifest as { entries: Array<Record<string, unknown>> }).entries;
  const assets: 图片资源[] = [];
  const entries: 相册条目[] = [];
  let skippedEntries = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (typeof record.file !== 'string' || !record.file.trim()) {
      skippedEntries += 1;
      continue;
    }
    const fileName = assertSafeZipPath(record.file);
    const imageBytes = files.get(fileName);
    if (!imageBytes) throw new Error(`旧版备份缺少图片文件：${fileName}`);
    const contentHash = await sha256Bytes(imageBytes);
    const assetId = `asset_import_${index}_${contentHash.slice(0, 12)}`;
    assets.push({
      id: assetId,
      dataUrl: bytesToDataUrl(imageBytes, mimeFromFileName(fileName)),
      contentHash,
      mimeType: mimeFromFileName(fileName),
      source: 'upload',
      nsfw: record.nsfw === true,
      createdAt: Number(record.createdAt) || Date.now() + index,
      status: 'ready',
    });
    entries.push({
      id: `album_import_${index}_${contentHash.slice(0, 12)}`,
      assetId,
      title: String(record.title || `导入图片 ${index + 1}`),
      targetType: normalizeTargetType(record.targetType),
      targetId: typeof record.targetId === 'string' ? record.targetId : undefined,
      slot: normalizeSlot(record.slot),
      tags: normalizeStrings(record.tags),
      referenceTargets: normalizeStrings(record.referenceTargets),
      nsfw: record.nsfw === true,
      createdAt: Number(record.createdAt) || Date.now() + index,
    });
  }
  return {
    album: await deduplicateAlbumContent(归一化相册系统({ assets, entries, tasks: [] })),
    warnings: skippedEntries,
    skippedEntries,
  };
}

export async function mergeAlbumsByContent(
  currentInput: 相册系统,
  importedInput: 相册系统,
  warnings = 0,
  skippedEntries = 0,
): Promise<AlbumImportResult> {
  const current = await deduplicateAlbumContent(currentInput);
  const imported = await deduplicateAlbumContent(importedInput);
  const currentKeyToAsset = new Map(current.assets.map((asset) => [assetContentKey(asset), asset]));
  const usedAssetIds = new Set(current.assets.map((asset) => asset.id));
  const assetIdRemap = new Map<string, string>();
  const addedAssets: 图片资源[] = [];
  let reusedAssets = 0;

  for (const asset of imported.assets) {
    const existing = currentKeyToAsset.get(assetContentKey(asset));
    if (existing) {
      assetIdRemap.set(asset.id, existing.id);
      reusedAssets += 1;
      continue;
    }
    const id = uniqueId(asset.id, 'asset_import', usedAssetIds);
    const added = { ...asset, id };
    assetIdRemap.set(asset.id, id);
    currentKeyToAsset.set(assetContentKey(added), added);
    addedAssets.push(added);
  }

  const usedEntryIds = new Set(current.entries.map((entry) => entry.id));
  const entries = [...current.entries];
  const addedEntries: 相册条目[] = [];
  let mergedEntries = 0;
  for (const importedEntry of imported.entries) {
    const assetId = assetIdRemap.get(importedEntry.assetId) || importedEntry.assetId;
    const rewritten = { ...importedEntry, assetId };
    const existingIndex = entries.findIndex((entry) =>
      entry.assetId === assetId &&
      entry.targetType === rewritten.targetType &&
      (entry.targetId || '') === (rewritten.targetId || '') &&
      entry.slot === rewritten.slot,
    );
    if (existingIndex >= 0) {
      entries[existingIndex] = mergeAlbumEntryMetadata(entries[existingIndex], rewritten);
      mergedEntries += 1;
      continue;
    }
    const id = uniqueId(rewritten.id, 'album_import', usedEntryIds);
    const added = { ...rewritten, id };
    addedEntries.push(added);
    entries.push(added);
  }

  const album = await deduplicateAlbumContent({
    assets: [...addedAssets, ...current.assets],
    entries: [...addedEntries, ...entries.filter((entry) => !addedEntries.includes(entry))],
    tasks: current.tasks,
  });
  return {
    album,
    stats: {
      addedAssets: addedAssets.length,
      reusedAssets,
      addedEntries: addedEntries.length,
      mergedEntries,
      skippedEntries,
      warnings,
    },
  };
}

export function applyImportTarget(album: 相册系统, target: AlbumImportTarget): 相册系统 {
  const createdAt = Date.now();
  return {
    ...album,
    entries: album.entries.map((entry, index) => {
      const patch = resolveImportTargetPatch(target, entry);
      const hadReferenceTarget = 读取图片参考目标(entry).length > 0;
      return {
        ...entry,
        ...patch,
        tags: Array.from(new Set([...(entry.tags ?? []), ...patch.tags])),
        referenceTargets: target.scope === 'character' && hadReferenceTarget && target.targetId
          ? [target.targetId]
          : [],
        createdAt: Number(entry.createdAt) || createdAt + index,
      };
    }),
    tasks: album.tasks,
  };
}

export function resolveImportTargetPatch(target: AlbumImportTarget, entry: 相册条目): Pick<相册条目, 'targetType' | 'targetId' | 'slot' | 'tags' | 'note'> {
  if (target.scope === 'scene') {
    const sceneKind = target.sceneKind ?? (target.targetType === 'phone' ? 'phone' : 'scene');
    const isPhone = sceneKind === 'phone';
    const tag = sceneKind === 'snapshot' ? '故事快照' : isPhone ? '手机背景' : '场景图';
    return {
      targetType: isPhone ? 'phone' : 'scene',
      targetId: target.targetId,
      slot: isPhone ? 'phone_wallpaper' : 'scene',
      tags: [tag],
      note: entry.note || tag,
    };
  }
  const isTraveler = target.targetType === 'traveler';
  const slot = isCharacterLibrarySlot(entry.slot) ? entry.slot : 'avatar_profile';
  return {
    targetType: isTraveler ? 'traveler' : 'npc',
    targetId: isTraveler ? 'traveler' : target.targetId,
    slot,
    tags: [slotLabel(slot)],
    note: entry.note,
  };
}

export async function loadAlbumAssetBytes(asset: Pick<图片资源, 'id' | 'dataUrl' | 'url' | 'originalUrl' | 'localRef' | 'mimeType'>): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  // Prefer runtime Blob cache (Package 2) so export works without base64 in React state.
  if (asset.id) {
    const cached = getAlbumAssetBlob(asset.id);
    if (cached) {
      return {
        bytes: new Uint8Array(await cached.arrayBuffer()),
        mimeType: cached.type || asset.mimeType || 'image/png',
      };
    }
  }
  if (asset.dataUrl) {
    if (asset.dataUrl.startsWith('asset:') && asset.id) {
      const cached = getAlbumAssetBlob(asset.id);
      if (cached) {
        return {
          bytes: new Uint8Array(await cached.arrayBuffer()),
          mimeType: cached.type || asset.mimeType || 'image/png',
        };
      }
    } else {
      const decoded = dataUrlToBytes(asset.dataUrl);
      if (decoded) return decoded;
    }
  }
  const src = asset.url || asset.originalUrl || asset.localRef || '';
  if (!src) return null;
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type || asset.mimeType || 'image/png' };
  } catch {
    return null;
  }
}

export function readStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) throw new Error('ZIP 结束目录损坏或缺失。');
  const entryCount = readU16(bytes, eocdOffset + 10);
  const centralSize = readU32(bytes, eocdOffset + 12);
  const centralOffset = readU32(bytes, eocdOffset + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('暂不支持 ZIP64 备份。');
  if (entryCount > MAX_ZIP_FILES) throw new Error(`ZIP 文件数量超过 ${MAX_ZIP_FILES} 个限制。`);
  if (centralOffset + centralSize > bytes.length) throw new Error('ZIP 中央目录超出文件范围。');

  const files = new Map<string, Uint8Array>();
  let totalBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) throw new Error('ZIP 中央目录条目损坏。');
    const flags = readU16(bytes, offset + 8);
    const method = readU16(bytes, offset + 10);
    const expectedCrc = readU32(bytes, offset + 16);
    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const localOffset = readU32(bytes, offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > bytes.length) throw new Error('ZIP 中央目录名称超出文件范围。');
    const fileName = assertSafeZipPath(new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    if ((flags & 0x0001) !== 0) throw new Error(`不支持加密 ZIP 文件：${fileName}`);
    if (method !== 0) throw new Error(`不支持的 ZIP 压缩方法：${fileName}。请直接导入本项目导出的备份。`);
    if (compressedSize !== uncompressedSize) throw new Error(`ZIP STORE 文件长度不一致：${fileName}`);
    if (uncompressedSize > MAX_SINGLE_FILE_BYTES) throw new Error(`ZIP 单个文件超过 64 MiB：${fileName}`);
    totalBytes += uncompressedSize;
    if (totalBytes > MAX_TOTAL_FILE_BYTES) throw new Error('ZIP 文件数据总量超过 512 MiB。');
    if (files.has(fileName)) throw new Error(`ZIP 中存在重复路径：${fileName}`);

    if (readU32(bytes, localOffset) !== 0x04034b50) throw new Error(`ZIP 本地文件头损坏：${fileName}`);
    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + uncompressedSize;
    if (dataEnd > bytes.length) throw new Error(`ZIP 文件内容超出范围：${fileName}`);
    const data = bytes.subarray(dataOffset, dataEnd);
    if (crc32(data) !== expectedCrc) throw new Error(`ZIP CRC32 校验失败：${fileName}`);
    files.set(fileName, data);
    offset = nextOffset;
  }
  return files;
}

export function createZipBlob(files: Array<{ name: string; data: Uint8Array }>): Blob {
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const safeName = assertSafeZipPath(file.name);
    const nameBytes = new TextEncoder().encode(safeName);
    const crc = crc32(file.data);
    const localHeader = concatBytes([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(nameBytes.length), u16(0),
    ]);
    parts.push(localHeader, nameBytes, file.data);
    central.push(concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]));
    offset += localHeader.length + nameBytes.length + file.data.length;
  }
  const centralStart = offset;
  const centralBlock = concatBytes(central);
  const end = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBlock.length), u32(centralStart), u16(0),
  ]);
  return new Blob([...parts, centralBlock, end], { type: 'application/zip' });
}

export function assertSafeZipPath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim();
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`ZIP 包含不安全路径：${input || '空路径'}`);
  }
  return normalized;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isArchiveManifestV2(value: unknown): value is AlbumArchiveManifestV2 {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<AlbumArchiveManifestV2>;
  return manifest.format === ARCHIVE_FORMAT && manifest.version === ARCHIVE_VERSION && Array.isArray(manifest.assets) && Array.isArray(manifest.entries);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readU32(bytes, offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error('ZIP 数值字段超出范围。');
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error('ZIP 数值字段超出范围。');
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
}

function uniqueZipName(used: Set<string>, name: string): string {
  let candidate = name;
  let index = 2;
  const dot = name.lastIndexOf('.');
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const extension = dot >= 0 ? name.slice(dot) : '';
  while (used.has(candidate)) candidate = `${base}_${index++}${extension}`;
  used.add(candidate);
  return candidate;
}

function uniqueId(preferred: string | undefined, prefix: string, used: Set<string>): string {
  const base = String(preferred || '').trim();
  if (base && !used.has(base)) {
    used.add(base);
    return base;
  }
  let candidate = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  while (used.has(candidate)) candidate = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  used.add(candidate);
  return candidate;
}

function extensionFromMime(mimeType: string): string {
  if (/jpe?g/i.test(mimeType)) return 'jpg';
  if (/webp/i.test(mimeType)) return 'webp';
  if (/gif/i.test(mimeType)) return 'gif';
  if (/bmp/i.test(mimeType)) return 'bmp';
  return 'png';
}

function mimeFromFileName(fileName: string): string {
  if (/\.jpe?g$/i.test(fileName)) return 'image/jpeg';
  if (/\.webp$/i.test(fileName)) return 'image/webp';
  if (/\.gif$/i.test(fileName)) return 'image/gif';
  if (/\.bmp$/i.test(fileName)) return 'image/bmp';
  return 'image/png';
}

function normalizeStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
}

function normalizeTargetType(value: unknown): 相册条目['targetType'] {
  const allowed = new Set(['traveler', 'npc', 'phone', 'scene', 'item', 'nsfw_part', 'misc']);
  const normalized = String(value || 'misc');
  return allowed.has(normalized) ? normalized as 相册条目['targetType'] : 'misc';
}

function normalizeSlot(value: unknown): 图片槽位 {
  const normalized = String(value || 'misc') as 图片槽位;
  return isKnownSlot(normalized) ? normalized : 'misc';
}

function isKnownSlot(slot: 图片槽位): boolean {
  return [
    'avatar_profile', 'avatar_story', 'avatar_phone', 'portrait', 'phone_wallpaper', 'phone_chat_background',
    'group_avatar', 'scene', 'item_icon', 'nsfw_female_chest', 'nsfw_female_genital', 'nsfw_male_genital',
    'nsfw_rear', 'nsfw_body_reference', 'reference_image', 'misc',
  ].includes(slot);
}

function isCharacterLibrarySlot(slot: 图片槽位): boolean {
  return slot === 'avatar_profile' || slot === 'avatar_story' || slot === 'avatar_phone' || slot === 'portrait';
}

function slotLabel(slot: 图片槽位): string {
  const labels: Partial<Record<图片槽位, string>> = {
    avatar_profile: '档案头像',
    avatar_story: '正文头像',
    avatar_phone: '手机头像',
    portrait: '角色立绘',
  };
  return labels[slot] || '角色图片';
}
