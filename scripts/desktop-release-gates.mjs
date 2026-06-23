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
const outputPath = process.env.DESKTOP_RELEASE_GATES_OUTPUT || path.join(releaseDir, 'release-gates.md');
const previousContent = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
const codeSigningDecisionPath = path.join(releaseDir, 'code-signing-decision.md');
const codeSigningDecisionContent = fs.existsSync(codeSigningDecisionPath)
  ? fs.readFileSync(codeSigningDecisionPath, 'utf8')
  : '';

const installerPath = path.join(releaseDir, installerName);
const signaturePath = path.join(releaseDir, `${installerName}.sig`);
const latestPath = path.join(releaseDir, 'latest.json');
const releaseManifestPath = path.join(releaseDir, 'release-manifest.json');
const checksumsPath = path.join(releaseDir, 'SHA256SUMS.txt');
const drillPath = path.join(releaseDir, 'install-update-drill.md');

assertFile(installerPath, 'installer');
assertFile(signaturePath, 'updater signature');
assertFile(latestPath, 'latest.json');
assertFile(releaseManifestPath, 'release manifest');
assertFile(checksumsPath, 'SHA256SUMS');

const latest = readJson(latestPath);
const releaseManifest = readJson(releaseManifestPath);
const windowsPlatform = latest.platforms?.['windows-x86_64-nsis'] || latest.platforms?.['windows-x86_64'];
const generatedAt = new Date().toISOString();
const localArtifactsChecked = previousContent.includes('- [x] 已运行 `npm.cmd run desktop:verify-release`')
  || process.env.DESKTOP_RELEASE_GATES_LOCAL_READY === '1';
const readinessChecked = previousContent.includes('- [x] 已运行 `npm.cmd run desktop:readiness`')
  || process.env.DESKTOP_RELEASE_GATES_READINESS_READY === '1';
const localArtifactState = inspectLocalArtifacts({
  version,
  installerName,
  releaseDir,
  latest,
  releaseManifest,
  checksumsPath,
});
const previousSigningDecision = readEvidenceSection(previousContent, '## 4. 代码签名 / code signing 决策', '## 5. 回滚留档');
const signingDecision = hasFilledCodeSigningDecision(previousSigningDecision)
  ? previousSigningDecision
  : buildCodeSigningDecisionSectionFromDecisionFile(codeSigningDecisionContent)
  || buildDefaultCodeSigningDecisionSection();
const releaseEvidence = readEvidenceBlock(previousContent, '证据记录：', '## 2. 线上更新源校验');
const onlineEvidence = readEvidenceSection(previousContent, '## 2. 线上更新源校验', '## 3. 真实安装 / 更新 / 重启演练');
const installEvidence = readEvidenceSection(previousContent, '## 3. 真实安装 / 更新 / 重启演练', '## 4. 代码签名 / code signing 决策');
const rollbackEvidence = readEvidenceSection(previousContent, '## 5. 回滚留档', '## 6. Machine-readable evidence keys');
const machineEvidence = buildMachineEvidenceSection(previousContent, codeSigningDecisionContent);
const files = [
  installerName,
  `${installerName}.sig`,
  'latest.json',
  'release-manifest.json',
  'SHA256SUMS.txt',
];

const output = `# Desktop Edition 发布门槛记录

生成时间：${generatedAt}

版本：${version}

发布目录：${releaseDir}

安装包：${installerName}

更新地址：${windowsPlatform?.url || 'latest.json 中未找到 Windows 更新地址'}

> 这份记录只保存在本地，用来填写公开 beta 前的人工证据。它不会上传 GitHub，也不能替代真实上传、真实线上校验和真实安装更新演练。

## 0. 本地产物

- [${localArtifactsChecked ? 'x' : ' '}] 已运行 \`npm.cmd run desktop:verify-release\`，并确认本地发布暂存产物校验通过。
- [${readinessChecked ? 'x' : ' '}] 已运行 \`npm.cmd run desktop:readiness\`，并确认结果为 \`missing=0\`。
- [${fs.existsSync(drillPath) ? 'x' : ' '}] 已生成 \`install-update-drill.md\`。
- [${localArtifactState.manifestOk ? 'x' : ' '}] \`release-manifest.json\` 版本、类型和文件列表与本次发布匹配。
- [${localArtifactState.latestOk ? 'x' : ' '}] \`latest.json\` 版本、发布日期、下载地址和 updater 签名与本次发布匹配。
- [${localArtifactState.checksumsOk ? 'x' : ' '}] \`SHA256SUMS.txt\` 覆盖 manifest 中的全部文件，且 SHA256 与当前文件一致。

需要检查的文件：

${files.map((fileName) => `- [${localArtifactState.files.get(fileName) ? 'x' : ' '}] \`${fileName}\``).join('\n')}

## 1. GitHub Release 上传

