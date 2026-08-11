// G1.3.2.1/G1.3.2.2/G1.3.2.3/G1.3.2.4 测试专用：最小但忠实的 IndexedDB 内存 shim（仅被 scripts/story-runtime-*-cas/reroll/persistence-*.mjs 使用，不进生产资产）。
// 目标：让生产 store 适配器（coreRuntimeStore/projectionStore/runtimeCheckpoint）在 Node 中
// 以"真实事务语义"运行：
// - P0-4（G1.3.2.1）：readwrite 事务在重叠 scope 上串行化（锁队列）——后一个 readwrite 事务的读取
//   必须等前一个 readwrite 事务 complete/abort 后才能执行，因此 get-then-put 的"读到旧值再写"窗口不存在；
//   写入在事务提交时一次性发布（提交前不可见）；abort() 丢弃写集（回滚）并释放锁。
// - P1-6（G1.3.2.2）：空事务按 IDB 时序 complete/abort 并释放锁；排队事务在真正取得开始许可前不得读取/提交/complete。
// - P1-6（G1.3.2.3）：按数据库与重叠 object-store scope 排队——readonly 与 readonly 并行；
//   readonly/readwrite 与 readwrite 仅在 scope 重叠时互斥；不重叠 scope 不被全库单一队列无条件串行化；
//   排队事务（readonly 与 readwrite 一致）在取得开始许可前不得读取/写入/complete；
//   空事务按 IDB 时序 complete 并释放对应 scope；abort/error 全量丢弃写集。
// - P1-5（G1.3.2.4）：公平创建顺序——事务能否启动同时检查 active 冲突与所有更早创建、尚未完成且 scope 重叠的
//   排队事务；后创建事务不得绕过更早排队事务（A active -> A+B queued -> B 时 B 不得插队）；
// - P1-5（G1.3.2.4）：readonly 事务的 put/delete/clear 按 IDB 语义同步抛出 ReadOnlyError（不返回成功 request）；
// - P1-5（G1.3.2.4）：readwrite 事务内 get/getAll 读取"已提交快照 + 本事务 WriteSet overlay"
//   （read-your-writes、delete/clear overlay）；
// - request/tx 事件按 IDB 时序触发（onupgradeneeded 先于 onsuccess；tx 在全部请求完成后 complete）。
// - 共享 backend（Map）让两个 shim 工厂模拟多标签页/多 worker 访问同一 IndexedDB。
// 镜像的真实 IDB 表面：factory.open(name, version) -> req.onupgradeneeded / req.onsuccess / req.result；
// db.createObjectStore(name, opts)；db.transaction(names, mode)；tx.objectStore(name)；store.get/put/delete/getAll/getAllKeys/clear；
// tx.oncomplete/onerror/onabort；tx.abort()。
// 不模拟：索引、游标、blob、跨 DB 事务、升级迁移版本链（仅首建）。生产代码默认走真实 indexedDB。

function makeRequest(tx) {
  return { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, _tx: tx };
}

function settle(request, result, error) {
  // P0-1（G1.3.2.5）：请求事件用宏任务派发（与真实 IndexedDB 的任务级事件一致）。
  // 若用 microtask，keep-alive 请求链会在 microtask 队列中无限续发，造成 microtask 风暴并阻塞
  // 事件循环（跨 macrotask 的晚失败/成功路径将永远无法继续）。
  setTimeout(() => {
    if (error) {
      request.error = error;
      if (typeof request.onerror === 'function') request.onerror({ target: request, error });
      else if (request._tx && typeof request._tx._fail === 'function') request._tx._fail(error);
    } else {
      request.result = result;
      if (typeof request.onsuccess === 'function') request.onsuccess({ target: request });
    }
    if (request._tx && typeof request._tx._requestDone === 'function') request._tx._requestDone();
  }, 0);
  return request;
}

