import fs from 'node:fs';
import path from 'node:path';
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

const checks = [];

checkPackageScripts();
checkTauriConfig();
checkDesktopBoundaries();
checkStorageManagerSurface();
checkDesktopHomeSurface();
checkReleaseStaging();
checkManualGates();

printReport();

const missingCount = checks.filter((check) => check.status === 'missing').length;
if (missingCount > 0) {
  process.exitCode = 1;
}

function checkPackageScripts() {
  const requiredScripts = [
    'desktop:dev',
    'desktop:build',
    'desktop:build:updater',
    'desktop:sign-updater',
    'desktop:update-manifest',
    'desktop:stage-release',
    'desktop:verify-release',
    'desktop:verify-online-update',
    'desktop:install-update-drill',
    'desktop:release-gates',
    'desktop:verify-release-gates',
    'desktop:github-release-notes',
    'desktop:github-upload-commands',
    'desktop:code-signing-decision',
    'desktop:storage-strategy',
    'desktop:storage-audit',
    'desktop:preflight',
    'test:desktop-edition',
  ];
  for (const scriptName of requiredScripts) {
    addCheck(
      packageJson.scripts?.[scriptName] ? 'ready' : 'missing',
      `package script: ${scriptName}`,
      packageJson.scripts?.[scriptName] || 'missing from package.json',
    );
  }
  addCheck(packageJson.dependencies?.['@tauri-apps/api'] ? 'ready' : 'missing', '@tauri-apps/api dependency', packageJson.dependencies?.['@tauri-apps/api'] || 'missing');
  addCheck(packageJson.dependencies?.['@tauri-apps/plugin-updater'] ? 'ready' : 'missing', '@tauri-apps/plugin-updater dependency', packageJson.dependencies?.['@tauri-apps/plugin-updater'] || 'missing');
  addCheck(packageJson.devDependencies?.['@tauri-apps/cli'] ? 'ready' : 'missing', '@tauri-apps/cli dev dependency', packageJson.devDependencies?.['@tauri-apps/cli'] || 'missing');
}

function checkTauriConfig() {
  const tauriConfigPath = absolute('src-tauri/tauri.conf.json');
  const updaterConfigPath = absolute('src-tauri/tauri.updater.conf.json');
  const tauriConfig = readJsonMaybe(tauriConfigPath);
  const updaterConfig = readJsonMaybe(updaterConfigPath);

  addCheck(Boolean(tauriConfig), 'src-tauri/tauri.conf.json', tauriConfig ? 'readable JSON' : 'missing or invalid JSON');
  addCheck(Boolean(updaterConfig), 'src-tauri/tauri.updater.conf.json', updaterConfig ? 'readable JSON' : 'missing or invalid JSON');
  addCheck(Boolean(tauriConfig?.identifier), 'Tauri stable identifier', tauriConfig?.identifier || 'missing identifier');
  addCheck(Boolean(tauriConfig?.bundle?.targets?.includes('nsis')), 'Windows NSIS installer target', JSON.stringify(tauriConfig?.bundle?.targets || []));
  addCheck(Boolean(tauriConfig?.plugins?.updater?.endpoints?.some((endpoint) => endpoint.includes('latest.json'))), 'Tauri updater latest.json endpoint', tauriConfig?.plugins?.updater?.endpoints?.join(', ') || 'missing endpoint');
  addCheck(Boolean(tauriConfig?.plugins?.updater?.pubkey), 'Tauri updater public key', tauriConfig?.plugins?.updater?.pubkey ? 'configured' : 'missing pubkey');
  addCheck(updaterConfig?.bundle?.createUpdaterArtifacts === true, 'Updater artifact build config', updaterConfig?.bundle?.createUpdaterArtifacts === true ? 'createUpdaterArtifacts=true' : 'missing createUpdaterArtifacts=true');
}

