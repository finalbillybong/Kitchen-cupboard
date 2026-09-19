# Kitchen Cupboard beta

A shared recipe library, meal planner and collaborative shopping list app built for self-hosting on Docker/Unraid. The current application version is **1.1.0 (beta)**.

Recipes now include methods, tags, ratings, photos and exports. A shared weekly meal
planner supports leftovers, suggestions, pantry-aware grocery reviews and optional
one-way Nextcloud sync. See [setup, migrations and validation](docs/recipes-planner-release.md).

Recipes, ingredients, Basics, pantry flags and the planner are shared across all active accounts on the installation. Shopping lists have their own owner and editor/viewer permissions. Core shopping, recipes and planning work without an external service; photo extraction and Nextcloud sync are optional integrations.

## Everyday use

- **Shopping:** open a list, add items, or choose **Add from Basics** for regular purchases. Tick purchases off; an item's options also let you mark it **Already have**.
- **Planner:** choose meals for the week, then **Add week to shopping list**. Review quantities and untick anything you already have before applying changes.
- **Library:** save and find recipes in one place. **Add recipe** offers manual entry, website import and photo import. Review imports before saving; a recipe can be scheduled or added directly to shopping.
- **Basics** is the reusable regular-purchase checklist inside Library. **Usually have** is a flag in Library → Ingredients; flagged ingredients start excluded from planner shopping reviews.
- **Settings** is the gear button. Administrators manage planner defaults under **Planner**, and photo AI / Nextcloud connections under **Integrations**.

Shopping-item edits can queue offline. Previously viewed recipes and plans remain available to read; recipe/planner edits, imports, exports and planner shopping commits require connectivity. Browser installation and service-worker offline support require HTTPS, except on localhost; ordinary LAN HTTP still supports online use.

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
- **Shared recipe library** — methods, ingredient quantities, serving scaling, preparation/cooking times, tags, categories, photos, per-user ratings and a shared To try collection
- **Recipe import** — review editable drafts from websites with supported Schema.org Recipe JSON-LD, or extract from photos using an administrator-configured vision provider; website access and markup affect import success
- **Recipe archive and exports** — creators/admins can archive recipes, admins can restore them; download individual recipes as text/PDF or the active collection as CSV/a PDF cookbook
- **Weekly meal planner** — configurable meal slots, suggestions, skips, batch cooking and linked leftovers, including portions planned for later weeks
- **Reviewed grocery generation** — combine compatible ingredient quantities, exclude ingredients you already have, and track planner contributions separately from manually added items
- **Basics and pantry flags** — a shared regular-purchase checklist and a separate Usually have flag; this is not stock or expiry tracking
- **Nextcloud calendar sync** — optional one-way CalDAV publishing with retry/status controls
- **REST API** — documented API with Bearer token auth for AI agents and integrations
- **API keys** — create scoped keys for external tools
- **Invite system** — control registration with invite codes
- **Admin panel** — manage users and invite codes
- **Authentication and access controls** — the entrypoint fixes data permissions as root, then runs the app as UID/GID 1001; JWT refresh rotation, scoped API keys, HSTS/CSP headers, audit logging and login/registration rate limits

## Quick Start (Docker Compose)

The included Compose file **builds the app from source**. Docker with Compose and Python 3 (for the key-generation example) are required; Node and application Python dependencies are installed inside the build stages.

1. Clone the repository:
   ```bash
   git clone https://github.com/finalbillybong/Kitchen-cupboard.git
   cd Kitchen-cupboard
   ```

2. Generate and export a secret key:
   ```bash
   export SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
   ```

3. Keep `SECRET_KEY` exported when running Compose, or store it in a Compose `.env` file. Keep the key stable across container recreations. Set `PUBLIC_URL` in the same way to the app's browser URL, such as `https://cupboard.example.com`, for calendar recipe links.

4. Start the app:
   ```bash
   docker compose up -d
   ```

5. Open `http://your-server:8111` in your browser.

6. The **first user to register** automatically becomes admin, even with `REGISTRATION_ENABLED=false`. Create that account before exposing the installation publicly. Leave registration disabled to require admin-generated invite codes for subsequent users.

Compose maps host port **8111** to container port **8000** and persists application data in `./data`.

## Unraid Setup

