import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AppErrorReporter, reportAppError } from '@/components/ui/AppErrorReporter';
import App from '@/App';
import '@/styles/tailwind.css';
import '@/styles/root-theme.css';
import '@/styles/global.css';

window.addEventListener('error', (event) => {
  console.error('[global-error]', event.error ?? event.message);
  reportAppError({ source: '全局异常', error: event.error ?? event.message });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason);
  reportAppError({ source: '未处理的异步异常', error: event.reason });
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <AppErrorReporter />
  </React.StrictMode>
);

window.__ROOT_MOUNTED__ = true;
