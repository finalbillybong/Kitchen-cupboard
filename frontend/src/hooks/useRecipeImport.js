import { useState } from 'react';
import api from '../api/client';

export function useRecipeImport(listId) {
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [recipeUrl, setRecipeUrl] = useState('');
  const [recipePreview, setRecipePreview] = useState(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recipeError, setRecipeError] = useState('');
  const [recipeImporting, setRecipeImporting] = useState(false);

  const openRecipeModal = () => setShowRecipeModal(true);

  const closeRecipeModal = () => {
    setShowRecipeModal(false);
    setRecipeUrl('');
    setRecipePreview(null);
    setRecipeError('');
  };

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
      closeRecipeModal();
      return result.items;
    } catch (err) {
      setRecipeError(err.message || 'Failed to import recipe');
      return null;
    } finally {
      setRecipeImporting(false);
    }
  };

  return {
    showRecipeModal,
    recipeUrl,
    setRecipeUrl,
    recipePreview,
    recipeLoading,
    recipeError,
    recipeImporting,
    openRecipeModal,
    closeRecipeModal,
    handleRecipePreview,
    handleRecipeImport,
  };
}
