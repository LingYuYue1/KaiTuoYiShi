import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { 记忆系统 } from '@/models/memory';
import type { 回忆条目 } from '@/models/yiting';
import type { API设置, 游戏设置 } from '@/models/settings';
import { 创建默认记忆系统设置 } from '@/models/settings';
import type { MemorySummaryFlowState } from '@/hooks/useGameState';
import {
  autoCompressMemorySystemWithArchivesAsync,
  autoCompressMemorySystemWithArchives,
  applyEditedArchiveSummaries,
} from '@/hooks/useGame/memoryUtils';

/**
 * 阶段1·主链压缩三阶段弹窗（remind→processing→review→failed）
 *
 * 触发时机：sendWorkflow 检测到 即时/短期/中期 任一层达阈值且启用 API 总结时，
 * 设置 memorySummaryFlow.open=true, stage='remind'，推迟同步压缩到本弹窗。
 *
 * 流程：
 * - remind：展示各层待压缩条数，玩家点击「开始 AI 总结」进入 processing
 * - processing：调用 autoCompressMemorySystemWithArchivesAsync，完成后进入 review
 * - review：展示 AI 生成的 archives 草稿，玩家可编辑 摘要 字段，确认后落库忆庭+更新记忆链
 * - failed：AI 调用失败，提供「重试」与「使用本地兜底」（同步截断式压缩）
 *
 * 对齐墨色机制：调 AI + 玩家审核 + 明确阈值（10/30/50）。
 */
interface Props {
  flow: MemorySummaryFlowState;
  memory: 记忆系统;
  turnCount: number;
  apiSettings: API设置;
  gameSettings: 游戏设置;
  onStageChange: (next: MemorySummaryFlowState) => void;
  onConfirm: (result: { memory: 记忆系统; archives: 回忆条目[] }) => void;
  onClose: () => void;
}

const ARCHIVE_TYPE_LABELS: Record<string, string> = {
  短期压缩: '即时 → 短期',
  中期压缩: '短期 → 中期',
  长期压缩: '中期 → 长期',
  精炼纪要: '精炼纪要',
};

const primaryBtnStyle: React.CSSProperties = {
  background:
    'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.84), rgba(var(--tj-accent-secondary), 0.78))',
  color: 'rgb(255, 255, 255)',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.28)',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'rgba(var(--tj-bg-primary), 0.5)',
  color: 'rgb(var(--tj-text-primary))',
  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72)',
};

