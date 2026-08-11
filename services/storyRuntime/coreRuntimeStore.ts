// G1.3.2.2 CoreRuntimeStore：V3 核心 runtime 的 IndexedDB 只读/只写持久化（真实 read-compare-write CAS）。
// - 独立数据库 KaiTuoYiShiStoryRuntimeDB（version 1），object stores：
//   runtimePointer（active pointer 单行）、runtimeCore（branchId -> StoryRuntimeState）、
//   runtimeOutbox（branchId+outboxId 复合 key -> ProjectionOutboxItem）、runtimeCheckpoints（checkpointId）、
//   runtimeProjections（prefixed 投影聚合）、runtimeMigrationJournal（sourceFingerprint -> 迁移记录）。
// - G1.3.2.2 P0-1：outbox 批内唯一性与 write-once 幂等——物理 key = runtimeBranchId + '\0' + outboxId；
//   同一批输入先按物理 key 确定性预检（同 key 同 canonical payload 只写一次；同 key 不同 payload ->
//   IDEMPOTENCY_KEY_REUSED 整个事务零写入）；事务内读取已有记录：同 branch 同 key 同 payload ->
//   ALREADY_APPLIED 不覆盖；同 branch 同 key 不同 payload -> 冲突不覆盖。createBranchSeed 走同一规则。
// - G1.3.2.2 P0-3：commitTurn/createBranchSeed/putCheckpoint 在发出第一条 request 前安装
//   oncomplete/onerror/onabort，使用一次性 settle guard 保证 Promise 恰好结束；成功提交才返回 ok: true，
//   任何 error/abort 返回稳定失败回执，不得悬挂，失败零写入。
// - G1.3.2.2 P1-5：putMigrationJournal compare-and-write——同 sourceFingerprint 同 canonical report 幂等
//   （ALREADY_APPLIED，保留首份 bytes），不同 payload -> IDEMPOTENCY_KEY_REUSED 零写入。
// - G1.3.2.1 P0-1：objectStoreNames 兼容 DOMStringList.contains。
// - G1.3.2.1 P0-2：createBranchSeed 分支创建/pointer 切换 CAS（expectedActiveBranchId/Revision 同事务比较）。
import type { StoryRuntimeState } from '../../models/storyRuntime';
import type { ProjectionOutboxItem } from '../../models/storyRuntimeProjection';
import { sha256Fingerprint } from './id';
import { tryCanonicalJson } from './commandValidator';

export const RUNTIME_DB_NAME = 'KaiTuoYiShiStoryRuntimeDB';
export const RUNTIME_DB_VERSION = 1;
export const POINTER_STORE = 'runtimePointer';
export const CORE_STORE = 'runtimeCore';
export const OUTBOX_STORE = 'runtimeOutbox';
export const CHECKPOINT_STORE = 'runtimeCheckpoints';
export const PROJECTION_STORE = 'runtimeProjections';
export const MIGRATION_STORE = 'runtimeMigrationJournal';

/** 注入的 IDB 工厂（真实 indexedDB 或测试 shim）。 */
export type IdbFactoryLike = {
  open(name: string, version: number): {
    result?: unknown;
    onupgradeneeded?: ((event: { target: { result: unknown; transaction: unknown }; oldVersion: number; newVersion: number }) => void) | null;
    onsuccess?: ((event: { target: unknown }) => void) | null;
    onerror?: ((event: { target: unknown }) => void) | null;
  };
};

