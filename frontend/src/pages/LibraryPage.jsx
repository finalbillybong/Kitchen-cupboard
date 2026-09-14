import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChefHat,
  Edit3,
  ListChecks,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { AddToListModal } from '../components/RecipeEditor';
import RecipeCollection from './RecipeLibrary';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
const qty = (value) =>
  value == null
    ? 'quantity not specified'
    : Number(Number(value).toFixed(3)).toString();
function attribution(record) {
  const created = record.created_by_name || 'Unknown';
  const updated = record.updated_by_name || created;
  return updated === created
    ? `Created by ${created}`
    : `Created by ${created} · Updated by ${updated}`;
}

function ConflictNotice({ error, onReload }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm flex items-center gap-2"
    >
      <span className="flex-1">{error}</span>
      {error.toLowerCase().includes('version') && (
        <button
          className="btn-ghost py-1 flex items-center gap-1"
          onClick={onReload}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reload latest
        </button>
      )}
    </div>
  );
}

export default function LibraryPage() {
  const { user } = useAuth();
  const { online } = useOnlineStatus();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = ['basics', 'ingredients'].includes(params.get('tab'))
    ? params.get('tab')
    : 'recipes';
  const [pantry, setPantry] = useState(null);
  const [pantryBusy, setPantryBusy] = useState(false);
  const usuallyOnly = params.get('usually') === 'true';
  const [ingredients, setIngredients] = useState([]);
  const [basics, setBasics] = useState(null);
  const [categories, setCategories] = useState([]);
  const [lists, setLists] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [addSource, setAddSource] = useState(null);
  const [ingredientForm, setIngredientForm] = useState(null);
  const [basicsForm, setBasicsForm] = useState(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pantryData, ingredientData, basicsData, categoryData] =
        await Promise.all([
          api.cachedLibraryRead('/pantry', 'pantry'),
          api.getIngredients('', showArchived && user?.is_admin),
          api.getBasics(showArchived && user?.is_admin),
          api.getCategories(),
        ]);
      setPantry(pantryData);
      setIngredients(ingredientData);
      setBasics(basicsData);
      setCategories(categoryData);
      try {
        const listData = await api.getLists();
        setLists(listData);
        localStorage.setItem(
          `kc-library-lists-${user?.id}`,
          JSON.stringify(listData),
        );
      } catch {
        setLists(
          JSON.parse(
            localStorage.getItem(`kc-library-lists-${user?.id}`) || '[]',
          ),
        );
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [showArchived, user?.is_admin, user?.id]);

  useEffect(() => {
    load();
  }, [load]);
  useWebSocket('shared', load);

  const reportError = (mutationError) => {
    setError(
      mutationError.status === 409
        ? `${mutationError.message} Your copy is out of date; reload before retrying.`
        : mutationError.message,
    );
  };

  const mutate = async (action) => {
    if (!online) return false;
    try {
      await action();
      await load();
      return true;
    } catch (mutationError) {
      reportError(mutationError);
      return false;
    }
  };

  const filteredIngredients = useMemo(
    () =>
      ingredients.filter(
        (ingredient) =>
          ingredient.name
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()) &&
          (!usuallyOnly || pantry?.ingredient_ids.includes(ingredient.id)),
      ),
    [ingredients, search, usuallyOnly, pantry],
  );
  const editableLists = useMemo(
    () =>
      lists.filter(
        (list) =>
          !list.is_archived &&
          (list.owner_id === user?.id ||
            list.members?.some(
              (member) =>
                member.user_id === user?.id && member.role !== 'viewer',
            )),
      ),
    [lists, user?.id],
  );
  const activeBasics = useMemo(
    () => basics?.items.filter((item) => !item.is_archived) || [],
    [basics],
  );

  const saveIngredient = async (event) => {
    event.preventDefault();
    const record = ingredientForm.record;
    const saved = await mutate(() =>
      record
        ? api.updateIngredient(record.id, {
            expected_version: record.version,
            name: ingredientForm.name,
            default_unit: ingredientForm.default_unit,
            default_category_id: ingredientForm.default_category_id || null,
          })
        : api.createIngredient({
            name: ingredientForm.name,
            default_unit: ingredientForm.default_unit,
            default_category_id: ingredientForm.default_category_id || null,
          }),
    );
    if (saved) setIngredientForm(null);
  };

  const saveBasics = async (event) => {
    event.preventDefault();
    const record = basicsForm.record;
    const common = {
      quantity: Number(basicsForm.quantity),
      unit: basicsForm.unit,
      category_id: basicsForm.category_id || null,
      notes: basicsForm.notes,
      scales_with_servings: basicsForm.scales_with_servings,
    };
    const saved = await mutate(() =>
      record
        ? api.updateBasicsItem(record.id, {
            ...common,
            expected_version: record.version,
          })
        : api.createBasicsItem({
            ...common,
            expected_version: basics.version,
            ingredient_id: basicsForm.ingredient_id || undefined,
            ...(!basicsForm.ingredient_id ? { name: basicsForm.name } : {}),
          }),
    );
    if (saved) setBasicsForm(null);
  };

  const moveBasics = (index, direction) => {
    const active = basics.items.filter((item) => !item.is_archived);
    const target = index + direction;
    if (target < 0 || target >= active.length) return;
    [active[index], active[target]] = [active[target], active[index]];
    mutate(() =>
      api.reorderBasics(
        active.map((item) => item.id),
        basics.version,
      ),
    );
  };

  if (loading && !basics)
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" />
      </div>
    );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex-1 min-w-52">
          <h1 className="text-2xl font-bold">Library</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Shared with every active Kitchen Cupboard user
          </p>
        </div>
        {!online && (
          <span className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-sm">
            Offline browsing
          </span>
        )}
        {user?.is_admin && tab !== 'recipes' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />{' '}
            Archived records
          </label>
        )}
      </div>
      <ConflictNotice error={error} onReload={load} />
      {notice && (
        <div
          role="status"
          className="mb-4 p-3 rounded-xl bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 text-sm"
        >
          {notice}
        </div>
      )}
      <div
        className="flex gap-1 border-b border-gray-200 dark:border-navy-800 mb-5"
        role="tablist"
      >
        {[
          ['recipes', 'Recipes', ChefHat],
          ['basics', 'Basics', ListChecks],
          ['ingredients', 'Ingredients', Package],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setParams((current) => {
                const next = new URLSearchParams(current);
                next.set('tab', id);
                next.delete('usually');
                return next;
              });
              setSearch('');
            }}
            className={`flex-1 sm:flex-none justify-center px-2 sm:px-4 py-3 flex items-center gap-1 sm:gap-2 border-b-2 ${tab === id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'ingredients' && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input
            className="input pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${tab}`}
          />
        </div>
      )}

      {tab === 'recipes' && <RecipeCollection />}

      {tab === 'basics' && basics && (
        <section>
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Basics — regular purchases</h2>
              <p className="text-sm text-gray-500">
                Your reusable checklist for milk, bread and other repeat buys.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-primary flex items-center gap-2"
                disabled={!online}
                onClick={() =>
                  setBasicsForm({
                    record: null,
                    ingredient_id: '',
                    name: '',
                    quantity: 1,
                    unit: '',
                    category_id: '',
                    notes: '',
                    scales_with_servings: false,
                  })
                }
              >
                <Plus className="h-4 w-4" /> Add entry
              </button>
              <button
                className="btn-secondary flex items-center gap-2"
                disabled={editableLists.length === 0}
                onClick={() => setAddSource({ type: 'basics', source: basics })}
              >
                <ListChecks className="h-4 w-4" /> Add to list
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {basics.items.map((item) => {
              const activeIndex = activeBasics.findIndex(
                (row) => row.id === item.id,
              );
              return (
                <div
                  key={item.id}
                  className={`card p-3 flex items-center gap-3 ${item.is_archived ? 'opacity-60' : ''}`}
                >
                  <div className="flex flex-col">
                    <button
                      className="btn-ghost p-1"
                      disabled={
                        !online || item.is_archived || activeIndex === 0
                      }
                      onClick={() => moveBasics(activeIndex, -1)}
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="btn-ghost p-1"
                      disabled={
                        !online ||
                        item.is_archived ||
                        activeIndex === activeBasics.length - 1
                      }
                      onClick={() => moveBasics(activeIndex, 1)}
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex-1">
                    <strong>{item.name}</strong>{' '}
                    <span className="text-gray-500 text-sm">
                      {qty(item.quantity)} {item.unit}
                    </span>
                    <p className="text-xs text-gray-400">{attribution(item)}</p>
                  </div>
                  {!item.is_archived && (
                    <button
                      className="btn-ghost p-2"
                      disabled={!online}
                      title="Edit Basics entry"
                      onClick={() =>
                        setBasicsForm({
                          ...item,
                          record: item,
                          ingredient_id: item.ingredient_id,
                          category_id: item.category_id || '',
                        })
                      }
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                  )}
                  {!item.is_archived &&
                    (item.created_by === user?.id || user?.is_admin) && (
                      <button
                        className="btn-ghost p-2 text-red-600"
                        disabled={!online}
                        onClick={() =>
                          mutate(() =>
                            api.archiveBasicsItem(item.id, item.version),
                          )
                        }
                        title="Archive Basics entry"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                  {item.is_archived && user?.is_admin && (
                    <button
                      className="btn-ghost p-2"
                      disabled={!online}
                      onClick={() =>
                        mutate(() =>
                          api.restoreBasicsItem(item.id, item.version),
                        )
                      }
                      title="Restore Basics entry"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
            {basics.items.length === 0 && (
              <p className="text-center py-12 text-gray-400">
                Basics is empty.
              </p>
            )}
          </div>
        </section>
      )}

      {tab === 'ingredients' && (
        <section>
          <p className="text-sm text-gray-500 mb-3">
            Mark ingredients you usually have. These start excluded when you
            prepare shopping from your meal plan.
          </p>
          <label className="flex gap-2 items-center mb-4">
            <input
              type="checkbox"
              checked={usuallyOnly}
              onChange={(event) =>
                setParams((current) => {
                  const next = new URLSearchParams(current);
                  if (event.target.checked) next.set('usually', 'true');
                  else next.delete('usually');
                  return next;
                })
              }
            />{' '}
            Show only ingredients I usually have
          </label>
          <div className="flex justify-end mb-4">
            <button
              className="btn-primary flex items-center gap-2"
              disabled={!online}
              onClick={() =>
                setIngredientForm({
                  record: null,
                  name: '',
                  default_unit: '',
                  default_category_id: '',
                })
              }
            >
              <Plus className="h-4 w-4" /> New ingredient
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {filteredIngredients.map((ingredient) => (
              <article
                key={ingredient.id}
                className={`card p-4 flex gap-3 ${ingredient.is_archived ? 'opacity-60' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold flex items-center gap-2">
                    {ingredient.name}{' '}
                    {ingredient.is_archived && <Archive className="h-4 w-4" />}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {ingredient.default_unit || 'No default unit'}
                    {ingredient.default_category_name
                      ? ` · ${ingredient.default_category_name}`
                      : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    {attribution(ingredient)}
                  </p>
                  {!ingredient.is_archived && (
                    <label className="flex gap-2 items-center mt-3 text-sm">
                      <input
                        type="checkbox"
                        checked={
                          pantry?.ingredient_ids.includes(ingredient.id) ||
                          false
                        }
                        disabled={!online || !pantry || pantryBusy}
                        onChange={async (event) => {
                          const usually_have = event.target.checked;
                          setPantryBusy(true);
                          try {
                            setPantry(
                              await api.request(`/pantry/${ingredient.id}`, {
                                method: 'PUT',
                                body: JSON.stringify({
                                  expected_version: pantry.version,
                                  usually_have,
                                }),
                              }),
                            );
                          } catch (error) {
                            await load();
                            reportError(error);
                          } finally {
                            setPantryBusy(false);
                          }
                        }}
                      />{' '}
                      Usually have
                    </label>
                  )}
                </div>
                {!ingredient.is_archived && (
                  <button
                    className="btn-ghost p-2"
                    disabled={!online}
                    title="Edit ingredient"
                    onClick={() =>
                      setIngredientForm({
                        record: ingredient,
                        name: ingredient.name,
                        default_unit: ingredient.default_unit,
                        default_category_id:
                          ingredient.default_category_id || '',
                      })
                    }
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                )}
                {!ingredient.is_archived &&
                  (ingredient.created_by === user?.id || user?.is_admin) && (
                    <button
                      className="btn-ghost p-2 text-red-600"
                      disabled={!online}
                      title="Archive ingredient"
                      onClick={() =>
                        mutate(() =>
                          api.archiveIngredient(
                            ingredient.id,
                            ingredient.version,
                          ),
                        )
                      }
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  )}
                {ingredient.is_archived && user?.is_admin && (
                  <button
                    className="btn-ghost p-2"
                    disabled={!online}
                    title="Restore ingredient"
                    onClick={() =>
                      mutate(() =>
                        api.restoreIngredient(
                          ingredient.id,
                          ingredient.version,
                        ),
                      )
                    }
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {addSource && (
        <AddToListModal
          open
          initialListId={params.get('list')}
          source={addSource.source}
          sourceType={addSource.type}
          lists={editableLists}
          online={online}
          onClose={() => setAddSource(null)}
          onError={reportError}
          onQueued={(listId, wasOnline) => {
            setNotice(
              wasOnline
                ? 'Adding selected items…'
                : 'Addition queued for sync.',
            );
            setTimeout(() => navigate(`/list/${listId}`), 150);
          }}
        />
      )}

      <Modal
        open={Boolean(ingredientForm)}
        onClose={() => setIngredientForm(null)}
        title={ingredientForm?.record ? 'Edit ingredient' : 'New ingredient'}
      >
        {ingredientForm && (
          <form className="space-y-4" onSubmit={saveIngredient}>
            <input
              className="input"
              value={ingredientForm.name}
              onChange={(event) =>
                setIngredientForm({
                  ...ingredientForm,
                  name: event.target.value,
                })
              }
              placeholder="Ingredient name"
              required
              autoFocus
            />
            <input
              className="input"
              value={ingredientForm.default_unit}
              onChange={(event) =>
                setIngredientForm({
                  ...ingredientForm,
                  default_unit: event.target.value,
                })
              }
              placeholder="Default unit"
            />
            <select
              className="input"
              value={ingredientForm.default_category_id}
              onChange={(event) =>
                setIngredientForm({
                  ...ingredientForm,
                  default_category_id: event.target.value,
                })
              }
            >
              <option value="">No default shopping aisle</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button className="btn-primary w-full" disabled={!online}>
              Save ingredient
            </button>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(basicsForm)}
        onClose={() => setBasicsForm(null)}
        title={basicsForm?.record ? 'Edit Basics entry' : 'Add Basics entry'}
      >
        {basicsForm && (
          <form className="space-y-4" onSubmit={saveBasics}>
            {!basicsForm.record && (
              <>
                <select
                  className="input"
                  value={basicsForm.ingredient_id}
                  onChange={(event) => {
                    const ingredient = ingredients.find(
                      (item) => item.id === event.target.value,
                    );
                    setBasicsForm({
                      ...basicsForm,
                      ingredient_id: event.target.value,
                      unit: ingredient?.default_unit || '',
                      category_id: ingredient?.default_category_id || '',
                    });
                  }}
                >
                  <option value="">New ingredient…</option>
                  {ingredients
                    .filter((item) => !item.is_archived)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
                {!basicsForm.ingredient_id && (
                  <input
                    className="input"
                    value={basicsForm.name}
                    onChange={(event) =>
                      setBasicsForm({ ...basicsForm, name: event.target.value })
                    }
                    placeholder="New ingredient name"
                    required
                  />
                )}
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                type="number"
                min="0.001"
                step="0.001"
                value={basicsForm.quantity}
                onChange={(event) =>
                  setBasicsForm({ ...basicsForm, quantity: event.target.value })
                }
                required
              />
              <input
                className="input"
                value={basicsForm.unit}
                onChange={(event) =>
                  setBasicsForm({ ...basicsForm, unit: event.target.value })
                }
                placeholder="Unit"
              />
            </div>
            <select
              className="input"
              value={basicsForm.category_id}
              onChange={(event) =>
                setBasicsForm({
                  ...basicsForm,
                  category_id: event.target.value,
                })
              }
            >
              <option value="">Default shopping aisle</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              value={basicsForm.notes}
              onChange={(event) =>
                setBasicsForm({ ...basicsForm, notes: event.target.value })
              }
              placeholder="Notes"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={basicsForm.scales_with_servings}
                onChange={(event) =>
                  setBasicsForm({
                    ...basicsForm,
                    scales_with_servings: event.target.checked,
                  })
                }
              />{' '}
              Scale when multiplier changes
            </label>
            <button className="btn-primary w-full" disabled={!online}>
              Save Basics entry
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
