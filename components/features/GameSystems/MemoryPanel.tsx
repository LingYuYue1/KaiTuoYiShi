// 记忆系统面板（v2）。
// 左侧切换 即时 / 短期 / 长期，右侧显示条目与整理动作。

import { useState } from 'react';
import type { 记忆系统 } from '@/models/memory';
import type { 记忆系统设置 } from '@/models/settings';
import {
  checkCompressionThreshold,
  checkLongTermThreshold,
  compressToShortTerm,
  compressToLongTerm,
} from '@/hooks/useGame/memoryUtils';

interface MemoryPanelProps {
  memorySystem: 记忆系统;
  onMemorySystemChange: React.Dispatch<React.SetStateAction<记忆系统>>;
  turnCount: number;
  settings: 记忆系统设置;
}

type MemoryLayer = 'immediate' | 'short' | 'long';

const cardClip =
  'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const smallClip =
  'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)';

const panelStyle = {
  background:
    'radial-gradient(circle at 10% 0%, rgba(117, 214, 216, 0.075), transparent 34%), linear-gradient(180deg, rgba(var(--tj-bubble), 0.96), rgba(var(--tj-surface-strong), 0.94))',
  boxShadow:
    'inset 0 0 0 1px rgba(var(--tj-border), 0.62), 0 14px 32px rgba(var(--tj-shadow), 0.1)',
  clipPath: cardClip,
};

const layerMeta: Record<MemoryLayer, { label: string; subtitle: string; accent: string }> = {
  immediate: { label: '即时', subtitle: '最近几回合的原始记忆', accent: 'rgba(180, 200, 220, 0.9)' },
  short: { label: '短期', subtitle: '已整理的事件摘要', accent: 'rgba(var(--tj-text-secondary), 0.9)' },
  long: { label: '长期', subtitle: '不可忘却的稳定记忆', accent: 'rgba(var(--tj-accent-primary), 0.95)' },
};

