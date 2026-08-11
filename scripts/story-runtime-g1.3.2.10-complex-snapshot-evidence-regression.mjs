// G1.3.2.10: persisted Symbol key/value evidence and sparse-array semantics
// must be asserted, and the prior codec regression must not contain a tautology.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';
import { createIdbShim, createSharedIdbBackend } from './story-runtime-idb-shim.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function deepEqualStable(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqualStable(value, b.get(key))) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index])) return false;
    return aKeys.every((key) => deepEqualStable(a[key], b[key]));
  }
  const aKeys = Reflect.ownKeys(a);
  const bKeys = Reflect.ownKeys(b);
  if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index])) return false;
  return aKeys.every((key) => deepEqualStable(a[key], b[key]));
}

function version(runtimeBranchId, articleId, articleVersion) {
  return {
    runtimeBranchId,
    articleVersionId: 'v1',
    articleId,
    articleVersion,
    sourceRefs: [],
    sourceFingerprint: 'source',
    lifecycle: 'queued',
    storyPhase: 'ongoing',
    category: 'test',
    title: 'title',
    body: 'body',
    publicScope: { kind: 'public' },
    reliability: 'supported',
    isCorrection: false,
    sourceTrace: [],
  };
}

function item(sourceKey) {
  return {
    outboxId: 'outbox-' + sourceKey,
    schemaVersion: 3,
    runtimeBranchId: 'branch_W',
    sourceRefFingerprint: 'source',
    sourceRevision: 1,
    kind: 'news',
    aggregateKey: 'aggregate-W',
    operation: 'create',
    sourceLevelIdempotencyKey: sourceKey,
    deliveryKey: 'delivery',
    payloadFingerprint: 'payload',
    payloadRef: { kind: 'inline', key: 'payload' },
    consumerIds: ['news'],
    consumerAcks: {},
    createdAt: 1,
    status: 'pending',
    attemptCount: 0,
  };
}

async function openDb(coreStore, backend) {
  return coreStore.openRuntimeDb(createIdbShim(backend));
}

async function put(coreStore, backend, key, value) {
  const db = await openDb(coreStore, backend);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
    const request = tx.objectStore(coreStore.PROJECTION_STORE).put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function get(coreStore, backend, key) {
  const db = await openDb(coreStore, backend);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(coreStore.PROJECTION_STORE, 'readonly');
    const request = tx.objectStore(coreStore.PROJECTION_STORE).get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function main() {
  const projection = await bundleTs('services/storyRuntime/projectionStore.ts');
  const adapterMod = await bundleTs('services/storyRuntime/projectionAdapter.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');

  const codecSource = fs.readFileSync(path.join(process.cwd(), 'scripts/story-runtime-g1.3.2.9-article-key-codec-regression.mjs'), 'utf8');
  assert(!codecSource.includes("!encoded.includes(':') || true"), 'G1.3.2.9 codec regression still contains a tautological assertion');

  const symbolKey = Symbol('persisted-map-key');
  const symbolValue = Symbol('persisted-value');
  const aggregateKey = projection.projectionAggregateKey('branch_W', 'aggregate-W');
  const existing = {
    aggregate: { runtimeBranchId: 'branch_W', articleId: 'article-W', currentVersion: -1, versionIds: [symbolValue], aggregateRevision: 1 },
    aggregateKey: 'aggregate-W',
    versionIds: [symbolValue],
    sourceLevelIdempotencyKeys: [{ key: 'old', payloadFingerprint: 'fingerprint' }],
    symbolKeyCarrier: new Map([[symbolKey, { value: symbolValue }]]),
  };
  const backend = createSharedIdbBackend();
  await put(coreStore, backend, aggregateKey, existing);
  const before = await get(coreStore, backend, aggregateKey);
  assert(before.symbolKeyCarrier instanceof Map && before.symbolKeyCarrier.has(symbolKey), 'shim did not preserve the Symbol map key');
  assert(before.versionIds[0] === symbolValue, 'shim did not preserve the Symbol value');
  const result = await projection.consumeNewsOutbox(
    new adapterMod.ProjectionDurableAdapter(createIdbShim(backend)),
    item('new'),
    { runtimeBranchId: 'branch_W', articleId: 'article-W', currentVersion: 1, versionIds: [], aggregateRevision: 0 },
    version('branch_W', 'article-W', 1),
  );
  assert(result.ok === false && result.code === 'INVALID_COMMAND', 'complex existing wrapper must reject without writes: ' + JSON.stringify(result));
  const after = await get(coreStore, backend, aggregateKey);
  assert(deepEqualStable(before, after), 'Symbol key/value wrapper changed after rejected write');
  const versionAfter = await get(coreStore, backend, projection.projectionArticleVersionKey('branch_W', 'article-W', 1));
  assert(versionAfter === undefined, 'rejected complex wrapper wrote an article version');

  const sparse = ['v1'];
  sparse.length = 3;
  const sparseKey = 'projection:test:sparse';
  await put(coreStore, backend, sparseKey, sparse);
  const sparseRead = await get(coreStore, backend, sparseKey);
  assert(Array.isArray(sparseRead) && sparseRead.length === 3, 'shim sparse length changed: ' + sparseRead?.length);
  assert(0 in sparseRead && !(1 in sparseRead) && !(2 in sparseRead), 'shim sparse index set changed: ' + Object.keys(sparseRead));
  assert(deepEqualStable(sparse, sparseRead), 'sparse array round trip changed shape');

  console.log('story-runtime-g1.3.2.10-complex-snapshot-evidence regression passed.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-g1.3.2.10-complex-snapshot-evidence regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