function cloneJson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, cloneJson(v)]));
  if (value instanceof Set) return new Set([...value].map((v) => cloneJson(v)));
  if (Array.isArray(value)) return value.map((v) => cloneJson(v));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = cloneJson(v);
  return out;
}

function storeMap(db, storeName) {
  let m = db._data.get(storeName);
  if (!m) {
    m = new Map();
    db._data.set(storeName, m);
  }
  return m;
}

class ShimObjectStore {
  constructor(name, db, tx) {
    this.name = name;
    this.db = db;
    this._tx = tx;
  }
  get(key) {
    const tx = this._tx;
    const req = makeRequest(tx);
    if (tx) tx._pendingOps += 1;
    // P1-5（G1.3.2.4）：read-your-writes——已提交快照 + 本事务 WriteSet overlay（put 覆盖 / delete 删除 / clear 清空）。
    const doRead = () => {
      const store = storeMap(this.db, this.name);
      let value;
      if (tx._writes.isCleared(this.name)) {
        const op = tx._writes.peek(this.name, key);
        value = op ? (op.op === 'put' ? op.value : undefined) : undefined;
      } else {
        const op = tx._writes.peek(this.name, key);
        value = op ? (op.op === 'put' ? op.value : undefined) : store.get(key);
      }
      settle(req, value !== undefined ? cloneJson(value) : undefined, null);
    };
    if (tx && !tx._started) tx._awaitStart().then(doRead);
    else doRead();
    return req;
  }
  put(value, key) {
    const tx = this._tx;
    // P1-5（G1.3.2.4）：readonly 事务写入按 IDB 语义同步抛出 ReadOnlyError（不返回成功 request）。
    if (tx && tx.mode === 'readonly') {
      const err = new Error('ReadOnlyError: 只读事务不允许写入');
      err.name = 'ReadOnlyError';
      throw err;
    }
    const req = makeRequest(tx);
    if (tx) tx._pendingOps += 1;
    let actualKey = key;
    if (actualKey === undefined) {
      actualKey = this.db._nextKey(this.name);
    }
    // P1-6（G1.3.2.3）：写集先记录在事务私有区，取得开始许可后才 settle（提交点一次性发布）。
    const recordWrite = () => {
      tx._writes.set(this.name, actualKey, cloneJson(value));
      settle(req, actualKey, null);
    };
    if (tx && !tx._started) tx._awaitStart().then(recordWrite);
    else recordWrite();
    return req;
  }
  delete(key) {
    const tx = this._tx;
    if (tx && tx.mode === 'readonly') {
      const err = new Error('ReadOnlyError: 只读事务不允许删除');
      err.name = 'ReadOnlyError';
      throw err;
    }
    const req = makeRequest(tx);
    if (tx) tx._pendingOps += 1;
    const recordDelete = () => {
      tx._writes.delete(this.name, key);
      settle(req, undefined, null);
    };
    if (tx && !tx._started) tx._awaitStart().then(recordDelete);
    else recordDelete();
    return req;
  }
  getAll() {
    const tx = this._tx;
    const req = makeRequest(tx);
    if (tx) tx._pendingOps += 1;
    // P1-5（G1.3.2.4）：getAll overlay——已提交快照 + 本事务 WriteSet（clear 清空、put 覆盖/新增、delete 移除）。
    const doRead = () => {
      const store = storeMap(this.db, this.name);
      const base = tx._writes.isCleared(this.name) ? new Map() : new Map(store);
      for (const op of tx._writes.entriesFor(this.name)) {
        if (op.op === 'put') base.set(op.key, op.value);
        else base.delete(op.key);
      }
      settle(req, [...base.values()].map((v) => cloneJson(v)), null);
    };
    if (tx && !tx._started) tx._awaitStart().then(doRead);
    else doRead();
    return req;
  }
  getAllKeys() {
    const tx = this._tx;
    const req = makeRequest(tx);
    if (tx) tx._pendingOps += 1;
    // P1-5（G1.3.2.4）：keys overlay 与 getAll 一致（clear/put/delete 后的键集）。
    const doRead = () => {
      const store = storeMap(this.db, this.name);
      const base = tx._writes.isCleared(this.name) ? new Map() : new Map(store);
      for (const op of tx._writes.entriesFor(this.name)) {
        if (op.op === 'put') base.set(op.key, op.value);
        else base.delete(op.key);
      }
      settle(req, [...base.keys()], null);
    };
    if (tx && !tx._started) tx._awaitStart().then(doRead);
    else doRead();
    return req;
  }
  clear() {
    const tx = this._tx;
    if (tx && tx.mode === 'readonly') {
      const err = new Error('ReadOnlyError: 只读事务不允许清空');
      err.name = 'ReadOnlyError';
      throw err;
    }
    const req = makeRequest(tx);
    if (tx) tx._pendingOps += 1;
    // P1-5（G1.3.2.4）：clear 记录 store 级清空标记（overlay 与提交都按"清空后应用后续写集"处理）。
    const recordClear = () => {
      tx._writes.clearStore(this.name);
      settle(req, undefined, null);
    };
    if (tx && !tx._started) tx._awaitStart().then(recordClear);
    else recordClear();
    return req;
  }
}

