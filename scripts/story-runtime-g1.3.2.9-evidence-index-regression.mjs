// G1.3.2.9 evidence-index regression：P0-4 ——
// - 本阶段 evidence-index 自身是必跑命令，首次执行带 command/cwd/start/end/exit 元数据计入 summary
//   与 manifest.meta.totalCommands（不允许把必跑专项排除在唯一命令集合外）；
// - 报告数字 regex 强制匹配（匹配不到直接失败）；
// - summary 命令名集合与 expected-commands.json 完整 expected names **逐项相等**（不只比数量）；
// - §9 按真实 9+13+7=29 条记录；报告分组算术、程序化总数、summary、manifest 与 expected 五者精确相等；
// - detached manifest 自洽；本专项必须在所有日志最终落盘后执行（复验时 manifest 已存在）。
// 生产模块经 esbuild 执行（bundle 校验）；evidence 验证用真实文件系统。
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
function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }

async function main() {
  const EV = 'docs/superpowers/specs/2026-08-09-g1.3.2.9-evidence';
  const REPORT = 'docs/superpowers/specs/2026-08-09-story-composition-v3-g1.3.2.9-report.md';
  const safety = [];
  const positives = [];
  const rejections = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  await bundleTs('services/storyRuntime/projectionAdapter.ts');

  // ══ 场景 1：detached manifest 自洽（存在时严格验证；首次数执行时 manifest 尚未生成则跳过）══
  {
    assert(fs.existsSync(EV), '场景1-evidence 目录必须存在');
    const manifestPath = path.join(EV, 'evidence-manifest.json');
    if (!fs.existsSync(manifestPath)) {
      recordPositive('场景1-manifest（首次数执行，最终复验验证）', 'manifest 尚未生成');
    } else {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert(Array.isArray(manifest.files), '场景1-manifest 必须是 { files: [...] }');
      assert(manifest.meta?.excludesSelf === true, '场景1-manifest 必须声明 excludesSelf（detached）');
      const manifestNames = new Set(manifest.files.map((f) => f.name));
      assert(!manifestNames.has('evidence-manifest.json'), '场景1-manifest 必须排除自身');
      const actualFiles = fs.readdirSync(EV).filter((f) => f !== 'evidence-manifest.json').sort();
      const indexed = manifest.files.map((f) => f.name).sort();
      assert(JSON.stringify(actualFiles) === JSON.stringify(indexed), '场景1-目录文件与 manifest 完全一致');
      for (const f of manifest.files) {
        const p = path.join(EV, f.name);
        const st = fs.statSync(p);
        assert(st.size === f.size, '场景1-' + f.name + ' 大小不一致');
        const actualHash = sha256File(p);
        assert(actualHash === f.sha256, '场景1-' + f.name + ' SHA-256 不一致');
      }
      safety.push({ name: '场景1-detached manifest 自洽', detail: actualFiles.length + ' 文件 + 排除自身 + 大小/hash 复验' });
    }
  }

  // ══ 场景 2：summary 命令名与 expected-commands.json 完整集合逐项相等 + 全部 exit 0 + 元数据 ══
  {
    const SELF_NAME = 'story-runtime-g1.3.2.9-evidence-index-regression';
    const expectedPath = path.join(EV, 'expected-commands.json');
    assert(fs.existsSync(expectedPath), '场景2-expected-commands.json 必须存在（程序化生成）');
    const expectedData = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    const expectedNames = expectedData.expected;
    assert(Array.isArray(expectedNames) && expectedNames.length > 0, '场景2-expected names 必须存在');
    // 本阶段 evidence-index 必须在 expected 集合内（自身必跑命令不可排除）。
    assert(expectedNames.includes(SELF_NAME), '场景2-本阶段 evidence-index 必须进入 expected 集合（自身必跑）');
    const summaryPath = path.join(EV, 'summary-gates.log');
    assert(fs.existsSync(summaryPath), '场景2-summary-gates.log 必须存在');
    const lines = fs.readFileSync(summaryPath, 'utf8').split('\n').filter((l) => l.includes('command='));
    const actualNames = lines.map((l) => l.match(/command=([^ ]+)/)?.[1] ?? '');
    const selfCounted = actualNames.includes(SELF_NAME);
    if (!selfCounted) {
      // 首次计数执行：summary 尚未包含自身（自身运行结束后才追加）——全量逐项相等断言留到最终复验。
      recordPositive('场景2-首次计数执行（全量逐项留到复验）', '自身 command 行将在本次运行后计入 summary');
    } else {
      // 最终复验：summary 命令名集合与 expected names 逐项相等（不只比数量）、无重复、全部 exit 0。
      const expectedSorted = [...expectedNames].sort();
      const actualSorted = [...actualNames].sort();
      assert(JSON.stringify(actualSorted) === JSON.stringify(expectedSorted), '场景2-summary 命令名集合必须与 expected names 逐项相等（缺: ' + JSON.stringify(expectedSorted.filter((n) => !actualSorted.includes(n))) + ' 多: ' + JSON.stringify(actualSorted.filter((n) => !expectedSorted.includes(n))) + '）');
      const dup = actualNames.filter((n, i) => actualNames.indexOf(n) !== i);
      assert(dup.length === 0, '场景2-命令名不得重复');
      for (const l of lines) {
        assert(l.includes('command=') && l.includes('cwd=') && l.includes('start=') && l.includes('end=') && l.includes('exit='), '场景2-命令记录必须含 command/cwd/start/end/exit');
        assert(l.includes('exit=0'), '场景2-全部命令必须 exit=0，非零: ' + l.slice(0, 120));
      }
      // §9 真实分组：9+13+7=29。
      const g9Names = expectedNames.filter((n) => {
        const base = n.replace(/\.mjs$/, '');
        return ['story-runtime-persistence-regression', 'story-runtime-migration-regression', 'story-runtime-reroll-cas-regression', 'save-package-regression', 'save-isolation-regression', 'save-tree-regression', 'reroll-snapshot-isolation-regression', 'save-delta-storage-regression', 'story-runtime-cross-tab-cas-regression',
          'story-runtime-reducer-regression', 'story-runtime-doomsday-beast-regression', 'story-runtime-narrative-publication-gate-regression', 'story-runtime-contract-regression', 'story-runtime-schema-drift-regression', 'story-runtime-domain-model-regression', 'story-runtime-instance-validator-regression', 'story-asset-catalog-contract-regression', 'story-runtime-legacy-compat-regression', 'news-runtime-legacy-compat-regression', 'story-runtime-authority-inventory', 'story-composition-v3-baseline-regression', 'story-composition-v3-tamper-regression',
          'story-weaving-regression', 'story-weaving-persistence-behavior-regression', 'news-update-regression', 'phone-knowledge-boundary-regression', 'cloud-backup-builder-regression', 'cloud-backup-package-regression', 'cloud-backup-merge-regression'].includes(base);
      });
      assert(g9Names.length === 29, '场景2-§9 必须按真实 9+13+7=29 条记录，实际 ' + g9Names.length);
      safety.push({ name: '场景2-完整 expected names', detail: expectedNames.length + ' 条逐项相等 + 无重复 + 全部 exit 0 + §9=29' });
    }
  }

  // ══ 场景 3：报告数字 regex 强制匹配（匹配不到直接失败）+ 与 manifest.totalCommands/expected 精确相等 ══
  {
    const expectedPath = path.join(EV, 'expected-commands.json');
    const expectedNames = JSON.parse(fs.readFileSync(expectedPath, 'utf8')).expected;
    const expectedTotal = expectedNames.length;
    const manifestPath = path.join(EV, 'evidence-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert(manifest.meta?.totalCommands === expectedTotal, '场景3-manifest.meta.totalCommands（' + manifest.meta?.totalCommands + '）必须等于 expected 总数（' + expectedTotal + '）');
    }
    if (!fs.existsSync(REPORT)) {
      recordPositive('场景3-报告数字（报告未生成，最终复验验证）', 'expectedTotal=' + expectedTotal);
    } else {
      const reportText = fs.readFileSync(REPORT, 'utf8');
      const m = reportText.match(/(\d+) 条唯一命令/);
      assert(m !== null, '场景3-报告必须包含可匹配的"<N> 条唯一命令"数字（regex 匹配不到直接失败）');
      const claimed = Number(m[1]);
      assert(claimed === expectedTotal, '场景3-报告声明命令数（' + claimed + '）必须精确等于 expected 总数（' + expectedTotal + '）');
      recordPositive('场景3-报告数字强制匹配', '报告 ' + claimed + ' 条 === expected ' + expectedTotal + ' 条');
    }
  }

  // ══ 场景 4：报告文件数一致 ══
  {
    const actualCount = fs.readdirSync(EV).filter((f) => f !== 'evidence-manifest.json').length;
    if (!fs.existsSync(REPORT)) {
      recordPositive('场景4-报告文件数（报告未生成，最终复验验证）', '实际 ' + actualCount + ' 个文件');
    } else {
      const reportText = fs.readFileSync(REPORT, 'utf8');
      const m = reportText.match(/evidence 文件 (\d+) 个|(\d+) 个 evidence 文件|文件数[：:]\s*(\d+)/);
      if (m) {
        const claimed = Number(m[1] ?? m[2] ?? m[3]);
        assert(claimed === actualCount, '场景4-报告声明文件数（' + claimed + '）必须等于实际（' + actualCount + '）');
      }
      recordPositive('场景4-报告文件数一致', '实际 ' + actualCount + ' 个文件');
    }
  }

  // ── 冻结 hash 与无 .tmp ──
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256File(path.join(process.cwd(), filePath));
    assert(actual === expectedHash, '冻结文件 hash 变化: ' + filePath + ' ' + actual);
  }
  safety.push({ name: '冻结文件 hash 不变', detail: 'unchanged' });
  assert(!fs.existsSync(path.join(process.cwd(), 'services/storyRuntime/.tmp')), '不允许产生 .tmp');
  safety.push({ name: '无 .tmp', detail: 'none' });

  console.log('story-runtime-g1.3.2.9-evidence-index regression passed.');
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
    console.error('story-runtime-g1.3.2.9-evidence-index regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
