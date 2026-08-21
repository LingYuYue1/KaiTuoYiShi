import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { VariableRepairPlan, VariableRepairItem } from '@/utils/variableRepair';

interface Props {
  plan: VariableRepairPlan;
  onClose: () => void;
  onCommit: (confirmedItemIds: string[]) => Promise<{ ok: boolean; receipt: { message: string; code: string } }>;
}

const categoryLabel: Record<VariableRepairItem['category'], string> = {
  safe: '可安全补写',
  existing: '已存在并跳过',
  confirm: '需要确认',
  conflict: '冲突',
  unsupported: '暂不支持',
};

const categoryColor: Record<VariableRepairItem['category'], string> = {
  safe: 'rgba(150, 220, 170, 0.94)',
  existing: 'rgba(var(--tj-text-secondary), 0.72)',
  confirm: 'rgba(255, 210, 120, 0.96)',
  conflict: 'rgba(255, 145, 145, 0.96)',
  unsupported: 'rgba(180, 190, 210, 0.82)',
};

function itemTitle(item: VariableRepairItem): string {
  const fact = item.fact?.fact;
  if (fact && 'name' in fact && typeof fact.name === 'string') return `${fact.type} · ${fact.name}`;
  if (fact && 'npcName' in fact && typeof fact.npcName === 'string') return `${fact.type} · ${fact.npcName}`;
  if (fact && 'title' in fact && typeof fact.title === 'string') return `${fact.type} · ${fact.title}`;
  if (fact && 'text' in fact && typeof fact.text === 'string') return `${fact.type} · ${fact.text}`;
  return item.command?.key || item.fact?.type || '变量事实';
}

export function VariableRepairPreviewModal({ plan, onClose, onCommit }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(plan.items.filter((item) => item.category === 'confirm').map((item) => item.id)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const confirmItems = useMemo(() => plan.items.filter((item) => item.category === 'confirm'), [plan.items]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await onCommit([...selected]);
      if (!result.ok) {
        setError(result.receipt.message);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '变量修复提交失败。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} title="变量修复预览" className="max-w-3xl">
      <div className="space-y-4">
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <div className="px-3 py-2" style={{ background: 'rgba(var(--tj-accent-primary),0.07)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)' }}>第 {plan.turn} 回合</div>
          <div className="px-3 py-2" style={{ background: 'rgba(var(--tj-accent-primary),0.07)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)' }}>事实 {plan.analysis.facts.length} 条</div>
          <div className="px-3 py-2" style={{ background: 'rgba(var(--tj-accent-primary),0.07)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)' }}>候选 {plan.items.length} 项</div>
        </div>
        <div className="space-y-2">
          {plan.items.map((item) => (
            <div key={item.id} className="px-3 py-3" style={{ background: 'rgba(var(--tj-surface-strong),0.55)', boxShadow: `inset 0 0 0 1px ${categoryColor[item.category]}40` }}>
              <div className="flex items-start gap-3">
                {item.category === 'confirm' && (
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="mt-1 h-4 w-4 accent-[rgb(var(--tj-accent-primary))]" aria-label={`确认${itemTitle(item)}`} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>{itemTitle(item)}</span>
                    <span className="px-2 py-0.5 text-[10px]" style={{ color: categoryColor[item.category], boxShadow: `inset 0 0 0 1px ${categoryColor[item.category]}66` }}>{categoryLabel[item.category]}</span>
                  </div>
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.86)' }}>{item.reason}</div>
                  {item.command && <div className="mt-2 font-mono text-[11px] break-all" style={{ color: 'rgba(var(--tj-tech-cyan),0.86)' }}>{item.command.action} · {item.command.key} · {JSON.stringify(item.command.value)}</div>}
                  {item.evidence.length > 0 && <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.7)' }}>正文证据：{item.evidence.join('；')}</div>}
                </div>
              </div>
            </div>
          ))}
          {plan.items.length === 0 && <div className="py-8 text-center text-sm" style={{ color: 'rgba(var(--tj-text-secondary),0.74)' }}>本回合没有解析出可比较的变量事实。</div>}
        </div>
        {confirmItems.length > 0 && <div className="text-xs" style={{ color: 'rgba(255,210,120,0.9)' }}>已预选 {selected.size}/{confirmItems.length} 个高风险项目；好感、物品、关系和世界事件不会静默写入。</div>}
        {error && <div className="px-3 py-2 text-xs" style={{ color: 'rgba(255,145,145,0.96)', background: 'rgba(255,100,100,0.08)', boxShadow: 'inset 0 0 0 1px rgba(255,100,100,0.25)' }}>{error}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="px-3 py-2 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.86)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.55)' }}>取消</button>
          <button type="button" onClick={() => void submit()} disabled={submitting || plan.items.every((item) => item.category !== 'safe' && item.category !== 'confirm')} className="px-4 py-2 text-xs font-serif tracking-[0.16em] disabled:opacity-50" style={{ color: 'rgb(var(--tj-on-accent))', background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.96), rgba(var(--tj-btn-primary-end),0.84))' }}>{submitting ? '提交中…' : '确认并补写'}</button>
        </div>
      </div>
    </Modal>
  );
}
