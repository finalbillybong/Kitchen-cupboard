# Kitchen Cupboard API Reference

Kitchen Cupboard exposes a REST API for AI agents, scripts, and integrations.

## Discovery

| URL | Purpose |
|---|---|
| `/api/` | Health check and links to all documentation |
| `/api/context` | Complete machine-readable operation and authentication index |
| `/api/agent-guide` | Plain-text agent quick start |
| `/api/openapi.json` | Canonical OpenAPI contract |
| `/api/docs` | Interactive Swagger UI |
| `/api/redoc` | ReDoc interface |

The live OpenAPI contract is generated from the registered application routes. Each operation includes an `x-kitchen-cupboard-auth` object stating whether it is public, JWT-only, or available to API keys and which scope it requires.

## API-key quick start

Create a key while signed in at **Settings > API Keys**. The complete key is shown once; the prefix displayed later is not a usable credential.

An API key is not a username or password and must not be sent to `/api/auth/login`. Send it directly to resource endpoints:

```http
Authorization: Bearer kc_your_full_api_key
```

```bash
BASE="http://192.168.x.x:8111"
API_KEY="kc_your_full_key"

# Discover available operations
curl -s "$BASE/api/context" | jq

# List every list visible to the key owner
curl -s -H "Authorization: Bearer $API_KEY" "$BASE/api/lists" | jq

# Add an item using an ID returned by the previous request
curl -s -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Milk","quantity":2,"unit":"pints"}' \
  "$BASE/api/lists/{list_id}/items" | jq
```

API keys act as the user who created them and can access only that user's owned or shared lists. List roles still apply: viewers cannot mutate a list, editors can modify it, and only owners can share or delete it.

Scopes:

- `read` permits resource GET requests and read-only WebSocket subscriptions.
- `read,write` additionally permits resource POST, PUT, and DELETE requests.
- API keys never permit profile, password, API-key management, invitation, or administrator operations.

## Complete endpoint index

### Discovery and registration policy

| Method | Endpoint | Authentication | Description |
|---|---|---|---|
| `GET` | `/api/` | Public | Health and documentation links |
| `GET` | `/api/registration-status` | Public | Registration and invitation policy |
| `GET` | `/api/context` | Public | Machine-readable agent capability index |
| `GET` | `/api/agent-guide` | Public | Plain-text agent guide |

### Authentication and account management

| Method | Endpoint | Authentication | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a user; an invite may be required |
| `POST` | `/api/auth/login` | Public, username/password body | Return an access JWT and set a refresh cookie |
| `POST` | `/api/auth/refresh` | Refresh cookie | Rotate the refresh cookie and return a new JWT |
| `POST` | `/api/auth/logout` | Public | Clear the refresh cookie |
| `GET` | `/api/auth/me` | JWT only | Return the signed-in user |
| `PUT` | `/api/auth/me` | JWT only | Update the signed-in user |
| `POST` | `/api/auth/change-password` | JWT only | Change the signed-in user's password |
| `GET` | `/api/auth/api-keys` | JWT only | List the user's key metadata; full keys are never returned |
| `POST` | `/api/auth/api-keys` | JWT only | Create a `read` or `read,write` key |
| `DELETE` | `/api/auth/api-keys/{key_id}` | JWT only | Revoke one of the user's keys |
| `GET` | `/api/auth/invite-codes` | Administrator JWT | List invitation codes |
| `POST` | `/api/auth/invite-codes` | Administrator JWT | Create an invitation code |
| `DELETE` | `/api/auth/invite-codes/{code_id}` | Administrator JWT | Revoke an unused invitation code |
| `GET` | `/api/auth/users` | Administrator JWT | List users |
| `PUT` | `/api/auth/users/{user_id}/toggle-active` | Administrator JWT | Enable or disable a user |
| `DELETE` | `/api/auth/users/{user_id}` | Administrator JWT | Delete a user |

### Shopping lists

| Method | Endpoint | API-key scope | Additional permission |
|---|---|---|---|
| `GET` | `/api/lists` | `read` | Returns owned and shared lists |
| `POST` | `/api/lists` | `write` | Creates a list owned by the key owner |
| `GET` | `/api/lists/{list_id}` | `read` | Owner, editor, or viewer |
| `PUT` | `/api/lists/{list_id}` | `write` | Owner or editor |
| `DELETE` | `/api/lists/{list_id}` | `write` | Owner only |
| `POST` | `/api/lists/{list_id}/share` | `write` | Owner only |
| `DELETE` | `/api/lists/{list_id}/share/{user_id}` | `write` | Owner only |