/** 简化 IDB 表面（真实 IDBDatabase 与测试 shim 都满足）。 */
export interface RuntimeDb {
  objectStoreNames: { contains(name: string): boolean } & { includes?(name: string): boolean };
  createObjectStore(name: string, opts?: { keyPath?: string; autoIncrement?: boolean }): unknown;
  transaction(storeNames: string[] | string, mode?: 'readonly' | 'readwrite'): RuntimeTx;
}
export interface RuntimeTx {
  objectStore(name: string): RuntimeObjectStore;
  oncomplete: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onabort: ((event: unknown) => void) | null;
  abort(): void;
  error?: unknown;
}
export interface RuntimeObjectStore {
  get(key: unknown): RuntimeRequest;
  put(value: unknown, key?: unknown): RuntimeRequest;
  delete(key: unknown): RuntimeRequest;
  getAll(): RuntimeRequest;
}
export interface RuntimeRequest {
  result?: unknown;
  error?: unknown;
  onsuccess?: ((event: { target: unknown }) => void) | null;
  onerror?: ((event: { target: unknown }) => void) | null;
}

/** active runtime pointer（单行，key='active'）。timestamp 只作非身份元数据。 */
export interface RuntimePointer {
  runtimeBranchId: string;
  saveNodeId: string;
  runtimeRevision: number;
  schemaVersion: number;
  assetCatalogFingerprint: string;
  coreFingerprint: string;
  projectionFingerprint: string;
  outboxFingerprint: string;
  updatedAt: number;
}

export type CasCommitResult =
  | { ok: true; pointer: RuntimePointer }
  | { ok: false; code: 'CONFLICT' | 'STALE_BRANCH' | 'IDEMPOTENCY_KEY_REUSED' | 'ALREADY_APPLIED' | 'INVALID_COMMAND' | 'DB_UNAVAILABLE'; message: string };

function defaultFactory(): IdbFactoryLike | undefined {
  return (globalThis as { indexedDB?: IdbFactoryLike }).indexedDB as IdbFactoryLike | undefined;
}

/**
 * P0-1（G1.3.2.1）：检查 objectStoreNames 是否包含某 store。
 * 兼容浏览器 DOMStringList（只提供 contains，无 includes）与测试数组形状（只提供 includes，无 contains）。
 */
export function storeNamesContains(names: { contains?(name: string): boolean; includes?(name: string): boolean }, name: string): boolean {
  if (typeof names.contains === 'function') return names.contains(name);
  if (typeof names.includes === 'function') return names.includes(name);
  return false;
}

/** 创建 store（与真实 indexedDB 升级钩子一致；DOMStringList 兼容）。 */
export function createRuntimeStores(db: RuntimeDb): void {
  const stores = [POINTER_STORE, CORE_STORE, OUTBOX_STORE, CHECKPOINT_STORE, PROJECTION_STORE, MIGRATION_STORE];
  for (const name of stores) {
    if (!storeNamesContains(db.objectStoreNames, name)) db.createObjectStore(name);
  }
}

/** 打开（或复用）runtime 数据库。 */
export async function openRuntimeDb(factory?: IdbFactoryLike): Promise<RuntimeDb> {
  const idb = factory ?? defaultFactory();
  if (!idb) throw new Error('STORY_RUNTIME_IDB_UNAVAILABLE: 当前环境没有 indexedDB');
  const req = idb.open(RUNTIME_DB_NAME, RUNTIME_DB_VERSION);
  return await new Promise<RuntimeDb>((resolve, reject) => {
    req.onupgradeneeded = (event) => {
      createRuntimeStores(event.target.result as RuntimeDb);
    };
    req.onsuccess = () => {
      resolve(req.result as RuntimeDb);
    };
    req.onerror = () => {
      reject(new Error('打开 runtime 数据库失败'));
    };
  });
}

/** 读取 active pointer（readonly 事务）。 */
export async function readActivePointer(factory?: IdbFactoryLike): Promise<RuntimePointer | null> {
  const db = await openRuntimeDb(factory);
  return await new Promise<RuntimePointer | null>((resolve, reject) => {
    const tx = db.transaction(POINTER_STORE, 'readonly');
    const req = tx.objectStore(POINTER_STORE).get('active');
    req.onsuccess = () => {
      resolve((req.result as RuntimePointer | undefined) ?? null);
    };
    req.onerror = () => reject(new Error('读取 active pointer 失败'));
  });
}

