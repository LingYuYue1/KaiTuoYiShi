// G1.3.2.9 证据生成器（允许命名：story-runtime-g1.3.2.9-*；不是隐藏 runner）。
// - 命令清单：本包 3 条专项 + G1.3.2.8 4 条 + G1.3.2.7 6 条 + G1.3.2.6 5 条 + G1.3.2.5 7 条 +
//   G1.3.2.4 6 条 + G1.3.2.3 5 条 + G1.3.2.2 7 条 + G1.3.2.1 6 条 + §9.1 9 条 + §9.2 13 条 +
//   §9.3 7 条 + tsc + git diff --check + 本阶段 evidence-index 首次计数执行（带元数据）＝ 81 条；
// - expected-commands.json：完整唯一命令名字集合（程序化生成，evidence-index 自身包含）；
// - 流程：跑 78 条组内 + tsc/diff -> 生成 expected-commands.json -> summary（80 条 command 行）
//   -> evidence-index 首次执行（真实运行，追加自身 command 行 -> 81 条）
//   -> detached manifest（meta.totalCommands=81，覆盖最终 summary）-> 复验（stdout，不进目录）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'docs/superpowers/specs/2026-08-09-g1.3.2.9-evidence';
fs.mkdirSync(DIR, { recursive: true });

const RUN_ENV = { ...process.env };
const CWD = process.cwd();

const run = (command, args, name) => {
  const t0 = Date.now();
  const start = new Date().toISOString();
  const outFile = path.join(DIR, name + '.log');
  let exit;
  let out = '';
  try {
    out = execFileSync(command, args, { encoding: 'utf8', timeout: 240000, env: RUN_ENV, cwd: CWD });
    exit = 0;
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
    exit = e.status ?? -1;
  }
  fs.writeFileSync(outFile, out);
  const end = new Date().toISOString();
  return { line: 'command=' + name + ' cwd=' + CWD + ' start=' + start + ' end=' + end + ' exit=' + exit + ' ms=' + (Date.now() - t0), exit };
};

