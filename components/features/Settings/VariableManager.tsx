import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { VariableSetters } from '@/utils/variableExecutor';
import type { 剧情编织系统 } from '@/models/storyWeaving';

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
}

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

type SystemKey = 'traveler' | 'world' | 'memory' | 'yiting' | 'phone' | 'npc' | 'news' | 'zhiku' | 'storyWeaving';
type EditMode = 'fields' | 'json';
type WritePolicy = 'writable' | 'manual' | 'readonly';

interface SystemMeta {
  key: SystemKey;
  label: string;
  rootLabel: string;
  desc: string;
  policy: WritePolicy;
  accent: string;
  hiddenFields?: string[];
}

const SYSTEMS: SystemMeta[] = [
  {
    key: 'traveler',
    label: '旅人',
    rootLabel: '旅人',
    desc: '档案、命途、战技、背包、装备',
    policy: 'writable',
    accent: 'rgb(var(--tj-accent-primary))',
    hiddenFields: ['属性', '主命途'],
  },
  { key: 'world', label: '世界', rootLabel: '世界', desc: '时间、地点、天数、全局事件', policy: 'writable', accent: '#9fd6ff' },
  { key: 'memory', label: '记忆', rootLabel: '记忆', desc: '即时、短期、长期记忆', policy: 'manual', accent: '#b7e2b4' },
  { key: 'yiting', label: '忆庭', rootLabel: '忆庭', desc: '回忆档案与召回索引', policy: 'manual', accent: '#d4c5ff' },
  { key: 'phone', label: '手机', rootLabel: '手机', desc: '联系人、会话、来信种子', policy: 'writable', accent: '#86e6dd' },
  { key: 'npc', label: '伙伴', rootLabel: 'NPC', desc: '伙伴、路人、同行记忆', policy: 'writable', accent: '#ffc2d6' },
  { key: 'news', label: '周报', rootLabel: '新闻', desc: '新闻条目与事件档案', policy: 'manual', accent: '#ffdf8a' },
  { key: 'zhiku', label: '智库', rootLabel: '智库', desc: '原著资料与内置内容', policy: 'manual', accent: '#a5c8ff' },
  { key: 'storyWeaving', label: '剧情编织', rootLabel: '剧情编织', desc: '原著/自制剧情分解与注入', policy: 'manual', accent: '#f0b7ff' },
];

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function omitHiddenFields(value: unknown, fields?: string[]): unknown {
  if (!fields?.length || !isRecord(value)) return value;
  const next = { ...value };
  for (const field of fields) delete next[field];
  return next;
}

