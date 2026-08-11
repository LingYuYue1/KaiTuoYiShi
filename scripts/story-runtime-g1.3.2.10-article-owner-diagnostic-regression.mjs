// G1.3.2.10: schema-invalid article rows are diagnosed by the physical key
// owner. A row cannot redirect a target-key diagnostic to another branch.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';
import { createIdbShim, createSharedIdbBackend } from './story-runtime-idb-shim.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function version(runtimeBranchId, articleId, articleVersion, lifecycle = 'queued') {
  return {
    runtimeBranchId,
    articleVersionId: 'v-' + runtimeBranchId,
    articleId,
    articleVersion,
    sourceRefs: [],
    sourceFingerprint: 'source',
    lifecycle,
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

async function list(adapterMod, backend, branch) {
  return adapterMod.durableListArticleVersions(new adapterMod.ProjectionDurableAdapter(createIdbShim(backend)), branch);
}

async function main() {
  const projection = await bundleTs('services/storyRuntime/projectionStore.ts');
  const adapterMod = await bundleTs('services/storyRuntime/projectionAdapter.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');

  const cases = [
    ['target key + other invalid row', 'branch_TARGET', 'branch_OTHER', 'branch_TARGET'],
    ['target key + target invalid row', 'branch_TARGET', 'branch_TARGET', 'branch_TARGET'],
    ['other key + other invalid row', 'branch_OTHER', 'branch_OTHER', 'branch_OTHER'],
  ];
  for (const [label, keyBranch, rowBranch, expectedDiagnosticBranch] of cases) {
    const backend = createSharedIdbBackend();
    const key = projection.projectionArticleVersionKey(keyBranch, 'article', 1);
    await putRow(coreStore, backend, key, version(rowBranch, 'article', 1, 'NOT_VALID'));
    const target = await list(adapterMod, backend, 'branch_TARGET');
    const other = await list(adapterMod, backend, 'branch_OTHER');
    assert(target.ok && other.ok, label + ' list failed');
    const expected = expectedDiagnosticBranch === 'branch_TARGET' ? target : other;
    const unrelated = expectedDiagnosticBranch === 'branch_TARGET' ? other : target;
    assert(expected.skipped.length === 1 && expected.skipped[0].includes(key), label + ' missing expected diagnostic: ' + JSON.stringify({ target, other }));
    assert(unrelated.skipped.length === 0, label + ' polluted unrelated branch: ' + JSON.stringify({ target, other }));
  }

  {
    const backend = createSharedIdbBackend();
    const key = projection.projectionArticleVersionKey('branch_TARGET', 'article', 1);
    await putRow(coreStore, backend, key, version('branch_OTHER', 'article', 1));
    const target = await list(adapterMod, backend, 'branch_TARGET');
    const other = await list(adapterMod, backend, 'branch_OTHER');
    assert(target.ok && target.values.length === 0 && target.skipped.length === 1, 'validated owner mismatch must diagnose the physical target owner: ' + JSON.stringify(target));
    assert(other.ok && other.values.length === 0 && other.skipped.length === 0, 'validated owner mismatch polluted the row-claimed branch: ' + JSON.stringify(other));
  }

  console.log('story-runtime-g1.3.2.10-article-owner-diagnostic regression passed.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-g1.3.2.10-article-owner-diagnostic regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
