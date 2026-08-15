import type { ReactNode } from 'react';
import type { 剧情编织分段 } from '@/models/storyWeaving';
import { cardClip, smallClip } from './constants';

export function Pill({ text, tone }: { text: string; tone: 'gold' | 'cyan' | 'muted' }) {
  const color = tone === 'gold' ? 'rgb(var(--tj-accent-primary))' : tone === 'cyan' ? 'rgb(var(--tj-tech-cyan))' : 'rgba(var(--tj-text-secondary),0.82)';
  const background = tone === 'gold' ? 'rgba(var(--tj-accent-primary),0.10)' : tone === 'cyan' ? 'rgba(var(--tj-tech-cyan), 0.08)' : 'rgba(255,255,255,0.03)';
  const border = tone === 'gold' ? 'rgba(var(--tj-accent-primary),0.24)' : tone === 'cyan' ? 'rgba(var(--tj-tech-cyan),0.20)' : 'rgba(255,255,255,0.06)';
  return (
    <span
      className="px-2.5 py-1"
      style={{
        color,
        background,
        boxShadow: `inset 0 0 0 1px ${border}`,
        clipPath: smallClip,
      }}
    >
      {text}
    </span>
  );
}

export function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(var(--tj-bg-primary),0.55)',
        boxShadow: `inset 0 0 0 1px ${tone}33`,
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>{label}</div>
      <div className="mt-0.5 font-serif text-[16px] font-bold tracking-[0.18em]" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

export function ProgressMiniBlock({ label, values }: { label: string; values: string[] }) {
  return (
    <div
      className="min-w-0 px-2.5 py-2"
      style={{
        background: 'rgba(var(--tj-bg-primary),0.42)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.14)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[10px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.74)' }}>{label}</div>
      <div className="mt-1 line-clamp-3 leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
        {values.slice(-3).join('；') || '暂无'}
      </div>
    </div>
  );
}

export function InfoBlock({ title, empty, children, hasContent = true }: { title: string; empty: string; children: ReactNode; hasContent?: boolean }) {
  return (
    <div className="px-3 py-3 text-xs leading-relaxed" style={{ background: 'rgba(var(--tj-bg-primary),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip, color: 'rgba(var(--tj-text-secondary),0.84)' }}>
      <div className="mb-2 font-serif text-[12px] tracking-[0.2em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>{title}</div>
      {hasContent ? children : <span style={{ color: 'rgba(var(--tj-text-secondary),0.62)' }}>{empty}</span>}
    </div>
  );
}

export function InfoGrid({ items }: { items: Array<[string, string[]]> }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map(([title, values]) => (
        <InfoBlock key={title} title={title} empty="无" hasContent={values.length > 0}>
          <div className="space-y-1">
            {values.map((value, index) => <div key={`${value}_${index}`}>- {value}</div>)}
          </div>
        </InfoBlock>
      ))}
    </div>
  );
}

export function VisibleList({ items }: { items: 剧情编织分段['原著硬约束'] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item.内容}_${index}`}>
          <div>- {item.内容}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>
            谁知道：{item.信息可见性.谁知道.join('、') || '未限定'} · 谁不知道：{item.信息可见性.谁不知道.join('、') || '未限定'} · {item.信息可见性.是否仅读者视角可见 ? '仅读者视角' : '可公开承接'}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TextAreaField({ label, value, rows, onChange }: { label: string; value: string; rows: number; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>{label}</div>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="kaituo-input w-full px-2.5 py-2 text-xs leading-relaxed"
        style={{ clipPath: smallClip }}
      />
    </label>
  );
}

export function EmptyState() {
  return (
    <div
      className="flex min-h-56 items-center justify-center px-4 py-8 text-center font-serif text-xs italic tracking-[0.18em]"
      style={{ color: 'rgba(var(--tj-text-secondary),0.65)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.15)', clipPath: cardClip }}
    >
      导入 TXT 后，剧情会被拆成可分解、可校订、可注入主剧情的章节段落。
    </div>
  );
}

export function TrackEmptyState({ trackTab }: { trackTab: 'canon' | 'custom' }) {
  return (
    <div
      className="flex min-h-56 flex-1 items-center justify-center px-4 py-8 text-center font-serif text-xs italic tracking-[0.18em]"
      style={{ color: 'rgba(var(--tj-text-secondary),0.65)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.15)', clipPath: cardClip }}
    >
      {trackTab === 'canon'
        ? '暂无原著剧情轨道。点击“恢复内置原著”后会显示内置主线。'
        : '暂无自制剧情轨道。导入 TXT 或粘贴文本后会显示玩家自制剧情。'}
    </div>
  );
}
