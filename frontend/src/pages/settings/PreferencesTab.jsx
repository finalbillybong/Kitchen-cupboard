import { usePreferences } from '../../hooks/usePreferences';
import { Pointer, MousePointerClick } from 'lucide-react';

export default function PreferencesTab() {
  const { prefs, update } = usePreferences();

  return (
    <div className="space-y-6">
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-lg">Item Tapping</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Choose how tapping an item marks it as done.
        </p>

        <div className="space-y-2">
          <label
            className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
              prefs.tapMode === 'row'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
                : 'border-gray-200 dark:border-navy-700 hover:border-gray-300 dark:hover:border-navy-600'
            }`}
          >
            <input
              type="radio"
              name="tapMode"
              value="row"
              checked={prefs.tapMode === 'row'}
              onChange={() => update('tapMode', 'row')}
              className="mt-1 accent-primary-600"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium">
                <MousePointerClick className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                Whole row
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Tap anywhere on an item to tick it off. Long press to edit.
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
              prefs.tapMode === 'checkbox'
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
                : 'border-gray-200 dark:border-navy-700 hover:border-gray-300 dark:hover:border-navy-600'
            }`}
          >
            <input
              type="radio"
              name="tapMode"
              value="checkbox"
              checked={prefs.tapMode === 'checkbox'}
              onChange={() => update('tapMode', 'checkbox')}
              className="mt-1 accent-primary-600"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium">
                <Pointer className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                Checkbox only
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Only tapping the checkbox changes the item. Long press the row to edit.
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
