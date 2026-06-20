import type { 存档数据 } from '@/models/settings';

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

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function ensureSaveTreeRoot(save: 存档数据): 存档树元信息 {
  const existing = (save as SaveWithTree).saveTree;
  if (existing?.rootId && existing.nodeId) return existing;
  const nodeId = createId('save_node');
  return {
    rootId: createId('save_root'),
    nodeId,
    createdAt: save.timestamp || Date.now(),
  };
}

export function buildNextSaveTreeMeta(params: {
  previous?: 存档数据 | null;
  type: 存档数据['type'];
  timestamp: number;
}): 存档树元信息 {
  const previousTree = params.previous ? ensureSaveTreeRoot(params.previous) : undefined;
  if (!previousTree) {
    return {
      rootId: createId('save_root'),
      nodeId: createId('save_node'),
      createdAt: params.timestamp,
    };
  }
  return {
    rootId: previousTree.rootId,
    nodeId: createId('save_node'),
    parentNodeId: previousTree.nodeId,
    branchName: params.type === 'auto' ? '自动节点' : params.type === 'backup' ? '保护节点' : undefined,
    createdAt: params.timestamp,
  };
}

export function attachSaveTreeMeta<T extends 存档数据>(save: T, meta: 存档树元信息): T {
  return {
    ...save,
    saveTree: meta,
  } as T;
}

export function getSaveTreeMeta(save: 存档数据): 存档树元信息 {
  return ensureSaveTreeRoot(save);
}