/** 读取指定 branch 的 core（readonly 事务）。 */
export async function readCoreState(branchId: string, factory?: IdbFactoryLike): Promise<StoryRuntimeState | null> {
  const db = await openRuntimeDb(factory);
  return await new Promise<StoryRuntimeState | null>((resolve, reject) => {
    const tx = db.transaction(CORE_STORE, 'readonly');
    const req = tx.objectStore(CORE_STORE).get(branchId);
    req.onsuccess = () => {
      resolve((req.result as StoryRuntimeState | undefined) ?? null);
    };
    req.onerror = () => reject(new Error('读取 core 失败'));
  });
}

/**
 * P1-2（G1.3.2.1/2.2）：outbox 物理 key = runtimeBranchId + '\0' + outboxId（branch 归属）。
 * 不同 branch 同 outboxId 互不覆盖；写入校验 item.runtimeBranchId 与当前 branch 一致。
 */
export function outboxKey(branchId: string, outboxId: string): string {
  return branchId + '\0' + outboxId;
}

/** 列出指定 branch 的 outbox 项（readonly 事务；key 带 branch 归属，按前缀过滤）。 */
export async function readOutboxItems(branchId: string, factory?: IdbFactoryLike): Promise<ProjectionOutboxItem[]> {
  const db = await openRuntimeDb(factory);
  return await new Promise<ProjectionOutboxItem[]>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly');
    const req = tx.objectStore(OUTBOX_STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as ProjectionOutboxItem[] | undefined) ?? [];
      const prefix = branchId + '\0';
      resolve(all.filter((item) => outboxKey(item.runtimeBranchId, item.outboxId).startsWith(prefix)));
    };
    req.onerror = () => reject(new Error('读取 outbox 失败'));
  });
}

/**
 * P0-1（G1.3.2.2）：outbox 批内唯一性预检——同一物理 key 出现多次：
  expectedBranchId: string;
  expectedRevision: number;
  idempotencyKey: string;
  core: StoryRuntimeState;
  outbox: ProjectionOutboxItem[];
  coreFingerprint: string;
  projectionFingerprint: string;
  outboxFingerprint: string;
}

/**
 * P0-1（G1.3.2.2）：outbox 批内唯一性预检——同一物理 key 出现多次：
 * 同 canonical payload 视为一次写入；不同 payload -> IDEMPOTENCY_KEY_REUSED。
 * 返回 null 表示通过；否则返回稳定冲突。
 */
export function precheckOutboxBatch(outbox: ProjectionOutboxItem[], branchId: string): CasCommitResult | null {
  const seen = new Map<string, string>();
  for (const item of outbox) {
    if (item.runtimeBranchId !== branchId) {
      return { ok: false, code: 'INVALID_COMMAND', message: 'outbox item 的 runtimeBranchId 与当前 branch 不一致: ' + item.outboxId };
    }
    const key = outboxKey(item.runtimeBranchId, item.outboxId);
    const canonical = tryCanonicalJson(item);
    if (canonical === null) {
      return { ok: false, code: 'INVALID_COMMAND', message: 'outbox item 含非法 JSON 容器: ' + item.outboxId };
    }
    const existing = seen.get(key);
    if (existing !== undefined) {
      if (existing === canonical) continue; // 同 payload：只写一次
      return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED', message: '批内同 outbox key 不同 payload: ' + item.outboxId };
    }
    seen.set(key, canonical);
  }
  return null;
}

export interface CommitTurnInput {
  expectedBranchId: string;
  expectedRevision: number;
  idempotencyKey: string;
  core: StoryRuntimeState;
  outbox: ProjectionOutboxItem[];
  coreFingerprint: string;
  projectionFingerprint: string;
  outboxFingerprint: string;
}

/**
 * P0-1（G1.3.2.2）：事务内写入 outbox——每个 item 先读取已有记录：
 * 同 branch 同 key 同 payload -> ALREADY_APPLIED（跳过写入）；同 branch 同 key 不同 payload -> IDEMPOTENCY_KEY_REUSED。
 * 返回 'ok' 或稳定冲突（调用方 abort）。
 */
