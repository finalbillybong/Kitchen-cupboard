import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../api/client';

const STORAGE_KEY = 'kc-preferences';

const defaults = {
  tapMode: 'two',
  compactMode: false,
  showCategories: true,
  sortItemsBy: 'manual',
  sortChecked: 'bottom',
  defaultQuantity: 1,
  confirmBeforeDelete: true,
  autoClearCheckedHours: 0,
  vibrationFeedback: true,
  defaultListId: null,
  swipeActions: true,
};

// Backend uses snake_case, frontend uses camelCase
function fromApi(data) {
  return {
    tapMode: data.tap_mode ?? defaults.tapMode,
    compactMode: data.compact_mode ?? defaults.compactMode,
    showCategories: data.show_categories ?? defaults.showCategories,
    sortItemsBy: data.sort_items_by ?? defaults.sortItemsBy,
    sortChecked: data.sort_checked ?? defaults.sortChecked,
    defaultQuantity: data.default_quantity ?? defaults.defaultQuantity,
    confirmBeforeDelete: data.confirm_before_delete ?? defaults.confirmBeforeDelete,
    autoClearCheckedHours: data.auto_clear_checked_hours ?? defaults.autoClearCheckedHours,
    vibrationFeedback: data.vibration_feedback ?? defaults.vibrationFeedback,
    defaultListId: data.default_list_id ?? defaults.defaultListId,
    swipeActions: data.swipe_actions ?? defaults.swipeActions,
  };
}

function toApi(prefs) {
  return {
    tap_mode: prefs.tapMode,
    compact_mode: prefs.compactMode,
    show_categories: prefs.showCategories,
    sort_items_by: prefs.sortItemsBy,
    sort_checked: prefs.sortChecked,
    default_quantity: prefs.defaultQuantity,
    confirm_before_delete: prefs.confirmBeforeDelete,
    auto_clear_checked_hours: prefs.autoClearCheckedHours,
    vibration_feedback: prefs.vibrationFeedback,
    default_list_id: prefs.defaultListId,
    swipe_actions: prefs.swipeActions,
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
