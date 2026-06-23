import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DESKTOP_RELEASE_KIND,
  buildDesktopInstallerName,
  loadPackageJson,
  resolveDesktopVersion,
} from './desktop-release-rules.mjs';

const root = process.cwd();
const packageJson = loadPackageJson(root);
const version = resolveDesktopVersion(packageJson, process.env.DESKTOP_RELEASE_VERSION);
const installerName = buildDesktopInstallerName(version, process.env.DESKTOP_RELEASE_INSTALLER);
const releaseRoot = process.env.DESKTOP_RELEASE_OUTPUT_DIR || path.join(root, '.desktop-release');
const releaseDir = process.env.DESKTOP_RELEASE_DIR || path.join(releaseRoot, `v${version}`);

const releaseManifestPath = path.join(releaseDir, 'release-manifest.json');
const checksumsPath = path.join(releaseDir, 'SHA256SUMS.txt');
const latestPath = path.join(releaseDir, 'latest.json');
const signatureName = `${installerName}.sig`;

assertFile(releaseManifestPath, 'release manifest');
assertFile(checksumsPath, 'SHA256SUMS');
assertFile(latestPath, 'latest.json');
assertFile(path.join(releaseDir, installerName), 'installer');
assertFile(path.join(releaseDir, signatureName), 'signature');

const releaseManifest = readJson(releaseManifestPath);
assert(releaseManifest.kind === DESKTOP_RELEASE_KIND, 'release manifest kind mismatch');
assert(releaseManifest.version === version, 'release manifest version mismatch');
assert(Array.isArray(releaseManifest.files), 'release manifest files must be an array');

const expectedNames = new Set([installerName, signatureName, 'latest.json']);
const manifestNames = new Set(releaseManifest.files.map((file) => file?.name));
for (const name of expectedNames) {
  assert(manifestNames.has(name), `release manifest missing ${name}`);
}

const checksumMap = readChecksumMap(checksumsPath);
for (const file of releaseManifest.files) {
  assert(typeof file.name === 'string' && file.name.length > 0, 'release manifest contains an unnamed file');
  const filePath = path.join(releaseDir, file.name);
  assertFile(filePath, file.name);
  const buffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  assert(file.size === buffer.length, `size mismatch for ${file.name}`);
  assert(file.sha256 === sha256, `manifest SHA256 mismatch for ${file.name}`);
  assert(checksumMap.get(file.name) === sha256, `SHA256SUMS mismatch for ${file.name}`);
}

const latest = readJson(latestPath);
assert(latest.version === version, 'latest.json version mismatch');
assert(typeof latest.notes === 'string' && latest.notes.trim().length > 0, 'latest.json notes must not be empty');
assert(typeof latest.pub_date === 'string' && latest.pub_date.trim().length > 0, 'latest.json pub_date must not be empty');
const signature = fs.readFileSync(path.join(releaseDir, signatureName), 'utf8').trim();
for (const platformName of ['windows-x86_64-nsis', 'windows-x86_64']) {
  const platform = latest.platforms?.[platformName];
  assert(platform, `latest.json missing ${platformName}`);
  assert(platform.signature === signature, `latest.json signature mismatch for ${platformName}`);
  assert(typeof platform.url === 'string' && platform.url.includes(encodeURIComponent(installerName)), `latest.json URL must reference ${installerName}`);
}

console.log(`desktop release verified: ${releaseDir}`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readChecksumMap(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const map = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})\s+(.+)$/i.exec(line);
    assert(match, `invalid checksum line: ${line}`);
    map.set(match[2], match[1]);
  }
  return map;
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