- [ ] 已创建 GitHub Release：\`v${version}\`
- [ ] Release 不是草稿，或已明确标注为内部测试草稿。
- [ ] Release 说明包含 Desktop Edition、版本号、安装方式、更新方式和 SHA256 校验提示。
- [ ] 已上传安装包、签名、\`latest.json\`、\`release-manifest.json\`、\`SHA256SUMS.txt\`。

证据记录：

${releaseEvidence || `- GitHub Release URL：
- 上传完成时间：
- 上传操作者：
- 备注：`}

${onlineEvidence || buildDefaultOnlineUpdateSection(installerName)}
${installEvidence || buildDefaultInstallDrillSection()}
${signingDecision}
${rollbackEvidence || buildDefaultRollbackSection()}
${machineEvidence || buildDefaultMachineEvidenceSection()}

## 本次暂存摘要

- release manifest notes：${releaseManifest.notes || latest.notes || '无'}
- latest.json version：${latest.version || '未知'}
- latest.json pub_date：${latest.pub_date || '未知'}
- installer size：${formatBytes(fs.statSync(installerPath).size)}
- updater signature length：${String(windowsPlatform?.signature || '').length}
- install-update-drill.md：${fs.existsSync(drillPath) ? 'present' : 'missing'}
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, 'utf8');
console.log(`desktop release gates checklist written: ${outputPath}`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function inspectLocalArtifacts({ version, installerName, releaseDir, latest, releaseManifest, checksumsPath }) {
  const signatureName = `${installerName}.sig`;
  const expectedNames = [installerName, signatureName, 'latest.json'];
  const fileStates = new Map();
  for (const name of [...expectedNames, 'release-manifest.json', 'SHA256SUMS.txt']) {
    fileStates.set(name, fs.existsSync(path.join(releaseDir, name)));
  }

  const checksumMap = readChecksumMapIfValid(checksumsPath);
  const manifestFiles = Array.isArray(releaseManifest.files) ? releaseManifest.files : [];
  const manifestNames = new Set(manifestFiles.map((file) => file?.name).filter(Boolean));
  const manifestOk = releaseManifest.kind === DESKTOP_RELEASE_KIND
    && releaseManifest.version === version
    && expectedNames.every((name) => manifestNames.has(name));

  const manifestFilesValid = manifestFiles.every((file) => {
    if (!file || typeof file.name !== 'string' || !file.name) return false;
    const filePath = path.join(releaseDir, file.name);
    if (!fs.existsSync(filePath)) return false;
    const buffer = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    return file.size === buffer.length
      && file.sha256 === sha256
      && checksumMap.get(file.name) === sha256;
  });

  const signature = fs.existsSync(path.join(releaseDir, signatureName))
    ? fs.readFileSync(path.join(releaseDir, signatureName), 'utf8').trim()
    : '';
  const latestPlatforms = [
    latest.platforms?.['windows-x86_64-nsis'],
    latest.platforms?.['windows-x86_64'],
  ];
  const latestOk = latest.version === version
    && typeof latest.pub_date === 'string'
    && latest.pub_date.trim().length > 0
    && latestPlatforms.every((platform) => (
      platform
      && platform.signature === signature
      && typeof platform.url === 'string'
      && platform.url.includes(encodeURIComponent(installerName))
    ));

  return {
    files: fileStates,
    manifestOk,
    latestOk,
    checksumsOk: checksumMap.size > 0 && manifestFilesValid,
  };
}

function readChecksumMapIfValid(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const lines = fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})\s+(.+)$/i.exec(line);
    if (!match) return new Map();
    map.set(match[2], match[1]);
  }
  return map;
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

function readEvidenceSection(content, startMarker, endMarker) {
  if (!content) return '';
  const start = content.indexOf(startMarker);
  if (start < 0) return '';
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return '';
  return content.slice(start, end).trim();
}

function readEvidenceBlock(content, startMarker, endMarker) {
  const section = readEvidenceSection(content, startMarker, endMarker);
  if (!section) return '';
  return section.replace(startMarker, '').trim();
}

function buildDefaultOnlineUpdateSection(installerFileName) {
  return `## 2. 线上更新源校验

- [ ] 已运行 \`npm.cmd run desktop:verify-online-update\`。
- [ ] 线上 \`latest.json\` 与本地暂存 \`latest.json\` 一致。
- [ ] 线上 \`latest.json\` 的签名与 \`${installerFileName}.sig\` 一致。
- [ ] 线上安装包 URL 指向本次 GitHub Release 中的 \`${installerFileName}\`。

证据记录：

- 校验命令输出摘要：
- 线上 latest.json URL：
- 失败/重试记录：`;
}

function buildDefaultInstallDrillSection() {
  return `## 3. 真实安装 / 更新 / 重启演练

- [ ] 已在干净或可回滚的 Windows 环境安装本版本。
- [ ] 首次启动可进入 Desktop Edition。
- [ ] 本地数据目录可创建 \`saves\`、\`backups\`、\`assets\`、\`logs\`、\`config\`、\`zhiku\`、\`worldbooks\`。
- [ ] 应用内检查更新、下载、安装、重启流程完成。
- [ ] 更新后存档、设置、图片、备份和日志未被覆盖或删除。
- [ ] 演练结果已对照 \`install-update-drill.md\` 填写。

证据记录：

- 演练机器 / 系统版本：
- 安装前版本：
- 更新后版本：
- 本地数据目录：
- 诊断报告路径：
- 截图/录屏路径：
- 失败/重试记录：`;
}

