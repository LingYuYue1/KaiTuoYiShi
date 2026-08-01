import assert from 'node:assert/strict';

import {
  CLOUD_BACKUP_PART_TARGET_BYTES,
  CLOUD_BACKUP_VERSION,
  fingerprintCloudBackupNode,
  packCloudBackupPart,
  sha256Hex,
  unpackCloudBackupPart,
} from '../services/cloudBackupPackage.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

assert.equal(CLOUD_BACKUP_VERSION, 2);
assert.equal(CLOUD_BACKUP_PART_TARGET_BYTES, 8 * 1024 * 1024);

const packed = await packCloudBackupPart([
  { name: 'nodes/root-a/node-1.json', bytes: encoder.encode(JSON.stringify({ id: 1, value: '节点一' })) },
  { name: 'assets/abc.bin', bytes: new Uint8Array([1, 2, 3, 4, 5]) },
]);
assert(packed.bytes.byteLength > 0);
assert.match(packed.sha256, /^[a-f0-9]{64}$/);

const unpacked = await unpackCloudBackupPart(packed.bytes, packed.compression);
assert.deepEqual(JSON.parse(decoder.decode(unpacked.get('nodes/root-a/node-1.json'))), { id: 1, value: '节点一' });
assert.deepEqual([...unpacked.get('assets/abc.bin')], [1, 2, 3, 4, 5]);

const firstFingerprint = await fingerprintCloudBackupNode({
  id: 7,
  type: 'auto',
  timestamp: 100,
  世界: { 当前地点: '列车', 当前日期: '2157.03.07' },
  saveRuntime: { hiddenDeltaBase: true },
  nested: { b: 2, a: 1, debugContext: { ignored: true } },
});
const sameFingerprint = await fingerprintCloudBackupNode({
  nested: { a: 1, b: 2 },
  saveRuntime: { hiddenDeltaBase: false },
  世界: { 当前日期: '2157.03.07', 当前地点: '列车' },
  timestamp: 100,
  type: 'auto',
  id: 999,
});
assert.equal(firstFingerprint, sameFingerprint, '本地数字 ID、运行时标记和属性顺序不得影响节点指纹');
assert.notEqual(
  firstFingerprint,
  await fingerprintCloudBackupNode({ type: 'auto', timestamp: 100, 世界: { 当前地点: '黑塔空间站' }, nested: { a: 1, b: 2 } }),
  '真实进度变化必须改变节点指纹',
);

const corrupted = packed.bytes.slice();
corrupted[corrupted.length - 1] ^= 0xff;
await assert.rejects(() => unpackCloudBackupPart(corrupted, packed.compression));
await assert.rejects(() => packCloudBackupPart([{ name: '../escape.json', bytes: encoder.encode('{}') }]));
assert.equal(await sha256Hex(new Uint8Array([1, 2, 3])), '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');

console.log('[cloud-backup-package-regression] ok');