class WriteSet {
  constructor() {
    this._ops = new Map();
    this._clears = new Set();
  }
  set(store, key, value) {
    this._ops.set(store + '\0' + key, { store, key, op: 'put', value });
  }
  delete(store, key) {
    this._ops.set(store + '\0' + key, { store, key, op: 'delete', value: undefined });
  }
  /**
   * P1-3（G1.3.2.5）：store 级清空——丢弃该 store 在 clear 之前的全部 put/delete WriteSet，
   * 只保留 clear 之后的新操作（`put -> clear` 为空、`put -> clear -> put` 只剩后写、
   * `clear -> put -> clear` 为空、`put -> delete -> clear` 为空；事务内 overlay 与最终提交一致）。
   */
  clearStore(store) {
    for (const key of [...this._ops.keys()]) {
      if (key.startsWith(store + '\0')) this._ops.delete(key);
    }
    this._clears.add(store);
  }
  isCleared(store) {
    return this._clears.has(store);
  }
  peek(store, key) {
    return this._ops.get(store + '\0' + key);
  }
  entries() {
    return [...this._ops.values()];
  }
  entriesFor(store) {
    return [...this._ops.values()].filter((op) => op.store === store);
  }
  clear() {
    this._ops.clear();
    this._clears.clear();
  }
}

