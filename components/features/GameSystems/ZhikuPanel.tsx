import { useMemo, useState, useEffect } from 'react';
import type { 智库系统, 智库分类, 智库条目 } from '@/models/zhiku';
import {
  ZHIKU_CATEGORY_LABELS,
  isRetiredZhikuCategory,
  创建智库条目,
  归一化智库系统,
  搜索智库条目,
  智库分类计数,
} from '@/models/zhiku';
import {
  buildStorySeries,
  getStorySeriesId,
  buildCharacterWorkspace,
  buildCharacterProfileViewModel,
} from '@/models/zhikuCharacter';
import type { 智库系统设置 } from '@/models/settings';
import { devLogError } from '@/utils/devLog';
import { CategoryButton, StatusChip, TinyTab, EmptyNotice } from './zhiku/primitives';
import { StorySeriesGroup, EntryButton } from './zhiku/lists';
import { CharacterWorkspace } from './zhiku/characterWorkspace';
import { DetailPanel } from './zhiku/detail';
import { Composer } from './zhiku/Composer';
import { categories, categoryDescriptions, cardClip, smallClip, isDevBuild, 创建空草稿, type Bucket } from './zhiku/constants';

interface Props {
  zhikuSystem: 智库系统;
  onZhikuSystemChange: React.Dispatch<React.SetStateAction<智库系统>>;
  settings: 智库系统设置;
  onSaveZhikuSystem: (system: 智库系统) => Promise<void>;
  onZhikuMigration: (current: 智库系统) => Promise<智库系统>;
}

