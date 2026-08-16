import type { CSSProperties, ReactNode } from 'react';
import type { NPC记录 } from '@/models/npc';
import { 读取NPC头像 } from '@/models/npc';
import type { 相册系统 } from '@/models/imageGeneration';
import { 解析相册资源引用 } from '@/utils/albumActions';
import { AvatarImage } from '@/components/ui/ResilientImage';
import { accentColor, activeSurface, bodyColor, faintColor, mutedColor, panelStyle, smallClip, titleColor } from './constants';

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 flex-1 whitespace-nowrap px-2.5 py-2 font-serif text-[12px] tracking-[0.18em] transition-all"
      style={{
        color: active ? titleColor : faintColor,
        background: active
          ? activeSurface
          : 'rgba(var(--tj-btn-primary-start), 0.035)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.56), 0 8px 18px rgba(var(--tj-shadow), 0.08)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.46)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

export function Avatar({
  npc,
  album,
  size,
  selected = false,
  slot = '档案',
}: {
  npc: NPC记录;
  album?: 相册系统;
  size: number;
  selected?: boolean;
  slot?: '档案' | '正文' | '手机';
}) {
  const src = 解析相册资源引用(album, 读取NPC头像(npc, slot));
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: 'linear-gradient(145deg, rgba(var(--tj-btn-primary-start), 0.14), rgba(var(--tj-tech-cyan), 0.055))',
    boxShadow: selected
      ? '0 0 0 1px rgba(var(--tj-btn-primary-start), 0.72), 0 0 18px rgba(var(--tj-btn-primary-start), 0.16)'
      : '0 0 0 1px rgba(var(--tj-border), 0.72)',
  };

  if (src) {
    return (
      <span className="relative shrink-0" style={{ width: size, height: size }}>
        <AvatarImage
          src={src}
          alt={npc.姓名}
          className="h-full w-full object-cover"
          style={style}
        />
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: 'inset 0 0 12px rgba(var(--tj-text-primary),0.12)' }}
        />
      </span>
    );
  }

  return (
    <div
      className="relative shrink-0 flex items-center justify-center overflow-hidden font-serif font-semibold"
      style={{
        ...style,
        fontSize: Math.max(16, Math.floor(size * 0.42)),
        color: selected ? titleColor : accentColor,
      }}
    >
      <span
        className="absolute inset-[6px] rounded-full"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.38)' }}
      />
      {npc.姓名.slice(0, 1)}
    </div>
  );
}

export function Chip({ tone, children }: { tone: 'gold' | 'silver'; children: ReactNode }) {
  const palette =
    tone === 'gold'
      ? { color: 'rgba(var(--tj-btn-primary-start), 0.94)', stroke: 'rgba(var(--tj-btn-primary-start), 0.45)' }
      : { color: mutedColor, stroke: 'rgba(var(--tj-border), 0.54)' };
  return (
    <span
      className="px-2 py-0.5 font-serif text-[12px] tracking-[0.18em]"
      style={{ color: palette.color, boxShadow: `inset 0 0 0 1px ${palette.stroke}`, clipPath: smallClip }}
    >
      {children}
    </span>
  );
}

export function EmptyText({ text }: { text: string }) {
  return (
    <p className="font-serif text-[12.5px] italic tracking-[0.12em]" style={{ color: faintColor }}>
      {text}
    </p>
  );
}

export function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="min-w-0 px-3 py-2"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.62), rgba(var(--tj-surface-strong),0.72))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)',
        clipPath: smallClip,
      }}
    >
      <div
        className="font-serif text-[11px] tracking-[0.24em]"
        style={{ color: 'rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), 0.86)' }}
      >
        {label}
      </div>
      <div className="mt-1 truncate font-serif text-[13px] tracking-[0.08em]" style={{ color: titleColor }}>
        {value}
      </div>
    </div>
  );
}

export function ActionChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 font-serif text-[12px] tracking-[0.16em] transition-all hover:bg-[rgba(var(--tj-btn-primary-start),0.08)]"
      style={{
        color: active ? accentColor : faintColor,
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.52)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.52)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

export function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-4" style={panelStyle}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-3 w-[3px]" style={{ background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }} />
      <h4 className="font-serif text-[13px] tracking-[0.26em]" style={{ color: accentColor }}>
        {children}
      </h4>
      <span className="h-px flex-1" style={{ background: 'rgba(var(--tj-border), 0.46)' }} />
    </div>
  );
}

export function Paragraph({ text, placeholder, italic = false }: { text?: string; placeholder: string; italic?: boolean }) {
  if (!text?.trim()) return <EmptyText text={placeholder} />;
  return (
    <p
      className={`font-serif text-[13.5px] leading-relaxed tracking-[0.06em] ${italic ? 'italic' : ''}`}
      style={{ color: bodyColor }}
    >
      {text}
    </p>
  );
}
