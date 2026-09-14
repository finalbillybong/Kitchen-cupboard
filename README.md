# Kitchen Cupboard beta

A shared meal planner and collaborative shopping list app built for self-hosting on Docker/Unraid.

Recipes now include methods, tags, ratings, photos and exports. A shared weekly meal
planner supports leftovers, suggestions, pantry-aware grocery reviews and optional
one-way Nextcloud sync. See [setup, migrations and validation](docs/recipes-planner-release.md).

## Everyday use

- **Shopping:** open a list, add items, or choose **Add from Basics** for regular purchases. Tick purchases off; an item's options also let you mark it **Already have**.
- **Planner:** choose meals for the week, then **Add week to shopping list**. Review quantities and untick anything you already have before applying changes.
- **Library:** save and find recipes in one place. **Add recipe** offers manual entry, website import and photo import. Review imports before saving; a recipe can be scheduled or added directly to shopping.
- **Basics** is the reusable regular-purchase checklist inside Library. **Usually have** is a flag in Library → Ingredients; flagged ingredients start excluded from planner shopping reviews.
- **Settings** is the gear button. Administrators manage planner defaults under **Planner**, and photo AI / Nextcloud connections under **Integrations**.

Shopping edits can queue offline. Previously viewed recipes and plans remain available to read; their edits and planner shopping commits require connectivity.

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
- **Recipe import** — import and review a complete recipe from a website or photos; website import works with any site using Schema.org JSON-LD (BBC Good Food, AllRecipes, Jamie Oliver, etc)
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

Development build: **[Kitchen Cupboard 1.1.0 APK](android/releases/KitchenCupboard-1.1.0.apk)**.

This build uses a different signing certificate from the bundled 1.0.1 APK, so it cannot update that installation in place. The original keystore is needed to produce a compatible update; see [Android build status](android/releases/README.md).

The APK supports Android 8 or newer and includes safe spacing for modern status bars, display cutouts, keyboards, and bottom gesture navigation. Android may ask you to allow installs from the browser or file manager you use to open it.

The `android/` directory contains the lightweight Android wrapper for the hosted PWA. It keeps authentication and offline data inside Android WebView storage and opens links to other sites in the device browser. The downloadable APK is a debug-signed personal build, not a Google Play release.

The 1.1.0 wrapper adds camera/gallery photo selection and authenticated PDF/CSV exports through the Android document picker.

Build an installable debug APK with Java 17 and Android SDK 35:

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
