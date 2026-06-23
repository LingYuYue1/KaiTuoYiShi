import type { SaveNodeDeltaRecord } from '@/utils/saveDeltaStorage';
import { createAppStorageAdapter } from '@/services/storage/appStorageAdapter';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';

interface DesktopSaveDeltaMirrorIndex {
  version: 1;
  updatedAt: number;
  deltas: DesktopSaveDeltaMirrorIndexItem[];
}

interface DesktopSaveDeltaMirrorIndexItem {
  nodeId: string;
  rootId: string;
  parentNodeId?: string;
  saveId: number;
  timestamp: number;
  baseMode: SaveNodeDeltaRecord['baseMode'];
}

interface DesktopSaveDeltaMirrorRecord {
  kind: 'kaituoyishi-desktop-save-delta';
  version: 1;
  mirroredAt: number;
  delta: SaveNodeDeltaRecord;
}

export interface DesktopSaveDeltaMirrorHealth {
  indexStatus: 'ok' | 'missing' | 'invalid' | 'unreadable';
  indexedDeltas: number;
  deltaFiles: number;
  validDeltaFiles: number;
  invalidDeltaFiles: number;
  unreadableDeltaFiles: number;
  missingIndexedDeltaFiles: number;
  orphanDeltaFiles: number;
}

const INDEX_PATH = 'saves/deltas/index.json';
const DELTA_RECORD_RE = /^delta-(.+)\.json$/;

export async function mirrorSaveNodeDeltaToDesktop(delta: SaveNodeDeltaRecord | null | undefined): Promise<void> {
  if (!isDesktopRuntime() || !delta?.nodeId) return;
  const index = await readDeltaIndex();
  const nextItem = buildIndexItem(delta);
  const nextDeltas = [
    nextItem,
    ...index.deltas.filter((item) => item.nodeId !== nextItem.nodeId),
  ].sort((left, right) => right.timestamp - left.timestamp || left.saveId - right.saveId);
  const record: DesktopSaveDeltaMirrorRecord = {
    kind: 'kaituoyishi-desktop-save-delta',
    version: 1,
    mirroredAt: Date.now(),
    delta,
  };
  const adapter = createAppStorageAdapter();
  await adapter.writeJson(deltaPath(delta.nodeId), record);
  await writeDeltaIndex(nextDeltas);
}

export async function removeSaveNodeDeltaFromDesktopMirror(nodeId: string): Promise<void> {
  if (!isDesktopRuntime() || !nodeId) return;
  const adapter = createAppStorageAdapter();
  const index = await readDeltaIndex();
  await adapter.remove(deltaPath(nodeId));
  await writeDeltaIndex(index.deltas.filter((item) => item.nodeId !== nodeId));
}

export async function removeSaveNodeDeltasBySaveIdFromDesktopMirror(saveId: number): Promise<void> {
  if (!isDesktopRuntime()) return;
  const adapter = createAppStorageAdapter();
  const index = await readDeltaIndex();
  const removeItems = index.deltas.filter((item) => item.saveId === saveId);
  for (const item of removeItems) {
    await adapter.remove(deltaPath(item.nodeId));
  }
  await writeDeltaIndex(index.deltas.filter((item) => item.saveId !== saveId));
}

export async function replaceDesktopSaveDeltaMirror(deltas: SaveNodeDeltaRecord[]): Promise<void> {
  if (!isDesktopRuntime()) return;
  const adapter = createAppStorageAdapter();
  const index = await readDeltaIndex();
  for (const item of index.deltas) {
    await adapter.remove(deltaPath(item.nodeId));
  }
  const nextDeltas = deltas
    .filter((delta) => Boolean(delta.nodeId))
    .map(buildIndexItem)
    .sort((left, right) => right.timestamp - left.timestamp || left.saveId - right.saveId);
  for (const delta of deltas) {
    if (!delta.nodeId) continue;
    const record: DesktopSaveDeltaMirrorRecord = {
      kind: 'kaituoyishi-desktop-save-delta',
      version: 1,
      mirroredAt: Date.now(),
      delta,
    };
    await adapter.writeJson(deltaPath(delta.nodeId), record);
  }
  await writeDeltaIndex(nextDeltas);
}

export async function repairDesktopSaveDeltaMirrorIndex(): Promise<SaveNodeDeltaRecord[]> {
  if (!isDesktopRuntime()) return [];
  const index = await rebuildDeltaIndexFromFiles();
  return loadDesktopSaveNodeDeltasFromIndex(index);
}

export async function loadDesktopSaveNodeDelta(nodeId: string): Promise<SaveNodeDeltaRecord | null> {
  if (!isDesktopRuntime() || !nodeId) return null;
  const adapter = createAppStorageAdapter();
  try {
    const record = await adapter.readJson<DesktopSaveDeltaMirrorRecord>(deltaPath(nodeId));
    if (record?.kind !== 'kaituoyishi-desktop-save-delta' || record.version !== 1 || !record.delta) {
      return null;
    }
    return record.delta;
  } catch (error) {
    console.warn(`[desktop-save-delta-mirror] skip unreadable delta mirror ${nodeId}`, error);
    return null;
  }
}

export async function loadDesktopSaveNodeDeltas(): Promise<SaveNodeDeltaRecord[]> {
  if (!isDesktopRuntime()) return [];
  const index = await readDeltaIndex();
  return loadDesktopSaveNodeDeltasFromIndex(index);
}

async function loadDesktopSaveNodeDeltasFromIndex(index: DesktopSaveDeltaMirrorIndex): Promise<SaveNodeDeltaRecord[]> {
  const deltas: SaveNodeDeltaRecord[] = [];
  for (const item of index.deltas) {
    const delta = await loadDesktopSaveNodeDelta(item.nodeId);
    if (delta) deltas.push(delta);
  }
  return deltas.sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
}

