// @vitest-environment jsdom
import { Component, Suspense, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazyWithRetry } from '@/utils/lazyWithRetry';

/**
 * 首页四个入口（踏上旅途 / 读取光锥 / 如我所书 / 智库）全部经由 lazyWithRetry 动态加载。
 * 本文件锁定用户实际遭遇的失败形态：chunk 拉取失败或停滞时，界面必须停在可见、可重试的
 * 失败卡片，而不是静默整页重载（“闪一下就退回首页”）、永久停留在载入中、或炸到全局错误边界
 * （“时间线校准中断”）。
 *
 * jsdom 限制：location 为 unforgeable，reload 无法拦截；重试入口只断言存在与点击不破坏界面。
 */

const CHUNK_ERROR = new Error('Failed to fetch dynamically imported module: http://localhost/assets/ZhikuManagerModal.js');
const TIMEOUT_PROBE_MS = 15000;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const OkComponent = () => <div>智库就绪</div>;

describe('lazyWithRetry：失败可见且可重试', () => {
  it('加载成功时正常渲染组件', async () => {
    const Lazy = lazyWithRetry(() => Promise.resolve({ default: OkComponent }), '智库');
    render(
      <Suspense fallback={<div>智库载入中</div>}>
        <Lazy />
      </Suspense>,
    );
    expect(await screen.findByText('智库就绪')).toBeTruthy();
  });

  it('chunk 拉取失败时停在可见的失败卡片，不静默重载、不永久挂起', async () => {
    const Lazy = lazyWithRetry(() => Promise.reject(CHUNK_ERROR), '智库');
    render(
      <Suspense fallback={<div>智库载入中</div>}>
        <Lazy />
      </Suspense>,
    );

    expect(await screen.findByText(/资源载入失败/)).toBeTruthy();
    expect(screen.getByRole('alert').getAttribute('data-lazy-load-failed')).toBe('智库');
    expect(screen.getByRole('alert').getAttribute('data-lazy-load-reason')).toBe('fetch');
  });

  it('加载停滞超时后显示失败卡片，而不是永久停留在载入中', async () => {
    vi.useFakeTimers();
    const Lazy = lazyWithRetry(() => new Promise<{ default: ComponentType }>(() => {}), '存档系统');
    render(
      <Suspense fallback={<div>存档系统载入中</div>}>
        <Lazy />
      </Suspense>,
    );
    expect(screen.getByText('存档系统载入中')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMEOUT_PROBE_MS);
    });

    expect(screen.getByText(/资源载入失败/)).toBeTruthy();
    expect(screen.getByRole('alert').getAttribute('data-lazy-load-reason')).toBe('timeout');
  });

  it('失败卡片提供「重新载入」入口，点击不破坏失败态界面', async () => {
    const Lazy = lazyWithRetry(() => Promise.reject(CHUNK_ERROR), '如我所书');
    render(
      <Suspense fallback={<div>如我所书载入中</div>}>
        <Lazy />
      </Suspense>,
    );

    // jsdom 的 location.reload 不可拦截（文件头注释）；这里只锁定入口存在与点击不破坏失败卡片，
    // reload 的实际转发行为由生产代码的 window.location.reload() 承担，无法在 jsdom 内断言。
    const retryButton = await screen.findByRole('button', { name: '重新载入' });
    expect(retryButton).toBeTruthy();
    fireEvent.click(retryButton);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').getAttribute('data-lazy-load-failed')).toBe('如我所书');
  });

  it('组件真实错误仍抛给错误边界，不被伪装成资源载入失败', async () => {
    const Boom = () => {
      throw new Error('render exploded');
    };
    // eslint-disable-next-line no-restricted-syntax -- React 错误边界只能由 class 承载；测试内最小实现，非生产代码
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      render() {
        return this.state.failed ? <div>边界兜底</div> : this.props.children;
      }
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Lazy = lazyWithRetry(() => Promise.resolve({ default: Boom }), '智库');
    render(
      <Boundary>
        <Suspense fallback={<div>载入中</div>}>
          <Lazy />
        </Suspense>
      </Boundary>,
    );

    expect(await screen.findByText('边界兜底')).toBeTruthy();
    expect(screen.queryByText(/资源载入失败/)).toBeNull();
    errorSpy.mockRestore();
  });
});

describe('首页入口交互回归', () => {
  function HomeEntry({ label, loader }: { label: string; loader: () => Promise<{ default: ComponentType }> }) {
    const [open, setOpen] = useState(false);
    const Lazy = useMemo(() => lazyWithRetry(loader, label), [loader, label]);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          {label}
        </button>
        {open && (
          <Suspense fallback={<div>{label}载入中</div>}>
            <Lazy />
          </Suspense>
        )}
      </div>
    );
  }

  it('点击入口后 chunk 失败：界面停在失败卡片而不是闪退回首页', async () => {
    const loader = () => Promise.reject(CHUNK_ERROR);
    render(<HomeEntry label="智库" loader={loader} />);

    fireEvent.click(screen.getByRole('button', { name: '智库' }));

    expect(await screen.findByText(/资源载入失败/)).toBeTruthy();
    expect(screen.getByRole('alert').getAttribute('data-lazy-load-failed')).toBe('智库');
  });
});
