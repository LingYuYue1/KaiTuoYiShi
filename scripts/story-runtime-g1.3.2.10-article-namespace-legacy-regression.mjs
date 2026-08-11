// G1.3.2.10: new article namespace must be disjoint from all legacy raw keys,
// while raw legacy, G1.3.2.9 encoded, and current rows remain readable.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';
import { createIdbShim, createSharedIdbBackend } from './story-runtime-idb-shim.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function version(runtimeBranchId, articleId, articleVersion, articleVersionId = 'v' + articleVersion) {
  return {
    runtimeBranchId,
    articleVersionId,
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

function aggregate(runtimeBranchId, articleId, currentVersion) {
  return { runtimeBranchId, articleId, currentVersion, versionIds: [], aggregateRevision: 0 };
}

function item(runtimeBranchId, aggregateKey, sourceLevelIdempotencyKey) {
  return {
    outboxId: 'outbox-' + sourceLevelIdempotencyKey,
    schemaVersion: 3,
    runtimeBranchId,
    sourceRefFingerprint: 'source',
    sourceRevision: 1,
    kind: 'news',
    aggregateKey,
    operation: 'create',
    sourceLevelIdempotencyKey,
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

async function putRow(coreStore, backend, key, value) {
  const db = await coreStore.openRuntimeDb(createIdbShim(backend));
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

async function main() {
  const projection = await bundleTs('services/storyRuntime/projectionStore.ts');
  const adapterMod = await bundleTs('services/storyRuntime/projectionAdapter.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');

  const rawCollisionKey = 'projection:article:branch%3A:a:1';
  const currentCollisionKey = projection.projectionArticleVersionKey('branch:', 'a', 1);
  assert(currentCollisionKey.startsWith('projection:article-v2:'), 'current writes must use the disjoint article-v2 namespace: ' + currentCollisionKey);
  assert(currentCollisionKey !== rawCollisionKey, 'current key must not collide with a raw legacy percent key');
  for (const input of ['branch:', '100%', '空 格', '星穹']) {
    const encoded = projection.encodeIdComponent(input);
    assert(!encoded.includes(':'), 'encoded component contains a raw colon: ' + input + ' -> ' + encoded);
    assert(projection.decodeIdComponent(encoded) === input, 'codec round trip failed: ' + input);
  }

  const backend = createSharedIdbBackend();
  await putRow(coreStore, backend, rawCollisionKey, version('branch%3A', 'a', 1, 'legacy-percent'));
  await putRow(coreStore, backend, 'projection:article:branch:sub:article:X:2', version('branch:sub', 'article:X', 2, 'legacy-colon'));
  await putRow(coreStore, backend, 'projection:article:branch_X:100%:3', version('branch_X', '100%', 3, 'legacy-raw-percent'));
  const encodedV1Key = 'projection:article:' + projection.encodeIdComponent('branch:v1') + ':' + projection.encodeIdComponent('article:v1') + ':4';
  await putRow(coreStore, backend, encodedV1Key, version('branch:v1', 'article:v1', 4, 'encoded-v1'));

  const consumeResult = await projection.consumeNewsOutbox(
    new adapterMod.ProjectionDurableAdapter(createIdbShim(backend)),
    item('branch:', 'aggregate-current', 'source-current'),
    aggregate('branch:', 'a', 1),
    version('branch:', 'a', 1, 'current-v2'),
  );
  assert(consumeResult.ok === true && consumeResult.key === currentCollisionKey, 'legacy collision must not block current write: ' + JSON.stringify(consumeResult));

  const cases = [
    ['branch%3A', 'a', 1, 'legacy-percent'],
    ['branch:sub', 'article:X', 2, 'legacy-colon'],
    ['branch_X', '100%', 3, 'legacy-raw-percent'],
    ['branch:v1', 'article:v1', 4, 'encoded-v1'],
    ['branch:', 'a', 1, 'current-v2'],
  ];
  for (const [branch, articleId, articleVersion, articleVersionId] of cases) {
    const adapter = new adapterMod.ProjectionDurableAdapter(createIdbShim(backend));
    const listed = await adapterMod.durableListArticleVersions(adapter, branch);
    assert(listed.ok && listed.values.some((row) => row.articleVersionId === articleVersionId), 'list failed for ' + branch + '/' + articleId + ': ' + JSON.stringify(listed));
    const got = await adapterMod.durableGetArticleVersion(adapter, branch, articleId, articleVersion);
    assert(got.ok && got.value.articleVersionId === articleVersionId, 'get failed for ' + branch + '/' + articleId + ': ' + JSON.stringify(got));
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter, branch);
    assert(recovered.articleVersions.some((row) => row.articleVersionId === articleVersionId), 'recovery failed for ' + branch + '/' + articleId + ': ' + JSON.stringify(recovered.diagnostics));
  }

  const oldList = await adapterMod.durableListArticleVersions(new adapterMod.ProjectionDurableAdapter(createIdbShim(backend)), 'branch%3A');
  const newList = await adapterMod.durableListArticleVersions(new adapterMod.ProjectionDurableAdapter(createIdbShim(backend)), 'branch:');
  assert(oldList.ok && oldList.values.length === 1 && oldList.values[0].runtimeBranchId === 'branch%3A', 'old collision owner must remain isolated');
  assert(newList.ok && newList.values.length === 1 && newList.values[0].runtimeBranchId === 'branch:', 'current collision owner must remain isolated');

  {
    const duplicateBackend = createSharedIdbBackend();
    await putRow(coreStore, duplicateBackend, 'projection:article:branch:legacy:a:1', version('branch:legacy', 'a', 1, 'legacy-same-owner'));
    const duplicateResult = await projection.consumeNewsOutbox(
      new adapterMod.ProjectionDurableAdapter(createIdbShim(duplicateBackend)),
      item('branch:legacy', 'aggregate-duplicate', 'source-duplicate'),
      aggregate('branch:legacy', 'a', 1),
      version('branch:legacy', 'a', 1, 'current-duplicate'),
    );
    assert(duplicateResult.ok === false && duplicateResult.code === 'CONFLICT', 'same-owner legacy version must remain immutable: ' + JSON.stringify(duplicateResult));
    const currentRow = await new adapterMod.ProjectionDurableAdapter(createIdbShim(duplicateBackend)).readOne(
      coreStore.PROJECTION_STORE,
      projection.projectionArticleVersionKey('branch:legacy', 'a', 1),
    );
    assert(currentRow === null, 'same-owner legacy conflict wrote a duplicate current row');
  }

  console.log('story-runtime-g1.3.2.10-article-namespace-legacy regression passed.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-g1.3.2.10-article-namespace-legacy regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
