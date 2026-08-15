import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { VariableSetters } from '@/utils/variableExecutor';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 归一化NPC记录列表 } from '@/models/npc';
import {
  SYSTEMS,
  buildQuickStats,
  countValue,
  deepClone,
  isRecord,
  isUnknownArray,
  mergeHiddenFields,
  omitHiddenFields,
  summarizeArrayItemLabel,
  toJson,
} from '@/utils/variableManagerLogic';
import type { EditMode, SystemKey } from '@/utils/variableManagerLogic';
import { cardClip, smallClip } from './settingsShared';
import { ArrayItemList } from './variableManagerList';
import { SystemBanner, EditorToolbar } from './variableManagerToolbar';
import { SystemSidebar } from './variableManagerSidebar';
import { TreeNode } from './variableManagerTree';

interface Props {
  旅人: unknown;
  世界: unknown;
  记忆: unknown;
  忆庭: unknown;
  智库: unknown;
  手机: unknown;
  NPC: unknown[];
  新闻: unknown[];
  剧情编织: unknown;
  setters: VariableSetters;
  set剧情编织: Dispatch<SetStateAction<剧情编织系统>>;
  editingLocked?: boolean;
}

function getSystemValue(props: Props, key: SystemKey): unknown {
  switch (key) {
    case 'traveler': return props.旅人;
    case 'world': return props.世界;
    case 'memory': return props.记忆;
    case 'yiting': return props.忆庭;
    case 'phone': return props.手机;
    case 'npc': return props.NPC;
    case 'news': return props.新闻;
    case 'zhiku': return props.智库;
    case 'storyWeaving': return props.剧情编织;
  }
}

function setSystemValue(props: Props, key: SystemKey, value: unknown): void {
  switch (key) {
    case 'traveler': props.setters.set旅人(value as never); break;
    case 'world': props.setters.set世界(value as never); break;
    case 'memory': props.setters.set记忆(value as never); break;
    case 'yiting': props.setters.set忆庭(value as never); break;
    case 'phone': props.setters.set手机(value as never); break;
    case 'npc': props.setters.setNPC(归一化NPC记录列表(value)); break;
    case 'news': props.setters.set新闻(value as never); break;
    case 'zhiku': props.setters.set智库(value as never); break;
    case 'storyWeaving': props.set剧情编织(value as SetStateAction<剧情编织系统>); break;
  }
}

