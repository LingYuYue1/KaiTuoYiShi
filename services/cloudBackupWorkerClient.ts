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

export class CloudBackupWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void }>();

  constructor() {
    if (typeof Worker === 'function') {
      this.worker = new Worker(new URL('../workers/cloudBackup.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        const pending = this.pending.get(response.id);
        if (!pending) return;
        this.pending.delete(response.id);
        if (!response.ok) pending.reject(new Error(response.error));
        else pending.resolve(response);
      };
      this.worker.onerror = () => this.failAll(new Error('云备份 Worker 异常终止。'));
    }
  }

  async hash(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
    if (!this.worker) return sha256Hex(bytes);
    const buffer = copyBuffer(bytes);
    const response = await this.request({ type: 'hash', bytes: buffer }, [buffer], signal);
    if (!response.ok || response.type !== 'hash') throw new Error('云备份 Worker 返回了错误的哈希结果。');
    return response.sha256;
  }

  async pack(entries: CloudBackupPartEntry[], signal?: AbortSignal): Promise<{
    bytes: Uint8Array;
    sha256: string;
    compression: CloudBackupCompression;
  }> {
    if (!this.worker) return packCloudBackupPart(entries);
    const payload = entries.map((entry) => ({ name: entry.name, bytes: copyBuffer(entry.bytes) }));
    const response = await this.request({ type: 'pack', entries: payload }, payload.map((entry) => entry.bytes), signal);
    if (!response.ok || response.type !== 'pack') throw new Error('云备份 Worker 返回了错误的分卷结果。');
    return { bytes: new Uint8Array(response.bytes), sha256: response.sha256, compression: response.compression };
  }

  async unpack(bytes: Uint8Array, compression: CloudBackupCompression, signal?: AbortSignal): Promise<Map<string, Uint8Array>> {
    if (!this.worker) return unpackCloudBackupPart(bytes, compression);
    const buffer = copyBuffer(bytes);
    const response = await this.request({ type: 'unpack', bytes: buffer, compression }, [buffer], signal);
    if (!response.ok || response.type !== 'unpack') throw new Error('云备份 Worker 返回了错误的解包结果。');
    return new Map(response.entries.map((entry) => [entry.name, new Uint8Array(entry.bytes)]));
  }

  dispose(reason = '云备份任务已取消。'): void {
    this.worker?.terminate();
    this.worker = null;
    this.failAll(new DOMException(reason, 'AbortError'));
  }

  private request(
    payload: Omit<Record<string, unknown>, 'id'>,
    transfer: Transferable[],
    signal?: AbortSignal,
  ): Promise<WorkerResponse> {
    if (!this.worker) return Promise.reject(new Error('云备份 Worker 不可用。'));
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('任务已取消。', 'AbortError'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.pending.delete(id);
        reject(signal?.reason ?? new DOMException('任务已取消。', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener('abort', abort);
          resolve(value);
        },
        reject: (error) => {
          signal?.removeEventListener('abort', abort);
          reject(error);
        },
      });
      this.worker?.postMessage({ id, ...payload }, transfer);
    });
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}
