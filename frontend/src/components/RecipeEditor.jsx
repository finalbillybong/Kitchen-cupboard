import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import api from '../api/client';
import Modal from './Modal';

const emptyMeal = {
  steps: [],
  tags: [],
  prep_minutes: 0,
  cook_minutes: 0,
  recipe_category: '',
  allow_weekly_repeat: false,
  name: '',
  description: '',
  base_servings: 2,
  source_url: null,
  ingredients: [],
};
const emptyRow = {
  ingredient_id: '',
  name: '',
  quantity: 1,
  unit: '',
  category_id: '',
  notes: '',
  scales_with_servings: true,
};

function qty(value) {
  return value == null
    ? 'quantity not specified'
    : Number(Number(value).toFixed(3)).toString();
}

function RowEditor({
  row,
  ingredients,
  categories,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}) {
  const selected = ingredients.find((item) => item.id === row.ingredient_id);
  return (
    <div className="grid gap-2 sm:grid-cols-12 p-3 rounded-xl bg-gray-50 dark:bg-navy-800">
      <div className="sm:col-span-7">
        <select
          aria-label="Catalogue ingredient"
          className="input"
          value={row.ingredient_id}
          onChange={(event) => {
            const ingredient = ingredients.find(
              (item) => item.id === event.target.value,
            );
            onChange({
              ...row,
              ingredient_id: event.target.value,
              name: event.target.value ? '' : row.name,
              unit: ingredient?.default_unit || '',
              category_id: ingredient?.default_category_id || '',
            });
          }}
        >
          <option value="">New ingredient…</option>
          {ingredients
            .filter(
              (item) => !item.is_archived || item.id === row.ingredient_id,
            )
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
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
        {selected?.is_archived && (
          <p className="text-xs text-amber-600 mt-1">
            Archived existing reference
          </p>
        )}
      </div>
      <input
        aria-label="Quantity"
        className="input sm:col-span-2"
        type="number"
        min="0.001"
        step="0.001"
        value={row.quantity ?? ''}
        onChange={(event) => onChange({ ...row, quantity: event.target.value })}
        placeholder="Unknown / to taste"
      />
      <input
        aria-label="Unit"
        className="input sm:col-span-2"
        value={row.unit}
        onChange={(event) => onChange({ ...row, unit: event.target.value })}
        placeholder="unit"
      />
      <div className="sm:col-span-1 flex sm:flex-col justify-center">
        <button
          type="button"
          className="btn-ghost p-1"
          onClick={onMoveUp}
          disabled={!onMoveUp}
          title="Move row up"
        >
          <ArrowUp className="h-3.5 w-3.5 mx-auto" />
        </button>
        <button
          type="button"
          className="btn-ghost p-1"
          onClick={onMoveDown}
          disabled={!onMoveDown}
          title="Move row down"
        >
          <ArrowDown className="h-3.5 w-3.5 mx-auto" />
        </button>
        <button
          type="button"
          className="btn-ghost p-1 text-red-600"
          onClick={onRemove}
          title="Remove row"
        >
          <Trash2 className="h-3.5 w-3.5 mx-auto" />
        </button>
      </div>
      <input
        aria-label="Ingredient notes"
        className="input sm:col-span-9"
        value={row.notes}
        onChange={(event) => onChange({ ...row, notes: event.target.value })}
        placeholder="Notes (optional)"
      />
      <details className="sm:col-span-12 space-y-2">
        <summary className="cursor-pointer text-sm text-gray-500">
          Shopping & scaling options
        </summary>
        <select
          aria-label="Shopping aisle"
          className="input"
          value={row.category_id}
          onChange={(event) =>
            onChange({ ...row, category_id: event.target.value })
          }
        >
          <option value="">Default shopping aisle</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm px-2">
          <input
            type="checkbox"
            checked={row.scales_with_servings}
            onChange={(event) =>
              onChange({ ...row, scales_with_servings: event.target.checked })
            }
          />
          Scale quantity
        </label>
      </details>
    </div>
  );
}

export function RecipeEditor({
  open,
  meal,
  ingredients,
  categories,
  online,
  onClose,
  onSaved,
  onError,
}) {
  const [form, setForm] = useState(() => ({
    ...emptyMeal,
    ingredients: [{ ...emptyRow }],
  }));
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState('');

  useLayoutEffect(() => {
    if (!open) return;
    setEditorError('');
    setForm(
      meal
        ? {
            ...meal,
            name: meal.name,
            description: meal.description,
            base_servings: meal.base_servings,
            source_url: meal.source_url,
            ingredients: meal.ingredients.map((row) => ({
              ingredient_id: row.ingredient_id || '',
              name: row.ingredient_id ? '' : row.name,
              quantity: row.quantity,
              unit: row.unit,
              category_id: row.category_id || '',
              notes: row.notes,
              scales_with_servings: row.scales_with_servings,
            })),
          }
        : { ...emptyMeal, ingredients: [{ ...emptyRow }] },
    );
  }, [open, meal?.id]);

  const save = async (event) => {
    event.preventDefault();
    if (!online) return;
    if (!form.name.trim() || form.name.trim().length > 200) {
      setEditorError(
        'Enter a recipe name between 1 and 200 characters before saving.',
      );
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      name: form.name.trim(),
      base_servings: Number(form.base_servings),
      ingredients: form.ingredients.map((row) => ({
        ...(row.ingredient_id
          ? { ingredient_id: row.ingredient_id }
          : { name: row.name.trim() }),
        quantity:
          row.quantity === '' || row.quantity == null
            ? null
            : Number(row.quantity),
        unit: row.unit,
        category_id: row.category_id || null,
        notes: row.notes,
        scales_with_servings: row.scales_with_servings,
      })),
      ...(meal?.id ? { expected_version: form.version } : {}),
    };
    try {
      const saved = await (meal?.id
        ? api.updateMeal(meal.id, payload)
        : api.createMeal(payload));
      onSaved(saved);
      onClose();
    } catch (error) {
      setEditorError(error.message);
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      error={editorError}
      open={open}
      onClose={onClose}
      title={
        meal?.review_required
          ? 'Review photo import'
          : meal && !meal.id
            ? 'Review website import'
            : meal
              ? 'Edit recipe'
              : 'New recipe'
      }
      wide
    >
      <form onSubmit={save} className="space-y-4">
        {meal?.review_required && !form.name.trim() && (
          <p role="status">
            The recipe title could not be read. Enter a name below before
            saving.
          </p>
        )}
        {meal?.review_required && form.name.trim().length > 200 && (
          <p role="status">
            Shorten the recipe name to 200 characters before saving.
          </p>
        )}
        <input
          aria-label="Recipe name"
          className="input"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Recipe name"
          required
          maxLength={200}
          autoFocus
        />
        <textarea
          aria-label="Recipe description"
          className="input"
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
          placeholder="Description"
        />
        <label className="block text-sm font-medium">
          Base servings
          <input
            className="input mt-1"
            type="number"
            min="1"
            value={form.base_servings}
            onChange={(event) =>
              setForm({ ...form, base_servings: event.target.value })
            }
            required
          />
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Ingredients</h3>
            <button
              type="button"
              className="btn-secondary py-1.5 flex items-center gap-1"
              onClick={() =>
                setForm({
                  ...form,
                  ingredients: [...form.ingredients, { ...emptyRow }],
                })
              }
            >
              <Plus className="h-4 w-4" /> Add ingredient
            </button>
          </div>
          {form.ingredients.map((row, index) => (
            <RowEditor
              // New rows do not have stable IDs yet; ordering is intentionally index-based in the editor.
              key={index}
              row={row}
              ingredients={ingredients}
              categories={categories}
              onChange={(next) =>
                setForm({
                  ...form,
                  ingredients: form.ingredients.map((item, itemIndex) =>
                    itemIndex === index ? next : item,
                  ),
                })
              }
              onRemove={() =>
                setForm({
                  ...form,
                  ingredients: form.ingredients.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                })
              }
              onMoveUp={
                index > 0
                  ? () => {
                      const rows = [...form.ingredients];
                      [rows[index - 1], rows[index]] = [
                        rows[index],
                        rows[index - 1],
                      ];
                      setForm({ ...form, ingredients: rows });
                    }
                  : null
              }
              onMoveDown={
                index < form.ingredients.length - 1
                  ? () => {
                      const rows = [...form.ingredients];
                      [rows[index + 1], rows[index]] = [
                        rows[index],
                        rows[index + 1],
                      ];
                      setForm({ ...form, ingredients: rows });
                    }
                  : null
              }
            />
          ))}
        </div>
        <label className="block">
          Method (one step per line)
          <textarea
            aria-label="Method"
            className="input"
            value={(form.steps || []).join('\n')}
            onChange={(e) =>
              setForm({ ...form, steps: e.target.value.split('\n') })
            }
          />
        </label>
        <details className="space-y-3">
          <summary className="cursor-pointer font-medium">
            Recipe details & planning preferences
          </summary>
          <label className="block">
            Recipe category
            <input
              aria-label="Recipe category"
              className="input"
              value={form.recipe_category || ''}
              onChange={(e) =>
                setForm({ ...form, recipe_category: e.target.value })
              }
            />
          </label>
          <label className="block">
            Tags (comma separated; use vegetarian or fish for planning)
            <input
              aria-label="Recipe tags"
              className="input"
              value={(form.tags || []).join(',')}
              onChange={(e) =>
                setForm({ ...form, tags: e.target.value.split(',') })
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {['prep_minutes', 'cook_minutes'].map((key) => (
              <label key={key}>
                {key === 'prep_minutes' ? 'Prep minutes' : 'Cook minutes'}
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={form[key] || 0}
                  onChange={(e) =>
                    setForm({ ...form, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <label className="block">
            <input
              type="checkbox"
              checked={form.allow_weekly_repeat || false}
              onChange={(e) =>
                setForm({ ...form, allow_weekly_repeat: e.target.checked })
              }
            />{' '}
            Allow weekly repeat
          </label>
          <label className="block">
            Source URL
            <input
              className="input"
              value={form.source_url || ''}
              onChange={(e) =>
                setForm({ ...form, source_url: e.target.value || null })
              }
            />
          </label>
        </details>
        {!online && (
          <p className="text-sm text-amber-600">
            Reconnect to edit the shared library.
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary flex-1"
            disabled={!online || saving}
          >
            {saving ? 'Saving…' : 'Save recipe'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AddToListModal({
  open,
  source,
  sourceType,
  lists,
  online,
  onClose,
  onQueued,
  onError,
  initialServings,
  initialListId,
}) {
  const [listId, setListId] = useState('');
  const [servings, setServings] = useState(
    sourceType === 'meal' ? source?.base_servings || 1 : 1,
  );
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setListId(
      lists.find((list) => list.id === initialListId)?.id || lists[0]?.id || '',
    );
    setServings(
      initialServings ||
        (sourceType === 'meal' ? source?.base_servings || 1 : 1),
    );
    setPreview(null);
  }, [open, source, sourceType, lists, initialServings, initialListId]);

  const localPreview = useCallback(() => {
    const rows = (
      sourceType === 'meal' ? source.ingredients : source.items
    ).filter((row) => !row.is_archived);
    const factor =
      sourceType === 'meal'
        ? Number(servings) / source.base_servings
        : Number(servings);
    return {
      source_type: sourceType,
      source_id: sourceType === 'meal' ? source.id : 'global',
      source_version: source.version,
      list_id: listId,
      target_servings: Number(servings),
      rows: rows.map((row) => ({
        ...row,
        source_row_id: row.id,
        quantity:
          row.quantity != null && row.scales_with_servings
            ? Math.round(row.quantity * factor * 1000) / 1000
            : row.quantity,
        selected: true,
        matches_existing: false,
      })),
    };
  }, [source, sourceType, listId, servings]);

  const loadPreview = async () => {
    if (!listId) return;
    setError('');
    setBusy(true);
    try {
      let result;
      if (online) {
        result =
          sourceType === 'meal'
            ? await api.previewMeal(source.id, listId, Number(servings))
            : await api.previewBasics(listId, Number(servings));
      } else {
        result = localPreview();
      }
      setPreview(result);
      setSelected(
        new Set(
          result.rows
            .filter((row) => row.selected)
            .map((row) => row.source_row_id),
        ),
      );
    } catch (error) {
      setError(error.message);
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    const selectedRows = preview.rows.filter((row) =>
      selected.has(row.source_row_id),
    );
    const data = {
      list_id: listId,
      target_servings: Number(servings),
      source_version: preview.source_version,
      selected_source_row_ids: selectedRows.map((row) => row.source_row_id),
      request_id: crypto.randomUUID(),
    };
    setError('');
    setBusy(true);
    try {
      if (sourceType === 'meal')
        await api.commitMeal(source.id, data, selectedRows);
      else await api.commitBasics(data, selectedRows);
      onQueued(listId, online);
      onClose();
    } catch (error) {
      setError(error.message);
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      error={error}
      open={open}
      onClose={onClose}
      title={`Add ${sourceType === 'meal' ? source?.name : 'Basics'} to a list`}
    >
      <div className="space-y-4">
        <label className="block text-sm font-medium">
          Destination list
          <select
            className="input mt-1"
            value={listId}
            onChange={(event) => {
              setListId(event.target.value);
              setPreview(null);
            }}
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          {sourceType === 'meal' ? 'Servings' : 'Quantity multiplier'}
          <input
            className="input mt-1"
            type="number"
            min="1"
            value={servings}
            onChange={(event) => {
              setServings(event.target.value);
              setPreview(null);
            }}
          />
        </label>
        {!preview ? (
          <button
            className="btn-primary w-full"
            onClick={loadPreview}
            disabled={!listId || busy}
          >
            {busy ? 'Loading…' : 'Preview checklist'}
          </button>
        ) : (
          <>
            <div className="space-y-2 max-h-72 overflow-auto">
              {preview.rows.map((row) => (
                <label
                  key={row.source_row_id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-navy-800"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(row.source_row_id)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(row.source_row_id))
                          next.delete(row.source_row_id);
                        else next.add(row.source_row_id);
                        return next;
                      })
                    }
                  />
                  <span className="flex-1">
                    <strong>{row.name}</strong>{' '}
                    <span className="text-gray-500">
                      {qty(row.quantity)} {row.unit}
                    </span>
                    {row.matches_existing && (
                      <span className="block text-xs text-amber-600">
                        Already on this list; leave clear or select to merge
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <button
              className="btn-primary w-full"
              onClick={commit}
              disabled={busy || selected.size === 0}
            >
              {busy ? 'Queuing…' : `Add ${selected.size} selected`}
            </button>
            {!online && (
              <p className="text-xs text-amber-600 text-center">
                This addition will sync when you reconnect.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