const groups = [
  ['G1.3.2.9 special (3, evidence-index 单独计数执行)', [
    'story-runtime-g1.3.2.9-article-key-codec-regression.mjs',
    'story-runtime-g1.3.2.9-incoming-owner-revision-regression.mjs',
    'story-runtime-g1.3.2.9-complex-snapshot-regression.mjs',
  ]],
  ['G1.3.2.8 special (4)', [
    'story-runtime-g1.3.2.8-article-namespace-branch-regression.mjs',
    'story-runtime-g1.3.2.8-aggregate-inner-owner-regression.mjs',
    'story-runtime-g1.3.2.8-evidence-strength-regression.mjs',
    'story-runtime-g1.3.2.8-evidence-index-regression.mjs',
  ]],
  ['G1.3.2.7 special (6)', [
    'story-runtime-g1.3.2.7-article-list-malformed-regression.mjs',
    'story-runtime-g1.3.2.7-aggregate-wrapper-totality-regression.mjs',
    'story-runtime-g1.3.2.7-aggregate-write-corrupt-wrapper-regression.mjs',
    'story-runtime-g1.3.2.7-paired-read-mismatch-regression.mjs',
    'story-runtime-g1.3.2.7-outbox-direction-count-regression.mjs',
    'story-runtime-g1.3.2.7-evidence-index-regression.mjs',
  ]],
  ['G1.3.2.6 special (5)', [
    'story-runtime-g1.3.2.6-outbox-key-primitive-regression.mjs',
    'story-runtime-g1.3.2.6-projection-owner-direction-regression.mjs',
    'story-runtime-g1.3.2.6-wrapper-integrity-regression.mjs',
    'story-runtime-g1.3.2.6-publication-typed-get-regression.mjs',
    'story-runtime-g1.3.2.6-evidence-index-regression.mjs',
  ]],
  ['G1.3.2.5 special (7)', [
    'story-runtime-g1.3.2.5-projection-late-failure-regression.mjs',
    'story-runtime-g1.3.2.5-projection-schema-key-regression.mjs',
    'story-runtime-g1.3.2.5-recovery-readonly-outbox-regression.mjs',
    'story-runtime-g1.3.2.5-adapter-capability-regression.mjs',
    'story-runtime-g1.3.2.5-raw-strict-utf8-proto-regression.mjs',
    'story-runtime-g1.3.2.5-idb-shim-clear-order-regression.mjs',
    'story-runtime-g1.3.2.5-evidence-index-regression.mjs',
  ]],
  ['G1.3.2.4 special (6)', [
    'story-runtime-g1.3.2.4-projection-row-recovery-regression.mjs',
    'story-runtime-g1.3.2.4-projection-recovery-source-regression.mjs',
    'story-runtime-g1.3.2.4-projection-transaction-atomicity-regression.mjs',
    'story-runtime-g1.3.2.4-raw-browser-boundary-regression.mjs',
    'story-runtime-g1.3.2.4-idb-shim-ordering-regression.mjs',
    'story-runtime-g1.3.2.4-idb-shim-transaction-semantics-regression.mjs',
  ]],
  ['G1.3.2.3 special (5)', [
    'story-runtime-g1.3.2.3-projection-version-recovery-regression.mjs',
    'story-runtime-g1.3.2.3-projection-scope-regression.mjs',
    'story-runtime-g1.3.2.3-raw-trap-safety-regression.mjs',
    'story-runtime-g1.3.2.3-pointer-write-liveness-regression.mjs',
    'story-runtime-g1.3.2.3-idb-shim-scope-regression.mjs',
  ]],
  ['G1.3.2.2 special (7)', [
    'story-runtime-g1.3.2.2-outbox-ownership-regression.mjs',
    'story-runtime-g1.3.2.2-projection-branch-durable-regression.mjs',
    'story-runtime-g1.3.2.2-transaction-failure-liveness-regression.mjs',
    'story-runtime-g1.3.2.2-checkpoint-integrity-regression.mjs',
    'story-runtime-g1.3.2.2-migration-journal-candidate-regression.mjs',
    'story-runtime-g1.3.2.2-idb-shim-transaction-regression.mjs',
    'story-runtime-g1.3.2.2-raw-container-safety-regression.mjs',
  ]],
  ['G1.3.2.1 special (6)', [
    'story-runtime-g1.3.2.1-native-idb-shape-regression.mjs',
    'story-runtime-g1.3.2.1-concurrent-cas-regression.mjs',
    'story-runtime-g1.3.2.1-projection-atomic-regression.mjs',
    'story-runtime-g1.3.2.1-checkpoint-recovery-regression.mjs',
    'story-runtime-g1.3.2.1-migration-snapshot-regression.mjs',
    'story-runtime-g1.3.2.1-idempotency-regression.mjs',
  ]],
  ['G1.3.2 9.1 (9)', [
    'story-runtime-persistence-regression.mjs',
    'story-runtime-migration-regression.mjs',
    'story-runtime-reroll-cas-regression.mjs',
    'save-package-regression.mjs',
    'save-isolation-regression.mjs',
    'save-tree-regression.mjs',
    'reroll-snapshot-isolation-regression.mjs',
    'save-delta-storage-regression.mjs',
    'story-runtime-cross-tab-cas-regression.mjs',
  ]],
  ['G1.3.2 9.2 (13)', [
    'story-runtime-reducer-regression.mjs',
    'story-runtime-doomsday-beast-regression.mjs',
    'story-runtime-narrative-publication-gate-regression.mjs',
    'story-runtime-contract-regression.mjs',
    'story-runtime-schema-drift-regression.mjs',
    'story-runtime-domain-model-regression.mjs',
    'story-runtime-instance-validator-regression.mjs',
    'story-asset-catalog-contract-regression.mjs',
    'story-runtime-legacy-compat-regression.mjs',
    'news-runtime-legacy-compat-regression.mjs',
    'story-runtime-authority-inventory.mjs',
    'story-composition-v3-baseline-regression.mjs',
    'story-composition-v3-tamper-regression.mjs',
  ]],
  ['G1.3.2 9.3 (7)', [
    'story-weaving-regression.mjs',
    'story-weaving-persistence-behavior-regression.mjs',
    'news-update-regression.mjs',
    'phone-knowledge-boundary-regression.mjs',
    'cloud-backup-builder-regression.mjs',
    'cloud-backup-package-regression.mjs',
    'cloud-backup-merge-regression.mjs',
  ]],
];

const summary = [];
let failures = 0;
for (const [group, scripts] of groups) {
  summary.push('== ' + group + ' ==');
  for (const s of scripts) {
    const r = run(process.execPath, ['scripts/' + s], s.replace(/\.mjs$/, ''));
    summary.push('  ' + r.line);
    if (r.exit !== 0) failures += 1;
  }
}

