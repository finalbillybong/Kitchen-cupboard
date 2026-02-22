import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { PreferencesProvider } from './hooks/usePreferences';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <PreferencesProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
      // Check for SW updates periodically (every 60s)
      setInterval(() => reg.update(), 60 * 1000);

      // When a new SW is installed and waiting, reload to activate it
      reg.addEventListener('updatefound', () => {
        const newSw = reg.installing;
        if (newSw) {
          newSw.addEventListener('statechange', () => {
            if (newSw.state === 'activated') {
              window.location.reload();
            }
          });
        }
      });

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
