// G1.3.2.2 migration-journal-candidate regression：P1-4/P1-5 ——
// - P1-4：重复候选（missing_explicit.candidates 含重复 ID）保持 pending_confirmation；
//   候选为空、未知/空白/任意字符串确认都不推进；唯一精确候选才迁移；
//   直接篡改 MigrationReport.cursorConflicts 的回归（不只用正常构造路径）；
// - P1-5：migration journal compare-and-write——同 sourceFingerprint 同 canonical report 幂等
//   （ALREADY_APPLIED，首份 bytes 保留）；不同 payload -> IDEMPOTENCY_KEY_REUSED 零写入；重开 DB 保留首份。
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
  const migrations = await bundleTs('services/storyRuntime/migrations.ts');
  const coreStore = await bundleTs('services/storyRuntime/coreRuntimeStore.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };
  const baseReport = (overrides = {}) => ({
    sourceFingerprint: 'sha256:src',
    rawFieldPaths: [],
    rawPayloadPreserved: true,
    status: 'pending_confirmation',
    legacyIdMap: {},
    cursorConflicts: [],
    warnings: [],
    createdAt: 1,
    ...overrides,
  });

  // ══ P1-4 场景 1：重复候选（篡改 report 的 cursorConflicts）-> 保持 pending_confirmation ══
  {
    // 直接篡改持久化报告：missing_explicit.candidates 含重复 ID。
    const report = baseReport({ cursorConflicts: [{ kind: 'missing_explicit', candidates: ['seg_a', 'seg_a'] }] });
    const dup = migrations.explicitConfirmation(report, { selectedSegmentId: 'seg_a' });
    assert(dup.status === 'pending_confirmation', 'P1-4-重复候选必须保持 pending_confirmation（不得用去重代替确认）');
    recordRejected('P1-4-重复候选确认', 'pending_confirmation（重复来源保持歧义）', 'pending_confirmation');
  }
  // ══ P1-4 场景 2：唯一精确候选才迁移；候选为空/未知/空白不推进 ══
  {
    const report = baseReport({ cursorConflicts: [{ kind: 'missing_explicit', candidates: ['seg_b'] }] });
    const ok = migrations.explicitConfirmation(report, { selectedSegmentId: 'seg_b' });
    assert(ok.status === 'migrated', 'P1-4-唯一精确候选确认后迁移');
    const unknown = migrations.explicitConfirmation(report, { selectedSegmentId: 'seg_zzz' });
    assert(unknown.status === 'pending_confirmation', 'P1-4-未知 ID 不推进');
    const blank = migrations.explicitConfirmation(report, { selectedSegmentId: '   ' });
    assert(blank.status === 'pending_confirmation', 'P1-4-空白不推进');
    const empty = baseReport({ cursorConflicts: [{ kind: 'missing_explicit', candidates: [] }] });
    const emptyConfirm = migrations.explicitConfirmation(empty, { selectedSegmentId: 'x' });
    assert(emptyConfirm.status === 'pending_confirmation', 'P1-4-候选为空不推进');
    recordPositive('P1-4-唯一候选迁移', '精确 ID 迁移，未知/空白/空候选只读');
    recordRejected('P1-4-未知/空白/空候选', 'pending_confirmation', 'pending_confirmation');
  }
  // ══ P1-4 场景 3：id_mismatch + group_mismatch 组合仍正确（唯一显式 ID 可确认）══
  {
    const report = baseReport({ cursorConflicts: [{ kind: 'id_mismatch', explicitSegmentId: 'seg_a', runtimeSegmentId: 'seg_b', seriesGroup: 3, systemGroup: 5 }], legacyIdMap: { currentSegmentId: 'seg_a' } });
    const ok = migrations.explicitConfirmation(report, { selectedSegmentId: 'seg_a' });
    assert(ok.status === 'migrated', 'P1-4-id_mismatch 唯一显式 ID 可确认');
    recordPositive('P1-4-id_mismatch 唯一确认', 'seg_a migrated');
  }

  // ══ P1-5 场景 4：journal 同 payload 幂等（ALREADY_APPLIED，首份 bytes 保留）══
  {
    const shim = createIdbShim();
    const first = { sourceFingerprint: 'sha256:mig1', report: { status: 'migrated', createdAt: 42 }, createdAt: 42 };
    const r1 = await coreStore.putMigrationJournal(first, shim);
    assert(r1.ok, 'P1-5-首次写入 journal 成功');
    // 同 payload 重试 -> ALREADY_APPLIED（不覆盖）。
    const r2 = await coreStore.putMigrationJournal({ ...first, createdAt: 99 }, shim);
    assert(!r2.ok && r2.code === 'ALREADY_APPLIED', 'P1-5-同 payload 必须 ALREADY_APPLIED: ' + JSON.stringify(r2));
    const got = await coreStore.getMigrationJournal('sha256:mig1', shim);
    assert(JSON.stringify(got.report) === JSON.stringify(first.report), 'P1-5-首份 bytes 保留（createdAt 不变）');
    recordPositive('P1-5-journal 同 payload 幂等', 'ALREADY_APPLIED + 首份 bytes 保留');
    recordRejected('P1-5-journal 同 payload', 'ALREADY_APPLIED', 'ALREADY_APPLIED');
  }
  // ══ P1-5 场景 5：journal 不同 payload -> IDEMPOTENCY_KEY_REUSED 零写入；重开 DB 保留首份 ══
  {
    const backend = createSharedIdbBackend();
    const shim1 = createIdbShim(backend);
    const first = { sourceFingerprint: 'sha256:mig2', report: { status: 'pending_confirmation', cursorConflicts: [{ kind: 'missing_explicit', candidates: ['a'] }] }, createdAt: 7 };
    const r1 = await coreStore.putMigrationJournal(first, shim1);
    assert(r1.ok, 'P1-5-首次写入成功');
    // 不同 payload -> 冲突零写入。
    const r2 = await coreStore.putMigrationJournal({ sourceFingerprint: 'sha256:mig2', report: { status: 'migrated', cursorConflicts: [] }, createdAt: 8 }, shim1);
    assert(!r2.ok && r2.code === 'IDEMPOTENCY_KEY_REUSED', 'P1-5-不同 payload 必须 IDEMPOTENCY_KEY_REUSED: ' + JSON.stringify(r2));
    // 重开 DB 保留首份。
    const shim2 = createIdbShim(backend);
    const got = await coreStore.getMigrationJournal('sha256:mig2', shim2);
    assert(got !== null && JSON.stringify(got.report) === JSON.stringify(first.report), 'P1-5-重开 DB 首份 journal 保留');
    recordPositive('P1-5-journal 不同 payload 冲突', 'IDEMPOTENCY_KEY_REUSED + 首份保留（重开 DB）');
    recordRejected('P1-5-journal 不同 payload 覆盖', 'IDEMPOTENCY_KEY_REUSED + 零写入', 'IDEMPOTENCY_KEY_REUSED');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.2-migration-journal-candidate regression passed.');
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
    console.error('story-runtime-g1.3.2.2-migration-journal-candidate regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
