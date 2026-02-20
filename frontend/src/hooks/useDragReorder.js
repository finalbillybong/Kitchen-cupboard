import { useState, useRef, useCallback, useEffect } from 'react';
import api from '../api/client';

export function useDragReorder(listId, setItems) {
  const [reorderMode, setReorderMode] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const dragItem = useRef(null);
  const dragGroupId = useRef(null);
  const itemsContainerRef = useRef(null);

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
  }, [setItems]);

  const persistOrder = useCallback(() => {
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
  }, [listId, setItems]);

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
    persistOrder();
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
      persistOrder();
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
  }, [reorderMode, liveDragReorder, persistOrder, listId]);

  return {
    reorderMode,
    setReorderMode,
    draggingId,
    itemsContainerRef,
    handleDragStart,
    handleDragEnter,
    handleDragEnd,
  };
}
