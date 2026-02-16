# Kitchen Cupboard API Reference

Kitchen Cupboard exposes a REST API for programmatic access, designed for AI agents and integrations.

Interactive docs are available at `/api/docs` (Swagger UI) and `/api/redoc` (ReDoc) when the server is running.

## Authentication

All API endpoints (except health check and login/register) require authentication via Bearer token.

**Two authentication methods:**

| Method | Format | Use Case |
|--------|--------|----------|
| JWT Token | `Bearer eyJhbG...` | Web UI login sessions |
| API Key | `Bearer kc_xxxxx` | External integrations, AI agents |

```
Authorization: Bearer <token>
```

### Getting a JWT Token

```
POST /api/auth/login
Content-Type: application/json

{
  "username": "your_username",
  "password": "your_password"
}
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "username": "your_username",
    "email": "you@example.com",
    "display_name": "Your Name",
    "is_admin": false,
    "is_active": true,
    "created_at": "2025-01-01T00:00:00"
  }
}
```

### Creating an API Key

API keys are created via the web UI (Settings > API Keys) or the API:

```
POST /api/auth/api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "My AI Agent",
  "scopes": "read,write"
}
```

Response (the full key is only shown once):
```json
{
  "id": "uuid",
  "name": "My AI Agent",
  "key_prefix": "kc_AbCdEfGh",
  "key": "kc_AbCdEfGhIjKlMnOpQrStUvWxYz123456789abc",
  "scopes": "read,write",
  "is_active": true,
  "last_used": null,
  "created_at": "2025-01-01T00:00:00"
}
```

---

## AI Context Endpoint

Inspired by the [ClawBridge](https://github.com/finalbillybong/ClawBridge) API, Kitchen Cupboard provides an AI-friendly context endpoint:

```
GET /api/context
```

Returns a structured summary of all API capabilities, authentication methods, and available endpoints — ideal for AI agents to understand what actions are available.

---

## Endpoints

### Health Check

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/` | No | Health check and version info |
| `GET` | `/api/context` | No | AI-friendly API context |

### Authentication & Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | No | Register new account |
| `POST` | `/api/auth/login` | No | Login, returns JWT |
| `GET` | `/api/auth/me` | Yes | Get current user |
| `PUT` | `/api/auth/me` | Yes | Update profile |
| `POST` | `/api/auth/change-password` | Yes | Change password |
| `POST` | `/api/auth/api-keys` | Yes | Create API key |
| `GET` | `/api/auth/api-keys` | Yes | List API keys |
| `DELETE` | `/api/auth/api-keys/{id}` | Yes | Delete API key |

### Shopping Lists

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/lists` | Yes | Get user's lists |
| `POST` | `/api/lists` | Yes | Create a new list |
| `GET` | `/api/lists/{id}` | Yes | Get list details |
| `PUT` | `/api/lists/{id}` | Yes | Update a list |
| `DELETE` | `/api/lists/{id}` | Yes | Delete list (owner only) |
| `POST` | `/api/lists/{id}/share` | Yes | Share with a user |
| `DELETE` | `/api/lists/{id}/share/{user_id}` | Yes | Remove a member |

#### Create a list

```
POST /api/lists
Content-Type: application/json

{
  "name": "Weekly Groceries",
  "description": "Shopping for the week",
  "color": "#22c55e"
}
```

#### Share a list

```
POST /api/lists/{id}/share
Content-Type: application/json

{
  "username": "partner",
  "role": "editor"
}
```

Roles: `editor` (can add/edit/check items), `viewer` (read-only)

### List Items

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/lists/{id}/items` | Yes | Get all items in a list |
| `POST` | `/api/lists/{id}/items` | Yes | Add item to list |
| `PUT` | `/api/lists/{id}/items/{item_id}` | Yes | Update an item |
| `DELETE` | `/api/lists/{id}/items/{item_id}` | Yes | Remove an item |
| `POST` | `/api/lists/{id}/items/clear-checked` | Yes | Clear all checked items |

#### Add an item

```
POST /api/lists/{list_id}/items
Content-Type: application/json

{
  "name": "Milk",
  "quantity": 2,
  "unit": "litres",
  "category_id": "uuid-of-dairy-category",
  "notes": "Semi-skimmed"
}
```

**Category auto-assignment:** If `category_id` is omitted, the app checks if this item name has been used before and automatically assigns the most-used category. For example, if "Milk" was previously added under "Dairy" three times, it will auto-assign to Dairy.

#### Check/uncheck an item

```
PUT /api/lists/{list_id}/items/{item_id}
Content-Type: application/json

{
  "checked": true
}
```

### Categories

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/categories` | Yes | List all categories |
| `POST` | `/api/categories` | Yes | Create custom category |
| `PUT` | `/api/categories/{id}` | Yes | Update a category |
| `DELETE` | `/api/categories/{id}` | Yes | Delete (custom only) |

Default categories: Fruit & Veg, Dairy, Meat & Fish, Bakery, Frozen, Drinks, Snacks, Household, Personal Care, Tinned & Jars, Pasta & Rice, Condiments, Other.

#### Create a custom category

```
POST /api/categories
Content-Type: application/json

{
  "name": "Pet Supplies",
  "color": "#f97316",
  "sort_order": 15
}
```

### Item Suggestions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/suggestions?q={query}` | Yes | Search item history |

Returns previously used item names with their most common category, useful for autocomplete.

```
GET /api/suggestions?q=mil
```

```json
[
  {
    "name": "Milk",
    "category_id": "uuid",
    "category_name": "Dairy",
    "usage_count": 5
  },
  {
    "name": "Mildred's Oat Drink",
    "category_id": "uuid",
    "category_name": "Drinks",
    "usage_count": 2
  }
]
```

### WebSocket (Real-time Updates)

```
WS /ws/{list_id}?token={jwt_token}
```

Receive real-time updates when other users modify a list. Messages are JSON:

```json
{
  "type": "item_added",
  "list_id": "uuid",
  "data": { /* full item object */ },
  "user_id": "uuid",
  "username": "partner"
}
```

Message types: `item_added`, `item_updated`, `item_checked`, `item_removed`, `checked_cleared`

### Admin Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/auth/users` | Admin | List all users |
| `PUT` | `/api/auth/users/{id}/toggle-active` | Admin | Enable/disable user |
| `POST` | `/api/auth/invite-codes` | Admin | Generate invite code |
| `GET` | `/api/auth/invite-codes` | Admin | List invite codes |

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | Deleted (no content) |
| 400 | Bad request / validation error |
| 401 | Not authenticated |
| 403 | Forbidden (no permission) |
| 404 | Not found |

---

## Example: AI Agent Workflow

```python
import requests

BASE = "https://your-domain.com"
HEADERS = {"Authorization": "Bearer kc_your_api_key_here"}

# 1. Get available lists
lists = requests.get(f"{BASE}/api/lists", headers=HEADERS).json()

# 2. Add items to a list
list_id = lists[0]["id"]
requests.post(
    f"{BASE}/api/lists/{list_id}/items",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={"name": "Bananas", "quantity": 6, "unit": ""},
)

# 3. Check off an item
items = requests.get(f"{BASE}/api/lists/{list_id}/items", headers=HEADERS).json()
item_id = items[0]["id"]
requests.put(
    f"{BASE}/api/lists/{list_id}/items/{item_id}",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={"checked": True},
)
```
