/**
 * Coalesce high-frequency text updates to at most one React commit per animation frame.
 * Final/empty values can be flushed immediately so terminal state is not delayed.
 */
export interface RafCoalescedSetter {
  /** Schedule a commit for the next animation frame (latest value wins). */
  set: (value: string) => void;
  /** Commit immediately (cancels any pending rAF). Use for clear/final states. */
  flush: (value: string) => void;
  /** Cancel pending rAF without committing. */
  cancel: () => void;
}

export function createRafCoalescedSetter(
  commit: (value: string) => void,
): RafCoalescedSetter {
  let pending: string | null = null;
  let rafId: number | null = null;

  const cancel = () => {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
    pending = null;
  };

  const flush = (value: string) => {
    cancel();
    commit(value);
  };

  const set = (value: string) => {
    pending = value;
    if (rafId != null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const next = pending;
      pending = null;
      if (next != null) commit(next);
    });
  };

  return { set, flush, cancel };
}
