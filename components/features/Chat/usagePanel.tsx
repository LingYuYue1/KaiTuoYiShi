import type { ReactNode } from 'react';
import type { 聊天消息 } from '@/models/chat';
import { 格式化时间戳 } from '@/utils/format';
import { formatTokenCount } from '@/utils/tokenEstimate';
import { 构建缓存优化提示 } from '@/utils/cacheOptimizationHint';
import { mediumClip, smallClip } from './turnStyles';

export function UsagePanel({ message, onClose }: { message: 聊天消息; onClose: () => void }) {
  const usage = message.tokenUsage;
  const inputTokens = usage?.inputTokens ?? message.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? message.outputTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;
  const cachedTokens = usage?.cachedTokens;
  const uncachedTokens = usage?.uncachedTokens;
  const sourceLabel = usage?.source === 'api' ? 'API返回' : usage?.source === 'mixed' ? '混合' : '本地估算';
  const timeText = 格式化时间戳(message.timestamp);
  const turn = message.gameTime ?? '?';
  const cacheKnown = typeof cachedTokens === 'number' || typeof uncachedTokens === 'number' || typeof usage?.cacheHitRate === 'number';
  const usageFormat = usage?.usageFormat ?? '未记录';
  const usagePath = usage?.usagePath ?? '未记录';
  const rawUsageKeys = usage?.rawUsageKeys?.length
    ? usage.rawUsageKeys.join(', ')
    : usage?.rawUsage && typeof usage.rawUsage === 'object'
      ? Object.keys(usage.rawUsage).sort().join(', ')
      : '未记录';
  const cacheDiagnostic = usage?.cacheDiagnostic
    ?? (usage?.rawUsage !== undefined
      ? 'API 已返回 usage，但没有可识别的缓存统计字段。'
      : '当前回合没有 API usage 原始字段，只能显示本地估算。');
  const cacheOptimizationHint = 构建缓存优化提示({
    provider: usage?.provider,
    model: usage?.model,
    inputTokens,
    cachedTokens,
    uncachedTokens,
    cacheHitRate: usage?.cacheHitRate,
    cacheKnown,
  });
  const cachePrefixDiagnostics = message.debugContext?.cachePrefixDiagnostics;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 font-serif text-[15px]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>◷</span>
          <div>
            <div className="font-serif text-[13px] font-semibold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.95)' }}>
              第 {turn} 回合
            </div>
            <div className="mt-0.5 text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
              响应详情 · {sourceLabel}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center text-xs transition-opacity hover:opacity-85"
          style={{
            color: 'rgba(var(--tj-text-secondary),0.8)',
            background: 'rgba(var(--tj-bg-primary),0.24)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.34)',
            clipPath: smallClip,
          }}
          title="关闭响应详情"
        >
          ×
        </button>
      </div>

      <div className="mt-3 grid gap-2.5">
        <UsageSection title="时间">
          <div className="space-y-1 text-xs leading-relaxed">
            <div>
              <span style={{ color: 'rgba(var(--tj-text-secondary),0.74)' }}>时间</span>
              <div className="mt-0.5 font-mono text-[12px]" style={{ color: 'rgba(var(--tj-text-primary),0.94)' }}>{timeText}</div>
            </div>
            <div>
              <span style={{ color: 'rgba(var(--tj-text-secondary),0.74)' }}>耗时</span>
              <span className="ml-2 font-mono" style={{ color: 'rgba(var(--tj-btn-primary-start),0.9)' }}>
                {message.responseDurationSec !== undefined ? `${message.responseDurationSec.toFixed(1)} 秒` : '未记录'}
              </span>
            </div>
          </div>
        </UsageSection>

        <UsageSection title="Tokens">
          <div className="grid grid-cols-3 gap-2 text-center">
            <UsageMetric label="输入" value={inputTokens ? formatTokenCount(inputTokens) : '0'} tone="neutral" />
            <UsageMetric label="输出" value={outputTokens ? formatTokenCount(outputTokens) : '0'} tone="primary" />
            <UsageMetric label="总计" value={totalTokens ? formatTokenCount(totalTokens) : '0'} tone="gold" />
          </div>
        </UsageSection>

        <UsageSection title="缓存" highlighted>
          <div className="grid grid-cols-2 gap-2 text-center">
            <UsageMetric label="命中" value={typeof cachedTokens === 'number' ? formatTokenCount(cachedTokens) : '未返回'} tone="green" />
            <UsageMetric label="未命中" value={typeof uncachedTokens === 'number' ? formatTokenCount(uncachedTokens) : '未返回'} tone="red" />
          </div>
          <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
            {cacheKnown
              ? `缓存字段来自 ${sourceLabel}${usage?.cacheHitRate !== undefined ? `，命中率 ${(usage.cacheHitRate * 100).toFixed(1)}%` : ''}。`
              : usage?.rawUsage !== undefined
                ? `${cacheDiagnostic} Gemini 原生缓存统计通常是 usageMetadata.cachedContentTokenCount；若原始 usage 只有 prompt_tokens / completion_tokens / total_tokens，说明当前接口或中转未透传缓存命中。`
                : '当前接口没有返回缓存字段；输入/输出 token 仍可查看，缓存命中不做本地猜测。'}
          </div>
          {cacheOptimizationHint && (
            <div
              className="mt-2 px-2 py-1.5 text-[11px] leading-relaxed"
              style={{
                color: 'rgba(var(--tj-text-primary),0.86)',
                background: 'rgba(var(--tj-btn-primary-start),0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.22)',
              }}
            >
              <span style={{ color: 'rgba(var(--tj-btn-primary-start),0.92)' }}>缓存优化：</span>{cacheOptimizationHint}
            </div>
          )}
          {cachePrefixDiagnostics && (
            <div
              className="mt-2 px-2 py-1.5 text-[11px] leading-relaxed"
              style={{
                color: 'rgba(var(--tj-text-primary),0.86)',
                background: 'rgba(var(--tj-tech-blue),0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-blue),0.22)',
              }}
            >
              <div style={{ color: 'rgba(var(--tj-tech-blue),0.95)' }}>前缀诊断</div>
              <div className="mt-1 grid gap-1">
                <div>公共前缀：{formatTokenCount(cachePrefixDiagnostics.commonPrefixTokens)} / {formatTokenCount(cachePrefixDiagnostics.currentPromptTokens)} tokens（{(cachePrefixDiagnostics.commonPrefixRate * 100).toFixed(1)}%）</div>
                <div>首次变化：{cachePrefixDiagnostics.firstDiffCurrentSection}</div>
                <div>变化后估算：{formatTokenCount(cachePrefixDiagnostics.changedTailTokens)} tokens</div>
              </div>
              {cachePrefixDiagnostics.largestChangedSections.length > 0 && (
                <div className="mt-1.5" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>
                  {cachePrefixDiagnostics.largestChangedSections.slice(0, 4).map((item) => `${item.label}≈${formatTokenCount(item.tokens)}`).join('；')}
                </div>
              )}
            </div>
          )}
          <div className="mt-2 grid gap-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
            <div><span style={{ color: 'rgba(var(--tj-btn-primary-start),0.76)' }}>模型：</span>{usage?.provider ?? '未记录'} / {usage?.model ?? '未记录'}</div>
            <div><span style={{ color: 'rgba(var(--tj-btn-primary-start),0.76)' }}>Usage格式：</span>{usageFormat} · {usagePath}</div>
            <div><span style={{ color: 'rgba(var(--tj-btn-primary-start),0.76)' }}>原始字段：</span>{rawUsageKeys || '未记录'}</div>
          </div>
          {usage?.rawUsage !== undefined && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>
                原始 usage 字段
              </summary>
              <pre
                className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-none px-2 py-1.5 text-[10px] leading-relaxed"
                style={{
                  color: 'rgba(var(--tj-text-secondary),0.82)',
                  background: 'rgba(var(--tj-bg-primary),0.28)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.22)',
                }}
              >
                {formatRawUsage(usage.rawUsage)}
              </pre>
            </details>
          )}
        </UsageSection>
      </div>
    </div>
  );
}

