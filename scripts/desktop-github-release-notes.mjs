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
const outputPath = process.env.DESKTOP_GITHUB_RELEASE_NOTES_OUTPUT || path.join(releaseDir, 'github-release-notes.md');

const releaseManifestPath = path.join(releaseDir, 'release-manifest.json');
const checksumsPath = path.join(releaseDir, 'SHA256SUMS.txt');
const latestPath = path.join(releaseDir, 'latest.json');
const installerPath = path.join(releaseDir, installerName);
const signaturePath = path.join(releaseDir, `${installerName}.sig`);
const codeSigningDecisionPath = path.join(releaseDir, 'code-signing-decision.md');

assertFile(releaseManifestPath, 'release manifest');
assertFile(checksumsPath, 'SHA256SUMS');
assertFile(latestPath, 'latest.json');
assertFile(installerPath, 'installer');
assertFile(signaturePath, 'updater signature');

const releaseManifest = readJson(releaseManifestPath);
const latest = readJson(latestPath);
const checksums = fs.readFileSync(checksumsPath, 'utf8').trim();
const windowsPlatform = latest.platforms?.['windows-x86_64-nsis'] || latest.platforms?.['windows-x86_64'];
const installerFile = releaseManifest.files?.find((file) => file?.name === installerName);

const output = `# 开拓轶事 Desktop Edition v${version}

${releaseManifest.notes || latest.notes || `Desktop Edition ${version}`}

## 下载

- Windows 安装包：\`${installerName}\`
- Updater 签名：\`${installerName}.sig\`
- 更新清单：\`latest.json\`
- 发布清单：\`release-manifest.json\`
- 校验文件：\`SHA256SUMS.txt\`

## 安装与更新

1. 首次安装：下载并运行 \`${installerName}\`。
2. 后续更新：安装后的 Desktop Edition 可在应用内手动检查更新。
3. 更新只替换程序本体，不应覆盖玩家本地数据目录中的存档、设置、图片、备份和日志。

## Windows 安全提示

这是 Desktop Edition 测试版安装包，当前未使用 Windows Authenticode 代码签名证书。
Windows 可能显示安全提醒。请只从本项目 GitHub Release 下载，并使用 \`SHA256SUMS.txt\` 核对安装包哈希。
应用内更新包仍使用 Tauri updater 签名校验；该签名不等同于 Windows 安装包代码签名。

## 校验

安装包大小：${installerFile ? formatBytes(installerFile.size) : formatBytes(fs.statSync(installerPath).size)}

SHA256：

\`\`\`text
${checksums}
\`\`\`

## 更新源

- latest.json：\`${windowsPlatform?.url || '未在 latest.json 中找到 Windows 安装包 URL'}\`
- 版本：\`${latest.version || version}\`
- 发布时间：\`${latest.pub_date || '未知'}\`

## 发布前确认

- [ ] 已运行 \`npm.cmd run desktop:verify-release\`
- [ ] 已上传本次所有发布文件到 GitHub Release
- [ ] 已运行 \`npm.cmd run desktop:verify-online-update\`
- [ ] 已按 \`install-update-drill.md\` 完成真实安装 / 更新 / 重启演练
- [ ] 已在 \`release-gates.md\` 填写人工验证证据
- [ ] 已检查 \`code-signing-decision.md\`，并在本 Release 说明中保留签名或未签名测试版提示
- [ ] 已确认本次代码签名策略和 Windows 安全提示说明

代码签名决策记录：${fs.existsSync(codeSigningDecisionPath) ? '`code-signing-decision.md` 已生成' : '`code-signing-decision.md` 尚未生成'}
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, 'utf8');
console.log(`desktop GitHub release notes written: ${outputPath}`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
