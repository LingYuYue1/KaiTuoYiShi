import { smallClip } from './constants';
import { TextAreaField } from './primitives';
import type { SegmentDraft } from './logic';

export function ManualEditor({ draft, onDraftChange }: { draft: SegmentDraft; onDraftChange: (draft: SegmentDraft) => void }) {
  const patch = (next: Partial<SegmentDraft>) => onDraftChange({ ...draft, ...next });
  return (
    <div className="space-y-3 px-3 py-3" style={{ background: 'rgba(var(--tj-bg-primary),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)', clipPath: smallClip }}>
      <div className="font-serif text-[12px] tracking-[0.18em] md:tracking-[0.2em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>手工校订</div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>分段标题</div>
          <input value={draft.标题} onChange={(e) => patch({ 标题: e.target.value })} className="kaituo-input w-full px-2.5 py-2 text-sm" style={{ clipPath: smallClip }} />
        </label>
        <label className="block">
          <div className="mb-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>章节范围</div>
          <input value={draft.章节范围} onChange={(e) => patch({ 章节范围: e.target.value })} className="kaituo-input w-full px-2.5 py-2 text-sm" style={{ clipPath: smallClip }} />
        </label>
      </div>
      <label className="flex items-center justify-between gap-3 px-2 py-2" style={{ background: 'rgba(var(--tj-accent-primary),0.04)', clipPath: smallClip }}>
        <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>参与主剧情滑窗注入</span>
        <input type="checkbox" checked={draft.启用注入} onChange={(e) => patch({ 启用注入: e.target.checked })} />
      </label>
      <TextAreaField label="本段概括" value={draft.本段概括} rows={4} onChange={(value) => patch({ 本段概括: value })} />
      <div className="grid gap-2 md:grid-cols-2">
        <TextAreaField label="前段延续事实" value={draft.前段延续事实} rows={4} onChange={(value) => patch({ 前段延续事实: value })} />
        <TextAreaField label="本段结束状态" value={draft.本段结束状态} rows={4} onChange={(value) => patch({ 本段结束状态: value })} />
        <TextAreaField label="给后续参考" value={draft.给后续参考} rows={4} onChange={(value) => patch({ 给后续参考: value })} />
        <TextAreaField label="登场角色" value={draft.登场角色} rows={4} onChange={(value) => patch({ 登场角色: value })} />
        <TextAreaField label="涉及地点" value={draft.涉及地点} rows={3} onChange={(value) => patch({ 涉及地点: value })} />
        <TextAreaField label="涉及派系" value={draft.涉及派系} rows={3} onChange={(value) => patch({ 涉及派系: value })} />
      </div>
    </div>
  );
}
