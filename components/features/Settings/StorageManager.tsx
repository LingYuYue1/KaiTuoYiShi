import { useState, useEffect } from 'react';
import { getSaveList, deleteSave, loadSave, exportSaveJson, importSaveJson, saveGame } from '@/services/dbService';

interface Props {
  onSave: () => Promise<number>;
  onContinue: () => Promise<boolean>;
}

interface SaveListItem {
  id: number;
  type: string;
  timestamp: number;
}

const cardClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export function StorageManagerTab({ onSave, onContinue }: Props) {
  const [saves, setSaves] = useState<SaveListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    const list = await getSaveList();
    setSaves(list);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await onSave();
    await refresh();
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这个存档？')) return;
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
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = importSaveJson(text);
        data.id = 0;
        data.type = 'manual';
        data.timestamp = Date.now();
        const newId = await saveGame(data);
        alert(`存档已导入（ID: ${newId}）`);
        await refresh();
      } catch {
        alert('导入失败，存档文件格式无效');
      }
    };
    input.click();
  };

  const handleContinue = async () => {
    setLoading(true);
    const ok = await onContinue();
    setLoading(false);
    if (!ok) alert('没有可用的存档');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="kaituo-btn kaituo-btn-primary group px-5 py-2 text-sm disabled:opacity-50"
        >
          <span
            className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255, 245, 200, 0.45), transparent)',
            }}
          />
          <span className="relative">{saving ? '保存中…' : '手动存档'}</span>
        </button>
        <button
          onClick={handleContinue}
          disabled={loading}
          className="kaituo-btn kaituo-btn-secondary px-5 py-2 text-sm disabled:opacity-50"
        >
          {loading ? '加载中…' : '载入最新存档'}
        </button>
        <button
          onClick={handleImport}
          className="kaituo-btn kaituo-btn-quiet px-5 py-2 text-sm"
        >
          导入存档
        </button>
      </div>

      {saves.length === 0 ? (
        <div
          className="p-6 text-center text-xs font-serif tracking-[0.2em]"
          style={{
            color: 'rgba(200, 188, 158, 0.7)',
            background: 'rgba(16, 14, 16, 0.4)',
            boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.15)',
            clipPath: cardClip,
          }}
        >
          <div className="mb-2 text-2xl" style={{ color: 'rgba(245, 217, 122, 0.45)' }}>✦</div>
          暂无存档 · 开启旅程后将自动留下足迹
        </div>
      ) : (
        <div className="space-y-2">
          {saves.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3"
              style={{
                background: 'rgba(16, 14, 16, 0.55)',
                boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.2)',
                clipPath: cardClip,
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span style={{ color: 'rgba(245, 217, 122, 0.7)' }}>
                    {s.type === 'auto' ? '✧' : '✦'}
                  </span>
                  <span className="font-serif font-bold tracking-wider" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                    {s.type === 'auto' ? '自动存档' : '手动存档'}
                  </span>
                  <span className="text-xs" style={{ color: 'rgba(160, 148, 120, 0.6)' }}>#{s.id}</span>
                </div>
                <div className="ml-5 mt-0.5 text-xs tracking-wider" style={{ color: 'rgba(200, 188, 158, 0.7)' }}>
                  {new Date(s.timestamp).toLocaleString('zh-CN')}
                </div>
              </div>
              <div className="ml-2 flex flex-shrink-0 gap-1.5">
                <button
                  onClick={() => handleExport(s.id)}
                  className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                  style={{
                    color: 'rgba(200, 188, 158, 0.85)',
                    boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.3)',
                    clipPath: smallClip,
                  }}
                >
                  导出
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
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
          ))}
        </div>
      )}
    </div>
  );
}