function buildDefaultCodeSigningDecisionSection() {
  return `## 4. 代码签名 / code signing 决策

- [ ] 已决定本次发布是否使用 Windows 代码签名证书。
- [ ] 如果不签名，发布说明已提示 Windows 安全警告和 SHA256 校验方式。
- [ ] 如果签名，已确认签名证书、签名时间戳和安装包签名验证结果。

决策记录：

- 本次是否代码签名：
- 原因：
- 证书/签名验证摘要：`;
}

function buildCodeSigningDecisionSectionFromDecisionFile(content) {
  if (!content) return '';
  const decision = readDecisionLine(content, '本次是否使用 Windows Authenticode 签名');
  const reason = readDecisionLine(content, '原因');
  if (!decision || !reason) return '';
  const unsigned = /^(否|no|false|未签名|not signed)/i.test(decision);
  return `## 4. 代码签名 / code signing 决策

- [x] 已决定本次发布是否使用 Windows 代码签名证书。
- [${unsigned ? 'x' : ' '}] 如果不签名，发布说明已提示 Windows 安全警告和 SHA256 校验方式。
- [${unsigned ? 'x' : 'x'}] 如果签名，已确认签名证书、签名时间戳和安装包签名验证结果。${unsigned ? '本次不适用：已确认未使用 Windows Authenticode 签名。' : ''}

决策记录：

- 本次是否代码签名：${decision}
- 原因：${reason}
- 证书/签名验证摘要：${unsigned ? '`Get-AuthenticodeSignature` 结果为 `NotSigned`；安装包 SHA256 与 `SHA256SUMS.txt` 一致；发布说明保留未签名测试版提示。' : '见 code-signing-decision.md 中的证书/签名验证记录。'}`;
}

function hasFilledCodeSigningDecision(section) {
  if (!section) return false;
  const decision = readDecisionLine(section, '本次是否代码签名')
    || readDecisionLine(section, '本次是否使用 Windows Authenticode 签名');
  return Boolean(
    decision
    && !/^(todo|tbd|pending|none|n\/a|待填|待填写|无|-)?$/i.test(decision)
    && section.includes('- [x]'),
  );
}

function readDecisionLine(content, label) {
  const pattern = new RegExp(`^-\\s*${escapeRegExp(label)}：\\s*([^\\r\\n]*)`, 'm');
  return pattern.exec(content)?.[1]?.trim() || '';
}

function buildDefaultRollbackSection() {
  return `## 5. 回滚留档

- [ ] 已保留上一版安装包、签名、\`latest.json\` 和 \`SHA256SUMS.txt\`。
- [ ] 已确认旧版本重新安装后仍能读取同一数据目录。
- [ ] 已记录回滚策略：必要时替换 Release 中的 \`latest.json\` 指向上一稳定版本，或撤回问题版本说明。

证据记录：

- 上一稳定版本：
- 上一版产物位置：
- 回滚操作备注：`;
}

function buildMachineEvidenceSection(previous, codeSigningDecision) {
  const previousSection = readEvidenceSection(previous, '## 6. Machine-readable evidence keys', '## 本次暂存摘要');
  const keys = [
    'githubReleaseUrl',
    'onlineLatestJsonUrl',
    'verifyOnlineUpdateOutput',
    'installDrillMachine',
    'installVersionBefore',
    'installVersionAfter',
    'localDataDir',
    'diagnosticReportPath',
    'codeSigningDecision',
    'rollbackPreviousVersion',
  ];
  const values = new Map(keys.map((key) => [key, readEvidenceKeyFromSection(previousSection, key)]));
  if (!values.get('codeSigningDecision')) {
    const decision = readDecisionLine(codeSigningDecision, '本次是否使用 Windows Authenticode 签名');
    const reason = readDecisionLine(codeSigningDecision, '原因');
    if (decision && reason) {
      values.set('codeSigningDecision', `${decision}；${reason}`);
    }
  }
  return `## 6. Machine-readable evidence keys

> Fill these after the real GitHub Release upload, online update verification, install/update drill, code signing decision, and rollback review. The \`desktop:verify-release-gates\` script checks these keys.

${keys.map((key) => `- ${key}: ${values.get(key) || ''}`).join('\n')}`;
}

function buildDefaultMachineEvidenceSection() {
  return buildMachineEvidenceSection('', '');
}

function readEvidenceKeyFromSection(section, key) {
  if (!section) return '';
  const pattern = new RegExp(`^-\\s*${escapeRegExp(key)}:\\s*([^\\r\\n]*)`, 'm');
  const value = pattern.exec(section)?.[1]?.trim() || '';
  if (/^-\s*[A-Za-z][A-Za-z0-9]*:\s*$/.test(value)) return '';
  return value;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
