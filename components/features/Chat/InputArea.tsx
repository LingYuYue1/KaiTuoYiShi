import { useState, useRef, useCallback, memo, useEffect } from 'react';
import { Dices, ListRestart, Radio, RadioOff } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';

interface InputAreaProps {
  onSend: (text: string) => Promise<void>;
  onAbort: () => Promise<void>;
  loading: boolean;
  disabled?: boolean;
  // 平铺的快捷动作
  canRestartOpening?: boolean;
  canReroll?: boolean;
  onRestartOpening?: () => Promise<void>;
  onReroll?: () => string | void | Promise<string | void>;
  streamingEnabled?: boolean;
  onToggleStreaming?: () => void;
  workflowHint?: string;
  workflowStatus?: 'searching' | 'done' | '';
  workflowFailed?: boolean;
  workflowFailCount?: number;
  workflowRetrying?: boolean;
  onCancelWorkflow?: () => void;
  /** 上一条 AI 回复给出的可点选行动列表。点击后填入输入框待玩家微调。 */
  actionOptions?: string[];
  recoveryDraft?: { workflowId: string; input: string } | null;
}

const btnClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const iconClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

/** Command actions report their own failures; event handlers must not rethrow them globally. */
function ignoreHandledAction(result: unknown): void {
  void Promise.resolve(result).catch(() => {});
}

