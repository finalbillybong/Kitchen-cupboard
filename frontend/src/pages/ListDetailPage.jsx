import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import { useRecipeImport } from '../hooks/useRecipeImport';
import { useDragReorder } from '../hooks/useDragReorder';
import Modal from '../components/Modal';
import ShareModal from '../components/ShareModal';
import RecipeImportModal from '../components/RecipeImportModal';
import FavouritesBar from '../components/FavouritesBar';
import ItemAddForm from '../components/ItemAddForm';
import {
  ArrowLeft, Trash2, Check, Settings2,
  ChevronDown, ChevronRight, UserPlus, Archive, Search,
  GripVertical, ArrowUpDown, BookOpen,
} from 'lucide-react';

export default function ListDetailPage() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Edit item modal (long press)
  const [editItem, setEditItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', quantity: '1', unit: '', category_id: '', notes: '',
  });

  // Collapsed categories
  const [collapsed, setCollapsed] = useState({});

  // Favourites
  const [favourites, setFavourites] = useState([]);

  // Custom hooks
  const recipe = useRecipeImport(listId);
  const drag = useDragReorder(listId, setItems);

  const fetchData = useCallback(async () => {
    try {
      const [listData, itemsData, catsData] = await Promise.all([
        api.getList(listId),
        api.getItems(listId),
        api.getCategories(),
      ]);
      setList(listData);
      setItems(itemsData);
      setCategories(catsData);
    } catch (e) {
      console.error(e);
      if (e.message.includes('not found')) navigate('/');
    } finally {
      setLoading(false);
    }
  }, [listId, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch favourites
  useEffect(() => {
    api.getFavourites(15).then(setFavourites).catch(() => {});
  }, []);

  // WebSocket for real-time updates
  const handleWsMessage = useCallback((msg) => {
    if (msg.user_id === user?.id) return;

    switch (msg.type) {
      case 'item_added':
        setItems((prev) => [...prev.filter((i) => i.id !== msg.data.id), msg.data]);
        break;
      case 'item_updated':
      case 'item_checked':
        setItems((prev) => prev.map((i) => (i.id === msg.data.id ? msg.data : i)));
        break;
      case 'item_removed':
        setItems((prev) => prev.filter((i) => i.id !== msg.data.id));
        break;
      case 'checked_cleared':
        setItems((prev) => prev.filter((i) => !i.checked));
        break;
      case 'items_reordered': {
        const orderMap = {};
        msg.data.item_ids.forEach((id, i) => { orderMap[id] = i; });
        setItems((prev) => prev.map((item) =>
          orderMap[item.id] !== undefined ? { ...item, sort_order: orderMap[item.id] } : item
        ));
        break;
      }
      default:
        break;
    }
  }, [user?.id]);

  useWebSocket(listId, handleWsMessage);

  const handleToggleCheck = async (item) => {
    const updated = await api.updateItem(listId, item.id, { checked: !item.checked });
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  };

  const handleDeleteItem = async (itemId) => {
    await api.deleteItem(listId, itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleClearChecked = async () => {
    await api.clearChecked(listId);
    setItems((prev) => prev.filter((i) => !i.checked));
  };

  const handleDeleteList = async () => {
    if (!confirm('Delete this list and all its items? This cannot be undone.')) return;
    try {
      await api.deleteList(listId);
      navigate('/');
    } catch (e) {
      alert(e.message);
    }
  };

  const handleArchiveList = async () => {
    try {
      await api.updateList(listId, { is_archived: !list.is_archived });
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleQuickAdd = async (fav) => {
    try {
      const item = await api.createItem(listId, {
        name: fav.name,
        quantity: 1,
        unit: '',
        category_id: fav.category_id || null,
      });
      setItems((prev) => [...prev, item]);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRecipeImport = async () => {
    const importedItems = await recipe.handleRecipeImport();
    if (importedItems) {
      setItems((prev) => [...prev, ...importedItems]);
    }
  };

  // ─── Edit Item (long press) ───────────────────────────────────
  const openEditModal = (item) => {
    setEditItem(item);
    setEditForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit || '',
      category_id: item.category_id || '',
      notes: item.notes || '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    try {
      const updated = await api.updateItem(listId, editItem.id, {
        name: editForm.name.trim(),
        quantity: parseFloat(editForm.quantity) || 1,
        unit: editForm.unit,
        category_id: editForm.category_id || null,
        notes: editForm.notes,
      });
      setItems((prev) => prev.map((i) => (i.id === editItem.id ? updated : i)));
      setShowEditModal(false);
      setEditItem(null);
    } catch (e) {
      alert(e.message);
    }
  };

  // Group items by category (memoized to avoid recalculating on every render)
  const { sortedGroups, checked } = useMemo(() => {
    const uncheckedItems = items.filter((i) => !i.checked);
    const checkedItems = items.filter((i) => i.checked);

    const groups = {};
    for (const item of uncheckedItems) {
      const key = item.category_id || 'uncategorized';
      if (!groups[key]) {
        groups[key] = {
          id: key,
          name: item.category_name || 'Uncategorized',
          color: item.category_color || '#6b7280',
          items: [],
        };
      }
      groups[key].items.push(item);
    }

    for (const group of Object.values(groups)) {
      group.items.sort((a, b) =>
        a.sort_order - b.sort_order || new Date(a.created_at) - new Date(b.created_at)
      );
    }

    const sorted = Object.values(groups).sort((a, b) => {
      if (a.id === 'uncategorized') return 1;
      if (b.id === 'uncategorized') return -1;
      return a.name.localeCompare(b.name);
    });

    return { sortedGroups: sorted, checked: checkedItems };
  }, [items]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!list) return null;

  const isOwner = list.owner_id === user?.id;

  const itemNamesLower = new Set(items.map((i) => i.name.toLowerCase()));
  const availableFavourites = favourites.filter((f) => !itemNamesLower.has(f.name.toLowerCase()));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="btn-ghost p-2">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{list.name}</h1>
          {list.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{list.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => drag.setReorderMode(!drag.reorderMode)}
            className={`p-2 rounded-xl transition-all font-medium text-sm flex items-center gap-1.5 ${
              drag.reorderMode
                ? 'bg-primary-600 text-white shadow-md'
                : 'btn-ghost'
            }`}
            title={drag.reorderMode ? 'Done reordering' : 'Reorder items'}
          >
            <ArrowUpDown className="h-4 w-4" />
            {drag.reorderMode && <span>Done</span>}
          </button>
          <button onClick={recipe.openRecipeModal} className="btn-ghost p-2" title="Import recipe">
            <BookOpen className="h-5 w-5" />
          </button>
          <button onClick={() => setShowShareModal(true)} className="btn-ghost p-2" title="Share">
            <UserPlus className="h-5 w-5" />
          </button>
          {isOwner && (
            <button onClick={() => setShowSettingsModal(true)} className="btn-ghost p-2" title="Settings">
              <Settings2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Reorder mode banner */}
      {drag.reorderMode && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 text-sm font-medium flex items-center gap-2">
          <GripVertical className="h-4 w-4 flex-shrink-0" />
          Drag items to reorder. Tap <strong>Done</strong> when finished.
        </div>
      )}

      {/* Add Item Form */}
      {!drag.reorderMode && (
        <ItemAddForm
          listId={listId}
          categories={categories}
          onItemAdded={(item) => setItems((prev) => [...prev, item])}
        />
      )}

      {/* Favourites / Quick Add */}
      {!drag.reorderMode && (
        <FavouritesBar favourites={availableFavourites} onQuickAdd={handleQuickAdd} />
      )}

      {/* Items grouped by category */}
      {sortedGroups.length === 0 && checked.length === 0 ? (
        <div className="text-center py-16">
          <Search className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500">No items yet. Add something above!</p>
        </div>
      ) : (
        <div className="space-y-4" ref={drag.itemsContainerRef}>
          {sortedGroups.map((group) => (
            <div key={group.id}>
              <button
                onClick={() => setCollapsed({ ...collapsed, [group.id]: !collapsed[group.id] })}
                className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {collapsed[group.id] ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                {group.name}
                <span className="text-gray-400 font-normal">({group.items.length})</span>
              </button>
              {!collapsed[group.id] && (
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      groupId={group.id}
                      onToggle={handleToggleCheck}
                      onDelete={handleDeleteItem}
                      onEdit={openEditModal}
                      reorderMode={drag.reorderMode}
                      onDragStart={drag.reorderMode ? drag.handleDragStart : undefined}
                      onDragEnter={drag.reorderMode ? drag.handleDragEnter : undefined}
                      onDragEnd={drag.reorderMode ? drag.handleDragEnd : undefined}
                      isDragging={drag.draggingId === item.id}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Checked items */}
          {checked.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setCollapsed({ ...collapsed, checked: !collapsed.checked })}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-400 dark:text-gray-500"
                >
                  {collapsed.checked ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  Completed ({checked.length})
                </button>
                <button onClick={handleClearChecked} className="text-xs text-red-500 hover:text-red-600 font-medium">
                  Clear all
                </button>
              </div>
              {!collapsed.checked && (
                <div className="space-y-1 opacity-60">
                  {checked.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      groupId="checked"
                      onToggle={handleToggleCheck}
                      onDelete={handleDeleteItem}
                      onEdit={openEditModal}
                      isChecked
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Item Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Item">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name</label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="input"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Quantity</label>
              <input
                type="number"
                value={editForm.quantity}
                onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                className="input"
                min="0"
                step="any"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Unit</label>
              <input
                type="text"
                value={editForm.unit}
                onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                className="input"
                placeholder="kg, litres, packs..."
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Category</label>
            <select
              value={editForm.category_id}
              onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
              className="input"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Notes</label>
            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className="input min-h-[80px] resize-y"
              placeholder="Any extra details..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="btn-primary flex-1"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Share Modal */}
      <ShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        list={list}
        listId={listId}
        isOwner={isOwner}
        onDataChange={fetchData}
      />

      {/* Settings Modal */}
      <Modal open={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="List Settings">
        <div className="space-y-4">
          <button
            onClick={() => {
              handleArchiveList();
              setShowSettingsModal(false);
            }}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Archive className="h-4 w-4" />
            {list.is_archived ? 'Unarchive list' : 'Archive list'}
          </button>
          <button
            onClick={() => {
              handleDeleteList();
              setShowSettingsModal(false);
            }}
            className="btn-danger w-full flex items-center justify-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete list
          </button>
        </div>
      </Modal>

      {/* Recipe Import Modal */}
      <RecipeImportModal
        open={recipe.showRecipeModal}
        onClose={recipe.closeRecipeModal}
        recipeUrl={recipe.recipeUrl}
        setRecipeUrl={recipe.setRecipeUrl}
        recipePreview={recipe.recipePreview}
        recipeLoading={recipe.recipeLoading}
        recipeError={recipe.recipeError}
        recipeImporting={recipe.recipeImporting}
        onPreview={recipe.handleRecipePreview}
        onImport={handleRecipeImport}
      />
    </div>
  );
}

function ItemRow({
  item, groupId, onToggle, onDelete, onEdit,
  reorderMode, onDragStart, onDragEnter, onDragEnd,
  isDragging, isChecked,
}) {
  const longPressTimer = useRef(null);
  const pointerStart = useRef(null);
  const [pressing, setPressing] = useState(false);

  useEffect(() => {
    return () => clearTimeout(longPressTimer.current);
  }, []);

  const handlePointerDown = (e) => {
    if (reorderMode) return;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    setPressing(true);
    longPressTimer.current = setTimeout(() => {
      setPressing(false);
      onEdit(item);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  };

  const handlePointerMove = (e) => {
    if (!pointerStart.current) return;
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimer.current);
      pointerStart.current = null;
      setPressing(false);
    }
  };

  const handlePointerUp = () => {
    clearTimeout(longPressTimer.current);
    pointerStart.current = null;
    setPressing(false);
  };

  const dragProps = reorderMode && !isChecked ? {
    draggable: true,
    onDragStart: (e) => onDragStart(e, item, groupId),
    onDragEnter: (e) => onDragEnter(e, item, groupId),
    onDragEnd: onDragEnd,
    onDragOver: (e) => e.preventDefault(),
  } : {};

  let rowClass = 'card px-3 py-2.5 flex items-center gap-3 group select-none relative overflow-hidden';
  if (pressing) {
    rowClass += ' long-press-active';
  }
  if (isDragging) {
    rowClass += ' scale-[1.04] shadow-2xl ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/40 z-50 relative';
  }

  return (
    <div
      data-item-id={item.id}
      data-group-id={groupId}
      className={rowClass}
      style={isDragging ? { transition: 'none' } : { transition: 'transform 150ms ease, box-shadow 150ms ease' }}
      onContextMenu={(e) => { if (!reorderMode) e.preventDefault(); }}
      {...dragProps}
    >
      {/* Drag handle - only in reorder mode */}
      {reorderMode && !isChecked && (
        <div
          data-drag-handle
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-primary-400 dark:text-primary-500 touch-none"
        >
          <GripVertical className="h-5 w-5" />
        </div>
      )}

      {/* Checkbox - hidden in reorder mode */}
      {!reorderMode && (
        <button
          onClick={() => onToggle(item)}
          className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
            item.checked
              ? 'bg-primary-600 border-primary-600 check-animation'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          {item.checked && <Check className="h-3.5 w-3.5 text-white" />}
        </button>
      )}

      {/* Content area - long press to edit */}
      <div
        className="flex-1 min-w-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className={`font-medium ${item.checked ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
          {item.name}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          {(item.quantity !== 1 || item.unit) && (
            <span>
              {item.quantity}{item.unit && ` ${item.unit}`}
            </span>
          )}
          {item.category_name && (
            <span className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: item.category_color || '#6b7280' }}
              />
              {item.category_name}
            </span>
          )}
          {item.notes && (
            <span className="truncate max-w-[120px]" title={item.notes}>
              {item.notes}
            </span>
          )}
        </div>
      </div>

      {/* Delete button - hidden in reorder mode */}
      {!reorderMode && (
        <button
          onClick={() => onDelete(item.id)}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-1"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
