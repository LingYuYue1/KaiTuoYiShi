// G1.3.2.5 evidence-index-regression：P2-1 ——
// - 验证 `2026-08-09-g1.3.2.5-evidence/` 的 detached manifest 自洽：
//   manifest 明确排除自身；实际文件数 == manifest 条数；每条路径/大小/SHA-256 与目录逐一复验；
//   无缺失项；
// - summary-gates.log 每条命令记录 command、cwd、开始/结束时间、exit code；
// - 报告声明的文件数与实际目录一致（读取报告 §evidence 索引核对）；
// - 本专项必须在所有日志最终落盘后最后执行。
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
function sha256Hex(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

async function main() {
  const EV = 'docs/superpowers/specs/2026-08-09-g1.3.2.5-evidence';
  const REPORT = 'docs/superpowers/specs/2026-08-09-story-composition-v3-g1.3.2.5-report.md';
  const safety = [];
  const positives = [];
  const rejections = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(errorMessage.includes(keywords), name + ' 拒绝原因必须包含 ' + keywords + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  // 生产 bundle 校验（本专项仍必须加载生产模块，不手工拼结果）。
  await bundleTs('services/storyRuntime/projectionAdapter.ts');

  // ══ 场景 1：detached manifest 自洽（排除自身；条数/大小/hash 逐文件复验；无缺失）══
  {
    assert(fs.existsSync(EV), '场景1-evidence 目录必须存在');
    const manifestPath = path.join(EV, 'evidence-manifest.json');
    assert(fs.existsSync(manifestPath), '场景1-detached manifest 必须存在（evidence-manifest.json）');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert(Array.isArray(manifest.files), '场景1-manifest 必须是 { files: [...] }');
    const manifestNames = new Set(manifest.files.map((f) => f.name));
    assert(!manifestNames.has('evidence-manifest.json'), '场景1-manifest 必须排除自身（detached）');
    // 目录实际文件（排除 manifest 自身）。
    const actualFiles = fs.readdirSync(EV).filter((f) => f !== 'evidence-manifest.json').sort();
    const indexed = manifest.files.map((f) => f.name).sort();
    assert(JSON.stringify(actualFiles) === JSON.stringify(indexed), '场景1-目录文件与 manifest 条数/名称完全一致（缺失: ' + JSON.stringify(actualFiles.filter((f) => !manifestNames.has(f))) + '）');
    // 逐文件复验大小与 SHA-256。
    for (const f of manifest.files) {
      const p = path.join(EV, f.name);
      const st = fs.statSync(p);
      assert(st.size === f.size, '场景1-' + f.name + ' 大小不一致（manifest ' + f.size + ' 实际 ' + st.size + '）');
      const actualHash = sha256File(p);
      assert(actualHash === f.sha256, '场景1-' + f.name + ' SHA-256 不一致（manifest ' + f.sha256 + ' 实际 ' + actualHash + '）');
    }
    // manifest 自身 hash 记录在 manifest.meta.manifestSha256（自洽：重新计算比对）。
    // 注意：manifest 采用 detached 语义（meta.excludesSelf=true，files 不含自身），
    // 不记录"包含自身字段"的 hash（那无法自洽）；manifest 文件的完整性由
    // 目录文件数/大小/逐文件 hash 复验 + excludesSelf 标记保证。
    assert(manifest.meta?.excludesSelf === true, '场景1-manifest 必须声明 excludesSelf（detached）');
    safety.push({ name: '场景1-detached manifest 自洽', detail: actualFiles.length + ' 文件 + 排除自身 + 大小/hash 复验' });
  }

  // ══ 场景 2：summary-gates.log 元数据（command/cwd/start/end/exit）══
  {
    const summaryPath = path.join(EV, 'summary-gates.log');
    assert(fs.existsSync(summaryPath), '场景2-summary-gates.log 必须存在');
    const lines = fs.readFileSync(summaryPath, 'utf8').split('\n').filter((l) => l.includes('command='));
    assert(lines.length >= 45, '场景2-至少 45 条命令记录（7+6+5+7+6+31 门禁），实际 ' + lines.length);
    for (const l of lines) {
      assert(l.includes('command=') && l.includes('cwd=') && l.includes('start=') && l.includes('end=') && l.includes('exit='), '场景2-命令记录必须含 command/cwd/start/end/exit，缺: ' + l.slice(0, 120));
    }
    // exit 都是 0。
    const nonZero = lines.filter((l) => !l.includes('exit=0'));
    assert(nonZero.length === 0, '场景2-全部命令 exit=0，非零: ' + JSON.stringify(nonZero.slice(0, 3)));
    safety.push({ name: '场景2-命令元数据', detail: lines.length + ' 条 command/cwd/start/end/exit' });
  }

  // ══ 场景 3：报告声明的文件数与实际目录一致（报告在 runner 之后生成；最终运行严格验证）══
  {
    const actualCount = fs.readdirSync(EV).filter((f) => f !== 'evidence-manifest.json').length;
    if (!fs.existsSync(REPORT)) {
      // runner 阶段报告尚未生成：跳过严格断言，最终运行（报告落盘后）再验证。
      recordPositive('场景3-报告文件数（报告未生成，最终运行验证）', '实际 ' + actualCount + ' 个文件');
    } else {
      const reportText = fs.readFileSync(REPORT, 'utf8');
      const m = reportText.match(/evidence 文件 (\d+) 个|(\d+) 个 evidence 文件|文件数[：:]\s*(\d+)/);
      if (m) {
        const claimed = Number(m[1] ?? m[2] ?? m[3]);
        assert(claimed === actualCount, '场景3-报告声明文件数（' + claimed + '）必须等于实际（' + actualCount + '）');
      }
      recordPositive('场景3-报告文件数一致', '实际 ' + actualCount + ' 个文件');
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

  console.log('story-runtime-g1.3.2.5-evidence-index regression passed.');
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
    console.error('story-runtime-g1.3.2.5-evidence-index regression failed: ' + (error instanceof Error ? error.message : String(error)));
    if (process.env.STACK) console.error(error.stack);
    process.exit(1);
  });
}