function mergeHiddenFields(system: SystemMeta, original: unknown, draft: unknown): unknown {
  if (!system.hiddenFields?.length || !isRecord(original) || !isRecord(draft)) return draft;
  const next = { ...draft };
  for (const field of system.hiddenFields) {
    if (field in original) next[field] = original[field];
  }
  return next;
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    const text = value.replace(/\s+/g, ' ').trim();
    if (!text) return '""';
    return text.length > 46 ? `"${text.slice(0, 46)}..."` : `"${text}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `数组 ${value.length}`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return `字段 ${keys.length}`;
  }
  return String(value);
}

function countValue(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return value === undefined || value === null ? 0 : 1;
}

function inferDefaultValueFromSibling(items: unknown[]): unknown {
  const last = items[items.length - 1];
  if (last === undefined || last === null) return '';
  if (typeof last === 'string') return '';
  if (typeof last === 'number') return 0;
  if (typeof last === 'boolean') return false;
  if (Array.isArray(last)) return [];
  if (isRecord(last)) {
    const skeleton: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(last)) {
      if (typeof value === 'string') skeleton[key] = '';
      else if (typeof value === 'number') skeleton[key] = 0;
      else if (typeof value === 'boolean') skeleton[key] = false;
      else if (Array.isArray(value)) skeleton[key] = [];
      else if (isRecord(value)) skeleton[key] = {};
      else skeleton[key] = null;
    }
    return skeleton;
  }
  return '';
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
    case 'npc': props.setters.setNPC(value as never); break;
    case 'news': props.setters.set新闻(value as never); break;
    case 'zhiku': props.setters.set智库(value as never); break;
    case 'storyWeaving': props.set剧情编织(value as SetStateAction<剧情编织系统>); break;
  }
}

function policyLabel(policy: WritePolicy): string {
  if (policy === 'writable') return '变量模型可写';
  if (policy === 'manual') return '手动维护';
  return '只读';
}

function buildQuickStats(system: SystemMeta, value: unknown): string[] {
  if (system.key === 'traveler' && isRecord(value)) {
    return [
      `背包 ${Array.isArray(value.背包) ? value.背包.length : 0}`,
      `战技 ${Array.isArray(value.战技列表) ? value.战技列表.length : 0}`,
      `命途 ${Array.isArray(value.命途列表) ? value.命途列表.length : 0}`,
    ];
  }
  if (system.key === 'world' && isRecord(value)) {
    return [
      String(value.当前日期 ?? '日期未定'),
      String(value.当前时间 ?? '时间未定'),
      String(value.当前地点 ?? '地点未定'),
    ];
  }
  if (system.key === 'phone' && isRecord(value)) {
    return [
      `联系人 ${Array.isArray(value.contacts) ? value.contacts.length : 0}`,
      `会话 ${Array.isArray(value.chats) ? value.chats.length : 0}`,
      `来信 ${Array.isArray(value.messageSeeds) ? value.messageSeeds.length : 0}`,
    ];
  }
  if (system.key === 'storyWeaving' && isRecord(value)) {
    const list = Array.isArray(value.系列列表) ? value.系列列表 : [];
    return [`系列 ${list.length}`, value.当前系列ID ? `当前 ${String(value.当前系列ID)}` : '未选择当前系列'];
  }
  if (Array.isArray(value)) return [`条目 ${value.length}`];
  if (isRecord(value)) return [`字段 ${Object.keys(value).length}`];
  return [summarizeValue(value)];
}

export function VariableManagerTab(props: Props) {
  const [activeKey, setActiveKey] = useState<SystemKey>('traveler');
  const [mode, setMode] = useState<EditMode>('fields');
  const [draft, setDraft] = useState<unknown>(null);
  const [jsonDraft, setJsonDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const activeSystem = useMemo(() => SYSTEMS.find((item) => item.key === activeKey) ?? SYSTEMS[0], [activeKey]);
  const originalValue = getSystemValue(props, activeKey);
  const visibleValue = useMemo(
    () => omitHiddenFields(originalValue, activeSystem.hiddenFields),
    [activeSystem.hiddenFields, originalValue],
  );

  useEffect(() => {
    const nextDraft = deepClone(visibleValue);
    setDraft(nextDraft);
    setJsonDraft(toJson(nextDraft));
    setError(null);
    setSavedFlash(false);
  }, [activeKey, visibleValue]);

  const updateDraft = (next: unknown) => {
    setDraft(next);
    setJsonDraft(toJson(next));
    setError(null);
  };

  const saveDraft = () => {
    try {
      const parsed = mode === 'json' ? JSON.parse(jsonDraft) : draft;
      const next = mergeHiddenFields(activeSystem, originalValue, parsed);
      setSystemValue(props, activeKey, next);
      setDraft(deepClone(parsed));
      setJsonDraft(toJson(parsed));
      setError(null);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON 解析失败');
    }
  };

  const resetDraft = () => {
    const next = deepClone(visibleValue);
    setDraft(next);
    setJsonDraft(toJson(next));
    setError(null);
  };

  const stats = buildQuickStats(activeSystem, originalValue);

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
      <aside
        className="max-h-[34dvh] space-y-2 overflow-y-auto p-3 md:max-h-none"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.42)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
          clipPath: cardClip,
        }}
      >
        <div className="px-1 pb-1">
          <div className="font-serif text-sm font-bold tracking-[0.24em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
            变量中枢
          </div>
          <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.68)' }}>
            按系统查看与修正存档数据。
          </div>
        </div>

        {SYSTEMS.map((system) => {
          const active = system.key === activeKey;
          const value = getSystemValue(props, system.key);
          return (
            <button
              key={system.key}
              onClick={() => setActiveKey(system.key)}
              className="w-full px-3 py-2.5 text-left transition-all"
              style={{
                background: active
                  ? 'linear-gradient(135deg, rgba(var(--tj-bubble),0.96), rgba(var(--tj-surface-strong),0.86))'
                  : 'rgba(var(--tj-bubble),0.72)',
                boxShadow: active
                  ? `inset 3px 0 0 ${system.accent}, inset 0 0 0 1px rgba(var(--tj-border),0.82), 0 6px 14px rgba(var(--tj-shadow),0.06)`
                  : 'inset 0 0 0 1px rgba(var(--tj-border),0.5)',
                clipPath: smallClip,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-sm font-bold tracking-wider" style={{ color: active ? system.accent : 'rgba(var(--tj-ui-body),0.92)' }}>
                  {system.label}
                </span>
                <span className="font-mono text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
                  {countValue(value)}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
                {system.desc}
              </div>
            </button>
          );
        })}
      </aside>

      <section className="min-w-0 space-y-4">
        <div
          className="p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.10), rgba(var(--tj-bg-secondary),0.42) 58%, rgba(var(--tj-bg-secondary),0.68))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
            clipPath: cardClip,
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="h-2 w-2" style={{ background: activeSystem.accent, boxShadow: `0 0 12px ${activeSystem.accent}` }} />
                <h3 className="min-w-0 font-serif text-lg font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                  {activeSystem.label}
                </h3>
                <span
                  className="px-2 py-0.5 text-[11px]"
                  style={{
                    color: activeSystem.policy === 'writable' ? 'rgba(var(--tj-ui-success),0.95)' : 'rgba(var(--tj-ui-muted),0.86)',
                    boxShadow: `inset 0 0 0 1px ${activeSystem.policy === 'writable' ? 'rgba(180,235,190,0.35)' : 'rgba(var(--tj-accent-primary),0.24)'}`,
                    clipPath: smallClip,
                  }}
                >
                  {policyLabel(activeSystem.policy)}
                </span>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.68)' }}>
                {activeSystem.desc}
                {activeSystem.hiddenFields?.length ? ` · 已隐藏旧字段：${activeSystem.hiddenFields.join(' / ')}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {stats.map((item) => (
                <span
                  key={item}
                  className="px-2 py-1 font-mono text-[11px]"
                  style={{
                    color: 'rgba(var(--tj-ui-body),0.9)',
                    background: 'rgba(var(--tj-bg-primary),0.38)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.13)',
                    clipPath: smallClip,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1">
            <button
              onClick={() => setMode('fields')}
              className="px-4 py-1.5 text-xs font-serif tracking-wider"
              style={{
                background: mode === 'fields' ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-accent-secondary),0.95))' : 'transparent',
                color: mode === 'fields' ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body),0.88)',
                boxShadow: mode === 'fields' ? 'none' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.24)',
                clipPath: smallClip,
              }}
            >
              逐条修改
            </button>
            <button
              onClick={() => setMode('json')}
              className="px-4 py-1.5 text-xs font-serif tracking-wider"
              style={{
                background: mode === 'json' ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-accent-secondary),0.95))' : 'transparent',
                color: mode === 'json' ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body),0.88)',
                boxShadow: mode === 'json' ? 'none' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.24)',
                clipPath: smallClip,
              }}
            >
              整体 JSON
            </button>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {error && <span className="text-xs" style={{ color: 'rgba(255,135,135,0.95)' }}>✕ {error}</span>}
            {savedFlash && <span className="text-xs" style={{ color: 'rgba(165,230,170,0.95)' }}>✓ 已保存</span>}
            <button
              onClick={resetDraft}
              className="px-3 py-1.5 text-xs font-serif tracking-wider"
              style={{ color: 'rgba(var(--tj-ui-body),0.88)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.56)', clipPath: smallClip }}
            >
              重置草稿
            </button>
            <button
              onClick={saveDraft}
              className="px-4 py-1.5 text-xs font-serif font-bold tracking-wider"
              style={{ background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)), rgb(var(--tj-accent-primary)) 48%, rgb(var(--tj-accent-secondary)))', color: 'rgb(var(--tj-on-accent))', clipPath: smallClip }}
            >
              保存到存档
            </button>
          </div>
        </div>

        <div
          className="p-3"
          style={{
            background: 'rgba(var(--tj-bg-secondary),0.45)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
            clipPath: cardClip,
          }}
        >
          {mode === 'fields' ? (
            <div className="max-h-[52dvh] overflow-y-auto md:max-h-[58vh]">
              <TreeNode label={activeSystem.rootLabel} value={draft} depth={0} onChange={updateDraft} />
            </div>
          ) : (
            <textarea
              value={jsonDraft}
              onChange={(e) => {
                setJsonDraft(e.target.value);
                setError(null);
              }}
              rows={24}
              className="kaituo-input w-full resize-none px-3 py-2 font-mono text-[12px]"
              style={{ clipPath: smallClip, lineHeight: 1.5 }}
              spellCheck={false}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function TreeNode({
  label,
  value,
  depth,
  onChange,
  onDelete,
}: {
  label: string;
  value: unknown;
  depth: number;
  onChange: (next: unknown) => void;
  onDelete?: () => void;
}) {
  const isArray = Array.isArray(value);
  const objectLike = isRecord(value);

  if (!isArray && !objectLike) {
    return <LeafRow label={label} value={value} depth={depth} onChange={onChange} onDelete={onDelete} />;
  }

  const children = isArray ? value : Object.entries(value);

  return (
    <details
      open={depth < 2}
      className="mb-1"
      style={{
        marginLeft: depth === 0 ? 0 : 12,
        paddingLeft: depth === 0 ? 0 : 8,
        borderLeft: depth === 0 ? 'none' : '1px solid rgba(var(--tj-accent-primary),0.10)',
      }}
    >
      <summary className="flex min-w-0 cursor-pointer select-none flex-wrap items-center gap-2 py-1">
        <span className="min-w-0 max-w-full truncate font-serif text-[13px] font-bold" style={{ color: depth === 0 ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-ui-body),0.94)' }}>
          {label}
        </span>
        <span className="font-mono text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
          {isArray ? `[${value.length}]` : `{${Object.keys(value).length}}`}
        </span>
        <span className="min-w-0 max-w-full truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
          {summarizeValue(value)}
        </span>
        <button
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isArray) {
              onChange([...value, inferDefaultValueFromSibling(value)]);
              return;
            }
            const key = window.prompt('新字段名');
            if (!key) return;
            if (key in value) {
              window.alert('字段已存在');
              return;
            }
            onChange({ ...value, [key]: '' });
          }}
          className="px-1.5 py-0.5 text-[10px]"
          style={{ color: 'rgba(165,230,170,0.94)', boxShadow: 'inset 0 0 0 1px rgba(165,230,170,0.25)', clipPath: smallClip }}
        >
          新增
        </button>
        {onDelete && (
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (window.confirm(`确认删除 ${label} ?`)) onDelete();
            }}
            className="px-1.5 py-0.5 text-[10px]"
            style={{ color: 'rgba(255,135,135,0.9)', boxShadow: 'inset 0 0 0 1px rgba(255,135,135,0.25)', clipPath: smallClip }}
          >
            删除
          </button>
        )}
      </summary>

      <div className="space-y-0.5">
        {isArray
          ? children.map((item, index) => (
              <TreeNode
                key={index}
                label={`[${index}]`}
                value={item}
                depth={depth + 1}
                onChange={(next) => {
                  const nextArr = [...value];
                  nextArr[index] = next;
                  onChange(nextArr);
                }}
                onDelete={() => {
                  const nextArr = [...value];
                  nextArr.splice(index, 1);
                  onChange(nextArr);
                }}
              />
            ))
          : (children as [string, unknown][]).map(([key, item]) => (
              <TreeNode
                key={key}
                label={key}
                value={item}
                depth={depth + 1}
                onChange={(next) => onChange({ ...value, [key]: next })}
                onDelete={() => {
                  const nextObj = { ...value };
                  delete nextObj[key];
                  onChange(nextObj);
                }}
              />
            ))}
      </div>
    </details>
  );
}

