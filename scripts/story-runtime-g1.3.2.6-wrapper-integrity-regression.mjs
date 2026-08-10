// G1.3.2.6 wrapper-integrity regression：P0-3/P1-1 ——
// - aggregate wrapper：aggregateKey 缺失/空、versionIds 与 inner aggregate 不一致、
//   sourceLevelIdempotencyKeys 元素 key/payloadFingerprint 为空 -> 各自诊断 + 只读（独立 backend）；
// - cursor wrapper：revision 负数、NaN、非整数、缺失 -> 各自诊断 + 只读；
// - receipt/publication wrapper：payloadFingerprint 缺失、空、与 inner payload 的 sha256Fingerprint
//   不一致 -> 各自诊断 + 只读；
// - 合法 wrapper（真实 fingerprint + 一致 versionIds + 非负 revision）完整恢复（对照）。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs, makeEmptyState } from './story-runtime-core-test-helpers.mjs';
import { createIdbShim, createSharedIdbBackend } from './story-runtime-idb-shim.mjs';

const FROZEN_HASHES = {
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
  'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
};

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }

async function main() {
  const adapterMod = await bundleTs('services/storyRuntime/projectionAdapter.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const idMod = await bundleTs('services/storyRuntime/id.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };
  const version = (branchId, articleId, vid, vno) => ({
    runtimeBranchId: branchId, articleVersionId: vid, articleId, articleVersion: vno,
    sourceRefs: [], sourceFingerprint: 's', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x',
    title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [],
  });
  const cursor = (branchId, observerId) => ({ runtimeBranchId: branchId, observerId, channel: 'player_ui' });
  const receipt = (branchId, receiptId) => ({
    runtimeBranchId: branchId, receiptId, subjectType: 'npc', subjectId: 'n',
    subjectRef: { kind: 'committed_fact', factId: 'sha256:f', sourceRevision: 1 }, knowledgeKind: 'fact',
    claimReliability: 'confirmed', channel: 'dialogue', observedAt: { dayOrdinal: 1, minuteOfDay: 0 },
    deliveryEvidenceRef: { kind: 'narrative_span', responseId: 'r', bodyFingerprint: 'sha256:b', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:t' },
    confidence: 'confirmed', idempotencyKey: 'ik',
  });
  const publication = (branchId, pubId) => ({
    publicationId: pubId, runtimeBranchId: branchId, turnId: 't1', sourceRuntimeRevision: 1, commitReceiptId: 'rc',
    body: 'b', bodyFingerprint: 'sha256:bf', status: 'revealed', revealAttemptCount: 0, createdAt: { dayOrdinal: 1, minuteOfDay: 0 },
  });

  // 独立 backend + seed core + 写一行 + recovery（逐条隔离）。
  async function recoverWithRow(key, value) {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_W', saveNodeId: 's', runtimeRevision: 0 });
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_W', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    assert(seed.ok, 'seed 成功');
    const db = await coreStore.openRuntimeDb(shim1);
    await new Promise((res) => {
      const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
      const r = tx.objectStore(coreStore.PROJECTION_STORE).put(value, key);
      r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
    });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    return adapterMod.recoverProjectionsFromStore(adapter2, 'branch_W');
  }

  // ══ 场景 1：aggregate wrapper 完整性——aggregateKey 缺失/versionIds 不一致/idempotency 元素空 ══
  {
    const aggInner = { runtimeBranchId: 'branch_W', articleId: 'a', currentVersion: 1, versionIds: ['v1'], aggregateRevision: 1 };
    const badWrappers = [
      ['projection:aggregate:branch_W:agg1', { aggregate: aggInner, versionIds: ['v1'], sourceLevelIdempotencyKeys: [] }, 'aggregateKey 缺失'],
      ['projection:aggregate:branch_W:agg2', { aggregate: aggInner, aggregateKey: '', versionIds: ['v1'], sourceLevelIdempotencyKeys: [] }, 'aggregateKey 空'],
      ['projection:aggregate:branch_W:agg3', { aggregate: aggInner, aggregateKey: 'agg3', versionIds: ['v9'], sourceLevelIdempotencyKeys: [] }, 'versionIds 不一致'],
      ['projection:aggregate:branch_W:agg4', { aggregate: aggInner, aggregateKey: 'agg4', versionIds: ['v1'], sourceLevelIdempotencyKeys: [{ key: '', payloadFingerprint: 'f' }] }, 'idempotency key 空'],
      ['projection:aggregate:branch_W:agg5', { aggregate: aggInner, aggregateKey: 'agg5', versionIds: ['v1'], sourceLevelIdempotencyKeys: [{ key: 'k', payloadFingerprint: '' }] }, 'idempotency fingerprint 空'],
      ['projection:aggregate:branch_W:agg6', { aggregate: aggInner, aggregateKey: 'agg6', versionIds: ['v1'], sourceLevelIdempotencyKeys: [{ key: 42, payloadFingerprint: 'f' }] }, 'idempotency key 非字符串'],
    ];
    for (const [key, value, label] of badWrappers) {
      const recovered = await recoverWithRow(key, value);
      assert(recovered.readonlyMode === true, '场景1-' + label + ' 必须强制只读（独立 backend）');
      assert(recovered.diagnostics.some((d) => d.includes('aggregate wrapper')), '场景1-' + label + ' 必须有 aggregate wrapper 诊断，实际 ' + JSON.stringify(recovered.diagnostics));
      assert(recovered.newsArticles.length === 0, '场景1-' + label + ' 不得进入恢复数组');
    }
    recordRejected('P0-3-aggregate wrapper 完整性', '6 个坏 wrapper 独立 backend 各自诊断 + 只读', 'wrapper');
  }

  // ══ 场景 2：cursor revision 完整性——负数/NaN/非整数/缺失 ══
  {
    const badRevisions = [
      ['projection:cursor:branch_W:c1', { cursor: cursor('branch_W', 'c1'), revision: -1 }, '负 revision'],
      ['projection:cursor:branch_W:c2', { cursor: cursor('branch_W', 'c2'), revision: NaN }, 'NaN revision'],
      ['projection:cursor:branch_W:c3', { cursor: cursor('branch_W', 'c3'), revision: 1.5 }, '非整数 revision'],
      ['projection:cursor:branch_W:c4', { cursor: cursor('branch_W', 'c4') }, 'revision 缺失'],
    ];
    for (const [key, value, label] of badRevisions) {
      const recovered = await recoverWithRow(key, value);
      assert(recovered.readonlyMode === true, '场景2-' + label + ' 必须强制只读');
      assert(recovered.diagnostics.some((d) => d.includes('revision')), '场景2-' + label + ' 必须有 revision 诊断，实际 ' + JSON.stringify(recovered.diagnostics));
      assert(recovered.observerReadCursors.length === 0, '场景2-' + label + ' 不得进入恢复数组');
    }
    recordRejected('P0-3-cursor revision 完整性', '负/NaN/非整数/缺失 各自诊断 + 只读', '各自诊断');
  }

  // ══ 场景 3：receipt/publication wrapper fingerprint——缺失/空/与 inner 不一致 ══
  {
    const rec = receipt('branch_W', 'r1');
    const pub = publication('branch_W', 'p1');
    const realRecFp = await idMod.sha256Fingerprint(rec);
    const realPubFp = await idMod.sha256Fingerprint(pub);
    const badWrappers = [
      ['projection:receipt:branch_W:r1', { receipt: rec }, 'receipt fingerprint 缺失'],
      ['projection:receipt:branch_W:r2', { receipt: rec, payloadFingerprint: '' }, 'receipt fingerprint 空'],
      ['projection:receipt:branch_W:r3', { receipt: rec, payloadFingerprint: 'sha256:wrong' }, 'receipt fingerprint 不一致'],
      ['projection:publication:branch_W:p1', { publication: pub }, 'publication fingerprint 缺失'],
      ['projection:publication:branch_W:p2', { publication: pub, payloadFingerprint: '' }, 'publication fingerprint 空'],
      ['projection:publication:branch_W:p3', { publication: pub, payloadFingerprint: 'sha256:wrong' }, 'publication fingerprint 不一致'],
    ];
    for (const [key, value, label] of badWrappers) {
      const recovered = await recoverWithRow(key, value);
      assert(recovered.readonlyMode === true, '场景3-' + label + ' 必须强制只读');
      assert(recovered.diagnostics.some((d) => d.includes('payloadFingerprint')), '场景3-' + label + ' 必须有 fingerprint 诊断，实际 ' + JSON.stringify(recovered.diagnostics));
    }
    // 合法对照：真实 fingerprint + key 与 row 的 receiptId/publicationId 一致。
    const okRecovered = await recoverWithRow('projection:receipt:branch_W:r1', { receipt: rec, payloadFingerprint: realRecFp });
    const okRecovered2 = await recoverWithRow('projection:publication:branch_W:p1', { publication: pub, payloadFingerprint: realPubFp });
    assert(okRecovered.knowledgeReceipts.length === 1 && okRecovered2.publications.length === 1, '场景3-真实 fingerprint 合法恢复（对照）');
    recordRejected('P0-3-fingerprint 完整性', '缺失/空/不一致 各自诊断 + 只读 + 真实指纹对照恢复', '真实指纹');
  }

  // ══ 场景 4：合法完整 wrapper -> 完整恢复（对照）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_W4', saveNodeId: 's', runtimeRevision: 0 });
    await coreStore.createBranchSeed({
      branchId: 'branch_W4', saveNodeId: 's', schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint,
      core, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o',
    }, shim1);
    const db = await coreStore.openRuntimeDb(shim1);
    const rec = receipt('branch_W4', 'r');
    const pub = publication('branch_W4', 'p');
    const rows = [
      ['projection:aggregate:branch_W4:agg', { aggregate: { runtimeBranchId: 'branch_W4', articleId: 'a', currentVersion: 1, versionIds: ['v1'], aggregateRevision: 1 }, aggregateKey: 'agg', versionIds: ['v1'], sourceLevelIdempotencyKeys: [{ key: 'k', payloadFingerprint: 'f' }] }],
      [adapterMod.projectionArticleVersionKey('branch_W4', 'a', 1), version('branch_W4', 'a', 'v1', 1)],
      ['projection:cursor:branch_W4:c', { cursor: cursor('branch_W4', 'c'), revision: 0 }],
      ['projection:receipt:branch_W4:r', { receipt: rec, payloadFingerprint: await idMod.sha256Fingerprint(rec) }],
      ['projection:publication:branch_W4:p', { publication: pub, payloadFingerprint: await idMod.sha256Fingerprint(pub) }],
    ];
    for (const [key, value] of rows) {
      await new Promise((res) => {
        const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
        const r = tx.objectStore(coreStore.PROJECTION_STORE).put(value, key);
        r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
      });
    }
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_W4');
    assert(recovered.newsArticles.length === 1 && recovered.articleVersions.length === 1 && recovered.observerReadCursors.length === 1 && recovered.knowledgeReceipts.length === 1 && recovered.publications.length === 1, '场景4-合法完整 wrapper 五类恢复');
    assert(recovered.diagnostics.length === 0, '场景4-合法行无诊断');
    recordPositive('P0-3-合法 wrapper 对照', '五类完整恢复 + 无诊断');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.6-wrapper-integrity regression passed.');
  console.log('positive checks: ' + positives.length);
  for (const r of positives) console.log('  + ' + r.name + ': ' + r.detail);
  console.log('tamper rejections: ' + rejections.length);
  for (const r of rejections) console.log('  - ' + r.name + ': rejected (' + r.errorMessage + ')');
  console.log('safety assertions: ' + safety.length);
  for (const r of safety) console.log('  = ' + r.name + ': ' + r.detail);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-g1.3.2.6-wrapper-integrity regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
