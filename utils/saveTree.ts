import type { 存档数据 } from '@/models/settings';
import { createUnifiedId } from '@/utils/id';

export interface 存档树元信息 {
  rootId: string;
  nodeId: string;
  parentNodeId?: string;
  branchName?: string;
  createdAt: number;
}

type SaveWithTree = 存档数据 & {
  saveTree?: 存档树元信息;
};

function createId(): string {
  return createUnifiedId();
}

export function ensureSaveTreeRoot(save: 存档数据): 存档树元信息 {
  const existing = (save as SaveWithTree).saveTree;
  if (existing?.rootId && existing.nodeId) return existing;
  const nodeId = createId();
  return {
    rootId: createId(),
    nodeId,
    createdAt: save.timestamp || Date.now(),
  };
}

export function buildNextSaveTreeMeta(params: {
  previous?: 存档数据 | null;
  type: 存档数据['type'];
  timestamp: number;
  nodeId?: string;
}): 存档树元信息 {
  const previousTree = params.previous ? ensureSaveTreeRoot(params.previous) : undefined;
  if (!previousTree) {
    return {
      rootId: createId(),
      nodeId: params.nodeId ?? createId(),
      createdAt: params.timestamp,
    };
  }
  return {
    rootId: previousTree.rootId,
    nodeId: params.nodeId ?? createId(),
    parentNodeId: previousTree.nodeId,
    branchName: params.type === 'auto' ? '自动节点' : params.type === 'backup' ? '保护节点' : undefined,
    createdAt: params.timestamp,
  };
}

export function attachSaveTreeMeta<T extends 存档数据>(save: T, meta: 存档树元信息): T {
  return {
    ...save,
    saveTree: meta,
  };
}

export function getSaveTreeMeta(save: 存档数据): 存档树元信息 {
  return ensureSaveTreeRoot(save);
}
