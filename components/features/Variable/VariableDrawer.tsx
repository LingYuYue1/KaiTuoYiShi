import { useMemo, useState } from 'react';
import type { 变量命令批次, 变量命令结果, 变量命令动作 } from '@/models/variableCommand';
import type { 队列任务ID, 队列任务记录, 队列任务状态 } from '@/models/queueTask';

interface Props {
  batches: 变量命令批次[];
  tasks: 队列任务记录[];
  /** 变量模型正在跑（主回复已落地，变量结算中）。 */
  pending?: boolean;
  onCancelTask?: (id: 队列任务ID) => void;
}

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

// 命令 action → 颜色标签（参考墨色项目的配色风格）
const ACTION_STYLE: Record<变量命令动作, { bg: string; border: string; color: string; label: string }> = {
  set:    { bg: 'rgba(62, 112, 156, 0.12)',  border: 'rgba(62, 112, 156, 0.38)',  color: 'rgb(43, 88, 128)', label: 'SET' },
  add:    { bg: 'rgba(54, 111, 74, 0.12)', border: 'rgba(54, 111, 74, 0.38)', color: 'rgb(42, 94, 61)', label: 'ADD' },
  sub:    { bg: 'rgba(145, 99, 42, 0.12)',  border: 'rgba(145, 99, 42, 0.38)',  color: 'rgb(132, 84, 36)',  label: 'SUB' },
  push:   { bg: 'rgba(103, 82, 145, 0.12)', border: 'rgba(103, 82, 145, 0.38)', color: 'rgb(86, 68, 125)', label: 'PUSH' },
  delete: { bg: 'rgba(176, 72, 68, 0.12)', border: 'rgba(176, 72, 68, 0.38)', color: 'rgb(150, 54, 52)', label: 'DEL' },
};

type TaskStatus = 队列任务状态;

