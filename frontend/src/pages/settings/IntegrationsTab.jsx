import { useEffect, useState } from 'react';
import api from '../../api/client';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export default function IntegrationsTab() {
  const [status, setStatus] = useState(null),
    [forms, setForms] = useState({}),
    [error, setError] = useState(''),
    [calendars, setCalendars] = useState([]),
    [busy, setBusy] = useState(false);
  const { online } = useOnlineStatus();
  const load = async () => {
    const result = await api.request('/integrations');
    setStatus(result);
    setForms(
      Object.fromEntries(
        ['vision', 'nextcloud'].map((k) => [
          k,
          {
            url: result[k].config.url || '',
            username: result[k].config.username || '',
            model: result[k].config.model || '',
            enabled: result[k].enabled,
            secret: '',
          },
        ]),
      ),
    );
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const post = (path, body = {}) =>
    api.request(path, { method: 'POST', body: JSON.stringify(body) });
  if (!status) return <p>{error || 'Loading settings…'}</p>;
  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {['vision', 'nextcloud'].map((key) => (
        <section className="card p-4 space-y-3" key={key}>
          <h2 className="text-lg font-semibold">
            {key === 'vision' ? 'Photo import provider' : 'Nextcloud calendar'}
          </h2>
          {key === 'vision' ? (
            <p>
              Optional remote AI. Recipe photos are sent to this
              OpenAI-compatible chat completions endpoint. Choose the endpoint
              and vision model explicitly.
            </p>
          ) : (
            <p>
              One-way sync: Kitchen Cupboard owns its events. Changes made in
              Nextcloud are restored from this planner during reconciliation.
              Disabling sync leaves existing events in place. Use a dedicated
              calendar and a Nextcloud app password.
            </p>
          )}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                setStatus(
                  await api.request(`/integrations/${key}`, {
                    method: 'PUT',
                    body: JSON.stringify(forms[key]),
                  }),
                );
                setForms({ ...forms, [key]: { ...forms[key], secret: '' } });
              });
            }}
          >
            <label className="block">
              {key === 'vision'
                ? 'Chat completions HTTPS URL'
                : 'Nextcloud HTTPS URL'}
              <input
                className="input"
                type="url"
                required
                value={forms[key].url}
                onChange={(e) =>
                  setForms({
                    ...forms,
                    [key]: { ...forms[key], url: e.target.value },
                  })
                }
              />
            </label>
            <label className="block">
              {key === 'vision' ? 'Vision model' : 'Username'}
              <input
                className="input"
                required
                value={
                  key === 'vision' ? forms[key].model : forms[key].username
                }
                onChange={(e) =>
                  setForms({
                    ...forms,
                    [key]: {
                      ...forms[key],
                      [key === 'vision' ? 'model' : 'username']: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="block">
              {key === 'vision' ? 'API key' : 'App password'}
              <input
                type="password"
                autoComplete="new-password"
                className="input"
                placeholder={
                  status[key].configured ? 'Saved — leave blank to retain' : ''
                }
                value={forms[key].secret}
                onChange={(e) =>
                  setForms({
                    ...forms,
                    [key]: { ...forms[key], secret: e.target.value },
                  })
                }
              />
            </label>
            <label className="block">
              <input
                type="checkbox"
                checked={forms[key].enabled}
                onChange={(e) =>
                  setForms({
                    ...forms,
                    [key]: { ...forms[key], enabled: e.target.checked },
                  })
                }
              />{' '}
              Enabled
            </label>
            <button className="btn-primary" disabled={!online || busy}>
              Save {key === 'vision' ? 'photo import' : 'Nextcloud'} settings
            </button>
          </form>
          {key === 'nextcloud' && (
            <div className="space-y-3">
              <p>
                {status.pending} pending · Last successful sync:{' '}
                {status.nextcloud.last_success
                  ? new Date(
                      status.nextcloud.last_success + 'Z',
                    ).toLocaleString()
                  : 'Never'}
              </p>
              {status.nextcloud.error && (
                <p role="alert">{status.nextcloud.error}</p>
              )}
              {status.nextcloud.config.calendar_url ? (
                <>
                  <p>
                    Selected calendar: {status.nextcloud.config.calendar_url}
                  </p>
                  <button
                    className="btn-secondary"
                    disabled={!online || busy}
                    onClick={() =>
                      run(async () =>
                        setStatus(await post('/integrations/nextcloud/retry')),
                      )
                    }
                  >
                    Retry now
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={!online || busy}
                    onClick={() =>
                      run(async () => {
                        await post('/integrations/nextcloud/disconnect');
                        await load();
                      })
                    }
                  >
                    Disconnect (leave events)
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn-secondary"
                    disabled={!online || busy || !status.nextcloud.configured}
                    onClick={() =>
                      run(async () =>
                        setCalendars(
                          (await post('/integrations/nextcloud/discover'))
                            .calendars,
                        ),
                      )
                    }
                  >
                    Discover writable calendars
                  </button>
                  {calendars.map((c) => (
                    <button
                      className="btn-secondary block"
                      key={c.url}
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await post('/integrations/nextcloud/calendar', {
                            calendar_url: c.url,
                          });
                          await load();
                        })
                      }
                    >
                      Use {c.name}
                    </button>
                  ))}
                  <button
                    className="btn-secondary"
                    disabled={!online || busy || !status.nextcloud.configured}
                    onClick={() =>
                      run(async () => {
                        await post('/integrations/nextcloud/calendar', {
                          create: true,
                        });
                        await load();
                      })
                    }
                  >
                    Create “Meal Plan” calendar
                  </button>
                </>
              )}
              <button className="btn-ghost" onClick={() => run(load)}>
                Refresh status
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
