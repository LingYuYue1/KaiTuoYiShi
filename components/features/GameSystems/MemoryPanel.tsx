// 记忆系统面板（v2）。
// 左侧切换 即时 / 短期 / 中期 / 长期，右侧显示条目与整理动作。

import { useState } from 'react';
import {
  MEMORY_DRAFT_ITEM_CHAR_LIMIT,
  MEMORY_DRAFT_MAX_PENDING,
  MEMORY_DRAFT_MAX_TOTAL,
  MEMORY_DRAFT_TOTAL_CHAR_LIMIT,
  记忆压缩层级表,
  type 记忆失败草稿,
  type 记忆系统,
} from '@/models/memory';
import type { 记忆系统设置 } from '@/models/settings';
import {
  checkCompressionThreshold,
  checkMiddleTermThreshold,
  checkLongTermThreshold,
  compressToShortTerm,
  compressToMiddleTerm,
  compressToLongTerm,
} from '@/hooks/useGame/memoryUtils';

interface MemoryPanelProps {
  memorySystem: 记忆系统;
  onMemorySystemChange: React.Dispatch<React.SetStateAction<记忆系统>>;
  turnCount: number;
  settings: 记忆系统设置;
  /** 重试失败的总结批次：走独立工作流事务（S4b）。 */
  onRetryFailedDraft?: (draftId: string) => void | Promise<void>;
  /** 忽略失败草稿：仅归档草稿，不消费原始批次（S4b）。 */
  onIgnoreFailedDraft?: (draftId: string) => void | Promise<void>;
}

type MemoryLayer = 'immediate' | 'short' | 'middle' | 'long' | 'failed';

const cardClip =
  'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const smallClip =
  'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)';

const panelStyle = {
  background:
    'radial-gradient(circle at 10% 0%, rgba(var(--tj-tech-cyan), 0.075), transparent 34%), linear-gradient(180deg, rgba(var(--tj-bubble), 0.96), rgba(var(--tj-surface-strong), 0.94))',
  boxShadow:
    'inset 0 0 0 1px rgba(var(--tj-border), 0.62), 0 14px 32px rgba(var(--tj-shadow), 0.1)',
  clipPath: cardClip,
};

const layerMeta: Record<MemoryLayer, { label: string; subtitle: string; accent: string }> = {
  immediate: { label: '即时', subtitle: '最近几回合的原始记忆', accent: 'rgba(var(--tj-tech-blue),0.9)' },
  short: { label: '短期', subtitle: '已整理的事件摘要', accent: 'rgba(var(--tj-text-secondary), 0.9)' },
  middle: { label: '中期', subtitle: '阶段剧情链与未结事项', accent: 'rgba(var(--tj-ui-success),0.92)' },
  long: { label: '长期', subtitle: '不可忘却的稳定记忆', accent: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92))' },
  failed: { label: '失败草稿', subtitle: '总结失败后保留的原始批次', accent: 'rgba(var(--tj-danger),0.92)' },
};

function getLayerCount(memorySystem: 记忆系统, layer: MemoryLayer): number {
  switch (layer) {
    case 'immediate': return memorySystem.即时记忆.length;
    case 'short': return memorySystem.短期记忆.length;
    case 'middle': return memorySystem.中期记忆.length;
    case 'long': return memorySystem.长期记忆.length;
    case 'failed': return memorySystem.失败草稿.filter((draft) => draft.status === 'pending' || draft.status === 'retrying').length;
  }
}

function getLayerTexts(memorySystem: 记忆系统, layer: MemoryLayer): string[] {
  switch (layer) {
    case 'immediate': return memorySystem.即时记忆;
    case 'short': return memorySystem.短期记忆;
    case 'middle': return memorySystem.中期记忆;
    case 'long': return memorySystem.长期记忆;
    case 'failed': return [];
  }
}

