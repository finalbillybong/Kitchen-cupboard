import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../hooks/useAuth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useWebSocket } from '../hooks/useWebSocket';

export function monday(value = new Date()) {
  const day = new Date(value);
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return localDate(day);
}
function localDate(day) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}
function offset(value, days) {
  const day = new Date(`${value}T12:00:00`);
  day.setDate(day.getDate() + days);
  return localDate(day);
}
const post = (path, body) =>
  api.request(path, { method: 'POST', body: JSON.stringify(body) });

export default function PlannerPage() {
  const { user } = useAuth();
  const [params] = useSearchParams(),
    { online } = useOnlineStatus();
  const [week, setWeek] = useState(monday()),
    [plan, setPlan] = useState(null),
    [recipes, setRecipes] = useState([]),
    [lists, setLists] = useState([]);
  const [addedList, setAddedList] = useState(null);
  const [error, setError] = useState(''),
    [editor, setEditor] = useState(null),
    [review, setReview] = useState(null),
    [busy, setBusy] = useState(false);
  const [listId, setListId] = useState(''),
    [include, setInclude] = useState([]),
    [exclude, setExclude] = useState([]),
    [groceries, setGroceries] = useState(false);
  const [suggest, setSuggest] = useState(false),
    [preferences, setPreferences] = useState({
      vegetarian: 0,
      fish: 0,
      avoid_weeks: 1,
    });
  const [removal, setRemoval] = useState(null),
    [reassign, setReassign] = useState('');
  const [move, setMove] = useState(null);
  const load = useCallback(async () => {
    try {
      const [p, r, l] = await Promise.all([
        api.cachedLibraryRead(`/planner?week=${week}`, `planner-${week}`),
        api.getMeals(),
        api.cachedLibraryRead('/lists', 'planner-lists'),
      ]);
      setPlan(p);
      setRecipes(r);
      setLists(
        l.filter(
          (x) =>
            !x.is_archived &&
            (x.owner_id === user?.id ||
              x.members?.some(
                (m) => m.user_id === user?.id && m.role !== 'viewer',
              )),
        ),
      );
    } catch (e) {
      setError(e.message);
    }
  }, [week, user?.id]);
  useEffect(() => {
    load();
    setReview(null);
    setInclude([]);
    setExclude([]);
  }, [load]);
  useWebSocket('shared', load);
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
  const preview = async (slots = [], remove_ids = []) => {
    const result = await post('/planner/preview', {
      expected_version: plan.version,
      slots,
      remove_ids,
    });
    setReview({ ...result, kind: 'plan', request_id: crypto.randomUUID() });
    setEditor(null);
    setRemoval(null);
    setMove(null);
  };
  const saveSlot = async (slot) => {
    if (plan.linked_slots.some((s) => s.cooking_slot_id === slot.id))
      return preview([slot]);
    const result = await post('/planner/preview', {
      expected_version: plan.version,
      slots: [slot],
      remove_ids: [],
    });
    await post('/planner/commit', {
      token: result.token,
      request_id: crypto.randomUUID(),
    });
    setEditor(null);
    await load();
  };
  const title = (slot) => {
    if (slot.kind === 'skip') return slot.notes || 'Eating out / skip';
    const cooking =
      slot.kind === 'leftover'
        ? (review?.slots || plan.linked_slots).find(
            (s) => s.id === slot.cooking_slot_id,
          )
        : slot;
    return `${slot.kind === 'leftover' ? 'Leftovers: ' : ''}${recipes.find((r) => r.id === cooking?.meal_id)?.name || 'Recipe'}`;
  };
  const groceryPreview = async (selected = include, excluded = exclude) => {
    const result = await post('/planner/shopping/preview', {
      week,
      list_id: listId,
      include_staples: selected,
      exclude_keys: excluded,
    });
    setReview({
      ...result,
      kind: 'groceries',
      request_id: crypto.randomUUID(),
    });
  };
  const openSlot = (day, type, slot) =>
    setEditor(
      slot || {
        id: crypto.randomUUID(),
        day,
        meal_type: type,
        kind: 'recipe',
        meal_id: params.get('recipe') || recipes[0]?.id || '',
        servings: Number(params.get('servings')) || 2,
        time: plan.settings.times[type],
        duration: plan.settings.duration,
        pinned: false,
        notes: '',
        cooking_slot_id: null,
      },
    );
  if (!plan) return <p>{error || 'Loading planner…'}</p>;
  const linked = removal
    ? plan.linked_slots.filter((s) => s.cooking_slot_id === removal.id)
    : [];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Meal planner</h1>
      {addedList && (
        <p
          role="status"
          className="rounded-xl bg-primary-50 dark:bg-primary-950 p-3"
        >
          Shopping list updated.{' '}
          <Link className="underline" to={`/list/${addedList.id}`}>
            Open {addedList.name}
          </Link>
        </p>
      )}
      {!online && (
        <p>Offline — saved plans are available to view. Reconnect to edit.</p>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}{' '}
          <button className="btn-ghost" onClick={load}>
            Reload latest
          </button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn-secondary"
          onClick={() => setWeek(offset(week, -7))}
        >
          ← Previous
        </button>
        <strong>
          {new Date(week + 'T12:00:00').toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          })}{' '}
          –{' '}
          {new Date(offset(week, 6) + 'T12:00:00').toLocaleDateString(
            undefined,
            { day: 'numeric', month: 'short', year: 'numeric' },
          )}
        </strong>
        <button
          className="btn-secondary"
          onClick={() => setWeek(offset(week, 7))}
        >
          Next →
        </button>
        <button className="btn-ghost" onClick={() => setWeek(monday())}>
          This week
        </button>
      </div>
      <p className="text-sm text-gray-500">
        {plan.settings.timezone} · Shared by all active users
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          className="btn-secondary"
          disabled={!online}
          onClick={() => setSuggest(true)}
        >
          Suggest meals
        </button>
        <button
          className="btn-primary"
          disabled={!online}
          onClick={() => {
            setInclude([]);
            setExclude([]);
            setGroceries(true);
          }}
        >
          Add week to shopping list
        </button>
      </div>
      {params.get('recipe') && (
        <p className="rounded-xl bg-primary-50 dark:bg-primary-950 p-3">
          Choose a day below to schedule{' '}
          {recipes.find((r) => r.id === params.get('recipe'))?.name ||
            'your recipe'}
          .
        </p>
      )}
      {recipes.length === 0 && (
        <p>
          Add your first recipe in{' '}
          <Link className="text-primary-600" to="/library">
            Library
          </Link>
          , then choose a day below.
        </p>
      )}
      <div className="space-y-3">
        {Array.from({ length: 7 }, (_, i) => offset(week, i)).map((day) => (
          <section className="card p-4" key={day}>
            <h2 className="font-semibold mb-3">
              {new Date(day + 'T12:00:00').toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })}
            </h2>
            <div
              className={`grid gap-3 ${['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3'][plan.settings.enabled_types.length]}`}
            >
              {plan.settings.enabled_types.map((type) => {
                const slot = plan.slots.find(
                  (s) => s.day === day && s.meal_type === type,
                );
                return (
                  <div
                    className="rounded-lg bg-gray-50 dark:bg-navy-800 p-3 space-y-2"
                    key={type}
                  >
                    <p className="capitalize text-sm text-gray-500">{type}</p>
                    {slot ? (
                      <>
                        <button
                          className="font-medium text-left"
                          disabled={!online}
                          onClick={() => openSlot(day, type, slot)}
                        >
                          {slot.pinned ? '📌 ' : ''}
                          {title(slot)}
                        </button>
                        <p className="text-sm">
                          {slot.time} · {slot.servings} servings
                        </p>
                        {slot.kind !== 'skip' && slot.notes && (
                          <p className="text-sm">{slot.notes}</p>
                        )}
                        <details>
                          <summary className="cursor-pointer text-sm text-gray-500">
                            Meal options
                          </summary>
                          <div className="flex flex-wrap gap-3 mt-2">
                            <button
                              className="text-sm text-primary-600"
                              disabled={!online}
                              onClick={() =>
                                run(() =>
                                  saveSlot({ ...slot, pinned: !slot.pinned }),
                                )
                              }
                            >
                              {slot.pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button
                              className="text-sm text-primary-600"
                              disabled={!online}
                              onClick={() =>
                                setMove({
                                  ...slot,
                                  target_day: day,
                                  target_type: type,
                                })
                              }
                            >
                              Move / swap
                            </button>
                            <button
                              className="text-sm text-red-600"
                              disabled={!online}
                              onClick={() => {
                                setRemoval(slot);
                                setReassign('');
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </details>
                      </>
                    ) : (
                      <button
                        className="btn-ghost"
                        disabled={!online}
                        onClick={() => openSlot(day, type)}
                      >
                        + Plan {type}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <Modal
        error={error}
        open={!!editor}
        title="Plan a meal"
        onClose={() => setEditor(null)}
      >
        {editor && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveSlot(editor));
            }}
          >
            <label className="block">
              Type
              <select
                className="input"
                value={editor.kind}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    kind: e.target.value,
                    meal_id:
                      e.target.value === 'recipe' ? recipes[0]?.id : null,
                    cooking_slot_id: null,
                  })
                }
              >
                <option value="recipe">Cook a recipe</option>
                <option value="leftover">Leftovers</option>
                <option value="skip">Skip / eating out</option>
              </select>
            </label>
            {editor.kind === 'recipe' && (
              <label className="block">
                Recipe
                <select
                  className="input"
                  aria-label="Planned recipe"
                  value={editor.meal_id || ''}
                  onChange={(e) =>
                    setEditor({ ...editor, meal_id: e.target.value })
                  }
                  required
                >
                  <option value="">Select recipe</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {editor.kind === 'leftover' && (
              <label className="block">
                Cooking session
                <select
                  className="input"
                  value={editor.cooking_slot_id || ''}
                  onChange={(e) =>
                    setEditor({ ...editor, cooking_slot_id: e.target.value })
                  }
                  required
                >
                  <option value="">Select earlier cooking session</option>
                  {plan.linked_slots
                    .filter(
                      (s) =>
                        s.kind === 'recipe' &&
                        `${s.day} ${s.time}` < `${editor.day} ${editor.time}`,
                    )
                    .map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.day} {title(s)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="block">
              Servings
              <input
                aria-label="Planned servings"
                type="number"
                className="input"
                min="1"
                max="1000"
                value={editor.servings}
                onChange={(e) =>
                  setEditor({ ...editor, servings: Number(e.target.value) })
                }
              />
            </label>
            <label className="block">
              Notes
              <textarea
                className="input"
                value={editor.notes}
                onChange={(e) =>
                  setEditor({ ...editor, notes: e.target.value })
                }
              />
            </label>
            <details className="space-y-3">
              <summary className="cursor-pointer font-medium">
                Time & planning options
              </summary>
              <label className="block">
                Time
                <input
                  type="time"
                  className="input"
                  value={editor.time}
                  onChange={(e) =>
                    setEditor({ ...editor, time: e.target.value })
                  }
                  required
                />
              </label>
              <label className="block">
                Duration (minutes)
                <input
                  type="number"
                  min="1"
                  max="1440"
                  className="input"
                  value={editor.duration}
                  onChange={(e) =>
                    setEditor({ ...editor, duration: Number(e.target.value) })
                  }
                />
              </label>

              <label className="block">
                <input
                  type="checkbox"
                  checked={editor.pinned}
                  onChange={(e) =>
                    setEditor({ ...editor, pinned: e.target.checked })
                  }
                />{' '}
                Pin this meal
              </label>
            </details>
            <button className="btn-primary" disabled={!online || busy}>
              Save meal
            </button>
          </form>
        )}
      </Modal>
      <Modal
        error={error}
        open={!!removal}
        title="Remove cooking session"
        onClose={() => setRemoval(null)}
      >
        {removal && (
          <div className="space-y-3">
            <p>
              Remove {title(removal)} on {removal.day}?
            </p>
            {linked.length > 0 && (
              <>
                <p>These linked leftovers also need review:</p>
                <ul>
                  {linked.map((s) => (
                    <li key={s.id}>
                      {s.day} {s.time} · {s.servings} servings
                    </li>
                  ))}
                </ul>
                <label className="block">
                  Leftovers
                  <select
                    className="input"
                    value={reassign}
                    onChange={(e) => setReassign(e.target.value)}
                  >
                    <option value="">Remove linked leftovers too</option>
                    {plan.linked_slots
                      .filter((s) => s.kind === 'recipe' && s.id !== removal.id)
                      .map((s) => (
                        <option value={s.id} key={s.id}>
                          Reassign to {s.day} {title(s)}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                run(() =>
                  preview(
                    reassign
                      ? linked.map((s) => ({ ...s, cooking_slot_id: reassign }))
                      : [],
                    [removal.id, ...(reassign ? [] : linked.map((s) => s.id))],
                  ),
                )
              }
            >
              Review removal
            </button>
          </div>
        )}
      </Modal>
      <Modal
        error={error}
        open={!!move}
        title="Move or swap meal"
        onClose={() => setMove(null)}
      >
        {move && (
          <div className="space-y-3">
            <label>
              Date
              <input
                className="input"
                type="date"
                value={move.target_day}
                onChange={(e) =>
                  setMove({ ...move, target_day: e.target.value })
                }
              />
            </label>
            <select
              className="input"
              value={move.target_type}
              onChange={(e) =>
                setMove({ ...move, target_type: e.target.value })
              }
            >
              {plan.settings.enabled_types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <p>
              If the destination is occupied, the meals swap places. Leftover
              timing is checked before saving.
            </p>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const other = plan.linked_slots.find(
                    (s) =>
                      s.day === move.target_day &&
                      s.meal_type === move.target_type &&
                      s.id !== move.id,
                  );
                  const slots = [
                    {
                      ...move,
                      day: move.target_day,
                      meal_type: move.target_type,
                    },
                  ];
                  if (other)
                    slots.push({
                      ...other,
                      day: move.day,
                      meal_type: move.meal_type,
                    });
                  await preview(slots);
                })
              }
            >
              Review move
            </button>
          </div>
        )}
      </Modal>
      <Modal
        error={error}
        open={suggest}
        title="Suggest meals"
        onClose={() => setSuggest(false)}
      >
        <div className="space-y-3">
          <p>
            Existing meals, pins, skips and leftovers are kept. Dietary counts
            include existing selections.
          </p>
          {Object.keys(preferences).map((key) => (
            <label className="block" key={key}>
              {key === 'avoid_weeks' ? 'Avoid previous weeks' : `${key} meals`}
              <input
                type="number"
                min="0"
                max={key === 'avoid_weeks' ? 52 : 21}
                className="input"
                value={preferences[key]}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    [key]: Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await post('/planner/suggestions', {
                  ...preferences,
                  week,
                  expected_version: plan.version,
                });
                setReview({
                  ...result,
                  kind: 'plan',
                  request_id: crypto.randomUUID(),
                });
                setSuggest(false);
              })
            }
          >
            Preview suggestions
          </button>
        </div>
      </Modal>
      <Modal
        error={error}
        open={groceries && !review}
        title="Add week to shopping list"
        onClose={() => setGroceries(false)}
      >
        <div className="space-y-3">
          <p>
            Choose a list, then review what you need. Ingredients you usually
            have start excluded. For batch meals, shopping covers the cooking
            session and its linked leftovers.
          </p>
          <select
            aria-label="Destination shopping list"
            className="input"
            value={listId}
            onChange={(e) => setListId(e.target.value)}
          >
            <option value="">Choose shopping list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button
            className="btn-primary"
            disabled={!listId || busy}
            onClick={() => run(() => groceryPreview())}
          >
            Review shopping
          </button>
        </div>
      </Modal>
      <Modal
        error={error}
        open={!!review}
        title={review?.kind === 'plan' ? 'Review meal plan' : 'Review shopping'}
        onClose={() => setReview(null)}
        wide
      >
        {review && (
          <div className="space-y-4">
            {review.kind === 'plan' ? (
              <>
                <p>Check the plan before applying it.</p>
                {review.unmet &&
                  Object.entries(review.unmet).map(([tag, n]) => (
                    <p key={tag} className="text-amber-600">
                      Unable to find {n} requested {tag} meals.
                    </p>
                  ))}
                {review.unfilled > 0 && (
                  <p>{review.unfilled} positions remain empty.</p>
                )}
                {(review.changed_slots || review.slots).map((s) => (
                  <p key={s.id}>
                    {s.day} {s.time} {s.meal_type} · {title(s)} · {s.servings}{' '}
                    servings {s.pinned ? '· Pinned' : ''}{' '}
                    {s.notes && `· ${s.notes}`}
                  </p>
                ))}
                {review.removed?.map((s) => (
                  <p key={s.id} className="text-red-600">
                    Remove {s.day} {title(s)}
                  </p>
                ))}
              </>
            ) : (
              <>
                <p className="font-medium">
                  Shopping list: {lists.find((l) => l.id === listId)?.name}
                </p>
                <p className="text-sm text-gray-500">
                  Untick anything you already have. This applies to this
                  shopping review; it does not change your usual ingredients.
                </p>
                <div className="space-y-2">
                  {[
                    ...review.requirements,
                    ...(review.excluded_items || review.excluded_staples),
                  ]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((row) => {
                      const included = review.requirements.some(
                        (r) => r.key === row.key,
                      );
                      return (
                        <label
                          className="flex items-start gap-3 rounded-xl bg-gray-50 dark:bg-navy-800 p-3"
                          key={row.key}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            aria-label={`Include ${row.name}`}
                            checked={included}
                            disabled={!online || busy}
                            onChange={(event) => {
                              const nextInclude = event.target.checked
                                ? [...new Set([...include, row.ingredient_id])]
                                : include;
                              const nextExclude = event.target.checked
                                ? exclude.filter((key) => key !== row.key)
                                : [...new Set([...exclude, row.key])];
                              setInclude(nextInclude);
                              setExclude(nextExclude);
                              run(() =>
                                groceryPreview(nextInclude, nextExclude),
                              );
                            }}
                          />
                          <span>
                            <strong>{row.name}</strong> ·{' '}
                            {row.quantity ?? 'quantity not specified'}{' '}
                            {row.unit}
                            {!included && (
                              <span className="block text-sm text-gray-500">
                                {row.exclusion_reason === 'usually_have'
                                  ? 'Usually have — excluded'
                                  : 'Already have — excluded'}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                </div>
                {!review.changes.length && <p>No shopping changes required.</p>}
                <details
                  className="space-y-3"
                  open={review.changes.some(
                    (c) => c.action !== 'add' || c.preserve_completed,
                  )}
                >
                  <summary className="cursor-pointer font-medium">
                    Changes to this list ({review.changes.length})
                  </summary>
                  {review.changes.map((change) => (
                    <div className="border-b pb-2" key={change.key}>
                      <strong>
                        {
                          { add: 'Add', remove: 'Remove', update: 'Update' }[
                            change.action
                          ]
                        }
                        : {(change.after || change.before).name}
                      </strong>
                      <p>
                        {change.before?.quantity ?? '—'} →{' '}
                        {change.after?.quantity ?? '—'}{' '}
                        {(change.after || change.before).unit}
                      </p>
                      {change.manual_item_retained && (
                        <p>
                          Your renamed or re-unitised item is retained
                          separately.
                        </p>
                      )}
                      {change.preserve_completed && (
                        <p>
                          Completed quantity kept. Extra required:{' '}
                          {change.extra_required || 0}
                        </p>
                      )}
                      {(change.after || change.before).sources.map((s, i) => (
                        <p key={i} className="text-sm text-gray-500">
                          {s.recipe} · {s.servings} servings · {s.wording}{' '}
                          {s.notes}
                        </p>
                      ))}
                    </div>
                  ))}
                </details>
              </>
            )}
            <button
              className="btn-primary"
              disabled={!online || busy}
              onClick={() =>
                run(async () => {
                  await post(
                    review.kind === 'plan'
                      ? '/planner/commit'
                      : '/planner/shopping/commit',
                    { token: review.token, request_id: review.request_id },
                  );
                  if (review.kind === 'groceries')
                    setAddedList(lists.find((l) => l.id === listId));
                  setReview(null);
                  setGroceries(false);
                  await load();
                })
              }
            >
              Apply reviewed changes
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
