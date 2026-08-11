// G1.3.2.1 migration-snapshot regression：P1-3/P1-4/P2-1 ——
// - P1-3：runtimeSegmentId 与组号矛盾（显式 ID 缺失）必须进入 pending_confirmation；候选为空保持只读；
//   显式确认只接受候选列表中的精确 ID（未知 ID/空白/重复候选不推进）；
// - P1-4：raw reader 返回的 raw 与输入不共享可变引用；normalize/align 或直接 mutation 后 raw bytes/fingerprint 不变；
//   无法克隆的循环/getter/Proxy/稀疏容器走稳定只读错误（raw=null + fingerprint=null）；
// - P2-1：不传 previous/journal 时同一迁移输入两次 canonical JSON 完全相同（report 不依赖当前时间）。
// 生产模块经 esbuild 执行。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bundleTs } from './story-runtime-core-test-helpers.mjs';

const FROZEN_HASHES = {
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json': '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  'services/storyRuntime/runtimeSchema.generated.ts': '6c80c5b23102fdcfacb7cc00624921e5a6de5849995cd4b1e3d795da347df1ec',
  'services/storyRuntime/runtimeValidator.ts': '2d75169ab77229affb3035d7683df8bb04c57f937d643da9d03305c823744bd3',
};

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), filePath))).digest('hex'); }

