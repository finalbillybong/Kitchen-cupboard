import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../api/client';

const STORAGE_KEY = 'kc-preferences';

const defaults = {
  tapMode: 'two', // 'one' = tap anywhere to check, 'two' = tap checkbox only (current)
};

// Backend uses snake_case, frontend uses camelCase
function fromApi(data) {
  return {
    tapMode: data.tap_mode || defaults.tapMode,
  };
}

function toApi(prefs) {
  return {
    tap_mode: prefs.tapMode,
  };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaults };
}

function saveLocal(prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(loadLocal);

  // Sync from backend on mount (if logged in)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    api.getPreferences()
      .then((data) => {
        const merged = { ...defaults, ...fromApi(data) };
        setPrefs(merged);
        saveLocal(merged);
      })
      .catch(() => {
        // Offline or not logged in — use local cache
      });
  }, []);

  const update = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      saveLocal(next);
      // Fire-and-forget save to backend
      api.updatePreferences(toApi(next)).catch(() => {});
      return next;
    });
  }, []);

  return (
    <PreferencesContext.Provider value={{ prefs, update }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