function checkDesktopBoundaries() {
  const requiredPaths = [
    'src-tauri',
    'services/desktop',
    'services/storage',
    'utils/platform',
    'services/desktop/desktopSaveMirror.ts',
    'services/desktop/desktopSaveDeltaMirror.ts',
    'services/desktop/desktopAssetMirror.ts',
    'services/desktop/desktopSaveBackup.ts',
    'services/desktop/desktopDiagnostics.ts',
    'services/desktop/desktopReleaseInfo.ts',
    'scripts/desktop-storage-audit.mjs',
  ];
  for (const relativePath of requiredPaths) {
    addCheck(exists(relativePath), relativePath, exists(relativePath) ? 'present' : 'missing');
  }
}

function checkStorageManagerSurface() {
  const storageManagerPath = 'components/features/Settings/StorageManager.tsx';
  const storageManager = readMaybe(storageManagerPath);
  addCheck(Boolean(storageManager), 'StorageManager.tsx desktop surface', storageManager ? 'readable' : 'missing');
  if (!storageManager) return;

  const requiredStrings = [
    'Desktop Edition',
    '备份详情',
    '迁移前完整备份',
    '迁移预估',
    '修复镜像索引',
    '存档镜像健康',
    '增量镜像健康',
    '资源镜像健康',
    '检查更新',
    '下载并安装',
  ];
  for (const text of requiredStrings) {
    addCheck(storageManager.includes(text), `StorageManager label: ${text}`, storageManager.includes(text) ? 'present' : 'missing');
  }
}

function checkDesktopHomeSurface() {
  const homeScreenPath = 'components/layout/DesktopHomeScreen.tsx';
  const appPath = 'App.tsx';
  const homeScreen = readMaybe(homeScreenPath);
  const app = readMaybe(appPath);
  addCheck(Boolean(homeScreen), 'DesktopHomeScreen.tsx desktop surface', homeScreen ? 'readable' : 'missing');
  if (!homeScreen || !app) return;

  const requiredStrings = [
    'DesktopHomeScreen',
    '继续游戏',
    '读取光锥',
    '踏上旅途',
    '存储管理',
    '写入探针',
    '检查更新',
    '下载并安装',
    'openDesktopDataDir',
  ];
  for (const text of requiredStrings) {
    addCheck(homeScreen.includes(text), `DesktopHomeScreen label: ${text}`, homeScreen.includes(text) ? 'present' : 'missing');
  }
  addCheck(app.includes('DesktopHomeScreen'), 'App.tsx desktop home import', app.includes('DesktopHomeScreen') ? 'present' : 'missing');
  addCheck(app.includes("isDesktopRuntime() ? ("), 'App.tsx desktop home branch', app.includes("isDesktopRuntime() ? (") ? 'present' : 'missing');
  addCheck(app.includes('LandingPage'), 'App.tsx web landing page', app.includes('LandingPage') ? 'present' : 'missing');
}