export function MemoryPanel({
  memorySystem,
  onMemorySystemChange,
  turnCount,
  settings,
  onRetryFailedDraft,
  onIgnoreFailedDraft,
}: MemoryPanelProps) {
  const [activeLayer, setActiveLayer] = useState<MemoryLayer>('immediate');

  const visibleTextItems = getLayerTexts(memorySystem, activeLayer);

  const handleCompressShort = () => {
    const threshold = settings.即时转短期阈值;
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

  const handleCompressMiddle = () => {
    const threshold = settings.短期转中期阈值 || 20;
    if (!checkMiddleTermThreshold(memorySystem, threshold)) {
      if (!confirm(`短期记忆不足 ${threshold} 条，仍要压缩当前累积内容到中期？`)) return;
    }
    onMemorySystemChange((prev) => {
      let next = prev;
      if (next.短期记忆.length > 0 && next.短期记忆.length < threshold) {
        return compressToMiddleTerm(next, turnCount, next.短期记忆.length);
      }
      while (next.短期记忆.length >= threshold) {
        next = compressToMiddleTerm(next, turnCount, threshold);
      }
      return next;
    });
  };

  const handleCompressLong = () => {
    const threshold = settings.中期转长期阈值 || 10;
    if (!checkLongTermThreshold(memorySystem, threshold)) {
      if (!confirm(`中期记忆不足 ${threshold} 条，仍要压缩当前累积内容到长期？`)) return;
    }
    onMemorySystemChange((prev) => {
      let next = prev;
      const middle = next.中期记忆;
      if (middle.length > 0 && middle.length < threshold) {
        return compressToLongTerm(next, turnCount, middle.length);
      }
      while (next.中期记忆.length >= threshold) {
        next = compressToLongTerm(next, turnCount, threshold);
      }
      return next;
    });
  };

  const selectedCount = activeLayer === 'failed'
    ? memorySystem.失败草稿.length
    : getLayerCount(memorySystem, activeLayer);

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-3 overflow-x-hidden md:h-full md:min-h-0 md:flex-row md:gap-4 md:overflow-hidden">
      <aside className="flex w-full min-w-0 shrink-0 flex-col gap-3 md:min-h-0 md:w-[260px]">
        <div className="px-4 py-4" style={panelStyle}>
          <SectionHeader title="记忆总览" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricTile label="即时" value={`${memorySystem.即时记忆.length}`} />
            <MetricTile label="短期" value={`${memorySystem.短期记忆.length}`} />
            <MetricTile label="中期" value={`${memorySystem.中期记忆.length}`} />
            <MetricTile label="长期" value={`${memorySystem.长期记忆.length}`} />
            <MetricTile label="NPC" value={`${settings.NPC记忆压缩阈值} 条`} />
            <MetricTile label="失败草稿" value={`${getLayerCount(memorySystem, 'failed')}`} />
          </div>
        </div>

        <div className="px-4 py-3" style={panelStyle}>
          <SectionHeader title="层级切换" />
          <div className="mt-3 grid gap-2 sm:grid-cols-3 md:grid-cols-1">
            {(Object.keys(layerMeta) as MemoryLayer[]).map((layer) => {
              const meta = layerMeta[layer];
              const active = activeLayer === layer;
              const count = getLayerCount(memorySystem, layer);
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
                      ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.58), inset 3px 0 0 linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))'
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

      <main className="min-h-0 w-full min-w-0 flex-1 overflow-visible pr-0 md:overflow-y-auto md:pr-1">
        <div className="min-h-full px-3 py-3 md:px-5 md:py-5" style={panelStyle}>
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
                <ActionButton onClick={handleCompressShort}>
                  压缩到短期
                </ActionButton>
              )}
              {activeLayer === 'short' && (
                <ActionButton onClick={handleCompressMiddle}>
                  压缩到中期
                </ActionButton>
              )}
              {activeLayer === 'middle' && (
                <ActionButton onClick={handleCompressLong}>
                  压缩到长期
                </ActionButton>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2">
            {activeLayer === 'failed' ? (
              memorySystem.失败草稿.length === 0 ? (
                <EmptyNotice title="没有失败草稿" text="记忆总结失败时，原始批次会保留在这里，可重试或忽略。" />
              ) : (
                memorySystem.失败草稿.map((draft) => (
                  <MemoryDraftRow
                    key={draft.id}
                    draft={draft}
                    onRetry={onRetryFailedDraft}
                    onIgnore={onIgnoreFailedDraft}
                  />
                ))
              )
            ) : visibleTextItems.length === 0 ? (
              <EmptyNotice title="空" text="这一层目前没有内容。" />
            ) : (
              visibleTextItems.map((item, index) => (
                <MemoryRow key={`${activeLayer}-${index}-${item}`} index={index} text={item} />
              ))
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3 md:grid-cols-1 xl:grid-cols-3">
            {activeLayer === 'failed' ? (
              <>
                <HintCard title="待处理上限" value={`${MEMORY_DRAFT_MAX_PENDING} 条`} text="超出后自动裁掉最旧的待处理草稿。" />
                <HintCard title="快照边界" value={`${MEMORY_DRAFT_ITEM_CHAR_LIMIT} / ${MEMORY_DRAFT_TOTAL_CHAR_LIMIT} 字`} text="单条与整批超界时不建草稿，直接用本地摘要。" />
                <HintCard title="归档上限" value={`${MEMORY_DRAFT_MAX_TOTAL} 条`} text="已归档与已忽略的草稿按最旧优先清理。" />
              </>
            ) : (
              <>
                <HintCard title="即时阈值" value={`${settings.即时转短期阈值} 条`} text="达到后会自动压缩到短期。" />
                <HintCard title="短期阈值" value={`${settings.短期转中期阈值} 条`} text="达到后会自动压缩到中期。" />
                <HintCard title="中期阈值" value={`${settings.中期转长期阈值} 条`} text="达到后会自动压缩到长期。" />
                <HintCard title="NPC 阈值" value={`${settings.NPC记忆压缩阈值} 条`} text="伙伴的与你同行的记忆达到后会自动压缩。" />
              </>
            )}
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

const DRAFT_STATUS_META: Record<记忆失败草稿['status'], { label: string; color: string }> = {
  pending: { label: '待处理', color: 'rgba(var(--tj-danger), 0.92)' },
  retrying: { label: '重试中', color: 'rgba(var(--tj-accent-primary), 0.92)' },
  resolved: { label: '已归档', color: 'rgba(var(--tj-ui-success), 0.92)' },
  ignored: { label: '已忽略', color: 'rgba(var(--tj-text-secondary), 0.7)' },
};

function MemoryDraftRow({
  draft,
  onRetry,
  onIgnore,
}: {
  draft: 记忆失败草稿;
  onRetry?: (draftId: string) => void | Promise<void>;
  onIgnore?: (draftId: string) => void | Promise<void>;
}) {
  const retrying = draft.status === 'retrying';
  const actionable = draft.status === 'pending' || retrying;
  const statusMeta = DRAFT_STATUS_META[draft.status];
  return (
    <div
      className="px-3 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-bubble),0.84), rgba(var(--tj-surface-strong),0.56))',
        boxShadow: 'inset 2px 0 0 rgba(var(--tj-danger), 0.7), inset 0 0 0 1px rgba(var(--tj-border), 0.48)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-serif text-[12px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
          {记忆压缩层级表[draft.kind].标签} · 第 {draft.turn} 回合
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-serif text-[11px] tracking-[0.14em]" style={{ color: statusMeta.color }}>
            {statusMeta.label}
          </span>
          {actionable && (
            <>
              <ActionButton onClick={() => void onRetry?.(draft.id)} disabled={retrying}>
                {retrying ? '重试中…' : '重试'}
              </ActionButton>
              <ActionButton onClick={() => void onIgnore?.(draft.id)} disabled={retrying}>
                忽略
              </ActionButton>
            </>
          )}
        </div>
      </div>
      <div className="mt-1.5 whitespace-pre-wrap break-words font-serif text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.9)' }}>
        {draft.failureMessage || '记忆总结失败。'}
      </div>
      <div className="mt-1 font-serif text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
        失败次数 {draft.attemptCount} · {new Date(draft.updatedAt).toLocaleString()}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer font-serif text-[11px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.8)' }}>
          原始材料（{draft.items.length} 条）
        </summary>
        <div className="mt-2 grid gap-1.5">
          {draft.items.map((item, index) => (
            <div
              key={`${draft.id}-${index}`}
              className="whitespace-pre-wrap break-words px-2 py-1.5 font-serif text-[12px] leading-relaxed"
              style={{ background: 'rgba(var(--tj-text-secondary), 0.05)', color: 'rgba(var(--tj-text-primary), 0.88)', clipPath: smallClip }}
            >
              {index + 1}. {item}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function HintCard({ title, value, text }: { title: string; value: string; text: string }) {  return (
    <div
      className="px-3 py-3"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.05)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-[12px] tracking-[0.18em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.92), rgba(var(--tj-accent-secondary),0.88))' }}>
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
      <div className="font-serif text-[15px] font-semibold tracking-[0.18em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
        {title}
      </div>
      <div className="mt-2 font-serif text-[13px] leading-relaxed tracking-wider" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
        {text}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-serif text-[12px] tracking-[0.18em] px-3 py-1.5 transition-all hover:bg-[rgba(var(--tj-accent-primary),0.08)] disabled:opacity-50"
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
