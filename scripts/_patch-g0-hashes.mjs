// 临时脚本：为 story-v3 G0 夹具计算并回填 initialStateFingerprint / inputStateFingerprint / rawOutputSha256。
// 逻辑与 scripts/story-composition-v3-scenario-runner.mjs 中的 canonicalize/sha256Text/sha256Canonical/
// mergeCoverageState 完全一致。
// 使用后如无维护需求可删除（当前作为夹具维护工具保留）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const FIXTURE_DIR = path.join(ROOT, 'scripts', 'fixtures', 'story-v3');
const RESPONSE_DIR = path.join(FIXTURE_DIR, 'fake-provider-responses');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, 'en'))
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function sha256Text(text) {
  return 'sha256:' + crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256Canonical(value) {
  return sha256Text(JSON.stringify(canonicalize(value)));
}

// 与 runner 的 mergeCoverageState 保持一致。
function mergeCoverageState(baseInitialState, overrides = {}) {
  return {
    ...baseInitialState,
    ...overrides,
    runtime: { ...(baseInitialState.runtime || {}), ...(overrides.runtime || {}) },
  };
}

const fixtureNames = fs.readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith('.json') && !name.startsWith('_'))
  .sort();

for (const name of fixtureNames) {
  const fixturePath = path.join(FIXTURE_DIR, name);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const baseFingerprint = sha256Canonical(fixture.initialState);
  fixture.initialStateFingerprint = baseFingerprint;

  // coverage 子场景指纹：按引用组分配。
  const fingerprintByResponse = new Map();
  const fingerprintByCoverage = new Map();
  for (const coverage of fixture.coverageCases || []) {
    const caseFingerprint = sha256Canonical(mergeCoverageState(fixture.initialState, coverage.initialStateOverrides));
    fingerprintByCoverage.set(coverage.coverageId, caseFingerprint);
    for (const step of coverage.steps) {
      for (const ref of step.responseRefs) fingerprintByResponse.set(ref, caseFingerprint);
    }
  }

  const bundlePath = path.join(RESPONSE_DIR, name);
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  if (bundle.scenarioId !== fixture.scenarioId) throw new Error('scenario mismatch: ' + name);
  for (const response of bundle.responses) {
    response.inputStateFingerprint = fingerprintByResponse.get(response.responseId) ?? baseFingerprint;
    response.rawOutputSha256 = sha256Text(response.rawOutput);
  }

  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
  const coverageSummary = [...fingerprintByCoverage.entries()]
    .map(([coverageId, fingerprint]) => `${coverageId}=${fingerprint.slice(0, 16)}…`)
    .join(', ');
  console.log('patched ' + name + ' -> base ' + baseFingerprint.slice(0, 16) + '…' + (coverageSummary ? ' | coverage: ' + coverageSummary : ''));
}
console.log('done');
