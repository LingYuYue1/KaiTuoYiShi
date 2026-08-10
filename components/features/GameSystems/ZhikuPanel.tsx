import { useMemo, useState, type ReactNode } from 'react';
import type { 智库系统, 智库分类, 智库条目 } from '@/models/zhiku';
import {
  ZHIKU_CATEGORY_LABELS,
  isRetiredZhikuCategory,
  比较智库人物节点,
  创建智库条目,
  获取智库人物名,
  获取智库人物名列表,
  获取智库核心触发词,
  获取智库人物节点标题,
  归一化智库系统,
  解析智库软结构标签,
  搜索智库条目,
  智库分类计数,
} from '@/models/zhiku';
import type { 智库系统设置 } from '@/models/settings';

interface Props {
  zhikuSystem: 智库系统;
  onZhikuSystemChange: React.Dispatch<React.SetStateAction<智库系统>>;
  settings: 智库系统设置;
  onSaveZhikuSystem: (system: 智库系统) => Promise<void>;
  onZhikuMigration: (current: 智库系统) => Promise<智库系统>;
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

const categories: 智库分类[] = ['story', 'character', 'location', 'faction', 'term', 'event'];
const zhikuScopeOptions = ['主剧情', '手机', '新闻', '变量参考', '剧情编织', '通用', '只读'];
const isDevBuild = typeof import.meta !== 'undefined' && Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

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
  const [draft, setDraft] = useState({
    标题: '',
    分类: 'story' as 智库分类,
    来源: '',
    关键词: '',
    资料类型: '',
    关联角色ID: '',
    关联形态ID: '',
    解锁状态: '',
    剧透等级: '',
    使用范围: [] as string[],
    外貌锚点: '',
    性格锚点: '',
    说话方式: '',
    行为习惯: '',
    关系边界: '',
    禁止误写: '',
    摘要: '',
    原文: '',
    角色故事摘要: '',
    重要度: 3,
    可用于联动: true,
  });

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

  const selected: 智库条目 | null = selectedId
    ? activeEntries.find((entry) => entry.id === selectedId) ?? activeEntries.at(0) ?? null
    : activeEntries.at(0) ?? null;

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

  const [prevSelectedSeriesKey, setPrevSelectedSeriesKey] = useState(`${selected?.id}|${selected?.分类}|${selected?.系列ID}|${selected?.系列标题}`);
  const selectedSeriesKey = `${selected?.id}|${selected?.分类}|${selected?.系列ID}|${selected?.系列标题}`;
  if (prevSelectedSeriesKey !== selectedSeriesKey) {
    setPrevSelectedSeriesKey(selectedSeriesKey);
    const selectedSeriesId = selected?.分类 === 'story' ? getStorySeriesId(selected) : null;
    if (selectedSeriesId) {
      setExpandedSeriesIds((prev) => (prev.includes(selectedSeriesId) ? prev : [...prev, selectedSeriesId]));
    }
  }

  const [prevStoryGroups, setPrevStoryGroups] = useState(storyList.groups);
  if (prevStoryGroups !== storyList.groups) {
    setPrevStoryGroups(storyList.groups);
    if (storyList.groups.length > 0) {
      setExpandedSeriesIds((prev) =>
        prev.some((id) => storyList.groups.some((group) => group.id === id)) ? prev : [storyList.groups[0].id],
      );
    }
  }

