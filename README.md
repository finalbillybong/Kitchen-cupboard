# Kitchen Cupboard beta

A collaborative shopping list web app built for self-hosting on Docker/Unraid.

## Features

- **Multiple lists** — create and manage separate shopping lists
- **Real-time collaboration** — multiple people can edit the same list simultaneously via WebSocket
- **Smart categories** — items auto-categorize based on history (13 default categories + custom)
- **Item memory** — remembers category assignments so you don't have to re-categorize every time
- **Item suggestions** — autocomplete from previously added items
- **Item editing** — long press any item to edit its name, category, quantity, unit, and notes
- **Drag-and-drop reorder** — toggle reorder mode to rearrange items within each category group; items shift in real-time as you drag
- **Favourites quick-add** — quickly add your most-used items from a favourites bar based on usage history
- **Sharing** — share lists with other users as editor or viewer
- **Dark mode** — automatic or manual toggle
- **Offline support** — Workbox precaches the app shell; item changes are applied instantly and durably replayed from a credential-free browser outbox
- **PWA** — installable on Android and iOS home screens with a chef hat icon
- **Recipe import** — paste a recipe URL and extract ingredients automatically; works with any site using Schema.org JSON-LD (BBC Good Food, AllRecipes, Jamie Oliver, etc)
- **REST API** — documented API with Bearer token auth for AI agents and integrations
- **API keys** — create scoped keys for external tools
- **Invite system** — control registration with invite codes
- **Admin panel** — manage users and invite codes
- **Security hardened** — non-root container, HSTS/CSP headers, refresh token rotation, audit logging, registration rate limiting

## Quick Start (Docker Compose)

1. Clone the repository:
   ```bash
   git clone https://github.com/finalbillybong/Kitchen-cupboard.git
   cd Kitchen-cupboard
   ```

2. Generate and export a secret key:
   ```bash
   export SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
   ```

3. Keep `SECRET_KEY` exported when running Compose, or store it in a Compose `.env` file.

4. Start the app:
   ```bash
   docker compose up -d
   ```

5. Open `http://your-server:8111` in your browser.

6. The **first user to register** automatically becomes admin.

## Unraid Setup

1. Copy `docker-compose.yml` to your Unraid server or use the Docker template.
2. Map the `/app/data` volume to a persistent location (e.g., `/mnt/user/appdata/kitchen-cupboard`).
3. Set environment variables:
   - `SECRET_KEY`: A long random string (required for security)
   - `REGISTRATION_ENABLED`: Set to `false` to require invite codes
   - `CORS_ORIGINS`: Optional comma-separated browser origins for cross-origin agents

## Cloudflare Tunnel

Since this app uses JWT-based authentication with bcrypt password hashing, it's safe to expose via Cloudflare Tunnel. Recommended setup:

1. Create a Cloudflare Tunnel pointing to `http://localhost:8111`
2. Set `REGISTRATION_ENABLED=false` in your environment
3. Create the first admin account, then generate invite codes for other users

For PWA updates, configure a Cloudflare Cache Rule to bypass caching for the exact path `/sw.js`. Purge the existing `/sw.js` object during rollout; the application also serves it with `no-cache`, `no-store`, and `CDN-Cache-Control: no-store` headers.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | *(required)* | JWT signing key — app refuses to start without it |
| `REGISTRATION_ENABLED` | `false` | Set `true` for open registration, `false` for invite-only |
| `DATABASE_URL` | `sqlite:///./data/kitchen_cupboard.db` | Database connection string |
| `CORS_ORIGINS` | *(empty)* | Optional comma-separated browser origins; CLI/server agents do not require CORS |

## API Documentation

- **Interactive docs**: `http://your-server:8111/api/docs`
- **Machine-readable OpenAPI**: `http://your-server:8111/api/openapi.json`
- **Full reference**: See [API.md](API.md)
- **AI context endpoint**: `GET /api/context` — returns the complete operation/authentication index
- **Plain-text agent guide**: `GET /api/agent-guide`

After deployment, verify a full read/write key end to end with the self-cleaning smoke test:

```bash
KC_BASE_URL="http://your-server:8111" KC_API_KEY="kc_your_full_key" ./scripts/api-smoke.sh
```

## Android APK

Download the current Android installer: **[Kitchen Cupboard 1.0.1 APK](android/releases/KitchenCupboard-1.0.1.apk)**.

The APK supports Android 8 or newer and includes safe spacing for modern status bars, display cutouts, keyboards, and bottom gesture navigation. Android may ask you to allow installs from the browser or file manager you use to open it.

The `android/` directory contains the lightweight Android wrapper for the hosted PWA. It keeps authentication and offline data inside Android WebView storage and opens links to other sites in the device browser. The downloadable APK is a debug-signed personal build, not a Google Play release.

Build an installable debug APK with Android SDK 35:

```bash
cd android
./gradlew assembleDebug
```

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, SQLite
- **Frontend**: React 18, Vite, Tailwind CSS
- **Auth**: JWT + bcrypt, API keys
- **Real-time**: WebSocket
- **Offline**: Workbox app-shell/read cache plus an IndexedDB browser outbox
- **Container**: Docker (single container, multi-stage build)
