import type { 存档数据 } from '@/models/settings';
import { buildSavePackage, parseSavePackage } from './savePackage';

const GITHUB_API = 'https://api.github.com';
const MANIFEST_NAME = 'manifest.json';

export interface GitHubCloudSaveConfig {
  owner: string;
  repo: string;
  branch: string;
  rootPath: string;
  token: string;
}

export interface GitHubCloudSaveItem {
  cloudId: string;
  localSaveId?: number;
  saveType?: string;
  travelerName: string;
  turnCount: number;
  timestamp: number;
  uploadedAt: string;
  sizeBytes: number;
  path: string;
}

export interface GitHubAccountInfo {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
}

export interface GitHubCloudSaveManifest {
  app: 'KaiTuoYiShi';
  kind: 'github-cloud-save';
  version: number;
  updatedAt: string;
  saves: GitHubCloudSaveItem[];
}

interface GitHubContentResponse {
  sha: string;
  content?: string;
  encoding?: string;
}

interface GitHubBlobResponse {
  content?: string;
  encoding?: string;
}

interface GitHubUserResponse {
  login?: string;
  avatar_url?: string;
  html_url?: string;
}

interface GitHubRepoResponse {
  default_branch?: string;
}

export function createDefaultGitHubCloudConfig(): GitHubCloudSaveConfig {
  return {
    owner: '',
    repo: '',
    branch: 'main',
    rootPath: 'kaituoyishi-cloud',
    token: '',
  };
}

export function validateGitHubCloudConfig(config: GitHubCloudSaveConfig): void {
  if (!config.owner.trim()) throw new Error('请填写 GitHub 用户名或组织名。');
  if (!config.repo.trim()) throw new Error('请填写 GitHub 仓库名。');
  if (!config.branch.trim()) throw new Error('请填写分支名。');
  if (!config.token.trim()) throw new Error('请填写 GitHub Token。');
}

export async function getGitHubAccountInfo(token: string): Promise<GitHubAccountInfo> {
  if (!token.trim()) throw new Error('请先填写 GitHub Token。');
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: githubHeaders({ ...createDefaultGitHubCloudConfig(), token }),
  });
  if (!res.ok) throw new Error(await githubError(res, '绑定 GitHub 账号失败'));
  const data = await res.json() as GitHubUserResponse;
  if (!data.login) throw new Error('GitHub 没有返回账号信息。');
  return {
    login: data.login,
    avatarUrl: data.avatar_url ?? '',
    htmlUrl: data.html_url ?? `https://github.com/${data.login}`,
  };
}

export async function bindGitHubCloudAccount(token: string): Promise<{ config: GitHubCloudSaveConfig; account: GitHubAccountInfo }> {
  const account = await getGitHubAccountInfo(token);
  const config: GitHubCloudSaveConfig = {
    owner: account.login,
    repo: 'kaituoyishi-cloud-save',
    branch: 'main',
    rootPath: 'kaituoyishi-cloud',
    token: token.trim(),
  };
  const branch = await ensureCloudRepository(config);
  const nextConfig = { ...config, branch: branch || config.branch };
  await testGitHubCloudConnection(nextConfig);
  return { config: nextConfig, account };
}

export async function testGitHubCloudConnection(config: GitHubCloudSaveConfig): Promise<void> {
  validateGitHubCloudConfig(config);
  const path = joinCloudPath(config.rootPath, '.sync-test.json');
  const previous = await getContent(config, path);
  const body = {
    app: 'KaiTuoYiShi',
    kind: 'github-cloud-save-test',
    testedAt: new Date().toISOString(),
  };
  await putContent(config, path, JSON.stringify(body, null, 2), 'test github cloud save connection', previous?.sha);
}

async function ensureCloudRepository(config: GitHubCloudSaveConfig): Promise<string | null> {
  const existing = await getRepository(config);
  if (existing) return existing.default_branch ?? null;

  const res = await fetch(`${GITHUB_API}/user/repos`, {
    method: 'POST',
    headers: githubHeaders(config),
    body: JSON.stringify({
      name: config.repo.trim(),
      private: true,
      auto_init: true,
      description: '开拓轶事 GitHub 云存档',
    }),
  });
  if (!res.ok) {
    throw new Error(await githubError(res, '自动创建云存档仓库失败，请确认 Token 具备创建私有仓库权限，或在高级设置中填写已有仓库'));
  }
  const repo = await res.json() as GitHubRepoResponse;
  return repo.default_branch ?? null;
}

