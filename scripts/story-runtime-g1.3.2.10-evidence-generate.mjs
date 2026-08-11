// G1.3.2.10 detached evidence generator. It reuses the prior gate list by
// parsing the read-only G1.3.2.9 generator, without executing or rewriting it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'docs/superpowers/specs/2026-08-09-g1.3.2.10-evidence';
fs.mkdirSync(DIR, { recursive: true });
for (const entry of fs.readdirSync(DIR, { withFileTypes: true })) {
  if (!entry.isFile()) throw new Error('unexpected non-file in evidence directory: ' + entry.name);
  fs.unlinkSync(path.join(DIR, entry.name));
}

const BASE_ENV = { ...process.env };
const CWD = process.cwd();

const NEW_SPECIALS = [
  'story-runtime-g1.3.2.10-article-namespace-legacy-regression.mjs',
  'story-runtime-g1.3.2.10-incoming-persistable-domain-regression.mjs',
  'story-runtime-g1.3.2.10-article-owner-diagnostic-regression.mjs',
  'story-runtime-g1.3.2.10-complex-snapshot-evidence-regression.mjs',
];
const oldGeneratorSource = fs.readFileSync('scripts/story-runtime-g1.3.2.9-evidence-generate.mjs', 'utf8');
const OLD_GATES = [...new Set([...oldGeneratorSource.matchAll(/'([^']+\.mjs)'/g)].map((match) => match[1]))];
if (OLD_GATES.length !== 78) throw new Error('expected 78 read-only old gates, got ' + OLD_GATES.length);

const SELF = 'story-runtime-g1.3.2.10-evidence-index-regression';
const expectedNames = [
  ...NEW_SPECIALS.map((name) => name.replace(/\.mjs$/, '')),
  ...OLD_GATES.map((name) => name.replace(/\.mjs$/, '')),
  'tsc',
  'git-diff-check',
  SELF,
];
if (new Set(expectedNames).size !== expectedNames.length) throw new Error('expected command names contain duplicates');

function run(command, args, name, extraEnv = {}) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  let output = '';
  let exit = 0;
  try {
    output = execFileSync(command, args, {
      cwd: CWD,
      env: { ...BASE_ENV, ...extraEnv },
      encoding: 'utf8',
      timeout: 240000,
    });
  } catch (error) {
    output = String(error.stdout || '') + String(error.stderr || '');
    exit = error.status ?? -1;
  }
  fs.writeFileSync(path.join(DIR, name + '.log'), output);
  return {
    exit,
    line: 'command=' + name + ' cwd=' + CWD + ' start=' + startedAt + ' end=' + new Date().toISOString() + ' exit=' + exit + ' ms=' + (Date.now() - startMs),
  };
}

const summary = [];
let failures = 0;
summary.push('== G1.3.2.10 special (4) ==');
for (const script of NEW_SPECIALS) {
  const result = run(process.execPath, ['scripts/' + script], script.replace(/\.mjs$/, ''));
  summary.push('  ' + result.line);
  if (result.exit !== 0) failures += 1;
}
summary.push('== read-only old complete gate list (78) ==');
for (const script of OLD_GATES) {
  const result = run(process.execPath, ['scripts/' + script], script.replace(/\.mjs$/, ''));
  summary.push('  ' + result.line);
  if (result.exit !== 0) failures += 1;
}

{
  const result = run(process.execPath, [path.join('node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], 'tsc');
  summary.push('== tsc ==\n  ' + result.line);
  if (result.exit !== 0) failures += 1;
}
{
  const result = run('git', ['diff', '--check'], 'git-diff-check');
  summary.push('== git diff --check ==\n  ' + result.line);
  if (result.exit !== 0) failures += 1;
}

const frozenFiles = [
  'scripts/fixtures/story-v3/story-runtime-contract.fixture.json',
  'services/storyRuntime/runtimeSchema.generated.ts',
  'services/storyRuntime/runtimeValidator.ts',
  'services/storyRuntime/normalization.ts',
  'services/storyRuntime/id.ts',
  'services/storyRuntime/storyAssetCatalogStore.ts',
];
fs.writeFileSync(path.join(DIR, 'frozen-hashes.log'), frozenFiles.map((file) => (
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') + '  ' + file
)).join('\n') + '\n');

const scanFiles = ['App.tsx', 'hooks/useGame/sendWorkflow.ts'];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'storybook-static', 'kaituo-star-rail-ui'].includes(entry.name)) walk(filePath);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      scanFiles.push(filePath);
    }
  }
}
walk('hooks');
walk('components');
const formalPattern = /services\/storyRuntime|storyRuntime\/projectionAdapter|storyRuntime\/rawLegacyReader|storyRuntime\/coreRuntimeStore|storyRuntime\/runtimeCheckpoint/;
const formalHits = scanFiles.filter((file) => formalPattern.test(fs.readFileSync(file, 'utf8')));
fs.writeFileSync(path.join(DIR, 'formal-import-scan.log'), 'matches: ' + formalHits.length + '\n' + formalHits.join('\n') + '\n');

