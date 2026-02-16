# Kitchen Cupboard

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
- **Offline support** — service worker caches the app shell and API responses; mutations made offline are queued and automatically replayed when connectivity returns
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

2. Generate a secret key:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(64))"
   ```

3. Edit `docker-compose.yml` and set your `SECRET_KEY`.

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

## Cloudflare Tunnel

Since this app uses JWT-based authentication with bcrypt password hashing, it's safe to expose via Cloudflare Tunnel. Recommended setup:

1. Create a Cloudflare Tunnel pointing to `http://localhost:8111`
2. Set `REGISTRATION_ENABLED=false` in your environment
3. Create the first admin account, then generate invite codes for other users

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | *(required)* | JWT signing key — app refuses to start without it |
| `REGISTRATION_ENABLED` | `false` | Set `true` for open registration, `false` for invite-only |
| `DATABASE_URL` | `sqlite:///./data/kitchen_cupboard.db` | Database connection string |

## API Documentation

- **Interactive docs**: `http://your-server:8111/api/docs`
- **Full reference**: See [API.md](API.md)
- **AI context endpoint**: `GET /api/context` — returns a structured summary of all capabilities

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, SQLite
- **Frontend**: React 18, Vite, Tailwind CSS
- **Auth**: JWT + bcrypt, API keys
- **Real-time**: WebSocket
- **Offline**: Service worker with IndexedDB mutation queue
- **Container**: Docker (single container, multi-stage build)
