import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
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
const localLatestPath = path.join(releaseDir, 'latest.json');
const localSignaturePath = path.join(releaseDir, `${installerName}.sig`);
const onlineUpdateUrl = process.env.DESKTOP_ONLINE_UPDATE_URL || readBundledUpdateEndpoint();

assertFile(localLatestPath, 'local latest.json');
assertFile(localSignaturePath, 'local updater signature');
assert(onlineUpdateUrl, 'Missing desktop online update URL. Set DESKTOP_ONLINE_UPDATE_URL or configure Tauri updater endpoint.');

const localLatest = readJson(localLatestPath);
const onlineLatest = await readJsonFromSource(onlineUpdateUrl);
assert(localLatest.version === version, 'local latest.json version mismatch');
assert(onlineLatest.version === version, 'online latest.json version mismatch');
assertEquivalentJson(onlineLatest, localLatest, 'online latest.json differs from the staged local latest.json');

const localSignature = fs.readFileSync(localSignaturePath, 'utf8').trim();
for (const platformName of ['windows-x86_64-nsis', 'windows-x86_64']) {
  const platform = onlineLatest.platforms?.[platformName];
  assert(platform, `online latest.json missing ${platformName}`);
  assert(platform.signature === localSignature, `online latest.json signature mismatch for ${platformName}`);
  assert(
    typeof platform.url === 'string' && platform.url.includes(encodeURIComponent(installerName)),
    `online latest.json URL must reference ${installerName}`,
  );
}

console.log(`desktop online update source verified: ${onlineUpdateUrl}`);

function readBundledUpdateEndpoint() {
  const config = readJson(path.join(root, 'src-tauri', 'tauri.conf.json'));
  return config.plugins?.updater?.endpoints?.[0] || '';
}

async function readJsonFromSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'KaiTuoYiShiDesktopReleaseVerifier/1.0',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch online latest.json: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
  const filePath = source.startsWith('file:')
    ? fileURLToPath(source)
    : path.resolve(root, source);
  return readJson(filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertEquivalentJson(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
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
