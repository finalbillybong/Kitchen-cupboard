# Kitchen Cupboard API Reference

Kitchen Cupboard exposes a REST API for programmatic access, designed for AI agents and integrations.

Interactive docs are available at `/api/docs` (Swagger UI) and `/api/redoc` (ReDoc) when the server is running.

## AI Quick Start

```bash
# Set your variables
API_KEY="kc_your_key_here"
BASE="http://192.168.x.x:8111"
AUTH="Authorization: Bearer $API_KEY"

# List all shopping lists
curl -s -H "$AUTH" $BASE/api/lists | jq '.[].name'

# Get items from a list
curl -s -H "$AUTH" $BASE/api/lists/{list_id}/items | jq '.[] | {name, checked, category_name}'

# Add an item (auto-categorizes by name, e.g. "milk" → Dairy)
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name": "Milk", "quantity": 2, "unit": "pints"}' \
  $BASE/api/lists/{list_id}/items

# Check off an item
curl -s -X PUT -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"checked": true}' \
  $BASE/api/lists/{list_id}/items/{item_id}

# Delete all checked items
curl -s -X POST -H "$AUTH" $BASE/api/lists/{list_id}/items/clear-checked
```

Create an API key via the web UI: **Settings > API Keys > Create**.

---

## Authentication

All endpoints (except health check, login, and register) require a Bearer token.

| Method | Format | Use Case |
|--------|--------|----------|
| JWT Token | `Bearer eyJhbG...` | Web UI login sessions |
| API Key | `Bearer kc_xxxxx` | AI agents, scripts, external tools |

```
Authorization: Bearer <token>
```

Both token types are interchangeable — use API keys for programmatic access.

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

### API Keys

Create via the web UI (Settings > API Keys) or the API. The full key is only shown once at creation — save it immediately.

```
POST /api/auth/api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{"name": "My AI Agent"}
```

Response:
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

> **Note:** The `scopes` field is stored but not currently enforced — all API keys have full read/write access.

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

## Example: Python AI Agent

```python
import requests

BASE = "http://192.168.x.x:8111"
HEADERS = {"Authorization": "Bearer kc_your_api_key_here"}

# Get all lists
lists = requests.get(f"{BASE}/api/lists", headers=HEADERS).json()
list_id = lists[0]["id"]

# Add items to a list (auto-categorizes by name)
for item in ["Milk", "Bread", "Chicken", "Bananas", "Eggs"]:
    requests.post(
        f"{BASE}/api/lists/{list_id}/items",
        headers=HEADERS,
        json={"name": item},
    )

# Get unchecked items
items = requests.get(f"{BASE}/api/lists/{list_id}/items", headers=HEADERS).json()
unchecked = [i for i in items if not i["checked"]]

# Check off an item by name
milk = next(i for i in items if i["name"].lower() == "milk")
requests.put(
    f"{BASE}/api/lists/{list_id}/items/{milk['id']}",
    headers=HEADERS,
    json={"checked": True},
)

# Get items grouped by category
from itertools import groupby
items.sort(key=lambda x: x["category_name"] or "Uncategorized")
for cat, group in groupby(items, key=lambda x: x["category_name"] or "Uncategorized"):
    print(f"\n{cat}:")
    for item in group:
        status = "x" if item["checked"] else " "
        print(f"  [{status}] {item['name']} ({item['quantity']} {item['unit']})")
```
