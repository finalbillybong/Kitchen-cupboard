import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Modal from '../components/Modal';
import { Plus, ShoppingCart, Archive, Users, ChevronRight, Package } from 'lucide-react';

const LIST_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6',
  '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6',
];

export default function ListsPage() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newList, setNewList] = useState({ name: '', description: '', color: '#6366f1' });
  const [creating, setCreating] = useState(false);

  const fetchLists = async () => {
    try {
      const data = await api.getLists();
      setLists(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLists();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createList(newList);
      setShowCreate(false);
      setNewList({ name: '', description: '', color: '#6366f1' });
      fetchLists();
    } catch (e) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Lists</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <span>New List</span>
        </button>
      </div>

      {lists.length === 0 ? (
        <div className="text-center py-20">
          <Package className="h-16 w-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-400 dark:text-gray-500 mb-2">No lists yet</h2>
          <p className="text-gray-400 dark:text-gray-500 mb-6">Create your first shopping list to get started</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            Create a list
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {lists.map((list) => (
            <Link
              key={list.id}
              to={`/list/${list.id}`}
              className="card p-4 hover:shadow-md transition-shadow flex items-center gap-4 group"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: list.color + '20' }}
              >
                <ShoppingCart className="h-6 w-6" style={{ color: list.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{list.name}</h3>
                <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  <span>
                    {list.checked_count}/{list.item_count} items
                  </span>
                  {list.members.length > 1 && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {list.members.length}
                    </span>
                  )}
                  {list.is_archived && (
                    <span className="flex items-center gap-1 text-amber-500">
                      <Archive className="h-3.5 w-3.5" />
                      Archived
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 transition-colors" />
            </Link>
          ))}
        </div>
      )}

      {/* Create List Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New List">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name</label>
            <input
              type="text"
              value={newList.name}
              onChange={(e) => setNewList({ ...newList, name: e.target.value })}
              className="input"
              required
              autoFocus
              placeholder="Weekly groceries"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={newList.description}
              onChange={(e) => setNewList({ ...newList, description: e.target.value })}
              className="input"
              placeholder="Shopping for the week"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Color</label>
            <div className="flex gap-2 flex-wrap">
              {LIST_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewList({ ...newList, color })}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    newList.color === color ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-navy-900 scale-110' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={creating} className="btn-primary flex-1">
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