export const InputArea = memo(function InputArea({
  onSend,
  onAbort,
  loading,
  disabled,
  canRestartOpening = false,
  canReroll = false,
  onRestartOpening,
  onReroll,
  streamingEnabled = true,
  onToggleStreaming,
  workflowHint = '',
  workflowStatus = '',
  workflowFailed = false,
  workflowFailCount = 0,
  workflowRetrying = false,
  onCancelWorkflow,
  actionOptions = [],
  recoveryDraft,
}: InputAreaProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSubmittedRef = useRef('');
  const appliedRecoveryRef = useRef('');
  const visibleActionOptions = actionOptions;

  useEffect(() => {
    if (!recoveryDraft || appliedRecoveryRef.current === recoveryDraft.workflowId) return;
    appliedRecoveryRef.current = recoveryDraft.workflowId;
    if (!input.trim()) {
      setInput(recoveryDraft.input);
      lastSubmittedRef.current = recoveryDraft.input;
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [input, recoveryDraft]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    lastSubmittedRef.current = trimmed;
    // Clear on submission; a rejected terminal restores the uncommitted draft.
    // Abort restores via handleAbortClick + lastSubmittedRef.
    setInput('');
    try {
      await onSend(trimmed);
    } catch (error) {
      // A rejected command was never committed; do not make the player retype it.
      setInput((current) => current.trim() ? current : trimmed);
      throw error;
    } finally {
      inputRef.current?.focus();
    }
  }, [input, loading, onSend]);

  const handleAbortClick = useCallback(async () => {
    await onAbort();
    if (lastSubmittedRef.current) {
      setInput(lastSubmittedRef.current);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [onAbort]);

  const appendActionOptionToInput = useCallback((current: string, option: string) => {
    const normalizedCurrent = current.trim();
    const normalizedOption = option.trim();
    if (!normalizedOption) return normalizedCurrent;
    if (!normalizedCurrent) return normalizedOption;
    if (/[，,、；;。！？!?\s]$/.test(normalizedCurrent)) {
      return `${normalizedCurrent} ${normalizedOption}`.trim();
    }
    return `${normalizedCurrent}；${normalizedOption}`;
  }, []);

  const handlePickOption = useCallback((text: string) => {
    setInput((current) => appendActionOptionToInput(current, text));
    inputRef.current?.focus();
  }, [appendActionOptionToInput]);

  const showOptions = !loading && !disabled && visibleActionOptions.length > 0;

  const handleRerollClick = useCallback(async () => {
    const restoredInput = await onReroll?.();
    if (typeof restoredInput === 'string') {
      setInput(restoredInput);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [onReroll]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ignoreHandledAction(handleSend());
      }
    },
    [handleSend],
  );

  return (
    <div
      className="shrink-0 p-2.5 pb-[calc(var(--app-safe-bottom,0px)+74px)] md:p-3 md:pb-3"
      style={{
        borderTop: '1px solid rgba(var(--tj-border), 0.72)',
        background: 'rgba(var(--tj-surface), 0.72)',
        boxShadow: '0 -8px 22px rgba(var(--tj-shadow), 0.05)',
      }}
    >
      {workflowHint && (
        <div
          className="mb-1.5 flex items-center justify-between gap-3 px-3 py-1.5 font-serif text-[11px] tracking-[0.18em]"
          style={{
            color: 'rgba(var(--tj-text-primary), 0.9)',
            background: 'rgba(var(--tj-accent-primary), 0.06)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
            clipPath: iconClip,
          }}
        >
          <span className="min-w-0 truncate">{workflowHint}</span>
          <span className="flex shrink-0 items-center gap-2">
          {workflowFailCount > 0 && (
            <span style={{ color: workflowRetrying ? 'rgba(var(--tj-accent-primary),0.92)' : 'rgba(255,180,180,0.9)' }}>
              失败 {workflowFailCount} 次{workflowRetrying ? '，正在重试' : ''}
            </span>
          )}
          {workflowStatus === 'done' && !workflowFailed ? (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-serif text-[12px] font-bold"
              style={{
                color: 'rgb(var(--tj-ui-active-text))',
                background: 'linear-gradient(135deg, rgba(var(--tj-ui-success),0.95), rgba(var(--tj-ui-success),0.9))',
                boxShadow: '0 0 10px rgba(var(--tj-ui-success),0.45), inset 0 0 0 1px rgba(var(--tj-ui-success),0.6)',
              }}
            >
              ✓
            </span>
          ) : workflowFailed ? (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-serif text-[12px] font-bold"
              style={{
                color: 'rgb(var(--tj-ui-active-text))',
                background: 'linear-gradient(135deg, rgba(var(--tj-danger),0.95), rgba(var(--tj-danger),0.9))',
                boxShadow: '0 0 10px rgba(var(--tj-danger),0.38), inset 0 0 0 1px rgba(var(--tj-danger),0.55)',
              }}
            >
              !
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span
                className="h-1.5 w-1.5 animate-pulse-soft rounded-full"
                style={{ background: 'rgb(var(--tj-accent-primary))', boxShadow: '0 0 8px rgba(var(--tj-accent-primary), 0.75)' }}
              />
              <span
                className="h-1.5 w-1.5 animate-pulse-soft rounded-full"
                style={{ background: 'rgb(var(--tj-accent-primary))', animationDelay: '0.14s', boxShadow: '0 0 8px rgba(var(--tj-accent-primary), 0.55)' }}
              />
              <span
                className="h-1.5 w-1.5 animate-pulse-soft rounded-full"
                style={{ background: 'rgb(var(--tj-accent-primary))', animationDelay: '0.28s', boxShadow: '0 0 8px rgba(var(--tj-accent-primary), 0.35)' }}
              />
            </span>
          )}
          {workflowStatus !== 'done' && onCancelWorkflow && (
            <button
              type="button"
              onClick={() => ignoreHandledAction(onCancelWorkflow())}
              className="px-2 py-0.5 text-[10px] tracking-[0.16em]"
              style={{
                color: 'rgba(var(--tj-text-primary),0.92)',
                background: 'rgba(var(--tj-panel-bg-start),0.2)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-secondary),0.3)',
                clipPath: iconClip,
              }}
            >
              取消
            </button>
          )}
          </span>
        </div>
      )}

      {/* 顶部横向快捷图标条 */}
      <div className="mb-1.5 flex items-center gap-1.5">
        {canRestartOpening && (
          <IconButton
            icon={ListRestart}
            label="重新开局"
            description="回到初始开局并清除当前进度"
            disabled={disabled}
            onClick={() => ignoreHandledAction(onRestartOpening?.())}
          />
        )}
        <IconButton
          icon={Dices}
          label="重写上一回复"
          description="回滚上一回合并重新生成回复"
          disabledReason={!canReroll ? '需要先完成一条回复' : undefined}
          disabled={!canReroll || loading || disabled}
          onClick={() => ignoreHandledAction(handleRerollClick())}
        />
        <IconButton
          icon={streamingEnabled ? Radio : RadioOff}
          label={streamingEnabled ? '流式显示已开启' : '流式显示已关闭'}
          description={streamingEnabled ? '回复生成时逐步显示正文' : '回复完成后一次显示正文'}
          active={streamingEnabled}
          disabled={loading}
          pressed={streamingEnabled}
          onClick={() => onToggleStreaming?.()}
        />
      </div>

      {showOptions && (
        <div
          className="mb-2 flex gap-1.5 overflow-x-auto kaituo-options-scroll"
          style={{ scrollbarWidth: 'thin' }}
        >
          {visibleActionOptions.slice(0, 6).map((opt, idx) => (
            <button
              key={`${idx}-${opt}`}
              type="button"
              onClick={() => handlePickOption(opt)}
              title="点击加入输入框，可继续微调"
              className="group relative px-3 py-1.5 text-xs leading-tight transition-all hover:bg-[rgba(var(--tj-accent-primary),0.16)] whitespace-nowrap shrink-0"
              style={{
                color: 'rgba(var(--tj-accent-primary), 0.92)',
                background: 'rgba(var(--tj-accent-primary), 0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)',
                clipPath: iconClip,
              }}
            >
              <span className="mr-1 opacity-60">▸</span>
              {opt}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-stretch gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? '正在回应……' : '说点什么，或者描述你的动作...'}
          disabled={loading || disabled}
          rows={1}
          className="kaituo-input max-h-24 min-h-[40px] flex-1 resize-none px-3 py-2 text-sm disabled:opacity-50 md:min-h-0 md:px-3.5 md:py-2.5"
          style={{
            clipPath: btnClip,
          }}
        />
        {loading ? (
          <button
            onClick={() => ignoreHandledAction(handleAbortClick())}
            className="flex min-w-[58px] items-center justify-center gap-2 px-3 font-serif text-xs font-medium tracking-[0.14em] transition-all hover:opacity-90 md:min-w-[64px] md:px-5 md:text-sm md:tracking-[0.3em]"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-danger),0.9), rgba(var(--tj-danger),0.9))',
              color: 'rgb(var(--tj-on-accent))',
              clipPath: btnClip,
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.4)',
            }}
          >
            <span className="inline-flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-white/90"
                  style={{ animationDelay: `${i * 0.16}s` }}
                />
              ))}
            </span>
            停止
          </button>
        ) : (
          <button
            onClick={() => ignoreHandledAction(handleSend())}
            disabled={!input.trim() || disabled}
            className="kaituo-btn kaituo-btn-primary group min-w-[58px] px-3 text-xs md:min-w-[64px] md:px-6 md:text-sm"
          >
            <span
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-text-primary), 0.45), transparent)' }}
            />
            <span className="relative">发送</span>
          </button>
        )}
      </div>
      <div
        className="mt-1.5 hidden text-right text-xs tracking-wider md:block"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}
      >
        Enter 发送 · Shift+Enter 换行
      </div>
    </div>
  );
});
