import { useMemo, useState, type CSSProperties } from 'react';
import type { 忆庭系统, 回忆条目 } from '@/models/yiting';

interface YitingPanelProps {
  yitingSystem: 忆庭系统;
}

type ArchiveFilter = 'all' | 'turn' | 'compressed';

const cardClip = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const smallClip = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

const filterItems: { id: ArchiveFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'turn', label: '回合纪要' },
  { id: 'compressed', label: '旧压缩' },
];

export function YitingPanel({ yitingSystem }: YitingPanelProps) {
  const [filter, setFilter] = useState<ArchiveFilter>('all');
  const [query, setQuery] = useState('');
  const archives = yitingSystem.回忆档案 ?? [];
  const [selectedId, setSelectedId] = useState(archives[0]?.id ?? '');

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return archives
      .filter((entry) => {
        const kind = getArchiveKind(entry);
        if (filter !== 'all' && kind !== filter) return false;
        if (!keyword) return true;
        return [
          entry.名称,
          entry.摘要,
          entry.原文,
          String(entry.回合),
          entry.时间戳,
          ...(entry.检索关键词 ?? []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => b.回合 - a.回合 || (b.时间戳 || '').localeCompare(a.时间戳 || ''));
  }, [archives, filter, query]);

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const stats = useMemo(() => {
    const turn = archives.filter((entry) => getArchiveKind(entry) === 'turn').length;
    const compressed = archives.filter((entry) => getArchiveKind(entry) === 'compressed').length;
    return { turn, compressed, total: archives.length };
  }, [archives]);

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-[270px] min-h-0 shrink-0 flex-col gap-3">
        <section className="px-4 py-4" style={panelStyle('hero')}>
          <div className="font-serif text-xs tracking-[0.34em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.72)' }}>
            回忆库
          </div>
          <div
            className="mt-1 font-serif text-2xl font-semibold tracking-[0.22em]"
            style={{
              background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 50%, rgb(var(--tj-accent-secondary)) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            忆庭
          </div>
          <p className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
            这里保留每回合的可召回纪要。摘要用于检索和注入，原文只用于回看与核对，不直接塞进主剧情。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="总档案" value={`${stats.total}`} />
            <Metric label="回合纪要" value={`${stats.turn}`} />
            <Metric label="旧压缩" value={`${stats.compressed}`} />
            <Metric label="召回材料" value="摘要" />
          </div>
        </section>

        <section className="px-4 py-4" style={panelStyle()}>
          <SectionHeader title="筛选" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {filterItems.map((item) => {
              const active = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className="px-3 py-2 text-left transition-all"
                  style={buttonStyle(active)}
                >
                  <div className="font-serif text-sm tracking-[0.18em]" style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.9)' }}>
                    {item.label}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="px-4 py-4" style={panelStyle()}>
          <SectionHeader title="检索" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按摘要、关键词、回合搜索"
            className="kaituo-input mt-3 w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </section>
      </aside>

      <main className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <section className="flex min-h-0 w-[350px] flex-col overflow-hidden" style={panelStyle()}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.14)' }}>
            <div className="font-serif text-xs tracking-[0.28em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.8)' }}>
              摘要索引
            </div>
            <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.8)' }}>
              {filtered.length} 条
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pr-2">
            {filtered.length === 0 ? (
              <EmptyNotice text="当前没有匹配的回忆档案。"/>
            ) : (
              filtered.map((entry) => {
                const active = entry.id === selected?.id;
                const kind = getArchiveKind(entry);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className="w-full px-3 py-3 text-left transition-all"
                    style={buttonStyle(active)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate font-serif text-sm tracking-[0.14em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                        {entry.名称 || `回合 ${entry.回合}`}
                      </div>
                      <KindBadge kind={kind} />
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                      回合 {entry.回合} · {formatDate(entry.时间戳)}
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.88)' }}>
                      {entry.摘要 || '暂无摘要'}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden" style={panelStyle('detail')}>
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3 px-4 py-4" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.14)' }}>
                <div className="min-w-0">
                  <div className="font-serif text-xs tracking-[0.34em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.72)' }}>
                    回忆详情
                  </div>
                  <div
                    className="mt-1 truncate font-serif text-2xl font-semibold tracking-[0.16em]"
                    style={{
                      background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 50%, rgb(var(--tj-accent-secondary)) 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {selected.名称 || `回合 ${selected.回合}`}
                  </div>
                  <div className="mt-2 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                    回合 {selected.回合} · {formatDate(selected.时间戳)}
                  </div>
                </div>
                <KindBadge kind={getArchiveKind(selected)} large />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 pr-3">
                <InfoBlock title="概要层 · 召回使用" important>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
                    {selected.摘要 || '暂无摘要'}
                  </p>
                </InfoBlock>

                {(selected.检索关键词 ?? []).length > 0 && (
                  <InfoBlock title="检索关键词">
                    <div className="flex flex-wrap gap-2">
                      {(selected.检索关键词 ?? []).map((keyword) => (
                        <span
                          key={keyword}
                          className="px-2 py-1 text-xs"
                          style={{
                            color: 'rgba(var(--tj-accent-primary), 0.9)',
                            background: 'rgba(var(--tj-accent-primary), 0.06)',
                            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
                            clipPath: smallClip,
                          }}
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </InfoBlock>
                )}

                <InfoBlock title="原文层 · 回看核对">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
                    {selected.原文 || '暂无原文'}
                  </p>
                </InfoBlock>

                <div className="mt-3 grid gap-2 xl:grid-cols-3">
                  <Metric label="来源" value={sourceLabel(selected)} />
                  <Metric label="来源回合" value={(selected.来源回合 ?? [selected.回合]).join(', ')} />
                  <Metric label="召回材料" value="摘要优先" />
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <EmptyNotice text="先从左侧选择一条回忆档案。"/>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function getArchiveKind(entry: 回忆条目): ArchiveFilter {
  if (entry.类型 === '精炼纪要') return 'turn';
  return 'compressed';
}

function sourceLabel(entry: 回忆条目): string {
  const kind = getArchiveKind(entry);
  if (kind === 'turn') return '回合纪要';
  return entry.类型 ?? '旧压缩档案';
}

function formatDate(value?: string): string {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function panelStyle(variant?: 'hero' | 'detail') {
  return {
    background:
      variant === 'hero'
        ? 'radial-gradient(circle at 10% 0%, rgba(117, 214, 216, 0.075), transparent 34%), linear-gradient(180deg, rgba(var(--tj-bubble), 0.96), rgba(var(--tj-surface-strong), 0.94))'
        : variant === 'detail'
          ? 'linear-gradient(180deg, rgba(var(--tj-surface), 0.92), rgba(var(--tj-surface-strong), 0.9))'
          : 'rgba(var(--tj-bg-secondary), 0.42)',
    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
    clipPath: cardClip,
  } as CSSProperties;
}

function buttonStyle(active: boolean) {
  return {
    background: active
      ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.14), rgba(var(--tj-accent-primary), 0.03))'
      : 'rgba(var(--tj-bg-secondary), 0.45)',
    boxShadow: active
      ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.5)'
      : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
    clipPath: smallClip,
  };
}

function KindBadge({ kind, large = false }: { kind: ArchiveFilter; large?: boolean }) {
  const label = kind === 'compressed' ? '旧压缩' : '纪要';
  const gold = kind === 'turn';
  return (
    <span
      className={`${large ? 'px-3 py-1.5 text-[11px]' : 'px-2 py-0.5 text-[10px]'} shrink-0 font-serif tracking-[0.2em]`}
      style={{
        color: gold ? 'rgb(var(--tj-bg-primary))' : '#0e1720',
        background: gold
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))'
          : 'linear-gradient(135deg, rgba(180, 200, 220, 0.9), rgba(120, 160, 190, 0.9))',
        clipPath: smallClip,
      }}
    >
      {label}
    </span>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-[3px]" style={{ background: 'rgb(var(--tj-accent-primary))' }} />
      <span className="font-serif text-[13px] font-semibold tracking-[0.28em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        {title}
      </span>
      <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.35), transparent)' }} />
    </div>
  );
}

function InfoBlock({ title, children, important = false }: { title: string; children: React.ReactNode; important?: boolean }) {
  return (
    <section
      className="mt-3 px-4 py-4 first:mt-0"
      style={{
        background: important ? 'rgba(var(--tj-accent-primary), 0.055)' : 'rgba(var(--tj-bg-secondary), 0.45)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-3 font-serif text-xs tracking-[0.3em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.82)' }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.05)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold" style={{ color: 'rgba(var(--tj-accent-primary), 0.95)' }}>
        {value}
      </div>
    </div>
  );
}

function EmptyNotice({ text }: { text: string }) {
  return (
    <div
      className="px-4 py-6 text-center text-sm leading-relaxed"
      style={{
        color: 'rgba(var(--tj-text-secondary), 0.72)',
        background: 'rgba(var(--tj-accent-primary), 0.03)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
        clipPath: smallClip,
      }}
    >
      {text}
    </div>
  );
}