const rootTmp = fs.readdirSync('.').filter((name) => /^\.tmp/.test(name));
fs.writeFileSync(path.join(DIR, 'tmp-check.log'), [
  'services/storyRuntime/.tmp exists: ' + fs.existsSync('services/storyRuntime/.tmp'),
  'root .tmp* count: ' + rootTmp.length,
  ...rootTmp.map((name) => name + ' mtime=' + fs.statSync(name).mtime.toISOString()),
].join('\n') + '\n');

fs.writeFileSync(path.join(DIR, 'whitelist-diff.log'), [
  'production:',
  'services/storyRuntime/projectionStore.ts',
  'services/storyRuntime/projectionAdapter.ts',
  'old-test-minimal-adaptation:',
  'scripts/story-runtime-g1.3.2.9-article-key-codec-regression.mjs',
  'scripts/story-runtime-g1.3.2.9-complex-snapshot-regression.mjs',
  'new-tests:',
  ...NEW_SPECIALS.map((name) => 'scripts/' + name),
].join('\n') + '\n');

fs.writeFileSync(path.join(DIR, 'expected-commands.json'), JSON.stringify({
  expected: expectedNames,
  generatedAt: new Date().toISOString(),
}, null, 1) + '\n');
summary.push('== TOTAL_COMMANDS=' + expectedNames.length + ' ==');
fs.writeFileSync(path.join(DIR, 'summary-gates.log'), summary.join('\n') + '\n');

// Counted execution occurs after all non-self commands. Full equality is
// checked again after its metadata and detached manifest are finalized.
const counted = run(process.execPath, ['scripts/' + SELF + '.mjs'], SELF, { G13210_COUNTED_RUN: '1' });
summary.push('== evidence-index counted execution ==\n  ' + counted.line);
if (counted.exit !== 0) failures += 1;
fs.writeFileSync(path.join(DIR, 'summary-gates.log'), summary.join('\n') + '\n');

function writeManifest() {
  const files = fs.readdirSync(DIR).filter((name) => name !== 'evidence-manifest.json').sort();
  const manifest = {
    generatedAt: new Date().toISOString(),
    meta: { excludesSelf: true, totalCommands: expectedNames.length },
    files: files.map((name) => {
      const filePath = path.join(DIR, name);
      const stat = fs.statSync(filePath);
      return { name, size: stat.size, sha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') };
    }),
  };
  fs.writeFileSync(path.join(DIR, 'evidence-manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
}
writeManifest();

let finalOutput = '';
let finalExit = 0;
try {
  finalOutput = execFileSync(process.execPath, ['scripts/' + SELF + '.mjs'], { cwd: CWD, env: BASE_ENV, encoding: 'utf8', timeout: 120000 });
} catch (error) {
  finalOutput = String(error.stdout || '') + String(error.stderr || '');
  finalExit = error.status ?? -1;
}
console.log('== evidence-index final verification ==\n' + finalOutput);
if (finalExit !== 0) failures += 1;
console.log(summary.join('\n'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures === 0 ? 0 : 1);
