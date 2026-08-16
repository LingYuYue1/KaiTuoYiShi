import { ResilientImage } from '@/components/ui/ResilientImage';

export function Avatar({ name, src }: { name: string; src?: string }) {
  return (
    <div
      className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-serif text-sm font-bold"
      style={{
        color: 'rgb(var(--tj-accent-primary))',
        background: 'radial-gradient(circle at 35% 24%, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-accent-primary), 0.04) 62%)',
        boxShadow: src
          ? '0 0 0 1px rgba(var(--tj-accent-primary), 0.54), 0 0 14px rgba(var(--tj-accent-primary), 0.12)'
          : '0 0 0 1px rgba(var(--tj-accent-primary), 0.32)',
      }}
    >
      {src ? <ResilientImage src={src} alt={name} className="h-full w-full object-cover" /> : name.at(0) ?? '?'}
      <span
        className="pointer-events-none absolute inset-[5px] rounded-full"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)' }}
      />
    </div>
  );
}

export function EmptyText({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
      {text}
    </div>
  );
}
