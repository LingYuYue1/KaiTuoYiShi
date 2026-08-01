import assert from 'node:assert/strict';

import {
  buildSaveCatalogSnapshot,
  createCatalogRecordFromSummary,
  createHiddenDeltaBaseCatalogRecord,
  createUnreadableSaveCatalogRecord,
} from '../services/storage/saveCatalog.ts';
import {
  runWithSaveMutationPriority,
  startSaveCatalogRepairTask,
} from '../services/storage/saveCatalogRepair.ts';

function summary(id, type, timestamp = id) {
  return {
    id,
    type,
    timestamp,
    travelerName: `旅人${id}`,
    turnCount: id,
    worldPeriodName: '',
    currentDate: '',
    currentTime: '',
    currentLocation: '',
    lastSummary: '',
    sizeBytes: 1024,
  };
}

const records = [
  createCatalogRecordFromSummary(summary(1, 'manual')),
  createCatalogRecordFromSummary(summary(2, 'auto')),
  createCatalogRecordFromSummary(summary(3, 'imported')),
  createCatalogRecordFromSummary(summary(4, 'backup')),
  createHiddenDeltaBaseCatalogRecord({ id: 5, type: 'auto', timestamp: 5 }),
];
const complete = buildSaveCatalogSnapshot(records, [1, 2, 3, 4, 5]);
assert.deepEqual(complete.items.map((item) => item.id), [3, 2, 1], '主目录必须包含手动、自动和导入节点。');
assert.deepEqual(complete.legacyBackups.map((item) => item.id), [4], '旧 backup 必须从主目录分离。');
assert.equal(complete.hiddenBaseCount, 1, '隐藏增量基底必须有轻量目录标记。');
assert.equal(complete.catalogComplete, true, '所有主键都有目录记录时必须判定完整。');

const missing = buildSaveCatalogSnapshot(records, [1, 2, 3, 4, 5, 6]);
assert.deepEqual(missing.pendingIds, [6], '缺失摘要必须只返回对应主键。');
assert.equal(missing.catalogComplete, false, '存在缺失摘要时不得允许依赖完整目录的操作。');

const unreadable = buildSaveCatalogSnapshot([
  ...records,
  createUnreadableSaveCatalogRecord({ id: 6, error: new Error('broken') }),
], [1, 2, 3, 4, 5, 6]);
assert.deepEqual(unreadable.unreadableIds, [6], '不可读节点必须保留故障标记。');
assert.equal(unreadable.catalogComplete, false, '不可读节点存在时整树目录仍不完整。');

let releaseFirst;
let firstStarted;
const firstStartedPromise = new Promise((resolve) => {
  firstStarted = resolve;
});
const firstGate = new Promise((resolve) => {
  releaseFirst = resolve;
});
const repaired = [];
const operations = {
  collectIds: async () => [11, 12],
  repairOne: async (id) => {
    repaired.push(id);
    if (id === 11) {
      firstStarted();
      await firstGate;
    }
  },
  cleanupStaleRecords: async () => {},
  acquireLease: async () => true,
  renewLease: async () => {},
  releaseLease: async () => {},
};

const firstRepair = startSaveCatalogRepairTask('missing-only', operations);
const sameRepair = startSaveCatalogRepairTask('full-validation', operations);
assert.equal(firstRepair, sameRepair, '同一标签页必须复用正在运行的恢复任务。');
await firstStartedPromise;

let releaseWrite;
const writeGate = new Promise((resolve) => {
  releaseWrite = resolve;
});
const writeTask = runWithSaveMutationPriority(() => writeGate);
releaseFirst();
await new Promise((resolve) => setTimeout(resolve, 20));
assert.deepEqual(repaired, [11], '待写操作存在时不得开始恢复下一节点。');
releaseWrite();
await writeTask;
await firstRepair;
assert.deepEqual(repaired, [11, 12], '写操作完成后必须继续剩余恢复节点。');

console.log('[save-catalog-behavior-regression] ok');
