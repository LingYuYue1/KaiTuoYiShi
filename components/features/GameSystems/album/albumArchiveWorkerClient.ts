import type { 图片资源, 相册系统 } from '@/models/imageGeneration';
import type { AlbumImportTarget } from './foundation';
import {
  completeAlbumImport,
  type AlbumExportResult,
  type AlbumImportMode,
  type AlbumImportResult,
  type ParsedAlbum,
} from './albumArchive';
import { normalizeContentHash } from './albumContent';

export type AlbumOperationStage = 'reading' | 'hashing' | 'building' | 'committing';
export type AlbumOperationProgress = {
  stage: AlbumOperationStage;
  completed?: number;
  total?: number;
};

type WorkerReply = {
  requestId: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

type ImportWorkerResult = {
  parsed: ParsedAlbum;
  hashPatches: Array<[string, string]>;
};

export async function exportAlbumInWorker(
  album: 相册系统,
  onProgress?: (progress: AlbumOperationProgress) => void,
): Promise<AlbumExportResult> {
  const worker = createAlbumWorker();
  try {
    await requestWorker(worker, { type: 'export:init', entries: album.entries, tasks: album.tasks });
    for (let index = 0; index < album.assets.length; index += 1) {
      onProgress?.({ stage: 'hashing', completed: index, total: album.assets.length });
      await requestWorker(worker, { type: 'export:asset', asset: album.assets[index] });
    }
    onProgress?.({ stage: 'building', completed: album.assets.length, total: album.assets.length });
    const result = await requestWorker(worker, { type: 'export:finish' }) as AlbumExportResult & { blob: Blob };
    triggerAlbumDownload(result.blob);
    return {
      assetCount: result.assetCount,
      entryCount: result.entryCount,
      warningCount: result.warningCount,
    };
  } finally {
    worker.terminate();
  }
}

export async function importAlbumInWorker(params: {
  file: File | null;
  currentAlbum: 相册系统;
  mode: AlbumImportMode;
  target?: AlbumImportTarget;
  onProgress?: (progress: AlbumOperationProgress) => void;
}): Promise<AlbumImportResult | null> {
  if (!params.file) return null;
  const worker = createAlbumWorker();
  try {
    params.onProgress?.({ stage: 'reading' });
    const buffer = await params.file.arrayBuffer();
    await requestWorker(worker, { type: 'import:init', bytes: buffer }, [buffer]);

    const missingHashes = params.mode === 'merge'
      ? params.currentAlbum.assets.filter((asset) => Boolean(asset.dataUrl) && !normalizeContentHash(asset.contentHash))
      : [];
    for (let index = 0; index < missingHashes.length; index += 1) {
      params.onProgress?.({ stage: 'hashing', completed: index, total: missingHashes.length });
      await requestWorker(worker, { type: 'import:hash-asset', asset: missingHashes[index] });
    }

    const imported = await requestWorker(worker, { type: 'import:finish' }) as ImportWorkerResult;
    const patchMap = new Map(imported.hashPatches);
    const currentAlbum = patchMap.size === 0 ? params.currentAlbum : {
      ...params.currentAlbum,
      assets: params.currentAlbum.assets.map((asset) => {
        const contentHash = patchMap.get(asset.id);
        return contentHash ? { ...asset, contentHash } : asset;
      }),
    };
    params.onProgress?.({ stage: 'committing' });
    return completeAlbumImport({
      parsed: imported.parsed,
      currentAlbum,
      mode: params.mode,
      target: params.target,
    });
  } finally {
    worker.terminate();
  }
}

export function albumOperationStageLabel(progress: AlbumOperationProgress): string {
  const suffix = progress.total && progress.total > 0
    ? ` ${Math.min(progress.completed ?? 0, progress.total)}/${progress.total}`
    : '';
  return {
    reading: '正在读取并校验相册…',
    hashing: `正在处理图片资源${suffix}…`,
    building: '正在构建相册备份…',
    committing: '正在提交相册变更…',
  }[progress.stage];
}

function createAlbumWorker(): Worker {
  if (typeof Worker === 'undefined') {
    throw new Error('当前浏览器不支持相册后台处理，已停止操作以避免页面卡死。');
  }
  return new Worker(new URL('./albumArchive.worker.ts', import.meta.url), { type: 'module' });
}

let nextRequestId = 1;

function requestWorker(
  worker: Worker,
  payload: Record<string, unknown>,
  transfer: Transferable[] = [],
): Promise<unknown> {
  const requestId = nextRequestId++;
  return new Promise((resolve, reject) => {
    const handleMessage = (event: MessageEvent<WorkerReply>) => {
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error || '相册后台处理失败。'));
    };
    const handleError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || '相册后台处理线程异常退出。'));
    };
    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({ ...payload, requestId }, transfer);
  });
}

function triggerAlbumDownload(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `kaituo-album-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
