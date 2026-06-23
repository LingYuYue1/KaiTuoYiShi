import fs from 'node:fs';
import path from 'node:path';
import {
  assertDesktopSignatureFresh,
  buildDesktopDownloadUrl,
  buildDesktopInstallerName,
  loadPackageJson,
  resolveDesktopReleaseNotes,
  resolveDesktopVersion,
} from './desktop-release-rules.mjs';

const root = process.cwd();
const packageJson = loadPackageJson(root);
const version = resolveDesktopVersion(packageJson, process.env.DESKTOP_UPDATE_VERSION);
const bundleDir = process.env.DESKTOP_UPDATE_BUNDLE_DIR ||
  path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const installerName = buildDesktopInstallerName(version, process.env.DESKTOP_UPDATE_INSTALLER);
const installerPath = path.join(bundleDir, installerName);
const signaturePath = `${installerPath}.sig`;
const latestPath = path.join(bundleDir, 'latest.json');
const downloadUrl = buildDesktopDownloadUrl(version, installerName, process.env.DESKTOP_UPDATE_URL);

assertFile(installerPath, 'installer');
assertFile(signaturePath, 'signature');
assertDesktopSignatureFresh(installerPath, signaturePath);

const signature = fs.readFileSync(signaturePath, 'utf8').trim();
const pubDate = process.env.DESKTOP_UPDATE_PUB_DATE || new Date().toISOString();
const notes = resolveDesktopReleaseNotes(version, process.env.DESKTOP_UPDATE_NOTES);
const platform = {
  url: downloadUrl,
  signature,
};
const manifest = {
  version,
  notes,
  pub_date: pubDate,
  platforms: {
    'windows-x86_64-nsis': platform,
    'windows-x86_64': platform,
  },
};

fs.writeFileSync(latestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`desktop updater manifest written: ${latestPath}`);

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}
