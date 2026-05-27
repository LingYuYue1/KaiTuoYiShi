import { useState, useEffect, useMemo } from 'react';
import {
  getSaveList,
  deleteSave,
  loadSave,
  exportSaveJson,
  importSaveJson,
  saveGame,
  type SaveListItemSummary,
} from '@/services/dbService';

interface Props {
  onSave: () => Promise<number>;
  onLoad: (id: number) => Promise<boolean>;
  onClose: () => void;
}

type Tab = 'all' | 'manual' | 'auto' | 'protected';

const shellClip =
  'polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)';
const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

// 存档管理面板：左侧保存新存档 + 说明，右侧已有存档列表。
// 列表顶部 tab 切换手动 / 自动，默认显示手动。每条卡片展示旅人名、回合数、世界期，方便辨识。
export function SaveLoadModal({ onSave, onLoad, onClose }: Props) {
  const [saves, setSaves] = useState<SaveListItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<Tab>('manual');

  const refresh = async () => {
    setLoading(true);
    const list = await getSaveList();
    setSaves(list);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      await refresh();
      setTab('manual');
    } catch (err) {
      console.error('[save] failed', err);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCurrent = async () => {
    setSaving(true);
    try {
      const id = await onSave();
      const save = await loadSave(id);
      if (save) exportSaveJson(save);
      await refresh();
      setTab('manual');
    } catch (err) {
      console.error('[save-export-current] failed', err);
      alert('导出失败');
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (id: number) => {
    setLoadingId(id);
    const ok = await onLoad(id);
    setLoadingId(null);
    if (!ok) alert('加载失败');
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这个存档？此操作不可恢复。')) return;
    await deleteSave(id);
    await refresh();
  };

  const handleExport = async (id: number) => {
    const save = await loadSave(id);
    if (save) exportSaveJson(save);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        const data = importSaveJson(text);
        data.id = 0;
        data.type = 'imported';
        data.timestamp = Date.now();
        await saveGame(data);
        await refresh();
        setTab('protected');
      } catch (err) {
        console.error('[save-import] failed', err);
        alert(`导入失败：${err instanceof Error ? err.message : '存档文件格式无效'}`);
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const { manualSaves, autoSaves, protectedSaves } = useMemo(() => {
    const manual = saves.filter((s) => s.type === 'manual');
    const auto = saves.filter((s) => s.type === 'auto');
    const protectedItems = saves.filter((s) => s.type === 'backup' || s.type === 'imported');
    return { manualSaves: manual, autoSaves: auto, protectedSaves: protectedItems };
  }, [saves]);

  const visibleSaves =
    tab === 'manual' ? manualSaves
    : tab === 'auto' ? autoSaves
    : tab === 'protected' ? protectedSaves
    : saves;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className="kaituo-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[85vh] w-full max-w-[960px] flex-col animate-slide-up overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--tj-bg-secondary), 0.97), rgba(var(--tj-bg-primary), 0.98))',
          boxShadow:
            'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45), 0 0 32px rgba(var(--tj-accent-primary), 0.12), 0 20px 60px rgba(0, 0, 0, 0.6)',
          clipPath: shellClip,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.25)' }}
        >
          <h2
            className="font-serif text-lg font-bold tracking-[0.3em]"
            style={{
              background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 45%, rgb(var(--tj-accent-secondary)) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            <span style={{ color: 'rgba(var(--tj-accent-primary), 0.6)', WebkitTextFillColor: 'rgba(var(--tj-accent-primary), 0.6)' }}>◆</span>
            <span className="ml-2">存档管理</span>
          </h2>
          <button onClick={onClose} className="kaituo-close-btn" aria-label="关闭">
            ✕
          </button>
        </div>

        {/* Body：左右双栏 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左栏：保存按钮 + 说明 */}
          <aside
            className="flex w-[280px] flex-shrink-0 flex-col gap-4 px-5 py-5"
            style={{ borderRight: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 px-4 py-3 font-serif text-sm tracking-[0.3em] transition-all hover:opacity-90 disabled:opacity-50"
              style={{
                background:
                  'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))',
                color: 'rgb(var(--tj-on-accent))',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)',
                clipPath: cardClip,
              }}
            >
              <span style={{ fontSize: '15px' }}>＋</span>
              {saving ? '保存中…' : '保存新存档'}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="flex items-center justify-center gap-2 px-4 py-2.5 font-serif text-sm tracking-[0.24em] transition-all hover:opacity-90 disabled:opacity-50"
              style={{
                color: 'rgba(var(--tj-accent-primary), 0.92)',
                background: 'rgba(var(--tj-bg-secondary), 0.55)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)',
                clipPath: cardClip,
              }}
            >
              {importing ? '导入中…' : '导入 JSON'}
            </button>
            <button
              type="button"
              onClick={handleExportCurrent}
              disabled={saving}
              className="flex items-center justify-center gap-2 px-4 py-2.5 font-serif text-sm tracking-[0.24em] transition-all hover:opacity-90 disabled:opacity-50"
              style={{
                color: 'rgba(var(--tj-text-primary), 0.92)',
                background: 'rgba(var(--tj-bg-secondary), 0.45)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
                clipPath: cardClip,
              }}
            >
              导出当前存档
            </button>

            <div
              className="px-3 py-3 font-serif text-[12.5px] leading-relaxed tracking-wider"
              style={{
                color: 'rgba(var(--tj-text-primary), 0.88)',
                background: 'rgba(var(--tj-bg-secondary), 0.45)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                clipPath: cardClip,
              }}
            >
              <div className="mb-1.5 font-serif text-[12px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}>
                ◇ 关于存档
              </div>
              <div>· 手动存档可随时保存，数量不限</div>
              <div>· 每回合自动保存一次，最多保留 10 条</div>
              <div>· 读取旧档前会自动生成保护存档</div>
              <div>· 保护存档用于撤回误读，最多 3 条</div>
              <div>· 导入 JSON 会放入保护存档分区</div>
            </div>

            <div className="flex-1" />

            <div
              className="px-3 py-2 text-center font-serif text-[12px] tracking-[0.22em]"
              style={{
                color: 'rgba(var(--tj-text-secondary), 0.65)',
              }}
            >
              共 {saves.length} 条 · 手动 {manualSaves.length} · 自动 {autoSaves.length} · 保护 {protectedSaves.length}
            </div>
          </aside>

          {/* 右栏：tab 切换 + 列表 */}
          <main className="flex flex-1 flex-col overflow-hidden">
            {/* Tab bar */}
            <div
              className="flex flex-shrink-0 gap-2 px-5 pt-4 pb-3"
              style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.15)' }}
            >
              <TabButton
                label="手动存档"
                count={manualSaves.length}
                active={tab === 'manual'}
                onClick={() => setTab('manual')}
              />
              <TabButton
                label="自动存档"
                count={autoSaves.length}
                active={tab === 'auto'}
                onClick={() => setTab('auto')}
              />
              <TabButton
                label="全部"
                count={saves.length}
                active={tab === 'all'}
                onClick={() => setTab('all')}
              />
              <TabButton
                label="保护存档"
                count={protectedSaves.length}
                active={tab === 'protected'}
                onClick={() => setTab('protected')}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && saves.length === 0 && (
                <div
                  className="p-6 text-center text-xs font-serif tracking-[0.2em]"
                  style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}
                >
                  加载中…
                </div>
              )}

              {!loading && visibleSaves.length === 0 && (
                <div
                  className="p-6 text-center"
                  style={{
                    background: 'rgba(var(--tj-bg-secondary), 0.4)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
                    clipPath: cardClip,
                  }}
                >
                  <div className="mb-2 text-2xl" style={{ color: 'rgba(var(--tj-accent-primary), 0.45)' }}>✦</div>
                  <p
                    className="text-sm font-serif tracking-[0.2em]"
                    style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}
                  >
                    {tab === 'manual'
                      ? '尚无手动存档'
                      : tab === 'auto'
                        ? '尚无自动存档'
                        : tab === 'protected'
                          ? '尚无保护存档'
                          : '尚无存档'}
                  </p>
                  <p
                    className="mt-1.5 text-xs font-serif tracking-wider"
                    style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}
                  >
                    {tab === 'manual'
                      ? '点击左侧「保存新存档」留下第一道印记'
                      : tab === 'auto'
                        ? '开启旅程并推进回合后将自动留下印记'
                        : tab === 'protected'
                          ? '读取旧档前的自动备份和导入 JSON 会出现在这里'
                          : '当前还没有任何存档'}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {visibleSaves.map((s) => (
                  <SaveRow
                    key={s.id}
                    item={s}
                    loadingId={loadingId}
                    onLoad={handleLoad}
                    onDelete={handleDelete}
                    onExport={handleExport}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 font-serif text-[13px] tracking-[0.28em] transition-all"
      style={{
        color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-primary), 0.85)',
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))'
          : 'rgba(var(--tj-bg-secondary), 0.5)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.55)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)',
        clipPath: smallClip,
      }}
    >
      {label}
      <span
        className="ml-2 font-serif text-[11px]"
        style={{ color: active ? 'rgba(26, 19, 37, 0.7)' : 'rgba(var(--tj-text-secondary), 0.6)' }}
      >
        {count}
      </span>
    </button>
  );
}

function SaveRow({
  item,
  loadingId,
  onLoad,
  onDelete,
  onExport,
  formatTime,
}: {
  item: SaveListItemSummary;
  loadingId: number | null;
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
  onExport: (id: number) => void;
  formatTime: (ts: number) => string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 p-3"
      style={{
        background: 'rgba(var(--tj-bg-secondary), 0.55)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
        clipPath: cardClip,
      }}
    >
      {/* 左侧主信息：旅人名 + 元信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="flex-shrink-0 font-serif text-[11px] tracking-[0.18em]"
            style={{ color: typeColor(item.type) }}
          >
            {typeLabel(item.type)}
          </span>
          <span
            className="truncate font-serif text-[15px] font-semibold tracking-wider"
            style={{ color: 'rgb(var(--tj-text-primary))' }}
          >
            {item.travelerName || '（未命名旅人）'}
          </span>
          <span
            className="flex-shrink-0 font-serif text-[11px] tracking-wider"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}
          >
            #{item.id}
          </span>
        </div>
        <div
          className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-serif text-[12px] tracking-wider"
          style={{ color: 'rgba(var(--tj-text-primary), 0.85)' }}
        >
          <span style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>第 {item.turnCount} 回合</span>
          {(item.currentDate || item.currentTime || item.currentLocation) && (
            <>
              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.35)' }}>·</span>
              <span>{[item.currentDate, item.currentTime, item.currentLocation].filter(Boolean).join(' / ')}</span>
            </>
          )}
          {item.worldPeriodName && (
            <>
              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.35)' }}>·</span>
              <span>{item.worldPeriodName}</span>
            </>
          )}
          <span style={{ color: 'rgba(var(--tj-text-secondary), 0.35)' }}>·</span>
          <span style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>{formatTime(item.timestamp)}</span>
          <span style={{ color: 'rgba(var(--tj-text-secondary), 0.35)' }}>·</span>
          <span style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>{formatSize(item.sizeBytes)}</span>
        </div>
        {item.lastSummary && (
          <div
            className="mt-1 line-clamp-2 font-serif text-[12px] leading-relaxed"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}
          >
            {item.lastSummary}
          </div>
        )}
      </div>

      {/* 右侧按钮 */}
      <div className="flex flex-shrink-0 gap-1.5">
        <button
          onClick={() => onLoad(item.id)}
          disabled={loadingId !== null}
          className="px-3 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90 disabled:opacity-50"
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))',
            color: 'rgb(var(--tj-on-accent))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)',
            clipPath: smallClip,
          }}
        >
          {loadingId === item.id ? '读取中…' : '读取'}
        </button>
        <button
          onClick={() => onDelete(item.id)}
          disabled={loadingId !== null}
          className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90 disabled:opacity-50"
          style={{
            color: 'rgba(220, 120, 120, 0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(220, 120, 120, 0.35)',
            clipPath: smallClip,
          }}
        >
          删除
        </button>
        <button
          onClick={() => onExport(item.id)}
          disabled={loadingId !== null}
          className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90 disabled:opacity-50"
          style={{
            color: 'rgba(var(--tj-text-secondary), 0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
            clipPath: smallClip,
          }}
        >
          导出
        </button>
      </div>
    </div>
  );
}

function typeLabel(type: SaveListItemSummary['type']): string {
  if (type === 'auto') return '自动';
  if (type === 'backup') return '保护';
  if (type === 'imported') return '导入';
  return '手动';
}

function typeColor(type: SaveListItemSummary['type']): string {
  if (type === 'auto') return 'rgba(140, 210, 255, 0.86)';
  if (type === 'backup') return 'rgba(255, 190, 120, 0.9)';
  if (type === 'imported') return 'rgba(165, 230, 170, 0.9)';
  return 'rgba(var(--tj-accent-primary), 0.9)';
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