export function MemorySummaryFlowModal({
  flow,
  memory,
  turnCount,
  apiSettings,
  gameSettings,
  onStageChange,
  onConfirm,
  onClose,
}: Props) {
  const [compressedMemory, setCompressedMemory] = useState<记忆系统 | null>(null);
  const [editableDrafts, setEditableDrafts] = useState<回忆条目[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const processingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // 编辑前摘要快照：确认时用于把玩家编辑结果稳定同步回主记忆链。
  const originalSummariesRef = useRef<string[]>([]);

  const memorySettings = gameSettings.记忆系统 ?? 创建默认记忆系统设置();

  // mainConfig 兜底逻辑与 PhoneModal 一致
  const mainConfig = useMemo(() => {
    return (
      apiSettings.configs[0] ?? {
        id: '',
        name: '',
        provider: 'openai_compatible' as const,
        baseUrl: '',
        apiKey: '',
        model: '',
        createdAt: 0,
        updatedAt: 0,
      }
    );
  }, [apiSettings.configs]);

  // processing 阶段：触发 AI 压缩（进入阶段时跑一次，processingRef 防严格模式重复）
  useEffect(() => {
    if (flow.stage !== 'processing') return;
    if (processingRef.current) return;
    processingRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    setErrorMsg('');

    (async () => {
      try {
        const result = await autoCompressMemorySystemWithArchivesAsync(
          memory,
          turnCount,
          memorySettings,
          mainConfig,
          controller.signal,
        );
        setCompressedMemory(result.memory);
        setEditableDrafts(result.archives);
        originalSummariesRef.current = result.archives.map((archive) => archive.摘要);
        onStageChange({
          ...flow,
          stage: 'review',
          drafts: result.archives,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(msg);
        onStageChange({
          ...flow,
          stage: 'failed',
          errors: [msg],
        });
      } finally {
        processingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.stage]);

  // 组件卸载时中止进行中的请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // 失败兜底：本地同步压缩（截断式，质量低但不丢条目）
  const handleLocalFallback = () => {
    try {
      const result = autoCompressMemorySystemWithArchives(memory, turnCount, memorySettings);
      setCompressedMemory(result.memory);
      setEditableDrafts(result.archives);
      originalSummariesRef.current = result.archives.map((archive) => archive.摘要);
      onStageChange({
        ...flow,
        stage: 'review',
        drafts: result.archives,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
    }
  };

  const handleConfirm = () => {
    if (!compressedMemory) return;
    // 玩家编辑的摘要必须同步到压缩后的主记忆层，不能只改 archives 数组。
    const memoryWithEditedSummaries = applyEditedArchiveSummaries(
      compressedMemory,
      editableDrafts,
      originalSummariesRef.current,
    );
    onConfirm({
      memory: memoryWithEditedSummaries,
      archives: editableDrafts,
    });
  };

  const handleRegenerate = () => {
    setCompressedMemory(null);
    setEditableDrafts([]);
    onStageChange({ ...flow, stage: 'processing', drafts: undefined });
  };

  const handleRetry = () => {
    setErrorMsg('');
    onStageChange({ ...flow, stage: 'processing', errors: undefined });
  };

  const handleDraftSummaryChange = (index: number, value: string) => {
    setEditableDrafts((prev) =>
      prev.map((draft, i) => (i === index ? { ...draft, 摘要: value } : draft)),
    );
  };

  // ---- 各阶段渲染 ----

  const renderRemind = () => {
    const info = flow.pendingInfo;
    if (!info) {
      return (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
            记忆系统未提供待压缩信息。
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-sm px-4 py-2 text-sm" style={secondaryBtnStyle}>
              关闭
            </button>
          </div>
        </div>
      );
    }
    const hasPending = info.即时待压缩 > 0 || info.短期待压缩 > 0 || info.中期待压缩 > 0;
    return (
      <div className="space-y-4">
        <p
          className="text-sm leading-6"
          style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}
        >
          记忆系统检测到以下层级已达压缩阈值，建议进行 AI 总结以保持记忆链健康。
        </p>
        <div className="space-y-2">
          {info.即时待压缩 > 0 && (
            <div
              className="flex items-center justify-between rounded-sm px-3 py-2"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.5)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)',
              }}
            >
              <span className="text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
                即时 → 短期
              </span>
              <span
                className="font-serif text-sm font-bold"
                style={{ color: 'rgb(var(--tj-accent-primary))' }}
              >
                {info.即时待压缩} 条待压缩
              </span>
            </div>
          )}
          {info.短期待压缩 > 0 && (
            <div
              className="flex items-center justify-between rounded-sm px-3 py-2"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.5)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)',
              }}
            >
              <span className="text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
                短期 → 中期
              </span>
              <span
                className="font-serif text-sm font-bold"
                style={{ color: 'rgb(var(--tj-accent-primary))' }}
              >
                {info.短期待压缩} 条待压缩
              </span>
            </div>
          )}
          {info.中期待压缩 > 0 && (
            <div
              className="flex items-center justify-between rounded-sm px-3 py-2"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.5)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.5)',
              }}
            >
              <span className="text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
                中期 → 长期
              </span>
              <span
                className="font-serif text-sm font-bold"
                style={{ color: 'rgb(var(--tj-accent-primary))' }}
              >
                {info.中期待压缩} 条待压缩
              </span>
            </div>
          )}
          {!hasPending && (
            <p className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
              当前没有需要压缩的层级。
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-sm px-4 py-2 text-sm"
            style={secondaryBtnStyle}
          >
            暂不总结
          </button>
          <button
            onClick={() => onStageChange({ ...flow, stage: 'processing' })}
            className="rounded-sm px-4 py-2 text-sm"
            style={primaryBtnStyle}
            disabled={!hasPending}
          >
            开始 AI 总结
          </button>
        </div>
      </div>
    );
  };

  const renderProcessing = () => {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2"
          style={{
            borderColor: 'rgba(var(--tj-accent-primary), 0.3)',
            borderTopColor: 'rgb(var(--tj-accent-primary))',
          }}
        />
        <p
          className="font-serif text-sm tracking-[0.1em]"
          style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}
        >
          AI 正在总结记忆…
        </p>
        <p className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
          请勿关闭窗口，总结完成后可审核编辑
        </p>
      </div>
    );
  };

  const renderReview = () => {
    if (!editableDrafts.length) {
      return (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}>
            本次没有生成需要审核的压缩草稿（可能记忆条数未达阈值或已被处理）。
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-sm px-4 py-2 text-sm"
              style={primaryBtnStyle}
            >
              关闭
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {flow.errors?.length ? (
          <div
            className="rounded-sm p-3 text-xs leading-5"
            style={{
              background: 'rgba(180, 60, 60, 0.12)',
              color: 'rgb(220, 120, 120)',
              boxShadow: 'inset 0 0 0 1px rgba(180, 60, 60, 0.4)',
            }}
          >
            {flow.errors.join('；')}
          </div>
        ) : null}
        <p
          className="text-sm leading-6"
          style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}
        >
          以下是 AI 生成的记忆压缩草稿，
          <span style={{ color: 'rgb(var(--tj-accent-primary))' }}>摘要</span>
          字段可直接编辑。确认后将写入忆庭档案并更新记忆链。
        </p>
        <div className="space-y-3">
          {editableDrafts.map((draft, index) => (
            <div
              key={draft.id}
              className="rounded-sm p-3"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.4)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.6)',
              }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className="font-serif text-xs font-bold tracking-[0.1em]"
                  style={{ color: 'rgb(var(--tj-accent-secondary))' }}
                >
                  {ARCHIVE_TYPE_LABELS[draft.类型 ?? ''] ?? draft.类型 ?? '压缩'}
                </span>
                <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
                  第 {draft.回合} 回合
                </span>
              </div>
              <details className="mb-2">
                <summary
                  className="cursor-pointer text-xs"
                  style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}
                >
                  展开原文（只读）
                </summary>
                <pre
                  className="mt-2 whitespace-pre-wrap break-words rounded-sm p-2 text-xs leading-5"
                  style={{
                    background: 'rgba(var(--tj-bg-primary), 0.6)',
                    color: 'rgba(var(--tj-text-secondary), 0.78)',
                  }}
                >
                  {draft.原文 || '（无原文）'}
                </pre>
              </details>
              <label
                className="mb-1 block text-xs"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}
              >
                摘要（可编辑）
              </label>
              <textarea
                value={draft.摘要}
                onChange={(e) => handleDraftSummaryChange(index, e.target.value)}
                rows={4}
                className="w-full resize-y rounded-sm p-2 text-sm leading-6"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.6)',
                  color: 'rgb(var(--tj-text-primary))',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72)',
                  outline: 'none',
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            onClick={handleRegenerate}
            className="rounded-sm px-4 py-2 text-sm"
            style={secondaryBtnStyle}
          >
            重新生成
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-sm px-4 py-2 text-sm"
            style={primaryBtnStyle}
          >
            确认落库
          </button>
        </div>
      </div>
    );
  };

  const renderFailed = () => {
    return (
      <div className="space-y-4">
        <div
          className="rounded-sm p-3"
          style={{
            background: 'rgba(180, 60, 60, 0.12)',
            boxShadow: 'inset 0 0 0 1px rgba(180, 60, 60, 0.4)',
          }}
        >
          <p className="font-serif text-sm font-bold" style={{ color: 'rgb(220, 120, 120)' }}>
            AI 总结失败
          </p>
          <p
            className="mt-1 text-xs leading-5"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}
          >
            {errorMsg || flow.errors?.[0] || '未知错误'}
          </p>
        </div>
        <p
          className="text-sm leading-6"
          style={{ color: 'rgba(var(--tj-text-primary), 0.78)' }}
        >
          可以重试 AI 总结，或使用本地兜底（截断式压缩，质量较低但不会丢失记忆条目）。
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-sm px-4 py-2 text-sm"
            style={secondaryBtnStyle}
          >
            稍后处理
          </button>
          <button
            onClick={handleLocalFallback}
            className="rounded-sm px-4 py-2 text-sm"
            style={secondaryBtnStyle}
          >
            使用本地兜底
          </button>
          <button
            onClick={handleRetry}
            className="rounded-sm px-4 py-2 text-sm"
            style={primaryBtnStyle}
          >
            重试 AI 总结
          </button>
        </div>
      </div>
    );
  };

  return (
    <Modal onClose={onClose} title="记忆总结" className="max-w-3xl">
      {flow.stage === 'remind' && renderRemind()}
      {flow.stage === 'processing' && renderProcessing()}
      {flow.stage === 'review' && renderReview()}
      {flow.stage === 'failed' && renderFailed()}
    </Modal>
  );
}
