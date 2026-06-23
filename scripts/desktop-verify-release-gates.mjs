import fs from 'node:fs';
import path from 'node:path';
import {
  loadPackageJson,
  resolveDesktopVersion,
} from './desktop-release-rules.mjs';

const root = process.cwd();
const packageJson = loadPackageJson(root);
const version = resolveDesktopVersion(packageJson, process.env.DESKTOP_RELEASE_VERSION);
const releaseRoot = process.env.DESKTOP_RELEASE_OUTPUT_DIR || path.join(root, '.desktop-release');
const releaseDir = process.env.DESKTOP_RELEASE_DIR || path.join(releaseRoot, `v${version}`);
const releaseGatesPath = process.env.DESKTOP_RELEASE_GATES_FILE || path.join(releaseDir, 'release-gates.md');

assertFile(releaseGatesPath, 'release gates evidence file');

const content = fs.readFileSync(releaseGatesPath, 'utf8');
const requiredKeys = [
  'githubReleaseUrl',
  'onlineLatestJsonUrl',
  'verifyOnlineUpdateOutput',
  'installDrillMachine',
  'installVersionBefore',
  'installVersionAfter',
  'localDataDir',
  'diagnosticReportPath',
  'codeSigningDecision',
  'rollbackPreviousVersion',
];

const uncheckedItems = content.match(/^- \[ \] /gm) || [];
assert(
  uncheckedItems.length === 0,
  `release-gates.md still has ${uncheckedItems.length} unchecked checklist item(s)`,
);

for (const key of requiredKeys) {
  const value = readEvidenceKey(key);
  assert(value, `release-gates.md missing evidence key: ${key}`);
  assert(!/^(todo|tbd|pending|none|n\/a|待填|待填写|无|-)\b/i.test(value), `release-gates.md evidence key ${key} is still a placeholder`);
}

assert(/^https:\/\/github\.com\/.+\/.+\/releases\/tag\/v/i.test(readEvidenceKey('githubReleaseUrl')), 'githubReleaseUrl must be a GitHub Release tag URL');
assert(/^https?:\/\/.+latest\.json/i.test(readEvidenceKey('onlineLatestJsonUrl')), 'onlineLatestJsonUrl must point to a latest.json URL');
assert(/desktop:verify-online-update|desktop online update source verified|latest\.json/i.test(readEvidenceKey('verifyOnlineUpdateOutput')), 'verifyOnlineUpdateOutput must summarize the online update verification');
assert(/signed|unsigned|未签名|已签名|Authenticode|code signing/i.test(readEvidenceKey('codeSigningDecision')), 'codeSigningDecision must state the signing decision');

console.log(`desktop release gates evidence verified: ${releaseGatesPath}`);

function readEvidenceKey(key) {
  const pattern = new RegExp(`^-\\s*${escapeRegExp(key)}:\\s*(.+?)\\s*$`, 'm');
  return pattern.exec(content)?.[1]?.trim() || '';
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