export async function inspectDesktopSaveDeltaMirrorHealth(): Promise<DesktopSaveDeltaMirrorHealth | null> {
  if (!isDesktopRuntime()) return null;
  const adapter = createAppStorageAdapter();
  const indexResult = await readDeltaIndexForHealth(adapter);
  const indexedNodeIds = new Set((indexResult.index?.deltas ?? []).map((item) => item.nodeId).filter(Boolean));
  const fileNodeIds = new Set<string>();
  let validDeltaFiles = 0;
  let invalidDeltaFiles = 0;
  let unreadableDeltaFiles = 0;
  const fileNames = await adapter.list('saves/deltas');
  for (const fileName of fileNames) {
    const match = fileName.match(DELTA_RECORD_RE);
    if (!match) continue;
    const nodeId = decodeDeltaFileName(match[1]);
    if (!nodeId) continue;
    fileNodeIds.add(nodeId);
    try {
      const record = await adapter.readJson<DesktopSaveDeltaMirrorRecord>(deltaPath(nodeId));
      if (record?.kind !== 'kaituoyishi-desktop-save-delta' || record.version !== 1 || !record.delta?.nodeId) {
        invalidDeltaFiles += 1;
        continue;
      }
      validDeltaFiles += 1;
    } catch {
      unreadableDeltaFiles += 1;
    }
  }
  let missingIndexedDeltaFiles = 0;
  for (const nodeId of indexedNodeIds) {
    if (!fileNodeIds.has(nodeId)) missingIndexedDeltaFiles += 1;
  }
  let orphanDeltaFiles = 0;
  for (const nodeId of fileNodeIds) {
    if (!indexedNodeIds.has(nodeId)) orphanDeltaFiles += 1;
  }
  return {
    indexStatus: indexResult.status,
    indexedDeltas: indexedNodeIds.size,
    deltaFiles: fileNodeIds.size,
    validDeltaFiles,
    invalidDeltaFiles,
    unreadableDeltaFiles,
    missingIndexedDeltaFiles,
    orphanDeltaFiles,
  };
}

async function readDeltaIndex(): Promise<DesktopSaveDeltaMirrorIndex> {
  const adapter = createAppStorageAdapter();
  try {
    const index = await adapter.readJson<DesktopSaveDeltaMirrorIndex>(INDEX_PATH);
    if (index && index.version === 1 && Array.isArray(index.deltas)) {
      return index;
    }
  } catch (error) {
    console.warn('[desktop-save-delta-mirror] delta index read failed, trying file scan', error);
  }
  return rebuildDeltaIndexFromFiles(adapter);
}

async function readDeltaIndexForHealth(
  adapter = createAppStorageAdapter(),
): Promise<{ status: DesktopSaveDeltaMirrorHealth['indexStatus']; index: DesktopSaveDeltaMirrorIndex | null }> {
  try {
    const index = await adapter.readJson<DesktopSaveDeltaMirrorIndex>(INDEX_PATH);
    if (!index) return { status: 'missing', index: null };
    if (index.version === 1 && Array.isArray(index.deltas)) {
      return { status: 'ok', index };
    }
    return { status: 'invalid', index: null };
  } catch {
    return { status: 'unreadable', index: null };
  }
}

async function rebuildDeltaIndexFromFiles(
  adapter = createAppStorageAdapter(),
): Promise<DesktopSaveDeltaMirrorIndex> {
  const deltas: DesktopSaveDeltaMirrorIndexItem[] = [];
  const fileNames = await adapter.list('saves/deltas');
  for (const fileName of fileNames) {
    const match = fileName.match(DELTA_RECORD_RE);
    if (!match) continue;
    const nodeId = decodeDeltaFileName(match[1]);
    if (!nodeId) continue;
    try {
      const record = await adapter.readJson<DesktopSaveDeltaMirrorRecord>(deltaPath(nodeId));
      if (record?.kind !== 'kaituoyishi-desktop-save-delta' || record.version !== 1 || !record.delta?.nodeId) continue;
      deltas.push(buildIndexItem(record.delta));
    } catch (error) {
      console.warn(`[desktop-save-delta-mirror] skip unreadable delta mirror ${fileName}`, error);
    }
  }
  const index: DesktopSaveDeltaMirrorIndex = {
    version: 1,
    updatedAt: Date.now(),
    deltas: deltas.sort((left, right) => right.timestamp - left.timestamp || left.saveId - right.saveId),
  };
  if (index.deltas.length > 0) {
    await writeDeltaIndex(index.deltas);
  }
  return index;
}

async function writeDeltaIndex(deltas: DesktopSaveDeltaMirrorIndexItem[]): Promise<void> {
  const adapter = createAppStorageAdapter();
  await adapter.writeJson<DesktopSaveDeltaMirrorIndex>(INDEX_PATH, {
    version: 1,
    updatedAt: Date.now(),
    deltas,
  });
}

function buildIndexItem(delta: SaveNodeDeltaRecord): DesktopSaveDeltaMirrorIndexItem {
  return {
    nodeId: delta.nodeId,
    rootId: delta.rootId,
    parentNodeId: delta.parentNodeId,
    saveId: Number(delta.saveId) || 0,
    timestamp: Number(delta.timestamp) || 0,
    baseMode: delta.baseMode,
  };
}

function deltaPath(nodeId: string): string {
  return `saves/deltas/delta-${encodeURIComponent(nodeId)}.json`;
}

function decodeDeltaFileName(encodedNodeId: string): string {
  try {
    return decodeURIComponent(encodedNodeId);
  } catch {
    return '';
  }
}
