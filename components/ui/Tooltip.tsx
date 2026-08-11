import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

type Placement = 'top' | 'bottom';

interface TooltipProps {
  label: string;
  description?: string;
  children: ReactElement<{ 'aria-describedby'?: string }>;
  placement?: Placement;
}

const tooltipClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

/** A portal tooltip that is visible only while hovering or keyboard focusing its trigger. */
export function Tooltip({ label, description, children, placement = 'top' }: TooltipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focusVisible, setFocusVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  const [ownerDocument, setOwnerDocument] = useState<Document | null>(null);
  const open = (hovered || focusVisible) && !dismissed;

  const onTriggerRef = useCallback((node: HTMLSpanElement | null) => {
    triggerRef.current = node;
    setOwnerDocument(node?.ownerDocument ?? null);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const rect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const view = trigger.ownerDocument.defaultView;
    const viewportWidth = view?.innerWidth ?? rect.right;
    const viewportHeight = view?.innerHeight ?? rect.bottom;
    const maxLeft = Math.max(12, viewportWidth - tooltipRect.width - 12);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - tooltipRect.width / 2), maxLeft);
    const spaceAbove = rect.top - 7;
    const spaceBelow = viewportHeight - rect.bottom - 7;
    const placeAbove = placement === 'top'
      ? tooltipRect.height <= spaceAbove || spaceAbove >= spaceBelow
      : !(tooltipRect.height <= spaceBelow || spaceBelow >= spaceAbove);
    const preferredTop = placeAbove ? rect.top - tooltipRect.height - 7 : rect.bottom + 7;
    const maxTop = Math.max(8, viewportHeight - tooltipRect.height - 8);
    const top = Math.min(Math.max(8, preferredTop), maxTop);
    setPosition({ left, top, ready: true });
  }, [placement]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open || !ownerDocument) return;
    const reposition = () => updatePosition();
    const view = ownerDocument.defaultView;
    view?.addEventListener('resize', reposition);
    ownerDocument.addEventListener('scroll', reposition, true);
    return () => {
      view?.removeEventListener('resize', reposition);
      ownerDocument.removeEventListener('scroll', reposition, true);
    };
  }, [open, ownerDocument, updatePosition]);

  useEffect(() => {
    if (!open || !ownerDocument) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDismissed(true);
        setHovered(false);
        setFocusVisible(false);
      }
    };
    ownerDocument.addEventListener('keydown', onKeyDown);
    return () => ownerDocument.removeEventListener('keydown', onKeyDown);
  }, [open, ownerDocument]);

  const describedBy = [children.props['aria-describedby'], id].filter(Boolean).join(' ');

  return (
    <span
      ref={onTriggerRef}
      className="inline-flex"
      onPointerEnter={(event) => {
        if (event.pointerType === 'touch') return;
        setDismissed(false);
        setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') setHovered(false);
      }}
      onFocusCapture={(event) => {
        const ElementCtor = event.currentTarget.ownerDocument.defaultView?.Element;
        const visible = Boolean(ElementCtor && event.target instanceof ElementCtor && event.target.matches(':focus-visible'));
        setFocusVisible(visible);
        if (visible) setDismissed(false);
      }}
      onBlurCapture={() => setFocusVisible(false)}
    >
      {cloneElement(children, { 'aria-describedby': describedBy })}
      {open && ownerDocument && createPortal(
        <div
          ref={tooltipRef}
          id={id}
          role="tooltip"
          className="pointer-events-none z-[100] w-max max-w-[min(280px,calc(100vw-24px))] px-2.5 py-1.5 motion-reduce:transition-none"
          style={{
            position: 'fixed', left: position.left, top: position.top,
            visibility: position.ready ? 'visible' : 'hidden',
            color: 'rgb(var(--tj-text-primary))', background: 'rgba(var(--tj-panel-bg-start), 0.98)',
            boxShadow: '0 8px 22px rgba(var(--tj-shadow), 0.22), inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.32)',
            clipPath: tooltipClip,
          }}
        >
          <span className="block font-serif text-xs font-medium tracking-[0.08em]">{label}</span>
          {description && <span className="mt-0.5 block text-[10px] tracking-[0.04em] opacity-70">{description}</span>}
        </div>,
        ownerDocument.body,
      )}
    </span>
  );
}