Create a list:

```json
{
  "name": "Weekly Groceries",
  "description": "Shopping for the week",
  "color": "#22c55e",
  "icon": "shopping-cart"
}
```

Share a list using `role` `editor` or `viewer`:

```json
{"username":"partner","role":"editor"}
```

### List items

| Method | Endpoint | API-key scope | Description |
|---|---|---|---|
| `GET` | `/api/lists/{list_id}/items` | `read` | Get every item in the list |
| `POST` | `/api/lists/{list_id}/items` | `write` | Add an item |
| `PUT` | `/api/lists/{list_id}/items/{item_id}` | `write` | Edit or check/uncheck an item |
| `DELETE` | `/api/lists/{list_id}/items/{item_id}` | `write` | Remove an item |
| `POST` | `/api/lists/{list_id}/items/reorder` | `write` | Replace item sort order using `item_ids` |
| `POST` | `/api/lists/{list_id}/items/clear-checked` | `write` | Delete all checked items or a captured set |
| `POST` | `/api/lists/{list_id}/items/import-recipe/preview` | `write` | Parse a recipe URL without adding items |
| `POST` | `/api/lists/{list_id}/items/import-recipe` | `write` | Parse a recipe URL and add its ingredients |

Create an item:

```json
{
  "id": "optional-client-generated-uuid",
  "name": "Milk",
  "quantity": 2,
  "unit": "litres",
  "category_id": "optional-category-uuid",
  "notes": "Semi-skimmed",
  "sort_order": 0
}
```

When `id` is supplied, retrying the same create against the same list returns the existing item. Reusing that UUID in a different list returns `409`. If `category_id` is omitted, Kitchen Cupboard uses remembered category history when possible.

Update requests contain only changed fields. For example:

```json
{"checked":true}
```

Reorder items:

```json
{"item_ids":["first-item-uuid","second-item-uuid"]}
```

Clear a captured set of checked items, or omit the body to clear every currently checked item:

```json
{"item_ids":["checked-item-uuid"]}
```

Preview or import a recipe:

```json
{"url":"https://example.com/recipe"}
```

### Categories, suggestions, and favourites

| Method | Endpoint | API-key scope | Description |
|---|---|---|---|
| `GET` | `/api/categories` | `read` | List default and custom categories |
| `POST` | `/api/categories` | `write` | Create a custom category |
| `PUT` | `/api/categories/{category_id}` | `write` | Update a category created by this user |
| `DELETE` | `/api/categories/{category_id}` | `write` | Delete a category created by this user |
| `GET` | `/api/suggestions?q={query}` | `read` | Search remembered items and categories |
| `GET` | `/api/favourites?limit={limit}` | `read` | Return frequently used items |

Default categories cannot be modified or deleted. A custom category can be changed only by its creator.

Create a category:

```json
{"name":"Pet Supplies","icon":"tag","color":"#f97316","sort_order":15}
```

### WebSocket updates

Connect to `WS /ws/{list_id}` and send authentication as the first message so the credential is not exposed in query-string logs:

```json
{"type":"auth","token":"kc_your_full_api_key"}
```

A JWT or API key with `read` scope is accepted. The authenticated user must have access to the list. The server responds with `{"type":"auth_ok"}` and then publishes item/list events. Send the text `ping` to receive `pong`.

## Status codes

| Code | Meaning |
|---|---|
| `200` | Successful read or update |
| `201` | Resource created |
| `204` | Resource deleted; no response body |
| `400` | Request violates an application rule |
| `401` | Credentials are missing, invalid, expired, revoked, or not accepted by this endpoint |
| `403` | API-key scope, list role, owner, or administrator permission is missing |
| `404` | Resource does not exist or is deliberately hidden from this user |
| `409` | Client-supplied item UUID belongs to another list |
| `422` | Request data failed validation or referenced category does not exist |

Error bodies use FastAPI's `detail` field:

```json
{"detail":"API key missing required scope: write"}
```

Validation failures use an array in the same `detail` field. Refer to `/api/openapi.json` for exact request and response schemas.