export function ZhikuPanel({ zhikuSystem, onZhikuSystemChange, settings, onSaveZhikuSystem, onZhikuMigration }: Props) {
  const normalized = useMemo(() => 归一化智库系统(zhikuSystem), [zhikuSystem]);
  const visibleEntries = useMemo(() => normalized.条目.filter((entry) => !isRetiredZhikuCategory(entry.分类)), [normalized]);
  const builtinEntries = useMemo(() => visibleEntries.filter((entry) => entry.builtin), [visibleEntries]);
  const customEntries = useMemo(() => visibleEntries.filter((entry) => !entry.builtin), [visibleEntries]);
  const [bucket, setBucket] = useState<Bucket>('all');
  const [activeCategory, setActiveCategory] = useState<智库分类 | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(normalized.条目[0]?.id ?? null);
  const [showComposer, setShowComposer] = useState(customEntries.length === 0);
  const [saveFlash, setSaveFlash] = useState(false);
  const [devRefreshStatus, setDevRefreshStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [expandedSeriesIds, setExpandedSeriesIds] = useState<string[]>([]);
  const [expandedCharacterGroupIds, setExpandedCharacterGroupIds] = useState<string[]>([]);
  const [draft, setDraft] = useState(创建空草稿());

  const activeEntries = useMemo(() => {
    let pool =
      bucket === 'builtin' ? builtinEntries
        : bucket === 'custom' ? customEntries
        : visibleEntries;
    const hasQuery = !!query.trim();
    if (hasQuery) {
      pool = 搜索智库条目({ 条目: pool }, query, 200);
    }
    if (activeCategory !== 'all') {
      pool = pool.filter((entry) => entry.分类 === activeCategory);
    }
    return hasQuery ? pool : [...pool].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [activeCategory, bucket, builtinEntries, customEntries, query, visibleEntries]);

  const counts = useMemo(() => 智库分类计数({ 条目: bucket === 'builtin' ? builtinEntries : bucket === 'custom' ? customEntries : visibleEntries }), [bucket, builtinEntries, customEntries, visibleEntries]);

  const selected: 智库条目 | null = activeEntries.find((entry) => entry.id === selectedId) ?? activeEntries.at(0) ?? null;

  const storyList = useMemo(
    () => buildStorySeries(activeEntries.filter((entry) => entry.分类 === 'story')),
    [activeEntries],
  );
  const nonStoryEntries = useMemo(() => activeEntries.filter((entry) => entry.分类 !== 'story'), [activeEntries]);
  const flatEntries = useMemo(
    () => [...storyList.looseEntries, ...nonStoryEntries],
    [nonStoryEntries, storyList.looseEntries],
  );
  const characterWorkspace = useMemo(
    () => buildCharacterWorkspace(activeEntries.filter((entry) => entry.分类 === 'character')),
    [activeEntries],
  );
  const activeCharacterProfile = useMemo(() => {
    if (activeCategory !== 'character' || characterWorkspace.profiles.length === 0) return null;
    return characterWorkspace.profiles.find((profile) => profile.entries.some((entry) => entry.id === selectedId)) ?? characterWorkspace.profiles[0];
  }, [activeCategory, characterWorkspace, selectedId]);
  const activeCharacterEntry = useMemo(() => {
    if (!activeCharacterProfile) return null;
    return activeCharacterProfile.entries.find((entry) => entry.id === selectedId) ?? activeCharacterProfile.entries.at(0) ?? null;
  }, [activeCharacterProfile, selectedId]);

  const selectedStorySeriesId = useMemo(
    () => (selected?.分类 === 'story' ? getStorySeriesId(selected) : null),
    [selected],
  );
  const selectedCharacterVm = useMemo(
    () => (selected?.分类 === 'character' ? buildCharacterProfileViewModel(selected) : null),
    [selected],
  );
  const activeCharacterVm = useMemo(
    () => (activeCharacterEntry?.分类 === 'character' ? buildCharacterProfileViewModel(activeCharacterEntry) : null),
    [activeCharacterEntry],
  );

  useEffect(() => {
    if (storyList.groups.length === 0) return;
    setExpandedSeriesIds((prev) => {
      const ids = storyList.groups.map((g) => g.id);
      let next = prev.filter((id) => ids.includes(id));
      if (selectedStorySeriesId && !next.includes(selectedStorySeriesId)) next = [...next, selectedStorySeriesId];
      return next.length ? next : [storyList.groups[0].id];
    });
  }, [storyList.groups, selectedStorySeriesId]);

  useEffect(() => {
    if (characterWorkspace.groups.length === 0) return;
    setExpandedCharacterGroupIds((prev) => {
      const ids = characterWorkspace.groups.map((g) => g.id);
      let next = prev.filter((id) => ids.includes(id));
      const selectedGroupId = activeCharacterProfile?.groupId;
      if (selectedGroupId && !next.includes(selectedGroupId)) next = [...next, selectedGroupId];
      return next.length ? next : [characterWorkspace.groups[0].id];
    });
  }, [characterWorkspace.groups, activeCharacterProfile?.groupId]);

  const persist = async (nextEntries: 智库条目[]) => {
    const next = 归一化智库系统({ 条目: nextEntries });
    onZhikuSystemChange(next);
    await onSaveZhikuSystem(next);
    setSaveFlash(true);
    window.setTimeout(() => setSaveFlash(false), 1200);
  };

  const handleDevRefreshBundled = async () => {
    if (!isDevBuild || devRefreshStatus === 'loading') return;
    setDevRefreshStatus('loading');
    try {
      const next = await onZhikuMigration(normalized);
      onZhikuSystemChange(next);
      setSelectedId((prev) => (prev && next.条目.some((entry) => entry.id === prev) ? prev : next.条目[0]?.id ?? null));
      setSaveFlash(true);
      setDevRefreshStatus('done');
      window.setTimeout(() => setSaveFlash(false), 1200);
      window.setTimeout(() => setDevRefreshStatus('idle'), 1600);
    } catch (err) {
      devLogError('ui', 'zhiku-dev-refresh-failed', err);
      setDevRefreshStatus('error');
      window.setTimeout(() => setDevRefreshStatus('idle'), 2400);
    }
  };

  const handleCreateCustom = async () => {
    const entry = 创建智库条目({
      标题: draft.标题,
      分类: draft.分类,
      来源: draft.来源,
      关键词: draft.关键词.split(/[,，、\n]/),
      资料类型: draft.资料类型,
      关联角色ID: draft.关联角色ID,
      关联形态ID: draft.关联形态ID,
      解锁状态: draft.解锁状态,
      剧透等级: draft.剧透等级,
      使用范围: draft.使用范围,
      外貌锚点: draft.外貌锚点,
      性格锚点: draft.性格锚点,
      说话方式: draft.说话方式,
      行为习惯: draft.行为习惯,
      关系边界: draft.关系边界,
      禁止误写: draft.禁止误写,
      摘要: draft.摘要 || draft.原文.slice(0, 220),
      原文: draft.原文,
      角色故事摘要: draft.角色故事摘要,
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
    setDraft(创建空草稿(draft.分类));
  };

  const updateSelected = async (patch: Partial<智库条目>) => {
    if (!selected) return;
    const allowedRuntimePatch = selected.builtin
      ? {
          ...(patch.运行时解锁状态 !== undefined ? { 运行时解锁状态: patch.运行时解锁状态 } : {}),
          ...(patch.运行时解锁备注 !== undefined ? { 运行时解锁备注: patch.运行时解锁备注 } : {}),
        }
      : patch;
    if (selected.builtin && Object.keys(allowedRuntimePatch).length === 0) return;
    const nextEntries = normalized.条目.map((entry) =>
      entry.id === selected.id ? { ...entry, ...allowedRuntimePatch, updatedAt: Date.now() } : entry,
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

  const toggleCharacterGroup = (groupId: string) => {
    setExpandedCharacterGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    );
  };

  const visibleCount = activeEntries.length;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overflow-x-hidden md:gap-4 md:overflow-y-hidden">
      <section
        className="min-w-0 px-3 py-3 md:px-4 md:py-4"
        style={{
          background:
            'radial-gradient(circle at 12% 0%, rgba(var(--tj-tech-cyan), 0.08), transparent 36%), linear-gradient(180deg, rgba(var(--tj-bubble), 0.98), rgba(var(--tj-surface-strong), 0.94))',
          boxShadow:
            'inset 0 0 0 1px rgba(var(--tj-border), 0.64), 0 14px 32px rgba(var(--tj-shadow), 0.08)',
          clipPath: cardClip,
        }}
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] tracking-[0.38em] md:text-[11px] md:tracking-[0.5em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              ZHIKU / KNOWLEDGE CORE
            </div>
            <div
              className="mt-1 font-serif text-[22px] font-semibold tracking-[0.18em] md:text-[28px] md:tracking-[0.2em]"
              style={{
                background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 52%, rgb(var(--tj-accent-secondary)) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              智库
            </div>
            <div className="mt-1 line-clamp-2 text-xs leading-relaxed md:mt-2 md:line-clamp-none md:text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
              内置资料来自预设原著内容，只读。自制资料走独立接口，支持你自己继续补原著、补设定、补说明。
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 md:items-end">
            <div className="hidden flex-wrap gap-2 sm:flex">
              <StatusChip label="内置" value={String(builtinEntries.length)} />
              <StatusChip label="自制" value={String(customEntries.length)} />
              <StatusChip label="总数" value={String(normalized.条目.length)} />
            </div>
            {isDevBuild && (
              <button
                type="button"
                onClick={() => void handleDevRefreshBundled()}
                disabled={devRefreshStatus === 'loading'}
                title="重新读取 public/zhiku-presets 内置智库，并保留自制条目与运行时解锁备注。"
                className="px-3 py-1.5 text-[11px] font-mono tracking-[0.18em] transition-all hover:opacity-90 disabled:cursor-wait disabled:opacity-65"
                style={{
                  color: devRefreshStatus === 'done' ? 'rgba(160, 230, 170, 0.96)' : devRefreshStatus === 'error' ? 'rgba(255, 150, 130, 0.95)' : 'rgba(var(--tj-btn-primary-start), 0.92)',
                  background: 'rgba(var(--tj-btn-primary-start), 0.055)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.22)',
                  clipPath: smallClip,
                }}
              >
                {devRefreshStatus === 'loading' ? '刷新中' : devRefreshStatus === 'done' ? '已刷新' : devRefreshStatus === 'error' ? '刷新失败' : 'DEV 刷新内置智库'}
              </button>
            )}
            <div className="flex flex-wrap gap-1.5 md:gap-2">
              <TinyTab active={bucket === 'all'} onClick={() => setBucket('all')}>全部</TinyTab>
              <TinyTab active={bucket === 'builtin'} onClick={() => setBucket('builtin')}>内置</TinyTab>
              <TinyTab active={bucket === 'custom'} onClick={() => setBucket('custom')}>自制</TinyTab>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:mt-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题、关键词、来源或原文片段..."
            className="kaituo-input min-w-0 px-3 py-2 text-xs md:text-sm"
            style={{ clipPath: smallClip }}
          />
          <div
            className="px-2 py-2 text-[10px] font-mono tracking-[0.16em] md:px-3 md:text-xs md:tracking-[0.26em]"
            style={{
              color: saveFlash ? 'rgba(160, 230, 170, 0.95)' : 'rgba(var(--tj-text-secondary), 0.72)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: smallClip,
            }}
          >
            {saveFlash ? 'SAVED' : settings.enabled ? 'LINK ON' : 'LINK OFF'}
          </div>
        </div>
      </section>

      {bucket === 'custom' && (
        <Composer
          draft={draft}
          setDraft={setDraft}
          showComposer={showComposer}
          setShowComposer={setShowComposer}
          onCreate={() => void handleCreateCustom()}
        />
      )}

      <section
        className={`grid min-h-0 min-w-0 flex-1 gap-3 overflow-y-auto overflow-x-hidden p-3 md:overflow-hidden ${
          activeCategory === 'character'
            ? 'md:grid-cols-[170px_220px_minmax(0,1fr)] lg:grid-cols-[190px_260px_minmax(0,1fr)]'
            : 'md:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.2fr)]'
        }`}
        style={{
          background: 'linear-gradient(135deg, rgba(var(--tj-bubble),0.82), rgba(var(--tj-surface-strong),0.62))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
          clipPath: cardClip,
        }}
      >
        <aside className="-mx-1 flex min-h-0 gap-2 overflow-x-auto overflow-y-hidden px-1 pb-1 md:mx-0 md:block md:max-h-none md:overflow-y-auto md:overflow-x-hidden md:px-0 md:pb-0 md:pr-1">
          <CategoryButton label="全部" count={(bucket === 'builtin' ? builtinEntries : bucket === 'custom' ? customEntries : visibleEntries).length} desc="所有资料" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
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

        {activeCategory === 'character' ? (
          <CharacterWorkspace
            groups={characterWorkspace.groups}
            activeProfile={activeCharacterProfile}
            activeEntry={activeCharacterEntry}
            activeVm={activeCharacterVm}
            visibleCount={visibleCount}
            bucket={bucket}
            expandedGroupIds={expandedCharacterGroupIds}
            onToggleGroup={toggleCharacterGroup}
            onSelectProfile={(entryId) => setSelectedId(entryId)}
            onUpdate={(patch) => void updateSelected(patch)}
            onDelete={() => void deleteSelected()}
            onSelectCustomOnly={() => setBucket('custom')}
          />
        ) : (
          <>
            <main className="min-w-0 overflow-x-hidden overflow-y-visible md:min-h-0 md:overflow-y-auto md:pr-1">
              <div className="mb-3 flex items-center justify-between gap-3 px-2">
                <div>
                  <div className="font-serif text-[13px] tracking-[0.28em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                    条目列表
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                    当前显示 {visibleCount} 条
                  </div>
                </div>
                <div className="hidden text-[11px] font-mono tracking-[0.24em] md:block" style={{ color: 'rgba(160, 200, 160, 0.82)' }}>
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
                      selectedId={selectedId}
                      onToggle={() => toggleStorySeries(group.id)}
                      onSelectChapter={(entryId) => setSelectedId(entryId)}
                    />
                  ))}
                  {flatEntries.map((entry) => (
                    <EntryButton key={entry.id} entry={entry} active={entry.id === selectedId} onClick={() => setSelectedId(entry.id)} />
                  ))}
                </>
              )}
            </main>

            <div className="hidden h-full min-h-0 min-w-0 overflow-hidden md:block">
              <DetailPanel
                entry={selected}
                vm={selectedCharacterVm}
                onUpdate={(patch) => void updateSelected(patch)}
                onDelete={() => void deleteSelected()}
                onSelectCustomOnly={() => setBucket('custom')}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
