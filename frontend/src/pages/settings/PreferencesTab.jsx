import { usePreferences } from '../../hooks/usePreferences';
import {
  Pointer, MousePointerClick, Minimize2, Maximize2,
  FolderOpen, List, ArrowDownAZ, Calendar, Hand, Layers,
  Vibrate, Trash2, Clock, Home, SwatchBook,
} from 'lucide-react';

function RadioGroup({ name, value, options, onChange }) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
            value === opt.value
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30'
              : 'border-gray-200 dark:border-navy-700 hover:border-gray-300 dark:hover:border-navy-600'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="mt-1 accent-primary-600"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium">
              {opt.icon && <opt.icon className="h-4 w-4 text-primary-600 dark:text-primary-400" />}
              {opt.label}
            </div>
            {opt.desc && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</p>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label, desc, icon: Icon }) {
  return (
    <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-navy-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-800/50 transition-colors">
      {Icon && <Icon className="h-5 w-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        {desc && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <div
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-navy-600'
        }`}
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </div>
    </label>
  );
}

function Section({ title, children }) {
  return (
    <div className="card p-5 space-y-4">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </div>
  );
}

export default function PreferencesTab() {
  const { prefs, update } = usePreferences();

  return (
    <div className="space-y-6">
      {/* Tapping */}
      <Section title="Item Tapping">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Choose how tapping an item marks it as done.
        </p>
        <RadioGroup
          name="tapMode"
          value={prefs.tapMode}
          onChange={(v) => update('tapMode', v)}
          options={[
            { value: 'one', label: 'One tap', icon: MousePointerClick, desc: 'Tap anywhere on an item to tick it off. Long press to edit.' },
            { value: 'two', label: 'Two taps', icon: Pointer, desc: 'Tap the checkbox to tick off. Long press to edit.' },
          ]}
        />
      </Section>

      {/* Display */}
      <Section title="Display">
        <Toggle
          checked={prefs.compactMode}
          onChange={(v) => update('compactMode', v)}
          label="Compact mode"
          desc="Smaller item rows to fit more on screen"
          icon={prefs.compactMode ? Minimize2 : Maximize2}
        />
        <Toggle
          checked={prefs.showCategories}
          onChange={(v) => update('showCategories', v)}
          label="Group by category"
          desc="Group items under category headers, or show a flat list"
          icon={prefs.showCategories ? FolderOpen : List}
        />
      </Section>

      {/* Sorting */}
      <Section title="Sorting">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          How items are ordered within the list.
        </p>
        <RadioGroup
          name="sortItemsBy"
          value={prefs.sortItemsBy}
          onChange={(v) => update('sortItemsBy', v)}
          options={[
            { value: 'manual', label: 'Manual (drag to reorder)', icon: Hand },
            { value: 'name', label: 'Alphabetical', icon: ArrowDownAZ },
            { value: 'date', label: 'Date added', icon: Calendar },
            { value: 'category', label: 'By category', icon: Layers },
          ]}
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
          Where to show completed items.
        </p>
        <RadioGroup
          name="sortChecked"
          value={prefs.sortChecked}
          onChange={(v) => update('sortChecked', v)}
          options={[
            { value: 'bottom', label: 'Bottom of list', icon: null, desc: 'Show checked items in a collapsible section at the bottom.' },
            { value: 'top', label: 'Top of list', icon: null, desc: 'Show checked items at the top of the list.' },
            { value: 'hidden', label: 'Hidden', icon: null, desc: 'Hide checked items entirely until cleared.' },
          ]}
        />
      </Section>

      {/* Behaviour */}
      <Section title="Behaviour">
        <Toggle
          checked={prefs.confirmBeforeDelete}
          onChange={(v) => update('confirmBeforeDelete', v)}
          label="Confirm before delete"
          desc="Show a confirmation before deleting an item"
          icon={Trash2}
        />
        <Toggle
          checked={prefs.vibrationFeedback}
          onChange={(v) => update('vibrationFeedback', v)}
          label="Vibration feedback"
          desc="Haptic feedback when long-pressing items"
          icon={Vibrate}
        />
        <Toggle
          checked={prefs.swipeActions}
          onChange={(v) => update('swipeActions', v)}
          label="Swipe actions"
          desc="Swipe left to delete, swipe right to check off"
          icon={SwatchBook}
        />
      </Section>

      {/* Defaults */}
      <Section title="Defaults">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Default quantity for new items
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={prefs.defaultQuantity}
            onChange={(e) => update('defaultQuantity', parseFloat(e.target.value) || 0)}
            className="input w-32"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Auto-clear checked items after
          </label>
          <div className="flex items-center gap-2">
            <select
              value={prefs.autoClearCheckedHours}
              onChange={(e) => update('autoClearCheckedHours', parseInt(e.target.value))}
              className="input w-48"
            >
              <option value={0}>Never</option>
              <option value={1}>1 hour</option>
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>1 day</option>
              <option value={48}>2 days</option>
              <option value={168}>1 week</option>
            </select>
            <Clock className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      </Section>
    </div>
  );
}
