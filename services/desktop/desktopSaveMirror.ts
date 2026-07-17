import type { 存档数据 } from '@/models/settings';
import type { SaveListItemSummary } from '@/services/dbService';
import { createAppStorageAdapter } from '@/services/storage/appStorageAdapter';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';
import { stripSaveAssetPayloadForStorage } from '@/utils/saveAssetStorage';

type DesktopSaveMirrorSummary = SaveListItemSummary & {
  visibility?: 'visible' | 'hidden-delta-base';
};

interface DesktopSaveMirrorIndex {
  version: 1;
  updatedAt: number;
  saves: DesktopSaveMirrorSummary[];
}

interface DesktopSaveMirrorRecord {
  kind: 'kaituoyishi-desktop-save';
  version: 1;
  mirroredAt: number;
  summary: DesktopSaveMirrorSummary;
  save: 存档数据;
}

export interface DesktopSaveMirrorHealth {
  indexStatus: 'ok' | 'missing' | 'invalid' | 'unreadable';
  sequenceStatus: 'ok' | 'missing' | 'invalid' | 'unreadable';
  sequenceLastSaveId: number;
  sequenceBehindIndex: boolean;
  pendingTransactions: number;
  unreadableTransactions: number;
  indexedSaves: number;
  saveFiles: number;
  validSaveFiles: number;
  invalidSaveFiles: number;
  unreadableSaveFiles: number;
  missingIndexedSaveFiles: number;
  orphanSaveFiles: number;
}

export interface DesktopSaveTransactionRepairSummary {
  removedTransactions: number;
  retainedTransactions: number;
  unreadableTransactions: number;
}

const INDEX_PATH = 'saves/index.json';
const SEQUENCE_PATH = 'saves/sequence.json';
const SAVE_RECORD_RE = /^save-(\d+)\.json$/;
const TRANSACTION_DIR = 'saves/transactions';
const TRANSACTION_RECORD_RE = /^save-(\d+)-(.+)\.json$/;

interface DesktopSaveSequence {
  kind: 'kaituoyishi-desktop-save-sequence';
  version: 1;
  updatedAt: number;
  lastSaveId: number;
}

interface DesktopSaveTransactionRecord {
  kind: 'kaituoyishi-desktop-save-transaction';
  version: 1;
  transactionId: string;
  saveId: number;
  startedAt: number;
  phase: 'save-primary-write';
  expectedDeltaNodeId?: string;
  expectedAssetIds?: string[];
}

interface DesktopSaveTransactionExpectation {
  deltaNodeId?: string | null;
  assetIds?: string[];
}

interface DesktopSaveDeltaMirrorRecordForTransaction {
  kind: 'kaituoyishi-desktop-save-delta';
  version: 1;
  delta?: { nodeId?: string };
}

interface DesktopAssetMirrorIndexForTransaction {
  version: 1;
  assets: Array<{
    id: string;
    path: string;
    metadataPath: string;
  }>;
}

interface DesktopAssetMirrorRecordForTransaction {
  kind: 'kaituoyishi-desktop-asset';
  version: 1;
  filePath: string;
  asset?: { id?: string };
}

export async function beginDesktopSaveTransaction(
  saveId: number,
  expectation: DesktopSaveTransactionExpectation = {},
): Promise<string | null> {
  if (!isDesktopRuntime() || !saveId) return null;
  const adapter = createAppStorageAdapter();
  const transactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const assetIds = Array.from(new Set((expectation.assetIds ?? []).filter(Boolean)));
  const record: DesktopSaveTransactionRecord = {
    kind: 'kaituoyishi-desktop-save-transaction',
    version: 1,
    transactionId,
    saveId,
    startedAt: Date.now(),
    phase: 'save-primary-write',
    expectedDeltaNodeId: expectation.deltaNodeId || undefined,
    expectedAssetIds: assetIds,
  };
  await adapter.writeJson(transactionPath(saveId, transactionId), record);
  return transactionId;
}