function UsageSection({ title, highlighted = false, children }: { title: string; highlighted?: boolean; children: ReactNode }) {
  return (
    <section
      className="px-3 py-2.5"
      style={{
        background: highlighted ? 'rgba(var(--tj-btn-primary-start),0.08)' : 'rgba(var(--tj-bg-primary),0.22)',
        boxShadow: highlighted
          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.34)'
          : 'inset 0 0 0 1px rgba(var(--tj-border),0.28)',
        clipPath: mediumClip,
      }}
    >
      <div className="mb-2 font-serif text-[10px] uppercase tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function UsageMetric({ label, value, tone }: { label: string; value: string; tone: 'neutral' | 'primary' | 'gold' | 'green' | 'red' }) {
  const color =
    tone === 'primary' ? 'rgba(var(--tj-btn-primary-start),0.95)'
      : tone === 'gold' ? 'rgba(var(--tj-btn-primary-start),0.95)'
      : tone === 'green' ? 'rgba(var(--tj-ui-success),0.95)'
      : tone === 'red' ? 'rgba(var(--tj-danger),0.95)'
      : 'rgba(var(--tj-text-primary),0.92)';
  return (
    <div className="min-w-0">
      <div className="font-serif text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary),0.76)' }}>
        {label}
      </div>
      <div className="mt-0.5 break-words font-mono text-[13px] font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function formatRawUsage(raw: unknown): string {
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}
