import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import App from '@/App';
import '@/styles/tailwind.css';
import '@/styles/root-theme.css';
import '@/styles/global.css';

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