export async function finishDesktopSaveTransaction(saveId: number, transactionId: string | null | undefined): Promise<void> {
  if (!isDesktopRuntime() || !saveId || !transactionId) return;
  const adapter = createAppStorageAdapter();
  await adapter.remove(transactionPath(saveId, transactionId));
}

export async function mirrorSaveToDesktop(save: 存档数据, summary: SaveListItemSummary): Promise<void> {
  if (!isDesktopRuntime()) return;
  const adapter = createAppStorageAdapter();
  const index = await readMirrorIndex();
  const nextSummary = { ...summary, id: Number(save.id) || summary.id };
  const nextSaves = [
    nextSummary,
    ...index.saves.filter((item) => item.id !== nextSummary.id),
  ].sort((left, right) => right.timestamp - left.timestamp || right.id - left.id);
  const record: DesktopSaveMirrorRecord = {
    kind: 'kaituoyishi-desktop-save',
    version: 1,
    mirroredAt: Date.now(),
    summary: nextSummary,
    save: stripSaveAssetPayloadForStorage(save),
  };
  await adapter.writeJson(savePath(nextSummary.id), record);
  await writeMirrorIndex(nextSaves);
  await writeSaveSequence(Math.max(nextSummary.id, getMaxSaveId(nextSaves)), adapter);
}

export async function reserveDesktopSaveId(minimumNextId = 1): Promise<number | null> {
  if (!isDesktopRuntime()) return null;
  const adapter = createAppStorageAdapter();
  const index = await readMirrorIndex();
  const sequence = await readSaveSequence(adapter);
  const nextId = Math.max(
    Number(minimumNextId) || 1,
    getMaxSaveId(index.saves) + 1,
    (Number(sequence?.lastSaveId) || 0) + 1,
  );
  await writeSaveSequence(nextId, adapter);
  return nextId;
}

export async function removeSaveFromDesktopMirror(id: number): Promise<void> {
  if (!isDesktopRuntime()) return;
  const adapter = createAppStorageAdapter();
  const index = await readMirrorIndex();
  await adapter.remove(savePath(id));
  await writeMirrorIndex(index.saves.filter((item) => item.id !== id));
}

export async function hideSaveInDesktopMirror(id: number): Promise<void> {
  if (!isDesktopRuntime()) return;
  const adapter = createAppStorageAdapter();
  const index = await readMirrorIndex();
  const record = await adapter.readJson<DesktopSaveMirrorRecord>(savePath(id));
  if (record?.kind !== 'kaituoyishi-desktop-save' || record.version !== 1 || !record.summary || !record.save) return;
  const hiddenSummary: DesktopSaveMirrorSummary = {
    ...record.summary,
    id: Number(record.summary.id) || id,
    visibility: 'hidden-delta-base',
  };
  const saveWithRuntimeMarker = {
    ...record.save,
    saveRuntime: {
      ...((record.save as 存档数据 & { saveRuntime?: { hiddenDeltaBase?: boolean } }).saveRuntime ?? {}),
      hiddenDeltaBase: true,
    },
  } as 存档数据;
  await adapter.writeJson<DesktopSaveMirrorRecord>(savePath(id), {
    ...record,
    mirroredAt: Date.now(),
    summary: hiddenSummary,
    save: saveWithRuntimeMarker,
  });
  const nextSaves = [
    hiddenSummary,
    ...index.saves.filter((item) => item.id !== id),
  ].sort((left, right) => right.timestamp - left.timestamp || right.id - left.id);
  await writeMirrorIndex(nextSaves);
}

export async function listHiddenDesktopSaveMirrorIds(): Promise<number[]> {
  if (!isDesktopRuntime()) return [];
  return (await readMirrorIndex()).saves
    .filter((item) => item.visibility === 'hidden-delta-base')
    .map((item) => item.id);
}

