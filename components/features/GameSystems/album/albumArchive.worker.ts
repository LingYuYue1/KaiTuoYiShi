/// <reference lib="webworker" />

import type { 图片资源, 图片生成任务, 相册条目 } from '@/models/imageGeneration';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  createZipBlob,
  loadAlbumAssetBytes,
  parseAlbumBytes,
  type AlbumArchiveManifestV2,
  type ArchiveAsset,
  type ParsedAlbum,
} from './albumArchive';
import { hashDataUrl, normalizeContentHash, sha256Bytes } from './albumContent';

type WorkerRequest = {
  requestId: number;
  type: 'export:init' | 'export:asset' | 'export:finish' | 'import:init' | 'import:hash-asset' | 'import:finish';
  entries?: 相册条目[];
  tasks?: 图片生成任务[];
  asset?: 图片资源;
  bytes?: ArrayBuffer;
};

type ExportState = {
  entries: 相册条目[];
  tasks: 图片生成任务[];
  assets: ArchiveAsset[];
  files: Array<{ name: string; data: Uint8Array }>;
  fileByHash: Map<string, string>;
  warnings: string[];
};

let exportState: ExportState | null = null;
let importedAlbum: ParsedAlbum | null = null;
const currentHashPatches = new Map<string, string>();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data).then(
    (result) => self.postMessage({ requestId: event.data.requestId, ok: true, result }),
    (error) => self.postMessage({
      requestId: event.data.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
};

async function handleRequest(request: WorkerRequest): Promise<unknown> {
  switch (request.type) {
    case 'export:init':
      exportState = {
        entries: request.entries ?? [],
        tasks: request.tasks ?? [],
        assets: [],
        files: [],
        fileByHash: new Map(),
        warnings: [],
      };
      return null;
    case 'export:asset':
      return addExportAsset(requireExportState(), requireAsset(request.asset));
    case 'export:finish':
      return finishExport(requireExportState());
    case 'import:init':
      if (!request.bytes) throw new Error('导入文件缺少字节数据。');
      currentHashPatches.clear();
      importedAlbum = await parseAlbumBytes(new Uint8Array(request.bytes));
      return null;
    case 'import:hash-asset': {
      const asset = requireAsset(request.asset);
      const existing = normalizeContentHash(asset.contentHash);
      const contentHash = existing || (asset.dataUrl ? await hashDataUrl(asset.dataUrl) : undefined);
      if (contentHash) currentHashPatches.set(asset.id, contentHash);
      return contentHash;
    }
    case 'import:finish': {
      if (!importedAlbum) throw new Error('导入文件尚未完成解析。');
      const result = {
        parsed: importedAlbum,
        hashPatches: Array.from(currentHashPatches.entries()),
      };
      importedAlbum = null;
      currentHashPatches.clear();
      return result;
    }
    default:
      throw new Error('未知相册归档操作。');
  }
}

async function addExportAsset(state: ExportState, asset: 图片资源): Promise<void> {
  const loaded = await loadAlbumAssetBytes(asset);
  const { dataUrl: _dataUrl, ...metadata } = asset;
  if (!loaded) {
    state.assets.push(metadata);
    state.warnings.push(`资源 ${asset.id} 无法打包为本地图片文件。`);
    return;
  }

  const contentHash = await sha256Bytes(loaded.bytes);
  let file = state.fileByHash.get(contentHash);
  if (!file) {
    file = `assets/${contentHash}.${extensionFromMime(loaded.mimeType)}`;
    state.fileByHash.set(contentHash, file);
    state.files.push({ name: file, data: loaded.bytes });
  }
  state.assets.push({ ...metadata, contentHash, mimeType: loaded.mimeType, file });
}

function finishExport(state: ExportState): { blob: Blob; assetCount: number; entryCount: number; warningCount: number } {
  const manifest: AlbumArchiveManifestV2 = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    assets: state.assets,
    entries: state.entries,
    tasks: state.tasks,
    warnings: state.warnings,
  };
  state.files.push({
    name: 'manifest.json',
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });
  const result = {
    blob: createZipBlob(state.files),
    assetCount: state.assets.length,
    entryCount: state.entries.length,
    warningCount: state.warnings.length,
  };
  exportState = null;
  return result;
}

function requireExportState(): ExportState {
  if (!exportState) throw new Error('导出任务尚未初始化。');
  return exportState;
}

function requireAsset(asset: 图片资源 | undefined): 图片资源 {
  if (!asset?.id) throw new Error('图片资源缺少 ID。');
  return asset;
}

function extensionFromMime(mimeType: string): string {
  if (/jpe?g/i.test(mimeType)) return 'jpg';
  if (/webp/i.test(mimeType)) return 'webp';
  if (/gif/i.test(mimeType)) return 'gif';
  if (/bmp/i.test(mimeType)) return 'bmp';
  return 'png';
}

export {};