export function VariableDrawer({ batches, tasks, pending, onCancelTask }: Props) {
  const [open, setOpen] = useState(false);

  const latest = batches.length > 0 ? batches[batches.length - 1] : null;
  const latestTaskById = useMemo(() => {
    const map = new Map<队列任务ID, 队列任务记录>();
    for (const task of tasks) map.set(task.id, task);
    return map;
  }, [tasks]);

  const variableStatus: TaskStatus = pending
    ? 'pending'
    : latest
      ? latest.results.some((r) => !r.ok)
        ? 'failed'
        : 'success'
      : latestTaskById.get('variable')?.status ?? 'idle';

  const queueRows = [
    latestTaskById.get('variable') ?? createIdleTask('variable', '变量生成', '解析正文并落地变量命令'),
    latestTaskById.get('news') ?? createIdleTask('news', '星际和平周报', '独立 API 推演新闻与后台事件'),
    latestTaskById.get('phone') ?? createIdleTask('phone', '手机来信', '主动来信种子与通讯入口'),
  ];

  return (
    <>
      {/* 触发按钮：贴在聊天区最左侧边缘，竖向长方形 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="absolute top-1/2 -translate-y-1/2 z-20 transition-all hover:opacity-100"
        style={{
          left: 0,
          width: '24px',
          height: pending ? 112 : 88,
          background: open
            ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))'
            : 'linear-gradient(180deg, rgb(var(--tj-bubble)), rgb(var(--tj-surface-strong)))',
          color: open ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-accent-primary), 0.85)',
          boxShadow: open
            ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 4px 0 12px rgba(var(--tj-accent-primary), 0.2)'
            : 'inset 0 0 0 1px rgba(var(--tj-border), 0.86), 2px 0 8px rgba(var(--tj-shadow), 0.1)',
          opacity: 1,
          clipPath: 'polygon(0 0, 100% 8px, 100% calc(100% - 8px), 0 100%)',
          writingMode: 'vertical-rl',
          textOrientation: 'upright',
          fontSize: '10px',
          letterSpacing: '0.3em',
          fontFamily: 'var(--font-serif, serif)',
        }}
        title={open ? '收起队列' : '展开队列'}
      >
        {pending ? '变量正在处理' : '处理队列'}
        {pending && (
          <span
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ background: 'rgb(var(--tj-accent-primary))', boxShadow: '0 0 6px rgba(var(--tj-accent-primary), 0.8)' }}
          />
        )}
      </button>

      {/* 背景遮罩：与 SystemDrawer 对称，点击关闭 */}
      <div
        onClick={() => setOpen(false)}
        className="absolute inset-0 z-30 transition-opacity duration-200"
        style={{
          background: 'rgba(56, 48, 40, 0.14)',
          backdropFilter: 'blur(1px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* 抽屉本体：始终挂载，靠 transform 控制滑入/滑出 */}
      <aside
        className="absolute z-40 flex flex-col overflow-hidden transition-transform duration-300"
        style={{
          top: 0,
          bottom: 0,
          left: 0,
          width: 'min(440px, 92vw)',
          transform: open ? 'translateX(0)' : 'translateX(-105%)',
          background: 'radial-gradient(circle at 12% 0%, rgba(117,214,216,0.1), transparent 32%), linear-gradient(180deg, rgb(var(--tj-bubble)), rgb(var(--tj-surface-strong)))',
          boxShadow:
            'inset -1px 0 0 rgba(var(--tj-border), 0.9), 8px 0 22px rgba(var(--tj-shadow), 0.1)',
        }}
        aria-hidden={!open}
      >
        {/* 右侧中部圆形关闭按钮（朝外伸出） */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="关闭队列"
          title="关闭"
          className="absolute z-50 flex h-9 w-9 items-center justify-center font-serif text-base transition-all hover:bg-[rgba(var(--tj-accent-primary),0.18)]"
          style={{
            top: '50%',
            right: '-18px',
            transform: 'translateY(-50%)',
            color: 'rgb(var(--tj-accent-primary))',
            background:
              'linear-gradient(135deg, rgb(var(--tj-bubble)), rgb(var(--tj-surface-strong)))',
            boxShadow:
              'inset 0 0 0 1px rgba(var(--tj-border), 0.9), 2px 0 8px rgba(var(--tj-shadow), 0.1)',
            borderRadius: '50%',
          }}
        >
          ›
        </button>

        {/* 顶部标题栏 */}
        <header
          className="flex items-center gap-3 px-5 py-4"
          style={{
            borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.28)',
            background:
              'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.07), rgba(var(--tj-accent-primary), 0))',
          }}
        >
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center font-serif text-base"
            style={{
              color: 'rgb(var(--tj-accent-primary))',
              background:
                'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.12), rgba(var(--tj-accent-primary), 0.02))',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)',
              clipPath:
                'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
            }}
          >
            ◈
          </span>
          <div className="min-w-0 flex-1">
            <h3
              className="truncate font-serif text-lg font-semibold tracking-[0.3em]"
              style={{
                background:
                  'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 55%, rgb(var(--tj-accent-secondary)) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              处理队列
            </h3>
            <p
              className="mt-1 font-serif text-[11px] italic leading-relaxed tracking-[0.16em]"
              style={{ color: 'rgba(var(--tj-text-primary), 0.78)' }}
            >
              每回合 AI 输出后，依次跑完队列里所有任务
            </p>
          </div>
        </header>

        {/* 队列任务列表 */}
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-4 py-4 space-y-3">
          {queueRows.map((task, index) => (
            <TaskRow
              key={`${task.id}_${task.timestamp}_${index}`}
              index={index + 1}
              title={task.title}
              subtitle={task.subtitle}
              status={task.id === 'variable' ? variableStatus : task.status}
              batch={task.id === 'variable' ? latest ?? undefined : undefined}
              task={task}
              onCancel={onCancelTask}
            />
          ))}
        </div>
      </aside>
    </>
  );
}

function createIdleTask(id: 队列任务ID, title: string, subtitle: string): 队列任务记录 {
  return { id, title, subtitle, turn: 0, timestamp: 0, status: 'idle' };
}

// ── 任务行 ──

interface TaskRowProps {
  index: number;
  title: string;
  subtitle?: string;
  status: TaskStatus;
  batch?: 变量命令批次;
  task?: 队列任务记录;
  onCancel?: (id: 队列任务ID) => void;
}

function TaskRow({ index, title, subtitle, status, batch, task, onCancel }: TaskRowProps) {
  // 默认折叠；用户点「查看原始信息 / 查看变量」才展开。
  const [view, setView] = useState<'raw' | 'commands' | null>(null);

  const canViewRaw = !!batch?.rawText || !!task?.rawText;
  const canViewCommands = !!batch && batch.results.length > 0;

  const turnLabel = batch ? `第 ${batch.turn} 回合` : task?.turn ? `第 ${task.turn} 回合` : '尚未运行';
  const summary = batch
    ? (() => {
        const ok = batch.results.filter((r) => r.ok).length;
        const fail = batch.results.length - ok;
        return `${batch.results.length} 条 · ✓ ${ok}${fail > 0 ? ` · ✗ ${fail}` : ''}`;
      })()
    : task?.detail ?? '';
  const retrySummary = task?.retrying && task.failCount
    ? `失败 ${task.failCount} 次，正在重试`
    : task?.failCount
      ? `失败 ${task.failCount} 次`
      : '';
  const canCancel = status === 'pending' && !!task?.cancellable && !!onCancel;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgb(var(--tj-bubble)), rgb(var(--tj-surface-strong)))',
        boxShadow: `inset 0 0 0 1px ${
          status === 'pending'
            ? 'rgba(var(--tj-accent-primary), 0.45)'
            : status === 'failed'
              ? 'rgba(255, 130, 130, 0.35)'
              : 'rgba(var(--tj-border), 0.7)'
        }`,
        clipPath: smallClip,
      }}
    >
      {/* 行头 */}
      <div className="flex items-center gap-3 px-3 py-3">
        {/* 编号圆牌 */}
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center font-serif text-sm font-bold rounded-full"
          style={{
            color: 'rgb(var(--tj-accent-primary))',
            background: 'rgba(var(--tj-accent-primary), 0.08)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.5)',
          }}
        >
          {index}
        </span>

        {/* 标题 + 副标题 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="font-serif text-sm font-semibold tracking-[0.15em]"
              style={{ color: 'rgba(var(--tj-accent-primary), 0.95)' }}
            >
              {title}
            </span>
            <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
              · {turnLabel}
            </span>
          </div>
          {subtitle && (
            <div className="mt-0.5 text-[10px] truncate" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
              {subtitle}
            </div>
          )}
          {summary && (
            <div className="mt-0.5 text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
              {summary}
            </div>
          )}
          {retrySummary && (
            <div className="mt-0.5 text-[10px]" style={{ color: task?.retrying ? 'rgba(var(--tj-accent-primary), 0.88)' : 'rgba(255, 180, 180, 0.86)' }}>
              {retrySummary}
            </div>
          )}
        </div>

        {/* 状态图标 */}
        <div className="flex shrink-0 items-center gap-2">
          {canCancel && task && (
            <button
              type="button"
              onClick={() => onCancel(task.id)}
              className="px-2 py-1 text-[10px] font-serif tracking-[0.16em] transition-all hover:opacity-90"
              style={{
                color: 'rgba(145, 83, 58, 0.96)',
                background: 'rgba(var(--tj-accent-primary), 0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.34)',
                clipPath: smallClip,
              }}
            >
              取消
            </button>
          )}
          <StatusIcon status={status} />
        </div>
      </div>

      {/* 按钮条 */}
      <div
        className="flex items-stretch gap-2 px-3 pb-3"
        style={{ borderTop: '1px dashed rgba(var(--tj-accent-primary), 0.15)', paddingTop: '10px' }}
      >
        <ViewButton
          label="查看原始信息"
          active={view === 'raw'}
          disabled={!canViewRaw}
          onClick={() => setView((v) => (v === 'raw' ? null : 'raw'))}
        />
        <ViewButton
          label="查看变量"
          active={view === 'commands'}
          disabled={!canViewCommands}
          onClick={() => setView((v) => (v === 'commands' ? null : 'commands'))}
        />
      </div>

      {/* 展开区 */}
      {view === 'raw' && batch?.rawText && <RawTextPanel raw={batch.rawText} />}
      {view === 'raw' && !batch?.rawText && task?.rawText && <RawTextPanel raw={task.rawText} />}
      {view === 'commands' && batch && <CommandsPanel batch={batch} />}
    </div>
  );
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'pending') {
    return (
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center"
        title="处理中"
        aria-label="处理中"
      >
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
          background: 'rgba(252, 165, 165, 0.12)',
          boxShadow: 'inset 0 0 0 1px rgba(252, 165, 165, 0.45)',
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
          color: 'rgba(145, 83, 58, 0.92)',
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

// 圆形旋转加载动画
function Spinner() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      style={{ animation: 'kaituo-spin 1s linear infinite' }}
    >
      <style>{`@keyframes kaituo-spin { to { transform: rotate(360deg); transform-origin: 11px 11px; } }`}</style>
      <circle
        cx="11"
        cy="11"
        r="8"
        fill="none"
        stroke="rgba(var(--tj-accent-primary), 0.18)"
        strokeWidth="2"
      />
      <path
        d="M 11 3 A 8 8 0 0 1 19 11"
        fill="none"
        stroke="rgb(var(--tj-accent-primary))"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ViewButton({
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
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))'
          : 'rgba(var(--tj-accent-primary), 0.04)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.55)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.32)',
        clipPath:
          'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
      }}
    >
      {label}
    </button>
  );
}

