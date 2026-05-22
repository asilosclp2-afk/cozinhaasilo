import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign Vite Hot Module Replacement (HMR) WebSocket connection errors
if (typeof window !== 'undefined') {
  const isViteWSWarning = (msg: string) => {
    return (
      msg.includes('WebSocket') ||
      msg.includes('websocket') ||
      msg.includes('vite') ||
      msg.includes('HMR') ||
      msg.includes('WebSocket closed')
    );
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || '');
    if (isViteWSWarning(reason)) {
      event.preventDefault();
      event.stopPropagation();
      console.debug('Ignored benign Vite/HMR connection error:', reason);
    }
  });

  window.addEventListener('error', (event) => {
    const message = event.message || '';
    if (isViteWSWarning(message)) {
      event.preventDefault();
      event.stopPropagation();
      console.debug('Ignored benign Vite/HMR error event:', message);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