function writeOutboxChecked(
  outboxStore: RuntimeObjectStore,
  outbox: ProjectionOutboxItem[],
  branchId: string,
): Promise<{ ok: boolean; code?: 'INVALID_COMMAND' | 'IDEMPOTENCY_KEY_REUSED' | 'DB_UNAVAILABLE'; message?: string }> {
  return new Promise((resolve) => {
    const deduped = new Map<string, ProjectionOutboxItem>();
    for (const item of outbox) deduped.set(outboxKey(item.runtimeBranchId, item.outboxId), item);
    const entries = [...deduped.values()];
    const next = (index: number): void => {
      if (index >= entries.length) {
        resolve({ ok: true });
        return;
      }
      const item = entries[index];
      const key = outboxKey(branchId, item.outboxId);
      const req = outboxStore.get(key);
      req.onsuccess = () => {
        const existing = req.result as ProjectionOutboxItem | undefined;
        const canonical = tryCanonicalJson(item);
        if (canonical === null) {
          resolve({ ok: false, code: 'INVALID_COMMAND', message: 'outbox item 含非法 JSON 容器: ' + item.outboxId });
          return;
        }
        if (existing !== undefined) {
          const existingCanonical = tryCanonicalJson(existing);
          if (existingCanonical === canonical) {
            // 同 payload：幂等，跳过写入。
            next(index + 1);
            return;
          }
          resolve({ ok: false, code: 'IDEMPOTENCY_KEY_REUSED', message: 'outbox key 已存在且 payload 不同: ' + item.outboxId });
          return;
        }
        const putReq = outboxStore.put(item, key);
        putReq.onsuccess = () => next(index + 1);
        putReq.onerror = () => resolve({ ok: false, code: 'DB_UNAVAILABLE', message: 'outbox 写入失败' });
      };
      req.onerror = () => resolve({ ok: false, code: 'DB_UNAVAILABLE', message: 'outbox 读取失败' });
    };
    next(0);
  });
}

/**
 * 主回合原子提交（真实 read-compare-write CAS）：
 * 同一 readwrite transaction 内：读 pointer -> 比较 branch+expectedRevision -> 幂等检查
 * -> 写 core -> 写 outbox（P0-1 批内唯一 + write-once）-> 更新 pointer -> complete。
 * P0-3：oncomplete/onerror/onabort 全部安装，一次性 settle，绝不悬挂。
 * 失败返回稳定错误码 + 零写入（tx.abort 回滚）；runtimeRevision 成功提交只增加一次。
 */
