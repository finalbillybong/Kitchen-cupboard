import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { usePreferences } from '../hooks/usePreferences';
import { useWebSocket } from '../hooks/useWebSocket';
import { useRecipeImport } from '../hooks/useRecipeImport';
import { useDragReorder } from '../hooks/useDragReorder';
import Modal from '../components/Modal';
import ShareModal from '../components/ShareModal';
import RecipeImportModal from '../components/RecipeImportModal';
import FavouritesBar from '../components/FavouritesBar';
import ItemAddForm from '../components/ItemAddForm';
import PullToRefresh from '../components/PullToRefresh';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import {
  ArrowLeft, Trash2, Check, Settings2,
  ChevronDown, ChevronRight, UserPlus, Archive, Search,
  GripVertical, ArrowUpDown, BookOpen,
} from 'lucide-react';

export default function ListDetailPage() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { prefs, update: updatePref } = usePreferences();
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

  // Save this as default list
  useEffect(() => {
    if (listId && list) {
      updatePref('defaultListId', listId);
    }
  }, [listId, list, updatePref]);

  const ptr = usePullToRefresh(fetchData);

  // Fetch favourites
  useEffect(() => {
    api.getFavourites(15).then(setFavourites).catch(() => {});
  }, []);

  // Auto-clear checked items
  useEffect(() => {
    if (!prefs.autoClearCheckedHours || prefs.autoClearCheckedHours <= 0) return;
    const cutoff = Date.now() - prefs.autoClearCheckedHours * 3600 * 1000;
    const staleChecked = items.filter(
      (i) => i.checked && i.checked_at && new Date(i.checked_at).getTime() < cutoff
    );
    if (staleChecked.length > 0) {
      api.clearChecked(listId).then(() => {
        setItems((prev) => prev.filter((i) => !i.checked));
      }).catch(() => {});
    }
  }, [items, prefs.autoClearCheckedHours, listId]);

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
    if (prefs.confirmBeforeDelete) {
      if (!confirm('Delete this item?')) return;
    }
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
        quantity: prefs.defaultQuantity,
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

  // ─── Sort helper ──────────────────────────────────────────────
  const sortFn = useCallback((a, b) => {
    switch (prefs.sortItemsBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'date':
        return new Date(a.created_at) - new Date(b.created_at);
      case 'category':
        return (a.category_name || 'zzz').localeCompare(b.category_name || 'zzz');
      default: // manual
        return a.sort_order - b.sort_order || new Date(a.created_at) - new Date(b.created_at);
    }
  }, [prefs.sortItemsBy]);

  // Group items by category (memoized)
  const { sortedGroups, flatItems, checked } = useMemo(() => {
    const uncheckedItems = items.filter((i) => !i.checked);
    const checkedItems = items.filter((i) => i.checked);

    // If categories are disabled, return a flat list
    if (!prefs.showCategories) {
      const sorted = [...uncheckedItems].sort(sortFn);
      return { sortedGroups: [], flatItems: sorted, checked: checkedItems };
    }

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
      group.items.sort(sortFn);
    }

    const sorted = Object.values(groups).sort((a, b) => {
      if (a.id === 'uncategorized') return 1;
      if (b.id === 'uncategorized') return -1;
      return a.name.localeCompare(b.name);
    });

    return { sortedGroups: sorted, flatItems: [], checked: checkedItems };
  }, [items, prefs.showCategories, sortFn]);

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

  const hasItems = sortedGroups.length > 0 || flatItems.length > 0 || checked.length > 0;

  const renderItemRow = (item, groupId, isCheckedItem) => (
    <ItemRow
      key={item.id}
      item={item}
      groupId={groupId}
      onToggle={handleToggleCheck}
      onDelete={handleDeleteItem}
      onEdit={openEditModal}
      reorderMode={drag.reorderMode}
      onDragStart={drag.reorderMode ? drag.handleDragStart : undefined}
      onDragEnter={drag.reorderMode ? drag.handleDragEnter : undefined}
      onDragEnd={drag.reorderMode ? drag.handleDragEnd : undefined}
      isDragging={drag.draggingId === item.id}
      isChecked={isCheckedItem}
      tapMode={prefs.tapMode}
      compact={prefs.compactMode}
      vibration={prefs.vibrationFeedback}
      swipeActions={prefs.swipeActions}
    />
  );

  const checkedSection = prefs.sortChecked !== 'hidden' && checked.length > 0 && (
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
          {checked.map((item) => renderItemRow(item, 'checked', true))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PullToRefresh {...ptr} />
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
          defaultQuantity={prefs.defaultQuantity}
        />
      )}

      {/* Favourites / Quick Add */}
      {!drag.reorderMode && (
        <FavouritesBar favourites={availableFavourites} onQuickAdd={handleQuickAdd} />
      )}

      {/* Items */}
      {!hasItems ? (
        <div className="text-center py-16">
          <Search className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500">No items yet. Add something above!</p>
        </div>
      ) : (
        <div className="space-y-4" ref={drag.itemsContainerRef}>
          {/* Checked at top */}
          {prefs.sortChecked === 'top' && checkedSection}

          {/* Flat list (categories disabled) */}
          {!prefs.showCategories && flatItems.length > 0 && (
            <div className="space-y-1">
              {flatItems.map((item) => renderItemRow(item, 'flat', false))}
            </div>
          )}

          {/* Grouped by category */}
          {prefs.showCategories && sortedGroups.map((group) => (
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
                  {group.items.map((item) => renderItemRow(item, group.id, false))}
                </div>
              )}
            </div>
          ))}

          {/* Checked at bottom (default) */}
          {prefs.sortChecked === 'bottom' && checkedSection}
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
  isDragging, isChecked, tapMode, compact, vibration, swipeActions,
}) {
  const longPressTimer = useRef(null);
  const pointerStart = useRef(null);
  const wasLongPress = useRef(false);
  const [pressing, setPressing] = useState(false);

  // Swipe state
  const [swipeX, setSwipeX] = useState(0);
  const swipeStartRef = useRef(null);
  const swipingRef = useRef(false);

  useEffect(() => {
    return () => clearTimeout(longPressTimer.current);
  }, []);

  const handlePointerDown = (e) => {
    if (reorderMode) return;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    wasLongPress.current = false;
    setPressing(true);

    // Start swipe tracking
    if (swipeActions) {
      swipeStartRef.current = { x: e.clientX, y: e.clientY };
      swipingRef.current = false;
    }

    longPressTimer.current = setTimeout(() => {
      wasLongPress.current = true;
      setPressing(false);
      onEdit(item);
      if (vibration && navigator.vibrate) navigator.vibrate(30);
    }, 500);
  };

  const handlePointerMove = (e) => {
    if (!pointerStart.current) return;
    const dx = e.clientX - pointerStart.current.x;
    const dy = Math.abs(e.clientY - pointerStart.current.y);

    // Cancel long press on any movement
    if (Math.abs(dx) > 10 || dy > 10) {
      clearTimeout(longPressTimer.current);
      setPressing(false);
    }

    // Swipe handling
    if (swipeActions && swipeStartRef.current && !wasLongPress.current) {
      const absDx = Math.abs(dx);
      if (absDx > 15 && dy < 30) {
        swipingRef.current = true;
        // Dampen the swipe
        const dampened = dx * 0.5;
        setSwipeX(Math.max(-100, Math.min(100, dampened)));
      }
    }
  };

  const handlePointerUp = () => {
    clearTimeout(longPressTimer.current);
    pointerStart.current = null;
    setPressing(false);

    // Handle swipe completion
    if (swipingRef.current) {
      if (swipeX < -60) {
        // Swipe left → delete
        onDelete(item.id);
      } else if (swipeX > 60) {
        // Swipe right → toggle check
        onToggle(item);
      }
      swipingRef.current = false;
      swipeStartRef.current = null;
      setSwipeX(0);
      return;
    }

    swipeStartRef.current = null;
  };

  const handleContentClick = () => {
    if (reorderMode || swipingRef.current) return;
    // In one-tap mode, a quick tap (not a long press) on the content toggles the check
    if (tapMode === 'one' && !wasLongPress.current) {
      onToggle(item);
    }
  };

  const dragProps = reorderMode && !isChecked ? {
    draggable: true,
    onDragStart: (e) => onDragStart(e, item, groupId),
    onDragEnter: (e) => onDragEnter(e, item, groupId),
    onDragEnd: onDragEnd,
    onDragOver: (e) => e.preventDefault(),
  } : {};

  const py = compact ? 'py-1.5' : 'py-2.5';
  let rowClass = `card px-3 ${py} flex items-center gap-3 group select-none relative overflow-hidden`;
  if (pressing) {
    rowClass += ' long-press-active';
  }
  if (isDragging) {
    rowClass += ' scale-[1.04] shadow-2xl ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/40 z-50 relative';
  }

  const textSize = compact ? 'text-sm' : 'font-medium';
  const subTextSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    <div
      data-item-id={item.id}
      data-group-id={groupId}
      className={rowClass}
      style={{
        ...(isDragging ? { transition: 'none' } : { transition: 'transform 150ms ease, box-shadow 150ms ease' }),
        ...(swipeX !== 0 ? { transform: `translateX(${swipeX}px)`, transition: 'none' } : {}),
      }}
      onContextMenu={(e) => { if (!reorderMode) e.preventDefault(); }}
      {...dragProps}
    >
      {/* Swipe hint backgrounds */}
      {swipeActions && swipeX !== 0 && (
        <>
          {swipeX > 0 && (
            <div className="absolute inset-0 -z-10 flex items-center pl-4 bg-green-500 rounded-2xl">
              <Check className="h-5 w-5 text-white" />
            </div>
          )}
          {swipeX < 0 && (
            <div className="absolute inset-0 -z-10 flex items-center justify-end pr-4 bg-red-500 rounded-2xl">
              <Trash2 className="h-5 w-5 text-white" />
            </div>
          )}
        </>
      )}

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
          className={`flex-shrink-0 ${compact ? 'w-5 h-5' : 'w-6 h-6'} rounded-lg border-2 flex items-center justify-center transition-all ${
            item.checked
              ? 'bg-primary-600 border-primary-600 check-animation'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
          }`}
        >
          {item.checked && <Check className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-white`} />}
        </button>
      )}

      {/* Content area */}
      <div
        className={`flex-1 min-w-0${tapMode === 'one' ? ' cursor-pointer' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleContentClick}
      >
        <div className={`${textSize} ${item.checked ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
          {item.name}
        </div>
        {(!compact || item.quantity !== 1 || item.unit || item.notes) && (
          <div className={`flex items-center gap-2 ${subTextSize} text-gray-400 dark:text-gray-500`}>
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
        )}
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
