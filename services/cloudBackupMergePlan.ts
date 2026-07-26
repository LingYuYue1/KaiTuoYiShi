import type { CloudBackupNodeMeta } from './cloudBackupPackage.ts';

export interface CloudBackupNodePlanInput {
  fingerprints: Set<string>;
  nodeFingerprints: Map<string, string>;
}

export interface CloudBackupNodePlan {
  skippedEntryPaths: Set<string>;
  conflictRoots: Set<string>;
  rootIdMap: Map<string, string>;
  nodeIdMap: Map<string, string>;
}

export function buildCloudBackupNodePlan(
  nodes: CloudBackupNodeMeta[],
  local: CloudBackupNodePlanInput,
  createId: (prefix: string) => string = createPlanId,
): CloudBackupNodePlan {
  const skippedEntryPaths = new Set<string>();
  const conflictRoots = new Set<string>();
  const plannedFingerprints = new Set(local.fingerprints);

  for (const node of nodes) {
    if (plannedFingerprints.has(node.fingerprint)) {
      skippedEntryPaths.add(node.entryPath);
      continue;
    }
    plannedFingerprints.add(node.fingerprint);
    if (!node.rootId || !node.nodeId) continue;
    const existing = local.nodeFingerprints.get(nodeIdentity(node.rootId, node.nodeId));
    if (existing && existing !== node.fingerprint) conflictRoots.add(node.rootId);
  }

  const rootIdMap = new Map<string, string>();
  const nodeIdMap = new Map<string, string>();
  for (const rootId of conflictRoots) rootIdMap.set(rootId, createId('save_root_cloud'));
  for (const node of nodes) {
    if (!node.rootId || !node.nodeId || !conflictRoots.has(node.rootId)) continue;
    nodeIdMap.set(nodeIdentity(node.rootId, node.nodeId), createId('save_node_cloud'));
  }
  return { skippedEntryPaths, conflictRoots, rootIdMap, nodeIdMap };
}

export function cloudBackupNodeIdentity(rootId: string, nodeId: string): string {
  return nodeIdentity(rootId, nodeId);
}

function nodeIdentity(rootId: string, nodeId: string): string {
  return `${rootId}\0${nodeId}`;
}

function createPlanId(prefix: string): string {
  const random = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2, 18);
  return `${prefix}_${Date.now()}_${random}`;
}
