import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { devLogError } from '@/utils/devLog';

/**
 * 动态 chunk 最长等待时间：超过即判定停滞，不再让 Suspense fallback 永久停留。
 * 取 12s：冷启动 on-demand 转换与慢网络下仍有余量，又不至于让玩家面对无声空转。
 */
export const LAZY_CHUNK_TIMEOUT_MS = 12000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React.lazy 签名要求 ComponentType<any>，收窄会破坏有 props 组件的可赋值性
export type PreloadableLazyComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload: () => Promise<void>;
};

type ChunkLoadTimeoutError = Error & { chunkLoadTimeout: true };

const createChunkLoadTimeoutError = (): ChunkLoadTimeoutError =>
  Object.assign(new Error(`动态资源加载超时（${LAZY_CHUNK_TIMEOUT_MS}ms）`), {
    name: 'ChunkLoadTimeoutError',
    chunkLoadTimeout: true as const,
  });

const isChunkLoadTimeoutError = (error: unknown): boolean =>
  error instanceof Error && 'chunkLoadTimeout' in error;

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : '');
  return /dynamically imported module|failed to fetch|loading chunk|chunkloaderror/i.test(message);
}

/**
 * 加载失败时的可见终局：停在原地给出可重试卡片，而不是静默整页重载或把异常抛给全局错误边界。
 * reload 是 jsdom unforgeable，故重试动作收敛到 window.location.reload（唯一可靠的恢复通道）。
 */
function ChunkLoadFailure({ label, reason }: { label: string; reason: 'timeout' | 'fetch' }) {
  return (
    <div
      role="alert"
      data-lazy-load-failed={label}
      data-lazy-load-reason={reason}
      className="fixed inset-0 z-[300] flex items-center justify-center p-6"
      style={{ background: 'rgba(4,4,6,0.72)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-md p-6 text-center"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--tj-bg-secondary),0.96), rgba(var(--tj-bg-primary),0.98))',
          boxShadow:
            'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.38), 0 24px 70px rgba(0,0,0,0.52), 0 0 36px rgba(var(--tj-btn-primary-start),0.08)',
          clipPath: 'polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)',
        }}
      >
        <div className="mb-2 font-mono text-[11px] tracking-[0.5em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.82)' }}>
          RESOURCE / LOAD ALERT
        </div>
        <div className="mb-2 font-serif text-lg font-bold tracking-[0.12em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
          「{label}」资源载入失败
        </div>
        <p className="mx-auto mb-4 max-w-sm text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
          {reason === 'timeout'
            ? '等待加载超时：网络或本地开发服务器可能未响应。'
            : '资源请求失败：可能是网络波动，或资源版本已更新。'}
          重载页面通常即可恢复。
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 font-serif text-sm font-semibold tracking-[0.24em] transition-all hover:opacity-90"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.98), rgba(var(--tj-btn-primary-end),0.94))',
            color: 'rgb(var(--tj-on-accent))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.52), 0 0 18px rgba(var(--tj-btn-primary-start),0.2)',
            clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
          }}
        >
          重新载入
        </button>
      </div>
    </div>
  );
}

function withChunkTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(createChunkLoadTimeoutError()), LAZY_CHUNK_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

/**
 * 懒加载 + 失败可见化。
 *
 * 行为契约：
 * - 成功：正常渲染，行为与 React.lazy 一致。
 * - chunk 拉取失败 / 加载超时：返回一张可重试的失败卡片（停在当前 surface），
 *   不再静默整页 reload、不再 `new Promise(() => {})` 永久挂起、不再炸到全局错误边界。
 * - 组件自身的真实错误（非 chunk 失败）：原样抛出，交给错误边界，不伪装成加载失败。
 * - `preload()`：空闲预加载，失败静默，不触发任何 UI 或重载。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 同上：约束必须与 React.lazy 的 ComponentType<any> 对齐
export function lazyWithRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  label = '系统资源',
): PreloadableLazyComponent<T> {
  let modulePromise: Promise<{ default: T }> | null = null;

  const loadModule = () => {
    if (!modulePromise) {
      const attempt = loader().catch((error: unknown) => {
        if (modulePromise === attempt) modulePromise = null;
        throw error;
      });
      // 超时可能抢先终结竞速；预挂拒绝处理避免无人认领的拒绝噪声（不改变传播）。
      attempt.catch(() => {});
      modulePromise = attempt;
    }
    return modulePromise;
  };

  const component = lazy(async () => {
    try {
      return await withChunkTimeout(loadModule());
    } catch (error) {
      const timedOut = isChunkLoadTimeoutError(error);
      if (!timedOut && !isChunkLoadError(error)) throw error;
      modulePromise = null;
      devLogError('ui', 'lazy-load-failed', error, { label, reason: timedOut ? 'timeout' : 'chunk' });
      const reason = timedOut ? 'timeout' : 'fetch';
      const Failed = () => <ChunkLoadFailure label={label} reason={reason} />;
      return { default: Failed as unknown as T };
    }
  }) as PreloadableLazyComponent<T>;

  component.preload = async () => {
    try {
      await withChunkTimeout(loadModule());
    } catch {
      // 空闲预加载失败不触发 UI、不重载、不泄漏未处理拒绝；真实渲染时会走可见卡片。
      modulePromise = null;
    }
  };

  return component;
}
