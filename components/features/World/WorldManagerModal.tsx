// 世界观管理弹窗：首页「世界」入口使用。设置页「世界观」页签直接嵌入 WorldManagerPanel。

import { useEffect } from 'react';
import { WorldManagerPanel } from './WorldManagerPanel';

interface WorldManagerModalProps {
  activeWorldId: string;
  onEnterWorld?: (worldId: string) => Promise<void> | void;
  onClose: () => void;
}

export function WorldManagerModal({ activeWorldId, onEnterWorld, onClose }: WorldManagerModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="世界观管理"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-xl flex-col gap-4 overflow-hidden p-5"
        style={{
          background: 'rgb(var(--tj-bg-secondary))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35), 0 24px 64px rgba(0,0,0,0.5)',
          clipPath: 'polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-serif text-lg tracking-[0.18em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
            选择世界观
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 font-serif text-sm tracking-[0.12em] transition-all hover:opacity-80"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.9)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)' }}
            aria-label="关闭"
          >
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <WorldManagerPanel activeWorldId={activeWorldId} onEnterWorld={onEnterWorld} />
        </div>
      </div>
    </div>
  );
}