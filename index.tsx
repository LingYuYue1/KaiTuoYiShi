import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import App from '@/App';
import '@/styles/tailwind.css';
import '@/styles/root-theme.css';
import '@/styles/global.css';

window.addEventListener('error', (event) => {
  console.error('[global-error]', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason);
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

window.__ROOT_MOUNTED__ = true;
