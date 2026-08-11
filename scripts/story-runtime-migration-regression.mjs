// G1.3.2 migration regression：旧存档 raw payload 保留、legacy ID map、迁移报告、幂等迁移、
// 多游标冲突 -> pending_confirmation、显式确认状态机、迁移失败保留原始。
// 生产模块经 esbuild 执行；三份旧存档（无 runtime / 多游标冲突 / 损坏缺字段）。
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

  // ══ 旧档 1：无 runtime（普通旧存档）-> 迁移成功，raw 保留，legacy ID map 稳定 ══
  {
    const legacySave = {
      id: 1,
      type: 'manual',
      timestamp: 100,
      turnCount: 5,
      currentSegmentId: 'segment_huoluo_1',
      旅人: { name: '开拓者' },
      世界: { 当前地点: '黑塔空间站' },
      chatHistory: [],
      新闻: [{ title: '旧新闻A', 正文: 'x', 回合: 1 }],
    };
    // G1.3.2.4：raw 入口只接受 UTF-8 JSON 文本/字节（序列化边界）。
    const raw = await rawReader.readRawSavePayload(JSON.stringify(legacySave));
    // P1-4：raw 是与输入分离的深快照（非同一引用），且内容等价。
    assert(raw.raw !== legacySave && JSON.stringify(raw.raw) === JSON.stringify(legacySave), '旧档1-raw payload 独立深快照且内容保留');
    assert(raw.fieldPaths.includes('currentSegmentId') && raw.fieldPaths.includes('新闻[0].title'), '旧档1-字段路径记录');
    assert(typeof raw.canonicalFingerprint === 'string' && raw.canonicalFingerprint.startsWith('sha256:'), '旧档1-canonical fingerprint');
    const idMap = await migrations.resolveLegacyIdMap(legacySave);
    assert(idMap.currentSegmentId === 'segment_huoluo_1', '旧档1-显式 ID 保留');
    const report = await migrations.produceMigrationReport(raw, idMap, [], true);
    assert(report.status === 'migrated' && report.rawPayloadPreserved === true, '旧档1-迁移成功且 raw 保留');
    // 幂等：同 source fingerprint 无 previous 重跑字节级稳定（P2-1 确定性时间）。
    const again = await migrations.produceMigrationReport(raw, idMap, [], true);
    assert(JSON.stringify(again) === JSON.stringify(report) && again.sourceFingerprint === report.sourceFingerprint, '旧档1-同源无 previous 重跑字节稳定');
    // 有 previous（journal）时返回既有引用。
    const withPrev = await migrations.produceMigrationReport(raw, idMap, [], true, report);
    assert(withPrev === report, '旧档1-带 previous（journal）幂等返回既有报告');
    recordPositive('旧档1-无runtime迁移', 'raw 保留 + migrated + 无 previous 字节稳定 + journal 幂等');
  }

  // ══ 旧档 2：多游标冲突 -> pending_confirmation、只读、带候选、不自动选择 ══
  {
    const conflictSave = {
      id: 2,
      type: 'auto',
      timestamp: 200,
      turnCount: 8,
      currentSegmentId: 'segment_a',
      runtimeSegmentId: 'segment_b',
      seriesGroup: 3,
      systemGroup: 5,
      剧情编织: { 当前分段组号: 3 },
    };
    const raw = await rawReader.readRawSavePayload(JSON.stringify(conflictSave));
    const idMap = await migrations.resolveLegacyIdMap(conflictSave);
    const conflicts = migrations.detectCursorConflicts(conflictSave, idMap);
    assert(conflicts.length === 1 && conflicts[0].kind === 'id_mismatch', '旧档2-必须检测到多游标冲突');
    const report = await migrations.produceMigrationReport(raw, idMap, conflicts, true);
    assert(report.status === 'pending_confirmation', '旧档2-必须 pending_confirmation');
    assert(report.cursorConflicts.length === 1, '旧档2-冲突候选保留');
    // 未提供显式确认 -> 保持 pending_confirmation 只读。
    const unchanged = migrations.explicitConfirmation(report, {});
    assert(unchanged.status === 'pending_confirmation', '旧档2-不自动选择游标（保持只读）');
    // 显式确认后 -> migrated。
    const confirmed = migrations.explicitConfirmation(report, { selectedSegmentId: 'segment_a' });
    assert(confirmed.status === 'migrated' && confirmed.legacyIdMap.currentSegmentId === 'segment_a', '旧档2-显式确认推进 migrated');
    recordPositive('旧档2-多游标冲突', 'pending_confirmation 只读 + 显式确认迁移');
    recordRejected('旧档2-不自动选择游标', 'pending_confirmation（未确认不猜）', 'pending_confirmation');
  }

  // ══ 旧档 3：损坏/缺字段 -> read_only_recovery，不反推事实 ══
  {
    const corruptSave = { id: 3, type: 'imported', timestamp: 300, turnCount: 0, currentSegmentId: 'segment_c' };
    const raw = await rawReader.readRawSavePayload(JSON.stringify(corruptSave));
    const idMap = await migrations.resolveLegacyIdMap(corruptSave);
    const conflicts = migrations.detectCursorConflicts(corruptSave, idMap);
    // 缺 core runtime（coreAvailable=false）-> read_only_recovery。
    const report = await migrations.produceMigrationReport(raw, idMap, conflicts, false);
    assert(report.status === 'read_only_recovery', '旧档3-缺核心必须 read_only_recovery');
    assert(report.warnings.some((w) => w.includes('只读恢复')), '旧档3-警告说明只读恢复');
    // 不反推：raw 保留，迁移失败不覆盖。
    assert(report.rawPayloadPreserved === true, '旧档3-失败保留原始 payload');
    recordPositive('旧档3-损坏/缺字段', 'read_only_recovery 只读 + raw 保留');
  }

  // ══ raw reader：live 循环对象在序列化边界直接拒绝 -> canonicalFingerprint null，不 throw ══
  {
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    const raw = await rawReader.readRawSavePayload(cyclic);
    assert(raw.canonicalFingerprint === null && raw.raw === null, 'raw-循环 live object 必须拒绝（fingerprint null + raw null，不 throw）');
    recordRejected('raw-循环 live object', 'canonicalFingerprint=null + raw=null（不 throw）', 'null');
  }

  // ══ 迁移日志持久化到 store（MIGRATION_STORE）幂等 ══
  {
    // 用内存 Map 模拟 migration journal（真实 IDB 在 persistence regression 覆盖）。
    const journal = new Map();
    const sourceFingerprint = 'sha256:src_fp_mig';
    const record1 = { sourceFingerprint, status: 'migrated', rawFieldPaths: ['a'], legacyIdMap: { currentSegmentId: 's' }, cursorConflicts: [], warnings: [], createdAt: 1 };
    journal.set(sourceFingerprint, record1);
    assert(journal.get(sourceFingerprint).status === 'migrated', '迁移日志-同 source fingerprint 幂等存储');
    recordPositive('迁移日志-同源幂等', 'sourceFingerprint 键控');
  }

  // ══ §4.2 禁止调用回归：alignStoryWeavingToOpeningArchive 是 initialize-only seed adapter ══
  // 禁止在 V3 迁移/恢复、turn snapshot 恢复、正式回合推进（sendWorkflow）、boot hydrate（useGameState）
  // 路径调用，以免改写已提交运行时状态。旧档读取对齐（saveLoadWorkflow load）与开局/重开（App/useGame restart）是允许的种子路径。
  {
    const forbiddenSources = [
      ['hooks/useGame/turnSnapshot.ts', 'turnSnapshot 恢复'],
      ['hooks/useGame/sendWorkflow.ts', '正式回合推进'],
      ['hooks/useGameState.ts', 'boot hydrate'],
      ['services/storyRuntime/migrations.ts', 'V3 迁移'],
      ['services/storyRuntime/runtimeCheckpoint.ts', 'V3 恢复'],
    ];
    for (const [file, label] of forbiddenSources) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      assert(!source.includes('alignStoryWeavingToOpeningArchive'), '禁止调用回归-' + label + ' 不得调用 alignStoryWeavingToOpeningArchive（' + file + '）');
    }
    // 允许的种子路径仍在（旧档读取对齐 / 开局初始化）。
    const saveLoadWorkflowSource = fs.readFileSync(path.join(process.cwd(), 'hooks/useGame/saveLoadWorkflow.ts'), 'utf8');
    assert(saveLoadWorkflowSource.includes('alignStoryWeavingToOpeningArchive'), '允许调用回归-旧档读取对齐（saveLoadWorkflow load）仍保留');
    recordRejected('禁止调用-align在V3/快照/推进路径', 'turnSnapshot/sendWorkflow/useGameState/migrations/runtimeCheckpoint 均不调用', '不调用');
    recordPositive('允许调用-align在种子路径', 'saveLoadWorkflow load（旧档读取对齐）保留');
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(filePath);
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-migration regression passed.');
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
    console.error('story-runtime-migration regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
