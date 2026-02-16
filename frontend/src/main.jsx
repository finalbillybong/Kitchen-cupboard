import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Replay offline queue when back online
      window.addEventListener('online', () => {
        reg.active?.postMessage('replay-queue');
      });

      // Listen for sync completion to refresh data
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'queue-replayed') {
          window.location.reload();
        }
      });
    }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
