import { useEffect, useMemo, useState } from 'react';
import {
  deleteSave,
  exportSaveJson,
  getSaveList,
  importSaveJson,
  loadSave,
  saveGame,
  type SaveListItemSummary,
} from '@/services/dbService';

interface Props {
  onSave: () => Promise<number>;
  onContinue: () => Promise<boolean>;
  onLoadSave: (id: number) => Promise<boolean>;
}

type Filter = 'all' | 'manual' | 'auto' | 'protected';

const cardClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export function StorageManagerTab({ onSave, onContinue, onLoadSave }: Props) {
  const [saves, setSaves] = useState<SaveListItemSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<Filter>('manual');

  const refresh = async () => {
    const list = await getSaveList();
    setSaves(list);
  };

  useEffect(() => {
    refresh();
  }, []);

  const grouped = useMemo(() => {
    const manual = saves.filter((s) => s.type === 'manual');
    const auto = saves.filter((s) => s.type === 'auto');
    const protectedItems = saves.filter((s) => s.type === 'backup' || s.type === 'imported');
    return { manual, auto, protectedItems };
  }, [saves]);

  const visible =
    filter === 'manual' ? grouped.manual
    : filter === 'auto' ? grouped.auto
    : filter === 'protected' ? grouped.protectedItems
    : saves;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      await refresh();
      setFilter('manual');
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
      setFilter('manual');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    const ok = await onContinue();
    setLoading(false);
    if (!ok) alert('没有可用的存档');
  };

  const handleLoad = async (id: number) => {
    setLoadingId(id);
    const ok = await onLoadSave(id);
    setLoadingId(null);
    if (!ok) alert('读取失败');
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
        const data = importSaveJson(await file.text());
        data.id = 0;
        data.type = 'imported';
        data.timestamp = Date.now();
        await saveGame(data);
        await refresh();
        setFilter('protected');
      } catch (err) {
        alert(`导入失败：${err instanceof Error ? err.message : '存档文件格式无效'}`);
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[1fr_auto]">
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
          <ActionButton label={saving ? '保存中' : '手动存档'} tone="primary" disabled={saving} onClick={handleSave} />
          <ActionButton label={loading ? '读取中' : '载入最新'} disabled={loading} onClick={handleContinue} />
          <ActionButton label={importing ? '导入中' : '导入 JSON'} disabled={importing} onClick={handleImport} />
          <ActionButton label="导出当前" disabled={saving} onClick={handleExportCurrent} />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <FilterButton label="手动" count={grouped.manual.length} active={filter === 'manual'} onClick={() => setFilter('manual')} />
          <FilterButton label="自动" count={grouped.auto.length} active={filter === 'auto'} onClick={() => setFilter('auto')} />
          <FilterButton label="全部" count={saves.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterButton label="保护存档" count={grouped.protectedItems.length} active={filter === 'protected'} onClick={() => setFilter('protected')} />
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-3 px-3 py-3 text-center font-serif text-[12px] tracking-[0.18em] lg:grid-cols-4"
        style={{
          color: 'rgba(var(--tj-text-primary), 0.82)',
          background: 'rgba(var(--tj-bg-secondary), 0.42)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
          clipPath: cardClip,
        }}
      >
        <Metric label="手动" value={grouped.manual.length} />
        <Metric label="自动" value={grouped.auto.length} />
        <Metric label="保护存档" value={grouped.protectedItems.length} />
        <Metric label="总计" value={saves.length} />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        {visible.length === 0 ? (
          <div
            className="p-6 text-center text-sm font-serif tracking-[0.2em]"
            style={{
              color: 'rgba(var(--tj-text-secondary), 0.76)',
              background: 'rgba(var(--tj-bg-secondary), 0.4)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
              clipPath: cardClip,
            }}
          >
            暂无对应存档
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((save) => (
              <SaveCard
                key={save.id}
                save={save}
                loadingId={loadingId}
                onLoad={handleLoad}
                onExport={handleExport}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
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
      className="w-full px-4 py-2 text-sm font-serif tracking-[0.18em] transition-all hover:opacity-90 disabled:opacity-50 sm:w-auto"
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

function FilterButton({
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
      className="w-full px-3 py-2 text-[12px] font-serif tracking-[0.16em] transition-all sm:w-auto"
      style={{
        color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-primary), 0.84)',
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))'
          : 'rgba(var(--tj-bg-secondary), 0.48)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.55)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
        clipPath: smallClip,
      }}
    >
      {label} <span style={{ opacity: 0.72 }}>{count}</span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>{label}</div>
      <div className="mt-0.5 text-base font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>{value}</div>
    </div>
  );
}

function SaveCard({
  save,
  loadingId,
  onLoad,
  onExport,
  onDelete,
}: {
  save: SaveListItemSummary;
  loadingId: number | null;
  onLoad: (id: number) => void;
  onExport: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="grid min-w-0 gap-3 p-3 lg:grid-cols-[1fr_auto]"
      style={{
        background: 'rgba(var(--tj-bg-secondary), 0.55)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
        clipPath: cardClip,
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[11px] font-serif tracking-[0.16em]" style={{ color: typeColor(save.type) }}>
            {typeLabel(save.type)}
          </span>
          <span className="font-serif text-[15px] font-bold tracking-wider" style={{ color: 'rgb(var(--tj-text-primary))' }}>
            {save.travelerName || '未命名旅人'}
          </span>
          <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}>#{save.id}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-serif tracking-wider" style={{ color: 'rgba(var(--tj-text-primary), 0.82)' }}>
          <span style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>第 {save.turnCount} 回合</span>
          <span>{[save.currentDate, save.currentTime, save.currentLocation].filter(Boolean).join(' / ') || save.worldPeriodName || '未知坐标'}</span>
          <span>{new Date(save.timestamp).toLocaleString('zh-CN')}</span>
          <span>{formatSize(save.sizeBytes)}</span>
        </div>
        {save.lastSummary && (
          <div className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
            {save.lastSummary}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
        <ActionButton label={loadingId === save.id ? '读取中' : '读取'} disabled={loadingId !== null} onClick={() => onLoad(save.id)} />
        <ActionButton label="导出" disabled={loadingId !== null} onClick={() => onExport(save.id)} />
        <button
          type="button"
          disabled={loadingId !== null}
          onClick={() => onDelete(save.id)}
          className="w-full px-3 py-2 text-[12px] font-serif tracking-[0.16em] transition-all hover:opacity-90 disabled:opacity-50 sm:w-auto"
          style={{
            color: 'rgba(220, 120, 120, 0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(220, 120, 120, 0.35)',
            clipPath: smallClip,
          }}
        >
          删除
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
