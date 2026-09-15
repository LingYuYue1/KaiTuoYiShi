import { useMemo } from 'react';
import type {
  变量命令动作,
  变量命令结果,
  变量批次诊断,
  变量诊断严重性,
} from '@/models/variableCommand';
import type { 队列任务状态 } from '@/models/queueTask';
import { smallClip, tinyClip } from '@/components/ui/clipPaths';

export { smallClip };

const 命令动作样式: Record<变量命令动作, { bg: string; border: string; color: string; label: string }> = {
  set:    { bg: 'rgba(62, 112, 156, 0.12)',  border: 'rgba(62, 112, 156, 0.38)',  color: 'rgb(43, 88, 128)', label: 'SET' },
  add:    { bg: 'rgba(54, 111, 74, 0.12)', border: 'rgba(54, 111, 74, 0.38)', color: 'rgb(42, 94, 61)', label: 'ADD' },
  sub:    { bg: 'rgba(145, 99, 42, 0.12)',  border: 'rgba(145, 99, 42, 0.38)',  color: 'rgb(132, 84, 36)',  label: 'SUB' },
  push:   { bg: 'rgba(103, 82, 145, 0.12)', border: 'rgba(103, 82, 145, 0.38)', color: 'rgb(86, 68, 125)', label: 'PUSH' },
  delete: { bg: 'rgba(176, 72, 68, 0.12)', border: 'rgba(176, 72, 68, 0.38)', color: 'rgb(150, 54, 52)', label: 'DEL' },
};

const 诊断样式: Record<变量诊断严重性, { label: string; color: string; bg: string; border: string; glyph: string }> = {
  error:   { label: '错误', color: 'rgb(var(--tj-danger))',            bg: 'rgba(var(--tj-danger),0.1)',        border: 'rgba(var(--tj-danger),0.4)',        glyph: '✗' },
  warning: { label: '提示', color: 'rgb(var(--tj-amber-deep))',        bg: 'rgba(var(--tj-amber-deep),0.12)',   border: 'rgba(var(--tj-amber-deep),0.4)',    glyph: '!' },
};

const 诊断阶段标签: Record<变量批次诊断['stage'], string> = {
  parse: '解析',
  policy: '策略',
  commit: '落地',
};

export function StatusIcon({ status }: { status: 队列任务状态 }) {
  if (status === 'pending') {
    return (
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center" title="处理中" aria-label="处理中">
        <Spinner />
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm"
        title="已完成"
        style={{
          color: 'rgb(42, 94, 61)',
          background: 'rgba(54, 111, 74, 0.12)',
          boxShadow: 'inset 0 0 0 1px rgba(54, 111, 74, 0.45)',
        }}
      >
        ✓
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm"
        title="部分失败"
        style={{
          color: 'rgb(150, 54, 52)',
          background: 'rgba(var(--tj-danger),0.12)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.45)',
        }}
      >
        ✗
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm"
        title="已跳过"
        style={{
          color: 'rgba(var(--tj-text-secondary), 0.72)',
          background: 'rgba(var(--tj-accent-primary), 0.05)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24)',
        }}
      >
        -
      </span>
    );
  }
  if (status === 'cancelled') {
    return (
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm"
        title="已取消"
        style={{
          color: 'rgba(var(--tj-accent-secondary),0.92)',
          background: 'rgba(var(--tj-accent-primary), 0.08)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
        }}
      >
        ×
      </span>
    );
  }
  return (
    <span
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm"
      title="待运行"
      style={{
        color: 'rgba(var(--tj-text-primary), 0.68)',
        background: 'rgba(var(--tj-accent-primary), 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
      }}
    >
      ◇
    </span>
  );
}

function Spinner() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" style={{ animation: 'kaituo-spin 1s linear infinite' }}>
      <style>{`@keyframes kaituo-spin { to { transform: rotate(360deg); transform-origin: 11px 11px; } }`}</style>
      <circle cx="11" cy="11" r="8" fill="none" stroke="rgba(var(--tj-accent-primary), 0.18)" strokeWidth="2" />
      <path d="M 11 3 A 8 8 0 0 1 19 11" fill="none" stroke="rgb(var(--tj-accent-primary))" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ViewButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 px-2 py-1.5 font-serif text-[11px] tracking-[0.18em] transition-all hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed"
      style={{
        color: active ? 'rgb(20, 16, 12)' : 'rgba(var(--tj-accent-primary), 0.92)',
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-amber-deep), 0.95))'
          : 'rgba(var(--tj-accent-primary), 0.04)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.55)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.32)',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

