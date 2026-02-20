import { useState, useEffect } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import api from '../../api/client';

const PREF_OPTIONS = [
  { key: 'notify_item_added', label: 'Item added to a shared list' },
  { key: 'notify_item_checked', label: 'Item checked off in a shared list' },
  { key: 'notify_item_updated', label: 'Item updated in a shared list' },
  { key: 'notify_item_removed', label: 'Item removed from a shared list' },
  { key: 'notify_list_shared', label: 'A list is shared with you' },
  { key: 'notify_checked_cleared', label: 'Checked items cleared from a shared list' },
];

export default function NotificationsTab() {
  const { isSupported, isSubscribed, permission, loading, subscribe, unsubscribe } = usePushNotifications();
  const [prefs, setPrefs] = useState(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getNotificationSettings()
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, []);

  const handleTogglePush = async () => {
    setToggling(true);
    try {
      if (isSubscribed) {
        await unsubscribe();
      } else {
        const ok = await subscribe();
        if (!ok && Notification.permission === 'denied') {
          alert('Notifications are blocked. Please enable them in your browser settings.');
        }
      }
    } finally {
      setToggling(false);
    }
  };

  const handlePrefChange = async (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      await api.updateNotificationSettings({ [key]: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // Revert on failure
      setPrefs(prefs);
    }
  };

  if (!isSupported) {
    return (
      <div className="card p-5">
        <h2 className="font-semibold text-lg mb-2">Push Notifications</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Push notifications are not supported in this browser.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-lg">Push Notifications</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Get notified when collaborators make changes to your shared lists.
        </p>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">
              {isSubscribed ? 'Notifications enabled' : 'Notifications disabled'}
            </p>
            {permission === 'denied' && (
              <p className="text-xs text-red-500 mt-0.5">
                Blocked by browser. Update in browser settings to enable.
              </p>
            )}
          </div>
          <button
            onClick={handleTogglePush}
            disabled={loading || toggling || permission === 'denied'}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-navy-900 ${
              isSubscribed
                ? 'bg-primary-600'
                : 'bg-gray-300 dark:bg-navy-600'
            } ${(loading || toggling) ? 'opacity-50 cursor-wait' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isSubscribed ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {!prefsLoading && prefs && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Notification Types</h2>
            {saved && <span className="text-xs text-green-600">Saved</span>}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Choose which events trigger a push notification.
          </p>

          <div className="space-y-3">
            {PREF_OPTIONS.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm">{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[key]}
                  onClick={() => handlePrefChange(key, !prefs[key])}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-navy-900 ${
                    prefs[key]
                      ? 'bg-primary-600'
                      : 'bg-gray-300 dark:bg-navy-600'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      prefs[key] ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