export function MemoryPanel({ memorySystem, onMemorySystemChange, turnCount, settings }: MemoryPanelProps) {
  const [activeLayer, setActiveLayer] = useState<MemoryLayer>('immediate');

  const visibleTextItems =
    activeLayer === 'immediate'
      ? memorySystem.即时记忆
      : activeLayer === 'short'
        ? memorySystem.短期记忆
        : memorySystem.长期记忆;

  const handleCompressShort = () => {
    const threshold = settings.即时转短期阈值 || 25;
    if (!checkCompressionThreshold(memorySystem, threshold)) {
      if (!confirm(`即时记忆不足 ${threshold} 条，仍要压缩当前累积内容到短期？`)) return;
    }
    onMemorySystemChange((prev) => {
      let next = prev;
      if (next.即时记忆.length > 0 && next.即时记忆.length < threshold) {
        return compressToShortTerm(next, turnCount, next.即时记忆.length);
      }
      while (next.即时记忆.length >= threshold) {
        next = compressToShortTerm(next, turnCount, threshold);
      }
      return next;
    });
  };

  const handleCompressLong = () => {
    const threshold = settings.短期转长期阈值 || 40;
    if (!checkLongTermThreshold(memorySystem, threshold)) {
      if (!confirm(`短期记忆不足 ${threshold} 条，仍要压缩当前累积内容到长期？`)) return;
    }
    onMemorySystemChange((prev) => {
      let next = prev;
      if (next.短期记忆.length > 0 && next.短期记忆.length < threshold) {
        return compressToLongTerm(next, turnCount, next.短期记忆.length);
      }
      while (next.短期记忆.length >= threshold) {
        next = compressToLongTerm(next, turnCount, threshold);
      }
      return next;
    });
  };

  const selectedCount =
    activeLayer === 'immediate'
      ? memorySystem.即时记忆.length
      : activeLayer === 'short'
        ? memorySystem.短期记忆.length
        : memorySystem.长期记忆.length;

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-[260px] min-h-0 shrink-0 flex-col gap-3">
        <div className="px-4 py-4" style={panelStyle}>
          <SectionHeader title="记忆总览" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricTile label="即时" value={`${memorySystem.即时记忆.length}`} />
            <MetricTile label="短期" value={`${memorySystem.短期记忆.length}`} />
            <MetricTile label="长期" value={`${memorySystem.长期记忆.length}`} />
            <MetricTile label="NPC" value={`${settings.NPC记忆压缩阈值} 条`} />
          </div>
        </div>

        <div className="px-4 py-3" style={panelStyle}>
          <SectionHeader title="层级切换" />
          <div className="mt-3 grid gap-2">
            {(Object.keys(layerMeta) as MemoryLayer[]).map((layer) => {
              const meta = layerMeta[layer];
              const active = activeLayer === layer;
              const count =
                layer === 'immediate'
                  ? memorySystem.即时记忆.length
                  : layer === 'short'
                    ? memorySystem.短期记忆.length
                    : memorySystem.长期记忆.length;
              return (
                <button
                  key={layer}
                  type="button"
                  onClick={() => setActiveLayer(layer)}
                  className="w-full px-3 py-2.5 text-left transition-all hover:bg-[rgba(var(--tj-accent-primary),0.08)]"
                  style={{
                    background: active
                      ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.16), rgba(var(--tj-accent-primary), 0.04))'
                      : 'rgba(var(--tj-text-secondary), 0.04)',
                    boxShadow: active
                      ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.58), inset 3px 0 0 rgba(var(--tj-accent-primary), 0.9)'
                      : 'inset 0 0 0 1px rgba(var(--tj-text-secondary), 0.18)',
                    clipPath: smallClip,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="font-serif text-[13px] tracking-[0.2em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.88)' }}
                    >
                      {meta.label}
                    </span>
                    <span
                      className="font-serif text-[12px]"
                      style={{ color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(210, 198, 168, 0.8)' }}
                    >
                      {count}
                    </span>
                  </div>
                  <div
                    className="mt-1 truncate font-serif text-[11px]"
                    style={{ color: 'rgba(var(--tj-text-secondary), 0.74)' }}
                  >
                    {meta.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="min-h-full px-5 py-5" style={panelStyle}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <SectionHeader title="记忆条目" />
              <div className="mt-2 font-serif text-[14px] tracking-[0.18em]" style={{ color: layerMeta[activeLayer].accent }}>
                {layerMeta[activeLayer].label} · {selectedCount} 条
              </div>
              <div className="mt-1 font-serif text-[12px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                {layerMeta[activeLayer].subtitle}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {activeLayer === 'immediate' && (
                <ActionButton onClick={handleCompressShort} tone="gold">
                  压缩到短期
                </ActionButton>
              )}
              {activeLayer === 'short' && (
                <ActionButton onClick={handleCompressLong} tone="gold">
                  压缩到长期
                </ActionButton>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2">
            {visibleTextItems.length === 0 ? (
              <EmptyNotice title="空" text="这一层目前没有内容。" />
            ) : (
              visibleTextItems.map((item, index) => (
                <MemoryRow key={`${activeLayer}-${index}-${item}`} index={index} text={item} />
              ))
            )}
          </div>

          <div className="mt-4 grid gap-2 xl:grid-cols-3">
            <HintCard title="即时阈值" value={`${settings.即时转短期阈值} 条`} text="达到后会自动压缩到短期。" />
            <HintCard title="短期阈值" value={`${settings.短期转长期阈值} 条`} text="达到后会自动压缩到长期。" />
            <HintCard title="NPC 阈值" value={`${settings.NPC记忆压缩阈值} 条`} text="伙伴的与你同行的记忆达到后会自动压缩。" />
          </div>
        </div>
      </main>
    </div>
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

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.055)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[12px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
        {label}
      </div>
      <div className="mt-1 truncate font-serif text-[15px] font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        {value}
      </div>
    </div>
  );
}

function MemoryRow({ index, text }: { index: number; text: string }) {
  return (
    <div
      className="px-3 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-bubble),0.84), rgba(var(--tj-surface-strong),0.56))',
        boxShadow: 'inset 2px 0 0 rgba(var(--tj-accent-primary), 0.6), inset 0 0 0 1px rgba(var(--tj-border), 0.48)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
        #{index + 1}
      </div>
      <div className="mt-1 whitespace-pre-wrap break-words font-serif text-[13px] leading-relaxed tracking-[0.04em]" style={{ color: 'rgba(var(--tj-text-primary), 0.95)' }}>
        {text}
      </div>
    </div>
  );
}

function HintCard({ title, value, text }: { title: string; value: string; text: string }) {
  return (
    <div
      className="px-3 py-3"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.05)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.88)' }}>
        {title}
      </div>
      <div className="mt-1 font-serif text-[14px] font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        {value}
      </div>
      <div className="mt-1 font-serif text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
        {text}
      </div>
    </div>
  );
}

function EmptyNotice({ title, text }: { title: string; text: string }) {
  return (
    <div
      className="px-4 py-5 text-center"
      style={{
        background: 'rgba(var(--tj-text-secondary), 0.055)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-secondary), 0.2)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[15px] font-semibold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
        {title}
      </div>
      <div className="mt-2 font-serif text-[13px] leading-relaxed tracking-wider" style={{ color: 'rgba(210, 198, 168, 0.82)' }}>
        {text}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  tone,
  children,
}: {
  onClick: () => void;
  tone: 'gold';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-serif text-[12px] tracking-[0.18em] px-3 py-1.5 transition-all hover:bg-[rgba(var(--tj-accent-primary),0.08)]"
      style={{
        color: 'rgb(var(--tj-text-primary))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.4)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}
