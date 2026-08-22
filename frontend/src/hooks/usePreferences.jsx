import { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'kc-preferences';

const defaults = {
  tapMode: 'row',
};

export function migratePreferences(value = {}) {
  const tapMode = value.tapMode === 'one' ? 'row'
    : value.tapMode === 'two' ? 'checkbox'
      : ['row', 'checkbox'].includes(value.tapMode) ? value.tapMode : 'row';
  return { ...defaults, ...value, tapMode };
}

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const migrated = migratePreferences(JSON.parse(raw));
      savePreferences(migrated);
      return migrated;
    }
  } catch { /* ignore */ }
  return { ...defaults };
}

function savePreferences(prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(loadPreferences);

  const update = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      savePreferences(next);
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
