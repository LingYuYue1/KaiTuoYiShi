import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const service = fs.readFileSync('services/githubCloudSave.ts', 'utf8');
const request = fs.readFileSync('services/githubRequest.ts', 'utf8');
const builder = fs.readFileSync('services/cloudBackupBuilder.ts', 'utf8');
const merge = fs.readFileSync('services/cloudBackupMerge.ts', 'utf8');
const transferStore = fs.readFileSync('services/storage/cloudBackupTransferStore.ts', 'utf8');
const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const cloudModal = fs.readFileSync('components/features/CloudSave/GitHubCloudSaveModal.tsx', 'utf8');
const oauthHook = fs.readFileSync('hooks/useGitHubOAuth.ts', 'utf8');
const oauthConfigFunction = fs.readFileSync('functions/api/auth/github-config.ts', 'utf8');
const oauthTokenFunction = fs.readFileSync('functions/api/auth/github.ts', 'utf8');
const redirects = fs.readFileSync('public/_redirects', 'utf8');
const landing = fs.readFileSync('components/layout/LandingPage.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

assert(service.includes('GitHubCloudSaveConfig'), 'GitHub 云备份必须保留独立配置类型。');
assert(service.includes('bindGitHubCloudAccount') && service.includes('/user/repos'), '账号绑定必须支持自动创建默认私有仓库。');
assert(service.includes('inspectGitHubCloudBackup'), '必须能识别版本 2 完整备份和版本 1 旧清单。');
assert(service.includes('uploadCompleteBackupToGitHub'), '必须提供完整备份上传入口。');
assert(service.includes('downloadCompleteBackupFromGitHub'), '必须提供完整备份逐卷下载入口。');
assert(service.includes('/git/blobs'), '分卷必须通过 Git Data Blob API 上传。');
assert(service.includes('/git/trees') && service.includes('/git/commits'), '完整备份必须通过 Tree 和 Commit 发布。');
assert(service.includes('/git/refs/heads/'), '完整备份必须非强制更新目标分支 ref。');
assert(service.includes('force: false'), '更新分支不得强制覆盖并发提交。');
assert(service.includes('publishAtomicCloudCommit'), '分卷上传后必须执行单次原子发布。');
assert(service.includes('reuse') || service.includes('复用已上传分卷'), 'ref 冲突时必须复用已经上传的 Blob。');
assert(service.includes('sha256Hex(bytes)'), '上传前和下载后必须校验分卷 SHA-256。');
assert(service.includes('downloadLegacySaveFromGitHub'), '版本 1 逐节点云存档必须继续可下载。');
assert(!service.includes('uploadAllSavesToGitHubCloud'), '不得保留按全部节点逐文件上传的旧入口。');
assert(!service.includes('buildSavePackage(save)'), 'GitHub 传输层不得再逐节点构建 ZIP。');
assert(!service.includes('const cloudId = `local-save-${localSaveId}`'), '不得再按本地节点 ID 创建独立云文件。');

assert(request.includes('timeoutMs'), 'GitHub 请求必须有有限超时。');
assert(request.includes('maxAttempts'), 'GitHub 请求必须有有限重试次数。');
assert(request.includes("response.status === 429"), 'GitHub 请求必须处理 429。');
assert(request.includes("response.status >= 500"), 'GitHub 请求必须重试临时 5xx。');
assert(request.includes("retry-after") && request.includes("x-ratelimit-reset"), 'GitHub 请求必须遵守限流等待头。');
assert(request.includes('AbortSignal') && request.includes('abortableDelay'), '请求和退避等待必须可取消。');
assert(request.includes('GitHub 授权已失效'), '401 必须提示重新授权。');

assert(builder.includes('buildCompleteCloudBackup'), '必须先生成一份完整逻辑备份。');
assert(builder.includes('await source.loadSaveBundle(summary.id)') && builder.includes('await source.loadSave(summary.id)'), '打包必须一次只读取一个完整节点。');
assert(builder.includes('assetByContentHash'), '重复图片资源必须按内容哈希去重。');
assert(builder.includes('putCloudBackupTransferPart'), '分卷必须写入独立临时数据库。');
assert(transferStore.includes("KaiTuoYiShiCloudTransferDB"), '临时分卷不得升级主存档数据库。');

assert(merge.includes('mergeDownloadedCloudBackup'), '必须提供版本 2 合并恢复。');
assert(merge.includes('mergeLegacyCloudBackup'), '旧版云存档必须转换为合并恢复。');
assert(merge.includes('skippedDuplicateNodes'), '合并必须统计并跳过重复节点。');
assert(merge.includes('conflictRoots'), '相同节点 ID、不同内容时必须重映射整棵树。');
assert(merge.includes('originalIdToTargetId'), '资源 ID 冲突必须建立重映射。');
assert(dbService.includes('stageCloudMergeRecord'), '合并数据必须先进入隐藏暂存区。');
assert(dbService.includes('commitCloudMergeStaging'), '合并必须通过最终事务提交。');
assert(dbService.includes('[SETTINGS_STORE, SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_ASSETS_STORE, SAVE_NODE_DELTAS_STORE]'), '最终合并必须覆盖全部相关 store 的同一事务。');

assert(cloudModal.includes('生成并上传完整备份'), '上传按钮必须表达完整备份语义。');
assert(cloudModal.includes('下载并合并到本地'), '下载按钮必须表达合并语义。');
assert(cloudModal.includes('本地现有存档不会被清空'), '恢复确认必须明确不会清空本地。');
assert(cloudModal.includes('取消当前任务'), '运行中的云备份必须允许取消。');
assert(cloudModal.includes('buildCompleteCloudBackup'), 'UI 必须先打包再上传。');
assert(cloudModal.includes('mergeDownloadedCloudBackup'), 'UI 必须在下载校验后合并。');
assert(!cloudModal.includes('replaceAllSaves'), 'GitHub 云恢复不得调用覆盖全部本地存档。');
assert(!cloudModal.includes('覆盖当前本地存档列表'), 'UI 不得继续显示覆盖本地文案。');

assert(oauthHook.includes('https://github.com/login/oauth/authorize'), 'OAuth 必须跳转 GitHub 授权页。');
assert(oauthHook.includes("const OAUTH_SCOPE = 'repo'"), 'OAuth 必须申请私有仓库权限。');
assert(oauthHook.includes('/oauth/github/callback'), 'OAuth 必须使用固定回调路径。');
assert(oauthHook.includes('kty_github_oauth_pending_state'), 'OAuth 必须用 state 防止串号回调。');
assert(oauthConfigFunction.includes('GITHUB_CLIENT_ID'), '配置接口必须读取 GITHUB_CLIENT_ID。');
assert(oauthTokenFunction.includes('GITHUB_CLIENT_SECRET'), 'Token 接口必须读取 GITHUB_CLIENT_SECRET。');
assert(redirects.includes('/* /index.html 200'), 'Cloudflare Pages 必须配置 SPA 回退。');
assert(landing.includes('onCloudSave') && landing.includes('GitHub 云存档'), '首页必须保留云存档入口。');
assert(app.includes('showCloudSave') && app.includes('GitHubCloudSaveModal'), 'App 必须管理云存档弹窗。');
assert(pkg.includes('test:github-cloud-save'), 'package.json 必须提供 GitHub 云存档回归脚本。');

console.log('[github-cloud-save-regression] ok');
