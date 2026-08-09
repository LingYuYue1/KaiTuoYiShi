import { useState, useRef, useCallback, useMemo, memo, useEffect } from 'react';
import { parseActionOptionsBlock } from '@/services/ai/responseParser';
import { isTurnStatusActive, isTurnStatusCancellable, TURN_STATUS_IDLE, type TurnStatus } from '@/hooks/useGame/turnStatus';

interface InputAreaProps {
  onSend: (text: string) => void;
  onAbort: () => void;
  loading: boolean;
  disabled?: boolean;
  // 平铺的快捷动作
  canRestartOpening?: boolean;
  canReroll?: boolean;
  onRestartOpening?: () => void;
  onReroll?: () => string | undefined | Promise<string | undefined>;
  streamingEnabled?: boolean;
  onToggleStreaming?: () => void;
  /** 输入区状态条的唯一状态源（管线在相位边界写入）。 */
  turnStatus?: TurnStatus;
  onCancelWorkflow?: () => void;
  /** 上一条 AI 回复给出的可点选行动列表。点击后填入输入框待玩家微调。 */
  actionOptions?: string[];
  recoveryDraft?: { workflowId: string; input: string } | null;
}

const btnClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const iconClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

function isMobileTextInput() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const mobileNavigator = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  if (mobileNavigator.userAgentData?.mobile === true) return true;

  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
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
  turnStatus = TURN_STATUS_IDLE,
  onCancelWorkflow,
  actionOptions = [],
  recoveryDraft,
}: InputAreaProps) {
  const [input, setInput] = useState('');
  const [rerollActionOptions, setRerollActionOptions] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const lastSubmittedRef = useRef('');
  const appliedRecoveryRef = useRef('');
  const visibleActionOptions = useMemo(() => {
    const source = actionOptions.length > 0 ? actionOptions : rerollActionOptions;
    return parseActionOptionsBlock(source.join('\n'));
  }, [actionOptions, rerollActionOptions]);

  useEffect(() => {
    if (!recoveryDraft || appliedRecoveryRef.current === recoveryDraft.workflowId) return;
    appliedRecoveryRef.current = recoveryDraft.workflowId;
    if (!input.trim()) {
      requestAnimationFrame(() => {
        setInput(recoveryDraft.input);
        lastSubmittedRef.current = recoveryDraft.input;
        inputRef.current?.focus();
      });
    }
  }, [input, recoveryDraft]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    lastSubmittedRef.current = trimmed;
    onSend(trimmed);
    setInput('');
    setRerollActionOptions([]);
    inputRef.current?.focus();
  }, [input, loading, onSend]);

  const handleAbortClick = useCallback(() => {
    onAbort();
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
    setRerollActionOptions(actionOptions);
    const restoredInput = await onReroll?.();
    if (typeof restoredInput === 'string') {
      setInput(restoredInput);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [actionOptions, onReroll]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (isComposingRef.current || e.nativeEvent.isComposing) return;
      if (isMobileTextInput()) return;

      e.preventDefault();
      handleSend();
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
      {turnStatus.kind !== 'idle' && (
        <div
          className="mb-1.5 flex items-center justify-between gap-3 px-3 py-1.5 font-serif text-[11px] tracking-[0.18em]"
          style={{
            color: 'rgba(var(--tj-text-primary), 0.9)',
            background: 'rgba(var(--tj-accent-primary), 0.06)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
            clipPath: iconClip,
          }}
        >
          <span className="min-w-0 truncate">{turnStatus.text}</span>
          <span className="flex shrink-0 items-center gap-2">
          {turnStatus.kind === 'failed' && (
            <span style={{ color: 'rgba(255,180,180,0.9)' }}>
              失败 {turnStatus.failCount} 次
            </span>
          )}
          {turnStatus.kind === 'failed' ? (
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
          ) : isTurnStatusActive(turnStatus) ? (
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
          ) : (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center font-serif text-[11px]"
              style={{ color: 'rgba(var(--tj-text-secondary), 0.8)' }}
              title={turnStatus.kind === 'stopped' ? '已停止' : ''}
            >
              ∥
            </span>
          )}
          {isTurnStatusCancellable(turnStatus) && onCancelWorkflow && (
            <button
              type="button"
              onClick={onCancelWorkflow}
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
            glyph="↺"
            title="重新开局"
            disabled={loading || disabled}
            onClick={() => onRestartOpening?.()}
          />
        )}
        <IconButton
          glyph="⟳"
          title="重roll"
          hint={canReroll ? undefined : '需先有回复'}
          disabled={!canReroll || loading || disabled}
          onClick={() => void handleRerollClick()}
        />
        <IconButton
          glyph={streamingEnabled ? '⟿' : '◐'}
          title={streamingEnabled ? '流式：开' : '流式：关'}
          active={streamingEnabled}
          disabled={loading}
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
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
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
            onClick={handleAbortClick}
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
            onClick={handleSend}
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

function IconButton({
  glyph,
  title,
  hint,
  active,
  disabled,
  onClick,
}: {
  glyph: string;
  title: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const tooltip = hint ? `${title}（${hint}）` : title;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className="flex h-7 w-9 items-center justify-center font-serif text-base transition-all hover:bg-[rgba(var(--tj-accent-primary),0.14)] disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-accent-primary), 0.85)',
        background: active ? 'rgba(var(--tj-accent-primary), 0.14)' : 'rgba(var(--tj-accent-primary), 0.05)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
        clipPath: iconClip,
      }}
    >
      {glyph}
    </button>
  );
}
