import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertDesktopSignatureFresh,
  buildDesktopInstallerName,
  loadPackageJson,
  resolveDesktopVersion,
} from './desktop-release-rules.mjs';

const root = process.cwd();
const packageJson = loadPackageJson(root);
const version = resolveDesktopVersion(packageJson, process.env.DESKTOP_SIGN_VERSION);
const bundleDir = process.env.DESKTOP_SIGN_BUNDLE_DIR ||
  path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const installerName = buildDesktopInstallerName(version, process.env.DESKTOP_SIGN_INSTALLER);
const installerPath = path.join(bundleDir, installerName);
const signaturePath = `${installerPath}.sig`;
const tauriCli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

assertFile(installerPath, 'installer');
assertFile(tauriCli, 'Tauri CLI');

const signingKeyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ||
  process.env.DESKTOP_SIGNING_PRIVATE_KEY_PATH ||
  path.join(root, '.tmp', 'desktop-updater.key');

const args = [tauriCli, 'signer', 'sign'];
const env = { ...process.env };

if (process.env.TAURI_SIGNING_PRIVATE_KEY || process.env.DESKTOP_SIGNING_PRIVATE_KEY) {
  env.TAURI_SIGNING_PRIVATE_KEY =
    process.env.TAURI_SIGNING_PRIVATE_KEY || process.env.DESKTOP_SIGNING_PRIVATE_KEY;
} else {
  assertFile(signingKeyPath, 'updater private key');
  args.push('--private-key-path', signingKeyPath);
}

if (process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD !== undefined) {
  args.push(`--password=${process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD}`);
} else if (process.env.DESKTOP_SIGNING_PRIVATE_KEY_PASSWORD !== undefined) {
  args.push(`--password=${process.env.DESKTOP_SIGNING_PRIVATE_KEY_PASSWORD}`);
} else {
  args.push('--password=');
}

args.push(installerPath);

execFileSync(process.execPath, args, {
  cwd: root,
  env,
  stdio: 'inherit',
});

assertFile(signaturePath, 'signature');
assertDesktopSignatureFresh(installerPath, signaturePath);
console.log(`desktop updater signature refreshed: ${signaturePath}`);

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}
