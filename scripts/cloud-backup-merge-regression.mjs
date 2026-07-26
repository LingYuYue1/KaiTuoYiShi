import assert from 'node:assert/strict';
import {
  buildCloudBackupNodePlan,
  cloudBackupNodeIdentity,
} from '../services/cloudBackupMergePlan.ts';

const hash = (character) => character.repeat(64);
const nodes = [
  {
    sourceSaveId: 1,
    type: 'manual',
    timestamp: 1,
    turnCount: 1,
    rootId: 'root-a',
    nodeId: 'node-a1',
    fingerprint: hash('a'),
    entryPath: 'nodes/a.json',
    partIndex: 0,
  },
  {
    sourceSaveId: 2,
    type: 'auto',
    timestamp: 2,
    turnCount: 2,
    rootId: 'root-b',
    nodeId: 'node-b1',
    fingerprint: hash('b'),
    entryPath: 'nodes/b1.json',
    partIndex: 0,
  },
  {
    sourceSaveId: 3,
    type: 'auto',
    timestamp: 3,
    turnCount: 3,
    rootId: 'root-b',
    nodeId: 'node-b2',
    parentNodeId: 'node-b1',
    fingerprint: hash('c'),
    entryPath: 'nodes/b2.json',
    partIndex: 1,
  },
];

let nextId = 0;
const plan = buildCloudBackupNodePlan(nodes, {
  fingerprints: new Set([hash('a')]),
  nodeFingerprints: new Map([
    [cloudBackupNodeIdentity('root-a', 'node-a1'), hash('a')],
    [cloudBackupNodeIdentity('root-b', 'node-b1'), hash('d')],
  ]),
}, (prefix) => `${prefix}-${++nextId}`);

assert.deepEqual([...plan.skippedEntryPaths], ['nodes/a.json'], '相同内容节点必须跳过');
assert.deepEqual([...plan.conflictRoots], ['root-b'], '相同节点 ID、不同内容必须标记整棵冲突树');
assert.equal(plan.rootIdMap.get('root-b'), 'save_root_cloud-1');
assert.equal(plan.nodeIdMap.size, 2, '冲突树内所有云端节点都必须重映射');
assert.notEqual(
  plan.nodeIdMap.get(cloudBackupNodeIdentity('root-b', 'node-b1')),
  plan.nodeIdMap.get(cloudBackupNodeIdentity('root-b', 'node-b2')),
  '冲突树节点映射必须保持唯一',
);

const duplicateInsideCloud = buildCloudBackupNodePlan([
  nodes[1],
  { ...nodes[2], fingerprint: nodes[1].fingerprint },
], {
  fingerprints: new Set(),
  nodeFingerprints: new Map(),
}, (prefix) => `${prefix}-x`);
assert(duplicateInsideCloud.skippedEntryPaths.has('nodes/b2.json'), '同一云包内重复内容也必须跳过');

console.log('[cloud-backup-merge-regression] ok');
