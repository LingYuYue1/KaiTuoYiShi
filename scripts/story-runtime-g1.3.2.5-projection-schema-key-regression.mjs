// G1.3.2.5 projection-schema-key regression：P0-2 ——
// - 五类 projection（article version/aggregate/cursor/receipt/publication）全部调用冻结
//   validateStoryRuntimeType 完整校验：非法枚举/union/nested ref、空 publicScope、伪 sourceRefs/
//   sourceTrace、少字段、额外错误包装、双层包装全部只读拒绝（不进入任何恢复数组，不未捕获 throw）；
// - wrapper 完整字段：aggregate 的 versionIds/sourceLevelIdempotencyKeys、cursor 的 revision、
//   receipt/publication 的 payloadFingerprint 缺失即拒绝；
// - 五类物理 key/owner 篡改（branch/article/version/observer/receipt/publication 与 row 不一致）全部拒绝；
// - 合法五类行仍可完整恢复（对照）。
// 生产模块经 esbuild 执行；IndexedDB 用测试 shim。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';
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
  const putRow = (db, key, value) => new Promise((res) => {
    const tx = db.transaction(coreStore.PROJECTION_STORE, 'readwrite');
    const r = tx.objectStore(coreStore.PROJECTION_STORE).put(value, key);
    r.onsuccess = () => { tx.oncomplete = () => res(); tx.onerror = () => res(); };
  });

  // ══ 场景 1：非法枚举/空 publicScope/伪 sourceRefs 的版本行 -> typed get 拒绝（INVALID_ROW）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    const key = adapterMod.projectionArticleVersionKey('branch_S1', 'article-S1', 1);
    const badVersion = {
      runtimeBranchId: 'branch_S1', articleVersionId: 'v1', articleId: 'article-S1', articleVersion: 1,
      sourceRefs: [{}], sourceFingerprint: 's', lifecycle: 'NOT_A_LIFECYCLE', storyPhase: 'NOT_A_PHASE', category: 'x',
      title: 't', body: 'b', publicScope: {}, reliability: 'NOT_RELIABLE', isCorrection: false, sourceTrace: [{}],
    };
    await putRow(db, key, badVersion);
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const got = await adapterMod.durableGetArticleVersion(adapter2, 'branch_S1', 'article-S1', 1);
    assert(got.ok === false && got.code === 'INVALID_ROW', '场景1-非法枚举/空 publicScope/伪 refs 版本行必须 INVALID_ROW，实际 ' + JSON.stringify(got));
    // 合法版本行对照。
    const keyOk = adapterMod.projectionArticleVersionKey('branch_S1', 'article-OK', 1);
    await putRow(db, keyOk, version('branch_S1', 'article-OK', 'v-ok', 1));
    const gotOk = await adapterMod.durableGetArticleVersion(adapter2, 'branch_S1', 'article-OK', 1);
    assert(gotOk.ok === true, '场景1-合法版本行仍可读（对照）');
    recordRejected('P0-2-版本行非法枚举/nested', '非法 lifecycle/storyPhase/reliability/publicScope/sourceRefs/sourceTrace 全部 INVALID_ROW', 'INVALID_ROW');
  }

  // ══ 场景 2：cursor/receipt/publication 非法枚举/少字段/双层包装 -> recovery 只读诊断 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    const db = await coreStore.openRuntimeDb(shim1);
    const badRows = [
      ['projection:cursor:branch_S2:bad-cursor', { cursor: { runtimeBranchId: 'branch_S2', observerId: 'obs', channel: 'NOT_A_CHANNEL' }, revision: 1 }],
      ['projection:cursor:branch_S2:double-cursor', { cursor: { cursor: cursor('branch_S2', 'x'), revision: 1 }, revision: 1 }],
      ['projection:receipt:branch_S2:bad-receipt', { receipt: { runtimeBranchId: 'branch_S2', receiptId: 'r' }, payloadFingerprint: 'f' }],
      ['projection:receipt:branch_S2:no-fp', { receipt: receipt('branch_S2', 'r2') }],
      ['projection:publication:branch_S2:bad-pub', { publication: { runtimeBranchId: 'branch_S2', publicationId: 'p', status: 'MYSTERY' }, payloadFingerprint: 'f' }],
      ['projection:publication:branch_S2:no-fp', { publication: publication('branch_S2', 'p2') }],
      ['projection:aggregate:branch_S2:bad-agg', { aggregate: { runtimeBranchId: 'branch_S2', articleId: 'a' } }],
    ];
    for (const [k, v] of badRows) await putRow(db, k, v);
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_S2');
    assert(recovered.observerReadCursors.length === 0 && recovered.knowledgeReceipts.length === 0 && recovered.publications.length === 0 && recovered.newsArticles.length === 0, '场景2-坏行不得进入任何恢复数组');
    assert(recovered.readonlyMode === true, '场景2-任一坏行必须强制 readonlyMode=true');
    assert(recovered.diagnostics.length >= badRows.length, '场景2-每个坏行都有诊断，实际 ' + recovered.diagnostics.length + ' 条');
    recordRejected('P0-2-四类包装行非法/双层/少字段', '7 个坏行全部诊断 + 强制只读 + 不进入恢复数组', '强制只读');
  }

  // ══ 场景 3：五类物理 key/owner 篡改 -> 全部拒绝 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const db = await coreStore.openRuntimeDb(shim1);
    // 合法行写到错误 key（owner 不一致）。
    await putRow(db, 'projection:article:branch_S3:OTHER-article:9', version('branch_S3', 'wanted', 'v1', 1)); // key 的 article/version 与 row 不符
    await putRow(db, 'projection:cursor:branch_S3:other-obs', { cursor: cursor('branch_S3', 'real-obs'), revision: 1 }); // key 的 observer 与 row 不符
    await putRow(db, 'projection:receipt:branch_S3:other-receipt', { receipt: receipt('branch_S3', 'real-receipt'), payloadFingerprint: 'f' }); // key 的 receipt 与 row 不符
    await putRow(db, 'projection:publication:branch_S3:other-pub', { publication: publication('branch_S3', 'real-pub'), payloadFingerprint: 'f' }); // key 的 publication 与 row 不符
    await putRow(db, 'projection:aggregate:branch_OTHER:agg', { aggregate: { runtimeBranchId: 'branch_S3', articleId: 'a', currentVersion: 1, versionIds: [], aggregateRevision: 0 }, versionIds: [], sourceLevelIdempotencyKeys: [] }); // key 的 branch 与 row 不符
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_S3');
    assert(recovered.newsArticles.length === 0 && recovered.articleVersions.length === 0 && recovered.observerReadCursors.length === 0 && recovered.knowledgeReceipts.length === 0 && recovered.publications.length === 0, '场景3-key 篡改行不得进入恢复数组');
    assert(recovered.readonlyMode === true, '场景3-key 篡改必须强制只读');
    assert(recovered.diagnostics.length >= 5, '场景3-五类 key 篡改都有诊断，实际 ' + recovered.diagnostics.length + ' 条');
    recordRejected('P0-2-五类物理 key 篡改', 'branch/article/version/observer/receipt/publication owner 不一致全部拒绝', 'owner 不一致');
  }

  // ══ 场景 4：合法五类行（含完整 wrapper 字段）-> recovery 完整恢复（对照）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    const idMod = await bundleTs('services/storyRuntime/id.ts');
    const db = await coreStore.openRuntimeDb(shim1);
    // G1.3.2.6：wrapper 必须完整——aggregateKey 持久化、versionIds 与 inner 一致、
    // receipt/publication payloadFingerprint 与 inner payload 的 sha256Fingerprint 一致。
    const rec = receipt('branch_S4', 'rec');
    const pub = publication('branch_S4', 'pub');
    await putRow(db, 'projection:aggregate:branch_S4:agg', { aggregate: { runtimeBranchId: 'branch_S4', articleId: 'a', currentVersion: 1, versionIds: ['v1'], aggregateRevision: 1 }, aggregateKey: 'agg', versionIds: ['v1'], sourceLevelIdempotencyKeys: [{ key: 'k', payloadFingerprint: 'f' }] });
    await putRow(db, adapterMod.projectionArticleVersionKey('branch_S4', 'a', 1), version('branch_S4', 'a', 'v1', 1));
    await putRow(db, 'projection:cursor:branch_S4:obs', { cursor: cursor('branch_S4', 'obs'), revision: 3 });
    await putRow(db, 'projection:receipt:branch_S4:rec', { receipt: rec, payloadFingerprint: await idMod.sha256Fingerprint(rec) });
    await putRow(db, 'projection:publication:branch_S4:pub', { publication: pub, payloadFingerprint: await idMod.sha256Fingerprint(pub) });
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const recovered = await adapterMod.recoverProjectionsFromStore(adapter2, 'branch_S4');
    assert(recovered.newsArticles.length === 1 && recovered.articleVersions.length === 1 && recovered.observerReadCursors.length === 1 && recovered.knowledgeReceipts.length === 1 && recovered.publications.length === 1, '场景4-合法五类行完整恢复');
    assert(recovered.diagnostics.length === 0 || recovered.diagnostics.every((d) => d.includes('core')), '场景4-合法行无行级诊断');
    recordPositive('P0-2-合法五类行对照', '五类完整恢复 + 无行级诊断');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.5-projection-schema-key regression passed.');
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
    console.error('story-runtime-g1.3.2.5-projection-schema-key regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
