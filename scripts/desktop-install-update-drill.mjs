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
const checklistPath = process.env.DESKTOP_DRILL_OUTPUT ||
  path.join(releaseDir, 'install-update-drill.md');
const installerPath = path.join(releaseDir, installerName);
const signaturePath = path.join(releaseDir, `${installerName}.sig`);
const latestPath = path.join(releaseDir, 'latest.json');
const releaseManifestPath = path.join(releaseDir, 'release-manifest.json');
const checksumsPath = path.join(releaseDir, 'SHA256SUMS.txt');

assertFile(installerPath, 'installer');
assertFile(signaturePath, 'updater signature');
assertFile(latestPath, 'latest.json');
assertFile(releaseManifestPath, 'release manifest');
assertFile(checksumsPath, 'SHA256SUMS');

const latest = readJson(latestPath);
const releaseManifest = readJson(releaseManifestPath);
const windowsPlatform = latest.platforms?.['windows-x86_64-nsis'] || latest.platforms?.['windows-x86_64'];
const generatedAt = new Date().toISOString();
const appDataDir = '%APPDATA%\\开拓轶事';
const output = `# 开拓轶事 Desktop Edition 安装 / 更新演练清单

生成时间：${generatedAt}

版本：${version}

安装包：${installerName}

更新清单：latest.json

更新下载地址：${windowsPlatform?.url || '未在 latest.json 中找到 Windows 更新地址'}

> 这份清单只用于本地人工演练，不代表已发布到 GitHub Release。

## 0. 产物预检

- [ ] 已运行 \`npm.cmd run desktop:verify-release\`，本地暂存产物校验通过。
- [ ] 如已上传 GitHub Release，已运行 \`npm.cmd run desktop:verify-online-update\`，线上 \`latest.json\` 与本地暂存一致。
- [ ] \`${installerName}\`、\`${installerName}.sig\`、\`latest.json\`、\`release-manifest.json\`、\`SHA256SUMS.txt\` 均位于同一发行目录。
- [ ] SHA256 校验文件包含安装包、签名和 \`latest.json\`。

## 1. 首次安装

- [ ] 双击安装包完成 Windows 安装。
- [ ] 开始菜单中出现“开拓轶事”入口。
- [ ] 启动后显示 Desktop Edition 状态，而不是 Web Edition。
- [ ] 存储管理页显示版本 \`${version}\` 与应用标识 \`com.kaituoyishi.desktop\`。
- [ ] 存储管理页可显示并打开本地数据目录：\`${appDataDir}\`。

## 2. 本地数据目录

- [ ] 首次启动后，本地数据目录内存在 \`saves\`、\`backups\`、\`assets\`、\`logs\`、\`config\`、\`zhiku\`、\`worldbooks\`。
- [ ] 点击“写入桌面探针”后，探针文件写入成功。
- [ ] 保存一个测试存档后，\`saves/index.json\` 与对应 \`saves/save-<id>.json\` 出现。
- [ ] 保存设置后，\`config/settings.json\` 出现。
- [ ] 如保存智库 / 世界书设置，\`zhiku/system.json\` 与 \`worldbooks/worldbooks.json\` 出现且诊断报告显示有效。

## 3. 备份与恢复保护

- [ ] 点击“备份到本地”后，\`backups/desktop-save-backup-*.json\` 出现。
- [ ] 备份列表可以导出指定备份 JSON。
- [ ] 恢复本地镜像前会自动生成当前存档备份。
- [ ] 恢复最近备份前会自动生成当前存档备份。
- [ ] 恢复失败时，原有存档仍可继续读取。

## 4. 图片资源与诊断

- [ ] 生成或保存一张图片资源后，\`assets/generated-images\` 下出现真实图片文件和元数据。
- [ ] 资源统计能显示资源数量与占用。
- [ ] 清理无引用资源只删除当前存档库未引用的本地图片镜像。
- [ ] 导出诊断报告后，\`logs/diagnostic-report-*.json\` 出现。
- [ ] 诊断报告包含运行环境、目录、发行信息、更新状态、备份、资源统计和专属资料镜像状态。
- [ ] 诊断报告不包含明文 API Key。

## 5. 应用内更新演练

- [ ] 当前安装版本低于线上 \`latest.json\` 版本时，点击“检查更新”能发现新版本。
- [ ] 无更新时，界面提示当前已是最新版本。
- [ ] 点击“下载并安装”后，下载进度有反馈。
- [ ] 安装/重启后，版本号更新到线上 \`latest.json\` 的版本。
- [ ] 更新后，\`${appDataDir}\` 下的存档、配置、图片、备份和日志未被覆盖或删除。
- [ ] 更新失败或取消时，旧版本仍可启动并读取原数据。

## 6. 回滚与留档

- [ ] 保留上一版安装包、签名、\`latest.json\` 和 \`SHA256SUMS.txt\`。
- [ ] 若新版本更新异常，可重新安装上一版并读取同一数据目录。
- [ ] 记录本次演练结果、失败截图、诊断报告路径和 Windows 安全提示情况。

## 本次暂存摘要

- 发行目录：\`${releaseDir}\`
- 发行说明：${releaseManifest.notes || latest.notes || '无'}
- latest.json 版本：${latest.version || '未知'}
- latest.json 发布时间：${latest.pub_date || '未知'}
- Windows 签名长度：${String(windowsPlatform?.signature || '').length}
`;

fs.mkdirSync(path.dirname(checklistPath), { recursive: true });
fs.writeFileSync(checklistPath, output, 'utf8');
console.log(`desktop install/update drill checklist written: ${checklistPath}`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}
