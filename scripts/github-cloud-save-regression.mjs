import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const service = fs.readFileSync('services/githubCloudSave.ts', 'utf8');
const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const storage = fs.readFileSync('components/features/Settings/StorageManager.tsx', 'utf8');
const cloudModal = fs.readFileSync('components/features/CloudSave/GitHubCloudSaveModal.tsx', 'utf8');
const oauthHook = fs.readFileSync('hooks/useGitHubOAuth.ts', 'utf8');
const oauthConfigFunction = fs.readFileSync('functions/api/auth/github-config.ts', 'utf8');
const oauthTokenFunction = fs.readFileSync('functions/api/auth/github.ts', 'utf8');
const redirects = fs.readFileSync('public/_redirects', 'utf8');
const landing = fs.readFileSync('components/layout/LandingPage.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

assert(service.includes('GitHubCloudSaveConfig'), 'GitHub 云存档必须有独立配置类型。');
assert(service.includes('testGitHubCloudConnection'), 'GitHub 云存档必须提供手动测试连接。');
assert(service.includes('listGitHubCloudSaves'), 'GitHub 云存档必须提供手动刷新列表。');
assert(service.includes('uploadSaveToGitHubCloud'), 'GitHub 云存档必须提供手动上传当前存档。');
assert(service.includes('uploadAllSavesToGitHubCloud'), 'GitHub 云存档必须提供整批同步全部本地存档。');
assert(service.includes('downloadSaveFromGitHubCloud'), 'GitHub 云存档必须提供手动下载导入。');
assert(service.includes('bindGitHubCloudAccount'), 'GitHub 云存档必须提供账号绑定流程。');
assert(service.includes('getGitHubAccountInfo'), 'GitHub 云存档必须能读取绑定账号信息。');
assert(service.includes('/user/repos'), 'GitHub 云存档绑定流程必须能自动创建默认私有仓库。');
assert(service.includes('kaituoyishi-cloud-save'), 'GitHub 云存档必须有默认云存档仓库名。');
assert(service.includes('PUT'), 'GitHub 云存档上传必须使用 Contents API 写入。');
assert(service.includes('Authorization: `Bearer'), 'GitHub 云存档必须使用用户 Token 授权。');
assert(service.includes('buildSavePackage(save)'), 'GitHub 云存档必须复用标准 ZIP 存档包。');
assert(service.includes('parseSavePackage'), 'GitHub 云存档下载后必须复用存档包解析。');
assert(service.includes('github-cloud-save'), 'GitHub 云端 manifest 必须标记云存档类型。');
assert(service.includes('readFileBase64'), 'GitHub 云存档必须支持通过 blob 读取较大文件。');
assert(service.includes('const cloudId = `local-save-${localSaveId}`'), 'GitHub 云存档整批同步必须使用稳定本地存档 id 覆盖同一云端文件。');
assert(service.includes('deleteContent(config'), 'GitHub 云存档整批同步必须清理旧 manifest 中不再存在的云端存档。');
assert(service.includes('GitHub 授权已失效'), 'GitHub 云存档遇到 Bad credentials 必须提示重新授权。');
assert(dbService.includes('replaceAllSaves'), '本地存档服务必须支持云端下载后整批覆盖本地存档。');
assert(dbService.includes('store.clear()'), '整批覆盖本地存档必须先清空旧存档列表。');

assert(!storage.includes('GitHub 云存档'), 'GitHub 云存档不应放在存档管理页内。');
assert(cloudModal.includes('GitHub 云存档'), 'GitHub 云存档必须有独立弹窗。');
assert(cloudModal.includes('GitHub 授权'), 'GitHub 云存档默认 UI 必须是 GitHub OAuth 授权。');
assert(cloudModal.includes('Token 备用绑定'), 'GitHub 云存档必须把手动 Token 放入备用配置。');
assert(cloudModal.includes('startGitHubOAuth'), 'GitHub 云存档必须能发起 OAuth 授权。');
assert(cloudModal.includes('consumeGitHubOAuthCallback'), 'GitHub 云存档必须能消费 OAuth 回调。');
assert(cloudModal.includes('解除绑定'), 'GitHub 云存档必须支持解除本机绑定。');
assert(!cloudModal.includes('测试连接'), 'GitHub 云存档主面板不应保留测试连接按钮。');
assert(cloudModal.includes('刷新数据'), 'GitHub 云存档弹窗必须有刷新数据按钮。');
assert(cloudModal.includes('上传到云端'), 'GitHub 云存档默认上传按钮必须整批同步本地存档。');
assert(cloudModal.includes('下载到本地'), 'GitHub 云存档必须支持整批下载到本地。');
assert(cloudModal.includes('window.confirm'), 'GitHub 云存档下载覆盖本地前必须弹确认提示。');
assert(cloudModal.includes('replaceAllSaves'), 'GitHub 云存档下载到本地必须覆盖本地存档列表。');
assert(cloudModal.includes('覆盖当前本地存档列表'), 'GitHub 云存档下载确认必须明确覆盖风险。');
assert(!cloudModal.includes('单独上传当前存档'), 'GitHub 云存档主面板不应保留单独上传当前存档入口。');
assert(!cloudModal.includes('下载导入'), 'GitHub 云存档主面板不应显示单条下载导入按钮。');
assert(cloudModal.includes('最近云端记录'), 'GitHub 云存档应只显示最近云端记录摘要。');
assert(cloudModal.includes('getSaveList'), 'GitHub 云存档批量上传必须读取本地存档列表。');
assert(cloudModal.includes('uploadAllSavesToGitHubCloud'), 'GitHub 云存档默认上传必须调用整批同步服务。');
assert(cloudModal.includes('CloudProgress'), 'GitHub 云存档上传/下载必须显示进度条。');
assert(cloudModal.includes('saveSetting(\'githubCloudSaveConfig\''), 'GitHub 云存档配置必须保存到本地设置。');
assert(cloudModal.includes('loadSetting<GitHubCloudSaveConfig>'), 'GitHub 云存档配置必须从本地设置读取。');
assert(!cloudModal.includes('setInterval('), '第一版 GitHub 云存档不得做自动定时同步。');

assert(oauthHook.includes('https://github.com/login/oauth/authorize'), 'OAuth 必须跳转 GitHub 授权页。');
assert(oauthHook.includes("const OAUTH_SCOPE = 'repo'"), 'OAuth 必须申请 repo 权限以创建和写入私有云存档仓库。');
assert(oauthHook.includes('/oauth/github/callback'), 'OAuth 必须使用固定回调路径。');
assert(oauthHook.includes('kty_github_oauth_pending_state'), 'OAuth 必须用 state 防止串号回调。');
assert(oauthHook.includes('/api/auth/github-config'), '前端必须从后端读取 Client ID，避免要求玩家配置 Vite 构建变量。');
assert(oauthHook.includes('/api/auth/github'), '前端必须通过 Cloudflare Function 换取 access token。');
assert(oauthConfigFunction.includes('GITHUB_CLIENT_ID'), 'Cloudflare 配置接口必须读取 GITHUB_CLIENT_ID。');
assert(oauthTokenFunction.includes('GITHUB_CLIENT_SECRET'), 'Cloudflare Token 接口必须读取 GITHUB_CLIENT_SECRET。');
assert(oauthTokenFunction.includes('https://github.com/login/oauth/access_token'), 'Cloudflare Token 接口必须调用 GitHub OAuth token endpoint。');
assert(redirects.includes('/* /index.html 200'), 'Cloudflare Pages 必须配置 SPA 回退，保证 OAuth 回调路径可打开。');

assert(landing.includes('onCloudSave'), '首页必须提供 GitHub 云存档按钮回调。');
assert(landing.includes('GitHub 云存档'), '首页左上角必须显示 GitHub 云存档按钮。');
assert(app.includes('showCloudSave'), 'App 必须管理 GitHub 云存档弹窗状态。');
assert(app.includes('GitHubCloudSaveModal'), 'App 必须渲染 GitHub 云存档独立弹窗。');
assert(app.includes("window.location.pathname === '/oauth/github/callback'"), 'App 必须在 OAuth 回调页自动打开云存档弹窗。');

assert(pkg.includes('test:github-cloud-save'), 'package.json 必须提供 GitHub 云存档回归脚本。');

console.log('github cloud save regression ok');