function RawTextPanel({ raw }: { raw: string }) {
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

function CommandsPanel({ batch }: { batch: 变量命令批次 }) {
  return (
    <div className="px-3 pb-3 space-y-1.5">
      <div
        className="mb-1 font-serif text-[10px] tracking-[0.3em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.6)' }}
      >
        ◆ 变量命令
      </div>
      {batch.report && (
        <div
          className="text-[10px] italic px-2 py-1.5"
          style={{
            color: 'rgba(var(--tj-text-primary), 0.82)',
            background: 'rgb(var(--tj-bubble))',
            clipPath: smallClip,
          }}
        >
          {batch.report}
        </div>
      )}
      {batch.results.length === 0 && (
        <div className="text-[10px] text-center py-2" style={{ color: 'rgba(var(--tj-text-primary), 0.72)' }}>
          本回合无变量变化
        </div>
      )}
      {batch.results.map((result, i) => (
        <CommandRow key={i} result={result} />
      ))}
    </div>
  );
}

function CommandRow({ result }: { result: 变量命令结果 }) {
  const { command, ok, reason } = result;
  const style = ACTION_STYLE[command.action];
  const isNotice = result.kind === 'warning' || result.kind === 'error' || result.kind === 'rejected';

  const valuePreview = useMemo(() => {
    if (command.action === 'delete') return '';
    const v = command.value;
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return `"${v.length > 28 ? v.slice(0, 28) + '...' : v}"`;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return `[数组×${v.length}]`;
    if (typeof v === 'object') {
      const keys = Object.keys(v as Record<string, unknown>);
      return `{${keys.slice(0, 3).join(',')}${keys.length > 3 ? ',...' : ''}}`;
    }
    return String(v);
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
            clipPath: 'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)',
          }}
        >
          {result.kind === 'warning' ? '提示' : result.kind === 'error' ? '解析' : result.kind === 'rejected' ? '拒绝' : style.label}
        </span>
        <span className="font-mono break-all min-w-0 flex-1" style={{ color: 'rgba(var(--tj-text-primary), 0.94)' }}>
          {isNotice ? (reason ?? command.key) : command.key}
          {!isNotice && valuePreview && (
            <>
              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}> = </span>
              <span style={{ color: ok ? 'rgba(var(--tj-accent-primary), 0.95)' : 'rgba(176, 72, 68, 0.9)' }}>{valuePreview}</span>
            </>
          )}
        </span>
      </div>
      {!isNotice && !ok && reason && (
        <div className="mt-1 text-[10px] pl-1" style={{ color: 'rgba(255, 160, 160, 0.85)' }}>
          ✗ {reason}
        </div>
      )}
    </div>
  );
}
