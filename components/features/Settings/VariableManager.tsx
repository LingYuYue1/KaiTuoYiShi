import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { VariableSetters } from '@/utils/variableExecutor';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 归一化NPC记录列表 } from '@/models/npc';
import type { 聊天消息 } from '@/models/chat';
import type { 变量命令批次 } from '@/models/variableCommand';
import { listVariableHistoryRepairCandidates } from '@/services/variableHistoryRepair';

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
  chatHistory?: 聊天消息[];
  variableBatches?: 变量命令批次[];
  onRepairMessage?: (messageId: string) => void | Promise<void>;
  onBatchRepair?: (messageIds: string[]) => void | Promise<void>;
  initialWorkspace?: Workspace;
}

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

type SystemKey = 'traveler' | 'world' | 'memory' | 'yiting' | 'phone' | 'npc' | 'news' | 'zhiku' | 'storyWeaving';
type EditMode = 'fields' | 'json';
type Workspace = 'state' | 'repair';
type WritePolicy = 'writable' | 'manual' | 'readonly';
const ARRAY_RENDER_BATCH_SIZE = 40;

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
    desc: '档案、命途、战技、背包',
    policy: 'writable',
    accent: 'rgb(var(--tj-accent-primary))',
    hiddenFields: ['属性', '主命途'],
  },
  { key: 'world', label: '世界', rootLabel: '世界', desc: '时间、地点、天数、全局事件', policy: 'writable', accent: '#9fd6ff' },
  { key: 'memory', label: '记忆', rootLabel: '记忆', desc: '即时、短期、中期、长期记忆', policy: 'manual', accent: '#b7e2b4' },
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

// 从数组条目（NPC / 新闻）里提取一个可读标签，用于条目列表和详情标题。
function summarizeArrayItemLabel(item: unknown): string {
  if (!isRecord(item)) {
    return typeof item === 'string' ? item : summarizeValue(item);
  }
  // NPC 优先 姓名/别名；新闻优先 标题。
  const name = readStrKey(item, ['姓名', '别名', '名称', 'title', '标题', 'id', 'ID']);
  const tier = readStrKey(item, ['阶位', 'tier']);
  const following = item['同行'] === true;
  const suffix = following ? ' · 同行' : tier ? ` · ${tier}` : '';
  return name ? `${name}${suffix}` : `条目 ${summarizeValue(item)}`;
}

function readStrKey(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    if (typeof obj[k] === 'string' && (obj[k] as string).trim()) return (obj[k] as string).trim();
  }
  return '';
}