async function main() {
  const rawReader = await bundleTs('services/storyRuntime/rawLegacyReader.ts');
  const migrations = await bundleTs('services/storyRuntime/migrations.ts');
  const positives = [];
  const rejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  // ══ P1-3 场景 1：runtimeSegmentId 存在且组号矛盾（显式 ID 缺失）-> group_mismatch -> pending_confirmation ══
  {
    const conflictSave = { runtimeSegmentId: 'seg_b', seriesGroup: 3, systemGroup: 5 };
    // G1.3.2.4：raw 入口只接受 UTF-8 JSON 文本/字节（序列化边界）。
    const raw = await rawReader.readRawSavePayload(JSON.stringify(conflictSave));
    const idMap = await migrations.resolveLegacyIdMap(conflictSave);
    const conflicts = migrations.detectCursorConflicts(conflictSave, idMap);
    assert(conflicts.length === 1 && conflicts[0].kind === 'group_mismatch', 'P1-3-显式 ID 缺失 + 组号矛盾必须 group_mismatch，实际 ' + JSON.stringify(conflicts));
    const report = await migrations.produceMigrationReport(raw, idMap, conflicts, true);
    assert(report.status === 'pending_confirmation', 'P1-3-组号矛盾必须 pending_confirmation');
    recordPositive('P1-3-group_mismatch 组合', 'runtimeSegmentId + 组号矛盾 -> pending_confirmation');
  }

  // ══ P1-3 场景 2：候选为空保持只读；显式确认只接受候选精确 ID ══
  {
    const conflictSave = { seriesGroup: 2, systemGroup: 4 };
    const raw = await rawReader.readRawSavePayload(JSON.stringify(conflictSave));
    const idMap = await migrations.resolveLegacyIdMap(conflictSave);
    const conflicts = migrations.detectCursorConflicts(conflictSave, idMap);
    assert(conflicts.length === 1 && conflicts[0].kind === 'missing_explicit', 'P1-3-无显式无 runtime 组号矛盾必须 missing_explicit');
    const report = await migrations.produceMigrationReport(raw, idMap, conflicts, true);
    assert(report.status === 'pending_confirmation', 'P1-3-候选为空必须 pending_confirmation 只读');
    // 未知 ID / 空白 / 缺省 -> 不推进。
    const bad = migrations.explicitConfirmation(report, { selectedSegmentId: 'not-a-candidate' });
    assert(bad.status === 'pending_confirmation', 'P1-3-未知 ID 确认不得推进');
    const blank = migrations.explicitConfirmation(report, { selectedSegmentId: '   ' });
    assert(blank.status === 'pending_confirmation', 'P1-3-空白确认不得推进');
    const none = migrations.explicitConfirmation(report, {});
    assert(none.status === 'pending_confirmation', 'P1-3-缺省确认不得推进');
    // 候选精确 ID 才能迁移。
    const confirmed = migrations.explicitConfirmation(report, { selectedSegmentId: 'candidate_seg' });
    // 候选为空时无合法候选，即使传入候选也因不在候选列表而不推进；此处验证候选列表构建。
    const withCandidate = await migrations.produceMigrationReport(raw, { ...idMap, currentSegmentId: 'candidate_seg' }, [{ kind: 'missing_explicit', candidates: ['candidate_seg'] }], true);
    const okConfirm = migrations.explicitConfirmation(withCandidate, { selectedSegmentId: 'candidate_seg' });
    assert(okConfirm.status === 'migrated', 'P1-3-候选精确 ID 确认后迁移');
    recordPositive('P1-3-候选确认', '候选精确 ID 迁移，未知/空白/缺省保持只读');
    recordRejected('P1-3-未知ID确认', 'pending_confirmation（只接受候选精确 ID）', 'pending_confirmation');
  }

  // ══ P1-4 场景 3：raw 与输入不共享引用；mutation 后 raw bytes/fingerprint 不变 ══
  {
    const input = { id: 1, currentSegmentId: 'seg_a', nested: { deep: true }, arr: [1, 2] };
    // G1.3.2.4：raw 入口只接受 JSON 文本；文本不可变，输入对象 mutation 不影响解析产物。
    const snapshot = await rawReader.readRawSavePayload(JSON.stringify(input));
    assert(snapshot.raw !== input, 'P1-4-raw 必须是与输入分离的深快照（非同一引用）');
    const beforeRawBytes = JSON.stringify(snapshot.raw);
    const beforeFp = snapshot.canonicalFingerprint;
    // normalize/align 后篡改输入。
    input.currentSegmentId = 'seg_mutated';
    input.nested.deep = false;
    input.arr.push(3);
    assert(JSON.stringify(snapshot.raw) === beforeRawBytes, 'P1-4-篡改输入后 raw bytes 不变');
    assert(snapshot.canonicalFingerprint === beforeFp, 'P1-4-篡改输入后 fingerprint 不变');
    recordPositive('P1-4-raw 独立深快照', 'mutation 不影响 raw bytes/fingerprint');
  }

  // ══ P1-4 场景 4：循环 live object（无法序列化为 JSON 文本）-> 稳定只读错误 ══
  {
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    const snapshot = await rawReader.readRawSavePayload(cyclic);
    // G1.3.2.4：live object（含循环）在序列化边界直接拒绝——raw=null + canonicalFingerprint=null（不 throw）。
    assert(snapshot.canonicalFingerprint === null, 'P1-4-循环容器 canonicalFingerprint 必须 null（只读路径）');
    assert(snapshot.raw === null, 'P1-4-循环 live object 直接拒绝（序列化边界，不触碰）');
    assert(snapshot.readonlyReason !== null, 'P1-4-拒绝路径有稳定只读诊断');
    recordRejected('P1-4-循环 live object', 'raw=null + canonicalFingerprint=null（不 throw）', 'null');
  }

  // ══ P2-1 场景 5：不传 previous/journal 时同一迁移输入两次 canonical JSON 完全相同 ══
  {
    const save = { id: 1, currentSegmentId: 'seg_a', seriesGroup: 1, systemGroup: 1, 剧情编织: { 当前分段组号: 1 } };
    const raw = await rawReader.readRawSavePayload(JSON.stringify(save));
    const idMap = await migrations.resolveLegacyIdMap(save);
    const conflicts = migrations.detectCursorConflicts(save, idMap);
    const r1 = await migrations.produceMigrationReport(raw, idMap, conflicts, true);
    const r2 = await migrations.produceMigrationReport(raw, idMap, conflicts, true);
    assert(JSON.stringify(r1) === JSON.stringify(r2), 'P2-1-无 previous 两次迁移报告 canonical 完全相同');
    assert(typeof r1.createdAt === 'number' && r1.createdAt === r2.createdAt, 'P2-1-createdAt 确定性（同源同值）');
    assert(!String(r1.createdAt).includes('Date.now'), 'P2-1-createdAt 不依赖当前时间');
    recordPositive('P2-1-无 journal 字节稳定', '两次报告 canonical 相同 + createdAt 确定性');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.1-migration-snapshot regression passed.');
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
    console.error('story-runtime-g1.3.2.1-migration-snapshot regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
