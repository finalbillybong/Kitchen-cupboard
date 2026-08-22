import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { PreferencesProvider } from './hooks/usePreferences';
import './index.css';
import { initializeOutbox } from './offline/outbox';

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

// Migrate the legacy service-worker queue and begin ordered replay.
initializeOutbox().catch((error) => console.error('Outbox unavailable:', error));

// Register service worker for offline app-shell and read caching.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Version the script URL so this rollout bypasses any stale edge-cached
    // legacy worker. Keep updateViaCache disabled for all subsequent checks.
    navigator.serviceWorker.register('/sw.js?v=2', { updateViaCache: 'none' }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
