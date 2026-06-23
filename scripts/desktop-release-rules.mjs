import fs from 'node:fs';
import path from 'node:path';

export const DESKTOP_RELEASE_KIND = 'kaituoyishi-desktop-release';
export const DEFAULT_DESKTOP_REPOSITORY = 'LingYuYue1/KaiTuoYiShi';

export function loadPackageJson(root = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
}

export function resolveDesktopVersion(packageJson, specificVersion) {
  const version = specificVersion || process.env.DESKTOP_VERSION || packageJson.version;
  assertSemver(version);
  return version;
}

export function buildDesktopInstallerName(version, explicitInstallerName) {
  return explicitInstallerName || `开拓轶事_${version}_x64-setup.exe`;
}

export function resolveDesktopReleaseNotes(version, specificNotes) {
  return specificNotes
    || process.env.DESKTOP_RELEASE_NOTES
    || process.env.DESKTOP_UPDATE_NOTES
    || `开拓轶事 Desktop Edition ${version}`;
}

export function buildDesktopDownloadUrl(version, installerName, explicitUrl) {
  if (explicitUrl) return explicitUrl;
  const repository = process.env.DESKTOP_GITHUB_REPOSITORY || DEFAULT_DESKTOP_REPOSITORY;
  const encodedInstallerName = encodeURIComponent(installerName);
  return `https://github.com/${repository}/releases/download/v${version}/${encodedInstallerName}`;
}

export function assertDesktopSignatureFresh(installerPath, signaturePath) {
  const installerStat = fs.statSync(installerPath);
  const signatureStat = fs.statSync(signaturePath);
  if (signatureStat.mtimeMs + 1000 < installerStat.mtimeMs) {
    throw new Error(
      `Desktop updater signature is older than installer. Re-sign before publishing: ${signaturePath}`,
    );
  }
}

export function assertDesktopManifestFresh(installerPath, signaturePath, manifestPath) {
  const installerStat = fs.statSync(installerPath);
  const signatureStat = fs.statSync(signaturePath);
  const manifestStat = fs.statSync(manifestPath);
  const newestInputTime = Math.max(installerStat.mtimeMs, signatureStat.mtimeMs);
  if (manifestStat.mtimeMs + 1000 < newestInputTime) {
    throw new Error(
      `Desktop updater manifest is older than installer or signature. Regenerate before publishing: ${manifestPath}`,
    );
  }
}

export function assertSemver(version) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Desktop release version must be semver-like: ${version}`);
  }
}
