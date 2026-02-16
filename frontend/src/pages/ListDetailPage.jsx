import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import Modal from '../components/Modal';
import {
  ArrowLeft, Plus, Trash2, Check, X, Settings2,
  ChevronDown, ChevronRight, MoreHorizontal, UserPlus, Archive, Search,
  GripVertical, Star, ArrowUpDown, BookOpen, Loader2, ExternalLink,
} from 'lucide-react';

export default function ListDetailPage() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add item
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemCat, setNewItemCat] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const addInputRef = useRef(null);

  // Modals
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [shareUsername, setShareUsername] = useState('');
  const [shareRole, setShareRole] = useState('editor');

  // Edit item modal (long press)
  const [editItem, setEditItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', quantity: '1', unit: '', category_id: '', notes: '',
  });

  // Collapsed categories
  const [collapsed, setCollapsed] = useState({});

  // Reorder mode
  const [reorderMode, setReorderMode] = useState(false);

  // Drag and drop
  const dragItem = useRef(null);
  const dragGroupId = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const itemsContainerRef = useRef(null);

  // Recipe import
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [recipeUrl, setRecipeUrl] = useState('');
  const [recipePreview, setRecipePreview] = useState(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeError, setRecipeError] = useState('');
  const [recipeImporting, setRecipeImporting] = useState(false);

  // Favourites
  const [favourites, setFavourites] = useState([]);
  const [showFavourites, setShowFavourites] = useState(false);

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

  // Suggestions
  useEffect(() => {
    if (newItemName.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api.getSuggestions(newItemName);
        setSuggestions(data);
      } catch (e) {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [newItemName]);

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    try {
      const item = await api.createItem(listId, {
        name: newItemName.trim(),
        quantity: parseFloat(newItemQty) || 1,
        unit: newItemUnit,
        category_id: newItemCat || null,
      });
      setItems((prev) => [...prev, item]);
      setNewItemName('');
      setNewItemQty('1');
      setNewItemUnit('');
      setNewItemCat('');
      setSuggestions([]);
      setShowAdvanced(false);
      addInputRef.current?.focus();
    } catch (e) {
      alert(e.message);
    }
  };

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

  const handleShare = async (e) => {
    e.preventDefault();
    try {
      await api.shareList(listId, shareUsername, shareRole);
      setShareUsername('');
      setShowShareModal(false);
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await api.unshareList(listId, userId);
      fetchData();
    } catch (e) {
      alert(e.message);
    }
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

  const applySuggestion = (suggestion) => {
    setNewItemName(suggestion.name);
    if (suggestion.category_id) setNewItemCat(suggestion.category_id);
    setSuggestions([]);
    addInputRef.current?.focus();
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

  // ─── Live Drag Reorder ─────────────────────────────────────────
  // Immediately moves the dragged item to the target position in state,
  // so the list visually rearranges as you drag.
  const liveDragReorder = useCallback((targetItemId, groupId) => {
    const draggedId = dragItem.current;
    if (!draggedId || draggedId === targetItemId) return;

    setItems((prev) => {
      const groupItems = prev
        .filter((i) => !i.checked && (i.category_id || 'uncategorized') === groupId)
        .sort((a, b) => a.sort_order - b.sort_order || new Date(a.created_at) - new Date(b.created_at));

      const fromIdx = groupItems.findIndex((i) => i.id === draggedId);
      const toIdx = groupItems.findIndex((i) => i.id === targetItemId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;

      const reordered = [...groupItems];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);

      const orderMap = {};
      reordered.forEach((item, idx) => { orderMap[item.id] = idx; });

      return prev.map((item) =>
        orderMap[item.id] !== undefined ? { ...item, sort_order: orderMap[item.id] } : item
      );
    });
  }, []);

  const handleDragStart = (e, item, groupId) => {
    dragItem.current = item.id;
    dragGroupId.current = groupId;
    setDraggingId(item.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };

  const handleDragEnter = (e, item, groupId) => {
    e.preventDefault();
    liveDragReorder(item.id, groupId);
  };

  const handleDragEnd = () => {
    // Persist the current order to backend
    const groupId = dragGroupId.current;
    if (groupId) {
      setItems((currentItems) => {
        const groupItems = currentItems
          .filter((i) => !i.checked && (i.category_id || 'uncategorized') === groupId)
          .sort((a, b) => a.sort_order - b.sort_order);
        const itemIds = groupItems.map((i) => i.id);
        api.reorderItems(listId, itemIds).catch(console.error);
        return currentItems;
      });
    }

    dragItem.current = null;
    dragGroupId.current = null;
    setDraggingId(null);
  };

  // Touch-based drag and drop (reorder mode)
  useEffect(() => {
    if (!reorderMode) return;
    const container = itemsContainerRef.current;
    if (!container) return;

    let touchDragId = null;
    let lastHoverId = null;

    const handleTouchStart = (e) => {
      const grip = e.target.closest('[data-drag-handle]');
      if (!grip) return;
      const row = grip.closest('[data-item-id]');
      if (!row) return;

      touchDragId = row.dataset.itemId;
      lastHoverId = null;
      dragItem.current = touchDragId;
      dragGroupId.current = row.dataset.groupId;
      setDraggingId(touchDragId);
    };

    const handleTouchMove = (e) => {
      if (!touchDragId) return;
      e.preventDefault();

      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const row = el?.closest('[data-item-id]');

      if (row && row.dataset.itemId !== touchDragId && row.dataset.itemId !== lastHoverId) {
        lastHoverId = row.dataset.itemId;
        liveDragReorder(row.dataset.itemId, row.dataset.groupId);
      }
    };

    const handleTouchEnd = () => {
      if (!touchDragId) return;

      // Persist
      const groupId = dragGroupId.current;
      if (groupId) {
        setItems((currentItems) => {
          const groupItems = currentItems
            .filter((i) => !i.checked && (i.category_id || 'uncategorized') === groupId)
            .sort((a, b) => a.sort_order - b.sort_order);
          const itemIds = groupItems.map((i) => i.id);
          api.reorderItems(listId, itemIds).catch(console.error);
          return currentItems;
        });
      }

      touchDragId = null;
      lastHoverId = null;
      dragItem.current = null;
      dragGroupId.current = null;
      setDraggingId(null);
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [reorderMode, liveDragReorder, listId]);

  // ─── Quick Add (favourites) ─────────────────────────────────────
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

  // ─── Recipe Import ──────────────────────────────────────────────
  const handleRecipePreview = async (e) => {
    e.preventDefault();
    if (!recipeUrl.trim()) return;
    setRecipeError('');
    setRecipePreview(null);
    setRecipeLoading(true);
    try {
      const preview = await api.previewRecipeImport(listId, recipeUrl.trim());
      setRecipePreview(preview);
    } catch (err) {
      setRecipeError(err.message || 'Failed to fetch recipe');
    } finally {
      setRecipeLoading(false);
    }
  };

  const handleRecipeImport = async () => {
    setRecipeImporting(true);
    setRecipeError('');
    try {
      const result = await api.importRecipe(listId, recipeUrl.trim());
      setItems((prev) => [...prev, ...result.items]);
      setShowRecipeModal(false);
      setRecipeUrl('');
      setRecipePreview(null);
    } catch (err) {
      setRecipeError(err.message || 'Failed to import recipe');
    } finally {
      setRecipeImporting(false);
    }
  };

  const closeRecipeModal = () => {
    setShowRecipeModal(false);
    setRecipeUrl('');
    setRecipePreview(null);
    setRecipeError('');
  };

  // Group items by category
  const groupedItems = () => {
    const unchecked = items.filter((i) => !i.checked);
    const checked = items.filter((i) => i.checked);

    const groups = {};
    for (const item of unchecked) {
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

    const sortedGroups = Object.values(groups).sort((a, b) => {
      if (a.id === 'uncategorized') return 1;
      if (b.id === 'uncategorized') return -1;
      return a.name.localeCompare(b.name);
    });

    return { sortedGroups, checked };
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (!list) return null;

  const { sortedGroups, checked } = groupedItems();
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
          {/* Reorder toggle */}
          <button
            onClick={() => setReorderMode(!reorderMode)}
            className={`p-2 rounded-xl transition-all font-medium text-sm flex items-center gap-1.5 ${
              reorderMode
                ? 'bg-primary-600 text-white shadow-md'
                : 'btn-ghost'
            }`}
            title={reorderMode ? 'Done reordering' : 'Reorder items'}
          >
            <ArrowUpDown className="h-4 w-4" />
            {reorderMode && <span>Done</span>}
          </button>
          <button onClick={() => setShowRecipeModal(true)} className="btn-ghost p-2" title="Import recipe">
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
      {reorderMode && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 text-sm font-medium flex items-center gap-2">
          <GripVertical className="h-4 w-4 flex-shrink-0" />
          Drag items to reorder. Tap <strong>Done</strong> when finished.
        </div>
      )}

      {/* Add Item Form */}
      {!reorderMode && (
        <form onSubmit={handleAddItem} className="card p-3 mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={addInputRef}
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
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
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
                className="input w-20"
                placeholder="Qty"
                min="0"
                step="any"
              />
              <input
                type="text"
                value={newItemUnit}
                onChange={(e) => setNewItemUnit(e.target.value)}
                className="input w-24"
                placeholder="Unit"
              />
              <select
                value={newItemCat}
                onChange={(e) => setNewItemCat(e.target.value)}
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
      )}

      {/* Favourites / Quick Add */}
      {!reorderMode && availableFavourites.length > 0 && (
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
              {availableFavourites.slice(0, 12).map((fav, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickAdd(fav)}
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
      )}

      {/* Items grouped by category */}
      {sortedGroups.length === 0 && checked.length === 0 ? (
        <div className="text-center py-16">
          <Search className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500">No items yet. Add something above!</p>
        </div>
      ) : (
        <div className="space-y-4" ref={itemsContainerRef}>
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
                      reorderMode={reorderMode}
                      onDragStart={reorderMode ? handleDragStart : undefined}
                      onDragEnter={reorderMode ? handleDragEnter : undefined}
                      onDragEnd={reorderMode ? handleDragEnd : undefined}
                      isDragging={draggingId === item.id}
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
      <Modal open={showShareModal} onClose={() => setShowShareModal(false)} title="Share List">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Members</h3>
            {list.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="font-medium">{m.display_name || m.username}</span>
                  <span className="text-sm text-gray-400 ml-2">@{m.username}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-gray-100 dark:bg-navy-800 text-gray-500 px-2 py-1 rounded-lg">
                    {m.role}
                  </span>
                  {isOwner && m.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="text-red-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isOwner && (
            <form onSubmit={handleShare} className="border-t border-gray-100 dark:border-navy-800 pt-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Add member</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUsername}
                  onChange={(e) => setShareUsername(e.target.value)}
                  className="input flex-1"
                  placeholder="Username"
                  required
                />
                <select
                  value={shareRole}
                  onChange={(e) => setShareRole(e.target.value)}
                  className="input w-28"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button type="submit" className="btn-primary">Add</button>
              </div>
            </form>
          )}
        </div>
      </Modal>

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
      <Modal open={showRecipeModal} onClose={closeRecipeModal} title="Import from Recipe">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Paste a recipe URL and we'll extract the ingredients. Works with most recipe sites (BBC Good Food, AllRecipes, Jamie Oliver, etc).
          </p>

          <form onSubmit={handleRecipePreview}>
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
                  onClick={closeRecipeModal}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRecipeImport}
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
