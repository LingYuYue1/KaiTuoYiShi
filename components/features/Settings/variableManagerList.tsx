import { summarizeArrayItemLabel } from '@/utils/variableManagerLogic';
import { cardClip, smallClip } from './settingsShared';

// 数组型系统的二级条目列表：带搜索框，点击选中某条。
export function ArrayItemList({ items, search, onSearch, activeIndex, onSelect, accent }: {
  items: unknown[];
  search: string;
  onSearch: (v: string) => void;
  activeIndex: number;
  onSelect: (i: number) => void;
  accent: string;
}) {
  const query = search.trim().toLowerCase();
  const filtered = items
    .map((item, index) => ({ index, label: summarizeArrayItemLabel(item), item }))
    .filter(({ label }) => !query || label.toLowerCase().includes(query));
  return (
    <aside
      className="flex max-h-[34dvh] flex-col overflow-hidden md:max-h-none"
      style={{
        background: 'rgba(var(--tj-bg-secondary), 0.42)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
        clipPath: cardClip,
      }}
    >
      <div className="border-b px-3 py-2" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.12)' }}>
        <div className="mb-1 font-serif text-xs font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary),0.7)' }}>
          条目 ({items.length})
        </div>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="搜索…"
          className="kaituo-input w-full px-2 py-1.5 text-[13px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.5)' }}>
            未匹配
          </div>
        ) : (
          filtered.map(({ index, label }) => {
            const active = index === activeIndex;
            return (
              <button
                key={index}
                onClick={() => onSelect(index)}
                className="mb-1 w-full px-2.5 py-2 text-left transition-all"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.24), rgba(var(--tj-accent-primary), 0.08))'
                    : 'rgba(var(--tj-bg-secondary), 0.34)',
                  boxShadow: active
                    ? `inset 3px 0 0 ${accent}, inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.56)`
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary),0.5)' }}>{index}</span>
                  <span className="min-w-0 flex-1 truncate font-serif text-[13px] font-bold" style={{ color: active ? accent : 'rgb(var(--tj-text-primary))' }}>
                    {label}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