export async function commitTurn(input: CommitTurnInput, factory?: IdbFactoryLike): Promise<CasCommitResult> {
  const db = await openRuntimeDb(factory);
  return await new Promise<CasCommitResult>((resolve) => {
    const tx = db.transaction([POINTER_STORE, CORE_STORE, OUTBOX_STORE], 'readwrite');
    const pointerStore = tx.objectStore(POINTER_STORE);
    const coreStore = tx.objectStore(CORE_STORE);
    const outboxStore = tx.objectStore(OUTBOX_STORE);
    // P0-3：一次性 settle——error/abort 也稳定 resolve。
    let settled = false;
    const finish = (result: CasCommitResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    tx.oncomplete = () => { /* 成功路径显式 finish */ };
    tx.onerror = () => { if (!settled) finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'IndexedDB transaction error' }); };
    tx.onabort = () => { if (!settled) finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'IndexedDB transaction aborted' }); };

    // P0-1：批内唯一性预检（在事务外先做确定性检查，零写入）。
    const precheck = precheckOutboxBatch(input.outbox, input.expectedBranchId);
    if (precheck) {
      finish(precheck);
      return;
    }

    const pointerReq = pointerStore.get('active');
    pointerReq.onsuccess = () => {
      const pointer = (pointerReq.result as RuntimePointer | undefined) ?? null;
      if (pointer === null) {
        finish({ ok: false, code: 'STALE_BRANCH', message: 'active pointer 不存在：尚未初始化分支' });
        tx.abort();
        return;
      }
      if (pointer.runtimeBranchId !== input.expectedBranchId) {
        finish({ ok: false, code: 'STALE_BRANCH', message: 'branch 不匹配：expected ' + input.expectedBranchId + ' != pointer ' + pointer.runtimeBranchId });
        tx.abort();
        return;
      }
      if (pointer.runtimeRevision !== input.expectedRevision) {
        finish({ ok: false, code: 'CONFLICT', message: 'runtimeRevision 冲突：expected ' + input.expectedRevision + ' != current ' + pointer.runtimeRevision });
        tx.abort();
        return;
      }
      if (input.core.runtimeBranchId !== input.expectedBranchId) {
        finish({ ok: false, code: 'INVALID_COMMAND', message: 'core.runtimeBranchId 与 expectedBranchId 不一致' });
        tx.abort();
        return;
      }
      if (input.core.runtimeRevision !== input.expectedRevision + 1) {
        finish({ ok: false, code: 'INVALID_COMMAND', message: 'core.runtimeRevision 必须是 expected+1（成功提交只增加一次）' });
        tx.abort();
        return;
      }
      // 幂等检查：同 key 同 payload -> ALREADY_APPLIED（revision 不增加）；同 key 不同 payload -> IDEMPOTENCY_KEY_REUSED。
      const coreReq = coreStore.get(input.expectedBranchId);
      coreReq.onsuccess = () => {
        const existing = coreReq.result as StoryRuntimeState | undefined;
        const existingRecord = existing?.commandIdempotencyIndex?.[input.idempotencyKey];
        const incomingRecord = input.core.commandIdempotencyIndex?.[input.idempotencyKey];
        if (existingRecord) {
          if (incomingRecord && existingRecord.commandFingerprint === incomingRecord.commandFingerprint) {
            finish({ ok: false, code: 'ALREADY_APPLIED', message: '同 idempotencyKey 同 payload 已应用（返回既有结果，revision 不增加）' });
          } else {
            finish({ ok: false, code: 'IDEMPOTENCY_KEY_REUSED', message: '同 idempotencyKey 不同 payload 冒用' });
          }
          tx.abort();
          return;
        }
        // 写 core（新 revision）+ 同来源 outbox（P0-1 write-once）+ 更新 pointer。
        coreStore.put(input.core, input.core.runtimeBranchId);
        writeOutboxChecked(outboxStore, input.outbox, input.expectedBranchId).then((w) => {
          if (!w.ok) {
            finish({ ok: false, code: w.code ?? 'INVALID_COMMAND', message: w.message ?? 'outbox 写入冲突' });
            tx.abort();
            return;
          }
          const nextPointer: RuntimePointer = {
            runtimeBranchId: input.core.runtimeBranchId,
            saveNodeId: input.core.saveNodeId,
            runtimeRevision: input.core.runtimeRevision,
            schemaVersion: input.core.schemaVersion,
            assetCatalogFingerprint: input.core.assetCatalogFingerprint,
            coreFingerprint: input.coreFingerprint,
            projectionFingerprint: input.projectionFingerprint,
            outboxFingerprint: input.outboxFingerprint,
            updatedAt: Date.now(), // 非身份元数据
          };
          pointerStore.put(nextPointer, 'active');
          tx.oncomplete = () => { if (!settled) finish({ ok: true, pointer: nextPointer }); };
        });
      };
      coreReq.onerror = () => {
        finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'core 读取失败' });
        tx.abort();
      };
    };
    pointerReq.onerror = () => {
      finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'pointer 读取失败' });
      tx.abort();
    };
  });
}

