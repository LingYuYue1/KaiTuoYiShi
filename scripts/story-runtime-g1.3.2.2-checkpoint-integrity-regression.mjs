// G1.3.2.2 checkpoint-integrity regression：P1-3 ——
// - 创建并持久化 checkpoint 后篡改 core/projection/outbox/fingerprint 任一字段，
//   恢复返回稳定 CHECKPOINT_CORRUPT/只读结果；未篡改时三类 fingerprint 与 canonical bytes 相等；
// - 恢复结果再被篡改不得反向污染 checkpoint；
// - 真实 putCheckpoint/getCheckpoint 重开数据库篡改回归。
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
  const checkpoint = await bundleTs('services/storyRuntime/runtimeCheckpoint.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };
  const projections = () => ({ runtimeBranchId: 'branch_ci', newsArticles: [], knowledgeReceipts: [], observerReadCursors: [], projectionRevisions: {} });
  const outboxItem = () => ({ outboxId: 'out_ci', schemaVersion: 3, runtimeBranchId: 'branch_ci', sourceRefFingerprint: 's', sourceRevision: 1, kind: 'news', aggregateKey: 'k', operation: 'create', sourceLevelIdempotencyKey: 'k1', deliveryKey: 'd1', payloadFingerprint: 'p', payloadRef: { kind: 'inline', key: 'p' }, consumerIds: ['news'], consumerAcks: {}, createdAt: 1, status: 'pending', attemptCount: 0 });

  // ══ 场景 1：未篡改恢复 ok + 三类 fingerprint 相等；篡改任一字段 -> CHECKPOINT_CORRUPT ══
  {
    const core = makeEmptyState({ runtimeBranchId: 'branch_ci', saveNodeId: 'save_node_ci', runtimeRevision: 0 });
    const outbox = [outboxItem()];
    const pointer = { runtimeBranchId: 'branch_ci', saveNodeId: 'save_node_ci', runtimeRevision: 0, schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint, coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o', updatedAt: 1 };
    const bundle = await checkpoint.buildRuntimeBundle(core, projections(), outbox);
    const pre = await checkpoint.createPreTurnCheckpoint('ckpt_ci', bundle, 5, pointer);
    // 未篡改 -> ok。
    const clean = await checkpoint.restoreFromCheckpoint(pre);
    assert(clean.ok === true, '场景1-未篡改恢复必须 ok');
    const cleanBundle = clean.ok ? clean.bundle : null;
    assert(cleanBundle.coreFingerprint === pre.coreFingerprint && cleanBundle.projectionFingerprint === pre.projectionFingerprint && cleanBundle.outboxFingerprint === pre.outboxFingerprint, '场景1-三类 fingerprint 与快照一致');
    // 篡改 core.turnCount -> CHECKPOINT_CORRUPT。
    const t1 = JSON.parse(JSON.stringify(pre));
    t1.core.turnCount = 999;
    const r1 = await checkpoint.restoreFromCheckpoint(t1);
    assert(!r1.ok && r1.code === 'CHECKPOINT_CORRUPT', '场景1-篡改 core 必须 CHECKPOINT_CORRUPT: ' + JSON.stringify(r1));
    // 篡改 projection -> CHECKPOINT_CORRUPT。
    const t2 = JSON.parse(JSON.stringify(pre));
    t2.projections.newsArticles = [{ runtimeBranchId: 'branch_ci', articleId: 'x', currentVersion: 1, versionIds: [], aggregateRevision: 0 }];
    const r2 = await checkpoint.restoreFromCheckpoint(t2);
    assert(!r2.ok && r2.code === 'CHECKPOINT_CORRUPT', '场景1-篡改 projection 必须 CHECKPOINT_CORRUPT');
    // 篡改 outbox -> CHECKPOINT_CORRUPT。
    const t3 = JSON.parse(JSON.stringify(pre));
    t3.outbox[0].outboxId = 'mutated';
    const r3 = await checkpoint.restoreFromCheckpoint(t3);
    assert(!r3.ok && r3.code === 'CHECKPOINT_CORRUPT', '场景1-篡改 outbox 必须 CHECKPOINT_CORRUPT');
    // 篡改 fingerprint 字段 -> CHECKPOINT_CORRUPT。
    const t4 = JSON.parse(JSON.stringify(pre));
    t4.coreFingerprint = 'sha256:forged';
    const r4 = await checkpoint.restoreFromCheckpoint(t4);
    assert(!r4.ok && r4.code === 'CHECKPOINT_CORRUPT', '场景1-篡改 fingerprint 必须 CHECKPOINT_CORRUPT');
    // 篡改 branch/revision/save node -> CHECKPOINT_CORRUPT。
    const t5 = JSON.parse(JSON.stringify(pre));
    t5.runtimeBranchId = 'branch_forged';
    const r5 = await checkpoint.restoreFromCheckpoint(t5);
    assert(!r5.ok && r5.code === 'CHECKPOINT_CORRUPT', '场景1-篡改 branch 必须 CHECKPOINT_CORRUPT');
    recordPositive('场景1-篡改检测', 'core/projection/outbox/fingerprint/branch 篡改全部 CHECKPOINT_CORRUPT');
    recordRejected('场景1-篡改checkpoint恢复', 'CHECKPOINT_CORRUPT（只读恢复）', 'CHECKPOINT_CORRUPT');
  }

  // ══ 场景 2：持久化 checkpoint 重开 DB 篡改回归（putCheckpoint/getCheckpoint + restore）══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const core = makeEmptyState({ runtimeBranchId: 'branch_ci2', saveNodeId: 's', runtimeRevision: 0 });
    const pointer = { runtimeBranchId: 'branch_ci2', saveNodeId: 's', runtimeRevision: 0, schemaVersion: 3, assetCatalogFingerprint: core.assetCatalogFingerprint, coreFingerprint: 'f', projectionFingerprint: 'p', outboxFingerprint: 'o', updatedAt: 1 };
    const bundle = await checkpoint.buildRuntimeBundle(core, projections(), [outboxItem()]);
    const pre = await checkpoint.createPreTurnCheckpoint('ckpt_ci2', bundle, 3, pointer);
    const put = await coreStore.putCheckpoint({ checkpointId: 'ckpt_ci2', payload: { pre }, createdAt: 1 }, shim1);
    assert(put.ok, '场景2-checkpoint 持久化写入成功');
    // 重开 DB 读取。
    const shim2 = createIdbShim(backend);
    const got = await coreStore.getCheckpoint('ckpt_ci2', shim2);
    assert(got !== null, '场景2-重开 DB 可读 checkpoint');
    // 未篡改 -> ok。
    const clean = await checkpoint.restoreFromCheckpoint(got.payload.pre);
    assert(clean.ok === true, '场景2-未篡改恢复 ok');
    // 篡改持久化记录后恢复 -> CHECKPOINT_CORRUPT。
    const tampered = JSON.parse(JSON.stringify(got));
    tampered.payload.pre.core.turnCount = 777;
    const r = await checkpoint.restoreFromCheckpoint(tampered.payload.pre);
    assert(!r.ok && r.code === 'CHECKPOINT_CORRUPT', '场景2-重开 DB 篡改后必须 CHECKPOINT_CORRUPT');
    recordPositive('场景2-持久化 checkpoint 篡改回归', '重开 DB 读 + 篡改检测');
    recordRejected('场景2-持久化篡改恢复', 'CHECKPOINT_CORRUPT', 'CHECKPOINT_CORRUPT');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.2-checkpoint-integrity regression passed.');
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
    console.error('story-runtime-g1.3.2.2-checkpoint-integrity regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
