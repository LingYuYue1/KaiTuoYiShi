import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { 智库系统, 智库分类, 智库条目 } from '@/models/zhiku';
import {
  ZHIKU_CATEGORY_LABELS,
  创建智库条目,
  归一化智库系统,
  搜索智库条目,
  智库分类计数,
} from '@/models/zhiku';
import type { 智库系统设置 } from '@/models/settings';
import { saveSetting } from '@/services/dbService';

interface Props {
  zhikuSystem: 智库系统;
  onZhikuSystemChange: React.Dispatch<React.SetStateAction<智库系统>>;
  settings: 智库系统设置;
}

type Bucket = 'all' | 'builtin' | 'custom';

const cardClip = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const smallClip = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

const categoryDescriptions: Record<智库分类, string> = {
  story: '主线 / 支线 / 续闻',
  character: '角色 / NPC / 称呼',
  npc: '常驻 NPC / 路人 / 联动对象',
  location: '星球 / 区域 / 场所',
  item: '道具 / 装备 / 遗物',
  faction: '组织 / 立场 / 动向',
  term: '命途 / 星神 / 专有名词',
  event: '事件 / 历史 / 新闻苗头',
  system: '项目规则 / 调用规范',
};

const categories: 智库分类[] = ['story', 'character', 'npc', 'location', 'item', 'faction', 'term', 'event', 'system'];

