import { configureOutbox, enqueueMutation } from '../offline/outbox';

const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && !options._isRetry) {
      // Try refreshing the token before giving up
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.token}`;
        const retry = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
          _isRetry: true,
        });
        if (retry.status !== 401) {
          if (retry.status === 204) return null;
          const retryData = await retry.json().catch(() => null);
          if (retry.ok) return retryData;
          const msg = retryData?.detail || 'Request failed';
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
      }
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Unauthorized');
    } else if (response.status === 401) {
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (response.status === 204) {
      return null;
    }

    // Service worker queued this mutation for offline replay
    if (response.status === 202) {
      let data;
      try { data = await response.json(); } catch { /* ignore */ }
      if (data?.queued) {
        return { _offlineQueued: true };
      }
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Server error (${response.status})`);
    }

    if (!response.ok) {
      const message = typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map(e => e.msg || e).join(', ')
          : 'Request failed';
      const error = new Error(message);
      error.status = response.status;
      error.detail = data.detail;
      throw error;
    }

    return data;
  }

  async tryRefresh() {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.setToken(data.access_token);
      return true;
    } catch {
      return false;
    }
  }

  async logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch { /* ignore */ }
    this.setToken(null);
  }

  // Auth
  login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  register(username, email, password, displayName, inviteCode) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username,
        email,
        password,
        display_name: displayName,
        invite_code: inviteCode,
      }),
    });
  }

  getMe() {
    return this.request('/auth/me');
  }

  updateMe(data) {
    return this.request('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  changePassword(currentPassword, newPassword) {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
  }

  // API Keys
  getApiKeys() {
    return this.request('/auth/api-keys');
  }

  createApiKey(name, scopes) {
    return this.request('/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name, scopes }),
    });
  }

  deleteApiKey(id) {
    return this.request(`/auth/api-keys/${id}`, { method: 'DELETE' });
  }

  // Invite codes
  createInviteCode() {
    return this.request('/auth/invite-codes', { method: 'POST' });
  }

  getInviteCodes() {
    return this.request('/auth/invite-codes');
  }

  deleteInviteCode(codeId) {
    return this.request(`/auth/invite-codes/${codeId}`, { method: 'DELETE' });
  }

  // Users (admin)
  getUsers() {
    return this.request('/auth/users');
  }

  toggleUserActive(userId) {
    return this.request(`/auth/users/${userId}/toggle-active`, { method: 'PUT' });
  }

  deleteUser(userId) {
    return this.request(`/auth/users/${userId}`, { method: 'DELETE' });
  }

  // Lists
  getLists(includeArchived = false) {
    return this.request(`/lists?include_archived=${includeArchived}`);
  }

  getList(id) {
    return this.request(`/lists/${id}`);
  }

  createList(data) {
    return this.request('/lists', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateList(id, data) {
    return this.request(`/lists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  deleteList(id) {
    return this.request(`/lists/${id}`, { method: 'DELETE' });
  }

  shareList(listId, username, role) {
    return this.request(`/lists/${listId}/share`, {
      method: 'POST',
      body: JSON.stringify({ username, role }),
    });
  }

  unshareList(listId, userId) {
    return this.request(`/lists/${listId}/share/${userId}`, { method: 'DELETE' });
  }

  // Items
  getItems(listId) {
    return this.request(`/lists/${listId}/items`);
  }

  createItem(listId, data) {
    return enqueueMutation({
      path: `/lists/${listId}/items`,
      method: 'POST',
      body: data,
      entityId: data.id,
      summary: `Add “${data.name}”`,
    });
  }

  updateItem(listId, itemId, data) {
    return enqueueMutation({
      path: `/lists/${listId}/items/${itemId}`,
      method: 'PUT',
      body: data,
      entityId: itemId,
      summary: data.checked === undefined ? 'Edit item' : `${data.checked ? 'Complete' : 'Restore'} item`,
    });
  }

  deleteItem(listId, itemId) {
    return enqueueMutation({
      path: `/lists/${listId}/items/${itemId}`,
      method: 'DELETE',
      entityId: itemId,
      summary: 'Delete item',
    });
  }

  clearChecked(listId, itemIds) {
    return enqueueMutation({
      path: `/lists/${listId}/items/clear-checked`,
      method: 'POST',
      body: { item_ids: itemIds },
      entityIds: itemIds,
      summary: `Clear ${itemIds.length} completed item${itemIds.length === 1 ? '' : 's'}`,
    });
  }

  reorderItems(listId, itemIds) {
    return enqueueMutation({
      path: `/lists/${listId}/items/reorder`,
      method: 'POST',
      body: { item_ids: itemIds },
      entityIds: itemIds,
      summary: 'Reorder items',
    });
  }

  // Recipe Import
  previewRecipeImport(listId, url) {
    return this.request(`/lists/${listId}/items/import-recipe/preview`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  importRecipe(listId, url) {
    return this.request(`/lists/${listId}/items/import-recipe`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  // Categories
  getCategories() {
    return this.request('/categories');
  }

  createCategory(data) {
    return this.request('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateCategory(id, data) {
    return this.request(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  deleteCategory(id) {
    return this.request(`/categories/${id}`, { method: 'DELETE' });
  }

  // Suggestions
  getSuggestions(query) {
    return this.request(`/suggestions?q=${encodeURIComponent(query)}`);
  }

  // Favourites
  getFavourites(limit = 20) {
    return this.request(`/favourites?limit=${limit}`);
  }

  // Global library. Successful reads are cached so the library remains
  // browsable while disconnected; mutations are deliberately handled by the
  // UI only while online, except idempotent add-to-list commits.
  async cachedLibraryRead(path, cacheKey) {
    try {
      const data = await this.request(path);
      localStorage.setItem(`kc-library-${cacheKey}`, JSON.stringify(data));
      return data;
    } catch (error) {
      const cached = localStorage.getItem(`kc-library-${cacheKey}`);
      if (cached && (typeof navigator === 'undefined' || !navigator.onLine || error instanceof TypeError)) {
        return JSON.parse(cached);
      }
      throw error;
    }
  }

  getIngredients(query = '', includeArchived = false) {
    const suffix = `?q=${encodeURIComponent(query)}&include_archived=${includeArchived}`;
    return this.cachedLibraryRead(`/ingredients${suffix}`, `ingredients-${query}-${includeArchived}`);
  }

  createIngredient(data) {
    return this.request('/ingredients', { method: 'POST', body: JSON.stringify(data) });
  }

  updateIngredient(id, data) {
    return this.request(`/ingredients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  archiveIngredient(id, expectedVersion) {
    return this.request(`/ingredients/${id}`, {
      method: 'DELETE', body: JSON.stringify({ expected_version: expectedVersion }),
    });
  }

  restoreIngredient(id, expectedVersion) {
    return this.request(`/ingredients/${id}/restore`, {
      method: 'POST', body: JSON.stringify({ expected_version: expectedVersion }),
    });
  }

  getMeals(query = '', includeArchived = false) {
    const suffix = `?q=${encodeURIComponent(query)}&include_archived=${includeArchived}`;
    return this.cachedLibraryRead(`/meals${suffix}`, `meals-${query}-${includeArchived}`);
  }

  createMeal(data) {
    return this.request('/meals', { method: 'POST', body: JSON.stringify(data) });
  }

  updateMeal(id, data) {
    return this.request(`/meals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  archiveMeal(id, expectedVersion) {
    return this.request(`/meals/${id}`, {
      method: 'DELETE', body: JSON.stringify({ expected_version: expectedVersion }),
    });
  }

  restoreMeal(id, expectedVersion) {
    return this.request(`/meals/${id}/restore`, {
      method: 'POST', body: JSON.stringify({ expected_version: expectedVersion }),
    });
  }

  previewMeal(id, listId, targetServings) {
    return this.request(`/meals/${id}/preview`, {
      method: 'POST', body: JSON.stringify({ list_id: listId, target_servings: targetServings }),
    });
  }

  commitMeal(id, data, projection) {
    return enqueueMutation({
      path: `/meals/${id}/commit`, method: 'POST', body: data, projection,
      entityIds: projection.map((row) => row.existing_item_id || `pending-${data.request_id}-${row.source_row_id}`),
      summary: `Add meal ingredients to a list`,
    });
  }

  previewMealRecipe(url, baseServings = 1) {
    return this.request('/meals/import-recipe/preview', {
      method: 'POST', body: JSON.stringify({ url, base_servings: baseServings }),
    });
  }

  createMealFromRecipe(url, baseServings = 1) {
    return this.request('/meals/import-recipe', {
      method: 'POST', body: JSON.stringify({ url, base_servings: baseServings }),
    });
  }

  getBasics(includeArchived = false) {
    return this.cachedLibraryRead(
      `/basics?include_archived=${includeArchived}`, `basics-${includeArchived}`,
    );
  }

  createBasicsItem(data) {
    return this.request('/basics/items', { method: 'POST', body: JSON.stringify(data) });
  }

  updateBasicsItem(id, data) {
    return this.request(`/basics/items/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  archiveBasicsItem(id, expectedVersion) {
    return this.request(`/basics/items/${id}`, {
      method: 'DELETE', body: JSON.stringify({ expected_version: expectedVersion }),
    });
  }

  restoreBasicsItem(id, expectedVersion) {
    return this.request(`/basics/items/${id}/restore`, {
      method: 'POST', body: JSON.stringify({ expected_version: expectedVersion }),
    });
  }

  reorderBasics(itemIds, expectedVersion) {
    return this.request('/basics/reorder', {
      method: 'POST', body: JSON.stringify({ item_ids: itemIds, expected_version: expectedVersion }),
    });
  }

  previewBasics(listId, targetServings = 1) {
    return this.request('/basics/preview', {
      method: 'POST', body: JSON.stringify({ list_id: listId, target_servings: targetServings }),
    });
  }

  commitBasics(data, projection) {
    return enqueueMutation({
      path: '/basics/commit', method: 'POST', body: data, projection,
      entityIds: projection.map((row) => row.existing_item_id || `pending-${data.request_id}-${row.source_row_id}`),
      summary: 'Add Basics items to a list',
    });
  }
}

export const api = new ApiClient();
configureOutbox({
  getToken: () => api.token,
  refresh: () => api.tryRefresh(),
});
export default api;