export interface CreateBranchSeedInput {
  branchId: string;
  saveNodeId: string;
  schemaVersion: number;
  assetCatalogFingerprint: string;
  core: StoryRuntimeState;
  outbox: ProjectionOutboxItem[];
  coreFingerprint: string;
  projectionFingerprint: string;
  outboxFingerprint: string;
  /** P0-2（G1.3.2.1）：创建/切换分支时的期望 active pointer。 */
  expectedActiveBranchId?: string;
  expectedActiveRevision?: number;
}

/**
 * 创建/种子化一个新分支（首分支或 reroll 新分支），同样 CAS：
 * - 必须不存在该 branch 的既有 core（同一 branchId 重复创建 -> INVALID_COMMAND）；
 * - P0-2：已存在 active pointer 时，必须在同一 readwrite 事务内比较 expectedActiveBranchId/
 *   expectedActiveRevision 与当前 pointer；两个不同 branch 以同一旧 pointer 并发创建只能一个成功，
 *   失败方返回稳定 CONFLICT 且不留下孤儿 core/outbox（tx.abort 回滚）；
 * - P0-1：outbox 走批内唯一 + write-once（新建 branch 也不能让孤儿 outbox 覆盖）。
 * - P0-3：一次性 settle，error/abort 稳定 resolve。
 */
export async function createBranchSeed(input: CreateBranchSeedInput, factory?: IdbFactoryLike): Promise<CasCommitResult> {
  const db = await openRuntimeDb(factory);
  return await new Promise<CasCommitResult>((resolve) => {
    const tx = db.transaction([POINTER_STORE, CORE_STORE, OUTBOX_STORE], 'readwrite');
    const pointerStore = tx.objectStore(POINTER_STORE);
    const coreStore = tx.objectStore(CORE_STORE);
    const outboxStore = tx.objectStore(OUTBOX_STORE);
    let settled = false;
    const finish = (result: CasCommitResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    tx.oncomplete = () => { /* 成功路径显式 finish */ };
    tx.onerror = () => { if (!settled) finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'IndexedDB transaction error' }); };
    tx.onabort = () => { if (!settled) finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'IndexedDB transaction aborted' }); };

    const precheck = precheckOutboxBatch(input.outbox, input.branchId);
    if (precheck) {
      finish(precheck);
      return;
    }

    const pointerReq = pointerStore.get('active');
    pointerReq.onsuccess = () => {
      const pointer = (pointerReq.result as RuntimePointer | undefined) ?? null;
      if (pointer !== null) {
        if (input.expectedActiveBranchId === undefined || input.expectedActiveRevision === undefined) {
          finish({ ok: false, code: 'INVALID_COMMAND', message: '已存在 active pointer：createBranchSeed 必须携带 expectedActiveBranchId/expectedActiveRevision' });
          tx.abort();
          return;
        }
        if (pointer.runtimeBranchId !== input.expectedActiveBranchId) {
          finish({ ok: false, code: 'STALE_BRANCH', message: 'active pointer branch 不匹配：expected ' + input.expectedActiveBranchId + ' != current ' + pointer.runtimeBranchId });
          tx.abort();
          return;
        }
        if (pointer.runtimeRevision !== input.expectedActiveRevision) {
          finish({ ok: false, code: 'CONFLICT', message: 'active pointer revision 冲突：expected ' + input.expectedActiveRevision + ' != current ' + pointer.runtimeRevision });
          tx.abort();
          return;
        }
      }
      const coreReq = coreStore.get(input.branchId);
      coreReq.onsuccess = () => {
        const existing = coreReq.result;
        if (existing !== undefined) {
          finish({ ok: false, code: 'INVALID_COMMAND', message: 'branchId 已存在 core：不允许重复种子化 ' + input.branchId });
          tx.abort();
          return;
        }
        if (input.core.runtimeBranchId !== input.branchId) {
          finish({ ok: false, code: 'INVALID_COMMAND', message: 'core.runtimeBranchId 与 branchId 不一致' });
          tx.abort();
          return;
        }
        coreStore.put(input.core, input.branchId);
        writeOutboxChecked(outboxStore, input.outbox, input.branchId).then((w) => {
          if (!w.ok) {
            finish({ ok: false, code: w.code ?? 'INVALID_COMMAND', message: w.message ?? 'outbox 写入冲突' });
            tx.abort();
            return;
          }
          const nextPointer: RuntimePointer = {
            runtimeBranchId: input.branchId,
            saveNodeId: input.saveNodeId,
            runtimeRevision: input.core.runtimeRevision,
            schemaVersion: input.schemaVersion,
            assetCatalogFingerprint: input.assetCatalogFingerprint,
            coreFingerprint: input.coreFingerprint,
            projectionFingerprint: input.projectionFingerprint,
            outboxFingerprint: input.outboxFingerprint,
            updatedAt: Date.now(),
          };
          pointerStore.put(nextPointer, 'active');
          tx.oncomplete = () => { if (!settled) finish({ ok: true, pointer: nextPointer }); };
        });
      };
      coreReq.onerror = () => {
        finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'core 读取失败' });
        tx.abort();
      };
    };
    pointerReq.onerror = () => {
      finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'pointer 读取失败' });
      tx.abort();
    };
  });
}

