import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ArrowDown, ArrowUp, BookOpen, Check, ChefHat, Edit3, ListChecks,
  Package, Plus, RefreshCw, RotateCcw, Search, Trash2, Upload,
} from 'lucide-react';
import api from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../hooks/useAuth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const emptyMeal = { name: '', description: '', base_servings: 2, source_url: null, ingredients: [] };
const emptyRow = { ingredient_id: '', name: '', quantity: 1, unit: '', category_id: '', notes: '', scales_with_servings: true };

function qty(value) {
  return Number(Number(value).toFixed(3)).toString();
}

function attribution(record) {
  const created = record.created_by_name || 'Unknown';
  const updated = record.updated_by_name || created;
  return updated === created ? `Created by ${created}` : `Created by ${created} · Updated by ${updated}`;
}

function ConflictNotice({ error, onReload }) {
  if (!error) return null;
  return (
    <div role="alert" className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
      <span className="flex-1">{error}</span>
      {error.toLowerCase().includes('version') && (
        <button className="btn-ghost py-1 flex items-center gap-1" onClick={onReload}>
          <RefreshCw className="h-3.5 w-3.5" /> Reload latest
        </button>
      )}
    </div>
  );
}

function RowEditor({ row, ingredients, categories, onChange, onRemove, onMoveUp, onMoveDown }) {
  const selected = ingredients.find((item) => item.id === row.ingredient_id);
  return (
    <div className="grid gap-2 sm:grid-cols-12 p-3 rounded-xl bg-gray-50 dark:bg-navy-800">
      <div className="sm:col-span-4">
        <select
          aria-label="Catalogue ingredient"
          className="input"
          value={row.ingredient_id}
          onChange={(event) => {
            const ingredient = ingredients.find((item) => item.id === event.target.value);
            onChange({
              ...row,
              ingredient_id: event.target.value,
              name: event.target.value ? '' : row.name,
              unit: ingredient?.default_unit || '',
              category_id: ingredient?.default_category_id || '',
            });
          }}
        >
          <option value="">New catalogue ingredient…</option>
          {ingredients.filter((item) => !item.is_archived || item.id === row.ingredient_id).map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        {!row.ingredient_id && (
          <input
            aria-label="New ingredient name"
            className="input mt-2"
            value={row.name}
            onChange={(event) => onChange({ ...row, name: event.target.value })}
            placeholder="Ingredient name"
            required
          />
        )}
        {selected?.is_archived && <p className="text-xs text-amber-600 mt-1">Archived existing reference</p>}
      </div>
      <input
        aria-label="Quantity"
        className="input sm:col-span-2"
        type="number"
        min="0.001"
        step="0.001"
        value={row.quantity}
        onChange={(event) => onChange({ ...row, quantity: event.target.value })}
        required
      />
      <input
        aria-label="Unit"
        className="input sm:col-span-2"
        value={row.unit}
        onChange={(event) => onChange({ ...row, unit: event.target.value })}
        placeholder="unit"
      />
      <select
        aria-label="Category"
        className="input sm:col-span-3"
        value={row.category_id}
        onChange={(event) => onChange({ ...row, category_id: event.target.value })}
      >
        <option value="">Default category</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
      <div className="sm:col-span-1 flex sm:flex-col justify-center">
        <button type="button" className="btn-ghost p-1" onClick={onMoveUp} disabled={!onMoveUp} title="Move row up"><ArrowUp className="h-3.5 w-3.5 mx-auto" /></button>
        <button type="button" className="btn-ghost p-1" onClick={onMoveDown} disabled={!onMoveDown} title="Move row down"><ArrowDown className="h-3.5 w-3.5 mx-auto" /></button>
        <button type="button" className="btn-ghost p-1 text-red-600" onClick={onRemove} title="Remove row"><Trash2 className="h-3.5 w-3.5 mx-auto" /></button>
      </div>
      <input
        aria-label="Ingredient notes"
        className="input sm:col-span-9"
        value={row.notes}
        onChange={(event) => onChange({ ...row, notes: event.target.value })}
        placeholder="Notes (optional)"
      />
      <label className="sm:col-span-3 flex items-center gap-2 text-sm px-2">
        <input
          type="checkbox"
          checked={row.scales_with_servings}
          onChange={(event) => onChange({ ...row, scales_with_servings: event.target.checked })}
        />
        Scale quantity
      </label>
    </div>
  );
}

function MealEditor({ open, meal, ingredients, categories, online, onClose, onSaved, onError }) {
  const [form, setForm] = useState(emptyMeal);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(meal ? {
      name: meal.name,
      description: meal.description,
      base_servings: meal.base_servings,
      source_url: meal.source_url,
      ingredients: meal.ingredients.map((row) => ({
        ingredient_id: row.ingredient_id,
        name: '',
        quantity: row.quantity,
        unit: row.unit,
        category_id: row.category_id || '',
        notes: row.notes,
        scales_with_servings: row.scales_with_servings,
      })),
    } : { ...emptyMeal, ingredients: [{ ...emptyRow }] });
  }, [open, meal]);

  const save = async (event) => {
    event.preventDefault();
    if (!online) return;
    setSaving(true);
    const payload = {
      ...form,
      base_servings: Number(form.base_servings),
      ingredients: form.ingredients.map((row) => ({
        ...(row.ingredient_id ? { ingredient_id: row.ingredient_id } : { name: row.name.trim() }),
        quantity: Number(row.quantity),
        unit: row.unit,
        category_id: row.category_id || null,
        notes: row.notes,
        scales_with_servings: row.scales_with_servings,
      })),
      ...(meal ? { expected_version: meal.version } : {}),
    };
    try {
      await (meal ? api.updateMeal(meal.id, payload) : api.createMeal(payload));
      onSaved();
      onClose();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={meal ? 'Edit meal' : 'New meal'} wide>
      <form onSubmit={save} className="space-y-4">
        <input aria-label="Meal name" className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Meal name" required autoFocus />
        <textarea aria-label="Meal description" className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Description" />
        <label className="block text-sm font-medium">
          Base servings
          <input className="input mt-1" type="number" min="1" value={form.base_servings} onChange={(event) => setForm({ ...form, base_servings: event.target.value })} required />
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Ingredients</h3>
            <button type="button" className="btn-secondary py-1.5 flex items-center gap-1" onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { ...emptyRow }] })}>
              <Plus className="h-4 w-4" /> Add row
            </button>
          </div>
          {form.ingredients.map((row, index) => (
            <RowEditor
              // New rows do not have stable IDs yet; ordering is intentionally index-based in the editor.
              key={index}
              row={row}
              ingredients={ingredients}
              categories={categories}
              onChange={(next) => setForm({ ...form, ingredients: form.ingredients.map((item, itemIndex) => itemIndex === index ? next : item) })}
              onRemove={() => setForm({ ...form, ingredients: form.ingredients.filter((_, itemIndex) => itemIndex !== index) })}
              onMoveUp={index > 0 ? () => {
                const rows = [...form.ingredients];
                [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
                setForm({ ...form, ingredients: rows });
              } : null}
              onMoveDown={index < form.ingredients.length - 1 ? () => {
                const rows = [...form.ingredients];
                [rows[index + 1], rows[index]] = [rows[index], rows[index + 1]];
                setForm({ ...form, ingredients: rows });
              } : null}
            />
          ))}
        </div>
        {!online && <p className="text-sm text-amber-600">Reconnect to edit the shared library.</p>}
        <div className="flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary flex-1" disabled={!online || saving}>{saving ? 'Saving…' : 'Save meal'}</button>
        </div>
      </form>
    </Modal>
  );
}

