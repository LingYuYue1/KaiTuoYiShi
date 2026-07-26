import fs from 'node:fs';
import assert from 'node:assert/strict';

const store = fs.readFileSync('services/storage/cloudBackupTransferStore.ts', 'utf8');
const worker = fs.readFileSync('workers/cloudBackup.worker.ts', 'utf8');
const client = fs.readFileSync('services/cloudBackupWorkerClient.ts', 'utf8');

assert(store.includes("const CLOUD_TRANSFER_DB = 'KaiTuoYiShiCloudTransferDB'"));
assert(store.includes("const META_STORE = 'transfers'") && store.includes("const PART_STORE = 'parts'"));
assert(store.includes('putCloudBackupTransferPart') && store.includes('listCloudBackupTransferParts'));
assert(store.includes('cleanupExpiredCloudBackupTransfers') && store.includes('TRANSFER_TTL_MS'));
assert(!store.includes("indexedDB.open('TimeJourneyDB'"), '临时分卷不得升级或复用主存档数据库');
assert(worker.includes("type: 'hash'") && worker.includes("type: 'pack'") && worker.includes("type: 'unpack'"));
assert(worker.includes('postMessage(response, [bytes])'), 'Worker 必须转移分卷缓冲区而不是复制');
assert(client.includes("new Worker(new URL('../workers/cloudBackup.worker.ts'"));
assert(client.includes('signal?.addEventListener(\'abort\'') && client.includes('terminate()'));

console.log('[cloud-backup-transfer-regression] ok');
