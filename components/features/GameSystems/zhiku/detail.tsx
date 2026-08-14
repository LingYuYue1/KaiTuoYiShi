import type { 智库条目, 智库分类 } from '@/models/zhiku';
import { ZHIKU_CATEGORY_LABELS } from '@/models/zhiku';
import type { CharacterProfileViewModel } from '@/models/zhikuCharacter';
import { smallClip, categories } from './constants';
import { Field, EmptyNotice } from './primitives';
import { CharacterProfileWorkspace } from './characterProfile';
import { StructuredCharacterFields } from './structuredFields';

export function DetailPanel({
  entry,
  vm,
  onUpdate,
  onDelete,
  onSelectCustomOnly,
}: {
  entry: 智库条目 | null;
  vm: CharacterProfileViewModel | null;
  onUpdate: (patch: Partial<智库条目>) => void;
  onDelete: () => void;
  onSelectCustomOnly: () => void;
}) {
  if (!entry) return <EmptyNotice text="先录入或选择一条资料。" />;
  const editable = !entry.builtin;

  return (
    <section className="h-full min-h-0 min-w-0 overflow-y-auto px-3 py-4 md:px-4" style={{ background: entry.builtin ? 'linear-gradient(135deg, rgba(var(--tj-bubble),0.94), rgba(var(--tj-tech-wash),0.72) 44%, rgba(var(--tj-surface-strong),0.82))' : 'linear-gradient(135deg, rgba(var(--tj-bubble),0.95), rgba(var(--tj-surface-strong),0.7))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72), inset 4px 0 0 rgba(var(--tj-btn-primary-start), 0.42)', clipPath: smallClip }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-mono tracking-[0.3em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.8)' }}>{entry.builtin ? 'BUILTIN DATA' : 'CUSTOM DATA'}</div>
            <span className="px-2 py-0.5 text-[10px] font-mono tracking-[0.18em]" style={{ color: 'rgb(var(--tj-on-accent))', background: entry.builtin ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))' : 'rgba(54, 111, 74, 0.88)', clipPath: smallClip }}>{ZHIKU_CATEGORY_LABELS[entry.分类]}</span>
          </div>
          <input value={entry.标题} onChange={(e) => onUpdate({ 标题: e.target.value })} readOnly={!editable} className="mt-2 w-full min-w-0 bg-transparent font-serif text-lg font-semibold tracking-[0.08em] outline-none md:text-[24px] md:tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))', opacity: editable ? 1 : 0.95 }} />
          <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.9)' }}>{entry.builtin ? '内置条目只读，来自预设原著资料。' : '这里是自制条目编辑区，修改会即时保存到本地智库。'}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          {!entry.builtin && (
            <button onClick={onDelete} className="px-3 py-1.5 text-xs font-mono tracking-[0.22em] transition-all hover:opacity-90" style={{ color: 'rgba(255, 150, 150, 0.92)', boxShadow: 'inset 0 0 0 1px rgba(255, 120, 120, 0.24)', clipPath: smallClip }}>DELETE</button>
          )}
          {entry.builtin && (
            <button onClick={onSelectCustomOnly} className="px-3 py-1.5 text-xs font-mono tracking-[0.22em] transition-all hover:opacity-90" style={{ color: 'rgba(54, 111, 74, 0.96)', background: 'rgba(54, 111, 74, 0.08)', boxShadow: 'inset 0 0 0 1px rgba(54, 111, 74, 0.32)', clipPath: smallClip }}>SWITCH CUSTOM</button>
          )}
        </div>
      </div>

      {entry.分类 === 'character' ? (
        <>
          {vm && <CharacterProfileWorkspace vm={vm} />}
          <StructuredCharacterFields entry={entry} editable={editable} onUpdate={onUpdate} />
        </>
      ) : (
        <DetailMetadataForm entry={entry} editable={editable} onUpdate={onUpdate} />
      )}
    </section>
  );
}

function DetailMetadataForm({ entry, editable, onUpdate }: { entry: 智库条目; editable: boolean; onUpdate: (patch: Partial<智库条目>) => void }) {
  return (
    <>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Field label="分类">
          <select value={entry.分类} onChange={(e) => onUpdate({ 分类: e.target.value as 智库分类 })} disabled={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
            {categories.map((cat) => <option key={cat} value={cat}>{ZHIKU_CATEGORY_LABELS[cat]}</option>)}
          </select>
        </Field>
        <Field label="重要度">
          <input type="number" min={1} max={5} value={entry.重要度} onChange={(e) => onUpdate({ 重要度: Number(e.target.value) || 3 })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
      </div>
      <Field label="来源">
        <input value={entry.来源 ?? ''} onChange={(e) => onUpdate({ 来源: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
      </Field>
      <Field label="关键词">
        <input value={entry.关键词.join('、')} onChange={(e) => onUpdate({ 关键词: e.target.value.split(/[,，、\n]/).map((k) => k.trim()).filter(Boolean) })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
      </Field>
      <label className="mt-3 flex items-center justify-between gap-3 px-3 py-2" style={{ background: 'rgba(var(--tj-bubble),0.62)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)', clipPath: smallClip }}>
        <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>允许剧情 / 周报联动检索</span>
        <input type="checkbox" checked={entry.可用于联动} onChange={(e) => onUpdate({ 可用于联动: e.target.checked })} disabled={!editable} className="accent-[rgb(var(--tj-accent-primary))]" />
      </label>
      <Field label="摘要">
        <textarea value={entry.摘要} onChange={(e) => onUpdate({ 摘要: e.target.value })} readOnly={!editable} rows={5} className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
      </Field>
      <Field label="原文">
        <textarea value={entry.原文} onChange={(e) => onUpdate({ 原文: e.target.value })} readOnly={!editable} rows={10} className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
      </Field>
    </>
  );
}
