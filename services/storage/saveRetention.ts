export const MAX_MANUAL_SAVE_NODES_PER_TREE = 5;
export const MAX_AUTO_SAVE_NODES_PER_TREE = 6;

interface SaveRetentionItem {
  id: number;
  type: string;
  timestamp: number;
  saveTree?: {
    rootId?: string;
  };
}

export function selectSaveNodeRotationCandidates<T extends SaveRetentionItem>(items: readonly T[]): T[] {
  const buckets = new Map<string, T[]>();

  for (const item of items) {
    if (item.type !== 'manual' && item.type !== 'auto') continue;
    const rootId = item.saveTree?.rootId?.trim();
    const rootKey = rootId || `legacy-isolated-${item.type}-${item.id}`;
    const bucketKey = `${rootKey}\u0000${item.type}`;
    const bucket = buckets.get(bucketKey) ?? [];
    bucket.push(item);
    buckets.set(bucketKey, bucket);
  }

  const candidates: T[] = [];
  for (const bucket of buckets.values()) {
    const newestFirst = [...bucket].sort(compareNewestSaveNodeFirst);
    const limit = newestFirst[0]?.type === 'manual'
      ? MAX_MANUAL_SAVE_NODES_PER_TREE
      : MAX_AUTO_SAVE_NODES_PER_TREE;
    candidates.push(...newestFirst.slice(limit));
  }

  return candidates.sort(compareOldestSaveNodeFirst);
}

function compareNewestSaveNodeFirst(left: SaveRetentionItem, right: SaveRetentionItem): number {
  return right.timestamp - left.timestamp || right.id - left.id;
}

function compareOldestSaveNodeFirst(left: SaveRetentionItem, right: SaveRetentionItem): number {
  return left.timestamp - right.timestamp || left.id - right.id;
}