async function getRepository(config: GitHubCloudSaveConfig): Promise<GitHubRepoResponse | null> {
  const res = await fetch(`${GITHUB_API}/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}`, {
    headers: githubHeaders(config),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await githubError(res, '读取 GitHub 仓库失败'));
  return await res.json() as GitHubRepoResponse;
}

export async function listGitHubCloudSaves(config: GitHubCloudSaveConfig): Promise<GitHubCloudSaveManifest> {
  validateGitHubCloudConfig(config);
  const manifest = await readManifest(config);
  return manifest ?? createEmptyManifest();
}

export async function uploadSaveToGitHubCloud(config: GitHubCloudSaveConfig, save: 存档数据): Promise<GitHubCloudSaveItem> {
  validateGitHubCloudConfig(config);
  const manifest = (await readManifest(config)) ?? createEmptyManifest();
  const blob = buildSavePackage(save);
  const buffer = await blob.arrayBuffer();
  const stamp = new Date(save.timestamp || Date.now()).toISOString().replace(/[:.]/g, '-');
  const travelerName = save.旅人?.姓名 || 'traveler';
  const turnCount = save.turnCount ?? ((save.chatHistory?.length ?? 0) + 1);
  const cloudId = `${sanitizePathPart(travelerName)}-turn-${turnCount}-${stamp}`;
  const savePath = joinCloudPath(config.rootPath, 'saves', `${cloudId}.zip`);
  const previousSave = await getContent(config, savePath);

  await putContent(
    config,
    savePath,
    bytesToBase64(new Uint8Array(buffer)),
    `upload cloud save ${cloudId}`,
    previousSave?.sha,
    true,
  );

  const item: GitHubCloudSaveItem = {
    cloudId,
    travelerName,
    turnCount,
    timestamp: save.timestamp || Date.now(),
    uploadedAt: new Date().toISOString(),
    sizeBytes: buffer.byteLength,
    path: savePath,
  };

  const nextManifest: GitHubCloudSaveManifest = {
    ...manifest,
    updatedAt: item.uploadedAt,
    saves: [item, ...manifest.saves.filter((entry) => entry.cloudId !== cloudId)].slice(0, 50),
  };
  await writeManifest(config, nextManifest);
  return item;
}

export async function uploadAllSavesToGitHubCloud(
  config: GitHubCloudSaveConfig,
  saves: 存档数据[],
  onProgress?: (current: number, total: number, label: string) => void,
): Promise<GitHubCloudSaveManifest> {
  validateGitHubCloudConfig(config);
  const previousManifest = (await readManifest(config)) ?? createEmptyManifest();
  const nextItems: GitHubCloudSaveItem[] = [];

  const ordered = [...saves].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  for (let index = 0; index < ordered.length; index += 1) {
    const save = ordered[index];
    const blob = buildSavePackage(save);
    const buffer = await blob.arrayBuffer();
    const localSaveId = Number.isFinite(save.id) && save.id > 0 ? save.id : nextItems.length + 1;
    const cloudId = `local-save-${localSaveId}`;
    const savePath = joinCloudPath(config.rootPath, 'saves', `${cloudId}.zip`);
    const previousSave = await getContent(config, savePath);
    const label = `${save.旅人?.姓名 || 'traveler'} · 第 ${save.turnCount ?? ((save.chatHistory?.length ?? 0) + 1)} 回合`;
    onProgress?.(index, ordered.length, label);

    await putContent(
      config,
      savePath,
      bytesToBase64(new Uint8Array(buffer)),
      `sync cloud save ${cloudId}`,
      previousSave?.sha,
      true,
    );

    nextItems.push({
      cloudId,
      localSaveId,
      saveType: String(save.type || 'manual'),
      travelerName: save.旅人?.姓名 || 'traveler',
      turnCount: save.turnCount ?? ((save.chatHistory?.length ?? 0) + 1),
      timestamp: save.timestamp || Date.now(),
      uploadedAt: new Date().toISOString(),
      sizeBytes: buffer.byteLength,
      path: savePath,
    });
    onProgress?.(index + 1, ordered.length, label);
  }

  const nextPaths = new Set(nextItems.map((item) => item.path));
  for (const oldItem of previousManifest.saves) {
    if (!oldItem.path || nextPaths.has(oldItem.path)) continue;
    await deleteContent(config, oldItem.path, `remove stale cloud save ${oldItem.cloudId}`).catch(() => {});
  }

  const nextManifest: GitHubCloudSaveManifest = {
    app: 'KaiTuoYiShi',
    kind: 'github-cloud-save',
    version: 1,
    updatedAt: new Date().toISOString(),
    saves: [...nextItems].sort((a, b) => b.timestamp - a.timestamp),
  };
  await writeManifest(config, nextManifest);
  return nextManifest;
}

export async function downloadSaveFromGitHubCloud(
  config: GitHubCloudSaveConfig,
  item: GitHubCloudSaveItem,
): Promise<存档数据> {
  validateGitHubCloudConfig(config);
  const base64 = await readFileBase64(config, item.path);
  const bytes = base64ToBytes(base64);
  return parseSavePackage(bytes.slice().buffer);
}

async function readManifest(config: GitHubCloudSaveConfig): Promise<GitHubCloudSaveManifest | null> {
  const path = manifestPath(config);
  const file = await getContent(config, path);
  if (!file) return null;
  const text = new TextDecoder().decode(base64ToBytes(await readFileBase64(config, path, file)));
  const manifest = JSON.parse(text) as Partial<GitHubCloudSaveManifest>;
  if (manifest.app !== 'KaiTuoYiShi' || manifest.kind !== 'github-cloud-save') {
    throw new Error('云端 manifest 不是有效的开拓轶事云存档清单。');
  }
  return {
    app: 'KaiTuoYiShi',
    kind: 'github-cloud-save',
    version: 1,
    updatedAt: String(manifest.updatedAt || ''),
    saves: Array.isArray(manifest.saves) ? manifest.saves as GitHubCloudSaveItem[] : [],
  };
}

async function writeManifest(config: GitHubCloudSaveConfig, manifest: GitHubCloudSaveManifest): Promise<void> {
  const path = manifestPath(config);
  const previous = await getContent(config, path);
  await putContent(config, path, JSON.stringify(manifest, null, 2), 'update cloud save manifest', previous?.sha);
}

function createEmptyManifest(): GitHubCloudSaveManifest {
  return {
    app: 'KaiTuoYiShi',
    kind: 'github-cloud-save',
    version: 1,
    updatedAt: '',
    saves: [],
  };
}

async function getContent(config: GitHubCloudSaveConfig, path: string): Promise<GitHubContentResponse | null> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch.trim())}`;
  const res = await fetch(url, { headers: githubHeaders(config) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await githubError(res, '读取 GitHub 文件失败'));
  const data = await res.json();
  if (Array.isArray(data)) throw new Error('云存档路径指向了目录，不是文件。');
  return data as GitHubContentResponse;
}

async function readFileBase64(
  config: GitHubCloudSaveConfig,
  path: string,
  known?: GitHubContentResponse | null,
): Promise<string> {
  const file = known ?? await getContent(config, path);
  if (!file) throw new Error('云端文件不存在。');
  if (file.content && file.encoding === 'base64') return file.content.replace(/\s/g, '');
  const blobUrl = `${GITHUB_API}/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}/git/blobs/${encodeURIComponent(file.sha)}`;
  const res = await fetch(blobUrl, { headers: githubHeaders(config) });
  if (!res.ok) throw new Error(await githubError(res, '读取 GitHub Blob 失败'));
  const blob = await res.json() as GitHubBlobResponse;
  if (!blob.content || blob.encoding !== 'base64') throw new Error('云端文件内容不是可识别的 Base64。');
  return blob.content.replace(/\s/g, '');
}

async function putContent(
  config: GitHubCloudSaveConfig,
  path: string,
  content: string,
  message: string,
  sha?: string,
  alreadyBase64 = false,
): Promise<void> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}/contents/${encodePath(path)}`;
  const body: Record<string, unknown> = {
    message,
    branch: config.branch.trim(),
    content: alreadyBase64 ? content : bytesToBase64(new TextEncoder().encode(content)),
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: githubHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await githubError(res, '写入 GitHub 文件失败'));
}