function checkReleaseStaging() {
  const releaseManifestPath = path.join(releaseDir, 'release-manifest.json');
  const checksumsPath = path.join(releaseDir, 'SHA256SUMS.txt');
  const latestPath = path.join(releaseDir, 'latest.json');
  const installerPath = path.join(releaseDir, installerName);
  const signaturePath = path.join(releaseDir, `${installerName}.sig`);
  const drillPath = path.join(releaseDir, 'install-update-drill.md');
  const releaseGatesPath = path.join(releaseDir, 'release-gates.md');
  const githubReleaseNotesPath = path.join(releaseDir, 'github-release-notes.md');
  const githubUploadCommandsPath = path.join(releaseDir, 'github-upload-commands.md');
  const codeSigningDecisionPath = path.join(releaseDir, 'code-signing-decision.md');
  const storageStrategyPath = path.join(releaseDir, 'storage-strategy.md');
  const githubReleaseNotes = readMaybe(githubReleaseNotesPath);
  const githubUploadCommands = readMaybe(githubUploadCommandsPath);
  const installUpdateDrill = readMaybe(drillPath);

  addCheck(fs.existsSync(releaseDir), `staged release directory: ${path.relative(root, releaseDir)}`, fs.existsSync(releaseDir) ? 'present' : 'missing; run desktop:stage-release after building');
  addCheck(fs.existsSync(releaseManifestPath), 'release-manifest.json', fs.existsSync(releaseManifestPath) ? 'present' : 'missing');
  addCheck(fs.existsSync(checksumsPath), 'SHA256SUMS.txt', fs.existsSync(checksumsPath) ? 'present' : 'missing');
  addCheck(fs.existsSync(latestPath), 'latest.json', fs.existsSync(latestPath) ? 'present' : 'missing');
  addCheck(fs.existsSync(installerPath), installerName, fs.existsSync(installerPath) ? formatBytes(fs.statSync(installerPath).size) : 'missing');
  addCheck(fs.existsSync(signaturePath), `${installerName}.sig`, fs.existsSync(signaturePath) ? 'present' : 'missing');
  addCheck(fs.existsSync(drillPath), 'install-update-drill.md', fs.existsSync(drillPath) ? 'present' : 'missing; run desktop:install-update-drill');
  addCheck(fs.existsSync(releaseGatesPath), 'release-gates.md', fs.existsSync(releaseGatesPath) ? 'present' : 'missing; run desktop:release-gates');
  addCheck(fs.existsSync(githubReleaseNotesPath), 'github-release-notes.md', fs.existsSync(githubReleaseNotesPath) ? 'present' : 'missing; run desktop:github-release-notes');
  addCheck(fs.existsSync(githubUploadCommandsPath), 'github-upload-commands.md', fs.existsSync(githubUploadCommandsPath) ? 'present' : 'missing; run desktop:github-upload-commands');
  addCheck(fs.existsSync(codeSigningDecisionPath), 'code-signing-decision.md', fs.existsSync(codeSigningDecisionPath) ? 'present' : 'missing; run desktop:code-signing-decision');
  addCheck(fs.existsSync(storageStrategyPath), 'storage-strategy.md', fs.existsSync(storageStrategyPath) ? 'present' : 'missing; run desktop:storage-strategy');
  addCheck(githubReleaseNotes.includes('Windows 安全提示'), 'github-release-notes Windows security warning', githubReleaseNotes.includes('Windows 安全提示') ? 'present' : 'missing Windows security warning text');
  addCheck(githubReleaseNotes.includes('SHA256SUMS.txt'), 'github-release-notes checksum instructions', githubReleaseNotes.includes('SHA256SUMS.txt') ? 'present' : 'missing checksum instructions');
  addCheck(githubUploadCommands.includes('localFileWarning') || githubUploadCommands.includes('没有上传计划文件'), 'github-upload-commands local file warning', (githubUploadCommands.includes('localFileWarning') || githubUploadCommands.includes('没有上传计划文件')) ? 'present' : 'missing local file warning');
  addCheck(installUpdateDrill.includes('Windows 安全提示'), 'install-update-drill Windows security prompt', installUpdateDrill.includes('Windows 安全提示') ? 'present' : 'missing Windows security prompt');

  const latest = readJsonMaybe(latestPath);
  addCheck(latest?.version === version, 'staged latest.json version', latest?.version ? `${latest.version} (expected ${version})` : 'missing or unreadable latest.json');
}