// ── durable put/get/delete/recover 入口（G1.3.2.1/2.2）──

export interface StoredCheckpointRecord {
  checkpointId: string;
  payload: unknown;
  createdAt: number;
}

/** 写入 checkpoint（runtimeCheckpoints store；同 checkpointId 幂等覆盖同 payload 允许，不同 payload 冲突）。 */
export async function putCheckpoint(record: StoredCheckpointRecord, factory?: IdbFactoryLike): Promise<CasCommitResult> {
  const db = await openRuntimeDb(factory);
  return await new Promise<CasCommitResult>((resolve) => {
    const tx = db.transaction(CHECKPOINT_STORE, 'readwrite');
    const store = tx.objectStore(CHECKPOINT_STORE);
    let settled = false;
    const finish = (result: CasCommitResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    tx.oncomplete = () => { /* 成功路径显式 finish */ };
    tx.onerror = () => { if (!settled) finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'IndexedDB transaction error' }); };
    tx.onabort = () => { if (!settled) finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'IndexedDB transaction aborted' }); };
    const req = store.get(record.checkpointId);
    req.onsuccess = () => {
      const existing = req.result as StoredCheckpointRecord | undefined;
      if (existing !== undefined && tryCanonicalJson(existing.payload) !== tryCanonicalJson(record.payload)) {
        finish({ ok: false, code: 'CONFLICT', message: 'checkpointId 已存在且 payload 不同：' + record.checkpointId });
        tx.abort();
        return;
      }
      store.put(record, record.checkpointId);
      tx.oncomplete = () => { if (!settled) finish({ ok: true, pointer: { runtimeBranchId: '', saveNodeId: '', runtimeRevision: 0, schemaVersion: 3, assetCatalogFingerprint: '', coreFingerprint: '', projectionFingerprint: '', outboxFingerprint: '', updatedAt: 0 } }); };
    };
    req.onerror = () => {
      finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'checkpoint 读取失败' });
      tx.abort();
    };
  });
}

/** 读取 checkpoint（重开数据库后仍可读）。 */
export async function getCheckpoint(checkpointId: string, factory?: IdbFactoryLike): Promise<StoredCheckpointRecord | null> {
  const db = await openRuntimeDb(factory);
  return await new Promise<StoredCheckpointRecord | null>((resolve, reject) => {
    const tx = db.transaction(CHECKPOINT_STORE, 'readonly');
    const req = tx.objectStore(CHECKPOINT_STORE).get(checkpointId);
    req.onsuccess = () => resolve((req.result as StoredCheckpointRecord | undefined) ?? null);
    req.onerror = () => reject(new Error('读取 checkpoint 失败'));
  });
}

