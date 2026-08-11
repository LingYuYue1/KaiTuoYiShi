// G1.3.2.4 门禁批处理 runner（临时工具，输出到 evidence 目录后删除自身）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = 'docs/superpowers/specs/2026-08-09-g1.3.2.4-evidence';
fs.mkdirSync(DIR, { recursive: true });

// 当前系统 shell 的 PATH 没有 git；补 GitHub Desktop 自带 git（authority-inventory/baseline 需要 git ls-files）。
const GIT_DIRS = [
  'C:/Users/25934/AppData/Local/GitHubDesktop/app-3.5.8/resources/app/git/cmd',
  'C:/Users/25934/AppData/Local/GitHubDesktop/app-3.5.8/resources/app/git/bin',
  'C:/Users/25934/AppData/Local/GitHubDesktop/app-3.5.8/resources/app/git/usr/bin',
].filter((d) => fs.existsSync(d));
const RUN_ENV = { ...process.env, PATH: GIT_DIRS.join(';') + ';' + (process.env.PATH ?? '') };

const run = (script) => {
  const t0 = Date.now();
  const outFile = path.join(DIR, path.basename(script) + '.log');
  try {
    const out = execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 180000, env: RUN_ENV });
    fs.writeFileSync(outFile, out);
    return { name: script, exit: 0, ms: Date.now() - t0 };
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    fs.writeFileSync(outFile, out);
    return { name: script, exit: e.status ?? -1, ms: Date.now() - t0, err: String(e.message).slice(0, 200) };
  }
};

const groups = [
  ['G1.3.2.4 special (6)', [
    'scripts/story-runtime-g1.3.2.4-projection-row-recovery-regression.mjs',
    'scripts/story-runtime-g1.3.2.4-projection-recovery-source-regression.mjs',
    'scripts/story-runtime-g1.3.2.4-projection-transaction-atomicity-regression.mjs',
    'scripts/story-runtime-g1.3.2.4-raw-browser-boundary-regression.mjs',
    'scripts/story-runtime-g1.3.2.4-idb-shim-ordering-regression.mjs',
    'scripts/story-runtime-g1.3.2.4-idb-shim-transaction-semantics-regression.mjs',
  ]],
  ['G1.3.2.3 special (5)', [
    'scripts/story-runtime-g1.3.2.3-projection-version-recovery-regression.mjs',
    'scripts/story-runtime-g1.3.2.3-projection-scope-regression.mjs',
    'scripts/story-runtime-g1.3.2.3-raw-trap-safety-regression.mjs',
    'scripts/story-runtime-g1.3.2.3-pointer-write-liveness-regression.mjs',
    'scripts/story-runtime-g1.3.2.3-idb-shim-scope-regression.mjs',
  ]],
  ['G1.3.2.2 special (7)', [
    'scripts/story-runtime-g1.3.2.2-outbox-ownership-regression.mjs',
    'scripts/story-runtime-g1.3.2.2-projection-branch-durable-regression.mjs',
    'scripts/story-runtime-g1.3.2.2-transaction-failure-liveness-regression.mjs',
    'scripts/story-runtime-g1.3.2.2-checkpoint-integrity-regression.mjs',
    'scripts/story-runtime-g1.3.2.2-migration-journal-candidate-regression.mjs',
    'scripts/story-runtime-g1.3.2.2-idb-shim-transaction-regression.mjs',
    'scripts/story-runtime-g1.3.2.2-raw-container-safety-regression.mjs',
  ]],
  ['G1.3.2.1 special (6)', [
    'scripts/story-runtime-g1.3.2.1-native-idb-shape-regression.mjs',
    'scripts/story-runtime-g1.3.2.1-concurrent-cas-regression.mjs',
    'scripts/story-runtime-g1.3.2.1-projection-atomic-regression.mjs',
    'scripts/story-runtime-g1.3.2.1-checkpoint-recovery-regression.mjs',
    'scripts/story-runtime-g1.3.2.1-migration-snapshot-regression.mjs',
    'scripts/story-runtime-g1.3.2.1-idempotency-regression.mjs',
  ]],
  ['G1.3.2 9.1 (9)', [
    'scripts/story-runtime-persistence-regression.mjs',
    'scripts/story-runtime-migration-regression.mjs',
    'scripts/story-runtime-reroll-cas-regression.mjs',
    'scripts/save-package-regression.mjs',
    'scripts/save-isolation-regression.mjs',
    'scripts/save-tree-regression.mjs',
    'scripts/reroll-snapshot-isolation-regression.mjs',
    'scripts/save-delta-storage-regression.mjs',
    'scripts/story-runtime-cross-tab-cas-regression.mjs',
  ]],
  ['G1.3.2 9.2 (13)', [
    'scripts/story-runtime-reducer-regression.mjs',
    'scripts/story-runtime-doomsday-beast-regression.mjs',
    'scripts/story-runtime-narrative-publication-gate-regression.mjs',
    'scripts/story-runtime-contract-regression.mjs',
    'scripts/story-runtime-schema-drift-regression.mjs',
    'scripts/story-runtime-domain-model-regression.mjs',
    'scripts/story-runtime-instance-validator-regression.mjs',
    'scripts/story-asset-catalog-contract-regression.mjs',
    'scripts/story-runtime-legacy-compat-regression.mjs',
    'scripts/news-runtime-legacy-compat-regression.mjs',
    'scripts/story-runtime-authority-inventory.mjs',
    'scripts/story-composition-v3-baseline-regression.mjs',
    'scripts/story-composition-v3-tamper-regression.mjs',
  ]],
  ['G1.3.2 9.3 (7)', [
    'scripts/story-weaving-regression.mjs',
    'scripts/story-weaving-persistence-behavior-regression.mjs',
    'scripts/news-update-regression.mjs',
    'scripts/phone-knowledge-boundary-regression.mjs',
    'scripts/cloud-backup-builder-regression.mjs',
    'scripts/cloud-backup-package-regression.mjs',
    'scripts/cloud-backup-merge-regression.mjs',
  ]],
];

const summary = [];
let failures = 0;
for (const [group, scripts] of groups) {
  summary.push('== ' + group + ' ==');
  for (const s of scripts) {
    const r = run(s);
    summary.push('  ' + r.name + ' exit=' + r.exit + ' (' + r.ms + 'ms)' + (r.err ? ' ERR: ' + r.err : ''));
    if (r.exit !== 0) failures += 1;
  }
}
fs.writeFileSync(path.join(DIR, 'summary-gates.log'), summary.join('\n'));
console.log(summary.join('\n'));
console.log('TOTAL FAILURES: ' + failures);
process.exit(failures === 0 ? 0 : 1);
