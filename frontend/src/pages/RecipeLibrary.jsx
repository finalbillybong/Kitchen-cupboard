import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import api from '../api/client';
import { RecipeEditor, AddToListModal } from '../components/RecipeEditor';
import Modal from '../components/Modal';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';

export function RecipeImage({ image, className = '' }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let disposed = false,
      objectURL;
    api
      .blob(`/recipes/images/${image.id}`)
      .then((blob) => {
        objectURL = URL.createObjectURL(blob);
        if (disposed) URL.revokeObjectURL(objectURL);
        else setUrl(objectURL);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [image.id]);
  return url ? (
    <img
      className={className}
      src={url}
      alt={
        image.role === 'cover'
          ? 'Recipe cover'
          : `Original recipe page ${image.sort_order + 1}`
      }
    />
  ) : null;
}

export default function RecipeCollection() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [createMode, setCreateMode] = useState('');
  const [recipes, setRecipes] = useState([]),
    [error, setError] = useState('');
  const [filters, setFilters] = useState({
    q: '',
    tag: '',
    category: '',
    max_minutes: '',
    sort: 'name',
    to_try: false,
    include_archived: false,
  });
  const [editor, setEditor] = useState(null),
    [open, setOpen] = useState(false);
  const [ingredients, setIngredients] = useState([]),
    [categories, setCategories] = useState([]);
  const [photos, setPhotos] = useState([]),
    [configured, setConfigured] = useState(false),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState('');
  const { online } = useOnlineStatus();
  const navigate = useNavigate();
  const load = useCallback(() => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
    ).toString();
    api
      .cachedLibraryRead(`/meals?${query}`, `recipes-${query}`)
      .then(setRecipes)
      .catch((e) => setError(e.message));
  }, [filters]);
  useEffect(load, [load]);
  useWebSocket('shared', load);
  useEffect(() => {
    api
      .getIngredients()
      .then(setIngredients)
      .catch(() => {});
    api
      .getCategories()
      .then(setCategories)
      .catch(() => {});
    api
      .request('/recipes/import/status')
      .then((r) => setConfigured(r.configured))
      .catch(() => {});
  }, []);
  const extract = async (kind) => {
    setBusy(true);
    setError('');
    try {
      let draft;
      if (kind === 'url')
        draft = await api.request('/recipes/import/url', {
          method: 'POST',
          body: JSON.stringify({ url }),
        });
      else {
        const data = new FormData();
        photos.forEach((file) => data.append('files', file));
        draft = await api.request('/recipes/import/photos', {
          method: 'POST',
          body: data,
        });
      }
      setCreateMode('');
      setEditor(draft);
      setOpen(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {!online && (
        <p>
          Offline — viewing saved recipes. Reconnect to make changes or export.
        </p>
      )}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <button
          className="btn-primary"
          disabled={!online}
          onClick={() => {
            setError('');
            setCreateMode('choose');
          }}
        >
          Add recipe
        </button>
        <details className="relative">
          <summary className="btn-ghost cursor-pointer">
            Library options
          </summary>
          <div className="card p-3 absolute right-0 z-10 w-60 space-y-2">
            {['csv', 'pdf'].map((format) => (
              <button
                key={format}
                className="btn-ghost w-full text-left"
                disabled={!online}
                onClick={() =>
                  api
                    .download(
                      `/recipes/export?format=${format}`,
                      `KitchenCupboard-cookbook.${format}`,
                    )
                    .catch((e) => setError(e.message))
                }
              >
                Export cookbook {format.toUpperCase()}
              </button>
            ))}
            {user?.is_admin && (
              <label className="flex gap-2 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.include_archived}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      include_archived: e.target.checked,
                    })
                  }
                />{' '}
                Show archived recipes
              </label>
            )}
          </div>
        </details>
      </div>
      <input
        className="input"
        aria-label="Search recipes"
        placeholder="Search recipes or ingredients"
        value={filters.q}
        onChange={(e) => setFilters({ ...filters, q: e.target.value })}
      />
      <details className="card p-3">
        <summary className="cursor-pointer font-medium">
          Filters & sorting
          {filters.tag ||
          filters.category ||
          filters.max_minutes ||
          filters.to_try ||
          filters.sort !== 'name'
            ? ' · Active'
            : ''}
        </summary>
        <div className="grid sm:grid-cols-3 gap-3 mt-3">
          <input
            className="input"
            aria-label="Filter tag"
            placeholder="Tag"
            value={filters.tag}
            onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
          />
          <input
            className="input"
            aria-label="Filter recipe category"
            placeholder="Recipe category"
            value={filters.category}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value })
            }
          />
          <input
            className="input"
            type="number"
            min="0"
            aria-label="Maximum cooking time"
            placeholder="Maximum total minutes"
            value={filters.max_minutes}
            onChange={(e) =>
              setFilters({ ...filters, max_minutes: e.target.value })
            }
          />
          <select
            className="input"
            aria-label="Recipe sorting"
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
          >
            <option value="name">Name</option>
            <option value="rating">Highest rated</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={filters.to_try}
              onChange={(e) =>
                setFilters({ ...filters, to_try: e.target.checked })
              }
            />{' '}
            To try
          </label>
        </div>
      </details>
      <Modal
        open={!!createMode}
        onClose={() => {
          if (!busy) setCreateMode('');
        }}
        title="Add recipe"
        error={error}
      >
        <div className="space-y-4">
          {createMode === 'choose' ? (
            <div className="grid gap-3">
              <button
                className="btn-secondary"
                onClick={() => {
                  setCreateMode('');
                  setEditor(null);
                  setOpen(true);
                }}
              >
                Enter manually
              </button>
              <button
                className="btn-secondary"
                onClick={() => setCreateMode('url')}
              >
                Import from a website
              </button>
              <button
                className="btn-secondary"
                onClick={() => setCreateMode('photos')}
              >
                Import from photos
              </button>
            </div>
          ) : (
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => setCreateMode('choose')}
            >
              ← Import choices
            </button>
          )}
          {createMode === 'url' && (
            <>
              <label className="block">
                Recipe URL
                <input
                  type="url"
                  className="input"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <button
                className="btn-secondary"
                disabled={!online || busy || !url}
                onClick={() => extract('url')}
              >
                Review URL import
              </button>
            </>
          )}
          {createMode === 'photos' && (
            <>
              <p>
                Photo import sends up to five ordered images to the configured
                remote AI provider. Review all quantities and steps before
                saving.
              </p>
              {!configured && (
                <p>
                  An admin must configure photo import in Settings →
                  Integrations.
                </p>
              )}
              <input
                aria-label="Recipe photos"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={!configured || !online || busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files);
                  if (
                    files.length > 5 ||
                    files.some((f) => f.size > 10 * 1024 * 1024) ||
                    files.reduce((s, f) => s + f.size, 0) > 30 * 1024 * 1024
                  ) {
                    setError(
                      'Choose up to five images, at most 10 MB each and 30 MB total.',
                    );
                    return;
                  }
                  setPhotos(files);
                }}
              />
              {photos.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex gap-2 items-center"
                >
                  <span>
                    {i + 1}. {file.name}
                  </span>
                  <button
                    disabled={!i}
                    className="btn-ghost"
                    onClick={() =>
                      setPhotos((files) => {
                        const copy = [...files];
                        [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                        return copy;
                      })
                    }
                  >
                    Move up
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() =>
                      setPhotos((files) => files.filter((_, j) => i !== j))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="btn-secondary"
                disabled={!online || busy || !configured || !photos.length}
                onClick={() => extract('photos')}
              >
                {busy ? 'Extracting…' : 'Review photo import'}
              </button>
            </>
          )}
        </div>
      </Modal>
      <div className="grid sm:grid-cols-2 gap-4">
        {recipes.map((recipe) => (
          <Link
            key={recipe.id}
            className="card p-4 space-y-2"
            to={`/library/recipes/${recipe.id}${params.get('list') ? `?list=${encodeURIComponent(params.get('list'))}` : ''}`}
          >
            {recipe.images?.find((i) => i.role === 'cover') && (
              <RecipeImage
                image={recipe.images.find((i) => i.role === 'cover')}
                className="w-full h-44 object-cover rounded-lg"
              />
            )}
            <h2 className="text-lg font-semibold">
              {recipe.name}
              {recipe.is_archived && (
                <span className="text-sm text-gray-500"> · Archived</span>
              )}
            </h2>
            <p>{recipe.description}</p>
            <p className="text-sm text-gray-500">
              {recipe.prep_minutes + recipe.cook_minutes} min ·{' '}
              {recipe.average_rating
                ? `${recipe.average_rating.toFixed(1)} / 5`
                : 'Unrated'}{' '}
              · {recipe.tags?.join(', ')}
            </p>
          </Link>
        ))}
      </div>
      {recipes.length === 0 && (
        <p className="text-gray-500 py-8 text-center">
          No recipes found. Add a recipe or change your filters.
        </p>
      )}
      <RecipeEditor
        open={open}
        meal={editor}
        ingredients={ingredients}
        categories={categories}
        online={online}
        onClose={() => setOpen(false)}
        onSaved={(recipe) =>
          navigate(
            `/library/recipes/${recipe.id}${params.get('list') ? `?list=${encodeURIComponent(params.get('list'))}` : ''}`,
          )
        }
        onError={(e) => setError(e.message)}
      />
    </div>
  );
}

