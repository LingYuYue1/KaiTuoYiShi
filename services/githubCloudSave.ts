import type { 存档数据 } from '@/models/settings';
import type { CloudBackupPointerV2 } from '@/services/cloudBackupPackage';
import { sha256Hex } from '@/services/cloudBackupPackage';
import {
  createCloudBackupTransfer,
  deleteCloudBackupTransfer,
  getCloudBackupTransferPart,
  putCloudBackupTransferPart,
  updateCloudBackupTransfer,
} from '@/services/storage/cloudBackupTransferStore';
import { githubRequest, readGitHubError, type GitHubRetryNotice } from '@/services/githubRequest';
import { parseSavePackage } from '@/services/savePackage';

const GITHUB_API = 'https://api.github.com';
const LEGACY_MANIFEST_NAME = 'manifest.json';
const BACKUP_POINTER_NAME = 'cloud-backup.json';

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
  contentHash?: string;
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

export interface GitHubCloudBackupListing {
  format: 'v2' | 'v1' | 'empty';
  updatedAt: string;
  nodeCount: number;
  treeCount: number;
  assetCount: number;
  totalBytes: number;
  pointer?: CloudBackupPointerV2;
  legacyManifest?: GitHubCloudSaveManifest;
}

export interface GitHubCloudTransferProgress {
  phase: 'checking' | 'uploading-part' | 'committing' | 'downloading-part' | 'verifying-part' | 'retrying' | 'completed';
  current: number;
  total: number;
  label: string;
}

export interface GitHubCloudTransferOptions {
  signal?: AbortSignal;
  onProgress?: (progress: GitHubCloudTransferProgress) => void;
}

export interface DownloadedCloudBackupV2 {
  transferId: string;
  pointer: CloudBackupPointerV2;
}

