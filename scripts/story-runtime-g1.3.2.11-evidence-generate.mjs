// G1.3.2.11 证据生成器（允许命名：story-runtime-g1.3.2.11-*；不是隐藏 runner）。
// - 命令集合：读取 .9 expected-commands.json（验证其中 .9 evidence-index 存在），合并 .11 全部 5 条
//   （含 evidence-index 自身）+ .10 5 条 + .9 完整 expected set（81 条，tsc/diff 只计一次）= 91 条唯一命令；
// - 每条记录 command、cwd、开始/结束 ISO 时间、exit code、stdout/stderr；
// - 真实范围证据：git status --short 输出到 evidence；untracked 目标文件独立 whitespace 检查；
// - expected-commands.json 程序化生成；detached manifest（meta.totalCommands=91）；
// - .11 evidence-index 首次计数执行（带元数据）后重新生成 manifest，最终复验（stdout 不进目录）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'docs/superpowers/specs/2026-08-09-g1.3.2.11-evidence';
const G9_DIR = 'docs/superpowers/specs/2026-08-09-g1.3.2.9-evidence';
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

// P0-4（G1.3.2.11）：读取 .9 expected-commands.json（不得再用字符串正则猜命令）。
const g9Expected = JSON.parse(fs.readFileSync(path.join(G9_DIR, 'expected-commands.json'), 'utf8')).expected;
if (!g9Expected.includes('story-runtime-g1.3.2.9-evidence-index-regression')) {
  console.error('FATAL: .9 expected-commands.json 缺少 .9 evidence-index');
  process.exit(1);
}

const S11 = [
  'story-runtime-g1.3.2.11-article-read-domain-regression.mjs',
  'story-runtime-g1.3.2.11-article-owner-isolation-regression.mjs',
  'story-runtime-g1.3.2.11-article-logical-conflict-regression.mjs',
  'story-runtime-g1.3.2.11-browser-evidence-boundary-regression.mjs',
  'story-runtime-g1.3.2.11-evidence-index-regression.mjs',
];
const S10 = [
  'story-runtime-g1.3.2.10-article-namespace-legacy-regression.mjs',
  'story-runtime-g1.3.2.10-article-owner-diagnostic-regression.mjs',
  'story-runtime-g1.3.2.10-incoming-persistable-domain-regression.mjs',
  'story-runtime-g1.3.2.10-complex-snapshot-evidence-regression.mjs',
  'story-runtime-g1.3.2.10-evidence-index-regression.mjs',
];

// 完整唯一命令集合（程序化）：.9 expected 81 + .10 5 + .11 5（去重后 91；tsc/diff 已在 .9 expected 中只计一次）。
const S11_NO_IDX = S11.filter((s) => !s.includes('evidence-index-regression'));
const expectedNames = [...new Set([...g9Expected, ...S10.map((s) => s.replace(/\.mjs$/, '')), ...S11.map((s) => s.replace(/\.mjs$/, ''))])];
const TOTAL = expectedNames.length;

const summary = [];
let failures = 0;
// 组内运行：.11 4 条 + .10 5 条 + .9 expected 81 条（含 tsc/git-diff-check 特殊命令）。
const groupRuns = [
  ...S11_NO_IDX.map((s) => ({ name: s.replace(/\.mjs$/, ''), run: () => run(process.execPath, ['scripts/' + s], s.replace(/\.mjs$/, '')) })),
  ...S10.map((s) => ({ name: s.replace(/\.mjs$/, ''), run: () => run(process.execPath, ['scripts/' + s], s.replace(/\.mjs$/, '')) })),
  ...g9Expected.map((name) => ({
    name,
    run: () => {
      if (name === 'tsc') return run(process.execPath, [path.join('node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], 'tsc');
      if (name === 'git-diff-check') return run('git', ['diff', '--check'], 'git-diff-check');
      return run(process.execPath, ['scripts/' + name + '.mjs'], name);
    },
  })),
];
for (const entry of groupRuns) {
  const r = entry.run();
  summary.push('  ' + r.line);
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

// P1（G1.3.2.11）：真实范围证据——git status --short（Git 真实点名，不是手写 whitelist）。
{
  let statusOut = '';
  try {
    statusOut = execFileSync('git', ['status', '--short'], { encoding: 'utf8', env: RUN_ENV, cwd: CWD, timeout: 30000 });
  } catch (e) {
    statusOut = String(e.stdout || '') + String(e.stderr || '');
  }
  fs.writeFileSync(path.join(DIR, 'git-status-short.log'), statusOut);
  // untracked 目标文件独立 whitespace 检查（trailing whitespace / tab in indent）。
  const untrackedTargets = statusOut.split('\n')
    .filter((l) => l.startsWith('??'))
    .map((l) => l.slice(3).trim())
    .filter((p) => p.includes('services/storyRuntime/projection') || p.includes('story-runtime-g1.3.2.11-') || p.includes('story-runtime-g1.3.2.10-'));
  const wsLines = [];
  for (const p of untrackedTargets) {
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (/[ \t]+$/.test(lines[i])) wsLines.push(p + ':' + (i + 1) + ': trailing whitespace');
      if (/^\t+ /.test(lines[i])) wsLines.push(p + ':' + (i + 1) + ': tab-in-indent');
    }
  }
  fs.writeFileSync(path.join(DIR, 'untracked-whitespace.log'), wsLines.length === 0 ? 'no whitespace issues\n' : wsLines.join('\n') + '\n');
  if (wsLines.length > 0) {
    console.error('FATAL: untracked whitespace issues: ' + JSON.stringify(wsLines.slice(0, 5)));
    process.exit(1);
  }
  summary.push('== git status --short + untracked whitespace 检查完成（真实范围证据）==');
}

fs.writeFileSync(path.join(DIR, 'expected-commands.json'), JSON.stringify({ expected: expectedNames, generatedAt: new Date().toISOString() }, null, 1) + '\n');
summary.push('== TOTAL_COMMANDS=' + TOTAL + '（程序化：.9 expected ' + g9Expected.length + ' + .10 5 + .11 5，含 .11 evidence-index 自身）==');
// 先写 summary（90 条 command 行），再 .11 evidence-index 首次计数执行（追加自身行 -> 91 条）。
fs.writeFileSync(path.join(DIR, 'summary-gates.log'), summary.join('\n') + '\n');
const r1 = run(process.execPath, ['scripts/story-runtime-g1.3.2.11-evidence-index-regression.mjs'], 'story-runtime-g1.3.2.11-evidence-index-regression');
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

// detached manifest（覆盖最终 summary 91 条；所有日志落盘后生成）。
{
  const n = makeManifest(TOTAL);
  summary.push('== detached manifest generated: ' + n + ' files（totalCommands=' + TOTAL + '）==');
  fs.writeFileSync(path.join(DIR, 'summary-gates.log'), summary.join('\n') + '\n');
  makeManifest(TOTAL);
}
// 最终复验（stdout 只打印，不进目录、不追加 summary——manifest 与目录严格一致）。
{
  let verifyOut = '';
  let verifyExit = -1;
  try {
    verifyOut = execFileSync(process.execPath, ['scripts/story-runtime-g1.3.2.11-evidence-index-regression.mjs'], { encoding: 'utf8', timeout: 120000, env: RUN_ENV, cwd: CWD });
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
