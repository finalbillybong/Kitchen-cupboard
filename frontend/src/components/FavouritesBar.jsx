import { useState } from 'react';
import { Star, ChevronDown, ChevronRight, Plus } from 'lucide-react';

export default function FavouritesBar({ favourites, onQuickAdd }) {
  const [showFavourites, setShowFavourites] = useState(false);

  if (favourites.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setShowFavourites(!showFavourites)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mb-2"
      >
        <Star className="h-3.5 w-3.5" />
        Quick add
        {showFavourites ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {showFavourites && (
        <div className="flex gap-2 flex-wrap">
          {favourites.slice(0, 12).map((fav, i) => (
            <button
              key={i}
              onClick={() => onQuickAdd(fav)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-navy-800 text-gray-700 dark:text-gray-300 hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-900/30 dark:hover:text-primary-400 transition-colors"
            >
              <Plus className="h-3 w-3" />
              {fav.name}
              {fav.category_name && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {fav.category_name}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
