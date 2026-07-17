import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type AppRepairAction = 'open-api-settings';

export type AppErrorRecord = Readonly<{
  id: string;
  source: string;
  message: string;
  at: number;
  repair?: AppRepairAction;
}>;

type AppErrorInput = Readonly<{
  source: string;
  error: unknown;
  repair?: AppRepairAction;
}>;

const MAX_RECORDS = 12;
const FLOATING_MARGIN = 12;
const listeners = new Set<(records: readonly AppErrorRecord[]) => void>();
let records: AppErrorRecord[] = [];

export const APP_REPAIR_EVENT = 'kaituoyishi:repair';

export function reportAppError({ source, error, repair }: AppErrorInput): AppErrorRecord {
  const message = toSafeMessage(error);
  const record: AppErrorRecord = {
    id: crypto.randomUUID(),
    source,
    message,
    at: Date.now(),
    repair,
  };
  records = [record, ...records].slice(0, MAX_RECORDS);
  for (const listener of listeners) listener(records);
  return record;
}

export function AppErrorReporter() {
  const [items, setItems] = useState<readonly AppErrorRecord[]>(records);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number } | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  const moveFloatingNotice = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) draggedRef.current = true;
    const maxLeft = Math.max(FLOATING_MARGIN, window.innerWidth - event.currentTarget.offsetWidth - FLOATING_MARGIN);
    const maxTop = Math.max(FLOATING_MARGIN, window.innerHeight - event.currentTarget.offsetHeight - FLOATING_MARGIN);
    setPosition({
      left: Math.max(FLOATING_MARGIN, Math.min(maxLeft, drag.left + deltaX)),
      top: Math.max(FLOATING_MARGIN, Math.min(maxTop, drag.top + deltaY)),
    });
  }, []);
  const finishDragging = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);
  const toggleExpanded = useCallback(() => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setExpanded((value) => !value);
  }, []);

  if (!items.length) return null;
  const latest = items[0];

  return (
    <aside
      className={`fixed z-[200] cursor-grab touch-none select-none active:cursor-grabbing ${expanded ? 'w-[min(25rem,calc(100vw-2rem))]' : 'w-auto'}`}
      style={position ? { left: position.left, top: position.top } : { right: '1rem', top: '1rem' }}
      aria-live="polite"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        draggedRef.current = false;
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={moveFloatingNotice}
      onPointerUp={finishDragging}
      onPointerCancel={finishDragging}
    >
      <div className={`overflow-hidden rounded-lg border border-rose-300/35 bg-slate-950/95 shadow-2xl backdrop-blur ${expanded ? '' : 'shadow-lg'}`}>
        <button
          type="button"
          className={`flex w-full items-center text-left ${expanded ? 'gap-3 px-4 py-3' : 'h-9 min-w-9 justify-center gap-1 px-2'}`}
          onClick={toggleExpanded}
          title={expanded ? '拖动此浮窗，点击收起' : `${latest.source}：${latest.message}。点击展开，拖动移动。`}
          aria-label={expanded ? '收起错误报告' : `展开错误报告，共 ${items.length} 条`}
        >
          <span className={expanded ? 'mt-0.5 text-rose-300' : 'text-sm text-rose-300'}>!</span>
          {expanded ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-slate-400">{latest.source} · {latest.id.slice(0, 8)}</span>
                <span className="mt-1 block text-sm text-slate-100">{latest.message}</span>
              </span>
              <span className="text-xs text-slate-400">收起</span>
            </>
          ) : items.length > 1 ? (
            <span className="text-[10px] text-slate-300">{items.length}</span>
          ) : null}
        </button>
        {latest.repair && <RepairButton repair={latest.repair} />}
        {expanded && (
          <ol className="max-h-64 overflow-auto border-t border-white/10 px-4 py-2">
            {items.map((item) => (
              <li key={item.id} className="border-b border-white/5 py-2 last:border-0">
                <div className="text-xs text-slate-400">{new Date(item.at).toLocaleTimeString()} · {item.source} · {item.id.slice(0, 8)}</div>
                <div className="mt-0.5 text-sm text-slate-200">{item.message}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

function RepairButton({ repair }: { repair: AppRepairAction }) {
  const label = repair === 'open-api-settings' ? '前往 API 设置' : '修复';
  return (
    <button
      type="button"
      className="mx-4 mb-3 rounded bg-cyan-300/15 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-300/25"
      onClick={() => window.dispatchEvent(new CustomEvent<AppRepairAction>(APP_REPAIR_EVENT, { detail: repair }))}
    >
      {label}
    </button>
  );
}

function toSafeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '发生未知错误');
  if (/请先配置有效的主 API 接口/.test(raw)) return '请先配置有效的主 API 接口。';
  if (/协议|canonical protocol/.test(raw)) return '模型返回格式不符合当前协议。';
  if (/aborted|cancelled|取消/i.test(raw)) return '操作已取消。';
  if (/response was empty|返回空响应/.test(raw)) return '模型没有返回可用内容。';
  return '操作未完成；请使用诊断 ID 在错误报告中排查。';
}
