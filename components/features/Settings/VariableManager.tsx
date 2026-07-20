import { useMemo, useState } from 'react';

type SystemKey = 'traveler' | 'world' | 'memory' | 'yiting' | 'phone' | 'npc' | 'news' | 'zhiku' | 'storyWeaving';

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
}

const systems: ReadonlyArray<Readonly<{ key: SystemKey; label: string; description: string }>> = [
  { key: 'traveler', label: '旅人', description: '档案、命途、战技与背包' },
  { key: 'world', label: '世界', description: '时间、地点与已成立事实' },
  { key: 'memory', label: '记忆', description: '即时、短期、中期与长期记忆' },
  { key: 'yiting', label: '忆庭', description: '回忆档案与召回索引' },
  { key: 'phone', label: '手机', description: '联系人、会话与来信种子' },
  { key: 'npc', label: '伙伴', description: 'NPC 档案与同行记忆' },
  { key: 'news', label: '周报', description: '新闻条目与事件档案' },
  { key: 'zhiku', label: '智库', description: '会话内已解锁资料' },
  { key: 'storyWeaving', label: '剧情编织', description: '剧情系列与运行锚点' },
];

function readValue(props: Props, key: SystemKey): unknown {
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

function valueCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return value == null ? 0 : 1;
}

export function VariableManagerTab(props: Props) {
  const [activeKey, setActiveKey] = useState<SystemKey>('traveler');
  const active = systems.find((system) => system.key === activeKey) ?? systems[0];
  const value = readValue(props, active.key);
  const json = useMemo(() => JSON.stringify(value, null, 2), [value]);

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="space-y-2 rounded-xl border border-[rgba(var(--tj-accent-primary),0.16)] bg-[rgba(var(--tj-bg-secondary),0.42)] p-3">
        <div className="px-1 pb-2">
          <h3 className="font-serif text-base font-bold tracking-[0.2em]">会话投影</h3>
          <p className="mt-1 text-xs text-[rgba(var(--tj-text-secondary),0.68)]">
            这里展示内核已提交的只读投影。修改请使用对应功能面板。
          </p>
        </div>
        {systems.map((system) => {
          const selected = system.key === activeKey;
          return (
            <button
              key={system.key}
              type="button"
              onClick={() => setActiveKey(system.key)}
              className="w-full rounded-lg px-3 py-2.5 text-left"
              style={{
                background: selected ? 'rgba(var(--tj-tech-cyan),0.16)' : 'rgba(var(--tj-bg-secondary),0.32)',
                boxShadow: selected ? 'inset 3px 0 0 rgba(var(--tj-tech-cyan),0.9)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.1)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-sm font-bold">{system.label}</span>
                <span className="font-mono text-[11px] text-[rgba(var(--tj-text-secondary),0.58)]">{valueCount(readValue(props, system.key))}</span>
              </div>
              <div className="mt-0.5 truncate text-xs text-[rgba(var(--tj-text-secondary),0.58)]">{system.description}</div>
            </button>
          );
        })}
      </aside>

      <section className="min-w-0 rounded-xl border border-[rgba(var(--tj-accent-primary),0.16)] bg-[rgba(var(--tj-bg-secondary),0.42)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-serif text-lg font-bold tracking-[0.18em]">{active.label}</h3>
            <p className="mt-1 text-xs text-[rgba(var(--tj-text-secondary),0.65)]">{active.description}</p>
          </div>
          <span className="rounded px-2 py-1 text-xs text-[rgba(var(--tj-tech-cyan),0.9)] ring-1 ring-[rgba(var(--tj-tech-cyan),0.28)]">只读投影</span>
        </div>
        <pre className="max-h-[64vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[rgba(var(--tj-bg-primary),0.45)] p-4 font-mono text-xs leading-relaxed text-[rgba(var(--tj-text-primary),0.88)]">
          {json}
        </pre>
      </section>
    </div>
  );
}
