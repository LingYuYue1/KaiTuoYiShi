// G1.3.2.10 detached evidence verifier.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'docs/superpowers/specs/2026-08-09-g1.3.2.10-evidence';
const REPORT = 'docs/superpowers/specs/2026-08-09-story-composition-v3-g1.3.2.10-report.md';
const SELF = 'story-runtime-g1.3.2.10-evidence-index-regression';
const countedRun = process.env.G13210_COUNTED_RUN === '1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const newSpecials = [
  'story-runtime-g1.3.2.10-article-namespace-legacy-regression',
  'story-runtime-g1.3.2.10-incoming-persistable-domain-regression',
  'story-runtime-g1.3.2.10-article-owner-diagnostic-regression',
  'story-runtime-g1.3.2.10-complex-snapshot-evidence-regression',
];
const oldGeneratorSource = fs.readFileSync('scripts/story-runtime-g1.3.2.9-evidence-generate.mjs', 'utf8');
const oldGates = [...new Set([...oldGeneratorSource.matchAll(/'([^']+\.mjs)'/g)].map((match) => match[1].replace(/\.mjs$/, '')))];
assert(oldGates.length === 78, 'expected 78 old gates, got ' + oldGates.length);
const independentlyExpected = [...newSpecials, ...oldGates, 'tsc', 'git-diff-check', SELF];

const expectedDocument = JSON.parse(fs.readFileSync(path.join(DIR, 'expected-commands.json'), 'utf8'));
const expected = expectedDocument.expected;
assert(Array.isArray(expected), 'expected-commands.json missing expected array');
assert(expected.length === independentlyExpected.length, 'expected command count mismatch');
assert(new Set(expected).size === expected.length, 'expected command names contain duplicates');
assert(JSON.stringify(expected) === JSON.stringify(independentlyExpected), 'expected command names differ from independently derived list');

const report = fs.readFileSync(REPORT, 'utf8');
const reportCommandMatch = report.match(/完整唯一命令集合为 \*\*(\d+) 条\*\*/);
assert(reportCommandMatch, 'report command count regex did not match');
assert(Number(reportCommandMatch[1]) === expected.length, 'report command count differs from expected');
const reportFileMatch = report.match(/evidence 文件 \*\*(\d+) 个\*\*/);
assert(reportFileMatch, 'report evidence file count regex did not match');

const summary = fs.readFileSync(path.join(DIR, 'summary-gates.log'), 'utf8');
const metadata = [...summary.matchAll(/command=([^\s]+) cwd=(.*?) start=([^\s]+) end=([^\s]+) exit=(-?\d+) ms=(\d+)/g)].map((match) => ({
  name: match[1],
  cwd: match[2],
  start: match[3],
  end: match[4],
  exit: Number(match[5]),
  ms: Number(match[6]),
}));
const expectedForMode = countedRun ? expected.filter((name) => name !== SELF) : expected;
assert(metadata.length === expectedForMode.length, 'summary metadata count mismatch: ' + metadata.length + ' vs ' + expectedForMode.length);
assert(new Set(metadata.map((entry) => entry.name)).size === metadata.length, 'summary command names contain duplicates');
assert(JSON.stringify(metadata.map((entry) => entry.name)) === JSON.stringify(expectedForMode), 'summary command names differ from expected order');
for (const entry of metadata) {
  assert(entry.cwd === process.cwd(), 'unexpected cwd for ' + entry.name + ': ' + entry.cwd);
  assert(Number.isFinite(Date.parse(entry.start)) && Number.isFinite(Date.parse(entry.end)), 'invalid timestamps for ' + entry.name);
  assert(entry.exit === 0, 'non-zero evidence command: ' + entry.name + ' exit=' + entry.exit);
  assert(entry.ms >= 0, 'negative duration for ' + entry.name);
}
assert(summary.includes('TOTAL_COMMANDS=' + expected.length), 'summary missing programmatic total');

const frozenLines = fs.readFileSync(path.join(DIR, 'frozen-hashes.log'), 'utf8').trim().split(/\r?\n/);
assert(frozenLines.length === 6, 'frozen hash line count must be 6');
for (const line of frozenLines) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/);
  assert(match, 'invalid frozen hash line: ' + line);
  assert(sha256(match[2]) === match[1], 'frozen hash changed: ' + match[2]);
}
assert(fs.readFileSync(path.join(DIR, 'formal-import-scan.log'), 'utf8').startsWith('matches: 0\n'), 'formal import scan is not zero');
const tmpLog = fs.readFileSync(path.join(DIR, 'tmp-check.log'), 'utf8');
assert(tmpLog.includes('services/storyRuntime/.tmp exists: false'), 'services/storyRuntime/.tmp exists');
assert(tmpLog.includes('root .tmp* count: 25'), 'root historical .tmp* count changed');
const whitelist = fs.readFileSync(path.join(DIR, 'whitelist-diff.log'), 'utf8');
assert(whitelist.includes('services/storyRuntime/projectionStore.ts') && whitelist.includes('services/storyRuntime/projectionAdapter.ts'), 'production whitelist evidence incomplete');

if (!countedRun) {
  const manifestPath = path.join(DIR, 'evidence-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.meta?.excludesSelf === true, 'manifest must exclude itself');
  assert(manifest.meta?.totalCommands === expected.length, 'manifest totalCommands mismatch');
  const actualFiles = fs.readdirSync(DIR).filter((name) => name !== 'evidence-manifest.json').sort();
  assert(manifest.files.length === actualFiles.length, 'manifest file count differs from directory');
  assert(Number(reportFileMatch[1]) === actualFiles.length, 'report evidence file count differs from directory');
  assert(JSON.stringify(manifest.files.map((entry) => entry.name)) === JSON.stringify(actualFiles), 'manifest paths differ from directory');
  for (const entry of manifest.files) {
    const filePath = path.join(DIR, entry.name);
    const stat = fs.statSync(filePath);
    assert(stat.size === entry.size, 'manifest size mismatch: ' + entry.name);
    assert(sha256(filePath) === entry.sha256, 'manifest hash mismatch: ' + entry.name);
  }
  assert(actualFiles.length === 91, 'expected 91 evidence files, got ' + actualFiles.length);
}

console.log('story-runtime-g1.3.2.10-evidence-index regression passed.');
console.log('commands=' + expected.length + ' mode=' + (countedRun ? 'counted-bootstrap' : 'final') + ' files=' + (countedRun ? 'pending' : reportFileMatch[1]));
