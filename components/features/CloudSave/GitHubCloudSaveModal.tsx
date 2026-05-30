import { useEffect, useState } from 'react';
import { useGitHubOAuth } from '@/hooks/useGitHubOAuth';
import { getSaveList, loadSave, loadSetting, replaceAllSaves, saveSetting } from '@/services/dbService';
import {
  bindGitHubCloudAccount,
  createDefaultGitHubCloudConfig,
  downloadSaveFromGitHubCloud,
  getGitHubAccountInfo,
  listGitHubCloudSaves,
  uploadAllSavesToGitHubCloud,
  type GitHubAccountInfo,
  type GitHubCloudSaveConfig,
  type GitHubCloudSaveItem,
} from '@/services/githubCloudSave';

interface Props {
  onSave: () => Promise<number>;
  onClose: () => void;
}

const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export function GitHubCloudSaveModal({ onSave, onClose }: Props) {
  const [cloudConfig, setCloudConfig] = useState<GitHubCloudSaveConfig>(createDefaultGitHubCloudConfig);
  const [cloudSaves, setCloudSaves] = useState<GitHubCloudSaveItem[]>([]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState('');
  const [bindToken, setBindToken] = useState('');
  const [account, setAccount] = useState<GitHubAccountInfo | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ label: string; current: number; total: number } | null>(null);
  const { pending: oauthPending, error: oauthError, startGitHubOAuth, consumeGitHubOAuthCallback } = useGitHubOAuth();

  useEffect(() => {
    loadSetting<GitHubCloudSaveConfig>('githubCloudSaveConfig')
      .then((saved) => {
        if (!saved) return;
        const next = { ...createDefaultGitHubCloudConfig(), ...saved };
        setCloudConfig(next);
        setBindToken(next.token);
        if (next.token) {
          getGitHubAccountInfo(next.token)
            .then(setAccount)
            .catch(() => {});
          listGitHubCloudSaves(next)
            .then((manifest) => setCloudSaves(manifest.saves))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (window.location.pathname !== '/oauth/github/callback') return;
    setCloudBusy(true);
    setCloudMessage('正在完成 GitHub 授权绑定...');
    consumeGitHubOAuthCallback()
      .then(async (token) => {
        if (!token || cancelled) return;
        const result = await bindGitHubCloudAccount(token);
        if (cancelled) return;
        setAccount(result.account);
        setBindToken(result.config.token);
        await persistCloudConfig(result.config);
        const manifest = await listGitHubCloudSaves(result.config);
        if (cancelled) return;
        setCloudSaves(manifest.saves);
        setCloudMessage(`已绑定 GitHub：${result.account.login}。`);
      })
      .catch((err) => {
        if (!cancelled) setCloudMessage(err instanceof Error ? err.message : 'GitHub OAuth 绑定失败。');
      })
      .finally(() => {
        if (!cancelled) setCloudBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [consumeGitHubOAuthCallback]);

  const patchCloudConfig = (patch: Partial<GitHubCloudSaveConfig>) => {
    setCloudConfig((prev) => ({ ...prev, ...patch }));
  };

  const persistCloudConfig = async (next = cloudConfig) => {
    const clean = {
      ...next,
      owner: next.owner.trim(),
      repo: next.repo.trim(),
      branch: next.branch.trim() || 'main',
      rootPath: next.rootPath.trim() || 'kaituoyishi-cloud',
      token: next.token.trim(),
    };
    setCloudConfig(clean);
    await saveSetting('githubCloudSaveConfig', clean);
    return clean;
  };

  const runCloudTask = async (task: () => Promise<void>) => {
    setCloudBusy(true);
    setCloudMessage('');
    setSyncProgress(null);
    try {
      await task();
    } catch (err) {
      setCloudMessage(err instanceof Error ? err.message : 'GitHub 云存档操作失败。');
    } finally {
      setCloudBusy(false);
      setSyncProgress(null);
    }
  };

  const handleBindAccount = () => runCloudTask(async () => {
    const token = bindToken.trim() || cloudConfig.token.trim();
    const result = await bindGitHubCloudAccount(token);
    setAccount(result.account);
    setBindToken(result.config.token);
    await persistCloudConfig(result.config);
    const manifest = await listGitHubCloudSaves(result.config);
    setCloudSaves(manifest.saves);
    setCloudMessage(`已绑定 GitHub：${result.account.login}。`);
  });

  const handleOAuthBind = () => runCloudTask(async () => {
    await startGitHubOAuth();
  });

  const handleUnbind = () => runCloudTask(async () => {
    const next = createDefaultGitHubCloudConfig();
    setAccount(null);
    setBindToken('');
    setCloudSaves([]);
    await saveSetting('githubCloudSaveConfig', next);
    setCloudConfig(next);
    setCloudMessage('已解除本机 GitHub 云存档绑定。云端文件不会被删除。');
  });

  const handleCloudRefresh = () => runCloudTask(async () => {
    const config = await persistCloudConfig();
    const manifest = await listGitHubCloudSaves(config);
    setCloudSaves(manifest.saves);
    setCloudMessage(`已刷新云端数据：${manifest.saves.length} 条。`);
  });

  const handleCloudSyncAll = () => runCloudTask(async () => {
    const config = await persistCloudConfig();
    const summaries = await getSaveList();
    if (summaries.length === 0) throw new Error('本地还没有可上传的存档。');

    const saves = [];
    for (const summary of summaries) {
      const save = await loadSave(summary.id);
      if (!save) continue;
      saves.push({ ...save, id: summary.id, type: summary.type });
    }

    setCloudMessage(`正在同步本地存档：${saves.length} 条`);
    const manifest = await uploadAllSavesToGitHubCloud(config, saves, (current, total, label) => {
      setSyncProgress({ label: `上传 ${label}`, current, total });
    });
    setCloudSaves(manifest.saves);
    setCloudMessage(`已同步本地存档：${manifest.saves.length} 条。云端旧列表已由本次同步结果覆盖。`);
  });

  const handleCloudDownloadAll = () => runCloudTask(async () => {
    const confirmed = window.confirm(
      '下载到本地会用 GitHub 云端存档直接覆盖当前本地存档列表。\n\n本地现有手动存档、自动存档和保护存档都会被云端版本替换。确定继续吗？',
    );
    if (!confirmed) return;

    const config = await persistCloudConfig();
    const manifest = await listGitHubCloudSaves(config);
    if (manifest.saves.length === 0) throw new Error('云端还没有可下载的存档。');

    const downloaded = [];
    for (let index = 0; index < manifest.saves.length; index += 1) {
      const item = manifest.saves[index];
      setSyncProgress({
        label: `下载 ${item.travelerName || 'traveler'} · 第 ${item.turnCount} 回合`,
        current: index,
        total: manifest.saves.length,
      });
      const data = await downloadSaveFromGitHubCloud(config, item);
      data.id = item.localSaveId ?? index + 1;
      data.type = item.saveType === 'auto' || item.saveType === 'backup' || item.saveType === 'imported'
        ? item.saveType
        : 'manual';
      data.timestamp = item.timestamp || data.timestamp || Date.now();
      downloaded.push(data);
      setSyncProgress({
        label: `下载 ${item.travelerName || 'traveler'} · 第 ${item.turnCount} 回合`,
        current: index + 1,
        total: manifest.saves.length,
      });
    }

    await replaceAllSaves(downloaded);
    setCloudSaves(manifest.saves);
    setCloudMessage(`已用云端存档覆盖本地存档列表：${downloaded.length}/${manifest.saves.length} 条。`);
  });

  return (
    <div
      className="kaituo-modal-overlay fixed inset-0 z-50 flex items-stretch justify-center p-0 md:items-center md:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[100dvh] w-full max-w-[920px] flex-col overflow-hidden md:h-[82vh]"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--tj-bg-secondary), 0.97), rgba(var(--tj-bg-primary), 0.98))',
          boxShadow:
            'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45), 0 0 32px rgba(var(--tj-accent-primary), 0.12), 0 20px 60px rgba(0, 0, 0, 0.6)',
        }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-5" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.25)' }}>
          <div>
            <h2 className="font-serif text-lg font-bold tracking-[0.22em] md:tracking-[0.3em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
              GitHub 云存档
            </h2>
            <p className="mt-1 text-[12px] tracking-wider" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
              手动上传和下载。上传会覆盖云端记录，下载会覆盖本地存档。
            </p>
          </div>
          <button onClick={onClose} className="kaituo-close-btn" aria-label="关闭">
            X
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-5">
          <section className="space-y-4">
            <div
              className="px-3 py-3 text-[12px] leading-relaxed tracking-wider"
              style={{
                color: 'rgba(var(--tj-text-secondary), 0.82)',
                background: 'rgba(var(--tj-bg-secondary), 0.42)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
                clipPath: cardClip,
              }}
            >
              绑定后会自动使用或创建私有仓库 <span className="font-mono">kaituoyishi-cloud-save</span>。上传会用本地存档覆盖云端记录；下载会弹出确认，并用云端存档覆盖本地存档列表。
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div
                className="px-3 py-3"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.32)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                  clipPath: cardClip,
                }}
              >
                {account ? (
                  <div className="flex min-w-0 items-center gap-3">
                    {account.avatarUrl && (
                      <img src={account.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-serif text-[14px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
                        已绑定 {account.login}
                      </div>
                      <div className="mt-1 truncate text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                        {cloudConfig.owner}/{cloudConfig.repo} · {cloudConfig.branch}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="font-serif text-[14px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
                      尚未绑定 GitHub 账号
                    </div>
                    <div className="text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.74)' }}>
                      点击授权后会跳转到 GitHub 登录，授权完成会回到开拓轶事，并自动创建或使用私有云存档仓库。
                    </div>
                  </div>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 md:min-w-[220px] md:grid-cols-1">
                <CloudButton
                  label={account ? '重新授权' : (oauthPending ? '等待授权' : 'GitHub 授权')}
                  tone="primary"
                  disabled={cloudBusy || oauthPending}
                  onClick={handleOAuthBind}
                />
                {account && <CloudButton label="解除绑定" disabled={cloudBusy} onClick={handleUnbind} />}
              </div>
            </div>

            <details open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
              <summary className="cursor-pointer font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.78)' }}>
                高级配置 / Token 备用绑定
              </summary>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                <CloudInput label="Owner" value={cloudConfig.owner} onChange={(value) => patchCloudConfig({ owner: value })} placeholder="用户名或组织" />
                <CloudInput label="Repo" value={cloudConfig.repo} onChange={(value) => patchCloudConfig({ repo: value })} placeholder="私有仓库名" />
                <CloudInput label="Branch" value={cloudConfig.branch} onChange={(value) => patchCloudConfig({ branch: value })} placeholder="main" />
                <CloudInput label="Path" value={cloudConfig.rootPath} onChange={(value) => patchCloudConfig({ rootPath: value })} placeholder="kaituoyishi-cloud" />
                <CloudInput label="Token" value={cloudConfig.token} onChange={(value) => {
                  patchCloudConfig({ token: value });
                  setBindToken(value);
                }} placeholder="fine-grained PAT" password />
              </div>
              <div className="mt-2 max-w-[240px]">
                <CloudButton label="使用 Token 绑定" tone="primary" disabled={cloudBusy} onClick={handleBindAccount} />
              </div>
            </details>

            <div className="grid gap-2 sm:grid-cols-3">
              <CloudButton label="刷新数据" disabled={cloudBusy || !cloudConfig.token} onClick={handleCloudRefresh} />
              <CloudButton label="上传到云端" tone="primary" disabled={cloudBusy || !cloudConfig.token} onClick={handleCloudSyncAll} />
              <CloudButton label="下载到本地" tone="primary" disabled={cloudBusy || !cloudConfig.token} onClick={handleCloudDownloadAll} />
            </div>

            {syncProgress && (
              <CloudProgress
                label={syncProgress.label}
                current={syncProgress.current}
                total={syncProgress.total}
              />
            )}

            {(cloudMessage || oauthError) && (
              <div className="px-3 py-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)', background: 'rgba(var(--tj-bg-primary), 0.32)', clipPath: smallClip }}>
                {cloudMessage || oauthError}
              </div>
            )}

            <CloudRecordSummary saves={cloudSaves} />
          </section>
        </div>
      </div>
    </div>
  );
}

function CloudInput({
  label,
  value,
  onChange,
  placeholder,
  password = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  password?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <div className="mb-1 font-serif text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.76)' }}>
        {label}
      </div>
      <input
        type={password ? 'password' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent px-3 py-2 text-[12px] outline-none"
        style={{
          color: 'rgba(var(--tj-text-primary), 0.9)',
          background: 'rgba(var(--tj-bg-primary), 0.34)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
          clipPath: smallClip,
        }}
      />
    </label>
  );
}

function CloudButton({
  label,
  tone = 'quiet',
  disabled,
  onClick,
}: {
  label: string;
  tone?: 'primary' | 'quiet';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full px-4 py-2 text-sm font-serif tracking-[0.18em] transition-all hover:opacity-90 disabled:opacity-50"
      style={{
        color: tone === 'primary' ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-accent-primary), 0.9)',
        background: tone === 'primary'
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))'
          : 'rgba(var(--tj-bg-secondary), 0.55)',
        boxShadow: tone === 'primary'
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.52)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

function CloudProgress({
  label,
  current,
  total,
}: {
  label: string;
  current: number;
  total: number;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div
      className="px-3 py-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.32)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-mono">{current}/{total}</span>
      </div>
      <div
        className="h-2 overflow-hidden"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.8)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24)',
          clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
        }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))',
          }}
        />
      </div>
    </div>
  );
}

function CloudRecordSummary({ saves }: { saves: GitHubCloudSaveItem[] }) {
  const latest = saves
    .map((item) => item.uploadedAt || '')
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div
      className="grid gap-2 px-3 py-3 text-[12px] sm:grid-cols-[auto_1fr]"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.3)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.82)' }}>
        最近云端记录
      </div>
      <div style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
        {latest ? new Date(latest).toLocaleString('zh-CN') : '暂无云端同步记录'}
      </div>
    </div>
  );
}
