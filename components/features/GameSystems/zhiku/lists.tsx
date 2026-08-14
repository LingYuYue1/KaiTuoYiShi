import type { 智库条目 } from '@/models/zhiku';
import { ZHIKU_CATEGORY_LABELS } from '@/models/zhiku';
import type { StorySeries } from '@/models/zhikuCharacter';
import { smallClip } from './constants';

export function StorySeriesGroup({
  group,
  expanded,
  selectedId,
  onToggle,
  onSelectChapter,
}: {
  group: StorySeries;
  expanded: boolean;
  selectedId: string | null;
  onToggle: () => void;
  onSelectChapter: (entryId: string) => void;
}) {
  const chapterCount = group.entries.length;
  const preview = group.entries[0];

  return (
    <section className="mb-2">
      <button
        onClick={onToggle}
        className="w-full px-3 py-3 text-left transition-all"
        style={{
          background: expanded
            ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.14), rgba(var(--tj-btn-primary-start), 0.04))'
            : 'rgba(var(--tj-bg-secondary), 0.52)',
          boxShadow: expanded
            ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.46)'
            : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
          clipPath: smallClip,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-serif text-[16px] font-semibold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
              {group.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.74)' }}>
              <span>{group.builtin ? '内置剧情系列' : '自制剧情系列'}</span>
              <span>·</span>
              <span>{chapterCount} 章</span>
              <span>·</span>
              <span>{preview.来源 || '未标注来源'}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className="px-2 py-1 text-[10px] font-mono tracking-[0.22em]"
              style={{
                color: group.builtin ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-btn-primary-start), 0.92)',
                background: group.builtin ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))' : 'rgba(var(--tj-btn-primary-start), 0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                clipPath: smallClip,
              }}
            >
              {expanded ? '收起' : '展开'}
            </div>
            <div className="mt-2 text-[10px] font-mono tracking-[0.18em]" style={{ color: 'rgba(160, 200, 160, 0.76)' }}>
              {group.builtin ? 'BUILTIN' : 'CUSTOM'}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 pl-0 md:pl-3">
          {group.entries.map((entry) => (
            <StoryChapterButton
              key={entry.id}
              entry={entry}
              active={entry.id === selectedId}
              onClick={() => onSelectChapter(entry.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StoryChapterButton({ entry, active, onClick }: { entry: 智库条目; active: boolean; onClick: () => void }) {
  return (
    <section className="w-full min-w-0 overflow-hidden">
      <button
        onClick={onClick}
        className="w-full min-w-0 overflow-hidden px-3 py-3 text-left transition-all"
        style={{
          background: active ? 'rgba(var(--tj-btn-primary-start), 0.1)' : 'rgba(var(--tj-bg-secondary), 0.35)',
          boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.1)',
          clipPath: smallClip,
        }}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 px-2 py-0.5 text-[10px] font-mono tracking-[0.18em]" style={{ color: 'rgb(var(--tj-on-accent))', background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))', clipPath: smallClip }}>
                {entry.章节序号 ? `第${entry.章节序号}章` : '章节'}
              </span>
              <div className="min-w-0 truncate font-serif text-[13px] font-semibold tracking-[0.12em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                {entry.标题}
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
              {entry.摘要 || entry.原文 || '暂无摘要'}
            </p>
          </div>
          <div className="hidden shrink-0 text-right text-[10px] font-mono tracking-[0.18em] md:block" style={{ color: 'rgba(160, 200, 160, 0.76)' }}>
            {entry.来源 || '未标注来源'}
          </div>
        </div>
      </button>
      {active && <MobileEntryDetail entry={entry} />}
    </section>
  );
}

export function EntryButton({ entry, active, onClick }: { entry: 智库条目; active: boolean; onClick: () => void }) {
  return (
    <section className="mb-2 w-full min-w-0 overflow-hidden last:mb-0">
      <button
        onClick={onClick}
        className="w-full min-w-0 overflow-hidden px-3 py-3 text-left transition-all"
        style={{
          background: active ? 'rgba(var(--tj-btn-primary-start), 0.09)' : 'rgba(var(--tj-bg-secondary), 0.48)',
          boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.45)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
          clipPath: smallClip,
        }}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1 truncate font-serif text-sm font-semibold tracking-[0.12em] md:tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
            {entry.标题}
          </div>
          <span
            className="hidden shrink-0 px-2 py-0.5 text-[10px] font-mono tracking-[0.18em] md:inline-block"
            style={{
              color: 'rgb(var(--tj-on-accent))',
              background: entry.builtin ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))' : 'rgba(54, 111, 74, 0.88)',
              clipPath: smallClip,
            }}
          >
            {entry.builtin ? 'BUILTIN' : 'CUSTOM'}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.74)' }}>
          {entry.摘要 || entry.原文 || '暂无摘要'}
        </p>
        <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-[11px]">
          <span className="min-w-0 truncate" style={{ color: 'rgba(160, 200, 160, 0.78)' }}>{entry.来源 || '未标注来源'}</span>
          <span className="shrink-0" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>{ZHIKU_CATEGORY_LABELS[entry.分类]}</span>
        </div>
      </button>
      {active && <MobileEntryDetail entry={entry} />}
    </section>
  );
}

function MobileEntryDetail({ entry }: { entry: 智库条目 }) {
  return (
    <div
      className="mt-2 space-y-3 px-3 py-3 md:hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-bubble),0.88), rgba(var(--tj-surface-strong),0.62))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.58), inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.42)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="px-2 py-0.5 text-[10px] font-mono tracking-[0.18em]"
          style={{ color: 'rgb(var(--tj-on-accent))', background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.9), rgba(var(--tj-btn-primary-end), 0.86))', clipPath: smallClip }}
        >
          {ZHIKU_CATEGORY_LABELS[entry.分类]}
        </span>
        <span className="text-[10px] font-mono tracking-[0.18em]" style={{ color: 'rgba(160, 200, 160, 0.78)' }}>
          {entry.builtin ? 'BUILTIN DATA' : 'CUSTOM DATA'}
        </span>
      </div>
      <div className="font-serif text-[17px] font-semibold leading-snug tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        {entry.标题}
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.84)' }}>
        {entry.摘要 || '暂无摘要'}
      </p>
      <div
        className="max-h-[42dvh] overflow-y-auto whitespace-pre-wrap px-3 py-2 text-xs leading-relaxed"
        style={{
          color: 'rgba(var(--tj-text-primary), 0.86)',
          background: 'rgba(var(--tj-bg-primary), 0.34)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)',
          clipPath: smallClip,
        }}
      >
        {entry.原文 || entry.摘要 || '暂无内容'}
      </div>
    </div>
  );
}
