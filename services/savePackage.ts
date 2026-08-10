import type { 存档数据 } from '@/models/settings';
import { createSaveEnvelope, type SaveEnvelope } from '@/models/settings';
import { compactDuplicatedSaveImages } from '@/utils/saveImageCompactor';
import { buildSaveNodeDeltaRecord } from '@/utils/saveDeltaStorage';
import { expandSaveAssetPayloadForExport } from '@/utils/saveAssetStorage';
import { createUnifiedId } from '@/utils/id';
import { buildStoredZip, readZipEntries } from '@/utils/zip';

const PACKAGE_VERSION = 2;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PACKAGE_CORE_FILES = ['manifest.json', 'save.json'] as const;
const SYSTEM_ENTRY_PATHS = [
  'systems/memory.json',
  'systems/yiting.json',
  'systems/zhiku-runtime.json',
  'systems/phone.json',
  'systems/npc.json',
  'systems/album.json',
  'systems/news.json',
  'systems/plot.json',
  'systems/story-weaving.json',
  'systems/variable-batches.json',
  'systems/queue-tasks.json',
] as const;
const TREE_NODE_DELTA_PATH = 'tree/node-delta.json';
const TREE_MANIFEST_PATH = 'tree/tree-manifest.json';
const TREE_NODE_DIR = 'tree/nodes';

export interface 存档包清单 {
  app: 'KaiTuoYiShi';
  kind: 'save-package' | 'save-tree-package';
  packageVersion: number;
  exportedAt: string;
  travelerName: string;
  turnCount: number;
  timestamp: number;
  format: 'ktysave';
  nodeCount?: number;
  rootId?: string;
  privacy: {
    apiKeysRemoved: boolean;
  };
  files: string[];
}

export interface 存档树包清单 {
  rootId: string;
  exportedAt: string;
  nodeCount: number;
  latestSaveId: number;
  nodes: Array<{
    id: number;
    nodeId: string;
    parentNodeId?: string;
    branchName?: string;
    type: 存档数据['type'];
    timestamp: number;
    turnCount: number;
    path: string;
  }>;
}

export async function buildSavePackage(save: 存档数据): Promise<Blob> {
  const expanded = await expandSaveAssetPayloadForExport(save);
  const entries = splitSaveIntoPackageEntries(sanitizeSaveForExport(compactDuplicatedSaveImages(expanded)));
  const bytes = buildStoredZip(entries);
  return new Blob([bytes], { type: 'application/zip' });
}

export async function buildSaveTreePackage(saves: 存档数据[]): Promise<Blob> {
  const expandedSaves = await Promise.all(
    saves
      .map((save) => expandSaveAssetPayloadForExport(save)),
  );
  const normalized = expandedSaves
    .map((save) => sanitizeSaveForExport(compactDuplicatedSaveImages(save)))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0) || (a.id || 0) - (b.id || 0));
  if (!normalized.length) {
    throw new Error('没有可导出的存档树节点');
  }
  const rootId = getSaveTreeRootId(normalized[0]) || createUnifiedId();
  const latest = [...normalized].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
  const nodeEntries = normalized.map((save, index) => {
    const tree = getSaveTreeMetaLoose(save);
    const nodeId = tree?.nodeId || createUnifiedId();
    const path = `${TREE_NODE_DIR}/${sanitizePackageSegment(nodeId)}-${save.id || index + 1}.json`;
    return {
      save,
      path,
      meta: {
        id: save.id || index + 1,
        nodeId,
        parentNodeId: tree?.parentNodeId,
        branchName: tree?.branchName,
        type: save.type,
        timestamp: save.timestamp || Date.now(),
        turnCount: save.turnCount ?? (save.chatHistory.length + 1),
        path,
      },
    };
  });
  const treeManifest: 存档树包清单 = {
    rootId,
    exportedAt: new Date().toISOString(),
    nodeCount: nodeEntries.length,
    latestSaveId: latest.id || nodeEntries.at(-1)?.meta.id || 0,
    nodes: nodeEntries.map((entry) => entry.meta),
  };
  const files: Array<[string, unknown]> = [
    [TREE_MANIFEST_PATH, treeManifest],
    ...nodeEntries.map((entry) => [entry.path, createSaveEnvelope(entry.save)] as [string, unknown]),
  ];
  const manifest: 存档包清单 = {
    app: 'KaiTuoYiShi',
    kind: 'save-tree-package',
    packageVersion: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    travelerName: latest.旅人.姓名 || 'traveler',
    turnCount: latest.turnCount ?? (latest.chatHistory.length + 1),
    timestamp: latest.timestamp || Date.now(),
    format: 'ktysave',
    nodeCount: nodeEntries.length,
    rootId,
    privacy: {
      apiKeysRemoved: true,
    },
    files: ['manifest.json', ...files.map(([name]) => name)],
  };
  const entries = [
    textEntry('manifest.json', manifest),
    ...files.map(([name, value]) => textEntry(name, value)),
  ];
  return new Blob([buildStoredZip(entries)], { type: 'application/zip' });
}

