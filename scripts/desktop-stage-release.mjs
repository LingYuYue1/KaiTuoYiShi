import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DESKTOP_RELEASE_KIND,
  assertDesktopManifestFresh,
  assertDesktopSignatureFresh,
  buildDesktopInstallerName,
  loadPackageJson,
  resolveDesktopReleaseNotes,
  resolveDesktopVersion,
} from './desktop-release-rules.mjs';

const root = process.cwd();
const packageJson = loadPackageJson(root);
const version = resolveDesktopVersion(packageJson, process.env.DESKTOP_RELEASE_VERSION);
const bundleDir = process.env.DESKTOP_RELEASE_BUNDLE_DIR ||
  path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const installerName = buildDesktopInstallerName(version, process.env.DESKTOP_RELEASE_INSTALLER);
const releaseRoot = process.env.DESKTOP_RELEASE_OUTPUT_DIR || path.join(root, '.desktop-release');
const releaseDir = path.join(releaseRoot, `v${version}`);
const releaseNotes = resolveDesktopReleaseNotes(version, process.env.DESKTOP_RELEASE_NOTES);
const requiredFiles = [
  installerName,
  `${installerName}.sig`,
  'latest.json',
];
const installerPath = path.join(bundleDir, installerName);
const signaturePath = path.join(bundleDir, `${installerName}.sig`);
const latestPath = path.join(bundleDir, 'latest.json');

assertFile(installerPath, installerName);
assertFile(signaturePath, `${installerName}.sig`);
assertFile(latestPath, 'latest.json');
assertDesktopSignatureFresh(installerPath, signaturePath);
assertDesktopManifestFresh(installerPath, signaturePath, latestPath);

fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

const staged = requiredFiles.map((name) => {
  const source = path.join(bundleDir, name);
  assertFile(source, name);
  const target = path.join(releaseDir, name);
  fs.copyFileSync(source, target);
  return buildFileEntry(target, name);
});

const releaseManifest = {
  kind: DESKTOP_RELEASE_KIND,
  version,
  notes: releaseNotes,
  stagedAt: new Date().toISOString(),
  sourceBundleDir: bundleDir,
  files: staged,
};

fs.writeFileSync(
  path.join(releaseDir, 'release-manifest.json'),
  `${JSON.stringify(releaseManifest, null, 2)}\n`,
  'utf8',
);
fs.writeFileSync(
  path.join(releaseDir, 'SHA256SUMS.txt'),
  `${staged.map((file) => `${file.sha256}  ${file.name}`).join('\n')}\n`,
  'utf8',
);

console.log(`desktop release staged: ${releaseDir}`);

function buildFileEntry(filePath, name) {
  const buffer = fs.readFileSync(filePath);
  return {
    name,
    size: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}
