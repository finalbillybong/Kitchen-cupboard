import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { MealEditor } from './LibraryPage';
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

export default function RecipesPage() {
  const [recipes, setRecipes] = useState([]),
    [error, setError] = useState('');
  const [filters, setFilters] = useState({
    q: '',
    tag: '',
    category: '',
    max_minutes: '',
    sort: 'name',
    to_try: false,
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
      <h1 className="text-2xl font-bold">Recipes</h1>
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
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={!online}
          onClick={() => {
            setEditor(null);
            setOpen(true);
          }}
        >
          New recipe
        </button>
        {['csv', 'pdf'].map((format) => (
          <button
            key={format}
            className="btn-secondary"
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
            Export {format.toUpperCase()}
          </button>
        ))}
        <Link className="btn-secondary" to="/library">
          Ingredients & Basics
        </Link>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        <input
          className="input"
          aria-label="Search recipes"
          placeholder="Recipe or ingredient"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
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
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
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
      <details className="card p-4">
        <summary className="font-semibold cursor-pointer">
          Import a recipe
        </summary>
        <div className="space-y-3 mt-3">
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
          <p>
            Photo import sends up to five ordered images to the configured
            remote AI provider. Review all quantities and steps before saving.
          </p>
          {!configured && (
            <p>
              An admin must configure photo import in Settings → Integrations.
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
            <div key={`${file.name}-${i}`} className="flex gap-2 items-center">
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
        </div>
      </details>
      <div className="grid sm:grid-cols-2 gap-4">
        {recipes.map((recipe) => (
          <Link
            key={recipe.id}
            className="card p-4 space-y-2"
            to={`/recipes/${recipe.id}`}
          >
            {recipe.images?.find((i) => i.role === 'cover') && (
              <RecipeImage
                image={recipe.images.find((i) => i.role === 'cover')}
                className="w-full h-44 object-cover rounded-lg"
              />
            )}
            <h2 className="text-lg font-semibold">{recipe.name}</h2>
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
      <MealEditor
        open={open}
        meal={editor}
        ingredients={ingredients}
        categories={categories}
        online={online}
        onClose={() => setOpen(false)}
        onSaved={(recipe) => navigate(`/recipes/${recipe.id}`)}
        onError={(e) => setError(e.message)}
      />
    </div>
  );
}

export function RecipeDetailPage() {
  const { mealId } = useParams(),
    { user } = useAuth(),
    { online } = useOnlineStatus();
  const [recipe, setRecipe] = useState(null),
    [servings, setServings] = useState(2),
    [error, setError] = useState(''),
    [editing, setEditing] = useState(false);
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
      <Link to="/recipes" className="text-primary-600">
        ← Recipes
      </Link>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <h1 className="text-3xl font-bold">{recipe.name}</h1>
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
          disabled={!online}
          onClick={() => setEditing(true)}
        >
          Edit recipe
        </button>
        <Link
          className="btn-primary"
          to={`/planner?recipe=${mealId}&servings=${servings}`}
        >
          Schedule
        </Link>
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
        <button
          className="btn-secondary"
          disabled={!online}
          onClick={() =>
            act(async () => {
              const blob = await api.blob(
                `/recipes/${mealId}/export?servings=${servings}`,
              );
              await navigator.clipboard.writeText(await blob.text());
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
      <MealEditor
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
