import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_DESKTOP_REPOSITORY,
  buildDesktopInstallerName,
  loadPackageJson,
  resolveDesktopVersion,
} from './desktop-release-rules.mjs';

const root = process.cwd();
const packageJson = loadPackageJson(root);
const version = resolveDesktopVersion(packageJson, process.env.DESKTOP_RELEASE_VERSION);
const installerName = buildDesktopInstallerName(version, process.env.DESKTOP_RELEASE_INSTALLER);
const repository = process.env.DESKTOP_GITHUB_REPOSITORY || DEFAULT_DESKTOP_REPOSITORY;
const releaseRoot = process.env.DESKTOP_RELEASE_OUTPUT_DIR || path.join(root, '.desktop-release');
const releaseDir = process.env.DESKTOP_RELEASE_DIR || path.join(releaseRoot, `v${version}`);
const outputPath = process.env.DESKTOP_GITHUB_UPLOAD_COMMANDS_OUTPUT || path.join(releaseDir, 'github-upload-commands.md');

const requiredFiles = [
  installerName,
  `${installerName}.sig`,
  'latest.json',
  'release-manifest.json',
  'SHA256SUMS.txt',
  'github-release-notes.md',
  'release-gates.md',
  'install-update-drill.md',
  'code-signing-decision.md',
];

for (const fileName of requiredFiles) {
  assertFile(path.join(releaseDir, fileName), fileName);
}

const tag = `v${version}`;
const releaseTitle = `开拓轶事 Desktop Edition ${version}`;
const uploadAssets = [
  installerName,
  `${installerName}.sig`,
  'latest.json',
  'release-manifest.json',
  'SHA256SUMS.txt',
];
const localFileWarning = '没有上传计划文件、工作笔记、私钥、.tmp 或整个 .desktop-release 目录';
const generatedAt = new Date().toISOString();

const output = `# Desktop Edition GitHub Release 上传命令底稿

生成时间：${generatedAt}

仓库：\`${repository}\`

Tag：\`${tag}\`

发布标题：\`${releaseTitle}\`

发布目录：\`${releaseDir}\`

> 这份文件只生成命令底稿，不会执行上传。运行前请先确认 \`github-release-notes.md\`、\`release-gates.md\`、\`install-update-drill.md\` 和 \`code-signing-decision.md\` 已检查。

## 1. 登录检查

\`\`\`powershell
gh auth status
\`\`\`

## 2. 创建草稿 Release

\`\`\`powershell
gh release create ${tag} ${uploadAssets.map((fileName) => quote(path.join(releaseDir, fileName))).join(' ')} --repo ${repository} --title ${quote(releaseTitle)} --notes-file ${quote(path.join(releaseDir, 'github-release-notes.md'))} --draft
\`\`\`

## 3. 已有 Release 时补传 / 覆盖资产

\`\`\`powershell
gh release upload ${tag} ${uploadAssets.map((fileName) => quote(path.join(releaseDir, fileName))).join(' ')} --repo ${repository} --clobber
\`\`\`

## 4. 上传后必须验证

\`\`\`powershell
npm.cmd run desktop:verify-online-update
\`\`\`

如果线上 \`latest.json\` 不是默认 endpoint，可显式指定：

\`\`\`powershell
$env:DESKTOP_ONLINE_UPDATE_URL = "https://github.com/${repository}/releases/latest/download/latest.json"
npm.cmd run desktop:verify-online-update
\`\`\`

## 5. 发布前人工记录

- [ ] GitHub Release URL 已写入 \`release-gates.md\`
- [ ] \`desktop:verify-online-update\` 输出已写入 \`release-gates.md\`
- [ ] 真实安装 / 更新 / 重启演练结果已写入 \`release-gates.md\`
- [ ] Windows 代码签名或未签名提示策略已写入 \`release-gates.md\` 和 \`code-signing-decision.md\`
- [ ] ${localFileWarning}
`;

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`desktop GitHub upload command draft written: ${outputPath}`);

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}