  const [prevCharGroupsKey, setPrevCharGroupsKey] = useState(`${activeCategory}|${characterWorkspace.groups.length}|${characterWorkspace.profiles.length}|${selectedId ?? ''}`);
  const charGroupsKey = `${activeCategory}|${characterWorkspace.groups.length}|${characterWorkspace.profiles.length}|${selectedId ?? ''}`;
  if (prevCharGroupsKey !== charGroupsKey) {
    setPrevCharGroupsKey(charGroupsKey);
    if (activeCategory === 'character' && characterWorkspace.groups.length > 0) {
      setExpandedCharacterGroupIds((prev) => {
        const groupIds = characterWorkspace.groups.map((group) => group.id);
        const valid = prev.filter((id) => groupIds.includes(id));
        const selectedProfile = selectedId
          ? characterWorkspace.profiles.find((profile) => profile.entries.some((entry) => entry.id === selectedId))
          : null;
        if (selectedProfile?.groupId && !valid.includes(selectedProfile.groupId)) {
          return [...valid, selectedProfile.groupId];
        }
        return valid;
      });
    }
  }

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
      console.warn('[zhiku] dev refresh bundled presets failed:', err);
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
    setDraft({
      标题: '',
      分类: draft.分类,
      来源: '',
      关键词: '',
      资料类型: '',
      关联角色ID: '',
      关联形态ID: '',
      解锁状态: '',
      剧透等级: '',
      使用范围: [],
      外貌锚点: '',
      性格锚点: '',
      说话方式: '',
      行为习惯: '',
      关系边界: '',
      禁止误写: '',
      摘要: '',
      原文: '',
      角色故事摘要: '',
      重要度: 3,
      可用于联动: true,
    });
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
        <section
          className="min-w-0 px-3 py-4 md:px-4"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--tj-bubble),0.86), rgba(var(--tj-surface-strong),0.66))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
            clipPath: cardClip,
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-serif text-[14px] tracking-[0.28em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                自制内容接口
              </div>
              <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                这里录入玩家自己整理的资料。不会污染内置内容，默认作为可编辑自制条目保存。
              </div>
            </div>
            <button
              onClick={() => setShowComposer((v) => !v)}
              className="px-3 py-2 text-xs font-mono tracking-[0.3em] transition-all hover:opacity-90"
              style={{
                color: 'rgb(var(--tj-on-accent))',
                background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-amber-deep), 0.95))',
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
                <div className="grid gap-2 sm:grid-cols-2">
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
                {draft.分类 === 'character' && (
                  <section
                    className="px-3 py-3"
                    style={{
                      background: 'rgba(var(--tj-bg-primary), 0.2)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                      clipPath: smallClip,
                    }}
                  >
                    <div className="font-serif text-[13px] tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                      人物结构
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Field label="资料类型">
                        <input value={draft.资料类型} onChange={(e) => setDraft({ ...draft, 资料类型: e.target.value })} placeholder="角色主体 / 角色形态" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                      </Field>
                      <Field label="关联角色">
                        <input value={draft.关联角色ID} onChange={(e) => setDraft({ ...draft, 关联角色ID: e.target.value })} placeholder="星 / 三月七 / 丹恒" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                      </Field>
                      <Field label="关联形态">
                        <input value={draft.关联形态ID} onChange={(e) => setDraft({ ...draft, 关联形态ID: e.target.value })} placeholder="基础形态 / 饮月 / 巡猎" className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                      </Field>
                      <Field label="解锁状态">
                        <select value={draft.解锁状态} onChange={(e) => setDraft({ ...draft, 解锁状态: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                          <option value="">未标注</option>
                          <option value="默认可用">默认可用</option>
                          <option value="可预热">可预热</option>
                          <option value="未解锁">未解锁</option>
                          <option value="已解锁">已解锁</option>
                          <option value="手动启用">手动启用</option>
                          <option value="只读">只读</option>
                        </select>
                      </Field>
                      <Field label="剧透等级">
                        <select value={draft.剧透等级} onChange={(e) => setDraft({ ...draft, 剧透等级: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                          <option value="">未标注</option>
                          <option value="无">无</option>
                          <option value="轻微">轻微</option>
                          <option value="中等">中等</option>
                          <option value="重大">重大</option>
                        </select>
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {zhikuScopeOptions.slice(0, 4).map((scope) => (
                        <label key={scope} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2" style={{ background: 'rgba(var(--tj-bubble),0.48)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)', clipPath: smallClip }}>
                          <span className="truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>{scope}</span>
                          <input
                            type="checkbox"
                            checked={draft.使用范围.includes(scope)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? Array.from(new Set([...draft.使用范围, scope]))
                                : draft.使用范围.filter((item) => item !== scope);
                              setDraft({ ...draft, 使用范围: next });
                            }}
                            className="accent-[rgb(var(--tj-accent-primary))]"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-4">
                      <div className="mb-2 font-serif text-[13px] tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                        人物表现结构
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <PerformanceTextarea label="外貌锚点" value={draft.外貌锚点} editable onChange={(value) => setDraft({ ...draft, 外貌锚点: value })} />
                        <PerformanceTextarea label="性格锚点" value={draft.性格锚点} editable onChange={(value) => setDraft({ ...draft, 性格锚点: value })} />
                        <PerformanceTextarea label="说话方式" value={draft.说话方式} editable onChange={(value) => setDraft({ ...draft, 说话方式: value })} />
                        <PerformanceTextarea label="行为习惯" value={draft.行为习惯} editable onChange={(value) => setDraft({ ...draft, 行为习惯: value })} />
                        <PerformanceTextarea label="关系边界" value={draft.关系边界} editable onChange={(value) => setDraft({ ...draft, 关系边界: value })} />
                        <PerformanceTextarea label="禁止误写" value={draft.禁止误写} editable onChange={(value) => setDraft({ ...draft, 禁止误写: value })} />
                      </div>
                    </div>
                  </section>
                )}
                <label className="flex items-center justify-between gap-3 px-3 py-2" style={{ boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)', clipPath: smallClip }}>
                  <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>允许联动检索</span>
                  <input type="checkbox" checked={draft.可用于联动} onChange={(e) => setDraft({ ...draft, 可用于联动: e.target.checked })} className="accent-[rgb(var(--tj-accent-primary))]" />
                </label>
              </div>
              <div className="space-y-3">
                <Field label="摘要">
                  <textarea value={draft.摘要} onChange={(e) => setDraft({ ...draft, 摘要: e.target.value })} rows={4} placeholder="建议写成可检索的短摘要，留空会自动截原文前 220 字。" className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
                </Field>
                <Field label="角色故事摘要">
                  <textarea value={draft.角色故事摘要} onChange={(e) => setDraft({ ...draft, 角色故事摘要: e.target.value })} rows={5} placeholder="只压缩角色故事层 / 历史故事层；语料、表现锚点和常驻事实仍从原文结构正常注入。" className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
                </Field>
                <Field label="原文">
                  <textarea value={draft.原文} onChange={(e) => setDraft({ ...draft, 原文: e.target.value })} rows={7} placeholder="把原文或整理好的内容贴进来。" className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed" style={{ clipPath: smallClip }} />
                </Field>
                <button
                  onClick={() => void handleCreateCustom()}
                  disabled={!draft.标题.trim() && !draft.原文.trim()}
                  className="w-full py-2.5 text-sm font-mono tracking-[0.34em] transition-all disabled:opacity-50"
                  style={{
                    color: 'rgb(var(--tj-on-accent))',
                    background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-amber-deep), 0.95))',
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

        {activeCategory === 'character' ? (
          <CharacterWorkspace
            groups={characterWorkspace.groups}
            activeProfile={activeCharacterProfile}
            activeEntry={activeCharacterEntry}
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
                      onSelectChapter={(entryId) => setSelectedId((prev) => (prev === entryId ? null : entryId))}
                    />
                  ))}
                  {flatEntries.map((entry) => (
                    <EntryButton key={entry.id} entry={entry} active={entry.id === selectedId} onClick={() => setSelectedId((prev) => (prev === entry.id ? null : entry.id))} />
                  ))}
                </>
              )}
            </main>

            <div className="hidden h-full min-h-0 min-w-0 overflow-hidden md:block">
              <DetailPanel
                entry={selected}
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

function CategoryButton({ label, count, desc, active, onClick }: { label: string; count: number; desc: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mb-0 flex h-[70px] min-w-[76px] shrink-0 flex-col justify-between px-2 py-2 text-center transition-all md:mb-2 md:h-auto md:w-full md:min-w-0 md:px-3 md:py-3 md:text-left md:last:mb-0"
      style={{
        background: active ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.14), rgba(var(--tj-btn-primary-start), 0.03))' : 'rgba(var(--tj-btn-primary-start), 0.035)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-col items-center justify-between gap-1 md:flex-row md:gap-3">
        <span className="line-clamp-1 font-serif text-xs tracking-[0.12em] md:text-sm md:tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>{label}</span>
        <span className="text-[10px] font-mono md:text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>{count}</span>
      </div>
      <div className="hidden md:mt-1 md:block md:text-[11px] md:leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>{desc}</div>
    </button>
  );
}

type CharacterProfile = {
  id: string;
  name: string;
  groupId: string;
  groupLabel: string;
  groupKind: CharacterGroupKind;
  groupOrder?: number;
  entries: 智库条目[];
};

type CharacterGroupKind = '组织' | '地区' | '阵营' | '资料大区' | '待整理';

type CharacterGroup = {
  id: string;
  label: string;
  kind: CharacterGroupKind;
  order?: number;
  profiles: CharacterProfile[];
};

const characterGroupFallbacks: Array<{ label: string; kind: CharacterGroupKind; aliases: string[] }> = [
  { label: '星穹列车', kind: '组织', aliases: ['星穹列车', '列车组', '无名客', '列车', '帕姆'] },
  { label: '黑塔空间站', kind: '地区', aliases: ['黑塔空间站', '空间站', '防卫科', '主控舱段', '基座舱段', '收容舱段', '支援舱段'] },
  { label: '雅利洛-VI', kind: '地区', aliases: ['雅利洛', '贝洛伯格', '下层区', '上层区', '磐岩镇', '地火', '史瓦罗'] },
  { label: '仙舟罗浮', kind: '地区', aliases: ['仙舟', '罗浮', '云骑', '神策府', '长乐天', '金人巷', '鳞渊境'] },
  { label: '匹诺康尼', kind: '资料大区', aliases: ['匹诺康尼', '家族', '梦境', '白日梦酒店', '黄金的时刻', '知更鸟', '星期日'] },
  { label: '翁法罗斯', kind: '资料大区', aliases: ['翁法罗斯'] },
  { label: '联动角色', kind: '资料大区', aliases: ['联动角色', 'Fate', 'UBW', 'Saber', 'Archer'] },
  { label: '永火官邸', kind: '资料大区', aliases: ['永火官邸', '康士坦丝', '大丽花', '冥火大公', '泯灭帮'] },
  { label: '星核猎手', kind: '阵营', aliases: ['星核猎手', '卡芙卡', '银狼', '刃', '萨姆'] },
  { label: '天才俱乐部', kind: '阵营', aliases: ['天才俱乐部', '黑塔', '螺丝咕姆', '阮梅'] },
];
const characterGroupPriority: Record<CharacterGroupKind, number> = {
  组织: 1,
  地区: 2,
  阵营: 3,
  资料大区: 4,
  待整理: 9,
};

const nativePenaconyOrganizations = new Set([
  '家族',
  '猎犬家系',
  '白日梦酒店',
  '橡木家系',
  '鸢尾花家系',
  '苜蓿草家系',
  '隐夜鸫家系',
]);
const nativeAmphoreusOrganizations = new Set(['黄金裔', 'Chrysos Heirs', '奥赫玛']);
const crossoverOrganizations = new Set(['Fate/stay night [Unlimited Blade Works]', 'Fate', 'UBW']);
const everFlameOrganizations = new Set(['永火官邸', '泯灭帮', 'Ever-Flame Mansion', 'Annihilation Gang']);

function buildCharacterWorkspace(entries: 智库条目[]): { profiles: CharacterProfile[]; groups: CharacterGroup[] } {
  const profiles = new Map<string, CharacterProfile>();

  for (const entry of entries) {
    const names = getCharacterProfileNames(entry);
    for (const name of names) {
      const current = profiles.get(name);
      if (current) {
        if (!current.entries.some((item) => item.id === entry.id)) current.entries.push(entry);
        continue;
      }
      const group = resolveCharacterGroup(entry, name);
      profiles.set(name, {
        id: name,
        name,
        groupId: group.id,
        groupLabel: group.label,
        groupKind: group.kind,
        groupOrder: entry.系列序号,
        entries: [entry],
      });
    }
  }

  const sortedProfiles = Array.from(profiles.values())
    .map((profile) => ({
      ...profile,
      entries: [...profile.entries].sort(比较智库人物节点),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const groups = new Map<string, CharacterGroup>();
  for (const profile of sortedProfiles) {
    const current = groups.get(profile.groupId);
    if (current) {
      current.profiles.push(profile);
      continue;
    }
    groups.set(profile.groupId, {
      id: profile.groupId,
      label: profile.groupLabel,
      kind: profile.groupKind,
      order: profile.groupOrder,
      profiles: [profile],
    });
  }

  return {
    profiles: sortedProfiles,
    groups: Array.from(groups.values())
      .map((group) => ({
        ...group,
        profiles: [...group.profiles].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
      }))
      .sort(compareCharacterGroups),
  };
}

function compareCharacterGroups(a: CharacterGroup, b: CharacterGroup): number {
  const orderA = Number.isFinite(a.order) ? a.order ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  const orderB = Number.isFinite(b.order) ? b.order ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return characterGroupPriority[a.kind] - characterGroupPriority[b.kind] || a.label.localeCompare(b.label, 'zh-Hans-CN');
}

function getCharacterName(entry: 智库条目): string {
  return 获取智库人物名(entry);
}

function getCharacterNames(entry: 智库条目): string[] {
  return 获取智库人物名列表(entry);
}

function getCharacterProfileNames(entry: 智库条目): string[] {
  const primary = getCharacterName(entry).trim();
  if (primary) return [primary];
  const names = getCharacterNames(entry).map((name) => name.trim()).filter(Boolean);
  return names.length ? [names[0]] : [entry.标题];
}

function resolveCharacterGroup(entry: 智库条目, characterName = getCharacterName(entry)): { id: string; label: string; kind: CharacterGroupKind } {
  const explicit = getCharacterGroupFromTags(entry);
  if (explicit) return explicit;

  if (characterName === '星' || characterName === '穹') {
    return { id: 'fallback:星穹列车', label: '星穹列车', kind: '组织' };
  }

  const text = [entry.标题, entry.摘要, entry.来源 ?? '', entry.原文, ...entry.关键词].join(' ');
  for (const group of characterGroupFallbacks) {
    if (group.aliases.some((alias) => text.includes(alias))) {
      return { id: `fallback:${group.label}`, label: group.label, kind: group.kind };
    }
  }

  return { id: 'ungrouped', label: '未分组 / 待整理', kind: '待整理' };
}

function getCharacterGroupFromTags(entry: 智库条目): { id: string; label: string; kind: CharacterGroupKind } | null {
  const tagPriority: Array<{ keys: string[]; kind: CharacterGroupKind }> = [
    { keys: ['所属', '归属', '所属组织'], kind: '组织' },
    { keys: ['地区', '区域', '地点'], kind: '地区' },
    { keys: ['阵营', '派系'], kind: '阵营' },
    { keys: ['组织'], kind: '组织' },
    { keys: ['资料大区', '大区'], kind: '资料大区' },
  ];
  const tags = entry.关键词;
  const parsedTags = tags.map(parseCharacterTag).filter((tag): tag is { key: string; value: string } => Boolean(tag));
  const dataArea = parsedTags.find((tag) => ['资料大区', '大区'].includes(tag.key))?.value;
  const organization = parsedTags.find((tag) => ['所属', '归属', '所属组织', '组织'].includes(tag.key))?.value;

  if (dataArea === '匹诺康尼' && organization && nativePenaconyOrganizations.has(organization)) {
    return {
      id: '资料大区:匹诺康尼',
      label: '匹诺康尼',
      kind: '资料大区',
    };
  }
  if (dataArea === '翁法罗斯' && organization && nativeAmphoreusOrganizations.has(organization)) {
    return {
      id: '资料大区:翁法罗斯',
      label: '翁法罗斯',
      kind: '资料大区',
    };
  }
  if (dataArea === '联动角色' && organization && crossoverOrganizations.has(organization)) {
    return {
      id: '资料大区:联动角色',
      label: '联动角色',
      kind: '资料大区',
    };
  }
  if (dataArea === '永火官邸' && organization && everFlameOrganizations.has(organization)) {
    return {
      id: '资料大区:永火官邸',
      label: '永火官邸',
      kind: '资料大区',
    };
  }

  for (const option of tagPriority) {
    for (const parsed of parsedTags) {
      if (!option.keys.includes(parsed.key)) continue;
      return {
        id: `${option.kind}:${parsed.value}`,
        label: parsed.value,
        kind: option.kind,
      };
    }
  }
  return null;
}

function parseCharacterTag(keyword: string): { key: string; value: string } | null {
  const match = keyword.match(/^([^:：]+)[:：](.+)$/u);
  if (!match) return null;
  const key = match[1].trim();
  const value = match[2].trim();
  return key && value ? { key, value } : null;
}

function CharacterWorkspace({
  groups,
  activeProfile,
  activeEntry,
  visibleCount,
  bucket,
  expandedGroupIds,
  onToggleGroup,
  onSelectProfile,
  onUpdate,
  onDelete,
  onSelectCustomOnly,
}: {
  groups: CharacterGroup[];
  activeProfile: CharacterProfile | null;
  activeEntry: 智库条目 | null;
  visibleCount: number;
  bucket: Bucket;
  expandedGroupIds: string[];
  onToggleGroup: (groupId: string) => void;
  onSelectProfile: (entryId: string) => void;
  onUpdate: (patch: Partial<智库条目>) => void;
  onDelete: () => void;
  onSelectCustomOnly: () => void;
}) {
  return (
    <>
      <main className="min-w-0 overflow-x-hidden overflow-y-visible md:min-h-0 md:overflow-y-auto md:pr-1">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2 px-2">
          <div className="min-w-0">
            <div className="truncate whitespace-nowrap font-serif text-[13px] tracking-[0.12em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
              角色列表
            </div>
            <div className="mt-1 whitespace-nowrap text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
              {groups.reduce((total, group) => total + group.profiles.length, 0)} 名 / {visibleCount} 条
            </div>
          </div>
          <div className="hidden shrink-0 whitespace-nowrap text-[11px] font-mono tracking-[0.14em] md:block" style={{ color: 'rgba(190, 224, 190, 0.92)' }}>
            {bucket === 'builtin' ? 'READ ONLY' : bucket === 'custom' ? 'CUSTOM' : 'REBUILD'}
          </div>
        </div>

        {groups.length === 0 ? (
          <EmptyNotice text="暂无人物" />
        ) : (
          groups.map((group) => (
            <CharacterProfileGroup
              key={group.id}
              group={group}
              expanded={expandedGroupIds.includes(group.id)}
              activeProfileId={activeProfile?.id ?? null}
              onToggle={() => onToggleGroup(group.id)}
              onSelectProfile={onSelectProfile}
            />
          ))
        )}
      </main>

      <div className="min-h-0 min-w-0 overflow-hidden md:h-full">
        {activeEntry ? (
          <DetailPanel
            entry={activeEntry}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onSelectCustomOnly={onSelectCustomOnly}
          />
        ) : (
          <CharacterRebuildDetail />
        )}
      </div>
    </>
  );
}

function CharacterProfileGroup({
  group,
  expanded,
  activeProfileId,
  onToggle,
  onSelectProfile,
}: {
  group: CharacterGroup;
  expanded: boolean;
  activeProfileId: string | null;
  onToggle: () => void;
  onSelectProfile: (entryId: string) => void;
}) {
  return (
    <section className="mb-3 last:mb-0">
      <button
        onClick={onToggle}
        className="mb-1.5 w-full min-w-0 overflow-hidden px-2.5 py-2.5 text-left transition-all"
        style={{
          background: expanded
            ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.18), rgba(var(--tj-bg-secondary), 0.54))'
            : 'linear-gradient(135deg, rgba(var(--tj-bg-primary), 0.18), rgba(var(--tj-bg-secondary), 0.4))',
          boxShadow: expanded
            ? 'inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.94), inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.44)'
            : 'inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.32), inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.13)',
          clipPath: smallClip,
        }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-serif text-[13px] font-semibold tracking-[0.16em]" style={{ color: expanded ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.9)' }}>
              {group.label}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span
                className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono tracking-[0.12em]"
                style={{
                  color: 'rgba(var(--tj-btn-primary-start), 0.92)',
                  background: 'rgba(var(--tj-btn-primary-start), 0.08)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                  clipPath: smallClip,
                }}
              >
                {group.kind}
              </span>
              <span className="truncate text-[10px] font-mono tracking-[0.1em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
                NAV GROUP
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="px-1.5 py-0.5 text-[10px] font-mono tracking-[0.14em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)', background: 'rgba(var(--tj-bg-primary), 0.28)', clipPath: smallClip }}>
              {group.profiles.length} 名
            </span>
            <span className="text-[13px] font-mono" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.92)' }}>
              {expanded ? '▾' : '▸'}
            </span>
          </div>
        </div>
      </button>
      {expanded && (
        <div
          className="ml-2 space-y-1.5 border-l pl-2"
          style={{ borderColor: 'rgba(var(--tj-btn-primary-start), 0.22)' }}
        >
          {group.profiles.map((profile) => (
            <CharacterProfileButton
              key={profile.id}
              profile={profile}
              active={activeProfileId === profile.id}
              onClick={() => onSelectProfile(profile.entries[0].id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CharacterProfileButton({ profile, active, onClick }: { profile: CharacterProfile; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full min-w-0 overflow-hidden px-2.5 py-2.5 text-left transition-all"
      style={{
        background: active ? 'rgba(var(--tj-btn-primary-start), 0.11)' : 'rgba(var(--tj-bg-secondary), 0.28)',
        boxShadow: active
          ? 'inset 2px 0 0 rgba(var(--tj-btn-primary-start), 0.9), inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.28)',
        clipPath: smallClip,
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate font-serif text-[13px] font-semibold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
          {profile.name}
        </div>
        <span className="shrink-0 text-[10px] font-mono tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
          {profile.entries.length}
        </span>
      </div>
      <div className="mt-1 truncate text-[10px] font-mono tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
        {profile.groupLabel}
      </div>
    </button>
  );
}

function CharacterRebuildDetail() {
  return (
    <section
      className="h-full min-h-[18rem] min-w-0 overflow-y-auto px-3 py-4 md:px-4"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-bubble),0.94), rgba(var(--tj-tech-wash),0.58), rgba(var(--tj-surface-strong),0.78))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72), inset 4px 0 0 rgba(var(--tj-btn-primary-start), 0.42)',
        clipPath: smallClip,
      }}
    >
      <div className="text-xs font-mono tracking-[0.3em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.8)' }}>
        CHARACTER REBUILD
      </div>
      <div className="mt-3 font-serif text-[22px] font-semibold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        人物资料待重建
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
        <p>旧版人物资料已从智库退出，避免继续用单层百科条目影响角色口吻和剧情阶段。</p>
        <p>下一步重新放入人物时，会按角色主体、形态阶段、命途能力、剧情解锁与 OOC 风险拆成节点。</p>
      </div>
    </section>
  );
}

function CharacterSoftStructurePreview({ entry }: { entry: 智库条目 }) {
  const meta = 解析智库软结构标签(entry);
  const rows = [
    ['角色', meta.角色名 || 获取智库人物名(entry)],
    ['节点', 获取智库人物节点标题(entry)],
    ['资料类型', meta.资料类型 || '未标注'],
    ['形态', meta.形态 || '无'],
    ['命途', meta.命途 || '无'],
    ['阶段', meta.阶段 || '无'],
    ['解锁', meta.解锁状态 || '未标注'],
    ['剧透', meta.剧透等级 || '未标注'],
    ['范围', meta.使用范围.length ? meta.使用范围.join(' / ') : '未标注'],
  ];
  const performanceRows = [
    ['外貌', meta.外貌锚点],
    ['性格', meta.性格锚点],
    ['口吻', meta.说话方式],
    ['行为', meta.行为习惯],
    ['关系边界', meta.关系边界],
    ['禁止误写', meta.禁止误写],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <section
      className="mt-3 px-3 py-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.26)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[13px] tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        软结构预览
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="min-w-0 px-2 py-2"
            style={{
              background: 'rgba(var(--tj-bg-secondary), 0.32)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)',
              clipPath: smallClip,
            }}
          >
            <div className="text-[11px] font-mono tracking-[0.12em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.9), rgba(var(--tj-btn-primary-end), 0.86))' }}>
              {label}
            </div>
            <div className="mt-1 truncate text-xs" style={{ color: 'rgba(var(--tj-text-primary), 0.88)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      {performanceRows.length > 0 && (
        <div className="mt-3 grid gap-2">
          {performanceRows.map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 px-2 py-2"
              style={{
                background: 'rgba(var(--tj-bg-secondary), 0.24)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.36)',
                clipPath: smallClip,
              }}
            >
              <div className="text-[11px] font-mono tracking-[0.12em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.9), rgba(var(--tj-btn-primary-end), 0.86))' }}>
                {label}
              </div>
              <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.88)' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
        可在关键词中使用：角色:星、资料类型:角色主体、形态:存护、解锁:未解锁、剧透:重大、范围:主剧情。
      </div>
    </section>
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
  return entry.系列标题?.trim() || entry.标题.trim() || null;
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

function EntryButton({ entry, active, onClick }: { entry: 智库条目; active: boolean; onClick: () => void }) {
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
  const characterMeta = entry.分类 === 'character' ? 解析智库软结构标签(entry) : null;

  return (
    <section
      className="h-full min-h-0 min-w-0 overflow-y-auto px-3 py-4 md:px-4"
      style={{
        background: entry.builtin
          ? 'linear-gradient(135deg, rgba(var(--tj-bubble),0.94), rgba(var(--tj-tech-wash),0.72) 44%, rgba(var(--tj-surface-strong),0.82))'
          : 'linear-gradient(135deg, rgba(var(--tj-bubble),0.95), rgba(var(--tj-surface-strong),0.7))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72), inset 4px 0 0 rgba(var(--tj-btn-primary-start), 0.42)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-mono tracking-[0.3em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.8)' }}>
              {entry.builtin ? 'BUILTIN DATA' : 'CUSTOM DATA'}
            </div>
            <span
              className="px-2 py-0.5 text-[10px] font-mono tracking-[0.18em]"
              style={{
                color: 'rgb(var(--tj-on-accent))',
                background: entry.builtin ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))' : 'rgba(54, 111, 74, 0.88)',
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
            className="mt-2 w-full min-w-0 bg-transparent font-serif text-lg font-semibold tracking-[0.08em] outline-none md:text-[24px] md:tracking-[0.16em]"
            style={{ color: 'rgb(var(--tj-text-primary))', opacity: editable ? 1 : 0.95 }}
          />
          <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.9)' }}>
            {entry.builtin ? '内置条目只读，来自预设原著资料。' : '这里是自制条目编辑区，修改会即时保存到本地智库。'}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
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
                color: 'rgba(54, 111, 74, 0.96)',
                background: 'rgba(54, 111, 74, 0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(54, 111, 74, 0.32)',
                clipPath: smallClip,
              }}
            >
              SWITCH CUSTOM
            </button>
          )}
        </div>
      </div>

      {entry.分类 === 'character' ? (
        <CharacterProfileWorkspace entry={entry} editable={editable} onUpdate={onUpdate} />
      ) : (
        <DetailMetadataForm entry={entry} editable={editable} characterMeta={characterMeta} onUpdate={onUpdate} />
      )}
    </section>
  );
}

function DetailMetadataForm({
  entry,
  editable,
  characterMeta,
  onUpdate,
}: {
  entry: 智库条目;
  editable: boolean;
  characterMeta: ReturnType<typeof 解析智库软结构标签> | null;
  onUpdate: (patch: Partial<智库条目>) => void;
}) {
  return (
    <>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
        style={{ background: 'rgba(var(--tj-bubble),0.62)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)', clipPath: smallClip }}
      >
        <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
          允许剧情 / 周报联动检索
        </span>
        <input
          type="checkbox"
          checked={entry.可用于联动}
          onChange={(e) => onUpdate({ 可用于联动: e.target.checked })}
          disabled={!editable}
          className="accent-[rgb(var(--tj-accent-primary))]"
        />
      </label>
      {characterMeta && <CharacterSoftStructurePreview entry={entry} />}
      {entry.分类 === 'character' && (
        <StructuredCharacterFields entry={entry} editable={editable} onUpdate={onUpdate} />
      )}
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
      {entry.分类 === 'character' && (
        <Field label="角色故事摘要">
          <textarea
            value={entry.角色故事摘要 ?? ''}
            onChange={(e) => onUpdate({ 角色故事摘要: e.target.value })}
            readOnly={!editable}
            rows={7}
            placeholder="摘要1-4 写在这里；多形态 / 阶段角色在末尾单独写多形态/阶段摘要。主剧情只用这里替代长篇角色故事层。"
            className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed"
            style={{ clipPath: smallClip }}
          />
          <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
            主剧情注入时只用这块替代角色故事层 / 历史故事层；语料层、表现锚点层和常驻事实层仍从原文读取。
          </div>
        </Field>
      )}
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
    </>
  );
}

function CharacterProfileWorkspace({
  entry,
}: {
  entry: 智库条目;
  editable: boolean;
  onUpdate: (patch: Partial<智库条目>) => void;
}) {
  const meta = 解析智库软结构标签(entry);
  const sections = parseZhikuMarkdownSections(entry.原文);
  const identity = sections.find((section) => /基础|身份|识别/.test(section.title));
  const facts = sections.find((section) => /常驻|事实/.test(section.title));
  const story = sections.find((section) => /角色故事|故事层|经历脉络/.test(section.title));
  const corpus = sections.find((section) => section.title.includes('语料'));
  const ability = sections.find((section) => /能力|职责/.test(section.title));
  const gates = findCharacterGateSection(sections);
  const injection = sections.find((section) => /注入/.test(section.title));
  const scope = meta.使用范围.length ? meta.使用范围 : entry.使用范围 ?? [];
  const identityMap = parseCharacterIdentityFields(identity?.body ?? '');
  const gateCards = parseCharacterGateCards(gates?.body ?? '');
  const corpusGroups = parseMarkdownSubsections(corpus?.body ?? '');
  const storyGroups = parseMarkdownSubsections(story?.body ?? '');
  const identityRows = buildCharacterIdentityRows(entry, meta, identityMap);
  const identityMissing = identityRows.filter((row) => row.missing).map((row) => row.label);
  const anchorRows = buildCharacterAnchorRows(entry);
  const keywordBuckets = buildCharacterKeywordBuckets(entry, identityMap);
  const [activeSection, setActiveSection] = useState<CharacterProfileSectionKey>('identity');
  const healthItems = [
    { label: '身份完整', value: `${identityRows.length - identityMissing.length}/${identityRows.length}` },
    { label: '表现锚点', value: `${anchorRows.length}/6` },
    { label: '故事段', value: String(storyGroups.length || (story ? 1 : 0)) },
    { label: '语料组', value: String(corpusGroups.length || (corpus ? 1 : 0)) },
    { label: '门禁卡', value: String(gateCards.length) },
    { label: '关键词触发', value: `${keywordBuckets.triggerTerms.length}/${keywordBuckets.total}` },
  ];
  const keyTags = [
    meta.资料类型 || entry.资料类型 || '角色档案',
    meta.解锁状态 || entry.解锁状态 || '未标注解锁',
    meta.剧透等级 ? `剧透:${meta.剧透等级}` : '',
    ...scope.slice(0, 3),
  ].filter(Boolean);
  const profileSummary = entry.摘要.trim() || facts?.body.split('\n').find((line) => line.trim()) || '角色档案';
  const sectionTabs: Array<{ key: CharacterProfileSectionKey; label: string; available: boolean }> = [
    { key: 'identity', label: '身份', available: true },
    { key: 'health', label: '健康度', available: true },
    { key: 'facts', label: '事实', available: Boolean(facts) },
    { key: 'story', label: '故事', available: Boolean(story) },
    { key: 'anchors', label: '锚点', available: anchorRows.length > 0 },
    { key: 'corpus', label: '语料', available: Boolean(corpus) },
    { key: 'ability', label: '能力', available: Boolean(ability) },
    { key: 'gates', label: '门禁', available: Boolean(gates) },
    { key: 'injection', label: '注入', available: true },
  ];
  const visibleSection = sectionTabs.some((item) => item.key === activeSection && item.available) ? activeSection : 'identity';

  return (
    <section className="mt-4 space-y-3">
      <div
        className="px-3 py-3 md:px-4"
        style={{
          background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.1), rgba(var(--tj-bg-primary), 0.26), rgba(var(--tj-surface-strong), 0.52))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.24), inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.44)',
          clipPath: smallClip,
        }}
      >
        <div className="min-w-0">
          <div className="min-w-0">
            <div className="text-[11px] font-mono tracking-[0.3em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.86), rgba(var(--tj-btn-primary-end), 0.82))' }}>
              角色档案工作台
            </div>
            <div className="mt-2 font-serif text-[20px] font-semibold tracking-[0.16em] md:text-[24px]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
              {entry.标题}
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
              {profileSummary}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {keyTags.map((tag) => (
            <CharacterBadge key={tag} label={tag} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[9.5rem_minmax(0,1fr)]">
        <aside
          className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-0 lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0"
          style={{ scrollbarWidth: 'thin' }}
        >
          {sectionTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => item.available && setActiveSection(item.key)}
              disabled={!item.available}
              className="shrink-0 px-3.5 py-2.5 text-center text-[12px] font-mono font-semibold tracking-[0.16em] transition-all lg:w-full lg:px-4 lg:py-3 lg:text-left lg:text-[13px]"
              style={{
                color: visibleSection === item.key ? 'rgb(var(--tj-bg-primary))' : item.available ? 'rgba(var(--tj-btn-primary-start), 0.9)' : 'rgba(var(--tj-text-secondary), 0.42)',
                background: visibleSection === item.key ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.86), rgba(var(--tj-btn-primary-end), 0.82))' : 'rgba(var(--tj-bg-primary), 0.2)',
                boxShadow: visibleSection === item.key
                  ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.72), 0 0 18px rgba(var(--tj-btn-primary-start), 0.12)'
                  : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.13)',
                clipPath: smallClip,
                cursor: item.available ? 'pointer' : 'not-allowed',
              }}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <div className="min-w-0 space-y-3">
          {visibleSection === 'identity' && (
            <CharacterWorkbenchSection title="基础身份层" eyebrow="防止模型自行补完未知身份" tone="plain">
              <div className="grid gap-2 md:grid-cols-2">
                {identityRows.map((row) => (
                  <CharacterIdentityCell key={row.label} {...row} />
                ))}
              </div>
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'health' && (
            <CharacterWorkbenchSection title="档案健康度" eyebrow="整理资料时优先补缺口" tone={identityMissing.length ? 'gate' : 'plain'}>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {healthItems.map((item) => (
                  <CharacterMetric
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    attention={(item.label === '身份完整' && identityMissing.length > 0) || (item.label === '关键词触发' && keywordBuckets.triggerTerms.length === 0)}
                  />
                ))}
              </div>
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-mono tracking-[0.2em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.86), rgba(var(--tj-btn-primary-end), 0.82))' }}>
                  关键词触发
                </div>
                <div className="grid gap-2 xl:grid-cols-3">
                  <CharacterKeywordTile label="核心触发词" keywords={keywordBuckets.triggerTerms} emptyText="未标注" attention={!keywordBuckets.triggerTerms.length} />
                  <CharacterKeywordTile label="软结构标签" keywords={keywordBuckets.softTags} emptyText="未标注" />
                  <CharacterKeywordTile label="补充关键词" keywords={keywordBuckets.supplementalTerms} emptyText="未标注" />
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-mono tracking-[0.2em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.86), rgba(var(--tj-btn-primary-end), 0.82))' }}>
                  身份缺口
                </div>
                {identityMissing.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {identityMissing.map((item) => (
                      <CharacterBadge key={item} label={item} tone="warn" />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                    基础身份层已覆盖当前 UI 检查项。
                  </div>
                )}
              </div>
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'facts' && facts && (
            <CharacterWorkbenchSection title="常驻事实" eyebrow="默认可用的角色底盘" tone="plain">
              <CharacterTextBlock body={facts.body} compact />
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'story' && story && (
            <CharacterWorkbenchSection title="角色故事" eyebrow="解释动机，不得整段复读" tone="plain">
              <div
                className="mb-3 px-3 py-3"
                style={{
                  background: 'rgba(var(--tj-bg-secondary), 0.34)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                  clipPath: smallClip,
                }}
              >
                <div className="mb-1 text-[11px] font-mono tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.92)' }}>
                  角色故事摘要 / 实际注入
                </div>
                <CharacterTextBlock body={entry.角色故事摘要 || '暂无角色故事摘要'} compact />
                <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                  下方原故事用于人工查看；主剧情注入优先使用这里的摘要，避免长篇故事层吃掉上下文。
                </div>
              </div>
              {storyGroups.length ? (
                <div className="grid gap-2 xl:grid-cols-2">
                  {storyGroups.map((group) => (
                    <CharacterSubsectionCard key={group.title} title={group.title} body={group.body} />
                  ))}
                </div>
              ) : (
                <CharacterTextBlock body={story.body} />
              )}
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'anchors' && (
            <CharacterWorkbenchSection title="表现锚点" eyebrow="保证角色写得像" tone="plain">
              <div className="grid gap-2 xl:grid-cols-2">
                {anchorRows.map((row) => (
                  <CharacterInfoTile key={row.label} label={row.label} value={row.value} danger={row.label === '禁止误写'} />
                ))}
              </div>
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'corpus' && corpus && (
            <CharacterWorkbenchSection title="语料参考" eyebrow="只学节奏，不得复读" tone="corpus">
              {corpusGroups.length ? (
                <div className="grid gap-2 xl:grid-cols-2">
                  {corpusGroups.map((group) => (
                    <CharacterSubsectionCard key={group.title} title={group.title} body={group.body} />
                  ))}
                </div>
              ) : (
                <CharacterTextBlock body={corpus.body} />
              )}
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'ability' && ability && (
            <CharacterWorkbenchSection title="能力与职责" eyebrow="能力不能覆盖主体人格" tone="plain">
              <CharacterTextBlock body={ability.body} />
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'gates' && (
            <CharacterWorkbenchSection title="门禁中心" eyebrow="门禁内容完整可见，按剧情状态注入" tone="gate">
              {gateCards.length ? (
                <div className="grid gap-2 xl:grid-cols-2">
                  {gateCards.map((card) => (
                    <CharacterGateCard key={card.title} card={card} />
                  ))}
                </div>
              ) : (
                <CharacterTextBlock body={gates?.body || '暂无门禁资料'} />
              )}
            </CharacterWorkbenchSection>
          )}

          {visibleSection === 'injection' && (
            <CharacterWorkbenchSection title="本回合注入预览" eyebrow="可见 / 可用 / 可注入分离" tone="inject">
              <div className="grid gap-2 xl:grid-cols-3">
                <CharacterInjectionTile label="会注入" value={buildInjectedPreview(anchorRows, scope)} tone="ok" />
                <CharacterInjectionTile label="仅提醒" value={gateCards.filter((card) => card.locked).map((card) => card.title).join('、') || '暂无被锁门禁'} tone="gate" />
                <CharacterInjectionTile label="不可臆造" value={identityMap.get('不可臆造') || inferForbiddenIdentityText(entry, identityMissing)} tone="warn" />
              </div>
              {injection && <div className="mt-3"><CharacterTextBlock body={injection.body} /></div>}
            </CharacterWorkbenchSection>
          )}
        </div>
      </div>
    </section>
  );
}

function CharacterInfoTile({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      className="min-w-0 px-3 py-3"
      style={{
        background: danger ? 'rgba(120, 45, 45, 0.16)' : 'rgba(var(--tj-bg-primary), 0.24)',
        boxShadow: danger ? 'inset 0 0 0 1px rgba(255, 135, 120, 0.2)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.38)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px] font-mono tracking-[0.18em]" style={{ color: danger ? 'rgba(255, 165, 150, 0.9)' : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))' }}>
        {label}
      </div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.88)' }}>
        {value}
      </div>
    </div>
  );
}

function CharacterWorkbenchSection({
  title,
  eyebrow,
  tone,
  children,
}: {
  title: string;
  eyebrow: string;
  tone: 'corpus' | 'gate' | 'plain' | 'inject';
  children: ReactNode;
}) {
  const accent =
    tone === 'gate'
      ? 'rgba(255, 178, 112, 0.9)'
      : tone === 'inject'
        ? 'rgba(150, 220, 180, 0.92)'
      : tone === 'corpus'
        ? 'rgba(var(--tj-btn-primary-start), 0.95)'
        : 'rgba(var(--tj-text-secondary), 0.82)';
  const background =
    tone === 'gate'
      ? 'linear-gradient(135deg, rgba(128, 70, 34, 0.2), rgba(var(--tj-bg-primary), 0.2))'
      : tone === 'inject'
        ? 'linear-gradient(135deg, rgba(40, 96, 72, 0.18), rgba(var(--tj-bg-primary), 0.2))'
      : tone === 'corpus'
        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.1), rgba(var(--tj-bg-primary), 0.2))'
        : 'rgba(var(--tj-bg-primary), 0.18)';

  return (
    <section
      className="px-3 py-3"
      style={{
        background,
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-serif text-[15px] font-semibold tracking-[0.16em]" style={{ color: accent }}>
          {title}
        </div>
        <div className="text-[10px] font-mono tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
          {eyebrow}
        </div>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function CharacterTextBlock({ body, compact = false }: { body: string; compact?: boolean }) {
  return (
    <div className={`whitespace-pre-wrap text-xs leading-relaxed ${compact ? 'max-h-44 overflow-y-auto pr-1' : ''}`} style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
      {body.trim() || '暂无内容'}
    </div>
  );
}

function CharacterMetric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
  return (
    <div
      className="min-w-0 px-3 py-2"
      style={{
        background: attention ? 'rgba(128, 70, 34, 0.18)' : 'rgba(var(--tj-bg-primary), 0.2)',
        boxShadow: attention ? 'inset 0 0 0 1px rgba(255, 178, 112, 0.22)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.32)',
        clipPath: smallClip,
      }}
    >
      <div className="truncate text-[10px] font-mono tracking-[0.16em]" style={{ color: attention ? 'rgba(255, 190, 120, 0.88)' : 'rgba(var(--tj-text-secondary), 0.72)' }}>
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
        {value}
      </div>
    </div>
  );
}

function CharacterKeywordTile({
  label,
  keywords,
  emptyText,
  attention = false,
}: {
  label: string;
  keywords: string[];
  emptyText: string;
  attention?: boolean;
}) {
  return (
    <div
      className="min-w-0 px-3 py-3"
      style={{
        background: attention ? 'rgba(128, 70, 34, 0.14)' : 'rgba(var(--tj-bg-primary), 0.2)',
        boxShadow: attention ? 'inset 0 0 0 1px rgba(255, 178, 112, 0.22)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.32)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] font-mono tracking-[0.16em]" style={{ color: attention ? 'rgba(255, 190, 120, 0.88)' : 'rgba(var(--tj-text-secondary), 0.72)' }}>
        {label}
      </div>
      {keywords.length ? (
        <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
          {keywords.map((keyword) => (
            <CharacterBadge key={`${label}:${keyword}`} label={keyword} tone={attention ? 'warn' : 'plain'} />
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
          {emptyText}
        </div>
      )}
    </div>
  );
}

function CharacterBadge({ label, tone = 'plain' }: { label: string; tone?: 'plain' | 'warn' | 'ok' }) {
  const color = tone === 'warn' ? 'rgba(255, 178, 112, 0.9)' : tone === 'ok' ? 'rgba(155, 225, 175, 0.92)' : 'rgba(var(--tj-btn-primary-start), 0.92)';
  return (
    <span
      className="px-2 py-0.5 text-[10px] font-mono tracking-[0.14em]"
      style={{
        color,
        background: 'rgba(var(--tj-btn-primary-start), 0.06)',
        boxShadow: `inset 0 0 0 1px ${tone === 'warn' ? 'rgba(255, 178, 112, 0.18)' : 'rgba(var(--tj-btn-primary-start), 0.14)'}`,
        clipPath: smallClip,
      }}
    >
      {label}
    </span>
  );
}

function CharacterIdentityCell({ label, value, missing, wide }: CharacterIdentityRow) {
  return (
    <div
      className={`min-w-0 px-3 py-3 ${wide ? 'md:col-span-2' : ''}`}
      style={{
        background: missing ? 'rgba(128, 70, 34, 0.13)' : 'rgba(var(--tj-bg-primary), 0.22)',
        boxShadow: missing ? 'inset 0 0 0 1px rgba(255, 178, 112, 0.2)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.34)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px] font-mono tracking-[0.18em]" style={{ color: missing ? 'rgba(255, 190, 120, 0.9)' : 'rgba(var(--tj-btn-primary-start), 0.84)' }}>
        {label}
      </div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: missing ? 'rgba(var(--tj-text-secondary), 0.72)' : 'rgba(var(--tj-text-primary), 0.88)' }}>
        {value}
      </div>
    </div>
  );
}

function CharacterSubsectionCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="min-w-0 px-3 py-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.2)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.32)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[13px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.92)' }}>
        {title}
      </div>
      <CharacterTextBlock body={body} />
    </div>
  );
}

function CharacterGateCard({ card }: { card: CharacterGateCardData }) {
  return (
    <div
      className="min-w-0 px-3 py-3"
      style={{
        background: card.locked ? 'linear-gradient(135deg, rgba(128, 70, 34, 0.18), rgba(var(--tj-bg-primary), 0.2))' : 'rgba(var(--tj-bg-primary), 0.22)',
        boxShadow: card.locked ? 'inset 0 0 0 1px rgba(255, 178, 112, 0.24)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.34)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 font-serif text-[14px] font-semibold tracking-[0.12em]" style={{ color: card.locked ? 'rgba(255, 190, 120, 0.94)' : 'rgba(var(--tj-text-primary), 0.9)' }}>
          {card.title}
        </div>
        <CharacterBadge label={card.status} tone={card.locked ? 'warn' : 'ok'} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <CharacterGateRow label="类型" value={card.type || '未标注'} />
        <CharacterGateRow label="剧透" value={card.spoiler || '未标注'} />
        <CharacterGateRow label="当前注入" value={card.injection} />
        <CharacterGateRow label="标准解锁" value={card.condition || '未标注'} />
      </div>
      {card.defaultAvailable && (
        <div className="mt-2">
          <CharacterGateRow label="默认可用" value={card.defaultAvailable} block />
        </div>
      )}
      {card.defaultHandling && (
        <div className="mt-2">
          <CharacterGateRow label="默认处理" value={card.defaultHandling} block />
        </div>
      )}
      {card.usage && (
        <div className="mt-2">
          <CharacterGateRow label="使用方式" value={card.usage} block />
        </div>
      )}
      {card.activation && (
        <div className="mt-2">
          <CharacterGateRow label="启用方式" value={card.activation} block />
        </div>
      )}
      {card.manifestation && (
        <div className="mt-2">
          <CharacterGateRow label="显现机制" value={card.manifestation} block />
        </div>
      )}
      {card.expansion && (
        <div className="mt-2">
          <CharacterGateRow label="展开条件 / 使用" value={card.expansion} block />
        </div>
      )}
      {card.triggeredInjection && (
        <div className="mt-2">
          <CharacterGateRow label="触发后注入" value={card.triggeredInjection} block />
        </div>
      )}
      {card.knowledgeBoundary && (
        <div className="mt-2">
          <CharacterGateRow label="知情边界" value={card.knowledgeBoundary} block />
        </div>
      )}
      {card.rollbackRule && (
        <div className="mt-2">
          <CharacterGateRow label="回落规则" value={card.rollbackRule} block />
        </div>
      )}
      {card.appearanceRule && (
        <div className="mt-2">
          <CharacterGateRow label="外貌规则" value={card.appearanceRule} block />
        </div>
      )}
      {card.personalityRule && (
        <div className="mt-2">
          <CharacterGateRow label="人格规则" value={card.personalityRule} block />
        </div>
      )}
      {card.inheritance && (
        <div className="mt-2">
          <CharacterGateRow label="继承规则" value={card.inheritance} block />
        </div>
      )}
      {card.memoryRule && (
        <div className="mt-2">
          <CharacterGateRow label="记忆规则" value={card.memoryRule} block />
        </div>
      )}
      {card.earlyBoundary && (
        <div className="mt-2">
          <CharacterGateRow label="提前启用边界" value={card.earlyBoundary} block />
        </div>
      )}
      <div className="mt-2">
        <CharacterGateRow label="允许预热 / 门禁" value={card.preview || card.gate || '未标注'} block />
      </div>
      <div className="mt-2">
        <CharacterGateRow label="禁止行为" value={card.forbidden || '未标注'} block danger />
      </div>
    </div>
  );
}

function CharacterGateRow({ label, value, block = false, danger = false }: { label: string; value: string; block?: boolean; danger?: boolean }) {
  return (
    <div
      className={`min-w-0 px-2.5 py-2 ${block ? '' : 'sm:min-h-[4.4rem]'}`}
      style={{
        background: danger ? 'rgba(120, 45, 45, 0.12)' : 'rgba(var(--tj-bg-secondary), 0.28)',
        boxShadow: danger ? 'inset 0 0 0 1px rgba(255, 135, 120, 0.16)' : 'inset 0 0 0 1px rgba(var(--tj-border), 0.24)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] font-mono tracking-[0.16em]" style={{ color: danger ? 'rgba(255, 165, 150, 0.86)' : 'rgba(var(--tj-text-secondary), 0.72)' }}>
        {label}
      </div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.84)' }}>
        {value}
      </div>
    </div>
  );
}

function CharacterInjectionTile({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'gate' | 'warn' }) {
  const color = tone === 'ok' ? 'rgba(155, 225, 175, 0.92)' : tone === 'gate' ? 'rgba(255, 190, 120, 0.9)' : 'rgba(255, 165, 150, 0.9)';
  return (
    <div
      className="min-w-0 px-3 py-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.22)',
        boxShadow: `inset 0 0 0 1px ${tone === 'warn' ? 'rgba(255, 135, 120, 0.18)' : 'rgba(var(--tj-border), 0.34)'}`,
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px] font-mono tracking-[0.18em]" style={{ color }}>
        {label}
      </div>
      <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.84)' }}>
        {value || '暂无'}
      </div>
    </div>
  );
}

function parseZhikuMarkdownSections(raw: string): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      current = { title: match[1].trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return sections.map((section) => ({ title: section.title, body: section.body.join('\n').trim() }));
}

type CharacterIdentityRow = {
  label: string;
  value: string;
  missing?: boolean;
  wide?: boolean;
};

type CharacterGateCardData = {
  title: string;
  status: string;
  type: string;
  spoiler: string;
  injection: string;
  condition: string;
  defaultAvailable: string;
  defaultHandling: string;
  usage: string;
  activation: string;
  manifestation: string;
  expansion: string;
  triggeredInjection: string;
  knowledgeBoundary: string;
  rollbackRule: string;
  appearanceRule: string;
  personalityRule: string;
  inheritance: string;
  memoryRule: string;
  earlyBoundary: string;
  preview: string;
  gate: string;
  forbidden: string;
  locked: boolean;
};

type CharacterProfileSectionKey = 'identity' | 'health' | 'facts' | 'story' | 'anchors' | 'corpus' | 'ability' | 'gates' | 'injection';

function parseCharacterIdentityFields(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = raw.split(/\r?\n/);
  const identityLines: string[] = [];
  let inIdentitySection = false;
  for (const line of lines) {
    const title = line.match(/^##\s+(.+?)\s*$/);
    if (title) {
      inIdentitySection = /基础识别|基础身份|身份层/.test(title[1]);
      continue;
    }
    if (inIdentitySection) identityLines.push(line);
  }
  const sourceLines = identityLines.length ? identityLines : lines;
  for (const line of sourceLines) {
    const trimmed = line.trim().replace(/^[-*]\s*/, '');
    const match = trimmed.match(/^([^:：]+)[:：]\s*(.+)$/u);
    if (!match) continue;
    const key = normalizeCharacterIdentityKey(match[1]);
    const value = match[2].trim();
    if (key && value) map.set(key, value);
  }
  return map;
}

function findCharacterGateSection(sections: Array<{ title: string; body: string }>): { title: string; body: string } | undefined {
  return (
    sections.find((section) => /形态|人格|阶段|门禁|真相/.test(section.title)) ??
    sections.find((section) =>
      /边界|写法/.test(section.title) &&
      /门禁|阶段边界|展开条件|默认处理|知情边界|回落规则|解锁|阶段锁定/.test(section.body),
    )
  );
}

function normalizeCharacterIdentityKey(raw: string): string {
  const key = raw.trim();
  if (/角色ID|ID/i.test(key)) return '角色ID';
  if (/名称|标准名称|显示名称/.test(key)) return '名称';
  if (/别名|称呼/.test(key)) return '别名';
  if (/性别/.test(key)) return '性别';
  if (/年龄/.test(key)) return '年龄状态';
  if (/出身|出生|故乡|来源地|原籍/.test(key)) return '出身';
  if (/^(外貌|外观|外貌描述|外观描述)$/.test(key)) return '外貌';
  if (/^(形态|形态列表|可用形态)$/.test(key)) return '形态';
  if (/种族|身体|存在形态|存在/.test(key)) return '存在形态';
  if (/所属|组织|阵营/.test(key)) return '所属';
  if (/职务|身份/.test(key)) return '身份';
  if (/信息域|已知|未知|知道|不知道/.test(key)) return '当前信息域';
  if (/使用范围|可用范围|范围/.test(key)) return '使用范围';
  if (/不可臆造|不得编造|禁止臆造/.test(key)) return '不可臆造';
  if (/触发词|关键词/.test(key)) return '触发词';
  return key;
}

function buildCharacterIdentityRows(
  entry: 智库条目,
  meta: ReturnType<typeof 解析智库软结构标签>,
  identityMap: Map<string, string>,
): CharacterIdentityRow[] {
  const get = (key: string, fallback = '') => identityMap.get(key) || fallback;
  const roleName = meta.角色名 || entry.关联角色ID || 获取智库人物名(entry);
  const appearance = get('外貌', get('存在形态', entry.外貌锚点 ?? inferExistenceForm(entry)));
  return [
    { label: '角色ID', value: get('角色ID', getRoleIdFromKeywords(entry) || '未标注'), missing: !get('角色ID') && !getRoleIdFromKeywords(entry) },
    { label: '名称', value: get('名称', roleName || entry.标题), missing: !get('名称') && !roleName },
    { label: '别名 / 称呼', value: get('别名', inferAliases(entry) || '未标注'), missing: !get('别名') && !inferAliases(entry) },
    { label: '性别 / 性别表达', value: get('性别', inferGender(entry) || '未标注'), missing: !get('性别') && !inferGender(entry) },
    { label: '年龄状态', value: get('年龄状态', inferAgeState(entry) || '未标注'), missing: !get('年龄状态') && !inferAgeState(entry) },
    { label: '外貌', value: appearance || '未标注', missing: !appearance, wide: true },
    { label: '形态', value: get('形态', meta.形态 || '未标注'), missing: !get('形态') && !meta.形态 },
    { label: '所属 / 组织', value: get('所属', inferOrganization(entry) || '未标注'), missing: !get('所属') && !inferOrganization(entry) },
    { label: '出身', value: get('出身', '未标注'), missing: !get('出身') },
    { label: '身份 / 职务', value: get('身份', inferCharacterRole(entry) || '未标注'), missing: !get('身份') && !inferCharacterRole(entry) },
    { label: '当前信息域', value: get('当前信息域', '按当前剧情阶段与玩家已知事实执行'), missing: false },
  ];
}

function buildCharacterAnchorRows(entry: 智库条目): Array<{ label: string; value: string }> {
  return [
    { label: '外貌', value: entry.外貌锚点 ?? '' },
    { label: '性格', value: entry.性格锚点 ?? '' },
    { label: '说话方式', value: entry.说话方式 ?? '' },
    { label: '行为习惯', value: entry.行为习惯 ?? '' },
    { label: '关系边界', value: entry.关系边界 ?? '' },
    { label: '禁止误写', value: entry.禁止误写 ?? '' },
  ].filter((row) => row.value.trim());
}

function buildCharacterKeywordBuckets(entry: 智库条目, identityMap: Map<string, string>): { triggerTerms: string[]; softTags: string[]; supplementalTerms: string[]; total: number } {
  const keywords = dedupeTextList(entry.关键词);
  const identityTriggers = dedupeTextList([
    ...获取智库核心触发词(entry),
    ...splitKeywordText(identityMap.get('触发词') ?? ''),
  ]);
  const softTags = keywords.filter((keyword) => Boolean(parseCharacterTag(keyword)));
  const supplementalTerms = keywords.filter((keyword) => !parseCharacterTag(keyword) && !identityTriggers.includes(keyword));
  const triggerTerms = identityTriggers;
  return {
    triggerTerms,
    softTags,
    supplementalTerms,
    total: keywords.length,
  };
}

function splitKeywordText(text: string): string[] {
  return text
    .split(/[,，、;；\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeTextList(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function parseMarkdownSubsections(raw: string): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^###\s+(.+?)\s*$/);
    if (match) {
      current = { title: match[1].trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return sections.map((section) => ({ title: section.title, body: section.body.join('\n').trim() })).filter((section) => section.body);
}

function parseCharacterGateCards(raw: string): CharacterGateCardData[] {
  const cards = parseMarkdownSubsections(raw);
  return cards.map((section) => {
    const fields = parseCharacterIdentityFields(section.body);
    const statusFromTitle = section.title.match(/^(未解锁|已解锁|默认可用|可预热|只读|手动启用|剧情显式触发|边界提醒)[:：]\s*(.+)$/u);
    const status = fields.get('解锁状态') || statusFromTitle?.[1] || inferGateStatus(section.title, section.body);
    const title = statusFromTitle?.[2]?.trim() || section.title;
    const type = fields.get('关系类型') || fields.get('类型') || inferGateType(title, section.body);
    const spoiler = fields.get('剧透等级') || inferSpoilerLevel(section.body);
    const condition = fields.get('标准解锁') || fields.get('标准解锁条件') || fields.get('解锁条件') || fields.get('首次可用剧情段') || '';
    const defaultAvailable = fields.get('默认可用') || '';
    const defaultHandling = fields.get('默认处理') || '';
    const usage = fields.get('使用方式') || '';
    const activation = fields.get('启用方式') || fields.get('触发方式') || '';
    const manifestation = fields.get('显现机制') || fields.get('显现方式') || '';
    const expansion = fields.get('展开条件') || fields.get('展开后使用') || '';
    const triggeredInjection = fields.get('触发后注入') || fields.get('启用后注入') || '';
    const knowledgeBoundary = fields.get('知情边界') || '';
    const rollbackRule = fields.get('回落规则') || '';
    const appearanceRule = fields.get('外貌规则') || '';
    const personalityRule = fields.get('人格规则') || '';
    const inheritance = fields.get('继承规则') || '';
    const memoryRule = fields.get('记忆规则') || fields.get('记忆连续性') || '';
    const earlyBoundary = fields.get('提前启用边界') || fields.get('提前触发边界') || '';
    const gate = fields.get('门禁') || extractLineValue(section.body, '门禁') || '';
    const preview = extractLineValue(section.body, '允许预热') || '';
    const forbidden = fields.get('禁止') || extractLineValue(section.body, '禁止') || '';
    const locked = /未解锁|只读|边界提醒|门禁|重大/.test([status, spoiler, section.body].join(' '));
    const injection = fields.get('当前注入') || fields.get('注入方式') || (locked ? '仅注入边界提醒，不注入完整内容' : '允许按当前剧情完整注入');
    return {
      title,
      status,
      type,
      spoiler,
      condition,
      defaultAvailable,
      defaultHandling,
      usage,
      activation,
      manifestation,
      expansion,
      triggeredInjection,
      knowledgeBoundary,
      rollbackRule,
      appearanceRule,
      personalityRule,
      inheritance,
      memoryRule,
      earlyBoundary,
      preview,
      gate,
      forbidden,
      locked,
      injection,
    };
  });
}

function extractLineValue(raw: string, label: string): string {
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^[-*]\s*/, '');
    const match = trimmed.match(/^([^:：]+)[:：]\s*(.+)$/u);
    if (match && match[1].includes(label)) return match[2].trim();
  }
  return '';
}

function getRoleIdFromKeywords(entry: 智库条目): string {
  const roleId = entry.关键词
    .map(parseCharacterTag)
    .find((tag) => tag?.key === '角色ID')?.value;
  return roleId ?? '';
}

function inferAliases(entry: 智库条目): string {
  const roleName = entry.关联角色ID || 获取智库人物名(entry);
  const keywords = entry.关键词.filter((keyword) => !parseCharacterTag(keyword));
  return keywords.filter((keyword) => keyword !== roleName && keyword.length <= 18).slice(0, 6).join('、');
}

function inferGender(entry: 智库条目): string {
  const text = [entry.标题, entry.摘要, entry.原文, entry.外貌锚点, entry.性格锚点].join('\n');
  if (/少女|女性|女孩|女/.test(text)) return '女性';
  if (/少年|男性|男孩|男/.test(text)) return '男性';
  return '';
}

function inferAgeState(entry: 智库条目): string {
  const text = [entry.摘要, entry.原文, entry.外貌锚点, entry.禁止误写].join('\n');
  if (/年龄未知|实际年龄未知|真实年龄/.test(text)) return '实际年龄未知';
  if (/少女|少年/.test(text)) return '外貌 / 表现为少年少女阶段，实际年龄需按资料注明';
  return '';
}

function inferExistenceForm(entry: 智库条目): string {
  const text = [entry.摘要, entry.原文, entry.外貌锚点].join('\n');
  if (/人类外观/.test(text)) return '人类外观';
  if (/机械|机器人|人偶/.test(text)) return '机械 / 人偶相关存在形态';
  if (/忆者|忆灵|记忆/.test(text)) return '记忆 / 忆质相关存在形态';
  return '';
}

function inferOrganization(entry: 智库条目): string {
  const tag = entry.关键词
    .map(parseCharacterTag)
    .find((item) => item && ['所属', '组织', '阵营', '归属'].includes(item.key));
  if (tag?.value) return tag.value;
  const group = resolveCharacterGroup(entry);
  return group.label === '未分组 / 待整理' ? '' : group.label;
}

function inferCharacterRole(entry: 智库条目): string {
  const text = [entry.标题, entry.摘要, entry.原文, ...entry.关键词].join('\n');
  if (/星穹列车|无名客/.test(text)) return '星穹列车乘员 / 无名客';
  if (/开拓者|星核载体/.test(text)) return '开拓者 / 星核载体';
  return '';
}

function inferForbiddenIdentityText(entry: 智库条目, missing: string[]): string {
  const explicit = entry.禁止误写?.trim();
  const base = explicit || '不得编造未公开身份、真实年龄、过去真相或未解锁形态。';
  return missing.length ? `${base} 当前身份缺口：${missing.join('、')}。` : base;
}

function inferGateStatus(title: string, body: string): string {
  const text = `${title}\n${body}`;
  if (/未解锁/.test(text)) return '未解锁';
  if (/已解锁/.test(text)) return '已解锁';
  if (/默认可用/.test(text)) return '默认可用';
  if (/剧情显式触发/.test(text)) return '剧情显式触发';
  if (/可预热/.test(text)) return '可预热';
  if (/边界提醒/.test(text)) return '边界提醒';
  if (/只读/.test(text)) return '只读';
  return '未标注';
}

function inferGateType(title: string, body: string): string {
  const text = `${title}\n${body}`;
  if (/第二人格|关联人格/.test(text)) return '关联人格 / 第二人格';
  if (/形态|巡猎|饮月|命途/.test(text)) return '普通形态 / 命途阶段';
  if (/真相|身世|过去/.test(text)) return '剧情 / 真相门禁';
  return '门禁资料';
}

function inferSpoilerLevel(body: string): string {
  if (/重大/.test(body)) return '重大';
  if (/中等/.test(body)) return '中等';
  if (/轻微/.test(body)) return '轻微';
  if (/无/.test(body)) return '无';
  return '';
}

function buildInjectedPreview(anchorRows: Array<{ label: string; value: string }>, scope: string[]): string {
  const anchors = anchorRows.map((row) => row.label).join('、') || '暂无表现锚点';
  const scopeText = scope.length ? `范围：${scope.slice(0, 4).join(' / ')}` : '范围未标注';
  return `${anchors}。${scopeText}`;
}

function StructuredCharacterFields({
  entry,
  editable,
  onUpdate,
}: {
  entry: 智库条目;
  editable: boolean;
  onUpdate: (patch: Partial<智库条目>) => void;
}) {
  const displayedUnlock = entry.运行时解锁状态 ?? entry.解锁状态;
  const updateUnlock = (status: string) => {
    onUpdate(entry.builtin ? { 运行时解锁状态: status } : { 解锁状态: status });
  };
  const updateScope = (scope: string, checked: boolean) => {
    const current = entry.使用范围 ?? [];
    const next = checked
      ? Array.from(new Set([...current, scope]))
      : current.filter((item) => item !== scope);
    onUpdate({ 使用范围: next });
  };

  return (
    <section
      className="mt-3 px-3 py-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.22)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[13px] tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        结构字段
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="资料类型">
          <input value={entry.资料类型 ?? ''} onChange={(e) => onUpdate({ 资料类型: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="关联角色">
          <input value={entry.关联角色ID ?? ''} onChange={(e) => onUpdate({ 关联角色ID: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="关联形态">
          <input value={entry.关联形态ID ?? ''} onChange={(e) => onUpdate({ 关联形态ID: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="解锁状态">
          <select value={displayedUnlock ?? ''} onChange={(e) => updateUnlock(e.target.value)} disabled={!editable && !entry.builtin} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
            <option value="">未标注</option>
            <option value="默认可用">默认可用</option>
            <option value="可预热">可预热</option>
            <option value="未解锁">未解锁</option>
            <option value="已解锁">已解锁</option>
            <option value="手动启用">手动启用</option>
            <option value="只读">只读</option>
          </select>
        </Field>
        <Field label="剧透等级">
          <select value={entry.剧透等级 ?? ''} onChange={(e) => onUpdate({ 剧透等级: e.target.value })} disabled={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
            <option value="">未标注</option>
            <option value="无">无</option>
            <option value="轻微">轻微</option>
            <option value="中等">中等</option>
            <option value="重大">重大</option>
          </select>
        </Field>
        <Field label="首次可用剧情段">
          <input value={entry.首次可用剧情段 ?? ''} onChange={(e) => onUpdate({ 首次可用剧情段: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="关联剧情分段ID">
          <input value={entry.关联剧情分段ID ?? ''} onChange={(e) => onUpdate({ 关联剧情分段ID: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
        <Field label="解锁条件">
          <input value={entry.解锁条件 ?? ''} onChange={(e) => onUpdate({ 解锁条件: e.target.value })} readOnly={!editable} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-xs font-mono tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.95)' }}>
          使用范围
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {zhikuScopeOptions.map((scope) => (
            <label key={scope} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2" style={{ background: 'rgba(var(--tj-bubble),0.48)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)', clipPath: smallClip }}>
              <span className="truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>{scope}</span>
              <input type="checkbox" checked={(entry.使用范围 ?? []).includes(scope)} onChange={(e) => updateScope(scope, e.target.checked)} disabled={!editable} className="accent-[rgb(var(--tj-accent-primary))]" />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-xs font-mono tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.95)' }}>
          手动门禁
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {['未解锁', '可预热', '已解锁', '手动启用', '默认可用', '只读'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => updateUnlock(status)}
              disabled={!editable && !entry.builtin}
              className="px-3 py-2 text-xs font-mono tracking-[0.18em] transition-all disabled:opacity-45"
              style={{
                color: displayedUnlock === status ? 'rgb(var(--tj-on-accent))' : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))',
                background: displayedUnlock === status ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))' : 'rgba(var(--tj-btn-primary-start), 0.05)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                clipPath: smallClip,
              }}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
          自制条目会修改资料字段；内置条目只写入当前本地智库的运行时解锁覆盖，不改内置原文。
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <StructuredFlag label="主剧情注入" checked={entry.可否主剧情注入} editable={editable} onChange={(checked) => onUpdate({ 可否主剧情注入: checked })} />
        <StructuredFlag label="手机使用" checked={entry.可否手机使用} editable={editable} onChange={(checked) => onUpdate({ 可否手机使用: checked })} />
        <StructuredFlag label="新闻使用" checked={entry.可否新闻使用} editable={editable} onChange={(checked) => onUpdate({ 可否新闻使用: checked })} />
        <StructuredFlag label="变量参考" checked={entry.可否变量参考} editable={editable} onChange={(checked) => onUpdate({ 可否变量参考: checked })} />
      </div>

      <div className="mt-4">
        <PerformanceTextarea label="角色故事摘要" value={entry.角色故事摘要 ?? ''} editable={editable} onChange={(value) => onUpdate({ 角色故事摘要: value })} />
        <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
          仅替代角色故事层 / 历史故事层注入；语料层、表现锚点层和常驻事实层仍按原文正常读取。
        </div>
      </div>


      <div className="mt-4">
        <div className="mb-1.5 text-xs font-mono tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.95)' }}>
          人物表现结构
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <PerformanceTextarea label="外貌锚点" value={entry.外貌锚点 ?? ''} editable={editable} onChange={(value) => onUpdate({ 外貌锚点: value })} />
          <PerformanceTextarea label="性格锚点" value={entry.性格锚点 ?? ''} editable={editable} onChange={(value) => onUpdate({ 性格锚点: value })} />
          <PerformanceTextarea label="说话方式" value={entry.说话方式 ?? ''} editable={editable} onChange={(value) => onUpdate({ 说话方式: value })} />
          <PerformanceTextarea label="行为习惯" value={entry.行为习惯 ?? ''} editable={editable} onChange={(value) => onUpdate({ 行为习惯: value })} />
          <PerformanceTextarea label="关系边界" value={entry.关系边界 ?? ''} editable={editable} onChange={(value) => onUpdate({ 关系边界: value })} />
          <PerformanceTextarea label="禁止误写" value={entry.禁止误写 ?? ''} editable={editable} onChange={(value) => onUpdate({ 禁止误写: value })} />
        </div>
      </div>
    </section>
  );
}

function PerformanceTextarea({ label, value, editable, onChange }: { label: string; value: string; editable: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-mono tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
        {label}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!editable}
        rows={3}
        className="kaituo-input w-full resize-y px-3 py-2 text-xs leading-relaxed"
        style={{ clipPath: smallClip }}
      />
    </label>
  );
}

function StructuredFlag({ label, checked, editable, onChange }: { label: string; checked?: boolean; editable: boolean; onChange: (checked: boolean | undefined) => void }) {
  return (
    <label className="flex min-w-0 items-center justify-between gap-2 px-3 py-2" style={{ background: 'rgba(var(--tj-bubble),0.48)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)', clipPath: smallClip }}>
      <span className="truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>{label}</span>
      <select
        value={typeof checked === 'boolean' ? String(checked) : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}
        disabled={!editable}
        className="kaituo-input max-w-[7rem] px-2 py-1 text-xs"
        style={{ clipPath: smallClip }}
      >
        <option value="">继承范围</option>
        <option value="true">允许</option>
        <option value="false">禁止</option>
      </select>
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-3 block">
      <div className="mb-1.5 text-xs font-mono tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.95)' }}>
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
        background: 'linear-gradient(135deg, rgba(var(--tj-bubble),0.86), rgba(var(--tj-surface-strong),0.62))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.66)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] font-mono tracking-[0.22em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.92)' }}>
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
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
        color: active ? 'rgb(var(--tj-bg-primary))' : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))',
        background: active ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-amber-deep), 0.95))' : 'rgba(var(--tj-btn-primary-start), 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.22)',
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
        color: 'rgba(var(--tj-text-secondary), 0.68)',
        background: 'rgba(var(--tj-bg-secondary), 0.35)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
        clipPath: smallClip,
      }}
    >
      {text}
    </div>
  );
}