export async function replaceDesktopSaveMirror(
  saves: Array<{ save: 存档数据; summary: SaveListItemSummary }>,
): Promise<void> {
  if (!isDesktopRuntime()) return;
  const adapter = createAppStorageAdapter();
  const index = await readMirrorIndex();
  for (const item of index.saves) {
    await adapter.remove(savePath(item.id));
  }
  const summaries = saves
    .map(({ save, summary }) => ({ ...summary, id: Number(save.id) || summary.id }))
    .sort((left, right) => right.timestamp - left.timestamp || right.id - left.id);
  for (const { save, summary } of saves) {
    const normalizedSummary = { ...summary, id: Number(save.id) || summary.id };
    const record: DesktopSaveMirrorRecord = {
      kind: 'kaituoyishi-desktop-save',
      version: 1,
      mirroredAt: Date.now(),
      summary: normalizedSummary,
      save: stripSaveAssetPayloadForStorage(save),
    };
    await adapter.writeJson(savePath(normalizedSummary.id), record);
  }
  await writeMirrorIndex(summaries);
  await writeSaveSequence(getMaxSaveId(summaries), adapter);
}

export async function listDesktopSaveMirror(): Promise<SaveListItemSummary[]> {
  if (!isDesktopRuntime()) return [];
  return (await readMirrorIndex()).saves.filter(isVisibleDesktopSaveSummary);
}

export async function repairDesktopSaveMirrorIndex(): Promise<SaveListItemSummary[]> {
  if (!isDesktopRuntime()) return [];
  const index = await rebuildMirrorIndexFromSaveFiles();
  await writeSaveSequence(getMaxSaveId(index.saves));
  return index.saves.filter(isVisibleDesktopSaveSummary);
}

export async function repairUnresolvedDesktopSaveTransactions(): Promise<DesktopSaveTransactionRepairSummary> {
  if (!isDesktopRuntime()) return createEmptyTransactionRepairSummary();
  const adapter = createAppStorageAdapter();
  const index = await rebuildMirrorIndexFromSaveFiles(adapter);
  await writeSaveSequence(getMaxSaveId(index.saves), adapter);
  return cleanupCompletedDesktopSaveTransactions(adapter);
}

export async function cleanupCompletedDesktopSaveTransactions(
  adapter = createAppStorageAdapter(),
): Promise<DesktopSaveTransactionRepairSummary> {
  const summary = createEmptyTransactionRepairSummary();
  if (!isDesktopRuntime()) return summary;
  const fileNames = await adapter.list(TRANSACTION_DIR);
  for (const fileName of fileNames) {
    const match = fileName.match(TRANSACTION_RECORD_RE);
    if (!match) continue;
    const transactionFilePath = `${TRANSACTION_DIR}/${fileName}`;
    try {
      const transaction = await adapter.readJson<DesktopSaveTransactionRecord>(transactionFilePath);
      const saveId = Number(transaction?.saveId) || Number(match[1]) || 0;
      if (transaction?.kind !== 'kaituoyishi-desktop-save-transaction' || transaction.version !== 1 || !saveId) {
        summary.unreadableTransactions += 1;
        continue;
      }
      const isComplete = await isDesktopSaveTransactionComplete(adapter, saveId, transaction);
      if (isComplete) {
        await adapter.remove(transactionFilePath);
        summary.removedTransactions += 1;
      } else {
        summary.retainedTransactions += 1;
      }
    } catch (error) {
      console.warn(`[desktop-save-mirror] keep unresolved transaction marker ${fileName}`, error);
      summary.unreadableTransactions += 1;
    }
  }
  return summary;
}

