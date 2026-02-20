import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import api from '../../api/client';
import { Plus, Trash2 } from 'lucide-react';

export default function CategoriesTab() {
  const [categories, setCategories] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', color: '#6b7280' });

  const fetchCategories = async () => {
    const data = await api.getCategories();
    setCategories(data);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.createCategory(newCat);
      setNewCat({ name: '', color: '#6b7280' });
      setShowCreate(false);
      fetchCategories();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this category?')) return;
    try {
      await api.deleteCategory(id);
      fetchCategories();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Categories</h2>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" />
          New Category
        </button>
      </div>

      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-navy-800 rounded-xl">
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="font-medium">{c.name}</span>
              {c.is_default && <span className="text-xs text-gray-400">Default</span>}
            </div>
            {!c.is_default && (
              <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Category">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name</label>
            <input
              type="text"
              value={newCat.name}
              onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
              className="input"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Color</label>
            <input
              type="color"
              value={newCat.color}
              onChange={(e) => setNewCat({ ...newCat, color: e.target.value })}
              className="w-12 h-10 rounded-lg border border-gray-200 dark:border-navy-700 cursor-pointer"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