function checkManualGates() {
  const codeSigningDecisionPath = path.join(releaseDir, 'code-signing-decision.md');
  const githubReleaseNotesPath = path.join(releaseDir, 'github-release-notes.md');
  const storageStrategyPath = path.join(releaseDir, 'storage-strategy.md');
  const codeSigningDecision = readMaybe(codeSigningDecisionPath);
  const githubReleaseNotes = readMaybe(githubReleaseNotesPath);
  const hasCodeSigningDecision = hasResolvedCodeSigningDecision(codeSigningDecision, githubReleaseNotes);
  addCheck('manual', 'GitHub Release upload', 'Upload installer, signature, latest.json, release-manifest.json, and SHA256SUMS.txt before public beta.');
  addCheck('manual', 'desktop:verify-online-update against real GitHub Release', 'Run after GitHub Release is uploaded so online latest.json is proven.');
  addCheck('manual', 'Real install/update/restart drill', 'Use install-update-drill.md on an installed Windows build.');
  addCheck(
    hasCodeSigningDecision ? 'ready' : 'manual',
    '代码签名 / code signing decision',
    hasCodeSigningDecision
      ? 'code-signing-decision.md and github-release-notes.md document unsigned beta policy, SHA256 verification, and Windows warning.'
      : 'Decide whether public builds need a Windows code signing certificate.',
  );
  addCheck(
    hasResolvedStorageStrategy(readMaybe(storageStrategyPath))
      ? 'ready'
      : 'manual',
    'Deeper desktop primary storage migration',
    hasResolvedStorageStrategy(readMaybe(storageStrategyPath))
      ? 'storage-strategy.md records the JSON file-primary recommendation and defers SQLite until a later milestone.'
      : 'Use storage-strategy.md to decide the JSON file-primary versus SQLite path before changing the save write source.',
  );
}

function printReport() {
  const counts = {
    ready: checks.filter((check) => check.status === 'ready').length,
    missing: checks.filter((check) => check.status === 'missing').length,
    manual: checks.filter((check) => check.status === 'manual').length,
  };

  console.log(`Desktop Edition readiness for v${version}`);
  console.log(`Release directory: ${releaseDir}`);
  console.log(`Summary: ready=${counts.ready}, missing=${counts.missing}, manual=${counts.manual}`);
  console.log('');

  for (const status of ['missing', 'manual', 'ready']) {
    const items = checks.filter((check) => check.status === status);
    if (items.length === 0) continue;
    console.log(`[${status}]`);
    for (const item of items) {
      console.log(`- ${item.label}: ${item.detail}`);
    }
    console.log('');
  }

  if (counts.missing === 0) {
    console.log('Local desktop prerequisites are ready. Manual release gates still need human or online verification.');
  } else {
    console.log('Local desktop prerequisites are incomplete. Resolve missing items before treating this build as beta-ready.');
  }
}

function addCheck(statusOrCondition, label, detail) {
  const status = typeof statusOrCondition === 'boolean'
    ? (statusOrCondition ? 'ready' : 'missing')
    : statusOrCondition;
  checks.push({ status, label, detail });
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function absolute(relativePath) {
  return path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
}

function readMaybe(relativePath) {
  try {
    return fs.readFileSync(absolute(relativePath), 'utf8');
  } catch {
    return '';
  }
}

function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(absolute(filePath), 'utf8'));
  } catch {
    return null;
  }
}

function hasResolvedCodeSigningDecision(decisionContent, releaseNotesContent) {
  if (!decisionContent) return false;
  const decision = readDecisionLine(decisionContent, '本次是否使用 Windows Authenticode 签名');
  const reason = readDecisionLine(decisionContent, '原因');
  if (!decision || !reason) return false;
  const signed = /^(是|yes|true|已签名|signed)$/i.test(decision);
  if (signed) {
    return /Get-AuthenticodeSignature|Valid|代码签名证书/.test(decisionContent);
  }
  return /^(否|no|false|未签名|not signed)$/i.test(decision)
    && releaseNotesContent.includes('Windows 安全提示')
    && releaseNotesContent.includes('SHA256SUMS.txt')
    && releaseNotesContent.includes('Tauri updater')
    && releaseNotesContent.includes('不等同于 Windows 安装包代码签名');
}

function hasResolvedStorageStrategy(content) {
  return Boolean(
    content
    && content.includes('Choose Option C')
    && content.includes('JSON file-primary saves first')
    && content.includes('SQLite primary store')
    && content.includes('Re-evaluate SQLite after the desktop save tree UI and resource maintenance tools are in use')
  );
}

function readDecisionLine(content, label) {
  if (!content) return '';
  const pattern = new RegExp(`^-\\s*${escapeRegExp(label)}：\\s*([^\\r\\n]*)`, 'm');
  return pattern.exec(content)?.[1]?.trim() || '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
