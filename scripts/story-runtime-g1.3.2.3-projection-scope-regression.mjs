// G1.3.2.3 projection-scope regression：P1-1 ——
// - ProjectionDurableAdapter.runTransaction/readAll/readOne 固定到 runtimeProjections：
//   对任何非 projection store（runtimeCore/runtimePointer/runtimeOutbox/runtimeCheckpoints/runtimeMigrationJournal）
//   稳定抛出 INVALID_COMMAND 拒绝，不发起任何事务、零副作用；
// - durableListProjections 覆盖五类行（aggregate/article version/cursor/receipt/publication）并按 branch 过滤；
// - durableGetArticleVersion/durableListArticleVersions 只返回指定 branch 的版本行（防串档）。
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
  const projection = await bundleTs('services/storyRuntime/projectionStore.ts');
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
  const outboxItem = (outboxId, branchId) => ({
    outboxId, schemaVersion: 3, runtimeBranchId: branchId, sourceRefFingerprint: 's', sourceRevision: 1,
    kind: 'news', aggregateKey: 'unit:x', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1',
    payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0,
  });
  const aggregate = (branchId, articleId) => ({ runtimeBranchId: branchId, articleId, currentVersion: 1, versionIds: [], aggregateRevision: 0 });
  const version = (branchId, articleId, vid, vno) => ({
    runtimeBranchId: branchId, articleVersionId: vid, articleId, articleVersion: vno,
    sourceRefs: [], sourceFingerprint: 's', lifecycle: 'queued', storyPhase: 'ongoing', category: 'x',
    title: 't', body: 'b', publicScope: { kind: 'public' }, reliability: 'supported', isCorrection: false, sourceTrace: [],
  });

  // ══ 场景 1：非 projection store 越界访问全部稳定拒绝（INVALID_COMMAND），不发起事务、零副作用 ══
  {
    const backend = createSharedIdbBackend();
    const shim = createIdbShim(backend);
    await coreStore.openRuntimeDb(shim); // 建 DB（含全部 store）
    const adapter = new adapterMod.ProjectionDurableAdapter(shim);
    const attempts = [
      ['runTransaction(CORE_STORE)', () => adapter.runTransaction(coreStore.CORE_STORE, async () => 'x')],
      ['runTransaction(POINTER_STORE)', () => adapter.runTransaction(coreStore.POINTER_STORE, async () => 'x')],
      ['runTransaction(OUTBOX_STORE)', () => adapter.runTransaction(coreStore.OUTBOX_STORE, async () => 'x')],
      ['readAll(CORE_STORE)', () => adapter.readAll(coreStore.CORE_STORE)],
      ['readAll(POINTER_STORE)', () => adapter.readAll(coreStore.POINTER_STORE)],
      ['readOne(CORE_STORE, key)', () => adapter.readOne(coreStore.CORE_STORE, 'branch_X')],
      ['readOne(MIGRATION_STORE, key)', () => adapter.readOne(coreStore.MIGRATION_STORE, 'fp')],
      ['readOne(CHECKPOINT_STORE, key)', () => adapter.readOne(coreStore.CHECKPOINT_STORE, 'ck')],
    ];
    for (const [name, fn] of attempts) {
      let threw = null;
      try { await fn(); } catch (error) { threw = error; }
      assert(threw !== null && String(threw.message).includes('INVALID_COMMAND'), name + ' 必须稳定抛出 INVALID_COMMAND，实际 ' + (threw ? threw.message : '未抛错'));
    }
    // 零副作用：core store 未被写入/读取（无数据变化）。
    const coreRow = await coreStore.readCoreState('branch_X', shim);
    assert(coreRow === null, '场景1-越界访问后 core store 无写入（branch_X 不存在）');
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const rows = await adapter2.readAll(coreStore.PROJECTION_STORE);
    assert(rows.length === 0, '场景1-越界访问后 projection store 无副作用');
    recordRejected('P1-1-非 projection store 越界', '8 组越界访问全部 INVALID_COMMAND + 零副作用', 'INVALID_COMMAND');
  }

  // ══ 场景 2：五类 projection 行完整读取 + branch 过滤 + typed version 防串档 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const adapter1 = new adapterMod.ProjectionDurableAdapter(shim1);
    // branch_A：aggregate + article version + cursor + receipt + publication（5 类行）。
    const w1 = await projection.consumeNewsOutbox(adapter1, outboxItem('oA', 'branch_A'), aggregate('branch_A', 'article-A'), version('branch_A', 'article-A', 'vA', 1));
    assert(w1.ok, '场景2-写 branch_A 文章');
    await projection.writeObserverCursor(adapter1, { runtimeBranchId: 'branch_A', observerId: 'player_ui', channel: 'player_ui' }, 0);
    await projection.writeKnowledgeReceipt(adapter1, { runtimeBranchId: 'branch_A', receiptId: 'receipt_A', subjectType: 'npc', subjectId: 'n', subjectRef: { kind: 'committed_fact', factId: 'sha256:f', sourceRevision: 1 }, knowledgeKind: 'fact', claimReliability: 'confirmed', channel: 'dialogue', observedAt: { dayOrdinal: 1, minuteOfDay: 0 }, deliveryEvidenceRef: { kind: 'narrative_span', responseId: 'r', bodyFingerprint: 'sha256:b', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'sha256:t' }, confidence: 'confirmed', idempotencyKey: 'ik' });
    const pubA = { publicationId: 'pub_A', runtimeBranchId: 'branch_A', turnId: 't1', sourceRuntimeRevision: 1, commitReceiptId: 'rc', body: 'b', bodyFingerprint: 'sha256:bf', status: 'revealed', revealAttemptCount: 0, createdAt: { dayOrdinal: 1, minuteOfDay: 0 } };
    await adapterMod.durablePutPublication(adapter1, pubA);
    // branch_B：cursor 一条（用于过滤对照）。
    await projection.writeObserverCursor(adapter1, { runtimeBranchId: 'branch_B', observerId: 'player_ui', channel: 'player_ui' }, 0);
    // 重开 DB 读取。
    const shim2 = createIdbShim(backend);
    const adapter2 = new adapterMod.ProjectionDurableAdapter(shim2);
    const listA = await adapterMod.durableListProjections(adapter2, 'branch_A');
    assert(listA.ok === true && listA.values.length === 5, '场景2-branch_A 五类行全部列出（aggregate/version/cursor/receipt/publication），实际 ' + JSON.stringify(listA.values.length));
    const listB = await adapterMod.durableListProjections(adapter2, 'branch_B');
    assert(listB.ok === true && listB.values.length === 1, '场景2-branch 过滤：branch_B 只有自己的 1 条 cursor，实际 ' + JSON.stringify(listB.values.length));
    // typed version 防串档：跨 branch 读取返回稳定 MISSING/KEY_MISMATCH 结果（G1.3.2.4：DurableRowResult）。
    const cross = await adapterMod.durableGetArticleVersion(adapter2, 'branch_B', 'article-A', 1);
    assert(cross.ok === false, '场景2-typed get 跨 branch 必须拒绝（防串档），实际 ' + JSON.stringify(cross));
    const versionsA = await adapterMod.durableListArticleVersions(adapter2, 'branch_A');
    assert(versionsA.ok === true && versionsA.values.length === 1 && versionsA.values[0].articleVersionId === 'vA', '场景2-typed list 只返回 branch_A 版本行');
    const versionsB = await adapterMod.durableListArticleVersions(adapter2, 'branch_B');
    assert(versionsB.ok === true && versionsB.values.length === 0, '场景2-typed list 跨 branch 过滤为 0');
    recordPositive('P1-1-五类行 branch 过滤', 'branch_A 5 行 / branch_B 1 行 + typed version 防串档');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.3-projection-scope regression passed.');
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
    console.error('story-runtime-g1.3.2.3-projection-scope regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
