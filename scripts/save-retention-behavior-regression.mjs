import assert from 'node:assert/strict';

import {
  MAX_AUTO_SAVE_NODES_PER_TREE,
  MAX_MANUAL_SAVE_NODES_PER_TREE,
  selectSaveNodeRotationCandidates,
} from '../services/storage/saveRetention.ts';

function save(id, type, rootId, timestamp = id) {
  return {
    id,
    type,
    timestamp,
    saveTree: rootId ? { rootId, nodeId: `node-${id}`, createdAt: timestamp } : undefined,
  };
}

assert.equal(MAX_MANUAL_SAVE_NODES_PER_TREE, 5, '每棵树必须最多保留 5 个手动节点');
assert.equal(MAX_AUTO_SAVE_NODES_PER_TREE, 6, '每棵树必须最多保留 6 个自动节点');

const unlimitedTrees = Array.from({ length: 20 }, (_, index) => save(index + 1, 'auto', `root-${index + 1}`));
assert.deepEqual(
  selectSaveNodeRotationCandidates(unlimitedTrees),
  [],
  '存档树数量必须无限，不能因为 rootId 数量增加而轮转整棵树',
);

const autoOverflow = Array.from({ length: 7 }, (_, index) => save(index + 1, 'auto', 'root-auto'));
assert.deepEqual(
  selectSaveNodeRotationCandidates(autoOverflow).map((item) => item.id),
  [1],
  '同一棵树写入第 7 个自动节点后必须只清理最旧自动节点',
);

const manualOverflow = Array.from({ length: 6 }, (_, index) => save(index + 11, 'manual', 'root-manual'));
assert.deepEqual(
  selectSaveNodeRotationCandidates(manualOverflow).map((item) => item.id),
  [11],
  '同一棵树写入第 6 个手动节点后必须只清理最旧手动节点',
);

const mixedTree = [
  ...Array.from({ length: 7 }, (_, index) => save(index + 21, 'auto', 'root-mixed')),
  ...Array.from({ length: 6 }, (_, index) => save(index + 31, 'manual', 'root-mixed')),
  save(50, 'imported', 'root-mixed'),
  save(51, 'backup', 'root-mixed'),
];
assert.deepEqual(
  selectSaveNodeRotationCandidates(mixedTree).map((item) => item.id).sort((left, right) => left - right),
  [21, 31],
  '同一棵树的手动和自动额度必须分别计算，导入与历史恢复点不占额度',
);

const independentTrees = [
  ...Array.from({ length: 7 }, (_, index) => save(index + 61, 'auto', 'root-a')),
  ...Array.from({ length: 7 }, (_, index) => save(index + 71, 'auto', 'root-b')),
];
assert.deepEqual(
  selectSaveNodeRotationCandidates(independentTrees).map((item) => item.id).sort((left, right) => left - right),
  [61, 71],
  '不同存档树必须独立轮转各自最旧节点',
);

const sameTimestamp = Array.from({ length: 7 }, (_, index) => save(index + 81, 'auto', 'root-tie', 1000));
assert.deepEqual(
  selectSaveNodeRotationCandidates(sameTimestamp).map((item) => item.id),
  [81],
  '时间相同时必须使用 ID 判断新旧并保留更大的新 ID',
);

const legacyNodes = [save(91, 'auto'), save(92, 'auto'), save(93, 'manual'), save(94, 'manual')];
assert.deepEqual(
  selectSaveNodeRotationCandidates(legacyNodes),
  [],
  '缺少 rootId 的旧节点必须各自隔离，不能猜测归属后跨节点清理',
);

console.log('[save-retention-behavior-regression] ok');
