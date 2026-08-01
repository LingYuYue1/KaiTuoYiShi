/// <reference lib="webworker" />

import {
  packCloudBackupPart,
  sha256Hex,
  unpackCloudBackupPart,
  type CloudBackupCompression,
} from '@/services/cloudBackupPackage';

type WorkerRequest =
  | { id: number; type: 'hash'; bytes: ArrayBuffer }
  | { id: number; type: 'pack'; entries: Array<{ name: string; bytes: ArrayBuffer }> }
  | { id: number; type: 'unpack'; bytes: ArrayBuffer; compression: CloudBackupCompression };

type WorkerResponse =
  | { id: number; ok: true; type: 'hash'; sha256: string }
  | { id: number; ok: true; type: 'pack'; bytes: ArrayBuffer; sha256: string; compression: CloudBackupCompression }
  | { id: number; ok: true; type: 'unpack'; entries: Array<{ name: string; bytes: ArrayBuffer }> }
  | { id: number; ok: false; error: string };

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'hash') {
      const response: WorkerResponse = { id: request.id, ok: true, type: 'hash', sha256: await sha256Hex(request.bytes) };
      workerScope.postMessage(response);
      return;
    }
    if (request.type === 'pack') {
      const packed = await packCloudBackupPart(request.entries.map((entry) => ({
        name: entry.name,
        bytes: new Uint8Array(entry.bytes),
      })));
      const bytes = packed.bytes.buffer.slice(packed.bytes.byteOffset, packed.bytes.byteOffset + packed.bytes.byteLength);
      const response: WorkerResponse = {
        id: request.id,
        ok: true,
        type: 'pack',
        bytes,
        sha256: packed.sha256,
        compression: packed.compression,
      };
      workerScope.postMessage(response, [bytes]);
      return;
    }
    const unpacked = await unpackCloudBackupPart(request.bytes, request.compression);
    const entries = Array.from(unpacked, ([name, value]) => ({
      name,
      bytes: value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    }));
    const response: WorkerResponse = { id: request.id, ok: true, type: 'unpack', entries };
    workerScope.postMessage(response, entries.map((entry) => entry.bytes));
  } catch (error) {
    const response: WorkerResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : '云备份 Worker 处理失败。',
    };
    workerScope.postMessage(response);
  }
};

export {};
