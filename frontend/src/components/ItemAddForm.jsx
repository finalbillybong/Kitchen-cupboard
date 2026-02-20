import { useState, useRef, useEffect } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import api from '../api/client';

export default function ItemAddForm({ listId, categories, onItemAdded }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (name.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api.getSuggestions(name);
        setSuggestions(data);
      } catch (e) {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [name]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const item = await api.createItem(listId, {
        name: name.trim(),
        quantity: parseFloat(qty) || 1,
        unit,
        category_id: categoryId || null,
      });
      onItemAdded(item);
      setName('');
      setQty('1');
      setUnit('');
      setCategoryId('');
      setSuggestions([]);
      setShowAdvanced(false);
      inputRef.current?.focus();
    } catch (e) {
      alert(e.message);
    }
  };

  const applySuggestion = (suggestion) => {
    setName(suggestion.name);
    if (suggestion.category_id) setCategoryId(suggestion.category_id);
    setSuggestions([]);
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="card p-3 mb-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Add an item..."
            autoComplete="off"
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-700 rounded-xl shadow-lg z-10 overflow-hidden">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applySuggestion(s)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-navy-800 flex items-center justify-between"
                >
                  <span className="font-medium">{s.name}</span>
                  {s.category_name && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">{s.category_name}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="btn-ghost p-2.5"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
        <button type="submit" className="btn-primary px-4">
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {showAdvanced && (
        <div className="flex gap-2 mt-2 flex-wrap">
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="input w-20"
            placeholder="Qty"
            min="0"
            step="any"
          />
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="input w-24"
            placeholder="Unit"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input flex-1 min-w-[140px]"
          >
            <option value="">Auto category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </form>
  );
}