async function isDesktopSaveTransactionComplete(
  adapter: ReturnType<typeof createAppStorageAdapter>,
  saveId: number,
  transaction: DesktopSaveTransactionRecord,
): Promise<boolean> {
  const saveRecord = await adapter.readJson<DesktopSaveMirrorRecord>(savePath(saveId));
  if (saveRecord?.kind !== 'kaituoyishi-desktop-save' || saveRecord.version !== 1 || !saveRecord.save || !saveRecord.summary) {
    return false;
  }
  if (transaction.expectedDeltaNodeId && !await isExpectedDeltaMirrorComplete(adapter, transaction.expectedDeltaNodeId)) {
    return false;
  }
  const assetIds = transaction.expectedAssetIds ?? [];
  if (assetIds.length > 0 && !await areExpectedAssetMirrorsComplete(adapter, assetIds)) {
    return false;
  }
  return true;
}

async function isExpectedDeltaMirrorComplete(
  adapter: ReturnType<typeof createAppStorageAdapter>,
  nodeId: string,
): Promise<boolean> {
  const record = await adapter.readJson<DesktopSaveDeltaMirrorRecordForTransaction>(deltaPath(nodeId));
  return record?.kind === 'kaituoyishi-desktop-save-delta'
    && record.version === 1
    && record.delta?.nodeId === nodeId;
}

async function areExpectedAssetMirrorsComplete(
  adapter: ReturnType<typeof createAppStorageAdapter>,
  assetIds: string[],
): Promise<boolean> {
  const index = await adapter.readJson<DesktopAssetMirrorIndexForTransaction>('assets/index.json');
  if (index?.version !== 1 || !Array.isArray(index.assets)) return false;
  const byId = new Map(index.assets.map((asset) => [asset.id, asset]));
  for (const assetId of assetIds) {
    const summary = byId.get(assetId);
    if (!summary?.path || !summary.metadataPath) return false;
    const metadata = await adapter.readJson<DesktopAssetMirrorRecordForTransaction>(summary.metadataPath);
    if (
      metadata?.kind !== 'kaituoyishi-desktop-asset'
      || metadata.version !== 1
      || metadata.asset?.id !== assetId
      || metadata.filePath !== summary.path
    ) {
      return false;
    }
    if (!adapter.readBase64File) return false;
    const payload = await adapter.readBase64File(summary.path);
    if (!payload) return false;
  }
  return true;
}

function createEmptyTransactionRepairSummary(): DesktopSaveTransactionRepairSummary {
  const summary: DesktopSaveTransactionRepairSummary = {
    removedTransactions: 0,
    retainedTransactions: 0,
    unreadableTransactions: 0,
  };
  return summary;
}

export async function loadDesktopSaveMirrorSave(id: number): Promise<存档数据 | null> {
  if (!isDesktopRuntime()) return null;
  const adapter = createAppStorageAdapter();
  try {
    const record = await adapter.readJson<DesktopSaveMirrorRecord>(savePath(id));
    if (record?.kind !== 'kaituoyishi-desktop-save' || !record.save) return null;
    return { ...record.save, id: Number(record.save.id) || id };
  } catch (error) {
    console.warn(`[desktop-save-mirror] skip unreadable mirrored save ${id}`, error);
    return null;
  }
}

export async function loadDesktopSaveMirrorSaves(): Promise<存档数据[]> {
  if (!isDesktopRuntime()) return [];
  const index = await readMirrorIndex();
  const saves: 存档数据[] = [];
  for (const summary of index.saves.filter(isVisibleDesktopSaveSummary)) {
    const save = await loadDesktopSaveMirrorSave(summary.id);
    if (save) saves.push(save);
  }
  return saves.sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
}

