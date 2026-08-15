import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { activeAccentSurface, cardClip, imageWellSurface, insetBorder, insetSurface, labelColor, panelStrongSurface, panelSurface, smallClip, titleColor } from './visualTokens';
import { createPortal } from 'react-dom';
import { slotLabel } from '@/models/imageGeneration';
import type { 图片槽位, 图片生成任务 } from '@/models/imageGeneration';
import { generateTargets } from './foundation';
import type { GenerationHistoryFilter, PromptMeta, StorySnapshotSummary } from './foundation';
import type { ReferenceInjectionStatus } from './referenceInjection';

export function SafeAlbumImage({
  src,
  alt,
  className,
  emptyLabel = '待写入',
  failedLabel = '图片失效',
}: {
  src?: string;
  alt: string;
  className: string;
  emptyLabel?: string;
  failedLabel?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;
  if (!src || failed) {
    return (
      <div
        className={`${className} flex items-center justify-center px-2 text-center font-serif text-xs tracking-[0.12em]`}
        style={{ background: imageWellSurface, color: failed ? 'rgba(var(--tj-danger),0.88)' : 'rgba(var(--tj-ui-faint),0.58)' }}
      >
        {failed ? failedLabel : emptyLabel}
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailedSrc(src)} className={className} />;
}
export function AnchorStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2" style={{ background: insetSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.62)', clipPath: smallClip }}>
      <div className="text-[10px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.62)' }}>{label}</div>
      <div className="mt-1 font-serif text-base font-bold" style={{ color: 'rgb(var(--tj-ui-title))' }}>{value}</div>
    </div>
  );
}
export function AnchorToggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 px-3 py-2 text-left"
      style={{ background: checked ? 'rgba(var(--tj-btn-primary-start),0.08)' : panelStrongSurface, boxShadow: checked ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.28)' : insetBorder, clipPath: smallClip }}
    >
      <span className="min-w-0">
        <span className="block font-serif text-xs font-bold tracking-[0.14em]" style={{ color: checked ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-ui-muted),0.74)' }}>{label}</span>
        <span className="mt-0.5 block truncate text-[10px]" style={{ color: 'rgba(var(--tj-ui-muted),0.58)' }}>{desc}</span>
      </span>
      <span className="h-5 w-9 shrink-0 rounded-full p-0.5" style={{ background: checked ? 'rgba(var(--tj-btn-primary-start),0.36)' : 'rgba(var(--tj-text-secondary),0.28)' }}>
        <span className="block h-4 w-4 rounded-full transition-all" style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)', background: checked ? 'rgb(var(--tj-ui-title))' : 'rgba(var(--tj-text-secondary),0.7)' }} />
      </span>
    </button>
  );
}
export function EmptyLibraryBox({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-none border border-dashed px-6 text-center" style={{ borderColor: 'rgba(var(--tj-border),0.34)', color: 'rgba(var(--tj-ui-faint),0.72)' }}>
      <div>
        <div className="font-serif text-base tracking-[0.18em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>{title}</div>
        <div className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>{desc}</div>
      </div>
    </div>
  );
}
export function BaseGenerationFields(props: {
  generateTitle: string;
  setGenerateTitle: (v: string) => void;
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
}) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="生成标题"><input value={props.generateTitle} onChange={(e) => props.setGenerateTitle(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} /></Field>
        <Field label="尺寸">
          <select value={props.sizePreset} onChange={(e) => props.setSizePreset(e.target.value as 'default' | '1:1' | '3:4' | '16:9' | 'custom')} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
            <option value="default">跟随接口默认</option>
            <option value="1:1">头像 1:1</option>
            <option value="3:4">半身/立绘 3:4</option>
            <option value="16:9">场景 16:9</option>
            <option value="custom">自定义</option>
          </select>
        </Field>
      </div>
      {props.sizePreset === 'custom' && (
        <Field label="自定义尺寸">
          <input value={props.customSize} onChange={(e) => props.setCustomSize(e.target.value)} placeholder="例如 1024x1536" className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
        </Field>
      )}
    </>
  );
}
export function ImagePreviewModal({ open, src, title, onClose }: { open: boolean; src: string; title: string; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !src) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-5"
      style={{ background: 'rgba(0,0,0,0.86)' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="fixed right-5 top-5 z-[10001] min-h-11 px-4 py-2 font-serif text-xs tracking-[0.16em]"
        style={{
          color: 'rgb(var(--tj-ui-active-text))',
          background: 'linear-gradient(135deg, rgb(var(--tj-btn-primary-start)), rgb(var(--tj-btn-primary-end)))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.48), 0 12px 36px rgba(0,0,0,0.42)',
          clipPath: smallClip,
        }}
      >
        关闭
      </button>
      <div
        className="relative flex h-[92vh] w-full max-w-6xl items-center justify-center overflow-hidden px-4 py-12"
        style={{
          background: 'linear-gradient(180deg, rgb(var(--tj-bg-primary)), rgb(var(--tj-bg-secondary)))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.42), 0 24px 80px rgba(0,0,0,0.62)',
          clipPath: cardClip,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute left-5 top-4 max-w-[70%] truncate font-serif text-xs tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.82)' }}>
          {title}
        </div>
        <div className="flex h-full w-full items-center justify-center overflow-auto px-2 py-2">
          <img src={src} alt={title} className="max-h-full max-w-full object-contain" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
export function SlotPickerModal({
  open,
  recordName,
  entryTitle,
  recommendedSlot,
  referenceEnabled = false,
  onToggleReference,
  onClose,
  onSelect,
}: {
  open: boolean;
  recordName: string;
  entryTitle: string;
  recommendedSlot?: 图片槽位;
  referenceEnabled?: boolean;
  onToggleReference?: () => void;
  onClose: () => void;
  onSelect: (slot: 图片槽位) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-5"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-label="设置到槽位"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl px-4 py-4"
        style={{
          background: 'linear-gradient(180deg, rgb(var(--tj-bg-primary)), rgb(var(--tj-bg-secondary)))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.38), 0 24px 80px rgba(0,0,0,0.58)',
          clipPath: cardClip,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>设置到槽位</div>
            <div className="mt-1 truncate font-serif text-base font-bold" style={{ color: 'rgb(var(--tj-accent-primary))' }}>{recordName}</div>
            <div className="mt-1 truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>{entryTitle || '当前选中图片'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 px-3 py-2 font-serif text-xs tracking-[0.14em]"
            style={{ color: 'rgb(var(--tj-ui-active-text))', background: 'linear-gradient(135deg, rgb(var(--tj-btn-primary-start)), rgb(var(--tj-btn-primary-end)))', clipPath: smallClip }}
          >
            关闭
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {CHARACTER_SLOTS.map((option) => {
            const recommended = option.slot === recommendedSlot || (recommendedSlot?.startsWith('avatar_') && option.slot === 'avatar_profile');
            return (
              <button
                key={option.slot}
                type="button"
                onClick={() => onSelect(option.slot)}
                className="min-h-[92px] px-4 py-3 text-left transition-all"
                style={{
                  color: recommended ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-text-primary),0.92)',
                  background: recommended ? 'linear-gradient(135deg, rgb(var(--tj-btn-primary-start)), rgb(var(--tj-btn-primary-end)))' : 'rgba(var(--tj-bg-secondary),0.78)',
                  boxShadow: recommended ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.5), 0 0 18px rgba(var(--tj-btn-primary-start),0.12)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.18)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-serif text-sm font-bold tracking-[0.14em]">{option.title}</span>
                  {recommended && <span className="text-[10px] tracking-[0.12em]">推荐</span>}
                </div>
                <div className="mt-2 text-xs leading-relaxed opacity-80">{option.desc}</div>
              </button>
            );
          })}
        </div>
        {onToggleReference && (
          <button
            type="button"
            onClick={onToggleReference}
            className="mt-3 w-full px-4 py-3 text-left transition-all"
            style={{ color: referenceEnabled ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-tech-cyan),0.94)', background: referenceEnabled ? activeAccentSurface : 'rgba(var(--tj-tech-cyan),0.07)', boxShadow: referenceEnabled ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.42)' : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.24)', clipPath: smallClip }}
          >
            <div className="font-serif text-sm font-bold tracking-[0.14em]">{referenceEnabled ? '取消该角色参考图' : '替换为该角色参考图'}</div>
            <div className="mt-1 text-xs leading-relaxed opacity-80">参考图不会改变当前挂载槽位；每个角色只保留一张当前参考图。</div>
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
export function AnchorModeBadge({ promptMeta }: { promptMeta: PromptMeta | null }) {
  const anchorMode = promptMeta?.anchorMode === true;
  return (
    <div
      className="min-h-[42px] px-3 py-2 text-xs leading-relaxed"
      style={{
        color: anchorMode ? 'rgba(var(--tj-tech-cyan),0.92)' : 'rgba(var(--tj-ui-muted),0.78)',
        background: anchorMode ? 'rgba(var(--tj-tech-cyan),0.06)' : 'rgba(var(--tj-ui-panel-strong),0.34)',
        boxShadow: `inset 0 0 0 1px ${anchorMode ? 'rgba(var(--tj-tech-cyan),0.2)' : 'rgba(var(--tj-btn-primary-start),0.12)'}`,
        clipPath: smallClip,
      }}
    >
      <span className="font-serif font-bold tracking-[0.12em]">{anchorMode ? '角色锚点优先' : '等待提示词'}</span>
      <span className="ml-2" style={{ color: 'rgba(var(--tj-ui-body),0.76)' }}>
        {promptMeta?.anchorSummary || '普通生成会先自动生成提示词；有角色锚点时优先沿用稳定外观。'}
      </span>
    </div>
  );
}
export function OptionButtonGroup(props: {
  label: string;
  value: string;
  options: Array<{ id: string; title: string; desc: string }>;
  onChange: (value: string) => void;
  columns: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: labelColor }}>{props.label}</div>
      <div className={`grid gap-3 ${props.columns}`}>
        {props.options.map((option) => {
          const active = props.value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => props.onChange(option.id)}
              className="min-h-[76px] px-3 py-3 text-left transition-all"
              style={{
                color: active ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body),0.86)',
                background: active ? activeAccentSurface : 'rgba(0,0,0,0.34)',
                boxShadow: active
                  ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.48), 0 0 12px rgba(var(--tj-btn-primary-start),0.12)'
                  : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.18)',
                clipPath: smallClip,
              }}
            >
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="font-serif text-base font-bold tracking-[0.14em]">{option.title}</div>
                <div className="mt-1 text-[11px] opacity-78">{option.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function DraftActionButton({ children, onClick, disabled = false, tone = 'normal' }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'normal' | 'nsfw' }) {
  const isNsfw = tone === 'nsfw';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-[54px] w-full px-4 py-3 font-serif text-sm tracking-[0.16em] disabled:opacity-45"
      style={{
        color: isNsfw ? 'rgb(var(--tj-ui-nsfw))' : 'rgba(var(--tj-btn-primary-start),0.94)',
        background: isNsfw ? 'rgba(var(--tj-ui-nsfw),0.08)' : 'rgba(var(--tj-btn-primary-start),0.075)',
        boxShadow: isNsfw ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.32)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.32)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}
export function ReferenceInjectionHint({ status }: { status: ReferenceInjectionStatus }) {
  const tone = status.code === 'enabled'
    ? {
        color: 'rgba(var(--tj-ui-success),0.98)',
        background: 'rgba(var(--tj-ui-success),0.1)',
        border: 'rgba(var(--tj-ui-success),0.38)',
      }
    : status.code === 'not_applicable'
      ? {
          color: 'rgba(var(--tj-tech-cyan),0.98)',
          background: 'rgba(var(--tj-tech-cyan),0.1)',
          border: 'rgba(var(--tj-tech-cyan),0.36)',
        }
      : {
          color: 'rgba(var(--tj-btn-primary-start),0.98)',
          background: 'rgba(var(--tj-btn-primary-start),0.12)',
          border: 'rgba(var(--tj-btn-primary-start),0.42)',
        };
  return (
    <div
      className="flex min-w-0 items-center gap-2 px-2 py-1 text-[11px] font-medium leading-relaxed"
      style={{ color: tone.color, background: tone.background, boxShadow: `inset 0 0 0 1px ${tone.border}`, clipPath: smallClip }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone.color, boxShadow: `0 0 8px ${tone.color}` }} />
      <span>{status.label}</span>
    </div>
  );
}
export function taskStatusTone(status: 图片生成任务['status']): { color: string; background: string; border: string } {
  if (status === 'failed') return { color: 'rgba(var(--tj-danger),0.94)', background: 'rgba(var(--tj-danger),0.08)', border: 'rgba(var(--tj-danger),0.3)' };
  if (status === 'success') return { color: 'rgba(var(--tj-ui-success),0.94)', background: 'rgba(var(--tj-ui-success),0.08)', border: 'rgba(var(--tj-ui-success),0.28)' };
  if (status === 'cancelled') return { color: 'rgba(var(--tj-ui-faint),0.86)', background: panelStrongSurface, border: 'rgba(var(--tj-ui-faint),0.16)' };
  return { color: 'rgba(var(--tj-btn-primary-start),0.94)', background: 'rgba(var(--tj-btn-primary-start),0.08)', border: 'rgba(var(--tj-btn-primary-start),0.28)' };
}
export function historyKindTone(kind: Exclude<GenerationHistoryFilter, 'all'>): { color: string; background: string; border: string } {
  if (kind === 'scene') return { color: 'rgba(var(--tj-tech-cyan),0.94)', background: 'rgba(var(--tj-tech-cyan),0.075)', border: 'rgba(var(--tj-tech-cyan),0.24)' };
  if (kind === 'snapshot') return { color: 'rgba(var(--tj-btn-primary-start),0.94)', background: 'rgba(var(--tj-btn-primary-start),0.075)', border: 'rgba(var(--tj-btn-primary-start),0.24)' };
  if (kind === 'phone') return { color: 'rgba(var(--tj-tech-blue),0.94)', background: 'rgba(var(--tj-tech-blue),0.075)', border: 'rgba(var(--tj-tech-blue),0.22)' };
  return { color: 'rgba(var(--tj-ui-body),0.9)', background: 'rgba(var(--tj-ui-panel-strong),0.38)', border: 'rgba(var(--tj-btn-primary-start),0.14)' };
}
export function PromptBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="px-3 py-2" style={{ color: 'rgba(var(--tj-ui-body),0.82)', background: panelStrongSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.1)', clipPath: smallClip }}>
      <div className="mb-1 font-serif text-[11px] tracking-[0.14em]" style={{ color: labelColor }}>{title}</div>
      <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words pr-1">{text}</div>
    </div>
  );
}
export function StorySnapshotSummaryCard({ summary, prompt, negativePrompt }: { summary: StorySnapshotSummary; prompt?: string; negativePrompt?: string }) {
  const rows = [
    ['标题', summary.title],
    ['人物', summary.characters.length ? summary.characters.join('、') : '未明确'],
    ['地点', summary.location],
    ['氛围', summary.atmosphere],
    ['动作', summary.action],
    ['镜头', summary.camera],
    ['避免', summary.avoid],
  ];
  return (
    <div className="space-y-2 px-3 py-3 text-xs leading-relaxed" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.38)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.14)', clipPath: smallClip }}>
      <div className="font-serif text-sm font-bold tracking-[0.14em]" style={{ color: titleColor }}>{summary.title}</div>
      {rows.slice(1).map(([label, value]) => (
        <InfoLine key={label} label={label} value={value} />
      ))}
      {prompt?.trim() && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: 'rgba(var(--tj-btn-primary-start),0.16)' }}>
          <div className="mb-1 font-serif text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.72)' }}>最终 Prompt</div>
          <div className="max-h-32 overflow-y-auto pr-1 font-mono text-[11px]" style={{ color: 'rgba(var(--tj-ui-body),0.78)' }}>{prompt}</div>
        </div>
      )}
      {negativePrompt?.trim() && (
        <div className="border-t pt-3" style={{ borderColor: 'rgba(var(--tj-btn-primary-start),0.12)' }}>
          <div className="mb-1 font-serif text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>Negative</div>
          <div className="max-h-20 overflow-y-auto pr-1 font-mono text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>{negativePrompt}</div>
        </div>
      )}
    </div>
  );
}
export function ParsedPanel({ titleLabel = '标题', title, fields }: { titleLabel?: string; title: string; fields: Array<[string, string]> }) {
  return (
    <div className="space-y-3">
      <div className="px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.34)', boxShadow: insetBorder, clipPath: smallClip }}>
        <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: labelColor }}>{titleLabel}</div>
        <div className="mt-1 font-serif text-sm font-bold leading-relaxed" style={{ color: titleColor }}>{title}</div>
      </div>
      <div className="grid gap-2">
        {fields.map(([label, value]) => <SnapshotParsedField key={label} label={label} value={value} />)}
      </div>
    </div>
  );
}
export function SnapshotParsedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 px-3 py-2 text-xs leading-relaxed" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.09)', clipPath: smallClip }}>
      <span className="font-serif tracking-[0.12em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.66)' }}>{label}</span>
      <span style={{ color: 'rgba(var(--tj-ui-body),0.82)' }}>{value}</span>
    </div>
  );
}
export function StateCard({ title, desc, minHeight = 210, spinning = false }: { title: string; desc: string; minHeight?: number; spinning?: boolean }) {
  return (
    <div className="flex items-center justify-center px-4 py-8 text-center" style={{ color: 'rgba(var(--tj-ui-muted),0.72)', background: spinning ? 'rgba(var(--tj-ui-panel-strong),0.3)' : 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.14)', clipPath: smallClip, minHeight }}>
      <div>
        {spinning && <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'rgba(var(--tj-btn-primary-start),0.86)', borderRightColor: 'rgba(var(--tj-tech-cyan),0.55)' }} />}
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>{title}</div>
        <div className="mt-2 text-xs leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}
export function SceneParameterPanel(props: {
  generateTitle: string;
  setGenerateTitle: (v: string) => void;
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  hint: string;
  target: typeof generateTargets[number];
  resolvedSize: string;
}) {
  return (
    <div className="space-y-3">
      <BaseGenerationFields
        generateTitle={props.generateTitle}
        setGenerateTitle={props.setGenerateTitle}
        sizePreset={props.sizePreset}
        setSizePreset={props.setSizePreset}
        customSize={props.customSize}
        setCustomSize={props.setCustomSize}
      />
      <div className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>{props.hint}</div>
      <GenerationSummary target={props.target} size={props.resolvedSize} />
    </div>
  );
}
export function GenerationSummary({ target, size }: { target: typeof generateTargets[number]; size: string }) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <MiniInfo label="分类" value={target.targetType} />
      <MiniInfo label="槽位" value={slotLabel(target.slot)} />
      <MiniInfo label="尺寸" value={size || '接口默认'} />
    </div>
  );
}
export function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2" style={{ background: 'linear-gradient(180deg, rgba(var(--tj-ui-panel-strong),0.38), rgba(var(--tj-ui-panel-strong),0.38))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.1)', clipPath: smallClip }}>
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.62)' }}>{label}</div>
      <div className="mt-1 truncate text-xs" style={{ color: 'rgba(var(--tj-ui-muted),0.82)' }}>{value}</div>
    </div>
  );
}
export function Panel({ title, children, className = '', contentClassName = 'space-y-3' }: { title: string; children: ReactNode; className?: string; contentClassName?: string }) {
  return (
    <div className={`flex flex-col gap-3 px-3 py-3 ${className}`} style={{ background: panelSurface, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.68), inset 3px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)),0.36)', clipPath: cardClip }}>
      <div className="shrink-0 font-serif text-xs tracking-[0.2em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.82)' }}>{title}</div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><div className="mb-1 text-[11px]" style={{ color: labelColor }}>{label}</div>{children}</label>;
}
export function Button({ children, onClick, disabled = false, tone = 'normal' }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'normal' | 'nsfw' }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="w-full px-3 py-2 text-xs font-serif tracking-[0.16em] disabled:opacity-45" style={{ color: tone === 'nsfw' ? 'rgb(var(--tj-ui-nsfw))' : 'rgba(var(--tj-btn-primary-start),0.9)', background: tone === 'nsfw' ? 'rgba(var(--tj-ui-nsfw),0.08)' : 'rgba(var(--tj-btn-primary-start),0.055)', boxShadow: tone === 'nsfw' ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw),0.3)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.28)', clipPath: smallClip }}>{children}</button>;
}
export function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-2"><span style={{ color: labelColor }}>{label}</span><span className="truncate">{value}</span></div>;
}
export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 animate-spin rounded-full border border-transparent"
      style={{ borderTopColor: 'rgba(var(--tj-btn-primary-start),0.88)', borderRightColor: 'rgba(var(--tj-tech-cyan),0.7)' }}
    />
  );
}
export const CHARACTER_SLOTS: Array<{ slot: 图片槽位; title: string; desc: string }> = [
    { slot: 'avatar_profile', title: '档案头像', desc: '用于角色档案、成品库代表图。' },
    { slot: 'avatar_story', title: '正文头像', desc: '用于剧情正文里的角色头像。' },
    { slot: 'avatar_phone', title: '手机头像', desc: '用于手机联系人、聊天头像。' },
    { slot: 'portrait', title: '角色立绘', desc: '用于角色大图与立绘展示。' },
  ];