export function sanitizeSaveForExport(save: 存档数据): 存档数据 {
  const sanitized = JSON.parse(JSON.stringify(compactDuplicatedSaveImages(save))) as 存档数据 & {
    saveRuntime?: unknown;
    debugContext?: unknown;
  };
  delete sanitized.saveRuntime;
  delete sanitized.debugContext;
  sanitized.chatHistory = stripRuntimeDebugFromChatHistory(sanitized.chatHistory);
  return sanitized;
}

/** Async export sanitizer that rehydrates Blob-backed album assets into portable dataUrls. */
export async function sanitizeSaveForExportAsync(save: 存档数据): Promise<存档数据> {
  const expanded = await expandSaveAssetPayloadForExport(save);
  return sanitizeSaveForExport(expanded);
}

function stripRuntimeDebugFromChatHistory(chatHistory: 存档数据['chatHistory']): 存档数据['chatHistory'] {
  if (!Array.isArray(chatHistory)) return [];
  return chatHistory.map((message) => {
    const clean = { ...message } as typeof message & {
      debugContext?: unknown;
    };
    delete clean.debugContext;
    return clean;
  });
}

export function parseSavePackage(buffer: ArrayBuffer): 存档数据 {
  const files = readZip(buffer);
  const manifestText = files.get('manifest.json');
  if (!manifestText) {
    throw new Error('存档包缺少 manifest.json');
  }
  const manifest = JSON.parse(manifestText) as Partial<存档包清单>;
  validatePackageManifest(manifest, files);
  if (manifest.kind === 'save-tree-package') {
    const tree = parseSaveTreePackageFiles(files, manifest);
    const latest = tree.nodes.find((save) => save.id === tree.latestSaveId) ?? tree.nodes.at(-1);
    if (!latest) throw new Error('存档树包没有可导入节点');
    return latest;
  }
  const saveText = files.get('save.json');
  if (!saveText) {
    throw new Error('存档包缺少 save.json');
  }
  const parsed = JSON.parse(saveText) as Partial<SaveEnvelope> & Partial<存档数据>;
  const save: 存档数据 = parsed.gameData
    ? {
      ...parsed.gameData,
      id: Number(parsed.id) || 0,
      type: parseSerializedSaveType(parsed.type),
      timestamp: Number(parsed.timestamp) || Date.now(),
      turnCount: parsed.turnCount,
    }
    : parsed as 存档数据;
  const read = (path: string): unknown => {
    const text = files.get(path);
    return text ? JSON.parse(text) : undefined;
  };
  return {
    ...save,
    记忆: (read('systems/memory.json') as 存档数据['记忆'] | undefined) ?? save.记忆,
    忆庭: (read('systems/yiting.json') as 存档数据['忆庭'] | undefined) ?? save.忆庭,
    智库: (read('systems/zhiku-runtime.json') as 存档数据['智库'] | undefined) ?? save.智库,
    手机: (read('systems/phone.json') as 存档数据['手机'] | undefined) ?? save.手机,
    NPC: (read('systems/npc.json') as 存档数据['NPC'] | undefined) ?? save.NPC,
    相册: (read('systems/album.json') as 存档数据['相册'] | undefined) ?? save.相册,
    新闻: (read('systems/news.json') as 存档数据['新闻'] | undefined) ?? save.新闻,
    剧情: (read('systems/plot.json') as 存档数据['剧情'] | undefined) ?? save.剧情,
    剧情编织: (read('systems/story-weaving.json') as 存档数据['剧情编织'] | undefined) ?? save.剧情编织,
    variableBatches: (read('systems/variable-batches.json') as 存档数据['variableBatches'] | undefined) ?? save.variableBatches,
    queueTasks: (read('systems/queue-tasks.json') as 存档数据['queueTasks'] | undefined) ?? save.queueTasks,
  };
}