export function VariableManagerTab(props: Props) {
  const [activeKey, setActiveKey] = useState<SystemKey>('traveler');
  const [mode, setMode] = useState<EditMode>('fields');
  const [draft, setDraft] = useState<unknown>(null);
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  // 数组型系统（伙伴/周报）的二级导航状态。
  const [activeArrayIndex, setActiveArrayIndex] = useState(0);
  const [arraySearch, setArraySearch] = useState('');

  const activeSystem = useMemo(() => SYSTEMS.find((item) => item.key === activeKey) ?? SYSTEMS[0], [activeKey]);
  const originalValue = getSystemValue(props, activeKey);
  const visibleValue = useMemo(
    () => omitHiddenFields(originalValue, activeSystem.hiddenFields),
    [activeSystem.hiddenFields, originalValue],
  );

  const [prevSyncValue, setPrevSyncValue] = useState(visibleValue);
  if (prevSyncValue !== visibleValue) {
    setPrevSyncValue(visibleValue);
    let nextDraft = deepClone(visibleValue);
    // 确保「当前天气」紧跟「当前地点」
    if (activeSystem.key === 'world' && isRecord(nextDraft)) {
      const rec = nextDraft;
      const weather = '当前天气' in rec ? rec['当前天气'] : '';
      const ordered: Record<string, unknown> = {};
      for (const key of Object.keys(rec)) {
        if (key === '当前天气') continue; // 跳过，后面手动插入
        ordered[key] = rec[key];
        if (key === '当前地点') {
          ordered['当前天气'] = weather;
        }
      }
      nextDraft = ordered;
    }
    setDraft(nextDraft);
    setJsonDraft((current) => current === null ? null : toJson(nextDraft));
    setError(null);
    setSavedFlash(false);
  }

  const updateDraft = (next: unknown) => {
    if (props.editingLocked) return;
    setDraft(next);
    setError(null);
  };

  const saveDraft = () => {
    if (props.editingLocked) return;
    try {
      const parsed = mode === 'json' ? JSON.parse(jsonDraft ?? '') as unknown : draft;
      const next = mergeHiddenFields(activeSystem, originalValue, parsed);
      setSystemValue(props, activeKey, next);
      setDraft(deepClone(parsed));
      setJsonDraft(mode === 'json' ? toJson(parsed) : null);
      setError(null);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON 解析失败');
    }
  };

  const resetDraft = () => {
    if (props.editingLocked) return;
    const next = deepClone(visibleValue);
    setDraft(next);
    setJsonDraft(mode === 'json' ? toJson(next) : null);
    setError(null);
  };

  const switchMode = (nextMode: EditMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'json') {
      setJsonDraft(toJson(draft));
    } else {
      setJsonDraft(null);
    }
    setMode(nextMode);
    setError(null);
  };

  const stats = buildQuickStats(activeSystem, originalValue);
  const isArraySystem = activeSystem.key === 'npc' || activeSystem.key === 'news';
  // 数组型系统的当前草稿数组（用于二级导航）。
  const arrayDraft = isArraySystem && Array.isArray(draft) ? draft as unknown[] : [];

  const updateArrayItem = (index: number, next: unknown) => {
    if (!isUnknownArray(draft)) return;
    const arr = [...draft];
    arr[index] = next;
    updateDraft(arr);
  };

  // 切换系统时重置数组导航状态。
  const [prevActiveKey, setPrevActiveKey] = useState(activeKey);
  if (prevActiveKey !== activeKey) {
    setPrevActiveKey(activeKey);
    setActiveArrayIndex(0);
    setArraySearch('');
  }

  const bannerTitle = isArraySystem && arrayDraft[activeArrayIndex]
    ? `${activeSystem.label} · ${summarizeArrayItemLabel(arrayDraft[activeArrayIndex])}`
    : activeSystem.label;
  const bannerSubtitle = `${activeSystem.desc}${isArraySystem ? ` · 共 ${arrayDraft.length} 条，当前第 ${Math.min(activeArrayIndex + 1, arrayDraft.length)} 条` : ''}${activeSystem.hiddenFields?.length ? ` · 已隐藏旧字段：${activeSystem.hiddenFields.join(' / ')}` : ''}`;

  return (
    <div className={isArraySystem
      ? 'grid min-w-0 gap-4 md:grid-cols-[210px_240px_minmax(0,1fr)]'
      : 'grid min-w-0 gap-4 md:grid-cols-[210px_minmax(0,1fr)]'}>
      <SystemSidebar
        entries={SYSTEMS.map((system) => ({
          key: system.key,
          label: system.label,
          desc: system.desc,
          accent: system.accent,
          count: countValue(getSystemValue(props, system.key)),
        }))}
        activeKey={activeKey}
        onSelect={setActiveKey}
      />

      {isArraySystem && (
        <ArrayItemList
          items={arrayDraft}
          search={arraySearch}
          onSearch={setArraySearch}
          activeIndex={activeArrayIndex}
          onSelect={setActiveArrayIndex}
          accent={activeSystem.accent}
        />
      )}

      <section className="min-w-0 space-y-4">
        <SystemBanner system={activeSystem} title={bannerTitle} subtitle={bannerSubtitle} />

        <EditorToolbar
          mode={mode}
          onModeChange={switchMode}
          stats={stats}
          onReset={resetDraft}
          onSave={saveDraft}
          savedFlash={savedFlash}
          error={error}
          locked={props.editingLocked ?? false}
        />

        <fieldset
          disabled={props.editingLocked}
          className="min-w-0 border-0 p-0"
        >
        <div
          className="p-4"
          style={{
            background: 'rgba(var(--tj-bg-secondary),0.45)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
            clipPath: cardClip,
          }}
        >
          {mode === 'fields' ? (
            <div className="max-h-[56dvh] overflow-y-auto md:max-h-[64vh]">
              {isArraySystem ? (
                arrayDraft[activeArrayIndex] !== undefined ? (
                  <TreeNode
                    label={`[${activeArrayIndex}] ${summarizeArrayItemLabel(arrayDraft[activeArrayIndex])}`}
                    value={arrayDraft[activeArrayIndex]}
                    depth={0}
                    onChange={(next) => updateArrayItem(activeArrayIndex, next)}
                  />
                ) : (
                  <div className="py-8 text-center text-sm" style={{ color: 'rgba(var(--tj-text-secondary),0.6)' }}>
                    暂无条目
                  </div>
                )
              ) : (
                <TreeNode label={activeSystem.rootLabel} value={draft} depth={0} onChange={updateDraft} />
              )}
            </div>
          ) : (
            <textarea
              value={jsonDraft ?? ''}
              onChange={(e) => {
                setJsonDraft(e.target.value);
                setError(null);
              }}
              rows={24}
              className="kaituo-input w-full resize-none px-3 py-2 font-mono text-[13px]"
              style={{ clipPath: smallClip, lineHeight: 1.5 }}
              spellCheck={false}
            />
          )}
        </div>
        </fieldset>
      </section>
    </div>
  );
}