// tsc（node 直接执行 typescript 编译器）
{
  const tscEntry = path.join('node_modules', 'typescript', 'bin', 'tsc');
  const r = run(process.execPath, [tscEntry, '--noEmit'], 'tsc');
  summary.push('== tsc ==\n  ' + r.line);
  if (r.exit !== 0) failures += 1;
}
// git diff --check
{
  const r = run('git', ['diff', '--check'], 'git-diff-check');
  summary.push('== git diff --check ==\n  ' + r.line);
  if (r.exit !== 0) failures += 1;
}
// 冻结 hash / import / .tmp 证据
{
  const frozen = [
    'scripts/fixtures/story-v3/story-runtime-contract.fixture.json',
    'services/storyRuntime/runtimeSchema.generated.ts',
    'services/storyRuntime/runtimeValidator.ts',
    'services/storyRuntime/normalization.ts',
    'services/storyRuntime/id.ts',
    'services/storyRuntime/storyAssetCatalogStore.ts',
  ];
  const hashLines = frozen.map((f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') + '  ' + f);
  fs.writeFileSync(path.join(DIR, 'frozen-hashes.log'), hashLines.join('\n') + '\n');
  const scanFiles = ['App.tsx', 'hooks/useGame/sendWorkflow.ts'];
  function walk(d, arr) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', '.git', 'storybook-static', 'kaituo-star-rail-ui'].includes(e.name)) walk(p, arr);
      } else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) arr.push(p);
    }
  }
  walk('hooks', scanFiles);
  walk('components', scanFiles);
  const pattern = /services\/storyRuntime|storyRuntime\/projectionAdapter|storyRuntime\/rawLegacyReader|storyRuntime\/coreRuntimeStore|storyRuntime\/runtimeCheckpoint/;
  const hits = scanFiles.filter((f) => pattern.test(fs.readFileSync(f, 'utf8')));
  fs.writeFileSync(path.join(DIR, 'formal-import-scan.log'), 'matches: ' + hits.length + '\n' + hits.join('\n') + '\n');
  const tmpLines = ['services/storyRuntime/.tmp exists: ' + fs.existsSync('services/storyRuntime/.tmp')];
  const rootTmp = fs.readdirSync('.').filter((e) => /^\.tmp/.test(e));
  tmpLines.push('root .tmp* count: ' + rootTmp.length);
  fs.writeFileSync(path.join(DIR, 'tmp-check.log'), tmpLines.join('\n') + '\n');
  summary.push('== frozen-hashes/import/.tmp evidence generated ==');
}

// P0-4（G1.3.2.9）：完整唯一命令名字集合（程序化）——含本阶段 evidence-index 自身与 tsc/diff。
const SELF_IDX = 'story-runtime-g1.3.2.9-evidence-index-regression';
const expectedNames = [
  ...groups.flatMap(([, s]) => s.map((x) => x.replace(/\.mjs$/, ''))),
  SELF_IDX,
  'tsc',
  'git-diff-check',
];
fs.writeFileSync(path.join(DIR, 'expected-commands.json'), JSON.stringify({ expected: expectedNames, generatedAt: new Date().toISOString() }, null, 1) + '\n');
summary.push('== TOTAL_COMMANDS=' + expectedNames.length + '（程序化：完整唯一命令名字集合，含本阶段 evidence-index 自身）==');

// 先写 summary（80 条 command 行：78 组内 + tsc + diff），再 evidence-index 首次计数执行（追加自身行 -> 81 条）。
fs.writeFileSync(path.join(DIR, 'summary-gates.log'), summary.join('\n') + '\n');
const r1 = run(process.execPath, ['scripts/' + SELF_IDX + '.mjs'], SELF_IDX);
summary.push('== evidence-index (首次计数执行) ==\n  ' + r1.line);
if (r1.exit !== 0) failures += 1;

const makeManifest = (totalCommands) => {
  const files = fs.readdirSync(DIR).filter((f) => f !== 'evidence-manifest.json').sort();
  const manifest = {
    generatedAt: new Date().toISOString(),
    meta: { excludesSelf: true, totalCommands },
    files: files.map((f) => {
      const p = path.join(DIR, f);
      const st = fs.statSync(p);
      return { name: f, size: st.size, sha256: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') };
    }),
  };
  fs.writeFileSync(path.join(DIR, 'evidence-manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  return manifest.files.length;
};

// detached manifest（覆盖最终 summary 81 条；所有日志落盘后生成）。
{
  const n = makeManifest(expectedNames.length);
  summary.push('== detached manifest generated: ' + n + ' files（totalCommands=' + expectedNames.length + '）==');
  fs.writeFileSync(path.join(DIR, 'summary-gates.log'), summary.join('\n') + '\n');
  // 注意：追加 manifest 行后 summary 变化——重新生成 manifest 覆盖（最终版）。
  makeManifest(expectedNames.length);
}
// 最终复验（stdout 只打印，不进目录、不追加 summary——manifest 与目录严格一致）。
{
  let verifyOut = '';
  let verifyExit = -1;
  try {
    verifyOut = execFileSync(process.execPath, ['scripts/' + SELF_IDX + '.mjs'], { encoding: 'utf8', timeout: 120000, env: RUN_ENV, cwd: CWD });
    verifyExit = 0;
  } catch (e) {
    verifyOut = String(e.stdout || '') + String(e.stderr || '');
    verifyExit = e.status ?? -1;
  }
  console.log('== evidence-index 最终复验 ==\n' + verifyOut);
  if (verifyExit !== 0) failures += 1;
}

console.log(summary.join('\n'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures === 0 ? 0 : 1);
