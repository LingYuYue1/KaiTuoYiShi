import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { 变量修复计划, 变量修复回执 } from '@/models/variableRepair';
import { cardClip, smallClip } from '@/components/features/Chat/turnStyles';
import {
  分类标签,
  分类顺序,
  修复项行,
} from './variableRepairPrimitives';

export function VariableRepairPreviewModal({
  plan,
  receipt,
  committing = false,
  onClose,
  onCommit,
}: {
  plan: 变量修复计划;
  receipt?: 变量修复回执 | null;
  committing?: boolean;
  onClose: () => void;
  onCommit: (confirmedItemIds: string[]) => void;
}) {
  const [选中, set选中] = useState<Set<string>>(new Set());

  const 分组 = useMemo(() => {
    const map = new Map<(typeof 分类顺序)[number], typeof plan.items>();
    for (const category of 分类顺序) map.set(category, []);
    for (const item of plan.items) map.get(item.category)?.push(item);
    return map;
  }, [plan]);

  const 安全数 = 分组.get('safe')?.length ?? 0;
  const 确认数 = 分组.get('confirm')?.length ?? 0;

  const 切换确认 = (id: string) => {
    set选中((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const 提交数 = 安全数 + 选中.size;
  const 可提交 = 提交数 > 0;

  return (
    <Modal onClose={onClose} title="重新解析变量 · 修复预览" className="max-w-3xl">
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-3 md:px-5">
          <p className="mb-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.9)' }}>
            第 {plan.turn} 回合 · 安全 {安全数} 条、需确认 {确认数} 条。冲突与不支持项只展示、永不写入；
            提交时会先校验变量状态指纹，过期计划会被拒绝。
          </p>

          {分类顺序.map((category) => {
            const items = 分组.get(category) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={category} className="mb-4">
                <div
                  className="mb-1.5 font-serif text-[11px] tracking-[0.3em]"
                  style={{ color: 'rgba(var(--tj-btn-primary-start), 0.75)' }}
                >
                  ◆ {分类标签[category]}（{items.length}）
                </div>
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <修复项行
                      key={item.id}
                      item={item}
                      category={category}
                      checked={选中.has(item.id)}
                      onToggle={category === 'confirm' ? () => 切换确认(item.id) : undefined}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {receipt && (
            <div
              className="mt-2 px-3 py-2 text-xs"
              style={{
                background: receipt.code === 'OK' ? 'rgba(var(--tj-btn-primary-start), 0.12)' : 'rgba(var(--tj-danger), 0.08)',
                boxShadow: `inset 0 0 0 1px ${receipt.code === 'OK' ? 'rgba(var(--tj-btn-primary-start), 0.4)' : 'rgba(var(--tj-danger), 0.35)'}`,
                clipPath: cardClip,
                color: 'rgba(var(--tj-text-primary), 0.9)',
              }}
            >
              {receipt.code === 'OK' ? '✓ ' : '⚠ '}{receipt.detail}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 md:px-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-serif text-xs tracking-[0.25em] transition-all hover:opacity-90"
            style={{
              color: 'rgba(var(--tj-text-primary), 0.9)',
              background: 'rgba(var(--tj-btn-primary-start), 0.04)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.25)',
              clipPath: smallClip,
            }}
          >
            关闭
          </button>
          <button
            type="button"
            disabled={!可提交 || committing}
            onClick={() => onCommit([...选中])}
            className="px-4 py-1.5 font-serif text-xs tracking-[0.25em] transition-all hover:opacity-90 disabled:opacity-40"
            style={{
              color: 'rgb(var(--tj-on-accent))',
              background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.95))',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)',
              clipPath: smallClip,
            }}
          >
            {committing ? '正在提交…' : `提交修复（${提交数}）`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
