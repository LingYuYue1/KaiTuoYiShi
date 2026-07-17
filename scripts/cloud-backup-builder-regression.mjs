import fs from 'node:fs';
import assert from 'node:assert/strict';

const builder = fs.readFileSync('services/cloudBackupBuilder.ts', 'utf8');

assert(builder.includes('buildCompleteCloudBackup'));
assert(builder.includes('catalogComplete') && builder.includes('请先修复存档索引'));
assert(builder.includes('for (let index = 0; index < ordered.length; index += 1)'));
assert(builder.includes('await source.loadSaveBundle(summary.id)') && builder.includes('await source.loadSave(summary.id)'));
assert(!builder.includes('Promise.all(ordered.map'), '完整节点不得批量加载');
assert(builder.includes('assetByContentHash') && builder.includes('worker.hash(bytes'));
assert(builder.includes('stripSaveAssetPayloadForStorage(save)'));
assert(builder.includes('currentRawBytes + entry.bytes.byteLength > CLOUD_BACKUP_PART_TARGET_BYTES'));
assert(builder.includes('putCloudBackupTransferPart'));
assert(builder.includes('await yieldToMainThread()'));
assert(builder.includes('worker.dispose'));
assert(builder.includes('deleteCloudBackupTransfer(transferId)'));

console.log('[cloud-backup-builder-regression] ok');