export function parseSaveTreePackage(buffer: ArrayBuffer): 存档数据[] {
  const files = readZip(buffer);
  const manifestText = files.get('manifest.json');
  if (!manifestText) {
    throw new Error('存档包缺少 manifest.json');
  }
  const manifest = JSON.parse(manifestText) as Partial<存档包清单>;
  validatePackageManifest(manifest, files);
  if (manifest.kind !== 'save-tree-package') {
    return [parseSavePackage(buffer)];
  }
  return parseSaveTreePackageFiles(files, manifest).nodes;
}

function parseSaveTreePackageFiles(files: Map<string, string>, manifest: Partial<存档包清单>): { latestSaveId: number; nodes: 存档数据[] } {
  const treeManifestText = files.get(TREE_MANIFEST_PATH);
  if (!treeManifestText) {
    throw new Error('存档树包缺少 tree/tree-manifest.json');
  }
  const treeManifest = JSON.parse(treeManifestText) as {
    nodes?: unknown[];
    latestSaveId?: unknown;
  };
  if (!Array.isArray(treeManifest.nodes) || treeManifest.nodes.length === 0) {
    throw new Error('存档树包节点清单为空');
  }
  const nodes = treeManifest.nodes.map((node) => {
    const candidate = node && typeof node === 'object' ? node as { path?: unknown } : null;
    if (!candidate?.path || !isSafePackagePath(candidate.path)) {
      throw new Error('存档树包节点路径异常');
    }
    const text = files.get(candidate.path);
    if (!text) {
      throw new Error(`存档树包缺少节点文件：${candidate.path}`);
    }
    return parseSerializedSave(JSON.parse(text));
  });
  return {
    latestSaveId: Number(treeManifest.latestSaveId) || Number(manifest.timestamp) || 0,
    nodes,
  };
}

function parseSerializedSave(value: unknown): 存档数据 {
  if (!value || typeof value !== 'object') {
    throw new Error('存档节点格式无效');
  }
  const parsed = value as Partial<SaveEnvelope> & Partial<存档数据>;
  if (!parsed.gameData) return parsed as 存档数据;
  return {
    ...parsed.gameData,
    id: Number(parsed.id) || 0,
    type: parseSerializedSaveType(parsed.type),
    timestamp: Number(parsed.timestamp) || Date.now(),
    turnCount: parsed.turnCount,
  };
}

function parseSerializedSaveType(value: unknown): 存档数据['type'] {
  return value === 'manual' || value === 'auto' || value === 'backup' || value === 'imported'
    ? value
    : 'imported';
}

