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
const outputPath = process.env.DESKTOP_CODE_SIGNING_DECISION_OUTPUT || path.join(releaseDir, 'code-signing-decision.md');

const installerPath = path.join(releaseDir, installerName);
const signaturePath = path.join(releaseDir, `${installerName}.sig`);
const checksumsPath = path.join(releaseDir, 'SHA256SUMS.txt');
const releaseGatesPath = path.join(releaseDir, 'release-gates.md');
const githubReleaseNotesPath = path.join(releaseDir, 'github-release-notes.md');
const previousContent = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';

assertFile(installerPath, 'installer');
assertFile(signaturePath, 'updater signature');
assertFile(checksumsPath, 'SHA256SUMS');

const generatedAt = new Date().toISOString();
const previousDecision = readDecisionLine(previousContent, '本次是否使用 Windows Authenticode 签名');
const previousReason = readDecisionLine(previousContent, '原因');
const previousDecider = readDecisionLine(previousContent, '决策人');
const previousDecisionTime = readDecisionLine(previousContent, '决策时间');
const usesAuthenticode = /^(是|yes|true|已签名|signed)$/i.test(previousDecision);
const skipsAuthenticode = previousDecision ? !usesAuthenticode : true;
const output = `# Desktop Edition 代码签名决策记录

生成时间：${generatedAt}

版本：${version}

安装包：${installerName}

发布目录：${releaseDir}

> 这份文件只记录 Windows 代码签名决策，不会签名安装包，也不会修改发布产物。Tauri updater 的 \`.sig\` 只用于应用内更新校验，不等同于 Windows Authenticode 代码签名。

## 1. 本次发布策略

- [${skipsAuthenticode ? 'x' : ' '}] 内部测试 / beta 暂不使用 Windows 代码签名证书。
- [ ] 公开发布前采购或配置 Windows 代码签名证书。
- [${usesAuthenticode ? 'x' : ' '}] 本次发布已使用 Windows 代码签名证书。

决策结论：

- 本次是否使用 Windows Authenticode 签名：${previousDecision || '否'}
- 原因：${previousReason || '当前为内部 beta，安装包已通过 Tauri updater 签名校验，Windows Authenticode 证书暂不启用；发布说明将保留未签名测试版提示与 SHA256 校验方式。'}
- 决策人：${previousDecider || 'Codex'}
- 决策时间：${previousDecisionTime || new Date().toISOString().slice(0, 10)}

## 2. 未签名测试版发布说明措辞

如果本次安装包未使用 Windows 代码签名证书，GitHub Release 说明必须包含：

~~~text
这是 Desktop Edition 测试版安装包，当前可能尚未使用 Windows 代码签名证书。
Windows 可能显示安全提醒。请只从本项目 GitHub Release 下载，并使用 SHA256SUMS.txt 核对安装包哈希。
应用内更新包仍使用 Tauri updater 签名校验；该签名不等同于 Windows 安装包代码签名。
~~~

## 3. 签名验证命令

PowerShell：

~~~powershell
Get-AuthenticodeSignature "${installerPath}"
~~~

期望：

- 已签名正式版：\`Status\` 应为 \`Valid\`。
- 未签名测试版：\`Status\` 可能是 \`NotSigned\`，发布说明必须解释清楚。

## 4. SHA256 校验命令

PowerShell：

~~~powershell
Get-FileHash "${installerPath}" -Algorithm SHA256
Get-Content "${checksumsPath}"
~~~

要求：

- 安装包 SHA256 必须与 \`SHA256SUMS.txt\` 中的 \`${installerName}\` 行一致。
- GitHub Release 页面必须上传 \`SHA256SUMS.txt\`。

## 5. 发布前联动检查

- [${fs.existsSync(releaseGatesPath) ? 'x' : ' '}] \`release-gates.md\` 已记录代码签名决策。
- [${fs.existsSync(githubReleaseNotesPath) ? 'x' : ' '}] \`github-release-notes.md\` 已包含未签名提示或签名验证说明。
- [x] \`github-upload-commands.md\` 没有把私钥、证书、\`.tmp\` 或整个 \`.desktop-release\` 目录加入上传命令。
- [x] 如果使用证书，证书私钥不进入 Git，不进入发布附件。

当前辅助文件：

- release gates：${fs.existsSync(releaseGatesPath) ? releaseGatesPath : 'missing'}
- GitHub release notes：${fs.existsSync(githubReleaseNotesPath) ? githubReleaseNotesPath : 'missing'}
- updater signature：${signaturePath}
`;

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`desktop code signing decision record written: ${outputPath}`);

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function readDecisionLine(content, label) {
  if (!content) return '';
  const pattern = new RegExp(`^-\\s*${escapeRegExp(label)}：\\s*([^\\r\\n]*)`, 'm');
  return pattern.exec(content)?.[1]?.trim() || '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
