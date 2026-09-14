import { useState, useEffect } from 'react';
import api from '../../api/client';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
export default function PlannerSettingsTab() {
  const { online } = useOnlineStatus();
  const [plan, setPlan] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const load = async () =>
    setPlan(
      await api.cachedLibraryRead(
        `/planner?week=${new Date().toISOString().slice(0, 10)}`,
        'planner-settings',
      ),
    );
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice('Planner defaults saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <p className="text-sm text-gray-500">
        Choose which meals appear in the shared planner and their default times.
      </p>
      <section className="card p-4 space-y-3">
        <h2 className="font-semibold text-lg">Planner defaults</h2>
        {plan && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.request('/planner/settings', {
                  method: 'PUT',
                  body: JSON.stringify({
                    ...plan.settings,
                    expected_version: plan.version,
                  }),
                });
                await load();
              });
            }}
          >
            {['breakfast', 'lunch', 'dinner'].map((type) => (
              <div className="flex gap-3 items-center" key={type}>
                <label>
                  <input
                    type="checkbox"
                    checked={plan.settings.enabled_types.includes(type)}
                    onChange={(e) =>
                      setPlan({
                        ...plan,
                        settings: {
                          ...plan.settings,
                          enabled_types: e.target.checked
                            ? [...plan.settings.enabled_types, type]
                            : plan.settings.enabled_types.filter(
                                (t) => t !== type,
                              ),
                        },
                      })
                    }
                  />{' '}
                  {type}
                </label>
                <input
                  aria-label={`${type} time`}
                  className="input w-32"
                  type="time"
                  value={plan.settings.times[type]}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      settings: {
                        ...plan.settings,
                        times: {
                          ...plan.settings.times,
                          [type]: e.target.value,
                        },
                      },
                    })
                  }
                />
              </div>
            ))}
            <label className="block">
              Timezone
              <input
                className="input"
                value={plan.settings.timezone}
                onChange={(e) =>
                  setPlan({
                    ...plan,
                    settings: { ...plan.settings, timezone: e.target.value },
                  })
                }
              />
            </label>
            <label className="block">
              Duration (minutes)
              <input
                className="input"
                type="number"
                min="1"
                max="1440"
                value={plan.settings.duration}
                onChange={(e) =>
                  setPlan({
                    ...plan,
                    settings: {
                      ...plan.settings,
                      duration: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <button className="btn-primary" disabled={!online || busy}>
              Save planner defaults
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
