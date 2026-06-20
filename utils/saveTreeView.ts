import type { SaveListItemSummary } from '@/services/dbService';

export interface SaveTreeDisplayNode {
  save: SaveListItemSummary;
  children: SaveTreeDisplayNode[];
  depth: number;
  isRoot: boolean;
  isLatest: boolean;
}

export interface SaveTreeDisplayGroup {
  rootId: string;
  rootSave: SaveListItemSummary;
  latestSave: SaveListItemSummary;
  nodes: SaveTreeDisplayNode[];
  nodeCount: number;
  branchCount: number;
  totalSizeBytes: number;
}

interface WorkingNode {
  save: SaveListItemSummary;
  nodeId: string;
  parentNodeId?: string;
  children: WorkingNode[];
}

export function buildSaveTreeGroups(saves: SaveListItemSummary[]): SaveTreeDisplayGroup[] {
  const buckets = new Map<string, SaveListItemSummary[]>();
  const legacyRootIds = buildLegacyRootIdMap(saves.filter((save) => !save.saveTree?.rootId));
  for (const save of saves) {
    const rootId = save.saveTree?.rootId || legacyRootIds.get(save.id) || `legacy-root-${save.id}`;
    const bucket = buckets.get(rootId) ?? [];
    bucket.push(save);
    buckets.set(rootId, bucket);
  }

  return Array.from(buckets.entries())
    .map(([rootId, bucket]) => buildSaveTreeGroup(rootId, bucket, legacyRootIds))
    .sort((a, b) => b.latestSave.timestamp - a.latestSave.timestamp);
}

function buildSaveTreeGroup(
  rootId: string,
  saves: SaveListItemSummary[],
  legacyRootIds: Map<number, string>,
): SaveTreeDisplayGroup {
  const nodeById = new Map<string, WorkingNode>();
  const latestSave = [...saves].sort((a, b) => b.timestamp - a.timestamp)[0];
  const totalSizeBytes = saves.reduce((sum, save) => sum + Math.max(0, save.sizeBytes || 0), 0);
  const legacyNodeIds = buildLegacyNodeIdMap(
    saves.filter((save) => !save.saveTree?.nodeId),
    legacyRootIds,
    rootId,
  );

  for (const save of saves) {
    const legacyNode = legacyNodeIds.get(save.id);
    const nodeId = save.saveTree?.nodeId || legacyNode?.nodeId || `legacy-node-${save.id}`;
    nodeById.set(nodeId, {
      save,
      nodeId,
      parentNodeId: save.saveTree?.parentNodeId || legacyNode?.parentNodeId,
      children: [],
    });
  }

  const roots: WorkingNode[] = [];
  for (const node of nodeById.values()) {
    const parent = node.parentNodeId ? nodeById.get(node.parentNodeId) : undefined;
    if (parent && parent.nodeId !== node.nodeId) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: WorkingNode[]) => {
    nodes.sort((a, b) => a.save.timestamp - b.save.timestamp || a.save.id - b.save.id);
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);

  const nodes: SaveTreeDisplayNode[] = [];
  const visit = (node: WorkingNode, depth: number, isRoot: boolean) => {
    nodes.push({
      save: node.save,
      children: [],
      depth,
      isRoot,
      isLatest: node.save.id === latestSave.id,
    });
    for (const child of node.children) visit(child, depth + 1, false);
  };
  for (const root of roots) visit(root, 0, true);
  nodes.sort((a, b) => b.save.timestamp - a.save.timestamp || b.save.id - a.save.id);

  const forkCount = Array.from(nodeById.values()).filter((node) => node.children.length > 1).length;
  const branchCount = Math.max(0, roots.length - 1) + forkCount;
  const rootSave = roots[0]?.save ?? latestSave;

  return {
    rootId,
    rootSave,
    latestSave,
    nodes,
    nodeCount: saves.length,
    branchCount,
    totalSizeBytes,
  };
}

function buildLegacyRootIdMap(saves: SaveListItemSummary[]): Map<number, string> {
  const result = new Map<number, string>();
  const byTraveler = new Map<string, SaveListItemSummary[]>();
  for (const save of saves) {
    const key = normalizeLegacyKey(save.travelerName || '未命名旅人');
    const bucket = byTraveler.get(key) ?? [];
    bucket.push(save);
    byTraveler.set(key, bucket);
  }

  for (const [key, bucket] of byTraveler.entries()) {
    const sorted = [...bucket].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
    let segment = 0;
    let previous: SaveListItemSummary | undefined;
    for (const save of sorted) {
      if (previous && save.turnCount <= previous.turnCount) segment += 1;
      result.set(save.id, `legacy-root-${key}-${segment}`);
      previous = save;
    }
  }
  return result;
}

function buildLegacyNodeIdMap(
  saves: SaveListItemSummary[],
  rootIds: Map<number, string>,
  currentRootId: string,
): Map<number, { nodeId: string; parentNodeId?: string }> {
  const result = new Map<number, { nodeId: string; parentNodeId?: string }>();
  const sorted = saves
    .filter((save) => (save.saveTree?.rootId || rootIds.get(save.id) || `legacy-root-${save.id}`) === currentRootId)
    .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
  let previousNodeId: string | undefined;
  let previousTurn = -Infinity;
  for (const save of sorted) {
    const nodeId = `legacy-node-${save.id}`;
    const startsNewRoute = save.turnCount <= previousTurn;
    result.set(save.id, {
      nodeId,
      parentNodeId: startsNewRoute ? undefined : previousNodeId,
    });
    previousNodeId = nodeId;
    previousTurn = save.turnCount;
  }
  return result;
}

function normalizeLegacyKey(value: string): string {
  return Array.from(value.trim() || 'unknown')
    .map((char) => /[a-zA-Z0-9]/.test(char) ? char.toLowerCase() : char.charCodeAt(0).toString(36))
    .join('-')
    .slice(0, 80) || 'unknown';
}
