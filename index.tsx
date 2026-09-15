import React, { useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { App } from '@/App';
import { bootPerfCommit, bootPerfStart } from '@/utils/bootPerf';
import '@/styles/tailwind.css';
import '@/styles/root-theme.css';
import '@/styles/global.css';

window.addEventListener('error', (event) => {
  console.error('[global-error]', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason);
});

/**
 * 静态首屏的移除。必须等到 React 真正提交后才算「已挂载」——createRoot().render() 只是异步调度，
 * 返回时什么都没渲染；若在那里立刻置位 __ROOT_MOUNTED__，首次提交前的错误会被当成「已挂载」
 * 而漏出 index.html 的首屏错误捕获。置位与移除放在同一个 useLayoutEffect 里，同帧完成。
 */
function BootSplashRemover() {
  useLayoutEffect(() => {
    window.__ROOT_MOUNTED__ = true;
    document.getElementById('boot-splash')?.remove();
  }, []);
  return null;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

bootPerfStart();

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BootSplashRemover />
      {/* TEMP 性能测量：记录 React 提交次数与单次提交成本（测量后移除）。 */}
      <React.Profiler
        id="app"
        onRender={(_id, phase, actualDuration) => { bootPerfCommit(phase, actualDuration); }}
      >
        <App />
      </React.Profiler>
    </ErrorBoundary>
  </React.StrictMode>
);