export async function inspectDesktopSaveMirrorHealth(): Promise<DesktopSaveMirrorHealth | null> {
  if (!isDesktopRuntime()) return null;
  const adapter = createAppStorageAdapter();
  const indexResult = await readMirrorIndexForHealth(adapter);
  const sequenceResult = await readSaveSequenceForHealth(adapter);
  const indexedIds = new Set((indexResult.index?.saves ?? []).map((item) => Number(item.id)).filter(Boolean));
  const fileIds = new Set<number>();
  let validSaveFiles = 0;
  let invalidSaveFiles = 0;
  let unreadableSaveFiles = 0;
  const fileNames = await adapter.list('saves');
  for (const fileName of fileNames) {
    const match = fileName.match(SAVE_RECORD_RE);
    if (!match) continue;
    const id = Number(match[1]) || 0;
    if (!id) continue;
    fileIds.add(id);
    try {
      const record = await adapter.readJson<DesktopSaveMirrorRecord>(savePath(id));
      if (record?.kind !== 'kaituoyishi-desktop-save' || record.version !== 1 || !record.summary || !record.save) {
        invalidSaveFiles += 1;
        continue;
      }
      validSaveFiles += 1;
    } catch {
      unreadableSaveFiles += 1;
    }
  }
  let missingIndexedSaveFiles = 0;
  for (const id of indexedIds) {
    if (!fileIds.has(id)) missingIndexedSaveFiles += 1;
  }
  let orphanSaveFiles = 0;
  for (const id of fileIds) {
    if (!indexedIds.has(id)) orphanSaveFiles += 1;
  }
  const maxKnownSaveId = Math.max(
    0,
    ...Array.from(indexedIds),
    ...Array.from(fileIds),
  );
  const sequenceLastSaveId = Number(sequenceResult.sequence?.lastSaveId) || 0;
  const transactionHealth = await inspectPendingTransactions(adapter);
  return {
    indexStatus: indexResult.status,
    sequenceStatus: sequenceResult.status,
    sequenceLastSaveId,
    sequenceBehindIndex: sequenceResult.status === 'ok' && sequenceLastSaveId < maxKnownSaveId,
    pendingTransactions: transactionHealth.pending,
    unreadableTransactions: transactionHealth.unreadable,
    indexedSaves: indexedIds.size,
    saveFiles: fileIds.size,
    validSaveFiles,
    invalidSaveFiles,
    unreadableSaveFiles,
    missingIndexedSaveFiles,
    orphanSaveFiles,
  };
}

async function inspectPendingTransactions(
  adapter = createAppStorageAdapter(),
): Promise<{ pending: number; unreadable: number }> {
  let pending = 0;
  let unreadable = 0;
  const fileNames = await adapter.list(TRANSACTION_DIR);
  for (const fileName of fileNames) {
    const match = fileName.match(TRANSACTION_RECORD_RE);
    if (!match) continue;
    try {
      const record = await adapter.readJson<DesktopSaveTransactionRecord>(`${TRANSACTION_DIR}/${fileName}`);
      if (record?.kind === 'kaituoyishi-desktop-save-transaction' && record.version === 1) {
        pending += 1;
      } else {
        unreadable += 1;
      }
    } catch {
      unreadable += 1;
    }
  }
  return { pending, unreadable };
}

async function readMirrorIndex(): Promise<DesktopSaveMirrorIndex> {
  const adapter = createAppStorageAdapter();
  try {
    const index = await adapter.readJson<DesktopSaveMirrorIndex>(INDEX_PATH);
    if (index && index.version === 1 && Array.isArray(index.saves)) {
      return index;
    }
  } catch (error) {
    console.warn('[desktop-save-mirror] save index read failed, trying file scan', error);
  }
  return rebuildMirrorIndexFromSaveFiles(adapter);
}

async function readMirrorIndexForHealth(
  adapter = createAppStorageAdapter(),
): Promise<{ status: DesktopSaveMirrorHealth['indexStatus']; index: DesktopSaveMirrorIndex | null }> {
  try {
    const index = await adapter.readJson<DesktopSaveMirrorIndex>(INDEX_PATH);
    if (!index) return { status: 'missing', index: null };
    if (index.version === 1 && Array.isArray(index.saves)) {
      return { status: 'ok', index };
    }
    return { status: 'invalid', index: null };
  } catch {
    return { status: 'unreadable', index: null };
  }
}

