import {
  packCloudBackupPart,
  sha256Hex,
  unpackCloudBackupPart,
  type CloudBackupCompression,
  type CloudBackupPartEntry,
} from '@/services/cloudBackupPackage';

type WorkerResponse =
  | { id: number; ok: true; type: 'hash'; sha256: string }
  | { id: number; ok: true; type: 'pack'; bytes: ArrayBuffer; sha256: string; compression: CloudBackupCompression }
  | { id: number; ok: true; type: 'unpack'; entries: Array<{ name: string; bytes: ArrayBuffer }> }
  | { id: number; ok: false; error: string };

export interface CloudBackupWorkerClient {
  hash(bytes: Uint8Array, signal?: AbortSignal): Promise<string>;
  pack(
    entries: CloudBackupPartEntry[],
    signal?: AbortSignal,
  ): Promise<{ bytes: Uint8Array; sha256: string; compression: CloudBackupCompression }>;
  unpack(bytes: Uint8Array, compression: CloudBackupCompression, signal?: AbortSignal): Promise<Map<string, Uint8Array>>;
  dispose(reason?: string): void;
}

export function createCloudBackupWorkerClient(): CloudBackupWorkerClient {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void }>();

  const failAll = (error: Error): void => {
    for (const item of pending.values()) item.reject(error);
    pending.clear();
  };

  if (typeof Worker === 'function') {
    worker = new Worker(new URL('../workers/cloudBackup.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const item = pending.get(response.id);
      if (!item) return;
      pending.delete(response.id);
      if (!response.ok) item.reject(new Error(response.error));
      else item.resolve(response);
    };
    worker.onerror = () => failAll(new Error('云备份 Worker 异常终止。'));
  }

  const request = (
    payload: Omit<Record<string, unknown>, 'id'>,
    transfer: Transferable[],
    signal?: AbortSignal,
  ): Promise<WorkerResponse> => {
    if (!worker) return Promise.reject(new Error('云备份 Worker 不可用。'));
    if (signal?.aborted) {
      const reason: unknown = signal.reason;
      return Promise.reject(reason instanceof Error ? reason : new DOMException('任务已取消。', 'AbortError'));
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const abort = () => {
        pending.delete(id);
        const reason: unknown = signal?.reason;
        reject(reason instanceof Error ? reason : new DOMException('任务已取消。', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener('abort', abort);
          resolve(value);
        },
        reject: (error) => {
          signal?.removeEventListener('abort', abort);
          reject(error);
        },
      });
      worker?.postMessage({ id, ...payload }, transfer);
    });
  };

  return {
    async hash(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
      if (!worker) return sha256Hex(bytes);
      const buffer = copyBuffer(bytes);
      const response = await request({ type: 'hash', bytes: buffer }, [buffer], signal);
      if (!response.ok || response.type !== 'hash') throw new Error('云备份 Worker 返回了错误的哈希结果。');
      return response.sha256;
    },
    async pack(entries: CloudBackupPartEntry[], signal?: AbortSignal) {
      if (!worker) return packCloudBackupPart(entries);
      const payload = entries.map((entry) => ({ name: entry.name, bytes: copyBuffer(entry.bytes) }));
      const response = await request({ type: 'pack', entries: payload }, payload.map((entry) => entry.bytes), signal);
      if (!response.ok || response.type !== 'pack') throw new Error('云备份 Worker 返回了错误的分卷结果。');
      return { bytes: new Uint8Array(response.bytes), sha256: response.sha256, compression: response.compression };
    },
    async unpack(bytes: Uint8Array, compression: CloudBackupCompression, signal?: AbortSignal) {
      if (!worker) return unpackCloudBackupPart(bytes, compression);
      const buffer = copyBuffer(bytes);
      const response = await request({ type: 'unpack', bytes: buffer, compression }, [buffer], signal);
      if (!response.ok || response.type !== 'unpack') throw new Error('云备份 Worker 返回了错误的解包结果。');
      return new Map(response.entries.map((entry) => [entry.name, new Uint8Array(entry.bytes)]));
    },
    dispose(reason = '云备份任务已取消。'): void {
      worker?.terminate();
      worker = null;
      failAll(new DOMException(reason, 'AbortError'));
    },
  };
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}