export function QueueActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-1 font-serif text-[10px] tracking-[0.12em] transition-all hover:opacity-85"
      style={{
        color: 'rgb(var(--tj-accent-primary))',
        background: 'rgba(var(--tj-accent-primary), 0.08)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

export function RawTextPanel({ raw }: { raw: string }) {
  return (
    <div className="px-3 pb-3">
      <div
        className="mb-1 font-serif text-[10px] tracking-[0.3em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.6)' }}
      >
        ◆ 原始信息
      </div>
      <pre
        className="whitespace-pre-wrap break-all text-[11px] leading-relaxed px-2.5 py-2 max-h-72 overflow-y-auto"
        style={{
          color: 'rgba(var(--tj-text-primary), 0.94)',
          background: 'rgb(var(--tj-bubble))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.7)',
          clipPath: smallClip,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {raw}
      </pre>
    </div>
  );
}

export function CommandRow({ result }: { result: 变量命令结果 }) {
  const { command, ok, reason } = result;
  const style = 命令动作样式[command.action];

  const valuePreview = useMemo(() => {
    if (command.action === 'delete') return '';
    const v = command.value;
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return `"${v.length > 28 ? v.slice(0, 28) + '...' : v}"`;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return `[数组×${v.length}]`;
    if (typeof v === 'object') {
      const keys = Object.keys(v);
      return `{${keys.slice(0, 3).join(',')}${keys.length > 3 ? ',...' : ''}}`;
    }
    return `[${typeof v}]`;
  }, [command]);

  return (
    <div
      className="px-2 py-1.5 text-[11px]"
      style={{
        background: ok ? 'rgb(var(--tj-bubble))' : 'rgba(176, 72, 68, 0.1)',
        boxShadow: `inset 0 0 0 1px ${ok ? 'rgba(var(--tj-border), 0.68)' : 'rgba(176, 72, 68, 0.34)'}`,
        clipPath: smallClip,
      }}
      title={reason}
    >
      <div className="flex items-start gap-1.5">
        <span
          className="font-mono font-bold text-[9px] px-1.5 py-0.5 flex-shrink-0 mt-0.5"
          style={{
            background: style.bg,
            color: style.color,
            boxShadow: `inset 0 0 0 1px ${style.border}`,
            clipPath: tinyClip,
          }}
        >
          {style.label}
        </span>
        <span className="font-mono break-all min-w-0 flex-1" style={{ color: 'rgba(var(--tj-text-primary), 0.94)' }}>
          {command.key}
          {valuePreview && (
            <>
              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}> = </span>
              <span style={{ color: ok ? 'rgba(var(--tj-accent-primary), 0.95)' : 'rgba(176, 72, 68, 0.9)' }}>{valuePreview}</span>
            </>
          )}
        </span>
      </div>
      {!ok && reason && (
        <div className="mt-1 text-[10px] pl-1" style={{ color: 'rgba(var(--tj-danger),0.85)' }}>
          ✗ {reason}
        </div>
      )}
    </div>
  );
}

export function DiagnosticsPanel({ diagnostics }: { diagnostics: 变量批次诊断[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <div className="px-3 pb-3 space-y-1.5">
      <div
        className="mb-1 font-serif text-[10px] tracking-[0.3em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.6)' }}
      >
        ◆ 诊断 {diagnostics.length} 条
      </div>
      {diagnostics.map((diagnostic, i) => (
        <DiagnosticRow key={`${diagnostic.code}_${i}`} diagnostic={diagnostic} />
      ))}
    </div>
  );
}

function DiagnosticRow({ diagnostic }: { diagnostic: 变量批次诊断 }) {
  const style = 诊断样式[diagnostic.severity];
  return (
    <div
      className="flex items-start gap-2 px-2 py-1.5 text-[11px]"
      style={{
        background: style.bg,
        boxShadow: `inset 0 0 0 1px ${style.border}`,
        clipPath: smallClip,
      }}
    >
      <span
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold"
        style={{ color: style.color, boxShadow: `inset 0 0 0 1px ${style.border}` }}
        aria-hidden="true"
      >
        {style.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="break-all leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.94)' }}>
          {diagnostic.message}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
          <span>{style.label}</span>
          <span>· {诊断阶段标签[diagnostic.stage]}</span>
          {diagnostic.root && <span>· {diagnostic.root}</span>}
        </div>
      </div>
    </div>
  );
}