function LeafRow({
  label,
  value,
  depth,
  onChange,
  onDelete,
}: {
  label: string;
  value: unknown;
  depth: number;
  onChange: (next: unknown) => void;
  onDelete?: () => void;
}) {
  const type = typeof value;

  return (
    <div
      className="flex flex-col gap-1 py-1 sm:flex-row sm:items-start sm:gap-2"
      style={{
        marginLeft: depth === 0 ? 0 : 12,
        paddingLeft: depth === 0 ? 0 : 8,
        borderLeft: depth === 0 ? 'none' : '1px solid rgba(var(--tj-accent-primary),0.08)',
      }}
    >
      <span className="min-w-0 flex-shrink-0 pt-1 font-serif text-xs sm:min-w-[128px]" style={{ color: 'rgba(var(--tj-ui-body),0.92)' }}>
        {label}
      </span>

      {value === null ? (
        <button
          onClick={() => onChange('')}
          className="px-2 py-1 text-[11px]"
          style={{ color: 'rgba(var(--tj-text-secondary),0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)', clipPath: smallClip }}
        >
          null
        </button>
      ) : type === 'boolean' ? (
        <button
          onClick={() => onChange(!value)}
          className="px-3 py-1 font-mono text-[11px]"
          style={{
            background: value ? 'rgba(165,230,170,0.16)' : 'rgba(135,135,135,0.14)',
            color: value ? 'rgba(165,230,170,0.95)' : 'rgba(210,200,172,0.78)',
            boxShadow: `inset 0 0 0 1px ${value ? 'rgba(165,230,170,0.32)' : 'rgba(var(--tj-accent-primary),0.16)'}`,
            clipPath: smallClip,
          }}
        >
          {String(value)}
        </button>
      ) : type === 'number' ? (
        <input
          type="number"
          value={Number.isFinite(value as number) ? (value as number) : 0}
          onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
          className="kaituo-input w-full min-w-0 flex-1 px-2 py-1 font-mono text-[11px]"
          style={{ clipPath: smallClip }}
        />
      ) : typeof value === 'string' && (value.length > 58 || value.includes('\n')) ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={Math.min(7, Math.max(2, Math.ceil(value.length / 58)))}
          className="kaituo-input w-full min-w-0 flex-1 resize-none px-2 py-1 font-mono text-[11px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      ) : (
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="kaituo-input w-full min-w-0 flex-1 px-2 py-1 font-mono text-[11px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      )}

      {onDelete && (
        <button
          onClick={() => {
            if (window.confirm(`确认删除 ${label} ?`)) onDelete();
          }}
          className="mt-0.5 flex-shrink-0 px-1.5 py-0.5 text-[10px]"
          style={{ color: 'rgba(255,135,135,0.86)', boxShadow: 'inset 0 0 0 1px rgba(255,135,135,0.22)', clipPath: smallClip }}
        >
          删除
        </button>
      )}
    </div>
  );
}
