import Modal from './Modal';
import { Search, Loader2, ExternalLink, Plus } from 'lucide-react';

export default function RecipeImportModal({
  open,
  onClose,
  recipeUrl,
  setRecipeUrl,
  recipePreview,
  recipeLoading,
  recipeError,
  recipeImporting,
  onPreview,
  onImport,
}) {
  return (
    <Modal open={open} onClose={onClose} title="Import from Recipe">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Paste a recipe URL and we'll extract the ingredients. Works with most recipe sites (BBC Good Food, AllRecipes, Jamie Oliver, etc).
        </p>

        <form onSubmit={onPreview}>
          <div className="flex gap-2">
            <input
              type="url"
              value={recipeUrl}
              onChange={(e) => setRecipeUrl(e.target.value)}
              className="input flex-1"
              placeholder="https://www.bbcgoodfood.com/recipes/..."
              required
              autoFocus
            />
            <button
              type="submit"
              className="btn-primary px-4 flex items-center gap-2"
              disabled={recipeLoading}
            >
              {recipeLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {recipeLoading ? 'Fetching...' : 'Fetch'}
            </button>
          </div>
        </form>

        {recipeError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {recipeError}
          </div>
        )}

        {recipePreview && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-base">{recipePreview.title}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  {recipePreview.source}
                </p>
              </div>
              <span className="text-xs font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 px-2 py-1 rounded-lg whitespace-nowrap">
                {recipePreview.ingredients.length} items
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto border border-gray-100 dark:border-navy-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
              {recipePreview.ingredients.map((ing, i) => (
                <div key={i} className="px-3 py-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{ing.name}</span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                    {ing.quantity !== 1 || ing.unit ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}` : ''}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onImport}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                disabled={recipeImporting}
              >
                {recipeImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {recipeImporting ? 'Adding...' : `Add ${recipePreview.ingredients.length} items`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