// 数组型系统的二级条目列表：带搜索框，点击选中某条。
function ArrayItemList({ items, search, onSearch, activeIndex, onSelect, accent }: {
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
    case 'npc': props.setters.setNPC(归一化NPC记录列表(value)); break;
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
      String(value.当前天气 ?? '天气未定'),
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
  const [workspace, setWorkspace] = useState<Workspace>(props.initialWorkspace ?? 'state');
  const [activeKey, setActiveKey] = useState<SystemKey>('traveler');
  const [mode, setMode] = useState<EditMode>('fields');
  const [draft, setDraft] = useState<unknown>(null);
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  // 数组型系统（伙伴/周报）的二级导航状态。
  const [activeArrayIndex, setActiveArrayIndex] = useState(0);
  const [arraySearch, setArraySearch] = useState('');
  const [repairSelection, setRepairSelection] = useState<Set<string>>(() => new Set());

  const activeSystem = useMemo(() => SYSTEMS.find((item) => item.key === activeKey) ?? SYSTEMS[0], [activeKey]);
  const originalValue = getSystemValue(props, activeKey);
  const visibleValue = useMemo(
    () => omitHiddenFields(originalValue, activeSystem.hiddenFields),
    [activeSystem.hiddenFields, originalValue],
  );

  useEffect(() => {
    let nextDraft = deepClone(visibleValue);
    // 确保「当前天气」紧跟「当前地点」
    if (activeSystem.key === 'world' && isRecord(nextDraft)) {
      const rec = nextDraft as Record<string, unknown>;
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
  }, [activeKey, visibleValue]);

  const updateDraft = (next: unknown) => {
    if (props.editingLocked) return;
    setDraft(next);
    setError(null);
  };

  const saveDraft = () => {
    if (props.editingLocked) return;
    try {
      const parsed = mode === 'json' ? JSON.parse(jsonDraft ?? '') : draft;
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

  // Hooks 必须始终按固定顺序调用；切到历史修复视图时也不能跳过这个 effect。
  useEffect(() => {
    setActiveArrayIndex(0);
    setArraySearch('');
  }, [activeKey]);

  if (workspace === 'repair') {
    const messages = (props.chatHistory ?? []).filter((message) => message.role === 'assistant' && !message.isStreaming && Boolean(message.parsedResponse?.body?.trim() || message.content.trim()));
    const batchByMessageId = new Map((props.variableBatches ?? []).filter((batch) => batch.targetMessageId).map((batch) => [batch.targetMessageId as string, batch]));
    const candidates = listVariableHistoryRepairCandidates(props.chatHistory ?? [], props.variableBatches ?? []);
    const selectableIds = candidates.map((candidate) => candidate.message.id);
    const selectedCount = [...repairSelection].filter((id) => selectableIds.includes(id)).length;
    return (
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 px-1">
          <div>
            <h3 className="font-serif text-lg font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>历史修复</h3>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>只扫描已有正文的 AI 回合。点击某一回合后先生成差异预览，确认前不会改动正式变量。</p>
          </div>
          <button type="button" onClick={() => setWorkspace('state')} className="px-3 py-2 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.86)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.55)' }}>返回当前状态</button>
        </div>
          <div className="grid gap-2 sm:grid-cols-3">
          <div className="px-3 py-2 text-xs" style={{ background: 'rgba(var(--tj-accent-primary),0.07)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)' }}>可扫描回合 {messages.length}</div>
          <div className="px-3 py-2 text-xs" style={{ background: 'rgba(var(--tj-accent-primary),0.07)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)' }}>缺少批次 {messages.filter((message) => !batchByMessageId.has(message.id)).length}</div>
          <div className="px-3 py-2 text-xs" style={{ background: 'rgba(var(--tj-accent-primary),0.07)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)' }}>已有批次 {messages.filter((message) => batchByMessageId.has(message.id)).length}</div>
          </div>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <button
            type="button"
            onClick={() => setRepairSelection(new Set(selectableIds))}
            disabled={!selectableIds.length || props.editingLocked}
            className="px-3 py-2 text-xs disabled:opacity-40"
            style={{ color: 'rgba(var(--tj-tech-cyan),0.94)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.32)' }}
          >
            选中缺失/失败 ({selectableIds.length})
          </button>
          <button
            type="button"
            onClick={() => setRepairSelection(new Set())}
            disabled={!selectedCount}
            className="px-3 py-2 text-xs disabled:opacity-40"
            style={{ color: 'rgba(var(--tj-text-secondary),0.84)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.5)' }}
          >
            清空选择
          </button>
          <button
            type="button"
            onClick={() => void props.onBatchRepair?.([...repairSelection].filter((id) => selectableIds.includes(id)))}
            disabled={!selectedCount || !props.onBatchRepair || props.editingLocked}
            className="px-3 py-2 text-xs font-semibold disabled:opacity-40"
            style={{ color: 'rgb(var(--tj-on-accent))', background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.96), rgba(var(--tj-btn-primary-end),0.84))' }}
          >
            批量重新解析 ({selectedCount})
          </button>
        </div>
        <div className="space-y-2">
          {messages.slice().reverse().map((message) => {
            const batch = batchByMessageId.get(message.id);
            const failed = Boolean(batch?.results.some((result) => !result.ok && result.kind !== 'warning'));
            const warning = Boolean(batch?.coverage?.unresolvedTypes.length || batch?.results.some((result) => !result.ok));
            const status = !batch ? '无变量批次' : failed ? '批次失败' : warning ? '存在待确认项' : '已记录';
            const color = !batch || failed ? 'rgba(255,145,145,0.94)' : warning ? 'rgba(255,210,120,0.94)' : 'rgba(150,220,170,0.92)';
            return (
              <div key={message.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center" style={{ background: 'rgba(var(--tj-surface-strong),0.55)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.52)' }}>
                <input
                  type="checkbox"
                  checked={repairSelection.has(message.id)}
                  onChange={() => setRepairSelection((current) => {
                    const next = new Set(current);
                    if (next.has(message.id)) next.delete(message.id); else next.add(message.id);
                    return next;
                  })}
                  disabled={!selectableIds.includes(message.id) || props.editingLocked}
                  className="h-4 w-4 shrink-0 accent-[rgb(var(--tj-accent-primary))]"
                  aria-label={`选择第 ${message.gameTime || '?'} 回合`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>第 {message.gameTime || '?'} 回合</span>
                    <span className="px-2 py-0.5 text-[10px]" style={{ color, boxShadow: `inset 0 0 0 1px ${color}66` }}>{status}</span>
                  </div>
                  <div className="mt-1 truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>{(message.parsedResponse?.body || message.content).replace(/\s+/g, ' ').slice(0, 120)}</div>
                  {batch?.coverage?.unresolvedTypes.length ? <div className="mt-1 text-[11px]" style={{ color: 'rgba(255,210,120,0.86)' }}>覆盖未解决：{batch.coverage.unresolvedTypes.join('、')}</div> : null}
                </div>
                <button type="button" onClick={() => void props.onRepairMessage?.(message.id)} disabled={!props.onRepairMessage || props.editingLocked} className="shrink-0 px-3 py-2 text-xs disabled:opacity-40" style={{ color: 'rgb(var(--tj-accent-primary))', background: 'rgba(var(--tj-accent-primary),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.38)' }}>重新解析</button>
              </div>
            );
          })}
          {messages.length === 0 && <div className="py-10 text-center text-sm" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>当前没有可扫描的历史正文。</div>}
        </div>
      </div>
    );
  }

  const updateArrayItem = (index: number, next: unknown) => {
    if (!Array.isArray(draft)) return;
    const arr = [...draft];
    arr[index] = next;
    updateDraft(arr);
  };

  return (
    <div className={isArraySystem
      ? 'grid min-w-0 gap-4 md:grid-cols-[210px_240px_minmax(0,1fr)]'
      : 'grid min-w-0 gap-4 md:grid-cols-[210px_minmax(0,1fr)]'}>
      <aside
        className="max-h-[34dvh] space-y-2 overflow-y-auto p-3 md:max-h-none"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.42)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
          clipPath: cardClip,
        }}
      >
          <div className="px-1 pb-1">
          <div
            className="font-serif text-base font-bold tracking-[0.24em]"
            style={{
              background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-tech-cyan)) 46%, rgb(var(--tj-accent-primary)) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            变量中枢
          </div>

        <button
          type="button"
          onClick={() => setWorkspace('repair')}
          className="w-full px-3 py-2.5 text-left transition-all"
          style={{ background: 'rgba(var(--tj-tech-cyan),0.08)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.28)', clipPath: smallClip }}
        >
          <div className="font-serif text-sm font-semibold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.94)' }}>历史修复</div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.66)' }}>扫描缺失变量并生成预览</div>
        </button>
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
                  ? 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.24), rgba(var(--tj-accent-primary), 0.08))'
                  : 'rgba(var(--tj-bg-secondary), 0.34)',
                boxShadow: active
                  ? `inset 3px 0 0 ${system.accent}, inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.56), 0 0 18px rgba(var(--tj-tech-cyan), 0.10)`
                  : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                clipPath: smallClip,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-base font-bold tracking-wider" style={{ color: active ? system.accent : 'rgb(var(--tj-text-primary))' }}>
                  {system.label}
                </span>
                <span className="font-mono text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
                  {countValue(value)}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
                {system.desc}
              </div>
            </button>
          );
        })}
      </aside>

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
        <div
          className="p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.10), rgba(var(--tj-bg-secondary), 0.42) 58%, rgba(var(--tj-bg-secondary), 0.68))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.18)',
            clipPath: cardClip,
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="h-2 w-2" style={{ background: activeSystem.accent, boxShadow: `0 0 12px ${activeSystem.accent}` }} />
                <h3
                  className="min-w-0 font-serif text-lg font-bold tracking-[0.22em]"
                  style={{
                    background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-tech-cyan)) 46%, rgb(var(--tj-accent-primary)) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {isArraySystem && arrayDraft[activeArrayIndex]
                    ? `${activeSystem.label} · ${summarizeArrayItemLabel(arrayDraft[activeArrayIndex])}`
                    : activeSystem.label}
                </h3>
                <span
                  className="px-2 py-0.5 text-xs"
                  style={{
                    color: activeSystem.policy === 'writable' ? 'rgba(var(--tj-ui-success),0.95)' : 'rgba(var(--tj-ui-muted),0.86)',
                    boxShadow: `inset 0 0 0 1px ${activeSystem.policy === 'writable' ? 'rgba(180,235,190,0.35)' : 'rgba(var(--tj-tech-cyan),0.24)'}`,
                    clipPath: smallClip,
                  }}
                >
                  {policyLabel(activeSystem.policy)}
                </span>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.68)' }}>
                {activeSystem.desc}
                {isArraySystem ? ` · 共 ${arrayDraft.length} 条，当前第 ${Math.min(activeArrayIndex + 1, arrayDraft.length)} 条` : ''}
                {activeSystem.hiddenFields?.length ? ` · 已隐藏旧字段：${activeSystem.hiddenFields.join(' / ')}` : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-1">
            <button
              onClick={() => switchMode('fields')}
              className="px-4 py-1.5 text-sm font-serif tracking-wider"
              style={{
                background: mode === 'fields' ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))' : 'transparent',
                color: mode === 'fields' ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.85)',
                boxShadow: mode === 'fields' ? 'none' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24)',
                clipPath: smallClip,
              }}
            >
              逐条修改
            </button>
            <button
              onClick={() => switchMode('json')}
              className="px-4 py-1.5 text-sm font-serif tracking-wider"
              style={{
                background: mode === 'json' ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))' : 'transparent',
                color: mode === 'json' ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.85)',
                boxShadow: mode === 'json' ? 'none' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24)',
                clipPath: smallClip,
              }}
            >
              整体 JSON
            </button>
          </div>
        <div className="flex flex-col items-stretch gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              <button
                onClick={resetDraft}
                disabled={props.editingLocked}
                className="px-3 py-1.5 text-sm font-serif tracking-wider"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.85)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)', clipPath: smallClip }}
              >
                重置草稿
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {stats.map((item) => (
                <span
                  key={item}
                  className="px-2 py-1 font-mono text-xs"
                  style={{
                    color: 'rgba(var(--tj-text-primary), 0.9)',
                    background: 'rgba(var(--tj-bg-primary), 0.38)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.14)',
                    clipPath: smallClip,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={saveDraft}
            disabled={props.editingLocked}
            className="w-full py-3 text-sm font-serif tracking-[0.4em] transition-all hover:opacity-90"
            style={{
              background: savedFlash
                ? 'linear-gradient(135deg, rgba(140, 220, 160, 0.95), rgba(100, 180, 130, 0.95))'
                : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.96), rgba(var(--tj-btn-primary-end), 0.84))',
              color: 'rgb(var(--tj-on-accent))',
              boxShadow: savedFlash
                ? 'inset 0 0 0 1px rgba(220, 255, 230, 0.5), 0 0 18px rgba(140, 220, 160, 0.35)'
                : 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 18px rgba(var(--tj-accent-primary), 0.22)',
              clipPath: cardClip,
            }}
          >
            {savedFlash ? '✓ 已 保 存' : '◆ 保 存 修 改'}
          </button>

          {props.editingLocked && (
            <div
              className="px-3 py-2 text-xs"
              style={{
                color: 'rgba(var(--tj-accent-primary),0.92)',
                background: 'rgba(var(--tj-accent-primary),0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.2)',
                clipPath: smallClip,
              }}
            >
              本回合结算中，完成后可修改。当前仍可浏览变量内容。
            </div>
          )}

          {error && (
            <div
              className="px-3 py-2 text-xs"
              style={{
                color: 'rgba(220, 120, 120, 0.9)',
                background: 'rgba(220, 120, 120, 0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(220, 120, 120, 0.25)',
                clipPath: smallClip,
              }}
            >
              ✕ {error}
            </div>
          )}
        </div>
        </div>

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
  const [expanded, setExpanded] = useState(depth === 0);
  const [visibleArrayItems, setVisibleArrayItems] = useState(ARRAY_RENDER_BATCH_SIZE);

  if (!isArray && !objectLike) {
    return <LeafRow label={label} value={value} depth={depth} onChange={onChange} onDelete={onDelete} />;
  }

  // NSFW 档案渲染专用编辑面板（中文标签 + 下拉 + 标签编辑器），而非通用树形展开。
  // 用 <details> 包裹并默认折叠，避免占用大量纵向位置；点击 summary 展开。
  if (!isArray && objectLike && label === 'NSFW档案') {
    const archive = value as Record<string, unknown>;
    const enabled = archive.enabled === true;
    const fieldCount = Object.keys(archive).length;
    return (
      <details
        className="mb-1"
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer select-none items-center gap-2 py-1.5">
          <span className="font-serif text-sm font-bold" style={{ color: nsfwAccent }}>NSFW 档案</span>
          <span className="font-mono text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>{`{${fieldCount}}`}</span>
          <span className="text-xs" style={{ color: enabled ? nsfwAccent : 'rgba(var(--tj-text-secondary),0.58)' }}>{enabled ? '已启用' : '预留'}</span>
          <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.5)' }}>（点击展开编辑）</span>
        </summary>
        {expanded && (
          <div className="mt-1">
            <NsfwArchiveEditor value={archive} onChange={onChange} />
          </div>
        )}
      </details>
    );
  }

  return (
    <details
      open={expanded}
      onToggle={(event) => {
        const nextExpanded = event.currentTarget.open;
        setExpanded(nextExpanded);
        if (!nextExpanded && isArray) setVisibleArrayItems(ARRAY_RENDER_BATCH_SIZE);
      }}
      className="mb-1.5"
      style={{
        marginLeft: depth === 0 ? 0 : 16,
        paddingLeft: depth === 0 ? 0 : 10,
        borderLeft: depth === 0 ? 'none' : '1px solid rgba(var(--tj-accent-primary),0.10)',
      }}
    >
      <summary className="flex min-w-0 cursor-pointer select-none flex-wrap items-center gap-2 py-1.5">
        <span className="min-w-0 max-w-full truncate font-serif text-sm font-bold" style={{ color: depth === 0 ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-ui-body),0.94)' }}>
          {label}
        </span>
        <span className="font-mono text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
          {isArray ? `[${value.length}]` : `{${Object.keys(value).length}}`}
        </span>
        <span className="min-w-0 max-w-full truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
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

      {expanded && (
      <div className="space-y-0.5">
        {isArray
          ? value.slice(0, visibleArrayItems).map((item, index) => (
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
          : Object.entries(value).map(([key, item]) => (
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
        {isArray && visibleArrayItems < value.length && (
          <button
            type="button"
            onClick={() => setVisibleArrayItems((current) => Math.min(value.length, current + ARRAY_RENDER_BATCH_SIZE))}
            className="ml-4 mt-2 px-3 py-1 text-xs"
            style={{
              color: 'rgba(var(--tj-accent-primary),0.92)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.24)',
              clipPath: smallClip,
            }}
          >
            继续显示（{Math.min(ARRAY_RENDER_BATCH_SIZE, value.length - visibleArrayItems)} / {value.length - visibleArrayItems}）
          </button>
        )}
      </div>
      )}
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
      className="flex flex-col gap-1 py-1.5 sm:flex-row sm:items-start sm:gap-2"
      style={{
        marginLeft: depth === 0 ? 0 : 16,
        paddingLeft: depth === 0 ? 0 : 10,
        borderLeft: depth === 0 ? 'none' : '1px solid rgba(var(--tj-accent-primary),0.08)',
      }}
    >
      <span className="min-w-0 flex-shrink-0 pt-1 font-serif text-sm sm:min-w-[144px]" style={{ color: 'rgba(var(--tj-ui-body),0.92)' }}>
        {label}
      </span>

      {value === null ? (
        <button
          onClick={() => onChange('')}
          className="px-2 py-1 text-[13px]"
          style={{ color: 'rgba(var(--tj-text-secondary),0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)', clipPath: smallClip }}
        >
          null
        </button>
      ) : type === 'boolean' ? (
        <button
          onClick={() => onChange(!value)}
          className="px-3 py-1 font-mono text-[13px]"
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
          className="kaituo-input w-full min-w-0 flex-1 px-2 py-1 font-mono text-[13px]"
          style={{ clipPath: smallClip }}
        />
      ) : typeof value === 'string' && (value.length > 58 || value.includes('\n')) ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={Math.min(7, Math.max(2, Math.ceil(value.length / 58)))}
          className="kaituo-input w-full min-w-0 flex-1 resize-none px-2 py-1 font-mono text-[13px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      ) : (
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="kaituo-input w-full min-w-0 flex-1 px-2 py-1 font-mono text-[13px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      )}

      {onDelete && (
        <button
          onClick={() => {
            if (window.confirm(`确认删除 ${label} ?`)) onDelete();
          }}
          className="mt-0.5 flex-shrink-0 px-1.5 py-0.5 text-[11px]"
          style={{ color: 'rgba(255,135,135,0.86)', boxShadow: 'inset 0 0 0 1px rgba(255,135,135,0.22)', clipPath: smallClip }}
        >
          删除
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NSFW 档案专用编辑面板
// 在变量管理页 NPC → 某个 NPC → NSFW档案 字段处渲染，
// 提供中文标签、年龄下拉、标签编辑器和分组身体档案表单。
// ─────────────────────────────────────────────────────────────

const NSFW_AGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'adult', label: '成人' },
  { value: 'unknown', label: '未标注' },
  { value: 'minor_blocked', label: '标注未成年' },
];

const FEMALE_BODY_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: '胸部', label: '胸部' },
  { key: '女性私处', label: '女性私处' },
  { key: '后庭', label: '后庭' },
  { key: '体态', label: '体态' },
  { key: '体味', label: '体味' },
];

const MALE_BODY_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: '男性器', label: '男性器' },
  { key: '后庭', label: '后庭' },
  { key: '体态', label: '体态' },
  { key: '体味', label: '体味' },
];

const nsfwAccent = 'rgba(214, 142, 174, 0.9)';

function NsfwArchiveEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (next: unknown) => void }) {
  const enabled = value.enabled === true;
  const age = typeof value.年龄确认 === 'string' ? value.年龄确认 : 'unknown';
  const femaleBody = isRecord(value.女性身体档案) ? value.女性身体档案 : undefined;
  const maleBody = isRecord(value.男性身体档案) ? value.男性身体档案 : undefined;

  const patch = (updates: Record<string, unknown>) => onChange({ ...value, ...updates });

  return (
    <div
      className="space-y-4 px-3 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-ui-nsfw), 0.08), rgba(var(--tj-ui-panel), 0.5))',
        boxShadow: 'inset 0 0 0 1px rgba(214, 142, 174, 0.24)',
        clipPath: cardClip,
      }}
    >
      <button
        onClick={() => patch({ enabled: !enabled })}
        className="flex w-full items-center justify-between gap-3"
      >
        <span className="font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
          启用状态
        </span>
        <span
          className="px-3 py-0.5 font-mono text-[11px]"
          style={{
            background: enabled ? 'rgba(214, 142, 174, 0.22)' : 'rgba(120, 110, 100, 0.16)',
            color: enabled ? nsfwAccent : 'rgba(var(--tj-text-secondary),0.7)',
            boxShadow: `inset 0 0 0 1px ${enabled ? 'rgba(214, 142, 174, 0.4)' : 'rgba(var(--tj-accent-primary),0.16)'}`,
            clipPath: smallClip,
          }}
        >
          {enabled ? '已启用' : '预留'}
        </span>
      </button>

      <div className="grid gap-3 md:grid-cols-2">
        <NsfwSelectField
          label="年龄确认"
          value={age}
          options={NSFW_AGE_OPTIONS}
          onChange={(v) => patch({ 年龄确认: v })}
        />
        <NsfwTextField
          label="亲密阶段"
          value={typeof value.亲密阶段 === 'string' ? value.亲密阶段 : ''}
          onChange={(v) => patch({ 亲密阶段: v })}
        />
      </div>

      <NsfwTextField
        label="边界"
        area
        value={typeof value.边界 === 'string' ? value.边界 : ''}
        onChange={(v) => patch({ 边界: v })}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <NsfwTagEditor label="偏好" items={toStringArray(value.偏好)} onChange={(items) => patch({ 偏好: items })} />
        <NsfwTagEditor label="敏感点" items={toStringArray(value.敏感点)} onChange={(items) => patch({ 敏感点: items })} />
        <NsfwTagEditor label="禁忌" items={toStringArray(value.禁忌)} onChange={(items) => patch({ 禁忌: items })} />
      </div>

      <NsfwBodyArchiveSection
        title="女性身体档案"
        fields={FEMALE_BODY_FIELDS}
        body={femaleBody}
        onChange={(next) => patch({ 女性身体档案: next })}
      />
      <NsfwBodyArchiveSection
        title="男性身体档案"
        fields={MALE_BODY_FIELDS}
        body={maleBody}
        onChange={(next) => patch({ 男性身体档案: next })}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <NsfwTagEditor label="经历" items={toStringArray(value.经历)} onChange={(items) => patch({ 经历: items })} multiline />
        <NsfwTagEditor label="长期事实" items={toStringArray(value.长期事实)} onChange={(items) => patch({ 长期事实: items })} multiline />
      </div>

      <NsfwTagEditor label="标签" items={toStringArray(value.标签)} onChange={(items) => patch({ 标签: items })} />

      <NsfwTextField
        label="备注"
        area
        value={typeof value.备注 === 'string' ? value.备注 : ''}
        onChange={(v) => patch({ 备注: v })}
      />
    </div>
  );
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function NsfwSelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 font-serif text-[11px] tracking-[0.18em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="kaituo-input w-full px-2 py-1.5 text-[12px]"
        style={{ clipPath: smallClip }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function NsfwTextField({ label, value, onChange, area }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 font-serif text-[11px] tracking-[0.18em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
        {label}
      </div>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.min(5, Math.max(2, Math.ceil(value.length / 48)))}
          className="kaituo-input w-full resize-none px-2 py-1.5 text-[12px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="kaituo-input w-full px-2 py-1.5 text-[12px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
      )}
    </div>
  );
}

function NsfwTagEditor({ label, items, onChange, multiline }: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    if (items.some((item) => item.trim() === text)) { setDraft(''); return; }
    onChange([...items, text]);
    setDraft('');
  };
  return (
    <div>
      <div className="mb-1 font-serif text-[11px] tracking-[0.18em]" style={{ color: 'rgba(235, 190, 205, 0.82)' }}>
        {label}
      </div>
      <div className="space-y-1">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-1.5">
            {multiline ? (
              <textarea
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = e.target.value;
                  onChange(next);
                }}
                rows={Math.min(3, Math.max(1, Math.ceil(item.length / 40)))}
                className="kaituo-input min-w-0 flex-1 resize-none px-2 py-1 text-[11px]"
                style={{ clipPath: smallClip }}
                spellCheck={false}
              />
            ) : (
              <input
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = e.target.value;
                  onChange(next);
                }}
                className="kaituo-input min-w-0 flex-1 px-2 py-1 text-[11px]"
                style={{ clipPath: smallClip }}
                spellCheck={false}
              />
            )}
            <button
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="flex-shrink-0 px-1.5 py-1 text-[10px]"
              style={{ color: 'rgba(255,135,135,0.86)', boxShadow: 'inset 0 0 0 1px rgba(255,135,135,0.22)', clipPath: smallClip }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={`添加${label}…`}
          className="kaituo-input min-w-0 flex-1 px-2 py-1 text-[11px]"
          style={{ clipPath: smallClip }}
          spellCheck={false}
        />
        <button
          onClick={add}
          className="flex-shrink-0 px-2 py-1 text-[10px]"
          style={{ color: 'rgba(165,230,170,0.94)', boxShadow: 'inset 0 0 0 1px rgba(165,230,170,0.25)', clipPath: smallClip }}
        >
          ＋
        </button>
      </div>
    </div>
  );
}

function NsfwBodyArchiveSection({ title, fields, body, onChange }: {
  title: string;
  fields: ReadonlyArray<{ key: string; label: string }>;
  body: Record<string, unknown> | undefined;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const current = body ?? {};
  const update = (key: string, text: string) => {
    const next = { ...current };
    if (text.trim()) next[key] = text;
    else delete next[key];
    onChange(next);
  };
  return (
    <div>
      <div className="mb-2 font-serif text-[12px] tracking-[0.24em]" style={{ color: nsfwAccent }}>
        {title}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {fields.map((field) => {
          const text = typeof current[field.key] === 'string' ? (current[field.key] as string) : '';
          return (
            <div key={field.key}>
              <div className="mb-1 font-serif text-[11px] tracking-[0.16em]" style={{ color: 'rgba(235, 190, 205, 0.72)' }}>
                {field.label}
              </div>
              <textarea
                value={text}
                onChange={(e) => update(field.key, e.target.value)}
                rows={Math.min(4, Math.max(2, Math.ceil((text.length || 1) / 36)))}
                placeholder="暂无"
                className="kaituo-input w-full resize-none px-2 py-1 text-[11px]"
                style={{ clipPath: smallClip }}
                spellCheck={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