interface GitHubContentResponse {
  sha: string;
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

interface GitHubRefResponse {
  object?: { sha?: string };
}

interface GitHubCommitResponse {
  sha?: string;
  tree?: { sha?: string };
}

interface GitHubObjectResponse {
  sha?: string;
}

interface GitTreeEntry {
  path: string;
  mode: '100644';
  type: 'blob';
  sha: string | null;
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

export async function getGitHubAccountInfo(token: string, signal?: AbortSignal): Promise<GitHubAccountInfo> {
  if (!token.trim()) throw new Error('请先填写 GitHub Token。');
  const config = { ...createDefaultGitHubCloudConfig(), token };
  const response = await githubRequest(`${GITHUB_API}/user`, {
    headers: githubHeaders(config),
    phase: '绑定 GitHub 账号',
    signal,
  });
  if (!response.ok) throw new Error(await readGitHubError(response, '绑定 GitHub 账号失败'));
  const data = await response.json() as GitHubUserResponse;
  if (!data.login) throw new Error('GitHub 没有返回账号信息。');
  return {
    login: data.login,
    avatarUrl: data.avatar_url ?? '',
    htmlUrl: data.html_url ?? `https://github.com/${data.login}`,
  };
}

export async function bindGitHubCloudAccount(
  token: string,
  signal?: AbortSignal,
): Promise<{ config: GitHubCloudSaveConfig; account: GitHubAccountInfo }> {
  const account = await getGitHubAccountInfo(token, signal);
  const config: GitHubCloudSaveConfig = {
    owner: account.login,
    repo: 'kaituoyishi-cloud-save',
    branch: 'main',
    rootPath: 'kaituoyishi-cloud',
    token: token.trim(),
  };
  const branch = await ensureCloudRepository(config, signal);
  const nextConfig = { ...config, branch: branch || config.branch };
  await testGitHubCloudConnection(nextConfig, signal);
  return { config: nextConfig, account };
}

export async function testGitHubCloudConnection(config: GitHubCloudSaveConfig, signal?: AbortSignal): Promise<void> {
  validateGitHubCloudConfig(config);
  const path = joinCloudPath(config.rootPath, '.sync-test.json');
  const previous = await getContent(config, path, signal);
  const body = JSON.stringify({
    app: 'KaiTuoYiShi',
    kind: 'github-cloud-save-test',
    testedAt: new Date().toISOString(),
  }, null, 2);
  await putContent(config, path, body, 'test github cloud save connection', previous?.sha, signal);
}

export async function inspectGitHubCloudBackup(
  config: GitHubCloudSaveConfig,
  options: GitHubCloudTransferOptions = {},
): Promise<GitHubCloudBackupListing> {
  validateGitHubCloudConfig(config);
  options.onProgress?.({ phase: 'checking', current: 0, total: 1, label: '正在检查云端完整备份' });
  const pointer = await readCloudBackupPointer(config, options.signal);
  if (pointer) {
    return {
      format: 'v2',
      updatedAt: pointer.createdAt,
      nodeCount: pointer.nodeCount,
      treeCount: pointer.treeCount,
      assetCount: pointer.assetCount,
      totalBytes: pointer.totalBytes,
      pointer,
    };
  }
  const legacyManifest = await readManifest(config, options.signal);
  if (legacyManifest?.saves.length) {
    return {
      format: 'v1',
      updatedAt: legacyManifest.updatedAt,
      nodeCount: legacyManifest.saves.length,
      treeCount: 0,
      assetCount: 0,
      totalBytes: legacyManifest.saves.reduce((sum, item) => sum + Math.max(0, item.sizeBytes || 0), 0),
      legacyManifest,
    };
  }
  return { format: 'empty', updatedAt: '', nodeCount: 0, treeCount: 0, assetCount: 0, totalBytes: 0 };
}

export async function uploadCompleteBackupToGitHub(
  config: GitHubCloudSaveConfig,
  transferId: string,
  pointer: CloudBackupPointerV2,
  options: GitHubCloudTransferOptions = {},
): Promise<CloudBackupPointerV2> {
  validateGitHubCloudConfig(config);
  pointer = rootCloudBackupPartPaths(config, pointer);
  validateCloudBackupPointer(pointer);
  assertNotAborted(options.signal);
  await updateCloudBackupTransfer(transferId, { phase: 'uploading', pointer });

  // 旧指针或旧 manifest 即使损坏，也不能阻止玩家用一次新的完整备份修复云端。
  const oldPointer = await readCloudBackupPointer(config, options.signal).catch(() => null);
  const oldManifest = await readManifest(config, options.signal).catch(() => null);
  const uploadedParts: Array<{ path: string; sha: string }> = [];
  try {
    for (let index = 0; index < pointer.parts.length; index += 1) {
      assertNotAborted(options.signal);
      const meta = pointer.parts[index];
      options.onProgress?.({
        phase: 'uploading-part',
        current: index,
        total: pointer.parts.length,
        label: `正在上传分卷 ${index + 1}/${pointer.parts.length}`,
      });
      const stored = await getCloudBackupTransferPart(transferId, meta.index);
      if (!stored) throw new Error(`本地临时分卷 ${index + 1}/${pointer.parts.length} 不存在，请重新打包。`);
      if (stored.meta.sha256 !== meta.sha256 || stored.blob.size !== meta.sizeBytes) {
        throw new Error(`本地临时分卷 ${index + 1}/${pointer.parts.length} 元数据不一致，请重新打包。`);
      }
      const bytes = new Uint8Array(await stored.blob.arrayBuffer());
      if (await sha256Hex(bytes) !== meta.sha256) {
        throw new Error(`本地临时分卷 ${index + 1}/${pointer.parts.length} 校验失败，请重新打包。`);
      }
      const sha = await createGitBlob(config, bytes, {
        ...options,
        progressCurrent: index,
        progressTotal: pointer.parts.length,
        phaseLabel: `上传分卷 ${index + 1}/${pointer.parts.length}`,
      });
      uploadedParts.push({ path: meta.path, sha });
      options.onProgress?.({
        phase: 'uploading-part',
        current: index + 1,
        total: pointer.parts.length,
        label: `已上传分卷 ${index + 1}/${pointer.parts.length}`,
      });
      await yieldToMainThread();
      if (index + 1 < pointer.parts.length) await delayWithSignal(180, options.signal);
    }

    const pointerBytes = new TextEncoder().encode(JSON.stringify(pointer, null, 2));
    const pointerSha = await createGitBlob(config, pointerBytes, {
      ...options,
      progressCurrent: pointer.parts.length,
      progressTotal: pointer.parts.length,
      phaseLabel: '上传完整备份清单',
    });
    options.onProgress?.({
      phase: 'committing',
      current: pointer.parts.length,
      total: pointer.parts.length,
      label: '正在原子提交完整云备份',
    });

    const treeEntries: GitTreeEntry[] = [
      ...uploadedParts.map((part) => ({ path: part.path, mode: '100644' as const, type: 'blob' as const, sha: part.sha })),
      { path: backupPointerPath(config), mode: '100644', type: 'blob', sha: pointerSha },
      ...obsoleteCloudPaths(config, oldPointer, oldManifest, pointer).map((path) => ({
        path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: null,
      })),
    ];
    await publishAtomicCloudCommit(config, treeEntries, pointer, options);
    await updateCloudBackupTransfer(transferId, { phase: 'completed', pointer });
    await deleteCloudBackupTransfer(transferId);
    options.onProgress?.({
      phase: 'completed',
      current: pointer.parts.length,
      total: pointer.parts.length,
      label: '完整云备份已提交',
    });
    return pointer;
  } catch (error) {
    await deleteCloudBackupTransfer(transferId).catch(() => {});
    throw error;
  }
}

export async function downloadCompleteBackupFromGitHub(
  config: GitHubCloudSaveConfig,
  pointer: CloudBackupPointerV2,
  options: GitHubCloudTransferOptions = {},
): Promise<DownloadedCloudBackupV2> {
  validateGitHubCloudConfig(config);
  validateCloudBackupPointer(pointer);
  const transferId = `download-${pointer.snapshotId}-${Date.now()}`;
  await createCloudBackupTransfer(transferId, 'download', 'downloading');
  try {
    for (let index = 0; index < pointer.parts.length; index += 1) {
      assertNotAborted(options.signal);
      const part = pointer.parts[index];
      options.onProgress?.({
        phase: 'downloading-part',
        current: index,
        total: pointer.parts.length,
        label: `正在下载分卷 ${index + 1}/${pointer.parts.length}`,
      });
      const bytes = await readFileBytes(config, part.path, options.signal, {
        timeoutMs: transferTimeoutMs(part.sizeBytes),
        onRetry: createRetryReporter(options, index, pointer.parts.length),
        phase: `下载分卷 ${index + 1}/${pointer.parts.length}`,
      });
      options.onProgress?.({
        phase: 'verifying-part',
        current: index,
        total: pointer.parts.length,
        label: `正在校验分卷 ${index + 1}/${pointer.parts.length}`,
      });
      if (bytes.byteLength !== part.sizeBytes || await sha256Hex(bytes) !== part.sha256) {
        throw new Error(`云端分卷 ${index + 1}/${pointer.parts.length} 大小或 SHA-256 校验失败，本地存档没有改变。`);
      }
      await putCloudBackupTransferPart(
        transferId,
        part,
        new Blob([bytes], { type: 'application/octet-stream' }),
      );
      options.onProgress?.({
        phase: 'downloading-part',
        current: index + 1,
        total: pointer.parts.length,
        label: `已下载并校验分卷 ${index + 1}/${pointer.parts.length}`,
      });
      await yieldToMainThread();
    }
    await updateCloudBackupTransfer(transferId, { phase: 'downloaded', pointer });
    return { transferId, pointer };
  } catch (error) {
    await deleteCloudBackupTransfer(transferId).catch(() => {});
    throw error;
  }
}

export async function downloadLegacySaveFromGitHub(
  config: GitHubCloudSaveConfig,
  item: GitHubCloudSaveItem,
  options: GitHubCloudTransferOptions = {},
): Promise<存档数据> {
  validateGitHubCloudConfig(config);
  const bytes = await readFileBytes(config, item.path, options.signal, {
    timeoutMs: transferTimeoutMs(item.sizeBytes),
    phase: `下载旧版云存档 ${item.cloudId}`,
    onRetry: createRetryReporter(options, 0, 1),
  });
  return parseSavePackage(bytes.slice().buffer);
}

// 旧调用方的只读兼容入口；版本 2 界面使用 inspectGitHubCloudBackup。
export async function listGitHubCloudSaves(config: GitHubCloudSaveConfig): Promise<GitHubCloudSaveManifest> {
  validateGitHubCloudConfig(config);
  return await readManifest(config) ?? createEmptyManifest();
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

// 旧调用方的只读兼容入口；不会覆盖本地存档。
export async function downloadSaveFromGitHubCloud(
  config: GitHubCloudSaveConfig,
  item: GitHubCloudSaveItem,
): Promise<存档数据> {
  return downloadLegacySaveFromGitHub(config, item);
}

async function ensureCloudRepository(config: GitHubCloudSaveConfig, signal?: AbortSignal): Promise<string | null> {
  const existing = await getRepository(config, signal);
  if (existing) return existing.default_branch ?? null;
  const response = await githubRequest(`${GITHUB_API}/user/repos`, {
    method: 'POST',
    headers: githubHeaders(config),
    body: JSON.stringify({
      name: config.repo.trim(),
      private: true,
      auto_init: true,
      description: '开拓轶事 GitHub 云存档',
    }),
    phase: '创建 GitHub 云存档仓库',
    timeoutMs: 30_000,
    signal,
  });
  if (!response.ok) {
    throw new Error(await readGitHubError(response, '自动创建云存档仓库失败，请确认授权具备创建私有仓库权限'));
  }
  const repo = await response.json() as GitHubRepoResponse;
  return repo.default_branch ?? null;
}

async function getRepository(config: GitHubCloudSaveConfig, signal?: AbortSignal): Promise<GitHubRepoResponse | null> {
  const response = await githubRequest(`${repoApi(config)}`, {
    headers: githubHeaders(config),
    phase: '读取 GitHub 仓库',
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readGitHubError(response, '读取 GitHub 仓库失败'));
  return await response.json() as GitHubRepoResponse;
}

async function readCloudBackupPointer(
  config: GitHubCloudSaveConfig,
  signal?: AbortSignal,
): Promise<CloudBackupPointerV2 | null> {
  const bytes = await readOptionalFileBytes(config, backupPointerPath(config), signal, {
    timeoutMs: 20_000,
    phase: '读取云端完整备份清单',
  });
  if (!bytes) return null;
  let pointer: CloudBackupPointerV2;
  try {
    pointer = JSON.parse(new TextDecoder().decode(bytes)) as CloudBackupPointerV2;
  } catch {
    throw new Error('云端完整备份清单不是有效的 JSON，本地存档没有改变。');
  }
  validateCloudBackupPointer(pointer);
  return pointer;
}

async function readManifest(
  config: GitHubCloudSaveConfig,
  signal?: AbortSignal,
): Promise<GitHubCloudSaveManifest | null> {
  const bytes = await readOptionalFileBytes(config, manifestPath(config), signal, {
    timeoutMs: 20_000,
    phase: '读取旧版云存档清单',
  });
  if (!bytes) return null;
  const manifest = JSON.parse(new TextDecoder().decode(bytes)) as Partial<GitHubCloudSaveManifest>;
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

async function createGitBlob(
  config: GitHubCloudSaveConfig,
  bytes: Uint8Array,
  options: GitHubCloudTransferOptions & {
    progressCurrent: number;
    progressTotal: number;
    phaseLabel: string;
  },
): Promise<string> {
  const response = await githubRequest(`${repoApi(config)}/git/blobs`, {
    method: 'POST',
    headers: githubHeaders(config),
    body: JSON.stringify({ content: bytesToBase64(bytes), encoding: 'base64' }),
    phase: options.phaseLabel,
    timeoutMs: transferTimeoutMs(bytes.byteLength),
    maxAttempts: 3,
    signal: options.signal,
    onRetry: createRetryReporter(options, options.progressCurrent, options.progressTotal),
  });
  if (!response.ok) throw new Error(await readGitHubError(response, `${options.phaseLabel}失败`));
  const data = await response.json() as GitHubObjectResponse;
  if (!data.sha) throw new Error(`${options.phaseLabel}失败：GitHub 没有返回 Blob SHA。`);
  return data.sha;
}

async function publishAtomicCloudCommit(
  config: GitHubCloudSaveConfig,
  treeEntries: GitTreeEntry[],
  pointer: CloudBackupPointerV2,
  options: GitHubCloudTransferOptions,
): Promise<void> {
  let lastConflict: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    assertNotAborted(options.signal);
    const head = await getBranchHead(config, options);
    const baseCommit = await getGitCommit(config, head, options);
    if (!baseCommit.tree?.sha) throw new Error('GitHub 当前分支提交没有可用的基础 tree。');
    const treeSha = await createGitTree(config, baseCommit.tree.sha, treeEntries, options);
    const commitSha = await createGitCommit(config, head, treeSha, pointer, options);
    const updated = await updateBranchRef(config, commitSha, options);
    if (updated) return;
    const currentHead = await getBranchHead(config, options);
    if (currentHead === commitSha) return;
    lastConflict = new Error(`云端分支在最终提交时发生并发变化（第 ${attempt}/3 次）。`);
    options.onProgress?.({
      phase: 'retrying',
      current: attempt,
      total: 3,
      label: `${lastConflict.message} 正在复用已上传分卷重建提交。`,
    });
  }
  throw lastConflict ?? new Error('云端分支提交失败。');
}

async function getBranchHead(config: GitHubCloudSaveConfig, options: GitHubCloudTransferOptions): Promise<string> {
  const response = await githubRequest(`${repoApi(config)}/git/ref/heads/${encodePath(config.branch.trim())}`, {
    headers: githubHeaders(config),
    phase: '读取 GitHub 分支',
    signal: options.signal,
    onRetry: createRetryReporter(options, 0, 1),
  });
  if (!response.ok) throw new Error(await readGitHubError(response, '读取 GitHub 分支失败'));
  const data = await response.json() as GitHubRefResponse;
  if (!data.object?.sha) throw new Error('GitHub 分支没有返回 commit SHA。');
  return data.object.sha;
}

async function getGitCommit(
  config: GitHubCloudSaveConfig,
  sha: string,
  options: GitHubCloudTransferOptions,
): Promise<GitHubCommitResponse> {
  const response = await githubRequest(`${repoApi(config)}/git/commits/${encodeURIComponent(sha)}`, {
    headers: githubHeaders(config),
    phase: '读取 GitHub 基础提交',
    signal: options.signal,
    onRetry: createRetryReporter(options, 0, 1),
  });
  if (!response.ok) throw new Error(await readGitHubError(response, '读取 GitHub 基础提交失败'));
  return await response.json() as GitHubCommitResponse;
}

async function createGitTree(
  config: GitHubCloudSaveConfig,
  baseTree: string,
  entries: GitTreeEntry[],
  options: GitHubCloudTransferOptions,
): Promise<string> {
  const response = await githubRequest(`${repoApi(config)}/git/trees`, {
    method: 'POST',
    headers: githubHeaders(config),
    body: JSON.stringify({ base_tree: baseTree, tree: entries }),
    phase: '创建 GitHub 备份目录',
    maxAttempts: 3,
    signal: options.signal,
    onRetry: createRetryReporter(options, 0, 1),
  });
  if (!response.ok) throw new Error(await readGitHubError(response, '创建 GitHub 备份目录失败'));
  const data = await response.json() as GitHubObjectResponse;
  if (!data.sha) throw new Error('GitHub 没有返回 tree SHA。');
  return data.sha;
}

async function createGitCommit(
  config: GitHubCloudSaveConfig,
  parent: string,
  tree: string,
  pointer: CloudBackupPointerV2,
  options: GitHubCloudTransferOptions,
): Promise<string> {
  const response = await githubRequest(`${repoApi(config)}/git/commits`, {
    method: 'POST',
    headers: githubHeaders(config),
    body: JSON.stringify({
      message: `publish complete cloud backup ${pointer.snapshotId}`,
      tree,
      parents: [parent],
    }),
    phase: '创建 GitHub 备份提交',
    maxAttempts: 3,
    signal: options.signal,
    onRetry: createRetryReporter(options, 0, 1),
  });
  if (!response.ok) throw new Error(await readGitHubError(response, '创建 GitHub 备份提交失败'));
  const data = await response.json() as GitHubObjectResponse;
  if (!data.sha) throw new Error('GitHub 没有返回 commit SHA。');
  return data.sha;
}

async function updateBranchRef(
  config: GitHubCloudSaveConfig,
  commitSha: string,
  options: GitHubCloudTransferOptions,
): Promise<boolean> {
  const response = await githubRequest(`${repoApi(config)}/git/refs/heads/${encodePath(config.branch.trim())}`, {
    method: 'PATCH',
    headers: githubHeaders(config),
    body: JSON.stringify({ sha: commitSha, force: false }),
    phase: '发布 GitHub 完整云备份',
    timeoutMs: 30_000,
    maxAttempts: 2,
    signal: options.signal,
    onRetry: createRetryReporter(options, 0, 1),
  });
  if (response.ok) return true;
  if (response.status === 409 || response.status === 422) return false;
  throw new Error(await readGitHubError(response, '发布 GitHub 完整云备份失败'));
}

function obsoleteCloudPaths(
  config: GitHubCloudSaveConfig,
  oldPointer: CloudBackupPointerV2 | null,
  oldManifest: GitHubCloudSaveManifest | null,
  nextPointer: CloudBackupPointerV2,
): string[] {
  const retained = new Set([backupPointerPath(config), ...nextPointer.parts.map((part) => part.path)]);
  const candidates = [
    ...(oldPointer?.parts.map((part) => part.path) ?? []),
    ...(oldManifest?.saves.map((item) => item.path) ?? []),
    ...(oldManifest ? [manifestPath(config)] : []),
  ];
  return Array.from(new Set(candidates.filter((path) => path && !retained.has(path))));
}

function rootCloudBackupPartPaths(
  config: GitHubCloudSaveConfig,
  pointer: CloudBackupPointerV2,
): CloudBackupPointerV2 {
  const rootPath = joinCloudPath(config.rootPath);
  return {
    ...pointer,
    parts: pointer.parts.map((part) => ({
      ...part,
      path: rootPath && !part.path.startsWith(`${rootPath}/`)
        ? joinCloudPath(rootPath, part.path)
        : part.path,
    })),
  };
}

async function getContent(
  config: GitHubCloudSaveConfig,
  path: string,
  signal?: AbortSignal,
): Promise<GitHubContentResponse | null> {
  const response = await githubRequest(contentUrl(config, path), {
    headers: githubHeaders(config),
    phase: '读取 GitHub 文件',
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readGitHubError(response, '读取 GitHub 文件失败'));
  const data = await response.json();
  if (Array.isArray(data)) throw new Error('云存档路径指向了目录，不是文件。');
  return data as GitHubContentResponse;
}

async function putContent(
  config: GitHubCloudSaveConfig,
  path: string,
  content: string,
  message: string,
  sha?: string,
  signal?: AbortSignal,
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    branch: config.branch.trim(),
    content: bytesToBase64(new TextEncoder().encode(content)),
  };
  if (sha) body.sha = sha;
  const response = await githubRequest(`${repoApi(config)}/contents/${encodePath(path)}`, {
    method: 'PUT',
    headers: githubHeaders(config),
    body: JSON.stringify(body),
    phase: '写入 GitHub 连接检查文件',
    timeoutMs: 30_000,
    signal,
  });
  if (!response.ok) throw new Error(await readGitHubError(response, '写入 GitHub 文件失败'));
}

async function readOptionalFileBytes(
  config: GitHubCloudSaveConfig,
  path: string,
  signal?: AbortSignal,
  request?: { timeoutMs?: number; phase?: string; onRetry?: (notice: GitHubRetryNotice) => void },
): Promise<Uint8Array | null> {
  const response = await githubRequest(contentUrl(config, path), {
    headers: githubRawHeaders(config),
    phase: request?.phase ?? '读取 GitHub 云存档文件',
    timeoutMs: request?.timeoutMs,
    onRetry: request?.onRetry,
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readGitHubError(response, `${request?.phase ?? '读取 GitHub 云存档文件'}失败`));
  return new Uint8Array(await response.arrayBuffer());
}

async function readFileBytes(
  config: GitHubCloudSaveConfig,
  path: string,
  signal?: AbortSignal,
  request?: { timeoutMs?: number; phase?: string; onRetry?: (notice: GitHubRetryNotice) => void },
): Promise<Uint8Array> {
  const bytes = await readOptionalFileBytes(config, path, signal, request);
  if (!bytes) throw new Error(`云端文件不存在：${path}`);
  return bytes;
}

function createRetryReporter(
  options: GitHubCloudTransferOptions,
  current: number,
  total: number,
): (notice: GitHubRetryNotice) => void {
  return (notice) => options.onProgress?.({
    phase: 'retrying',
    current,
    total,
    label: `${notice.phase}：${notice.reason}，${formatWait(notice.waitMs)}后进行第 ${notice.attempt + 1}/${notice.maxAttempts} 次尝试`,
  });
}

function validateCloudBackupPointer(pointer: CloudBackupPointerV2): void {
  if (!pointer || pointer.app !== 'KaiTuoYiShi' || pointer.kind !== 'github-cloud-backup' || pointer.version !== 2) {
    throw new Error('云端文件不是有效的开拓轶事完整备份。');
  }
  if (!pointer.snapshotId || !Array.isArray(pointer.parts) || !Array.isArray(pointer.nodes) || !Array.isArray(pointer.assets)) {
    throw new Error('完整云备份清单缺少必要字段。');
  }
  if (pointer.parts.length > 4096 || pointer.nodes.length > 100_000 || pointer.assets.length > 100_000) {
    throw new Error('完整云备份清单数量超过安全上限。');
  }
  const indexes = new Set<number>();
  for (const part of pointer.parts) {
    if (!Number.isSafeInteger(part.index) || part.index < 0 || indexes.has(part.index)) {
      throw new Error('完整云备份清单包含无效或重复的分卷编号。');
    }
    indexes.add(part.index);
    if (!isSafeCloudPath(part.path) || !/^[a-f0-9]{64}$/i.test(part.sha256) || part.sizeBytes < 0 || part.sizeBytes > 100 * 1024 * 1024) {
      throw new Error(`完整云备份分卷元数据无效：${part.path || '(空路径)'}`);
    }
  }
  if (pointer.nodeCount !== pointer.nodes.length) throw new Error('完整云备份节点计数不一致。');
  if (pointer.assetCount !== new Set(pointer.assets.map((asset) => asset.contentHash)).size) {
    throw new Error('完整云备份资源计数不一致。');
  }
  if (pointer.totalBytes !== pointer.parts.reduce((sum, part) => sum + part.sizeBytes, 0)) {
    throw new Error('完整云备份分卷总大小不一致。');
  }
  for (const node of pointer.nodes) {
    if (!indexes.has(node.partIndex) || !isSafeCloudEntryPath(node.entryPath) || !/^[a-f0-9]{64}$/i.test(node.fingerprint)) {
      throw new Error('完整云备份节点索引无效。');
    }
  }
  for (const asset of pointer.assets) {
    if (!indexes.has(asset.partIndex) || !isSafeCloudEntryPath(asset.entryPath) || !/^[a-f0-9]{64}$/i.test(asset.contentHash)) {
      throw new Error('完整云备份资源索引无效。');
    }
  }
}

function isSafeCloudPath(path: string): boolean {
  const normalized = String(path || '').replace(/\\/g, '/');
  return Boolean(normalized)
    && !normalized.startsWith('/')
    && normalized.split('/').every((segment) => Boolean(segment) && segment !== '.' && segment !== '..');
}

function isSafeCloudEntryPath(path: string): boolean {
  return isSafeCloudPath(path) && !path.includes('\0');
}

function githubHeaders(config: GitHubCloudSaveConfig): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${config.token.trim()}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function githubRawHeaders(config: GitHubCloudSaveConfig): HeadersInit {
  return {
    ...githubHeaders(config),
    Accept: 'application/vnd.github.raw+json',
  };
}

function repoApi(config: GitHubCloudSaveConfig): string {
  return `${GITHUB_API}/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}`;
}

function contentUrl(config: GitHubCloudSaveConfig, path: string): string {
  return `${repoApi(config)}/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch.trim())}`;
}

function backupPointerPath(config: GitHubCloudSaveConfig): string {
  return joinCloudPath(config.rootPath, BACKUP_POINTER_NAME);
}

function manifestPath(config: GitHubCloudSaveConfig): string {
  return joinCloudPath(config.rootPath, LEGACY_MANIFEST_NAME);
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function transferTimeoutMs(bytes: number): number {
  return Math.min(180_000, Math.max(30_000, 20_000 + Math.ceil(Math.max(0, bytes) / (256 * 1024)) * 1_000));
}

function formatWait(waitMs: number): string {
  return waitMs >= 1_000 ? `${Math.ceil(waitMs / 1_000)} 秒` : '片刻';
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('云备份操作已取消。', 'AbortError');
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function delayWithSignal(milliseconds: number, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, Math.max(0, milliseconds));
    const abort = () => {
      globalThis.clearTimeout(timeoutId);
      reject(signal?.reason ?? new DOMException('云备份操作已取消。', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
