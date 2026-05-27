import { useState, useRef, useCallback, useMemo } from 'react';

interface InputAreaProps {
  onSend: (text: string) => void;
  onAbort: () => void;
  loading: boolean;
  disabled?: boolean;
  // 平铺的快捷动作
  canRestartOpening?: boolean;
  canReroll?: boolean;
  onRestartOpening?: () => void;
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
}

const btnClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const iconClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

export function InputArea({
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
}: InputAreaProps) {
  const [input, setInput] = useState('');
  const [rerollActionOptions, setRerollActionOptions] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSubmittedRef = useRef('');
  const visibleActionOptions = useMemo(
    () => (actionOptions.length > 0 ? actionOptions : rerollActionOptions),
    [actionOptions, rerollActionOptions],
  );

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

  const handlePickOption = useCallback((text: string) => {
    setInput(text);
    inputRef.current?.focus();
  }, []);

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
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
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
                color: 'rgb(12, 28, 20)',
                background: 'linear-gradient(135deg, rgba(165, 255, 200, 0.95), rgba(90, 220, 155, 0.9))',
                boxShadow: '0 0 10px rgba(120, 255, 185, 0.45), inset 0 0 0 1px rgba(235, 255, 240, 0.6)',
              }}
            >
              ✓
            </span>
          ) : workflowFailed ? (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-serif text-[12px] font-bold"
              style={{
                color: 'rgb(45, 10, 10)',
                background: 'linear-gradient(135deg, rgba(255, 190, 190, 0.95), rgba(230, 120, 120, 0.9))',
                boxShadow: '0 0 10px rgba(255, 120, 120, 0.38), inset 0 0 0 1px rgba(255, 235, 235, 0.55)',
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
              onClick={onCancelWorkflow}
              className="px-2 py-0.5 text-[10px] tracking-[0.16em]"
              style={{
                color: 'rgba(255, 210, 170, 0.92)',
                background: 'rgba(120, 50, 35, 0.2)',
                boxShadow: 'inset 0 0 0 1px rgba(255, 160, 120, 0.3)',
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
          onClick={handleRerollClick}
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
              title="点击填入输入框，可继续微调"
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
            onClick={handleAbortClick}
            className="flex min-w-[58px] items-center justify-center gap-2 px-3 font-serif text-xs font-medium tracking-[0.14em] transition-all hover:opacity-90 md:min-w-[64px] md:px-5 md:text-sm md:tracking-[0.3em]"
            style={{
              background: 'linear-gradient(135deg, rgba(220, 90, 90, 0.9), rgba(180, 60, 60, 0.9))',
              color: 'rgb(var(--tj-on-accent))',
              clipPath: btnClip,
              boxShadow: 'inset 0 0 0 1px rgba(255, 180, 180, 0.4)',
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
}

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