export function ZhikuPanel({ zhikuSystem, onZhikuSystemChange, settings }: Props) {
  const normalized = useMemo(() => 归一化智库系统(zhikuSystem), [zhikuSystem]);
  const builtinEntries = useMemo(() => normalized.条目.filter((entry) => entry.builtin), [normalized]);
  const customEntries = useMemo(() => normalized.条目.filter((entry) => !entry.builtin), [normalized]);
  const [bucket, setBucket] = useState<Bucket>('all');
  const [activeCategory, setActiveCategory] = useState<智库分类 | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(normalized.条目[0]?.id ?? null);
  const [showComposer, setShowComposer] = useState(customEntries.length === 0);
  const [saveFlash, setSaveFlash] = useState(false);
  const [expandedSeriesIds, setExpandedSeriesIds] = useState<string[]>([]);
  const [draft, setDraft] = useState({
    标题: '',
    分类: 'story' as 智库分类,
    来源: '',
    关键词: '',
    摘要: '',
    原文: '',
    重要度: 3,
    可用于联动: true,
  });

  const activeEntries = useMemo(() => {
    let pool =
      bucket === 'builtin' ? builtinEntries
        : bucket === 'custom' ? customEntries
        : normalized.条目;
    const hasQuery = !!query.trim();
    if (hasQuery) {
      pool = 搜索智库条目({ 条目: pool }, query, 200);
    }
    if (activeCategory !== 'all') {
      pool = pool.filter((entry) => entry.分类 === activeCategory);
    }
    return hasQuery ? pool : [...pool].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [activeCategory, bucket, builtinEntries, customEntries, normalized, query]);

  const counts = useMemo(() => 智库分类计数({ 条目: bucket === 'builtin' ? builtinEntries : bucket === 'custom' ? customEntries : normalized.条目 }), [bucket, builtinEntries, customEntries, normalized]);

  const selected = activeEntries.find((entry) => entry.id === selectedId)
    ?? activeEntries[0]
    ?? null;

  const storyList = useMemo(
    () => buildStorySeries(activeEntries.filter((entry) => entry.分类 === 'story')),
    [activeEntries],
  );
  const nonStoryEntries = useMemo(() => activeEntries.filter((entry) => entry.分类 !== 'story'), [activeEntries]);
  const flatEntries = useMemo(
    () => [...storyList.looseEntries, ...nonStoryEntries],
    [nonStoryEntries, storyList.looseEntries],
  );

  useEffect(() => {
    const selectedSeriesId = selected?.分类 === 'story' ? getStorySeriesId(selected) : null;
    if (!selectedSeriesId) return;
    setExpandedSeriesIds((prev) => (prev.includes(selectedSeriesId) ? prev : [...prev, selectedSeriesId]));
  }, [selected?.id, selected?.分类, selected?.系列ID, selected?.系列标题]);

  useEffect(() => {
    if (storyList.groups.length === 0) return;
    setExpandedSeriesIds((prev) =>
      prev.some((id) => storyList.groups.some((group) => group.id === id)) ? prev : [storyList.groups[0].id],
    );
  }, [storyList.groups]);

  const persist = async (nextEntries: 智库条目[]) => {
    const next = 归一化智库系统({ 条目: nextEntries });
    onZhikuSystemChange(next);
    await saveSetting('zhikuSystem', next);
    setSaveFlash(true);
    window.setTimeout(() => setSaveFlash(false), 1200);
  };

  const handleCreateCustom = async () => {
    const entry = 创建智库条目({
      标题: draft.标题,
      分类: draft.分类,
      来源: draft.来源,
      关键词: draft.关键词.split(/[,，、\n]/),
      摘要: draft.摘要 || draft.原文.slice(0, 220),
      原文: draft.原文,
      重要度: draft.重要度,
      可用于联动: draft.可用于联动,
      builtin: false,
    });
    const nextEntries = [entry, ...normalized.条目];
    await persist(nextEntries);
    setSelectedId(entry.id);
    setBucket('custom');
    setActiveCategory('all');
    setShowComposer(false);
    setDraft({
      标题: '',
      分类: draft.分类,
      来源: '',
      关键词: '',
      摘要: '',
      原文: '',
      重要度: 3,
      可用于联动: true,
    });
  };

  const updateSelected = async (patch: Partial<智库条目>) => {
    if (!selected || selected.builtin) return;
    const nextEntries = normalized.条目.map((entry) =>
      entry.id === selected.id ? { ...entry, ...patch, updatedAt: Date.now() } : entry,
    );
    await persist(nextEntries);
  };

  const deleteSelected = async () => {
    if (!selected || selected.builtin) return;
    const nextEntries = normalized.条目.filter((entry) => entry.id !== selected.id);
    await persist(nextEntries);
    setSelectedId(nextEntries[0]?.id ?? null);
  };

  const toggleStorySeries = (seriesId: string) => {
    setExpandedSeriesIds((prev) =>
      prev.includes(seriesId) ? prev.filter((id) => id !== seriesId) : [...prev, seriesId],
    );
  };

  const visibleCount = activeEntries.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section
        className="px-4 py-4"
        style={{
          background:
            'linear-gradient(180deg, rgba(12, 14, 22, 0.98), rgba(8, 10, 14, 0.98))',
          boxShadow:
            'inset 0 0 0 1px rgba(245, 217, 122, 0.22), 0 24px 48px rgba(0, 0, 0, 0.28)',
          clipPath: cardClip,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[11px] tracking-[0.5em]" style={{ color: 'rgba(245, 217, 122, 0.68)' }}>
              ZHIKU / KNOWLEDGE CORE
            </div>
            <div
              className="mt-1 font-serif text-[28px] font-semibold tracking-[0.2em]"
              style={{
                background: 'linear-gradient(135deg, #fff4d4 0%, #f5d97a 52%, #c4a35a 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              智库
            </div>
            <div className="mt-2 text-sm leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.76)' }}>
              内置资料来自预设原著内容，只读。自制资料走独立接口，支持你自己继续补原著、补设定、补说明。
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <StatusChip label="内置" value={String(builtinEntries.length)} />
              <StatusChip label="自制" value={String(customEntries.length)} />
              <StatusChip label="总数" value={String(normalized.条目.length)} />
            </div>
            <div className="flex gap-2">
              <TinyTab active={bucket === 'all'} onClick={() => setBucket('all')}>全部</TinyTab>
              <TinyTab active={bucket === 'builtin'} onClick={() => setBucket('builtin')}>内置</TinyTab>
              <TinyTab active={bucket === 'custom'} onClick={() => setBucket('custom')}>自制</TinyTab>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题、关键词、来源或原文片段..."
            className="kaituo-input px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
          <div
            className="px-3 py-2 text-xs font-mono tracking-[0.26em]"
            style={{
              color: saveFlash ? 'rgba(160, 230, 170, 0.95)' : 'rgba(200, 188, 158, 0.72)',
              boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.16)',
              clipPath: smallClip,
            }}
          >
            {saveFlash ? 'SAVED' : settings.enabled ? 'LINK ON' : 'LINK OFF'}
          </div>
        </div>
      </section>

      {bucket === 'custom' && (
        <section
          className="px-4 py-4"
          style={{
            background: 'rgba(8, 10, 14, 0.68)',
            boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.16)',
            clipPath: cardClip,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-serif text-[14px] tracking-[0.28em]" style={{ color: '#f5d97a' }}>
                自制内容接口
              </div>
              <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.72)' }}>
                这里录入玩家自己整理的资料。不会污染内置内容，默认作为可编辑自制条目保存。
              </div>
            </div>
            <button
              onClick={() => setShowComposer((v) => !v)}
              className="px-3 py-2 text-xs font-mono tracking-[0.3em] transition-all hover:opacity-90"
              style={{
                color: '#1a1325',
                background: 'linear-gradient(135deg, rgba(245, 217, 122, 0.95), rgba(212, 177, 90, 0.95))',
                clipPath: smallClip,
              }}
            >
              {showComposer ? 'CLOSE' : 'NEW'}
            </button>
          </div>

          {showComposer && (
            <div className="mt-4 grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-3">
                <Field label="标题">
                  <input value={draft.标题} onChange={(e) => setDraft({ ...draft, 标题: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="分类">
                    <select value={draft.分类} onChange={(e) => setDraft({ ...draft, 分类: e.target.value as 智库分类 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                      {categories.map((cat) => <option key={cat} value={cat}>{ZHIKU_CATEGORY_LABELS[cat]}</option>)}
                    </select>
                  </Field>
                  <Field label="重要度">
                    <input type="number" min={1} max={5} value={draft.重要度} onChange={(e) => setDraft({ ...draft, 重要度: Number(e.target.value) || 3 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                  </Field>
                </div>
                <Field label="来源">
                  <input value={draft.来源} onChange={(e) => setDraft({ ...draft, 来源: e.target.value })} placeholder="例如：BiliWiki / 自整理" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                </Field>
                <Field label="关键词">
                  <input value={draft.关键词} onChange={(e) => setDraft({ ...draft, 关键词: e.target.value })} placeholder="用逗号、顿号或空格分隔" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                </Field>
                <label className="flex items-center justify-between gap-3 px-3 py-2" style={{ boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.14)', clipPath: smallClip }}>
                  <span className="text-xs" style={{ color: 'rgba(220, 208, 178, 0.82)' }}>允许联动检索</span>
                  <input type="checkbox" checked={draft.可用于联动} onChange={(e) => setDraft({ ...draft, 可用于联动: e.target.checked })} className="accent-[#f5d97a]" />
                </label>
              </div>
              <div className="space-y-3">
                <Field label="摘要">
                  <textarea value={draft.摘要} onChange={(e) => setDraft({ ...draft, 摘要: e.target.value })} rows={4} placeholder="建议写成可检索的短摘要，留空会自动截原文前 220 字。" className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
                </Field>
                <Field label="原文">
                  <textarea value={draft.原文} onChange={(e) => setDraft({ ...draft, 原文: e.target.value })} rows={7} placeholder="把原文或整理好的内容贴进来。" className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
                </Field>
                <button
                  onClick={handleCreateCustom}
                  disabled={!draft.标题.trim() && !draft.原文.trim()}
                  className="w-full py-2.5 text-sm font-mono tracking-[0.34em] transition-all disabled:opacity-50"
                  style={{
                    color: '#1a1325',
                    background: 'linear-gradient(135deg, rgba(245, 217, 122, 0.95), rgba(212, 177, 90, 0.95))',
                    clipPath: smallClip,
                  }}
                >
                  WRITE
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section
        className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 overflow-hidden p-3"
        style={{
          background: 'rgba(8, 10, 14, 0.56)',
          boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.16)',
          clipPath: cardClip,
        }}
      >
        <aside className="min-h-0 overflow-y-auto pr-1">
          <CategoryButton label="全部" count={normalized.条目.length} desc="所有资料" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
          {categories.map((cat) => (
            <CategoryButton
              key={cat}
              label={ZHIKU_CATEGORY_LABELS[cat]}
              count={counts[cat]}
              desc={categoryDescriptions[cat]}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            />
          ))}
        </aside>

        <main className="min-h-0 overflow-y-auto pr-1">
          <div className="mb-3 flex items-center justify-between gap-3 px-2">
            <div>
              <div className="font-serif text-[13px] tracking-[0.28em]" style={{ color: '#f5d97a' }}>
                条目列表
              </div>
              <div className="mt-1 text-[11px]" style={{ color: 'rgba(200, 188, 158, 0.72)' }}>
                当前显示 {visibleCount} 条
              </div>
            </div>
            <div className="text-[11px] font-mono tracking-[0.24em]" style={{ color: 'rgba(160, 200, 160, 0.82)' }}>
              {bucket === 'builtin' ? 'READ ONLY' : bucket === 'custom' ? 'CUSTOM' : 'MIXED'}
            </div>
          </div>

          {activeEntries.length === 0 ? (
            <EmptyNotice text="当前没有匹配条目。" />
          ) : (
            <>
              {storyList.groups.map((group) => (
                <StorySeriesGroup
                  key={group.id}
                  group={group}
                  expanded={expandedSeriesIds.includes(group.id)}
                  selectedId={selected?.id ?? null}
                  onToggle={() => toggleStorySeries(group.id)}
                  onSelectChapter={(entryId) => setSelectedId(entryId)}
                />
              ))}
              {flatEntries.map((entry) => (
                <EntryButton key={entry.id} entry={entry} active={entry.id === selected?.id} onClick={() => setSelectedId(entry.id)} />
              ))}
            </>
          )}
        </main>

        <DetailPanel
          entry={selected}
          onUpdate={updateSelected}
          onDelete={deleteSelected}
          onSelectCustomOnly={() => setBucket('custom')}
        />
      </section>
    </div>
  );
}

function CategoryButton({ label, count, desc, active, onClick }: { label: string; count: number; desc: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mb-2 w-full px-3 py-3 text-left transition-all last:mb-0"
      style={{
        background: active ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.14), rgba(245, 217, 122, 0.03))' : 'rgba(245, 217, 122, 0.035)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.42)' : 'inset 0 0 0 1px rgba(245, 217, 122, 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-serif text-sm tracking-[0.22em]" style={{ color: 'rgb(245, 217, 122)' }}>{label}</span>
        <span className="text-[11px] font-mono" style={{ color: 'rgba(200, 188, 158, 0.72)' }}>{count}</span>
      </div>
      <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.7)' }}>{desc}</div>
    </button>
  );
}

type StorySeries = {
  id: string;
  title: string;
  order: number;
  builtin: boolean;
  entries: 智库条目[];
};

function buildStorySeries(entries: 智库条目[]): { groups: StorySeries[]; looseEntries: 智库条目[] } {
  const map = new Map<string, StorySeries>();
  const looseEntries: 智库条目[] = [];

  for (const entry of entries) {
    const seriesId = getStorySeriesId(entry);
    const seriesTitle = getStorySeriesTitle(entry);
    if (!seriesId || !seriesTitle) {
      looseEntries.push(entry);
      continue;
    }

    const key = seriesId;
    const current = map.get(key);
    if (current) {
      current.entries.push(entry);
      continue;
    }

    map.set(key, {
      id: key,
      title: seriesTitle,
      order: entry.系列序号 ?? Number.MAX_SAFE_INTEGER,
      builtin: entry.builtin,
      entries: [entry],
    });
  }

  const groups = Array.from(map.values())
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort(compareStoryEntries),
    }))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-Hans-CN'));

  looseEntries.sort(compareStoryEntries);

  return { groups, looseEntries };
}

function getStorySeriesId(entry: 智库条目): string | null {
  return entry.系列ID?.trim() || entry.系列标题?.trim() || null;
}

function getStorySeriesTitle(entry: 智库条目): string | null {
  return entry.系列标题?.trim() || entry.标题?.trim() || null;
}

function compareStoryEntries(a: 智库条目, b: 智库条目): number {
  const chapterA = a.章节序号 ?? Number.MAX_SAFE_INTEGER;
  const chapterB = b.章节序号 ?? Number.MAX_SAFE_INTEGER;
  if (chapterA !== chapterB) return chapterA - chapterB;
  return a.updatedAt - b.updatedAt || a.标题.localeCompare(b.标题, 'zh-Hans-CN');
}

function StorySeriesGroup({
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
            ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.14), rgba(245, 217, 122, 0.04))'
            : 'rgba(16, 14, 16, 0.52)',
          boxShadow: expanded
            ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.46)'
            : 'inset 0 0 0 1px rgba(245, 217, 122, 0.14)',
          clipPath: smallClip,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-serif text-[16px] font-semibold tracking-[0.18em]" style={{ color: '#fff4d4' }}>
              {group.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'rgba(200, 188, 158, 0.74)' }}>
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
                color: group.builtin ? '#1a1325' : 'rgba(245, 217, 122, 0.92)',
                background: group.builtin ? 'rgba(245, 217, 122, 0.88)' : 'rgba(245, 217, 122, 0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
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
        <div className="mt-2 space-y-2 pl-3">
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
    <button
      onClick={onClick}
      className="w-full px-3 py-3 text-left transition-all"
      style={{
        background: active ? 'rgba(245, 217, 122, 0.1)' : 'rgba(16, 14, 16, 0.35)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.42)' : 'inset 0 0 0 1px rgba(245, 217, 122, 0.1)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 px-2 py-0.5 text-[10px] font-mono tracking-[0.18em]" style={{ color: '#1a1325', background: 'rgba(245, 217, 122, 0.88)', clipPath: smallClip }}>
              {entry.章节序号 ? `第${entry.章节序号}章` : '章节'}
            </span>
            <div className="font-serif text-[13px] font-semibold tracking-[0.12em]" style={{ color: '#fff4d4' }}>
              {entry.标题}
            </div>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.72)' }}>
            {entry.摘要 || entry.原文 || '暂无摘要'}
          </p>
        </div>
        <div className="shrink-0 text-right text-[10px] font-mono tracking-[0.18em]" style={{ color: 'rgba(160, 200, 160, 0.76)' }}>
          {entry.来源 || '未标注来源'}
        </div>
      </div>
    </button>
  );
}

function EntryButton({ entry, active, onClick }: { entry: 智库条目; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mb-2 w-full px-3 py-3 text-left transition-all last:mb-0"
      style={{
        background: active ? 'rgba(245, 217, 122, 0.09)' : 'rgba(16, 14, 16, 0.48)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)' : 'inset 0 0 0 1px rgba(245, 217, 122, 0.14)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-serif text-sm font-semibold tracking-[0.16em]" style={{ color: '#fff4d4' }}>
          {entry.标题}
        </div>
        <span
          className="shrink-0 px-2 py-0.5 text-[10px] font-mono tracking-[0.18em]"
          style={{
            color: '#1a1325',
            background: entry.builtin ? 'rgba(245, 217, 122, 0.88)' : 'rgba(160, 230, 170, 0.88)',
            clipPath: smallClip,
          }}
        >
          {entry.builtin ? 'BUILTIN' : 'CUSTOM'}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.74)' }}>
        {entry.摘要 || entry.原文 || '暂无摘要'}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span style={{ color: 'rgba(160, 200, 160, 0.78)' }}>{entry.来源 || '未标注来源'}</span>
        <span style={{ color: 'rgba(200, 188, 158, 0.72)' }}>{ZHIKU_CATEGORY_LABELS[entry.分类]}</span>
      </div>
    </button>
  );
}

function DetailPanel({
  entry,
  onUpdate,
  onDelete,
  onSelectCustomOnly,
}: {
  entry: 智库条目 | null;
  onUpdate: (patch: Partial<智库条目>) => void;
  onDelete: () => void;
  onSelectCustomOnly: () => void;
}) {
  if (!entry) return <EmptyNotice text="先录入或选择一条资料。" />;
  const editable = !entry.builtin;

  return (
    <section
      className="min-h-0 overflow-y-auto px-4 py-4"
      style={{
        background: entry.builtin ? 'rgba(10, 12, 18, 0.7)' : 'rgba(245, 217, 122, 0.03)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.14)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-xs font-mono tracking-[0.3em]" style={{ color: 'rgba(245, 217, 122, 0.8)' }}>
              {entry.builtin ? 'BUILTIN DATA' : 'CUSTOM DATA'}
            </div>
            <span
              className="px-2 py-0.5 text-[10px] font-mono tracking-[0.18em]"
              style={{
                color: '#1a1325',
                background: entry.builtin ? 'rgba(245, 217, 122, 0.88)' : 'rgba(160, 230, 170, 0.88)',
                clipPath: smallClip,
              }}
            >
              {ZHIKU_CATEGORY_LABELS[entry.分类]}
            </span>
          </div>
          <input
            value={entry.标题}
            onChange={(e) => onUpdate({ 标题: e.target.value })}
            readOnly={!editable}
            className="mt-2 w-full bg-transparent font-serif text-[24px] font-semibold tracking-[0.16em] outline-none"
            style={{ color: '#fff4d4', opacity: editable ? 1 : 0.95 }}
          />
          <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.76)' }}>
            {entry.builtin ? '内置条目只读，来自预设原著资料。' : '这里是自制条目编辑区，修改会即时保存到本地智库。'}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {!entry.builtin && (
            <button
              onClick={onDelete}
              className="px-3 py-1.5 text-xs font-mono tracking-[0.22em] transition-all hover:opacity-90"
              style={{
                color: 'rgba(255, 150, 150, 0.92)',
                boxShadow: 'inset 0 0 0 1px rgba(255, 120, 120, 0.24)',
                clipPath: smallClip,
              }}
            >
              DELETE
            </button>
          )}
          {entry.builtin && (
            <button
              onClick={onSelectCustomOnly}
              className="px-3 py-1.5 text-xs font-mono tracking-[0.22em] transition-all hover:opacity-90"
              style={{
                color: 'rgba(160, 230, 170, 0.92)',
                boxShadow: 'inset 0 0 0 1px rgba(160, 230, 170, 0.22)',
                clipPath: smallClip,
              }}
            >
              SWITCH CUSTOM
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Field label="分类">
          <select
            value={entry.分类}
            onChange={(e) => onUpdate({ 分类: e.target.value as 智库分类 })}
            disabled={!editable}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {ZHIKU_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="重要度">
          <input
            type="number"
            min={1}
            max={5}
            value={entry.重要度}
            onChange={(e) => onUpdate({ 重要度: Number(e.target.value) || 3 })}
            readOnly={!editable}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>
      </div>
      <Field label="来源">
        <input
          value={entry.来源 ?? ''}
          onChange={(e) => onUpdate({ 来源: e.target.value })}
          readOnly={!editable}
          className="kaituo-input w-full px-3 py-2 text-sm"
          style={{ clipPath: smallClip }}
        />
      </Field>
      <Field label="关键词">
        <input
          value={entry.关键词.join('、')}
          onChange={(e) =>
            onUpdate({
              关键词: e.target.value
                .split(/[,，、\n]/)
                .map((k) => k.trim())
                .filter(Boolean),
            })
          }
          readOnly={!editable}
          className="kaituo-input w-full px-3 py-2 text-sm"
          style={{ clipPath: smallClip }}
        />
      </Field>
      <label
        className="mt-3 flex items-center justify-between gap-3 px-3 py-2"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.14)', clipPath: smallClip }}
      >
        <span className="text-xs" style={{ color: 'rgba(220, 208, 178, 0.82)' }}>
          允许剧情 / 周报联动检索
        </span>
        <input
          type="checkbox"
          checked={entry.可用于联动}
          onChange={(e) => onUpdate({ 可用于联动: e.target.checked })}
          disabled={!editable}
          className="accent-[#f5d97a]"
        />
      </label>
      <Field label="摘要">
        <textarea
          value={entry.摘要}
          onChange={(e) => onUpdate({ 摘要: e.target.value })}
          readOnly={!editable}
          rows={5}
          className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed"
          style={{ clipPath: smallClip }}
        />
      </Field>
      <Field label="原文">
        <textarea
          value={entry.原文}
          onChange={(e) => onUpdate({ 原文: e.target.value })}
          readOnly={!editable}
          rows={10}
          className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed"
          style={{ clipPath: smallClip }}
        />
      </Field>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-3 block">
      <div className="mb-1.5 text-xs font-mono tracking-[0.24em]" style={{ color: 'rgba(245, 217, 122, 0.82)' }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-3 py-1.5"
      style={{
        background: 'rgba(245, 217, 122, 0.06)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.2)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] font-mono tracking-[0.22em]" style={{ color: 'rgba(245, 217, 122, 0.68)' }}>
        {label}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: 'rgba(220, 208, 178, 0.9)' }}>
        {value}
      </div>
    </div>
  );
}

function TinyTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-mono tracking-[0.3em] transition-all"
      style={{
        color: active ? '#1a1325' : 'rgba(245, 217, 122, 0.88)',
        background: active ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.95), rgba(212, 177, 90, 0.95))' : 'rgba(245, 217, 122, 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.22)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

function EmptyNotice({ text }: { text: string }) {
  return (
    <div
      className="flex h-full min-h-[12rem] items-center justify-center px-5 text-center text-sm leading-relaxed"
      style={{
        color: 'rgba(200, 188, 158, 0.68)',
        background: 'rgba(16, 14, 16, 0.35)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
        clipPath: smallClip,
      }}
    >
      {text}
    </div>
  );
}
