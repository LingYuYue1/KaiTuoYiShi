import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统 } from '@/models/zhiku';
import type { ResourceProgress } from '@/data/resourceBundle';
import { devLogError } from '@/utils/devLog';

/**
 * 内置预置资源两路的挂死兜底：载入完全无响应时降级为 failed，避免门禁永远关着。
 * 这不是等待预算——两路的唯一出口是「变成 ready 或 failed」。
 */
const BOOT_LOAD_TIMEOUT_MS = 120000;

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'failed'; reason: string };

/**
 * 载入相位。**进度条只投影 network**——网络完成之后的解析/归一化/合并/落盘都属于 processing，
 * 不再驱动进度显示（否则「已载入 N/M」会把加工算成网络进度）。
 */
export type LoadPhase = 'network' | 'processing' | 'ready' | 'failed';

export interface PresetSnapshot {
  phase: LoadPhase;
  story: Resource<剧情编织系统>;
  zhiku: Resource<智库系统>;
  /** 网络段进度：两路已取回（响应体读完）的文件数合计。进度条唯一数据源。 */
  network: { done: number; total: number };
  startedAt: number;
}

export interface PresetTrack<T, R = unknown> {
  /** 该路的文件总数（网络段单位）。 */
  total: number;
  /** 网络段：取回原始载荷；进度在响应体读完后上报。抛错即该路失败。 */
  fetch: (onProgress: ResourceProgress) => Promise<R[]>;
  /** 加工段：解析 / 归一化或构造 / 合并 / 落盘。无进度上报。抛错即该路失败。 */
  process: (raw: R[]) => Promise<T>;
}

export interface PresetLoaderDeps {
  story: PresetTrack<剧情编织系统, string>;
  zhiku: PresetTrack<智库系统, string>;
  timeoutMs?: number;
}

export interface PresetLoader {
  getSnapshot: () => PresetSnapshot;
  subscribe: (listener: (snapshot: PresetSnapshot) => void) => () => void;
  /** 幂等启动；已在跑或已启动过则不重复。 */
  start: () => void;
  /** 重跑两路；旧一轮的结果按运行号丢弃。 */
  retry: () => void;
  dispose: () => void;
}

type TrackKey = 'story' | 'zhiku';

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  // 同步预挂载 noop 拒绝处理器：超时后原 promise 可能仍以拒绝收尾，
  // 无人认领会被 Node 误报为未处理拒绝；挂载只做标记不吞错。
  promise.then(undefined, () => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}载入超时（${ms}ms）`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * 内置预置资源的两合一载入器：原著正文与智库目录各自独立推进、各自就地落定。
 *
 * 每路分两段：network（取回，上报进度）与 processing（加工，静默）。相位由两路状态推导，
 * 供视图判断「进度条该不该出现」。失败态就是失败态——没有降级缓存，门禁据此关闭。
 */
export function createPresetLoader(deps: PresetLoaderDeps): PresetLoader {
  const timeoutMs = deps.timeoutMs ?? BOOT_LOAD_TIMEOUT_MS;
  const totals: Record<TrackKey, number> = { story: deps.story.total, zhiku: deps.zhiku.total };
  const fetchDone: Record<TrackKey, number> = { story: 0, zhiku: 0 };
  const fetched: Record<TrackKey, boolean> = { story: false, zhiku: false };
  const listeners = new Set<(snapshot: PresetSnapshot) => void>();

  let resources: Pick<PresetSnapshot, 'story' | 'zhiku'> = {
    story: { status: 'loading' },
    zhiku: { status: 'loading' },
  };
  let startedAt = Date.now();
  let snapshot: PresetSnapshot = assemble();
  /** 自增即开启新一轮；旧一轮的结果按运行号丢弃。 */
  let runId = 0;
  let started = false;

  function derivePhase(): LoadPhase {
    if (resources.story.status === 'failed' || resources.zhiku.status === 'failed') return 'failed';
    if (resources.story.status === 'ready' && resources.zhiku.status === 'ready') return 'ready';
    if (fetched.story && fetched.zhiku) return 'processing';
    return 'network';
  }

  function assemble(): PresetSnapshot {
    return {
      phase: derivePhase(),
      story: resources.story,
      zhiku: resources.zhiku,
      network: { done: fetchDone.story + fetchDone.zhiku, total: totals.story + totals.zhiku },
      startedAt,
    };
  }

  function publish(next: Pick<PresetSnapshot, 'story' | 'zhiku'>): void {
    resources = next;
    snapshot = assemble();
    for (const listener of listeners) listener(snapshot);
  }

  const runTrack = async <T>(
    id: number,
    key: TrackKey,
    track: PresetTrack<T, string>,
    setResource: (resource: Resource<T>) => void,
    label: string,
  ): Promise<void> => {
    try {
      const value = await withTimeout(
        (async (): Promise<T | null> => {
          const raw = await track.fetch((nextDone) => {
            if (id !== runId) return;
            fetchDone[key] = nextDone;
            publish({ ...resources });
          });
          if (id !== runId) return null;
          // 网络段完成：相位转入 processing（此前进度条已可见的，交由视图退场）。
          fetched[key] = true;
          publish({ ...resources });
          return await track.process(raw);
        })(),
        timeoutMs,
        label,
      );
      if (id !== runId || value === null) return;
      fetchDone[key] = totals[key];
      setResource({ status: 'ready', value });
    } catch (error) {
      if (id !== runId) return;
      devLogError('save', 'preset-load-failed', error, { track: key });
      setResource({ status: 'failed', reason: describeError(error) });
    }
  };

  const begin = (): void => {
    const id = ++runId;
    fetchDone.story = 0;
    fetchDone.zhiku = 0;
    fetched.story = false;
    fetched.zhiku = false;
    startedAt = Date.now();
    publish({
      story: { status: 'loading' },
      zhiku: { status: 'loading' },
    });
    // 两路各自应用结果：任一停滞/失败都不饿死另一路。
    void Promise.all([
      runTrack(id, 'story', deps.story, (resource) => publish({ ...resources, story: resource }), '原著正文'),
      runTrack(id, 'zhiku', deps.zhiku, (resource) => publish({ ...resources, zhiku: resource }), '智库目录'),
    ]);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start: () => {
      if (started) return;
      started = true;
      begin();
    },
    retry: () => {
      started = true;
      begin();
    },
    dispose: () => {
      listeners.clear();
    },
  };
}