export function RecipeDetailPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [lists, setLists] = useState([]);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const { mealId } = useParams(),
    { user } = useAuth(),
    { online } = useOnlineStatus();
  const [recipe, setRecipe] = useState(null),
    [servings, setServings] = useState(2),
    [error, setError] = useState(''),
    [editing, setEditing] = useState(false);
  const editableLists = useMemo(
    () =>
      lists.filter(
        (l) =>
          !l.is_archived &&
          (l.owner_id === user?.id ||
            l.members?.some(
              (m) => m.user_id === user?.id && m.role !== 'viewer',
            )),
      ),
    [lists, user?.id],
  );
  const [ingredients, setIngredients] = useState([]),
    [categories, setCategories] = useState([]);
  const load = useCallback(
    () =>
      api
        .cachedLibraryRead(`/meals/${mealId}`, `recipe-${mealId}`)
        .then(setRecipe)
        .catch((e) => setError(e.message)),
    [mealId],
  );
  useEffect(() => {
    load();
    api
      .getIngredients()
      .then(setIngredients)
      .catch(() => {});
    api
      .getCategories()
      .then(setCategories)
      .catch(() => {});
    api
      .cachedLibraryRead('/lists', 'planner-lists')
      .then(setLists)
      .catch(() => {});
  }, [load]);
  useEffect(() => {
    if (recipe) setServings(recipe.base_servings);
  }, [recipe?.id]);
  useWebSocket('shared', load);
  const act = async (fn) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };
  if (!recipe) return <p>{error || 'Loading recipe…'}</p>;
  const cover = recipe.images?.find((i) => i.role === 'cover');
  return (
    <article className="space-y-5">
      <Link
        to={
          params.get('list')
            ? `/library?list=${encodeURIComponent(params.get('list'))}`
            : '/library'
        }
        className="text-primary-600"
      >
        ← Library
      </Link>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-primary-600">
          {notice}
        </p>
      )}
      <h1 className="text-3xl font-bold">{recipe.name}</h1>
      {recipe.is_archived && <p>This recipe is archived.</p>}
      {cover && (
        <RecipeImage
          image={cover}
          className="w-full max-h-80 object-cover rounded-xl"
        />
      )}
      <p>{recipe.description}</p>
      <p>
        {recipe.prep_minutes} min prep · {recipe.cook_minutes} min cooking ·{' '}
        {recipe.recipe_category} · {recipe.tags?.join(', ')}
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <label>
          Servings{' '}
          <input
            aria-label="Recipe servings"
            className="input w-24"
            type="number"
            min="1"
            max="1000"
            value={servings}
            onChange={(e) => setServings(Math.max(1, Number(e.target.value)))}
          />
        </label>
        <button
          className="btn-secondary"
          disabled={!online || recipe.is_archived}
          onClick={() => setEditing(true)}
        >
          Edit recipe
        </button>
        {!recipe.is_archived && (
          <>
            <button
              className="btn-primary"
              disabled={!editableLists.length}
              onClick={() => setAdding(true)}
            >
              Add to shopping list
            </button>
            <Link
              className="btn-secondary"
              to={`/planner?recipe=${mealId}&servings=${servings}`}
            >
              Schedule
            </Link>
          </>
        )}
        <button
          className="btn-secondary"
          disabled={!online}
          onClick={() =>
            act(() =>
              api.request(`/recipes/${mealId}/collection`, {
                method: 'PUT',
                body: JSON.stringify({ to_try: !recipe.to_try }),
              }),
            )
          }
        >
          {recipe.to_try ? 'Remove from To try' : 'Add to To try'}
        </button>
        <details className="relative">
          <summary className="btn-secondary cursor-pointer">Share</summary>
          <div className="card absolute right-0 z-10 p-3 w-52 space-y-2">
            <button
              className="btn-secondary"
              disabled={!online}
              onClick={() =>
                act(async () => {
                  const blob = await api.blob(
                    `/recipes/${mealId}/export?servings=${servings}`,
                  );
                  await navigator.clipboard.writeText(await blob.text());
                  setNotice('Recipe text copied.');
                })
              }
            >
              Copy recipe text
            </button>
            <button
              className="btn-secondary"
              disabled={!online}
              onClick={() =>
                act(() =>
                  api.download(
                    `/recipes/${mealId}/export?format=pdf&servings=${servings}`,
                    'KitchenCupboard-recipe.pdf',
                  ),
                )
              }
            >
              Download PDF
            </button>
          </div>
        </details>
      </div>
      <label className="block">
        Your rating{' '}
        <select
          className="input w-32"
          disabled={!online}
          value={recipe.ratings?.[user.id] || ''}
          onChange={(e) =>
            act(() =>
              api.request(`/recipes/${mealId}/rating`, {
                method: 'PUT',
                body: JSON.stringify({ value: Number(e.target.value) }),
              }),
            )
          }
        >
          <option value="" disabled>
            Unrated
          </option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>
      </label>
      <p>Shared average: {recipe.average_rating?.toFixed(1) || 'Unrated'}</p>
      <h2 className="text-xl font-semibold">Ingredients</h2>
      <ul className="space-y-2">
        {recipe.ingredients.map((row) => (
          <li key={row.id}>
            {row.quantity == null
              ? ''
              : Number(
                  (
                    row.quantity *
                    (row.scales_with_servings
                      ? servings / recipe.base_servings
                      : 1)
                  ).toFixed(3),
                )}{' '}
            {row.unit} <strong>{row.name}</strong>
            {row.notes && ` — ${row.notes}`}
            {row.quantity == null && !row.notes && ' — quantity not specified'}
          </li>
        ))}
      </ul>
      <h2 className="text-xl font-semibold">Method</h2>
      <ol className="list-decimal pl-6 space-y-3">
        {recipe.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      {recipe.source_url && (
        <p>
          Source:{' '}
          <a
            className="text-primary-600"
            href={recipe.source_url}
            target="_blank"
            rel="noreferrer"
          >
            {recipe.source_url}
          </a>
        </p>
      )}
      <details className="card p-4 space-y-3">
        <summary className="cursor-pointer font-medium">Manage recipe</summary>
        <label className="block">
          Change cover photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={!online}
            onChange={(e) => {
              const file = e.target.files[0];
              if (file)
                act(async () => {
                  const data = new FormData();
                  data.append('file', file);
                  const uploaded = await api.request('/recipes/images', {
                    method: 'POST',
                    body: data,
                  });
                  await api.updateMeal(mealId, {
                    ...recipe,
                    expected_version: recipe.version,
                    image_ids: [
                      ...recipe.images
                        .filter((i) => i.role !== 'cover')
                        .map((i) => i.id),
                      ...uploaded.image_ids,
                    ],
                    ingredients: recipe.ingredients.map(
                      ({ name, ...row }) => row,
                    ),
                  });
                });
            }}
          />
        </label>
        {!recipe.is_archived &&
          (recipe.created_by === user?.id || user?.is_admin) && (
            <button
              className="btn-ghost text-red-600"
              disabled={!online}
              onClick={() => act(() => api.archiveMeal(mealId, recipe.version))}
            >
              Archive recipe
            </button>
          )}
        {recipe.is_archived && user?.is_admin && (
          <button
            className="btn-secondary"
            disabled={!online}
            onClick={() => act(() => api.restoreMeal(mealId, recipe.version))}
          >
            Restore recipe
          </button>
        )}
      </details>
      {!!recipe.images?.filter((i) => i.role === 'reference').length && (
        <details>
          <summary>Original recipe photos</summary>
          {recipe.images
            .filter((i) => i.role === 'reference')
            .map((image) => (
              <RecipeImage
                key={image.id}
                image={image}
                className="w-full rounded-xl my-3"
              />
            ))}
        </details>
      )}
      {adding && (
        <AddToListModal
          open
          source={recipe}
          sourceType="meal"
          lists={editableLists}
          initialServings={servings}
          initialListId={params.get('list')}
          online={online}
          onClose={() => setAdding(false)}
          onQueued={(id) => navigate(`/list/${id}`)}
          onError={(e) => setError(e.message)}
        />
      )}
      <RecipeEditor
        open={editing}
        meal={recipe}
        ingredients={ingredients}
        categories={categories}
        online={online}
        onClose={() => setEditing(false)}
        onSaved={load}
        onError={(e) => setError(e.message)}
      />
    </article>
  );
}