class ShimTransaction {
  constructor(db, storeNames, mode) {
    this.db = db;
    this.storeNames = storeNames;
    this.mode = mode;
    this._done = false;
    this._pendingOps = 0;
    this._writes = new WriteSet();
    // P1-6（G1.3.2.3）：所有事务（readonly 与 readwrite）都由队列授予开始许可后才可读取/写入/complete。
    // readwrite 的开始许可即"取得锁"；readonly 的开始许可保证不会看到重叠 readwrite 的未提交窗口。
    this._started = false;
    this._startPromise = null;
    this._startResolve = null;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;
  }
  objectStore(name) {
    if (!this.storeNames.includes(name)) {
      throw new Error('IDB transaction scope 不包含 store: ' + name);
    }
    return new ShimObjectStore(name, this.db, this);
  }
  _awaitStart() {
    if (this._started) return Promise.resolve();
    if (!this._startPromise) {
      this._startPromise = new Promise((resolve) => {
        this._startResolve = resolve;
      });
    }
    return this._startPromise;
  }
  /** 队列允许开始时调用：readwrite 取得锁；readonly 获得开始许可。空事务随后按 IDB 时序 complete。 */
  _begin() {
    if (this._started) return;
    this._started = true;
    if (this._startResolve) this._startResolve();
    // P1-6（G1.3.2.3）：延后一个宏任务再检查完成，保证同一同步调用栈中后续发出的请求
    // （objectStore().get/put）先注册；否则空事务完成定时器会先于请求/故障注入触发，
    // 导致写集在 error/abort 前被发布。
    setTimeout(() => this._maybeComplete(), 0);
  }
  _requestDone() {
    this._pendingOps = Math.max(0, this._pendingOps - 1);
    this._maybeComplete();
  }
  /**
   * P1-6（G1.3.2.2/2.3）：完成判定必须同时满足"已取得开始许可"与"无进行中请求"。
   * - 排队事务在取得许可前不得读取/提交/触发 complete（读/写由 _awaitStart 延迟，complete 由 _started 门控）；
   * - 空事务（无请求）在取得许可后于 macrotask 完成并释放对应 scope；
   * - 延后到 macrotask 保证同一轮 promise 续体先发出再 complete，写集一次性发布。
   */
  _maybeComplete() {
    if (this._done) return;
    if (!this._started || this._pendingOps !== 0) return;
    setTimeout(() => {
      if (this._pendingOps === 0 && !this._done) this._complete();
    }, 0);
  }
  _complete() {
    if (this._done) return;
    this._done = true;
    if (this.mode === 'readwrite') this._publishWrites();
    this.db._release(this);
    queueMicrotask(() => {
      if (typeof this.oncomplete === 'function') this.oncomplete({ target: this });
    });
  }
  _publishWrites() {
    for (const clearedStore of this._writes._clears) {
      storeMap(this.db, clearedStore).clear();
    }
    for (const op of this._writes.entries()) {
      const store = storeMap(this.db, op.store);
      if (op.op === 'put') store.set(op.key, cloneJson(op.value));
      else store.delete(op.key);
    }
    this._writes.clear();
  }
  _fail(error) {
    if (this._done) return;
    this._done = true;
    this.error = error ?? new Error('IDB transaction error');
    this._writes.clear();
    this.db._release(this);
    queueMicrotask(() => {
      if (typeof this.onerror === 'function') this.onerror({ target: this, error: this.error });
      if (typeof this.onabort === 'function') this.onabort({ target: this, error: this.error });
    });
  }
  abort() {
    if (this._done) return;
    this._done = true;
    this.error = new Error('IDB transaction aborted');
    this._writes.clear();
    this.db._release(this);
    queueMicrotask(() => {
      if (typeof this.onabort === 'function') this.onabort({ target: this, error: this.error });
    });
  }
}

class ShimDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.objectStoreNames = [];
    this._data = new Map();
    this._counters = new Map();
    // P1-6（G1.3.2.3）：活跃/排队事务列表（readonly 与 readwrite 统一管理）。
    this._active = [];
    this._queued = [];
  }
  createObjectStore(name, opts = {}) {
    if (this.objectStoreNames.includes(name)) {
      throw new Error('store 已存在: ' + name);
    }
    this.objectStoreNames.push(name);
    this._data.set(name, new Map());
    this._counters.set(name, 1);
    const store = {};
    if (opts.keyPath) store.keyPath = opts.keyPath;
    if (opts.autoIncrement) store.autoIncrement = true;
    return store;
  }
  _nextKey(storeName) {
    const n = this._counters.get(storeName) ?? 1;
    this._counters.set(storeName, n + 1);
    return n;
  }
  /**
   * P1-6（G1.3.2.3）：scope 互斥判定（active 部分）。
   * - readonly 与 readonly：并行（无写冲突，快照隔离）；
   * - readonly/readwrite 与 readwrite：仅当 object-store scope 重叠时互斥（真实 IDB 事务语义）；
   * - 不重叠 scope 的事务可以并行，不被全库单一队列无条件串行化。
   */
  _conflictsWithActive(tx) {
    return this._active.some((a) => {
      if (a === tx || a._done) return false;
      if (a.mode === 'readonly' && tx.mode === 'readonly') return false;
      return tx.storeNames.some((n) => a.storeNames.includes(n));
    });
  }
  /**
   * P1-5（G1.3.2.4）：公平创建顺序——事务能否启动必须同时检查 active 冲突与所有
   * 更早创建、尚未完成且 scope 重叠的排队事务；后创建事务不得绕过更早排队事务
   * （A active -> A+B queued -> B 时，B 必须等 A+B 先启动）。
   */
  _conflictsWithQueued(tx) {
    const idx = this._queued.indexOf(tx);
    if (idx <= 0) return false;
    for (let i = 0; i < idx; i += 1) {
      const q = this._queued[i];
      if (q === tx || q._done) continue;
      if (q.mode === 'readonly' && tx.mode === 'readonly') continue;
      if (tx.storeNames.some((n) => q.storeNames.includes(n))) return true;
    }
    return false;
  }
  _canStart(tx) {
    if (tx._done) return false;
    return !this._conflictsWithActive(tx) && !this._conflictsWithQueued(tx);
  }
  /** 让所有可开始的事务获得开始许可（事件驱动，替代单一 promise 链）。 */
  _kickQueue() {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let i = 0; i < this._queued.length; i += 1) {
        const tx = this._queued[i];
        if (tx._done) {
          // 排队期间被 abort/error：直接移除，不取得锁、不执行任何操作。
          this._queued.splice(i, 1);
          progressed = true;
          break;
        }
        if (!this._canStart(tx)) continue;
        this._queued.splice(i, 1);
        this._active.push(tx);
        tx._begin();
        progressed = true;
        break;
      }
    }
  }
  /** 事务结束（complete/abort/error）时释放其 scope 并推进队列。 */
  _release(tx) {
    const i = this._active.indexOf(tx);
    if (i >= 0) this._active.splice(i, 1);
    this._kickQueue();
  }
  transaction(storeNames, mode = 'readonly') {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    for (const n of names) {
      if (!this.objectStoreNames.includes(n)) throw new Error('store 不存在: ' + n);
    }
    const tx = new ShimTransaction(this, names, mode);
    this._queued.push(tx);
    this._kickQueue();
    return tx;
  }
  close() {}
}

class ShimFactory {
  constructor(sharedBackend) {
    this._databases = sharedBackend ?? new Map();
  }
  open(name, version = 1) {
    const req = makeRequest(null);
    queueMicrotask(() => {
      let db = this._databases.get(name);
      const needsCreate = !db;
      if (!db) {
        db = new ShimDatabase(name, version);
        this._databases.set(name, db);
      }
      if (needsCreate && typeof req.onupgradeneeded === 'function') {
        req.onupgradeneeded({ target: { result: db, transaction: null }, oldVersion: 0, newVersion: version });
      }
      settle(req, db, null);
    });
    return req;
  }
}

/**
 * 创建 IDB shim 工厂。生产 store 通过注入此工厂获得"真实事务语义"
 * （重叠 scope 串行 + 一次性发布 + abort 回滚 + readonly 并行 + 公平创建顺序 + read-your-writes）。
 * 用法与真实 indexedDB 相同：
 *   const req = factory.open('db', 1);
 *   req.onupgradeneeded = (e) => { const db = e.target.result; db.createObjectStore('x'); };
 *   req.onsuccess = () => { const db = req.result; db.transaction(['x'], 'readwrite') ... };
 * sharedBackend：可选共享底层 DB Map（跨 shim 工厂共享数据，模拟多标签页）。
 */
export function createIdbShim(sharedBackend) {
  return new ShimFactory(sharedBackend);
}

/** 创建可共享的底层 DB Map（传给多个 createIdbShim 以模拟多标签页访问同一 IndexedDB）。 */
export function createSharedIdbBackend() {
  return new Map();
}