function splitSaveIntoPackageEntries(save: 存档数据): Array<{ name: string; data: Uint8Array }> {
  const envelope = createSaveEnvelope(save);
  const {
    记忆,
    忆庭,
    智库,
    手机,
    NPC,
    相册,
    新闻,
    剧情,
    剧情编织,
    variableBatches,
    queueTasks,
    ...core
  } = envelope.gameData;
  const files = ([
    ['save.json', {
      ...envelope,
      gameData: core,
    }],
    [SYSTEM_ENTRY_PATHS[0], 记忆],
    [SYSTEM_ENTRY_PATHS[1], 忆庭],
    [SYSTEM_ENTRY_PATHS[2], 智库],
    [SYSTEM_ENTRY_PATHS[3], 手机],
    [SYSTEM_ENTRY_PATHS[4], NPC],
    [SYSTEM_ENTRY_PATHS[5], 相册],
    [SYSTEM_ENTRY_PATHS[6], 新闻],
    [SYSTEM_ENTRY_PATHS[7], 剧情],
    [SYSTEM_ENTRY_PATHS[8], 剧情编织],
    [SYSTEM_ENTRY_PATHS[9], variableBatches],
    [SYSTEM_ENTRY_PATHS[10], queueTasks],
    [TREE_NODE_DELTA_PATH, buildSaveNodeDeltaRecord(save, save.id || 0)],
  ] satisfies Array<[string, unknown]>).filter(([, value]) => value !== undefined);

  const manifest: 存档包清单 = {
    app: 'KaiTuoYiShi',
    kind: 'save-package',
    packageVersion: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    travelerName: envelope.gameData.旅人.姓名 || 'traveler',
    turnCount: envelope.turnCount ?? (envelope.gameData.chatHistory.length + 1),
    timestamp: envelope.timestamp || Date.now(),
    format: 'ktysave',
    privacy: {
      apiKeysRemoved: true,
    },
    files: ['manifest.json', ...files.map(([name]) => name)],
  };

  return [
    textEntry('manifest.json', manifest),
    ...files.map(([name, value]) => textEntry(name, value)),
  ];
}

function textEntry(name: string, value: unknown): { name: string; data: Uint8Array } {
  return {
    name,
    data: encoder.encode(JSON.stringify(value, null, 2)),
  };
}

function validatePackageManifest(manifest: Partial<存档包清单>, files: Map<string, string>): void {
  if (manifest.app !== 'KaiTuoYiShi' || (manifest.kind !== 'save-package' && manifest.kind !== 'save-tree-package')) {
    throw new Error('不是有效的开拓轶事存档包');
  }
  if (manifest.format !== 'ktysave') {
    throw new Error('存档包格式标记异常');
  }
  if (!Number.isInteger(manifest.packageVersion) || (manifest.packageVersion ?? 0) < 1) {
    throw new Error('存档包版本异常');
  }
  if ((manifest.packageVersion ?? 0) > PACKAGE_VERSION) {
    throw new Error('存档包版本过高，请更新客户端后再导入');
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error('存档包清单缺少文件列表');
  }

  for (const path of manifest.files) {
    if (!isSafePackagePath(path)) {
      throw new Error(`存档包清单包含非法路径：${String(path)}`);
    }
    if (!files.has(path)) {
      throw new Error(`存档包缺少清单文件：${path}`);
    }
  }

  const coreFiles = manifest.kind === 'save-tree-package' ? ['manifest.json', TREE_MANIFEST_PATH] : PACKAGE_CORE_FILES;
  for (const path of coreFiles) {
    if (!manifest.files.includes(path) || !files.has(path)) {
      throw new Error(`存档包缺少核心文件：${path}`);
    }
  }
}

function isSafePackagePath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !path.includes('\\') &&
    !path.split('/').includes('..')
  );
}

function getSaveTreeMetaLoose(save: 存档数据): { rootId?: string; nodeId?: string; parentNodeId?: string; branchName?: string } | undefined {
  return (save as 存档数据 & { saveTree?: { rootId?: string; nodeId?: string; parentNodeId?: string; branchName?: string } }).saveTree;
}

function getSaveTreeRootId(save: 存档数据): string | undefined {
  return getSaveTreeMetaLoose(save)?.rootId;
}

function sanitizePackageSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80) || 'node';
}

function readZip(buffer: ArrayBuffer): Map<string, string> {
  const files = readZipEntries(new Uint8Array(buffer));
  const result = new Map<string, string>();
  for (const [name, data] of files) result.set(name, decoder.decode(data));
  return result;
}