/** 删除 checkpoint（abort 后清理未提交 draft checkpoint）。 */
export async function deleteCheckpoint(checkpointId: string, factory?: IdbFactoryLike): Promise<void> {
  const db = await openRuntimeDb(factory);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CHECKPOINT_STORE, 'readwrite');
    const store = tx.objectStore(CHECKPOINT_STORE);
    store.delete(checkpointId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('删除 checkpoint 失败'));
  });
}

export interface StoredMigrationJournalRecord {
  sourceFingerprint: string;
  report: unknown;
  createdAt: number;
}

/**
 * P1-5（G1.3.2.2）：写入迁移日志（runtimeMigrationJournal store，key=sourceFingerprint）compare-and-write：
 * 同 sourceFingerprint 同 canonical report -> ALREADY_APPLIED（保留首份 bytes，不增 revision）；
 * 不同 payload -> IDEMPOTENCY_KEY_REUSED 零写入。比较与写入在同一 readwrite 事务内。
 */
export async function putMigrationJournal(record: StoredMigrationJournalRecord, factory?: IdbFactoryLike): Promise<CasCommitResult> {
  const db = await openRuntimeDb(factory);
  return await new Promise<CasCommitResult>((resolve) => {
    const tx = db.transaction(MIGRATION_STORE, 'readwrite');
    const store = tx.objectStore(MIGRATION_STORE);
    let settled = false;
    const finish = (result: CasCommitResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    tx.oncomplete = () => { /* 成功路径显式 finish */ };
    tx.onerror = () => { if (!settled) finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'IndexedDB transaction error' }); };
    tx.onabort = () => { if (!settled) finish({ ok: false, code: 'DB_UNAVAILABLE', message: 'IndexedDB transaction aborted' }); };
    const req = store.get(record.sourceFingerprint);
    req.onsuccess = () => {
      const existing = req.result as StoredMigrationJournalRecord | undefined;
      const incomingCanonical = tryCanonicalJson(record.report);
      if (existing !== undefined) {
        const existingCanonical = tryCanonicalJson(existing.report);
        if (existingCanonical === incomingCanonical) {
          finish({ ok: false, code: 'ALREADY_APPLIED', message: '同 sourceFingerprint 同 payload 已写入（保留首份 bytes）' });
          return;
        }
        finish({ ok: false, code: 'IDEMPOTENCY_KEY_REUSED', message: '同 sourceFingerprint 不同 payload 冒用，零写入' });
        tx.abort();
        return;
      }
      store.put(record, record.sourceFingerprint);
      tx.oncomplete = () => { if (!settled) finish({ ok: true, pointer: { runtimeBranchId: '', saveNodeId: '', runtimeRevision: 0, schemaVersion: 3, assetCatalogFingerprint: '', coreFingerprint: '', projectionFingerprint: '', outboxFingerprint: '', updatedAt: 0 } }); };
    };
    req.onerror = () => {
      finish({ ok: false, code: 'DB_UNAVAILABLE', message: '迁移日志读取失败' });
      tx.abort();
    };
  });
}

/** 读取迁移日志（按 sourceFingerprint；重开数据库后仍可读）。 */
export async function getMigrationJournal(sourceFingerprint: string, factory?: IdbFactoryLike): Promise<StoredMigrationJournalRecord | null> {
  const db = await openRuntimeDb(factory);
  return await new Promise<StoredMigrationJournalRecord | null>((resolve, reject) => {
    const tx = db.transaction(MIGRATION_STORE, 'readonly');
    const req = tx.objectStore(MIGRATION_STORE).get(sourceFingerprint);
    req.onsuccess = () => resolve((req.result as StoredMigrationJournalRecord | undefined) ?? null);
    req.onerror = () => reject(new Error('读取迁移日志失败'));
  });
}

/** 计算 core/projection/outbox 的 content fingerprint（用于 pointer 与 save node 记录）。 */
export async function contentFingerprintOf(value: unknown): Promise<string> {
  return sha256Fingerprint(value);
}
