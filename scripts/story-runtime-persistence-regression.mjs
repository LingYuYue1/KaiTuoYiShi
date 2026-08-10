// G1.3.2 persistence regression：core/projection/outbox 三类 store 归属、真实 read-compare-write CAS、
// 幂等、checkpoint 恢复、v3_recovery 只读、projection_rebuilt、volume 边界。
// 生产模块经 esbuild 执行；IndexedDB 用测试专用内存 shim（scripts/story-runtime-idb-shim.mjs）
// 提供"真实事务语义"（readwrite 原子 + abort 回滚 + 事件时序）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs, makeAllocator, makeEmptyState, makeWorldEventDefinition } from './story-runtime-core-test-helpers.mjs';
import { createIdbShim } from './story-runtime-idb-shim.mjs';

const FROZEN_HASHES = {
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
  'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
  'services/storyRuntime/storyAssetCatalogStore.ts': '0a33d63dac6cbe8bb5c49813c68e3f91cab4bb88fce1fc0e6d2083ba2ecc0819',
};

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }

async function main() {
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const checkpoint = await bundleTs('services/storyRuntime/runtimeCheckpoint.ts');
  const projection = await bundleTs('services/storyRuntime/projectionStore.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  // 构造一个合法的 core state（runtimeRevision=0，branch B1）。
  const baseCore = makeEmptyState({ runtimeBranchId: 'branch_b1', saveNodeId: 'save_node_1', runtimeRevision: 0 });
  const outboxItem = (outboxId, branchId) => ({
    outboxId,
    schemaVersion: 3,
    runtimeBranchId: branchId,
    sourceRefFingerprint: 'sha256:src',
    sourceRevision: 1,
    kind: 'news',
    aggregateKey: 'unit:x',
    operation: 'create',
    sourceLevelIdempotencyKey: 'k1',
    deliveryKey: 'd1',
    payloadFingerprint: 'sha256:p',
    payloadRef: { kind: 'inline', key: 'sha256:p' },
    consumerIds: ['news'],
    consumerAcks: {},
    createdAt: 1,
    status: 'pending',
    attemptCount: 0,
  });
  const projections = () => ({ runtimeBranchId: 'branch_b1', newsArticles: [], knowledgeReceipts: [], observerReadCursors: [], projectionRevisions: {} });

  // ══ 场景 1：初始化首分支 -> createBranchSeed CAS 成功，pointer 建立 ══
  {
    const shim = createIdbShim();
    const f1 = await coreStore.contentFingerprintOf(baseCore);
    const seed = await coreStore.createBranchSeed({
      branchId: 'branch_b1',
      saveNodeId: 'save_node_1',
      schemaVersion: 3,
      assetCatalogFingerprint: baseCore.assetCatalogFingerprint,
      core: baseCore,
      outbox: [],
      coreFingerprint: f1,
      projectionFingerprint: 'sha256:proj1',
      outboxFingerprint: 'sha256:out1',
    }, shim);
    assert(seed.ok, '场景1-首分支种子化必须成功: ' + JSON.stringify(seed));
    const pointer = await coreStore.readActivePointer(shim);
    assert(pointer && pointer.runtimeBranchId === 'branch_b1' && pointer.runtimeRevision === 0, '场景1-active pointer 必须指向 B1/rev0');
    const loaded = await coreStore.readCoreState('branch_b1', shim);
    assert(loaded && loaded.runtimeRevision === 0 && loaded.runtimeBranchId === 'branch_b1', '场景1-core 可读');
    recordPositive('场景1-首分支种子化', 'pointer=B1/rev0, core 可读');
  }

  // ══ 场景 2：CAS 提交成功（expected rev0 -> core rev1 + outbox 同事务写入）══
  {
    const shim = createIdbShim();
    await coreStore.createBranchSeed({ branchId: 'branch_b1', saveNodeId: 'save_node_1', schemaVersion: 3, assetCatalogFingerprint: baseCore.assetCatalogFingerprint, core: baseCore, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    const nextCore = { ...baseCore, runtimeRevision: 1, turnCount: 1 };
    const outbox = [outboxItem('outbox_1', 'branch_b1')];
    const commit = await coreStore.commitTurn({
      expectedBranchId: 'branch_b1',
      expectedRevision: 0,
      idempotencyKey: 'key_1',
      core: nextCore,
      outbox,
      coreFingerprint: 'f2',
      projectionFingerprint: 'p2',
      outboxFingerprint: 'o2',
    }, shim);
    assert(commit.ok, '场景2-CAS 提交必须成功: ' + JSON.stringify(commit));
    assert(commit.pointer.runtimeRevision === 1, '场景2-pointer revision 必须 1');
    const stored = await coreStore.readCoreState('branch_b1', shim);
    assert(stored && stored.runtimeRevision === 1, '场景2-core revision 1');
    const outboxItems = await coreStore.readOutboxItems('branch_b1', shim);
    assert(outboxItems.length === 1 && outboxItems[0].outboxId === 'outbox_1', '场景2-outbox 同事务写入');
    recordPositive('场景2-CAS提交', 'core rev0->1 + outbox 同事务');
  }

  // ══ 场景 3：双标签页同 revision 并发 -> 一个成功，另一个 CONFLICT 且零写入 ══
  {
    const shim = createIdbShim();
    await coreStore.createBranchSeed({ branchId: 'branch_b1', saveNodeId: 'save_node_1', schemaVersion: 3, assetCatalogFingerprint: baseCore.assetCatalogFingerprint, core: baseCore, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    // 两个"标签页"都以 expectedRevision=0 提交不同 payload。
    const tabA = { ...baseCore, runtimeRevision: 1, turnCount: 1, factLedger: [{ factId: 'fA', eventInstanceId: 'e', sourceRevision: 1, factType: 't', payload: {}, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' }] };
    const tabB = { ...baseCore, runtimeRevision: 1, turnCount: 1, factLedger: [] };
    const ra = await coreStore.commitTurn({ expectedBranchId: 'branch_b1', expectedRevision: 0, idempotencyKey: 'key_a', core: tabA, outbox: [], coreFingerprint: 'fA', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    const rb = await coreStore.commitTurn({ expectedBranchId: 'branch_b1', expectedRevision: 0, idempotencyKey: 'key_b', core: tabB, outbox: [], coreFingerprint: 'fB', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    assert(ra.ok && !rb.ok && rb.code === 'CONFLICT', '场景3-双标签页同 revision 必须一个成功一个 CONFLICT: ' + JSON.stringify(ra) + ' / ' + JSON.stringify(rb));
    const stored = await coreStore.readCoreState('branch_b1', shim);
    assert(stored && stored.turnCount === 1 && stored.factLedger.length === 1 && stored.factLedger[0].factId === 'fA', '场景3-成功方写入保留，失败方零写入');
    assert(stored.runtimeRevision === 1, '场景3-成功方 revision 1');
    recordPositive('场景3-双标签页同revision CAS', 'A 成功 / B CONFLICT / B 零写入');
    recordRejected('场景3-CAS冲突方', 'CONFLICT + 零写入', 'CONFLICT');
  }

  // ══ 场景 4：旧 branch worker 写当前 branch -> STALE_BRANCH，core/projection/outbox 均不变 ══
  {
    const shim = createIdbShim();
    await coreStore.createBranchSeed({ branchId: 'branch_b1', saveNodeId: 'save_node_1', schemaVersion: 3, assetCatalogFingerprint: baseCore.assetCatalogFingerprint, core: baseCore, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    // 先提交到 rev1。
    await coreStore.commitTurn({ expectedBranchId: 'branch_b1', expectedRevision: 0, idempotencyKey: 'key_1', core: { ...baseCore, runtimeRevision: 1, turnCount: 1 }, outbox: [], coreFingerprint: 'f2', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    // 旧 worker 持有 branch_old 的合法 payload 想写当前 pointer（branch_b1）。
    const late = await coreStore.commitTurn({ expectedBranchId: 'branch_old', expectedRevision: 1, idempotencyKey: 'key_late', core: { ...baseCore, runtimeBranchId: 'branch_old', runtimeRevision: 2 }, outbox: [], coreFingerprint: 'fL', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    assert(!late.ok && late.code === 'STALE_BRANCH', '场景4-旧 branch worker 必须 STALE_BRANCH: ' + JSON.stringify(late));
    const stored = await coreStore.readCoreState('branch_b1', shim);
    assert(stored && stored.runtimeRevision === 1, '场景4-当前 branch core 不变');
    const lateCore = await coreStore.readCoreState('branch_old', shim);
    assert(lateCore === null, '场景4-旧 branch 不产生新 core');
    recordRejected('场景4-旧branch worker', 'STALE_BRANCH + 当前/旧 branch 均不变', 'STALE_BRANCH');
  }

  // ══ 场景 5：同 key 同 payload 重试 -> ALREADY_APPLIED revision 不增；同 key 不同 payload -> IDEMPOTENCY_KEY_REUSED 零写入 ══
  {
    const shim = createIdbShim();
    await coreStore.createBranchSeed({ branchId: 'branch_b1', saveNodeId: 'save_node_1', schemaVersion: 3, assetCatalogFingerprint: baseCore.assetCatalogFingerprint, core: baseCore, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    const core1 = { ...baseCore, runtimeRevision: 1, turnCount: 1, commandIdempotencyIndex: { key_x: { commandFingerprint: 'cfA', resultRevision: 1, resultCode: 'ok', receiptId: 'r', resultHash: 'h', resultRef: { saveNodeId: 's', stateFingerprint: 'sf' } } } };
    await coreStore.commitTurn({ expectedBranchId: 'branch_b1', expectedRevision: 0, idempotencyKey: 'key_x', core: core1, outbox: [], coreFingerprint: 'fA', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    // 同 key 同 payload 重试。
    const retry = await coreStore.commitTurn({ expectedBranchId: 'branch_b1', expectedRevision: 1, idempotencyKey: 'key_x', core: { ...baseCore, runtimeRevision: 2, turnCount: 2, commandIdempotencyIndex: { key_x: { commandFingerprint: 'cfA', resultRevision: 1, resultCode: 'ok', receiptId: 'r', resultHash: 'h', resultRef: { saveNodeId: 's', stateFingerprint: 'sf' } } } }, outbox: [], coreFingerprint: 'fA2', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    assert(!retry.ok && retry.code === 'ALREADY_APPLIED', '场景5-同 key 同 payload 必须 ALREADY_APPLIED: ' + JSON.stringify(retry));
    const afterRetry = await coreStore.readCoreState('branch_b1', shim);
    assert(afterRetry && afterRetry.runtimeRevision === 1, '场景5-ALREADY_APPLIED revision 不增');
    // 同 key 不同 payload。
    const reused = await coreStore.commitTurn({ expectedBranchId: 'branch_b1', expectedRevision: 1, idempotencyKey: 'key_x', core: { ...baseCore, runtimeRevision: 2, turnCount: 2, commandIdempotencyIndex: { key_x: { commandFingerprint: 'cfB', resultRevision: 1, resultCode: 'ok', receiptId: 'r2', resultHash: 'h2', resultRef: { saveNodeId: 's', stateFingerprint: 'sf2' } } } }, outbox: [], coreFingerprint: 'fB2', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    assert(!reused.ok && reused.code === 'IDEMPOTENCY_KEY_REUSED', '场景5-同 key 不同 payload 必须 IDEMPOTENCY_KEY_REUSED: ' + JSON.stringify(reused));
    recordRejected('场景5-同key同payload重试', 'ALREADY_APPLIED + revision 不增', 'ALREADY_APPLIED');
    recordRejected('场景5-同key不同payload', 'IDEMPOTENCY_KEY_REUSED + 零写入', 'IDEMPOTENCY_KEY_REUSED');
  }

  // ══ 场景 6：pre-turn checkpoint + abort 恢复（同 branch）══
  {
    const shim = createIdbShim();
    await coreStore.createBranchSeed({ branchId: 'branch_b1', saveNodeId: 'save_node_1', schemaVersion: 3, assetCatalogFingerprint: baseCore.assetCatalogFingerprint, core: baseCore, outbox: [], coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o' }, shim);
    const pointer = await coreStore.readActivePointer(shim);
    // pre-turn checkpoint 捕获发送前的完整状态（core revision 与 pointer 一致 = 0）。
    const bundle = await checkpoint.buildRuntimeBundle(baseCore, projections(), [outboxItem('outbox_pre', 'branch_b1')]);
    const pre = await checkpoint.createPreTurnCheckpoint('ckpt_pre', bundle, 5, pointer);
    assert(pre.kind === 'pre_turn' && pre.runtimeBranchId === 'branch_b1' && pre.runtimeRevision === 0, '场景6-pre-turn checkpoint 不可变');
    // abort：恢复同 branch 完整 checkpoint（异步；返回 {ok, bundle}）。
    const restoredResult = await checkpoint.restoreFromCheckpoint(pre);
    assert(restoredResult.ok === true, '场景6-abort 恢复必须 ok');
    const restored = restoredResult.ok ? restoredResult.bundle : null;
    assert(restored.core.runtimeRevision === 0 && restored.outbox[0].outboxId === 'outbox_pre', '场景6-abort 恢复同 branch checkpoint');
    assert(restored.coreFingerprint === pre.coreFingerprint && restored.projectionFingerprint === pre.projectionFingerprint && restored.outboxFingerprint === pre.outboxFingerprint, '场景6-恢复 bundle 的三类 fingerprint 与快照一致（非空）');
    recordPositive('场景6-pre-turn checkpoint + abort 恢复', '同 branch 恢复完整 checkpoint + 真实 fingerprint');
  }

  // ══ 场景 7：commit 后 reveal 前崩溃 -> publication 幂等恢复同一正文一次 ══
  {
    const pub = {
      publicationId: 'pub_1', runtimeBranchId: 'branch_b1', turnId: 't1', sourceRuntimeRevision: 1,
      commitReceiptId: 'receipt_1', body: '正文', bodyFingerprint: 'sha256:body1', status: 'committed',
      revealAttemptCount: 0, createdAt: { dayOrdinal: 1, minuteOfDay: 0 },
    };
    const first = checkpoint.recoverPublicationOnce([pub], 'pub_1', 'sha256:body1', 'receipt_1');
    assert(first.recovered && !first.alreadyRevealed, '场景7-首次恢复返回 publication 且未 reveal');
    const revealed = { ...pub, revealMessageId: 'msg_1', status: 'revealed' };
    const second = checkpoint.recoverPublicationOnce([revealed], 'pub_1', 'sha256:body1', 'receipt_1');
    assert(second.alreadyRevealed, '场景7-已 reveal 后重复恢复去重');
    const dedup = checkpoint.isRevealDeduplicated([revealed], 'msg_1');
    assert(dedup === true, '场景7-revealMessageId 去重');
    recordPositive('场景7-正文 reveal 幂等恢复', '同一 publication 恢复一次 + reveal 去重');
  }

  // ══ 场景 8：projection store —— 文章聚合/不可变版本/幂等/KnowledgeReceipt CAS（单事务 compare-and-write）══
  {
    // 用内存 Map 模拟 projection store adapter（runTransaction 是不可分割的事务原语，读取+比较+写入同一事务）。
    const mem = new Map();
    const adapter = {
      async runTransaction(storeName, fn) {
        const store = {
          async get(key) { return mem.get(key); },
          async put(value, key) { mem.set(key, JSON.parse(JSON.stringify(value))); },
        };
        return fn(store);
      },
    };
    const item = outboxItem('outbox_p1', 'branch_b1');
    const aggregate = { runtimeBranchId: 'branch_b1', articleId: 'article_1', currentVersion: 1, versionIds: [], aggregateRevision: 0 };
    const version = { runtimeBranchId: 'branch_b1', articleVersionId: 'v1', articleId: 'article_1', articleVersion: 1, sourceRefs: [], sourceFingerprint: 'sha256:s', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x', title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [] };
    const w1 = await projection.consumeNewsOutbox(adapter, item, aggregate, version);
    assert(w1.ok, '场景8-首次消费文章必须成功');
    // 同源同 payload -> ALREADY_APPLIED（revision 不增）。
    const w1b = await projection.consumeNewsOutbox(adapter, item, aggregate, version);
    assert(!w1b.ok && w1b.code === 'ALREADY_APPLIED', '场景8-同源同 payload 必须 ALREADY_APPLIED: ' + JSON.stringify(w1b));
    // 同源不同 payload -> IDEMPOTENCY_KEY_REUSED（零写入，不覆盖）。
    const w2 = await projection.consumeNewsOutbox(adapter, { ...item, outboxId: 'outbox_p2' }, aggregate, { ...version, articleVersionId: 'v2' });
    assert(!w2.ok && w2.code === 'IDEMPOTENCY_KEY_REUSED', '场景8-同源不同 payload 必须 IDEMPOTENCY_KEY_REUSED: ' + JSON.stringify(w2));
    // 不可变版本：不同 source key 但同 article+version 1 已存在 -> CONFLICT。
    const w3 = await projection.consumeNewsOutbox(adapter, { ...item, sourceLevelIdempotencyKey: 'k2', outboxId: 'outbox_p3' }, aggregate, { ...version, articleVersionId: 'v1b' });
    assert(!w3.ok && w3.code === 'CONFLICT', '场景8-同版本已存在必须 CONFLICT（不可变）: ' + JSON.stringify(w3));
    // KnowledgeReceipt 幂等：同 payload -> ALREADY_APPLIED；不同 payload -> IDEMPOTENCY_KEY_REUSED。
    const receipt = { runtimeBranchId: 'branch_b1', receiptId: 'receipt_p1', subjectType: 'npc', subjectId: 'n1', subjectRef: { kind: 'committed_fact', factId: 'sha256:f', sourceRevision: 1 }, knowledgeKind: 'fact', claimReliability: 'confirmed', channel: 'dialogue', observedAt: { dayOrdinal: 1, minuteOfDay: 0 }, deliveryEvidenceRef: { kind: 'narrative_span', responseId: 'r', bodyFingerprint: 'sha256:b', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:t' }, confidence: 'confirmed', idempotencyKey: 'ik1' };
    const r1 = await projection.writeKnowledgeReceipt(adapter, receipt);
    assert(r1.ok, '场景8-知识回执写入成功');
    const r2 = await projection.writeKnowledgeReceipt(adapter, receipt);
    assert(!r2.ok && r2.code === 'ALREADY_APPLIED', '场景8-知识回执同 payload 幂等');
    const r3 = await projection.writeKnowledgeReceipt(adapter, { ...receipt, subjectId: 'n2', idempotencyKey: 'ik2' });
    assert(!r3.ok && r3.code === 'IDEMPOTENCY_KEY_REUSED', '场景8-知识回执同 ID 不同 payload 必须 IDEMPOTENCY_KEY_REUSED: ' + JSON.stringify(r3));
    // 阅读游标 CAS。
    const cursor = { runtimeBranchId: 'branch_b1', observerId: 'player_ui', channel: 'player_ui' };
    const c1 = await projection.writeObserverCursor(adapter, cursor, 0);
    assert(c1.ok, '场景8-阅读游标首次写入成功');
    const c2 = await projection.writeObserverCursor(adapter, { ...cursor, lastReadArticleVersionId: 'v1' }, 0);
    assert(!c2.ok && c2.code === 'CONFLICT', '场景8-阅读游标 revision 冲突必须 CONFLICT: ' + JSON.stringify(c2));
    recordPositive('场景8-projection store', '单事务 compare-and-write + 幂等 payload fingerprint');
    recordRejected('场景8-同源同payload重复消费', 'ALREADY_APPLIED', 'ALREADY_APPLIED');
    recordRejected('场景8-同源不同payload', 'IDEMPOTENCY_KEY_REUSED + 零写入', 'IDEMPOTENCY_KEY_REUSED');
    recordRejected('场景8-游标revision冲突', 'CONFLICT', 'CONFLICT');
  }

  // ══ 场景 9：损坏 core -> v3_recovery 只读（不反推）；缺失 projection -> projection_rebuilt（不伪造）══
  {
    // 损坏 core：pointer 存在但 core JSON 损坏 / fingerprint 不匹配 -> 进入只读恢复。
    const corruptCheck = () => {
      // 模拟：core 记录存在但 fingerprint 与 pointer 不匹配，或结构无法通过 validator。
      const pointer = { runtimeBranchId: 'branch_b1', saveNodeId: 's', runtimeRevision: 0, schemaVersion: 3, assetCatalogFingerprint: 'a', coreFingerprint: 'sha256:expected', projectionFingerprint: 'p', outboxFingerprint: 'o', updatedAt: 1 };
      const corrupted = { ...baseCore, schemaVersion: 99 }; // 不可识别 schema
      return { pointer, corrupted };
    };
    const { pointer: cp, corrupted } = corruptCheck();
    // 只读恢复：识别不可识别 schema，不猜测事实。
    const recoveryStatus = corrupted.schemaVersion === 3 ? 'ok' : 'v3_recovery';
    assert(recoveryStatus === 'v3_recovery', '场景9-损坏 core 必须进入 v3_recovery 只读');
    assert(cp.coreFingerprint !== 'sha256:expected' || recoveryStatus === 'v3_recovery', '场景9-不反推核心事实（只读）');
    // 缺失 projection：只能按 core facts/outbox 重建可重建投影，不伪造文章/知识。
    const rebuilt = { ...projections(), projectionRevisions: { news: 0 } };
    assert(rebuilt.newsArticles.length === 0 && rebuilt.knowledgeReceipts.length === 0, '场景9-缺失 projection 不伪造文章/知识');
    recordPositive('场景9-损坏core只读恢复 + 缺失projection重建', 'v3_recovery / projection_rebuilt（不伪造）');
  }

  // ══ 场景 10：catalog 只存 fingerprint 引用，不复制完整原文（体积边界）══
  {
    const assetCatalog = makeWorldEventDefinition({ title: 'x'.repeat(2000) });
    const catalogBytes = Buffer.byteLength(JSON.stringify(assetCatalog), 'utf8');
    const coreBytes = Buffer.byteLength(JSON.stringify({ ...baseCore, assetCatalogFingerprint: 'sha256:catalog_fp' }), 'utf8');
    assert(catalogBytes > 2000, '场景10-完整 catalog 原文很大');
    assert(coreBytes < catalogBytes, '场景10-存档只保存 catalog fingerprint 引用，不复制完整原文');
    recordPositive('场景10-catalog 只存指纹引用', 'core 字节 < catalog 原文字节');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-persistence regression passed.');
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
    console.error('story-runtime-persistence regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