async function deleteContent(
  config: GitHubCloudSaveConfig,
  path: string,
  message: string,
): Promise<void> {
  const previous = await getContent(config, path);
  if (!previous?.sha) return;
  const url = `${GITHUB_API}/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}/contents/${encodePath(path)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: githubHeaders(config),
    body: JSON.stringify({
      message,
      branch: config.branch.trim(),
      sha: previous.sha,
    }),
  });
  if (!res.ok && res.status !== 404) throw new Error(await githubError(res, '删除 GitHub 旧存档失败'));
}

function githubHeaders(config: GitHubCloudSaveConfig): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${config.token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function githubError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    const message = typeof data?.message === 'string' ? data.message : '';
    if (res.status === 401 || /bad credentials/i.test(message)) {
      return `${fallback}：GitHub 授权已失效，请点击“重新授权”后再试。`;
    }
    return message ? `${fallback}：${message}` : fallback;
  } catch {
    return fallback;
  }
}

function manifestPath(config: GitHubCloudSaveConfig): string {
  return joinCloudPath(config.rootPath, MANIFEST_NAME);
}

function joinCloudPath(...parts: string[]): string {
  return parts
    .flatMap((part) => part.split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== '.' && part !== '..')
    .join('/');
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function sanitizePathPart(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'traveler';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
