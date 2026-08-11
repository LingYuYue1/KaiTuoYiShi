// G1.3.2.10: incoming values rejected by article parsing or existing-row
// validation must be rejected before the transaction and leave the store empty.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';
import { createIdbShim, createSharedIdbBackend } from './story-runtime-idb-shim.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function version(runtimeBranchId, articleId, articleVersion) {
  return {
    runtimeBranchId,
    articleVersionId: 'v-' + String(articleVersion),
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
    outboxId: 'outbox-' + String(sourceLevelIdempotencyKey),
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

async function main() {
  const projection = await bundleTs('services/storyRuntime/projectionStore.ts');
  const adapterMod = await bundleTs('services/storyRuntime/projectionAdapter.ts');

  const invalidCases = [
    ['empty branch', item('', 'agg', 'source'), aggregate('', 'article', 1), version('', 'article', 1)],
    ['empty articleId', item('branch', 'agg', 'source'), aggregate('branch', '', 1), version('branch', '', 1)],
    ['negative version', item('branch', 'agg', 'source'), aggregate('branch', 'article', -1), version('branch', 'article', -1)],
    ['fractional version', item('branch', 'agg', 'source'), aggregate('branch', 'article', 1.5), version('branch', 'article', 1.5)],
    ['NaN version', item('branch', 'agg', 'source'), aggregate('branch', 'article', Number.NaN), version('branch', 'article', Number.NaN)],
    ['Infinity version', item('branch', 'agg', 'source'), aggregate('branch', 'article', Number.POSITIVE_INFINITY), version('branch', 'article', Number.POSITIVE_INFINITY)],
    ['unsafe version', item('branch', 'agg', 'source'), aggregate('branch', 'article', Number.MAX_SAFE_INTEGER + 1), version('branch', 'article', Number.MAX_SAFE_INTEGER + 1)],
    ['empty aggregateKey', item('branch', '', 'source'), aggregate('branch', 'article', 1), version('branch', 'article', 1)],
    ['empty source key', item('branch', 'agg', ''), aggregate('branch', 'article', 1), version('branch', 'article', 1)],
  ];

  for (const [label, outboxItem, incomingAggregate, incomingVersion] of invalidCases) {
    const backend = createSharedIdbBackend();
    const adapter = new adapterMod.ProjectionDurableAdapter(createIdbShim(backend));
    let transactionCount = 0;
    const guardedAdapter = {
      runTransaction(...args) {
        transactionCount += 1;
        return adapter.runTransaction(...args);
      },
    };
    const result = await projection.consumeNewsOutbox(guardedAdapter, outboxItem, incomingAggregate, incomingVersion);
    assert(result.ok === false && result.code === 'INVALID_COMMAND', label + ' must be INVALID_COMMAND: ' + JSON.stringify(result));
    assert(transactionCount === 0, label + ' entered a transaction');
    const entries = await adapter.entries();
    assert(entries.length === 0, label + ' wrote rows: ' + JSON.stringify(entries));
  }

  for (const articleVersion of [0, 1, Number.MAX_SAFE_INTEGER]) {
    const backend = createSharedIdbBackend();
    const adapter = new adapterMod.ProjectionDurableAdapter(createIdbShim(backend));
    const result = await projection.consumeNewsOutbox(
      adapter,
      item('branch', 'agg-' + articleVersion, 'source-' + articleVersion),
      aggregate('branch', 'article-' + articleVersion, articleVersion),
      version('branch', 'article-' + articleVersion, articleVersion),
    );
    assert(result.ok === true, 'valid boundary failed for version ' + articleVersion + ': ' + JSON.stringify(result));
    assert(result.key.startsWith('projection:article-v2:'), 'valid boundary used a legacy key: ' + result.key);
  }

  console.log('story-runtime-g1.3.2.10-incoming-persistable-domain regression passed.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-g1.3.2.10-incoming-persistable-domain regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
