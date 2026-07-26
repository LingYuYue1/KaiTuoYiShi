export type SaveCatalogRepairScope = 'missing-only' | 'full-validation';

export type SaveCatalogRepairPhase =
  | 'idle'
  | 'checking'
  | 'waiting-for-lease'
  | 'repairing'
  | 'paused-for-write'
  | 'completed'
  | 'partial-failure';

export interface SaveCatalogRepairState {
  phase: SaveCatalogRepairPhase;
  scope: SaveCatalogRepairScope;
  total: number;
  processed: number;
  failed: number;
  currentId?: number;
}

export interface SaveCatalogRepairResult {
  total: number;
  processed: number;
  failed: number;
  skippedForLease: boolean;
}

export interface SaveCatalogRepairOperations {
  collectIds(scope: SaveCatalogRepairScope): Promise<number[]>;
  repairOne(id: number): Promise<void>;
  cleanupStaleRecords(): Promise<void>;
  acquireLease(): Promise<boolean>;
  renewLease(): Promise<void>;
  releaseLease(): Promise<void>;
}

const listeners = new Set<(state: SaveCatalogRepairState) => void>();
const writeWaiters = new Set<() => void>();
let repairPromise: Promise<SaveCatalogRepairResult> | null = null;
let pendingWriteCount = 0;
let currentState: SaveCatalogRepairState = {
  phase: 'idle',
  scope: 'missing-only',
  total: 0,
  processed: 0,
  failed: 0,
};

export function getSaveCatalogRepairState(): SaveCatalogRepairState {
  return { ...currentState };
}

export function subscribeSaveCatalogRepair(
  listener: (state: SaveCatalogRepairState) => void,
): () => void {
  listeners.add(listener);
  listener(getSaveCatalogRepairState());
  return () => listeners.delete(listener);
}

export function startSaveCatalogRepairTask(
  scope: SaveCatalogRepairScope,
  operations: SaveCatalogRepairOperations,
): Promise<SaveCatalogRepairResult> {
  if (repairPromise) return repairPromise;
  repairPromise = runRepair(scope, operations).finally(() => {
    repairPromise = null;
  });
  return repairPromise;
}

export async function runWithSaveMutationPriority<T>(task: () => Promise<T>): Promise<T> {
  pendingWriteCount += 1;
  try {
    return await task();
  } finally {
    pendingWriteCount = Math.max(0, pendingWriteCount - 1);
    if (pendingWriteCount === 0) {
      for (const resolve of Array.from(writeWaiters)) resolve();
      writeWaiters.clear();
    }
  }
}

async function runRepair(
  scope: SaveCatalogRepairScope,
  operations: SaveCatalogRepairOperations,
): Promise<SaveCatalogRepairResult> {
  updateState({ phase: 'checking', scope, total: 0, processed: 0, failed: 0, currentId: undefined });
  let leaseAcquired = await operations.acquireLease();
  for (let attempt = 0; !leaseAcquired && attempt < 20; attempt += 1) {
    updateState({ phase: 'waiting-for-lease' });
    await delay(500);
    leaseAcquired = await operations.acquireLease();
  }
  if (!leaseAcquired) {
    updateState({ phase: 'idle', currentId: undefined });
    return { total: 0, processed: 0, failed: 0, skippedForLease: true };
  }

  let ids: number[] = [];
  let processed = 0;
  let failed = 0;
  try {
    ids = await operations.collectIds(scope);
    updateState({ phase: ids.length ? 'repairing' : 'completed', total: ids.length, processed: 0, failed: 0 });
    for (const id of ids) {
      await waitForWritePriority(scope, ids.length, processed, failed);
      await operations.renewLease();
      updateState({ phase: 'repairing', currentId: id, total: ids.length, processed, failed });
      try {
        await operations.repairOne(id);
      } catch {
        failed += 1;
      }
      processed += 1;
      updateState({ phase: 'repairing', currentId: undefined, total: ids.length, processed, failed });
      await operations.renewLease();
      await delay(0);
    }
    await operations.cleanupStaleRecords();
    updateState({
      phase: failed > 0 ? 'partial-failure' : 'completed',
      currentId: undefined,
      total: ids.length,
      processed,
      failed,
    });
    return { total: ids.length, processed, failed, skippedForLease: false };
  } catch (error) {
    updateState({
      phase: 'partial-failure',
      currentId: undefined,
      total: ids.length,
      processed,
      failed: Math.max(1, failed),
    });
    throw error;
  } finally {
    await operations.releaseLease().catch(() => {});
  }
}

async function waitForWritePriority(
  scope: SaveCatalogRepairScope,
  total: number,
  processed: number,
  failed: number,
): Promise<void> {
  while (pendingWriteCount > 0) {
    updateState({ phase: 'paused-for-write', scope, total, processed, failed, currentId: undefined });
    await new Promise<void>((resolve) => writeWaiters.add(resolve));
  }
}

function updateState(patch: Partial<SaveCatalogRepairState>): void {
  currentState = { ...currentState, ...patch };
  for (const listener of Array.from(listeners)) {
    try {
      listener(getSaveCatalogRepairState());
    } catch (error) {
      console.warn('[save-catalog] repair listener failed', error);
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}