async function writeMirrorIndex(saves: SaveListItemSummary[]): Promise<void> {
  const adapter = createAppStorageAdapter();
  await adapter.writeJson<DesktopSaveMirrorIndex>(INDEX_PATH, {
    version: 1,
    updatedAt: Date.now(),
    saves,
  });
}

async function readSaveSequence(adapter = createAppStorageAdapter()): Promise<DesktopSaveSequence | null> {
  try {
    const sequence = await adapter.readJson<DesktopSaveSequence>(SEQUENCE_PATH);
    if (sequence?.kind === 'kaituoyishi-desktop-save-sequence' && sequence.version === 1) {
      return sequence;
    }
  } catch (error) {
    console.warn('[desktop-save-mirror] save sequence read failed, falling back to mirror index', error);
  }
  return null;
}

async function readSaveSequenceForHealth(
  adapter = createAppStorageAdapter(),
): Promise<{ status: DesktopSaveMirrorHealth['sequenceStatus']; sequence: DesktopSaveSequence | null }> {
  try {
    const sequence = await adapter.readJson<DesktopSaveSequence>(SEQUENCE_PATH);
    if (!sequence) return { status: 'missing', sequence: null };
    if (
      sequence.kind === 'kaituoyishi-desktop-save-sequence'
      && sequence.version === 1
      && Number.isFinite(sequence.lastSaveId)
    ) {
      return { status: 'ok', sequence };
    }
    return { status: 'invalid', sequence: null };
  } catch {
    return { status: 'unreadable', sequence: null };
  }
}

async function writeSaveSequence(lastSaveId: number, adapter = createAppStorageAdapter()): Promise<void> {
  if (!Number.isFinite(lastSaveId) || lastSaveId <= 0) return;
  await adapter.writeJson<DesktopSaveSequence>(SEQUENCE_PATH, {
    kind: 'kaituoyishi-desktop-save-sequence',
    version: 1,
    updatedAt: Date.now(),
    lastSaveId,
  });
}

function getMaxSaveId(saves: SaveListItemSummary[]): number {
  return saves.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0);
}

function savePath(id: number): string {
  return `saves/save-${id}.json`;
}

function transactionPath(saveId: number, transactionId: string): string {
  return `${TRANSACTION_DIR}/save-${saveId}-${encodeURIComponent(transactionId)}.json`;
}

function deltaPath(nodeId: string): string {
  return `saves/deltas/delta-${encodeURIComponent(nodeId)}.json`;
}

async function rebuildMirrorIndexFromSaveFiles(
  adapter = createAppStorageAdapter(),
): Promise<DesktopSaveMirrorIndex> {
  const saves: DesktopSaveMirrorSummary[] = [];
  const fileNames = await adapter.list('saves');
  for (const fileName of fileNames) {
    const match = fileName.match(SAVE_RECORD_RE);
    if (!match) continue;
    const id = Number(match[1]) || 0;
    if (!id) continue;
    try {
      const record = await adapter.readJson<DesktopSaveMirrorRecord>(savePath(id));
      if (record?.kind !== 'kaituoyishi-desktop-save' || record.version !== 1 || !record.summary) continue;
      saves.push({ ...record.summary, id: Number(record.summary.id) || id });
    } catch (error) {
      console.warn(`[desktop-save-mirror] skip unreadable save mirror ${fileName}`, error);
    }
  }
  const index: DesktopSaveMirrorIndex = {
    version: 1,
    updatedAt: Date.now(),
    saves: saves.sort((left, right) => right.timestamp - left.timestamp || right.id - left.id),
  };
  if (index.saves.length > 0) {
    await writeMirrorIndex(index.saves);
  }
  return index;
}

function isVisibleDesktopSaveSummary(summary: DesktopSaveMirrorSummary): summary is SaveListItemSummary {
  return summary.visibility !== 'hidden-delta-base';
}
