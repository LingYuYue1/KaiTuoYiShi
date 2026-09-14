import React, { useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { App } from '@/App';
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
 * 静态首屏的移除。
 *
 * 必须等到 React 真正提交后才算「已挂载」：createRoot().render() 只是异步调度，
 * 返回时什么都没渲染。此前 __ROOT_MOUNTED__ 在 render() 之后立刻置位，
 * 于是首次提交前的任何错误都被当成「已挂载」而漏出 index.html 的首屏错误捕获。
 * 放在同一个 useLayoutEffect 里，置位与移除同帧完成。
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

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BootSplashRemover />
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
