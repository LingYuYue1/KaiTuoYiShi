// 记忆系统面板（v2）。
// 左侧切换 即时 / 短期 / 中期 / 长期，右侧显示条目与整理动作。

import { useState } from 'react';
import { MEMORY_LAYER_COMPRESSION_THRESHOLD, type 记忆失败草稿, type 记忆系统 } from '@/models/memory';
import type { 记忆系统设置 } from '@/models/settings';
import {
  checkCompressionThreshold,
  checkMiddleTermThreshold,
  checkLongTermThreshold,
  compressToShortTerm,
  compressToMiddleTerm,
  compressToLongTerm,
  拆分即时与短期,
} from '@/hooks/useGame/memoryUtils';

interface MemoryPanelProps {
  memorySystem: 记忆系统;
  onMemorySystemChange: React.Dispatch<React.SetStateAction<记忆系统>>;
  turnCount: number;
  settings: 记忆系统设置;
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
  failed: { label: '失败草稿', subtitle: '总结失败后保留的原始材料', accent: 'rgba(var(--tj-danger),0.92)' },
};

export function MemoryPanel({
  memorySystem,
  onMemorySystemChange,
  turnCount,
  settings,
  failedDrafts: failedDraftsProp,
  onRetryFailedDraft,
  onIgnoreFailedDraft,
  onOpenBatchRebuild,
  onTriggerManualCompress,
}: MemoryPanelProps & {
  failedDrafts?: 记忆失败草稿[];
  onRetryFailedDraft?: (draft: 记忆失败草稿) => void;
  onIgnoreFailedDraft?: (draft: 记忆失败草稿) => void;
  onOpenBatchRebuild?: () => void;
  /** 阶段1·主链压缩手动入口：玩家点击后触发三阶段压缩弹窗（remind→processing→review） */
  onTriggerManualCompress?: () => void;
}) {
  const [activeLayer, setActiveLayer] = useState<MemoryLayer>('immediate');
  const failedDrafts = failedDraftsProp ?? memorySystem.失败草稿 ?? [];

  const visibleTextItems =
    activeLayer === 'immediate'
      ? memorySystem.即时记忆.map((item) => {
          // 对标参考项目：即时条目为「即时内容 + 短期摘要」合体存储，展示时拆开。
          const { 即时内容, 短期摘要 } = 拆分即时与短期(item);
          return 短期摘要 ? `${即时内容}\n  ↳ 短期摘要：${短期摘要}` : 即时内容;
        })
      : activeLayer === 'short'
        ? memorySystem.短期记忆
        : activeLayer === 'middle'
          ? (memorySystem.中期记忆 ?? [])
          : activeLayer === 'long'
            ? memorySystem.长期记忆
            : [];

  const handleCompressShort = () => {
    const threshold = settings.即时转短期阈值 || MEMORY_LAYER_COMPRESSION_THRESHOLD;
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
    const threshold = settings.短期转中期阈值 || settings.短期转长期阈值 || MEMORY_LAYER_COMPRESSION_THRESHOLD;
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
    const threshold = settings.中期转长期阈值 || MEMORY_LAYER_COMPRESSION_THRESHOLD;
    if (!checkLongTermThreshold(memorySystem, threshold)) {
      if (!confirm(`中期记忆不足 ${threshold} 条，仍要压缩当前累积内容到长期？`)) return;
    }
    onMemorySystemChange((prev) => {
      let next = prev;
      const middle = next.中期记忆 ?? [];
      if (middle.length > 0 && middle.length < threshold) {
        return compressToLongTerm(next, turnCount, middle.length);
      }
      while ((next.中期记忆 ?? []).length >= threshold) {
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
        : activeLayer === 'middle'
          ? (memorySystem.中期记忆 ?? []).length
          : activeLayer === 'long'
            ? memorySystem.长期记忆.length
            : failedDrafts.filter((draft) => draft.status === 'pending' || draft.status === 'retrying').length;

  // 阶段1·主链压缩手动入口：计算各层待压缩条数，用于按钮高亮/灰显
  const apiSummaryEnabled = (settings as 记忆系统设置 & { 启用中短长期API总结?: boolean }).启用中短长期API总结 !== false;
  const manualImmediateThreshold = settings.即时转短期阈值 ?? 10;
  const manualShortThreshold = settings.短期转中期阈值 ?? 30;
  const manualMiddleThreshold = settings.中期转长期阈值 ?? 50;
  const manualImmediatePending = Math.max(0, memorySystem.即时记忆.length - manualImmediateThreshold + 1);
  const manualShortPending = Math.max(0, memorySystem.短期记忆.length - manualShortThreshold + 1);
  const manualMiddlePending = Math.max(0, (memorySystem.中期记忆 ?? []).length - manualMiddleThreshold + 1);
  const manualNeedsCompression = apiSummaryEnabled
    && (manualImmediatePending > 0 || manualShortPending > 0 || manualMiddlePending > 0);

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-3 overflow-x-hidden md:h-full md:min-h-0 md:flex-row md:gap-4 md:overflow-hidden">
      <aside className="flex w-full min-w-0 shrink-0 flex-col gap-3 md:min-h-0 md:w-[260px]">
        <div className="px-4 py-4" style={panelStyle}>
          <SectionHeader title="记忆总览" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricTile label="即时" value={`${memorySystem.即时记忆.length}`} />
            <MetricTile label="短期" value={`${memorySystem.短期记忆.length}`} />
            <MetricTile label="中期" value={`${(memorySystem.中期记忆 ?? []).length}`} />
            <MetricTile label="长期" value={`${memorySystem.长期记忆.length}`} />
            <MetricTile label="失败草稿" value={`${failedDrafts.filter((draft) => draft.status !== 'resolved' && draft.status !== 'ignored').length}`} />
            <MetricTile label="NPC" value={`${settings.NPC记忆压缩阈值} 条`} />
          </div>
        </div>

        <div className="px-4 py-3" style={panelStyle}>
          <SectionHeader title="层级切换" />
            <div className="mt-3 grid gap-2 sm:grid-cols-3 md:grid-cols-1">
            {(Object.keys(layerMeta) as MemoryLayer[]).map((layer) => {
              const meta = layerMeta[layer];
              const active = activeLayer === layer;
              const count =
                layer === 'immediate'
                  ? memorySystem.即时记忆.length
                  : layer === 'short'
                    ? memorySystem.短期记忆.length
                    : layer === 'middle'
                      ? (memorySystem.中期记忆 ?? []).length
                      : layer === 'long'
                        ? memorySystem.长期记忆.length
                        : failedDrafts.filter((draft) => draft.status !== 'resolved' && draft.status !== 'ignored').length;
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
              {onTriggerManualCompress && (
                <ActionButton
                  onClick={onTriggerManualCompress}
                  tone="gold"
                  disabled={!manualNeedsCompression}
                >
                  {manualNeedsCompression
                    ? `立即压缩记忆（即${manualImmediatePending}/短${manualShortPending}/中${manualMiddlePending}）`
                    : '暂无需压缩'}
                </ActionButton>
              )}
              {onOpenBatchRebuild && (
                <ActionButton onClick={onOpenBatchRebuild} tone="gold">
                  批量重建记忆
                </ActionButton>
              )}
              {activeLayer === 'immediate' && (
                <ActionButton onClick={handleCompressShort} tone="gold">
                  压缩到短期
                </ActionButton>
              )}
              {activeLayer === 'short' && (
                <ActionButton onClick={handleCompressMiddle} tone="gold">
                  压缩到中期
                </ActionButton>
              )}
              {activeLayer === 'middle' && (
                <ActionButton onClick={handleCompressLong} tone="gold">
                  压缩到长期
                </ActionButton>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2">
            {activeLayer === 'failed' ? (
              <FailedDraftList
                drafts={failedDrafts}
                onRetry={onRetryFailedDraft}
                onIgnore={onIgnoreFailedDraft}
                onBatchRebuild={onOpenBatchRebuild}
              />
            ) : visibleTextItems.length === 0 ? (
              <EmptyNotice title="空" text="这一层目前没有内容。" />
            ) : (
              visibleTextItems.map((item, index) => (
                <MemoryRow key={`${activeLayer}-${index}-${item}`} index={index} text={item} />
              ))
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3 md:grid-cols-1 xl:grid-cols-3">
            <HintCard title="即时阈值" value={`${settings.即时转短期阈值} 条`} text="达到后会自动压缩到短期。" />
            <HintCard title="短期阈值" value={`${settings.短期转中期阈值} 条`} text="达到后会自动压缩到中期。" />
            <HintCard title="中期阈值" value={`${settings.中期转长期阈值} 条`} text="达到后会自动压缩到长期。" />
            <HintCard title="NPC 阈值" value={`${settings.NPC记忆压缩阈值} 条`} text="伙伴的与你同行的记忆达到后会自动压缩。" />
            <HintCard title="主剧情注入" value="短 30 / 中全量 / 长全量" text="对标参考项目：短期注入最近 30 条（带时间戳），中期/长期全量注入；回忆召回命中时暂停三层记忆注入；即时层为滑动窗口（超限摘要自动滚入短期）。" />
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

function FailedDraftList({
  drafts,
  onRetry,
  onIgnore,
  onBatchRebuild,
}: {
  drafts: 记忆失败草稿[];
  onRetry?: (draft: 记忆失败草稿) => void;
  onIgnore?: (draft: 记忆失败草稿) => void;
  onBatchRebuild?: () => void;
}) {
  if (drafts.length === 0) {
    return <EmptyNotice title="没有失败草稿" text="总结失败时，系统会把本次请求的完整原始材料保存在这里。" />;
  }

  return (
    <div className="grid gap-3">
      <div
        className="px-3 py-2 text-[12px] leading-relaxed"
        style={{
          color: 'rgba(var(--tj-text-secondary), 0.84)',
          background: 'rgba(var(--tj-danger), 0.06)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.2)',
          clipPath: smallClip,
        }}
      >
        这里保留的是每次总结失败时真正送入模型的完整批次材料。例如第 1—15 回合失败，草稿就会保存这 15 回合的原始内容；重试不会重新读取后来变化的正文。
      </div>
      {drafts.map((draft) => (
        <FailedDraftRow key={draft.id} draft={draft} onRetry={onRetry} onIgnore={onIgnore} onBatchRebuild={onBatchRebuild} />
      ))}
    </div>
  );
}

function FailedDraftRow({
  draft,
  onRetry,
  onIgnore,
  onBatchRebuild,
}: {
  draft: 记忆失败草稿;
  onRetry?: (draft: 记忆失败草稿) => void;
  onIgnore?: (draft: 记忆失败草稿) => void;
  onBatchRebuild?: () => void;
}) {
  const pending = draft.status === 'pending' || draft.status === 'retrying';
  const retrying = draft.status === 'retrying';
  const statusLabel = draft.status === 'pending' ? '待处理' : draft.status === 'retrying' ? '重试中' : draft.status === 'resolved' ? '已修复' : '已忽略';
  const layerLabel = draft.targetLayer || (draft.kind === 'short' ? '短期记忆' : draft.kind === 'middle' ? '中期记忆' : '长期记忆');
  const dateLabel = draft.createdAt ? new Date(draft.createdAt).toLocaleString() : '未知时间';

  return (
    <article
      className="px-3 py-3"
      style={{
        background: pending
          ? 'linear-gradient(135deg, rgba(var(--tj-danger),0.12), rgba(var(--tj-surface-strong),0.56))'
          : 'rgba(var(--tj-text-secondary), 0.045)',
        boxShadow: `inset 2px 0 0 ${pending ? 'rgba(var(--tj-danger), 0.82)' : 'rgba(var(--tj-text-secondary), 0.36)'}, inset 0 0 0 1px rgba(var(--tj-border), 0.48)`,
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-serif text-[13px] font-semibold tracking-[0.12em]" style={{ color: pending ? 'rgba(var(--tj-danger), 0.96)' : 'rgb(var(--tj-text-primary))' }}>
          {draft.sourceTurns.start}—{draft.sourceTurns.end} 回合 · {layerLabel}
        </div>
        <span className="font-serif text-[11px]" style={{ color: pending ? 'rgba(var(--tj-danger), 0.9)' : 'rgba(var(--tj-text-secondary), 0.72)' }}>
          {statusLabel}
        </span>
      </div>
      <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
        {draft.failureCode} · {dateLabel} · 已尝试 {draft.attemptCount} 次
      </div>
      <div className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.9)' }}>
        {draft.failureMessage || '总结接口未返回可用内容。'}
      </div>
      {draft.fallbackSummary && (
        <div className="mt-2 border-l-2 border-[rgba(var(--tj-accent-primary),0.35)] pl-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.84)' }}>
          当前本地摘要：{draft.fallbackSummary}
        </div>
      )}
      <details className="mt-2 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
        <summary className="cursor-pointer select-none">查看原始材料快照</summary>
        <div className="mt-1 leading-relaxed">
          已保存 {draft.sourceSnapshot.itemCount} 条完整材料（{draft.sourceSnapshot.encoding === 'gzip-base64' ? '压缩存储' : '原文存储'}，{draft.sourceSnapshot.uncompressedBytes.toLocaleString()} bytes）。展开和重试时才会按需读取，不会一次性解压全部草稿。
        </div>
      </details>
      {pending && (
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton
            onClick={() => draft.origin === 'batch_rebuild' ? onBatchRebuild?.() : onRetry?.(draft)}
            tone="gold"
            disabled={draft.origin === 'batch_rebuild' ? !onBatchRebuild : !onRetry || retrying}
          >
            {retrying ? '重试中...' : draft.origin === 'batch_rebuild' ? '重新批量重建' : '重新总结'}
          </ActionButton>
          <ActionButton onClick={() => onIgnore?.(draft)} tone="gold" disabled={!onIgnore || retrying}>
            忽略
          </ActionButton>
        </div>
      )}
    </article>
  );
}

function ActionButton({
  onClick,
  tone,
  children,
  disabled = false,
}: {
  onClick: () => void;
  tone: 'gold';
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-serif text-[12px] tracking-[0.18em] px-3 py-1.5 transition-all hover:bg-[rgba(var(--tj-accent-primary),0.08)] disabled:cursor-not-allowed disabled:opacity-45"
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