The repository includes an [Unraid Docker template](unraid/kitchen-cupboard.xml). It uses the published image **`finalbillybong/kitchen-cupboard:latest`** from [Docker Hub](https://hub.docker.com/r/finalbillybong/kitchen-cupboard). Published builds currently target **linux/amd64 (x86-64)**.

In Unraid's **Docker → Add Container**, use the template or enter its settings manually:

1. Set repository to `finalbillybong/kitchen-cupboard:latest`, network to `bridge`, and leave privileged mode disabled.
2. Map TCP container port `8000` to host port `8111`.
3. Map `/app/data` to `/mnt/user/appdata/kitchen-cupboard` with read/write access.
4. Fill in **Secret Key** with a random key of at least 32 characters; it is deliberately blank in the template and the app will refuse to start without it. Use the key-generation command above.
5. Leave `REGISTRATION_ENABLED=false`. Initial admin registration works without an invite; there is no need to enable public registration for setup.
6. Set **Public URL** (`PUBLIC_URL`) to the URL users open. If needed, set **Integration LAN Hosts** (`INTEGRATION_LAN_HOSTS`) in the advanced settings for internal HTTPS integration servers.
7. Start the container, open `http://your-server:8111`, and create the first account.

`latest` follows successful image builds from `main`; it is not a frozen release. Use a published version tag or image digest when a fixed deployment is required. Report problems through [GitHub Issues](https://github.com/finalbillybong/Kitchen-cupboard/issues).

## Cloudflare Tunnel

For HTTPS access through Cloudflare Tunnel:

1. Create the first admin account locally and keep `REGISTRATION_ENABLED=false`.
2. Point the tunnel at `http://your-server:8111` using an address reachable from the tunnel process/container. `localhost` only works when the tunnel process shares the host's network.
3. Set `PUBLIC_URL` to the public HTTPS origin, and generate invite codes for other users. Ensure the proxy supports WebSocket connections.

For PWA updates, configure a Cloudflare Cache Rule to bypass caching for the exact path `/sw.js`. Purge the existing `/sw.js` object during rollout; the application also serves it with `no-cache`, `no-store`, and `CDN-Cache-Control: no-store` headers.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | *(required)* | Random JWT signing key, at least 32 characters; missing, short or recognised insecure values stop startup |
| `REGISTRATION_ENABLED` | `false` | Set `true` for open registration; `false` requires invites after the first admin account |
| `DATABASE_URL` | `sqlite:///./data/kitchen_cupboard.db` | Database connection string |
| `DATA_DIR` | `data` | Uploads and integration encryption key directory; resolves to `/app/data` in the container |
| `PUBLIC_URL` | `http://localhost:8111` | User-facing app origin used in Nextcloud recipe links |
| `CORS_ORIGINS` | *(empty)* | Optional comma-separated browser origins; CLI/server agents do not require CORS |
| `INTEGRATION_LAN_HOSTS` | *(empty)* | Explicit comma-separated hostnames permitted for internal HTTPS integrations; TLS verification stays enabled |
| `SSL_CERT_FILE` | *(system trust)* | Optional mounted CA bundle for integrations using a private certificate authority |

The full list of application defaults, including token lifetimes and rate limits, is in [backend/config.py](backend/config.py). When using Compose, add extra variables to the service's `environment` section; a Compose `.env` file alone only supplies variables that the Compose file references.

## Optional integrations

Administrators configure integrations in **Settings → Integrations** using an interactive login. API keys cannot read or change integration credentials.

- **Photo import:** supply a complete HTTPS OpenAI-compatible chat completions endpoint, a vision model and an API key. No provider is selected by default. Selected recipe photos are sent to that provider for extraction, then presented as an editable draft before saving.
- **Nextcloud:** supply the HTTPS installation URL, username and app password, then select or create a writable calendar. Kitchen Cupboard publishes the current week and future saved plans. It owns those calendar events: remote edits are overwritten and deleted events are recreated. Disabling sync leaves existing events in the calendar.

Credentials are encrypted using the persistent `integration.key` file. See the [integration guide](docs/recipes-planner-release.md#integration-setup) for internal host configuration, sync behaviour and recovery details.

## Backups and updates

Back up the entire persistent data directory, including `kitchen_cupboard.db`, `uploads/` and `integration.key`, and securely retain the runtime configuration. Stop the container while copying its data, or use a consistent SQLite backup procedure. The encryption key is required to recover saved integration credentials.

Startup applies database migrations automatically. Before updating, keep a complete backup: rolling back the image alone does not undo a migration. For a source/Compose installation, pull the desired source revision and run `docker compose up -d --build`. For Unraid, update the image through the Docker UI after the corresponding Test and Docker image workflows succeed.

After an update, check the UI, `/api/`, `/api/openapi.json` and container logs. Detailed migration and rollback guidance is in the [release guide](docs/recipes-planner-release.md#migration-and-rollout).

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

## Development and validation

Use Python 3.12 and Node 22.22.2+ for local backend/frontend work. CI runs backend tests, frontend tests and a production build, plus Playwright flows in Chromium and Firefox. The [validation guide](docs/recipes-planner-release.md#validation-commands) contains the commands and a dated verification record, including the remaining live photo-provider and Android runtime checks.

## Licence and Community Apps

Kitchen Cupboard is licensed under the [MIT License](LICENSE). The repository includes [Community Apps profile metadata](ca_profile.xml) and an [Unraid Docker template](unraid/kitchen-cupboard.xml). See the [submission guide](docs/unraid-community-apps.md) for the repository details and portal validation steps; inclusion in Community Apps requires Unraid's review.
