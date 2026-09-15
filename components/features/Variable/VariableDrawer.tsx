import { useMemo, useState } from 'react';
import { 派生变量批次诊断, type 变量命令批次 } from '@/models/variableCommand';
import type { 队列任务ID, 队列任务记录, 队列任务状态 } from '@/models/queueTask';
import { 队列任务可重试 } from '@/hooks/useGame/turnActionRuntime';
import {
  CommandRow,
  DiagnosticsPanel,
  QueueActionButton,
  RawTextPanel,
  StatusIcon,
  ViewButton,
  smallClip,
} from './variableDrawerPrimitives';

interface Props {
  batches: 变量命令批次[];
  tasks: 队列任务记录[];
  /** 变量模型正在跑（主回复已落地，变量结算中）。 */
  pending?: boolean;
  onCancelTask?: (id: 队列任务ID) => void;
  onRetryTask?: (task: 队列任务记录, mode: 'retry' | 'reroll') => void | Promise<void>;
}

export function VariableDrawer({ batches, tasks, pending, onCancelTask, onRetryTask }: Props) {
  const [open, setOpen] = useState(false);

  const latest = batches.length > 0 ? batches[batches.length - 1] : null;
  const latestTaskById = useMemo(() => {
    const map = new Map<队列任务ID, 队列任务记录>();
    for (const task of tasks) map.set(task.id, task);
    return map;
  }, [tasks]);

  const variableStatus: 队列任务状态 = pending
    ? 'pending'
    : latest
      ? latest.results.some((r) => !r.ok && r.kind !== 'warning')
        ? 'failed'
        : 'success'
      : latestTaskById.get('variable')?.status ?? 'idle';

  const queueRows = [
    latestTaskById.get('variable') ?? createIdleTask('variable', '变量生成', '解析正文并落地变量命令'),
    latestTaskById.get('narrative_image_parse') ?? createIdleTask('narrative_image_parse', '故事快照解析', '从正文提取故事快照提示词'),
    latestTaskById.get('narrative_image_generate') ?? createIdleTask('narrative_image_generate', '故事快照生成', '调用生图 API 生成故事快照'),
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
            ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-amber-deep), 0.95))'
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
          background: 'rgba(var(--tj-panel-bg-start),0.14)',
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
          background: 'radial-gradient(circle at 12% 0%, rgba(var(--tj-tech-cyan),0.1), transparent 32%), linear-gradient(180deg, rgb(var(--tj-bubble)), rgb(var(--tj-surface-strong)))',
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
              onRetry={onRetryTask}
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
  status: 队列任务状态;
  batch?: 变量命令批次;
  task?: 队列任务记录;
  onCancel?: (id: 队列任务ID) => void;
  onRetry?: (task: 队列任务记录, mode: 'retry' | 'reroll') => void | Promise<void>;
}

function TaskRow({ index, title, subtitle, status, batch, task, onCancel, onRetry }: TaskRowProps) {
  // 默认折叠；用户点「查看原始信息 / 查看变量」才展开。
  const [view, setView] = useState<'raw' | 'commands' | null>(null);

  const canViewRaw = !!batch?.rawText || !!task?.rawText;
  const canViewCommands = !!batch && batch.results.length > 0;

  const turnLabel = batch ? `第 ${batch.turn} 回合` : task?.turn ? `第 ${task.turn} 回合` : '尚未运行';
  const summary = batch
    ? (() => {
        const ok = batch.results.filter((r) => r.ok).length;
        const fail = batch.results.length - ok;
        const diagnosis = 派生变量批次诊断(batch.results).length;
        return `${batch.results.length} 条 · ✓ ${ok}${fail > 0 ? ` · ✗ ${fail}` : ''}${diagnosis > 0 ? ` · 诊断 ${diagnosis}` : ''}`;
      })()
    : task?.detail ?? '';
  const retrySummary = task?.retrying && task.failCount
    ? `失败 ${task.failCount} 次，正在重试`
    : task?.failCount
      ? `失败 ${task.failCount} 次`
      : '';
  const canCancel = status === 'pending' && !!task?.cancellable && !!onCancel;
  const canRetry = status === 'failed' && !!task && 队列任务可重试(task.id) && !!onRetry;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgb(var(--tj-bubble)), rgb(var(--tj-surface-strong)))',
        boxShadow: `inset 0 0 0 1px ${
          status === 'pending'
            ? 'rgba(var(--tj-accent-primary), 0.45)'
            : status === 'failed'
              ? 'rgba(var(--tj-danger),0.35)'
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
            <div className="mt-0.5 text-[10px]" style={{ color: task?.retrying ? 'rgba(var(--tj-accent-primary),0.92)' : 'rgba(255, 180, 180, 0.86)' }}>
              {retrySummary}
            </div>
          )}
        </div>

        {/* 状态图标 */}
        <div className="flex shrink-0 items-center gap-2">
          {canRetry && (
            <div className="flex items-center gap-1">
              <QueueActionButton label="重试" onClick={() => void onRetry(task, 'retry')} />
              <QueueActionButton label="重生成" onClick={() => void onRetry(task, 'reroll')} />
            </div>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancel(task.id)}
              className="px-2 py-1 text-[10px] font-serif tracking-[0.16em] transition-all hover:opacity-90"
              style={{
                color: 'rgba(var(--tj-accent-secondary),0.96)',
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

function CommandsPanel({ batch }: { batch: 变量命令批次 }) {
  const diagnostics = 派生变量批次诊断(batch.results);
  const commandResults = batch.results.filter(
    (result) => result.kind !== 'warning' && result.kind !== 'error' && result.kind !== 'rejected',
  );

  return (
    <>
      {batch.report && (
        <div className="px-3 pb-1">
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
        </div>
      )}

      <DiagnosticsPanel diagnostics={diagnostics} />

      <div className="px-3 pb-3 space-y-1.5">
        <div
          className="mb-1 font-serif text-[10px] tracking-[0.3em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.6)' }}
        >
          ◆ 变量命令
        </div>
        {commandResults.length === 0 ? (
          <div className="text-[10px] text-center py-2" style={{ color: 'rgba(var(--tj-text-primary), 0.72)' }}>
            {batch.results.length === 0 ? '本回合无变量变化' : '本回合无落地命令'}
          </div>
        ) : (
          commandResults.map((result, i) => <CommandRow key={i} result={result} />)
        )}
      </div>
    </>
  );
}