function AddToListModal({ open, source, sourceType, lists, online, onClose, onQueued, onError }) {
  const [listId, setListId] = useState('');
  const [servings, setServings] = useState(sourceType === 'meal' ? source?.base_servings || 1 : 1);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setListId(lists[0]?.id || '');
    setServings(sourceType === 'meal' ? source?.base_servings || 1 : 1);
    setPreview(null);
  }, [open, source, sourceType, lists]);

  const localPreview = useCallback(() => {
    const rows = (sourceType === 'meal' ? source.ingredients : source.items).filter((row) => !row.is_archived);
    const factor = sourceType === 'meal' ? Number(servings) / source.base_servings : Number(servings);
    return {
      source_type: sourceType,
      source_id: sourceType === 'meal' ? source.id : 'global',
      source_version: source.version,
      list_id: listId,
      target_servings: Number(servings),
      rows: rows.map((row) => ({
        ...row,
        source_row_id: row.id,
        quantity: row.scales_with_servings ? Math.round(row.quantity * factor * 1000) / 1000 : row.quantity,
        selected: true,
        matches_existing: false,
      })),
    };
  }, [source, sourceType, listId, servings]);

  const loadPreview = async () => {
    if (!listId) return;
    setBusy(true);
    try {
      let result;
      if (online) {
        result = sourceType === 'meal'
          ? await api.previewMeal(source.id, listId, Number(servings))
          : await api.previewBasics(listId, Number(servings));
      } else {
        result = localPreview();
      }
      setPreview(result);
      setSelected(new Set(result.rows.filter((row) => row.selected).map((row) => row.source_row_id)));
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    const selectedRows = preview.rows.filter((row) => selected.has(row.source_row_id));
    const data = {
      list_id: listId,
      target_servings: Number(servings),
      source_version: preview.source_version,
      selected_source_row_ids: selectedRows.map((row) => row.source_row_id),
      request_id: crypto.randomUUID(),
    };
    setBusy(true);
    try {
      if (sourceType === 'meal') await api.commitMeal(source.id, data, selectedRows);
      else await api.commitBasics(data, selectedRows);
      onQueued(listId, online);
      onClose();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Add ${sourceType === 'meal' ? source?.name : 'Basics'} to a list`}>
      <div className="space-y-4">
        <label className="block text-sm font-medium">Destination list
          <select className="input mt-1" value={listId} onChange={(event) => { setListId(event.target.value); setPreview(null); }}>
            {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">{sourceType === 'meal' ? 'Servings' : 'Quantity multiplier'}
          <input className="input mt-1" type="number" min="1" value={servings} onChange={(event) => { setServings(event.target.value); setPreview(null); }} />
        </label>
        {!preview ? (
          <button className="btn-primary w-full" onClick={loadPreview} disabled={!listId || busy}>{busy ? 'Loading…' : 'Preview checklist'}</button>
        ) : (
          <>
            <div className="space-y-2 max-h-72 overflow-auto">
              {preview.rows.map((row) => (
                <label key={row.source_row_id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-navy-800">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(row.source_row_id)}
                    onChange={() => setSelected((current) => {
                      const next = new Set(current);
                      if (next.has(row.source_row_id)) next.delete(row.source_row_id); else next.add(row.source_row_id);
                      return next;
                    })}
                  />
                  <span className="flex-1"><strong>{row.name}</strong> <span className="text-gray-500">{qty(row.quantity)} {row.unit}</span>
                    {row.matches_existing && <span className="block text-xs text-amber-600">Already on this list; leave clear or select to merge</span>}
                  </span>
                </label>
              ))}
            </div>
            <button className="btn-primary w-full" onClick={commit} disabled={busy || selected.size === 0}>
              {busy ? 'Queuing…' : `Add ${selected.size} selected`}
            </button>
            {!online && <p className="text-xs text-amber-600 text-center">This addition will sync when you reconnect.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}

export default function LibraryPage() {
  const { user } = useAuth();
  const { online } = useOnlineStatus();
  const navigate = useNavigate();
  const [tab, setTab] = useState('meals');
  const [meals, setMeals] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [basics, setBasics] = useState(null);
  const [categories, setCategories] = useState([]);
  const [lists, setLists] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [mealEditor, setMealEditor] = useState({ open: false, meal: null });
  const [addSource, setAddSource] = useState(null);
  const [ingredientForm, setIngredientForm] = useState(null);
  const [basicsForm, setBasicsForm] = useState(null);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeUrl, setRecipeUrl] = useState('');
  const [recipePreview, setRecipePreview] = useState(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [mealData, ingredientData, basicsData, categoryData] = await Promise.all([
        api.getMeals('', showArchived && user?.is_admin),
        api.getIngredients('', showArchived && user?.is_admin),
        api.getBasics(showArchived && user?.is_admin),
        api.getCategories(),
      ]);
      setMeals(mealData);
      setIngredients(ingredientData);
      setBasics(basicsData);
      setCategories(categoryData);
      try {
        const listData = await api.getLists();
        setLists(listData);
        localStorage.setItem(`kc-library-lists-${user?.id}`, JSON.stringify(listData));
      } catch {
        setLists(JSON.parse(localStorage.getItem(`kc-library-lists-${user?.id}`) || '[]'));
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [showArchived, user?.is_admin]);

  useEffect(() => { load(); }, [load]);

  const reportError = (mutationError) => {
    setError(mutationError.status === 409
      ? `${mutationError.message} Your copy is out of date; reload before retrying.`
      : mutationError.message);
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

  const filteredMeals = useMemo(() => meals.filter((meal) => meal.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [meals, search]);
  const filteredIngredients = useMemo(() => ingredients.filter((ingredient) => ingredient.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [ingredients, search]);
  const editableLists = useMemo(() => lists.filter((list) => (
    list.owner_id === user?.id
    || list.members?.some((member) => member.user_id === user?.id && member.role !== 'viewer')
  )), [lists, user?.id]);
  const activeBasics = useMemo(() => basics?.items.filter((item) => !item.is_archived) || [], [basics]);

  const saveIngredient = async (event) => {
    event.preventDefault();
    const record = ingredientForm.record;
    const saved = await mutate(() => record ? api.updateIngredient(record.id, {
      expected_version: record.version,
      name: ingredientForm.name,
      default_unit: ingredientForm.default_unit,
      default_category_id: ingredientForm.default_category_id || null,
    }) : api.createIngredient({
      name: ingredientForm.name,
      default_unit: ingredientForm.default_unit,
      default_category_id: ingredientForm.default_category_id || null,
    }));
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
    const saved = await mutate(() => record ? api.updateBasicsItem(record.id, {
      ...common, expected_version: record.version,
    }) : api.createBasicsItem({
      ...common,
      expected_version: basics.version,
      ingredient_id: basicsForm.ingredient_id || undefined,
      ...(!basicsForm.ingredient_id ? { name: basicsForm.name } : {}),
    }));
    if (saved) setBasicsForm(null);
  };

  const moveBasics = (index, direction) => {
    const active = basics.items.filter((item) => !item.is_archived);
    const target = index + direction;
    if (target < 0 || target >= active.length) return;
    [active[index], active[target]] = [active[target], active[index]];
    mutate(() => api.reorderBasics(active.map((item) => item.id), basics.version));
  };

  const importRecipe = async () => {
    try {
      if (!recipePreview) {
        setRecipePreview(await api.previewMealRecipe(recipeUrl));
      } else {
        await api.createMealFromRecipe(recipeUrl);
        setRecipeOpen(false);
        setRecipeUrl('');
        setRecipePreview(null);
        await load();
      }
    } catch (mutationError) {
      reportError(mutationError);
    }
  };

  if (loading && !basics) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" /></div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex-1 min-w-52">
          <h1 className="text-2xl font-bold">Library</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Shared with every active Kitchen Cupboard user</p>
        </div>
        {!online && <span className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-sm">Offline browsing</span>}
        {user?.is_admin && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Archived records</label>
        )}
      </div>
      <ConflictNotice error={error} onReload={load} />
      {notice && <div role="status" className="mb-4 p-3 rounded-xl bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 text-sm">{notice}</div>}
      <div className="flex gap-1 border-b border-gray-200 dark:border-navy-800 mb-5" role="tablist">
        {[
          ['meals', 'Meals', ChefHat], ['basics', 'Basics', ListChecks], ['ingredients', 'Ingredients', Package],
        ].map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setSearch(''); }} className={`px-4 py-3 flex items-center gap-2 border-b-2 ${tab === id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab !== 'basics' && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input className="input pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${tab}`} />
        </div>
      )}

      {tab === 'meals' && (
        <section>
          <div className="flex justify-end gap-2 mb-4">
            <button className="btn-secondary flex items-center gap-2" disabled={!online} onClick={() => setRecipeOpen(true)}><Upload className="h-4 w-4" /> Recipe URL</button>
            <button className="btn-primary flex items-center gap-2" disabled={!online} onClick={() => setMealEditor({ open: true, meal: null })}><Plus className="h-4 w-4" /> New meal</button>
          </div>
          <div className="grid gap-3">
            {filteredMeals.map((meal) => (
              <article key={meal.id} className={`card p-4 ${meal.is_archived ? 'opacity-60' : ''}`}>
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-lg flex items-center gap-2">{meal.name} {meal.is_archived && <Archive className="h-4 w-4" />}</h2>
                    {meal.description && <p className="text-sm text-gray-500 mt-1">{meal.description}</p>}
                    <p className="text-sm mt-2">Serves {meal.base_servings} · {meal.ingredients.length} ingredient{meal.ingredients.length === 1 ? '' : 's'}</p>
                    <p className="text-xs text-gray-400 mt-2">{attribution(meal)} · Version {meal.version}</p>
                  </div>
                  <div className="flex items-start gap-1">
                    {!meal.is_archived && <button className="btn-primary py-2 flex items-center gap-1" disabled={editableLists.length === 0} onClick={() => setAddSource({ type: 'meal', source: meal })}><Check className="h-4 w-4" /> Add</button>}
                    {!meal.is_archived && <button className="btn-ghost p-2" disabled={!online} onClick={() => setMealEditor({ open: true, meal })} title="Edit meal"><Edit3 className="h-4 w-4" /></button>}
                    {!meal.is_archived && (meal.created_by === user?.id || user?.is_admin) && <button className="btn-ghost p-2 text-red-600" disabled={!online} onClick={() => mutate(() => api.archiveMeal(meal.id, meal.version))} title="Archive meal"><Archive className="h-4 w-4" /></button>}
                    {meal.is_archived && user?.is_admin && <button className="btn-ghost p-2" disabled={!online} onClick={() => mutate(() => api.restoreMeal(meal.id, meal.version))} title="Restore meal"><RotateCcw className="h-4 w-4" /></button>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {meal.ingredients.map((row) => <span key={row.id} className="text-xs px-2 py-1 bg-gray-100 dark:bg-navy-800 rounded-lg">{row.name} · {qty(row.quantity)} {row.unit}{!row.scales_with_servings ? ' · fixed' : ''}</span>)}
                </div>
              </article>
            ))}
            {filteredMeals.length === 0 && <p className="text-center py-12 text-gray-400">No meals found.</p>}
          </div>
        </section>
      )}

      {tab === 'basics' && basics && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div><h2 className="font-semibold">Shared checklist</h2><p className="text-xs text-gray-400">Version {basics.version}{basics.updated_by_name ? ` · Updated by ${basics.updated_by_name}` : ''}</p></div>
            <div className="flex gap-2">
              <button className="btn-primary flex items-center gap-2" disabled={!online} onClick={() => setBasicsForm({ record: null, ingredient_id: '', name: '', quantity: 1, unit: '', category_id: '', notes: '', scales_with_servings: false })}><Plus className="h-4 w-4" /> Add entry</button>
              <button className="btn-secondary flex items-center gap-2" disabled={editableLists.length === 0} onClick={() => setAddSource({ type: 'basics', source: basics })}><ListChecks className="h-4 w-4" /> Add to list</button>
            </div>
          </div>
          <div className="space-y-2">
            {basics.items.map((item) => {
              const activeIndex = activeBasics.findIndex((row) => row.id === item.id);
              return (
              <div key={item.id} className={`card p-3 flex items-center gap-3 ${item.is_archived ? 'opacity-60' : ''}`}>
                <div className="flex flex-col">
                  <button className="btn-ghost p-1" disabled={!online || item.is_archived || activeIndex === 0} onClick={() => moveBasics(activeIndex, -1)} title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button className="btn-ghost p-1" disabled={!online || item.is_archived || activeIndex === activeBasics.length - 1} onClick={() => moveBasics(activeIndex, 1)} title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>
                <div className="flex-1"><strong>{item.name}</strong> <span className="text-gray-500 text-sm">{qty(item.quantity)} {item.unit}</span><p className="text-xs text-gray-400">{attribution(item)} · Version {item.version}</p></div>
                {!item.is_archived && <button className="btn-ghost p-2" disabled={!online} title="Edit Basics entry" onClick={() => setBasicsForm({ ...item, record: item, ingredient_id: item.ingredient_id, category_id: item.category_id || '' })}><Edit3 className="h-4 w-4" /></button>}
                {!item.is_archived && (item.created_by === user?.id || user?.is_admin) && <button className="btn-ghost p-2 text-red-600" disabled={!online} onClick={() => mutate(() => api.archiveBasicsItem(item.id, item.version))} title="Archive Basics entry"><Archive className="h-4 w-4" /></button>}
                {item.is_archived && user?.is_admin && <button className="btn-ghost p-2" disabled={!online} onClick={() => mutate(() => api.restoreBasicsItem(item.id, item.version))} title="Restore Basics entry"><RotateCcw className="h-4 w-4" /></button>}
              </div>
              );
            })}
            {basics.items.length === 0 && <p className="text-center py-12 text-gray-400">Basics is empty.</p>}
          </div>
        </section>
      )}

      {tab === 'ingredients' && (
        <section>
          <div className="flex justify-end mb-4"><button className="btn-primary flex items-center gap-2" disabled={!online} onClick={() => setIngredientForm({ record: null, name: '', default_unit: '', default_category_id: '' })}><Plus className="h-4 w-4" /> New ingredient</button></div>
          <div className="grid sm:grid-cols-2 gap-3">
            {filteredIngredients.map((ingredient) => (
              <article key={ingredient.id} className={`card p-4 flex gap-3 ${ingredient.is_archived ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0"><h2 className="font-semibold flex items-center gap-2">{ingredient.name} {ingredient.is_archived && <Archive className="h-4 w-4" />}</h2><p className="text-sm text-gray-500">{ingredient.default_unit || 'No default unit'}{ingredient.default_category_name ? ` · ${ingredient.default_category_name}` : ''}</p><p className="text-xs text-gray-400 mt-2">{attribution(ingredient)} · Version {ingredient.version}</p></div>
                {!ingredient.is_archived && <button className="btn-ghost p-2" disabled={!online} title="Edit ingredient" onClick={() => setIngredientForm({ record: ingredient, name: ingredient.name, default_unit: ingredient.default_unit, default_category_id: ingredient.default_category_id || '' })}><Edit3 className="h-4 w-4" /></button>}
                {!ingredient.is_archived && (ingredient.created_by === user?.id || user?.is_admin) && <button className="btn-ghost p-2 text-red-600" disabled={!online} title="Archive ingredient" onClick={() => mutate(() => api.archiveIngredient(ingredient.id, ingredient.version))}><Archive className="h-4 w-4" /></button>}
                {ingredient.is_archived && user?.is_admin && <button className="btn-ghost p-2" disabled={!online} title="Restore ingredient" onClick={() => mutate(() => api.restoreIngredient(ingredient.id, ingredient.version))}><RotateCcw className="h-4 w-4" /></button>}
              </article>
            ))}
          </div>
        </section>
      )}

      <MealEditor open={mealEditor.open} meal={mealEditor.meal} ingredients={ingredients} categories={categories} online={online} onClose={() => setMealEditor({ open: false, meal: null })} onSaved={load} onError={reportError} />
      {addSource && <AddToListModal open source={addSource.source} sourceType={addSource.type} lists={editableLists} online={online} onClose={() => setAddSource(null)} onError={reportError} onQueued={(listId, wasOnline) => { setNotice(wasOnline ? 'Adding selected items…' : 'Addition queued for sync.'); setTimeout(() => navigate(`/list/${listId}`), 150); }} />}

      <Modal open={Boolean(ingredientForm)} onClose={() => setIngredientForm(null)} title={ingredientForm?.record ? 'Edit ingredient' : 'New ingredient'}>
        {ingredientForm && <form className="space-y-4" onSubmit={saveIngredient}><input className="input" value={ingredientForm.name} onChange={(event) => setIngredientForm({ ...ingredientForm, name: event.target.value })} placeholder="Ingredient name" required autoFocus /><input className="input" value={ingredientForm.default_unit} onChange={(event) => setIngredientForm({ ...ingredientForm, default_unit: event.target.value })} placeholder="Default unit" /><select className="input" value={ingredientForm.default_category_id} onChange={(event) => setIngredientForm({ ...ingredientForm, default_category_id: event.target.value })}><option value="">No default category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button className="btn-primary w-full" disabled={!online}>Save ingredient</button></form>}
      </Modal>

      <Modal open={Boolean(basicsForm)} onClose={() => setBasicsForm(null)} title={basicsForm?.record ? 'Edit Basics entry' : 'Add Basics entry'}>
        {basicsForm && <form className="space-y-4" onSubmit={saveBasics}>{!basicsForm.record && <><select className="input" value={basicsForm.ingredient_id} onChange={(event) => { const ingredient = ingredients.find((item) => item.id === event.target.value); setBasicsForm({ ...basicsForm, ingredient_id: event.target.value, unit: ingredient?.default_unit || '', category_id: ingredient?.default_category_id || '' }); }}><option value="">New catalogue ingredient…</option>{ingredients.filter((item) => !item.is_archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{!basicsForm.ingredient_id && <input className="input" value={basicsForm.name} onChange={(event) => setBasicsForm({ ...basicsForm, name: event.target.value })} placeholder="New ingredient name" required />}</>}<div className="grid grid-cols-2 gap-2"><input className="input" type="number" min="0.001" step="0.001" value={basicsForm.quantity} onChange={(event) => setBasicsForm({ ...basicsForm, quantity: event.target.value })} required /><input className="input" value={basicsForm.unit} onChange={(event) => setBasicsForm({ ...basicsForm, unit: event.target.value })} placeholder="Unit" /></div><select className="input" value={basicsForm.category_id} onChange={(event) => setBasicsForm({ ...basicsForm, category_id: event.target.value })}><option value="">Default category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input className="input" value={basicsForm.notes} onChange={(event) => setBasicsForm({ ...basicsForm, notes: event.target.value })} placeholder="Notes" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={basicsForm.scales_with_servings} onChange={(event) => setBasicsForm({ ...basicsForm, scales_with_servings: event.target.checked })} /> Scale when multiplier changes</label><button className="btn-primary w-full" disabled={!online}>Save Basics entry</button></form>}
      </Modal>

      <Modal open={recipeOpen} onClose={() => { setRecipeOpen(false); setRecipePreview(null); }} title="Import recipe as a meal">
        <div className="space-y-4"><input className="input" type="url" value={recipeUrl} onChange={(event) => { setRecipeUrl(event.target.value); setRecipePreview(null); }} placeholder="https://example.com/recipe" />{recipePreview && <div className="rounded-xl bg-gray-50 dark:bg-navy-800 p-3"><h3 className="font-semibold">{recipePreview.title}</h3><p className="text-sm text-gray-500 mb-2">{recipePreview.source}</p>{recipePreview.ingredients.map((row, index) => <p key={index} className="text-sm">{row.name} — {qty(row.quantity)} {row.unit}</p>)}</div>}<button className="btn-primary w-full flex justify-center items-center gap-2" onClick={importRecipe} disabled={!online || !recipeUrl}><BookOpen className="h-4 w-4" /> {recipePreview ? 'Create global meal' : 'Preview recipe'}</button></div>
      </Modal>
    </div>
  );
}
