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
      throw new Error(message);
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

  // Preferences
  getPreferences() {
    return this.request('/auth/preferences');
  }

  updatePreferences(data) {
    return this.request('/auth/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
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
    return this.request(`/lists/${listId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateItem(listId, itemId, data) {
    return this.request(`/lists/${listId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  deleteItem(listId, itemId) {
    return this.request(`/lists/${listId}/items/${itemId}`, { method: 'DELETE' });
  }

  clearChecked(listId) {
    return this.request(`/lists/${listId}/items/clear-checked`, { method: 'POST' });
  }

  reorderItems(listId, itemIds) {
    return this.request(`/lists/${listId}/items/reorder`, {
      method: 'POST',
      body: JSON.stringify({ item_ids: itemIds }),
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
}

export const api = new ApiClient();
export default api;
